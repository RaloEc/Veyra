import { expandOccurrences, resolveEventNotificationOffsets, type RecurrenceEventInput } from './recurrence.ts';

export interface ReminderDispatchInput {
  id: string;
  due_date_ms: number;
  snooze_until_ms: number | null;
  control_level: string | null;
  offset_minutes: number | null;
}

export interface ReminderAttemptMatch {
  attemptType: string;
  deliveryKey: string;
  effectiveDueMs: number;
  leadMinutes: number;
  level: string;
  tag: string;
}

export interface EventDispatchInput extends RecurrenceEventInput {
  user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  notification_offset_min: number | null;
  notification_offsets: string | null;
}

export interface EventAttemptMatch {
  attemptKey: string;
  offsetMin: number;
  occurrenceStartMs: number;
  tag: string;
  title: string;
  body: string;
}

export function buildReminderNotificationTag(reminderId: string): string {
  return `reminder-${reminderId}`;
}

export function buildEventNotificationTag(
  eventId: string,
  occurrenceStartMs: number,
  offsetMin: number
): string {
  return `event-${eventId}-${occurrenceStartMs}-${offsetMin}`;
}

export function computeReminderAttempt(
  rem: ReminderDispatchInput,
  nowMs: number,
  defaultLeadMinutes: number,
  lowerBoundMs: number = nowMs - 30 * 60 * 1000
): ReminderAttemptMatch | null {
  const isSnoozed = Boolean(rem.snooze_until_ms && rem.snooze_until_ms > 0);
  const effectiveDueMs = isSnoozed ? Number(rem.snooze_until_ms) : Number(rem.due_date_ms);
  if (!Number.isFinite(effectiveDueMs) || effectiveDueMs <= 0) return null;

  const leadMinutes = isSnoozed
    ? 0
    : typeof rem.offset_minutes === 'number'
      ? rem.offset_minutes
      : defaultLeadMinutes;
  const leadTriggerMs = Number(rem.due_date_ms) - Math.max(0, leadMinutes) * 60 * 1000;
  const level = rem.control_level?.toLowerCase() === 'critical' ? 'critical' : 'normal';

  let attemptType: string | null = null;
  if (effectiveDueMs >= lowerBoundMs && effectiveDueMs <= nowMs) {
    const elapsedMs = nowMs - effectiveDueMs;
    attemptType = 'base';
    if (level === 'critical') {
      if (elapsedMs >= 25 * 60 * 1000) attemptType = 'critical_5';
      else if (elapsedMs >= 20 * 60 * 1000) attemptType = 'critical_4';
      else if (elapsedMs >= 15 * 60 * 1000) attemptType = 'critical_3';
      else if (elapsedMs >= 10 * 60 * 1000) attemptType = 'critical_2';
      else if (elapsedMs >= 5 * 60 * 1000) attemptType = 'critical_1';
    }
  } else if (
    !isSnoozed &&
    leadMinutes > 0 &&
    nowMs >= leadTriggerMs &&
    nowMs < Number(rem.due_date_ms) &&
    leadTriggerMs >= lowerBoundMs
  ) {
    attemptType = 'lead';
  }

  if (!attemptType) return null;

  // Include effectiveDueMs in deliveryKey so snoozed or rescheduled occurrences deliver a fresh push
  const deliveryKey = `${attemptType}:${effectiveDueMs}`;
  return {
    attemptType,
    deliveryKey,
    effectiveDueMs,
    leadMinutes,
    level,
    tag: buildReminderNotificationTag(rem.id),
  };
}

export function computeDueEventAttempts(
  ev: EventDispatchInput,
  nowMs: number,
  defaultLeadMinutes: number,
  lowerBoundMs: number = nowMs - 30 * 60 * 1000
): EventAttemptMatch[] {
  const offsets = resolveEventNotificationOffsets(
    ev.notification_offsets,
    ev.notification_offset_min,
    defaultLeadMinutes
  );
  if (offsets.length === 0) return [];

  const rangeStartMs = nowMs - 24 * 60 * 60 * 1000;
  const rangeEndMs = nowMs + 8 * 24 * 60 * 60 * 1000;
  const occurrences = expandOccurrences(ev, rangeStartMs, rangeEndMs);

  const matches: EventAttemptMatch[] = [];
  for (const occ of occurrences) {
    for (const offsetMin of offsets) {
      const triggerMs = occ.startTimeMs - offsetMin * 60 * 1000;
      if (triggerMs > nowMs || triggerMs < lowerBoundMs) continue;

      const attemptKey = `offset_${offsetMin}_${occ.startTimeMs}`;
      const title = offsetMin === 0 ? ev.title : `📅 En ${offsetMin} min: ${ev.title}`;
      const body =
        ev.description ||
        (ev.location ? `Ubicación: ${ev.location}` : 'Evento agendado en Veyra');

      matches.push({
        attemptKey,
        offsetMin,
        occurrenceStartMs: occ.startTimeMs,
        tag: buildEventNotificationTag(ev.id, occ.startTimeMs, offsetMin),
        title,
        body,
      });
    }
  }

  return matches;
}
