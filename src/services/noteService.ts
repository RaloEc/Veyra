import { getDB } from '../db';
import { Note } from '../types/db';
import * as Crypto from 'expo-crypto';

export const NoteService = {
    async createNote(
        title?: string,
        content?: string,
        attachments?: string, // JSON
        links?: string, // JSON
        isPinned: boolean = false,
        userId?: string,
        folderId?: string | null,
        eventId?: string | null
    ): Promise<Note> {
        const db = await getDB();
        const id = Crypto.randomUUID();
        const now = Date.now();

        const newNote: Note = {
            id,
            user_id: userId,
            folder_id: folderId || null,
            event_id: eventId || null,
            title,
            content,
            created_at_ms: now,
            updated_at_ms: now,
            is_pinned: isPinned ? 1 : 0,
            attachments,
            links,
            deleted: 0,
            last_modified_ms: now,
        };

        await db.runAsync(
            `INSERT INTO notes (id, user_id, folder_id, event_id, title, content, created_at_ms, updated_at_ms, is_pinned, attachments, links, deleted, last_modified_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, userId || null, folderId || null, eventId || null, title || null, content || null, now, now, isPinned ? 1 : 0, attachments || null, links || null, 0, now]
        );

        if (eventId) {
            await db.runAsync(
                `UPDATE events SET note_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                [id, now, now, eventId]
            );
        }

        return newNote;
    },

    async moveNotesToFolder(ids: string[], folderId: string | null): Promise<void> {
        if (!ids || ids.length === 0) return;
        const db = await getDB();
        const now = Date.now();
        const placeholders = ids.map(() => '?').join(', ');
        await db.runAsync(
            `UPDATE notes SET folder_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id IN (${placeholders})`,
            [folderId || null, now, now, ...ids]
        );
    },

    async getNotes(includeDeleted: boolean = false): Promise<Note[]> {
        const db = await getDB();
        if (includeDeleted) {
            return await db.getAllAsync<Note>(
                `SELECT * FROM notes ORDER BY is_pinned DESC, updated_at_ms DESC`
            );
        } else {
            return await db.getAllAsync<Note>(
                `SELECT * FROM notes WHERE deleted = 0 ORDER BY is_pinned DESC, updated_at_ms DESC`
            );
        }
    },

    async getDeletedNotes(): Promise<Note[]> {
        const db = await getDB();
        return await db.getAllAsync<Note>(
            `SELECT * FROM notes WHERE deleted = 1 ORDER BY updated_at_ms DESC`
        );
    },

    async getNoteById(id: string): Promise<Note | null> {
        const db = await getDB();
        const note = await db.getFirstAsync<Note>(
            `SELECT * FROM notes WHERE id = ?`,
            [id]
        );
        return note || null;
    },

    async updateNote(
        id: string,
        updates: Partial<Note>
    ): Promise<void> {
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
            `UPDATE notes SET ${sets.join(', ')} WHERE id = ?`,
            params
        );
    },

    async updateNotes(
        ids: string[],
        updates: Partial<Note>
    ): Promise<void> {
        if (!ids || ids.length === 0) return;
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

        const placeholders = ids.map(() => '?').join(', ');
        params.push(...ids);

        await db.runAsync(
            `UPDATE notes SET ${sets.join(', ')} WHERE id IN (${placeholders})`,
            params
        );
    },

    async deleteNote(id: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE notes SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [now, now, id]
        );
    },

    async deleteNotes(ids: string[]): Promise<void> {
        if (!ids || ids.length === 0) return;
        const db = await getDB();
        const now = Date.now();
        const placeholders = ids.map(() => '?').join(', ');
        await db.runAsync(
            `UPDATE notes SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE id IN (${placeholders})`,
            [now, now, ...ids]
        );
    },

    async restoreNote(id: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE notes SET deleted = 0, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [now, now, id]
        );
    },

    async restoreNotes(ids: string[]): Promise<void> {
        if (!ids || ids.length === 0) return;
        const db = await getDB();
        const now = Date.now();
        const placeholders = ids.map(() => '?').join(', ');
        await db.runAsync(
            `UPDATE notes SET deleted = 0, updated_at_ms = ?, last_modified_ms = ? WHERE id IN (${placeholders})`,
            [now, now, ...ids]
        );
    },

    async deleteNoteForever(id: string): Promise<void> {
        const db = await getDB();
        await db.runAsync(`DELETE FROM notes WHERE id = ?`, [id]);
    },

    async deleteNotesForever(ids: string[]): Promise<void> {
        if (!ids || ids.length === 0) return;
        const db = await getDB();
        const placeholders = ids.map(() => '?').join(', ');
        await db.runAsync(`DELETE FROM notes WHERE id IN (${placeholders})`, ids);
    },

    async emptyNotesTrash(): Promise<void> {
        const db = await getDB();
        await db.runAsync(`DELETE FROM notes WHERE deleted = 1`);
    }
};
