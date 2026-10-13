import * as Y from 'yjs';

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
                updated_at_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS yjs_note_updates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doc_id TEXT NOT NULL,
                update_data TEXT NOT NULL,
                synced INTEGER DEFAULT 0,
                created_at_ms INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_yjs_updates_doc ON yjs_note_updates(doc_id, synced);
        `);
    }

    /**
     * Guarda un delta incremental en SQLite.
     */
    public async storeUpdate(
        docId: string,
        updateBytes: Uint8Array,
        synced: boolean = false
    ): Promise<number> {
        const base64Data = bytesToBase64(updateBytes);
        const now = Date.now();
        const syncedVal = synced ? 1 : 0;

        const res = await this.db.runAsync(
            `INSERT INTO yjs_note_updates (doc_id, update_data, synced, created_at_ms) VALUES (?, ?, ?, ?)`,
            [docId, base64Data, syncedVal, now]
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

        // 1. Cargar snapshot base si existe
        const snapshotRow = await this.db.getFirstAsync<{
            doc_id: string;
            snapshot: string;
            state_vector: string;
        }>(`SELECT snapshot, state_vector FROM yjs_note_snapshots WHERE doc_id = ?`, [docId]);

        if (snapshotRow && snapshotRow.snapshot) {
            const snapshotBytes = base64ToBytes(snapshotRow.snapshot);
            Y.applyUpdate(doc, snapshotBytes, 'sqlite-load');
            hasSnapshot = true;
        }

        // 2. Replay de todas las actualizaciones incrementales posteriores en orden estricto
        const updates = await this.db.getAllAsync<StoredUpdate>(
            `SELECT id, doc_id, update_data, synced, created_at_ms FROM yjs_note_updates WHERE doc_id = ? ORDER BY id ASC`,
            [docId]
        );

        for (const row of updates) {
            const updateBytes = base64ToBytes(row.updateData);
            Y.applyUpdate(doc, updateBytes, 'sqlite-load');
        }

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
        return await this.db.getAllAsync<StoredUpdate>(
            `SELECT id, doc_id, update_data, synced, created_at_ms FROM yjs_note_updates WHERE doc_id = ? AND synced = 0 ORDER BY id ASC`,
            [docId]
        );
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
     * Compacta el historial de deltas en un snapshot unificado.
     * 
     * Regla de seguridad crítica:
     * - Guarda el nuevo snapshot acumulado en `yjs_note_snapshots`.
     * - Elimina ÚNICAMENTE los deltas que ya estaban marcados como `synced = 1`.
     * - Si hay deltas locales pendientes de sincronizar (`synced = 0`), los CONSERVA intactos
     *   en la tabla de updates para que el cliente pueda enviarlos a Supabase tras reconectar.
     */
    public async compact(docId: string, doc: Y.Doc): Promise<void> {
        const fullSnapshotBytes = Y.encodeStateAsUpdate(doc);
        const stateVectorBytes = Y.encodeStateVector(doc);
        const base64Snapshot = bytesToBase64(fullSnapshotBytes);
        const base64Sv = bytesToBase64(stateVectorBytes);
        const now = Date.now();

        const executeCompaction = async () => {
            // 1. Guardar o actualizar el snapshot acumulado
            await this.db.runAsync(
                `INSERT INTO yjs_note_snapshots (doc_id, snapshot, state_vector, updated_at_ms)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(doc_id) DO UPDATE SET
                    snapshot = excluded.snapshot,
                    state_vector = excluded.state_vector,
                    updated_at_ms = excluded.updated_at_ms`,
                [docId, base64Snapshot, base64Sv, now]
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
