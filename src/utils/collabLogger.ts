/**
 * collabLogger.ts
 * Utilidad de instrumentación y diagnóstico para colaboración en tiempo real y sincronización de notas.
 *
 * REGLAS DE PRIVACIDAD Y RENDIMIENTO:
 * 1. NUNCA imprime el texto privado de las notas.
 * 2. Registra únicamente marcas temporales precisas (ms), ID abreviado de la nota,
 *    origen del evento, longitud de caracteres, y un hash determinista no reversible.
 * 3. Registra transiciones de suscripción Realtime y resultados de envío broadcast.
 */

export function getCollabContentHash(content: string | null | undefined): string {
    if (!content) return 'empty';
    let h = 5381;
    for (let i = 0; i < content.length; i++) {
        h = ((h << 5) + h) + content.charCodeAt(i);
        h |= 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

export type CollabOrigin =
    | 'local_input'
    | 'local_cursor'
    | 'local_save'
    | 'autosave'
    | 'REST_sync'
    | 'realtime_send'
    | 'realtime_recv'
    | 'sqlite_load'
    | 'dom_update';

export interface CollabLogDetails {
    noteId?: string | null;
    origin?: CollabOrigin;
    action?: string;
    status?: string;
    length?: number;
    hash?: string;
    extra?: Record<string, any>;
}

export function logCollabEvent(tag: string, details: CollabLogDetails) {
    const time = new Date().toISOString().substring(11, 23); // HH:mm:ss.mmm
    const shortId = details.noteId ? details.noteId.substring(0, 8) + '...' : 'none';
    const payloadInfo = details.length !== undefined
        ? `[len:${details.length} hash:${details.hash || 'none'}]`
        : '';
    const statusInfo = details.status ? `status=${details.status}` : '';
    const actionInfo = details.action ? `act=${details.action}` : '';
    const originInfo = details.origin ? `orig=${details.origin}` : '';

    const summaryParts = [originInfo, actionInfo, statusInfo, payloadInfo].filter(Boolean).join(' ');

    console.log(`[VeyraCollab ${time}] [${tag}] [id:${shortId}] ${summaryParts}`, details.extra ? details.extra : '');
}

/**
 * Normaliza cualquier formato de fecha o marca temporal a milisegundos Unix numéricos (epoch ms).
 * Maneja:
 * - Números en milisegundos (ej: 1760569200000)
 * - Números en segundos Unix (ej: 1760569200) -> multiplica por 1000
 * - Cadenas numéricas ("1760569200000" o "1760569200")
 * - Cadenas ISO 8601 ("2026-10-15T22:30:00.000Z")
 * - Objetos Date
 * - Valores nulos, indefinidos, vacíos o no válidos -> retorna 0
 */
export function normalizeToEpochMs(val: any): number {
    if (val == null || val === '') return 0;
    if (typeof val === 'number') {
        if (!isFinite(val) || val <= 0) return 0;
        // Si el valor tiene menos de 11 dígitos (< 100000000000), es Unix timestamp en segundos.
        // En 2026, Date.now() es aprox 1.78e12 (13 dígitos).
        if (val < 100000000000) {
            return Math.round(val * 1000);
        }
        return Math.round(val);
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return 0;
        // Si es puramente numérico (ej: "1760569200" o "1760569200000")
        if (/^\d+(\.\d+)?$/.test(trimmed)) {
            const num = Number(trimmed);
            if (!isFinite(num) || num <= 0) return 0;
            if (num < 100000000000) {
                return Math.round(num * 1000);
            }
            return Math.round(num);
        }
        // Intentar parsear como cadena de fecha ISO o RFC
        const parsed = Date.parse(trimmed);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
        return 0;
    }
    if (val instanceof Date) {
        const t = val.getTime();
        return !isNaN(t) && t > 0 ? t : 0;
    }
    return 0;
}

