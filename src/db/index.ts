import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export const getDB = async () => {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('reminders.db');
  }
  return dbInstance;
};

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
      links TEXT
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

  // Notes Table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT,
      content TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      is_pinned INTEGER DEFAULT 0,
      attachments TEXT,
      links TEXT,
      deleted INTEGER DEFAULT 0,
      last_modified_ms INTEGER
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

  // Set last_modified_ms for existing notes that don't have it
  await db.runAsync(
    `UPDATE notes SET last_modified_ms = updated_at_ms WHERE last_modified_ms IS NULL`
  );

  // Sync metadata table to track last sync timestamps
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  console.log('Sync metadata table checked');

  // Indices for Notes
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at_ms);
    CREATE INDEX IF NOT EXISTS idx_notes_last_modified ON notes (last_modified_ms);
  `);
  console.log('Notes indices created');

  console.log('Database initialized successfully');
};
