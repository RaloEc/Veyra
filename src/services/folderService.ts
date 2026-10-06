import { getDB, withDB } from '../db';
import { Folder } from '../types/db';
import * as Crypto from 'expo-crypto';

export const FolderService = {
    async createFolder(
        name: string,
        icon: string = 'folder',
        color: string = '#8B5CF6',
        userId?: string,
        isPinned: boolean = false,
        parentId?: string | null
    ): Promise<Folder> {
        return withDB(async (db) => {
            const id = Crypto.randomUUID();
            const now = Date.now();

            const newFolder: Folder = {
                id,
                user_id: userId,
                parent_id: parentId || null,
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
                `INSERT INTO folders (id, user_id, parent_id, name, icon, color, is_pinned, created_at_ms, updated_at_ms, last_modified_ms, deleted)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                [id, userId || null, parentId || null, newFolder.name, icon, color, isPinned ? 1 : 0, now, now, now]
            );

            return newFolder;
        });
    },

    async togglePinFolder(id: string, isPinned: boolean): Promise<void> {
        return withDB(async (db) => {
            const now = Date.now();
            await db.runAsync(
                `UPDATE folders SET is_pinned = ?, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                [isPinned ? 1 : 0, now, now, id]
            );
        });
    },

    async getFolders(includeDeleted: boolean = false): Promise<Folder[]> {
        return withDB(async (db) => {
            if (includeDeleted) {
                return await db.getAllAsync<Folder>(
                    `SELECT * FROM folders ORDER BY is_pinned DESC, created_at_ms ASC`
                );
            } else {
                return await db.getAllAsync<Folder>(
                    `SELECT * FROM folders WHERE deleted = 0 ORDER BY is_pinned DESC, created_at_ms ASC`
                );
            }
        });
    },

    async getFoldersByParent(parentId: string | null = null, includeDeleted: boolean = false): Promise<Folder[]> {
        return withDB(async (db) => {
            const whereParent = parentId ? `parent_id = ?` : `parent_id IS NULL`;
            const params = parentId ? [parentId] : [];
            const whereDeleted = includeDeleted ? '' : ' AND deleted = 0';
            return await db.getAllAsync<Folder>(
                `SELECT * FROM folders WHERE ${whereParent}${whereDeleted} ORDER BY is_pinned DESC, created_at_ms ASC`,
                params
            );
        });
    },

    async getFolderById(id: string): Promise<Folder | null> {
        return withDB(async (db) => {
            const folder = await db.getFirstAsync<Folder>(
                `SELECT * FROM folders WHERE id = ?`,
                [id]
            );
            return folder || null;
        });
    },

    async updateFolder(
        id: string,
        updates: Partial<Folder>
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
            sets.push(id);

            await db.runAsync(
                `UPDATE folders SET ${sets.join(', ')} WHERE id = ?`,
                params
            );
        });
    },

    async getAllDescendantFolderIds(folderIds: string[], db: any): Promise<string[]> {
        const allIds = new Set<string>();
        let currentQueue = [...folderIds];
        while (currentQueue.length > 0) {
            const placeholders = currentQueue.map(() => '?').join(',');
            const rows = await db.getAllAsync(
                `SELECT id FROM folders WHERE parent_id IN (${placeholders}) AND deleted = 0`,
                currentQueue
            );
            currentQueue = [];
            for (const r of rows) {
                if (!allIds.has(r.id)) {
                    allIds.add(r.id);
                    currentQueue.push(r.id);
                }
            }
        }
        return Array.from(allIds);
    },

    async deleteFolder(id: string, deleteNotes: boolean = false): Promise<void> {
        return withDB(async (db) => {
            const now = Date.now();
            const descendantIds = await this.getAllDescendantFolderIds([id], db);
            const allTargetIds = [id, ...descendantIds];
            const placeholders = allTargetIds.map(() => '?').join(',');

            if (deleteNotes) {
                // Enviar a papelera tanto las notas dentro como las carpetas
                await db.runAsync(
                    `UPDATE notes SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE folder_id IN (${placeholders}) AND deleted = 0`,
                    [now, now, ...allTargetIds]
                );
            } else {
                // Desenlazar las notas de las carpetas (pasan a sin carpeta)
                await db.runAsync(
                    `UPDATE notes SET folder_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE folder_id IN (${placeholders})`,
                    [now, now, ...allTargetIds]
                );
            }

            // Soft delete de la carpeta y subcarpetas
            await db.runAsync(
                `UPDATE folders SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE id IN (${placeholders})`,
                [now, now, ...allTargetIds]
            );
        });
    },

    async deleteFolders(ids: string[], deleteNotes: boolean = false): Promise<void> {
        if (ids.length === 0) return;
        return withDB(async (db) => {
            const now = Date.now();
            const descendantIds = await this.getAllDescendantFolderIds(ids, db);
            const allTargetIds = Array.from(new Set([...ids, ...descendantIds]));
            const placeholders = allTargetIds.map(() => '?').join(',');

            if (deleteNotes) {
                // Enviar a papelera tanto las notas dentro como las carpetas
                await db.runAsync(
                    `UPDATE notes SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE folder_id IN (${placeholders}) AND deleted = 0`,
                    [now, now, ...allTargetIds]
                );
            } else {
                // Desenlazar las notas de las carpetas (pasan a sin carpeta)
                await db.runAsync(
                    `UPDATE notes SET folder_id = NULL, updated_at_ms = ?, last_modified_ms = ? WHERE folder_id IN (${placeholders})`,
                    [now, now, ...allTargetIds]
                );
            }

            // Soft delete de las carpetas
            await db.runAsync(
                `UPDATE folders SET deleted = 1, updated_at_ms = ?, last_modified_ms = ? WHERE id IN (${placeholders})`,
                [now, now, ...allTargetIds]
            );
        });
    },

    async restoreFolder(id: string): Promise<void> {
        return withDB(async (db) => {
            const now = Date.now();
            await db.runAsync(
                `UPDATE folders SET deleted = 0, updated_at_ms = ?, last_modified_ms = ? WHERE id = ?`,
                [now, now, id]
            );
        });
    },

    async deleteFolderForever(id: string): Promise<void> {
        return withDB(async (db) => {
            const descendantIds = await this.getAllDescendantFolderIds([id], db);
            const allTargetIds = [id, ...descendantIds];
            const placeholders = allTargetIds.map(() => '?').join(',');

            // Desenlazar notas huérfanas
            await db.runAsync(
                `UPDATE notes SET folder_id = NULL WHERE folder_id IN (${placeholders})`,
                allTargetIds
            );
            // Eliminar registros
            await db.runAsync(
                `DELETE FROM folders WHERE id IN (${placeholders})`,
                allTargetIds
            );
        });
    },
};
