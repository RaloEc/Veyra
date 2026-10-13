import { Note } from '../types/db';

export interface NoteChangeDetail {
    type: 'note_diff';
    summary: string;
    imagesAdded?: string[];
    imagesRemoved?: string[];
    textSnippet?: string;
    textChangeType?: 'added' | 'removed' | 'modified' | 'formatted';
    titleChanged?: {
        from?: string;
        to?: string;
    };
}

/**
 * Elimina etiquetas HTML y entidades comunes para obtener texto plano limpio.
 */
export function stripHtml(html?: string | null): string {
    if (!html) return '';
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Trunca un string con elipsis si excede la longitud máxima.
 */
export function truncate(str: string, maxLen: number = 50): string {
    if (!str) return '';
    const clean = str.trim();
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen).trim() + '...';
}

/**
 * Extrae URLs o fuentes de imágenes de contenido HTML y adjuntos JSON.
 */
export function extractImages(html?: string | null, attachmentsRaw?: string | null): string[] {
    const images: string[] = [];
    if (html) {
        const regex = /<img[^>]+src=["']([^"']+)["']/gi;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(html)) !== null) {
            if (match[1]) {
                images.push(match[1]);
            }
        }
    }

    if (attachmentsRaw) {
        try {
            const arr = typeof attachmentsRaw === 'string' ? JSON.parse(attachmentsRaw) : attachmentsRaw;
            if (Array.isArray(arr)) {
                for (const att of arr) {
                    if (att && (att.url || att.uri)) {
                        images.push(att.url || att.uri);
                    }
                }
            }
        } catch {}
    }

    return images;
}

/**
 * Compara la nota antes de guardar contra las actualizaciones para producir
 * un resumen descriptivo y un objeto estructurado de cambios.
 */
export function computeNoteChangeDetail(
    previousNote: Note,
    updates: Partial<Note>
): { summary: string; jsonString: string; detail: NoteChangeDetail } | null {
    const prevTitle = (previousNote.title || '').trim();
    const newTitle = updates.title !== undefined ? (updates.title || '').trim() : prevTitle;
    const isTitleChanged = updates.title !== undefined && prevTitle !== newTitle;

    const prevContent = previousNote.content || '';
    const newContent = updates.content !== undefined ? (updates.content || '') : prevContent;

    const prevAtts = previousNote.attachments || '';
    const newAtts = updates.attachments !== undefined ? (updates.attachments || '') : prevAtts;

    const prevImgs = extractImages(prevContent, prevAtts);
    const newImgs = extractImages(newContent, newAtts);

    const addedImgs = newImgs.filter((img) => !prevImgs.includes(img));
    const removedImgs = prevImgs.filter((img) => !newImgs.includes(img));

    const prevText = stripHtml(prevContent);
    const newText = stripHtml(newContent);
    const isTextChanged = prevText !== newText;
    const isHtmlChanged = prevContent !== newContent;

    // Si no cambió título, ni imágenes, ni texto ni HTML, no hay cambios relevantes
    if (!isTitleChanged && addedImgs.length === 0 && removedImgs.length === 0 && !isTextChanged && !isHtmlChanged) {
        return null;
    }

    const detail: NoteChangeDetail = {
        type: 'note_diff',
        summary: '',
    };

    // 1. Manejo de imágenes (máximo 3 thumbnails en el detalle para no saturar tamaño de fila)
    if (addedImgs.length > 0) {
        detail.imagesAdded = addedImgs.slice(0, 3).map((img) => {
            // Si es base64 excesivamente grande (> 90KB), truncar para prevenir error en payload
            if (img.startsWith('data:image') && img.length > 90000) {
                return img.slice(0, 90000);
            }
            return img;
        });
    }

    if (removedImgs.length > 0) {
        detail.imagesRemoved = removedImgs.slice(0, 3).map((img) => {
            if (img.startsWith('data:image') && img.length > 90000) {
                return img.slice(0, 90000);
            }
            return img;
        });
    }

    // 2. Manejo de título
    if (isTitleChanged) {
        detail.titleChanged = {
            from: prevTitle || undefined,
            to: newTitle || undefined,
        };
    }

    // 3. Manejo de texto
    if (isTextChanged) {
        if (newText.length > prevText.length) {
            let addedSnippet = '';
            if (newText.startsWith(prevText)) {
                addedSnippet = newText.slice(prevText.length).trim();
            } else if (newText.endsWith(prevText)) {
                addedSnippet = newText.slice(0, newText.length - prevText.length).trim();
            } else {
                addedSnippet = newText;
            }
            detail.textChangeType = 'added';
            detail.textSnippet = truncate(addedSnippet, 60);
        } else if (newText.length < prevText.length) {
            let removedSnippet = '';
            if (prevText.startsWith(newText)) {
                removedSnippet = prevText.slice(newText.length).trim();
            } else {
                removedSnippet = newText;
            }
            detail.textChangeType = 'removed';
            detail.textSnippet = truncate(removedSnippet, 60);
        } else {
            detail.textChangeType = 'modified';
            detail.textSnippet = truncate(newText, 60);
        }
    } else if (isHtmlChanged) {
        detail.textChangeType = 'formatted';
    }

    // 4. Construcción del resumen textual amigable
    const parts: string[] = [];

    if (addedImgs.length > 0 && removedImgs.length > 0) {
        parts.push(`añadió ${addedImgs.length} y eliminó ${removedImgs.length} imágenes`);
    } else if (addedImgs.length > 0) {
        parts.push(addedImgs.length === 1 ? 'añadió una imagen' : `añadió ${addedImgs.length} imágenes`);
    } else if (removedImgs.length > 0) {
        parts.push(removedImgs.length === 1 ? 'eliminó una imagen' : `eliminó ${removedImgs.length} imágenes`);
    }

    if (isTitleChanged) {
        if (!prevTitle && newTitle) {
            parts.push(`asignó el título "${truncate(newTitle, 35)}"`);
        } else if (newTitle) {
            parts.push(`cambió el título a "${truncate(newTitle, 35)}"`);
        } else {
            parts.push('eliminó el título');
        }
    }

    if (parts.length === 0) {
        if (detail.textChangeType === 'added' && detail.textSnippet) {
            parts.push(`agregó: "${detail.textSnippet}"`);
        } else if (detail.textChangeType === 'removed' && detail.textSnippet) {
            parts.push(`eliminó texto: "${detail.textSnippet}"`);
        } else if (detail.textChangeType === 'modified' && detail.textSnippet) {
            parts.push(`editó el texto: "${detail.textSnippet}"`);
        } else if (detail.textChangeType === 'formatted') {
            parts.push('actualizó el formato');
        } else {
            parts.push('editó el contenido');
        }
    } else if (isTextChanged && detail.textSnippet && addedImgs.length > 0) {
        parts.push('y modificó el texto');
    }

    const summary = parts.join(' ');
    // Primera letra en mayúscula
    const formattedSummary = summary.charAt(0).toUpperCase() + summary.slice(1);
    detail.summary = formattedSummary;

    return {
        summary: formattedSummary,
        jsonString: JSON.stringify(detail),
        detail,
    };
}
