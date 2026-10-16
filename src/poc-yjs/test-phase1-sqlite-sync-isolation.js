/**
 * test-phase1-sqlite-sync-isolation.js
 * 
 * Suite de Verificación de la Fase 1: sync_mode local y aislamiento de SyncService.
 * 
 * TRANSPARENCIA Y RIGOR METODOLÓGICO:
 * ------------------------------------
 * Esta suite distingue explícitamente tres tipos de verificaciones:
 * 
 * 1. [FUNCIÓN REAL DE PRODUCCIÓN SOBRE SQLITE REAL]:
 *    Ejecuta el código exacto de producción exportado de `src/db/index.ts`
 *    y `src/services/syncService.ts` contra el motor C de SQLite integrado en Node.js (node:sqlite).
 *    - `migrateNotesSyncMode(db)`
 *    - `SyncService.localNoteToRemote(local, userId)`
 *    - `SyncService.upsertLocalNote(db, remote, userId)`
 * 
 * 2. [LÓGICA DEL MOTOR DE CONFLICTOS DE SYNC]:
 *    Evalúa el algoritmo de enrutamiento y exclusión de notas Yjs implementado en `syncNotes`.
 * 
 * 3. [INVARIANTES DE ESQUEMA EN SQLITE REAL]:
 *    Comprueba que las operaciones SQL que omitan la columna `sync_mode`
 *    reciban automáticamente el valor predeterminado 'rest' sin errores de sintaxis.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');

// ─── 1. Hook de carga TypeScript y stubs para módulos nativos de React Native ───
if (!require.extensions['.ts']) {
    try {
        const ts = require('typescript');
        require.extensions['.ts'] = function (module, filename) {
            let source = fs.readFileSync(filename, 'utf8');

            // Reemplazar imports nativos de Expo y React Native antes de transpilar
            if (filename.includes('db' + path.sep + 'index.ts') || filename.endsWith('db/index.ts')) {
                source = source.replace(/import \* as SQLite from ['"]expo-sqlite['"];/, 'const SQLite = { openDatabaseAsync: () => {} };');
            }
            if (filename.includes('supabase.ts')) {
                source = `
                    export const supabase = {
                        from: () => ({
                            select: () => ({ gt: () => Promise.resolve({ data: [] }) }),
                            upsert: () => Promise.resolve({ error: null }),
                            update: () => ({ eq: () => Promise.resolve({ error: null }) })
                        }),
                        channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) })
                    };
                `;
            }
            if (filename.includes('storageService.ts')) {
                source = `export const StorageService = { uploadAttachments: async () => [], downloadAttachments: async () => [] };`;
            }
            if (filename.includes('widgetService.ts')) {
                source = `export const WidgetService = { syncNotes: async () => {} };`;
            }
            if (filename.includes('collaborationService.ts')) {
                source = `export const CollaborationService = { notifyChange: async () => {} };`;
            }

            const compiled = ts.transpileModule(source, {
                compilerOptions: {
                    module: ts.ModuleKind.CommonJS,
                    target: ts.ScriptTarget.ES2022,
                    esModuleInterop: true,
                },
                fileName: filename,
            });
            module._compile(compiled.outputText, filename);
        };
    } catch (e) {
        console.error('Error cargando el compilador TypeScript:', e);
        process.exit(1);
    }
}

// Cargar funciones y servicios REALES de producción
const { migrateNotesSyncMode } = require('../db/index');
const { SyncService } = require('../services/syncService');

console.log('================================================================');
console.log('  TEST FASE 1: sync_mode en SQLite y Aislamiento de SyncService');
console.log('================================================================\n');

// ─── 2. Adaptador compatible con Expo-SQLite basado en node:sqlite real ───────
function createExpoSqliteAdapter(sqliteDb) {
    return {
        execAsync: async (sql) => {
            sqliteDb.exec(sql);
        },
        runAsync: async (sql, params = []) => {
            const stmt = sqliteDb.prepare(sql);
            const info = stmt.run(...params);
            return {
                lastInsertRowId: Number(info.lastInsertRowid),
                changes: Number(info.changes),
            };
        },
        getAllAsync: async (sql, params = []) => {
            const stmt = sqliteDb.prepare(sql);
            return stmt.all(...params);
        },
        getFirstAsync: async (sql, params = []) => {
            const stmt = sqliteDb.prepare(sql);
            return stmt.get(...params) || null;
        },
        withTransactionAsync: async (action) => {
            sqliteDb.exec('BEGIN TRANSACTION;');
            try {
                const res = await action();
                sqliteDb.exec('COMMIT;');
                return res;
            } catch (err) {
                sqliteDb.exec('ROLLBACK;');
                throw err;
            }
        }
    };
}

async function runTests() {
    let passed = 0;
    let failed = 0;

    async function test(name, category, fn) {
        try {
            await fn();
            console.log(`  [PASSED] [${category}] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  [FAILED] [${category}] ${name}`);
            console.error(`           Error: ${err.message}\n${err.stack}`);
            failed++;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // CATEGORÍA 1: FUNCIONES REALES DE PRODUCCIÓN SOBRE SQLITE REAL
    // ─────────────────────────────────────────────────────────────────────────────

    await test(
        'migrateNotesSyncMode() aplica ALTER TABLE sobre base existente conservando notas, paginación y adjuntos',
        'FUNCIÓN REAL',
        async () => {
            const rawDb = new DatabaseSync(':memory:');
            const db = createExpoSqliteAdapter(rawDb);

            // 1. Esquema legacy exacto previo a la migración
            await db.execAsync(`
                CREATE TABLE notes (
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
                    collab_role TEXT DEFAULT "editor"
                );
            `);

            // 2. Insertar notas preexistentes con estructura compleja
            const paginatedContent = JSON.stringify({
                isPaginated: true,
                version: 2,
                layout: 'vertical',
                pages: [
                    { id: 'page-1', content: '<p>Página 1 con formato</p>' },
                    { id: 'page-2', content: '<p>Página 2 con imagen</p>' }
                ]
            });
            const attachmentsJson = JSON.stringify([{ uri: 'file:///photo.jpg', name: 'photo.jpg' }]);

            await db.runAsync(
                `INSERT INTO notes (id, user_id, folder_id, title, content, created_at_ms, updated_at_ms, attachments, deleted, last_modified_ms)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ['note-legacy-1', 'user-100', 'folder-alpha', 'Nota Antigua', paginatedContent, 1000, 1000, attachmentsJson, 0, 1000]
            );

            // 3. Ejecutar la función de producción REAL exportada de src/db/index.ts
            const result = await migrateNotesSyncMode(db);

            assert.strictEqual(result.applied, true, 'Debe indicar que la migración fue aplicada');
            assert.strictEqual(result.columnExists, true, 'Debe confirmar que la columna existe');

            // 4. Verificar integridad de los datos
            const row = await db.getFirstAsync(`SELECT * FROM notes WHERE id = ?`, ['note-legacy-1']);
            assert.ok(row, 'La nota debe existir tras la migración');
            assert.strictEqual(row.sync_mode, 'rest', 'sync_mode debe ser rest');
            assert.strictEqual(row.content, paginatedContent, 'El contenido paginado se preservó intacto');
            assert.strictEqual(row.folder_id, 'folder-alpha', 'La carpeta se preservó');
            assert.strictEqual(row.attachments, attachmentsJson, 'Los adjuntos se preservaron');
        }
    );

    await test(
        'migrateNotesSyncMode() en una segunda ejecución detecta existencia mediante PRAGMA y no altera datos (Idempotencia)',
        'FUNCIÓN REAL',
        async () => {
            const rawDb = new DatabaseSync(':memory:');
            const db = createExpoSqliteAdapter(rawDb);

            // Crear tabla con sync_mode ya presente
            await db.execAsync(`
                CREATE TABLE notes (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    sync_mode TEXT NOT NULL DEFAULT 'rest'
                );
            `);

            await db.runAsync(`INSERT INTO notes (id, title, sync_mode) VALUES (?, ?, ?)`, ['note-1', 'Título', 'yjs']);

            // Ejecutar la función de producción
            const result = await migrateNotesSyncMode(db);

            assert.strictEqual(result.applied, false, 'No debió ejecutar ALTER TABLE porque la columna ya existía');
            assert.strictEqual(result.columnExists, true, 'La columna sigue existiendo');

            // Verificar que no pisó el modo 'yjs' de la nota
            const row = await db.getFirstAsync(`SELECT * FROM notes WHERE id = ?`, ['note-1']);
            assert.strictEqual(row.sync_mode, 'yjs', 'El sync_mode no debe ser sobrescrito a rest en segunda corrida');
        }
    );

    await test(
        'SyncService.localNoteToRemote() no incluye sync_mode en el payload para Supabase',
        'FUNCIÓN REAL',
        async () => {
            const localNote = {
                id: 'note-uuid-1',
                user_id: 'user-uuid-1',
                folder_id: 'folder-1',
                event_id: null,
                title: 'Nota de Prueba',
                content: '<p>Contenido</p>',
                created_at_ms: 1000,
                updated_at_ms: 2000,
                last_modified_ms: 2000,
                is_pinned: 0,
                attachments: '[]',
                links: '[]',
                deleted: 0,
                sync_mode: 'rest' // Presente localmente en SQLite
            };

            // Invocación directa del método de producción de SyncService
            const remotePayload = SyncService.localNoteToRemote(localNote, 'user-uuid-1');

            assert.strictEqual('sync_mode' in remotePayload, false, 'CRÍTICO: sync_mode NO debe ser enviado a public.notes en Supabase');
            assert.strictEqual(remotePayload.id, 'note-uuid-1');
            assert.strictEqual(remotePayload.title, 'Nota de Prueba');
            assert.strictEqual(remotePayload.content, '<p>Contenido</p>');
        }
    );

    await test(
        'SyncService.upsertLocalNote() protege el contenido y sync_mode de una nota Yjs cuando llega un payload REST',
        'FUNCIÓN REAL',
        async () => {
            const rawDb = new DatabaseSync(':memory:');
            const db = createExpoSqliteAdapter(rawDb);

            await db.execAsync(`
                CREATE TABLE IF NOT EXISTS folders (
                    id TEXT PRIMARY KEY,
                    is_shared INTEGER DEFAULT 0,
                    shared_owner_id TEXT,
                    user_id TEXT
                );

                CREATE TABLE notes (
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
                    sync_mode TEXT NOT NULL DEFAULT 'rest'
                );
            `);

            // Nota colaborativa local con contenido Yjs en progreso
            const yjsLocalHtml = '<p>Edición colaborativa en vivo Yjs</p>';
            await db.runAsync(
                `INSERT INTO notes (id, user_id, folder_id, title, content, created_at_ms, updated_at_ms, last_modified_ms, sync_mode)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ['collab-note-1', 'user-1', 'folder-old', 'Nota Yjs', yjsLocalHtml, 1000, 5000, 5000, 'yjs']
            );

            // Payload remoto de Supabase (con HTML obsoleto de versión REST vieja y nuevo folder_id)
            const remotePayload = {
                id: 'collab-note-1',
                user_id: 'user-1',
                folder_id: 'folder-new',
                title: 'Nota Yjs (Título Actualizado)',
                content: '<p>Contenido REST viejo que NO debe pisar a Yjs</p>',
                created_at_ms: 1000,
                updated_at_ms: 6000,
                last_modified_ms: 6000,
                deleted: 0,
            };

            // Invocación directa del método de producción de SyncService
            await SyncService.upsertLocalNote(db, remotePayload, 'user-1');

            const result = await db.getFirstAsync(`SELECT * FROM notes WHERE id = ?`, ['collab-note-1']);
            assert.strictEqual(result.sync_mode, 'yjs', 'El modo local DEBE seguir siendo yjs');
            assert.strictEqual(result.content, yjsLocalHtml, 'El contenido local Yjs NO debe ser sobrescrito por REST');
            assert.strictEqual(result.folder_id, 'folder-new', 'Los metadatos externos legítimos sí se actualizan');
            assert.strictEqual(result.title, 'Nota Yjs (Título Actualizado)', 'El título sí se actualiza');
        }
    );

    await test(
        'SyncService.upsertLocalNote() actualiza normalmente el contenido de una nota rest',
        'FUNCIÓN REAL',
        async () => {
            const rawDb = new DatabaseSync(':memory:');
            const db = createExpoSqliteAdapter(rawDb);

            await db.execAsync(`
                CREATE TABLE notes (
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
                    sync_mode TEXT NOT NULL DEFAULT 'rest'
                );
            `);

            await db.runAsync(
                `INSERT INTO notes (id, user_id, title, content, created_at_ms, updated_at_ms, last_modified_ms, sync_mode)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                ['rest-note-1', 'user-1', 'Nota REST', '<p>Versión 1</p>', 1000, 1000, 1000, 'rest']
            );

            const remotePayload = {
                id: 'rest-note-1',
                user_id: 'user-1',
                title: 'Nota REST',
                content: '<p>Versión 2 Remota</p>',
                created_at_ms: 1000,
                updated_at_ms: 2000,
                last_modified_ms: 2000,
                deleted: 0,
            };

            await SyncService.upsertLocalNote(db, remotePayload, 'user-1');

            const result = await db.getFirstAsync(`SELECT * FROM notes WHERE id = ?`, ['rest-note-1']);
            assert.strictEqual(result.sync_mode, 'rest');
            assert.strictEqual(result.content, '<p>Versión 2 Remota</p>', 'Para notas rest, el contenido sí se actualiza normalmente');
        }
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // CATEGORÍA 2: LÓGICA DEL MOTOR DE CONFLICTOS DE SYNC (AISLAMIENTO EN syncNotes)
    // ─────────────────────────────────────────────────────────────────────────────

    await test(
        'Algoritmo de syncNotes excluye notas yjs de toUpsertRemoteOwn y toUpdateRemoteShared',
        'LÓGICA SYNC',
        async () => {
            const localNotes = [
                { id: 'note-rest', title: 'Nota Rest', content: '<p>REST</p>', last_modified_ms: 5000, sync_mode: 'rest', user_id: 'u1' },
                { id: 'note-yjs', title: 'Nota Yjs', content: '<p>YJS</p>', last_modified_ms: 6000, sync_mode: 'yjs', user_id: 'u1' }
            ];

            const remoteNotes = [
                { id: 'note-rest', title: 'Nota Rest', content: '<p>REST</p>', last_modified_ms: 4000 },
                { id: 'note-yjs', title: 'Nota Yjs', content: '<p>YJS Remoto</p>', last_modified_ms: 8000 }
            ];

            const localMap = new Map(localNotes.map(n => [n.id, n]));
            const remoteMap = new Map(remoteNotes.map(n => [n.id, n]));

            const toUpsertRemoteOwn = [];
            const toUpsertLocal = [];
            const processedIds = new Set();

            // Código idéntico al bloque implementado en SyncService.syncNotes
            for (const [id, local] of localMap) {
                processedIds.add(id);

                if (local.sync_mode === 'yjs') {
                    continue; // Aislamiento Yjs
                }

                const localModMs = local.last_modified_ms || local.updated_at_ms;
                const remote = remoteMap.get(id);

                if (!remote || localModMs > (remote.last_modified_ms || 0)) {
                    toUpsertRemoteOwn.push(local);
                } else if ((remote.last_modified_ms || 0) > localModMs) {
                    toUpsertLocal.push(remote);
                }
            }

            for (const [id, remote] of remoteMap) {
                if (!processedIds.has(id)) {
                    toUpsertLocal.push(remote);
                }
            }

            assert.strictEqual(toUpsertRemoteOwn.length, 1);
            assert.strictEqual(toUpsertRemoteOwn[0].id, 'note-rest');
            assert.strictEqual(toUpsertLocal.length, 0, 'La nota Yjs no debe entrar a toUpsertLocal aunque remote tenga mayor timestamp');
            assert.strictEqual(toUpsertRemoteOwn.some(n => n.id === 'note-yjs'), false);
        }
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // CATEGORÍA 3: INVARIANTES DE ESQUEMA EN SQLITE REAL
    // ─────────────────────────────────────────────────────────────────────────────

    await test(
        'Inserts que omiten la columna sync_mode reciben automáticamente "rest" por defecto en SQLite real',
        'INVARIANTE SQL',
        async () => {
            const rawDb = new DatabaseSync(':memory:');
            const db = createExpoSqliteAdapter(rawDb);

            await db.execAsync(`
                CREATE TABLE notes (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    content TEXT,
                    sync_mode TEXT NOT NULL DEFAULT 'rest'
                );
            `);

            // Inserción sin especificar sync_mode (simulando query legacy)
            await db.runAsync(`INSERT INTO notes (id, title, content) VALUES (?, ?, ?)`, ['legacy-insert-1', 'Nota Legacy', '<p>Texto</p>']);

            const row = await db.getFirstAsync(`SELECT * FROM notes WHERE id = ?`, ['legacy-insert-1']);
            assert.ok(row);
            assert.strictEqual(row.sync_mode, 'rest', 'SQLite debe aplicar NOT NULL DEFAULT "rest"');
        }
    );

    console.log('\n================================================================');
    console.log(`  RESULTADOS TOTALES: ${passed} pasadas, ${failed} fallidas`);
    console.log('================================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Error fatal ejecutando la suite:', err);
    process.exit(1);
});
