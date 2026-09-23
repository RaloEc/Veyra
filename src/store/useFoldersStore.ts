import { Alert } from 'react-native';
import { create } from 'zustand';
import { FolderService } from '../services/folderService';
import { Folder } from '../types/db';
import { useStore } from './useStore';
import { useNotesStore } from './useNotesStore';

interface FoldersState {
    folders: Folder[];
    isFoldersDirty: boolean;
    markFoldersDirty: (dirty: boolean) => void;
    isLoading: boolean;
    activeFolderId: string; // 'all' | 'pinned' | 'unassigned' | folder UUID
    loadFolders: () => Promise<void>;
    createFolder: (name: string, icon?: string, color?: string, isPinned?: boolean) => Promise<Folder | null>;
    updateFolder: (id: string, updates: Partial<Folder>) => Promise<void>;
    togglePinFolder: (id: string) => Promise<boolean>;
    deleteFolder: (id: string, deleteNotes?: boolean) => Promise<void>;
    deleteFolders: (ids: string[], deleteNotes?: boolean) => Promise<void>;
    setActiveFolderId: (id: string) => void;
    selectedFolderIds: string[];
    setSelectedFolderIds: (ids: string[]) => void;
}

export const useFoldersStore = create<FoldersState>((set, get) => ({
    folders: [],
    isFoldersDirty: true,
    markFoldersDirty: (dirty: boolean) => set({ isFoldersDirty: dirty }),
    isLoading: false,
    activeFolderId: 'all',
    selectedFolderIds: [],
    setSelectedFolderIds: (ids) => set({ selectedFolderIds: ids }),

    loadFolders: async () => {
        set({ isLoading: true });
        try {
            const rawFolders = await FolderService.getFolders();
            const seen = new Set<string>();
            const folders = rawFolders.filter(f => {
                if (!f?.id || seen.has(f.id)) return false;
                seen.add(f.id);
                return true;
            });
            set({ folders, isFoldersDirty: false });
        } catch (error) {
            console.error('Failed to load folders', error);
        } finally {
            set({ isLoading: false });
        }
    },

    createFolder: async (name, icon = 'folder', color = '#8B5CF6', isPinned = false) => {
        try {
            const userId = useStore.getState().session?.user?.id || undefined;
            const newFolder = await FolderService.createFolder(name, icon, color, userId, isPinned);

            if (newFolder) {
                set(state => {
                    if (state.folders.some(f => f.id === newFolder.id)) {
                        return state;
                    }
                    return {
                        folders: [...state.folders, newFolder]
                    };
                });
            }

            if (userId && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }

            return newFolder;
        } catch (error) {
            console.error('Failed to create folder', error);
            return null;
        }
    },

    togglePinFolder: async (id: string): Promise<boolean> => {
        const folder = get().folders.find(f => f.id === id);
        if (!folder) return false;
        const isCurrentlyPinned = folder.is_pinned === 1;
        const currentlyPinnedCount = get().folders.filter(f => f.is_pinned === 1).length;

        if (!isCurrentlyPinned && currentlyPinnedCount >= 3) {
            const lang = useStore.getState().language;
            Alert.alert(
                lang === 'es' ? 'Límite de Acceso Rápido' : 'Quick Access Limit',
                lang === 'es'
                    ? 'Solo puedes fijar un máximo de 3 carpetas en la barra superior. Desfija otra para agregar esta.'
                    : 'You can only pin up to 3 folders in the top bar. Unpin another one first.'
            );
            return false;
        }

        const newPinned = isCurrentlyPinned ? 0 : 1;
        const now = Date.now();

        // Optimistic update
        set(state => ({
            folders: state.folders.map(f => f.id === id ? { ...f, is_pinned: newPinned, updated_at_ms: now } : f)
        }));

        try {
            await FolderService.togglePinFolder(id, newPinned === 1);
            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
            return true;
        } catch (error) {
            console.error('Failed to toggle pin folder', error);
            await get().loadFolders();
            return false;
        }
    },

    updateFolder: async (id, updates) => {
        const now = Date.now();
        // Optimistic update
        set(state => ({
            folders: state.folders.map(f => f.id === id ? { ...f, ...updates, updated_at_ms: now } : f)
        }));

        try {
            await FolderService.updateFolder(id, updates);

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to update folder', error);
            await get().loadFolders();
        }
    },

    deleteFolder: async (id, deleteNotes = false) => {
        // Optimistic removal
        set(state => ({
            folders: state.folders.filter(f => f.id !== id),
            activeFolderId: state.activeFolderId === id ? 'all' : state.activeFolderId,
        }));

        try {
            await FolderService.deleteFolder(id, deleteNotes);
            // Recargar notas para reflejar si fueron eliminadas o desenlazadas
            await useNotesStore.getState().loadNotes();
            if (deleteNotes) {
                await useNotesStore.getState().loadDeletedNotes();
            }

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to delete folder', error);
            await get().loadFolders();
        }
    },

    deleteFolders: async (ids, deleteNotes = false) => {
        if (!ids || ids.length === 0) return;
        const idSet = new Set(ids);

        // Optimistic removal
        set(state => ({
            folders: state.folders.filter(f => !idSet.has(f.id)),
            activeFolderId: idSet.has(state.activeFolderId) ? 'all' : state.activeFolderId,
        }));

        try {
            await FolderService.deleteFolders(ids, deleteNotes);
            await useNotesStore.getState().loadNotes();
            if (deleteNotes) {
                await useNotesStore.getState().loadDeletedNotes();
            }

            if (useStore.getState().session?.user?.id && useStore.getState().cloudSyncEnabled) {
                useStore.getState().triggerSync();
            }
        } catch (error) {
            console.error('Failed to delete folders', error);
            await get().loadFolders();
        }
    },

    setActiveFolderId: (id) => set({ activeFolderId: id }),
}));
