import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDB } from '../db';
import { Reminder, CalendarEvent } from '../types/db';
import { looksLikeBirthday } from '../utils/birthdayDetector';
import { extractHashtags } from '../utils/hashtagParser';
import {
    getDeviceTimezone,
    getZonedDateParts,
    formatYmd,
    makeZonedDateMs,
    parseRecurrenceRule,
} from '../services/recurrence/recurrenceEngine';
import { TagService } from '../services/TagService';
import { NotificationService } from '../services/notificationService';
import * as Crypto from 'expo-crypto';

const MIGRATION_FLAG_KEY = 'migration_birthdays_v1_done';

export async function runBirthdayMigrationIfNeeded(): Promise<{ migratedCount: number }> {
    try {
        const isDone = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
        if (isDone === 'true') {
            return { migratedCount: 0 };
        }

        const db = await getDB();
        const tz = getDeviceTimezone();

        // 1. Obtener todos los recordatorios activos
        const allReminders = await db.getAllAsync<Reminder>(
            `SELECT * FROM reminders WHERE deleted = 0`
        );

        const candidates = allReminders.filter((rem) => {
            if (!rem.repeat_rule) return false;
            const parsedRule = parseRecurrenceRule(rem.repeat_rule);
            if (parsedRule.type !== 'yearly') return false;

            const { cleanText } = extractHashtags(rem.title);
            return looksLikeBirthday(cleanText);
        });

        if (candidates.length === 0) {
            await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
            return { migratedCount: 0 };
        }

        let migratedCount = 0;
        const now = Date.now();

        for (const rem of candidates) {
            try {
                const { cleanText, tags: extractedTags } = extractHashtags(rem.title);
                const originalDate = new Date(rem.due_date_ms);
                const zParts = getZonedDateParts(originalDate, tz);
                const allDayDate = formatYmd(zParts.year, zParts.month, zParts.day);

                const [y, m, d] = allDayDate.split('-').map(Number);
                const eventStartMs = makeZonedDateMs(y, m, d, 0, 0, 0, tz);
                const eventEndMs = makeZonedDateMs(y, m, d, 23, 59, 59, tz) + 999;

                // Calcular offset en minutos respecto a medianoche local
                const originalMidnightMs = makeZonedDateMs(zParts.year, zParts.month, zParts.day, 0, 0, 0, tz);
                const offsetMinutes = Math.round((rem.due_date_ms - originalMidnightMs) / 60000);

                const recurrenceRule = JSON.stringify({
                    type: 'yearly',
                    interval: 1,
                    by_month: zParts.month,
                    by_monthday: zParts.day,
                    feb29_policy: 'feb28',
                });

                const eventId = Crypto.randomUUID();
                const newReminderId = Crypto.randomUUID();

                // 2. Crear Event de todo el día anual
                await db.runAsync(
                    `INSERT INTO events (
                        id, user_id, title, description, category_id,
                        start_time_ms, end_time_ms, is_all_day, all_day_date, timezone,
                        repeat_rule, recurrence_rule, is_birthday_like,
                        color, notification_offset_min, created_at_ms, updated_at_ms, last_modified_ms, deleted
                    ) VALUES (?, ?, ?, ?, NULL, ?, ?, 1, ?, ?, ?, ?, 1, '#EC4899', 0, ?, ?, ?, 0)`,
                    [
                        eventId,
                        rem.user_id || null,
                        cleanText,
                        rem.description || null,
                        eventStartMs,
                        eventEndMs,
                        allDayDate,
                        tz,
                        recurrenceRule,
                        recurrenceRule,
                        now,
                        now,
                        now,
                    ]
                );

                // 3. Crear Reminder vinculado
                const dueMs = eventStartMs + offsetMinutes * 60000;
                await db.runAsync(
                    `INSERT INTO reminders (
                        id, user_id, title, description, due_date_ms, control_level,
                        priority, status, next_attempt_ms, retry_count, max_retries,
                        last_modified_ms, deleted, repeat_rule, event_id, offset_minutes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 0, ?, ?, ?)`,
                    [
                        newReminderId,
                        rem.user_id || null,
                        cleanText,
                        rem.description || null,
                        dueMs,
                        rem.control_level,
                        rem.priority,
                        dueMs,
                        rem.retry_count,
                        rem.max_retries,
                        now,
                        recurrenceRule,
                        eventId,
                        offsetMinutes,
                    ]
                );

                // 4. Copiar tags
                if (extractedTags.length > 0) {
                    await TagService.setTagsForItem('event', eventId, extractedTags);
                    await TagService.setTagsForItem('reminder', newReminderId, extractedTags);
                }

                // 5. Cancelar notificaciones viejas y programar las nuevas
                if (rem.notification_ids) {
                    let parsedIds: string[] = [];
                    try {
                        const parsed = JSON.parse(rem.notification_ids);
                        if (Array.isArray(parsed)) parsedIds = parsed;
                    } catch {}
                    await NotificationService.cancelNotificationsForReminder(rem.id, parsedIds);
                }

                const createdReminder: Reminder = {
                    ...rem,
                    id: newReminderId,
                    due_date_ms: dueMs,
                    event_id: eventId,
                    offset_minutes: offsetMinutes,
                };
                const newNotifIds = await NotificationService.scheduleReminderNotification(createdReminder);
                if (newNotifIds.length > 0) {
                    await db.runAsync(
                        `UPDATE reminders SET notification_ids = ? WHERE id = ?`,
                        [JSON.stringify(newNotifIds), newReminderId]
                    );
                }

                // 6. Marcar el recordatorio original como completado preservando historial
                const migrationNote = `Migrado a evento el ${new Date().toISOString()}`;
                const newDesc = rem.description ? `${rem.description}\n[${migrationNote}]` : `[${migrationNote}]`;
                await db.runAsync(
                    `UPDATE reminders SET status = 'completed', description = ?, last_modified_ms = ? WHERE id = ?`,
                    [newDesc, now, rem.id]
                );

                migratedCount++;
            } catch (itemErr) {
                console.warn('[BirthdayMigration] Error migrando recordatorio individual:', rem.id, itemErr);
            }
        }

        await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'true');
        console.log(`[BirthdayMigration] Successfully migrated ${migratedCount} birthday reminders to all-day events.`);
        return { migratedCount };
    } catch (err) {
        console.error('[BirthdayMigration] Migration error:', err);
        return { migratedCount: 0 };
    }
}
