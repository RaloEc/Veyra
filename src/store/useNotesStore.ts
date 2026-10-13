import { create } from 'zustand';
import { NoteService } from '../services/noteService';
import { Note } from '../types/db';
import { useStore } from './useStore';
import { WidgetService } from '../services/widgetService';
import { CollaborationService } from '../services/collaborationService';
import { computeNoteChangeDetail } from '../utils/diffNoteChanges';
import { supabase } from '../lib/supabase';

interface NotesState {
    notes: Note[];
    deletedNotes: Note[];
    isNotesDirty: boolean;
    markNotesDirty: (dirty: boolean) => void;
    isLoading: boolean;
    selectedNote: Note | null;
    selectedNotesIds: string[];
    loadNotes: () => Promise<void>;
    loadDeletedNotes: () => Promise<void>;
    addNote: (title?: string, content?: string, attachments?: string, links?: string, isPinned?: boolean, folderId?: string | null, eventId?: string | null, fontFamily?: string) => Promise<Note | null>;
    updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
    updateNotesBatch: (ids: string[], updates: Partial<Note>) => Promise<void>;
    moveNotesBatch: (ids: string[], folderId: string | null) => Promise<void>;
    deleteNote: (id: string) => Promise<void>;
    deleteNotesBatch: (ids: string[]) => Promise<void>;
    restoreNote: (id: string) => Promise<void>;
    restoreNotesBatch: (ids: string[]) => Promise<void>;
    deleteForever: (id: string) => Promise<void>;
    deleteNotesForeverBatch: (ids: string[]) => Promise<void>;
    emptyTrash: () => Promise<void>;
    selectNote: (note: Note | null) => void;
    setSelectedNotesIds: (ids: string[]) => void;
    clearSelectedNotes: () => void;
    markNoteRevoked: (id: string, isRevoked?: boolean) => Promise<void>;
    setNoteRole: (id: string, role: string) => Promise<void>;
    checkRevokedNotes: () => Promise<void>;
}

let collabMonitorActiveUserId: string | null = null;

export const useNotesStore = create<NotesState>((set, get) => ({
    notes: [],
    deletedNotes: [],
    isNotesDirty: true,
    markNotesDirty: (dirty: boolean) => set({ isNotesDirty: dirty }),
    isLoading: false,
    selectedNote: null,
    selectedNotesIds: [],

    loadNotes: async () => {
        if (get().notes.length === 0) {
            set({ isLoading: true });
        }
        try {
            const notes = await NoteService.getNotes();
            set({ notes, isNotesDirty: false, isLoading: false });
            WidgetService.syncNotes(notes).catch(() => {});

            // Verificar si alguna nota compartida tuvo su acceso revocado
            get().checkRevokedNotes().catch(() => {});

            // Iniciar listener en tiempo real de revocaciones para el usuario actual
            const userId = useStore.getState().session?.user?.id;
            if (userId && collabMonitorActiveUserId !== userId) {
                collabMonitorActiveUserId = userId;
                import('../lib/supabase').then(({ supabase }) => {
                    supabase
                        .channel(`user_collab_monitor_${userId}`)
                        .on('broadcast', { event: 'LIVE_NOTE_CHANGE' }, ({ payload }) => {
                            if (!payload) return;
                            if (payload.changeType === 'PERMISSIONS_UPDATE' && payload.revoked) {
                                if (payload.memberId && payload.memberId !== userId) {
                                    return;
                                }
                                if (payload.targetId) {
                                    const targetNote = get().notes.find(n => n.id === payload.targetId);
                                    const isOwnNote = targetNote && (!targetNote.shared_owner_id || targetNote.shared_owner_id === userId || targetNote.user_id === userId || targetNote.user_id === 'local_user');
                                    if (!isOwnNote) {
                                        get().markNoteRevoked(payload.targetId, true);
                                    }
                                }
                                get().checkRevokedNotes();
                            }
                        })
                        .on('postgres_changes', {
                            event: '*',
                            schema: 'public',
                            table: 'collaborations',
                        }, () => {
                            get().checkRevokedNotes();
                        })
                        .subscribe();
                }).catch(() => {});
            }
        } catch (error) {
            console.error('Failed to load notes', error);
            set({ isLoading: false });
        }
    },

    loadDeletedNotes: async () => {
        try {
            const deletedNotes = await NoteService.getDeletedNotes();
            set({ deletedNotes });
        } catch (error) {
            console.error('Failed to load deleted notes', error);
        }
    },

    addNote: async (title, content, attachments, links, isPinned, folderId, eventId, fontFamily) => {
        try {
            const userId = useStore.getState().session?.user?.id || undefined;
            const { useFoldersStore } = await import('./useFoldersStore');
            const folder = folderId ? useFoldersStore.getState().folders.find(f => f.id === folderId) : null;
            const isFolderShared = Boolean(folder && (folder.is_shared === 1 || Boolean(folder.shared_owner_id)));

            const noteIsShared = isFolderShared ? 1 : 0;
            const noteSharedOwnerId = isFolderShared
                ? (folder?.shared_owner_id || (folder?.user_id && folder.user_id !== userId && folder.user_id !== 'local_user' ? folder.user_id : null))
                : null;

            const newNote = await NoteService.createNote(
                title,
                content,
                attachments,
                links,
                isPinned,
                userId,
                folderId,
                eventId,
                fontFamily,
                noteIsShared,
                noteSharedOwnerId
            );
            
            // Optimistic prepend
            if (newNote) {
                set(state => ({
                    notes: [newNote, ...state.notes]
                }));
            }

            if (userId && isFolderShared && newNote) {
                try {
                    const { supabase } = await import('../lib/supabase');
                    const { SyncService } = await import('../services/syncService');
                    const ownerId = noteSharedOwnerId || userId;
                    const remote = SyncService.localNoteToRemote(newNote, ownerId);
                    await supabase.from('notes').upsert(remote, { onConflict: 'id' });

                    const { CollaborationService } = await import('../services/collaborationService');
                    CollaborationService.notifyChange({
                        targetType: 'note',
                        targetId: newNote.id,
                        action: 'added',
                        itemTitle: newNote.title || 'Nueva nota',
                    }).catch(() => {});
                } catch (collabSyncErr) {
                    console.warn('[useNotesStore] Error auto-syncing note in shared folder:', collabSyncErr);
                }
            }

            if (userId && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
            return newNote;
        } catch (error) {
            console.error('Failed to create note', error);
            return null;
        }
    },

    moveNotesBatch: async (ids: string[], folderId: string | null) => {
        if (!ids || ids.length === 0) return;
        const now = Date.now();
        const idsSet = new Set(ids);

        const { useFoldersStore } = await import('./useFoldersStore');
        const targetFolder = folderId ? useFoldersStore.getState().folders.find(f => f.id === folderId) : null;
        const isFolderShared = Boolean(targetFolder && (targetFolder.is_shared === 1 || Boolean(targetFolder.shared_owner_id)));
        const userId = useStore.getState().session?.user?.id;
        const sharedOwnerId = isFolderShared
            ? (targetFolder?.shared_owner_id || (targetFolder?.user_id && targetFolder.user_id !== userId && targetFolder.user_id !== 'local_user' ? targetFolder.user_id : undefined))
            : undefined;

        // Optimistic batch update
        set(state => ({
            notes: state.notes.map(n => {
                if (!idsSet.has(n.id)) return n;
                return {
                    ...n,
                    folder_id: folderId,
                    updated_at_ms: now,
                    ...(isFolderShared ? { is_shared: 1, shared_owner_id: sharedOwnerId || n.shared_owner_id } : {})
                };
            })
        }));

        try {
            await NoteService.moveNotesToFolder(ids, folderId);

            if (isFolderShared) {
                const { getDB } = await import('../db');
                const db = await getDB();
                for (const id of ids) {
                    await db.runAsync('UPDATE notes SET is_shared = 1, shared_owner_id = ? WHERE id = ?', [sharedOwnerId || null, id]);
                }

                if (userId) {
                    try {
                        const { supabase } = await import('../lib/supabase');
                        const { SyncService } = await import('../services/syncService');
                        const updatedNotes = get().notes.filter(n => idsSet.has(n.id));
                        const remoteNotes = updatedNotes.map(n => SyncService.localNoteToRemote(n, sharedOwnerId || userId));
                        await supabase.from('notes').upsert(remoteNotes, { onConflict: 'id' });
                    } catch (syncErr) {
                        console.warn('[useNotesStore] Error syncing moved notes in shared folder:', syncErr);
                    }
                }
            }

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to move notes batch', error);
            await get().loadNotes();
        }
    },

    updateNote: async (id, updates) => {
        const previousNote = get().notes.find(n => n.id === id);
        const now = Date.now();
        // Optimistic update
        set(state => ({
            notes: state.notes.map(n => n.id === id ? { ...n, ...updates, updated_at_ms: now } : n)
        }));

        try {
            let isShared = previousNote && (previousNote.is_shared === 1 || Boolean(previousNote.shared_owner_id));
            if (!isShared && previousNote?.folder_id) {
                const { useFoldersStore } = await import('./useFoldersStore');
                const folder = useFoldersStore.getState().folders.find(f => f.id === previousNote.folder_id);
                if (folder && (folder.is_shared === 1 || Boolean(folder.shared_owner_id))) {
                    isShared = true;
                    try {
                        const { getDB } = await import('../db');
                        const db = await getDB();
                        await db.runAsync('UPDATE notes SET is_shared = 1 WHERE id = ?', [previousNote.id]);
                        set(state => ({
                            notes: state.notes.map(n => n.id === previousNote.id ? { ...n, is_shared: 1 } : n)
                        }));
                    } catch {}
                }
            }

            if (!isShared && previousNote && useStore.getState().session?.user?.id) {
                try {
                    const { data: collab } = await supabase
                        .from('collaborations')
                        .select('id')
                        .eq('target_type', 'note')
                        .eq('target_id', previousNote.id)
                        .limit(1)
                        .maybeSingle();

                    if (collab) {
                        isShared = true;
                        const { getDB } = await import('../db');
                        const db = await getDB();
                        await db.runAsync('UPDATE notes SET is_shared = 1 WHERE id = ?', [previousNote.id]);
                        set(state => ({
                            notes: state.notes.map(n => n.id === previousNote.id ? { ...n, is_shared: 1 } : n)
                        }));
                    }
                } catch {}
            }

            if (isShared && previousNote) {
                const diff = computeNoteChangeDetail(previousNote, updates);
                if (diff) {
                    CollaborationService.notifyChange({
                        targetType: 'note',
                        targetId: previousNote.id,
                        action: 'edited',
                        itemTitle: updates.title || previousNote.title || 'Nota',
                        details: diff.jsonString,
                    });
                }
            }

            await NoteService.updateNote(id, updates);

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to update note', error);
            await get().loadNotes();
        }
    },

    updateNotesBatch: async (ids, updates) => {
        if (!ids || ids.length === 0) return;
        const now = Date.now();
        const idsSet = new Set(ids);

        // Optimistic update in one single synchronous atomic state update
        set(state => ({
            notes: state.notes.map(n => idsSet.has(n.id) ? { ...n, ...updates, updated_at_ms: now } : n)
        }));

        try {
            await NoteService.updateNotes(ids, updates);

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to update notes batch', error);
            await get().loadNotes();
        }
    },

    deleteNote: async (id) => {
        // Optimistic removal
        set(state => ({
            notes: state.notes.filter(n => n.id !== id)
        }));

        try {
            const note = get().notes.find(n => n.id === id);
            if (note && (note.is_shared === 1 || note.shared_owner_id)) {
                CollaborationService.notifyChange({
                    targetType: 'note',
                    targetId: note.id,
                    action: 'deleted',
                    itemTitle: note.title || 'Nota',
                });
            }

            await NoteService.deleteNote(id);

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to delete note', error);
            await get().loadNotes();
        }
    },

    deleteNotesBatch: async (ids) => {
        if (!ids || ids.length === 0) return;
        const idsSet = new Set(ids);

        // Optimistic removal in one single batch
        set(state => ({
            notes: state.notes.filter(n => !idsSet.has(n.id))
        }));

        try {
            await NoteService.deleteNotes(ids);

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to delete notes batch', error);
            await get().loadNotes();
        }
    },

    restoreNote: async (id: string) => {
        // Optimistic update
        set(state => ({
            deletedNotes: state.deletedNotes.filter(n => n.id !== id)
        }));
        try {
            await NoteService.restoreNote(id);
            await get().loadNotes();
            await get().loadDeletedNotes();

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to restore note', error);
            await get().loadDeletedNotes();
        }
    },

    restoreNotesBatch: async (ids: string[]) => {
        if (!ids || ids.length === 0) return;
        const idsSet = new Set(ids);
        // Optimistic batch removal from trash
        set(state => ({
            deletedNotes: state.deletedNotes.filter(n => !idsSet.has(n.id))
        }));
        try {
            await NoteService.restoreNotes(ids);
            await get().loadNotes();
            await get().loadDeletedNotes();

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to restore notes batch', error);
            await get().loadDeletedNotes();
        }
    },

    deleteForever: async (id: string) => {
        // Optimistic removal
        set(state => ({
            deletedNotes: state.deletedNotes.filter(n => n.id !== id)
        }));
        try {
            await NoteService.deleteNoteForever(id);
            await get().loadDeletedNotes();

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to delete note forever', error);
            await get().loadDeletedNotes();
        }
    },

    deleteNotesForeverBatch: async (ids: string[]) => {
        if (!ids || ids.length === 0) return;
        const idsSet = new Set(ids);
        set(state => ({
            deletedNotes: state.deletedNotes.filter(n => !idsSet.has(n.id))
        }));
        try {
            await NoteService.deleteNotesForever(ids);
            await get().loadDeletedNotes();

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to delete notes forever batch', error);
            await get().loadDeletedNotes();
        }
    },

    emptyTrash: async () => {
        set({ deletedNotes: [] });
        try {
            await NoteService.emptyNotesTrash();
            await get().loadDeletedNotes();

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to empty notes trash', error);
            await get().loadDeletedNotes();
        }
    },

    selectNote: (note) => set({ selectedNote: note }),
    setSelectedNotesIds: (ids) => set({ selectedNotesIds: ids }),
    clearSelectedNotes: () => set({ selectedNotesIds: [] }),

    markNoteRevoked: async (id: string, isRevoked: boolean = true) => {
        set(state => ({
            notes: state.notes.map(n => n.id === id ? { ...n, is_revoked: isRevoked ? 1 : 0 } : n)
        }));
        await NoteService.markNoteRevoked(id, isRevoked);
    },

    setNoteRole: async (id: string, role: string) => {
        set(state => ({
            notes: state.notes.map(n => n.id === id ? { ...n, collab_role: role } : n)
        }));
        await NoteService.setNoteCollabRole(id, role).catch(() => {});
    },

    checkRevokedNotes: async () => {
        const userId = useStore.getState().session?.user?.id;
        if (!userId) return;

        const currentNotes = get().notes;

        // 1. Restaurar cualquier nota propia que haya sido marcada como revocada por error
        const mistakenlyRevokedOwnNotes = currentNotes.filter(n => {
            const isGuestNote = Boolean(
                (n.shared_owner_id && n.shared_owner_id !== userId) ||
                (n.user_id && n.user_id !== userId && n.user_id !== 'local_user' && n.shared_owner_id)
            );
            return !isGuestNote && n.is_revoked === 1;
        });

        for (const ownNote of mistakenlyRevokedOwnNotes) {
            await get().markNoteRevoked(ownNote.id, false);
        }

        // 2. Solo verificar notas compartidas donde el usuario actual es un INVITADO (no el propietario)
        const sharedGuestNotes = currentNotes.filter(n => {
            const isGuestNote = Boolean(
                (n.shared_owner_id && n.shared_owner_id !== userId) ||
                (n.user_id && n.user_id !== userId && n.user_id !== 'local_user' && n.shared_owner_id)
            );
            return isGuestNote && (n.is_shared === 1 || Boolean(n.shared_owner_id));
        });

        if (sharedGuestNotes.length === 0) return;

        const targetIds = sharedGuestNotes.map(n => n.id);
        const folderIds = Array.from(
            new Set(sharedGuestNotes.map(n => n.folder_id).filter((f): f is string => Boolean(f)))
        );

        try {
            const { supabase } = await import('../lib/supabase');
            const [noteCollabsRes, folderCollabsRes] = await Promise.all([
                supabase
                    .from('collaborations')
                    .select('target_id')
                    .eq('target_type', 'note')
                    .eq('member_id', userId)
                    .in('target_id', targetIds),
                folderIds.length > 0
                    ? supabase
                        .from('collaborations')
                        .select('target_id')
                        .eq('target_type', 'folder')
                        .eq('member_id', userId)
                        .in('target_id', folderIds)
                    : Promise.resolve({ data: [] as { target_id: string }[] })
            ]);

            const activeTargetIds = new Set((noteCollabsRes.data || []).map(c => c.target_id));
            const activeFolderIds = new Set((folderCollabsRes.data || []).map(c => c.target_id));

            for (const note of sharedGuestNotes) {
                const isStillActive = activeTargetIds.has(note.id) || (note.folder_id ? activeFolderIds.has(note.folder_id) : false);
                if (!isStillActive && note.is_revoked !== 1) {
                    await get().markNoteRevoked(note.id, true);
                } else if (isStillActive && note.is_revoked === 1) {
                    await get().markNoteRevoked(note.id, false);
                }
            }
        } catch (e) {
            console.warn('[useNotesStore] Error checking revoked notes:', e);
        }
    },
}));
