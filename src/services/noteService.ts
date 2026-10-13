import { withDB } from '../db';
import { Note } from '../types/db';
import * as Crypto from 'expo-crypto';

function triggerNotesWidgetSync() {
    import('./widgetService').then(({ WidgetService }) => {
        WidgetService.syncNotes().catch(() => {});
    }).catch(() => {});
}

export const NoteService = {
    async createNote(
        title?: string,
        content?: string,
        attachments?: string, // JSON
        links?: string, // JSON
        isPinned: boolean = false,
        userId?: string,
        folderId?: string | null,
        eventId?: string | null,
        fontFamily?: string,
        isShared: number = 0,
        sharedOwnerId?: string | null
    ): Promise<Note> {
        return withDB(async (db) => {
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
                font_family: fontFamily || 'sans',
                is_shared: isShared,
                shared_owner_id: sharedOwnerId || undefined,
            };

            await db.runAsync(
                `INSERT INTO notes (id, user_id, folder_id, event_id, title, content, created_at_ms, updated_at_ms, is_pinned, attachments, links, deleted, last_modified_ms, font_family, is_shared, shared_owner_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, userId || null, folderId || null, eventId || null, title || null, content || null, now, now, isPinned ? 1 : 0, attachments || null, links || null, 0, now, fontFamily || 'sans', isShared, sharedOwnerId || null]
            );

            if (eventId) {
                await db.runAsync(
                    `UPDATE events SET note_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                    [id, now, now, eventId]
                );
            }

            triggerNotesWidgetSync();
            return newNote;
        });
    },

    async moveNotesToFolder(ids: string[], folderId: string | null): Promise<void> {
        if (!ids || ids.length === 0) return;
        return withDB(async (db) => {
            const now = Date.now();
            const placeholders = ids.map(() => '?').join(', ');
            await db.runAsync(
                `UPDATE notes SET folder_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id IN (${placeholders})`,
                [folderId || null, now, now, ...ids]
            );
            triggerNotesWidgetSync();
        });
    },

    async getNotes(includeDeleted: boolean = false): Promise<Note[]> {
        return withDB(async (db) => {
            if (includeDeleted) {
                return await db.getAllAsync<Note>(
                    `SELECT * FROM notes ORDER BY is_pinned DESC, updated_at_ms DESC`
                );
            } else {
                return await db.getAllAsync<Note>(
                    `SELECT * FROM notes WHERE deleted = 0 ORDER BY is_pinned DESC, updated_at_ms DESC`
                );
            }
        });
    },

    async getDeletedNotes(): Promise<Note[]> {
        return withDB(async (db) => {
            return await db.getAllAsync<Note>(
                `SELECT * FROM notes WHERE deleted = 1 ORDER BY updated_at_ms DESC`
            );
        });
    },

    async getNoteById(id: string): Promise<Note | null> {
        return withDB(async (db) => {
            const note = await db.getFirstAsync<Note>(
                `SELECT * FROM notes WHERE id = ?`,
                [id]
            );
            return note || null;
        });
    },

    async updateNote(
        id: string,
        updates: Partial<Note>
    ): Promise<void> {
        return withDB(async (db) => {
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
            triggerNotesWidgetSync();
        });
    },

    async updateNotes(
        ids: string[],
        updates: Partial<Note>
    ): Promise<void> {
        if (!ids || ids.length === 0) return;
        return withDB(async (db) => {
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
            triggerNotesWidgetSync();
        });
    },

    async markNoteRevoked(id: string, isRevoked: boolean = true): Promise<void> {
        return withDB(async (db) => {
            const now = Date.now();
            await db.runAsync(
                `UPDATE notes SET is_revoked = ?, updated_at_ms = ? WHERE id = ?`,
                [isRevoked ? 1 : 0, now, id]
            );
            triggerNotesWidgetSync();
        });
    },

    async deleteNote(id: string): Promise<void> {
        return withDB(async (db) => {
            const now = Date.now();
            await db.runAsync(
                `UPDATE notes SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                [now, now, id]
            );
            triggerNotesWidgetSync();
        });
    },

    async deleteNotes(ids: string[]): Promise<void> {
        if (!ids || ids.length === 0) return;
        return withDB(async (db) => {
            const now = Date.now();
            const placeholders = ids.map(() => '?').join(', ');
            await db.runAsync(
                `UPDATE notes SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE id IN (${placeholders})`,
                [now, now, ...ids]
            );
            triggerNotesWidgetSync();
        });
    },

    async restoreNote(id: string): Promise<void> {
        return withDB(async (db) => {
            const now = Date.now();
            await db.runAsync(
                `UPDATE notes SET deleted = 0, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                [now, now, id]
            );
            triggerNotesWidgetSync();
        });
    },

    async restoreNotes(ids: string[]): Promise<void> {
        if (!ids || ids.length === 0) return;
        return withDB(async (db) => {
            const now = Date.now();
            const placeholders = ids.map(() => '?').join(', ');
            await db.runAsync(
                `UPDATE notes SET deleted = 0, updated_at_ms = ?, last_modified_ms = ? WHERE id IN (${placeholders})`,
                [now, now, ...ids]
            );
            triggerNotesWidgetSync();
        });
    },

    async deleteNoteForever(id: string): Promise<void> {
        return withDB(async (db) => {
            await db.runAsync(`DELETE FROM notes WHERE id = ?`, [id]);
            triggerNotesWidgetSync();
        });
    },

    async deleteNotesForever(ids: string[]): Promise<void> {
        if (!ids || ids.length === 0) return;
        return withDB(async (db) => {
            const placeholders = ids.map(() => '?').join(', ');
            await db.runAsync(`DELETE FROM notes WHERE id IN (${placeholders})`, ids);
            triggerNotesWidgetSync();
        });
    },

    async emptyNotesTrash(): Promise<void> {
        return withDB(async (db) => {
            await db.runAsync(`DELETE FROM notes WHERE deleted = 1`);
            triggerNotesWidgetSync();
        });
    },

    async setNoteCollabRole(id: string, role: string): Promise<void> {
        return withDB(async (db) => {
            await db.runAsync(`UPDATE notes SET collab_role = ? WHERE id = ?`, [role, id]);
        });
    }
};
