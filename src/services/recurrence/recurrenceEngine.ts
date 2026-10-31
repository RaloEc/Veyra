import type { RecurrenceRule, CalendarEvent } from '../../types/db';

export interface Occurrence {
    eventId: string;
    startTimeMs: number;
    endTimeMs: number;
    allDayDate: string | null;
    isAllDay: boolean;
    occurrenceDate: string; // 'YYYY-MM-DD'
    isOriginal: boolean;
}

export function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
    if (month === 2) {
        return isLeapYear(year) ? 29 : 28;
    }
    if ([4, 6, 9, 11].includes(month)) {
        return 30;
    }
    return 31;
}

let cachedDeviceTimezone: string | null = null;
let cachedDeviceTimezoneAt = 0;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

const WEEKDAY_MAP: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

export function getDeviceTimezone(): string {
    const now = Date.now();
    if (cachedDeviceTimezone && now - cachedDeviceTimezoneAt < 60000) {
        return cachedDeviceTimezone;
    }
    try {
        cachedDeviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        cachedDeviceTimezoneAt = now;
        return cachedDeviceTimezone;
    } catch {
        return 'UTC';
    }
}

function getCachedFormatter(timeZone: string): Intl.DateTimeFormat {
    let fmt = formatterCache.get(timeZone);
    if (!fmt) {
        fmt = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            weekday: 'short',
            hour12: false,
        });
        formatterCache.set(timeZone, fmt);
    }
    return fmt;
}

export function getZonedDateParts(
    date: Date,
    timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number } {
    const deviceTz = getDeviceTimezone();
    if (!timeZone || timeZone === deviceTz) {
        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
            hour: date.getHours(),
            minute: date.getMinutes(),
            second: date.getSeconds(),
            weekday: date.getDay(),
        };
    }

    try {
        const formatter = getCachedFormatter(timeZone);
        const parts = formatter.formatToParts(date);
        const map: Record<string, string> = {};
        for (const p of parts) {
            map[p.type] = p.value;
        }

        const weekdayStr = map.weekday || '';
        const weekday = WEEKDAY_MAP[weekdayStr] ?? date.getDay();

        let hour = parseInt(map.hour || '0', 10);
        if (hour === 24) hour = 0;

        return {
            year: parseInt(map.year || '1970', 10),
            month: parseInt(map.month || '1', 10), // 1 - 12
            day: parseInt(map.day || '1', 10),
            hour,
            minute: parseInt(map.minute || '0', 10),
            second: parseInt(map.second || '0', 10),
            weekday,
        };
    } catch {
        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
            hour: date.getHours(),
            minute: date.getMinutes(),
            second: date.getSeconds(),
            weekday: date.getDay(),
        };
    }
}

export function makeZonedDateMs(
    year: number,
    month: number, // 1-12
    day: number,
    hour: number,
    minute: number,
    second: number,
    timeZone: string
): number {
    const deviceTz = getDeviceTimezone();
    if (!timeZone || timeZone === deviceTz) {
        return new Date(year, month - 1, day, hour, minute, second, 0).getTime();
    }

    try {
        const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
        const zParts = getZonedDateParts(new Date(utcGuess), timeZone);
        const zGuess = Date.UTC(zParts.year, zParts.month - 1, zParts.day, zParts.hour, zParts.minute, zParts.second);
        const diff = zGuess - utcGuess;
        return utcGuess - diff;
    } catch {
        return new Date(year, month - 1, day, hour, minute, second).getTime();
    }
}

export function formatYmd(year: number, month: number, day: number): string {
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
}

/**
 * Parsea y normaliza cualquier regla de repetición (antigua o extendida)
 */
export function parseRecurrenceRule(raw: unknown): RecurrenceRule {
    if (!raw) return { type: 'none' };

    let parsed: any = raw;
    if (typeof raw === 'string') {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return { type: 'none' };
        }
    }

    if (!parsed || typeof parsed !== 'object') return { type: 'none' };

    const type = parsed.type;
    switch (type) {
        case 'daily':
            return {
                type: 'daily',
                interval: Math.max(1, Number(parsed.interval) || 1),
            };

        case 'weekly': {
            const rawDays = parsed.by_weekday || parsed.days;
            const by_weekday = Array.isArray(rawDays)
                ? rawDays.map((d: any) => Number(d)).filter((d: number) => d >= 0 && d <= 6)
                : undefined;
            return {
                type: 'weekly',
                interval: Math.max(1, Number(parsed.interval) || 1),
                by_weekday: by_weekday && by_weekday.length > 0 ? Array.from(new Set(by_weekday)).sort() : undefined,
            };
        }

        case 'monthly': {
            const rawDays = parsed.by_monthday;
            const by_monthday = Array.isArray(rawDays)
                ? rawDays.map((d: any) => Number(d)).filter((d: number) => d >= 1 && d <= 31)
                : undefined;
            return {
                type: 'monthly',
                interval: Math.max(1, Number(parsed.interval) || 1),
                by_monthday: by_monthday && by_monthday.length > 0 ? Array.from(new Set(by_monthday)).sort() : undefined,
            };
        }

        case 'yearly': {
            const by_month = parsed.by_month !== undefined ? Number(parsed.by_month) : undefined;
            const by_monthday = parsed.by_monthday !== undefined ? Number(parsed.by_monthday) : undefined;
            let feb29_policy: 'feb28' | 'mar01' | 'skip' | undefined = parsed.feb29_policy;

            if (by_month === 2 && by_monthday === 29 && !feb29_policy) {
                feb29_policy = 'feb28';
            }

            return {
                type: 'yearly',
                interval: Math.max(1, Number(parsed.interval) || 1),
                by_month,
                by_monthday,
                feb29_policy,
            };
        }

        case 'weekdays':
            return { type: 'weekdays' };

        default:
            return { type: 'none' };
    }
}

/**
 * Expande las ocurrencias de un evento dentro de un rango [fromDate, toDate]
 * respetando la zona horaria del evento y todas las políticas de recurrencia.
 */
export function expandOccurrences(
    event: CalendarEvent,
    from: Date | number,
    to: Date | number
): Occurrence[] {
    const fromDate = typeof from === 'number' ? new Date(from) : from;
    const toDate = typeof to === 'number' ? new Date(to) : to;

    if (!fromDate || isNaN(fromDate.getTime()) || !toDate || isNaN(toDate.getTime())) {
        return [];
    }

    const tz = event.timezone || getDeviceTimezone();
    const isAllDay = Boolean(event.is_all_day);
    const durationMs = Math.max(0, event.end_time_ms - event.start_time_ms);

    const rule = parseRecurrenceRule(event.recurrence_rule || event.repeat_rule);

    const occurrences: Occurrence[] = [];
    const eventStartParts = getZonedDateParts(new Date(event.start_time_ms), tz);

    // Si no tiene repetición, solo verificar si el evento original cae en el rango
    if (rule.type === 'none') {
        const occDate = event.all_day_date || formatYmd(eventStartParts.year, eventStartParts.month, eventStartParts.day);
        if (event.end_time_ms >= fromDate.getTime() && event.start_time_ms <= toDate.getTime()) {
            occurrences.push({
                eventId: event.id,
                startTimeMs: event.start_time_ms,
                endTimeMs: event.end_time_ms,
                allDayDate: isAllDay ? occDate : null,
                isAllDay,
                occurrenceDate: occDate,
                isOriginal: true,
            });
        }
        return occurrences;
    }

    const fromParts = getZonedDateParts(fromDate, tz);
    const toParts = getZonedDateParts(toDate, tz);

    const fromLimitMs = fromDate.getTime();
    const toLimitMs = toDate.getTime();

    // Función auxiliar para emitir una ocurrencia dado un año, mes y día
    const tryEmitOccurrence = (year: number, month: number, day: number) => {
        const occDateStr = formatYmd(year, month, day);
        let startMs: number;
        let endMs: number;

        if (isAllDay) {
            startMs = makeZonedDateMs(year, month, day, 0, 0, 0, tz);
            endMs = makeZonedDateMs(year, month, day, 23, 59, 59, tz) + 999;
        } else {
            startMs = makeZonedDateMs(
                year,
                month,
                day,
                eventStartParts.hour,
                eventStartParts.minute,
                eventStartParts.second,
                tz
            );
            endMs = startMs + durationMs;
        }

        // Verificar que no sea anterior a la creación original y que esté en la ventana
        if (endMs >= fromLimitMs && startMs <= toLimitMs && startMs >= event.start_time_ms) {
            const isOriginal = occDateStr === (event.all_day_date || formatYmd(eventStartParts.year, eventStartParts.month, eventStartParts.day));
            occurrences.push({
                eventId: event.id,
                startTimeMs: startMs,
                endTimeMs: endMs,
                allDayDate: isAllDay ? occDateStr : null,
                isAllDay,
                occurrenceDate: occDateStr,
                isOriginal,
            });
        }
    };

    switch (rule.type) {
        case 'daily': {
            const interval = rule.interval || 1;
            // Iterar por días
            const cursor = new Date(Math.max(event.start_time_ms, fromLimitMs - 86400000));
            // Alinear al inicio del día en la tz
            let cParts = getZonedDateParts(cursor, tz);
            let currentDayMs = makeZonedDateMs(cParts.year, cParts.month, cParts.day, 0, 0, 0, tz);
            const origDayMs = makeZonedDateMs(eventStartParts.year, eventStartParts.month, eventStartParts.day, 0, 0, 0, tz);

            while (currentDayMs <= toLimitMs + 86400000) {
                const dayDiff = Math.round((currentDayMs - origDayMs) / 86400000);
                if (dayDiff >= 0 && dayDiff % interval === 0) {
                    const p = getZonedDateParts(new Date(currentDayMs + 43200000), tz);
                    tryEmitOccurrence(p.year, p.month, p.day);
                }
                currentDayMs += 86400000;
            }
            break;
        }

        case 'weekdays': {
            // Lunes a Viernes
            const cursor = new Date(Math.max(event.start_time_ms, fromLimitMs - 86400000));
            let cParts = getZonedDateParts(cursor, tz);
            let currentDayMs = makeZonedDateMs(cParts.year, cParts.month, cParts.day, 0, 0, 0, tz);

            while (currentDayMs <= toLimitMs + 86400000) {
                const p = getZonedDateParts(new Date(currentDayMs + 43200000), tz);
                if (p.weekday >= 1 && p.weekday <= 5) {
                    tryEmitOccurrence(p.year, p.month, p.day);
                }
                currentDayMs += 86400000;
            }
            break;
        }

        case 'weekly': {
            const interval = rule.interval || 1;
            const targetDays = rule.by_weekday && rule.by_weekday.length > 0
                ? rule.by_weekday
                : [eventStartParts.weekday];

            const cursor = new Date(Math.max(event.start_time_ms, fromLimitMs - 86400000 * 7));
            let cParts = getZonedDateParts(cursor, tz);
            let currentDayMs = makeZonedDateMs(cParts.year, cParts.month, cParts.day, 0, 0, 0, tz);
            const origDayMs = makeZonedDateMs(eventStartParts.year, eventStartParts.month, eventStartParts.day, 0, 0, 0, tz);

            // Calcular número de semana relativa para intervalo
            while (currentDayMs <= toLimitMs + 86400000 * 7) {
                const p = getZonedDateParts(new Date(currentDayMs + 43200000), tz);
                if (targetDays.includes(p.weekday)) {
                    // Verificar intervalo de semanas
                    const daysSinceOrig = Math.floor((currentDayMs - origDayMs) / 86400000);
                    if (daysSinceOrig >= -6) {
                        const weekDiff = Math.floor((daysSinceOrig + (eventStartParts.weekday === 0 ? 6 : eventStartParts.weekday - 1)) / 7);
                        if (weekDiff % interval === 0) {
                            tryEmitOccurrence(p.year, p.month, p.day);
                        }
                    }
                }
                currentDayMs += 86400000;
            }
            break;
        }

        case 'monthly': {
            const interval = rule.interval || 1;
            const targetMonthdays = rule.by_monthday && rule.by_monthday.length > 0
                ? rule.by_monthday
                : [eventStartParts.day];

            const startYear = eventStartParts.year;
            const endYear = toParts.year + 1;

            let monthIndex = (fromParts.year - startYear) * 12 + (fromParts.month - eventStartParts.month);
            if (monthIndex < 0) monthIndex = 0;

            for (let y = fromParts.year; y <= endYear; y++) {
                for (let m = 1; m <= 12; m++) {
                    const monthsSinceStart = (y - startYear) * 12 + (m - eventStartParts.month);
                    if (monthsSinceStart >= 0 && monthsSinceStart % interval === 0) {
                        const daysInMonth = getDaysInMonth(y, m);
                        for (const targetDay of targetMonthdays) {
                            // Si el día supera los días del mes (ej. día 31 en mes corto), se usa el último día del mes
                            const actualDay = Math.min(targetDay, daysInMonth);
                            tryEmitOccurrence(y, m, actualDay);
                        }
                    }
                }
            }
            break;
        }

        case 'yearly': {
            const interval = rule.interval || 1;
            const targetMonth = rule.by_month !== undefined ? rule.by_month : eventStartParts.month;
            const targetDay = rule.by_monthday !== undefined ? rule.by_monthday : eventStartParts.day;
            const feb29Policy = rule.feb29_policy || 'feb28';

            const startYear = eventStartParts.year;
            const endYear = toParts.year + 1;

            for (let y = Math.max(startYear, fromParts.year - 1); y <= endYear; y++) {
                if ((y - startYear) % interval === 0) {
                    if (targetMonth === 2 && targetDay === 29) {
                        if (isLeapYear(y)) {
                            tryEmitOccurrence(y, 2, 29);
                        } else {
                            if (feb29Policy === 'feb28') {
                                tryEmitOccurrence(y, 2, 28);
                            } else if (feb29Policy === 'mar01') {
                                tryEmitOccurrence(y, 3, 1);
                            }
                            // 'skip': no emite nada
                        }
                    } else {
                        const daysInMonth = getDaysInMonth(y, targetMonth);
                        const actualDay = Math.min(targetDay, daysInMonth);
                        tryEmitOccurrence(y, targetMonth, actualDay);
                    }
                }
            }
            break;
        }
    }

    // Ordenar ocurrencias cronológicamente
    occurrences.sort((a, b) => a.startTimeMs - b.startTimeMs);

    // Descartar duplicados exactos si los hubiera
    const seen = new Set<string>();
    return occurrences.filter((occ) => {
        const key = `${occ.occurrenceDate}_${occ.startTimeMs}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
