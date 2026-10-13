/**
 * Prueba de Concepto Veyra - Concurrencia y Convergencia Yjs
 * 
 * Verifica matemáticamente y con AST estructurado las 6 condiciones CRDT:
 * 1. Inserciones simultáneas en diferentes párrafos.
 * 2. Inserciones simultáneas en el mismo párrafo.
 * 3. Eliminaciones e inserciones concurrentes.
 * 4. Intercambio de actualizaciones en distinto orden (conmutatividad).
 * 5. Convergencia del contenido estructurado (marcas y listas).
 * 6. Deshacer cambios locales sin revertir cambios remotos (UndoManager).
 */

const Y = require('yjs');
const assert = require('assert');

// Helper: Serializa un Y.Doc (XmlFragment de Tiptap) a un AST JSON estructurado
function toStructuredJSON(doc, fragmentName = 'default') {
    const fragment = doc.getXmlFragment(fragmentName);
    return serializeNode(fragment);
}

function serializeNode(node) {
    if (node instanceof Y.XmlFragment) {
        return {
            type: 'fragment',
            children: node.toArray().map(serializeNode)
        };
    } else if (node instanceof Y.XmlElement) {
        return {
            type: 'element',
            name: node.nodeName,
            attributes: node.getAttributes(),
            children: node.toArray().map(serializeNode)
        };
    } else if (node instanceof Y.XmlText) {
        return {
            type: 'text',
            content: node.toString(),
            delta: node.toDelta()
        };
    }
    return null;
}

// Helper: Sincroniza dos docs bidireccionalmente
function syncDocs(docA, docB) {
    const stateVectorA = Y.encodeStateVector(docA);
    const stateVectorB = Y.encodeStateVector(docB);
    const diffBtoA = Y.encodeStateAsUpdate(docB, stateVectorA);
    const diffAtoB = Y.encodeStateAsUpdate(docA, stateVectorB);
    Y.applyUpdate(docA, diffBtoA);
    Y.applyUpdate(docB, diffAtoB);
}

// Runner de pruebas
const results = [];
function test(name, fn) {
    try {
        console.log(`\n======================================================`);
        console.log(`[TEST] ${name}`);
        console.log(`======================================================`);
        fn();
        console.log(`>>> RESULTADO: PASÓ exitosamente`);
        results.push({ name, passed: true });
    } catch (err) {
        console.error(`>>> RESULTADO: FALLÓ`);
        console.error(err);
        results.push({ name, passed: false, error: err.message });
    }
}

// -------------------------------------------------------------
// TEST 1: Inserciones simultáneas en diferentes párrafos
// -------------------------------------------------------------
test('1. Inserciones simultáneas en diferentes párrafos', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Estado inicial: dos párrafos
    const fragA = docA.getXmlFragment('default');
    const p1A = new Y.XmlElement('paragraph');
    const t1A = new Y.XmlText('Primer párrafo');
    p1A.insert(0, [t1A]);

    const p2A = new Y.XmlElement('paragraph');
    const t2A = new Y.XmlText('Segundo párrafo');
    p2A.insert(0, [t2A]);

    fragA.insert(0, [p1A, p2A]);

    // Sincronizar A hacia B
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Usuario A edita párrafo 1 concurrentemente
    const p1TargetA = docA.getXmlFragment('default').get(0).get(0);
    p1TargetA.insert(p1TargetA.length, ' - editado por Usuario A');

    // Usuario B edita párrafo 2 concurrentemente
    const p2TargetB = docB.getXmlFragment('default').get(1).get(0);
    p2TargetB.insert(p2TargetB.length, ' - editado por Usuario B');

    // Sincronizar cambios concurrentes
    syncDocs(docA, docB);

    const astA = toStructuredJSON(docA);
    const astB = toStructuredJSON(docB);

    assert.deepStrictEqual(astA, astB, 'Los árboles AST estructurados deben ser exactamente idénticos');
    
    // Verificar contenido específico
    const textP1 = astA.children[0].children[0].content;
    const textP2 = astA.children[1].children[0].content;
    assert.strictEqual(textP1, 'Primer párrafo - editado por Usuario A');
    assert.strictEqual(textP2, 'Segundo párrafo - editado por Usuario B');
    console.log('P1 convergido:', textP1);
    console.log('P2 convergido:', textP2);
});

// -------------------------------------------------------------
// TEST 2: Inserciones simultáneas en el mismo párrafo
// -------------------------------------------------------------
test('2. Inserciones simultáneas en el mismo párrafo (colisión en misma posición)', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Estado inicial: párrafo con "Hola Mundo"
    const fragA = docA.getXmlFragment('default');
    const pA = new Y.XmlElement('paragraph');
    const tA = new Y.XmlText('Hola Mundo');
    pA.insert(0, [tA]);
    fragA.insert(0, [pA]);

    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Ambos usuarios insertan en offset 4 (después de "Hola")
    const textA = docA.getXmlFragment('default').get(0).get(0);
    const textB = docB.getXmlFragment('default').get(0).get(0);

    textA.insert(4, ' querido');
    textB.insert(4, ' hermoso');

    syncDocs(docA, docB);

    const astA = toStructuredJSON(docA);
    const astB = toStructuredJSON(docB);

    assert.deepStrictEqual(astA, astB, 'Ambos documentos deben converger al mismo contenido');
    const finalContent = astA.children[0].children[0].content;
    console.log('Texto convergido con inserción concurrente en el mismo offset:', `"${finalContent}"`);
    
    // El texto debe contener ambas palabras y converger de manera determinista
    assert(finalContent.includes('querido'), 'Debe contener la inserción del Usuario A');
    assert(finalContent.includes('hermoso'), 'Debe contener la inserción del Usuario B');
    assert(finalContent.startsWith('Hola ') && finalContent.endsWith(' Mundo'), 'Debe conservar el prefijo y sufijo');
});

// -------------------------------------------------------------
// TEST 3: Eliminaciones e inserciones concurrentes
// -------------------------------------------------------------
test('3. Eliminaciones e inserciones concurrentes', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const fragA = docA.getXmlFragment('default');
    const pA = new Y.XmlElement('paragraph');
    const tA = new Y.XmlText('El veloz murciélago hindú comía feliz cardillo');
    pA.insert(0, [tA]);
    fragA.insert(0, [pA]);

    syncDocs(docA, docB);

    const textA = docA.getXmlFragment('default').get(0).get(0);
    const textB = docB.getXmlFragment('default').get(0).get(0);

    // Usuario A borra "murciélago hindú " (offset 9, longitud 17)
    textA.delete(9, 17);

    // Usuario B concurrentemente inserta adjetivo dentro de esa frase ("muy ") en offset 9
    textB.insert(9, 'muy ');

    syncDocs(docA, docB);

    const astA = toStructuredJSON(docA);
    const astB = toStructuredJSON(docB);

    assert.deepStrictEqual(astA, astB, 'La eliminación e inserción concurrente converge exactamente');
    const finalContent = astA.children[0].children[0].content;
    console.log('Texto resultante:', `"${finalContent}"`);
    assert(finalContent.includes('El veloz '), 'Debe preservar el inicio');
    assert(finalContent.includes('comía feliz cardillo'), 'Debe preservar el final');
});

// -------------------------------------------------------------
// TEST 4: Intercambio de actualizaciones en distinto orden (Conmutatividad)
// -------------------------------------------------------------
test('4. Intercambio de actualizaciones en distinto orden (Propiedad Conmutativa)', () => {
    const docSource = new Y.Doc();
    const frag = docSource.getXmlFragment('default');
    const p = new Y.XmlElement('paragraph');
    const text = new Y.XmlText('Base');
    p.insert(0, [text]);
    frag.insert(0, [p]);

    const initialUpdate = Y.encodeStateAsUpdate(docSource);

    // Generar 3 updates consecutivos en docSource
    const updates = [];
    docSource.on('update', (u) => updates.push(u));

    text.insert(4, ' uno');
    text.insert(8, ' dos');
    text.insert(12, ' tres');

    assert.strictEqual(updates.length, 3, 'Deben existir 3 actualizaciones separadas');

    // Doc C recibe en orden inverso: 2, 0, 1
    const docC = new Y.Doc();
    Y.applyUpdate(docC, initialUpdate);
    Y.applyUpdate(docC, updates[2]);
    Y.applyUpdate(docC, updates[0]);
    Y.applyUpdate(docC, updates[1]);

    // Doc D recibe en orden directo: 0, 1, 2
    const docD = new Y.Doc();
    Y.applyUpdate(docD, initialUpdate);
    Y.applyUpdate(docD, updates[0]);
    Y.applyUpdate(docD, updates[1]);
    Y.applyUpdate(docD, updates[2]);

    const astC = toStructuredJSON(docC);
    const astD = toStructuredJSON(docD);

    assert.deepStrictEqual(astC, astD, 'Doc C y Doc D deben ser idénticos sin importar el orden de llegada');
    console.log('Contenido convergido independientemente del orden:', astC.children[0].children[0].content);
    assert.strictEqual(astC.children[0].children[0].content, 'Base uno dos tres');
});

// -------------------------------------------------------------
// TEST 5: Convergencia de contenido estructurado (Formato enriquecido y listas)
// -------------------------------------------------------------
test('5. Convergencia de contenido estructurado (Negrita, Cursiva y Listas)', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Inicial: lista de viñetas con 2 items
    const fragA = docA.getXmlFragment('default');
    const bulletList = new Y.XmlElement('bulletList');

    const item1 = new Y.XmlElement('listItem');
    const p1 = new Y.XmlElement('paragraph');
    const t1 = new Y.XmlText();
    t1.insert(0, 'Comprar leche');
    p1.insert(0, [t1]);
    item1.insert(0, [p1]);

    const item2 = new Y.XmlElement('listItem');
    const p2 = new Y.XmlElement('paragraph');
    const t2 = new Y.XmlText();
    t2.insert(0, 'Comprar pan');
    p2.insert(0, [t2]);
    item2.insert(0, [p2]);

    bulletList.insert(0, [item1, item2]);
    fragA.insert(0, [bulletList]);

    syncDocs(docA, docB);

    // Usuario A añade formato en negrita a "leche" en el item 1
    const targetT1_A = docA.getXmlFragment('default').get(0).get(0).get(0).get(0);
    // Aplicar mark bold a "leche" (offset 8, longitud 5)
    targetT1_A.format(8, 5, { bold: true });

    // Usuario B añade un tercer item a la lista concurrentemente
    const listB = docB.getXmlFragment('default').get(0);
    const item3 = new Y.XmlElement('listItem');
    const p3 = new Y.XmlElement('paragraph');
    const t3 = new Y.XmlText();
    t3.insert(0, 'Comprar café');
    t3.format(8, 4, { italic: true }); // "café" en cursiva
    p3.insert(0, [t3]);
    item3.insert(0, [p3]);
    listB.insert(2, [item3]);

    syncDocs(docA, docB);

    const astA = toStructuredJSON(docA);
    const astB = toStructuredJSON(docB);

    assert.deepStrictEqual(astA, astB, 'El árbol de listas y formatos debe converger exactamente');
    console.log('Estructura de lista convergida:', JSON.stringify(astA, null, 2));

    const items = astA.children[0].children;
    assert.strictEqual(items.length, 3, 'La lista debe tener 3 elementos');
    // Verificar delta con negrita
    const delta1 = items[0].children[0].children[0].delta;
    assert.deepStrictEqual(delta1, [
        { insert: 'Comprar ' },
        { insert: 'leche', attributes: { bold: true } }
    ]);
});

// -------------------------------------------------------------
// TEST 6: Deshacer cambios locales sin revertir cambios remotos
// -------------------------------------------------------------
test('6. Deshacer cambios locales (UndoManager) sin revertir cambios remotos', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const ORIGIN_LOCAL_A = 'client-A';
    const ORIGIN_REMOTE_B = 'client-B';

    // Fragmento inicial
    const fragA = docA.getXmlFragment('default');
    const pA = new Y.XmlElement('paragraph');
    const tA = new Y.XmlText('Original');
    pA.insert(0, [tA]);
    fragA.insert(0, [pA]);

    syncDocs(docA, docB);

    // Configurar UndoManager en Cliente A rastreando ÚNICAMENTE ORIGIN_LOCAL_A
    const undoManagerA = new Y.UndoManager(fragA, {
        trackedOrigins: new Set([ORIGIN_LOCAL_A])
    });

    // 1. Cliente A realiza un cambio local
    docA.transact(() => {
        const textNodeA = docA.getXmlFragment('default').get(0).get(0);
        textNodeA.insert(textNodeA.length, ' + Modificación Local A');
    }, ORIGIN_LOCAL_A);

    console.log('Doc A tras cambio local:', docA.getXmlFragment('default').get(0).get(0).toString());

    // 2. Cliente B realiza un cambio concurrente
    docB.transact(() => {
        const textNodeB = docB.getXmlFragment('default').get(0).get(0);
        textNodeB.insert(0, '[REMOTO B] ');
    }, ORIGIN_REMOTE_B);

    // Enviar cambio de B hacia A (Doc A aplica con origen ORIGIN_REMOTE_B)
    const updateBtoA = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));
    docA.transact(() => {
        Y.applyUpdate(docA, updateBtoA);
    }, ORIGIN_REMOTE_B);

    console.log('Doc A tras recibir cambio remoto de B:', docA.getXmlFragment('default').get(0).get(0).toString());

    // 3. Cliente A presiona DESHACER (Undo)
    assert.strictEqual(undoManagerA.undoStack.length, 1, 'Debe haber exactamente 1 acción local en el stack de deshacer');
    undoManagerA.undo();

    const textAfterUndo = docA.getXmlFragment('default').get(0).get(0).toString();
    console.log('Doc A tras UNDO local:', textAfterUndo);

    // COMPROBACIONES CRÍTICAS:
    // a) El cambio remoto de B DEBE PERMANECER intacto
    assert(textAfterUndo.includes('[REMOTO B]'), 'CRÍTICO: El cambio remoto de B NO debe haber sido revertido por el Undo local de A');
    // b) El cambio local de A DEBE HABER SIDO REVERTIDO
    assert(!textAfterUndo.includes('+ Modificación Local A'), 'CRÍTICO: La modificación local de A debe haber sido eliminada');
    // c) El texto original debe estar intacto
    assert(textAfterUndo.includes('Original'), 'El texto base original debe persistir');

    // Sincronizar de vuelta con B para verificar convergencia final
    syncDocs(docA, docB);
    const astA = toStructuredJSON(docA);
    const astB = toStructuredJSON(docB);
    assert.deepStrictEqual(astA, astB, 'Ambos clientes convergen tras el Undo selectivo');
    console.log('Texto convergido final tras Undo:', astA.children[0].children[0].content);
});

// -------------------------------------------------------------
// Resumen final de resultados
// -------------------------------------------------------------
console.log('\n======================================================');
console.log('RESUMEN DE PRUEBAS DE CONCURRENCIA');
console.log('======================================================');
let allPassed = true;
results.forEach((r, idx) => {
    console.log(`${idx + 1}. ${r.name}: ${r.passed ? 'PASÓ (OK)' : 'FALLÓ'}`);
    if (!r.passed) allPassed = false;
});

if (allPassed) {
    console.log('\nTODAS LAS 6 PRUEBAS CRDT FUERON EJECUTADAS Y PASARON.');
    process.exit(0);
} else {
    console.error('\nALGUNAS PRUEBAS FALLARON.');
    process.exit(1);
}
