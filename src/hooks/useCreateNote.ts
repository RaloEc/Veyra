import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotesStore } from '../store/useNotesStore';
import { useRouter } from 'expo-router';
import { Alert, StatusBar, Platform, AppState, AppStateStatus } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useStore } from '../store/useStore';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { parseNotePages, serializeNotePages, PageLayoutMode, NotePage, createPage } from '../utils/pageUtils';
import { useNoteHistory, NoteHistorySnapshot } from './useNoteHistory';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { getCollabColor, CollaborationService } from '../services/collaborationService';
import { CollabRole } from '../types/db';
import { getCollabContentHash, logCollabEvent, normalizeToEpochMs } from '../utils/collabLogger';

export interface UseCreateNoteOptions {
    isEditMode?: boolean;
}

export function useCreateNote(
    id?: string,
    initialFolderId?: string | null,
    initialEventId?: string | null,
    initialTitleParam?: string,
    editorRefs?: React.MutableRefObject<any[]>,
    options?: UseCreateNoteOptions
) {
    const { t } = useTranslation();
    const router = useRouter();
    const { theme, isPremium } = useStore();
    const isDark = theme === 'dark';
    const { notes, addNote, updateNote, deleteNote } = useNotesStore();
    const isEditing = Boolean(id && id !== 'create');
    const noteIdRef = useRef<string | undefined>(id && id !== 'create' ? id : undefined);

    const isEditMode = options?.isEditMode ?? false;
    const isEditModeRef = useRef(isEditMode);
    useEffect(() => {
        isEditModeRef.current = isEditMode;
    }, [isEditMode]);

    const [remoteSyncNotice, setRemoteSyncNotice] = useState<number | null>(null);
    const [liveCollaborators, setLiveCollaborators] = useState<{
        [clientId: string]: { name: string; color: string; timestamp: number };
    }>({});

    const liveCollaborator = useMemo(() => {
        const active = Object.values(liveCollaborators).filter(c => Date.now() - c.timestamp < 10000);
        if (active.length === 0) return null;
        if (active.length === 1) {
            return { name: active[0].name, timestamp: active[0].timestamp };
        }
        return {
            name: `${active.length} ${t('collaboration.collaborators', { defaultValue: 'colaboradores' })}`,
            timestamp: Date.now(),
        };
    }, [liveCollaborators, t]);

    // Identificador único de este cliente en memoria para descartar eco en WebSockets
    const localClientIdRef = useRef<string>(
        `client_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`
    );
    const liveEditChannelRef = useRef<RealtimeChannel | null>(null);
    const liveCursorChannelRef = useRef<RealtimeChannel | null>(null);
    const [liveSyncError, setLiveSyncError] = useState<string | null>(null);
    const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
    const isApplyingRemoteBroadcastRef = useRef(false);
    const lastRemoteBroadcastReceivedRef = useRef<{ [pageIndex: number]: string }>({});
    const lastRemoteBroadcastTimeRef = useRef<{ [pageIndex: number]: number }>({});
    const broadcastTitleTimeoutRef = useRef<any>(null);
    const broadcastContentTimeoutRefs = useRef<{ [pageIndex: number]: any }>({});

    // Permisos de colaboración del usuario actual (propietario, editor o lector)
    const cachedNote = (id && id !== 'create')
        ? (useNotesStore.getState().notes.find(n => n.id === id) || useNotesStore.getState().deletedNotes.find(n => n.id === id) || null)
        : null;
    const session = useStore.getState().session;
    const currentUserId = session?.user?.id;
    const isGuestCached = Boolean(
        (cachedNote?.shared_owner_id && cachedNote.shared_owner_id !== currentUserId) ||
        (cachedNote?.user_id && currentUserId && cachedNote.user_id !== currentUserId && cachedNote.user_id !== 'local_user' && cachedNote.shared_owner_id)
    );
    const isOwnerCached = !isGuestCached;
    const cachedRole: CollabRole = isOwnerCached ? 'editor' : (cachedNote?.collab_role === 'viewer' ? 'viewer' : 'editor');
    const isRevokedCached = isOwnerCached ? false : (cachedNote?.is_revoked === 1);
    const canEditCached = isOwnerCached ? true : (cachedRole === 'editor' && !isRevokedCached);

    const [userPermission, setUserPermission] = useState<{
        isOwner: boolean;
        role: CollabRole;
        canEdit: boolean;
        hasAccess: boolean;
        isRevoked: boolean;
    }>({
        isOwner: isOwnerCached,
        role: cachedRole,
        canEdit: canEditCached,
        hasAccess: true,
        isRevoked: isRevokedCached,
    });
    const userPermissionRef = useRef(userPermission);
    useEffect(() => {
        userPermissionRef.current = userPermission;
    }, [userPermission]);

    // Función segura para refrescar y validar permisos reales contra PostgreSQL/SQLite
    const refreshPerms = useCallback(() => {
        const activeId = id && id !== 'create' ? id : (noteIdRef.current || createdNoteId);
        if (!activeId) return;

        CollaborationService.getUserPermission('note', activeId)
            .then(perm => {
                const currentUserId = useStore.getState().session?.user?.id;
                const latestNote = useNotesStore.getState().notes.find(n => n.id === activeId);
                const isKnownOtherOwner = Boolean(
                    (latestNote?.shared_owner_id && latestNote.shared_owner_id !== currentUserId) ||
                    (latestNote?.user_id && currentUserId && latestNote.user_id !== currentUserId && latestNote.user_id !== 'local_user' && latestNote.shared_owner_id)
                );
                const safeIsOwner = isOwnerCached ? true : (isKnownOtherOwner ? false : perm.isOwner);
                const safeRole: CollabRole = safeIsOwner ? 'editor' : perm.role;
                const safeIsRevoked = safeIsOwner ? false : perm.isRevoked;
                const safeHasAccess = safeIsOwner ? true : perm.hasAccess;
                const safeCanEdit = safeIsOwner ? true : (safeRole === 'editor' && !safeIsRevoked && safeHasAccess);

                const resolvedPerm = {
                    ...perm,
                    isOwner: safeIsOwner,
                    role: safeRole,
                    canEdit: safeCanEdit,
                    isRevoked: safeIsRevoked,
                    hasAccess: safeHasAccess,
                };

                setUserPermission(resolvedPerm);
                userPermissionRef.current = resolvedPerm;
                if (safeIsOwner && latestNote?.is_revoked === 1) {
                    useNotesStore.getState().markNoteRevoked(activeId, false).catch(() => {});
                } else if (resolvedPerm.isRevoked || !resolvedPerm.hasAccess) {
                    useNotesStore.getState().markNoteRevoked(activeId, true).catch(() => {});
                } else if (resolvedPerm.role) {
                    useNotesStore.getState().setNoteRole(activeId, resolvedPerm.role).catch(() => {});
                }
            })
            .catch(() => {});
    }, [id, createdNoteId, isOwnerCached]);

    const refreshPermsRef = useRef(refreshPerms);
    useEffect(() => {
        refreshPermsRef.current = refreshPerms;
    }, [refreshPerms]);

    // Carga y sincronización en tiempo real de permisos sobre esta nota
    useEffect(() => {
        const activeId = id && id !== 'create' ? id : (noteIdRef.current || createdNoteId);
        if (!activeId) return;

        refreshPerms();

        const folderId = cachedNote?.folder_id;
        let channel = supabase
            .channel(`collab_perms_${activeId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'collaborations',
                    filter: `target_id=eq.${activeId}`,
                },
                () => {
                    refreshPerms();
                }
            );

        if (folderId) {
            channel = channel.on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'collaborations',
                    filter: `target_id=eq.${folderId}`,
                },
                () => {
                    refreshPerms();
                }
            );
        }

        channel.subscribe();

        return () => {
            supabase.removeChannel(channel).catch(() => {});
        };
    }, [id, createdNoteId, cachedNote?.folder_id, refreshPerms]);

    const initialParsed = parseNotePages(cachedNote?.content);

    const [title, setTitle] = useState(() => cachedNote?.title || initialTitleParam || '');
    const [pages, setPages] = useState<NotePage[]>(() => initialParsed.pages);
    const [scrollLayout, setScrollLayout] = useState<PageLayoutMode>(() => initialParsed.layout);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [folderId, setFolderId] = useState<string | null>(() => cachedNote?.folder_id || initialFolderId || null);
    const [eventId, setEventId] = useState<string | null>(() => cachedNote?.event_id || initialEventId || null);
    const [fontFamily, setFontFamily] = useState<string>(() => cachedNote?.font_family || 'sans');

    const internalEditorRefs = useRef<any[]>([]);
    const effectiveEditorRefs = editorRefs || internalEditorRefs;

    // Callback para aplicar un snapshot restaurado desde el historial
    const onApplySnapshot = useCallback((snapshot: NoteHistorySnapshot) => {
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        setTitle(snapshot.title);
        setPages(snapshot.pages);
        setCurrentPageIndex(snapshot.currentPageIndex);

        // Actualizar el DOM del editor WebView de cada página
        snapshot.pages.forEach((page, idx) => {
            const editor = effectiveEditorRefs.current?.[idx];
            if (editor && typeof editor.setContentHTML === 'function') {
                editor.setContentHTML(page.content || '');
            }
        });
    }, [effectiveEditorRefs]);

    const {
        undo,
        redo,
        canUndo,
        canRedo,
        recordChange,
        initHistory,
        flushPendingDebounce,
    } = useNoteHistory({ onApplySnapshot });

    const [attachments, setAttachments] = useState<{ uri: string; name: string }[]>(() => {
        if (!cachedNote?.attachments) return [];
        try {
            const parsed = JSON.parse(cachedNote.attachments);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter(Boolean)
                .map((item: any) => {
                    if (typeof item === 'string') {
                        return { uri: item, name: item.split('/').pop() || 'Archivo' };
                    }
                    const uri = item?.uri || item?.url || '';
                    const name = item?.name || (typeof uri === 'string' ? uri.split('/').pop() : '') || 'Archivo';
                    return { uri, name };
                })
                .filter((item: any) => Boolean(item.uri && typeof item.uri === 'string'));
        } catch {
            return [];
        }
    });
    const [isPinned, setIsPinned] = useState(() => cachedNote?.is_pinned === 1);

    // Ref para rastrear los valores más recientes sin retraso de closure
    const currentValuesRef = useRef({
        title,
        pages,
        currentPageIndex,
        scrollLayout,
        attachments,
        isPinned,
        folderId,
        eventId,
        fontFamily,
    });
    useEffect(() => {
        currentValuesRef.current = { title, pages, currentPageIndex, scrollLayout, attachments, isPinned, folderId, eventId, fontFamily };
    }, [title, pages, currentPageIndex, scrollLayout, attachments, isPinned, folderId, eventId, fontFamily]);

    const initialSerialized = serializeNotePages(initialParsed.pages, initialParsed.layout);
    // Rastrear la última versión guardada para evitar escrituras redundantes
    const lastSavedValuesRef = useRef({
        title: cachedNote?.title || initialTitleParam || '',
        serializedContent: cachedNote?.content ? cachedNote.content : initialSerialized,
        attachments: cachedNote?.attachments || '[]',
        isPinned: cachedNote?.is_pinned === 1,
        folderId: cachedNote?.folder_id || initialFolderId || null,
        eventId: cachedNote?.event_id || initialEventId || null,
        fontFamily: cachedNote?.font_family || 'sans',
    });

    // Control de marcas de tiempo e interacción para inmunidad contra carreras y sobreescritura obsoleta
    const lastLocalEditTimeRef = useRef<number>(0);
    const lastLocalSaveTimeRef = useRef<number>(0);
    const isLocallyInteractedRef = useRef<boolean>(false);

    // Mutex para evitar guardados concurrentes
    const isSavingRef = useRef(false);

    // UI states
    const [isLoading, setIsLoading] = useState(false);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: '', description: '' });

    // Cropper state
    const [cropperUri, setCropperUri] = useState<string | null>(null);
    const [isCropperVisible, setIsCropperVisible] = useState(false);

    // Inicializar historial con la versión base
    useEffect(() => {
        initHistory({
            title: cachedNote?.title || initialTitleParam || '',
            pages: initialParsed.pages,
            currentPageIndex: 0,
        });
    }, []);

    // Sincronización en tiempo real y fallback de carga para notas existentes
    useEffect(() => {
        if (!id || id === 'create') return;

        noteIdRef.current = id;
        const note = notes.find(n => n.id === id);

        if (!note) {
            // Si la nota aún no está en el store en memoria, intentar cargarla desde SQLite o Supabase
            (async () => {
                try {
                    const { getDB } = await import('../db');
                    const db = await getDB();
                    const local = await db.getFirstAsync('SELECT * FROM notes WHERE id = ?', [id]);
                    if (local) {
                        await useNotesStore.getState().loadNotes();
                        return;
                    }
                    const session = useStore.getState().session;
                    if (session?.user?.id) {
                        const { supabase } = await import('../lib/supabase');
                        const { data: remote } = await supabase.from('notes').select('*').eq('id', id).maybeSingle();
                        if (remote) {
                            const { SyncService } = await import('../services/syncService');
                            await SyncService.upsertLocalNote(db, remote, session.user.id);
                            await useNotesStore.getState().loadNotes();
                        }
                    }
                } catch (e) {
                    console.warn('[useCreateNote] Error en carga fallback de nota:', e);
                }
            })();
            return;
        }

        const noteContent = note.content || '';
        const noteTitle = note.title || '';
        const noteAttachments = note.attachments || '[]';
        const notePinned = note.is_pinned === 1;
        const noteFolderId = note.folder_id || null;
        const noteEventId = note.event_id || null;
        const noteFontFamily = note.font_family || 'sans';

        // Comprobar si los datos en el store difieren de lo último guardado/conocido localmente
        const lastSaved = lastSavedValuesRef.current;
        const hasExternalChanges = (
            noteContent !== lastSaved.serializedContent ||
            noteTitle !== lastSaved.title ||
            noteAttachments !== lastSaved.attachments ||
            notePinned !== lastSaved.isPinned ||
            noteFolderId !== lastSaved.folderId ||
            noteEventId !== lastSaved.eventId ||
            noteFontFamily !== lastSaved.fontFamily
        );

        if (!hasExternalChanges) {
            return;
        }

        const rawNoteTime = (
            (note as any).last_modified_ms ||
            (note as any).updated_at_ms ||
            (note as any).updated_at ||
            (note as any).created_at_ms ||
            (note as any).created_at
        );
        const noteModTime = normalizeToEpochMs(rawNoteTime);
        const lastLocalEditTime = normalizeToEpochMs(lastLocalEditTimeRef.current);
        const lastLocalSaveTime = normalizeToEpochMs(lastLocalSaveTimeRef.current);

        const currentVals = currentValuesRef.current;
        const currentSerialized = serializeNotePages(currentVals.pages, currentVals.scrollLayout);
        const hasLocalContent = currentVals.pages.some(p => Boolean(p.content.replace(/<[^>]+>/g, '').trim()) || p.content.includes('<img') || p.content.includes('<input') || p.content.includes('x-todo'));

        // REGLA DE PROTECCIÓN 1: Si la nota del store proviene de un timestamp anterior a nuestra última edición local
        if (noteModTime > 0 && lastLocalEditTime > 0 && noteModTime < lastLocalEditTime) {
            logCollabEvent('STORE_UPDATE', {
                noteId: id,
                origin: 'sqlite_load',
                action: 'reject_stale_timestamp',
                length: noteContent.length,
                hash: getCollabContentHash(noteContent),
                extra: { noteModTime, lastLocalEditTime },
            });
            return;
        }

        // REGLA DE PROTECCIÓN 2: Si el usuario local está en modo edición activa, un reload de base de datos nunca debe destruir su DOM con setContentHTML
        if (isEditModeRef.current) {
            logCollabEvent('STORE_UPDATE', {
                noteId: id,
                origin: 'sqlite_load',
                action: 'reject_active_edit_mode',
                length: noteContent.length,
                hash: getCollabContentHash(noteContent),
            });
            return;
        }

        // REGLA DE PROTECCIÓN 3: Si localmente tenemos contenido y el payload del store está vacío, proteger contra vaciado accidental
        if (hasLocalContent && !noteContent.trim()) {
            logCollabEvent('STORE_UPDATE', {
                noteId: id,
                origin: 'sqlite_load',
                action: 'reject_empty_payload',
                length: 0,
                hash: 'empty',
            });
            return;
        }

        // REGLA DE PROTECCIÓN 4: Si el timestamp de la nota coincide o es anterior a nuestro último autoguardado, es un eco de nuestro propio guardado
        if (noteModTime > 0 && lastLocalSaveTime > 0 && noteModTime <= lastLocalSaveTime) {
            logCollabEvent('STORE_UPDATE', {
                noteId: id,
                origin: 'sqlite_load',
                action: 'ignore_own_echo',
                length: noteContent.length,
                hash: getCollabContentHash(noteContent),
                extra: { noteModTime, lastLocalSaveTime },
            });
            return;
        }

        logCollabEvent('STORE_UPDATE', {
            noteId: id,
            origin: 'sqlite_load',
            action: 'apply_external_update',
            length: noteContent.length,
            hash: getCollabContentHash(noteContent),
        });

        // Aplicar la actualización externa en vivo
        const parsed = parseNotePages(noteContent);
        setTitle(noteTitle);
        setPages(parsed.pages);
        setScrollLayout(parsed.layout);
        setIsPinned(notePinned);
        setFolderId(noteFolderId);
        setEventId(noteEventId);
        setFontFamily(noteFontFamily);

        if (noteAttachments) {
            try {
                const parsedAtts = JSON.parse(noteAttachments);
                setAttachments(Array.isArray(parsedAtts) ? parsedAtts : []);
            } catch {
                setAttachments([]);
            }
        } else {
            setAttachments([]);
        }

        // Actualizar lastSavedValuesRef inmediatamente para evitar que el auto-guardado
        // detecte esto como un cambio local y lo vuelva a escribir en bucle a la BD
        lastSavedValuesRef.current = {
            title: noteTitle,
            serializedContent: noteContent,
            attachments: noteAttachments,
            isPinned: notePinned,
            folderId: noteFolderId,
            eventId: noteEventId,
            fontFamily: noteFontFamily,
        };

        // Reinicializar historial con la versión recibida
        initHistory({
            title: noteTitle,
            pages: parsed.pages,
            currentPageIndex: 0,
        });

        // Actualizar el DOM del editor WebView solo si el usuario no está editando activamente
        const updateEditorsHtml = () => {
            if (isEditModeRef.current) return;
            parsed.pages.forEach((page, idx) => {
                const editor = effectiveEditorRefs.current?.[idx];
                if (editor) {
                    const pageHtml = page.content || '';
                    const escapedContent = JSON.stringify(pageHtml);
                    // Preferir aplicación no destructiva vía DOM si está disponible
                    const script = `
                        (function() {
                            if (typeof window.__veyraApplyRemoteContent === 'function') {
                                window.__veyraApplyRemoteContent(${escapedContent});
                            } else if (typeof setContentHTML === 'function') {
                                setContentHTML(${escapedContent});
                            }
                        })();
                        true;
                    `;
                    try {
                        editor.injectJavascript?.(script);
                        editor.injectJavaScript?.(script);
                        editor.webviewBridge?.injectJavaScript?.(script);
                    } catch (e) {}
                }
            });
        };

        updateEditorsHtml();
        const t1 = setTimeout(updateEditorsHtml, 60);
        const t2 = setTimeout(updateEditorsHtml, 180);

        setRemoteSyncNotice(Date.now());

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, [id, notes, effectiveEditorRefs]);

    // ─── CANALES PRIVADOS DE TRANSMISIÓN EN VIVO (WEBSOCKETS REALTIME PRIVADOS) ───
    // Separación de tráfico para seguridad y aislamiento por RLS:
    // 1. note_live_edit_${activeId}: contenido, título, estructura y notificaciones de permisos (private: true)
    // 2. note_live_cursor_${activeId}: movimientos y eliminación de cursores (private: true)
    useEffect(() => {
        const activeId = id && id !== 'create' ? id : (noteIdRef.current || createdNoteId);
        if (!activeId) return;

        // 1. Canal privado de edición de contenido
        const editChannelName = `note_live_edit_${activeId}`;
        logCollabEvent('CHANNEL_SUB', {
            noteId: activeId,
            action: editChannelName,
            status: 'SUBSCRIBING',
        });

        const editChannel = supabase.channel(editChannelName, {
            config: {
                private: true,
                broadcast: {
                    self: false, // El emisor no recibe sus propios mensajes
                },
            },
        });

        editChannel
            .on('broadcast', { event: 'LIVE_NOTE_CHANGE' }, ({ payload }) => {
                if (!payload || payload.senderClientId === localClientIdRef.current) return;

                logCollabEvent('BROADCAST_RECV', {
                    noteId: activeId,
                    origin: 'realtime_recv',
                    action: payload.changeType,
                    length: payload.content?.length,
                    hash: getCollabContentHash(payload.content),
                    extra: {
                        pageIndex: payload.pageIndex,
                        senderClientId: payload.senderClientId,
                        senderUserId: payload.senderUserId,
                    },
                });

                const session = useStore.getState().session;
                const currentUserId = session?.user?.id;
                const isSameUserAccount = Boolean(
                    currentUserId && payload.senderUserId && payload.senderUserId === currentUserId
                );

                isApplyingRemoteBroadcastRef.current = true;

                // Objetivo C: Solo registrar presencia y emitir aviso si es un colaborador externo (otra cuenta)
                if (!isSameUserAccount) {
                    const senderName = payload.senderName || t('collaboration.collaborator', { defaultValue: 'Colaborador' });
                    const senderColor = payload.userColor || getCollabColor(payload.senderClientId);

                    setLiveCollaborators(prev => {
                        const now = Date.now();
                        const next = { ...prev };
                        next[payload.senderClientId] = {
                            name: senderName,
                            color: senderColor,
                            timestamp: now,
                        };
                        for (const cid in next) {
                            if (now - next[cid].timestamp > 12000) {
                                delete next[cid];
                            }
                        }
                        return next;
                    });
                    setRemoteSyncNotice(Date.now());
                }

                if (payload.changeType === 'TITLE' && typeof payload.title === 'string') {
                    setTitle(payload.title);
                    currentValuesRef.current.title = payload.title;
                    lastSavedValuesRef.current.title = payload.title;
                } else if (payload.changeType === 'PAGE_CONTENT' && typeof payload.pageIndex === 'number') {
                    const { pageIndex, content } = payload;
                    lastRemoteBroadcastReceivedRef.current[pageIndex] = content;
                    lastRemoteBroadcastTimeRef.current[pageIndex] = Date.now();

                    let nextPages: NotePage[] = [];
                    setPages(prev => {
                        const next = [...prev];
                        if (pageIndex >= 0 && pageIndex < next.length) {
                            if (next[pageIndex].content === content) return prev;
                            next[pageIndex] = { ...next[pageIndex], content };
                        } else if (pageIndex === next.length) {
                            next.push(createPage(content));
                        }
                        currentValuesRef.current.pages = next;
                        nextPages = next;
                        return next;
                    });

                    // Inyectar HTML mediante reconciliación DOM inteligente
                    const editor = effectiveEditorRefs.current?.[pageIndex];
                    if (editor) {
                        const escapedContent = JSON.stringify(content || '');
                        const script = `
                            (function() {
                                if (typeof window.__veyraApplyRemoteContent === 'function') {
                                    window.__veyraApplyRemoteContent(${escapedContent});
                                } else if (typeof setContentHTML === 'function') {
                                    setContentHTML(${escapedContent});
                                }
                            })();
                            true;
                        `;
                        try {
                            editor.injectJavascript?.(script);
                            editor.injectJavaScript?.(script);
                            editor.webviewBridge?.injectJavaScript?.(script);
                        } catch (e) {}
                    }

                    if (nextPages.length > 0) {
                        lastSavedValuesRef.current.serializedContent = serializeNotePages(
                            nextPages,
                            currentValuesRef.current.scrollLayout
                        );
                    }
                } else if (payload.changeType === 'PAGES_STRUCTURE' && Array.isArray(payload.pages)) {
                    setPages(payload.pages);
                    currentValuesRef.current.pages = payload.pages;
                    if (payload.layout) {
                        setScrollLayout(payload.layout);
                        currentValuesRef.current.scrollLayout = payload.layout;
                    }

                    payload.pages.forEach((p: NotePage, idx: number) => {
                        const ed = effectiveEditorRefs.current?.[idx];
                        if (ed) {
                            const escapedContent = JSON.stringify(p.content || '');
                            const script = `
                                (function() {
                                    if (typeof window.__veyraApplyRemoteContent === 'function') {
                                        window.__veyraApplyRemoteContent(${escapedContent});
                                    } else if (typeof setContentHTML === 'function') {
                                        setContentHTML(${escapedContent});
                                    }
                                })();
                                true;
                            `;
                            try {
                                ed.injectJavascript?.(script);
                                ed.injectJavaScript?.(script);
                                ed.webviewBridge?.injectJavaScript?.(script);
                            } catch (e) {}
                        }
                    });

                    lastSavedValuesRef.current.serializedContent = serializeNotePages(
                        payload.pages,
                        payload.layout || currentValuesRef.current.scrollLayout
                    );
                } else if (payload.changeType === 'PERMISSIONS_UPDATE') {
                    // Objetivo D: NO confiar en el contenido del payload como autoridad.
                    // Actuar únicamente como señal para revalidar contra la base de datos de forma segura.
                    refreshPermsRef.current();
                }

                setTimeout(() => {
                    isApplyingRemoteBroadcastRef.current = false;
                }, 400);
            })
            .subscribe((status, err) => {
                logCollabEvent('CHANNEL_STATUS', {
                    noteId: activeId,
                    action: editChannelName,
                    status,
                    extra: err ? { error: (err as any).message || String(err) } : undefined,
                });
                if (status === 'SUBSCRIBED') {
                    setLiveSyncError(null);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.warn(`[useCreateNote] Error en suscripción a canal privado de edición (${status}):`, err);
                    setLiveSyncError('CHANNEL_ERROR');
                }
            });

        liveEditChannelRef.current = editChannel;

        // 2. Canal privado de cursores y actividad de colaboradores
        const cursorChannelName = `note_live_cursor_${activeId}`;
        logCollabEvent('CHANNEL_SUB', {
            noteId: activeId,
            action: cursorChannelName,
            status: 'SUBSCRIBING',
        });

        const cursorChannel = supabase.channel(cursorChannelName, {
            config: {
                private: true,
                broadcast: {
                    self: false,
                },
            },
        });

        cursorChannel
            .on('broadcast', { event: 'LIVE_NOTE_CHANGE' }, ({ payload }) => {
                if (!payload || payload.senderClientId === localClientIdRef.current) return;

                const session = useStore.getState().session;
                const currentUserId = session?.user?.id;
                const isSameUserAccount = Boolean(
                    currentUserId && payload.senderUserId && payload.senderUserId === currentUserId
                );

                // Objetivo C: Si es otro dispositivo de la misma cuenta, NO dibujar cursor ni considerarlo colaborador externo
                if (isSameUserAccount) return;

                if (payload.changeType === 'CURSOR_MOVE' && typeof payload.pageIndex === 'number' && payload.cursor) {
                    const { pageIndex, cursor, userColor, senderClientId, senderUserId, senderName } = payload;

                    setLiveCollaborators(prev => {
                        const now = Date.now();
                        const next = { ...prev };
                        next[senderClientId] = {
                            name: senderName || t('collaboration.collaborator', { defaultValue: 'Colaborador' }),
                            color: userColor || getCollabColor(senderClientId),
                            timestamp: now,
                        };
                        for (const cid in next) {
                            if (now - next[cid].timestamp > 12000) {
                                delete next[cid];
                            }
                        }
                        return next;
                    });

                    // Limpiar inmediatamente el cursor de este cliente en cualquier otra hoja (idx !== pageIndex)
                    if (effectiveEditorRefs.current && Array.isArray(effectiveEditorRefs.current)) {
                        effectiveEditorRefs.current.forEach((ed, idx) => {
                            if (ed && idx !== pageIndex) {
                                const removeScript = `
                                    if (typeof window.__veyraRemoveRemoteCursor === 'function') {
                                        window.__veyraRemoveRemoteCursor(${JSON.stringify(senderClientId)});
                                    }
                                    true;
                                `;
                                try {
                                    ed.injectJavascript?.(removeScript);
                                    ed.injectJavaScript?.(removeScript);
                                    ed.webviewBridge?.injectJavaScript?.(removeScript);
                                } catch (e) {}
                            }
                        });
                    }

                    // Renderizar / actualizar el cursor en la hoja destino (pageIndex)
                    const editor = effectiveEditorRefs.current?.[pageIndex];
                    if (editor) {
                        const cursorData = JSON.stringify({
                            clientId: senderClientId,
                            userId: senderUserId,
                            name: senderName,
                            color: userColor,
                            cursor,
                        });
                        const script = `
                            if (typeof window.__veyraUpdateRemoteCursor === 'function') {
                                window.__veyraUpdateRemoteCursor(${cursorData});
                            }
                            true;
                        `;
                        try {
                            editor.injectJavascript?.(script);
                            editor.injectJavaScript?.(script);
                            editor.webviewBridge?.injectJavaScript?.(script);
                        } catch (e) {}
                    }
                } else if (payload.changeType === 'CURSOR_REMOVE') {
                    setLiveCollaborators(prev => {
                        const next = { ...prev };
                        delete next[payload.senderClientId];
                        return next;
                    });
                    if (effectiveEditorRefs.current && Array.isArray(effectiveEditorRefs.current)) {
                        effectiveEditorRefs.current.forEach(ed => {
                            if (ed) {
                                const script = `
                                    if (typeof window.__veyraRemoveRemoteCursor === 'function') {
                                        window.__veyraRemoveRemoteCursor(${JSON.stringify(payload.senderClientId)});
                                    }
                                    true;
                                `;
                                try {
                                    ed.injectJavascript?.(script);
                                    ed.injectJavaScript?.(script);
                                    ed.webviewBridge?.injectJavaScript?.(script);
                                } catch (e) {}
                            }
                        });
                    }
                }
            })
            .subscribe((status, err) => {
                logCollabEvent('CHANNEL_STATUS', {
                    noteId: activeId,
                    action: cursorChannelName,
                    status,
                    extra: err ? { error: (err as any).message || String(err) } : undefined,
                });
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.warn(`[useCreateNote] Error en suscripción a canal de cursores (${status}):`, err);
                }
            });

        liveCursorChannelRef.current = cursorChannel;

        return () => {
            logCollabEvent('CHANNEL_SUB', {
                noteId: activeId,
                action: 'teardown',
                status: 'REMOVING',
            });
            // Antes de remover canales, retirar inmediatamente el cursor remoto para evitar cursores fantasma
            try {
                const pageIdx = currentValuesRef.current.currentPageIndex || 0;
                cursorChannel.send({
                    type: 'broadcast',
                    event: 'LIVE_NOTE_CHANGE',
                    payload: {
                        changeType: 'CURSOR_REMOVE',
                        pageIndex: pageIdx,
                        senderClientId: localClientIdRef.current,
                        senderUserId: useStore.getState().session?.user?.id,
                        timestamp: Date.now(),
                    },
                }).catch?.(() => {});
            } catch (e) {}

            supabase.removeChannel(editChannel).catch(() => {});
            supabase.removeChannel(cursorChannel).catch(() => {});
            if (liveEditChannelRef.current === editChannel) {
                liveEditChannelRef.current = null;
            }
            if (liveCursorChannelRef.current === cursorChannel) {
                liveCursorChannelRef.current = null;
            }
        };
    }, [id, createdNoteId, effectiveEditorRefs, t]);

    // Función auxiliar para emitir cambios en vivo de CONTENIDO por el canal privado de edición
    const broadcastLiveChange = useCallback((payload: Record<string, any>) => {
        // Garantizar que solo viaja por el canal de edición y nunca transmite cursores
        if (!liveEditChannelRef.current || isApplyingRemoteBroadcastRef.current) return;
        if (!userPermissionRef.current.canEdit) return;
        if (payload.changeType === 'CURSOR_MOVE' || payload.changeType === 'CURSOR_REMOVE') return;

        const activeId = id && id !== 'create' ? id : (noteIdRef.current || createdNoteId);
        const session = useStore.getState().session;
        const senderUserId = session?.user?.id;
        const senderName = session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || t('collaboration.collaborator', { defaultValue: 'Colaborador' });
        const userColor = getCollabColor(localClientIdRef.current);

        logCollabEvent('BROADCAST_SEND', {
            noteId: activeId,
            origin: 'realtime_send',
            action: payload.changeType,
            length: payload.content?.length,
            hash: getCollabContentHash(payload.content),
            extra: { pageIndex: payload.pageIndex },
        });

        liveEditChannelRef.current.send({
            type: 'broadcast',
            event: 'LIVE_NOTE_CHANGE',
            payload: {
                ...payload,
                senderClientId: localClientIdRef.current,
                senderUserId,
                senderName,
                userColor,
                timestamp: Date.now(),
            },
        }).then((res: any) => {
            if (res !== 'ok') {
                logCollabEvent('BROADCAST_SEND', {
                    noteId: activeId,
                    origin: 'realtime_send',
                    action: payload.changeType,
                    status: res,
                });
            }
        }).catch?.((err: any) => {
            logCollabEvent('BROADCAST_SEND', {
                noteId: activeId,
                origin: 'realtime_send',
                action: payload.changeType,
                status: 'error',
                extra: { error: err?.message || String(err) },
            });
        });
    }, [id, createdNoteId, t]);

    // Transmite la posición del cursor de este usuario por el canal privado de cursores
    const broadcastCursorMove = useCallback((pageIndex: number, cursor: any) => {
        if (!liveCursorChannelRef.current || isApplyingRemoteBroadcastRef.current) return;
        if (!userPermissionRef.current.hasAccess || userPermissionRef.current.isRevoked) return;

        const activeId = id && id !== 'create' ? id : (noteIdRef.current || createdNoteId);
        const session = useStore.getState().session;
        const senderUserId = session?.user?.id;
        const senderName = session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || t('collaboration.collaborator', { defaultValue: 'Colaborador' });
        const userColor = getCollabColor(localClientIdRef.current);

        logCollabEvent('CURSOR_LIFECYCLE', {
            noteId: activeId,
            origin: 'local_cursor',
            action: 'CURSOR_MOVE',
            extra: {
                pageIndex,
                blockIndex: cursor?.blockIndex,
                charOffset: cursor?.charOffset,
                top: cursor?.top,
                left: cursor?.left,
            },
        });

        liveCursorChannelRef.current.send({
            type: 'broadcast',
            event: 'LIVE_NOTE_CHANGE',
            payload: {
                changeType: 'CURSOR_MOVE',
                pageIndex,
                cursor,
                senderClientId: localClientIdRef.current,
                senderUserId,
                senderName,
                userColor,
                timestamp: Date.now(),
            },
        }).catch?.(() => {});
    }, [id, createdNoteId, t]);

    // Transmite el retiro del cursor por el canal privado de cursores
    const broadcastCursorRemove = useCallback((pageIndex: number) => {
        if (!liveCursorChannelRef.current) return;
        const activeId = id && id !== 'create' ? id : (noteIdRef.current || createdNoteId);
        const session = useStore.getState().session;
        const senderUserId = session?.user?.id;

        logCollabEvent('CURSOR_LIFECYCLE', {
            noteId: activeId,
            origin: 'local_cursor',
            action: 'CURSOR_REMOVE',
            extra: { pageIndex },
        });

        liveCursorChannelRef.current.send({
            type: 'broadcast',
            event: 'LIVE_NOTE_CHANGE',
            payload: {
                changeType: 'CURSOR_REMOVE',
                pageIndex,
                senderClientId: localClientIdRef.current,
                senderUserId,
                timestamp: Date.now(),
            },
        }).catch?.(() => {});
    }, [id, createdNoteId]);

    // Gestión del ciclo de vida de la presencia y cursores remotos con AppState (Problema B)
    useEffect(() => {
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            const activeId = id && id !== 'create' ? id : (noteIdRef.current || createdNoteId);
            logCollabEvent('CURSOR_LIFECYCLE', {
                noteId: activeId,
                action: 'APP_STATE_CHANGE',
                status: nextAppState,
            });

            if (nextAppState === 'background' || nextAppState === 'inactive') {
                // Cuando el usuario pulsa Home, bloquea la pantalla o cambia de app:
                // Retirar inmediatamente el cursor y presencia en los demás dispositivos
                const pageIdx = currentValuesRef.current.currentPageIndex || 0;
                broadcastCursorRemove(pageIdx);
            } else if (nextAppState === 'active') {
                // Al volver a primer plano: restaurar presencia si los canales están conectados y el editor está en modo edición
                if (liveCursorChannelRef.current && isEditModeRef.current) {
                    const pageIdx = currentValuesRef.current.currentPageIndex || 0;
                    const editor = effectiveEditorRefs.current?.[pageIdx];
                    if (editor) {
                        try {
                            const restoreScript = `
                                if (typeof reportCursor === 'function') {
                                    reportCursor();
                                }
                                true;
                            `;
                            editor.injectJavascript?.(restoreScript);
                            editor.injectJavaScript?.(restoreScript);
                            editor.webviewBridge?.injectJavaScript?.(restoreScript);
                        } catch (e) {}
                    }
                }
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => {
            subscription.remove();
        };
    }, [broadcastCursorRemove, id, createdNoteId, effectiveEditorRefs]);

    // Establecer título con registro en historial debounced y transmisión en vivo inmediata
    const handleSetTitle = useCallback((newTitle: string) => {
        if (!userPermissionRef.current.canEdit || !userPermissionRef.current.hasAccess || userPermissionRef.current.isRevoked) return;
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();

        logCollabEvent('LOCAL_EDIT', {
            noteId: id || createdNoteId,
            origin: 'local_input',
            action: 'TITLE',
            length: newTitle.length,
            hash: getCollabContentHash(newTitle),
        });

        setTitle(newTitle);
        recordChange({
            title: newTitle,
            pages: currentValuesRef.current.pages,
            currentPageIndex: currentValuesRef.current.currentPageIndex,
        }, false);

        if (!isApplyingRemoteBroadcastRef.current) {
            if (broadcastTitleTimeoutRef.current) {
                clearTimeout(broadcastTitleTimeoutRef.current);
            }
            broadcastTitleTimeoutRef.current = setTimeout(() => {
                broadcastLiveChange({
                    changeType: 'TITLE',
                    title: newTitle,
                });
            }, 80);
        }
    }, [id, createdNoteId, recordChange, broadcastLiveChange]);

    /**
     * Actualiza el contenido HTML de una página específica y transmite en vivo por WebSockets.
     */
    const updatePageContent = useCallback((index: number, newHtml: string) => {
        if (!userPermissionRef.current.canEdit || !userPermissionRef.current.hasAccess || userPermissionRef.current.isRevoked) return;
        if (isApplyingRemoteBroadcastRef.current) return;

        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();

        logCollabEvent('LOCAL_EDIT', {
            noteId: id || createdNoteId,
            origin: 'local_input',
            action: 'PAGE_CONTENT',
            length: newHtml.length,
            hash: getCollabContentHash(newHtml),
            extra: { pageIndex: index },
        });

        const lastReceived = lastRemoteBroadcastReceivedRef.current[index];
        const lastTime = lastRemoteBroadcastTimeRef.current[index] || 0;
        if (lastReceived === newHtml) return;
        // 600ms: ventana ampliada para suprimir eco de contenido remoto recién aplicado
        if (Date.now() - lastTime < 600) {
            const cleanLast = (lastReceived || '').replace(/\s+/g, ' ').trim();
            const cleanNew = (newHtml || '').replace(/\s+/g, ' ').trim();
            if (cleanLast === cleanNew) return;
        }

        setPages(prev => {
            const next = [...prev];
            if (index >= 0 && index < next.length) {
                if (next[index].content === newHtml) return prev;
                next[index] = { ...next[index], content: newHtml };
            } else if (index === next.length) {
                next.push(createPage(newHtml));
            }
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: index,
            }, false);
            return next;
        });

        // Transmisión instantánea por WebSockets debounced a ~60ms (fluidez estilo Google Docs / Word)
        if (broadcastContentTimeoutRefs.current[index]) {
            clearTimeout(broadcastContentTimeoutRefs.current[index]);
        }
        broadcastContentTimeoutRefs.current[index] = setTimeout(() => {
            broadcastLiveChange({
                changeType: 'PAGE_CONTENT',
                pageIndex: index,
                content: newHtml,
            });
        }, 60);
    }, [id, createdNoteId, recordChange, broadcastLiveChange]);

    /**
     * Agrega una nueva página en blanco al final.
     */
    const addPage = useCallback(() => {
        if (!userPermissionRef.current.canEdit || !userPermissionRef.current.hasAccess || userPermissionRef.current.isRevoked) return;
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        setPages(prev => {
            const next = [...prev, createPage('')];
            const nextIndex = next.length - 1;
            setCurrentPageIndex(nextIndex);
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: nextIndex,
            }, true);

            if (!isApplyingRemoteBroadcastRef.current) {
                broadcastLiveChange({
                    changeType: 'PAGES_STRUCTURE',
                    pages: next,
                    layout: currentValuesRef.current.scrollLayout,
                });
            }

            return next;
        });
    }, [recordChange, broadcastLiveChange]);

    /**
     * Elimina una página por su índice.
     */
    const deletePage = useCallback((index: number) => {
        if (!userPermissionRef.current.canEdit || !userPermissionRef.current.hasAccess || userPermissionRef.current.isRevoked) return;
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        setPages(prev => {
            if (prev.length <= 1) return prev;
            const next = prev.filter((_, i) => i !== index);
            const nextIndex = Math.min(currentValuesRef.current.currentPageIndex, next.length - 1);
            setCurrentPageIndex(nextIndex);
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: nextIndex,
            }, true);

            if (!isApplyingRemoteBroadcastRef.current) {
                broadcastLiveChange({
                    changeType: 'PAGES_STRUCTURE',
                    pages: next,
                    layout: currentValuesRef.current.scrollLayout,
                });
            }

            return next;
        });
    }, [recordChange, broadcastLiveChange]);

    /**
     * Duplica una página por su índice e inserta la copia inmediatamente después.
     */
    const duplicatePage = useCallback((index: number) => {
        if (!userPermissionRef.current.canEdit || !userPermissionRef.current.hasAccess || userPermissionRef.current.isRevoked) return;
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        setPages(prev => {
            if (index < 0 || index >= prev.length) return prev;
            const source = prev[index];
            const copyTitle = source.title ? `${source.title} (${t('notes.duplicate_page_copy', { defaultValue: 'Copia' })})` : undefined;
            const copy = createPage(source.content, copyTitle);
            const next = [...prev];
            next.splice(index + 1, 0, copy);
            const nextIndex = index + 1;
            setCurrentPageIndex(nextIndex);
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: nextIndex,
            }, true);

            if (!isApplyingRemoteBroadcastRef.current) {
                broadcastLiveChange({
                    changeType: 'PAGES_STRUCTURE',
                    pages: next,
                    layout: currentValuesRef.current.scrollLayout,
                });
            }

            return next;
        });
    }, [recordChange, t, broadcastLiveChange]);

    /**
     * Inserta una nueva hoja en blanco inmediatamente después del índice especificado.
     */
    const insertPageAfter = useCallback((index: number) => {
        if (!userPermissionRef.current.canEdit || !userPermissionRef.current.hasAccess || userPermissionRef.current.isRevoked) return;
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        setPages(prev => {
            const next = [...prev];
            const insertAt = Math.max(0, Math.min(next.length, index + 1));
            next.splice(insertAt, 0, createPage(''));
            setCurrentPageIndex(insertAt);
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: insertAt,
            }, true);

            if (!isApplyingRemoteBroadcastRef.current) {
                broadcastLiveChange({
                    changeType: 'PAGES_STRUCTURE',
                    pages: next,
                    layout: currentValuesRef.current.scrollLayout,
                });
            }

            return next;
        });
    }, [recordChange, broadcastLiveChange]);

    /**
     * Actualiza el título personalizado de una página.
     */
    const renamePage = useCallback((index: number, newTitle: string) => {
        if (!userPermissionRef.current.canEdit || !userPermissionRef.current.hasAccess || userPermissionRef.current.isRevoked) return;
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        setPages(prev => {
            if (index < 0 || index >= prev.length) return prev;
            const next = [...prev];
            next[index] = { ...next[index], title: newTitle.trim() || undefined };
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: currentValuesRef.current.currentPageIndex,
            }, false);

            if (!isApplyingRemoteBroadcastRef.current) {
                broadcastLiveChange({
                    changeType: 'PAGES_STRUCTURE',
                    pages: next,
                    layout: currentValuesRef.current.scrollLayout,
                });
            }

            return next;
        });
    }, [recordChange, broadcastLiveChange]);

    /**
     * Reordena las páginas desplazando un elemento desde fromIndex hacia toIndex,
     * sincronizando con precisión el índice activo para que el usuario no pierda su posición.
     */
    const reorderPages = useCallback((fromIndex: number, toIndex: number) => {
        if (!userPermissionRef.current.canEdit || !userPermissionRef.current.hasAccess || userPermissionRef.current.isRevoked) return;
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        setPages(prev => {
            if (
                fromIndex < 0 ||
                fromIndex >= prev.length ||
                toIndex < 0 ||
                toIndex >= prev.length ||
                fromIndex === toIndex
            ) {
                return prev;
            }
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            let nextIndex = currentValuesRef.current.currentPageIndex;
            if (nextIndex === fromIndex) nextIndex = toIndex;
            else if (fromIndex < nextIndex && toIndex >= nextIndex) nextIndex = nextIndex - 1;
            else if (fromIndex > nextIndex && toIndex <= nextIndex) nextIndex = nextIndex + 1;
            setCurrentPageIndex(nextIndex);
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: nextIndex,
            }, true);

            if (!isApplyingRemoteBroadcastRef.current) {
                broadcastLiveChange({
                    changeType: 'PAGES_STRUCTURE',
                    pages: next,
                    layout: currentValuesRef.current.scrollLayout,
                });
            }

            return next;
        });
    }, [recordChange, broadcastLiveChange]);

    /**
     * Mueve una página un paso hacia arriba o hacia abajo.
     */
    const movePage = useCallback((index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        reorderPages(index, targetIndex);
    }, [reorderPages]);

    const handleSetScrollLayout = useCallback((newLayout: PageLayoutMode) => {
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        setScrollLayout(newLayout);
        if (!isApplyingRemoteBroadcastRef.current) {
            broadcastLiveChange({
                changeType: 'PAGES_STRUCTURE',
                pages: currentValuesRef.current.pages,
                layout: newLayout,
            });
        }
    }, [broadcastLiveChange]);

    const recordSnapshot = useCallback((immediate: boolean = false) => {
        recordChange({
            title: currentValuesRef.current.title,
            pages: currentValuesRef.current.pages,
            currentPageIndex: currentValuesRef.current.currentPageIndex,
        }, immediate);
    }, [recordChange]);

    /**
     * Guarda la nota silenciosamente en segundo plano sin navegar ni bloquear la UI.
     */
    const saveSilently = async () => {
        if (!userPermissionRef.current.canEdit || !userPermissionRef.current.hasAccess || userPermissionRef.current.isRevoked) {
            return;
        }

        // El modo edición por sí solo NO debe habilitar el autoguardado; se requiere modificación local real
        if (!isLocallyInteractedRef.current) {
            return;
        }

        flushPendingDebounce();
        const {
            title: currentTitle,
            pages: currentPages,
            scrollLayout: currentLayout,
            attachments: currentAtts,
            isPinned: currentPinned,
            folderId: currentFolderId,
            eventId: currentEventId,
            fontFamily: currentFontFamily,
        } = currentValuesRef.current;
        const currentAttsJson = currentAtts.length > 0 ? JSON.stringify(currentAtts) : '[]';
        const serializedContent = serializeNotePages(currentPages, currentLayout);

        // Si la nota está totalmente vacía y no existe en BD, no crear una nota fantasma
        const hasContent = currentPages.some(p => Boolean(p.content.replace(/<[^>]+>/g, '').trim()) || p.content.includes('<img') || p.content.includes('<input') || p.content.includes('x-todo'));
        if (!currentTitle.trim() && !hasContent && currentAtts.length === 0 && !noteIdRef.current) {
            return;
        }

        // Si los valores no han cambiado respecto a la última persistencia, omitir guardado
        const last = lastSavedValuesRef.current;
        if (
            noteIdRef.current &&
            last.title === currentTitle &&
            last.serializedContent === serializedContent &&
            last.attachments === currentAttsJson &&
            last.isPinned === currentPinned &&
            last.folderId === currentFolderId &&
            last.eventId === currentEventId &&
            last.fontFamily === currentFontFamily
        ) {
            return;
        }

        if (isSavingRef.current) return;
        isSavingRef.current = true;
        lastLocalSaveTimeRef.current = Date.now();

        const activeId = noteIdRef.current || createdNoteId;
        logCollabEvent('SAVE_START', {
            noteId: activeId,
            origin: 'local_save',
            action: 'save_silently',
            length: serializedContent.length,
            hash: getCollabContentHash(serializedContent),
        });

        try {
            const attsJsonToSave = currentAtts.length > 0 ? currentAttsJson : undefined;
            if (noteIdRef.current) {
                await updateNote(noteIdRef.current, {
                    title: currentTitle,
                    content: serializedContent,
                    attachments: attsJsonToSave,
                    is_pinned: currentPinned ? 1 : 0,
                    folder_id: currentFolderId,
                    event_id: currentEventId,
                    font_family: currentFontFamily,
                });
            } else {
                const created = await addNote(currentTitle, serializedContent, attsJsonToSave, undefined, currentPinned, currentFolderId, currentEventId, currentFontFamily);
                if (created?.id) {
                    noteIdRef.current = created.id;
                    setCreatedNoteId(created.id);
                }
            }

            lastSavedValuesRef.current = {
                title: currentTitle,
                serializedContent: serializedContent,
                attachments: currentAttsJson,
                isPinned: currentPinned,
                folderId: currentFolderId,
                eventId: currentEventId,
                fontFamily: currentFontFamily,
            };

            logCollabEvent('SAVE_DONE', {
                noteId: noteIdRef.current || createdNoteId,
                origin: 'local_save',
                action: 'save_silently',
                length: serializedContent.length,
                hash: getCollabContentHash(serializedContent),
            });
        } catch (error) {
            console.error('Error in saveSilently:', error);
        } finally {
            isSavingRef.current = false;
        }
    };

    // Auto-guardado con debounce mientras el usuario edita
    useEffect(() => {
        const timer = setTimeout(() => {
            saveSilently();
        }, 1200);

        return () => clearTimeout(timer);
    }, [title, pages, scrollLayout, attachments, isPinned, folderId, fontFamily]);

    // Guardado explícito (con callback opcional)
    const handleSave = async (onSuccess?: () => void) => {
        isLocallyInteractedRef.current = true;
        setIsLoading(true);
        try {
            await saveSilently();
            if (onSuccess) {
                onSuccess();
            } else {
                router.back();
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo guardar la nota.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!id) return;
        Alert.alert(
            'Eliminar Nota',
            '¿Estás seguro? Esta acción enviará la nota a la papelera (puedes restaurarla después si no la borras definitivamente).',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteNote(id);
                        router.back();
                    }
                }
            ]
        );
    };

    const pickImage = async (useCamera: boolean) => {
        const totalImageCount = pages.reduce((acc, p) => acc + (p.content.match(/<img/g) || []).length, 0);
        const maxImages = isPremium ? 20 : 2;

        if (totalImageCount >= maxImages) {
            setAlertConfig({
                title: 'Imágenes en texto',
                description: isPremium
                    ? 'Máximo de 20 imágenes por nota para garantizar el rendimiento.'
                    : 'Límite de 2 imágenes dentro del texto en el plan gratuito. Pásate a Premium para subir hasta 20.'
            });
            setAlertVisible(true);
            return;
        }

        try {
            let result;
            if (useCamera) {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permiso denegado', 'Se requiere permiso para acceder a la cámara.');
                    return;
                }
                result = await ImagePicker.launchCameraAsync({
                    mediaTypes: ['images'],
                    quality: 0.8,
                });
            } else {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permiso denegado', 'Se requiere permiso para acceder a la galería.');
                    return;
                }
                result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsEditing: false,
                    quality: 0.8,
                });
            }

            if (!result.canceled && result.assets && result.assets.length > 0) {
                return result.assets[0].uri;
            }
            return null;
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo adjuntar la imagen');
            return null;
        }
    };

    const pickImageForEditor = async () => {
        return await pickImage(false);
    };

    const processCroppedImage = async (uri: string) => {
        try {
            const manipResult = await manipulateAsync(
                uri,
                [{ resize: { width: 1000 } }],
                { compress: 0.6, format: SaveFormat.JPEG, base64: true }
            );
            return `data:image/jpeg;base64,${manipResult.base64}`;
        } catch (error) {
            console.error('Error al procesar imagen recortada:', error);
            return null;
        }
    };

    const pickDocument = async () => {
        const maxAttachments = isPremium ? 10 : 3;
        if (attachments.length >= maxAttachments) {
            setAlertConfig({
                title: 'Límite de archivos',
                description: isPremium
                    ? 'Máximo de 10 archivos alcanzado.'
                    : 'Límite de 3 archivos en el plan gratuito. Hazte Premium para más.'
            });
            setAlertVisible(true);
            return;
        }

        try {
            const result = await DocumentPicker.getDocumentAsync({
                copyToCacheDirectory: true,
                type: '*/*'
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const uri = result.assets[0].uri;
                const name = result.assets[0].name;
                const newPath = (FileSystem.documentDirectory as string) + name;
                await FileSystem.copyAsync({
                    from: uri,
                    to: newPath
                });
                isLocallyInteractedRef.current = true;
                lastLocalEditTimeRef.current = Date.now();
                setAttachments([...attachments, { uri: newPath, name }]);
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo adjuntar el archivo');
        }
    };

    const removeAttachment = (index: number) => {
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        const newAtts = [...attachments];
        newAtts.splice(index, 1);
        setAttachments(newAtts);
    };

    const handleSetFolderId = useCallback((newFolderId: string | null) => {
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        setFolderId(newFolderId);
    }, []);

    const handleSetEventId = useCallback((newEventId: string | null) => {
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        setEventId(newEventId);
    }, []);

    const handleSetFontFamily = useCallback((newFont: string) => {
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        setFontFamily(newFont);
    }, []);

    const handleSetIsPinned = useCallback((valOrFn: boolean | ((prev: boolean) => boolean)) => {
        isLocallyInteractedRef.current = true;
        lastLocalEditTimeRef.current = Date.now();
        setIsPinned(valOrFn);
    }, []);

    const openAttachment = async (uri: string) => {
        try {
            if (Platform.OS === 'android') {
                const cUri = await FileSystem.getContentUriAsync(uri);
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                    data: cUri,
                    flags: 1,
                });
            } else {
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(uri);
                }
            }
        } catch (error) {
            console.error('Error al abrir archivo:', error);
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri);
            }
        }
    };

    return {
        title, setTitle: handleSetTitle,
        pages, setPages,
        currentPageIndex, setCurrentPageIndex,
        undo,
        redo,
        canUndo,
        canRedo,
        recordSnapshot,
        editorRefs: effectiveEditorRefs,
        updatePageContent,
        addPage,
        deletePage,
        duplicatePage,
        insertPageAfter,
        renamePage,
        movePage,
        reorderPages,
        scrollLayout, setScrollLayout: handleSetScrollLayout,
        folderId, setFolderId: handleSetFolderId,
        eventId, setEventId: handleSetEventId,
        fontFamily, setFontFamily: handleSetFontFamily,
        attachments,
        isPinned, setIsPinned: handleSetIsPinned,
        isDark,
        handleSave,
        saveSilently,
        handleDelete,
        pickImage,
        pickImageForEditor,
        processCroppedImage,
        cropperUri,
        setCropperUri,
        isCropperVisible,
        setIsCropperVisible,
        pickDocument,
        removeAttachment,
        openAttachment,
        isEditing,
        isLoading,
        alertVisible,
        setAlertVisible,
        alertConfig,
        maxAttachments: isPremium ? 10 : 3,
        remoteSyncNotice,
        liveCollaborator,
        liveSyncError,
        broadcastCursorMove,
        broadcastCursorRemove,
        userPermission,
        canEdit: userPermission.canEdit && userPermission.hasAccess && !userPermission.isRevoked,
        isViewer: !userPermission.canEdit || !userPermission.hasAccess || userPermission.isRevoked,
        hasAccess: userPermission.hasAccess && !userPermission.isRevoked,
        isRevoked: userPermission.isRevoked || !userPermission.hasAccess,
    };
}
