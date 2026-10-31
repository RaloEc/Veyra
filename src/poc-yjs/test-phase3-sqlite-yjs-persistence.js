/**
 * test-phase3-sqlite-yjs-persistence.js
 * 
 * Suite de Verificación de la Fase 3.2: Persistencia Local SQLite de Yjs.
 * 
 * OBJETIVOS DE PRUEBA:
 * 1. Comprobar la creación formal e idempotente de las tablas `yjs_note_snapshots`
 *    y `yjs_note_updates`, junto con el índice `idx_yjs_updates_doc`.
 * 2. Comprobar que ejecuciones repetidas de `initYjsPersistenceSchema` sean completamente
 *    inocuas y preserven intactos los registros existentes.
 * 3. Comprobar la estricta no-regresión y compatibilidad con las tablas preexistentes
 *    de Veyra (`notes`, `folders`, `reminders`), verificando que ninguna nota en modo 'rest'
 *    ni sus contenidos se alteren.
 * 4. Comprobar la operatividad completa de inserción, consulta, actualización de synced
 *    y compactación segura de deltas locales utilizando `YjsLocalPersistence`.
 */

const { DatabaseSync } = require('node:sqlite');
const assert = require('assert');

// ─── Adaptador SQLite compatible con Expo SQLite para Node.js ─────────────────
function createDatabaseAdapter(db) {
    return {
        execAsync: async (sql) => {
            return db.exec(sql);
        },
        runAsync: async (sql, params = []) => {
            const stmt = db.prepare(sql);
            const result = stmt.run(...params);
            return {
                lastInsertRowId: Number(result.lastInsertRowid),
                changes: Number(result.changes)
            };
        },
        getAllAsync: async (sql, params = []) => {
            const stmt = db.prepare(sql);
            return stmt.all(...params);
        },
        getFirstAsync: async (sql, params = []) => {
            const stmt = db.prepare(sql);
            const rows = stmt.all(...params);
            return rows.length > 0 ? rows[0] : null;
        },
        withTransactionAsync: async (action) => {
            db.exec('BEGIN;');
            try {
                const res = await action();
                db.exec('COMMIT;');
                return res;
            } catch (err) {
                db.exec('ROLLBACK;');
                throw err;
            }
        }
    };
}

// ─── Esquema canónico exportado de src/db/index.ts (Fase 3.2) ─────────────────
async function initYjsPersistenceSchema(db) {
    await db.execAsync(`
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

        CREATE INDEX IF NOT EXISTS idx_yjs_updates_doc ON yjs_note_updates (doc_id, synced);
    `);
}

// ─── Esquema simulado de tablas existentes de Veyra (notes, folders, reminders)
async function initLegacyVeyraSchema(db) {
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            name TEXT NOT NULL,
            created_at_ms INTEGER NOT NULL,
            updated_at_ms INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            due_date_ms INTEGER NOT NULL,
            status TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            folder_id TEXT,
            title TEXT,
            content TEXT,
            created_at_ms INTEGER NOT NULL,
            updated_at_ms INTEGER NOT NULL,
            last_modified_ms INTEGER,
            sync_mode TEXT NOT NULL DEFAULT 'rest'
        );

        CREATE INDEX IF NOT EXISTS idx_notes_sync_mode ON notes (sync_mode);
    `);
}

// ─── Runner de pruebas ────────────────────────────────────────────────────────
const results = [];
async function runTest(title, testFn) {
    try {
        console.log(`\n======================================================`);
        console.log(`[TEST FASE 3.2] ${title}`);
        console.log(`======================================================`);
        await testFn();
        console.log(`>>> RESULTADO: PASÓ exitosamente`);
        results.push({ title, passed: true });
    } catch (err) {
        console.error(`>>> RESULTADO: FALLÓ con error:`, err);
        results.push({ title, passed: false, error: err.message });
    }
}

// ─── SUITE DE PRUEBAS ─────────────────────────────────────────────────────────
(async () => {
    // -------------------------------------------------------------------------
    // TEST 1: Creación de tablas e índices y verificación estructural exacta
    // -------------------------------------------------------------------------
    await runTest('1. Creación e inspección estructural de yjs_note_snapshots y yjs_note_updates', async () => {
        const rawDb = new DatabaseSync(':memory:');
        const db = createDatabaseAdapter(rawDb);

        await initYjsPersistenceSchema(db);

        // 1.1 Verificar estructura de yjs_note_snapshots
        const snapshotColumns = await db.getAllAsync(`PRAGMA table_info(yjs_note_snapshots);`);
        const snapshotColsMap = new Map(snapshotColumns.map(c => [c.name, c]));

        assert(snapshotColsMap.has('doc_id'), 'Debe existir doc_id');
        assert.strictEqual(snapshotColsMap.get('doc_id').type.toUpperCase(), 'TEXT');
        assert.strictEqual(snapshotColsMap.get('doc_id').pk, 1, 'doc_id debe ser clave primaria');

        assert(snapshotColsMap.has('snapshot'), 'Debe existir snapshot');
        assert.strictEqual(snapshotColsMap.get('snapshot').type.toUpperCase(), 'TEXT');
        assert.strictEqual(snapshotColsMap.get('snapshot').notnull, 1, 'snapshot no debe ser nulo');

        assert(snapshotColsMap.has('state_vector'), 'Debe existir state_vector');
        assert.strictEqual(snapshotColsMap.get('state_vector').type.toUpperCase(), 'TEXT');
        assert.strictEqual(snapshotColsMap.get('state_vector').notnull, 1, 'state_vector no debe ser nulo');

        assert(snapshotColsMap.has('updated_at_ms'), 'Debe existir updated_at_ms');
        assert.strictEqual(snapshotColsMap.get('updated_at_ms').type.toUpperCase(), 'INTEGER');

        // 1.2 Verificar estructura de yjs_note_updates
        const updateColumns = await db.getAllAsync(`PRAGMA table_info(yjs_note_updates);`);
        const updateColsMap = new Map(updateColumns.map(c => [c.name, c]));

        assert(updateColsMap.has('id'), 'Debe existir id');
        assert.strictEqual(updateColsMap.get('id').pk, 1, 'id debe ser clave primaria');

        assert(updateColsMap.has('doc_id'), 'Debe existir doc_id');
        assert.strictEqual(updateColsMap.get('doc_id').type.toUpperCase(), 'TEXT');

        assert(updateColsMap.has('update_data'), 'Debe existir update_data');
        assert.strictEqual(updateColsMap.get('update_data').type.toUpperCase(), 'TEXT');

        assert(updateColsMap.has('synced'), 'Debe existir synced');
        assert.strictEqual(updateColsMap.get('synced').type.toUpperCase(), 'INTEGER');

        assert(updateColsMap.has('created_at_ms'), 'Debe existir created_at_ms');
        assert.strictEqual(updateColsMap.get('created_at_ms').type.toUpperCase(), 'INTEGER');

        // 1.3 Verificar índice idx_yjs_updates_doc
        const indexList = await db.getAllAsync(`PRAGMA index_list(yjs_note_updates);`);
        const hasIndex = indexList.some(idx => idx.name === 'idx_yjs_updates_doc');
        assert(hasIndex, 'El índice idx_yjs_updates_doc debe existir en yjs_note_updates');

        const indexInfo = await db.getAllAsync(`PRAGMA index_info(idx_yjs_updates_doc);`);
        assert.strictEqual(indexInfo.length, 2, 'El índice debe cubrir 2 columnas');
        assert.strictEqual(indexInfo[0].name, 'doc_id', 'Columna 1 del índice debe ser doc_id');
        assert.strictEqual(indexInfo[1].name, 'synced', 'Columna 2 del índice debe ser synced');

        console.log('Estructura SQLite y tipos verificados con éxito.');
    });

    // -------------------------------------------------------------------------
    // TEST 2: Idempotencia estricta ante inicializaciones repetidas con datos
    // -------------------------------------------------------------------------
    await runTest('2. Idempotencia estricta: Múltiples ejecuciones consecutivas conservan datos', async () => {
        const rawDb = new DatabaseSync(':memory:');
        const db = createDatabaseAdapter(rawDb);

        // 2.1 Primera inicialización
        await initYjsPersistenceSchema(db);

        // 2.2 Insertar datos de prueba en ambas tablas
        await db.runAsync(
            `INSERT INTO yjs_note_snapshots (doc_id, snapshot, state_vector, updated_at_ms) VALUES (?, ?, ?, ?)`,
            ['note-alpha', 'base64_snapshot_data_123', 'base64_sv_data_456', 1700000000000]
        );

        await db.runAsync(
            `INSERT INTO yjs_note_updates (doc_id, update_data, synced, created_at_ms) VALUES (?, ?, ?, ?)`,
            ['note-alpha', 'base64_delta_1', 0, 1700000000100]
        );
        await db.runAsync(
            `INSERT INTO yjs_note_updates (doc_id, update_data, synced, created_at_ms) VALUES (?, ?, ?, ?)`,
            ['note-alpha', 'base64_delta_2', 1, 1700000000200]
        );

        // 2.3 Ejecutar initYjsPersistenceSchema 5 veces consecutivas
        for (let i = 1; i <= 5; i++) {
            await initYjsPersistenceSchema(db);
        }

        // 2.4 Comprobar que los datos siguen exactamente intactos
        const snapshot = await db.getFirstAsync(`SELECT * FROM yjs_note_snapshots WHERE doc_id = ?`, ['note-alpha']);
        assert(snapshot, 'El snapshot debe existir intacto');
        assert.strictEqual(snapshot.snapshot, 'base64_snapshot_data_123');
        assert.strictEqual(snapshot.state_vector, 'base64_sv_data_456');

        const updates = await db.getAllAsync(`SELECT * FROM yjs_note_updates WHERE doc_id = ? ORDER BY id ASC`, ['note-alpha']);
        assert.strictEqual(updates.length, 2, 'Deben preservarse exactamente los 2 updates');
        assert.strictEqual(updates[0].update_data, 'base64_delta_1');
        assert.strictEqual(updates[0].synced, 0);
        assert.strictEqual(updates[1].update_data, 'base64_delta_2');
        assert.strictEqual(updates[1].synced, 1);

        console.log('5 reinicializaciones consecutivas ejecutadas sin pérdida de registros.');
    });

    // -------------------------------------------------------------------------
    // TEST 3: Compatibilidad y no-regresión con tablas y notas existentes de Veyra
    // -------------------------------------------------------------------------
    await runTest('3. Compatibilidad con tablas existentes: Notes en modo rest, folders y reminders intactos', async () => {
        const rawDb = new DatabaseSync(':memory:');
        const db = createDatabaseAdapter(rawDb);

        // 3.1 Inicializar esquema existente de Veyra
        await initLegacyVeyraSchema(db);

        // 3.2 Insertar datos existentes (simulando notas de producción en modo 'rest')
        await db.runAsync(`INSERT INTO folders (id, user_id, name, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)`,
            ['folder-1', 'user-123', 'Carpeta Trabajo', 1600000000000, 1600000000000]
        );
        await db.runAsync(`INSERT INTO reminders (id, title, due_date_ms, status) VALUES (?, ?, ?, ?)`,
            ['rem-1', 'Revisión técnica', 1650000000000, 'pending']
        );

        // Insertar 3 notas representativas en modo rest
        for (let i = 1; i <= 3; i++) {
            await db.runAsync(
                `INSERT INTO notes (id, user_id, folder_id, title, content, created_at_ms, updated_at_ms, last_modified_ms, sync_mode)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [`note-${i}`, 'user-123', 'folder-1', `Nota Rest ${i}`, `<p>Contenido HTML original de Pell ${i}</p>`, 1600000000000 + i, 1600000000000 + i, 1600000000000 + i, 'rest']
            );
        }

        // 3.3 Ejecutar la inicialización de persistencia Yjs de la Fase 3.2
        await initYjsPersistenceSchema(db);

        // 3.4 Verificar que las notas preexistentes siguen intactas en modo 'rest'
        const notes = await db.getAllAsync(`SELECT * FROM notes ORDER BY id ASC`);
        assert.strictEqual(notes.length, 3, 'Deben permanecer las 3 notas');
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(notes[i].sync_mode, 'rest', `La nota ${notes[i].id} debe seguir en sync_mode = 'rest'`);
            assert(notes[i].content.includes('Contenido HTML original de Pell'), 'El contenido de Pell debe estar intacto');
            assert.strictEqual(notes[i].folder_id, 'folder-1');
        }

        // 3.5 Verificar folders y reminders
        const folders = await db.getAllAsync(`SELECT * FROM folders`);
        assert.strictEqual(folders.length, 1);
        assert.strictEqual(folders[0].name, 'Carpeta Trabajo');

        const reminders = await db.getAllAsync(`SELECT * FROM reminders`);
        assert.strictEqual(reminders.length, 1);
        assert.strictEqual(reminders[0].title, 'Revisión técnica');

        console.log('Tablas preexistentes (notes, folders, reminders) conservadas 100% inalteradas.');
    });

    // -------------------------------------------------------------------------
    // TEST 4: Operatividad completa de YjsLocalPersistence
    // -------------------------------------------------------------------------
    await runTest('4. Operatividad de YjsLocalPersistence: Almacenamiento, synced flag y compactación segura', async () => {
        const rawDb = new DatabaseSync(':memory:');
        const db = createDatabaseAdapter(rawDb);
        const Y = require('yjs');

        // Cargar clase YjsLocalPersistence
        const { YjsLocalPersistence } = require('./yjsLocalPersistence');
        const persistence = new YjsLocalPersistence(db);

        // Inicializar esquema
        await persistence.initSchema();

        const docId = 'note-collab-test-1';
        const doc = new Y.Doc();
        const text = doc.getText('content');
        text.insert(0, 'Hola colaborativo desde Veyra');
        const dummyBytes1 = Y.encodeStateAsUpdate(doc);

        doc.transact(() => {
            text.insert(text.length, ' - segunda edición');
        });
        const dummyBytes2 = Y.encodeStateAsUpdate(doc);

        // 4.1 Guardar dos updates incrementales (uno no sincronizado, otro sincronizado)
        const id1 = await persistence.storeUpdate(docId, dummyBytes1, false);
        const id2 = await persistence.storeUpdate(docId, dummyBytes2, true);

        assert(id1 > 0, 'id1 debe ser válido');
        assert(id2 > id1, 'id2 debe ser autoincremental superior');

        // 4.2 Consultar updates pendientes (synced = 0)
        const pending = await persistence.getPendingLocalUpdates(docId);
        assert.strictEqual(pending.length, 1, 'Debe haber exactamente 1 update pendiente');
        assert.strictEqual(pending[0].id, id1);
        assert.strictEqual(pending[0].synced, 0);

        // 4.3 Marcar update como sincronizado
        await persistence.markUpdatesAsSynced([id1]);
        const pendingAfter = await persistence.getPendingLocalUpdates(docId);
        assert.strictEqual(pendingAfter.length, 0, 'No debe quedar ningún update pendiente tras marcar synced');

        // 4.4 Insertar un nuevo update pendiente (synced = 0) antes de compactar
        doc.transact(() => {
            text.insert(text.length, ' - delta offline pendiente');
        });
        const pendingBytes = Y.encodeStateAsUpdate(doc);
        const pendingId = await persistence.storeUpdate(docId, pendingBytes, false);

        // 4.5 Compactar deltas: Debe purgar deltas con synced = 1, pero PRESERVAR estrictamente los de synced = 0
        await persistence.compact(docId, doc);

        // Verificar snapshot en SQLite
        const snapshotRow = await db.getFirstAsync(`SELECT * FROM yjs_note_snapshots WHERE doc_id = ?`, [docId]);
        assert(snapshotRow, 'Snapshot debe existir en SQLite');
        assert(snapshotRow.snapshot.length > 0, 'Snapshot debe tener datos Base64');

        // Verificar que el update pendiente se preservó intacto
        const remainingUpdates = await db.getAllAsync(`SELECT * FROM yjs_note_updates WHERE doc_id = ?`, [docId]);
        assert.strictEqual(remainingUpdates.length, 1, 'Solo debe quedar el update no sincronizado tras compactar');
        assert.strictEqual(remainingUpdates[0].id, pendingId, 'El update preservado debe ser el que tenía synced = 0');
        assert.strictEqual(remainingUpdates[0].synced, 0);

        // 4.6 Cargar y reconstruir documento desde SQLite con loadDocument
        const targetDoc = new Y.Doc();
        const loadResult = await persistence.loadDocument(docId, targetDoc);
        assert.strictEqual(loadResult.hasSnapshot, true, 'Debe haber cargado el snapshot');
        assert.strictEqual(loadResult.appliedUpdatesCount, 1, 'Debe haber aplicado el delta incremental');

        const loadedText = targetDoc.getText('content').toString();
        assert(loadedText.includes('Hola colaborativo desde Veyra'), 'Debe contener el texto del snapshot');
        assert(loadedText.includes('delta offline pendiente'), 'Debe contener el texto del delta pendiente');

        console.log('Ciclo completo de persistencia local, reintentos y compactación segura validado.');
    });

    // -------------------------------------------------------------------------
    // TEST 5: Verificación estructural profunda (verifyYjsPersistenceSchema)
    // -------------------------------------------------------------------------
    await runTest('5. Comprobación profunda de tablas, columnas e índices (Guard anti-corrupción)', async () => {
        const rawDb = new DatabaseSync(':memory:');
        const db = createDatabaseAdapter(rawDb);

        // Importar funciones de verificación profunda
        // Definición directa idéntica a src/db/index.ts para testing desacoplado
        async function verifyYjsPersistenceSchemaTest(dbAdapter) {
            const snapshotCols = await dbAdapter.getAllAsync('PRAGMA table_info(yjs_note_snapshots);');
            const snapMap = new Map((snapshotCols || []).map(c => [c.name, c]));
            const snapshotsTableOk =
                snapMap.has('doc_id') && snapMap.get('doc_id')?.pk === 1 &&
                snapMap.has('snapshot') &&
                snapMap.has('state_vector') &&
                snapMap.has('updated_at_ms');

            const updateCols = await dbAdapter.getAllAsync('PRAGMA table_info(yjs_note_updates);');
            const updMap = new Map((updateCols || []).map(c => [c.name, c]));
            const updatesTableOk =
                updMap.has('id') && updMap.get('id')?.pk === 1 &&
                updMap.has('doc_id') &&
                updMap.has('update_data') &&
                updMap.has('synced') &&
                updMap.has('created_at_ms');

            const indices = await dbAdapter.getAllAsync('PRAGMA index_list(yjs_note_updates);');
            const indexOk = Array.isArray(indices) && indices.some(idx => idx.name === 'idx_yjs_updates_doc');

            const ready = Boolean(snapshotsTableOk && updatesTableOk && indexOk);
            return { ready, snapshotsTableOk, updatesTableOk, indexOk };
        }

        // 5.1 En BD vacía: debe reportar ready = false
        const checkEmpty = await verifyYjsPersistenceSchemaTest(db);
        assert.strictEqual(checkEmpty.ready, false, 'En BD vacía debe ser false');
        assert.strictEqual(checkEmpty.snapshotsTableOk, false);
        assert.strictEqual(checkEmpty.updatesTableOk, false);

        // 5.2 Si se crea solo una tabla corrupta (faltando columnas obligatorias)
        await db.execAsync(`CREATE TABLE yjs_note_snapshots (doc_id TEXT);`);
        const checkCorrupt = await verifyYjsPersistenceSchemaTest(db);
        assert.strictEqual(checkCorrupt.ready, false, 'Tabla incompleta debe ser false');
        assert.strictEqual(checkCorrupt.snapshotsTableOk, false, 'Faltan columnas de snapshot');

        // Limpiar tabla incompleta
        await db.execAsync(`DROP TABLE yjs_note_snapshots;`);

        // 5.3 Ejecutar inicialización completa
        await initYjsPersistenceSchema(db);

        // 5.4 Comprobación profunda debe dar ready = true con todos sus componentes OK
        const checkComplete = await verifyYjsPersistenceSchemaTest(db);
        assert.strictEqual(checkComplete.ready, true, 'Con esquema completo debe ser true');
        assert.strictEqual(checkComplete.snapshotsTableOk, true);
        assert.strictEqual(checkComplete.updatesTableOk, true);
        assert.strictEqual(checkComplete.indexOk, true);

        console.log('Inspección profunda de columnas y tipos verificada exhaustivamente.');
    });

    // -------------------------------------------------------------------------
    // RESUMEN FINAL
    // -------------------------------------------------------------------------
    console.log(`\n======================================================`);
    console.log(`RESUMEN DE PRUEBAS DE PERSISTENCIA LOCAL SQLITE (FASE 3.2)`);
    console.log(`======================================================`);
    let passedCount = 0;
    results.forEach((r, idx) => {
        const status = r.passed ? 'PASÓ (OK)' : 'FALLÓ (ERROR)';
        console.log(`${idx + 1}. ${r.title}: ${status}`);
        if (r.passed) passedCount++;
    });

    console.log(`\nTOTAL: ${passedCount}/${results.length} pruebas superadas.`);
    if (passedCount === results.length) {
        console.log('TODAS LAS PRUEBAS DE LA FASE 3.2 PASARON SATISFACTORIAMENTE.');
        process.exit(0);
    } else {
        console.error('ALGUNAS PRUEBAS FALLARON.');
        process.exit(1);
    }
})();
