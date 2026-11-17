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
    logoUrl?: string;
    logoAlign?: 'left' | 'center' | 'right';
    logoHeightPx?: number;
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

    // Campos de compatibilidad con Veyra WEB
    headerSlots?: A4BandConfig;
    footerSlots?: A4BandConfig;
    firstPageHeaderSlots?: A4BandConfig;
    firstPageFooterSlots?: A4BandConfig;
    evenPageHeaderSlots?: A4BandConfig;
    evenPageFooterSlots?: A4BandConfig;
    differentOddEven?: boolean;
    headerDistanceCm?: number;
    footerDistanceCm?: number;
    customHeaderHeightPx?: number;
    customFooterHeightPx?: number;
    headerPreset?: string;
    footerPreset?: string;
    accentColor?: string;
    showDocumentText?: boolean;
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
    headerSlots: { ...EMPTY_BAND, images: [] },
    footerSlots: { ...EMPTY_BAND, images: [] },
    firstPageHeaderSlots: { ...EMPTY_BAND, images: [] },
    firstPageFooterSlots: { ...EMPTY_BAND, images: [] },
    evenPageHeaderSlots: { ...EMPTY_BAND, images: [] },
    evenPageFooterSlots: { ...EMPTY_BAND, images: [] },
    differentOddEven: false,
    headerDistanceCm: 1.25,
    footerDistanceCm: 1.25,
    accentColor: '#C25E2E',
    headerPreset: 'none',
    footerPreset: 'none',
    showDocumentText: true,
};

const STORAGE_NOTE_HF_PREFIX = 'veyra_a4_hf_note_v1_';
const STORAGE_NOTE_FORMAT_PREFIX = 'veyra_page_format_note_v1_';
const SAVED_TEMPLATES_KEY = 'veyra_a4_hf_saved_templates_v1';

export function cloneBand(b?: Partial<A4BandConfig> | null): A4BandConfig {
    const rawImages = Array.isArray(b?.images) ? b!.images : [];
    const images: A4HeaderFooterImageItem[] = rawImages
        .filter(img => img && typeof img.src === 'string' && img.src.length > 0)
        .map(img => ({
            id: String(img.id || Math.random().toString(36).slice(2, 9)),
            src: img.src,
            x: Number.isFinite(img.x) ? Number(img.x) : 113,
            y: Number.isFinite(img.y) ? Number(img.y) : 16,
            width: Number.isFinite(img.width) ? Math.max(20, Number(img.width)) : 90,
            height: Number.isFinite(img.height) ? Math.max(14, Number(img.height)) : 42,
        }));

    // Soporte para logoUrl legado de plantillas de la web
    if (images.length === 0 && (b as any)?.logoUrl && typeof (b as any).logoUrl === 'string') {
        const align = (b as any).logoAlign;
        const xPos = align === 'center' ? 352 : align === 'right' ? 591 : 113;
        images.push({
            id: `hf_logo_${Date.now()}`,
            src: (b as any).logoUrl,
            x: xPos,
            y: 16,
            width: 90,
            height: (b as any).logoHeightPx || 42,
        });
    }

    return {
        left: typeof b?.left === 'string' ? b.left : '',
        center: typeof b?.center === 'string' ? b.center : '',
        right: typeof b?.right === 'string' ? b.right : '',
        images,
    };
}

/**
 * Normaliza y sanea la configuración de encabezado y pie de página,
 * garantizando compatibilidad bidireccional perfecta entre Veyra WEB y Veyra Móvil.
 */
export function sanitizeA4HeaderFooterConfig(parsed?: any): A4HeaderFooterConfig {
    if (!parsed || typeof parsed !== 'object') {
        const emptyH = cloneBand(null);
        const emptyF = cloneBand(null);
        return {
            ...DEFAULT_A4_HEADER_FOOTER_CONFIG,
            header: emptyH,
            footer: emptyF,
            firstPageHeader: cloneBand(null),
            firstPageFooter: cloneBand(null),
            evenHeader: cloneBand(null),
            evenFooter: cloneBand(null),
            headerSlots: emptyH,
            footerSlots: emptyF,
            firstPageHeaderSlots: cloneBand(null),
            firstPageFooterSlots: cloneBand(null),
            evenPageHeaderSlots: cloneBand(null),
            evenPageFooterSlots: cloneBand(null),
            differentOddEven: false,
            headerDistanceCm: 1.25,
            footerDistanceCm: 1.25,
        };
    }

    // Aceptar tanto claves de móvil (header) como de web (headerSlots)
    const header = cloneBand(parsed.header || parsed.headerSlots);
    const footer = cloneBand(parsed.footer || parsed.footerSlots);
    const firstPageHeader = cloneBand(parsed.firstPageHeader || parsed.firstPageHeaderSlots);
    const firstPageFooter = cloneBand(parsed.firstPageFooter || parsed.firstPageFooterSlots);
    const evenHeader = cloneBand(parsed.evenHeader || parsed.evenPageHeaderSlots);
    const evenFooter = cloneBand(parsed.evenFooter || parsed.evenPageFooterSlots);

    const differentFirstPage = Boolean(parsed.differentFirstPage);
    const oddEvenDifferent = Boolean(parsed.oddEvenDifferent ?? parsed.differentOddEven);

    const headerTopCm = typeof parsed.headerTopCm === 'number'
        ? parsed.headerTopCm
        : (typeof parsed.headerDistanceCm === 'number' ? parsed.headerDistanceCm : 1.25);

    const footerBottomCm = typeof parsed.footerBottomCm === 'number'
        ? parsed.footerBottomCm
        : (typeof parsed.footerDistanceCm === 'number' ? parsed.footerDistanceCm : 1.25);

    return {
        differentFirstPage,
        oddEvenDifferent,
        headerTopCm,
        footerBottomCm,
        header,
        footer,
        firstPageHeader,
        firstPageFooter,
        evenHeader,
        evenFooter,

        // Claves duales sincronizadas para la Web
        headerSlots: header,
        footerSlots: footer,
        firstPageHeaderSlots: firstPageHeader,
        firstPageFooterSlots: firstPageFooter,
        evenPageHeaderSlots: evenHeader,
        evenPageFooterSlots: evenFooter,
        differentOddEven: oddEvenDifferent,
        headerDistanceCm: headerTopCm,
        footerDistanceCm: footerBottomCm,
        customHeaderHeightPx: typeof parsed.customHeaderHeightPx === 'number' ? parsed.customHeaderHeightPx : undefined,
        customFooterHeightPx: typeof parsed.customFooterHeightPx === 'number' ? parsed.customFooterHeightPx : undefined,
        headerPreset: parsed.headerPreset || 'none',
        footerPreset: parsed.footerPreset || 'none',
        accentColor: parsed.accentColor || '#C25E2E',
        showDocumentText: parsed.showDocumentText ?? true,
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
        const sanitized = sanitizeA4HeaderFooterConfig(config);
        await AsyncStorage.setItem(`${STORAGE_NOTE_HF_PREFIX}${noteId}`, JSON.stringify(sanitized));
    } catch {
        // ignore
    }
}

function parseTemplatesArray(parsed: any): A4HeaderFooterSavedTemplate[] {
    if (!Array.isArray(parsed)) return [];
    return parsed
        .filter((item: any) => item && typeof item.id === 'string' && typeof item.name === 'string' && (item.config || item.headerSlots || item.header))
        .map((item: any) => ({
            id: item.id,
            name: item.name,
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
            config: sanitizeA4HeaderFooterConfig(item.config || item),
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

/**
 * Limpia referencias locales o base64 de una banda antes de guardar en la nube
 * para proteger el tamaño del JWT de Supabase.
 */
function stripLocalAndBase64FromBand(band: A4BandConfig): A4BandConfig {
    return {
        ...band,
        images: Array.isArray(band.images)
            ? band.images.filter(img => img.src && !img.src.startsWith('data:') && !img.src.startsWith('file:') && !img.src.startsWith('content:'))
            : [],
    };
}

function sanitizeTemplateForCloud(tpl: A4HeaderFooterSavedTemplate): A4HeaderFooterSavedTemplate {
    const cfg = sanitizeA4HeaderFooterConfig(tpl.config);
    const h = stripLocalAndBase64FromBand(cfg.header);
    const f = stripLocalAndBase64FromBand(cfg.footer);
    const fph = stripLocalAndBase64FromBand(cfg.firstPageHeader);
    const fpf = stripLocalAndBase64FromBand(cfg.firstPageFooter);
    const eh = stripLocalAndBase64FromBand(cfg.evenHeader);
    const ef = stripLocalAndBase64FromBand(cfg.evenFooter);

    return {
        id: tpl.id,
        name: tpl.name,
        createdAt: tpl.createdAt,
        config: {
            ...cfg,
            header: h,
            footer: f,
            firstPageHeader: fph,
            firstPageFooter: fpf,
            evenHeader: eh,
            evenFooter: ef,
            // Claves web para compatibilidad directa
            headerSlots: h,
            footerSlots: f,
            firstPageHeaderSlots: fph,
            firstPageFooterSlots: fpf,
            evenPageHeaderSlots: eh,
            evenPageFooterSlots: ef,
        },
    };
}

async function persistTemplatesToCloud(list: A4HeaderFooterSavedTemplate[]): Promise<void> {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session?.user) return;
        const compactList = list.slice(0, 20).map(sanitizeTemplateForCloud);
        await supabase.auth.updateUser({
            data: { a4_hf_templates: compactList },
        });
    } catch (err) {
        console.warn('[persistTemplatesToCloud] Error persistiendo plantillas en nube:', err);
    }
}

/**
 * Sube imágenes locales de una banda a Supabase Storage antes de guardarla como plantilla
 */
export async function ensureSlotImagesUploadedMobile(band: A4BandConfig): Promise<A4BandConfig> {
    const images = Array.isArray(band.images) ? band.images : [];
    if (images.length === 0) return { ...band, images: [] };

    const updated: A4HeaderFooterImageItem[] = [];
    for (const img of images) {
        if (!img || !img.src) continue;
        if (/^https?:\/\//i.test(img.src)) {
            updated.push(img);
        } else {
            // URI local o data url -> subir a Supabase
            try {
                const remoteUrl = await uploadHeaderFooterLogoMobile(img.src);
                if (remoteUrl) {
                    updated.push({ ...img, src: remoteUrl });
                } else if (!img.src.startsWith('data:')) {
                    updated.push(img);
                }
            } catch {
                if (!img.src.startsWith('data:')) {
                    updated.push(img);
                }
            }
        }
    }
    return { ...band, images: updated };
}

/**
 * Recorre todas las zonas de encabezado/pie y sube imágenes locales a Supabase
 */
export async function ensureConfigImagesUploadedMobile(cfg: A4HeaderFooterConfig): Promise<A4HeaderFooterConfig> {
    const [
        header,
        footer,
        firstPageHeader,
        firstPageFooter,
        evenHeader,
        evenFooter,
    ] = await Promise.all([
        ensureSlotImagesUploadedMobile(cfg.header),
        ensureSlotImagesUploadedMobile(cfg.footer),
        ensureSlotImagesUploadedMobile(cfg.firstPageHeader),
        ensureSlotImagesUploadedMobile(cfg.firstPageFooter),
        ensureSlotImagesUploadedMobile(cfg.evenHeader),
        ensureSlotImagesUploadedMobile(cfg.evenFooter),
    ]);

    return sanitizeA4HeaderFooterConfig({
        ...cfg,
        header,
        footer,
        firstPageHeader,
        firstPageFooter,
        evenHeader,
        evenFooter,
    });
}

/**
 * Sincroniza plantillas guardadas entre el almacenamiento local y la nube de Supabase.
 * Combina plantillas creadas en la Web y en Móvil.
 */
export async function syncSavedA4TemplatesFromCloud(): Promise<A4HeaderFooterSavedTemplate[]> {
    const local = await loadSavedA4Templates();
    try {
        let { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session?.user) {
            return local;
        }

        // Si el JWT es muy largo, refrescar sesión
        if (sessionData.session.access_token && sessionData.session.access_token.length > 4000) {
            try {
                const { data: refreshed } = await supabase.auth.refreshSession();
                if (refreshed?.session) {
                    sessionData = refreshed;
                }
            } catch {
                // ignore
            }
        }

        let cloudRaw = sessionData.session?.user?.user_metadata?.a4_hf_templates;
        if (!cloudRaw) {
            try {
                const { data: userData } = await supabase.auth.getUser();
                cloudRaw = userData?.user?.user_metadata?.a4_hf_templates;
            } catch {
                // ignore
            }
        }

        const cloud = parseTemplatesArray(cloudRaw);
        if (cloud.length === 0 && local.length === 0) return [];

        const byId = new Map<string, A4HeaderFooterSavedTemplate>();
        for (const item of cloud) {
            byId.set(item.id, item);
        }

        let needsCloudUpdate = false;
        for (const item of local) {
            if (!byId.has(item.id)) {
                const uploadedCfg = await ensureConfigImagesUploadedMobile(item.config);
                byId.set(item.id, { ...item, config: uploadedCfg });
                needsCloudUpdate = true;
            } else {
                const cloudItem = byId.get(item.id)!;
                if (item.createdAt > cloudItem.createdAt) {
                    byId.set(item.id, item);
                    needsCloudUpdate = true;
                }
            }
        }

        const merged = Array.from(byId.values())
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 20);

        await AsyncStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(merged));
        if (needsCloudUpdate || cloud.length !== merged.length) {
            await persistTemplatesToCloud(merged);
        }
        return merged;
    } catch {
        return local;
    }
}

/**
 * Guarda una nueva plantilla en el dispositivo y la sube a la nube (Supabase user_metadata).
 */
export async function saveNewA4Template(name: string, config: A4HeaderFooterConfig): Promise<A4HeaderFooterSavedTemplate[]> {
    const current = await loadSavedA4Templates();
    const trimmed = name.trim() || `Plantilla ${current.length + 1}`;
    const uploadedConfig = await ensureConfigImagesUploadedMobile(config);
    const newItem: A4HeaderFooterSavedTemplate = {
        id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: trimmed,
        createdAt: Date.now(),
        config: sanitizeA4HeaderFooterConfig(uploadedConfig),
    };
    const next = [newItem, ...current.filter(t => t.id !== newItem.id)].slice(0, 20);
    try {
        await AsyncStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(next));
    } catch {
        // ignore
    }
    await persistTemplatesToCloud(next);
    return next;
}

/**
 * Elimina una plantilla guardada tanto localmente como de la nube.
 */
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
        if (/^https?:\/\//i.test(localUri)) {
            return localUri;
        }

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
        const band = kind === 'header'
            ? (config.firstPageHeader || config.firstPageHeaderSlots)
            : (config.firstPageFooter || config.firstPageFooterSlots);
        return band || EMPTY_BAND;
    }
    if ((config.oddEvenDifferent || config.differentOddEven) && pageNumber % 2 === 0) {
        const band = kind === 'header'
            ? (config.evenHeader || config.evenPageHeaderSlots)
            : (config.evenFooter || config.evenPageFooterSlots);
        return band || EMPTY_BAND;
    }
    const band = kind === 'header'
        ? (config.header || config.headerSlots)
        : (config.footer || config.footerSlots);
    return band || EMPTY_BAND;
}

export function hasAnyHeaderFooterContent(config: A4HeaderFooterConfig): boolean {
    const bands = [
        config.header || config.headerSlots,
        config.footer || config.footerSlots,
        config.firstPageHeader || config.firstPageHeaderSlots,
        config.firstPageFooter || config.firstPageFooterSlots,
        config.evenHeader || config.evenPageHeaderSlots,
        config.evenFooter || config.evenPageFooterSlots,
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
        id: 'blank_3',
        label: 'Tres columnas (Word)',
        subtitle: '{title}  |  {date}  |  Página {page}',
        band: { left: '{title}', center: '{date}', right: 'Página {page}', images: [] },
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
    {
        id: 'apa7',
        label: 'Académico (Normas APA 7)',
        subtitle: '{title}  |  {page}',
        band: { left: '{title}', center: '', right: '{page}', images: [] },
    },
    {
        id: 'retrospectiva',
        label: 'Retrospectiva',
        subtitle: '{title}  |  {date}',
        band: { left: '{title}', center: '', right: '{date}', images: [] },
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
        subtitle: 'Página {page}',
        band: { left: '', center: 'Página {page}', right: '', images: [] },
    },
    {
        id: 'page-of-total-right',
        label: 'Página X de Y (Derecha)',
        subtitle: 'Página {page} de {total}',
        band: { left: '', center: '', right: 'Página {page} de {total}', images: [] },
    },
    {
        id: 'page_x_of_y',
        label: 'Página X de Y con fecha',
        subtitle: '{date}  |  Página {page} de {total}',
        band: { left: '{date}', center: '', right: 'Página {page} de {total}', images: [] },
    },
    {
        id: 'title-and-page',
        label: 'Título + Página X de Y',
        subtitle: '{title}  —  Pág. {page} de {total}',
        band: { left: '{title}', center: '', right: 'Pág. {page} de {total}', images: [] },
    },
    {
        id: 'confidential-footer',
        label: 'Documento + Fecha + Página',
        subtitle: '{author}  |  {date}  |  {page}/{total}',
        band: { left: '{author}', center: '{date}', right: '{page} / {total}', images: [] },
    },
];
