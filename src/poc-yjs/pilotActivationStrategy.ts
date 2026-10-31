import * as Y from 'yjs';
import { SupabaseClient } from '@supabase/supabase-js';
import { Note } from '../types/db';
import { bytesToBase64, base64ToBytes, YjsLocalPersistence } from './yjsLocalPersistence';
import { YjsRemotePersistence, computeUpdateHash, ActivateNoteYjsParams, ActivateNoteYjsResult } from './yjsRemotePersistence';
import { parseNotePages, createPage } from '../utils/pageUtils';

declare const Buffer: any;
declare const module: any;

/**
 * Decodifica entidades HTML básicas preservando caracteres acentuados y especiales.
 */
function decodeHtmlEntities(str: string): string {
    return str
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Convierte contenido HTML de una página en una lista estructurada de párrafos de texto.
 */
export function parseHtmlToParagraphs(html: string): string[] {
    if (!html || !html.trim()) return [''];

    // Si contiene bloques HTML (<p>, <div>, <h1>-<h6>, <li>), extraer el contenido de cada bloque
    const blockRegex = /<(?:p|div|h[1-6]|li)[^>]*>(.*?)<\/(?:p|div|h[1-6]|li)>/gis;
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(html)) !== null) {
        const text = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '')).trim();
        if (text) matches.push(text);
    }

    if (matches.length > 0) {
        return matches;
    }

    // Si no contiene bloques estándar, dividir por <br> o saltos de línea
    const lines = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .split('\n')
        .map(l => decodeHtmlEntities(l).trim())
        .filter(Boolean);

    return lines.length > 0 ? lines : [decodeHtmlEntities(html.replace(/<[^>]+>/g, '')).trim()];
}

/**
 * Calcula el hash canónico SHA-256 en formato hexadecimal minúsculo del contenido de la nota en UTF-8.
 * Debe coincidir exactamente con el cálculo en PostgreSQL:
 * pg_catalog.lower(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(v_note.content, ''), 'UTF8')), 'hex'))
 */
export async function computeContentSha256(content: string = ''): Promise<string> {
    const rawBytes = typeof Buffer !== 'undefined'
        ? Buffer.from(content, 'utf8')
        : new TextEncoder().encode(content);

    // 1. Web Cryptography API
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle?.digest) {
        try {
            const buffer = await globalThis.crypto.subtle.digest('SHA-256', rawBytes);
            return Array.from(new Uint8Array(buffer))
                .map((b: number) => b.toString(16).padStart(2, '0'))
                .join('')
                .toLowerCase();
        } catch (_) {}
    }

    // 2. Node.js crypto
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        try {
            const req = typeof module !== 'undefined' && module.require ? module.require.bind(module) : null;
            const nodeCrypto = req ? req('crypto') : (typeof eval !== 'undefined' ? eval('require')('crypto') : null);
            if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
                return nodeCrypto.createHash('sha256').update(rawBytes).digest('hex').toLowerCase();
            }
        } catch (_) {}
    }

    // 3. Expo Crypto
    try {
        const Crypto = require('expo-crypto');
        if (typeof Crypto.digest === 'function') {
            const buffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, rawBytes);
            return Array.from(new Uint8Array(buffer))
                .map((b: number) => b.toString(16).padStart(2, '0'))
                .join('')
                .toLowerCase();
        }
    } catch (_) {}

    throw new Error('Proveedor criptográfico SHA-256 no disponible para calcular hash del contenido.');
}

/**
 * Construye un Y.Doc inicial que contiene el texto y estructura de la nota existente,
 * conservando estrictamente los identificadores de página reales y su orden.
 */
export function buildInitialYDocFromNote(note: Note): Y.Doc {
    const doc = new Y.Doc();
    const parsed = parseNotePages(note.content || '');

    // Estructura de metadatos colaborativos
    const meta = doc.getMap('meta');
    meta.set('title', note.title || '');
    meta.set('layout', parsed.layout || 'vertical');
    meta.set('fontFamily', note.font_family || 'sans');
    meta.set('createdAt', note.created_at_ms || Date.now());
    meta.set('updatedAt', note.updated_at_ms || Date.now());

    // Estructura de hojas estables
    const pageOrder = doc.getArray('pageOrder');
    const pages = parsed.pages && parsed.pages.length > 0 ? parsed.pages : [createPage('')];

    doc.transact(() => {
        pages.forEach((p, idx) => {
            const pageId = p.id || `page_${idx + 1}`;
            pageOrder.push([pageId]);
            const fragment = doc.getXmlFragment(pageId);
            const paragraphs = parseHtmlToParagraphs(p.content || '');

            paragraphs.forEach((pText) => {
                const paragraph = new Y.XmlElement('paragraph');
                const textNode = new Y.XmlText(pText);
                paragraph.insert(0, [textNode]);
                fragment.insert(fragment.length, [paragraph]);
            });

            // Si es la página inicial, también poblar 'default' como espejo/alias de compatibilidad
            if (idx === 0) {
                const defaultFragment = doc.getXmlFragment('default');
                if (defaultFragment.length === 0) {
                    paragraphs.forEach((pText) => {
                        const paragraph = new Y.XmlElement('paragraph');
                        const textNode = new Y.XmlText(pText);
                        paragraph.insert(0, [textNode]);
                        defaultFragment.insert(defaultFragment.length, [paragraph]);
                    });
                }
            }
        });
    }, 'pilot-seed');

    return doc;
}

/**
 * Prepara los parámetros exactos requeridos por la RPC `activate_note_yjs_mode`.
 * 
 * Verificaciones estrictas previas:
 * - La nota debe estar actualmente en modo 'rest'.
 * - No altera los datos locales ni remotos (solo genera la estructura).
 */
export async function preparePilotActivationPayload(
    note: Note,
    clientId: string
): Promise<ActivateNoteYjsParams> {
    if (!note || !note.id) {
        throw new Error('Nota inválida para activación');
    }
    if (note.sync_mode === 'yjs') {
        throw new Error(`La nota ${note.id} ya está en modo 'yjs'. No se puede volver a activar.`);
    }

    const expectedContentHash = await computeContentSha256(note.content || '');
    const expectedUpdatedAtMs = Number(note.updated_at_ms || note.last_modified_ms || Date.now());

    // Construir Y.Doc inicial y serializar delta
    const doc = buildInitialYDocFromNote(note);
    const initialUpdateBytes = Y.encodeStateAsUpdate(doc);
    const initialUpdateData = bytesToBase64(initialUpdateBytes);
    const initialUpdateHash = await computeUpdateHash(initialUpdateData);

    // Vector de estado opcional para snapshot acelerador
    const svBytes = Y.encodeStateVector(doc);
    const initialStateVector = bytesToBase64(svBytes);

    return {
        noteId: note.id,
        initialUpdateData,
        initialUpdateHash,
        clientId,
        expectedContentHash,
        expectedUpdatedAtMs,
        initialStateVector,
    };
}

/**
 * Ejecuta la activación de una ÚNICA nota piloto de forma segura, explícita y autorizada.
 * 
 * GARANTÍAS DE SEGURIDAD (Fase 3.3):
 * 1. No debe invocarse en masa. Solo acepta un único ID de nota piloto.
 * 2. Comprueba concurrencia con la base de datos remota antes de proceder.
 * 3. Registra el delta inicial en SQLite localmente tras el éxito de la RPC en Supabase.
 */
export async function executePilotActivation(
    supabase: SupabaseClient,
    localPersistence: YjsLocalPersistence,
    note: Note,
    clientId: string,
    onLocalSyncModeUpdated?: (noteId: string) => Promise<void>
): Promise<ActivateNoteYjsResult> {
    const remote = new YjsRemotePersistence(supabase);
    const params = await preparePilotActivationPayload(note, clientId);

    console.log(`[Estrategia Piloto Yjs] Activando nota piloto individual: ${note.id}`);
    const result = await remote.activateNoteYjsMode(params);

    if (!result.success) {
        console.warn(`[Estrategia Piloto Yjs] Falló activación de nota piloto ${note.id}: ${result.error}`);
        return result;
    }

    // Éxito en PostgreSQL: sembrar en SQLite local el snapshot y actualizar sync_mode
    try {
        const updateBytes = base64ToBytes(params.initialUpdateData);
        await localPersistence.storeUpdate(note.id, updateBytes, true); // synced = 1
    } catch (deltaErr: any) {
        console.warn(`[Estrategia Piloto Yjs] Advertencia guardando delta inicial en SQLite: ${deltaErr.message}`);
    }

    try {
        if (onLocalSyncModeUpdated) {
            await onLocalSyncModeUpdated(note.id);
        } else {
            const { NoteService } = await import('../services/noteService');
            await NoteService.setNoteSyncMode(note.id, 'yjs');
        }
        console.log(`[Estrategia Piloto Yjs] Nota ${note.id} migrada exitosamente a modo 'yjs' tanto remota como localmente.`);
    } catch (localErr: any) {
        console.warn(`[Estrategia Piloto Yjs] Advertencia: falló callback local pero la RPC remota tuvo éxito. Recuperando modo remoto en SQLite: ${localErr.message}`);
        try {
            const { NoteService } = await import('../services/noteService');
            await NoteService.setNoteSyncMode(note.id, 'yjs');
        } catch (_) {}
    }

    return result;
}
