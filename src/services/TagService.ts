import { getDB, withSerializedTransaction } from '../db';
import { Tag, ItemTag, CalendarEvent, Reminder } from '../types/db';
import { normalizeTagSlug } from '../utils/hashtagParser';
import { supabase } from '../lib/supabase';
import * as Crypto from 'expo-crypto';

let onTagsChangedListeners: Array<() => void> = [];

export function registerTagsChangedListener(listener: () => void): () => void {
    onTagsChangedListeners.push(listener);
    return () => {
        onTagsChangedListeners = onTagsChangedListeners.filter(l => l !== listener);
    };
}

export function notifyTagsChanged(): void {
    for (const listener of onTagsChangedListeners) {
        try {
            listener();
        } catch {}
    }
}

export const TagService = {
    /**
     * Obtiene o crea un tag a partir de su nombre visible (ej. "Familia").
     */
    async getOrCreateByName(name: string, color?: string | null): Promise<Tag> {
        const trimmed = (name || '').trim().replace(/^#+/, '');
        const slug = normalizeTagSlug(trimmed);
        if (!slug) {
            throw new Error('Nombre de tag inválido o vacío');
        }

        const db = await getDB();
        const existing = await db.getFirstAsync<Tag>(
            `SELECT * FROM tags WHERE slug = ?`,
            [slug]
        );

        if (existing) {
            return existing;
        }

        const id = Crypto.randomUUID();
        const now = Date.now();
        const newTag: Tag = {
            id,
            name: trimmed,
            slug,
            color: color || null,
            created_at: now,
            updated_at: now,
        };

        await db.runAsync(
            `INSERT OR IGNORE INTO tags (id, name, slug, color, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, newTag.name, newTag.slug, newTag.color ?? null, now, now]
        );

        const afterInsert = await db.getFirstAsync<Tag>(
            `SELECT * FROM tags WHERE slug = ?`,
            [slug]
        );
        return afterInsert || newTag;
    },

    /**
     * Obtiene o crea un tag a partir de su slug normalizado.
     */
    async getOrCreateBySlug(rawSlug: string): Promise<Tag> {
        const slug = normalizeTagSlug(rawSlug);
        if (!slug) {
            throw new Error('Slug de tag inválido o vacío');
        }

        const db = await getDB();
        const existing = await db.getFirstAsync<Tag>(
            `SELECT * FROM tags WHERE slug = ?`,
            [slug]
        );

        if (existing) {
            return existing;
        }

        // Si no existe, usamos el slug como nombre inicial
        return this.getOrCreateByName(slug);
    },

    /**
     * Reemplaza el conjunto completo de tags para un item ('event' | 'reminder').
     */
    async setTagsForItem(
        itemType: 'event' | 'reminder',
        itemId: string,
        tagNames: string[]
    ): Promise<void> {
        if (!itemId) return;
        const db = await getDB();

        // 1. Obtener o crear todos los tags correspondientes
        const validTags: Tag[] = [];
        for (const name of tagNames) {
            const clean = name.trim().replace(/^#+/, '');
            if (clean && normalizeTagSlug(clean)) {
                try {
                    const tag = await this.getOrCreateByName(clean);
                    validTags.push(tag);
                } catch {}
            }
        }

        const existingItemTags = await db.getAllAsync<{ tag_id: string }>(
            `SELECT tag_id FROM item_tags WHERE item_type = ? AND item_id = ?`,
            [itemType, itemId]
        );
        const newTagIds = new Set(validTags.map(t => t.id));
        const removedTagIds = existingItemTags
            .map(r => r.tag_id)
            .filter(tid => !newTagIds.has(tid));

        const now = Date.now();
        await withSerializedTransaction(db, async () => {
            // 2. Eliminar tags anteriores para este item
            await db.runAsync(
                `DELETE FROM item_tags WHERE item_type = ? AND item_id = ?`,
                [itemType, itemId]
            );

            // 3. Insertar las nuevas asociaciones
            const seenTagIds = new Set<string>();
            for (const tag of validTags) {
                if (!seenTagIds.has(tag.id)) {
                    seenTagIds.add(tag.id);
                    await db.runAsync(
                        `INSERT OR IGNORE INTO item_tags (item_type, item_id, tag_id)
                         VALUES (?, ?, ?)`,
                        [itemType, itemId, tag.id]
                    );
                }
            }

            // 4. Actualizar last_modified_ms (y columna legacy 'tags' en eventos) para sincronización
            if (itemType === 'event') {
                const tagNamesList = validTags.map(t => t.name);
                await db.runAsync(
                    `UPDATE events SET tags = ?, last_modified_ms = ? WHERE id = ?`,
                    [JSON.stringify(tagNamesList), now, itemId]
                );
            } else if (itemType === 'reminder') {
                await db.runAsync(
                    `UPDATE reminders SET last_modified_ms = ? WHERE id = ?`,
                    [now, itemId]
                );
            }
        });

        notifyTagsChanged();

        // Si se desasignaron tags localmente, propagar el borrado en Supabase en segundo plano
        if (removedTagIds.length > 0) {
            Promise.resolve(
                supabase
                    .from('item_tags')
                    .delete()
                    .eq('item_type', itemType)
                    .eq('item_id', itemId)
                    .in('tag_id', removedTagIds)
            ).catch(() => {});
        }
    },

    /**
     * Obtiene los tags asignados a un item específico.
     */
    async getTagsForItem(itemType: 'event' | 'reminder', itemId: string): Promise<Tag[]> {
        if (!itemId) return [];
        const db = await getDB();
        return await db.getAllAsync<Tag>(
            `SELECT t.* FROM tags t
             INNER JOIN item_tags it ON t.id = it.tag_id
             WHERE it.item_type = ? AND it.item_id = ?
             ORDER BY t.name ASC`,
            [itemType, itemId]
        );
    },

    /**
     * Obtiene todos los eventos y recordatorios vinculados a un slug de tag.
     */
    async getItemsByTag(
        slug: string,
        options?: { limit?: number; offset?: number }
    ): Promise<{ events: CalendarEvent[]; reminders: Reminder[]; tag: Tag | null }> {
        const normalized = normalizeTagSlug(slug);
        const db = await getDB();

        const tag = await db.getFirstAsync<Tag>(
            `SELECT * FROM tags WHERE slug = ?`,
            [normalized]
        );

        if (!tag) {
            return { events: [], reminders: [], tag: null };
        }

        const limit = options?.limit || 50;
        const offset = options?.offset || 0;

        // Obtener eventos asociados
        const events = await db.getAllAsync<CalendarEvent>(
            `SELECT e.* FROM events e
             INNER JOIN item_tags it ON e.id = it.item_id
             WHERE it.item_type = 'event' AND it.tag_id = ? AND e.deleted = 0
             ORDER BY e.start_time_ms ASC
             LIMIT ? OFFSET ?`,
            [tag.id, limit, offset]
        );

        // Obtener recordatorios asociados
        const reminders = await db.getAllAsync<Reminder>(
            `SELECT r.* FROM reminders r
             INNER JOIN item_tags it ON r.id = it.item_id
             WHERE it.item_type = 'reminder' AND it.tag_id = ? AND r.deleted = 0
             ORDER BY r.due_date_ms ASC
             LIMIT ? OFFSET ?`,
            [tag.id, limit, offset]
        );

        return { events, reminders, tag };
    },

    /**
     * Sugiere tags para autocompletado en base a un prefijo de texto.
     */
    async suggestTags(prefix: string, limit: number = 8): Promise<Tag[]> {
        const db = await getDB();
        const clean = (prefix || '').trim().toLowerCase().replace(/^#+/, '');
        if (!clean) {
            return await db.getAllAsync<Tag>(
                `SELECT * FROM tags ORDER BY updated_at DESC LIMIT ?`,
                [limit]
            );
        }

        const pattern = `%${clean}%`;
        return await db.getAllAsync<Tag>(
            `SELECT * FROM tags WHERE slug LIKE ? OR name LIKE ? ORDER BY name ASC LIMIT ?`,
            [pattern, pattern, limit]
        );
    },

    /**
     * Obtiene todos los tags existentes.
     */
    async getAllTags(): Promise<Tag[]> {
        const db = await getDB();
        return await db.getAllAsync<Tag>(
            `SELECT t.*, COUNT(it.tag_id) as item_count 
             FROM tags t 
             LEFT JOIN item_tags it ON t.id = it.tag_id 
             GROUP BY t.id 
             ORDER BY t.name ASC`
        );
    },

    /**
     * Obtiene un mapa con todos los tags asociados agrupados por item_id.
     */
    async getAllItemTagsMap(): Promise<Record<string, Tag[]>> {
        const db = await getDB();
        const rows = await db.getAllAsync<{ item_id: string; id: string; name: string; slug: string; color: string | null; created_at: number; updated_at: number }>(
            `SELECT it.item_id, t.* 
             FROM item_tags it
             INNER JOIN tags t ON it.tag_id = t.id
             ORDER BY t.name ASC`
        );
        const map: Record<string, Tag[]> = {};
        for (const r of rows) {
            if (!map[r.item_id]) {
                map[r.item_id] = [];
            }
            map[r.item_id].push({
                id: r.id,
                name: r.name,
                slug: r.slug,
                color: r.color,
                created_at: r.created_at,
                updated_at: r.updated_at,
            });
        }
        return map;
    },

    /**
     * Renombra un tag existente. Propaga el cambio actualizando name y slug.
     */
    async renameTag(oldSlug: string, newName: string): Promise<Tag | null> {
        const normalizedOld = normalizeTagSlug(oldSlug);
        const trimmedNew = newName.trim().replace(/^#+/, '');
        const newSlug = normalizeTagSlug(trimmedNew);

        if (!newSlug) throw new Error('Nuevo nombre inválido');

        const db = await getDB();
        const now = Date.now();

        const oldTag = await db.getFirstAsync<Tag>(
            `SELECT * FROM tags WHERE slug = ?`,
            [normalizedOld]
        );
        if (!oldTag) return null;

        await db.runAsync(
            `UPDATE tags SET name = ?, slug = ?, updated_at = ? WHERE id = ?`,
            [trimmedNew, newSlug, now, oldTag.id]
        );

        notifyTagsChanged();

        Promise.resolve(
            supabase
                .from('tags')
                .update({ name: trimmedNew, slug: newSlug, updated_at: now })
                .eq('id', oldTag.id)
        ).catch(() => {});

        return await db.getFirstAsync<Tag>(
            `SELECT * FROM tags WHERE id = ?`,
            [oldTag.id]
        );
    },

    /**
     * Elimina un tag. Borra sus entradas en item_tags (ON DELETE CASCADE)
     * pero NO borra los eventos ni los recordatorios.
     */
    async deleteTag(slug: string): Promise<void> {
        const normalized = normalizeTagSlug(slug);
        const db = await getDB();
        const tag = await db.getFirstAsync<Tag>(
            `SELECT id FROM tags WHERE slug = ?`,
            [normalized]
        );
        if (!tag) return;

        await withSerializedTransaction(db, async () => {
            await db.runAsync(`DELETE FROM item_tags WHERE tag_id = ?`, [tag.id]);
            await db.runAsync(`DELETE FROM tags WHERE id = ?`, [tag.id]);
        });

        notifyTagsChanged();

        Promise.resolve(
            supabase
                .from('tags')
                .delete()
                .eq('id', tag.id)
        ).catch(() => {});
    },
};
