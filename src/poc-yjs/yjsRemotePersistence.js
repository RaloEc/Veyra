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
var yjsRemotePersistence_exports = {};
__export(yjsRemotePersistence_exports, {
  YjsRemotePersistence: () => YjsRemotePersistence,
  computeUpdateHash: () => computeUpdateHash
});
module.exports = __toCommonJS(yjsRemotePersistence_exports);
var Y = __toESM(require("yjs"));
var import_yjsLocalPersistence = require("./yjsLocalPersistence");
async function computeUpdateHash(base64Data) {
  const rawBytes = (0, import_yjsLocalPersistence.base64ToBytes)(base64Data);
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle?.digest) {
    try {
      const buffer = await globalThis.crypto.subtle.digest("SHA-256", rawBytes);
      return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("").toLowerCase();
    } catch (_) {
    }
  }
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    try {
      const req = typeof module !== "undefined" && module.require ? module.require.bind(module) : null;
      const nodeCrypto = req ? req("crypto") : typeof eval !== "undefined" ? eval("require")("crypto") : null;
      if (nodeCrypto && typeof nodeCrypto.createHash === "function") {
        return nodeCrypto.createHash("sha256").update(rawBytes).digest("hex").toLowerCase();
      }
    } catch (_) {
    }
  }
  try {
    const Crypto = require("expo-crypto");
    if (typeof Crypto.digest === "function") {
      const buffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, rawBytes);
      return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("").toLowerCase();
    }
    let binary = "";
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
  } catch (_) {
  }
  throw new Error("Proveedor criptogr\xE1fico SHA-256 no disponible. La actualizaci\xF3n se mantiene en cola local.");
}
class YjsRemotePersistence {
  supabase;
  constructor(supabase) {
    this.supabase = supabase;
  }
  /**
   * Guarda un delta en PostgreSQL mediante la RPC atómica con validación criptográfica en el servidor.
   */
  async saveRemoteUpdate(noteId, updateBase64, clientId) {
    try {
      if (!noteId || noteId.trim() === "") {
        return { success: false, error: "noteId no puede ser vac\xEDo" };
      }
      if (!updateBase64 || updateBase64.trim() === "") {
        return { success: false, error: "updateBase64 no puede ser vac\xEDo" };
      }
      const updateHash = await computeUpdateHash(updateBase64);
      console.log(`[PoC Yjs RPC] Invocando append_note_yjs_update (nota=${noteId.trim()}, hash=${updateHash.substring(0, 8)}...)`);
      const { data, error } = await this.supabase.rpc("append_note_yjs_update", {
        p_note_id: noteId.trim(),
        p_client_id: clientId,
        p_update_data: updateBase64,
        p_update_hash: updateHash
      });
      if (error) {
        console.warn(`[PoC Yjs RPC] Error en append_note_yjs_update: ${error.message} (c\xF3digo: ${error.code})`);
        const isUnauthorized = error.code === "42501" || error.message?.toLowerCase().includes("permiso denegado") || error.message?.toLowerCase().includes("violates row-level security");
        return {
          success: false,
          unauthorized: isUnauthorized,
          error: error.message
        };
      }
      console.log(`[PoC Yjs RPC] Confirmado por PostgreSQL: success=${Boolean(data?.success)}, update_id=${data?.update_id}, duplicate=${Boolean(data?.duplicate)}`);
      return {
        success: Boolean(data?.success),
        updateId: data?.update_id ? Number(data.update_id) : void 0,
        duplicate: Boolean(data?.duplicate)
      };
    } catch (err) {
      console.warn(`[PoC Yjs RPC] Excepci\xF3n invocando append_note_yjs_update: ${err.message}`);
      return {
        success: false,
        error: err.message || "Error invocando append_note_yjs_update"
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
  async fetchDocument(noteId, targetDoc, maxRetries = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const tempDoc = new Y.Doc();
        let hasSnapshot = false;
        let snapshotClock = 0;
        let maxUpdateId = 0;
        let appliedUpdatesCount = 0;
        const { data: snapshotT0, error: sErr } = await this.supabase.from("note_yjs_snapshots").select("snapshot, server_clock, updated_at").eq("note_id", noteId).maybeSingle();
        if (sErr) {
          throw new Error(`Error consultando snapshot inicial: ${sErr.message}`);
        }
        if (snapshotT0 && snapshotT0.snapshot) {
          try {
            const snapshotBytes = (0, import_yjsLocalPersistence.base64ToBytes)(snapshotT0.snapshot);
            Y.applyUpdate(tempDoc, snapshotBytes, "remote-snapshot-cache");
            hasSnapshot = true;
            snapshotClock = Number(snapshotT0.server_clock) || 0;
          } catch (decErr) {
            throw new Error(`Snapshot malformado o corrupto en base de datos: ${decErr.message}`);
          }
        }
        const PAGE_SIZE = 500;
        let cursorId = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: updatesData, error: uErr } = await this.supabase.from("note_yjs_updates").select("id, update_data, created_at").eq("note_id", noteId).gt("id", cursorId).order("id", { ascending: true }).limit(PAGE_SIZE);
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
              const updateBytes = (0, import_yjsLocalPersistence.base64ToBytes)(row.update_data);
              Y.applyUpdate(tempDoc, updateBytes, "remote-replay-load");
              appliedUpdatesCount++;
              const rowId = Number(row.id);
              if (rowId > maxUpdateId) maxUpdateId = rowId;
              cursorId = rowId;
            } catch (applyErr) {
              throw new Error(`Delta ${row.id} malformado o corrupto: ${applyErr.message}`);
            }
          }
          if (updatesData.length < PAGE_SIZE) {
            hasMore = false;
          }
        }
        const { data: snapshotT1, error: verifyErr } = await this.supabase.from("note_yjs_snapshots").select("server_clock, updated_at").eq("note_id", noteId).maybeSingle();
        if (verifyErr) {
          throw new Error(`Error verificando consistencia de snapshot: ${verifyErr.message}`);
        }
        const t0HasSnapshot = hasSnapshot;
        const t1HasSnapshot = Boolean(snapshotT1 && snapshotT1.server_clock !== void 0 && snapshotT1.server_clock !== null);
        if (t0HasSnapshot !== t1HasSnapshot) {
          console.warn(`[PoC Yjs] Inconsistencia detectada en fetchDocument (existencia de snapshot cambi\xF3 de ${t0HasSnapshot} a ${t1HasSnapshot}). Reintentando (${attempt + 1}/${maxRetries})...`);
          continue;
        }
        if (t0HasSnapshot && t1HasSnapshot) {
          const postFetchClock = Number(snapshotT1.server_clock) || 0;
          const postFetchUpdatedAt = snapshotT1.updated_at || "";
          const initialUpdatedAt = snapshotT0?.updated_at || "";
          if (postFetchClock !== snapshotClock || postFetchUpdatedAt !== initialUpdatedAt) {
            console.warn(`[PoC Yjs] Inconsistencia detectada en fetchDocument (snapshot modificado en carrera: reloj ${snapshotClock} -> ${postFetchClock}). Reintentando (${attempt + 1}/${maxRetries})...`);
            continue;
          }
        }
        if (targetDoc) {
          const fullState = Y.encodeStateAsUpdate(tempDoc);
          Y.applyUpdate(targetDoc, fullState, "remote-reconciled");
        }
        return {
          doc: targetDoc || tempDoc,
          hasSnapshot,
          snapshotClock,
          maxUpdateId,
          appliedUpdatesCount
        };
      } catch (err) {
        lastError = err;
        console.warn(`[PoC Yjs] Intento ${attempt + 1} de fetchDocument fall\xF3: ${err.message}`);
      }
    }
    throw lastError || new Error(`No fue posible completar una lectura remota consistente tras ${maxRetries} intentos.`);
  }
  /**
   * Consulta deltas remotos posteriores a un cursor secuencial de forma paginada.
   */
  async fetchUpdatesSince(noteId, sinceUpdateId) {
    let maxUpdateId = sinceUpdateId;
    const updates = [];
    const PAGE_SIZE = 500;
    let cursorId = sinceUpdateId;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await this.supabase.from("note_yjs_updates").select("id, note_id, client_id, user_id, update_data, update_hash, created_at").eq("note_id", noteId).gt("id", cursorId).order("id", { ascending: true }).limit(PAGE_SIZE);
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
          created_at: row.created_at
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
  async compactRemoteSnapshot(_noteId, _doc, _upToUpdateId) {
    return {
      success: false,
      serverClock: 0,
      deletedUpdates: 0,
      historicalPreserved: true,
      error: "Compactaci\xF3n remota deshabilitada en Fase B.4: el log de deltas es la \xFAnica fuente de verdad autoritativa"
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  YjsRemotePersistence,
  computeUpdateHash
});
