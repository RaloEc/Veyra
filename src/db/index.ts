import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const resetDB = () => {
  try {
    if (dbInstance) {
      dbInstance.closeAsync().catch(() => {});
    }
  } catch {}
  dbInstance = null;
  dbPromise = null;
};

export const getDB = async (forceReconnect = false): Promise<SQLite.SQLiteDatabase> => {
  if (forceReconnect) {
    resetDB();
  }
  if (dbInstance) return dbInstance;
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const db = await SQLite.openDatabaseAsync('reminders.db');
        // Enable WAL (Write-Ahead Logging) mode and busy timeout to allow concurrent read/write and prevent database locked errors
        await db.execAsync(`
          PRAGMA journal_mode = WAL;
          PRAGMA busy_timeout = 5000;
        `);
        dbInstance = db;
        return db;
      } catch (err) {
        dbInstance = null;
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
    const isReleasedError =
      err?.message?.includes('released') ||
      err?.message?.includes('NativeStatement') ||
      err?.message?.includes('already closed') ||
      err?.message?.includes('cannot be cast');

    if (isReleasedError) {
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
export async function migrateNotesSyncMode(db: {
  getAllAsync: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
  execAsync: (sql: string) => Promise<any>;
  runAsync: (sql: string, params?: any[]) => Promise<any>;
}): Promise<{ applied: boolean; columnExists: boolean }> {
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

export const initDatabase = async () => {
  console.log('Starting database initialization...');
  const db = await getDB();

  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON;');
  console.log('Foreign keys enabled');

  // Users Table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      created_at INTEGER,
      last_modified_ms INTEGER,
      is_premium INTEGER DEFAULT 0,
      revenuecat_id TEXT
    );
  `);
  console.log('Users table checked');

  // Reminders Table
  await db.execAsync(`
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
      subtasks TEXT
    );
  `);
  console.log('Reminders table checked');

  // Indices for Reminders
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders (status);
    CREATE INDEX IF NOT EXISTS idx_reminders_next_attempt ON reminders (next_attempt_ms);
    CREATE INDEX IF NOT EXISTS idx_reminders_last_modified ON reminders (last_modified_ms);
  `);
  console.log('Indices created');

  try {
    await db.execAsync('ALTER TABLE reminders ADD COLUMN notification_ids TEXT;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE reminders ADD COLUMN attachments TEXT;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE reminders ADD COLUMN links TEXT;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE reminders ADD COLUMN subtasks TEXT;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE reminders ADD COLUMN is_shared INTEGER DEFAULT 0;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE reminders ADD COLUMN shared_owner_id TEXT;');
  } catch (e) { }

  // Compliance Events & Notification Attempts
  await db.execAsync(`
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
  `);
  console.log('Compliance tables checked');

  // Folders Table
  await db.execAsync(`
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
      deleted INTEGER DEFAULT 0
    );
  `);
  console.log('Folders table checked');

  // Migrations for folders
  try {
    await db.execAsync('ALTER TABLE folders ADD COLUMN is_pinned INTEGER DEFAULT 0;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE folders ADD COLUMN parent_id TEXT;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE folders ADD COLUMN is_shared INTEGER DEFAULT 0;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE folders ADD COLUMN shared_owner_id TEXT;');
  } catch (e) { }

  // Notes Table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      folder_id TEXT,
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
      sync_mode TEXT NOT NULL DEFAULT 'rest'
    );
  `);
  console.log('Notes table checked');

  // Migrations for notes (add columns if they don't exist)
  try {
    await db.execAsync('ALTER TABLE notes ADD COLUMN user_id TEXT;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE notes ADD COLUMN last_modified_ms INTEGER;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE notes ADD COLUMN folder_id TEXT;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE notes ADD COLUMN event_id TEXT;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE notes ADD COLUMN is_shared INTEGER DEFAULT 0;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE notes ADD COLUMN shared_owner_id TEXT;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE notes ADD COLUMN font_family TEXT;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE notes ADD COLUMN is_revoked INTEGER DEFAULT 0;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE notes ADD COLUMN collab_role TEXT DEFAULT "editor";');
  } catch (e) { }

  // Migración explícita e idempotente de sync_mode mediante PRAGMA table_info
  await migrateNotesSyncMode(db);

  // Set last_modified_ms for existing notes that don't have it
  await db.runAsync(
    `UPDATE notes SET last_modified_ms = updated_at_ms WHERE last_modified_ms IS NULL`
  );
  // Asegurar que created_at_ms y updated_at_ms nunca sean nulos ni 0
  await db.runAsync(
    `UPDATE notes SET created_at_ms = updated_at_ms WHERE (created_at_ms IS NULL OR created_at_ms = 0) AND updated_at_ms > 0`
  );
  await db.runAsync(
    `UPDATE notes SET updated_at_ms = created_at_ms WHERE (updated_at_ms IS NULL OR updated_at_ms = 0) AND created_at_ms > 0`
  );

  // Events Table
  await db.execAsync(`
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
      tags TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      last_modified_ms INTEGER,
      deleted INTEGER DEFAULT 0
    );
  `);
  console.log('Events table checked');

  // Migrations for events
  try {
    await db.execAsync('ALTER TABLE events ADD COLUMN notification_offsets TEXT;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE events ADD COLUMN is_shared INTEGER DEFAULT 0;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE events ADD COLUMN shared_owner_id TEXT;');
  } catch (e) { }
  try {
    await db.execAsync('ALTER TABLE events ADD COLUMN tags TEXT;');
  } catch (e) { }

  // Reparación automática de ownership en recursos compartidos
  try {
    await db.execAsync(`
      UPDATE events SET user_id = shared_owner_id WHERE is_shared = 1 AND shared_owner_id IS NOT NULL AND user_id != shared_owner_id;
      UPDATE notes SET user_id = shared_owner_id WHERE is_shared = 1 AND shared_owner_id IS NOT NULL AND user_id != shared_owner_id;
      UPDATE reminders SET user_id = shared_owner_id WHERE is_shared = 1 AND shared_owner_id IS NOT NULL AND user_id != shared_owner_id;
      UPDATE folders SET user_id = shared_owner_id WHERE is_shared = 1 AND shared_owner_id IS NOT NULL AND user_id != shared_owner_id;
    `);
  } catch (e) { }

  // Sync metadata table to track last sync timestamps
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  console.log('Sync metadata table checked');

  // Indices for Folders, Notes, Events & Reminders
  try {
    await db.execAsync(`
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

      CREATE INDEX IF NOT EXISTS idx_events_start_time ON events (start_time_ms);
      CREATE INDEX IF NOT EXISTS idx_events_end_time ON events (end_time_ms);
      CREATE INDEX IF NOT EXISTS idx_events_deleted ON events (deleted);
      CREATE INDEX IF NOT EXISTS idx_events_note_id ON events (note_id);
      CREATE INDEX IF NOT EXISTS idx_events_user_id ON events (user_id);
    `);
    console.log('Folders, Notes, Reminders & Events indices created');
  } catch (err) {
    console.warn('[DB] Non-critical index creation warning:', err);
  }

  console.log('Database initialized successfully');
};
