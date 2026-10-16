import * as Y from 'yjs';
import { SupabaseClient } from '@supabase/supabase-js';
import { base64ToBytes } from './yjsLocalPersistence';

export interface RemoteSnapshotRecord {
    note_id: string;
    snapshot: string;       // Base64
    state_vector: string;   // Base64
    server_clock: number;
    created_at?: string;
    updated_at?: string;
}

export interface RemoteUpdateRecord {
    id: number;
    note_id: string;
    client_id: string;
    user_id?: string | null;
    update_data: string;    // Base64
    update_hash: string;
    created_at?: string;
}

export interface RemoteFetchResult {
    doc: Y.Doc;
    hasSnapshot: boolean;
    snapshotClock: number;
    maxUpdateId: number;
    appliedUpdatesCount: number;
}

export interface RemoteSaveUpdateResult {
    success: boolean;
    updateId?: number;
    duplicate?: boolean;
    unauthorized?: boolean;
    error?: string;
}

export interface RemoteCompactionResult {
    success: boolean;
    serverClock: number;
    deletedUpdates: number;
    historicalPreserved: boolean;
    error?: string;
}

/**
 * Genera un hash determinista SHA-256 en formato hexadecimal minúsculo canónico.
 * 
 * REQUISITOS ESTRICTOS:
 * - Emplea criptografía real de Node.js o Expo-crypto.
 * - Sin fallbacks débiles de 32-bits.
 * - Si no hay soporte criptográfico, lanza error explícito para preservar el delta en cola local.
 */
export async function computeUpdateHash(base64Data: string): Promise<string> {
    const rawBytes = base64ToBytes(base64Data);

    // 1. Web Cryptography API estándar (disponible nativamente en Node.js 18+, navegadores y runtimes JS)
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle?.digest) {
        try {
            const buffer = await globalThis.crypto.subtle.digest('SHA-256', rawBytes);
            return Array.from(new Uint8Array(buffer))
                .map((b: number) => b.toString(16).padStart(2, '0'))
                .join('')
                .toLowerCase();
        } catch (_) {}
    }

    // 2. Node.js nativo (con carga dinámica indirecta para evitar que el empaquetador Metro de Expo lo bloquee en móvil)
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        try {
            const req = typeof module !== 'undefined' && module.require ? module.require.bind(module) : null;
            const nodeCrypto = req ? req('crypto') : (typeof eval !== 'undefined' ? eval('require')('crypto') : null);
            if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
                return nodeCrypto.createHash('sha256').update(rawBytes).digest('hex').toLowerCase();
            }
        } catch (_) {}
    }

    // 3. Expo Crypto en runtime nativo móvil (Android / iOS)
    try {
        const Crypto = require('expo-crypto');
        if (typeof Crypto.digest === 'function') {
            const buffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, rawBytes);
            return Array.from(new Uint8Array(buffer))
                .map((b: number) => b.toString(16).padStart(2, '0'))
                .join('')
                .toLowerCase();
        }
        let binary = '';
        const len = rawBytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(rawBytes[i]);
        }
        const hash = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            binary,
            { encoding: Crypto.CryptoEncoding.HEX }
        );
        return hash.toLowerCase();
    } catch (_) {}

    throw new Error('Proveedor criptográfico SHA-256 no disponible. La actualización se mantiene en cola local.');
}

/**
 * Capa de Persistencia Remota para Notas Yjs en Supabase PostgreSQL (Fase B.4).
 * 
 * GARANTÍAS DE INTEGRIDAD:
 * - El historial inmutable de deltas en `note_yjs_updates` es la única fuente de verdad autoritativa.
 * - La recuperación nunca omite deltas históricos basándose en cursores de snapshots no verificados.
 * - Escrituras exclusivas mediante RPC atómica con verificación SHA-256 en servidor (`append_note_yjs_update`).
 * - Compactación remota no verificable deshabilitada durante esta fase para proteger la integridad.
 */
export class YjsRemotePersistence {
    private supabase: SupabaseClient;

    constructor(supabase: SupabaseClient) {
        this.supabase = supabase;
    }

    /**
     * Guarda un delta en PostgreSQL mediante la RPC atómica con validación criptográfica en el servidor.
     */
    public async saveRemoteUpdate(
        noteId: string,
        updateBase64: string,
        clientId: string
    ): Promise<RemoteSaveUpdateResult> {
        try {
            if (!noteId || noteId.trim() === '') {
                return { success: false, error: 'noteId no puede ser vacío' };
            }
            if (!updateBase64 || updateBase64.trim() === '') {
                return { success: false, error: 'updateBase64 no puede ser vacío' };
            }

            const updateHash = await computeUpdateHash(updateBase64);

            console.log(`[PoC Yjs RPC] Invocando append_note_yjs_update (nota=${noteId.trim()}, hash=${updateHash.substring(0, 8)}...)`);
            const { data, error } = await this.supabase.rpc('append_note_yjs_update', {
                p_note_id: noteId.trim(),
                p_client_id: clientId,
                p_update_data: updateBase64,
                p_update_hash: updateHash,
            });

            if (error) {
                console.warn(`[PoC Yjs RPC] Error en append_note_yjs_update: ${error.message} (código: ${error.code})`);
                const isUnauthorized = error.code === '42501' ||
                    error.message?.toLowerCase().includes('permiso denegado') ||
                    error.message?.toLowerCase().includes('violates row-level security');

                return {
                    success: false,
                    unauthorized: isUnauthorized,
                    error: error.message,
                };
            }

            console.log(`[PoC Yjs RPC] Confirmado por PostgreSQL: success=${Boolean(data?.success)}, update_id=${data?.update_id}, duplicate=${Boolean(data?.duplicate)}`);
            return {
                success: Boolean(data?.success),
                updateId: data?.update_id ? Number(data.update_id) : undefined,
                duplicate: Boolean(data?.duplicate),
            };
        } catch (err: any) {
            console.warn(`[PoC Yjs RPC] Excepción invocando append_note_yjs_update: ${err.message}`);
            return {
                success: false,
                error: err.message || 'Error invocando append_note_yjs_update',
            };

        }
    }

    /**
     * Reconstruye el documento de forma consistente garantizando que ningún delta se omita.
     * 
     * REGLA DE INTEGRIDAD FASE B.4:
     * - `note_yjs_updates` es la fuente de verdad autoritativa.
     * - Si existe un snapshot, se aplica a `tempDoc` como acelerador no autoritativo.
     * - La lectura de deltas parte desde 0 y avanza secuencialmente. Un snapshot con cursor
     *   alto o inválido NUNCA provoca que se omitan deltas históricos.
     */
    public async fetchDocument(noteId: string, targetDoc?: Y.Doc, maxRetries = 3): Promise<RemoteFetchResult> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const tempDoc = new Y.Doc();
                let hasSnapshot = false;
                let snapshotClock = 0;
                let maxUpdateId = 0;
                let appliedUpdatesCount = 0;

                // 1. Obtener snapshot previo como caché no autoritativa si existe
                const { data: snapshotT0, error: sErr } = await this.supabase
                    .from('note_yjs_snapshots')
                    .select('snapshot, server_clock, updated_at')
                    .eq('note_id', noteId)
                    .maybeSingle();

                if (sErr) {
                    throw new Error(`Error consultando snapshot inicial: ${sErr.message}`);
                }

                if (snapshotT0 && snapshotT0.snapshot) {
                    try {
                        const snapshotBytes = base64ToBytes(snapshotT0.snapshot);
                        Y.applyUpdate(tempDoc, snapshotBytes, 'remote-snapshot-cache');
                        hasSnapshot = true;
                        snapshotClock = Number(snapshotT0.server_clock) || 0;
                    } catch (decErr: any) {
                        throw new Error(`Snapshot malformado o corrupto en base de datos: ${decErr.message}`);
                    }
                }

                // 2. Paginación secuencial de la fuente de verdad (note_yjs_updates desde 0)
                // Se garantiza que ningún delta histórico sea omitido por un cursor de snapshot inválido.
                const PAGE_SIZE = 500;
                let cursorId = 0;
                let hasMore = true;

                while (hasMore) {
                    const { data: updatesData, error: uErr } = await this.supabase
                        .from('note_yjs_updates')
                        .select('id, update_data, created_at')
                        .eq('note_id', noteId)
                        .gt('id', cursorId)
                        .order('id', { ascending: true })
                        .limit(PAGE_SIZE);

                    if (uErr) {
                        throw new Error(`Error paginando deltas remotos: ${uErr.message}`);
                    }

                    if (!updatesData || updatesData.length === 0) {
                        hasMore = false;
                        break;
                    }

                    for (const row of updatesData) {
                        if (!row.update_data) {
                            throw new Error(`Fila de delta ${row.id} corrupta: update_data nulo`);
                        }

                        try {
                            const updateBytes = base64ToBytes(row.update_data);
                            Y.applyUpdate(tempDoc, updateBytes, 'remote-replay-load');
                            appliedUpdatesCount++;
                            const rowId = Number(row.id);
                            if (rowId > maxUpdateId) maxUpdateId = rowId;
                            cursorId = rowId;
                        } catch (applyErr: any) {
                            throw new Error(`Delta ${row.id} malformado o corrupto: ${applyErr.message}`);
                        }
                    }

                    if (updatesData.length < PAGE_SIZE) {
                        hasMore = false;
                    }
                }

                // 3. Verificación de consistencia post-descarga (T1)
                const { data: snapshotT1, error: verifyErr } = await this.supabase
                    .from('note_yjs_snapshots')
                    .select('server_clock, updated_at')
                    .eq('note_id', noteId)
                    .maybeSingle();

                if (verifyErr) {
                    throw new Error(`Error verificando consistencia de snapshot: ${verifyErr.message}`);
                }

                const t0HasSnapshot = hasSnapshot;
                const t1HasSnapshot = Boolean(snapshotT1 && snapshotT1.server_clock !== undefined && snapshotT1.server_clock !== null);

                if (t0HasSnapshot !== t1HasSnapshot) {
                    console.warn(`[PoC Yjs] Inconsistencia detectada en fetchDocument (existencia de snapshot cambió de ${t0HasSnapshot} a ${t1HasSnapshot}). Reintentando (${attempt + 1}/${maxRetries})...`);
                    continue;
                }

                if (t0HasSnapshot && t1HasSnapshot) {
                    const postFetchClock = Number(snapshotT1.server_clock) || 0;
                    const postFetchUpdatedAt = snapshotT1.updated_at || '';
                    const initialUpdatedAt = snapshotT0?.updated_at || '';

                    if (postFetchClock !== snapshotClock || postFetchUpdatedAt !== initialUpdatedAt) {
                        console.warn(`[PoC Yjs] Inconsistencia detectada en fetchDocument (snapshot modificado en carrera: reloj ${snapshotClock} -> ${postFetchClock}). Reintentando (${attempt + 1}/${maxRetries})...`);
                        continue;
                    }
                }

                // Lectura consistente validada: copiar estado al targetDoc si fue provisto
                if (targetDoc) {
                    const fullState = Y.encodeStateAsUpdate(tempDoc);
                    Y.applyUpdate(targetDoc, fullState, 'remote-reconciled');
                }

                return {
                    doc: targetDoc || tempDoc,
                    hasSnapshot,
                    snapshotClock,
                    maxUpdateId,
                    appliedUpdatesCount,
                };
            } catch (err: any) {
                lastError = err;
                console.warn(`[PoC Yjs] Intento ${attempt + 1} de fetchDocument falló: ${err.message}`);
            }
        }

        throw lastError || new Error(`No fue posible completar una lectura remota consistente tras ${maxRetries} intentos.`);
    }

    /**
     * Consulta deltas remotos posteriores a un cursor secuencial de forma paginada.
     */
    public async fetchUpdatesSince(
        noteId: string,
        sinceUpdateId: number
    ): Promise<{ updates: RemoteUpdateRecord[]; maxUpdateId: number }> {
        let maxUpdateId = sinceUpdateId;
        const updates: RemoteUpdateRecord[] = [];
        const PAGE_SIZE = 500;
        let cursorId = sinceUpdateId;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await this.supabase
                .from('note_yjs_updates')
                .select('id, note_id, client_id, user_id, update_data, update_hash, created_at')
                .eq('note_id', noteId)
                .gt('id', cursorId)
                .order('id', { ascending: true })
                .limit(PAGE_SIZE);

            if (error) {
                throw new Error(`Error en fetchUpdatesSince: ${error.message}`);
            }

            if (!data || data.length === 0) {
                hasMore = false;
                break;
            }

            for (const row of data) {
                const uId = Number(row.id);
                if (uId > maxUpdateId) maxUpdateId = uId;
                cursorId = uId;
                updates.push({
                    id: uId,
                    note_id: row.note_id,
                    client_id: row.client_id,
                    user_id: row.user_id,
                    update_data: row.update_data,
                    update_hash: row.update_hash,
                    created_at: row.created_at,
                });
            }

            if (data.length < PAGE_SIZE) {
                hasMore = false;
            }
        }

        return { updates, maxUpdateId };
    }

    /**
     * En Fase B.4, la compactación remota basada en snapshots de cliente está deshabilitada.
     * Los deltas históricos inmutables en `note_yjs_updates` se conservan como única fuente de verdad.
     * En fases posteriores, se diseñará un mecanismo en el servidor (p. ej. edge worker / PG-CRDT)
     * para verificar matemáticamente el contenido del snapshot antes de avanzar el cursor.
     */
    public async compactRemoteSnapshot(
        _noteId: string,
        _doc?: Y.Doc,
        _upToUpdateId?: number
    ): Promise<RemoteCompactionResult> {
        return {
            success: false,
            serverClock: 0,
            deletedUpdates: 0,
            historicalPreserved: true,
            error: 'Compactación remota deshabilitada en Fase B.4: el log de deltas es la única fuente de verdad autoritativa',
        };
    }
}
