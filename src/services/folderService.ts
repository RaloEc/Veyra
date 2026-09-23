import { getDB } from '../db';
import { Folder } from '../types/db';
import * as Crypto from 'expo-crypto';

export const FolderService = {
    async createFolder(
        name: string,
        icon: string = 'folder',
        color: string = '#8B5CF6',
        userId?: string,
        isPinned: boolean = false
    ): Promise<Folder> {
        const db = await getDB();
        const id = Crypto.randomUUID();
        const now = Date.now();

        const newFolder: Folder = {
            id,
            user_id: userId,
            name: name.trim(),
            icon,
            color,
            is_pinned: isPinned ? 1 : 0,
            created_at_ms: now,
            updated_at_ms: now,
            last_modified_ms: now,
            deleted: 0,
        };

        await db.runAsync(
            `INSERT INTO folders (id, user_id, name, icon, color, is_pinned, created_at_ms, updated_at_ms, last_modified_ms, deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [id, userId || null, newFolder.name, icon, color, isPinned ? 1 : 0, now, now, now]
        );

        return newFolder;
    },

    async togglePinFolder(id: string, isPinned: boolean): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE folders SET is_pinned = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [isPinned ? 1 : 0, now, now, id]
        );
    },

    async getFolders(includeDeleted: boolean = false): Promise<Folder[]> {
        const db = await getDB();
        if (includeDeleted) {
            return await db.getAllAsync<Folder>(
                `SELECT * FROM folders ORDER BY is_pinned DESC, created_at_ms ASC`
            );
        } else {
            return await db.getAllAsync<Folder>(
                `SELECT * FROM folders WHERE deleted = 0 ORDER BY is_pinned DESC, created_at_ms ASC`
            );
        }
    },

    async getFolderById(id: string): Promise<Folder | null> {
        const db = await getDB();
        const folder = await db.getFirstAsync<Folder>(
            `SELECT * FROM folders WHERE id = ?`,
            [id]
        );
        return folder || null;
    },

    async updateFolder(
        id: string,
        updates: Partial<Folder>
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
            `UPDATE folders SET ${sets.join(', ')} WHERE id = ?`,
            params
        );
    },

    async deleteFolder(id: string, deleteNotes: boolean = false): Promise<void> {
        const db = await getDB();
        const now = Date.now();

        if (deleteNotes) {
            // Enviar a papelera tanto las notas dentro como la carpeta
            await db.runAsync(
                `UPDATE notes SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE folder_id = ? AND deleted = 0`,
                [now, now, id]
            );
        } else {
            // Desenlazar las notas de la carpeta (pasan a sin carpeta)
            await db.runAsync(
                `UPDATE notes SET folder_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE folder_id = ?`,
                [now, now, id]
            );
        }

        // Soft delete de la carpeta
        await db.runAsync(
            `UPDATE folders SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [now, now, id]
        );
    },

    async deleteFolders(ids: string[], deleteNotes: boolean = false): Promise<void> {
        if (ids.length === 0) return;
        const db = await getDB();
        const now = Date.now();
        const placeholders = ids.map(() => '?').join(',');

        if (deleteNotes) {
            // Enviar a papelera tanto las notas dentro como las carpetas
            await db.runAsync(
                `UPDATE notes SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE folder_id IN (${placeholders}) AND deleted = 0`,
                [now, now, ...ids]
            );
        } else {
            // Desenlazar las notas de las carpetas (pasan a sin carpeta)
            await db.runAsync(
                `UPDATE notes SET folder_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE folder_id IN (${placeholders})`,
                [now, now, ...ids]
            );
        }

        // Soft delete de las carpetas
        await db.runAsync(
            `UPDATE folders SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE id IN (${placeholders})`,
            [now, now, ...ids]
        );
    },

    async restoreFolder(id: string): Promise<void> {
        const db = await getDB();
        const now = Date.now();
        await db.runAsync(
            `UPDATE folders SET deleted = 0, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
            [now, now, id]
        );
    },

    async deleteFolderForever(id: string): Promise<void> {
        const db = await getDB();
        // Desenlazar notas huérfanas
        await db.runAsync(
            `UPDATE notes SET folder_id = NULL WHERE folder_id = ?`,
            [id]
        );
        // Eliminar registro
        await db.runAsync(
            `DELETE FROM folders WHERE id = ?`,
            [id]
        );
    },
};
