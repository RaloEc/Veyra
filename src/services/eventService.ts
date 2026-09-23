import { getDB } from '../db';
import { CalendarEvent } from '../types/db';
import * as Crypto from 'expo-crypto';
import { startOfDay, getDay, isSameDay } from 'date-fns';

export interface CreateEventInput {
    title: string;
    description?: string;
    startTimeMs: number;
    endTimeMs: number;
    repeatRule?: string; // JSON: { type: 'none' | 'weekly', days?: number[] }
    location?: string;
    color?: string;
    notificationOffsetMin?: number;
    notificationOffsets?: string; // JSON array of numbers, e.g. "[5, 15, 1440]"
    notificationIds?: string;
    noteId?: string | null;
    userId?: string;
}

/**
 * Determina si un evento ocurre en una fecha dada (soportando eventos únicos y recurrentes).
 */
export function isEventOccurringOnDate(event: CalendarEvent, targetDate: Date): boolean {
    const eventStartDate = new Date(event.start_time_ms);
    const targetDayStart = startOfDay(targetDate).getTime();
    const eventDayStart = startOfDay(eventStartDate).getTime();

    // Si el evento comenzó después del día objetivo, no aplica
    if (eventDayStart > targetDayStart) {
        return false;
    }

    // Si es un evento único sin repetición
    if (!event.repeat_rule || event.repeat_rule === 'null') {
        return isSameDay(eventStartDate, targetDate);
    }

    try {
        const rule = JSON.parse(event.repeat_rule);
        if (rule.type === 'weekly' && Array.isArray(rule.days)) {
            const targetDayOfWeek = getDay(targetDate); // 0 = Dom, 1 = Lun, ..., 6 = Sáb
            return rule.days.includes(targetDayOfWeek);
        }
        if (rule.type === 'daily') {
            return true;
        }
        if (rule.type === 'monthly') {
            return targetDate.getDate() === eventStartDate.getDate();
        }
    } catch {
        // Fallback a fecha exacta
    }

    return isSameDay(eventStartDate, targetDate);
}

export const EventService = {
    async createEvent(input: CreateEventInput): Promise<CalendarEvent> {
        const db = await getDB();
        const id = Crypto.randomUUID();
        const now = Date.now();

        let initialOffsets = input.notificationOffsets;
        if (!initialOffsets && input.notificationOffsetMin !== undefined) {
            initialOffsets = JSON.stringify([input.notificationOffsetMin]);
        } else if (!initialOffsets) {
            initialOffsets = JSON.stringify([15]);
        }

        const newEvent: CalendarEvent = {
            id,
            user_id: input.userId,
            title: input.title.trim(),
            description: input.description?.trim() || undefined,
            start_time_ms: input.startTimeMs,
            end_time_ms: input.endTimeMs,
            repeat_rule: input.repeatRule || undefined,
            location: input.location?.trim() || undefined,
            color: input.color || undefined,
            notification_offset_min: input.notificationOffsetMin !== undefined ? input.notificationOffsetMin : 15,
            notification_offsets: initialOffsets,
            notification_ids: input.notificationIds || undefined,
            note_id: input.noteId || null,
            created_at_ms: now,
            updated_at_ms: now,
            last_modified_ms: now,
            deleted: 0,
        };

        await db.runAsync(
            `INSERT INTO events (id, user_id, title, description, start_time_ms, end_time_ms, repeat_rule, location, color, notification_offset_min, notification_offsets, notification_ids, note_id, created_at_ms, updated_at_ms, last_modified_ms, deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                id,
                input.userId || null,
                newEvent.title,
                newEvent.description || null,
                newEvent.start_time_ms,
                newEvent.end_time_ms,
                newEvent.repeat_rule || null,
                newEvent.location || null,
                newEvent.color || null,
                newEvent.notification_offset_min ?? null,
                newEvent.notification_offsets || null,
                newEvent.notification_ids || null,
                newEvent.note_id || null,
                now,
                now,
                now,
            ]
        );

        // Si se vinculó una nota, actualizar la nota bidireccionalmente
        if (input.noteId) {
            await db.runAsync(
                `UPDATE notes SET event_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                [id, now, now, input.noteId]
            );
        }

        return newEvent;
    },

    async updateEvent(id: string, updates: Partial<CalendarEvent>): Promise<void> {
        const db = await getDB();
        const now = Date.now();

        const sets: string[] = [];
        const params: any[] = [];

        Object.entries(updates).forEach(([key, value]) => {
            if (key !== 'id' && key !== 'created_at_ms') {
                sets.push(`${key} = ?`);
                params.push(value);
            }
        });

        if (sets.length === 0) return;

        sets.push(`updated_at_ms = ?`);
        params.push(now);
        sets.push(`last_modified_ms = ?`);
        params.push(now);
        params.push(id);

        await db.runAsync(
            `UPDATE events SET ${sets.join(', ')} WHERE id = ?`,
            params
        );

        // Si se actualizó note_id, mantener sincronizada la nota
        if ('note_id' in updates) {
            const newNoteId = updates.note_id;
            // Desvincular notas anteriores que apuntaban a este evento
            await db.runAsync(
                `UPDATE notes SET event_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE event_id = ? AND id != ?`,
                [now, now, id, newNoteId || '']
            );
            if (newNoteId) {
                await db.runAsync(
                    `UPDATE notes SET event_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                    [id, now, now, newNoteId]
                );
            }
        }
    },

    async deleteEvent(id: string): Promise<void> {
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
    },

    async deleteEventForever(id: string): Promise<void> {
        const db = await getDB();
        await db.runAsync(`DELETE FROM events WHERE id = ?`, [id]);
        await db.runAsync(`UPDATE notes SET event_id = NULL WHERE event_id = ?`, [id]);
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
     * Devuelve los eventos que ocurren en una fecha dada (incluyendo recurrentes semanales).
     */
    async getEventsForDate(targetDate: Date): Promise<CalendarEvent[]> {
        const allEvents = await this.getAllEvents(false);
        return allEvents.filter(event => isEventOccurringOnDate(event, targetDate)).sort((a, b) => {
            const dateA = new Date(a.start_time_ms);
            const dateB = new Date(b.start_time_ms);
            const minsA = dateA.getHours() * 60 + dateA.getMinutes();
            const minsB = dateB.getHours() * 60 + dateB.getMinutes();
            return minsA - minsB;
        });
    },

    async linkNoteToEvent(eventId: string, noteId: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE events SET note_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [noteId, now, now, eventId]
        );
        await db.runAsync(
            `UPDATE notes SET event_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [eventId, now, now, noteId]
        );
    },

    async unlinkNoteFromEvent(eventId: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE events SET note_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [now, now, eventId]
        );
        await db.runAsync(
            `UPDATE notes SET event_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE event_id = ?`,
            [now, now, eventId]
        );
    }
};
