/**
 * Parser de hashtags para Veyra
 * Detecta hashtags con soporte Unicode y preserva URLs que contengan fragmentos '#'.
 */

export function extractHashtags(text: string): { cleanText: string; tags: string[] } {
    if (!text || typeof text !== 'string') {
        return { cleanText: '', tags: [] };
    }

    // 1. Proteger URLs para que no se interpreten fragmentos '#algo' dentro de enlaces
    const urlPlaceholders: { placeholder: string; original: string }[] = [];
    let processedText = text.replace(/https?:\/\/[^\s]+/gi, (url) => {
        const placeholder = `__URL_PLACEHOLDER_${urlPlaceholders.length}__`;
        urlPlaceholders.push({ placeholder, original: url });
        return placeholder;
    });

    // 2. Extraer hashtags usando regex Unicode: # seguido de letras, números, guión o guión bajo
    // Excluyendo si está precedido por un carácter alfanumérico para evitar falsos positivos
    const hashtagRegex = /(?:^|\s)#([\p{L}0-9_-]+)/gu;
    const tagsSet = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = hashtagRegex.exec(processedText)) !== null) {
        const tag = match[1];
        if (tag && tag.trim()) {
            tagsSet.add(tag.trim());
        }
    }

    // 3. Limpiar hashtags del texto (reemplazando '#tag' con espacio)
    let cleaned = processedText.replace(/(?:^|\s)#([\p{L}0-9_-]+)/gu, ' ');

    // 4. Restaurar las URLs originales
    for (const { placeholder, original } of urlPlaceholders) {
        cleaned = cleaned.replace(placeholder, original);
    }

    // 5. Colapsar espacios repetidos y hacer trim
    const cleanText = cleaned.replace(/\s+/g, ' ').trim();

    return {
        cleanText,
        tags: Array.from(tagsSet),
    };
}

/**
 * Normaliza un nombre de tag para generar un slug canónico único.
 * Reglas:
 * - Lowercase.
 * - Quitar acentos (NFD + strip diacríticos).
 * - Solo [a-z0-9_-]. Reemplazar el resto por '-'.
 * - Colapsar '--' repetidos a '-'.
 * - Trim '-' al inicio y final.
 */
export function normalizeTagSlug(rawName: string): string {
    if (!rawName) return '';
    const clean = rawName
        .trim()
        .toLowerCase()
        .replace(/^#+/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const slug = clean
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

    return slug;
}

