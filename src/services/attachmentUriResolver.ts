import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';

export const VEYRA_ATTACHMENT_SCHEME = 'veyra-attachment://';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VEYRA_URI_GLOBAL_RE = /veyra-attachment:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

// Renovar URL firmada 45s antes de vencer (TTL del backend = 300s)
const SAFETY_MARGIN_MS = 45_000;

interface CachedSignedUrl {
  signedUrl: string;
  expiresAtMs: number;
}

const signedUrlCache = new Map<string, CachedSignedUrl>();
const inflightRequests = new Map<string, Promise<string>>();

export function buildAttachmentUri(attachmentId: string): string {
  return `${VEYRA_ATTACHMENT_SCHEME}${attachmentId}`;
}

export function isVeyraAttachmentUri(src: string | null | undefined): boolean {
  return typeof src === 'string' && src.startsWith(VEYRA_ATTACHMENT_SCHEME);
}

export function parseAttachmentUri(src: string | null | undefined): string | null {
  if (!isVeyraAttachmentUri(src) || !src) return null;
  const candidate = src.slice(VEYRA_ATTACHMENT_SCHEME.length).trim();
  return UUID_RE.test(candidate) ? candidate : null;
}

/**
 * Precarga una URL firmada recién recibida (ej. desde upload-finalize)
 * para renderizar inmediatamente sin realizar una petición adicional.
 */
export function primeSignedUrlCache(
  attachmentId: string,
  signedUrl: string,
  expiresInSeconds = 300,
): void {
  if (!UUID_RE.test(attachmentId) || !signedUrl) return;
  signedUrlCache.set(attachmentId, {
    signedUrl,
    expiresAtMs: Date.now() + expiresInSeconds * 1000,
  });
}

export function invalidateSignedUrlCache(attachmentId?: string): void {
  if (attachmentId) {
    signedUrlCache.delete(attachmentId);
  } else {
    signedUrlCache.clear();
  }
}

function getValidCachedUrl(attachmentId: string): string | null {
  const entry = signedUrlCache.get(attachmentId);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAtMs - SAFETY_MARGIN_MS) {
    signedUrlCache.delete(attachmentId);
    return null;
  }
  return entry.signedUrl;
}

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

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 600;
const REQUEST_TIMEOUT_MS = 12_000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

function computeBackoffDelayMs(attempt: number): number {
  const jitter = Math.floor(Math.random() * 250);
  return BASE_BACKOFF_MS * Math.pow(2, attempt) + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  let session = null;

  if (forceRefresh) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed?.session ?? null;
  }

  if (!session) {
    const { data } = await supabase.auth.getSession();
    session = data?.session ?? null;
  }

  const expiresSoon =
    typeof session?.expires_at === 'number' && session.expires_at * 1000 < Date.now() + 60_000;
  const oversizedJwt = Boolean(session?.access_token && session.access_token.length > 4000);

  if (!forceRefresh && (!session || expiresSoon || oversizedJwt)) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session) {
      session = refreshed.session;
    }
  }

  if (!session?.access_token) {
    throw new Error('No hay sesión activa para resolver adjuntos privados.');
  }
  return session.access_token;
}

async function postSignedUrlWithRetry(body: Record<string, unknown>): Promise<any> {
  const endpoint = `${getSupabaseUrl()}/functions/v1/attachment-signed-url`;
  const anonKey = getAnonKey();
  let didRefreshOn401 = false;
  let forceTokenRefresh = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const token = await getAccessToken(forceTokenRefresh);
      forceTokenRefresh = false;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const rawText = await res.text().catch(() => '');
      let payload: any = null;
      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        payload = null;
      }

      if (res.status === 401 && !didRefreshOn401) {
        didRefreshOn401 = true;
        forceTokenRefresh = true;
        console.warn('[attachmentUriResolver] HTTP 401; refrescando sesión JWT y reintentando...');
        attempt--;
        continue;
      }

      if (res.ok || (res.status === 422 && payload?.code === 'USE_DRIVE_PROXY')) {
        return payload;
      }

      if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
        const delayMs = computeBackoffDelayMs(attempt);
        console.warn(
          `[attachmentUriResolver] HTTP ${res.status} (intento ${attempt + 1}/${MAX_RETRIES + 1}), reintentando en ${delayMs}ms...`,
        );
        await sleep(delayMs);
        continue;
      }

      const detail = payload?.error || rawText.trim().slice(0, 140) || `HTTP ${res.status}`;
      throw new Error(`No se pudo firmar el adjunto (${res.status}): ${detail}`);
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      const errMsg = isAbort ? `Timeout (${REQUEST_TIMEOUT_MS}ms)` : err?.message || String(err);

      const isTerminalHttpError =
        typeof errMsg === 'string' &&
        /^No se pudo firmar el adjunto \((400|403|404|409|422)\):/.test(errMsg);
      const isNoSession = typeof errMsg === 'string' && errMsg.includes('No hay sesión activa');

      if (!isTerminalHttpError && !isNoSession && attempt < MAX_RETRIES) {
        const delayMs = computeBackoffDelayMs(attempt);
        console.warn(
          `[attachmentUriResolver] Error de red (intento ${attempt + 1}/${MAX_RETRIES + 1}): ${errMsg}. Reintentando en ${delayMs}ms...`,
        );
        await sleep(delayMs);
        continue;
      }

      throw err instanceof Error ? err : new Error(errMsg);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error('No se pudo firmar el adjunto tras múltiples reintentos.');
}

function humanizeDriveProxyFailure(status: number, rawBody: string): string {
  let parsed: any = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsed = null;
  }
  switch (parsed?.unavailable_reason) {
    case 'file_deleted':
      return 'El archivo fue eliminado de Google Drive.';
    case 'drive_disconnected':
      return 'Google Drive fue desconectado por el propietario.';
    case 'needs_reauth':
    case 'permission_revoked':
      return 'La autorización de Google Drive expiró. Reconecta Drive en Ajustes.';
    case 'file_inaccessible':
      return 'Sin permiso para acceder a este archivo de Google Drive.';
    case 'account_changed':
      return 'El propietario cambió la cuenta de Google Drive.';
    default:
      return parsed?.error || `No se pudo cargar el archivo desde Drive (${status}).`;
  }
}

async function fetchDriveProxyAsDataUri(attachmentId: string): Promise<string> {
  const endpoint = `${getSupabaseUrl()}/functions/v1/drive-proxy?attachment_id=${encodeURIComponent(attachmentId)}`;
  const anonKey = getAnonKey();
  const baseCacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken(attempt > 0);
    const tempPath = `${baseCacheDir}veyra_drive_${attachmentId}_${Date.now()}_${attempt}`;

    try {
      const dl = await FileSystem.downloadAsync(endpoint, tempPath, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: anonKey,
        },
      });

      if (dl.status === 401 && attempt === 0) {
        continue;
      }

      if (dl.status < 200 || dl.status >= 300) {
        const errBody = await FileSystem.readAsStringAsync(tempPath).catch(() => '');
        throw new Error(humanizeDriveProxyFailure(dl.status, errBody));
      }

      const rawMime =
        dl.headers?.['content-type'] ||
        dl.headers?.['Content-Type'] ||
        'application/octet-stream';
      const mimeType = rawMime.split(';')[0].trim() || 'application/octet-stream';
      const base64 = await FileSystem.readAsStringAsync(tempPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const dataUri = `data:${mimeType};base64,${base64}`;
      primeSignedUrlCache(attachmentId, dataUri, 300);
      return dataUri;
    } finally {
      await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
    }
  }

  throw new Error('No se pudo autenticar la descarga desde Google Drive.');
}

/**
 * Resuelve una URI individual:
 * - Si es `veyra-attachment://<id>`: devuelve URL firmada o data URI vía `drive-proxy` (con caché + deduplicación + backoff exponencial).
 * - Si es cualquier otra URI (legacy `https://...`, `file://...`): la devuelve intacta.
 */
export async function resolveAttachmentUri(
  src: string,
  options?: { forceRefresh?: boolean },
): Promise<string> {
  const attachmentId = parseAttachmentUri(src);
  if (!attachmentId) return src;

  if (!options?.forceRefresh) {
    const cached = getValidCachedUrl(attachmentId);
    if (cached) return cached;
  } else {
    signedUrlCache.delete(attachmentId);
  }

  const existing = inflightRequests.get(attachmentId);
  if (existing) return existing;

  const promise = (async () => {
    const payload = await postSignedUrlWithRetry({ attachment_id: attachmentId });
    if (payload?.code === 'USE_DRIVE_PROXY') {
      return await fetchDriveProxyAsDataUri(attachmentId);
    }

    if (!payload?.signed_url) {
      throw new Error(payload?.error || 'Respuesta inválida de attachment-signed-url');
    }

    primeSignedUrlCache(attachmentId, payload.signed_url, payload.expires_in ?? 300);
    return payload.signed_url as string;
  })();

  inflightRequests.set(attachmentId, promise);
  try {
    return await promise;
  } finally {
    inflightRequests.delete(attachmentId);
  }
}

/**
 * Resuelve en lote (máx. 25 por petición) todas las URIs `veyra-attachment://<id>`
 * presentes en un bloque HTML (útil para exportación PDF o vista de solo lectura).
 */
export async function resolveAttachmentUrisInHtml(html: string): Promise<string> {
  if (!html || !html.includes(VEYRA_ATTACHMENT_SCHEME)) return html;

  const ids = new Set<string>();
  for (const match of html.matchAll(VEYRA_URI_GLOBAL_RE)) {
    if (match[1]) ids.add(match[1]);
  }
  if (ids.size === 0) return html;

  const missing = Array.from(ids).filter((id) => !getValidCachedUrl(id));
  if (missing.length > 0) {
    const driveFallbackIds: string[] = [];

    for (let i = 0; i < missing.length; i += 25) {
      const chunk = missing.slice(i, i + 25);
      let payload: any = null;
      try {
        payload = await postSignedUrlWithRetry({ attachment_ids: chunk });
      } catch (err: any) {
        console.warn('[attachmentUriResolver] Error resolviendo lote HTML:', err?.message || err);
        continue;
      }

      const results = payload?.results ?? {};
      for (const id of chunk) {
        const entry = results[id];
        if (entry?.ok && entry?.signed_url) {
          primeSignedUrlCache(id, entry.signed_url, entry.expires_in ?? 300);
        } else if (entry?.code === 'USE_DRIVE_PROXY') {
          driveFallbackIds.push(id);
        }
      }
    }

    if (driveFallbackIds.length > 0) {
      await Promise.allSettled(
        driveFallbackIds.map((id) => fetchDriveProxyAsDataUri(id)),
      );
    }
  }

  return html.replace(VEYRA_URI_GLOBAL_RE, (fullMatch, id: string) => {
    return getValidCachedUrl(id) ?? fullMatch;
  });
}

/**
 * Hook React Native equivalente para componentes nativos (modales, listas, previsualizadores).
 */
export function useResolvedAttachmentSrc(src: string | null | undefined) {
  const attachmentId = parseAttachmentUri(src);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (!src) return null;
    if (!attachmentId) return src;
    return getValidCachedUrl(attachmentId);
  });
  const [isLoading, setIsLoading] = useState<boolean>(
    Boolean(attachmentId && !getValidCachedUrl(attachmentId)),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setResolvedSrc(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (!attachmentId) {
      setResolvedSrc(src);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const cached = getValidCachedUrl(attachmentId);
    if (cached) {
      setResolvedSrc(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    resolveAttachmentUri(src)
      .then((url) => {
        if (!cancelled) {
          setResolvedSrc(url);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error cargando adjunto');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src, attachmentId]);

  const refresh = async () => {
    if (!src || !attachmentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const freshUrl = await resolveAttachmentUri(src, { forceRefresh: true });
      setResolvedSrc(freshUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error renovando URL');
    } finally {
      setIsLoading(false);
    }
  };

  return { resolvedSrc, isLoading, error, refresh, isPrivateAttachment: Boolean(attachmentId) };
}
