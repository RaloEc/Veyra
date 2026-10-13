/**
 * Suite de Pruebas Automatizadas de Persistencia Local SQLite,
 * Modelo Multi-Hoja Yjs y Reconciliación Remota.
 * 
 * Verifica las 7 condiciones obligatorias:
 * 1. Cerrar y reabrir un documento desde SQLite sin conexión.
 * 2. Recuperar todos los cambios locales pendientes (synced = 0).
 * 3. Cerrar ambos clientes y posteriormente recuperar el estado persistido desde un único cliente.
 * 4. Incorporar actualizaciones concurrentes sin pérdida (Anti-LWW).
 * 5. Compactar snapshots y restaurar el mismo contenido.
 * 6. Agregar, eliminar y reordenar hojas sin confundir sus identidades estables.
 * 7. Mantener título, formatos y metadatos tras la restauración.
 */

const Y = require('yjs');
const assert = require('assert');

// Conversión binaria Uint8Array <-> Base64
function bytesToBase64(bytes) {
    return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(base64) {
    return new Uint8Array(Buffer.from(base64, 'base64'));
}

// Adaptador SQLite simulado en memoria con soporte de transacciones y operaciones preparadas
class MockSQLiteAdapter {
    constructor() {
        this.snapshots = new Map(); // doc_id -> { snapshot, state_vector, updated_at_ms }
        this.updates = [];          // Array<{ id, doc_id, update_data, synced, created_at_ms }>
        this.autoId = 1;
        this.inTransaction = false;
        this.transactionBackup = null;
    }

    async execAsync(sql) {
        if (sql.includes('BEGIN')) {
            this.inTransaction = true;
            this.transactionBackup = {
                snapshots: new Map(this.snapshots),
                updates: [...this.updates],
            };
        } else if (sql.includes('COMMIT')) {
            this.inTransaction = false;
            this.transactionBackup = null;
        } else if (sql.includes('ROLLBACK')) {
            if (this.transactionBackup) {
                this.snapshots = this.transactionBackup.snapshots;
                this.updates = this.transactionBackup.updates;
            }
            this.inTransaction = false;
        }
        return Promise.resolve();
    }

    async runAsync(sql, params = []) {
        if (sql.includes('INSERT INTO yjs_note_updates')) {
            const [doc_id, update_data, synced, created_at_ms] = params;
            const id = this.autoId++;
            this.updates.push({ id, docId: doc_id, updateData: update_data, synced, createdAtMs: created_at_ms });
            return Promise.resolve({ lastInsertRowId: id, changes: 1 });
        }

        if (sql.includes('INSERT INTO yjs_note_snapshots')) {
            const [doc_id, snapshot, state_vector, updated_at_ms] = params;
            this.snapshots.set(doc_id, { doc_id, snapshot, state_vector, updated_at_ms });
            return Promise.resolve({ changes: 1 });
        }

        if (sql.includes('UPDATE yjs_note_updates SET synced = 1')) {
            const ids = params;
            let changes = 0;
            this.updates.forEach(u => {
                if (ids.includes(u.id)) {
                    u.synced = 1;
                    changes++;
                }
            });
            return Promise.resolve({ changes });
        }

        if (sql.includes('DELETE FROM yjs_note_updates WHERE doc_id = ? AND synced = 1')) {
            const [doc_id] = params;
            const before = this.updates.length;
            this.updates = this.updates.filter(u => !(u.docId === doc_id && u.synced === 1));
            return Promise.resolve({ changes: before - this.updates.length });
        }

        return Promise.resolve({ changes: 0 });
    }

    async getFirstAsync(sql, params = []) {
        if (sql.includes('FROM yjs_note_snapshots WHERE doc_id = ?')) {
            const [doc_id] = params;
            return Promise.resolve(this.snapshots.get(doc_id) || null);
        }
        return Promise.resolve(null);
    }

    async getAllAsync(sql, params = []) {
        if (sql.includes('FROM yjs_note_updates WHERE doc_id = ? AND synced = 0')) {
            const [doc_id] = params;
            return Promise.resolve(this.updates.filter(u => u.docId === doc_id && u.synced === 0));
        }

        if (sql.includes('FROM yjs_note_updates WHERE doc_id = ? ORDER BY id ASC')) {
            const [doc_id] = params;
            return Promise.resolve(this.updates.filter(u => u.docId === doc_id));
        }

        return Promise.resolve([]);
    }
}

// Importar o definir la persistencia y el modelo para Node.js
const { YjsLocalPersistence } = require('./yjsLocalPersistence');
const { YjsNoteModel } = require('./yjsNoteModel');

const results = [];
async function runTest(name, fn) {
    try {
        console.log(`\n======================================================`);
        console.log(`[TEST] ${name}`);
        console.log(`======================================================`);
        await fn();
        console.log(`>>> RESULTADO: PASÓ exitosamente`);
        results.push({ name, passed: true });
    } catch (err) {
        console.error(`>>> RESULTADO: FALLÓ`);
        console.error(err);
        results.push({ name, passed: false, error: err.message });
    }
}

async function main() {
    // -------------------------------------------------------------
    // PRUEBA 1: Cerrar y reabrir un documento desde SQLite sin conexión
    // -------------------------------------------------------------
    await runTest('1. Cerrar y reabrir un documento desde SQLite sin conexión', async () => {
        const db = new MockSQLiteAdapter();
        const persistence = new YjsLocalPersistence(db);
        await persistence.initSchema();

        const docId = 'note-test-offline-1';
        const model1 = new YjsNoteModel();
        model1.initializeDefaults({ title: 'Nota Offline' });

        // Añadir contenido en la primera página
        const page1Id = model1.getPageIds()[0];
        const frag1 = model1.getPageFragment(page1Id);
        const p = new Y.XmlElement('paragraph');
        const text = new Y.XmlText('Contenido guardado en SQLite');
        p.insert(0, [text]);
        frag1.insert(0, [p]);

        // Guardar snapshot base en SQLite
        await persistence.compact(docId, model1.doc);

        // Simular cierre completo de la app (destruir instancia en memoria)
        const closedMemory = null;

        // Reabrir app y restaurar documento desde SQLite
        const restored = await persistence.loadDocument(docId);
        assert(restored.hasSnapshot, 'Debe haber cargado desde el snapshot de SQLite');

        const modelRestored = new YjsNoteModel(restored.doc);
        assert.strictEqual(modelRestored.getTitle(), 'Nota Offline', 'El título debe coincidir');
        const restoredPageId = modelRestored.getPageIds()[0];
        const contentStr = modelRestored.getPageFragment(restoredPageId).get(0).get(0).toString();
        assert.strictEqual(contentStr, 'Contenido guardado en SQLite');
        console.log('Documento restaurado tras cierre:', modelRestored.toStructuredSnapshot().metadata.title);
    });

    // -------------------------------------------------------------
    // PRUEBA 2: Recuperar todos los cambios locales pendientes (synced = 0)
    // -------------------------------------------------------------
    await runTest('2. Recuperar todos los cambios locales pendientes de sincronizar', async () => {
        const db = new MockSQLiteAdapter();
        const persistence = new YjsLocalPersistence(db);

        const docId = 'note-pending-test';
        const model = new YjsNoteModel();
        model.initializeDefaults({ title: 'Borrador Offline' });

        // Escuchar deltas y guardarlos como NO sincronizados (synced = 0)
        const pendingIds = [];
        model.doc.on('update', async (update, origin) => {
            if (origin === 'user-typing') {
                const id = await persistence.storeUpdate(docId, update, false);
                pendingIds.push(id);
            }
        });

        // Simular que el usuario realiza 3 ediciones consecutivas offline
        model.setTitle('Título Offline Modificado', 'user-typing');
        model.setLayout('horizontal', 'user-typing');
        const pageId = model.getPageIds()[0];
        model.doc.transact(() => {
            model.getPageFragment(pageId).get(0).get(0).insert(0, 'Párrafo modificado sin red. ');
        }, 'user-typing');

        // Esperar guardado
        await new Promise(r => setTimeout(r, 20));

        // Consultar deltas pendientes
        const pending = await persistence.getPendingLocalUpdates(docId);
        assert.strictEqual(pending.length, 3, 'Deben existir exactamente 3 deltas pendientes');
        console.log(`Deltas pendientes encontrados: ${pending.length}`);

        // Simular que reconecta y Supabase confirma la recepción de los primeros 2 deltas
        await persistence.markUpdatesAsSynced([pending[0].id, pending[1].id]);

        const remainingPending = await persistence.getPendingLocalUpdates(docId);
        assert.strictEqual(remainingPending.length, 1, 'Debe quedar exactamente 1 delta pendiente');
        assert.strictEqual(remainingPending[0].id, pending[2].id);
        console.log('Deltas confirmados y restantes verificados');
    });

    // -------------------------------------------------------------
    // PRUEBA 3: Cerrar ambos clientes y posteriormente recuperar el estado persistido
    // -------------------------------------------------------------
    await runTest('3. Cerrar ambos clientes y recuperar el estado persistido desde un único cliente', async () => {
        // Simular almacén de base de datos remota
        const remoteStore = {
            snapshot: null,
            updates: []
        };

        // Cliente A y Cliente B colaboran
        const clientA = new YjsNoteModel();
        clientA.initializeDefaults({ title: 'Nota Compartida' });
        const clientB = new YjsNoteModel();

        // A sincroniza estado con B
        Y.applyUpdate(clientB.doc, Y.encodeStateAsUpdate(clientA.doc));

        // A escribe
        clientA.setTitle('Proyecto Veyra 2026', 'clientA');
        const updateA = Y.encodeStateAsUpdate(clientA.doc, Y.encodeStateVector(clientB.doc));
        remoteStore.updates.push(updateA);
        Y.applyUpdate(clientB.doc, updateA);

        // B añade una nueva hoja y escribe
        const pageBId = clientB.addPage(undefined, undefined, 'clientB');
        const updateB = Y.encodeStateAsUpdate(clientB.doc, Y.encodeStateVector(clientA.doc));
        remoteStore.updates.push(updateB);
        Y.applyUpdate(clientA.doc, updateB);

        // Ambos clientes cierran sesión completamente (ambos destruidos en memoria)
        // Guardar snapshot consolidado en remoteStore
        remoteStore.snapshot = Y.encodeStateAsUpdate(clientA.doc);

        // Mucho tiempo después, un Cliente C (o A en otro teléfono) abre la nota desde la BD
        const clientC = new YjsNoteModel();
        Y.applyUpdate(clientC.doc, remoteStore.snapshot);

        assert.strictEqual(clientC.getTitle(), 'Proyecto Veyra 2026');
        assert.strictEqual(clientC.getPageIds().length, 2, 'Deben existir las 2 hojas creadas por A y B');
        console.log('Estado recuperado por Cliente C:', clientC.getTitle(), `(${clientC.getPageIds().length} hojas)`);
    });

    // -------------------------------------------------------------
    // PRUEBA 4: Incorporar actualizaciones concurrentes sin pérdida (Anti-LWW)
    // -------------------------------------------------------------
    await runTest('4. Incorporar actualizaciones concurrentes sin pérdida (Anti-LWW)', async () => {
        const docBase = new YjsNoteModel();
        docBase.initializeDefaults({ title: 'Base' });
        const pageId = docBase.getPageIds()[0];
        docBase.doc.getXmlFragment(pageId).get(0).get(0).insert(0, 'Texto inicial');

        const initialBytes = Y.encodeStateAsUpdate(docBase.doc);

        // Cliente A y Cliente B parten de la misma base
        const docA = new YjsNoteModel();
        Y.applyUpdate(docA.doc, initialBytes);
        const docB = new YjsNoteModel();
        Y.applyUpdate(docB.doc, initialBytes);

        // Cliente A modifica el título y escribe al final de la página
        docA.setTitle('Título de A', 'userA');
        docA.doc.getXmlFragment(pageId).get(0).get(0).insert(12, ' + edición A');

        // Cliente B modifica el layout y añade una segunda página
        docB.setLayout('horizontal', 'userB');
        const pageB = docB.addPage(undefined, 'hoja-b-especial', 'userB');
        docB.doc.getXmlFragment(pageB).get(0).get(0).insert(0, 'Contenido de B');

        // En lugar de que uno sobreescriba al otro (LWW), se intercambian deltas Yjs
        const deltaA = Y.encodeStateAsUpdate(docA.doc, Y.encodeStateVector(docB.doc));
        const deltaB = Y.encodeStateAsUpdate(docB.doc, Y.encodeStateVector(docA.doc));

        Y.applyUpdate(docB.doc, deltaA);
        Y.applyUpdate(docA.doc, deltaB);

        // Comprobar convergencia total
        const snapA = docA.toStructuredSnapshot();
        const snapB = docB.toStructuredSnapshot();

        assert.deepStrictEqual(snapA, snapB, 'Ambos deben converger idénticos');
        assert.strictEqual(snapA.metadata.title, 'Título de A', 'El título de A se preserva');
        assert.strictEqual(snapA.metadata.layout, 'horizontal', 'El layout de B se preserva');
        assert.strictEqual(snapA.pages.length, 2, 'Ambas hojas se conservan');
        console.log('Convergencia sin LWW:', JSON.stringify(snapA.metadata));
    });

    // -------------------------------------------------------------
    // PRUEBA 5: Compactar snapshots y restaurar el mismo contenido
    // -------------------------------------------------------------
    await runTest('5. Compactar snapshots preservando deltas no sincronizados', async () => {
        const db = new MockSQLiteAdapter();
        const persistence = new YjsLocalPersistence(db);

        const docId = 'note-compact-test';
        const model = new YjsNoteModel();
        model.initializeDefaults({ title: 'Nota Para Compactar' });

        // Guardar delta 1 (sincronizado)
        const u1 = Y.encodeStateAsUpdate(model.doc);
        const id1 = await persistence.storeUpdate(docId, u1, true);

        // Añadir texto
        model.setTitle('Título Post Delta');
        const u2 = Y.encodeStateAsUpdate(model.doc, Y.encodeStateVector(new Y.Doc()));
        // Guardar delta 2 (NO sincronizado, offline)
        const id2 = await persistence.storeUpdate(docId, u2, false);

        // Ejecutar compactación
        await persistence.compact(docId, model.doc);

        // Verificar que el delta sincronizado fue purgado
        const allUpdates = await db.getAllAsync(`SELECT * FROM yjs_note_updates WHERE doc_id = ? ORDER BY id ASC`, [docId]);
        assert.strictEqual(allUpdates.length, 1, 'Solo debe quedar el delta NO sincronizado');
        assert.strictEqual(allUpdates[0].id, id2, 'El delta pendiente debe preservarse intacto');

        // Restaurar desde SQLite
        const restored = await persistence.loadDocument(docId);
        const restoredModel = new YjsNoteModel(restored.doc);
        assert.strictEqual(restoredModel.getTitle(), 'Título Post Delta');
        console.log('Snapshot compactado y deltas pendientes preservados correctamente');
    });

    // -------------------------------------------------------------
    // PRUEBA 6: Agregar, eliminar y reordenar hojas con identificadores estables
    // -------------------------------------------------------------
    await runTest('6. Agregar, eliminar y reordenar hojas sin confundir sus identidades estables', async () => {
        const model = new YjsNoteModel();
        model.initializeDefaults({ title: 'Gestión de Hojas' });

        // Hoja 1 inicial
        const page1 = model.getPageIds()[0];
        model.getPageFragment(page1).get(0).get(0).insert(0, 'Contenido Hoja 1');

        // Agregar Hoja 2
        const page2 = model.addPage(undefined, 'page_dos');
        model.getPageFragment(page2).get(0).get(0).insert(0, 'Contenido Hoja 2');

        // Agregar Hoja 3
        const page3 = model.addPage(undefined, 'page_tres');
        model.getPageFragment(page3).get(0).get(0).insert(0, 'Contenido Hoja 3');

        assert.deepStrictEqual(model.getPageIds(), [page1, 'page_dos', 'page_tres']);

        // Reordenar: Mover Hoja 3 a la primera posición (índice 0)
        model.movePage(2, 0);
        assert.deepStrictEqual(model.getPageIds(), ['page_tres', page1, 'page_dos']);

        // Verificar que el contenido de Hoja 3 sigue intacto en su fragmento independiente
        const textH3 = model.getPageFragment('page_tres').get(0).get(0).toString();
        assert.strictEqual(textH3, 'Contenido Hoja 3', 'El contenido de Hoja 3 no debe haberse corrompido');

        // Eliminar Hoja 1 (que ahora está en el medio)
        model.removePage(page1);
        assert.deepStrictEqual(model.getPageIds(), ['page_tres', 'page_dos']);

        // Verificar que Hoja 2 sigue con su contenido exacto
        const textH2 = model.getPageFragment('page_dos').get(0).get(0).toString();
        assert.strictEqual(textH2, 'Contenido Hoja 2');
        console.log('Orden final de páginas:', model.getPageIds());
    });

    // -------------------------------------------------------------
    // PRUEBA 7: Mantener título, formatos y metadatos tras la restauración
    // -------------------------------------------------------------
    await runTest('7. Mantener título, formatos y metadatos enriquecidos tras la restauración', async () => {
        const model = new YjsNoteModel();
        model.initializeDefaults({
            title: 'Reporte Trimestral 2026',
            layout: 'horizontal',
            fontFamily: 'serif'
        });

        const pageId = model.getPageIds()[0];
        const frag = model.getPageFragment(pageId);
        
        // Párrafo con texto formateado (negrita y cursiva)
        const p = new Y.XmlElement('paragraph');
        const t = new Y.XmlText();
        t.insert(0, 'Texto con formato ');
        t.insert(18, 'importante');
        t.format(18, 10, { bold: true });
        p.insert(0, [t]);
        frag.insert(0, [p]);

        // Serializar a binario y restaurar en un nuevo modelo
        const binaryUpdate = Y.encodeStateAsUpdate(model.doc);
        const restoredModel = new YjsNoteModel();
        Y.applyUpdate(restoredModel.doc, binaryUpdate);

        const snapshot = restoredModel.toStructuredSnapshot();
        assert.strictEqual(snapshot.metadata.title, 'Reporte Trimestral 2026');
        assert.strictEqual(snapshot.metadata.layout, 'horizontal');
        assert.strictEqual(snapshot.metadata.fontFamily, 'serif');

        // Verificar delta con marca bold
        const restoredDelta = snapshot.pages[0].content.children[0].children[0].delta;
        assert.deepStrictEqual(restoredDelta, [
            { insert: 'Texto con formato ' },
            { insert: 'importante', attributes: { bold: true } }
        ]);
        console.log('Metadatos y marcas enriquecidas restaurados con éxito:', JSON.stringify(restoredDelta));
    });

    // -------------------------------------------------------------
    // RESUMEN
    // -------------------------------------------------------------
    console.log('\n======================================================');
    console.log('RESUMEN DE PRUEBAS DE PERSISTENCIA Y MODELO DE NOTAS');
    console.log('======================================================');
    let allPassed = true;
    results.forEach((r, idx) => {
        console.log(`${idx + 1}. ${r.name}: ${r.passed ? 'PASÓ (OK)' : 'FALLÓ'}`);
        if (!r.passed) allPassed = false;
    });

    if (allPassed) {
        console.log('\nTODAS LAS 7 PRUEBAS OBLIGATORIAS PASARON EXITOSAMENTE.');
        process.exit(0);
    } else {
        process.exit(1);
    }
}

main();
