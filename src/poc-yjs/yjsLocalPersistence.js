"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var yjsLocalPersistence_exports = {};
__export(yjsLocalPersistence_exports, {
  YjsLocalPersistence: () => YjsLocalPersistence,
  base64ToBytes: () => base64ToBytes,
  bytesToBase64: () => bytesToBase64
});
module.exports = __toCommonJS(yjsLocalPersistence_exports);
var Y = __toESM(require("yjs"));
function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
function base64ToBytes(base64) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
class YjsLocalPersistence {
  db;
  constructor(db) {
    this.db = db;
  }
  /**
   * Inicializa las tablas e índices en SQLite.
   */
  async initSchema() {
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
  async storeUpdate(docId, updateBytes, synced = false) {
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
  async loadDocument(docId, targetDoc) {
    const doc = targetDoc || new Y.Doc();
    let hasSnapshot = false;
    const snapshotRow = await this.db.getFirstAsync(`SELECT snapshot, state_vector FROM yjs_note_snapshots WHERE doc_id = ?`, [docId]);
    if (snapshotRow && snapshotRow.snapshot) {
      const snapshotBytes = base64ToBytes(snapshotRow.snapshot);
      Y.applyUpdate(doc, snapshotBytes, "sqlite-load");
      hasSnapshot = true;
    }
    const updates = await this.db.getAllAsync(
      `SELECT id, doc_id, update_data, synced, created_at_ms FROM yjs_note_updates WHERE doc_id = ? ORDER BY id ASC`,
      [docId]
    );
    for (const row of updates) {
      const updateBytes = base64ToBytes(row.updateData);
      Y.applyUpdate(doc, updateBytes, "sqlite-load");
    }
    return {
      doc,
      hasSnapshot,
      appliedUpdatesCount: updates.length
    };
  }
  /**
   * Obtiene los deltas locales que aún no han sido confirmados por Supabase.
   */
  async getPendingLocalUpdates(docId) {
    return await this.db.getAllAsync(
      `SELECT id, doc_id, update_data, synced, created_at_ms FROM yjs_note_updates WHERE doc_id = ? AND synced = 0 ORDER BY id ASC`,
      [docId]
    );
  }
  /**
   * Marca un conjunto de IDs de actualización como sincronizados en el servidor.
   */
  async markUpdatesAsSynced(updateIds) {
    if (!updateIds || updateIds.length === 0) return;
    const placeholders = updateIds.map(() => "?").join(",");
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
  async compact(docId, doc) {
    const fullSnapshotBytes = Y.encodeStateAsUpdate(doc);
    const stateVectorBytes = Y.encodeStateVector(doc);
    const base64Snapshot = bytesToBase64(fullSnapshotBytes);
    const base64Sv = bytesToBase64(stateVectorBytes);
    const now = Date.now();
    const executeCompaction = async () => {
      await this.db.runAsync(
        `INSERT INTO yjs_note_snapshots (doc_id, snapshot, state_vector, updated_at_ms)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(doc_id) DO UPDATE SET
                    snapshot = excluded.snapshot,
                    state_vector = excluded.state_vector,
                    updated_at_ms = excluded.updated_at_ms`,
        [docId, base64Snapshot, base64Sv, now]
      );
      await this.db.runAsync(
        `DELETE FROM yjs_note_updates WHERE doc_id = ? AND synced = 1`,
        [docId]
      );
    };
    if (this.db.withTransactionAsync) {
      await this.db.withTransactionAsync(executeCompaction);
    } else {
      await this.db.execAsync("BEGIN TRANSACTION;");
      try {
        await executeCompaction();
        await this.db.execAsync("COMMIT;");
      } catch (err) {
        await this.db.execAsync("ROLLBACK;");
        throw err;
      }
    }
  }
}
