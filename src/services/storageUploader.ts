import * as FileSystem from 'expo-file-system/legacy';
import * as tus from 'tus-js-client';
import { supabase } from '../lib/supabase';
import { base64ToBytes } from '../poc-yjs/yjsLocalPersistence';
import { buildAttachmentUri, primeSignedUrlCache } from './attachmentUriResolver';

export type AttachmentTargetType = 'note' | 'reminder' | 'event';

export interface MobileUploadOptions {
  fileName?: string;
  mimeType?: string;
  onProgress?: (progress: { bytesUploaded: number; bytesTotal: number; percent: number }) => void;
  signal?: AbortSignal;
}

export interface MobileUploadResult {
  attachment_id: string;
  attachment_uri: string;
  signed_url: string | null;
  signed_url_expires_in: number;
  size_bytes: number;
  mime_type: string;
  checksum_sha256: string;
  remaining_bytes: number;
  plan_code: string;
}

export type MobileStorageUploadErrorCode =
  | 'NO_SESSION'
  | 'FILE_NOT_FOUND'
  | 'QUOTA_EXCEEDED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MIME'
  | 'TOO_MANY_RESERVATIONS'
  | 'RESERVE_FAILED'
  | 'UPLOAD_FAILED'
  | 'FINALIZE_FAILED'
  | 'ABORTED';

export class MobileStorageUploadError extends Error {
  readonly code: MobileStorageUploadErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: MobileStorageUploadErrorCode,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MobileStorageUploadError';
    this.code = code;
    this.details = details;
  }
}

interface QuotaReserveResponse {
  reservation_id: string;
  attachment_id: string;
  bucket_id: string;
  storage_path: string;
  max_bytes: number;
  expires_at: string;
  remaining_bytes: number;
  plan_code: string;
  upload_protocol: 'standard' | 'tus';
  tus_chunk_size: number;
}

interface UploadFinalizeResponse {
  ok: boolean;
  outcome: string;
  attachment_id: string;
  availability: string;
  size_bytes: number;
  mime_type: string;
  checksum_sha256: string;
  signed_url: string | null;
  signed_url_expires_in: number;
}

const DEFAULT_TUS_CHUNK_SIZE = 6 * 1024 * 1024; // 6 MiB (requisito Supabase TUS)

function getSupabaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://rrwoompvuggcczggfgiq.supabase.co'
  ).replace(/\/+$/, '');
}

function getAnonKey(): string {
  return (
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    'sb_publishable_5y3OReimX6RP2Tcpl8Ailw_V52PADlk'
  );
}

async function getValidAccessToken(): Promise<string> {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  const expiresSoon =
    typeof session?.expires_at === 'number' && session.expires_at * 1000 < Date.now() + 60_000;

  if (!session || expiresSoon) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session) {
      session = refreshed.session;
    }
  }

  if (!session?.access_token) {
    throw new MobileStorageUploadError(
      'No hay una sesión activa para subir archivos.',
      'NO_SESSION',
    );
  }

  return session.access_token;
}

function inferMimeType(filename: string, explicitMime?: string): string {
  if (explicitMime) {
    const clean = explicitMime.trim().toLowerCase().replace('image/jpg', 'image/jpeg');
    if (clean) return clean;
  }

  const lower = filename.toLowerCase();
  const dotIdx = lower.lastIndexOf('.');
  const ext = dotIdx !== -1 ? lower.substring(dotIdx + 1) : '';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    webm: 'video/webm',
    mp4: 'video/mp4',
    zip: 'application/zip',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Lector TUS por trozos usando expo-file-system (`position` + `length`).
 * Mantiene el pico de RAM estrictamente acotado al tamaño de un chunk (<= 6 MiB)
 * sin cargar nunca el archivo completo en base64 ni usar `uriToBlob`.
 */
class ExpoFileSystemFileReader {
  async openFile(input: { uri: string; size: number }) {
    const { uri, size } = input;
    return {
      size,
      async slice(start: number, end: number) {
        const clampedStart = Math.max(0, start);
        const clampedEnd = Math.min(size, end);
        const length = Math.max(0, clampedEnd - clampedStart);

        if (length === 0) {
          const empty = new Uint8Array(0);
          Object.defineProperty(empty, 'size', { value: 0, enumerable: false });
          return { value: empty, done: true };
        }

        const chunkBase64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
          position: clampedStart,
          length,
        });

        const bytes = base64ToBytes(chunkBase64);
        // tus-js-client inspecciona `value.size`, mientras que XHR/RN usa ArrayBuffer.isView(bytes)
        Object.defineProperty(bytes, 'size', {
          value: bytes.byteLength,
          enumerable: false,
        });

        return {
          value: bytes,
          done: clampedEnd >= size,
        };
      },
      close() {
        // Sin descriptor de archivo persistente que liberar
      },
    };
  }
}

function uploadViaTusMobile(params: {
  localUri: string;
  sizeBytes: number;
  accessToken: string;
  bucketName: string;
  objectName: string;
  contentType: string;
  chunkSize: number;
  onProgress?: MobileUploadOptions['onProgress'];
  signal?: AbortSignal;
}): Promise<void> {
  const {
    localUri,
    sizeBytes,
    accessToken,
    bucketName,
    objectName,
    contentType,
    chunkSize,
    onProgress,
    signal,
  } = params;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new MobileStorageUploadError('Subida cancelada por el usuario.', 'ABORTED'));
      return;
    }

    const endpoint = `${getSupabaseUrl()}/storage/v1/upload/resumable`;

    const upload = new tus.Upload(
      { uri: localUri, size: sizeBytes } as any,
      {
        endpoint,
        uploadSize: sizeBytes,
        chunkSize,
        retryDelays: [0, 1000, 3000, 5000],
        storeFingerprintForResuming: false,
        removeFingerprintOnSuccess: true,
        fileReader: new ExpoFileSystemFileReader(),
        headers: {
          authorization: `Bearer ${accessToken}`,
          apikey: getAnonKey(),
          'x-upsert': 'false',
        },
        metadata: {
          bucketName,
          objectName,
          contentType,
          cacheControl: '31536000',
        },
        onProgress(bytesUploaded, bytesTotal) {
          if (!onProgress) return;
          const percent = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
          onProgress({ bytesUploaded, bytesTotal, percent });
        },
        onSuccess() {
          cleanupAbort();
          resolve();
        },
        onError(err) {
          cleanupAbort();
          reject(
            new MobileStorageUploadError(
              err instanceof Error ? err.message : 'Error en subida resumible TUS',
              'UPLOAD_FAILED',
            ),
          );
        },
      },
    );

    const onAbort = () => {
      upload.abort(true).catch(() => {});
      reject(new MobileStorageUploadError('Subida cancelada por el usuario.', 'ABORTED'));
    };

    const cleanupAbort = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    upload.start();
  });
}

/**
 * Orquestador oficial de subida Fase 5 (Móvil / React Native):
 *   1) Calcula tamaño real del archivo con expo-file-system (copia a caché si viene como content://)
 *   2) POST /functions/v1/quota-reserve (JWT + reserva atómica)
 *   3) Subida a 'veyra-attachments' (standard <= 6 MiB | TUS por trozos > 6 MiB)
 *   4) POST /functions/v1/upload-finalize (verificación + SHA-256 + URL firmada)
 */
export async function uploadFile(
  localUri: string,
  targetType: AttachmentTargetType,
  targetId: string,
  options?: MobileUploadOptions,
): Promise<MobileUploadResult> {
  let workingUri = localUri;
  let tempCacheCopy: string | null = null;

  try {
    // Algunos content:// en Android no admiten lecturas por offset/length directamente
    if (localUri.startsWith('content://')) {
      const cacheBase = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (cacheBase) {
        const dest = `${cacheBase}veyra_up_${Date.now()}.bin`;
        await FileSystem.copyAsync({ from: localUri, to: dest });
        workingUri = dest;
        tempCacheCopy = dest;
      }
    }

    const fileInfo = await FileSystem.getInfoAsync(workingUri);
    if (!fileInfo.exists || typeof (fileInfo as any).size !== 'number' || (fileInfo as any).size <= 0) {
      throw new MobileStorageUploadError(
        `El archivo local no existe o está vacío: ${localUri}`,
        'FILE_NOT_FOUND',
      );
    }

    const sizeBytes = (fileInfo as any).size as number;
    const filename =
      options?.fileName?.trim() ||
      localUri.split('/').pop()?.split('?')[0] ||
      `attachment_${Date.now()}.bin`;
    const mimeType = inferMimeType(filename, options?.mimeType);

    const accessToken = await getValidAccessToken();
    const functionsBase = `${getSupabaseUrl()}/functions/v1`;
    const anonKey = getAnonKey();

    // --- Paso A: Reservar cuota y ruta determinista ---
    const reserveRes = await fetch(`${functionsBase}/quota-reserve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target_type: targetType,
        target_id: targetId,
        name: filename,
        mime_type: mimeType,
        size_bytes: sizeBytes,
      }),
      signal: options?.signal as any,
    });

    const reserveBody = await reserveRes.json().catch(() => null);
    if (!reserveRes.ok || !reserveBody?.reservation_id) {
      const code = (reserveBody?.code as MobileStorageUploadErrorCode) || 'RESERVE_FAILED';
      throw new MobileStorageUploadError(
        reserveBody?.error || `No se pudo reservar cuota (${reserveRes.status})`,
        code,
        reserveBody ?? undefined,
      );
    }

    const reservation = reserveBody as QuotaReserveResponse;

    // --- Paso B: Subir bytes al bucket privado 'veyra-attachments' ---
    if (reservation.upload_protocol === 'tus') {
      await uploadViaTusMobile({
        localUri: workingUri,
        sizeBytes,
        accessToken,
        bucketName: reservation.bucket_id,
        objectName: reservation.storage_path,
        contentType: mimeType,
        chunkSize: reservation.tus_chunk_size || DEFAULT_TUS_CHUNK_SIZE,
        onProgress: options?.onProgress,
        signal: options?.signal,
      });
    } else {
      if (options?.signal?.aborted) {
        throw new MobileStorageUploadError('Subida cancelada por el usuario.', 'ABORTED');
      }
      const base64 = await FileSystem.readAsStringAsync(workingUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = base64ToBytes(base64);

      const { error: uploadErr } = await supabase.storage
        .from(reservation.bucket_id)
        .upload(reservation.storage_path, bytes, {
          contentType: mimeType,
          cacheControl: '31536000',
          upsert: false,
        });

      if (uploadErr) {
        throw new MobileStorageUploadError(
          uploadErr.message || 'Error subiendo archivo a Supabase Storage',
          'UPLOAD_FAILED',
        );
      }
      options?.onProgress?.({ bytesUploaded: sizeBytes, bytesTotal: sizeBytes, percent: 100 });
    }

    // --- Paso C: Finalizar subida verificada en servidor ---
    const finalizeRes = await fetch(`${functionsBase}/upload-finalize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reservation_id: reservation.reservation_id }),
      signal: options?.signal as any,
    });

    const finalizeBody = await finalizeRes.json().catch(() => null);
    if (!finalizeRes.ok || !finalizeBody?.ok) {
      const code =
        finalizeBody?.code === 'QUOTA_OR_MIME_VIOLATION'
          ? 'UNSUPPORTED_MIME'
          : 'FINALIZE_FAILED';
      throw new MobileStorageUploadError(
        finalizeBody?.error || `Error al finalizar la subida (${finalizeRes.status})`,
        code,
        finalizeBody ?? undefined,
      );
    }

    const finalized = finalizeBody as UploadFinalizeResponse;

    if (finalized.signed_url) {
      primeSignedUrlCache(
        finalized.attachment_id,
        finalized.signed_url,
        finalized.signed_url_expires_in ?? 300,
      );
    }

    return {
      attachment_id: finalized.attachment_id,
      attachment_uri: buildAttachmentUri(finalized.attachment_id),
      signed_url: finalized.signed_url,
      signed_url_expires_in: finalized.signed_url_expires_in ?? 300,
      size_bytes: finalized.size_bytes,
      mime_type: finalized.mime_type,
      checksum_sha256: finalized.checksum_sha256,
      remaining_bytes: reservation.remaining_bytes,
      plan_code: reservation.plan_code,
    };
  } finally {
    if (tempCacheCopy) {
      FileSystem.deleteAsync(tempCacheCopy, { idempotent: true }).catch(() => {});
    }
  }
}
