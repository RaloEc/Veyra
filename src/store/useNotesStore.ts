import { create } from 'zustand';
import { NoteService } from '../services/noteService';
import { Note } from '../types/db';
import { useStore } from './useStore';
import { WidgetService } from '../services/widgetService';
import { CollaborationService } from '../services/collaborationService';

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
    addNote: (title?: string, content?: string, attachments?: string, links?: string, isPinned?: boolean, folderId?: string | null, eventId?: string | null) => Promise<Note | null>;
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
}

export const useNotesStore = create<NotesState>((set, get) => ({
    notes: [],
    deletedNotes: [],
    isNotesDirty: true,
    markNotesDirty: (dirty: boolean) => set({ isNotesDirty: dirty }),
    isLoading: false,
    selectedNote: null,
    selectedNotesIds: [],

    loadNotes: async () => {
        set({ isLoading: true });
        try {
            const notes = await NoteService.getNotes();
            set({ notes, isNotesDirty: false });
            WidgetService.syncNotes(notes).catch(() => {});
        } catch (error) {
            console.error('Failed to load notes', error);
        } finally {
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

    addNote: async (title, content, attachments, links, isPinned, folderId, eventId) => {
        try {
            const userId = useStore.getState().session?.user?.id || undefined;
            const newNote = await NoteService.createNote(title, content, attachments, links, isPinned, userId, folderId, eventId);
            
            // Optimistic prepend
            if (newNote) {
                set(state => ({
                    notes: [newNote, ...state.notes]
                }));
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

        // Optimistic batch update
        set(state => ({
            notes: state.notes.map(n => idsSet.has(n.id) ? { ...n, folder_id: folderId, updated_at_ms: now } : n)
        }));

        try {
            await NoteService.moveNotesToFolder(ids, folderId);

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to move notes batch', error);
            await get().loadNotes();
        }
    },

    updateNote: async (id, updates) => {
        const now = Date.now();
        // Optimistic update
        set(state => ({
            notes: state.notes.map(n => n.id === id ? { ...n, ...updates, updated_at_ms: now } : n)
        }));

        try {
            const note = get().notes.find(n => n.id === id);
            if (note && (note.is_shared === 1 || note.shared_owner_id)) {
                CollaborationService.notifyChange({
                    targetType: 'note',
                    targetId: note.id,
                    action: 'edited',
                    itemTitle: updates.title || note.title || 'Nota',
                });
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
}));
