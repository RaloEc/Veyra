import { Folder } from '../types/db';
import { useFoldersStore } from '../store/useFoldersStore';
import { useStore } from '../store/useStore';
import { router } from 'expo-router';

/**
 * Navega a una carpeta específica dentro de la pestaña de Notas, reconstruyendo
 * la jerarquía de subcarpetas en el stack si se provee la lista de carpetas.
 */
export function navigateToFolderInNotes(folder: Folder, allFolders?: Folder[]) {
    const { setFolderStack, pushFolder, resetFolderStack, setActiveFolderId } = useFoldersStore.getState();
    if (allFolders && allFolders.length > 0) {
        const stack: Folder[] = [folder];
        let curr = folder;
        while (curr.parent_id) {
            const parent = allFolders.find(f => f.id === curr.parent_id);
            if (parent) {
                stack.unshift(parent);
                curr = parent;
            } else {
                break;
            }
        }
        setFolderStack(stack);
    } else {
        resetFolderStack();
        pushFolder(folder);
    }
    setActiveFolderId(folder.id);
    useStore.getState().setMainActiveTab('notes');
    router.push('/notes');
}

