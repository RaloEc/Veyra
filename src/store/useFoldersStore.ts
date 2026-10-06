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

    // Navegación jerárquica
    folderStack: Folder[];          // Pila de navegación: [Raíz, ..., SubcarpetaActual]
    currentParentId: string | null; // ID de la carpeta actual o null si está en raíz
    pushFolder: (folder: Folder) => void;
    popFolder: () => Folder | null;
    resetFolderStack: () => void;
    setFolderStack: (stack: Folder[]) => void;

    // Compatibilidad
    activeFolderId: string; // 'all' | 'pinned' | 'unassigned' | folder UUID
    setActiveFolderId: (id: string) => void;

    loadFolders: () => Promise<void>;
    createFolder: (name: string, icon?: string, color?: string, isPinned?: boolean, parentId?: string | null) => Promise<Folder | null>;
    updateFolder: (id: string, updates: Partial<Folder>) => Promise<void>;
    togglePinFolder: (id: string) => Promise<boolean>;
    deleteFolder: (id: string, deleteNotes?: boolean) => Promise<void>;
    deleteFolders: (ids: string[], deleteNotes?: boolean) => Promise<void>;
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

    // Pila de navegación
    folderStack: [],
    currentParentId: null,

    pushFolder: (folder: Folder) => {
        if (!folder || !folder.id) return;
        set((state) => {
            if (state.folderStack.some((f) => f.id === folder.id)) {
                return {
                    currentParentId: folder.id,
                    activeFolderId: folder.id,
                };
            }
            const newStack = [...state.folderStack, folder];
            return {
                folderStack: newStack,
                currentParentId: folder.id,
                activeFolderId: folder.id,
            };
        });
    },

    popFolder: () => {
        const { folderStack } = get();
        if (folderStack.length === 0) return null;
        const popped = folderStack[folderStack.length - 1];
        const newStack = folderStack.slice(0, -1);
        const newParentId = newStack.length > 0 ? newStack[newStack.length - 1].id : null;
        set({
            folderStack: newStack,
            currentParentId: newParentId,
            activeFolderId: newParentId || 'all',
        });
        return popped;
    },

    resetFolderStack: () => {
        set({
            folderStack: [],
            currentParentId: null,
            activeFolderId: 'all',
        });
    },

    setFolderStack: (stack: Folder[]) => {
        const last = stack.length > 0 ? stack[stack.length - 1] : null;
        set({
            folderStack: stack,
            currentParentId: last ? last.id : null,
            activeFolderId: last ? last.id : 'all',
        });
    },

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

            // Sincronizar folderStack con datos actualizados de las carpetas
            const currentStack = get().folderStack;
            if (currentStack.length > 0) {
                const updatedStack: Folder[] = [];
                for (const item of currentStack) {
                    const fresh = folders.find(f => f.id === item.id);
                    if (fresh) {
                        updatedStack.push(fresh);
                    } else {
                        break; // Si se eliminó algún ancestro, cortar la pila aquí
                    }
                }
                const last = updatedStack.length > 0 ? updatedStack[updatedStack.length - 1] : null;
                set({
                    folders,
                    isFoldersDirty: false,
                    folderStack: updatedStack,
                    currentParentId: last ? last.id : null,
                });
            } else {
                set({ folders, isFoldersDirty: false });
            }
        } catch (error) {
            console.error('Failed to load folders', error);
        } finally {
            set({ isLoading: false });
        }
    },

    createFolder: async (name, icon = 'folder', color = '#8B5CF6', isPinned = false, parentId = null) => {
        try {
            const userId = useStore.getState().session?.user?.id || undefined;
            const newFolder = await FolderService.createFolder(name, icon, color, userId, isPinned, parentId);

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

        if (folder.parent_id) {
            const lang = useStore.getState().language;
            Alert.alert(
                lang === 'es' ? 'Acceso Rápido' : 'Quick Access',
                lang === 'es'
                    ? 'Solo las carpetas principales pueden fijarse en el acceso rápido.'
                    : 'Only root folders can be pinned to quick access.'
            );
            return false;
        }

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
        set(state => {
            const updatedFolders = state.folders.map(f => f.id === id ? { ...f, ...updates, updated_at_ms: now } : f);
            const updatedStack = state.folderStack.map(f => f.id === id ? { ...f, ...updates, updated_at_ms: now } : f);
            return {
                folders: updatedFolders,
                folderStack: updatedStack,
            };
        });

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
        const { folders, folderStack } = get();
        // Helper BFS para obtener todos los descendientes
        const idsToRemove = new Set<string>([id]);
        let queue = [id];
        while (queue.length > 0) {
            const curr = queue.shift()!;
            const children = folders.filter(f => f.parent_id === curr);
            for (const c of children) {
                if (!idsToRemove.has(c.id)) {
                    idsToRemove.add(c.id);
                    queue.push(c.id);
                }
            }
        }

        // Podar la pila si la carpeta borrada o descendiente estaba activa
        let newStack = folderStack.filter(f => !idsToRemove.has(f.id));
        const newParentId = newStack.length > 0 ? newStack[newStack.length - 1].id : null;

        // Optimistic removal
        set(state => ({
            folders: state.folders.filter(f => !idsToRemove.has(f.id)),
            folderStack: newStack,
            currentParentId: newParentId,
            activeFolderId: idsToRemove.has(state.activeFolderId) ? (newParentId || 'all') : state.activeFolderId,
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
        const { folders, folderStack } = get();

        // Helper BFS para obtener todos los descendientes
        const idsToRemove = new Set<string>(ids);
        let queue = [...ids];
        while (queue.length > 0) {
            const curr = queue.shift()!;
            const children = folders.filter(f => f.parent_id === curr);
            for (const c of children) {
                if (!idsToRemove.has(c.id)) {
                    idsToRemove.add(c.id);
                    queue.push(c.id);
                }
            }
        }

        let newStack = folderStack.filter(f => !idsToRemove.has(f.id));
        const newParentId = newStack.length > 0 ? newStack[newStack.length - 1].id : null;

        // Optimistic removal
        set(state => ({
            folders: state.folders.filter(f => !idsToRemove.has(f.id)),
            folderStack: newStack,
            currentParentId: newParentId,
            activeFolderId: idsToRemove.has(state.activeFolderId) ? (newParentId || 'all') : state.activeFolderId,
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

    setActiveFolderId: (id) => {
        const { folders } = get();
        if (id === 'all' || id === 'pinned' || id === 'unassigned') {
            set({ activeFolderId: id, folderStack: [], currentParentId: null });
        } else {
            const targetFolder = folders.find(f => f.id === id);
            if (targetFolder) {
                // Reconstruir la pila hasta este folder
                const chain: Folder[] = [targetFolder];
                let current = targetFolder;
                while (current.parent_id) {
                    const parent = folders.find(f => f.id === current.parent_id);
                    if (parent) {
                        chain.unshift(parent);
                        current = parent;
                    } else {
                        break;
                    }
                }
                set({
                    activeFolderId: id,
                    folderStack: chain,
                    currentParentId: id,
                });
            } else {
                set({ activeFolderId: id });
            }
        }
    },
}));
