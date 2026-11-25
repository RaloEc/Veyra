// Pure recurrence expansion module shared with Supabase Edge Functions (Deno & Node 24+ compatible).

export type RecurrenceRule =
  | { type: 'none' }
  | { type: 'daily'; interval?: number }
  | { type: 'weekly'; interval?: number; by_weekday?: number[] }
  | { type: 'monthly'; interval?: number; by_monthday?: number[] }
  | { type: 'yearly'; interval?: number; by_month?: number; by_monthday?: number; feb29_policy?: 'feb28' | 'mar01' | 'skip' }
  | { type: 'weekdays' };

export interface Occurrence {
  eventId: string;
  startTimeMs: number;
  endTimeMs: number;
  allDayDate: string | null;
  isAllDay: boolean;
  occurrenceDate: string;
  isOriginal: boolean;
}

export interface RecurrenceEventInput {
  id: string;
  start_time_ms: number;
  end_time_ms: number;
  is_all_day?: boolean | number | null;
  all_day_date?: string | null;
  timezone?: string | null;
  repeat_rule?: string | null;
  recurrence_rule?: string | null;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getDaysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

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

function getZonedDateParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number } {
  const tz = timeZone || 'UTC';
  try {
    const formatter = getCachedFormatter(tz);
    const parts = formatter.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }

    const weekdayStr = map.weekday || '';
    const weekday = WEEKDAY_MAP[weekdayStr] ?? date.getUTCDay();

    let hour = parseInt(map.hour || '0', 10);
    if (hour === 24) hour = 0;

    return {
      year: parseInt(map.year || '1970', 10),
      month: parseInt(map.month || '1', 10),
      day: parseInt(map.day || '1', 10),
      hour,
      minute: parseInt(map.minute || '0', 10),
      second: parseInt(map.second || '0', 10),
      weekday,
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      weekday: date.getUTCDay(),
    };
  }
}

function makeZonedDateMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): number {
  const tz = timeZone || 'UTC';
  try {
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
    const zParts = getZonedDateParts(new Date(utcGuess), tz);
    const zGuess = Date.UTC(zParts.year, zParts.month - 1, zParts.day, zParts.hour, zParts.minute, zParts.second);
    const diff = zGuess - utcGuess;
    return utcGuess - diff;
  } catch {
    return Date.UTC(year, month - 1, day, hour, minute, second);
  }
}

function formatYmd(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function parseRecurrenceRule(raw: unknown): RecurrenceRule {
  if (!raw) return { type: 'none' };

  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'none' || trimmed === 'null') {
      return { type: 'none' };
    }
    try {
      const json = JSON.parse(trimmed) as unknown;
      if (json && typeof json === 'object') {
        parsed = json as Record<string, unknown>;
      }
    } catch {
      const lower = trimmed.toLowerCase();
      if (lower === 'weekdays' || lower.includes('weekdays')) return { type: 'weekdays' };
      if (lower.includes('daily') || lower.includes('diario')) return { type: 'daily', interval: 1 };
      if (lower.includes('weekly') || lower.includes('semanal')) return { type: 'weekly', interval: 1 };
      if (lower.includes('monthly') || lower.includes('mensual')) return { type: 'monthly', interval: 1 };
      if (lower.includes('yearly') || lower.includes('anual')) return { type: 'yearly', interval: 1 };
      return { type: 'none' };
    }
  } else if (typeof raw === 'object') {
    parsed = raw as Record<string, unknown>;
  }

  if (!parsed) return { type: 'none' };

  const type = parsed.type;
  switch (type) {
    case 'daily':
      return {
        type: 'daily',
        interval: Math.max(1, Number(parsed.interval) || 1),
      };

    case 'weekly': {
      const rawDays = parsed.by_weekday ?? parsed.days;
      const byWeekday = Array.isArray(rawDays)
        ? rawDays.map((d) => Number(d)).filter((d) => Number.isFinite(d) && d >= 0 && d <= 6)
        : undefined;
      return {
        type: 'weekly',
        interval: Math.max(1, Number(parsed.interval) || 1),
        by_weekday: byWeekday && byWeekday.length > 0 ? Array.from(new Set(byWeekday)).sort() : undefined,
      };
    }

    case 'monthly': {
      const rawDays = parsed.by_monthday;
      const byMonthday = Array.isArray(rawDays)
        ? rawDays.map((d) => Number(d)).filter((d) => Number.isFinite(d) && d >= 1 && d <= 31)
        : undefined;
      return {
        type: 'monthly',
        interval: Math.max(1, Number(parsed.interval) || 1),
        by_monthday: byMonthday && byMonthday.length > 0 ? Array.from(new Set(byMonthday)).sort() : undefined,
      };
    }

    case 'yearly': {
      const byMonth = parsed.by_month !== undefined ? Number(parsed.by_month) : undefined;
      const byMonthday = parsed.by_monthday !== undefined ? Number(parsed.by_monthday) : undefined;
      const rawPolicy = parsed.feb29_policy;
      let feb29Policy: 'feb28' | 'mar01' | 'skip' | undefined =
        rawPolicy === 'feb28' || rawPolicy === 'mar01' || rawPolicy === 'skip' ? rawPolicy : undefined;

      if (byMonth === 2 && byMonthday === 29 && !feb29Policy) {
        feb29Policy = 'feb28';
      }

      return {
        type: 'yearly',
        interval: Math.max(1, Number(parsed.interval) || 1),
        by_month: byMonth,
        by_monthday: byMonthday,
        feb29_policy: feb29Policy,
      };
    }

    case 'weekdays':
      return { type: 'weekdays' };

    default:
      return { type: 'none' };
  }
}

export function expandOccurrences(
  event: RecurrenceEventInput,
  from: Date | number,
  to: Date | number
): Occurrence[] {
  const fromDate = typeof from === 'number' ? new Date(from) : from;
  const toDate = typeof to === 'number' ? new Date(to) : to;

  if (!fromDate || isNaN(fromDate.getTime()) || !toDate || isNaN(toDate.getTime())) {
    return [];
  }

  const tz = event.timezone || 'UTC';
  const isAllDay = Boolean(event.is_all_day);
  const durationMs = Math.max(0, event.end_time_ms - event.start_time_ms);
  const rule = parseRecurrenceRule(event.recurrence_rule || event.repeat_rule);

  const occurrences: Occurrence[] = [];
  const eventStartParts = getZonedDateParts(new Date(event.start_time_ms), tz);

  if (rule.type === 'none') {
    const occDate =
      event.all_day_date || formatYmd(eventStartParts.year, eventStartParts.month, eventStartParts.day);
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

    const origDateStr =
      event.all_day_date ||
      formatYmd(eventStartParts.year, eventStartParts.month, eventStartParts.day);
    const isNotBeforeStart = isAllDay
      ? occDateStr >= origDateStr
      : startMs >= event.start_time_ms - 1000;

    if (endMs >= fromLimitMs && startMs <= toLimitMs && isNotBeforeStart) {
      occurrences.push({
        eventId: event.id,
        startTimeMs: startMs,
        endTimeMs: endMs,
        allDayDate: isAllDay ? occDateStr : null,
        isAllDay,
        occurrenceDate: occDateStr,
        isOriginal: occDateStr === origDateStr,
      });
    }
  };

  switch (rule.type) {
    case 'daily': {
      const interval = rule.interval || 1;
      const cursor = new Date(Math.max(event.start_time_ms, fromLimitMs - 86400000));
      const cParts = getZonedDateParts(cursor, tz);
      let currentDayMs = makeZonedDateMs(cParts.year, cParts.month, cParts.day, 0, 0, 0, tz);
      const origDayMs = makeZonedDateMs(
        eventStartParts.year,
        eventStartParts.month,
        eventStartParts.day,
        0,
        0,
        0,
        tz
      );

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
      const cursor = new Date(Math.max(event.start_time_ms, fromLimitMs - 86400000));
      const cParts = getZonedDateParts(cursor, tz);
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
      const targetDays =
        rule.by_weekday && rule.by_weekday.length > 0 ? rule.by_weekday : [eventStartParts.weekday];

      const cursor = new Date(Math.max(event.start_time_ms, fromLimitMs - 86400000 * 7));
      const cParts = getZonedDateParts(cursor, tz);
      let currentDayMs = makeZonedDateMs(cParts.year, cParts.month, cParts.day, 0, 0, 0, tz);
      const origDayMs = makeZonedDateMs(
        eventStartParts.year,
        eventStartParts.month,
        eventStartParts.day,
        0,
        0,
        0,
        tz
      );

      while (currentDayMs <= toLimitMs + 86400000 * 7) {
        const p = getZonedDateParts(new Date(currentDayMs + 43200000), tz);
        if (targetDays.includes(p.weekday)) {
          const daysSinceOrig = Math.round((currentDayMs - origDayMs) / 86400000);
          if (daysSinceOrig >= -6) {
            const weekDiff = Math.floor(
              (daysSinceOrig + (eventStartParts.weekday === 0 ? 6 : eventStartParts.weekday - 1)) / 7
            );
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
      const targetMonthdays =
        rule.by_monthday && rule.by_monthday.length > 0 ? rule.by_monthday : [eventStartParts.day];

      const startYear = eventStartParts.year;
      const endYear = toParts.year + 1;

      for (let y = Math.max(startYear, fromParts.year); y <= endYear; y++) {
        for (let m = 1; m <= 12; m++) {
          const monthsSinceStart = (y - startYear) * 12 + (m - eventStartParts.month);
          if (monthsSinceStart >= 0 && monthsSinceStart % interval === 0) {
            const daysInMonth = getDaysInMonth(y, m);
            for (const targetDay of targetMonthdays) {
              tryEmitOccurrence(y, m, Math.min(targetDay, daysInMonth));
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
            } else if (feb29Policy === 'feb28') {
              tryEmitOccurrence(y, 2, 28);
            } else if (feb29Policy === 'mar01') {
              tryEmitOccurrence(y, 3, 1);
            }
          } else {
            const daysInMonth = getDaysInMonth(y, targetMonth);
            tryEmitOccurrence(y, targetMonth, Math.min(targetDay, daysInMonth));
          }
        }
      }
      break;
    }
  }

  occurrences.sort((a, b) => a.startTimeMs - b.startTimeMs);

  const seen = new Set<string>();
  return occurrences.filter((occ) => {
    const key = `${occ.occurrenceDate}_${occ.startTimeMs}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveEventNotificationOffsets(
  notificationOffsets: string | null | undefined,
  notificationOffsetMin: number | null | undefined,
  defaultLeadMinutes: number
): number[] {
  if (typeof notificationOffsets === 'string' && notificationOffsets.trim() !== '') {
    try {
      const parsed = JSON.parse(notificationOffsets) as unknown;
      if (Array.isArray(parsed)) {
        return Array.from(
          new Set(
            parsed.map(Number).filter((n) => Number.isFinite(n) && n >= 0)
          )
        );
      }
    } catch {
      // Malformed JSON falls back below
    }
  }
  if (typeof notificationOffsetMin === 'number' && Number.isFinite(notificationOffsetMin) && notificationOffsetMin >= 0) {
    return [notificationOffsetMin];
  }
  return [defaultLeadMinutes > 0 ? defaultLeadMinutes : 15];
}
