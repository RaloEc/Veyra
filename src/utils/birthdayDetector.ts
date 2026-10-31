/**
 * Detector de cumpleaños y aniversarios para Veyra
 * Detecta patrones de lenguaje natural (cumple, cumpleaños, birthday, bday, aniversario).
 * Es insensible a mayúsculas y acentos.
 */

export function looksLikeBirthday(text: string): boolean {
    if (!text || typeof text !== 'string') return false;

    // Normalizar texto: minúsculas y sin acentos
    const normalized = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    // Palabras clave con delimitadores de palabra o límites
    const birthdayRegex = /\b(cumple|cumpleanos|birthday|bday|aniversario)\b/i;

    return birthdayRegex.test(normalized);
}

