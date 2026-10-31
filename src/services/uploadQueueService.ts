import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { withDB, PendingImageUpload } from '../db';
import { supabase } from '../lib/supabase';
import { StorageService } from './storageService';
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
                let remoteUrl: string | null = null;

                // 1. Intentar subir mediante StorageService
                try {
                    const remotePath = await StorageService.uploadFile(userId, item.local_uri, fileName);
                    if (remotePath) {
                        const { data: publicUrlData } = supabase.storage
                            .from('attachments')
                            .getPublicUrl(remotePath);
                        if (publicUrlData?.publicUrl) {
                            remoteUrl = publicUrlData.publicUrl;
                        }
                    }
                } catch (storageErr) {
                    console.warn('[UploadQueue] StorageService uploadFile advertencia:', storageErr);
                }

                // 2. Fallback de subida directa a Supabase Storage ('attachments')
                if (!remoteUrl) {
                    try {
                        const base64 = await FileSystem.readAsStringAsync(item.local_uri, {
                            encoding: FileSystem.EncodingType.Base64,
                        });
                        const binaryString = atob(base64);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        const directPath = `${userId}/${fileName}`;
                        const { error: uploadErr } = await supabase.storage
                            .from('attachments')
                            .upload(directPath, bytes.buffer, {
                                contentType: 'image/jpeg',
                                upsert: true,
                                cacheControl: '31536000',
                            });
                        if (!uploadErr) {
                            const { data: publicUrlData } = supabase.storage
                                .from('attachments')
                                .getPublicUrl(directPath);
                            if (publicUrlData?.publicUrl) {
                                remoteUrl = publicUrlData.publicUrl;
                            }
                        }
                    } catch (fallbackErr) {
                        console.error('[UploadQueue] Fallback subida directa error:', fallbackErr);
                    }
                }

                // 3. Si se obtuvo la URL remota de Supabase, reemplazar en el editor y eliminar registro
                if (remoteUrl) {
                    const isTargetEditorOpen = Boolean(activeEditor && activeEditor.noteId === item.note_id);
                    if (isTargetEditorOpen && activeEditor) {
                        activeEditor.replaceImageSrc(item.local_uri, remoteUrl);
                        await withDB(async (db) => {
                            await db.runAsync('DELETE FROM pending_image_uploads WHERE id = ?;', [item.id]);
                        });
                        console.log(`[UploadQueue] Reemplazo exitoso en editor: ${item.local_uri} -> ${remoteUrl}`);
                    } else if (!activeEditor) {
                        // Esperar a que la nota sea abierta para aplicar el reemplazo en el documento
                        console.log(`[UploadQueue] Imagen subida pero editor cerrado. Se reemplazará al abrir nota ${item.note_id}`);
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
