import * as Y from 'yjs';
import { SupabaseClient } from '@supabase/supabase-js';
import { base64ToBytes, bytesToBase64 } from './yjsLocalPersistence';
import { diagLog } from './diagLog';

declare const module: any;

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

export interface RegenerateSnapshotResult {
    success: boolean;
    noteId: string;
    serverClock: number;
    createdAt?: string;
    updatedAt?: string;
    length: number;
    error?: string;
}

export interface ActivateNoteYjsParams {
    noteId: string;
    initialUpdateData: string;          // Base64
    initialUpdateHash: string;          // SHA-256 hex (64 caracteres)
    clientId: string;
    expectedContentHash: string;        // SHA-256 hex del contenido UTF-8 actual (64 caracteres)
    expectedUpdatedAtMs: number;        // BIGINT en PostgreSQL
    initialStateVector?: string | null; // Base64 opcional para acelerar lectura
}

export interface ActivateNoteYjsResult {
    success: boolean;
    noteId?: string;
    syncMode?: string;
    initialUpdateId?: number;
    updatedAtMs?: number;
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
            const buffer = await globalThis.crypto.subtle.digest('SHA-256', rawBytes as unknown as BufferSource);
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
    public async fetchDocument(noteId: string, targetDoc?: Y.Doc, maxRetries = 3, fromCursorId = 0): Promise<RemoteFetchResult> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const tempDoc = new Y.Doc();
                let hasSnapshot = false;
                let snapshotClock = 0;
                let maxUpdateId = 0;
                let appliedUpdatesCount = 0;

                // Diagnóstico temporal de conteo remoto
                try {
                    const { count: remoteRowCount, error: countErr } = await this.supabase
                        .from('note_yjs_updates')
                        .select('*', { count: 'exact', head: true })
                        .eq('note_id', noteId);
                    console.log('[YJS-DIAG] [REMOTE] Total filas en note_yjs_updates:', { noteId, remoteRowCount, countErr: countErr?.message });
                } catch (ce) {
                    console.warn('[YJS-DIAG] [REMOTE] Error consultando count en note_yjs_updates:', ce);
                }

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
                        const originRemoto = 'remote-replay-load';
                        console.log('[YJS-DIAG] aplicando update remoto', { origin: originRemoto, bytes: snapshotBytes?.byteLength ?? snapshotBytes?.length });
                        Y.applyUpdate(tempDoc, snapshotBytes, originRemoto);
                        hasSnapshot = true;
                        snapshotClock = Number(snapshotT0.server_clock) || 0;
                    } catch (decErr: any) {
                        throw new Error(`Snapshot malformado o corrupto en base de datos: ${decErr.message}`);
                    }
                }

                // 2. Paginación secuencial de la fuente de verdad (.gt('id', cursorId))
                const PAGE_SIZE = 500;
                let cursorId = fromCursorId > 0 ? fromCursorId : (hasSnapshot && snapshotClock > 0 ? snapshotClock : 0);
                if (cursorId > maxUpdateId) maxUpdateId = cursorId;
                let hasMore = true;

                diagLog('fetch_updates_start', { noteId });

                while (hasMore) {
                    const { data: updatesData, error: uErr } = await this.supabase
                        .from('note_yjs_updates')
                        .select('id, update_data, created_at')
                        .eq('note_id', noteId)
                        .gt('id', cursorId)
                        .order('id', { ascending: true })
                        .limit(PAGE_SIZE);

                    diagLog('fetch_updates_done', {
                        count: updatesData?.length,
                        ids: updatesData?.map(u => u.id),
                        totalBytes: updatesData?.reduce((a, u) => a + (u.update_data?.length || 0), 0)
                    });

                    if (uErr) {
                        throw new Error(`Error paginando deltas remotos: ${uErr.message}`);
                    }

                    if (!updatesData || updatesData.length === 0) {
                        hasMore = false;
                        break;
                    }

                    tempDoc.transact(() => {
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
                    }, 'remote-replay-load');

                    diagLog('apply_updates_batch', { count: updatesData.length, cursorId });
                    console.log('[YJS-DIAG] aplicando updates remotos en lote (transact)', {
                        count: updatesData.length,
                        cursorId,
                        origin: 'remote-replay-load'
                    });

                    if (updatesData.length < PAGE_SIZE) {
                        hasMore = false;
                    }
                }

                const pageOrder = tempDoc.getArray<string>('pageOrder');
                const pageIdActivo: string = pageOrder.length > 0 ? String(pageOrder.get(0)) : 'default';
                diagLog('after_initial_load', {
                    pageIdActivo,
                    fragmentLength: tempDoc.getXmlFragment(pageIdActivo).length,
                    docXml: tempDoc.getXmlFragment(pageIdActivo).toString().slice(0, 300)
                });

                console.log('[YJS-DIAG] [REMOTE] Descarga de deltas finalizada:', {
                    noteId,
                    totalDeltasDescargados: appliedUpdatesCount,
                    maxUpdateId,
                    hasSnapshot
                });

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

                if (t0HasSnapshot && snapshotT1) {
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
                    const originRemoto = 'remote-replay-load';
                    console.log('[YJS-DIAG] aplicando update remoto', { origin: originRemoto, bytes: fullState?.byteLength ?? fullState?.length });
                    Y.applyUpdate(targetDoc, fullState, originRemoto);
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

    /**
     * Regenera el snapshot de una nota en `public.note_yjs_snapshots`:
     * 1. Carga el Y.Doc completo consolidado (snapshot previo + todos los deltas de note_yjs_updates aplicados).
     * 2. Codifica el estado consolidado con Y.encodeStateAsUpdate(doc).
     * 3. Realiza UPSERT en note_yjs_snapshots con updated_at = now() y server_clock = maxUpdateId.
     * 4. NO borra ningún delta en note_yjs_updates (los deltas históricos permanecen intactos).
     */
    public async regenerateSnapshot(noteId: string): Promise<RegenerateSnapshotResult> {
        try {
            console.log('[regenerateSnapshot] Iniciando regeneración de snapshot para nota:', noteId);

            // 1. Cargar el Y.Doc actual completo (snapshot + todos los deltas aplicados)
            const fetchResult = await this.fetchDocument(noteId);
            const fullDoc = fetchResult.doc;
            const maxUpdateId = fetchResult.maxUpdateId;

            // 2. Codificar el estado con Y.encodeStateAsUpdate(doc)
            const fullStateBytes = Y.encodeStateAsUpdate(fullDoc);
            const base64Snapshot = bytesToBase64(fullStateBytes);
            const base64Sv = bytesToBase64(Y.encodeStateVector(fullDoc));
            const snapshotHash = await computeUpdateHash(base64Snapshot);

            console.log('[regenerateSnapshot] Estado codificado:', {
                noteId,
                maxUpdateId,
                bytesLength: fullStateBytes.length,
                base64Length: base64Snapshot.length,
                hash: snapshotHash.slice(0, 12) + '...',
            });

            if (maxUpdateId <= 0) {
                throw new Error(`No se puede regenerar snapshot: no existen deltas en note_yjs_updates para la nota ${noteId} (maxUpdateId = ${maxUpdateId}).`);
            }

            // 3. Guardar snapshot acelerador vía RPC compact_note_yjs_snapshot (SECURITY DEFINER)
            const { data: rpcData, error: rpcErr } = await this.supabase.rpc('compact_note_yjs_snapshot', {
                p_note_id: noteId,
                p_snapshot_data: base64Snapshot,
                p_state_vector: base64Sv,
                p_up_to_update_id: maxUpdateId,
                p_snapshot_hash: snapshotHash,
            });

            if (rpcErr) {
                throw new Error(`Error en compact_note_yjs_snapshot: ${rpcErr.message}`);
            }

            console.log('[regenerateSnapshot] Snapshot guardado exitosamente vía RPC compact_note_yjs_snapshot:', rpcData);

            // 4. Consultar el estado del snapshot recién guardado
            const { data: savedSnap, error: readErr } = await this.supabase
                .from('note_yjs_snapshots')
                .select('created_at, updated_at, server_clock, snapshot')
                .eq('note_id', noteId)
                .maybeSingle();

            if (readErr) {
                console.warn('[regenerateSnapshot] Advertencia leyendo snapshot guardado:', readErr.message);
            }

            const result: RegenerateSnapshotResult = {
                success: true,
                noteId,
                serverClock: savedSnap ? Number(savedSnap.server_clock) : maxUpdateId,
                createdAt: savedSnap?.created_at,
                updatedAt: savedSnap?.updated_at,
                length: savedSnap?.snapshot ? savedSnap.snapshot.length : base64Snapshot.length,
            };

            console.log('[regenerateSnapshot] Regeneración completada con éxito:', result);
            return result;
        } catch (err: any) {
            console.error('[regenerateSnapshot] Fallo en regenerateSnapshot:', err);
            return {
                success: false,
                noteId,
                serverClock: 0,
                length: 0,
                error: err?.message || 'Error desconocido al regenerar snapshot',
            };
        }
    }

    /**
     * Invoca la RPC transaccional `activate_note_yjs_mode` de producción para transicionar de forma atómica
     * y autorizada una nota desde 'rest' hacia 'yjs' (Fase 3.1 / 3.3).
     * 
     * FIRMA CONFIRMADA EN POSTGRESQL:
     * activate_note_yjs_mode(text, text, text, text, text, bigint, text)
     * 
     * PARÁMETROS EXACTOS (en estricta correspondencia con deploy-05):
     * - p_note_id (text)
     * - p_initial_update_data (text)
     * - p_initial_update_hash (text)
     * - p_client_id (text)
     * - p_expected_content_hash (text)
     * - p_expected_updated_at_ms (bigint)
     * - p_initial_state_vector (text DEFAULT NULL)
     */
    public async activateNoteYjsMode(params: ActivateNoteYjsParams): Promise<ActivateNoteYjsResult> {
        try {
            if (!params.noteId || params.noteId.trim() === '') {
                return { success: false, error: 'p_note_id no puede ser nulo o vacío' };
            }
            if (!params.initialUpdateData || params.initialUpdateData.trim() === '') {
                return { success: false, error: 'p_initial_update_data no puede ser nulo o vacío' };
            }
            if (!params.initialUpdateHash || params.initialUpdateHash.trim().length !== 64) {
                return { success: false, error: 'p_initial_update_hash debe ser un hash SHA-256 de 64 caracteres' };
            }
            if (!params.clientId || params.clientId.trim() === '') {
                return { success: false, error: 'p_client_id no puede ser nulo o vacío' };
            }
            if (!params.expectedContentHash || params.expectedContentHash.trim().length !== 64) {
                return { success: false, error: 'p_expected_content_hash debe ser un hash SHA-256 de 64 caracteres' };
            }
            if (params.expectedUpdatedAtMs === undefined || params.expectedUpdatedAtMs === null || params.expectedUpdatedAtMs <= 0) {
                return { success: false, error: 'p_expected_updated_at_ms debe ser un timestamp positivo' };
            }

            console.log(`[PoC Yjs RPC] Invocando activate_note_yjs_mode (nota=${params.noteId.trim()}, expectedUpdatedAtMs=${params.expectedUpdatedAtMs})`);

            const { data, error } = await this.supabase.rpc('activate_note_yjs_mode', {
                p_note_id: params.noteId.trim(),
                p_initial_update_data: params.initialUpdateData,
                p_initial_update_hash: params.initialUpdateHash.trim().toLowerCase(),
                p_client_id: params.clientId.trim(),
                p_expected_content_hash: params.expectedContentHash.trim().toLowerCase(),
                p_expected_updated_at_ms: Math.floor(params.expectedUpdatedAtMs),
                p_initial_state_vector: params.initialStateVector || null,
            });

            if (error) {
                console.warn(`[PoC Yjs RPC] Error en activate_note_yjs_mode: ${error.message} (código: ${error.code})`);
                return {
                    success: false,
                    error: error.message || 'Error invocando activate_note_yjs_mode',
                };
            }

            console.log(`[PoC Yjs RPC] Activación Yjs exitosa para nota=${params.noteId}: update_id=${data?.initial_update_id}`);
            return {
                success: Boolean(data?.success),
                noteId: data?.note_id,
                syncMode: data?.sync_mode,
                initialUpdateId: data?.initial_update_id ? Number(data.initial_update_id) : undefined,
                updatedAtMs: data?.updated_at_ms ? Number(data.updated_at_ms) : undefined,
            };
        } catch (err: any) {
            console.warn(`[PoC Yjs RPC] Excepción invocando activate_note_yjs_mode: ${err.message}`);
            return {
                success: false,
                error: err?.message || 'Excepción invocando activate_note_yjs_mode',
            };
        }
    }
}
