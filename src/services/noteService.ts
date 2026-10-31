import { withDB } from '../db';
import { Note, NoteSyncMode } from '../types/db';
import * as Crypto from 'expo-crypto';
import { WidgetService } from './widgetService';
import { SearchService } from './searchService';
import { computeNotePreviewText } from '../utils/pageUtils';

function triggerNotesWidgetSync() {
    WidgetService.syncNotes().catch(() => {});
}

function triggerSearchIndex(note: Note) {
    SearchService.indexNote(note).catch(() => {});
}

function triggerSearchRemove(id: string) {
    SearchService.removeItem('note', id).catch(() => {});
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
        sharedOwnerId?: string | null,
        syncMode: NoteSyncMode = 'rest'
    ): Promise<Note> {
        return withDB(async (db) => {
            const id = Crypto.randomUUID();
            const now = Date.now();
            const previewText = content ? computeNotePreviewText(content) : null;

            const newNote: Note = {
                id,
                user_id: userId,
                folder_id: folderId || null,
                event_id: eventId || null,
                title,
                content,
                preview_text: previewText,
                created_at_ms: now,
                updated_at_ms: now,
                is_pinned: isPinned ? 1 : 0,
                attachments,
                links,
                deleted: 0,
                last_modified_ms: now,
                last_opened_ms: now,
                font_family: fontFamily || 'sans',
                is_shared: isShared,
                shared_owner_id: sharedOwnerId || undefined,
                sync_mode: syncMode,
            };

            await db.runAsync(
                `INSERT INTO notes (id, user_id, folder_id, event_id, title, content, created_at_ms, updated_at_ms, is_pinned, attachments, links, deleted, last_modified_ms, font_family, is_shared, shared_owner_id, sync_mode, preview_text, last_opened_ms)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, userId || null, folderId || null, eventId || null, title || null, content || null, now, now, isPinned ? 1 : 0, attachments || null, links || null, 0, now, fontFamily || 'sans', isShared, sharedOwnerId || null, syncMode, previewText, now]
            );

            if (eventId) {
                await db.runAsync(
                    `UPDATE events SET note_id = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                    [id, now, now, eventId]
                );
            }

            triggerNotesWidgetSync();
            triggerSearchIndex(newNote);
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
            ids.forEach(id => {
                NoteService.getNoteById(id).then(n => n && triggerSearchIndex(n)).catch(() => {});
            });
        });
    },

    async getNotes(includeDeleted: boolean = false): Promise<Note[]> {
        return withDB(async (db) => {
            const rows = includeDeleted
                ? await db.getAllAsync<Note>(`SELECT * FROM notes ORDER BY is_pinned DESC, updated_at_ms DESC`)
                : await db.getAllAsync<Note>(`SELECT * FROM notes WHERE deleted = 0 ORDER BY is_pinned DESC, updated_at_ms DESC`);

            // Si alguna nota activa aún no tiene preview_text calculado, lo generamos en memoria
            // y lo persistimos asíncronamente en segundo plano para acelerar todos los renders posteriores.
            const missingPreviews: Array<{ id: string; preview: string }> = [];
            for (const note of rows) {
                if ((note.preview_text === null || note.preview_text === undefined) && note.content) {
                    const computed = computeNotePreviewText(note.content);
                    note.preview_text = computed;
                    missingPreviews.push({ id: note.id, preview: computed });
                }
            }

            if (missingPreviews.length > 0) {
                setTimeout(() => {
                    withDB(async (bgDb) => {
                        for (const item of missingPreviews) {
                            await bgDb.runAsync(
                                `UPDATE notes SET preview_text = ? WHERE id = ? AND preview_text IS NULL`,
                                [item.preview, item.id]
                            );
                        }
                    }).catch(() => {});
                }, 50);
            }

            return rows;
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

    async markNoteOpened(id: string): Promise<void> {
        return withDB(async (db) => {
            const now = Date.now();
            await db.runAsync(
                `UPDATE notes SET last_opened_ms = ? WHERE id = ?`,
                [now, id]
            );
        });
    },

    async updateNote(
        id: string,
        updates: Partial<Note>
    ): Promise<void> {
        return withDB(async (db) => {
            const now = Date.now();
            const effectiveUpdates: Partial<Note> = { ...updates };
            if (effectiveUpdates.content !== undefined && effectiveUpdates.preview_text === undefined) {
                effectiveUpdates.preview_text = computeNotePreviewText(effectiveUpdates.content);
            }

            const sets: string[] = [];
            const params: any[] = [];

            Object.entries(effectiveUpdates).forEach(([key, value]) => {
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
            NoteService.getNoteById(id).then(n => n && triggerSearchIndex(n)).catch(() => {});
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
            ids.forEach(id => {
                NoteService.getNoteById(id).then(n => n && triggerSearchIndex(n)).catch(() => {});
            });
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
            triggerSearchRemove(id);
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
            ids.forEach(triggerSearchRemove);
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
            NoteService.getNoteById(id).then(n => n && triggerSearchIndex(n)).catch(() => {});
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
            ids.forEach(id => {
                NoteService.getNoteById(id).then(n => n && triggerSearchIndex(n)).catch(() => {});
            });
        });
    },

    async deleteNoteForever(id: string): Promise<void> {
        return withDB(async (db) => {
            await db.runAsync(`DELETE FROM notes WHERE id = ?`, [id]);
            triggerNotesWidgetSync();
            triggerSearchRemove(id);
        });
    },

    async deleteNotesForever(ids: string[]): Promise<void> {
        if (!ids || ids.length === 0) return;
        return withDB(async (db) => {
            const placeholders = ids.map(() => '?').join(', ');
            await db.runAsync(`DELETE FROM notes WHERE id IN (${placeholders})`, ids);
            triggerNotesWidgetSync();
            ids.forEach(triggerSearchRemove);
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
    },

    async setNoteSyncMode(id: string, syncMode: NoteSyncMode): Promise<void> {
        return withDB(async (db) => {
            const now = Date.now();
            await db.runAsync(
                `UPDATE notes SET sync_mode = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                [syncMode, now, now, id]
            );
            triggerNotesWidgetSync();
        });
    }
};
