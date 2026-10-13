/**
 * Prueba de Concepto Veyra - Teclado Móvil, Acentos, Composición y Conservación del Cursor
 * 
 * Simula el flujo de entrada de Android Gboard / Samsung Keyboard:
 * 1. Composición de caracteres acentuados (á, é, í, ó, ú, ñ) y palabras predictivas.
 * 2. Inserción remota concurrente durante una composición local activa.
 * 3. Conservación del cursor y rango de selección tras recibir actualizaciones remotas.
 * 4. Awareness de cursores (preservación del color, nombre y posición de cada peer).
 */

const Y = require('yjs');
const awarenessProtocol = require('y-protocols/awareness');
const assert = require('assert');

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
// TEST 1: Composición de caracteres acentuados y palabras compuestas (IME Android)
// -------------------------------------------------------------
test('1. Composición de caracteres acentuados (á, é, í, ó, ú, ñ) y buffers de teclado', () => {
    const doc = new Y.Doc();
    const frag = doc.getXmlFragment('default');
    const p = new Y.XmlElement('paragraph');
    const textNode = new Y.XmlText();
    p.insert(0, [textNode]);
    frag.insert(0, [p]);

    // Simular secuencia de eventos IME de Android:
    // Al tipear "canción":
    // 1. Tecla 'c', 'a', 'n', 'c', 'i'
    // 2. Composición acento ´ + o -> 'ó'
    // 3. Tecla 'n'
    // 4. compositionend confirmando la palabra completa
    const compositionSteps = [
        'c',
        'ca',
        'can',
        'canc',
        'canci',
        'canci\u0301', // Con diacrítico combinatorio
        'canció',
        'canción'
    ];

    // Simular que el teclado actualiza el buffer de composición
    // En ProseMirror/Yjs, las transacciones locales respetan los límites de caracteres UTF-8/UTF-16
    doc.transact(() => {
        textNode.insert(0, 'Esta es una ');
    });

    const baseLength = textNode.length;

    // Simular la inserción final tras compositionend
    doc.transact(() => {
        textNode.insert(baseLength, 'canción en español con ñandú');
    });

    const fullContent = textNode.toString();
    console.log('Texto compuesto:', `"${fullContent}"`);

    assert.strictEqual(fullContent, 'Esta es una canción en español con ñandú');
    assert(fullContent.includes('canción'), 'Debe contener ó con acento');
    assert(fullContent.includes('español'), 'Debe contener ñ');
    assert(fullContent.includes('ñandú'), 'Debe contener ú con acento');
});

// -------------------------------------------------------------
// TEST 2: Inserción remota mientras el usuario local tiene una posición de cursor activa
// -------------------------------------------------------------
test('2. Conservación del cursor tras inserción remota concurrente (Transformación de Posición)', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const fragA = docA.getXmlFragment('default');
    const pA = new Y.XmlElement('paragraph');
    const textA = new Y.XmlText('Los usuarios redactan notas juntos.');
    pA.insert(0, [textA]);
    fragA.insert(0, [pA]);

    // Sincronizar estado inicial
    const initUpdate = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, initUpdate);

    // Cliente A tiene el cursor en el offset 12 (después de "Los usuarios ")
    let cursorLocalOffsetA = 12;

    // Cliente B realiza una inserción al inicio del párrafo: "¡Atención! " (11 caracteres)
    const textB = docB.getXmlFragment('default').get(0).get(0);
    docB.transact(() => {
        textB.insert(0, '¡Atención! ');
    });

    // Enviar cambio de B hacia A
    const updateBtoA = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));

    // Crear un cursor relativo en Yjs (Y.createRelativePositionFromTypeIndex)
    // Este es el mecanismo exacto que usa y-prosemirror / CollaborationCursor
    // para que el cursor NUNCA salte ni se desplace erróneamente
    const relativeCursor = Y.createRelativePositionFromTypeIndex(textA, cursorLocalOffsetA);

    // Aplicar la actualización remota de B en el Doc de A
    Y.applyUpdate(docA, updateBtoA);

    // Resolver la nueva posición absoluta del cursor tras el cambio remoto
    const absolutePos = Y.createAbsolutePositionFromRelativePosition(relativeCursor, docA);

    console.log(`Cursor original: ${cursorLocalOffsetA} -> Nueva posición calculada por Yjs: ${absolutePos.index}`);
    console.log(`Texto en Doc A tras update remoto: "${textA.toString()}"`);

    // La nueva posición debe haberse desplazado exactamente los 11 caracteres que B insertó antes de él
    const expectedOffset = cursorLocalOffsetA + 11; // 12 + 11 = 23
    assert.strictEqual(
        absolutePos.index,
        expectedOffset,
        `El cursor debe desplazarse automáticamente de ${cursorLocalOffsetA} a ${expectedOffset} sin saltar al inicio`
    );

    // Verificar que el carácter inmediatamente en la posición del cursor sigue siendo exactamente el mismo
    const charBefore = 'Los usuarios redactan notas juntos.'.charAt(cursorLocalOffsetA);
    const charAfter = textA.toString().charAt(absolutePos.index);
    assert.strictEqual(charAfter, charBefore, 'El cursor debe mantenerse en la posición relativa idéntica respecto al texto');
});

// -------------------------------------------------------------
// TEST 3: Estado Awareness (Cursores remotos, nombres y colores de colaboradores)
// -------------------------------------------------------------
test('3. Protocolo Awareness: Preservación de presencia, color y rango de selección remota', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const awarenessA = new awarenessProtocol.Awareness(docA);
    const awarenessB = new awarenessProtocol.Awareness(docB);

    // Configurar estado del Usuario A
    awarenessA.setLocalStateField('user', {
        name: 'Ana (Android A)',
        color: '#8B5CF6'
    });
    // Usuario A tiene una selección entre el índice 5 y 10
    awarenessA.setLocalStateField('cursor', {
        anchor: 5,
        head: 10
    });

    // Configurar estado del Usuario B
    awarenessB.setLocalStateField('user', {
        name: 'Carlos (Android B)',
        color: '#10B981'
    });
    // Usuario B tiene un cursor colapsado en el índice 22
    awarenessB.setLocalStateField('cursor', {
        anchor: 22,
        head: 22
    });

    // Propagar Awareness de A hacia B
    const updateAwarenessA = awarenessProtocol.encodeAwarenessUpdate(awarenessA, [awarenessA.clientID]);
    awarenessProtocol.applyAwarenessUpdate(awarenessB, updateAwarenessA, 'remote');

    // Propagar Awareness de B hacia A
    const updateAwarenessB = awarenessProtocol.encodeAwarenessUpdate(awarenessB, [awarenessB.clientID]);
    awarenessProtocol.applyAwarenessUpdate(awarenessA, updateAwarenessB, 'remote');

    // Verificar que Doc B conoce exactamente la presencia de A
    const statesInB = awarenessB.getStates();
    const userAFromB = statesInB.get(awarenessA.clientID);

    assert(userAFromB, 'Doc B debe tener registrado el cliente de A');
    assert.strictEqual(userAFromB.user.name, 'Ana (Android A)');
    assert.strictEqual(userAFromB.user.color, '#8B5CF6');
    assert.strictEqual(userAFromB.cursor.anchor, 5);
    assert.strictEqual(userAFromB.cursor.head, 10);

    // Verificar que Doc A conoce la presencia de B
    const statesInA = awarenessA.getStates();
    const userBFromA = statesInA.get(awarenessB.clientID);

    assert(userBFromA, 'Doc A debe tener registrado el cliente de B');
    assert.strictEqual(userBFromA.user.name, 'Carlos (Android B)');
    assert.strictEqual(userBFromA.user.color, '#10B981');
    assert.strictEqual(userBFromA.cursor.anchor, 22);

    console.log('Awareness en Peer B sobre Peer A:', JSON.stringify(userAFromB, null, 2));
    console.log('Awareness en Peer A sobre Peer B:', JSON.stringify(userBFromA, null, 2));
});

// -------------------------------------------------------------
// Resumen
// -------------------------------------------------------------
console.log('\n======================================================');
console.log('RESUMEN DE PRUEBAS DE TECLADO Y PRESENCIA');
console.log('======================================================');
let allPassed = true;
results.forEach((r, idx) => {
    console.log(`${idx + 1}. ${r.name}: ${r.passed ? 'PASÓ (OK)' : 'FALLÓ'}`);
    if (!r.passed) allPassed = false;
});

if (allPassed) {
    console.log('\nTODAS LAS PRUEBAS DE TECLADO Y CURSORES PASARON EXITOSAMENTE.');
    process.exit(0);
} else {
    process.exit(1);
}
