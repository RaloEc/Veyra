import assert from 'node:assert';
import test, { describe, it } from 'node:test';
import {
    isLeapYear,
    parseRecurrenceRule,
    expandOccurrences,
    makeZonedDateMs,
    formatYmd,
} from '../src/services/recurrence/recurrenceEngine.ts';
import { extractHashtags, normalizeTagSlug } from '../src/utils/hashtagParser.ts';
import { looksLikeBirthday } from '../src/utils/birthdayDetector.ts';
import type { CalendarEvent } from '../src/types/db.ts';

describe('Recurrence Engine', () => {
    it('detects leap years correctly', () => {
        assert.strictEqual(isLeapYear(2024), true);
        assert.strictEqual(isLeapYear(2025), false);
        assert.strictEqual(isLeapYear(2026), false);
        assert.strictEqual(isLeapYear(2000), true);
        assert.strictEqual(isLeapYear(1900), false);
    });

    it('parses legacy and new recurrence rules with retrocompatibility', () => {
        assert.deepStrictEqual(parseRecurrenceRule('{ "type": "daily" }'), { type: 'daily', interval: 1 });
        assert.deepStrictEqual(parseRecurrenceRule({ type: 'weekly', days: [1, 3, 5] }), {
            type: 'weekly',
            interval: 1,
            by_weekday: [1, 3, 5],
        });
        assert.deepStrictEqual(parseRecurrenceRule(null), { type: 'none' });
        assert.deepStrictEqual(parseRecurrenceRule({ type: 'yearly', by_month: 2, by_monthday: 29 }), {
            type: 'yearly',
            interval: 1,
            by_month: 2,
            by_monthday: 29,
            feb29_policy: 'feb28',
        });
    });

    it('handles Feb 29 birthday with 3 policies (feb28, mar01, skip)', () => {
        const baseEvent: CalendarEvent = {
            id: 'bday-1',
            title: 'Cumpleaños Bisiesto',
            start_time_ms: new Date('2024-02-29T00:00:00Z').getTime(),
            end_time_ms: new Date('2024-02-29T23:59:59.999Z').getTime(),
            is_all_day: true,
            all_day_date: '2024-02-29',
            timezone: 'UTC',
            is_birthday_like: true,
            created_at_ms: Date.now(),
            updated_at_ms: Date.now(),
            deleted: 0,
        };

        const rangeStart = new Date('2025-01-01T00:00:00Z');
        const rangeEnd = new Date('2025-12-31T23:59:59Z');

        // Política 'feb28' (2025 no es bisiesto -> debe caer 2025-02-28)
        const eventFeb28: CalendarEvent = {
            ...baseEvent,
            recurrence_rule: JSON.stringify({
                type: 'yearly',
                by_month: 2,
                by_monthday: 29,
                feb29_policy: 'feb28',
            }),
        };
        const occFeb28 = expandOccurrences(eventFeb28, rangeStart, rangeEnd);
        assert.strictEqual(occFeb28.length, 1);
        assert.strictEqual(occFeb28[0].occurrenceDate, '2025-02-28');

        // Política 'mar01' (2025 no es bisiesto -> debe caer 2025-03-01)
        const eventMar01: CalendarEvent = {
            ...baseEvent,
            recurrence_rule: JSON.stringify({
                type: 'yearly',
                by_month: 2,
                by_monthday: 29,
                feb29_policy: 'mar01',
            }),
        };
        const occMar01 = expandOccurrences(eventMar01, rangeStart, rangeEnd);
        assert.strictEqual(occMar01.length, 1);
        assert.strictEqual(occMar01[0].occurrenceDate, '2025-03-01');

        // Política 'skip' (2025 no es bisiesto -> debe saltar)
        const eventSkip: CalendarEvent = {
            ...baseEvent,
            recurrence_rule: JSON.stringify({
                type: 'yearly',
                by_month: 2,
                by_monthday: 29,
                feb29_policy: 'skip',
            }),
        };
        const occSkip = expandOccurrences(eventSkip, rangeStart, rangeEnd);
        assert.strictEqual(occSkip.length, 0);
    });

    it('expands weekly with by_weekday [1, 3, 5] (Lunes, Miércoles, Viernes)', () => {
        // Semana del lunes 3 de marzo de 2025 al domingo 9 de marzo de 2025
        const event: CalendarEvent = {
            id: 'gym-1',
            title: 'Gym',
            start_time_ms: new Date('2025-03-03T10:00:00Z').getTime(),
            end_time_ms: new Date('2025-03-03T11:00:00Z').getTime(),
            is_all_day: false,
            timezone: 'UTC',
            recurrence_rule: JSON.stringify({
                type: 'weekly',
                interval: 1,
                by_weekday: [1, 3, 5],
            }),
            created_at_ms: Date.now(),
            updated_at_ms: Date.now(),
            deleted: 0,
        };

        const rangeStart = new Date('2025-03-03T00:00:00Z');
        const rangeEnd = new Date('2025-03-09T23:59:59Z');

        const occ = expandOccurrences(event, rangeStart, rangeEnd);
        const dates = occ.map(o => o.occurrenceDate);
        assert.deepStrictEqual(dates, ['2025-03-03', '2025-03-05', '2025-03-07']);
    });

    it('expands weekdays (Lunes a Viernes)', () => {
        const event: CalendarEvent = {
            id: 'work-1',
            title: 'Standup diario',
            start_time_ms: new Date('2025-03-03T09:00:00Z').getTime(), // Lunes
            end_time_ms: new Date('2025-03-03T09:30:00Z').getTime(),
            is_all_day: false,
            timezone: 'UTC',
            recurrence_rule: JSON.stringify({ type: 'weekdays' }),
            created_at_ms: Date.now(),
            updated_at_ms: Date.now(),
            deleted: 0,
        };

        const rangeStart = new Date('2025-03-01T00:00:00Z'); // Sábado
        const rangeEnd = new Date('2025-03-09T23:59:59Z'); // Domingo siguiente

        const occ = expandOccurrences(event, rangeStart, rangeEnd);
        const dates = occ.map(o => o.occurrenceDate);
        // Debe generar lunes 3, martes 4, miércoles 5, jueves 6, viernes 7
        assert.deepStrictEqual(dates, [
            '2025-03-03',
            '2025-03-04',
            '2025-03-05',
            '2025-03-06',
            '2025-03-07',
        ]);
    });

    it('expands monthly on day 31 clamping to last day in shorter months', () => {
        const event: CalendarEvent = {
            id: 'bill-1',
            title: 'Factura Fin de Mes',
            start_time_ms: new Date('2025-01-31T12:00:00Z').getTime(),
            end_time_ms: new Date('2025-01-31T13:00:00Z').getTime(),
            is_all_day: false,
            timezone: 'UTC',
            recurrence_rule: JSON.stringify({
                type: 'monthly',
                interval: 1,
                by_monthday: [31],
            }),
            created_at_ms: Date.now(),
            updated_at_ms: Date.now(),
            deleted: 0,
        };

        const rangeStart = new Date('2025-01-01T00:00:00Z');
        const rangeEnd = new Date('2025-04-30T23:59:59Z');

        const occ = expandOccurrences(event, rangeStart, rangeEnd);
        const dates = occ.map(o => o.occurrenceDate);
        // Enero = 31, Febrero 2025 = 28, Marzo = 31, Abril = 30
        assert.deepStrictEqual(dates, [
            '2025-01-31',
            '2025-02-28',
            '2025-03-31',
            '2025-04-30',
        ]);
    });

    it('expands simple yearly recurrence', () => {
        const event: CalendarEvent = {
            id: 'anni-1',
            title: 'Aniversario de Bodas',
            start_time_ms: new Date('2022-10-15T00:00:00Z').getTime(),
            end_time_ms: new Date('2022-10-15T23:59:59.999Z').getTime(),
            is_all_day: true,
            all_day_date: '2022-10-15',
            timezone: 'UTC',
            recurrence_rule: JSON.stringify({
                type: 'yearly',
                interval: 1,
                by_month: 10,
                by_monthday: 15,
            }),
            created_at_ms: Date.now(),
            updated_at_ms: Date.now(),
            deleted: 0,
        };

        const rangeStart = new Date('2024-01-01T00:00:00Z');
        const rangeEnd = new Date('2026-12-31T23:59:59Z');

        const occ = expandOccurrences(event, rangeStart, rangeEnd);
        const dates = occ.map(o => o.occurrenceDate);
        assert.deepStrictEqual(dates, ['2024-10-15', '2025-10-15', '2026-10-15']);
    });

    it('accepts millisecond timestamps as well as Date objects', () => {
        const event: CalendarEvent = {
            id: 'test-ts',
            title: 'Evento test timestamp',
            start_time_ms: new Date('2026-05-10T10:00:00Z').getTime(),
            end_time_ms: new Date('2026-05-10T11:00:00Z').getTime(),
            timezone: 'UTC',
            recurrence_rule: JSON.stringify({ type: 'daily', interval: 1 }),
            created_at_ms: Date.now(),
            updated_at_ms: Date.now(),
            deleted: 0,
        };

        const fromMs = new Date('2026-05-10T00:00:00Z').getTime();
        const toMs = new Date('2026-05-12T23:59:59Z').getTime();

        const occ = expandOccurrences(event, fromMs, toMs);
        assert.strictEqual(occ.length, 3);
    });
});

describe('Hashtag Parser', () => {
    it('extracts hashtags with unicode support and cleans text', () => {
        const input = 'Reunión mañana #trabajo #urgente';
        const res = extractHashtags(input);
        assert.strictEqual(res.cleanText, 'Reunión mañana');
        assert.deepStrictEqual(res.tags, ['trabajo', 'urgente']);
    });

    it('handles multiple tags with commas and complex unicode', () => {
        const input = '#familia #cumpleaños de papá en casa #año_2026';
        const res = extractHashtags(input);
        assert.strictEqual(res.cleanText, 'de papá en casa');
        assert.deepStrictEqual(res.tags, ['familia', 'cumpleaños', 'año_2026']);
    });

    it('ignores # inside URLs', () => {
        const input = 'Visita https://veyra.app/faq#section para ver más #ayuda';
        const res = extractHashtags(input);
        assert.strictEqual(res.cleanText, 'Visita https://veyra.app/faq#section para ver más');
        assert.deepStrictEqual(res.tags, ['ayuda']);
    });

    it('normalizes tag slug correctly', () => {
        assert.strictEqual(normalizeTagSlug('Cumpleaños'), 'cumpleanos');
        assert.strictEqual(normalizeTagSlug('#Familia & Amigos'), 'familia-amigos');
        assert.strictEqual(normalizeTagSlug('Año_2026--Especial'), 'ano_2026-especial');
        assert.strictEqual(normalizeTagSlug('   '), '');
    });
});

describe('Birthday Detector', () => {
    it('detects birthday keywords with case-insensitivity and accents', () => {
        assert.strictEqual(looksLikeBirthday('Cumpleaños de María'), true);
        assert.strictEqual(looksLikeBirthday('cumple Juan'), true);
        assert.strictEqual(looksLikeBirthday("Mom's birthday party"), true);
        assert.strictEqual(looksLikeBirthday('Aniversario de bodas'), true);
        assert.strictEqual(looksLikeBirthday('bday celebration'), true);
        assert.strictEqual(looksLikeBirthday('Pagar factura de luz'), false);
        assert.strictEqual(looksLikeBirthday('Reunión con el equipo'), false);
    });
});
