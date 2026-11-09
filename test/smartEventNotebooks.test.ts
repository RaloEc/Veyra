import assert from 'assert';
import {
    getEventCategoryTag,
    extractEventTags,
    isNotebookEvent,
} from '../src/utils/eventCategoryUtils';
import { CalendarEvent, Folder, Note } from '../src/types/db';

console.log('=== Running Tests for Smart Event Notebooks & Unified Breadcrumb ===\n');

// -------------------------------------------------------------
// REQUERIMIENTO 1: Inferencia de Categoría por Etiquetas del Evento
// -------------------------------------------------------------
console.log('1. Testing getEventCategoryTag:');

// Tags de Universidad: #universidad, #uni, #facultad, etc.
assert.strictEqual(getEventCategoryTag({ tags: ['#universidad'] }), 'Universidad');
assert.strictEqual(getEventCategoryTag({ tags: '["#uni"]' }), 'Universidad');
assert.strictEqual(getEventCategoryTag({ tags: '["facultad", "calculo"]' }), 'Universidad');
assert.strictEqual(getEventCategoryTag({ tags: '#facultad' }), 'Universidad');

// Tags de Clases: #clase, #materia, #curso, etc.
assert.strictEqual(getEventCategoryTag({ tags: ['#clase'] }), 'Clases');
assert.strictEqual(getEventCategoryTag({ tags: '["materia"]' }), 'Clases');
assert.strictEqual(getEventCategoryTag({ tags: '["#curso"]' }), 'Clases');
assert.strictEqual(getEventCategoryTag({ tags: ['asignatura'] }), 'Clases');

// Tags de Trabajo: #trabajo, #work, etc.
assert.strictEqual(getEventCategoryTag({ tags: ['#trabajo'] }), 'Trabajo');
assert.strictEqual(getEventCategoryTag({ tags: '["#work"]' }), 'Trabajo');
assert.strictEqual(getEventCategoryTag({ tags: ['laboral'] }), 'Trabajo');

// Otros tags: capitalizar el primer tag relevante
assert.strictEqual(getEventCategoryTag({ tags: ['#proyecto'] }), 'Proyecto');
assert.strictEqual(getEventCategoryTag({ tags: '["idiomas", "frances"]' }), 'Idiomas');
assert.strictEqual(getEventCategoryTag({ tags: ['finanzas'] }), 'Finanzas');

// Fallback: "Eventos"
assert.strictEqual(getEventCategoryTag(null), 'Eventos');
assert.strictEqual(getEventCategoryTag({}), 'Eventos');
assert.strictEqual(getEventCategoryTag({ tags: null }), 'Eventos');
assert.strictEqual(getEventCategoryTag({ tags: '[]' }), 'Eventos');
assert.strictEqual(getEventCategoryTag({ tags: '' }), 'Eventos');

console.log('   ✓ Inferencia de categoría por etiquetas del evento funciona correctamente.');

// -------------------------------------------------------------
// REQUERIMIENTO 2: Eventos como Cuadernos Inteligentes
// -------------------------------------------------------------
console.log('\n2. Testing isNotebookEvent:');

const eventWithNotes: CalendarEvent = {
    id: 'ev-1',
    title: 'Cálculo Diferencial',
    start_time_ms: Date.now(),
    end_time_ms: Date.now() + 3600000,
    created_at_ms: Date.now(),
    updated_at_ms: Date.now(),
    deleted: 0,
};

const academicEvent: CalendarEvent = {
    id: 'ev-2',
    title: 'Física I',
    tags: JSON.stringify(['#clase', '#universidad']),
    start_time_ms: Date.now(),
    end_time_ms: Date.now() + 3600000,
    created_at_ms: Date.now(),
    updated_at_ms: Date.now(),
    deleted: 0,
};

const genericEvent: CalendarEvent = {
    id: 'ev-3',
    title: 'Dentista',
    start_time_ms: Date.now(),
    end_time_ms: Date.now() + 3600000,
    created_at_ms: Date.now(),
    updated_at_ms: Date.now(),
    deleted: 0,
};

// Debe calificar si tiene notas vinculadas
assert.strictEqual(isNotebookEvent(eventWithNotes, 2), true);

// Debe calificar si tiene tags académicos aunque no tenga notas aún
assert.strictEqual(isNotebookEvent(academicEvent, 0), true);

// Evento genérico sin notas ni tags no debe mostrarse como cuaderno
assert.strictEqual(isNotebookEvent(genericEvent, 0), false);

console.log('   ✓ Filtro de cuadernos inteligentes funciona según especificación.');

// -------------------------------------------------------------
// REQUERIMIENTO 3: Breadcrumb Unificado en la Cabecera de la Nota
// -------------------------------------------------------------
console.log('\n3. Testing Unified Breadcrumb Logic:');

interface BreadcrumbResolution {
    type: 'single' | 'dual' | 'empty';
    segment1?: { label: string; kind: 'folder' | 'category' };
    segment2?: { label: string; kind: 'event' };
    singleItem?: { label: string; kind: 'folder' | 'event' };
}

function resolveUnifiedBreadcrumb(
    folder?: Folder | null,
    event?: CalendarEvent | null,
    allFolders: Folder[] = []
): BreadcrumbResolution {
    const hasFolder = Boolean(folder && folder.name);
    const hasEvent = Boolean(event && event.title);

    if (!hasFolder && !hasEvent) {
        return { type: 'empty' };
    }

    if (hasFolder && !hasEvent) {
        return {
            type: 'single',
            singleItem: { label: folder!.name, kind: 'folder' },
        };
    }

    if (!hasFolder && hasEvent) {
        return {
            type: 'single',
            singleItem: { label: event!.title, kind: 'event' },
        };
    }

    // Both folder and event exist:
    const isSameName = folder!.name.trim().toLowerCase() === event!.title.trim().toLowerCase();

    if (isSameName) {
        // Case A: carpeta con carpeta padre -> [CarpetaPadre / TituloEvento]
        if (folder!.parent_id) {
            const parent = allFolders.find(f => f.id === folder!.parent_id);
            if (parent) {
                return {
                    type: 'dual',
                    segment1: { label: parent.name, kind: 'folder' },
                    segment2: { label: event!.title, kind: 'event' },
                };
            }
        }

        // Case B: sin carpeta padre pero el evento tiene categoría -> [Categoria / TituloEvento]
        const cat = getEventCategoryTag(event!);
        if (cat && cat !== 'Eventos') {
            return {
                type: 'dual',
                segment1: { label: cat, kind: 'category' },
                segment2: { label: event!.title, kind: 'event' },
            };
        }

        // Case C: sin padre ni categoría -> únicamente el evento [TituloEvento]
        return {
            type: 'single',
            singleItem: { label: event!.title, kind: 'event' },
        };
    }

    // Nombres distintos: [NombreCarpeta / TituloEvento]
    return {
        type: 'dual',
        segment1: { label: folder!.name, kind: 'folder' },
        segment2: { label: event!.title, kind: 'event' },
    };
}

// Escenario 1: Nombres idénticos ("Matemáticas" y "Matemáticas"), con carpeta padre ("Ingeniería")
const parentFolder: Folder = {
    id: 'f-parent',
    name: 'Ingeniería',
    created_at_ms: Date.now(),
    updated_at_ms: Date.now(),
};

const childFolder: Folder = {
    id: 'f-child',
    name: 'Matemáticas',
    parent_id: 'f-parent',
    created_at_ms: Date.now(),
    updated_at_ms: Date.now(),
};

const mathEvent: CalendarEvent = {
    id: 'ev-math',
    title: 'Matemáticas',
    start_time_ms: Date.now(),
    end_time_ms: Date.now() + 3600000,
    created_at_ms: Date.now(),
    updated_at_ms: Date.now(),
    deleted: 0,
};

const res1 = resolveUnifiedBreadcrumb(childFolder, mathEvent, [parentFolder, childFolder]);
assert.strictEqual(res1.type, 'dual');
assert.strictEqual(res1.segment1?.label, 'Ingeniería');
assert.strictEqual(res1.segment2?.label, 'Matemáticas');
console.log('   ✓ Escenario 1 (Mismo nombre con carpeta padre): [📁 Ingeniería / 📅 Matemáticas]');

// Escenario 2: Nombres idénticos, sin carpeta padre pero con categoría "Universidad"
const rootFolder: Folder = {
    id: 'f-root',
    name: 'Matemáticas',
    parent_id: null,
    created_at_ms: Date.now(),
    updated_at_ms: Date.now(),
};

const mathEventWithTag: CalendarEvent = {
    id: 'ev-math-2',
    title: 'Matemáticas',
    tags: JSON.stringify(['#universidad']),
    start_time_ms: Date.now(),
    end_time_ms: Date.now() + 3600000,
    created_at_ms: Date.now(),
    updated_at_ms: Date.now(),
    deleted: 0,
};

const res2 = resolveUnifiedBreadcrumb(rootFolder, mathEventWithTag, [rootFolder]);
assert.strictEqual(res2.type, 'dual');
assert.strictEqual(res2.segment1?.label, 'Universidad');
assert.strictEqual(res2.segment2?.label, 'Matemáticas');
console.log('   ✓ Escenario 2 (Mismo nombre con categoría): [🎓 Universidad / 📅 Matemáticas]');

// Escenario 3: Nombres idénticos, sin carpeta padre ni categoría especial -> Solo evento
const res3 = resolveUnifiedBreadcrumb(rootFolder, mathEvent, [rootFolder]);
assert.strictEqual(res3.type, 'single');
assert.strictEqual(res3.singleItem?.label, 'Matemáticas');
assert.strictEqual(res3.singleItem?.kind, 'event');
console.log('   ✓ Escenario 3 (Mismo nombre sin padre ni categoría): [📅 Matemáticas]');

// Escenario 4: Nombres distintos -> [NombreCarpeta / TituloEvento]
const semesterFolder: Folder = {
    id: 'f-sem',
    name: 'Semestre 2',
    created_at_ms: Date.now(),
    updated_at_ms: Date.now(),
};

const res4 = resolveUnifiedBreadcrumb(semesterFolder, mathEvent, [semesterFolder]);
assert.strictEqual(res4.type, 'dual');
assert.strictEqual(res4.segment1?.label, 'Semestre 2');
assert.strictEqual(res4.segment2?.label, 'Matemáticas');
console.log('   ✓ Escenario 4 (Nombres distintos): [📁 Semestre 2 / 📅 Matemáticas]');

// Escenario 5: Solo carpeta
const res5 = resolveUnifiedBreadcrumb(semesterFolder, null);
assert.strictEqual(res5.type, 'single');
assert.strictEqual(res5.singleItem?.label, 'Semestre 2');
assert.strictEqual(res5.singleItem?.kind, 'folder');
console.log('   ✓ Escenario 5 (Solo carpeta): [📁 Semestre 2]');

// Escenario 6: Solo evento
const res6 = resolveUnifiedBreadcrumb(null, mathEvent);
assert.strictEqual(res6.type, 'single');
assert.strictEqual(res6.singleItem?.label, 'Matemáticas');
assert.strictEqual(res6.singleItem?.kind, 'event');
console.log('   ✓ Escenario 6 (Solo evento): [📅 Matemáticas]');

// Escenario 7: Ni carpeta ni evento
const res7 = resolveUnifiedBreadcrumb(null, null);
assert.strictEqual(res7.type, 'empty');
console.log('   ✓ Escenario 7 (Sin carpeta ni evento): empty state');

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉\n');

