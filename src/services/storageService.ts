import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const BUCKET = 'user_files';
const LOCAL_CACHE_DIR = `${FileSystem.documentDirectory}cloud_cache/`;
// Imágenes: máximo 800px de ancho, 60% compresión JPEG  →  ~50-150KB por imagen
const IMAGE_MAX_WIDTH = 800;
const IMAGE_QUALITY = 0.6;

/**
 * StorageService — Gestiona la subida/descarga de archivos a Supabase Storage.
 *
 * Estrategia para minimizar Egress:
 * 1. Caché local agresivo: Una vez descargado, nunca se vuelve a pedir.
 * 2. Compresión antes de subir: Las imágenes se redimensionan y comprimen.
 * 3. Bucket privado: Las URLs firmadas tienen TTL largo (1 año).
 * 4. Deduplicación por hash: No se sube dos veces el mismo archivo.
 */
export const StorageService = {

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
    async getRemotePath(userId: string, localUri: string, fileName: string): Promise<string> {
        // Leer los primeros bytes para hacer un hash rápido
        const fileInfo = await FileSystem.getInfoAsync(localUri);
        // Usar tamaño + nombre como hash (rápido y suficiente)
        const hashInput = `${(fileInfo as any).size || 0}_${fileName}_${(fileInfo as any).modificationTime || 0}`;
        const hash = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            hashInput
        );
        const shortHash = hash.substring(0, 12);
        // Sanitizar nombre
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        return `${userId}/${shortHash}_${safeName}`;
    },

    /**
     * Verifica si un archivo es una imagen basándose en su extensión.
     */
    isImage(fileName: string): boolean {
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
        const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
        return imageExts.includes(ext);
    },

    /**
     * Comprime una imagen antes de subirla para minimizar storage y egress.
     * Convierte a JPEG, redimensiona a 800px max width, compresión 60%.
     */
    async compressImage(uri: string): Promise<string> {
        try {
            const result = await manipulateAsync(
                uri,
                [{ resize: { width: IMAGE_MAX_WIDTH } }],
                { compress: IMAGE_QUALITY, format: SaveFormat.JPEG }
            );
            return result.uri;
        } catch (error) {
            console.warn('[StorageService] Image compression failed, using original:', error);
            return uri;
        }
    },

    /**
     * Sube un archivo local a Supabase Storage.
     * Retorna la ruta remota (no la URL) para poder generar signed URLs.
     *
     * Si el archivo ya existe en el servidor (misma ruta), no se vuelve a subir.
     */
    async uploadFile(userId: string, localUri: string, fileName: string): Promise<string | null> {
        try {
            const remotePath = await this.getRemotePath(userId, localUri, fileName);

            // Verificar si ya existe en el servidor (deduplicación)
            const { data: existing } = await supabase.storage
                .from(BUCKET)
                .list(userId, {
                    search: remotePath.split('/').pop()
                });

            if (existing && existing.length > 0) {
                console.log(`[StorageService] File already exists: ${remotePath}`);
                return remotePath;
            }

            // Obtener el URI del archivo a subir
            let uploadUri = localUri;

            // Si es imagen, comprimir antes de subir
            if (this.isImage(fileName)) {
                uploadUri = await this.compressImage(localUri);
            }

            // Leer el archivo como base64
            const base64 = await FileSystem.readAsStringAsync(uploadUri, {
                encoding: FileSystem.EncodingType.Base64,
            });

            // Determinar el MIME type
            const mimeType = this.getMimeType(fileName);

            // Convertir base64 a ArrayBuffer para Supabase
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const { error } = await supabase.storage
                .from(BUCKET)
                .upload(remotePath, bytes.buffer, {
                    contentType: mimeType,
                    upsert: true, // Overwrite si existe
                    cacheControl: '31536000', // Cache 1 año (reduce egress)
                });

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
        try {
            await this.ensureCacheDir();

            // Verificar caché local primero (evita egress)
            const safeName = remotePath.replace(/\//g, '_');
            const localPath = `${LOCAL_CACHE_DIR}${safeName}`;
            const cached = await FileSystem.getInfoAsync(localPath);

            if (cached.exists) {
                return localPath;
            }

            // Generar URL firmada con TTL de 1 año (max 1 request por archivo de por vida)
            const { data: signedUrlData, error: signError } = await supabase.storage
                .from(BUCKET)
                .createSignedUrl(remotePath, 60 * 60 * 24 * 365); // 1 año

            if (signError || !signedUrlData?.signedUrl) {
                console.error('[StorageService] Signed URL failed:', signError);
                return null;
            }

            // Descargar y guardar en caché
            const downloadResult = await FileSystem.downloadAsync(
                signedUrlData.signedUrl,
                localPath
            );

            if (downloadResult.status === 200) {
                console.log(`[StorageService] Downloaded and cached: ${remotePath}`);
                return localPath;
            }

            return null;
        } catch (error) {
            console.error('[StorageService] Download error:', error);
            return null;
        }
    },

    /**
     * Elimina un archivo del servidor.
     */
    async deleteFile(remotePath: string): Promise<boolean> {
        try {
            const { error } = await supabase.storage
                .from(BUCKET)
                .remove([remotePath]);

            if (error) {
                console.error('[StorageService] Delete failed:', error);
                return false;
            }

            // Eliminar del caché local también
            const safeName = remotePath.replace(/\//g, '_');
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
     * - Los que son locales (file://...) se suben al servidor
     * - Se retorna la lista actualizada con las rutas remotas
     */
    async uploadAttachments(
        userId: string,
        attachments: { uri: string; name: string }[]
    ): Promise<{ uri: string; name: string; remotePath?: string }[]> {
        const results = [];

        for (const att of attachments) {
            // Si ya tiene remotePath, es porque ya se subió antes
            if ((att as any).remotePath) {
                results.push(att);
                continue;
            }

            // Si la URI empieza con file:// o es local, subirla
            if (att.uri.startsWith('file://') || att.uri.startsWith('/')) {
                const fileInfo = await FileSystem.getInfoAsync(att.uri);
                if (fileInfo.exists) {
                    const remotePath = await this.uploadFile(userId, att.uri, att.name);
                    if (remotePath) {
                        results.push({ ...att, remotePath });
                    } else {
                        // Fallo la subida, mantener como local
                        results.push(att);
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
        attachments: { uri: string; name: string; remotePath?: string }[]
    ): Promise<{ uri: string; name: string; remotePath?: string }[]> {
        const results = [];

        for (const att of attachments) {
            if ((att as any).remotePath) {
                // Verificar si el archivo local aún existe
                const localExists = await FileSystem.getInfoAsync(att.uri);
                if (!localExists.exists) {
                    // Descargar del servidor
                    const localPath = await this.downloadFile((att as any).remotePath);
                    if (localPath) {
                        results.push({ ...att, uri: localPath });
                    } else {
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
    getMimeType(fileName: string): string {
        const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.')).replace('.', '');
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
