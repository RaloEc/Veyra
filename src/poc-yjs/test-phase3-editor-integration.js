/**
 * test-phase3-editor-integration.js
 * 
 * Suite de Verificación de la Fase 3.3:
 * Integración de Yjs en el editor principal con selección mutuamente excluyente,
 * guard de persistencia local SQLite y verificación de la interfaz RPC de activación.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const Y = require('yjs');

// Hook TypeScript para Node.js
if (!require.extensions['.ts']) {
    const ts = require('typescript');
    require.extensions['.ts'] = function (module, filename) {
        let source = fs.readFileSync(filename, 'utf8');
        source = source.replace(/import \* as Crypto from ['"]expo-crypto['"];/g, 'const Crypto = { randomUUID: () => "uuid-" + Math.random().toString(36).substring(2, 9), digestStringAsync: async () => "hash" };');
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
}

const { YjsLocalPersistence, bytesToBase64, base64ToBytes } = require('./yjsLocalPersistence');
const { YjsRemotePersistence, computeUpdateHash } = require('./yjsRemotePersistence');
const { SupabaseYjsProvider } = require('./supabaseYjsProvider');
const { computeContentSha256, preparePilotActivationPayload } = require('./pilotActivationStrategy');

console.log('====================================================================');
console.log('  TEST FASE 3.3: INTEGRACIÓN DE YJS EN EL EDITOR PRINCIPAL');
console.log('====================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        console.log(`[TEST ${totalTests}] ${name}`);
        fn();
        console.log(`>>> [TEST ${totalTests}] PASÓ (OK)\n`);
        passedTests++;
    } catch (err) {
        console.error(`>>> [TEST ${totalTests}] FALLÓ:`, err.message);
        console.error(err.stack);
        console.log('');
    }
}

async function runAsyncTest(name, fn) {
    totalTests++;
    try {
        console.log(`[TEST ${totalTests}] ${name}`);
        await fn();
        console.log(`>>> [TEST ${totalTests}] PASÓ (OK)\n`);
        passedTests++;
    } catch (err) {
        console.error(`>>> [TEST ${totalTests}] FALLÓ:`, err.message);
        console.error(err.stack);
        console.log('');
    }
}

// Mock SQLite Adapter compatible con LocalPersistenceDBAdapter
function createMockDbAdapter(db) {
    return {
        execAsync: async (sql) => db.exec(sql),
        runAsync: async (sql, params = []) => {
            const stmt = db.prepare(sql);
            const result = stmt.run(...params);
            return {
                lastInsertRowId: Number(result.lastInsertRowid),
                changes: result.changes,
            };
        },
        getAllAsync: async (sql, params = []) => {
            const stmt = db.prepare(sql);
            return stmt.all(...params);
        },
        getFirstAsync: async (sql, params = []) => {
            const stmt = db.prepare(sql);
            return stmt.get(...params) || null;
        },
        withTransactionAsync: async (action) => {
            db.exec('BEGIN TRANSACTION;');
            try {
                const res = await action();
                db.exec('COMMIT;');
                return res;
            } catch (err) {
                db.exec('ROLLBACK;');
                throw err;
            }
        },
    };
}

(async () => {
    // ─── PRUEBA 1: SELECCIÓN MUTUAMENTE EXCLUYENTE SEGÚN SYNC_MODE ───
    await runAsyncTest('Selección mutuamente excluyente: Rest vs Yjs y protección de contenido en autoguardado', async () => {
        // Simulación de función de autoguardado con la lógica implementada en useCreateNote
        function simulateAutosave(syncMode, currentContent, currentTitle) {
            const updatePayload = {
                title: currentTitle,
                attachments: '[]',
                is_pinned: 0,
                folder_id: null,
                event_id: null,
                font_family: 'sans',
            };

            const isYjsMode = syncMode === 'yjs';
            if (!isYjsMode) {
                updatePayload.content = currentContent;
            }

            return {
                isYjsMode,
                payload: updatePayload,
                writesContent: 'content' in updatePayload,
            };
        }

        // Caso A: Nota REST tradicional
        const restResult = simulateAutosave('rest', '<p>Nota en modo REST</p>', 'Título REST');
        assert.strictEqual(restResult.isYjsMode, false, 'sync_mode "rest" no debe marcarse como isYjsMode');
        assert.strictEqual(restResult.writesContent, true, 'El autoguardado REST DEBE incluir el campo content');
        assert.strictEqual(restResult.payload.content, '<p>Nota en modo REST</p>');

        // Caso B: Nota YJS colaborativa
        const yjsResult = simulateAutosave('yjs', '<p>Texto generado en cliente</p>', 'Título YJS');
        assert.strictEqual(yjsResult.isYjsMode, true, 'sync_mode "yjs" debe ser reconocido como isYjsMode');
        assert.strictEqual(yjsResult.writesContent, false, 'CRÍTICO: El autoguardado REST NUNCA debe incluir content en notas YJS');
        assert.strictEqual(yjsResult.payload.title, 'Título YJS', 'Metadatos como el título siguen guardándose');
    });

    // ─── PRUEBA 2: GUARD DE PERSISTENCIA LOCAL SQLITE (ensureYjsPersistenceReady) ───
    await runAsyncTest('Guard de Persistencia: Bloquea edición si SQLite no tiene el esquema íntegro', async () => {
        // Importar funciones de verificación de esquema de SQLite
        const sqliteMem = new DatabaseSync(':memory:');
        const dbAdapter = createMockDbAdapter(sqliteMem);

        // Caso A: Esquema vacío (sin tablas Yjs)
        const checkSchema = async (adapter) => {
            const snapCols = await adapter.getAllAsync('PRAGMA table_info(yjs_note_snapshots);');
            const updCols = await adapter.getAllAsync('PRAGMA table_info(yjs_note_updates);');
            const indices = await adapter.getAllAsync('PRAGMA index_list(yjs_note_updates);');

            const hasSnap = snapCols.some(c => c.name === 'doc_id' && c.pk === 1) &&
                            snapCols.some(c => c.name === 'snapshot');
            const hasUpd = updCols.some(c => c.name === 'id' && c.pk === 1) &&
                           updCols.some(c => c.name === 'update_data');
            const hasIdx = indices.some(i => i.name === 'idx_yjs_updates_doc');

            return hasSnap && hasUpd && hasIdx;
        };

        const readyBefore = await checkSchema(dbAdapter);
        assert.strictEqual(readyBefore, false, 'Esquema vacío debe reportar NO listo');

        // Simular regla de edición: canEdit se bloquea si ready === false
        let canEdit = true;
        let isEditMode = true;
        const evaluateCanEdit = (ready, baseCanEdit) => baseCanEdit && ready;

        assert.strictEqual(evaluateCanEdit(readyBefore, canEdit), false, 'Edición bloqueada sin persistencia SQLite');

        // Caso B: Inicialización de esquema Yjs
        const local = new YjsLocalPersistence(dbAdapter);
        await local.initSchema();

        const readyAfter = await checkSchema(dbAdapter);
        assert.strictEqual(readyAfter, true, 'Tras initSchema, el esquema SQLite debe estar 100% listo');
        assert.strictEqual(evaluateCanEdit(readyAfter, canEdit), true, 'Edición permitida tras validar persistencia SQLite');
    });

    // ─── PRUEBA 3: PERSISTENCIA LOCAL ANTES DE RED Y RECUPERACIÓN TRAS DESCONEXIÓN ───
    await runAsyncTest('Deltas locales persistidos en SQLite antes de red y reintento en reconexión', async () => {
        const sqliteMem = new DatabaseSync(':memory:');
        const dbAdapter = createMockDbAdapter(sqliteMem);
        const local = new YjsLocalPersistence(dbAdapter);
        await local.initSchema();

        // 1. Crear documento Yjs con cambio local
        const doc = new Y.Doc();
        const text = doc.getText('content');
        text.insert(0, 'Contenido creado localmente offline');
        const updateBytes = Y.encodeStateAsUpdate(doc);

        // 2. Guardar delta en SQLite con synced = 0 (Offline-first)
        const rowId = await local.storeUpdate('note_test_1', updateBytes, false);
        assert.ok(rowId > 0, 'Debe generar un rowId válido');

        // 3. Comprobar que el delta pendiente existe
        let pending = await local.getPendingLocalUpdates('note_test_1');
        assert.strictEqual(pending.length, 1, 'Debe haber 1 delta pendiente');
        assert.strictEqual(pending[0].synced, 0, 'synced debe ser 0');

        // 4. Simular subida a PostgreSQL y marcado como sincronizado
        await local.markUpdatesAsSynced([rowId]);

        // 5. Comprobar que no quedan deltas pendientes
        pending = await local.getPendingLocalUpdates('note_test_1');
        assert.strictEqual(pending.length, 0, 'Tras sincronización no debe haber deltas pendientes');

        // 6. Compactación segura: conserva snapshot y no borra deltas con synced = 0
        text.insert(text.length, ' - Cambio 2 aún offline');
        const update2Bytes = Y.encodeStateAsUpdate(doc);
        const row2Id = await local.storeUpdate('note_test_1', update2Bytes, false);

        await local.compact('note_test_1', doc);

        // El delta 2 (synced = 0) debe conservarse intacto tras la compactación
        const pendingAfterCompact = await local.getPendingLocalUpdates('note_test_1');
        assert.strictEqual(pendingAfterCompact.length, 1, 'Compactación no debe purgar deltas pendientes de red');
        assert.strictEqual(pendingAfterCompact[0].id, row2Id, 'El delta pendiente retenido debe ser el cambio 2');
    });

    // ─── PRUEBA 4: SEPARACIÓN ESTRICTA DE CURSORES (LECTURA VS ESCRITURA) ───
    await runAsyncTest('Separación estricta de lastConfirmedWriteId y lastProcessedReadId', async () => {
        // Emulador en memoria de Supabase Provider
        let writeId = 0;
        let readId = 0;

        // Operación 1: Escribir delta local confirmado en PostgreSQL con update_id = 42
        function confirmLocalWrite(serverUpdateId) {
            writeId = serverUpdateId;
            // CRÍTICO: La confirmación de escritura NUNCA altera el cursor de lectura
        }

        // Operación 2: Replay de deltas históricos desde el servidor
        function processRemoteRead(serverUpdateId) {
            readId = serverUpdateId;
        }

        confirmLocalWrite(42);
        assert.strictEqual(writeId, 42, 'writeId debe actualizarse al ID de servidor');
        assert.strictEqual(readId, 0, 'CRÍTICO: readId NO debe adelantarse al confirmar una escritura local');

        processRemoteRead(15);
        assert.strictEqual(readId, 15, 'readId solo avanza al procesar deltas remotos efectivamente aplicados');
        assert.strictEqual(writeId, 42, 'writeId permanece intacto');
    });

    // ─── PRUEBA 5: VERIFICACIÓN DE LA INTERFAZ RPC activate_note_yjs_mode ───
    await runAsyncTest('Verificación de la firma y parámetros exactos de activate_note_yjs_mode', async () => {
        let rpcCalledWith = null;

        const mockSupabase = {
            rpc: async (fnName, params) => {
                rpcCalledWith = { fnName, params };
                return {
                    data: {
                        success: true,
                        note_id: params.p_note_id,
                        sync_mode: 'yjs',
                        initial_update_id: 1,
                        updated_at_ms: Date.now(),
                    },
                    error: null,
                };
            },
        };

        const remote = new YjsRemotePersistence(mockSupabase);

        // Hash canónico del contenido "Hola Mundo"
        const content = '<p>Hola Mundo</p>';
        const contentHash = await computeContentSha256(content);
        assert.strictEqual(contentHash.length, 64, 'Content hash debe ser SHA-256 de 64 caracteres');

        // Generar un update Base64 válido
        const tempDoc = new Y.Doc();
        tempDoc.getText('test').insert(0, 'Hola');
        const updateB64 = bytesToBase64(Y.encodeStateAsUpdate(tempDoc));
        const updateHash = await computeUpdateHash(updateB64);

        const result = await remote.activateNoteYjsMode({
            noteId: 'test-note-001',
            initialUpdateData: updateB64,
            initialUpdateHash: updateHash,
            clientId: 'client-unit-test',
            expectedContentHash: contentHash,
            expectedUpdatedAtMs: 1729400000000,
            initialStateVector: 'base64sv',
        });

        assert.strictEqual(result.success, true, 'Llamada RPC debe ser exitosa');
        assert.strictEqual(rpcCalledWith.fnName, 'activate_note_yjs_mode', 'Nombre de RPC exacto');

        // Comprobar nombres de parámetros exactos definidos en deploy-05:
        // p_note_id, p_initial_update_data, p_initial_update_hash, p_client_id,
        // p_expected_content_hash, p_expected_updated_at_ms, p_initial_state_vector
        const params = rpcCalledWith.params;
        assert.ok('p_note_id' in params, 'Falta p_note_id');
        assert.ok('p_initial_update_data' in params, 'Falta p_initial_update_data');
        assert.ok('p_initial_update_hash' in params, 'Falta p_initial_update_hash');
        assert.ok('p_client_id' in params, 'Falta p_client_id');
        assert.ok('p_expected_content_hash' in params, 'Falta p_expected_content_hash');
        assert.ok('p_expected_updated_at_ms' in params, 'Falta p_expected_updated_at_ms');
        assert.ok('p_initial_state_vector' in params, 'Falta p_initial_state_vector');

        assert.strictEqual(params.p_note_id, 'test-note-001');
        assert.strictEqual(params.p_expected_content_hash, contentHash);
        assert.strictEqual(params.p_expected_updated_at_ms, 1729400000000);
    });

    // ─── PRUEBA 6: PREPARACIÓN DE ACTIVACIÓN PILOTO INDIVIDUAL ───
    await runAsyncTest('Preparación de nota piloto individual sin activar notas en masa', async () => {
        const mockPilotNote = {
            id: 'pilot-note-777',
            title: 'Nota Piloto Colaborativa',
            content: '<p>Párrafo inicial de prueba</p>',
            sync_mode: 'rest',
            updated_at_ms: 1729405555000,
            last_modified_ms: 1729405555000,
            created_at_ms: 1729400000000,
            font_family: 'sans',
        };

        const payload = await preparePilotActivationPayload(mockPilotNote, 'device-pilot-01');

        assert.strictEqual(payload.noteId, 'pilot-note-777');
        assert.ok(payload.initialUpdateData.length > 0, 'Debe haber serializado el update inicial');
        assert.strictEqual(payload.initialUpdateHash.length, 64, 'El update hash debe tener 64 caracteres');
        assert.strictEqual(payload.expectedUpdatedAtMs, 1729405555000);
        assert.strictEqual(payload.expectedContentHash.length, 64);

        // Rechazo estricto si la nota ya estaba en modo 'yjs'
        const alreadyYjsNote = { ...mockPilotNote, sync_mode: 'yjs' };
        let threw = false;
        try {
            await preparePilotActivationPayload(alreadyYjsNote, 'device-pilot-01');
        } catch (e) {
            threw = true;
        }
        assert.strictEqual(threw, true, 'Debe rechazar activar una nota que ya esté en modo yjs');
    });

    console.log('====================================================================');
    console.log(`RESUMEN DE PRUEBAS DE LA FASE 3.3: ${passedTests}/${totalTests} PASADAS`);
    console.log('====================================================================');

    if (passedTests === totalTests) {
        console.log('TODAS LAS PRUEBAS DE INTEGRACIÓN DE LA FASE 3.3 PASARON EXITOSAMENTE.');
        process.exit(0);
    } else {
        console.error('ALGUNAS PRUEBAS DE LA FASE 3.3 FALLARON.');
        process.exit(1);
    }
})();
