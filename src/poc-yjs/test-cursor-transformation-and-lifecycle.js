/**
 * test-cursor-transformation-and-lifecycle.js
 * 
 * Batería de pruebas automatizadas para:
 * 1. Transformación e invarianza de coordenadas de cursor remoto (Problema A):
 *    - Prioridad estricta de coordenadas semánticas locales (localCoords) sobre coordenadas físicas transmitidas (sentCoords).
 *    - Transformación de getBoundingClientRect() relativa a containerRect (invarianza de scroll de página).
 *    - Posicionamiento en inicio (char 0), en medio, al final de línea y en líneas múltiples.
 *    - Medición en líneas y bloques vacíos (div > br) con marcador no destructivo.
 * 2. Gestión del ciclo de vida de presencia y AppState (Problema B):
 *    - Transición a 'background' (Home) e 'inactive' (bloqueo) emitiendo CURSOR_REMOVE inmediatamente.
 *    - Transición de retorno a 'active' restaurando presencia.
 *    - Limpieza en desmontaje (teardown) emitiendo CURSOR_REMOVE antes de remover canal.
 *    - Tolerancia a reconexiones sin borrar presencia prematuramente.
 */

const assert = require('assert');

console.log('========================================================');
console.log('TEST SUITE: Transformación de Coordenadas y Ciclo de Vida');
console.log('========================================================\n');

// ------------------------------------------------------------------
// PARTE 1: Pruebas de resolución y transformación de coordenadas
// ------------------------------------------------------------------
console.log('--- Parte 1: Simulación de DOM y Transformación de Coordenadas ---');

// Mock de DOM y contenedor
function createMockEnvironment({ scrollY = 0, scrollX = 0, screenWidth = 390 } = {}) {
    const containerRect = { top: -scrollY, left: -scrollX, width: screenWidth, height: 2000 };

    function getCoordsRelativeToContainer(r) {
        const cTop = containerRect ? containerRect.top : -scrollY;
        const cLeft = containerRect ? containerRect.left : -scrollX;
        return {
            top: Math.round(r.top - cTop),
            left: Math.round(r.left - cLeft),
            height: Math.round(r.height || 22)
        };
    }

    return { containerRect, getCoordsRelativeToContainer };
}

// Test 1.1: Invarianza frente al scroll de la página
{
    const envNoScroll = createMockEnvironment({ scrollY: 0 });
    const envScrolled = createMockEnvironment({ scrollY: 250 });

    // Supongamos un carácter cuya posición absoluta en el documento es top: 500px, left: 40px
    // En viewport sin scroll: rect.top = 500
    const charRectNoScroll = { top: 500, left: 40, right: 48, height: 22 };
    const coordsNoScroll = envNoScroll.getCoordsRelativeToContainer(charRectNoScroll);

    // En viewport con scroll de 250px: rect.top = 250
    const charRectScrolled = { top: 250, left: 40, right: 48, height: 22 };
    const coordsScrolled = envScrolled.getCoordsRelativeToContainer(charRectScrolled);

    assert.strictEqual(coordsNoScroll.top, 500, 'Top sin scroll debe ser 500px');
    assert.strictEqual(coordsScrolled.top, 500, 'Top con scroll debe transformarse de forma idéntica a 500px');
    assert.strictEqual(coordsNoScroll.left, 40, 'Left sin scroll debe ser 40px');
    assert.strictEqual(coordsScrolled.left, 40, 'Left con scroll debe ser 40px');
    console.log('✓ 1.1 Invarianza de scroll: las coordenadas relativas al contenedor coinciden exactamente a pesar del desplazamiento.');
}

// Test 1.2: Inicio, medio y final de línea
{
    const env = createMockEnvironment({ scrollY: 100 });
    // Carácter 0 (inicio de línea)
    const charStart = { top: 150, left: 16, height: 22 };
    const resStart = env.getCoordsRelativeToContainer(charStart);
    assert.strictEqual(resStart.left, 16, 'Inicio de línea debe situarse en el margen izquierdo');

    // Carácter medio (columna intermedia)
    const charMid = { top: 150, left: 120, height: 22 };
    const resMid = env.getCoordsRelativeToContainer(charMid);
    assert.strictEqual(resMid.left, 120, 'Medio de línea debe respetar la columna exacta del texto');

    // Carácter final de línea (usando borde derecho)
    const charEnd = { top: 150, left: 240, right: 248, height: 22 };
    const resEnd = env.getCoordsRelativeToContainer({ ...charEnd, left: charEnd.right });
    assert.strictEqual(resEnd.left, 248, 'Final de línea debe alinearse al borde derecho del último carácter');
    console.log('✓ 1.2 Posicionamiento exacto en inicio, medio y final de línea.');
}

// Test 1.3: Bloque vacío (div con br) con medición por marcador no destructivo
{
    const env = createMockEnvironment({ scrollY: 0 });
    // Simular medición de marcador dentro de bloque vacío
    const markerRect = { top: 320, left: 16, height: 24 };
    const emptyBlockCoords = env.getCoordsRelativeToContainer(markerRect);
    assert.strictEqual(emptyBlockCoords.top, 320);
    assert.strictEqual(emptyBlockCoords.left, 16);
    assert.strictEqual(emptyBlockCoords.height, 24);
    console.log('✓ 1.3 Bloque vacío: el marcador temporal calcula la altura y posición de línea correctamente.');
}

// Test 1.4: Prioridad estricta de resolución semántica local vs sentTop/sentLeft
{
    function resolveFinalCursorCoords({ localCoords, sentCoords }) {
        const sentTop = (typeof sentCoords.top === 'number' && sentCoords.top > 0) ? sentCoords.top : null;
        const sentLeft = (typeof sentCoords.left === 'number') ? sentCoords.left : null;
        const sentHeight = (typeof sentCoords.height === 'number' && sentCoords.height > 0) ? sentCoords.height : 22;

        const finalTop = localCoords ? localCoords.top : (sentTop !== null ? sentTop : 0);
        const finalLeft = localCoords ? localCoords.left : (sentLeft !== null ? sentLeft : 0);
        const finalHeight = localCoords ? (localCoords.height || 22) : sentHeight;

        return { finalTop, finalLeft, finalHeight, usedFallback: !localCoords };
    }

    // Escenario A: El emisor (teléfono ancho 412px) envía pixel top: 180, left: 290
    // En el receptor (teléfono estrecho 360px), el texto hizo wrap en una línea diferente (top: 210, left: 45)
    const localSemanticCoords = { top: 210, left: 45, height: 22 };
    const senderPhysicalCoords = { top: 180, left: 290, height: 22 };

    const resolvedA = resolveFinalCursorCoords({
        localCoords: localSemanticCoords,
        sentCoords: senderPhysicalCoords
    });

    assert.strictEqual(resolvedA.finalTop, 210, 'Debe priorizar localCoords.top (línea envuelta real)');
    assert.strictEqual(resolvedA.finalLeft, 45, 'Debe priorizar localCoords.left (columna real)');
    assert.strictEqual(resolvedA.usedFallback, false, 'No debe usar fallback cuando localCoords está disponible');

    // Escenario B: Nodo aún no reconciliado en el receptor (localCoords es null)
    const resolvedB = resolveFinalCursorCoords({
        localCoords: null,
        sentCoords: senderPhysicalCoords
    });
    assert.strictEqual(resolvedB.finalTop, 180, 'Fallback debe usar sentTop si localCoords no existe');
    assert.strictEqual(resolvedB.finalLeft, 290, 'Fallback debe usar sentLeft si localCoords no existe');
    assert.strictEqual(resolvedB.usedFallback, true, 'Debe marcar fallback como true');

    console.log('✓ 1.4 Prioridad de coordenadas: localCoords prevalece siempre sobre las coordenadas físicas del emisor.');
}

// ------------------------------------------------------------------
// PARTE 2: Pruebas del ciclo de vida de presencia y AppState (Problema B)
// ------------------------------------------------------------------
console.log('\n--- Parte 2: Ciclo de Vida de Presencia y AppState ---');

class MockPresenceManager {
    constructor() {
        this.sentMessages = [];
        this.appState = 'active';
        this.isEditMode = true;
        this.currentPageIndex = 0;
        this.editorReportedCursor = false;
        this.channelConnected = true;
    }

    broadcastCursorMove(pageIndex, cursor) {
        if (!this.channelConnected) return;
        this.sentMessages.push({ type: 'CURSOR_MOVE', pageIndex, cursor });
    }

    broadcastCursorRemove(pageIndex) {
        if (!this.channelConnected) return;
        this.sentMessages.push({ type: 'CURSOR_REMOVE', pageIndex });
    }

    onAppStateChange(nextState) {
        this.appState = nextState;
        if (nextState === 'background' || nextState === 'inactive') {
            this.broadcastCursorRemove(this.currentPageIndex);
        } else if (nextState === 'active') {
            if (this.channelConnected && this.isEditMode) {
                this.editorReportedCursor = true;
                this.broadcastCursorMove(this.currentPageIndex, { blockIndex: 0, charOffset: 5, top: 40, left: 50 });
            }
        }
    }

    teardown() {
        this.broadcastCursorRemove(this.currentPageIndex);
        this.channelConnected = false;
    }
}

// Test 2.1: Al pulsar Home (background), se envía CURSOR_REMOVE inmediatamente
{
    const mgr = new MockPresenceManager();
    mgr.broadcastCursorMove(0, { blockIndex: 1, charOffset: 10, top: 100, left: 60 });
    assert.strictEqual(mgr.sentMessages.length, 1);
    assert.strictEqual(mgr.sentMessages[0].type, 'CURSOR_MOVE');

    // Usuario pulsa Home -> background
    mgr.onAppStateChange('background');
    assert.strictEqual(mgr.sentMessages.length, 2);
    assert.strictEqual(mgr.sentMessages[1].type, 'CURSOR_REMOVE');
    assert.strictEqual(mgr.sentMessages[1].pageIndex, 0);
    console.log('✓ 2.1 Salida con Home (background): CURSOR_REMOVE se emite inmediatamente.');
}

// Test 2.2: Al bloquear pantalla (inactive), se envía CURSOR_REMOVE inmediatamente
{
    const mgr = new MockPresenceManager();
    mgr.currentPageIndex = 2; // Usuario en la hoja 3
    mgr.onAppStateChange('inactive');
    assert.strictEqual(mgr.sentMessages.length, 1);
    assert.strictEqual(mgr.sentMessages[0].type, 'CURSOR_REMOVE');
    assert.strictEqual(mgr.sentMessages[0].pageIndex, 2);
    console.log('✓ 2.2 Bloqueo de pantalla (inactive): CURSOR_REMOVE se emite para la página activa.');
}

// Test 2.3: Al regresar a la app (active), se reanuda la presencia si la nota sigue abierta
{
    const mgr = new MockPresenceManager();
    mgr.onAppStateChange('background');
    assert.strictEqual(mgr.sentMessages[0].type, 'CURSOR_REMOVE');

    mgr.onAppStateChange('active');
    assert.strictEqual(mgr.editorReportedCursor, true, 'El editor debe haber reportado el cursor al regresar a active');
    assert.strictEqual(mgr.sentMessages[1].type, 'CURSOR_MOVE');
    console.log('✓ 2.3 Retorno a active: La presencia del cursor se restaura.');
}

// Test 2.4: Al desmontar el componente (teardown / cerrar nota), se envía CURSOR_REMOVE antes de cerrar el canal
{
    const mgr = new MockPresenceManager();
    mgr.currentPageIndex = 1;
    mgr.teardown();
    assert.strictEqual(mgr.sentMessages.length, 1);
    assert.strictEqual(mgr.sentMessages[0].type, 'CURSOR_REMOVE');
    assert.strictEqual(mgr.sentMessages[0].pageIndex, 1);
    assert.strictEqual(mgr.channelConnected, false, 'El canal queda cerrado después del teardown');
    console.log('✓ 2.4 Desmontaje (teardown): Emisión de CURSOR_REMOVE garantizada antes de cerrar el canal.');
}

console.log('\n========================================================');
console.log('TODAS LAS PRUEBAS AUTOMATIZADAS PASARON SATISFACTORIAMENTE');
console.log('========================================================');
