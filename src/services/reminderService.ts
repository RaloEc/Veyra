import { getDB } from '../db';
import { Reminder, ReminderStatus, ControlLevel } from '../types/db';
import * as Crypto from 'expo-crypto';

export const ReminderService = {
    async createReminder(
        title: string,
        dueDate: number,
        controlLevel: ControlLevel,
        userId: string = 'local_user',
        description?: string,
        repeatRule?: string, // JSON
        attachments?: string, // JSON
        links?: string // JSON
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
            links
        };

        await db.runAsync(
            `INSERT INTO reminders (id, user_id, title, description, due_date_ms, control_level, priority, status, next_attempt_ms, retry_count, max_retries, last_modified_ms, deleted, repeat_rule, attachments, links)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, newReminder.user_id, title, description || null, dueDate, controlLevel, priority, 'pending', dueDate, 0, newReminder.max_retries, now, 0, repeatRule || null, attachments || null, links || null]
        );

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

    async getHistory(): Promise<Reminder[]> {
        const db = await getDB();
        // Fetch Completed OR Deleted items
        return await db.getAllAsync<Reminder>(
            `SELECT * FROM reminders WHERE (status = 'completed' OR deleted = 1) ORDER BY last_modified_ms DESC`
        );
    },

    async markAsCompleted(id: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE reminders SET status = 'completed', last_modified_ms = ? WHERE id = ?`,
            [now, id]
        );
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
    },

    async deleteReminder(id: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE reminders SET deleted = 1, deleted_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [now, now, id]
        );
    },

    async restoreReminder(id: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE reminders SET deleted = 0, deleted_at_ms = NULL, last_modified_ms = ? WHERE id = ?`,
            [now, id]
        );
    },

    async deleteForever(id: string): Promise<void> {
        const db = await getDB();
        await db.runAsync(`DELETE FROM reminders WHERE id = ?`, [id]);
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
