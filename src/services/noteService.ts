import { getDB } from '../db';
import { Note } from '../types/db';
import * as Crypto from 'expo-crypto';

export const NoteService = {
    async createNote(
        title?: string,
        content?: string,
        attachments?: string, // JSON
        links?: string, // JSON
        isPinned: boolean = false
    ): Promise<Note> {
        const db = await getDB();
        const id = Crypto.randomUUID();
        const now = Date.now();

        const newNote: Note = {
            id,
            title,
            content,
            created_at_ms: now,
            updated_at_ms: now,
            is_pinned: isPinned ? 1 : 0,
            attachments,
            links,
            deleted: 0
        };

        await db.runAsync(
            `INSERT INTO notes (id, title, content, created_at_ms, updated_at_ms, is_pinned, attachments, links, deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, title || null, content || null, now, now, isPinned ? 1 : 0, attachments || null, links || null, 0]
        );

        return newNote;
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
        params.push(id);

        await db.runAsync(
            `UPDATE notes SET ${sets.join(', ')} WHERE id = ?`,
            params
        );
    },

    async deleteNote(id: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE notes SET deleted = 1, updated_at_ms = ? WHERE id = ?`,
            [now, id]
        );
    },

    async restoreNote(id: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE notes SET deleted = 0, updated_at_ms = ? WHERE id = ?`,
            [now, id]
        );
    },

    async deleteNoteForever(id: string): Promise<void> {
        const db = await getDB();
        await db.runAsync(`DELETE FROM notes WHERE id = ?`, [id]);
    }
};
