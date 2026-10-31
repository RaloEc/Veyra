import * as SQLite from 'expo-sqlite';
import { diagLog } from '../poc-yjs/diagLog';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let dbInitPromise: Promise<void> | null = null;
let txQueue: Promise<any> = Promise.resolve();

const TARGET_DB_VERSION = 4;

/**
 * Serializa transacciones SQLite para evitar que múltiples tareas en segundo plano
 * (ej. SyncService, SearchService.rebuildIndex, syncYjsNotesPreview) colisionen en
 * db.withTransactionAsync simultáneamente.
 */
export const withSerializedTransaction = async <T>(
  db: SQLite.SQLiteDatabase,
  task: () => Promise<T>
): Promise<T> => {
  let result!: T;
  const next = txQueue.then(async () => {
    await db.withTransactionAsync(async () => {
      result = await task();
    });
    return result;
  });
  txQueue = next.catch(() => {});
  return next;
};

interface DBHolder {
  current: SQLite.SQLiteDatabase;
}

let activeHolder: DBHolder | null = null;
let proxyInstance: SQLite.SQLiteDatabase | null = null;

const isNativeReleasedError = (err: any): boolean => {
  const msg = err?.message || String(err || '');
  return (
    msg.includes('released') ||
    msg.includes('NativeStatement') ||
    msg.includes('NativeDatabase') ||
    msg.includes('already closed') ||
    msg.includes('cannot be cast')
  );
};

const openFreshRawDB = async (holder?: DBHolder): Promise<SQLite.SQLiteDatabase> => {
  const rawDb = await SQLite.openDatabaseAsync('reminders.db');
  await rawDb.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
  `);
  if (holder) {
    holder.current = rawDb;
  }
  return rawDb;
};

const createResilientDBProxy = (holder: DBHolder): SQLite.SQLiteDatabase => {
  return new Proxy(holder.current, {
    get(_, prop) {
      const activeDb = holder.current;
      const orig = (activeDb as any)[prop];
      if (typeof orig === 'function') {
        return async (...args: any[]) => {
          try {
            return await orig.apply(holder.current, args);
          } catch (err: any) {
            if (isNativeReleasedError(err)) {
              console.warn('[DB] Handle nativo liberado o desincronizado, recuperando conexión fresca...');
              try {
                if (holder.current) {
                  holder.current.closeAsync().catch(() => {});
                }
              } catch {}
              dbPromise = null;
              dbInitPromise = null;
              await openFreshRawDB(holder);
              activeHolder = holder;
              const freshMethod = (holder.current as any)[prop];
              if (typeof freshMethod === 'function') {
                return await freshMethod.apply(holder.current, args);
              }
            }
            throw err;
          }
        };
      }
      return orig;
    },
  });
};

export const resetDB = () => {
  try {
    if (activeHolder?.current) {
      activeHolder.current.closeAsync().catch(() => {});
    }
  } catch {}
  activeHolder = null;
  proxyInstance = null;
  dbPromise = null;
  dbInitPromise = null;
};

export const getDB = async (forceReconnect = false): Promise<SQLite.SQLiteDatabase> => {
  if (forceReconnect) {
    resetDB();
  }
  if (proxyInstance && activeHolder?.current) return proxyInstance;
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const rawDb = await openFreshRawDB();
        activeHolder = { current: rawDb };
        proxyInstance = createResilientDBProxy(activeHolder);
        return proxyInstance;
      } catch (err) {
        activeHolder = null;
        proxyInstance = null;
        dbPromise = null;
        throw err;
      }
    })();
  }
  return dbPromise;
};

/**
 * Ejecuta una operación de base de datos con recuperación automática
 * si el objeto nativo compartido fue liberado por el sistema o Fast Refresh.
 */
export const withDB = async <T>(operation: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> => {
  try {
    const db = await getDB();
    return await operation(db);
  } catch (err: any) {
    if (isNativeReleasedError(err)) {
      console.warn('[DB] Handle nativo liberado o desincronizado, recuperando conexión fresca...');
      resetDB();
      const freshDb = await getDB(true);
      return await operation(freshDb);
    }
    throw err;
  }
};

/**
 * Migración explícita e idempotente para la columna sync_mode en la tabla notes.
 * Consulta PRAGMA table_info(notes) para verificar existencia previa y propaga errores reales.
 */
export async function migrateNotesSyncMode(db: SQLite.SQLiteDatabase): Promise<{ applied: boolean; columnExists: boolean }> {
  // 1. Consultar esquema actual de la tabla notes mediante PRAGMA
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(notes);');
  const hasSyncMode = Array.isArray(columns) && columns.some(col => col.name === 'sync_mode');

  let applied = false;
  if (!hasSyncMode) {
    // 2. Ejecutar ALTER TABLE únicamente si falta la columna
    await db.execAsync("ALTER TABLE notes ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'rest';");
    applied = true;

    // 3. Comprobar formalmente el resultado de la migración
    const verifyColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(notes);');
    const verified = Array.isArray(verifyColumns) && verifyColumns.some(col => col.name === 'sync_mode');
    if (!verified) {
      throw new Error("Fallo en la migración SQLite: la columna 'sync_mode' no se creó tras ejecutar ALTER TABLE.");
    }
  }

  // 4. Asegurar que ninguna nota existente tenga sync_mode nulo o vacío
  await db.runAsync(
    `UPDATE notes SET sync_mode = 'rest' WHERE sync_mode IS NULL OR sync_mode = ''`
  );

  // 5. Crear índice para optimizar consultas de sincronización
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_notes_sync_mode ON notes (sync_mode);');

  return { applied, columnExists: true };
}

/**
 * Inicialización idempotente de las tablas e índices de persistencia local Yjs (Fase 3.2).
 * Reutiliza exactamente el esquema definido en YjsLocalPersistence.initSchema().
 */
export async function initYjsPersistenceSchema(db: SQLite.SQLiteDatabase | { execAsync: (sql: string) => Promise<any> }): Promise<void> {
  await db.execAsync(`
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

    CREATE INDEX IF NOT EXISTS idx_yjs_updates_doc ON yjs_note_updates (doc_id, synced);
  `);

  try {
    await db.execAsync('ALTER TABLE yjs_note_snapshots ADD COLUMN last_remote_update_id INTEGER DEFAULT 0;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE yjs_note_updates ADD COLUMN last_remote_update_id INTEGER DEFAULT 0;');
  } catch (e) { }
}

export interface YjsPersistenceVerificationResult {
  ready: boolean;
  error?: string;
  details?: {
    snapshotsTableOk: boolean;
    updatesTableOk: boolean;
    indexOk: boolean;
  };
}

/**
 * Inspección profunda de integridad para el subsistema de persistencia Yjs en SQLite.
 * Verifica no solo los nombres de las tablas, sino las columnas, tipos, claves primarias
 * e índices requeridos en la instancia específica de la base de datos.
 */
export async function verifyYjsPersistenceSchema(
  db: SQLite.SQLiteDatabase | { getAllAsync: <T = any>(sql: string, params?: any[]) => Promise<T[]> }
): Promise<YjsPersistenceVerificationResult> {
  try {
    // 1. Validar columnas exactas de yjs_note_snapshots
    const snapshotCols = await db.getAllAsync<{ name: string; type: string; pk: number }>(
      'PRAGMA table_info(yjs_note_snapshots);'
    );
    const snapMap = new Map((snapshotCols || []).map(c => [c.name, c]));
    const snapshotsTableOk =
      snapMap.has('doc_id') && snapMap.get('doc_id')?.pk === 1 &&
      snapMap.has('snapshot') &&
      snapMap.has('state_vector') &&
      snapMap.has('updated_at_ms');

    // 2. Validar columnas exactas de yjs_note_updates
    const updateCols = await db.getAllAsync<{ name: string; type: string; pk: number }>(
      'PRAGMA table_info(yjs_note_updates);'
    );
    const updMap = new Map((updateCols || []).map(c => [c.name, c]));
    const updatesTableOk =
      updMap.has('id') && updMap.get('id')?.pk === 1 &&
      updMap.has('doc_id') &&
      updMap.has('update_data') &&
      updMap.has('synced') &&
      updMap.has('created_at_ms');

    // 3. Validar existencia del índice idx_yjs_updates_doc
    const indices = await db.getAllAsync<{ name: string }>(
      'PRAGMA index_list(yjs_note_updates);'
    );
    const indexOk = Array.isArray(indices) && indices.some(idx => idx.name === 'idx_yjs_updates_doc');

    const ready = Boolean(snapshotsTableOk && updatesTableOk && indexOk);
    return {
      ready,
      error: ready ? undefined : 'Esquema de persistencia colaborativa SQLite incompleto o corrupto',
      details: {
        snapshotsTableOk: Boolean(snapshotsTableOk),
        updatesTableOk: Boolean(updatesTableOk),
        indexOk: Boolean(indexOk),
      },
    };
  } catch (err: any) {
    return {
      ready: false,
      error: err?.message || 'Error consultando PRAGMA de SQLite',
      details: {
        snapshotsTableOk: false,
        updatesTableOk: false,
        indexOk: false,
      },
    };
  }
}

/**
 * Garantiza que la persistencia Yjs esté verificada y lista en la instancia dada.
 * Si no está lista, intenta una inicialización reactiva antes de emitir veredicto final.
 */
export async function ensureYjsPersistenceReady(
  db: SQLite.SQLiteDatabase | { getAllAsync: <T = any>(sql: string, params?: any[]) => Promise<T[]>; execAsync: (sql: string) => Promise<any> }
): Promise<YjsPersistenceVerificationResult> {
  const initialCheck = await verifyYjsPersistenceSchema(db);
  if (initialCheck.ready) {
    return initialCheck;
  }

  // Si no está lista, intentar inicialización reactiva
  try {
    await initYjsPersistenceSchema(db);
  } catch (e) {
    // ignorar fallo de creación para evaluar resultado final
  }

  return await verifyYjsPersistenceSchema(db);
}

export const initDatabase = async (force = false): Promise<void> => {
  if (force) {
    dbInitPromise = null;
  }
  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = (async () => {
    console.log('Starting database initialization...');
    const db = await getDB();

    // 1. Crear todas las tablas de forma atómica en una sola llamada puente
    await db.execAsync(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT,
        created_at INTEGER,
        last_modified_ms INTEGER,
        is_premium INTEGER DEFAULT 0,
        revenuecat_id TEXT
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        due_date_ms INTEGER NOT NULL,
        snooze_until_ms INTEGER,
        repeat_rule TEXT,
        control_level TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        next_attempt_ms INTEGER,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        last_modified_ms INTEGER,
        deleted INTEGER DEFAULT 0,
        deleted_at_ms INTEGER,
        notification_ids TEXT,
        attachments TEXT,
        links TEXT,
        subtasks TEXT,
        is_shared INTEGER DEFAULT 0,
        shared_owner_id TEXT,
        event_id TEXT,
        offset_minutes INTEGER
      );

      CREATE TABLE IF NOT EXISTS compliance_events (
        id TEXT PRIMARY KEY,
        reminder_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY(reminder_id) REFERENCES reminders(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS notification_attempts (
        id TEXT PRIMARY KEY,
        reminder_id TEXT NOT NULL,
        attempt_time_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY(reminder_id) REFERENCES reminders(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        parent_id TEXT,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        is_pinned INTEGER DEFAULT 0,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        last_modified_ms INTEGER,
        deleted INTEGER DEFAULT 0,
        is_shared INTEGER DEFAULT 0,
        shared_owner_id TEXT
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        folder_id TEXT,
        event_id TEXT,
        title TEXT,
        content TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        is_pinned INTEGER DEFAULT 0,
        attachments TEXT,
        links TEXT,
        deleted INTEGER DEFAULT 0,
        last_modified_ms INTEGER,
        font_family TEXT,
        is_shared INTEGER DEFAULT 0,
        shared_owner_id TEXT,
        is_revoked INTEGER DEFAULT 0,
        collab_role TEXT DEFAULT 'editor',
        sync_mode TEXT NOT NULL DEFAULT 'rest',
        preview_text TEXT,
        cached_html TEXT,
        last_opened_ms INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        start_time_ms INTEGER NOT NULL,
        end_time_ms INTEGER NOT NULL,
        repeat_rule TEXT,
        location TEXT,
        color TEXT,
        notification_offset_min INTEGER DEFAULT 15,
        notification_offsets TEXT,
        notification_ids TEXT,
        note_id TEXT,
        folder_id TEXT,
        tags TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        last_modified_ms INTEGER,
        deleted INTEGER DEFAULT 0,
        is_shared INTEGER DEFAULT 0,
        shared_owner_id TEXT,
        is_all_day INTEGER NOT NULL DEFAULT 0,
        all_day_date TEXT,
        timezone TEXT,
        recurrence_rule TEXT,
        recurrence_parent_id TEXT,
        is_birthday_like INTEGER NOT NULL DEFAULT 0,
        category_id TEXT
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        color TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS item_tags (
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (item_type, item_id, tag_id),
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS search_index (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        keywords TEXT,
        parent_id TEXT,
        extra_meta TEXT,
        updated_at_ms INTEGER NOT NULL,
        deleted INTEGER DEFAULT 0,
        PRIMARY KEY (entity_type, entity_id)
      );

      CREATE TABLE IF NOT EXISTS pending_image_uploads (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        local_uri TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

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
    `);

    // 2. Comprobar versión de esquema para ejecutar ALTER TABLE y migraciones de datos solo una vez
    let currentVersion = 0;
    try {
      const verRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      currentVersion = verRow?.user_version ?? 0;
    } catch {}

    if (force || currentVersion < TARGET_DB_VERSION) {
      const alterStatements = [
        'ALTER TABLE reminders ADD COLUMN notification_ids TEXT;',
        'ALTER TABLE reminders ADD COLUMN attachments TEXT;',
        'ALTER TABLE reminders ADD COLUMN links TEXT;',
        'ALTER TABLE reminders ADD COLUMN subtasks TEXT;',
        'ALTER TABLE reminders ADD COLUMN is_shared INTEGER DEFAULT 0;',
        'ALTER TABLE reminders ADD COLUMN shared_owner_id TEXT;',
        'ALTER TABLE reminders ADD COLUMN event_id TEXT;',
        'ALTER TABLE reminders ADD COLUMN offset_minutes INTEGER;',
        'ALTER TABLE folders ADD COLUMN is_pinned INTEGER DEFAULT 0;',
        'ALTER TABLE folders ADD COLUMN parent_id TEXT;',
        'ALTER TABLE folders ADD COLUMN is_shared INTEGER DEFAULT 0;',
        'ALTER TABLE folders ADD COLUMN shared_owner_id TEXT;',
        'ALTER TABLE notes ADD COLUMN user_id TEXT;',
        'ALTER TABLE notes ADD COLUMN last_modified_ms INTEGER;',
        'ALTER TABLE notes ADD COLUMN folder_id TEXT;',
        'ALTER TABLE notes ADD COLUMN event_id TEXT;',
        'ALTER TABLE notes ADD COLUMN is_shared INTEGER DEFAULT 0;',
        'ALTER TABLE notes ADD COLUMN shared_owner_id TEXT;',
        'ALTER TABLE notes ADD COLUMN font_family TEXT;',
        'ALTER TABLE notes ADD COLUMN is_revoked INTEGER DEFAULT 0;',
        'ALTER TABLE notes ADD COLUMN collab_role TEXT DEFAULT "editor";',
        'ALTER TABLE notes ADD COLUMN preview_text TEXT;',
        'ALTER TABLE notes ADD COLUMN last_opened_ms INTEGER DEFAULT 0;',
        'ALTER TABLE notes ADD COLUMN cached_html TEXT;',
        'ALTER TABLE events ADD COLUMN notification_offsets TEXT;',
        'ALTER TABLE events ADD COLUMN is_shared INTEGER DEFAULT 0;',
        'ALTER TABLE events ADD COLUMN shared_owner_id TEXT;',
        'ALTER TABLE events ADD COLUMN tags TEXT;',
        'ALTER TABLE events ADD COLUMN is_all_day INTEGER NOT NULL DEFAULT 0;',
        'ALTER TABLE events ADD COLUMN all_day_date TEXT;',
        'ALTER TABLE events ADD COLUMN timezone TEXT;',
        'ALTER TABLE events ADD COLUMN recurrence_rule TEXT;',
        'ALTER TABLE events ADD COLUMN recurrence_parent_id TEXT;',
        'ALTER TABLE events ADD COLUMN is_birthday_like INTEGER NOT NULL DEFAULT 0;',
        'ALTER TABLE events ADD COLUMN category_id TEXT;',
        'ALTER TABLE events ADD COLUMN folder_id TEXT;',
        'ALTER TABLE yjs_note_snapshots ADD COLUMN last_remote_update_id INTEGER DEFAULT 0;',
        'ALTER TABLE yjs_note_updates ADD COLUMN last_remote_update_id INTEGER DEFAULT 0;',
      ];

      for (const stmt of alterStatements) {
        try {
          await db.execAsync(stmt);
        } catch {}
      }

      // Migración explícita e idempotente de sync_mode mediante PRAGMA table_info
      await migrateNotesSyncMode(db);

      // Migraciones de datos puntuales en un solo bloque
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        await db.runAsync(`UPDATE events SET timezone = ? WHERE timezone IS NULL OR timezone = ''`, [tz]);
      } catch {}

      try {
        await db.execAsync(`
          UPDATE notes SET last_modified_ms = updated_at_ms WHERE last_modified_ms IS NULL;
          UPDATE notes SET last_opened_ms = updated_at_ms WHERE (last_opened_ms IS NULL OR last_opened_ms = 0) AND updated_at_ms > 0;
          UPDATE notes SET created_at_ms = updated_at_ms WHERE (created_at_ms IS NULL OR created_at_ms = 0) AND updated_at_ms > 0;
          UPDATE notes SET updated_at_ms = created_at_ms WHERE (updated_at_ms IS NULL OR updated_at_ms = 0) AND created_at_ms > 0;
          UPDATE events SET user_id = shared_owner_id WHERE is_shared = 1 AND shared_owner_id IS NOT NULL AND user_id != shared_owner_id;
          UPDATE notes SET user_id = shared_owner_id WHERE is_shared = 1 AND shared_owner_id IS NOT NULL AND user_id != shared_owner_id;
          UPDATE reminders SET user_id = shared_owner_id WHERE is_shared = 1 AND shared_owner_id IS NOT NULL AND user_id != shared_owner_id;
          UPDATE folders SET user_id = shared_owner_id WHERE is_shared = 1 AND shared_owner_id IS NOT NULL AND user_id != shared_owner_id;
        `);
      } catch {}

      // Verificación de esquema para diagnóstico remoto de columnas en notes (preview_text)
      try {
        const notesCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(notes);');
        const colNames = Array.isArray(notesCols) ? notesCols.map(c => c.name) : [];
        const hasPreviewText = colNames.includes('preview_text');
        if (!hasPreviewText) {
          diagLog('schema_check', { hasPreviewText: false, notesTableColumns: colNames });
        }
      } catch (schemaErr) {
        console.warn('[DB] Error verificando PRAGMA table_info(notes):', schemaErr);
      }

      try {
        await db.execAsync(`PRAGMA user_version = ${TARGET_DB_VERSION};`);
      } catch {}
    }

    // 3. Crear todos los índices en un único bloque idempotente
    try {
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders (status);
        CREATE INDEX IF NOT EXISTS idx_reminders_next_attempt ON reminders (next_attempt_ms);
        CREATE INDEX IF NOT EXISTS idx_reminders_last_modified ON reminders (last_modified_ms);
        CREATE INDEX IF NOT EXISTS idx_reminders_event_id ON reminders (event_id);
        CREATE INDEX IF NOT EXISTS idx_reminders_due_date ON reminders (due_date_ms);
        CREATE INDEX IF NOT EXISTS idx_reminders_deleted ON reminders (deleted);
        CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders (user_id);
        CREATE INDEX IF NOT EXISTS idx_reminders_status_due ON reminders (status, due_date_ms);

        CREATE INDEX IF NOT EXISTS idx_folders_updated_at ON folders (updated_at_ms);
        CREATE INDEX IF NOT EXISTS idx_folders_last_modified ON folders (last_modified_ms);
        CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders (parent_id);
        CREATE INDEX IF NOT EXISTS idx_folders_deleted ON folders (deleted);

        CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at_ms);
        CREATE INDEX IF NOT EXISTS idx_notes_last_modified ON notes (last_modified_ms);
        CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes (folder_id);
        CREATE INDEX IF NOT EXISTS idx_notes_event_id ON notes (event_id);
        CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes (deleted);
        CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes (user_id);
        CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes (is_pinned);
        CREATE INDEX IF NOT EXISTS idx_notes_last_opened ON notes (last_opened_ms);
        CREATE INDEX IF NOT EXISTS idx_notes_sync_mode ON notes (sync_mode);

        CREATE INDEX IF NOT EXISTS idx_events_start_time ON events (start_time_ms);
        CREATE INDEX IF NOT EXISTS idx_events_end_time ON events (end_time_ms);
        CREATE INDEX IF NOT EXISTS idx_events_deleted ON events (deleted);
        CREATE INDEX IF NOT EXISTS idx_events_note_id ON events (note_id);
        CREATE INDEX IF NOT EXISTS idx_events_folder_id ON events (folder_id);
        CREATE INDEX IF NOT EXISTS idx_events_user_id ON events (user_id);
        CREATE INDEX IF NOT EXISTS idx_events_is_all_day ON events (is_all_day);
        CREATE INDEX IF NOT EXISTS idx_events_all_day_date ON events (all_day_date);

        CREATE INDEX IF NOT EXISTS idx_item_tags_item ON item_tags(item_type, item_id);
        CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);

        CREATE INDEX IF NOT EXISTS idx_search_title ON search_index (title);
        CREATE INDEX IF NOT EXISTS idx_search_deleted ON search_index (deleted);
        CREATE INDEX IF NOT EXISTS idx_search_type ON search_index (entity_type);

        CREATE INDEX IF NOT EXISTS idx_pending_images_note_id ON pending_image_uploads (note_id);
        CREATE INDEX IF NOT EXISTS idx_yjs_updates_doc ON yjs_note_updates (doc_id, synced);
      `);
    } catch (err) {
      console.warn('[DB] Non-critical index creation warning:', err);
    }

    console.log('Database initialized successfully');
  })();

  try {
    await dbInitPromise;
  } catch (err) {
    dbInitPromise = null;
    throw err;
  }
};

export interface PendingImageUpload {
  id: string;
  note_id: string;
  local_uri: string;
  created_at_ms: number;
}
