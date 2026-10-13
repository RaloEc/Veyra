import { supabase } from '../lib/supabase';
import { getDB } from '../db';
import { Reminder, Note, ComplianceEvent, CalendarEvent, Folder } from '../types/db';
import { StorageService } from './storageService';

/**
 * SyncService - Servicio de sincronización bidireccional entre SQLite local y Supabase.
 * 
 * Estrategia: "Last Write Wins" basada en last_modified_ms.
 * - Sube los registros locales modificados después del último sync.
 * - Baja los registros remotos modificados después del último sync.
 * - El registro con mayor last_modified_ms gana en caso de conflicto.
 */
/**
 * Helper para verificar si un ítem pertenece a otro usuario y se comparte colaborativamente.
 */
function isSharedItem(item: any, currentUserId: string): boolean {
    if (item.is_shared === 1) return true;
    if (item.shared_owner_id && item.shared_owner_id !== currentUserId) return true;
    if (item.user_id && item.user_id !== currentUserId && item.user_id !== 'local_user') return true;
    return false;
}

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

    async syncAll(userId: string, isInitialLogin = false): Promise<{ success: boolean; errors: string[] }> {
        const errors: string[] = [];
        const syncStart = Date.now();

        try {
            await this.syncProfile(userId, isInitialLogin);
        } catch (e: any) {
            console.error('Sync profile/settings failed:', e);
            errors.push(`Profile: ${e.message}`);
        }

        try {
            await this.syncReminders(userId, isInitialLogin);
        } catch (e: any) {
            console.error('Sync reminders failed:', e);
            errors.push(`Reminders: ${e.message}`);
        }

        try {
            await this.syncFolders(userId, isInitialLogin);
        } catch (e: any) {
            console.error('Sync folders failed:', e);
            errors.push(`Folders: ${e.message}`);
        }

        try {
            await this.syncNotes(userId, isInitialLogin);
        } catch (e: any) {
            console.error('Sync notes failed:', e);
            errors.push(`Notes: ${e.message}`);
        }

        try {
            await this.syncEvents(userId, isInitialLogin);
        } catch (e: any) {
            console.error('Sync events failed:', e);
            errors.push(`Events: ${e.message}`);
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
            await this.setLastSyncTime(`${userId}_last_full_sync`, syncStart);
        }

        console.log(`[Sync] Completed in ${Date.now() - syncStart}ms. Errors: ${errors.length}`);
        return { success: errors.length === 0, errors };
    },

    // ─── Profile & Settings Sync ────────────────────────────────────

    async syncProfile(userId: string, isInitialLogin = false): Promise<void> {
        // 1. Obtener perfil remoto de la tabla profiles
        const { data: remoteProfile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.warn('[Sync] Profile query warning:', error.message);
        }

        const { useStore, isWhitelistedPremiumEmail } = await import('../store/useStore');
        const store = useStore.getState();

        // 2. Obtener metadatos de usuario de Supabase Auth (donde se guardan los ajustes completos)
        const { data: userData } = await supabase.auth.getUser();
        const metaSettings = userData?.user?.user_metadata?.settings;

        if (isInitialLogin || !store.userProfile) {
            // Si es login inicial, restaurar los ajustes desde la nube
            if (remoteProfile) {
                if (remoteProfile.user_profile) {
                    store.setUserProfile(remoteProfile.user_profile);
                }
                if (remoteProfile.default_control_level) {
                    store.setDefaultControlLevel(remoteProfile.default_control_level);
                }
                const authEmail = userData?.user?.email || store.session?.user?.email;
                const isOwner = isWhitelistedPremiumEmail(authEmail);
                if (isOwner) {
                    store.setPremium(true);
                } else if (remoteProfile?.is_premium !== undefined) {
                    store.setPremium(Boolean(remoteProfile.is_premium));
                } else {
                    store.setPremium(false);
                }
                if (remoteProfile.onboarding_completed) {
                    useStore.setState({ onboardingCompleted: true });
                }
            }

            if (metaSettings) {
                if (metaSettings.theme) {
                    useStore.setState({ theme: metaSettings.theme });
                }
                const cloudAccent = metaSettings?.accentTheme || userData?.user?.user_metadata?.accentTheme;
                if (cloudAccent) {
                    store.setAccentTheme(cloudAccent);
                }
                if (metaSettings.language && metaSettings.language !== store.language) {
                    store.setLanguage(metaSettings.language);
                    const i18n = (await import('../lib/i18n')).default;
                    i18n.changeLanguage(metaSettings.language);
                }
                if (metaSettings.soundSettings) {
                    if (metaSettings.soundSettings.normal) store.setSoundSetting('normal', metaSettings.soundSettings.normal);
                    if (metaSettings.soundSettings.strict) store.setSoundSetting('strict', metaSettings.soundSettings.strict);
                    if (metaSettings.soundSettings.critical) store.setSoundSetting('critical', metaSettings.soundSettings.critical);
                }
                if (metaSettings.homeViewMode) {
                    store.setHomeViewMode(metaSettings.homeViewMode);
                }
                if (metaSettings.userName) {
                    store.setUserName(metaSettings.userName);
                } else if (userData?.user?.user_metadata?.full_name) {
                    store.setUserName(userData.user.user_metadata.full_name);
                } else if (userData?.user?.user_metadata?.name) {
                    store.setUserName(userData.user.user_metadata.name);
                }
            }
        }

        // 3. Subir/sincronizar el perfil actual hacia la nube
        const currentStore = useStore.getState();
        const authEmail = userData?.user?.email || currentStore.session?.user?.email;
        const isOwner = isWhitelistedPremiumEmail(authEmail);
        const profilePayload: any = {
            id: userId,
            email: authEmail || undefined,
            user_profile: currentStore.userProfile || 'personal',
            default_control_level: currentStore.defaultControlLevel,
            is_premium: isOwner ? 1 : (remoteProfile?.is_premium ? 1 : (currentStore.isPremium ? 1 : 0)),
            onboarding_completed: currentStore.onboardingCompleted ? 1 : 0,
            updated_at: new Date().toISOString(),
        };

        await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' });

        // Guardar también en user_metadata de Auth (para persistir theme, accentTheme, language, soundSettings, etc.)
        try {
            await supabase.auth.updateUser({
                data: {
                    full_name: currentStore.userName || undefined,
                    name: currentStore.userName || undefined,
                    settings: {
                        theme: currentStore.theme,
                        accentTheme: currentStore.accentTheme,
                        language: currentStore.language,
                        soundSettings: currentStore.soundSettings,
                        defaultControlLevel: currentStore.defaultControlLevel,
                        userName: currentStore.userName,
                        userProfile: currentStore.userProfile,
                        homeViewMode: currentStore.homeViewMode,
                    }
                }
            });
            if (currentStore.userName) {
                (async () => {
                    try {
                        await supabase
                            .from('collaboration_activity')
                            .update({ actor_name: currentStore.userName })
                            .eq('actor_id', userId);

                        const { data: ownedCollabs } = await supabase
                            .from('collaborations')
                            .select('target_type, target_id')
                            .eq('owner_id', userId);

                        if (ownedCollabs && ownedCollabs.length > 0) {
                            const { CollaborationService } = await import('./collaborationService');
                            const uniqueTargets = new Map<string, string>();
                            for (const oc of ownedCollabs) {
                                if (!uniqueTargets.has(oc.target_id)) {
                                    uniqueTargets.set(oc.target_id, oc.target_type);
                                    await CollaborationService.ensureActorIdentity(oc.target_type as any, oc.target_id, 'Elemento compartido', true);
                                }
                            }
                        }
                    } catch {}
                })();
            }
        } catch (e) {
            console.warn('[Sync] Could not update user metadata settings:', e);
        }
    },

    // ─── Reminders Sync ─────────────────────────────────────────────

    async syncReminders(userId: string, isInitialLogin = false): Promise<void> {
        const db = await getDB();
        const lastSync = isInitialLogin ? 0 : await this.getLastSyncTime(`${userId}_reminders_sync`);

        // 1. Obtener registros locales modificados desde el último sync (propios y compartidos)
        const localModified = await db.getAllAsync<Reminder>(
            `SELECT * FROM reminders WHERE last_modified_ms > ? AND (user_id = ? OR is_shared = 1 OR shared_owner_id IS NOT NULL)`,
            [lastSync, userId]
        );
        // También incluir los que fueron creados localmente (user_id 'local_user')
        const localNew = await db.getAllAsync<Reminder>(
            `SELECT * FROM reminders WHERE user_id = 'local_user'`
        );

        // 2. Obtener registros remotos (Supabase RLS entrega propios y colaborativos autorizados)
        let remoteQuery = supabase
            .from('reminders')
            .select('*');

        if (lastSync > 0 && !isInitialLogin) {
            remoteQuery = remoteQuery.gt('last_modified_ms', lastSync);
        }

        const { data: remoteModified, error: fetchError } = await remoteQuery;
        if (fetchError) throw fetchError;

        const remoteMap = new Map<string, any>();
        (remoteModified || []).forEach((r: any) => remoteMap.set(r.id, r));

        const localMap = new Map<string, Reminder>();
        [...localModified, ...localNew].forEach(r => localMap.set(r.id, r));

        // 3. Resolver conflictos y preparar actualizaciones
        const toUpsertRemoteOwn: any[] = [];
        const toUpdateRemoteShared: Reminder[] = [];
        const toUpsertLocal: any[] = [];
        const processedIds = new Set<string>();

        for (const [id, local] of localMap) {
            processedIds.add(id);
            const remote = remoteMap.get(id);

            if (!remote || local.last_modified_ms > remote.last_modified_ms) {
                // Local gana - subir al servidor
                if (isSharedItem(local, userId)) {
                    toUpdateRemoteShared.push(local);
                } else {
                    toUpsertRemoteOwn.push(this.localReminderToRemote(local, userId));
                }
            } else if (remote.last_modified_ms > local.last_modified_ms) {
                // Remoto gana - actualizar local
                toUpsertLocal.push(remote);
            }
        }

        // 4. Registros remotos que no existen localmente
        for (const [id, remote] of remoteMap) {
            if (!processedIds.has(id)) {
                toUpsertLocal.push(remote);
            }
        }

        // Aplicar actualizaciones locales dentro de una sola transacción
        if (toUpsertLocal.length > 0 || localNew.length > 0) {
            await db.withTransactionAsync(async () => {
                for (const remote of toUpsertLocal) {
                    await this.upsertLocalReminder(db, remote, userId);
                }
                if (localNew.length > 0) {
                    await db.runAsync(
                        `UPDATE reminders SET user_id = ? WHERE user_id = 'local_user' AND (is_shared IS NULL OR is_shared = 0)`,
                        [userId]
                    );
                }
            });

            // Programar notificaciones y alarmas en el dispositivo para los recordatorios pendientes descargados
            try {
                const { NotificationService } = await import('./notificationService');
                const { useStore } = await import('../store/useStore');
                const soundSettings = useStore.getState().soundSettings;
                const now = Date.now();

                for (const remote of toUpsertLocal) {
                    if (remote.status === 'pending' && remote.due_date_ms > now && !remote.deleted) {
                        const localItem = await db.getFirstAsync<Reminder>(
                            `SELECT * FROM reminders WHERE id = ?`, [remote.id]
                        );
                        if (localItem) {
                            const notifIds = await NotificationService.scheduleReminderNotification(localItem, soundSettings);
                            if (notifIds.length > 0) {
                                await db.runAsync(
                                    `UPDATE reminders SET notification_ids = ? WHERE id = ?`,
                                    [JSON.stringify(notifIds), remote.id]
                                );
                            }
                        }
                    }
                }
            } catch (notifErr) {
                console.warn('[Sync] Error scheduling notifications for downloaded reminders:', notifErr);
            }
        }

        // 5. Subir cambios locales al servidor
        // 5a. Propios: batch upsert seguro (el usuario es propietario de user_id)
        if (toUpsertRemoteOwn.length > 0) {
            const { error: upsertError } = await supabase
                .from('reminders')
                .upsert(toUpsertRemoteOwn, { onConflict: 'id' });
            if (upsertError && (upsertError.message?.includes('subtasks') || upsertError.code === 'PGRST204')) {
                const fallbackRemote = toUpsertRemoteOwn.map(({ subtasks, ...rest }) => rest);
                const { error: retryError } = await supabase
                    .from('reminders')
                    .upsert(fallbackRemote, { onConflict: 'id' });
                if (retryError) throw retryError;
            } else if (upsertError) {
                throw upsertError;
            }
        }

        // 5b. Compartidos: update atómico (PATCH) sin user_id para respetar la política RLS de colaborador
        for (const local of toUpdateRemoteShared) {
            const ownerId = local.shared_owner_id || local.user_id || userId;
            const remoteData = this.localReminderToRemote(local, ownerId);
            const { id, user_id, ...updateFields } = remoteData;
            let { error: updateErr } = await supabase
                .from('reminders')
                .update(updateFields)
                .eq('id', local.id);
            if (updateErr && (updateErr.message?.includes('subtasks') || updateErr.code === 'PGRST204')) {
                const { subtasks, ...fallbackFields } = updateFields;
                const { error: retryErr } = await supabase
                    .from('reminders')
                    .update(fallbackFields)
                    .eq('id', local.id);
                if (retryErr) throw retryErr;
            } else if (updateErr) {
                console.error('[Sync] Error updating shared reminder on Supabase:', updateErr.message);
                throw updateErr;
            }

            try {
                const { CollaborationService } = await import('./collaborationService');
                CollaborationService.notifyChange({
                    targetType: 'reminder',
                    targetId: local.id,
                    action: local.deleted === 1 ? 'deleted' : 'edited',
                    itemTitle: local.title || 'Recordatorio',
                }).catch(() => {});
            } catch {}
        }

        await this.setLastSyncTime(`${userId}_reminders_sync`, Date.now());

        // Actualizar datos del widget de Android
        try {
            const { WidgetService } = await import('./widgetService');
            await WidgetService.syncAll();
        } catch (widgetErr) {
            console.warn('[Sync] Error sincronizando con el widget de Android:', widgetErr);
        }
    },

    localReminderToRemote(local: Reminder, userId: string): any {
        let parsedRepeatRule = null;
        if (local.repeat_rule) {
            if (typeof local.repeat_rule === 'object') {
                parsedRepeatRule = local.repeat_rule;
            } else {
                try { parsedRepeatRule = JSON.parse(local.repeat_rule); } catch { parsedRepeatRule = null; }
            }
        }

        let parsedNotificationIds: any[] = [];
        if (local.notification_ids) {
            if (Array.isArray(local.notification_ids)) {
                parsedNotificationIds = local.notification_ids;
            } else {
                try { parsedNotificationIds = JSON.parse(local.notification_ids); } catch { parsedNotificationIds = []; }
            }
        }

        let parsedAttachments: any[] = [];
        if (local.attachments) {
            if (Array.isArray(local.attachments)) {
                parsedAttachments = local.attachments;
            } else {
                try { parsedAttachments = JSON.parse(local.attachments); } catch { parsedAttachments = []; }
            }
        }

        let parsedLinks: any[] = [];
        if (local.links) {
            if (Array.isArray(local.links)) {
                parsedLinks = local.links;
            } else {
                try { parsedLinks = JSON.parse(local.links); } catch { parsedLinks = []; }
            }
        }

        let parsedSubtasks: any[] = [];
        if (local.subtasks) {
            if (Array.isArray(local.subtasks)) {
                parsedSubtasks = local.subtasks;
            } else {
                try { parsedSubtasks = JSON.parse(local.subtasks); } catch { parsedSubtasks = []; }
            }
        }

        return {
            id: local.id,
            user_id: (local.is_shared === 1 && local.shared_owner_id) ? local.shared_owner_id : userId,
            title: local.title,
            description: local.description || null,
            due_date_ms: local.due_date_ms,
            snooze_until_ms: local.snooze_until_ms || null,
            repeat_rule: parsedRepeatRule,
            control_level: local.control_level,
            priority: local.priority,
            status: local.status,
            next_attempt_ms: local.next_attempt_ms,
            retry_count: local.retry_count,
            max_retries: local.max_retries,
            last_modified_ms: local.last_modified_ms,
            deleted: local.deleted === 1,
            deleted_at_ms: local.deleted_at_ms || null,
            notification_ids: parsedNotificationIds,
            attachments: parsedAttachments,
            links: parsedLinks,
            subtasks: parsedSubtasks,
        };
    },

    async upsertLocalReminder(db: any, remote: any, userId: string): Promise<void> {
        const existing = (await db.getFirstAsync(
            `SELECT id FROM reminders WHERE id = ?`, [remote.id]
        )) as Reminder | null;

        const isShared = (remote.user_id && remote.user_id !== userId) ? 1 : 0;
        const sharedOwnerId = isShared ? remote.user_id : null;

        const params = [
            remote.id,
            remote.user_id || userId,
            remote.title,
            remote.description || null,
            remote.due_date_ms,
            remote.snooze_until_ms || null,
            remote.repeat_rule ? (typeof remote.repeat_rule === 'string' ? remote.repeat_rule : JSON.stringify(remote.repeat_rule)) : null,
            remote.control_level,
            remote.priority,
            remote.status,
            remote.next_attempt_ms,
            remote.retry_count || 0,
            remote.max_retries || 3,
            remote.last_modified_ms,
            remote.deleted ? 1 : 0,
            remote.deleted_at_ms || null,
            remote.notification_ids ? (typeof remote.notification_ids === 'string' ? remote.notification_ids : JSON.stringify(remote.notification_ids)) : null,
            remote.attachments ? (typeof remote.attachments === 'string' ? remote.attachments : JSON.stringify(remote.attachments)) : null,
            remote.links ? (typeof remote.links === 'string' ? remote.links : JSON.stringify(remote.links)) : null,
            remote.subtasks ? (typeof remote.subtasks === 'string' ? remote.subtasks : JSON.stringify(remote.subtasks)) : null,
            isShared,
            sharedOwnerId,
        ];

        if (existing) {
            await db.runAsync(
                `UPDATE reminders SET user_id=?, title=?, description=?, due_date_ms=?, snooze_until_ms=?, repeat_rule=?, control_level=?, priority=?, status=?, next_attempt_ms=?, retry_count=?, max_retries=?, last_modified_ms=?, deleted=?, deleted_at_ms=?, notification_ids=?, attachments=?, links=?, subtasks=?, is_shared=?, shared_owner_id=? WHERE id=?`,
                [...params.slice(1), remote.id]
            );
        } else {
            await db.runAsync(
                `INSERT INTO reminders (id, user_id, title, description, due_date_ms, snooze_until_ms, repeat_rule, control_level, priority, status, next_attempt_ms, retry_count, max_retries, last_modified_ms, deleted, deleted_at_ms, notification_ids, attachments, links, subtasks, is_shared, shared_owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params
            );
        }
    },

    // ─── Notes Sync ─────────────────────────────────────────────────

    async syncNotes(userId: string, isInitialLogin = false): Promise<void> {
        const db = await getDB();
        const lastSync = isInitialLogin ? 0 : await this.getLastSyncTime(`${userId}_notes_sync`);

        // 1. Obtener notas locales modificadas (propias y compartidas)
        const localModified = await db.getAllAsync<Note & { last_modified_ms: number; user_id?: string }>(
            `SELECT * FROM notes WHERE (last_modified_ms > ? OR last_modified_ms IS NULL) AND (user_id = ? OR user_id = 'local_user' OR user_id IS NULL OR is_shared = 1 OR shared_owner_id IS NOT NULL)`,
            [lastSync, userId]
        );

        // 2. Obtener notas remotas (Supabase RLS entrega propias y autorizadas en colaboración)
        let remoteQuery = supabase
            .from('notes')
            .select('*');

        if (lastSync > 0 && !isInitialLogin) {
            remoteQuery = remoteQuery.gt('last_modified_ms', lastSync);
        }

        const { data: remoteModified, error: fetchError } = await remoteQuery;
        if (fetchError) throw fetchError;

        const remoteMap = new Map<string, any>();
        (remoteModified || []).forEach((n: any) => remoteMap.set(n.id, n));

        const localMap = new Map<string, any>();
        localModified.forEach(n => localMap.set(n.id, n));

        // 3. Resolver conflictos
        const toUpsertRemoteOwn: any[] = [];
        const toUpdateRemoteShared: any[] = [];
        const toUpsertLocal: any[] = [];
        const processedIds = new Set<string>();

        for (const [id, local] of localMap) {
            processedIds.add(id);
            const localModMs = local.last_modified_ms || local.updated_at_ms;
            const remote = remoteMap.get(id);

            if (!remote || localModMs > (remote.last_modified_ms || 0)) {
                if (isSharedItem(local, userId)) {
                    toUpdateRemoteShared.push(local);
                } else {
                    toUpsertRemoteOwn.push(this.localNoteToRemote(local, userId));
                }
            } else if ((remote.last_modified_ms || 0) > localModMs) {
                toUpsertLocal.push(remote);
            }
        }

        // 4. Notas remotas nuevas
        for (const [id, remote] of remoteMap) {
            if (!processedIds.has(id)) {
                toUpsertLocal.push(remote);
            }
        }

        // Aplicar actualizaciones locales dentro de una sola transacción
        if (toUpsertLocal.length > 0) {
            await db.withTransactionAsync(async () => {
                for (const remote of toUpsertLocal) {
                    await this.upsertLocalNote(db, remote, userId);
                }
            });
        }

        // 5. Subir
        // 5a. Propias: batch upsert seguro
        if (toUpsertRemoteOwn.length > 0) {
            const { error: upsertError } = await supabase
                .from('notes')
                .upsert(toUpsertRemoteOwn, { onConflict: 'id' });
            if (upsertError && (upsertError.message?.includes('folder_id') || upsertError.message?.includes('event_id') || upsertError.code === 'PGRST204')) {
                const fallbackRemote = toUpsertRemoteOwn.map(({ folder_id, event_id, ...rest }) => rest);
                const { error: retryError } = await supabase
                    .from('notes')
                    .upsert(fallbackRemote, { onConflict: 'id' });
                if (retryError) throw retryError;
            } else if (upsertError) {
                throw upsertError;
            }
        }

        // 5b. Compartidas: update atómico (PATCH) sin user_id para respetar la política RLS
        for (const local of toUpdateRemoteShared) {
            const ownerId = local.shared_owner_id || local.user_id || userId;
            const remoteData = this.localNoteToRemote(local, ownerId);
            const { id, user_id, created_at, created_at_ms, ...updateFields } = remoteData;
            // No sincronizar is_pinned en notas compartidas: fijar es una preferencia de visualización individual
            delete updateFields.is_pinned;
            let { error: updateErr } = await supabase
                .from('notes')
                .update(updateFields)
                .eq('id', local.id);
            if (updateErr && (updateErr.message?.includes('folder_id') || updateErr.message?.includes('event_id') || updateErr.code === 'PGRST204')) {
                const { folder_id, event_id, ...fallbackFields } = updateFields;
                const { error: retryErr } = await supabase
                    .from('notes')
                    .update(fallbackFields)
                    .eq('id', local.id);
                if (retryErr) throw retryErr;
            } else if (updateErr) {
                console.error('[Sync] Error updating shared note on Supabase:', updateErr.message);
                throw updateErr;
            }

            try {
                const { CollaborationService } = await import('./collaborationService');
                CollaborationService.notifyChange({
                    targetType: 'note',
                    targetId: local.id,
                    action: local.deleted ? 'deleted' : 'edited',
                    itemTitle: local.title || 'Nota',
                }).catch(() => {});
            } catch {}
        }

        // 6. Marcar locales sin user_id (solo propios)
        await db.runAsync(
            `UPDATE notes SET user_id = ?, last_modified_ms = COALESCE(last_modified_ms, updated_at_ms) WHERE (user_id IS NULL OR user_id = 'local_user') AND (is_shared IS NULL OR is_shared = 0)`,
            [userId]
        );

        await this.setLastSyncTime(`${userId}_notes_sync`, Date.now());
    },

    // ─── Events Sync ────────────────────────────────────────────────

    async syncEvents(userId: string, isInitialLogin = false): Promise<void> {
        const db = await getDB();
        const lastSync = isInitialLogin ? 0 : await this.getLastSyncTime(`${userId}_events_sync`);

        let remoteQuery = supabase
            .from('events')
            .select('*');

        if (lastSync > 0 && !isInitialLogin) {
            remoteQuery = remoteQuery.gt('last_modified_ms', lastSync);
        }

        const { data: remoteModified, error: fetchError } = await remoteQuery;
        if (fetchError) {
            console.error('[Sync] Remote events table query error:', fetchError.message);
            throw fetchError;
        }

        const localModified = await db.getAllAsync<CalendarEvent>(
            `SELECT * FROM events WHERE (last_modified_ms > ? OR last_modified_ms IS NULL) AND (user_id = ? OR user_id = 'local_user' OR user_id IS NULL OR is_shared = 1 OR shared_owner_id IS NOT NULL)`,
            [lastSync, userId]
        );

        const remoteMap = new Map<string, any>();
        (remoteModified || []).forEach((e: any) => remoteMap.set(e.id, e));

        const localMap = new Map<string, CalendarEvent>();
        localModified.forEach(e => localMap.set(e.id, e));

        const toUpsertRemoteOwn: any[] = [];
        const toUpdateRemoteShared: CalendarEvent[] = [];
        const toUpsertLocal: any[] = [];
        const processedIds = new Set<string>();

        for (const [id, local] of localMap) {
            processedIds.add(id);
            const remote = remoteMap.get(id);
            const localMod = local.last_modified_ms || local.updated_at_ms;

            if (!remote || localMod > (remote.last_modified_ms || 0)) {
                if (isSharedItem(local, userId)) {
                    toUpdateRemoteShared.push(local);
                } else {
                    toUpsertRemoteOwn.push(this.localEventToRemote(local, userId));
                }
            } else if ((remote.last_modified_ms || 0) > localMod) {
                toUpsertLocal.push(remote);
            }
        }

        for (const [id, remote] of remoteMap) {
            if (!processedIds.has(id)) {
                toUpsertLocal.push(remote);
            }
        }

        if (toUpsertLocal.length > 0) {
            await db.withTransactionAsync(async () => {
                for (const remote of toUpsertLocal) {
                    await this.upsertLocalEvent(db, remote, userId);
                }
            });

            // Programar notificaciones de eventos descargados
            try {
                const { NotificationService } = await import('./notificationService');
                const now = Date.now();
                for (const remote of toUpsertLocal) {
                    if (remote.start_time_ms > now && !remote.deleted) {
                        const localEvent = await db.getFirstAsync<CalendarEvent>(
                            `SELECT * FROM events WHERE id = ?`, [remote.id]
                        );
                        if (localEvent) {
                            const notifIds = await NotificationService.scheduleEventNotification(localEvent);
                            if (notifIds.length > 0) {
                                await db.runAsync(
                                    `UPDATE events SET notification_ids = ? WHERE id = ?`,
                                    [JSON.stringify(notifIds), remote.id]
                                );
                            }
                        }
                    }
                }
            } catch (eventNotifErr) {
                console.warn('[Sync] Error scheduling event notifications:', eventNotifErr);
            }
        }

        // 5a. Propios: batch upsert seguro (el usuario es propietario de user_id)
        if (toUpsertRemoteOwn.length > 0) {
            let { error: upsertErr } = await supabase.from('events').upsert(toUpsertRemoteOwn, { onConflict: 'id' });
            if (upsertErr && (upsertErr.message?.includes('tags') || upsertErr.code === 'PGRST204')) {
                const fallback = toUpsertRemoteOwn.map(({ tags, ...rest }) => rest);
                const { error: retryErr } = await supabase.from('events').upsert(fallback, { onConflict: 'id' });
                if (retryErr) throw retryErr;
            } else if (upsertErr) {
                console.error('[Sync] Error upserting events to Supabase:', upsertErr.message);
                throw upsertErr;
            }
        }

        // 5b. Compartidos: update atómico (PATCH) sin user_id para respetar la política RLS de colaborador
        for (const local of toUpdateRemoteShared) {
            const ownerId = local.shared_owner_id || local.user_id || userId;
            const remoteData = this.localEventToRemote(local, ownerId);
            const { id, user_id, created_at_ms, ...updateFields } = remoteData;

            let { error: updateErr } = await supabase
                .from('events')
                .update(updateFields)
                .eq('id', local.id);

            if (updateErr && (updateErr.message?.includes('tags') || updateErr.code === 'PGRST204')) {
                const { tags, ...fallbackFields } = updateFields;
                const { error: retryErr } = await supabase
                    .from('events')
                    .update(fallbackFields)
                    .eq('id', local.id);
                if (retryErr) throw retryErr;
            } else if (updateErr) {
                console.error('[Sync] Error updating shared event on Supabase:', updateErr.message);
                throw updateErr;
            }

            try {
                const { CollaborationService } = await import('./collaborationService');
                CollaborationService.notifyChange({
                    targetType: 'event',
                    targetId: local.id,
                    action: local.deleted === 1 ? 'deleted' : 'edited',
                    itemTitle: local.title || 'Evento',
                }).catch(() => {});
            } catch {
                // Notificación silenciosa
            }
        }

        await db.runAsync(
            `UPDATE events SET user_id = ?, last_modified_ms = COALESCE(last_modified_ms, updated_at_ms) WHERE (user_id IS NULL OR user_id = 'local_user') AND (is_shared IS NULL OR is_shared = 0)`,
            [userId]
        );

        await this.setLastSyncTime(`${userId}_events_sync`, Date.now());
    },

    localEventToRemote(local: CalendarEvent, userId: string): any {
        const createdAtMs = local.created_at_ms && Number(local.created_at_ms) > 0
            ? Number(local.created_at_ms)
            : (local.updated_at_ms && Number(local.updated_at_ms) > 0 ? Number(local.updated_at_ms) : Date.now());
        const updatedAtMs = local.updated_at_ms && Number(local.updated_at_ms) > 0
            ? Number(local.updated_at_ms)
            : createdAtMs;

        let parsedRepeatRule = null;
        if (local.repeat_rule) {
            if (typeof local.repeat_rule === 'object') {
                parsedRepeatRule = local.repeat_rule;
            } else {
                try { parsedRepeatRule = JSON.parse(local.repeat_rule); } catch { parsedRepeatRule = null; }
            }
        }

        let parsedNotificationOffsets: any[] = [];
        if (local.notification_offsets) {
            if (Array.isArray(local.notification_offsets)) {
                parsedNotificationOffsets = local.notification_offsets;
            } else {
                try { parsedNotificationOffsets = JSON.parse(local.notification_offsets); } catch { parsedNotificationOffsets = []; }
            }
        }

        let parsedNotificationIds: any[] = [];
        if (local.notification_ids) {
            if (Array.isArray(local.notification_ids)) {
                parsedNotificationIds = local.notification_ids;
            } else {
                try { parsedNotificationIds = JSON.parse(local.notification_ids); } catch { parsedNotificationIds = []; }
            }
        }

        let parsedTags: any[] = [];
        if (local.tags) {
            if (Array.isArray(local.tags)) {
                parsedTags = local.tags;
            } else {
                try { parsedTags = JSON.parse(local.tags); } catch { parsedTags = []; }
            }
        }

        return {
            id: local.id,
            user_id: (local.is_shared === 1 && local.shared_owner_id) ? local.shared_owner_id : userId,
            title: local.title,
            description: local.description || null,
            start_time_ms: local.start_time_ms,
            end_time_ms: local.end_time_ms,
            repeat_rule: parsedRepeatRule,
            location: local.location || null,
            color: local.color || null,
            notification_offset_min: local.notification_offset_min ?? 15,
            notification_offsets: parsedNotificationOffsets,
            notification_ids: parsedNotificationIds,
            note_id: local.note_id || null,
            tags: parsedTags,
            created_at_ms: createdAtMs,
            updated_at_ms: updatedAtMs,
            last_modified_ms: local.last_modified_ms || updatedAtMs,
            deleted: local.deleted === 1 ? 1 : 0,
        };
    },

    async upsertLocalEvent(db: any, remote: any, userId: string): Promise<void> {
        const existing = await db.getFirstAsync(
            `SELECT id, created_at_ms, updated_at_ms FROM events WHERE id = ?`, [remote.id]
        ) as CalendarEvent | null;

        let createdAtMs: number;
        if (existing?.created_at_ms && Number(existing.created_at_ms) > 0) {
            createdAtMs = Number(existing.created_at_ms);
        } else if (remote.created_at_ms && Number(remote.created_at_ms) > 0) {
            createdAtMs = Number(remote.created_at_ms);
        } else if (remote.created_at) {
            const parsed = new Date(remote.created_at).getTime();
            createdAtMs = !isNaN(parsed) && parsed > 0 ? parsed : Date.now();
        } else {
            createdAtMs = Date.now();
        }

        let updatedAtMs: number;
        if (remote.updated_at_ms && Number(remote.updated_at_ms) > 0) {
            updatedAtMs = Number(remote.updated_at_ms);
        } else if (remote.updated_at) {
            const parsed = new Date(remote.updated_at).getTime();
            updatedAtMs = !isNaN(parsed) && parsed > 0 ? parsed : createdAtMs;
        } else if (existing?.updated_at_ms && Number(existing.updated_at_ms) > 0) {
            updatedAtMs = Number(existing.updated_at_ms);
        } else {
            updatedAtMs = createdAtMs;
        }

        const isShared = (remote.user_id && remote.user_id !== userId) ? 1 : 0;
        const sharedOwnerId = isShared ? remote.user_id : null;

        let tagsJson: string | null = null;
        if (remote.tags) {
            tagsJson = typeof remote.tags === 'string' ? remote.tags : JSON.stringify(remote.tags);
        }

        const params = [
            remote.id,
            remote.user_id || userId,
            remote.title,
            remote.description || null,
            remote.start_time_ms,
            remote.end_time_ms,
            remote.repeat_rule ? (typeof remote.repeat_rule === 'string' ? remote.repeat_rule : JSON.stringify(remote.repeat_rule)) : null,
            remote.location || null,
            remote.color || null,
            remote.notification_offset_min ?? 15,
            remote.notification_offsets ? (typeof remote.notification_offsets === 'string' ? remote.notification_offsets : JSON.stringify(remote.notification_offsets)) : null,
            remote.notification_ids ? (typeof remote.notification_ids === 'string' ? remote.notification_ids : JSON.stringify(remote.notification_ids)) : null,
            remote.note_id || null,
            tagsJson,
            createdAtMs,
            updatedAtMs,
            remote.last_modified_ms || updatedAtMs,
            remote.deleted ? 1 : 0,
            isShared,
            sharedOwnerId,
        ];

        if (existing) {
            await db.runAsync(
                `UPDATE events SET user_id=?, title=?, description=?, start_time_ms=?, end_time_ms=?, repeat_rule=?, location=?, color=?, notification_offset_min=?, notification_offsets=?, notification_ids=?, note_id=?, tags=?, created_at_ms=?, updated_at_ms=?, last_modified_ms=?, deleted=?, is_shared=?, shared_owner_id=? WHERE id=?`,
                [...params.slice(1), remote.id]
            );
        } else {
            await db.runAsync(
                `INSERT INTO events (id, user_id, title, description, start_time_ms, end_time_ms, repeat_rule, location, color, notification_offset_min, notification_offsets, notification_ids, note_id, tags, created_at_ms, updated_at_ms, last_modified_ms, deleted, is_shared, shared_owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params
            );
        }
    },

    // ─── Folders Sync ────────────────────────────────────────────────

    async syncFolders(userId: string, isInitialLogin = false): Promise<void> {
        try {
            const db = await getDB();
            const lastSync = isInitialLogin ? 0 : await this.getLastSyncTime(`${userId}_folders_sync`);

            const localModified = await db.getAllAsync<Folder>(
                `SELECT * FROM folders WHERE (last_modified_ms > ? OR last_modified_ms IS NULL) AND (user_id = ? OR is_shared = 1 OR shared_owner_id IS NOT NULL)`,
                [lastSync, userId]
            );
            const localNew = await db.getAllAsync<Folder>(
                `SELECT * FROM folders WHERE user_id IS NULL OR user_id = 'local_user'`
            );

            let remoteQuery = supabase
                .from('folders')
                .select('*');

            if (lastSync > 0 && !isInitialLogin) {
                remoteQuery = remoteQuery.gt('last_modified_ms', lastSync);
            }

            const { data: remoteModified, error: fetchError } = await remoteQuery;
            if (fetchError) {
                console.log('[Sync] Folders remote query info:', fetchError.message);
                return;
            }

            const remoteMap = new Map<string, any>();
            (remoteModified || []).forEach((f: any) => remoteMap.set(f.id, f));

            const localMap = new Map<string, Folder>();
            [...localModified, ...localNew].forEach(f => localMap.set(f.id, f));

            const toUpsertRemoteOwn: any[] = [];
            const toUpdateRemoteShared: Folder[] = [];
            const toUpsertLocal: any[] = [];
            const processedIds = new Set<string>();

            for (const [id, local] of localMap) {
                processedIds.add(id);
                const remote = remoteMap.get(id);
                const localMod = local.last_modified_ms || local.updated_at_ms;

                if (!remote || localMod > (remote.last_modified_ms || 0)) {
                    if (isSharedItem(local, userId)) {
                        toUpdateRemoteShared.push(local);
                    } else {
                        toUpsertRemoteOwn.push(this.localFolderToRemote(local, userId));
                    }
                } else if ((remote.last_modified_ms || 0) > localMod) {
                    toUpsertLocal.push(remote);
                }
            }

            for (const [id, remote] of remoteMap) {
                if (!processedIds.has(id)) {
                    toUpsertLocal.push(remote);
                }
            }

            if (toUpsertLocal.length > 0) {
                toUpsertLocal.sort((a, b) => {
                    if (!a.parent_id && b.parent_id) return -1;
                    if (a.parent_id && !b.parent_id) return 1;
                    return 0;
                });
                await db.withTransactionAsync(async () => {
                    for (const remote of toUpsertLocal) {
                        await this.upsertLocalFolder(db, remote, userId);
                    }
                });
            }

            // 5a. Propias: batch upsert seguro
            if (toUpsertRemoteOwn.length > 0) {
                toUpsertRemoteOwn.sort((a, b) => {
                    if (!a.parent_id && b.parent_id) return -1;
                    if (a.parent_id && !b.parent_id) return 1;
                    return 0;
                });
                await supabase.from('folders').upsert(toUpsertRemoteOwn, { onConflict: 'id' });
            }

            // 5b. Compartidas: update atómico (PATCH) sin user_id para respetar la política RLS
            for (const local of toUpdateRemoteShared) {
                const ownerId = local.shared_owner_id || local.user_id || userId;
                const remoteData = this.localFolderToRemote(local, ownerId);
                const { id, user_id, created_at, created_at_ms, ...updateFields } = remoteData;
                delete updateFields.is_pinned;
                const { error: updateErr } = await supabase
                    .from('folders')
                    .update(updateFields)
                    .eq('id', local.id);
                if (updateErr) throw updateErr;
            }

            await db.runAsync(
                `UPDATE folders SET user_id = ?, last_modified_ms = COALESCE(last_modified_ms, updated_at_ms) WHERE (user_id IS NULL OR user_id = 'local_user') AND (is_shared IS NULL OR is_shared = 0)`,
                [userId]
            );

            await this.setLastSyncTime(`${userId}_folders_sync`, Date.now());
        } catch (err: any) {
            console.log('[Sync] Folder sync notice:', err.message);
        }
    },

    localFolderToRemote(local: Folder, userId: string): any {
        const createdAtMs = local.created_at_ms && Number(local.created_at_ms) > 0
            ? Number(local.created_at_ms)
            : (local.updated_at_ms && Number(local.updated_at_ms) > 0 ? Number(local.updated_at_ms) : Date.now());
        const updatedAtMs = local.updated_at_ms && Number(local.updated_at_ms) > 0
            ? Number(local.updated_at_ms)
            : createdAtMs;

        return {
            id: local.id,
            user_id: (local.is_shared === 1 && local.shared_owner_id) ? local.shared_owner_id : userId,
            parent_id: local.parent_id || null,
            name: local.name,
            icon: local.icon || 'folder',
            color: local.color || '#8B5CF6',
            is_pinned: local.is_pinned ?? 0,
            created_at: new Date(createdAtMs).toISOString(),
            created_at_ms: createdAtMs,
            updated_at_ms: updatedAtMs,
            last_modified_ms: local.last_modified_ms || updatedAtMs,
            deleted: local.deleted === 1 ? 1 : 0,
        };
    },

    async upsertLocalFolder(db: any, remote: any, userId: string): Promise<void> {
        const existing = await db.getFirstAsync(
            `SELECT id, created_at_ms, updated_at_ms, is_pinned, is_shared, shared_owner_id FROM folders WHERE id = ?`, [remote.id]
        ) as (Folder & { is_pinned?: number; is_shared?: number; shared_owner_id?: string }) | null;

        let createdAtMs: number;
        if (existing?.created_at_ms && Number(existing.created_at_ms) > 0) {
            createdAtMs = Number(existing.created_at_ms);
        } else if (remote.created_at_ms && Number(remote.created_at_ms) > 0) {
            createdAtMs = Number(remote.created_at_ms);
        } else if (remote.created_at) {
            const parsed = new Date(remote.created_at).getTime();
            createdAtMs = !isNaN(parsed) && parsed > 0 ? parsed : Date.now();
        } else {
            createdAtMs = Date.now();
        }

        let updatedAtMs: number;
        if (remote.updated_at_ms && Number(remote.updated_at_ms) > 0) {
            updatedAtMs = Number(remote.updated_at_ms);
        } else if (remote.updated_at) {
            const parsed = new Date(remote.updated_at).getTime();
            updatedAtMs = !isNaN(parsed) && parsed > 0 ? parsed : createdAtMs;
        } else if (existing?.updated_at_ms && Number(existing.updated_at_ms) > 0) {
            updatedAtMs = Number(existing.updated_at_ms);
        } else {
            updatedAtMs = createdAtMs;
        }

        const isShared = (remote.user_id && remote.user_id !== userId) ? 1 : 0;
        const sharedOwnerId = isShared ? remote.user_id : null;
        const isLocallyOrRemotelyShared = isShared === 1 || existing?.is_shared === 1 || Boolean(existing?.shared_owner_id);

        // En carpetas compartidas, is_pinned es una preferencia de visualización local y privada
        const resolvedIsPinned = isLocallyOrRemotelyShared
            ? (existing && existing.is_pinned !== undefined && existing.is_pinned !== null ? existing.is_pinned : 0)
            : (remote.is_pinned ?? 0);

        const params = [
            remote.id,
            remote.user_id || userId,
            remote.parent_id || null,
            remote.name,
            remote.icon || 'folder',
            remote.color || '#8B5CF6',
            resolvedIsPinned,
            createdAtMs,
            updatedAtMs,
            remote.last_modified_ms || updatedAtMs,
            remote.deleted ? 1 : 0,
            isShared,
            sharedOwnerId,
        ];

        if (existing) {
            await db.runAsync(
                `UPDATE folders SET user_id=?, parent_id=?, name=?, icon=?, color=?, is_pinned=?, created_at_ms=?, updated_at_ms=?, last_modified_ms=?, deleted=?, is_shared=?, shared_owner_id=? WHERE id=?`,
                [...params.slice(1), remote.id]
            );
        } else {
            await db.runAsync(
                `INSERT INTO folders (id, user_id, parent_id, name, icon, color, is_pinned, created_at_ms, updated_at_ms, last_modified_ms, deleted, is_shared, shared_owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params
            );
        }
    },

    localNoteToRemote(local: any, userId: string): any {
        const createdAtMs = local.created_at_ms && Number(local.created_at_ms) > 0
            ? Number(local.created_at_ms)
            : (local.updated_at_ms && Number(local.updated_at_ms) > 0 ? Number(local.updated_at_ms) : Date.now());

        const updatedAtMs = local.updated_at_ms && Number(local.updated_at_ms) > 0
            ? Number(local.updated_at_ms)
            : createdAtMs;

        return {
            id: local.id,
            user_id: (local.is_shared === 1 && local.shared_owner_id) ? local.shared_owner_id : userId,
            folder_id: local.folder_id || null,
            event_id: local.event_id || null,
            title: local.title || null,
            content: local.content || null,
            created_at: new Date(createdAtMs).toISOString(),
            created_at_ms: createdAtMs,
            updated_at_ms: updatedAtMs,
            is_pinned: local.is_pinned === 1,
            attachments: local.attachments ? JSON.parse(local.attachments) : [],
            links: local.links ? JSON.parse(local.links) : [],
            deleted: local.deleted === 1,
            last_modified_ms: local.last_modified_ms || updatedAtMs,
        };
    },

    async upsertLocalNote(db: any, remote: any, userId: string): Promise<void> {
        const existing = (await db.getFirstAsync(
            `SELECT id, created_at_ms, updated_at_ms, is_pinned, is_shared, shared_owner_id FROM notes WHERE id = ?`, [remote.id]
        )) as (Note & { is_pinned?: number; is_shared?: number; shared_owner_id?: string }) | null;

        // Recuperar la fecha original de creación con máxima resiliencia
        let createdAtMs: number;
        if (existing?.created_at_ms && Number(existing.created_at_ms) > 0) {
            createdAtMs = Number(existing.created_at_ms);
        } else if (remote.created_at_ms && Number(remote.created_at_ms) > 0) {
            createdAtMs = Number(remote.created_at_ms);
        } else if (remote.created_at) {
            const parsed = new Date(remote.created_at).getTime();
            createdAtMs = !isNaN(parsed) && parsed > 0 ? parsed : Date.now();
        } else if (remote.updated_at_ms && Number(remote.updated_at_ms) > 0) {
            createdAtMs = Number(remote.updated_at_ms);
        } else {
            createdAtMs = Date.now();
        }

        // Recuperar updated_at_ms
        let updatedAtMs: number;
        if (remote.updated_at_ms && Number(remote.updated_at_ms) > 0) {
            updatedAtMs = Number(remote.updated_at_ms);
        } else if (remote.updated_at) {
            const parsed = new Date(remote.updated_at).getTime();
            updatedAtMs = !isNaN(parsed) && parsed > 0 ? parsed : createdAtMs;
        } else if (existing?.updated_at_ms && Number(existing.updated_at_ms) > 0) {
            updatedAtMs = Number(existing.updated_at_ms);
        } else {
            updatedAtMs = createdAtMs;
        }

        const lastModifiedMs = remote.last_modified_ms && Number(remote.last_modified_ms) > 0
            ? Number(remote.last_modified_ms)
            : updatedAtMs;

        // Verificar si la nota pertenece a una carpeta compartida
        let folderIsShared = false;
        let folderSharedOwnerId: string | null = null;
        if (remote.folder_id) {
            const folderRow = (await db.getFirstAsync(
                'SELECT is_shared, shared_owner_id, user_id FROM folders WHERE id = ?',
                [remote.folder_id]
            )) as { is_shared?: number; shared_owner_id?: string; user_id?: string } | null;
            if (folderRow && (folderRow.is_shared === 1 || Boolean(folderRow.shared_owner_id))) {
                folderIsShared = true;
                folderSharedOwnerId = folderRow.shared_owner_id || (folderRow.user_id && folderRow.user_id !== userId && folderRow.user_id !== 'local_user' ? folderRow.user_id : null);
            }
        }

        const isShared = (remote.user_id && remote.user_id !== userId) || folderIsShared || existing?.is_shared === 1 ? 1 : 0;
        const sharedOwnerId = (remote.user_id && remote.user_id !== userId)
            ? remote.user_id
            : (existing?.shared_owner_id || folderSharedOwnerId || null);
        const isLocallyOrRemotelyShared = isShared === 1 || existing?.is_shared === 1 || Boolean(existing?.shared_owner_id);

        // El estado de fijado (pin) en notas compartidas es una preferencia de visualización local y privada de cada usuario:
        // Si ya existe la nota localmente, conservamos el is_pinned local del usuario.
        // Si es una nota compartida nueva que llega por primera vez, se inicializa sin fijar (0).
        const resolvedIsPinned = isLocallyOrRemotelyShared
            ? (existing && existing.is_pinned !== undefined && existing.is_pinned !== null ? existing.is_pinned : 0)
            : (remote.is_pinned ? 1 : 0);

        const params = [
            remote.id,
            remote.user_id || userId,
            remote.folder_id || null,
            remote.event_id || null,
            remote.title || null,
            remote.content || null,
            createdAtMs,
            updatedAtMs,
            resolvedIsPinned,
            remote.attachments ? JSON.stringify(remote.attachments) : null,
            remote.links ? JSON.stringify(remote.links) : null,
            remote.deleted ? 1 : 0,
            lastModifiedMs,
            isShared,
            sharedOwnerId,
        ];

        if (existing) {
            await db.runAsync(
                `UPDATE notes SET user_id=?, folder_id=?, event_id=?, title=?, content=?, created_at_ms=?, updated_at_ms=?, is_pinned=?, attachments=?, links=?, deleted=?, last_modified_ms=?, is_shared=?, shared_owner_id=? WHERE id=?`,
                [...params.slice(1), remote.id]
            );
        } else {
            await db.runAsync(
                `INSERT INTO notes (id, user_id, folder_id, event_id, title, content, created_at_ms, updated_at_ms, is_pinned, attachments, links, deleted, last_modified_ms, is_shared, shared_owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

        await db.withTransactionAsync(async () => {
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
        });

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
