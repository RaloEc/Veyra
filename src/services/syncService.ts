import { supabase } from '../lib/supabase';
import { getDB } from '../db';
import { Reminder, Note, ComplianceEvent } from '../types/db';
import { StorageService } from './storageService';

/**
 * SyncService - Servicio de sincronización bidireccional entre SQLite local y Supabase.
 * 
 * Estrategia: "Last Write Wins" basada en last_modified_ms.
 * - Sube los registros locales modificados después del último sync.
 * - Baja los registros remotos modificados después del último sync.
 * - El registro con mayor last_modified_ms gana en caso de conflicto.
 */
export const SyncService = {

    // ─── Metadata helpers ───────────────────────────────────────────

    async getLastSyncTime(key: string): Promise<number> {
        const db = await getDB();
        const row = await db.getFirstAsync<{ value: string }>(
            `SELECT value FROM sync_metadata WHERE key = ?`, [key]
        );
        return row ? parseInt(row.value, 10) : 0;
    },

    async setLastSyncTime(key: string, time: number): Promise<void> {
        const db = await getDB();
        await db.runAsync(
            `INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)`,
            [key, String(time)]
        );
    },

    // ─── Full Sync ──────────────────────────────────────────────────

    async syncAll(userId: string): Promise<{ success: boolean; errors: string[] }> {
        const errors: string[] = [];
        const syncStart = Date.now();

        try {
            await this.syncProfile(userId);
        } catch (e: any) {
            console.error('Sync profile failed:', e);
            errors.push(`Profile: ${e.message}`);
        }

        try {
            await this.syncReminders(userId);
        } catch (e: any) {
            console.error('Sync reminders failed:', e);
            errors.push(`Reminders: ${e.message}`);
        }

        try {
            await this.syncNotes(userId);
        } catch (e: any) {
            console.error('Sync notes failed:', e);
            errors.push(`Notes: ${e.message}`);
        }

        try {
            await this.syncComplianceEvents(userId);
        } catch (e: any) {
            console.error('Sync compliance failed:', e);
            errors.push(`Compliance: ${e.message}`);
        }

        // Sync de archivos multimedia (después de datos)
        try {
            await this.syncAttachmentFiles(userId);
        } catch (e: any) {
            console.error('Sync files failed:', e);
            errors.push(`Files: ${e.message}`);
        }

        if (errors.length === 0) {
            await this.setLastSyncTime('last_full_sync', syncStart);
        }

        console.log(`[Sync] Completed in ${Date.now() - syncStart}ms. Errors: ${errors.length}`);
        return { success: errors.length === 0, errors };
    },

    // ─── Profile Sync ───────────────────────────────────────────────

    async syncProfile(userId: string): Promise<void> {
        // Obtener perfil remoto
        const { data: remoteProfile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        // Si no existe el perfil remoto, lo creamos
        if (!remoteProfile) {
            const { error: insertError } = await supabase
                .from('profiles')
                .insert({ id: userId, updated_at: new Date().toISOString() });
            if (insertError) throw insertError;
        }
    },

    // ─── Reminders Sync ─────────────────────────────────────────────

    async syncReminders(userId: string): Promise<void> {
        const db = await getDB();
        const lastSync = await this.getLastSyncTime('reminders_sync');

        // 1. Obtener registros locales modificados desde el último sync
        const localModified = await db.getAllAsync<Reminder>(
            `SELECT * FROM reminders WHERE last_modified_ms > ? AND user_id = ?`,
            [lastSync, userId]
        );
        // También incluir los que fueron creados localmente (user_id 'local_user')
        const localNew = await db.getAllAsync<Reminder>(
            `SELECT * FROM reminders WHERE user_id = 'local_user'`
        );

        // 2. Obtener registros remotos modificados desde el último sync
        const { data: remoteModified, error: fetchError } = await supabase
            .from('reminders')
            .select('*')
            .eq('user_id', userId)
            .gt('last_modified_ms', lastSync);

        if (fetchError) throw fetchError;

        const remoteMap = new Map<string, any>();
        (remoteModified || []).forEach((r: any) => remoteMap.set(r.id, r));

        const localMap = new Map<string, Reminder>();
        [...localModified, ...localNew].forEach(r => localMap.set(r.id, r));

        // 3. Resolver conflictos y subir locales al servidor
        const toUpsertRemote: any[] = [];
        const processedIds = new Set<string>();

        for (const [id, local] of localMap) {
            processedIds.add(id);
            const remote = remoteMap.get(id);

            if (!remote || local.last_modified_ms > remote.last_modified_ms) {
                // Local gana - subir al servidor
                toUpsertRemote.push(this.localReminderToRemote(local, userId));
            } else if (remote.last_modified_ms > local.last_modified_ms) {
                // Remoto gana - actualizar local
                await this.upsertLocalReminder(db, remote, userId);
            }
            // Si son iguales, no hacemos nada
        }

        // 4. Registros remotos que no existen localmente
        for (const [id, remote] of remoteMap) {
            if (!processedIds.has(id)) {
                await this.upsertLocalReminder(db, remote, userId);
            }
        }

        // 5. Subir cambios locales al servidor
        if (toUpsertRemote.length > 0) {
            const { error: upsertError } = await supabase
                .from('reminders')
                .upsert(toUpsertRemote, { onConflict: 'id' });
            if (upsertError) throw upsertError;
        }

        // 6. Marcar los locales "local_user" como del usuario real
        if (localNew.length > 0) {
            await db.runAsync(
                `UPDATE reminders SET user_id = ? WHERE user_id = 'local_user'`,
                [userId]
            );
        }

        await this.setLastSyncTime('reminders_sync', Date.now());
    },

    localReminderToRemote(local: Reminder, userId: string): any {
        return {
            id: local.id,
            user_id: userId,
            title: local.title,
            description: local.description || null,
            due_date_ms: local.due_date_ms,
            snooze_until_ms: local.snooze_until_ms || null,
            repeat_rule: local.repeat_rule ? JSON.parse(local.repeat_rule) : null,
            control_level: local.control_level,
            priority: local.priority,
            status: local.status,
            next_attempt_ms: local.next_attempt_ms,
            retry_count: local.retry_count,
            max_retries: local.max_retries,
            last_modified_ms: local.last_modified_ms,
            deleted: local.deleted === 1,
            deleted_at_ms: local.deleted_at_ms || null,
            notification_ids: local.notification_ids ? JSON.parse(local.notification_ids) : [],
            attachments: local.attachments ? JSON.parse(local.attachments) : [],
            links: local.links ? JSON.parse(local.links) : [],
        };
    },

    async upsertLocalReminder(db: any, remote: any, userId: string): Promise<void> {
        const existing = await db.getFirstAsync<Reminder>(
            `SELECT id FROM reminders WHERE id = ?`, [remote.id]
        );

        const params = [
            remote.id,
            userId,
            remote.title,
            remote.description || null,
            remote.due_date_ms,
            remote.snooze_until_ms || null,
            remote.repeat_rule ? JSON.stringify(remote.repeat_rule) : null,
            remote.control_level,
            remote.priority,
            remote.status,
            remote.next_attempt_ms,
            remote.retry_count || 0,
            remote.max_retries || 3,
            remote.last_modified_ms,
            remote.deleted ? 1 : 0,
            remote.deleted_at_ms || null,
            remote.notification_ids ? JSON.stringify(remote.notification_ids) : null,
            remote.attachments ? JSON.stringify(remote.attachments) : null,
            remote.links ? JSON.stringify(remote.links) : null,
        ];

        if (existing) {
            await db.runAsync(
                `UPDATE reminders SET user_id=?, title=?, description=?, due_date_ms=?, snooze_until_ms=?, repeat_rule=?, control_level=?, priority=?, status=?, next_attempt_ms=?, retry_count=?, max_retries=?, last_modified_ms=?, deleted=?, deleted_at_ms=?, notification_ids=?, attachments=?, links=? WHERE id=?`,
                [...params.slice(1), remote.id]
            );
        } else {
            await db.runAsync(
                `INSERT INTO reminders (id, user_id, title, description, due_date_ms, snooze_until_ms, repeat_rule, control_level, priority, status, next_attempt_ms, retry_count, max_retries, last_modified_ms, deleted, deleted_at_ms, notification_ids, attachments, links) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params
            );
        }
    },

    // ─── Notes Sync ─────────────────────────────────────────────────

    async syncNotes(userId: string): Promise<void> {
        const db = await getDB();
        const lastSync = await this.getLastSyncTime('notes_sync');

        // 1. Obtener notas locales modificadas
        const localModified = await db.getAllAsync<Note & { last_modified_ms: number; user_id?: string }>(
            `SELECT * FROM notes WHERE (last_modified_ms > ? OR last_modified_ms IS NULL) AND (user_id = ? OR user_id IS NULL)`,
            [lastSync, userId]
        );

        // 2. Obtener notas remotas modificadas
        const { data: remoteModified, error: fetchError } = await supabase
            .from('notes')
            .select('*')
            .eq('user_id', userId)
            .gt('last_modified_ms', lastSync);

        if (fetchError) throw fetchError;

        const remoteMap = new Map<string, any>();
        (remoteModified || []).forEach((n: any) => remoteMap.set(n.id, n));

        const localMap = new Map<string, any>();
        localModified.forEach(n => localMap.set(n.id, n));

        // 3. Resolver conflictos
        const toUpsertRemote: any[] = [];
        const processedIds = new Set<string>();

        for (const [id, local] of localMap) {
            processedIds.add(id);
            const localModMs = local.last_modified_ms || local.updated_at_ms;
            const remote = remoteMap.get(id);

            if (!remote || localModMs > remote.last_modified_ms) {
                toUpsertRemote.push(this.localNoteToRemote(local, userId));
            } else if (remote.last_modified_ms > localModMs) {
                await this.upsertLocalNote(db, remote, userId);
            }
        }

        // 4. Notas remotas nuevas
        for (const [id, remote] of remoteMap) {
            if (!processedIds.has(id)) {
                await this.upsertLocalNote(db, remote, userId);
            }
        }

        // 5. Subir
        if (toUpsertRemote.length > 0) {
            const { error: upsertError } = await supabase
                .from('notes')
                .upsert(toUpsertRemote, { onConflict: 'id' });
            if (upsertError) throw upsertError;
        }

        // 6. Marcar locales sin user_id
        await db.runAsync(
            `UPDATE notes SET user_id = ?, last_modified_ms = COALESCE(last_modified_ms, updated_at_ms) WHERE user_id IS NULL`,
            [userId]
        );

        await this.setLastSyncTime('notes_sync', Date.now());
    },

    localNoteToRemote(local: any, userId: string): any {
        return {
            id: local.id,
            user_id: userId,
            title: local.title || null,
            content: local.content || null,
            created_at_ms: local.created_at_ms,
            updated_at_ms: local.updated_at_ms,
            is_pinned: local.is_pinned === 1,
            attachments: local.attachments ? JSON.parse(local.attachments) : [],
            links: local.links ? JSON.parse(local.links) : [],
            deleted: local.deleted === 1,
            last_modified_ms: local.last_modified_ms || local.updated_at_ms,
        };
    },

    async upsertLocalNote(db: any, remote: any, userId: string): Promise<void> {
        const existing = await db.getFirstAsync<Note>(
            `SELECT id FROM notes WHERE id = ?`, [remote.id]
        );

        const params = [
            remote.id,
            userId,
            remote.title || null,
            remote.content || null,
            remote.created_at_ms,
            remote.updated_at_ms,
            remote.is_pinned ? 1 : 0,
            remote.attachments ? JSON.stringify(remote.attachments) : null,
            remote.links ? JSON.stringify(remote.links) : null,
            remote.deleted ? 1 : 0,
            remote.last_modified_ms,
        ];

        if (existing) {
            await db.runAsync(
                `UPDATE notes SET user_id=?, title=?, content=?, created_at_ms=?, updated_at_ms=?, is_pinned=?, attachments=?, links=?, deleted=?, last_modified_ms=? WHERE id=?`,
                [...params.slice(1), remote.id]
            );
        } else {
            await db.runAsync(
                `INSERT INTO notes (id, user_id, title, content, created_at_ms, updated_at_ms, is_pinned, attachments, links, deleted, last_modified_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params
            );
        }
    },

    // ─── Compliance Events Sync ─────────────────────────────────────

    async syncComplianceEvents(userId: string): Promise<void> {
        const db = await getDB();

        // Los compliance_events son "append-only" → solo subimos los que no están sincronizados
        const unsynced = await db.getAllAsync<ComplianceEvent>(
            `SELECT * FROM compliance_events WHERE synced = 0`
        );

        if (unsynced.length === 0) return;

        const toInsert = unsynced.map(event => ({
            id: event.id,
            user_id: userId,
            reminder_id: event.reminder_id,
            event_type: event.event_type,
            timestamp_ms: event.timestamp_ms,
        }));

        // Upsert para evitar duplicados
        const { error } = await supabase
            .from('compliance_events')
            .upsert(toInsert, { onConflict: 'id' });

        if (error) throw error;

        // Marcar como sincronizados
        const ids = unsynced.map(e => `'${e.id}'`).join(',');
        await db.runAsync(
            `UPDATE compliance_events SET synced = 1 WHERE id IN (${ids})`
        );
    },

    // ─── Pull-only: Traer eventos de compliance del servidor ────────

    async pullComplianceEvents(userId: string): Promise<void> {
        const db = await getDB();
        const lastSync = await this.getLastSyncTime('compliance_sync');

        const { data: remoteEvents, error } = await supabase
            .from('compliance_events')
            .select('*')
            .eq('user_id', userId)
            .gt('timestamp_ms', lastSync);

        if (error) throw error;
        if (!remoteEvents || remoteEvents.length === 0) return;

        for (const event of remoteEvents) {
            const existing = await db.getFirstAsync<{ id: string }>(
                `SELECT id FROM compliance_events WHERE id = ?`, [event.id]
            );

            if (!existing) {
                await db.runAsync(
                    `INSERT INTO compliance_events (id, reminder_id, event_type, timestamp_ms, synced) VALUES (?, ?, ?, ?, 1)`,
                    [event.id, event.reminder_id, event.event_type, event.timestamp_ms]
                );
            }
        }

        await this.setLastSyncTime('compliance_sync', Date.now());
    },

    // ─── Files Sync ─────────────────────────────────────────────────

    /**
     * Recorre todos los reminders y notes locales que tengan attachments
     * con URIs locales (file://) y los sube a Supabase Storage.
     * Luego actualiza la referencia local con el remotePath.
     */
    async syncAttachmentFiles(userId: string): Promise<void> {
        const db = await getDB();

        // 1. Procesar attachments de reminders
        const remindersWithAttachments = await db.getAllAsync<{ id: string; attachments: string }>(
            `SELECT id, attachments FROM reminders WHERE attachments IS NOT NULL AND attachments != '[]' AND user_id = ?`,
            [userId]
        );

        for (const row of remindersWithAttachments) {
            try {
                const atts = JSON.parse(row.attachments);
                const hasLocalFiles = atts.some((a: any) =>
                    a.uri && (a.uri.startsWith('file://') || a.uri.startsWith('/')) && !a.remotePath
                );

                if (hasLocalFiles) {
                    const updated = await StorageService.uploadAttachments(userId, atts);
                    const updatedJson = JSON.stringify(updated);
                    if (updatedJson !== row.attachments) {
                        await db.runAsync(
                            `UPDATE reminders SET attachments = ? WHERE id = ?`,
                            [updatedJson, row.id]
                        );
                        // Actualizar también en el servidor
                        await supabase.from('reminders').update({
                            attachments: updated
                        }).eq('id', row.id);
                    }
                }
            } catch (e) {
                console.warn(`[Sync] Error uploading reminder attachments ${row.id}:`, e);
            }
        }

        // 2. Procesar attachments de notes
        const notesWithAttachments = await db.getAllAsync<{ id: string; attachments: string }>(
            `SELECT id, attachments FROM notes WHERE attachments IS NOT NULL AND attachments != '[]' AND (user_id = ? OR user_id IS NULL)`,
            [userId]
        );

        for (const row of notesWithAttachments) {
            try {
                const atts = JSON.parse(row.attachments);
                const hasLocalFiles = atts.some((a: any) =>
                    a.uri && (a.uri.startsWith('file://') || a.uri.startsWith('/')) && !a.remotePath
                );

                if (hasLocalFiles) {
                    const updated = await StorageService.uploadAttachments(userId, atts);
                    const updatedJson = JSON.stringify(updated);
                    if (updatedJson !== row.attachments) {
                        await db.runAsync(
                            `UPDATE notes SET attachments = ? WHERE id = ?`,
                            [updatedJson, row.id]
                        );
                        await supabase.from('notes').update({
                            attachments: updated
                        }).eq('id', row.id);
                    }
                }
            } catch (e) {
                console.warn(`[Sync] Error uploading note attachments ${row.id}:`, e);
            }
        }

        // 3. Descargar archivos remotos que faltan localmente
        const allWithRemotePaths = await db.getAllAsync<{ id: string; attachments: string }>(
            `SELECT id, attachments FROM reminders WHERE attachments LIKE '%remotePath%' AND user_id = ?
             UNION ALL
             SELECT id, attachments FROM notes WHERE attachments LIKE '%remotePath%' AND (user_id = ? OR user_id IS NULL)`,
            [userId, userId]
        );

        for (const row of allWithRemotePaths) {
            try {
                const atts = JSON.parse(row.attachments);
                const downloaded = await StorageService.downloadAttachments(atts);
                const downloadedJson = JSON.stringify(downloaded);
                if (downloadedJson !== row.attachments) {
                    // Determinar si es reminder o note
                    await db.runAsync(
                        `UPDATE reminders SET attachments = ? WHERE id = ?`,
                        [downloadedJson, row.id]
                    );
                    await db.runAsync(
                        `UPDATE notes SET attachments = ? WHERE id = ?`,
                        [downloadedJson, row.id]
                    );
                }
            } catch (e) {
                console.warn(`[Sync] Error downloading attachments for ${row.id}:`, e);
            }
        }
    },
};
