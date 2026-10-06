import * as Crypto from 'expo-crypto';

export type PageLayoutMode = 'vertical' | 'horizontal';

export interface NotePage {
    id: string;
    content: string;
    title?: string;
}

export interface PaginatedNoteData {
    isPaginated: boolean;
    version?: number;
    layout: PageLayoutMode;
    pages: NotePage[] | string[];
}

export function createPage(content = '', title?: string): NotePage {
    return {
        id: Crypto.randomUUID(),
        content,
        title,
    };
}

/**
 * Parsea el contenido almacenado de una nota.
 * - Soporta v2: { isPaginated: true, version: 2, pages: NotePage[], layout }
 * - Soporta v1: { isPaginated: true, pages: string[], layout }
 * - Soporta HTML/texto tradicional plano: lo envuelve como una única NotePage (100% retrocompatible).
 */
export function parseNotePages(content?: string | null): { pages: NotePage[]; layout: PageLayoutMode } {
    if (!content || !content.trim()) {
        return {
            pages: [createPage('')],
            layout: 'vertical',
        };
    }

    try {
        const trimmed = content.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            const parsed = JSON.parse(trimmed);
            if (parsed && Array.isArray(parsed.pages) && parsed.pages.length > 0) {
                const layout: PageLayoutMode = parsed.layout === 'horizontal' ? 'horizontal' : 'vertical';
                const pages: NotePage[] = parsed.pages.map((p: any) => {
                    if (typeof p === 'string') {
                        // v1 legacy format: array de strings
                        return createPage(p);
                    }
                    if (p && typeof p === 'object') {
                        // v2 format: NotePage object
                        return {
                            id: typeof p.id === 'string' && p.id.trim() ? p.id : Crypto.randomUUID(),
                            content: typeof p.content === 'string' ? p.content : '',
                            title: typeof p.title === 'string' ? p.title : undefined,
                        };
                    }
                    return createPage('');
                });

                return { pages, layout };
            }
        }
    } catch {
        // No es JSON, tratar como HTML simple
    }

    return {
        pages: [createPage(content)],
        layout: 'vertical',
    };
}

/**
 * Serializa un array de NotePage y su modo de visualización para guardar en la base de datos (Formato v2).
 */
export function serializeNotePages(pages: NotePage[], layout: PageLayoutMode = 'vertical'): string {
    const sanitizedPages: NotePage[] = pages.length > 0 ? pages : [createPage('')];

    const payload = {
        isPaginated: true,
        version: 2,
        layout,
        pages: sanitizedPages.map(page => ({
            id: page.id || Crypto.randomUUID(),
            content: page.content ?? '',
            ...(page.title ? { title: page.title } : {}),
        })),
    };

    return JSON.stringify(payload);
}

function cleanHtmlAndEntities(html: string): string {
    if (!html || typeof html !== 'string') return '';
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#(\d+);/g, (_, dec) => {
            try {
                return String.fromCharCode(Number(dec));
            } catch {
                return '';
            }
        })
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            try {
                return String.fromCharCode(parseInt(hex, 16));
            } catch {
                return '';
            }
        })
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extrae texto plano de todas las páginas para búsquedas, vistas previas y resúmenes.
 */
export function extractPlainTextFromPages(content?: string | null): string {
    if (!content || typeof content !== 'string' || !content.trim()) return '';
    const { pages } = parseNotePages(content);
    return pages
        .map(page => {
            const pageText = cleanHtmlAndEntities(page.content);
            if (!pageText && page.title) {
                return cleanHtmlAndEntities(page.title);
            }
            return pageText;
        })
        .filter(Boolean)
        .join('\n');
}
