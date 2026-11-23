import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { base64ToBytes } from '../poc-yjs/yjsLocalPersistence';
import {
    uploadFile as uploadPrivateAttachment,
    type AttachmentTargetType,
    type MobileUploadOptions,
    type MobileUploadResult,
} from './storageUploader';
import {
    invalidateSignedUrlCache,
    isVeyraAttachmentUri,
    parseAttachmentUri,
    resolveAttachmentUri,
} from './attachmentUriResolver';

const BUCKET = 'attachments';
const LOCAL_CACHE_DIR = `${FileSystem.documentDirectory}cloud_cache/`;
// Imágenes: máximo 1600px de ancho, 80% compresión WebP
const IMAGE_MAX_WIDTH = 1600;
const IMAGE_QUALITY = 0.8;

/**
 * StorageService — Gestiona la subida/descarga de archivos a Supabase Storage.
 *
 * Estrategia para minimizar Egress:
 * 1. Caché local agresivo: Una vez descargado, nunca se vuelve a pedir.
 * 2. Compresión antes de subir: Las imágenes se redimensionan y comprimen.
 * 3. Bucket público: URLs públicas directas vía getPublicUrl (sin expiración).
 * 4. Deduplicación por hash: No se sube dos veces el mismo archivo.
 */
export const StorageService = {

    /**
     * Obtiene la URL pública directa de un archivo en Supabase Storage.
     */
    getPublicUrl(remotePath: string): string {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(remotePath);
        return data.publicUrl;
    },

    /**
     * Asegura que el directorio de caché exista.
     */
    async ensureCacheDir(): Promise<void> {
        const info = await FileSystem.getInfoAsync(LOCAL_CACHE_DIR);
        if (!info.exists) {
            await FileSystem.makeDirectoryAsync(LOCAL_CACHE_DIR, { intermediates: true });
        }
    },

    /**
     * Genera la ruta remota: {userId}/{hash}_{filename}
     * El hash evita colisiones y permite deduplicación.
     */
    async getRemotePath(userId: string, localUri: string, fileName?: string): Promise<string> {
        // Leer los primeros bytes para hacer un hash rápido
        const fileInfo = await FileSystem.getInfoAsync(localUri);
        const effectiveName = fileName || (typeof localUri === 'string' ? localUri.split('/').pop() : '') || 'file';
        // Usar tamaño + nombre como hash (rápido y suficiente)
        const hashInput = `${(fileInfo as any).size || 0}_${effectiveName}_${(fileInfo as any).modificationTime || 0}`;
        const hash = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            hashInput
        );
        const shortHash = hash.substring(0, 12);
        // Sanitizar nombre
        const safeName = effectiveName.replace(/[^a-zA-Z0-9._-]/g, '_');
        return `${userId}/${shortHash}_${safeName}`;
    },

    /**
     * Verifica si un archivo es una imagen basándose en su extensión.
     */
    isImage(fileName?: string): boolean {
        if (!fileName || typeof fileName !== 'string') return false;
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
        const dotIndex = fileName.lastIndexOf('.');
        if (dotIndex === -1) return false;
        const ext = fileName.toLowerCase().substring(dotIndex);
        return imageExts.includes(ext);
    },

    /**
     * Comprime una imagen antes de subirla para minimizar storage y egress.
     * Convierte a WebP, redimensiona a 1600px max width, compresión 80%.
     * Los GIFs no deben pasarse por aquí para preservar su animación.
     */
    async compressImage(uri: string): Promise<string> {
        try {
            const result = await manipulateAsync(
                uri,
                [{ resize: { width: IMAGE_MAX_WIDTH } }],
                { compress: IMAGE_QUALITY, format: SaveFormat.WEBP }
            );
            return result.uri;
        } catch (error) {
            console.warn('[StorageService] Image compression failed, using original:', error);
            return uri;
        }
    },

    /**
     * Orquestador Fase 5 (bucket privado 'veyra-attachments' + reserva de cuota + TUS / upload-finalize).
     * Comprime imágenes (excepto GIF) antes de reservar cuota para minimizar consumo del usuario.
     */
    async uploadAttachment(
        localUri: string,
        targetType: AttachmentTargetType,
        targetId: string,
        options?: MobileUploadOptions
    ): Promise<MobileUploadResult> {
        let uploadUri = localUri;
        let fileName =
            options?.fileName ||
            (typeof localUri === 'string' ? localUri.split('/').pop()?.split('?')[0] : '') ||
            `attachment_${Date.now()}`;
        let mimeType = options?.mimeType;

        const isImg = this.isImage(fileName) || (mimeType?.startsWith('image/') ?? false);
        const isGif =
            fileName.toLowerCase().endsWith('.gif') ||
            localUri.toLowerCase().endsWith('.gif') ||
            mimeType === 'image/gif';

        if (isImg) {
            if (isGif) {
                mimeType = 'image/gif';
            } else {
                const compressedUri = await this.compressImage(localUri);
                if (compressedUri !== localUri) {
                    uploadUri = compressedUri;
                    mimeType = 'image/webp';
                    const dotIdx = fileName.lastIndexOf('.');
                    fileName = `${dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName}.webp`;
                }
            }
        }

        return await uploadPrivateAttachment(uploadUri, targetType, targetId, {
            ...options,
            fileName,
            mimeType,
        });
    },

    /**
     * Sube un archivo local a Supabase Storage (legacy bucket 'attachments').
     * Ruta para nuevas subidas: ${userId}/notes/${Date.now()}_${randomId}.${ext}
     * Retorna la ruta remota para obtener URLs públicas directas o firmadas.
     */
    async uploadFile(userId: string, localUri: string, fileName?: string): Promise<string | null> {
        try {
            const effectiveName = fileName || (typeof localUri === 'string' ? localUri.split('/').pop() : '') || 'file';
            const isImg = this.isImage(effectiveName);
            const isGif = effectiveName.toLowerCase().endsWith('.gif') || (typeof localUri === 'string' && localUri.toLowerCase().endsWith('.gif'));

            let uploadUri = localUri;
            let ext = 'file';
            let mimeType = 'application/octet-stream';

            if (isImg) {
                if (isGif) {
                    ext = 'gif';
                    mimeType = 'image/gif';
                } else {
                    uploadUri = await this.compressImage(localUri);
                    ext = 'webp';
                    mimeType = 'image/webp';
                }
            } else {
                const dotIdx = effectiveName.lastIndexOf('.');
                if (dotIdx !== -1) ext = effectiveName.toLowerCase().substring(dotIdx + 1);
                mimeType = this.getMimeType(effectiveName);
            }

            const randomId = Math.random().toString(36).substring(2, 8);
            const remotePath = `${userId}/notes/${Date.now()}_${randomId}.${ext}`;

            // Leer el archivo como base64
            const base64 = await FileSystem.readAsStringAsync(uploadUri, {
                encoding: FileSystem.EncodingType.Base64,
            });

            // Convertir base64 a ArrayBuffer/Uint8Array seguro para Hermes y Supabase
            const bytes = base64ToBytes(base64);

            const uploadPromise = supabase.storage
                .from(BUCKET)
                .upload(remotePath, bytes, {
                    contentType: mimeType,
                    upsert: false,
                    cacheControl: '31536000', // Cache 1 año (reduce egress)
                });

            const { error } = await Promise.race([
                uploadPromise,
                new Promise<{ data: null; error: any }>((_, reject) =>
                    setTimeout(() => reject(new Error('Storage upload timeout (10s)')), 10000)
                )
            ]);

            if (error) {
                console.error('[StorageService] Upload failed:', error);
                return null;
            }

            console.log(`[StorageService] Uploaded: ${remotePath} (${(bytes.length / 1024).toFixed(1)}KB)`);
            return remotePath;
        } catch (error) {
            console.error('[StorageService] Upload error:', error);
            return null;
        }
    },

    /**
     * Descarga un archivo desde Supabase Storage al caché local.
     * Si ya está en caché, retorna directamente la ruta local (ZERO egress).
     */
    async downloadFile(remotePath: string): Promise<string | null> {
        const result = await this.downloadFileDetailed(remotePath);
        return result.localPath;
    },

    /**
     * Descarga un archivo con detalle de resultado (incluyendo si no fue encontrado en el servidor).
     */
    async downloadFileDetailed(remotePath: string): Promise<{ localPath: string | null; notFound?: boolean }> {
        try {
            await this.ensureCacheDir();

            if (!remotePath || typeof remotePath !== 'string') {
                return { localPath: null, notFound: true };
            }

            let cleanPath = remotePath.trim();
            if (cleanPath.startsWith('attachments/')) {
                cleanPath = cleanPath.replace(/^attachments\//, '');
            }
            if (cleanPath.startsWith('/')) {
                cleanPath = cleanPath.replace(/^\/+/, '');
            }

            // Nuevo esquema privado Fase 5: veyra-attachment://<attachment_id>
            if (isVeyraAttachmentUri(cleanPath)) {
                const attachmentId = parseAttachmentUri(cleanPath);
                if (!attachmentId) {
                    return { localPath: null, notFound: true };
                }

                const privateLocalPath = `${LOCAL_CACHE_DIR}att_${attachmentId}`;
                const privateCached = await FileSystem.getInfoAsync(privateLocalPath);
                if (privateCached.exists) {
                    return { localPath: privateLocalPath };
                }

                let signedUrl: string;
                try {
                    signedUrl = await resolveAttachmentUri(cleanPath);
                } catch (err: any) {
                    const msg = String(err?.message || '').toLowerCase();
                    if (msg.includes('404') || msg.includes('not found')) {
                        return { localPath: null, notFound: true };
                    }
                    console.warn('[StorageService] Error resolviendo veyra-attachment URI:', err);
                    return { localPath: null };
                }

                const downloadResult = await Promise.race([
                    FileSystem.downloadAsync(signedUrl, privateLocalPath),
                    new Promise<any>((_, reject) =>
                        setTimeout(() => reject(new Error('DownloadAsync timeout (15s)')), 15000)
                    ),
                ]).catch((e) => {
                    console.warn('[StorageService] Private attachment download error:', e);
                    return null;
                });

                if (downloadResult && downloadResult.status === 200) {
                    return { localPath: privateLocalPath };
                }
                if (downloadResult && downloadResult.status === 404) {
                    return { localPath: null, notFound: true };
                }
                return { localPath: null };
            }

            // Verificar caché local primero (evita egress)
            const safeName = cleanPath.replace(/[^a-zA-Z0-9._-]/g, '_');
            const localPath = `${LOCAL_CACHE_DIR}${safeName}`;
            const cached = await FileSystem.getInfoAsync(localPath);

            if (cached.exists) {
                return { localPath };
            }

            // Si es una URL http/https directa, descargar directamente sin pedir signed URL
            if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
                const downloadPromise = FileSystem.downloadAsync(cleanPath, localPath);
                const downloadResult = await Promise.race([
                    downloadPromise,
                    new Promise<any>((_, reject) =>
                        setTimeout(() => reject(new Error('DownloadAsync timeout (8s)')), 8000)
                    )
                ]).catch((e) => {
                    console.warn('[StorageService] Direct HTTP download error:', e);
                    return null;
                });
                if (downloadResult && downloadResult.status === 200) {
                    return { localPath };
                }
                if (downloadResult && downloadResult.status === 404) {
                    return { localPath: null, notFound: true };
                }
                return { localPath: null };
            }

            // Generar URL firmada con TTL de 1 año (con timeout de 6s)
            const signedUrlPromise = supabase.storage
                .from(BUCKET)
                .createSignedUrl(cleanPath, 60 * 60 * 24 * 365); // 1 año

            const { data: signedUrlData, error: signError } = await Promise.race([
                signedUrlPromise,
                new Promise<{ data: null; error: any }>((_, reject) =>
                    setTimeout(() => reject(new Error('Signed URL timeout (6s)')), 6000)
                )
            ]).catch((e) => ({ data: null, error: e }));

            if (signError || !signedUrlData?.signedUrl) {
                const msg = String(signError?.message || signError?.error || '').toLowerCase();
                const statusStr = String(signError?.statusCode || signError?.status || '');
                const isNotFound = msg.includes('not found') ||
                    msg.includes('object not found') ||
                    msg.includes('not authorized') ||
                    msg.includes('permission') ||
                    statusStr === '404' ||
                    statusStr === '400' ||
                    statusStr === '403' ||
                    signError?.error === 'not_found';

                if (isNotFound) {
                    return { localPath: null, notFound: true };
                }

                console.warn('[StorageService] Signed URL warning:', signError);
                return { localPath: null };
            }

            // Descargar y guardar en caché (con timeout de 8s para no colgar el sync)
            const downloadPromise = FileSystem.downloadAsync(
                signedUrlData.signedUrl,
                localPath
            );

            const downloadResult = await Promise.race([
                downloadPromise,
                new Promise<any>((_, reject) =>
                    setTimeout(() => reject(new Error('DownloadAsync timeout (8s)')), 8000)
                )
            ]).catch((e) => {
                console.warn('[StorageService] Download error/timeout:', e);
                return null;
            });

            if (downloadResult && downloadResult.status === 200) {
                console.log(`[StorageService] Downloaded and cached: ${cleanPath}`);
                return { localPath };
            }

            if (downloadResult && downloadResult.status === 404) {
                return { localPath: null, notFound: true };
            }

            return { localPath: null };
        } catch (error) {
            console.warn('[StorageService] Download error:', error);
            return { localPath: null };
        }
    },

    /**
     * Elimina lógicamente un archivo en el almacenamiento privado (`veyra-attachment://<id>` via
     * `rpc_soft_delete_attachment` + `storage_deletion_queue`) o legado (`attachments`), y limpia caché local.
     */
    async deleteFile(remoteUrlOrPath: string): Promise<boolean> {
        if (!remoteUrlOrPath || typeof remoteUrlOrPath !== 'string') return false;
        try {
            await this.ensureCacheDir();

            const trimmed = remoteUrlOrPath.trim();
            if (isVeyraAttachmentUri(trimmed)) {
                const attachmentId = parseAttachmentUri(trimmed);
                if (!attachmentId) return false;

                invalidateSignedUrlCache(attachmentId);
                const { error } = await (supabase.rpc as any)('rpc_soft_delete_attachment', {
                    p_attachment_id: attachmentId,
                });
                if (error) {
                    console.error('[StorageService] Soft delete RPC failed:', error);
                    return false;
                }

                const privateLocalPath = `${LOCAL_CACHE_DIR}att_${attachmentId}`;
                const privateCached = await FileSystem.getInfoAsync(privateLocalPath);
                if (privateCached.exists) {
                    await FileSystem.deleteAsync(privateLocalPath, { idempotent: true });
                }
                return true;
            }

            let cleanPath = trimmed;
            const match = cleanPath.match(/\/storage\/v1\/object\/(?:public|sign)\/attachments\/(.+?)(?:\?.*)?$/i);
            if (match && match[1]) {
                cleanPath = decodeURIComponent(match[1]);
            } else if (cleanPath.startsWith('attachments/')) {
                cleanPath = cleanPath.replace(/^attachments\//, '');
            } else if (cleanPath.includes('/attachments/')) {
                const sub = cleanPath.split('/attachments/')[1];
                cleanPath = decodeURIComponent(sub.split('?')[0]);
            }
            cleanPath = cleanPath.replace(/^\/+/, '');

            // Intentar borrado lógico primero si el archivo legado ya fue backfilled en `public.attachments`
            const { data: legacyRow } = await (supabase as any)
                .from('attachments')
                .select('id')
                .eq('storage_bucket', BUCKET)
                .eq('storage_path', cleanPath)
                .is('deleted_at', null)
                .limit(1)
                .maybeSingle();

            if (legacyRow?.id) {
                const { error: rpcErr } = await (supabase.rpc as any)('rpc_soft_delete_attachment', {
                    p_attachment_id: legacyRow.id,
                });
                if (rpcErr) {
                    console.error('[StorageService] Legacy soft delete RPC failed:', rpcErr);
                    return false;
                }
            } else {
                const { error } = await supabase.storage
                    .from(BUCKET)
                    .remove([cleanPath]);

                if (error) {
                    console.error('[StorageService] Delete failed:', error);
                    return false;
                }
            }

            // Eliminar del caché local también
            const safeName = cleanPath.replace(/[^a-zA-Z0-9._-]/g, '_');
            const localPath = `${LOCAL_CACHE_DIR}${safeName}`;
            const cached = await FileSystem.getInfoAsync(localPath);
            if (cached.exists) {
                await FileSystem.deleteAsync(localPath, { idempotent: true });
            }

            return true;
        } catch (error) {
            console.error('[StorageService] Delete error:', error);
            return false;
        }
    },

    /**
     * Procesa una lista de attachments:
     * - Los que son locales (file://...) se suben al almacenamiento privado (`veyra-attachments`)
     *   cuando se recibe `{ targetType, targetId }`, guardando `remotePath = veyra-attachment://<id>`.
     */
    async uploadAttachments(
        userId: string,
        attachments: { uri: string; name?: string; remotePath?: string }[],
        target?: { targetType: AttachmentTargetType; targetId: string }
    ): Promise<{ uri: string; name: string; remotePath?: string }[]> {
        const results: any[] = [];
        if (!Array.isArray(attachments)) return results;

        for (const att of attachments) {
            if (!att || !att.uri || typeof att.uri !== 'string') {
                if (att) results.push(att);
                continue;
            }

            // Si ya tiene remotePath, es porque ya se subió antes
            if ((att as any).remotePath) {
                results.push(att);
                continue;
            }

            // Si la URI empieza con file:// o es local, subirla
            if (att.uri.startsWith('file://') || att.uri.startsWith('/')) {
                const fileInfo = await FileSystem.getInfoAsync(att.uri);
                if (fileInfo.exists) {
                    const fileName = att.name || att.uri.split('/').pop() || `file_${Date.now()}`;
                    if (target?.targetType && target?.targetId) {
                        try {
                            const uploaded = await this.uploadAttachment(
                                att.uri,
                                target.targetType,
                                target.targetId,
                                {
                                    fileName,
                                    mimeType: this.getMimeType(fileName),
                                }
                            );
                            results.push({ ...att, name: fileName, remotePath: uploaded.attachment_uri });
                        } catch (uploadErr) {
                            console.warn(`[StorageService] uploadAttachment failed for ${fileName}, keeping local:`, uploadErr);
                            results.push(att);
                        }
                    } else {
                        const remotePath = await this.uploadFile(userId, att.uri, fileName);
                        if (remotePath) {
                            results.push({ ...att, name: fileName, remotePath });
                        } else {
                            // Falló la subida, mantener como local
                            results.push(att);
                        }
                    }
                } else {
                    // Archivo no existe localmente, omitir
                    console.warn(`[StorageService] Local file not found: ${att.uri}`);
                    results.push(att);
                }
            } else {
                // Es una URL remota o algo que no procesamos
                results.push(att);
            }
        }

        return results;
    },

    /**
     * Descarga attachments remotos al caché local para acceso offline.
     * Solo descarga los que tienen remotePath y cuyo archivo local no existe.
     */
    async downloadAttachments(
        attachments: { uri: string; name: string; remotePath?: string; remoteNotFound?: boolean }[]
    ): Promise<{ uri: string; name: string; remotePath?: string; remoteNotFound?: boolean }[]> {
        const results: any[] = [];
        if (!Array.isArray(attachments)) return results;

        for (const att of attachments) {
            if (!att || typeof att !== 'object') continue;
            if ((att as any).remotePath) {
                // Si ya fue detectado como inexistente en el storage remoto, saltar para evitar bucles
                if ((att as any).remoteNotFound) {
                    results.push(att);
                    continue;
                }

                // Verificar si el archivo local aún existe
                const uri = att.uri && typeof att.uri === 'string' ? att.uri : '';
                const localExists = uri ? (await FileSystem.getInfoAsync(uri)).exists : false;
                if (!localExists) {
                    // Descargar del servidor
                    const res = await this.downloadFileDetailed((att as any).remotePath);
                    if (res.localPath) {
                        results.push({ ...att, uri: res.localPath });
                    } else if (res.notFound) {
                        // El archivo no existe en el storage remoto: marcarlo para no reintentar en cada sync
                        results.push({ ...att, remoteNotFound: true });
                    } else {
                        // Fallo transitorio de red: mantener para el siguiente reintento
                        results.push(att);
                    }
                } else {
                    results.push(att);
                }
            } else {
                results.push(att);
            }
        }

        return results;
    },

    /**
     * Obtiene el MIME type basado en la extensión del archivo.
     */
    getMimeType(fileName?: string): string {
        if (!fileName || typeof fileName !== 'string') return 'application/octet-stream';
        const dotIndex = fileName.lastIndexOf('.');
        if (dotIndex === -1) return 'application/octet-stream';
        const ext = fileName.toLowerCase().substring(dotIndex).replace('.', '');
        const mimeMap: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp',
            heic: 'image/heic',
            heif: 'image/heif',
            pdf: 'application/pdf',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ppt: 'application/vnd.ms-powerpoint',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            txt: 'text/plain',
            csv: 'text/csv',
            zip: 'application/zip',
        };
        return mimeMap[ext] || 'application/octet-stream';
    },

    /**
     * Limpia la caché local (usar con precaución).
     * Solo si el usuario quiere liberar espacio.
     */
    async clearCache(): Promise<void> {
        try {
            const info = await FileSystem.getInfoAsync(LOCAL_CACHE_DIR);
            if (info.exists) {
                await FileSystem.deleteAsync(LOCAL_CACHE_DIR, { idempotent: true });
                await this.ensureCacheDir();
            }
        } catch (error) {
            console.error('[StorageService] Clear cache error:', error);
        }
    },
};

export async function deleteFile(remoteUrlOrPath: string): Promise<boolean> {
    return StorageService.deleteFile(remoteUrlOrPath);
}
