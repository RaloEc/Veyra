/**
 * test-pilot-initialization-and-repair.js
 * 
 * Verificación integral automatizada para:
 * 1. Inicialización canónica de Y.Doc preservando IDs reales, orden y texto áéíóúñ.
 * 2. Exportación y aplicación binaria a un segundo Y.Doc.
 * 3. Renderizado y esquema ProseMirror/Tiptap de los fragmentos generados.
 * 4. Integridad del bundle web y soporte de activePageId dinámico.
 * 5. Plan de reparación aditivo de la nota piloto (sin escrituras en BD).
 * 6. Guard estricto de aislamiento: Bloqueo de las 78 notas en producción.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const Y = require('yjs');
const { Schema } = require('@tiptap/pm/model');
const { schema } = require('@tiptap/pm/schema-basic');
const { initProseMirrorDoc } = require('y-prosemirror');

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

const { buildInitialYDocFromNote, parseHtmlToParagraphs, computeContentSha256 } = require('./pilotActivationStrategy');
const { preparePilotRepairPlan, PILOT_NOTE_ID } = require('./pilotRepairStrategy');
const { getTiptapHtml } = require('./editor-web/htmlTemplate');
const { bytesToBase64, base64ToBytes } = require('./yjsLocalPersistence');

console.log('====================================================================');
console.log('  TEST: VERIFICACIÓN INTEGRAL DE INICIALIZACIÓN Y REPARACIÓN YJS');
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

(async () => {
    const PILOT_PAGE_ID = '4d6fbbfc-b338-4ca9-9bf1-5c5e7da9c4b9';
    const ORIGINAL_TEXT = 'Texto original de la nota piloto con acentos áéíóúñ, diéresis ü, eñe Ñ y símbolos: @#€$%!';
    const PILOT_HTML = `<p>${ORIGINAL_TEXT}</p><p>Segundo párrafo con formato adicional.</p>`;

    const mockPilotNote = {
        id: PILOT_NOTE_ID,
        title: 'Nota Piloto Veyra',
        content: JSON.stringify({
            isPaginated: true,
            version: 2,
            layout: 'vertical',
            pages: [
                {
                    id: PILOT_PAGE_ID,
                    content: PILOT_HTML,
                },
            ],
        }),
        created_at_ms: 1700000000000,
        updated_at_ms: 1700000001000,
        is_pinned: 0,
        sync_mode: 'rest',
        font_family: 'sans',
    };

    // ─── PRUEBA 1: CONSTRUCCIÓN CANÓNICA Y CONSERVACIÓN DE IDS Y ÁÉÍÓÚÑ ───
    runTest('buildInitialYDocFromNote preserva el ID real de página y caracteres áéíóúñ', () => {
        const doc = buildInitialYDocFromNote(mockPilotNote);

        // 1. Metadatos
        const meta = doc.getMap('meta');
        assert.strictEqual(meta.get('title'), 'Nota Piloto Veyra');
        assert.strictEqual(meta.get('layout'), 'vertical');

        // 2. Orden de páginas
        const pageOrder = doc.getArray('pageOrder');
        assert.strictEqual(pageOrder.length, 1);
        assert.strictEqual(pageOrder.get(0), PILOT_PAGE_ID, 'El ID de página debe ser exactamente el ID original');

        // 3. Fragmento real de la página
        const pageFragment = doc.getXmlFragment(PILOT_PAGE_ID);
        assert.ok(pageFragment.length >= 2, 'Debe contener al menos 2 párrafos');
        const fragJson = pageFragment.toJSON();
        assert.ok(fragJson.includes(ORIGINAL_TEXT), 'El fragmento debe conservar el texto íntegro con áéíóúñ');

        // 4. Fragmento 'default' como alias/espejo
        const defaultFragment = doc.getXmlFragment('default');
        assert.ok(defaultFragment.length >= 2, 'El fragmento default debe contener los párrafos como espejo');
        assert.ok(defaultFragment.toJSON().includes(ORIGINAL_TEXT));
    });

    // ─── PRUEBA 2: EXPORTACIÓN BINARIA Y APLICACIÓN A SEGUNDO Y.DOC ───
    runTest('Exportación binaria y reconciliación exacta en un segundo Y.Doc', () => {
        const sourceDoc = buildInitialYDocFromNote(mockPilotNote);
        const updateBytes = Y.encodeStateAsUpdate(sourceDoc);

        // Segundo Y.Doc vacío
        const targetDoc = new Y.Doc();
        Y.applyUpdate(targetDoc, updateBytes);

        // Comprobar que targetDoc tiene los mismos datos
        const targetPageOrder = targetDoc.getArray('pageOrder').toArray();
        assert.deepStrictEqual(targetPageOrder, [PILOT_PAGE_ID]);

        const targetFrag = targetDoc.getXmlFragment(PILOT_PAGE_ID);
        assert.ok(targetFrag.toJSON().includes(ORIGINAL_TEXT));

        const targetDefaultFrag = targetDoc.getXmlFragment('default');
        assert.ok(targetDefaultFrag.toJSON().includes(ORIGINAL_TEXT));
    });

    // ─── PRUEBA 3: CONVERSIÓN Y COMPATIBILIDAD CON PROSEMIRROR / TIPTAP SCHEMA ───
    runTest('Compatibilidad ProseMirror/Tiptap: initProseMirrorDoc parsea los párrafos sin error', () => {
        const doc = buildInitialYDocFromNote(mockPilotNote);
        const pageFragment = doc.getXmlFragment(PILOT_PAGE_ID);

        const { doc: pmDoc } = initProseMirrorDoc(pageFragment, schema);
        assert.ok(pmDoc, 'ProseMirror doc debe inicializarse');
        assert.strictEqual(pmDoc.type.name, 'doc');
        assert.ok(pmDoc.textContent.includes(ORIGINAL_TEXT), 'El texto ProseMirror debe incluir áéíóúñ');
        assert.strictEqual(pmDoc.childCount, 2, 'Debe tener exactamente 2 nodos de párrafo');
        assert.strictEqual(pmDoc.child(0).type.name, 'paragraph');
    });

    // ─── PRUEBA 4: CONSERVACIÓN ESTRICTA EN NOTAS MULTIPÁGINA ───
    runTest('Notas multipágina: conserva IDs, orden y contenido independiente por página', () => {
        const multiNote = {
            id: 'uuid-multi-123',
            title: 'Nota 3 Páginas',
            content: JSON.stringify({
                isPaginated: true,
                version: 2,
                layout: 'horizontal',
                pages: [
                    { id: 'page-alpha', content: '<p>Contenido Hoja 1</p>' },
                    { id: 'page-beta', content: '<p>Contenido Hoja 2 con números 12345</p>' },
                    { id: 'page-gamma', content: '<p>Contenido Hoja 3 con acentos áéí</p>' },
                ],
            }),
            created_at_ms: Date.now(),
            updated_at_ms: Date.now(),
            is_pinned: 0,
        };

        const doc = buildInitialYDocFromNote(multiNote);
        const pageOrder = doc.getArray('pageOrder').toArray();
        assert.deepStrictEqual(pageOrder, ['page-alpha', 'page-beta', 'page-gamma']);

        assert.ok(doc.getXmlFragment('page-alpha').toJSON().includes('Contenido Hoja 1'));
        assert.ok(doc.getXmlFragment('page-beta').toJSON().includes('Contenido Hoja 2 con números 12345'));
        assert.ok(doc.getXmlFragment('page-gamma').toJSON().includes('Contenido Hoja 3 con acentos áéí'));

        // Las páginas no se mezclan entre sí
        assert.strictEqual(doc.getXmlFragment('page-alpha').toJSON().includes('Hoja 2'), false);
    });

    // ─── PRUEBA 5: BUNDLE WEB Y HTML TEMPLATE CON ACTIVEPAGEID DINÁMICO ───
    runTest('getTiptapHtml inyecta VEYRA_INITIAL_PAGE_ID correctamente en el WebView', () => {
        const html = getTiptapHtml({
            isDark: true,
            accentColor: '#10B981',
            activePageId: PILOT_PAGE_ID,
        });

        assert.ok(html.includes(`window.VEYRA_INITIAL_PAGE_ID = "${PILOT_PAGE_ID}";`), 'Debe inyectar la página activa inicial');
        assert.ok(html.includes('window.veyraSetPage'), 'El bundle compilado debe exponer window.veyraSetPage');
        assert.ok(html.includes('window.veyraApplyUpdate'), 'El bundle compilado debe exponer window.veyraApplyUpdate');
    });

    // ─── PRUEBA 6: PLAN DE REPARACIÓN ADITIVO DE LA NOTA PILOTO ───
    await runAsyncTest('preparePilotRepairPlan genera delta aditivo compatible preservando historial previo', async () => {
        // Simular que existía una actualización previa defectuosa (escrita en page_1)
        const legacyDoc = new Y.Doc();
        legacyDoc.transact(() => {
            legacyDoc.getMap('meta').set('title', 'Nota Piloto');
            legacyDoc.getArray('pageOrder').push(['page_1']);
            const p = new Y.XmlElement('paragraph');
            p.insert(0, [new Y.XmlText('Texto inicial en fragmento antiguo')]);
            legacyDoc.getXmlFragment('page_1').insert(0, [p]);
        });
        const legacyUpdateBytes = Y.encodeStateAsUpdate(legacyDoc);

        // Generar plan de reparación a partir del contenido original
        const plan = await preparePilotRepairPlan(mockPilotNote, [legacyUpdateBytes]);

        assert.strictEqual(plan.noteId, PILOT_NOTE_ID);
        assert.strictEqual(plan.targetPageId, PILOT_PAGE_ID);
        assert.ok(plan.pageOrder.includes(PILOT_PAGE_ID), 'pageOrder debe incluir el ID real');
        assert.ok(plan.updateBase64.length > 0, 'Debe generar el delta base64');
        assert.ok(plan.updateHash && plan.updateHash.length === 64, 'Debe calcular hash SHA-256 canónico');

        // Aplicar el delta de reparación sobre un documento que ya tenía el update previo
        const repairedDoc = new Y.Doc();
        Y.applyUpdate(repairedDoc, legacyUpdateBytes);
        Y.applyUpdate(repairedDoc, base64ToBytes(plan.updateBase64));

        // Verificar que el fragmento real de la página tiene el texto original
        const repairedTargetFrag = repairedDoc.getXmlFragment(PILOT_PAGE_ID);
        assert.ok(repairedTargetFrag.length > 0);
        assert.ok(repairedTargetFrag.toJSON().includes(ORIGINAL_TEXT));

        // Verificar que el fragmento 'default' también tiene el texto
        const repairedDefaultFrag = repairedDoc.getXmlFragment('default');
        assert.ok(repairedDefaultFrag.length > 0);
        assert.ok(repairedDefaultFrag.toJSON().includes(ORIGINAL_TEXT));

        // Verificar que el historial anterior no fue borrado
        assert.ok(repairedDoc.getXmlFragment('page_1').length > 0, 'El fragmento anterior permanece en el historial Yjs');
    });

    // ─── PRUEBA 7: GUARD ESTRICTO DE SEGURIDAD (PROTECCIÓN DE LAS 78 NOTAS) ───
    await runAsyncTest('Guard de Seguridad: Rechaza cualquier intento de reparación en notas no-piloto', async () => {
        const otherNoteIds = [
            '11111111-2222-3333-4444-555555555555',
            'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            'random-production-note-id',
        ];

        for (const otherId of otherNoteIds) {
            let errorCaught = null;
            try {
                await preparePilotRepairPlan({
                    id: otherId,
                    title: 'Nota de Producción Protegida',
                    content: '<p>Contenido intocable</p>',
                    created_at_ms: Date.now(),
                    updated_at_ms: Date.now(),
                    is_pinned: 0,
                }, []);
            } catch (err) {
                errorCaught = err;
            }

            assert.ok(errorCaught, `Debe rechazar la nota ${otherId}`);
            assert.ok(errorCaught.message.includes('estrictamente restringida a la nota'), 'El mensaje debe indicar la restricción estricta');
        }
    });

    // ─── PRUEBA 8: IDEMPOTENCIA DE SEGUNDA EJECUCIÓN (CLIENT-SIDE) ───
    await runAsyncTest('Idempotencia: Segunda ejecución detecta alreadyRepaired=true y no genera deltas ni duplicados', async () => {
        // Estado base con el update original en page_1
        const legacyDoc = new Y.Doc();
        legacyDoc.getArray('pageOrder').push(['page_1']);
        legacyDoc.getXmlFragment('page_1').insert(0, [new Y.XmlElement('paragraph')]);
        const legacyBytes = Y.encodeStateAsUpdate(legacyDoc);

        // Primera ejecución: genera el delta de reparación
        const plan1 = await preparePilotRepairPlan(mockPilotNote, [legacyBytes]);
        assert.strictEqual(plan1.alreadyRepaired, false);
        assert.ok(plan1.updateBase64.length > 0);

        // Reconstruir el estado resultante combinando legacy + repair
        const repairedDoc = new Y.Doc();
        Y.applyUpdate(repairedDoc, legacyBytes);
        Y.applyUpdate(repairedDoc, base64ToBytes(plan1.updateBase64));
        const repairedBytes = Y.encodeStateAsUpdate(repairedDoc);

        // Segunda ejecución sobre el estado ya reparado:
        const plan2 = await preparePilotRepairPlan(mockPilotNote, [repairedBytes]);
        assert.strictEqual(plan2.alreadyRepaired, true, 'Debe detectar que ya está reparada');
        assert.strictEqual(plan2.updateBase64, '', 'No debe generar ningún delta en segunda ejecución');
        assert.strictEqual(plan2.updateHash, '', 'Hash debe ser vacío');
        assert.strictEqual(plan2.targetPageId, PILOT_PAGE_ID);
        assert.ok(plan2.pageOrder.includes(PILOT_PAGE_ID));

        // Verificar que el número de párrafos no aumentó
        assert.strictEqual(plan2.paragraphsCount, 2, 'Los párrafos deben mantenerse exactamente en 2');
    });

    // ─── PRUEBA 9: DETERMINISMO CRIPTOGRÁFICO ANTE REINTENTOS Y CONCURRENCIA ───
    await runAsyncTest('Determinismo: Dos llamadas independientes generan deltas binarios y hashes SHA-256 idénticos', async () => {
        const legacyDoc = new Y.Doc();
        legacyDoc.getArray('pageOrder').push(['page_1']);
        const legacyBytes = Y.encodeStateAsUpdate(legacyDoc);

        // Dos ejecuciones simulando dos clientes/reintentos concurrentes desde el mismo estado previo
        const planA = await preparePilotRepairPlan(mockPilotNote, [legacyBytes]);
        const planB = await preparePilotRepairPlan(mockPilotNote, [legacyBytes]);

        assert.strictEqual(planA.updateBase64, planB.updateBase64, 'El contenido Base64 del delta debe ser idéntico byte por byte');
        assert.strictEqual(planA.updateHash, planB.updateHash, 'El hash SHA-256 canónico debe ser estrictamente idéntico');
        assert.strictEqual(planA.updateHash.length, 64);
    });

    // ─── PRUEBA 10: SIMULACIÓN DE RPC Y CONCURRENCIA (DOBLE BARRERA CONTRA CONDICIONES DE CARRERA) ───
    await runAsyncTest('Doble Barrera: La RPC de Supabase detecta duplicados por hash sin insertar filas duplicadas', async () => {
        const legacyDoc = new Y.Doc();
        legacyDoc.getArray('pageOrder').push(['page_1']);
        const legacyBytes = Y.encodeStateAsUpdate(legacyDoc);
        const plan = await preparePilotRepairPlan(mockPilotNote, [legacyBytes]);

        // Simular la tabla y lógica de la RPC append_note_yjs_update de PostgreSQL
        const mockDbUpdates = [];
        let advisoryLockAcquired = false;

        async function mockAppendRpc(noteId, clientId, updateData, updateHash) {
            // 1. Simular pg_advisory_xact_lock
            advisoryLockAcquired = true;

            // 2. Comprobar si ya existe por hash canónico (Idempotencia en servidor)
            const existing = mockDbUpdates.find(u => u.note_id === noteId && u.update_hash === updateHash);
            if (existing) {
                // Comprobación binaria estricta de coherencia
                if (existing.update_data !== updateData) {
                    throw new Error('Conflicto de integridad: hash coincide pero binario difiere');
                }
                return { success: true, update_id: existing.id, duplicate: true };
            }

            // 3. Insertar si no existía
            const newId = mockDbUpdates.length + 1;
            mockDbUpdates.push({
                id: newId,
                note_id: noteId,
                client_id: clientId,
                update_data: updateData,
                update_hash: updateHash,
            });
            return { success: true, update_id: newId, duplicate: false };
        }

        // Intento 1: Primera escritura
        const res1 = await mockAppendRpc(PILOT_NOTE_ID, 'client_A', plan.updateBase64, plan.updateHash);
        assert.strictEqual(res1.success, true);
        assert.strictEqual(res1.duplicate, false);
        assert.strictEqual(res1.update_id, 1);
        assert.strictEqual(mockDbUpdates.length, 1);

        // Intento 2: Reintento concurrente o reejecución de Client B con el mismo delta
        const res2 = await mockAppendRpc(PILOT_NOTE_ID, 'client_B', plan.updateBase64, plan.updateHash);
        assert.strictEqual(res2.success, true);
        assert.strictEqual(res2.duplicate, true, 'Debe indicar duplicate=true');
        assert.strictEqual(res2.update_id, 1, 'Debe retornar el ID del update preexistente');
        assert.strictEqual(mockDbUpdates.length, 1, 'NO debe haber añadido filas duplicadas');

        // Yjs CRDT: Aplicar el mismo delta dos veces a un doc no duplica párrafos
        const consumerDoc = new Y.Doc();
        Y.applyUpdate(consumerDoc, legacyBytes);
        Y.applyUpdate(consumerDoc, base64ToBytes(plan.updateBase64));
        const lenAfterFirst = consumerDoc.getXmlFragment(PILOT_PAGE_ID).length;
        Y.applyUpdate(consumerDoc, base64ToBytes(plan.updateBase64)); // Replay del mismo delta
        const lenAfterSecond = consumerDoc.getXmlFragment(PILOT_PAGE_ID).length;
        assert.strictEqual(lenAfterFirst, lenAfterSecond, 'La longitud de fragmentos en Yjs debe ser idéntica tras re-aplicar');
    });

    // ─── PRUEBA 11: PRESERVACIÓN DE CONTENIDO ORIGINAL Y CARACTERES ÁÉÍÓÚÑ ───
    runTest('Preservación de caracteres en español y no-mutación de notes.content', () => {
        // Verificar que mockPilotNote.content no fue mutado
        const parsedOriginal = JSON.parse(mockPilotNote.content);
        assert.ok(parsedOriginal.pages[0].content.includes('acentos áéíóúñ, diéresis ü, eñe Ñ y símbolos: @#€$%!'));
        assert.strictEqual(mockPilotNote.id, PILOT_NOTE_ID);
    });

    console.log('====================================================================');
    console.log(`  RESULTADO: ${passedTests}/${totalTests} PRUEBAS PASADAS`);
    console.log('====================================================================');

    if (passedTests !== totalTests) {
        process.exit(1);
    }
})();
