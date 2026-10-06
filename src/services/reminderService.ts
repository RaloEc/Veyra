import { getDB } from '../db';
import { Reminder, ReminderStatus, ControlLevel } from '../types/db';
import * as Crypto from 'expo-crypto';
import { WidgetService } from './widgetService';

function triggerWidgetSync() {
    WidgetService.sync().catch(err => {
        console.warn('[ReminderService] Widget sync notice:', err);
    });
    WidgetService.syncSchedule().catch(() => {});
}

export const ReminderService = {
    async createReminder(
        title: string,
        dueDate: number,
        controlLevel: ControlLevel,
        userId: string = 'local_user',
        description?: string,
        repeatRule?: string, // JSON
        attachments?: string, // JSON
        links?: string, // JSON
        subtasks?: string // JSON
    ): Promise<Reminder> {
        const db = await getDB();
        const id = Crypto.randomUUID();
        const now = Date.now();

        // Map control level to priority (simple logic for now)
        const priorityMap = { normal: 0, strict: 1, critical: 2 };
        const priority = priorityMap[controlLevel];

        const newReminder: Reminder = {
            id,
            user_id: userId,
            title,
            description,
            due_date_ms: dueDate,
            control_level: controlLevel,
            priority,
            status: 'pending',
            next_attempt_ms: dueDate,
            retry_count: 0,
            max_retries: controlLevel === 'critical' ? 10 : 3,
            last_modified_ms: now,
            deleted: 0,
            repeat_rule: repeatRule,
            attachments,
            links,
            subtasks,
        };

        await db.runAsync(
            `INSERT INTO reminders (id, user_id, title, description, due_date_ms, control_level, priority, status, next_attempt_ms, retry_count, max_retries, last_modified_ms, deleted, repeat_rule, attachments, links, subtasks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, newReminder.user_id, title, description || null, dueDate, controlLevel, priority, 'pending', dueDate, 0, newReminder.max_retries, now, 0, repeatRule || null, attachments || null, links || null, subtasks || null]
        );

        triggerWidgetSync();

        return newReminder;
    },

    async getReminders(status: ReminderStatus = 'pending'): Promise<Reminder[]> {
        const db = await getDB();
        // Default to showing only pending and snoozed in the main list
        // If status is passed explicitly, use it, but always filter out deleted
        if (status === 'pending') {
            return await db.getAllAsync<Reminder>(
                `SELECT * FROM reminders WHERE (status = 'pending' OR status = 'snoozed') AND deleted = 0 ORDER BY due_date_ms ASC`
            );
        }
        return await db.getAllAsync<Reminder>(
            `SELECT * FROM reminders WHERE status = ? AND deleted = 0 ORDER BY due_date_ms ASC`,
            [status]
        );
    },

    async getReminderById(id: string): Promise<Reminder | null> {
        const db = await getDB();
        return await db.getFirstAsync<Reminder>(
            `SELECT * FROM reminders WHERE id = ?`,
            [id]
        );
    },

    async getHistory(limit: number = 20, offset: number = 0): Promise<Reminder[]> {
        const db = await getDB();
        // Fetch Completed OR Deleted items with pagination
        return await db.getAllAsync<Reminder>(
            `SELECT * FROM reminders WHERE (status = 'completed' OR deleted = 1) ORDER BY last_modified_ms DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );
    },

    async markAsCompleted(id: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE reminders SET status = 'completed', last_modified_ms = ? WHERE id = ?`,
            [now, id]
        );
        triggerWidgetSync();
        // TODO: Add Compliance Event
    },

    async updateReminder(
        id: string,
        updates: Partial<Reminder>
    ): Promise<void> {
        const db = await getDB();
        const now = Date.now();

        const sets: string[] = [];
        const params: any[] = [];

        Object.entries(updates).forEach(([key, value]) => {
            if (key !== 'id') {
                sets.push(`${key} = ?`);
                params.push(value);
            }
        });

        if (sets.length === 0) return;

        sets.push(`last_modified_ms = ?`);
        params.push(now);
        params.push(id);

        await db.runAsync(
            `UPDATE reminders SET ${sets.join(', ')} WHERE id = ?`,
            params
        );
        triggerWidgetSync();
    },

    async deleteReminder(id: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE reminders SET deleted = 1, deleted_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [now, now, id]
        );
        triggerWidgetSync();
    },

    async restoreReminder(id: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE reminders SET deleted = 0, deleted_at_ms = NULL, last_modified_ms = ? WHERE id = ?`,
            [now, id]
        );
        triggerWidgetSync();
    },

    async restoreReminders(ids: string[]): Promise<void> {
        if (!ids || ids.length === 0) return;
        const db = await getDB();
        const now = Date.now();
        const placeholders = ids.map(() => '?').join(', ');
        await db.runAsync(
            `UPDATE reminders SET deleted = 0, deleted_at_ms = NULL, last_modified_ms = ? WHERE id IN (${placeholders})`,
            [now, ...ids]
        );
        triggerWidgetSync();
    },

    async reactivateReminder(id: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE reminders SET status = 'pending', last_modified_ms = ? WHERE id = ?`,
            [now, id]
        );
        triggerWidgetSync();
    },

    async reactivateReminders(ids: string[]): Promise<void> {
        if (!ids || ids.length === 0) return;
        const db = await getDB();
        const now = Date.now();
        const placeholders = ids.map(() => '?').join(', ');
        await db.runAsync(
            `UPDATE reminders SET status = 'pending', last_modified_ms = ? WHERE id IN (${placeholders})`,
            [now, ...ids]
        );
    },

    async deleteForever(id: string): Promise<void> {
        const db = await getDB();
        await db.runAsync(`DELETE FROM reminders WHERE id = ?`, [id]);
    },

    async deleteRemindersForever(ids: string[]): Promise<void> {
        if (!ids || ids.length === 0) return;
        const db = await getDB();
        const placeholders = ids.map(() => '?').join(', ');
        await db.runAsync(`DELETE FROM reminders WHERE id IN (${placeholders})`, ids);
    },

    async emptyRemindersTrash(): Promise<void> {
        const db = await getDB();
        await db.runAsync(`DELETE FROM reminders WHERE deleted = 1`);
    },

    async getOverdueReminders(): Promise<Reminder[]> {
        const db = await getDB();
        const now = Date.now();
        return await db.getAllAsync<Reminder>(
            `SELECT * FROM reminders WHERE status = 'pending' AND due_date_ms < ? AND deleted = 0`,
            [now]
        );
    },

    async incrementRetryCount(id: string): Promise<void> {
        const db = await getDB();
        await db.runAsync(
            `UPDATE reminders SET retry_count = retry_count + 1 WHERE id = ?`,
            [id]
        );
    },

    async markAsFailed(id: string): Promise<void> {
        const db = await getDB();
        await db.runAsync(
            `UPDATE reminders SET status = 'failed' WHERE id = ?`,
            [id]
        );
    }
};
