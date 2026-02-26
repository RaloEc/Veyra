import { RecurrenceType } from '../components/create/RecurrenceSelector';

export interface RepeatRule {
    type: RecurrenceType;
}

/**
 * Calcula la próxima fecha basándose en la regla de recurrencia.
 * Siempre calcula desde la fecha vencida original, no desde "ahora",
 * para mantener la consistencia del horario (e.g., siempre a las 12:00).
 */
export function getNextRecurrenceDate(dueDateMs: number, rule: RepeatRule): number | null {
    if (!rule || rule.type === 'none') return null;

    const date = new Date(dueDateMs);
    const now = Date.now();

    switch (rule.type) {
        case 'daily':
            // Avanzar un día a la vez hasta estar en el futuro
            do {
                date.setDate(date.getDate() + 1);
            } while (date.getTime() <= now);
            break;

        case 'weekly':
            // Avanzar una semana a la vez hasta estar en el futuro
            do {
                date.setDate(date.getDate() + 7);
            } while (date.getTime() <= now);
            break;

        case 'monthly':
            // Avanzar un mes a la vez hasta estar en el futuro
            do {
                date.setMonth(date.getMonth() + 1);
            } while (date.getTime() <= now);
            break;

        case 'yearly':
            // Avanzar un año a la vez hasta estar en el futuro
            do {
                date.setFullYear(date.getFullYear() + 1);
            } while (date.getTime() <= now);
            break;

        default:
            return null;
    }

    return date.getTime();
}

/**
 * Parsea el repeat_rule JSON a un objeto RepeatRule.
 */
export function parseRepeatRule(repeatRuleJson: string | undefined | null): RepeatRule | null {
    if (!repeatRuleJson) return null;
    try {
        const parsed = JSON.parse(repeatRuleJson);
        if (parsed.type && parsed.type !== 'none') {
            return parsed as RepeatRule;
        }
        return null;
    } catch {
        return null;
    }
}
