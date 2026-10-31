import { getDB } from '../db';
import { CalendarEvent, Reminder } from '../types/db';
export type { CalendarEvent } from '../types/db';
import * as Crypto from 'expo-crypto';
import { startOfDay, endOfDay, isSameDay, format } from 'date-fns';
import {
    makeZonedDateMs,
    getZonedDateParts,
    formatYmd,
    getDeviceTimezone,
    expandOccurrences,
    parseRecurrenceRule,
} from './recurrence/recurrenceEngine';
import { TagService } from './TagService';
import { SearchService } from './searchService';

export interface CreateEventInput {
    title: string;
    description?: string;
    startTimeMs: number;
    endTimeMs: number;
    isAllDay?: boolean;
    allDayDate?: string | null;
    timezone?: string;
    repeatRule?: string; // JSON legacy o RecurrenceRule
    recurrenceRule?: string | null; // JSON serializado de RecurrenceRule
    recurrenceParentId?: string | null;
    isBirthdayLike?: boolean;
    categoryId?: string | null;
    location?: string;
    color?: string;
    notificationOffsetMin?: number;
    notificationOffsets?: string; // JSON array of numbers, e.g. "[5, 15, 1440]"
    notificationIds?: string;
    noteId?: string | null;
    folderId?: string | null;
    tags?: string; // JSON array of string tags, e.g. '["clase"]'
    tagNames?: string[]; // Array de strings directos
    userId?: string;
}

function triggerWidgetSync() {
    setTimeout(() => {
        import('../widgets/widgetUpdater').then(({ updateTodayWidget }) => {
            updateTodayWidget().catch(() => {});
        }).catch(() => {});
    }, 0);
}

function triggerSearchIndex(event: CalendarEvent) {
    SearchService.indexEvent(event).catch(() => {});
}

function triggerSearchRemove(id: string) {
    SearchService.removeItem('event', id).catch(() => {});
    SearchService.removeItem('schedule', id).catch(() => {});
}

export const EventService = {
    async createEvent(input: CreateEventInput): Promise<CalendarEvent> {
        const db = await getDB();
        const id = Crypto.randomUUID();
        const now = Date.now();

        const isAllDay = Boolean(input.isAllDay);
        const timezone = input.timezone || getDeviceTimezone();

        let allDayDate: string | null = null;
        let finalStartTimeMs = input.startTimeMs;
        let finalEndTimeMs = input.endTimeMs;

        if (isAllDay) {
            if (input.allDayDate && /^\d{4}-\d{2}-\d{2}$/.test(input.allDayDate)) {
                allDayDate = input.allDayDate;
            } else {
                const zParts = getZonedDateParts(new Date(input.startTimeMs || now), timezone);
                allDayDate = formatYmd(zParts.year, zParts.month, zParts.day);
            }

            const [y, m, d] = allDayDate.split('-').map(Number);
            finalStartTimeMs = makeZonedDateMs(y, m, d, 0, 0, 0, timezone);
            finalEndTimeMs = makeZonedDateMs(y, m, d, 23, 59, 59, timezone) + 999;
        }

        let initialOffsets = input.notificationOffsets;
        if (!initialOffsets && input.notificationOffsetMin !== undefined) {
            initialOffsets = JSON.stringify([input.notificationOffsetMin]);
        } else if (!initialOffsets) {
            initialOffsets = JSON.stringify([15]);
        }

        const recurrenceRule = input.recurrenceRule || input.repeatRule || null;
        const isBirthdayLike = input.isBirthdayLike ? 1 : 0;

        const newEvent: CalendarEvent = {
            id,
            user_id: input.userId,
            title: input.title.trim(),
            description: input.description?.trim() || undefined,
            category_id: input.categoryId || null,
            start_time_ms: finalStartTimeMs,
            end_time_ms: finalEndTimeMs,
            is_all_day: isAllDay ? 1 : 0,
            all_day_date: allDayDate,
            timezone,
            repeat_rule: input.repeatRule || (recurrenceRule ? recurrenceRule : undefined),
            recurrence_rule: recurrenceRule,
            recurrence_parent_id: input.recurrenceParentId || null,
            is_birthday_like: isBirthdayLike,
            location: input.location?.trim() || undefined,
            color: input.color || undefined,
            notification_offset_min: input.notificationOffsetMin !== undefined ? input.notificationOffsetMin : 15,
            notification_offsets: initialOffsets,
            notification_ids: input.notificationIds || undefined,
            note_id: input.noteId || null,
            folder_id: input.folderId || null,
            tags: input.tags || undefined,
            created_at_ms: now,
            updated_at_ms: now,
            last_modified_ms: now,
            deleted: 0,
        };

        await db.runAsync(
            `INSERT INTO events (
                id, user_id, title, description, category_id,
                start_time_ms, end_time_ms, is_all_day, all_day_date, timezone,
                repeat_rule, recurrence_rule, recurrence_parent_id, is_birthday_like,
                location, color, notification_offset_min, notification_offsets, notification_ids,
                note_id, folder_id, tags, created_at_ms, updated_at_ms, last_modified_ms, deleted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                id,
                input.userId || null,
                newEvent.title,
                newEvent.description || null,
                newEvent.category_id || null,
                newEvent.start_time_ms,
                newEvent.end_time_ms,
                newEvent.is_all_day ? 1 : 0,
                newEvent.all_day_date || null,
                newEvent.timezone || null,
                newEvent.repeat_rule || null,
                newEvent.recurrence_rule || null,
                newEvent.recurrence_parent_id || null,
                newEvent.is_birthday_like ? 1 : 0,
                newEvent.location || null,
                newEvent.color || null,
                newEvent.notification_offset_min ?? null,
                newEvent.notification_offsets || null,
                newEvent.notification_ids || null,
                newEvent.note_id || null,
                newEvent.folder_id || null,
                newEvent.tags || null,
                now,
                now,
                now,
            ]
        );

        // Guardar tags en el sistema transversal de tags
        const tagsToSave = input.tagNames || (input.tags ? JSON.parse(input.tags) : []);
        if (Array.isArray(tagsToSave) && tagsToSave.length > 0) {
            TagService.setTagsForItem('event', id, tagsToSave).catch(err => {
                console.warn('[EventService] Error setting tags for event:', err);
            });
        }

        // Si se vinculó una nota, actualizar la nota bidireccionalmente
        if (input.noteId) {
            await db.runAsync(
                `UPDATE notes SET event_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                [id, now, now, input.noteId]
            );
        }

        triggerWidgetSync();
        triggerSearchIndex(newEvent);
        return newEvent;
    },

    async updateEvent(
        id: string,
        updates: Partial<CalendarEvent>,
        tagNames?: string[]
    ): Promise<void> {
        const db = await getDB();
        const now = Date.now();

        // Obtener el evento actual para comparar cambios de fecha/hora
        const currentEvent = await this.getEventById(id);
        if (!currentEvent) return;

        let finalStartTimeMs = updates.start_time_ms !== undefined ? updates.start_time_ms : currentEvent.start_time_ms;
        let finalEndTimeMs = updates.end_time_ms !== undefined ? updates.end_time_ms : currentEvent.end_time_ms;
        const isAllDay = updates.is_all_day !== undefined ? Boolean(updates.is_all_day) : Boolean(currentEvent.is_all_day);
        const timezone = updates.timezone || currentEvent.timezone || getDeviceTimezone();

        let allDayDate = updates.all_day_date !== undefined ? updates.all_day_date : currentEvent.all_day_date;

        if (isAllDay) {
            if (!allDayDate || !/^\d{4}-\d{2}-\d{2}$/.test(allDayDate)) {
                const zParts = getZonedDateParts(new Date(finalStartTimeMs), timezone);
                allDayDate = formatYmd(zParts.year, zParts.month, zParts.day);
            }
            const [y, m, d] = allDayDate.split('-').map(Number);
            finalStartTimeMs = makeZonedDateMs(y, m, d, 0, 0, 0, timezone);
            finalEndTimeMs = makeZonedDateMs(y, m, d, 23, 59, 59, timezone) + 999;
        }

        const mergedUpdates: Record<string, any> = {
            ...updates,
            start_time_ms: finalStartTimeMs,
            end_time_ms: finalEndTimeMs,
            is_all_day: isAllDay ? 1 : 0,
            all_day_date: isAllDay ? allDayDate : null,
            timezone,
        };

        const sets: string[] = [];
        const params: any[] = [];

        Object.entries(mergedUpdates).forEach(([key, value]) => {
            if (key !== 'id' && key !== 'created_at_ms') {
                sets.push(`${key} = ?`);
                params.push(value);
            }
        });

        if (sets.length > 0) {
            sets.push(`updated_at_ms = ?`);
            params.push(now);
            sets.push(`last_modified_ms = ?`);
            params.push(now);
            params.push(id);

            await db.runAsync(
                `UPDATE events SET ${sets.join(', ')} WHERE id = ?`,
                params
            );
        }

        // Si cambiaron los tags
        if (tagNames) {
            await TagService.setTagsForItem('event', id, tagNames);
        } else if (updates.tags) {
            try {
                const parsed = JSON.parse(updates.tags);
                if (Array.isArray(parsed)) {
                    await TagService.setTagsForItem('event', id, parsed);
                }
            } catch {}
        }

        // Si cambió la fecha/hora de inicio, recalcular recordatorios vinculados
        const dateChanged = currentEvent.start_time_ms !== finalStartTimeMs || currentEvent.is_all_day !== (isAllDay ? 1 : 0);
        if (dateChanged) {
            try {
                const linkedReminders = await db.getAllAsync<Reminder>(
                    `SELECT * FROM reminders WHERE event_id = ? AND deleted = 0`,
                    [id]
                );

                const { NotificationService } = await import('./notificationService');
                for (const rem of linkedReminders) {
                    const offsetMinutes = rem.offset_minutes || 0;
                    const newDueDate = finalStartTimeMs + offsetMinutes * 60_000;

                    // Actualizar en BD
                    await db.runAsync(
                        `UPDATE reminders SET due_date_ms = ?, next_attempt_ms = ?, last_modified_ms = ? WHERE id = ?`,
                        [newDueDate, newDueDate, now, rem.id]
                    );

                    // Reprogramar notificaciones
                    if (rem.notification_ids) {
                        await NotificationService.cancelNotificationsForReminder(rem.notification_ids);
                    }
                    const updatedReminder = { ...rem, due_date_ms: newDueDate };
                    const newNotifIds = await NotificationService.scheduleReminderNotification(updatedReminder);
                    if (newNotifIds.length > 0) {
                        await db.runAsync(
                            `UPDATE reminders SET notification_ids = ? WHERE id = ?`,
                            [JSON.stringify(newNotifIds), rem.id]
                        );
                    }
                }
            } catch (err) {
                console.error('[EventService] Error recalculating linked reminders on event update:', err);
            }
        }

        // Si se actualizó note_id, mantener sincronizada la nota
        if ('note_id' in updates) {
            const newNoteId = updates.note_id;
            if (!newNoteId && currentEvent.note_id) {
                await db.runAsync(
                    `UPDATE notes SET event_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE id = ? AND event_id = ?`,
                    [now, now, currentEvent.note_id, id]
                );
            } else if (newNoteId) {
                await db.runAsync(
                    `UPDATE notes SET event_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                    [id, now, now, newNoteId]
                );
            }
        }

        triggerWidgetSync();
        this.getEventById(id).then(e => e && triggerSearchIndex(e)).catch(() => {});
    },

    async deleteEvent(id: string, options?: { cascadeReminders?: boolean }): Promise<void> {
        const db = await getDB();
        const now = Date.now();

        await db.runAsync(
            `UPDATE events SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [now, now, id]
        );

        // Desvincular nota si estaba asociada
        await db.runAsync(
            `UPDATE notes SET event_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE event_id = ?`,
            [now, now, id]
        );

        // Gestionar recordatorios vinculados
        if (options?.cascadeReminders) {
            const linked = await db.getAllAsync<Reminder>(
                `SELECT * FROM reminders WHERE event_id = ? AND deleted = 0`,
                [id]
            );
            const { NotificationService } = await import('./notificationService');
            for (const r of linked) {
                if (r.notification_ids) {
                    await NotificationService.cancelNotificationsForReminder(r.notification_ids);
                }
            }
            await db.runAsync(
                `UPDATE reminders SET deleted = 1, deleted_at_ms = ?, last_modified_ms = ? WHERE event_id = ?`,
                [now, now, id]
            );
        } else {
            // Desvincular recordatorios para que sigan existiendo como recordatorios independientes
            await db.runAsync(
                `UPDATE reminders SET event_id = NULL, offset_minutes = NULL, last_modified_ms = ? WHERE event_id = ?`,
                [now, id]
            );
        }

        triggerWidgetSync();
        triggerSearchRemove(id);
    },

    async deleteEventOccurrence(id: string, occurrenceDate: Date, mode: 'this' | 'following' | 'all'): Promise<void> {
        const event = await this.getEventById(id);
        if (!event) return;

        if (mode === 'all' || !event.repeat_rule || event.repeat_rule === 'null') {
            await this.deleteEvent(id);
            return;
        }

        const dateStr = format(occurrenceDate, 'yyyy-MM-dd');
        let currentRule: any = {};
        try {
            currentRule = JSON.parse(event.repeat_rule);
        } catch {
            currentRule = { type: 'weekly' };
        }

        const exceptions: string[] = Array.isArray(currentRule.exceptions) ? [...currentRule.exceptions] : [];

        if (mode === 'this') {
            if (!exceptions.includes(dateStr)) {
                exceptions.push(dateStr);
            }
            await this.updateEvent(id, {
                repeat_rule: JSON.stringify({ ...currentRule, exceptions }),
            });
        } else if (mode === 'following') {
            const untilMs = startOfDay(occurrenceDate).getTime() - 1;
            await this.updateEvent(id, {
                repeat_rule: JSON.stringify({ ...currentRule, until_ms: untilMs }),
            });
        }
    },

    async getAllEvents(includeDeleted: boolean = false): Promise<CalendarEvent[]> {
        const db = await getDB();
        if (includeDeleted) {
            return await db.getAllAsync<CalendarEvent>(
                `SELECT * FROM events ORDER BY start_time_ms ASC`
            );
        }
        return await db.getAllAsync<CalendarEvent>(
            `SELECT * FROM events WHERE deleted = 0 ORDER BY start_time_ms ASC`
        );
    },

    async getEventById(id: string): Promise<CalendarEvent | null> {
        const db = await getDB();
        const event = await db.getFirstAsync<CalendarEvent>(
            `SELECT * FROM events WHERE id = ?`,
            [id]
        );
        return event || null;
    },

    /**
     * Devuelve los eventos que ocurren en una fecha dada expandiendo ocurrencias
     * mediante recurrenceEngine (incluye all-day, cumpleaños, weekly, daily, monthly, etc.).
     */
    async getEventsForDate(targetDate: Date): Promise<CalendarEvent[]> {
        const allEvents = await this.getAllEvents(false);
        const dayStart = startOfDay(targetDate);
        const dayEnd = endOfDay(targetDate);

        const eventsToday: CalendarEvent[] = [];

        for (const ev of allEvents) {
            const occs = expandOccurrences(ev, dayStart, dayEnd);
            for (const occ of occs) {
                eventsToday.push({
                    ...ev,
                    start_time_ms: occ.startTimeMs,
                    end_time_ms: occ.endTimeMs,
                    is_all_day: occ.isAllDay ? 1 : 0,
                    all_day_date: occ.allDayDate,
                });
            }
        }

        // Ordenar: eventos de todo el día primero, luego cronológicamente por hora
        eventsToday.sort((a, b) => {
            const aAllDay = a.is_all_day === 1 || Boolean(a.is_all_day);
            const bAllDay = b.is_all_day === 1 || Boolean(b.is_all_day);
            if (aAllDay && !bAllDay) return -1;
            if (!aAllDay && bAllDay) return 1;
            return a.start_time_ms - b.start_time_ms;
        });

        return eventsToday;
    },

    async linkNoteToEvent(eventId: string, noteId: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE events SET note_id = COALESCE(note_id, ?), updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [noteId, now, now, eventId]
        );
        await db.runAsync(
            `UPDATE notes SET event_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [eventId, now, now, noteId]
        );
    },

    async unlinkNoteFromEvent(eventId: string, noteId?: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        if (noteId) {
            await db.runAsync(
                `UPDATE notes SET event_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE id = ? AND event_id = ?`,
                [now, now, noteId, eventId]
            );
            const remaining = await db.getFirstAsync<{ id: string }>(
                `SELECT id FROM notes WHERE event_id = ? AND deleted = 0 ORDER BY updated_at_ms DESC LIMIT 1`,
                [eventId]
            );
            await db.runAsync(
                `UPDATE events SET note_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ? AND (note_id = ? OR note_id IS NULL)`,
                [remaining?.id || null, now, now, eventId, noteId]
            );
        } else {
            await db.runAsync(
                `UPDATE events SET note_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                [now, now, eventId]
            );
            await db.runAsync(
                `UPDATE notes SET event_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE event_id = ?`,
                [now, now, eventId]
            );
        }
    },

    async linkFolderToEvent(eventId: string, folderId: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE events SET folder_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [folderId, now, now, eventId]
        );
    },

    async unlinkFolderFromEvent(eventId: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE events SET folder_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [now, now, eventId]
        );
    },
};

/**
 * Verifica si un evento ocurre en una fecha determinada (considerando recurrencia).
 */
export function isEventOccurringOnDate(event: CalendarEvent, targetDate: Date): boolean {
    if (!targetDate) return false;
    const d = typeof targetDate === 'number' ? new Date(targetDate) : targetDate;
    if (isNaN(d.getTime())) return false;

    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    if (!event.repeat_rule || event.repeat_rule === 'none' || event.repeat_rule === 'null') {
        const evStart = new Date(event.start_time_ms);
        return evStart.getFullYear() === d.getFullYear() &&
               evStart.getMonth() === d.getMonth() &&
               evStart.getDate() === d.getDate();
    }

    const occurrences = expandOccurrences(event, startOfDay, endOfDay);
    return occurrences.length > 0;
}
