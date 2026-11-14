import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

export interface A4HeaderFooterImageItem {
    id: string;
    src: string;
    /** Posición horizontal relativa al ancho de la hoja A4 (794px en desktop, escalada en móvil) */
    x: number;
    /** Posición vertical relativa a la banda de encabezado/pie (0..95px) */
    y: number;
    /** Ancho en px base (escala 794px) */
    width: number;
    /** Alto en px base (escala 794px) */
    height: number;
}

export interface A4BandConfig {
    left: string;
    center: string;
    right: string;
    images?: A4HeaderFooterImageItem[];
}

export interface A4HeaderFooterConfig {
    differentFirstPage: boolean;
    oddEvenDifferent: boolean;
    headerTopCm: number;
    footerBottomCm: number;
    header: A4BandConfig;
    footer: A4BandConfig;
    firstPageHeader: A4BandConfig;
    firstPageFooter: A4BandConfig;
    evenHeader: A4BandConfig;
    evenFooter: A4BandConfig;
}

export interface A4HeaderFooterSavedTemplate {
    id: string;
    name: string;
    createdAt: number;
    config: A4HeaderFooterConfig;
}

export interface A4PhysicalSheetMeta {
    index: number;
    title: string;
    snippet: string;
    wordCount: number;
}

export const EMPTY_BAND: A4BandConfig = {
    left: '',
    center: '',
    right: '',
    images: [],
};

export const DEFAULT_A4_HEADER_FOOTER_CONFIG: A4HeaderFooterConfig = {
    differentFirstPage: false,
    oddEvenDifferent: false,
    headerTopCm: 1.25,
    footerBottomCm: 1.25,
    header: { ...EMPTY_BAND, images: [] },
    footer: { ...EMPTY_BAND, images: [] },
    firstPageHeader: { ...EMPTY_BAND, images: [] },
    firstPageFooter: { ...EMPTY_BAND, images: [] },
    evenHeader: { ...EMPTY_BAND, images: [] },
    evenFooter: { ...EMPTY_BAND, images: [] },
};

const STORAGE_NOTE_HF_PREFIX = 'veyra_a4_hf_note_v1_';
const STORAGE_NOTE_FORMAT_PREFIX = 'veyra_page_format_note_v1_';
const SAVED_TEMPLATES_KEY = 'veyra_a4_hf_saved_templates_v1';

export function cloneBand(b?: Partial<A4BandConfig> | null): A4BandConfig {
    return {
        left: typeof b?.left === 'string' ? b.left : '',
        center: typeof b?.center === 'string' ? b.center : '',
        right: typeof b?.right === 'string' ? b.right : '',
        images: Array.isArray(b?.images)
            ? b!.images
                  .filter(img => img && typeof img.src === 'string' && img.src.length > 0)
                  .map(img => ({
                      id: String(img.id || Math.random().toString(36).slice(2, 9)),
                      src: img.src,
                      x: Number.isFinite(img.x) ? Number(img.x) : 113,
                      y: Number.isFinite(img.y) ? Number(img.y) : 16,
                      width: Number.isFinite(img.width) ? Math.max(20, Number(img.width)) : 90,
                      height: Number.isFinite(img.height) ? Math.max(14, Number(img.height)) : 42,
                  }))
            : [],
    };
}

export function sanitizeA4HeaderFooterConfig(parsed?: any): A4HeaderFooterConfig {
    if (!parsed || typeof parsed !== 'object') {
        return {
            ...DEFAULT_A4_HEADER_FOOTER_CONFIG,
            header: cloneBand(null),
            footer: cloneBand(null),
            firstPageHeader: cloneBand(null),
            firstPageFooter: cloneBand(null),
            evenHeader: cloneBand(null),
            evenFooter: cloneBand(null),
        };
    }
    return {
        differentFirstPage: Boolean(parsed.differentFirstPage),
        oddEvenDifferent: Boolean(parsed.oddEvenDifferent),
        headerTopCm: typeof parsed.headerTopCm === 'number' ? parsed.headerTopCm : 1.25,
        footerBottomCm: typeof parsed.footerBottomCm === 'number' ? parsed.footerBottomCm : 1.25,
        header: cloneBand(parsed.header),
        footer: cloneBand(parsed.footer),
        firstPageHeader: cloneBand(parsed.firstPageHeader),
        firstPageFooter: cloneBand(parsed.firstPageFooter),
        evenHeader: cloneBand(parsed.evenHeader),
        evenFooter: cloneBand(parsed.evenFooter),
    };
}

export async function loadNotePageFormatForNote(noteId?: string | null): Promise<'infinite' | 'a4' | null> {
    if (!noteId || noteId === 'create') return null;
    try {
        const raw = await AsyncStorage.getItem(`${STORAGE_NOTE_FORMAT_PREFIX}${noteId}`);
        if (raw === 'a4' || raw === 'infinite') return raw;
    } catch {
        // ignore
    }
    return null;
}

export async function saveNotePageFormatForNote(noteId: string | undefined | null, format: 'infinite' | 'a4'): Promise<void> {
    if (!noteId || noteId === 'create') return;
    try {
        await AsyncStorage.setItem(`${STORAGE_NOTE_FORMAT_PREFIX}${noteId}`, format);
    } catch {
        // ignore
    }
}

export async function loadA4HeaderFooterConfigForNote(noteId?: string | null): Promise<A4HeaderFooterConfig> {
    if (!noteId || noteId === 'create') {
        return sanitizeA4HeaderFooterConfig(null);
    }
    try {
        const raw = await AsyncStorage.getItem(`${STORAGE_NOTE_HF_PREFIX}${noteId}`);
        if (raw) {
            return sanitizeA4HeaderFooterConfig(JSON.parse(raw));
        }
    } catch {
        // ignore
    }
    return sanitizeA4HeaderFooterConfig(null);
}

export async function saveA4HeaderFooterConfigForNote(noteId: string | undefined | null, config: A4HeaderFooterConfig): Promise<void> {
    if (!noteId || noteId === 'create') return;
    try {
        await AsyncStorage.setItem(`${STORAGE_NOTE_HF_PREFIX}${noteId}`, JSON.stringify(config));
    } catch {
        // ignore
    }
}

function parseTemplatesArray(parsed: any): A4HeaderFooterSavedTemplate[] {
    if (!Array.isArray(parsed)) return [];
    return parsed
        .filter((item: any) => item && typeof item.id === 'string' && typeof item.name === 'string' && item.config)
        .map((item: any) => ({
            id: item.id,
            name: item.name,
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
            config: sanitizeA4HeaderFooterConfig(item.config),
        }));
}

export async function loadSavedA4Templates(): Promise<A4HeaderFooterSavedTemplate[]> {
    try {
        const raw = await AsyncStorage.getItem(SAVED_TEMPLATES_KEY);
        if (!raw) return [];
        return parseTemplatesArray(JSON.parse(raw));
    } catch {
        return [];
    }
}

async function persistTemplatesToCloud(list: A4HeaderFooterSavedTemplate[]): Promise<void> {
    try {
        const compactList = list.slice(0, 20);
        await supabase.auth.updateUser({
            data: { a4_hf_templates: compactList },
        });
    } catch {
        // ignore offline
    }
}

export async function syncSavedA4TemplatesFromCloud(): Promise<A4HeaderFooterSavedTemplate[]> {
    const local = await loadSavedA4Templates();
    try {
        const { data } = await supabase.auth.getUser();
        const cloudRaw = data?.user?.user_metadata?.a4_hf_templates;
        const cloud = parseTemplatesArray(cloudRaw);
        if (cloud.length === 0 && local.length === 0) return [];

        const byId = new Map<string, A4HeaderFooterSavedTemplate>();
        for (const item of [...cloud, ...local]) {
            const existing = byId.get(item.id);
            if (!existing || item.createdAt >= existing.createdAt) {
                byId.set(item.id, item);
            }
        }
        const merged = Array.from(byId.values())
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 20);

        await AsyncStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(merged));
        if (cloud.length !== merged.length) {
            await persistTemplatesToCloud(merged);
        }
        return merged;
    } catch {
        return local;
    }
}

export async function saveNewA4Template(name: string, config: A4HeaderFooterConfig): Promise<A4HeaderFooterSavedTemplate[]> {
    const current = await loadSavedA4Templates();
    const trimmed = name.trim() || `Plantilla ${current.length + 1}`;
    const newItem: A4HeaderFooterSavedTemplate = {
        id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: trimmed,
        createdAt: Date.now(),
        config: sanitizeA4HeaderFooterConfig(config),
    };
    const next = [newItem, ...current].slice(0, 20);
    try {
        await AsyncStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(next));
    } catch {
        // ignore
    }
    await persistTemplatesToCloud(next);
    return next;
}

export async function deleteSavedA4Template(id: string): Promise<A4HeaderFooterSavedTemplate[]> {
    const current = await loadSavedA4Templates();
    const next = current.filter(t => t.id !== id);
    try {
        await AsyncStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(next));
    } catch {
        // ignore
    }
    await persistTemplatesToCloud(next);
    return next;
}

/**
 * Sube un logo de encabezado/pie comprimido a WebP (máx 520px, calidad 0.85)
 * con deduplicación SHA-256 idéntica a Veyra WEB (`${uid}/notes/hf_logo_${shortHash}.webp`).
 */
export async function uploadHeaderFooterLogoMobile(localUri: string): Promise<string | null> {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (!uid) return null;

        const manipulated = await manipulateAsync(
            localUri,
            [{ resize: { width: 520 } }],
            { compress: 0.85, format: SaveFormat.WEBP }
        );

        const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
            encoding: FileSystem.EncodingType.Base64,
        });

        const hashHex = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            base64
        );
        const shortHash = hashHex.slice(0, 20);
        const path = `${uid}/notes/hf_logo_${shortHash}.webp`;

        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const { error } = await supabase.storage
            .from('attachments')
            .upload(path, bytes.buffer, {
                contentType: 'image/webp',
                upsert: true,
                cacheControl: '31536000',
            });

        if (error) {
            console.warn('[uploadHeaderFooterLogoMobile] Error subiendo logo:', error);
            return null;
        }

        const { data: pub } = supabase.storage.from('attachments').getPublicUrl(path);
        return pub?.publicUrl || null;
    } catch (err) {
        console.warn('[uploadHeaderFooterLogoMobile] Excepción:', err);
        return null;
    }
}

export function resolvePageBand(
    config: A4HeaderFooterConfig,
    kind: 'header' | 'footer',
    pageNumber: number
): A4BandConfig {
    if (pageNumber === 1 && config.differentFirstPage) {
        return kind === 'header' ? config.firstPageHeader : config.firstPageFooter;
    }
    if (config.oddEvenDifferent && pageNumber % 2 === 0) {
        return kind === 'header' ? config.evenHeader : config.evenFooter;
    }
    return kind === 'header' ? config.header : config.footer;
}

export function hasAnyHeaderFooterContent(config: A4HeaderFooterConfig): boolean {
    const bands = [
        config.header,
        config.footer,
        config.firstPageHeader,
        config.firstPageFooter,
        config.evenHeader,
        config.evenFooter,
    ];
    return bands.some(
        b =>
            Boolean(b?.left?.trim()) ||
            Boolean(b?.center?.trim()) ||
            Boolean(b?.right?.trim()) ||
            Boolean(b?.images && b.images.length > 0)
    );
}

export interface A4HeaderFooterPreset {
    id: string;
    label: string;
    subtitle: string;
    band: A4BandConfig;
}

export const A4_HEADER_PRESETS: A4HeaderFooterPreset[] = [
    {
        id: 'none',
        label: 'En blanco (Sin encabezado)',
        subtitle: 'Limpia las tres columnas',
        band: { left: '', center: '', right: '', images: [] },
    },
    {
        id: 'doc-title-left',
        label: 'Título a la izquierda',
        subtitle: '{title}',
        band: { left: '{title}', center: '', right: '', images: [] },
    },
    {
        id: 'title-and-date',
        label: 'Título y Fecha',
        subtitle: '{title}  —  {date}',
        band: { left: '{title}', center: '', right: '{date}', images: [] },
    },
    {
        id: 'academic',
        label: 'Académico / Formal',
        subtitle: '{author}  |  {title}  |  {date}',
        band: { left: '{author}', center: '{title}', right: '{date}', images: [] },
    },
];

export const A4_FOOTER_PRESETS: A4HeaderFooterPreset[] = [
    {
        id: 'none',
        label: 'En blanco (Sin pie)',
        subtitle: 'Limpia las tres columnas',
        band: { left: '', center: '', right: '', images: [] },
    },
    {
        id: 'page-center',
        label: 'Número centrado',
        subtitle: 'Página 1',
        band: { left: '', center: 'Página {page}', right: '', images: [] },
    },
    {
        id: 'page-of-total-right',
        label: 'Página X de Y (Derecha)',
        subtitle: 'Página 1 de 3',
        band: { left: '', center: '', right: 'Página {page} de {total}', images: [] },
    },
    {
        id: 'title-and-page',
        label: 'Título + Página X de Y',
        subtitle: '{title}  —  Pág. 1 de 3',
        band: { left: '{title}', center: '', right: 'Pág. {page} de {total}', images: [] },
    },
    {
        id: 'confidential-footer',
        label: 'Documento + Fecha + Página',
        subtitle: '{author}  |  {date}  |  {page}/{total}',
        band: { left: '{author}', center: '{date}', right: '{page} / {total}', images: [] },
    },
];

