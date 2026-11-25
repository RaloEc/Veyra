import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReminderAttempt,
  computeDueEventAttempts,
} from '../dispatchLogic.ts';

const buildReminderNotificationTag = (reminderId) => `reminder-${reminderId}`;
const buildEventNotificationTag = (eventId, startTimeMs, offsetMin) =>
  `event-${eventId}-${startTimeMs}-${offsetMin}`;

test('computeReminderAttempt creates distinct deliveryKeys when a reminder is snoozed', () => {
  const originalDueMs = 1_795_400_000_000;
  const firstNowMs = originalDueMs + 60_000;

  const firstAttempt = computeReminderAttempt(
    {
      id: 'rem-1',
      due_date_ms: originalDueMs,
      snooze_until_ms: null,
      control_level: 'normal',
      offset_minutes: 0,
    },
    firstNowMs,
    0
  );

  assert.ok(firstAttempt);
  assert.equal(firstAttempt.attemptType, 'base');
  assert.equal(firstAttempt.deliveryKey, `base:${originalDueMs}`);
  assert.equal(firstAttempt.tag, buildReminderNotificationTag('rem-1'));

  // Snooze 10 minutes later -> must yield a brand new deliveryKey so backend re-dispatches
  const snoozedUntilMs = originalDueMs + 10 * 60 * 1000;
  const snoozedNowMs = snoozedUntilMs + 30_000;

  const snoozedAttempt = computeReminderAttempt(
    {
      id: 'rem-1',
      due_date_ms: originalDueMs,
      snooze_until_ms: snoozedUntilMs,
      control_level: 'normal',
      offset_minutes: 0,
    },
    snoozedNowMs,
    0
  );

  assert.ok(snoozedAttempt);
  assert.equal(snoozedAttempt.attemptType, 'base');
  assert.equal(snoozedAttempt.deliveryKey, `base:${snoozedUntilMs}`);
  assert.notEqual(snoozedAttempt.deliveryKey, firstAttempt.deliveryKey);
});

test('computeReminderAttempt handles lead, normalizes legacy strict to normal, and handles critical escalation', () => {
  const dueMs = 1_795_400_000_000;

  const lead = computeReminderAttempt(
    {
      id: 'rem-lead',
      due_date_ms: dueMs,
      snooze_until_ms: null,
      control_level: 'normal',
      offset_minutes: 10,
    },
    dueMs - 8 * 60 * 1000,
    0
  );
  assert.equal(lead?.attemptType, 'lead');
  assert.equal(lead?.leadMinutes, 10);

  const legacyStrict = computeReminderAttempt(
    {
      id: 'rem-strict',
      due_date_ms: dueMs,
      snooze_until_ms: null,
      control_level: 'strict',
      offset_minutes: 0,
    },
    dueMs + 30 * 60 * 1000,
    0,
    dueMs - 5 * 60 * 1000
  );
  assert.equal(legacyStrict?.level, 'normal');
  assert.equal(legacyStrict?.attemptType, 'base');

  const critical3 = computeReminderAttempt(
    {
      id: 'rem-crit',
      due_date_ms: dueMs,
      snooze_until_ms: null,
      control_level: 'critical',
      offset_minutes: 0,
    },
    dueMs + 16 * 60 * 1000,
    0,
    dueMs - 5 * 60 * 1000
  );
  assert.equal(critical3?.attemptType, 'critical_3');
});

test('computeDueEventAttempts expands recurring events started days ago and aligns tags with frontend', () => {
  // Daily event started 5 days ago at 15:00 UTC
  const fiveDaysAgoMs = Date.UTC(2026, 10, 18, 15, 0, 0);
  const todayOccStartMs = Date.UTC(2026, 10, 23, 15, 0, 0);
  // Check at 14:46 UTC (14 minutes before 15:00 -> offset 15m triggered 1 min ago!)
  const nowMs = Date.UTC(2026, 10, 23, 14, 46, 0);

  const matches = computeDueEventAttempts(
    {
      id: 'ev-daily',
      user_id: 'u-1',
      title: 'Standup diario',
      description: null,
      location: 'Zoom',
      start_time_ms: fiveDaysAgoMs,
      end_time_ms: fiveDaysAgoMs + 3600_000,
      timezone: 'UTC',
      repeat_rule: JSON.stringify({ type: 'daily', interval: 1 }),
      recurrence_rule: null,
      notification_offset_min: 15,
      notification_offsets: JSON.stringify([15, 0]),
    },
    nowMs,
    15
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].offsetMin, 15);
  assert.equal(matches[0].occurrenceStartMs, todayOccStartMs);
  assert.equal(matches[0].attemptKey, `offset_15_${todayOccStartMs}`);
  assert.equal(
    matches[0].tag,
    buildEventNotificationTag('ev-daily', todayOccStartMs, 15)
  );
  assert.equal(matches[0].body, 'Ubicación: Zoom');
});

test('computeDueEventAttempts skips push when notification_offsets is explicitly empty []', () => {
  const startMs = Date.UTC(2026, 10, 23, 15, 0, 0);
  const nowMs = startMs + 60_000;

  const matches = computeDueEventAttempts(
    {
      id: 'ev-muted',
      user_id: 'u-1',
      title: 'Silenciado',
      description: 'No avisar',
      location: null,
      start_time_ms: startMs,
      end_time_ms: startMs + 3600_000,
      timezone: 'UTC',
      repeat_rule: null,
      recurrence_rule: null,
      notification_offset_min: 15,
      notification_offsets: '[]',
    },
    nowMs,
    15
  );

  assert.deepEqual(matches, []);
});
