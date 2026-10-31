import * as Y from 'yjs';
import { SupabaseClient } from '@supabase/supabase-js';
import { Note } from '../types/db';
import { bytesToBase64, base64ToBytes, YjsLocalPersistence } from './yjsLocalPersistence';
import { YjsRemotePersistence, computeUpdateHash } from './yjsRemotePersistence';
import { parseNotePages } from '../utils/pageUtils';
import { parseHtmlToParagraphs } from './pilotActivationStrategy';

export const PILOT_NOTE_ID = '6dcc5024-fcb6-4b60-9e3a-0b726a29f46a';
export const PILOT_TARGET_PAGE_ID = '4d6fbbfc-b338-4ca9-9bf1-5c5e7da9c4b9';
export const PILOT_REPAIR_CLIENT_ID = 2147483647;

export interface PilotRepairPlan {
    noteId: string;
    targetPageId: string;
    pageOrder: string[];
    updateBase64: string;
    updateHash: string;
    paragraphsCount: number;
    sampleText: string;
    alreadyRepaired: boolean;
}

/**
 * Prepara la actualización de reparación para la nota piloto SIN modificar ninguna base de datos.
 * 
 * Reglas estrictas:
 * 1. Restringida exclusivamente a PILOT_NOTE_ID (6dcc5024-fcb6-4b60-9e3a-0b726a29f46a).
 * 2. Carga y preserva todas las actualizaciones existentes ya registradas.
 * 3. Lee el contenido original conservado en note.content y extrae su identificador real de página.
 * 4. Genera un delta aditivo compatible tanto con el fragmento de página real como con 'default'.
 * 5. Determinismo estricto: emplea PILOT_REPAIR_CLIENT_ID y metadatos estables para que cualquier
 *    reintento genere un hash SHA-256 binariamente idéntico y aprovechable por la RPC de Supabase.
 * 6. Idempotencia: si la nota ya fue reparada, se detiene sin generar deltas ni duplicar contenido.
 */
export async function preparePilotRepairPlan(
    note: Note,
    existingUpdates: Uint8Array[] = []
): Promise<PilotRepairPlan> {
    if (!note || note.id !== PILOT_NOTE_ID) {
        throw new Error(
            `[Seguridad Piloto] Operación rechazada: La reparación está estrictamente restringida a la nota ${PILOT_NOTE_ID}. La nota recibida es "${note?.id}". Ninguna de las 78 notas en producción puede ser procesada.`
        );
    }

    // 1. Reconstruir el estado a partir de las actualizaciones existentes guardadas
    const doc = new Y.Doc();

    for (const updateBytes of existingUpdates) {
        if (updateBytes && updateBytes.length > 0) {
            Y.applyUpdate(doc, updateBytes, 'repair-replay');
        }
    }

    // 2. Extraer el contenido original y su ID real de página desde notes.content
    const parsed = parseNotePages(note.content || '');
    if (!parsed.pages || parsed.pages.length === 0) {
        throw new Error('[Seguridad Piloto] notes.content no contiene páginas válidas para reparar.');
    }

    const firstPage = parsed.pages[0];
    const targetPageId = firstPage.id || PILOT_TARGET_PAGE_ID;
    const paragraphs = parseHtmlToParagraphs(firstPage.content || '');

    // Comprobar idempotencia: verificar si la nota ya contiene la estructura reparada
    const pageOrder = doc.getArray<string>('pageOrder');
    const currentPages = pageOrder.toArray();
    const targetFragment = doc.getXmlFragment(targetPageId);
    const defaultFragment = doc.getXmlFragment('default');

    const isAlreadyRepaired = currentPages.includes(targetPageId) &&
        targetFragment.length > 0 &&
        defaultFragment.length > 0;

    if (isAlreadyRepaired) {
        return {
            noteId: PILOT_NOTE_ID,
            targetPageId,
            pageOrder: currentPages,
            updateBase64: '',
            updateHash: '',
            paragraphsCount: targetFragment.length,
            sampleText: (targetFragment.get(0) as Y.XmlElement)?.toString() || '',
            alreadyRepaired: true,
        };
    }

    // ClientID determinista para garantizar que deltas generados en reintentos tengan el mismo hash binario
    doc.clientID = PILOT_REPAIR_CLIENT_ID;

    // Vector de estado de los updates previos para calcular únicamente el delta aditivo
    const svBeforeRepair = Y.encodeStateVector(doc);

    // 3. Aplicar en una transacción determinista la alineación de la página y el contenido
    doc.transact(() => {
        // Alinear meta solo si faltan datos o si son necesarios, sin generar timestamps volátiles
        const meta = doc.getMap('meta');
        if (note.title && !meta.has('title')) meta.set('title', note.title);
        if (parsed.layout && !meta.has('layout')) meta.set('layout', parsed.layout);
        if (!meta.has('updatedAt') && note.updated_at_ms) meta.set('updatedAt', note.updated_at_ms);

        // Alinear pageOrder con el ID de página real
        if (!currentPages.includes(targetPageId)) {
            // Si tenía 'page_1', reemplazarlo o anteponer el ID real
            const legacyIdx = currentPages.indexOf('page_1');
            if (legacyIdx !== -1) {
                pageOrder.delete(legacyIdx, 1);
                pageOrder.insert(legacyIdx, [targetPageId]);
            } else {
                pageOrder.insert(0, [targetPageId]);
            }
        }

        // Poblar el fragmento real de la página
        if (targetFragment.length === 0) {
            paragraphs.forEach((pText) => {
                const paragraph = new Y.XmlElement('paragraph');
                const textNode = new Y.XmlText(pText);
                paragraph.insert(0, [textNode]);
                targetFragment.insert(targetFragment.length, [paragraph]);
            });
        }

        // Poblar también el fragmento 'default' como espejo canónico
        if (defaultFragment.length === 0) {
            paragraphs.forEach((pText) => {
                const paragraph = new Y.XmlElement('paragraph');
                const textNode = new Y.XmlText(pText);
                paragraph.insert(0, [textNode]);
                defaultFragment.insert(defaultFragment.length, [paragraph]);
            });
        }
    }, 'pilot-repair');

    // 4. Calcular el delta resultante aditivo relativo al estado previo
    const repairDelta = Y.encodeStateAsUpdate(doc, svBeforeRepair);
    const updateBase64 = bytesToBase64(repairDelta);
    const updateHash = await computeUpdateHash(updateBase64);

    return {
        noteId: PILOT_NOTE_ID,
        targetPageId,
        pageOrder: doc.getArray<string>('pageOrder').toArray(),
        updateBase64,
        updateHash,
        paragraphsCount: paragraphs.length,
        sampleText: paragraphs[0]?.slice(0, 80) || '',
        alreadyRepaired: false,
    };
}

/**
 * Ejecuta la reparación de la nota piloto utilizando los mecanismos existentes de persistencia.
 * 
 * NOTA: Esta función NO se ejecuta automáticamente. Requiere confirmación y llamada explícita.
 */
export async function executePilotRepair(
    supabase: SupabaseClient,
    localPersistence: YjsLocalPersistence,
    note: Note,
    clientId: string
): Promise<{
    success: boolean;
    updateId?: number;
    duplicate?: boolean;
    alreadyRepaired?: boolean;
    error?: string;
    message?: string;
}> {
    if (!note || note.id !== PILOT_NOTE_ID) {
        return {
            success: false,
            error: `Operación bloqueada: ID ${note?.id} no coincide con la nota piloto autorizada (${PILOT_NOTE_ID}).`,
        };
    }

    const remote = new YjsRemotePersistence(supabase);

    // 1. Obtener documento remoto existente con todas sus actualizaciones previas
    const fetchRes = await remote.fetchDocument(PILOT_NOTE_ID);
    const existingBytes = [Y.encodeStateAsUpdate(fetchRes.doc)];

    // 2. Preparar el plan de reparación en memoria
    const plan = await preparePilotRepairPlan(note, existingBytes);

    // Si ya está reparado, detener inmediatamente sin realizar escrituras adicionales
    if (plan.alreadyRepaired) {
        return {
            success: true,
            alreadyRepaired: true,
            message: 'La nota piloto ya contiene la estructura y fragmentos reparados. No se realizaron escrituras adicionales.',
        };
    }

    // 3. Persistir la nueva actualización aditiva mediante saveRemoteUpdate (RPC append_note_yjs_update)
    const appendRes = await remote.saveRemoteUpdate(PILOT_NOTE_ID, plan.updateBase64, clientId);
    if (!appendRes.success) {
        return {
            success: false,
            error: `Error al persistir actualización de reparación en Supabase: ${appendRes.error}`,
        };
    }

    // 4. Persistir en SQLite local
    try {
        const updateBytes = base64ToBytes(plan.updateBase64);
        await localPersistence.storeUpdate(PILOT_NOTE_ID, updateBytes, true);
    } catch (localErr: any) {
        console.warn(`[Reparación Piloto] Advertencia guardando en SQLite: ${localErr?.message}`);
    }

    return {
        success: true,
        updateId: appendRes.updateId,
        duplicate: appendRes.duplicate,
        message: appendRes.duplicate
            ? 'La actualización ya existía en Supabase (RPC confirmó duplicado de forma idempotente sin reinserciones).'
            : 'Reparación aplicada y persistida exitosamente.',
    };
}
