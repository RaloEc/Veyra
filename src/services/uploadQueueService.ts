import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { withDB, PendingImageUpload } from '../db';
import { StorageService } from './storageService';
import { MobileStorageUploadError } from './storageUploader';
import { useStore } from '../store/useStore';

type ReplaceImageCallback = (oldLocalUri: string, newRemoteUrl: string) => void;

interface ActiveEditorEntry {
    noteId: string;
    replaceImageSrc: ReplaceImageCallback;
}

let activeEditor: ActiveEditorEntry | null = null;
let isProcessing = false;
let isListenerInitialized = false;
let wasConnectedOnLastEvent: boolean | null = null;
let netInfoDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Registra el editor Tiptap/Yjs actualmente activo para recibir el reemplazo de URIs locales.
 */
export function registerActiveEditor(
    noteId: string,
    replaceImageSrc: ReplaceImageCallback
): () => void {
    activeEditor = { noteId, replaceImageSrc };

    // Si hay imágenes pendientes para esta nota al montarla, procesar la cola
    processPendingUploads();

    return () => {
        if (activeEditor?.noteId === noteId) {
            activeEditor = null;
        }
    };
}

/**
 * Procesa la cola de imágenes pendientes guardadas localmente.
 * Sube cada imagen a Supabase Storage ('attachments'), actualiza el editor Tiptap y elimina el registro de SQLite.
 */
export async function processPendingUploads(): Promise<void> {
    if (isProcessing) return;

    try {
        isProcessing = true;

        const pendingUploads = await withDB(async (db) => {
            return await db.getAllAsync<PendingImageUpload>(
                'SELECT * FROM pending_image_uploads ORDER BY created_at_ms ASC;'
            );
        });

        if (!pendingUploads || pendingUploads.length === 0) {
            return;
        }

        const netState = await NetInfo.fetch();
        if (!netState.isConnected || netState.isInternetReachable === false) {
            return;
        }

        const userId = useStore.getState().session?.user?.id || 'anonymous';

        for (const item of pendingUploads) {
            try {
                // Verificar existencia del archivo local
                const fileInfo = await FileSystem.getInfoAsync(item.local_uri);
                if (!fileInfo.exists) {
                    console.warn(`[UploadQueue] Archivo local no existe: ${item.local_uri}, descartando de la cola.`);
                    await withDB(async (db) => {
                        await db.runAsync('DELETE FROM pending_image_uploads WHERE id = ?;', [item.id]);
                    });
                    continue;
                }

                const fileName = `img_${item.id}.jpg`;
                let attachmentUri: string | null = null;

                // 1. Subida oficial Fase 5: quota-reserve -> upload (standard o TUS por trozos) -> upload-finalize
                try {
                    const result = await StorageService.uploadAttachment(
                        item.local_uri,
                        'note',
                        item.note_id,
                        { fileName }
                    );
                    attachmentUri = result.attachment_uri; // veyra-attachment://<attachment_id>
                } catch (storageErr) {
                    if (
                        storageErr instanceof MobileStorageUploadError &&
                        (storageErr.code === 'QUOTA_EXCEEDED' ||
                            storageErr.code === 'FILE_TOO_LARGE' ||
                            storageErr.code === 'UNSUPPORTED_MIME')
                    ) {
                        console.warn(
                            `[UploadQueue] Error no reintentable (${storageErr.code}) para item ${item.id}:`,
                            storageErr.message
                        );
                        continue;
                    }
                    console.warn('[UploadQueue] StorageService.uploadAttachment advertencia:', storageErr);
                }

                // 2. Si se obtuvo la URI estable veyra-attachment://<id>, reemplazar en el editor y limpiar SQLite
                if (attachmentUri) {
                    const isTargetEditorOpen = Boolean(activeEditor && activeEditor.noteId === item.note_id);
                    if (isTargetEditorOpen && activeEditor) {
                        activeEditor.replaceImageSrc(item.local_uri, attachmentUri);
                        await withDB(async (db) => {
                            await db.runAsync('DELETE FROM pending_image_uploads WHERE id = ?;', [item.id]);
                        });
                        console.log(`[UploadQueue] Reemplazo exitoso en editor: ${item.local_uri} -> ${attachmentUri}`);
                    } else if (!activeEditor) {
                        // Esperar a que la nota sea abierta para aplicar el reemplazo en el documento
                        console.log(`[UploadQueue] Imagen subida (${attachmentUri}) pero editor cerrado. Se reemplazará al abrir nota ${item.note_id}`);
                    }
                }
            } catch (itemErr) {
                console.error(`[UploadQueue] Error procesando item ${item.id}:`, itemErr);
            }
        }
    } catch (err) {
        console.error('[UploadQueue] Error procesando cola de uploads:', err);
    } finally {
        isProcessing = false;
    }
}

/**
 * Inicializa el listener de NetInfo para reaccionar inmediatamente cuando vuelva la conexión.
 */
export function initUploadQueueListener(): () => void {
    if (isListenerInitialized) {
        return () => {};
    }
    isListenerInitialized = true;

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
        const isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
        const transitionedToOnline = wasConnectedOnLastEvent === false && isOnline;
        wasConnectedOnLastEvent = isOnline;

        if (transitionedToOnline) {
            if (netInfoDebounceTimer) clearTimeout(netInfoDebounceTimer);
            netInfoDebounceTimer = setTimeout(() => {
                console.log('[UploadQueue] Conexión recuperada, procesando cola de subida...');
                processPendingUploads();
            }, 1000);
        }
    });

    // Comprobación inicial diferida
    setTimeout(() => {
        processPendingUploads();
    }, 1500);

    return () => {
        if (netInfoDebounceTimer) clearTimeout(netInfoDebounceTimer);
        unsubscribe();
        isListenerInitialized = false;
    };
}

export const UploadQueueService = {
    init: initUploadQueueListener,
    processQueue: processPendingUploads,
    registerActiveEditor,
};
