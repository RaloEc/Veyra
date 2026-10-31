import * as Y from 'yjs';

declare const Buffer: any;

// Helper de conversión binaria Uint8Array <-> Base64
export function bytesToBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export interface StoredUpdate {
    id: number;
    docId: string;
    updateData: string; // Base64
    synced: number;     // 0 = pendiente de subir a Supabase, 1 = sincronizado
    createdAtMs: number;
}

export interface LocalPersistenceDBAdapter {
    execAsync: (sql: string) => Promise<any>;
    runAsync: (sql: string, params?: any[]) => Promise<{ lastInsertRowId?: number; changes?: number }>;
    getAllAsync: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
    getFirstAsync: <T = any>(sql: string, params?: any[]) => Promise<T | null>;
    withTransactionAsync?: <T>(action: () => Promise<T>) => Promise<T>;
}

/**
 * Capa de Persistencia Local SQLite para Notas Yjs (Offline-First).
 * 
 * Gestiona el almacenamiento duradero local mediante una estrategia híbrida:
 * 1. `yjs_note_snapshots`: Snapshot binario compactado del documento completo.
 * 2. `yjs_note_updates`: Registro secuencial (append-only) de deltas incrementales.
 * 
 * Garantías:
 * - Tolerancia a fallos: escrituras atómicas por delta.
 * - Offline-first: los cambios locales se registran con `synced = 0` hasta que Supabase confirme recepción.
 * - Compactación segura: consolida deltas en el snapshot principal sin purgar deltas pendientes de sincronización.
 */
export class YjsLocalPersistence {
    private db: LocalPersistenceDBAdapter;

    constructor(db: LocalPersistenceDBAdapter) {
        this.db = db;
    }

    /**
     * Inicializa las tablas e índices en SQLite.
     */
    public async initSchema(): Promise<void> {
        await this.db.execAsync(`
            CREATE TABLE IF NOT EXISTS yjs_note_snapshots (
                doc_id TEXT PRIMARY KEY,
                snapshot TEXT NOT NULL,
                state_vector TEXT NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                last_remote_update_id INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS yjs_note_updates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doc_id TEXT NOT NULL,
                update_data TEXT NOT NULL,
                synced INTEGER DEFAULT 0,
                created_at_ms INTEGER NOT NULL,
                last_remote_update_id INTEGER DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_yjs_updates_doc ON yjs_note_updates(doc_id, synced);
        `);

        try {
            await this.db.execAsync('ALTER TABLE yjs_note_snapshots ADD COLUMN last_remote_update_id INTEGER DEFAULT 0;');
        } catch (_) {}
        try {
            await this.db.execAsync('ALTER TABLE yjs_note_updates ADD COLUMN last_remote_update_id INTEGER DEFAULT 0;');
        } catch (_) {}
    }

    /**
     * Guarda un delta incremental en SQLite.
     */
    public async storeUpdate(
        docId: string,
        updateBytes: Uint8Array,
        synced: boolean = false,
        lastRemoteUpdateId: number = 0
    ): Promise<number> {
        const base64Data = bytesToBase64(updateBytes);
        const now = Date.now();
        const syncedVal = synced ? 1 : 0;

        const res = await this.db.runAsync(
            `INSERT INTO yjs_note_updates (doc_id, update_data, synced, created_at_ms, last_remote_update_id) VALUES (?, ?, ?, ?, ?)`,
            [docId, base64Data, syncedVal, now, lastRemoteUpdateId]
        );

        return res.lastInsertRowId || 0;
    }

    /**
     * Carga y reconstruye el Y.Doc completo a partir del snapshot base y los deltas incrementales.
     */
    public async loadDocument(docId: string, targetDoc?: Y.Doc): Promise<{
        doc: Y.Doc;
        hasSnapshot: boolean;
        appliedUpdatesCount: number;
    }> {
        const doc = targetDoc || new Y.Doc();
        let hasSnapshot = false;

        console.log('[YJS-DIAG] [SQLITE] loadDocument iniciado para nota:', docId);

        // 1. Cargar snapshot base si existe
        const snapshotRow = await this.db.getFirstAsync<{
            doc_id: string;
            snapshot: string;
            state_vector: string;
        }>(`SELECT snapshot, state_vector FROM yjs_note_snapshots WHERE doc_id = ?`, [docId]);

        if (snapshotRow && snapshotRow.snapshot) {
            const snapshotBytes = base64ToBytes(snapshotRow.snapshot);
            const originRemoto = 'sqlite-load';
            console.log('[YJS-DIAG] aplicando update remoto', { origin: originRemoto, bytes: snapshotBytes?.byteLength ?? snapshotBytes?.length });
            Y.applyUpdate(doc, snapshotBytes, originRemoto);
            hasSnapshot = true;
        }

        // 2. Replay de todas las actualizaciones incrementales posteriores en orden estricto
        const updates = await this.db.getAllAsync<StoredUpdate>(
            `SELECT id, doc_id, update_data, synced, created_at_ms FROM yjs_note_updates WHERE doc_id = ? ORDER BY id ASC`,
            [docId]
        );

        for (const row of updates) {
            const rawData = (row as any).update_data || (row as any).updateData;
            if (rawData) {
                const updateBytes = base64ToBytes(rawData);
                const originRemoto = 'sqlite-load';
                console.log('[YJS-DIAG] aplicando update remoto', { origin: originRemoto, bytes: updateBytes?.byteLength ?? updateBytes?.length });
                Y.applyUpdate(doc, updateBytes, originRemoto);
            }
        }

        console.log('[YJS-DIAG] [SQLITE] loadDocument finalizado:', {
            docId,
            hasSnapshot,
            appliedUpdatesCount: updates.length
        });

        return {
            doc,
            hasSnapshot,
            appliedUpdatesCount: updates.length,
        };
    }

    /**
     * Obtiene los deltas locales que aún no han sido confirmados por Supabase.
     */
    public async getPendingLocalUpdates(docId: string): Promise<StoredUpdate[]> {
        const rows = await this.db.getAllAsync<any>(
            `SELECT id, doc_id, update_data, synced, created_at_ms FROM yjs_note_updates WHERE doc_id = ? AND synced = 0 ORDER BY id ASC`,
            [docId]
        );
        return (rows || []).map(r => ({
            id: r.id,
            docId: r.doc_id || r.docId,
            updateData: r.update_data || r.updateData,
            synced: r.synced,
            createdAtMs: r.created_at_ms || r.createdAtMs,
        }));
    }

    /**
     * Marca un conjunto de IDs de actualización como sincronizados en el servidor.
     */
    public async markUpdatesAsSynced(updateIds: number[]): Promise<void> {
        if (!updateIds || updateIds.length === 0) return;
        const placeholders = updateIds.map(() => '?').join(',');
        await this.db.runAsync(
            `UPDATE yjs_note_updates SET synced = 1 WHERE id IN (${placeholders})`,
            updateIds
        );
    }

    /**
     * Obtiene el último ID de actualización remota persistido para esta nota.
     */
    public async getLastRemoteUpdateId(docId: string): Promise<number> {
        try {
            const snap = await this.db.getFirstAsync<{ last_remote_update_id?: number }>(
                `SELECT last_remote_update_id FROM yjs_note_snapshots WHERE doc_id = ?`,
                [docId]
            );
            const snapCursor = Number(snap?.last_remote_update_id) || 0;

            const upd = await this.db.getFirstAsync<{ max_id?: number }>(
                `SELECT MAX(last_remote_update_id) as max_id FROM yjs_note_updates WHERE doc_id = ?`,
                [docId]
            );
            const updCursor = Number(upd?.max_id) || 0;

            return Math.max(snapCursor, updCursor, 0);
        } catch (err) {
            console.warn('[YjsLocalPersistence] Error leyendo last_remote_update_id:', err);
            return 0;
        }
    }

    /**
     * Guarda el último ID de actualización remota de forma duradera en SQLite para esta nota.
     */
    public async setLastRemoteUpdateId(docId: string, maxUpdateId: number): Promise<void> {
        if (!maxUpdateId || maxUpdateId <= 0) return;
        const now = Date.now();
        try {
            await this.db.runAsync(
                `INSERT INTO yjs_note_snapshots (doc_id, snapshot, state_vector, updated_at_ms, last_remote_update_id)
                 VALUES (?, '', '', ?, ?)
                 ON CONFLICT(doc_id) DO UPDATE SET
                    last_remote_update_id = MAX(COALESCE(yjs_note_snapshots.last_remote_update_id, 0), excluded.last_remote_update_id),
                    updated_at_ms = excluded.updated_at_ms`,
                [docId, now, maxUpdateId]
            );
        } catch (err) {
            console.warn('[YjsLocalPersistence] Error guardando last_remote_update_id:', err);
        }
    }

    /**
     * Compacta el historial de deltas en un snapshot unificado.
     * 
     * Regla de seguridad crítica:
     * - Guarda el nuevo snapshot acumulado en `yjs_note_snapshots`.
     * - Elimina ÚNICAMENTE los deltas que ya estaban marcados como `synced = 1`.
     * - Si hay deltas locales pendientes de sincronizar (`synced = 0`), los CONSERVA intactos
     *   en la tabla de updates para que el cliente pueda enviarlos a Supabase tras reconectar.
     */
    public async compact(docId: string, doc: Y.Doc, maxUpdateId?: number): Promise<void> {
        const fullSnapshotBytes = Y.encodeStateAsUpdate(doc);
        const stateVectorBytes = Y.encodeStateVector(doc);
        const base64Snapshot = bytesToBase64(fullSnapshotBytes);
        const base64Sv = bytesToBase64(stateVectorBytes);
        const now = Date.now();
        const maxId = maxUpdateId || 0;

        const executeCompaction = async () => {
            // 1. Guardar o actualizar el snapshot acumulado preservando/actualizando el cursor remoto
            await this.db.runAsync(
                `INSERT INTO yjs_note_snapshots (doc_id, snapshot, state_vector, updated_at_ms, last_remote_update_id)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(doc_id) DO UPDATE SET
                    snapshot = excluded.snapshot,
                    state_vector = excluded.state_vector,
                    updated_at_ms = excluded.updated_at_ms,
                    last_remote_update_id = MAX(COALESCE(yjs_note_snapshots.last_remote_update_id, 0), excluded.last_remote_update_id)`,
                [docId, base64Snapshot, base64Sv, now, maxId]
            );

            // 2. Eliminar deltas ya sincronizados (liberar espacio sin perder deltas pendientes)
            await this.db.runAsync(
                `DELETE FROM yjs_note_updates WHERE doc_id = ? AND synced = 1`,
                [docId]
            );
        };

        if (this.db.withTransactionAsync) {
            await this.db.withTransactionAsync(executeCompaction);
        } else {
            // Fallback para adaptadores sin withTransactionAsync explícito
            await this.db.execAsync('BEGIN TRANSACTION;');
            try {
                await executeCompaction();
                await this.db.execAsync('COMMIT;');
            } catch (err) {
                await this.db.execAsync('ROLLBACK;');
                throw err;
            }
        }
    }
}
