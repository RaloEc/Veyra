import { CalendarEvent } from '../types/db';

/**
 * Normaliza y extrae un array de tags limpios (sin '#' inicial, en minúsculas y trim)
 * a partir de un evento del calendario (acepta JSON string, array de strings, o string delimitado).
 */
export function extractEventTags(event?: Partial<CalendarEvent> | { tags?: string | string[] | null; title?: string } | null): string[] {
    if (!event || !event.tags) return [];

    let rawTags: any = event.tags;
    if (typeof rawTags === 'string') {
        const trimmed = rawTags.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    rawTags = parsed;
                }
            } catch {
                rawTags = trimmed.replace(/^\[|\]$/g, '').split(/[,;\s]+/);
            }
        } else {
            // Separado por comas o espacios
            rawTags = trimmed.split(/[,;\s]+/);
        }
    }

    if (!Array.isArray(rawTags)) {
        return [];
    }

    const tags: string[] = [];
    for (const item of rawTags) {
        if (typeof item === 'string') {
            const cleaned = item.trim().replace(/^#+/, '').trim().toLowerCase();
            if (cleaned.length > 0 && !tags.includes(cleaned)) {
                tags.push(cleaned);
            }
        }
    }

    return tags;
}

/**
 * 1. Inferencia de Categoría por Etiquetas del Evento:
 * - #universidad, #uni, #facultad => "Universidad"
 * - #clase, #materia, #curso => "Clases"
 * - #trabajo, #work => "Trabajo"
 * - Otros tags => Capitalizar el primer tag relevante
 * - Fallback por defecto => "Eventos"
 */
export function getEventCategoryTag(event?: Partial<CalendarEvent> | { tags?: string | string[] | null; title?: string } | null): string {
    if (!event) return 'Eventos';

    const tags = extractEventTags(event);
    if (tags.length === 0) return 'Eventos';

    // 1. Universidad
    const uniKeywords = [
        'universidad',
        'uni',
        'facultad',
        'facu',
        'universitario',
        'universitaria',
        'campus',
        'carrera',
        'semestre',
    ];
    if (tags.some(t => uniKeywords.includes(t))) {
        return 'Universidad';
    }

    // 2. Clases / Materias / Cursos
    const classKeywords = [
        'clase',
        'clases',
        'materia',
        'materias',
        'curso',
        'cursos',
        'aula',
        'catedra',
        'asignatura',
        'asignaturas',
        'estudio',
        'leccion',
    ];
    if (tags.some(t => classKeywords.includes(t))) {
        return 'Clases';
    }

    // 3. Trabajo / Laboral
    const workKeywords = [
        'trabajo',
        'work',
        'laboral',
        'job',
        'oficina',
        'empleo',
        'meeting',
        'reunion',
        'laborales',
    ];
    if (tags.some(t => workKeywords.includes(t))) {
        return 'Trabajo';
    }

    // 4. Otros tags: capitalizar el primer tag relevante
    for (const tag of tags) {
        if (tag.length > 1) {
            return tag.charAt(0).toUpperCase() + tag.slice(1);
        }
    }

    // Fallback
    return 'Eventos';
}

/**
 * Determina si un evento debe incluirse como Cuaderno Inteligente:
 * Eventos que tengan notas vinculadas O que tengan tags académicos/proyectos (#clase, #universidad, etc.)
 */
export function isNotebookEvent(event: CalendarEvent, linkedNotesCount: number = 0): boolean {
    if (linkedNotesCount > 0) return true;
    const category = getEventCategoryTag(event);
    if (category !== 'Eventos') return true;

    const tags = extractEventTags(event);
    return tags.length > 0;
}
