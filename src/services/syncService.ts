import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../lib/supabase';
import { getDB, withSerializedTransaction } from '../db';
import { Reminder, Note, ComplianceEvent, CalendarEvent, Folder } from '../types/db';
import { StorageService } from './storageService';
import { SearchService } from './searchService';
import { NotificationService } from './notificationService';
import { CollaborationService } from './collaborationService';
import { WidgetService } from './widgetService';
import { isWhitelistedPremiumEmail } from '../constants/premium';
import { notifyTagsChanged } from './TagService';
import i18n from '../lib/i18n';
import { computeNotePreviewText } from '../utils/pageUtils';

export interface SyncStoreHandlers {
    getMainStoreState?: () => any;
    setMainStoreState?: (partial: any) => void;
    loadReminders?: () => Promise<void>;
    loadStreak?: () => Promise<void>;
    loadTags?: () => Promise<void>;
    loadFolders?: () => Promise<void>;
    loadNotes?: () => Promise<void>;
    loadAllEvents?: () => Promise<void>;
}

let syncStoreHandlers: SyncStoreHandlers = {};

export function registerSyncStoreHandlers(handlers: Partial<SyncStoreHandlers>) {
    syncStoreHandlers = { ...syncStoreHandlers, ...handlers };
}

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

/**
 * Helper para limitar el tiempo de espera de promesas de red y evitar bloqueos permanentes.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
    let timerId: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timerId = setTimeout(() => reject(new Error(errorMsg)), ms);
    });
    return Promise.race([
        promise.finally(() => {
            if (timerId) clearTimeout(timerId);
        }),
        timeoutPromise,
    ]);
}

/**
 * JSON.stringify determinista (claves ordenadas; null/undefined omitidos) para comparar ajustes.
 */
function stableStringify(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (typeof value === 'object') {
        const keys = Object.keys(value).filter(k => value[k] !== null && value[k] !== undefined).sort();
        return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
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

    // ─── Local Data Adoption (Orphan & Restored Backups) ───────────

    async claimOrphanLocalData(userId: string): Promise<void> {
        const db = await getDB();

        // Verificación rápida: si no hay registros con 'local_user' o user_id nulo, omitir updates
        const check = await db.getFirstAsync<{ count: number }>(
            `SELECT (
                (SELECT count(*) FROM reminders WHERE (user_id IS NULL OR user_id = 'local_user') AND (is_shared IS NULL OR is_shared = 0) AND (shared_owner_id IS NULL OR shared_owner_id = '') LIMIT 1) +
                (SELECT count(*) FROM events WHERE (user_id IS NULL OR user_id = 'local_user') AND (is_shared IS NULL OR is_shared = 0) AND (shared_owner_id IS NULL OR shared_owner_id = '') LIMIT 1) +
                (SELECT count(*) FROM notes WHERE (user_id IS NULL OR user_id = 'local_user') AND (is_shared IS NULL OR is_shared = 0) AND (shared_owner_id IS NULL OR shared_owner_id = '') LIMIT 1) +
                (SELECT count(*) FROM folders WHERE (user_id IS NULL OR user_id = 'local_user') AND (is_shared IS NULL OR is_shared = 0) AND (shared_owner_id IS NULL OR shared_owner_id = '') LIMIT 1)
             ) as count`
        );

        if (!check || check.count === 0) {
            return;
        }

        const now = Date.now();
        await withSerializedTransaction(db, async () => {
            await db.runAsync(
                `UPDATE reminders SET user_id = ?, last_modified_ms = COALESCE(last_modified_ms, ?) WHERE (user_id IS NULL OR user_id = 'local_user') AND (is_shared IS NULL OR is_shared = 0) AND (shared_owner_id IS NULL OR shared_owner_id = '')`,
                [userId, now]
            );
            await db.runAsync(
                `UPDATE events SET user_id = ?, last_modified_ms = COALESCE(last_modified_ms, ?) WHERE (user_id IS NULL OR user_id = 'local_user') AND (is_shared IS NULL OR is_shared = 0) AND (shared_owner_id IS NULL OR shared_owner_id = '')`,
                [userId, now]
            );
            await db.runAsync(
                `UPDATE notes SET user_id = ?, last_modified_ms = COALESCE(last_modified_ms, ?) WHERE (user_id IS NULL OR user_id = 'local_user') AND (is_shared IS NULL OR is_shared = 0) AND (shared_owner_id IS NULL OR shared_owner_id = '')`,
                [userId, now]
            );
            await db.runAsync(
                `UPDATE folders SET user_id = ?, last_modified_ms = COALESCE(last_modified_ms, ?) WHERE (user_id IS NULL OR user_id = 'local_user') AND (is_shared IS NULL OR is_shared = 0) AND (shared_owner_id IS NULL OR shared_owner_id = '')`,
                [userId, now]
            );
        });
    },

    // ─── Full Sync ──────────────────────────────────────────────────

    async syncAll(userId: string, isInitialLogin = false): Promise<{ success: boolean; errors: string[] }> {
        // Verificar conectividad de red antes de sincronizar
        try {
            const netState = await NetInfo.fetch();
            if (netState && netState.isConnected === false) {
                console.log('[Sync] Dispositivo sin conexión a internet. Omitiendo sincronización remota.');
                return { success: true, errors: [] };
            }
        } catch {}

        const errors: string[] = [];
        const syncStart = Date.now();

        // 0. Reclamar datos locales / restaurados huérfanos para asignarlos al usuario autenticado
        try {
            await this.claimOrphanLocalData(userId);
        } catch (claimErr: any) {
            console.warn('[Sync] Could not claim orphan local data:', claimErr);
        }

        // 1. Sincronización prioritaria y secuencial de entidades de datos hacia/desde SQLite.
        // Refrescamos cada store de Zustand tan pronto termina su entidad para que la UI
        // muestre recordatorios, carpetas, notas, eventos y tags en ~1s sin esperar al final de syncAll.
        const entities: Array<{ name: string; fn: () => Promise<void>; onDone?: () => void; timeout: number }> = [
            {
                name: 'Reminders',
                fn: () => this.syncReminders(userId, isInitialLogin),
                onDone: () => {
                    syncStoreHandlers.loadReminders?.().catch(() => {});
                },
                timeout: 15000,
            },
            {
                name: 'Folders',
                fn: () => this.syncFolders(userId, isInitialLogin),
                onDone: () => {
                    syncStoreHandlers.loadFolders?.().catch(() => {});
                },
                timeout: 12000,
            },
            {
                name: 'Notes',
                fn: () => this.syncNotes(userId, isInitialLogin),
                onDone: () => {
                    syncStoreHandlers.loadNotes?.().catch(() => {});
                },
                timeout: 20000,
            },
            {
                name: 'Events',
                fn: () => this.syncEvents(userId, isInitialLogin),
                onDone: () => {
                    syncStoreHandlers.loadAllEvents?.().catch(() => {});
                },
                timeout: 15000,
            },
            {
                name: 'Compliance',
                fn: () => this.syncComplianceEvents(userId),
                onDone: () => {
                    syncStoreHandlers.loadStreak?.().catch(() => {});
                },
                timeout: 10000,
            },
            {
                name: 'Tags',
                fn: () => this.syncTags(userId, isInitialLogin),
                onDone: () => {
                    notifyTagsChanged();
                    syncStoreHandlers.loadTags?.().catch(() => {});
                },
                timeout: 12000,
            },
        ];

        const tData = Date.now();
        for (const entity of entities) {
            const tEntity = Date.now();
            try {
                await withTimeout(entity.fn(), entity.timeout, `${entity.name} timeout (${entity.timeout / 1000}s)`);
                console.log(`[Sync] ${entity.name} synchronized successfully (${Date.now() - tEntity}ms)`);
                entity.onDone?.();
            } catch (err: any) {
                console.warn(`[Sync] ${entity.name} sync notice:`, err?.message || err);
                errors.push(`${entity.name}: ${err?.message || 'Error'}`);
            }
        }
        console.log(`[Sync] Data entities sync took ${Date.now() - tData}ms`);

        // Actualizar widgets una sola vez tras concluir las entidades de datos
        WidgetService.syncAll().catch((widgetErr) => {
            console.warn('[Sync] Error sincronizando con el widget de Android:', widgetErr);
        });

        // 2. Sincronización de perfil y ajustes después de los datos (no bloquea la carga de notas/recordatorios)
        const tProfile = Date.now();
        try {
            await withTimeout(this.syncProfile(userId, isInitialLogin), 6000, 'syncProfile timeout (6s)');
            console.log(`[Sync] Profile sync step took ${Date.now() - tProfile}ms`);
        } catch (e: any) {
            console.warn('[Sync] Profile/settings sync notice (non-fatal):', e?.message || e);
        }

        // 3. Sync de archivos multimedia en segundo plano (fire-and-forget para no demorar el sync de datos)
        setTimeout(() => {
            this.syncAttachmentFiles(userId).catch((e: any) => {
                console.warn('[Sync] Sync files notice:', e?.message || e);
            });
        }, 2500);

        // 4. Asegurar que los datos nuevos o sincronizados se indexen en el buscador en segundo plano diferido
        setTimeout(() => {
            SearchService.ensureIndexWarm().catch((e: any) => {
                console.warn('[Sync] Search index warm notice:', e?.message || e);
            });
        }, 6000);

        if (errors.length === 0) {
            await this.setLastSyncTime(`${userId}_last_full_sync`, syncStart);
        }

        console.log(`[Sync] Completed in ${Date.now() - syncStart}ms. Errors: ${errors.length}`);
        return { success: errors.length === 0, errors };
    },

    // ─── Profile & Settings Sync ────────────────────────────────────

    async syncProfile(userId: string, isInitialLogin = false): Promise<void> {
        // 1. Obtener perfil remoto de la tabla profiles con timeout resiliente
        const { data: remoteProfile, error } = await withTimeout<any>(
            Promise.resolve(supabase.from('profiles').select('*').eq('id', userId).maybeSingle()),
            5000,
            'Profiles select timeout'
        ).catch(() => ({ data: null, error: null }));

        if (error && (error as any).code !== 'PGRST116') {
            console.warn('[Sync] Profile query warning:', (error as any).message);
        }

        const store = syncStoreHandlers.getMainStoreState?.();
        if (!store) return;

        // 2. Obtener metadatos de usuario (primero desde la sesión en memoria para evitar llamadas redundantes a Auth)
        let userData = store.session?.user;
        let metaSettings = userData?.user_metadata?.settings;

        if (!metaSettings && !userData) {
            try {
                const authRes = await withTimeout(supabase.auth.getUser(), 4000, 'auth.getUser timeout');
                userData = authRes.data?.user as any;
                metaSettings = userData?.user_metadata?.settings;
            } catch (authErr) {
                console.warn('[Sync] Could not fetch auth user:', authErr);
            }
        }

        if (isInitialLogin || !store.userProfile) {
            // Si es login inicial, restaurar los ajustes desde la nube
            if (remoteProfile) {
                if (remoteProfile.user_profile) {
                    store.setUserProfile(remoteProfile.user_profile);
                }
                if (remoteProfile.default_control_level) {
                    store.setDefaultControlLevel(remoteProfile.default_control_level);
                }
                const authEmail = userData?.email || store.session?.user?.email;
                const isOwner = isWhitelistedPremiumEmail(authEmail);
                if (isOwner) {
                    store.setPremium(true);
                } else if (remoteProfile?.is_premium !== undefined) {
                    store.setPremium(Boolean(remoteProfile.is_premium));
                } else {
                    store.setPremium(false);
                }
                if (remoteProfile.onboarding_completed) {
                    syncStoreHandlers.setMainStoreState?.({ onboardingCompleted: true });
                }
            }

            if (metaSettings) {
                if (metaSettings.theme) {
                    syncStoreHandlers.setMainStoreState?.({ theme: metaSettings.theme });
                }
                // IMPORTANTE: al RESTAURAR desde la nube no usamos setAmoledEnabled/setAccentTheme,
                // porque esos setters vuelven a escribir en la nube (auth.updateUser). Cada updateUser
                // retiene el lock interno de supabase-auth (que serializa TODAS las peticiones REST)
                // y dispara USER_UPDATED → setSession → re-registro de push token, en cascada.
                const cloudAmoled = metaSettings?.amoledEnabled ?? userData?.user_metadata?.amoledEnabled;
                if (typeof cloudAmoled === 'boolean' && cloudAmoled !== store.amoledEnabled) {
                    syncStoreHandlers.setMainStoreState?.({ amoledEnabled: cloudAmoled });
                }
                const cloudAccent = metaSettings?.accentTheme || userData?.user_metadata?.accentTheme;
                if (cloudAccent && cloudAccent !== store.accentTheme) {
                    syncStoreHandlers.setMainStoreState?.({ accentTheme: cloudAccent });
                }
                if (metaSettings.language && metaSettings.language !== store.language) {
                    store.setLanguage(metaSettings.language);
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
                } else if (userData?.user_metadata?.full_name) {
                    store.setUserName(userData.user_metadata.full_name);
                } else if (userData?.user_metadata?.name) {
                    store.setUserName(userData.user_metadata.name);
                }
            }
        }

        // 3. Subir/sincronizar el perfil actual hacia la nube SOLO si cambió algún campo respecto a remoteProfile
        const currentStore = syncStoreHandlers.getMainStoreState?.();
        if (!currentStore) return;
        const authEmail = userData?.email || currentStore.session?.user?.email;
        const isOwner = isWhitelistedPremiumEmail(authEmail);
        const desiredUserProfile = currentStore.userProfile || 'personal';
        const desiredControlLevel = currentStore.defaultControlLevel;
        const desiredIsPremium = isOwner ? true : (remoteProfile?.is_premium ? true : Boolean(currentStore.isPremium));
        const desiredOnboarding = Boolean(currentStore.onboardingCompleted);

        const hasProfileDiff =
            !remoteProfile ||
            remoteProfile.email !== (authEmail || remoteProfile.email) ||
            remoteProfile.user_profile !== desiredUserProfile ||
            remoteProfile.default_control_level !== desiredControlLevel ||
            Boolean(remoteProfile.is_premium) !== desiredIsPremium ||
            Boolean(remoteProfile.onboarding_completed) !== desiredOnboarding;

        if (hasProfileDiff) {
            const profilePayload: any = {
                id: userId,
                email: authEmail || undefined,
                user_profile: desiredUserProfile,
                default_control_level: desiredControlLevel,
                is_premium: desiredIsPremium,
                onboarding_completed: desiredOnboarding,
                updated_at: new Date().toISOString(),
            };

            await withTimeout<any>(
                Promise.resolve(supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' })),
                5000,
                'Profiles upsert timeout'
            ).catch((err) => console.warn('[Sync] Profile upsert warning:', err));
        }

        // 4. Guardar en user_metadata de Auth y actualizar identidades en segundo plano solo si cambiaron
        (async () => {
            try {
                const currentSettings = {
                    theme: currentStore.theme,
                    amoledEnabled: currentStore.amoledEnabled ?? false,
                    accentTheme: currentStore.accentTheme,
                    language: currentStore.language,
                    soundSettings: currentStore.soundSettings,
                    defaultControlLevel: currentStore.defaultControlLevel,
                    userName: currentStore.userName,
                    userProfile: currentStore.userProfile,
                    homeViewMode: currentStore.homeViewMode,
                };

                const remoteSettings = userData?.user_metadata?.settings;
                // Comparación independiente del orden de claves: Postgres (jsonb) reordena las claves,
                // por lo que JSON.stringify directo SIEMPRE detectaba diferencia y llamaba a
                // auth.updateUser en cada sincronización.
                const hasSettingsDiff = !remoteSettings || stableStringify(remoteSettings) !== stableStringify(currentSettings);
                const hasNameDiff = Boolean(currentStore.userName && userData?.user_metadata?.name !== currentStore.userName);

                if (hasSettingsDiff || hasNameDiff) {
                    await withTimeout(
                        supabase.auth.updateUser({
                            data: {
                                full_name: currentStore.userName || undefined,
                                name: currentStore.userName || undefined,
                                settings: currentSettings,
                            }
                        }),
                        8000,
                        'auth.updateUser timeout'
                    );
                }

                // Solo propagar el nombre a colaboraciones cuando realmente cambió
                if (currentStore.userName && hasNameDiff) {
                    await supabase
                        .from('collaboration_activity')
                        .update({ actor_name: currentStore.userName })
                        .eq('actor_id', userId);

                    const { data: ownedCollabs } = await supabase
                        .from('collaborations')
                        .select('target_type, target_id')
                        .eq('owner_id', userId);

                    if (ownedCollabs && ownedCollabs.length > 0) {
                        const uniqueTargets = new Map<string, string>();
                        for (const oc of ownedCollabs) {
                            if (!uniqueTargets.has(oc.target_id)) {
                                uniqueTargets.set(oc.target_id, oc.target_type);
                                await CollaborationService.ensureActorIdentity(oc.target_type as any, oc.target_id, 'Elemento compartido', true);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[Sync] Background user metadata / identity update notice:', e);
            }
        })();
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
            await withSerializedTransaction(db, async () => {
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

            // Programar notificaciones y alarmas en el dispositivo para los recordatorios pendientes descargados.
            // Se difiere brevemente para no competir con las transacciones SQLite de Folders/Notes/Tags.
            setTimeout(async () => {
                try {
                    const soundSettings = syncStoreHandlers.getMainStoreState?.()?.soundSettings;
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
            }, 3500);
        }

        // 5. Subir cambios locales al servidor
        // 5a. Propios: batch upsert seguro (el usuario es propietario de user_id)
        if (toUpsertRemoteOwn.length > 0) {
            const { error: upsertError } = await supabase
                .from('reminders')
                .upsert(toUpsertRemoteOwn, { onConflict: 'id' });
            if (upsertError && (upsertError.message?.includes('subtasks') || upsertError.message?.includes('event_id') || upsertError.code === 'PGRST204')) {
                const fallbackRemote = toUpsertRemoteOwn.map(({ subtasks, event_id, offset_minutes, ...rest }) => rest);
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
            if (updateErr && (updateErr.message?.includes('subtasks') || updateErr.message?.includes('event_id') || updateErr.code === 'PGRST204')) {
                const { subtasks, event_id, offset_minutes, ...fallbackFields } = updateFields;
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
                CollaborationService.notifyChange({
                    targetType: 'reminder',
                    targetId: local.id,
                    action: local.deleted === 1 ? 'deleted' : 'edited',
                    itemTitle: local.title || 'Recordatorio',
                }).catch(() => {});
            } catch {}
        }

        await this.setLastSyncTime(`${userId}_reminders_sync`, Date.now());
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
            deleted: (local.deleted === 1 || (local.deleted as any) === true) ? 1 : 0,
            deleted_at_ms: local.deleted_at_ms || null,
            notification_ids: parsedNotificationIds,
            attachments: parsedAttachments,
            links: parsedLinks,
            subtasks: parsedSubtasks,
            event_id: local.event_id || null,
            offset_minutes: local.offset_minutes !== undefined && local.offset_minutes !== null ? Number(local.offset_minutes) : null,
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
            remote.event_id || null,
            remote.offset_minutes !== undefined && remote.offset_minutes !== null ? Number(remote.offset_minutes) : null,
        ];

        if (existing) {
            await db.runAsync(
                `UPDATE reminders SET user_id=?, title=?, description=?, due_date_ms=?, snooze_until_ms=?, repeat_rule=?, control_level=?, priority=?, status=?, next_attempt_ms=?, retry_count=?, max_retries=?, last_modified_ms=?, deleted=?, deleted_at_ms=?, notification_ids=?, attachments=?, links=?, subtasks=?, is_shared=?, shared_owner_id=?, event_id=?, offset_minutes=? WHERE id=?`,
                [...params.slice(1), remote.id]
            );
        } else {
            await db.runAsync(
                `INSERT INTO reminders (id, user_id, title, description, due_date_ms, snooze_until_ms, repeat_rule, control_level, priority, status, next_attempt_ms, retry_count, max_retries, last_modified_ms, deleted, deleted_at_ms, notification_ids, attachments, links, subtasks, is_shared, shared_owner_id, event_id, offset_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        const toUpdateRemoteYjsMeta: any[] = [];
        const toUpsertLocal: any[] = [];
        const processedIds = new Set<string>();

        for (const [id, local] of localMap) {
            processedIds.add(id);

            const localModMs = local.last_modified_ms || local.updated_at_ms;
            const remote = remoteMap.get(id);

            // ─── AISLAMIENTO DE CONTENIDO (YJS) ─────────────────────────────
            // En notas 'yjs', el contenido de páginas lo gestiona el subsistema Yjs,
            // pero los metadatos (title, folder_id, event_id, is_pinned, attachments, deleted)
            // sí se sincronizan sin sobrescribir la columna 'content' en PostgreSQL.
            if (local.sync_mode === 'yjs') {
                if (!remote || localModMs > (remote.last_modified_ms || 0)) {
                    toUpdateRemoteYjsMeta.push(local);
                } else if ((remote.last_modified_ms || 0) > localModMs) {
                    toUpsertLocal.push(remote);
                }
                continue;
            }

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
            await withSerializedTransaction(db, async () => {
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

        // 5a-bis. Metadatos de notas Yjs (sin tocar 'content')
        for (const local of toUpdateRemoteYjsMeta) {
            const ownerId = local.shared_owner_id || local.user_id || userId;
            const remoteData = this.localNoteToRemote(local, ownerId);
            const { id, user_id, content, created_at, created_at_ms, ...metaFields } = remoteData;
            if (isSharedItem(local, userId)) {
                delete metaFields.is_pinned;
            }
            if (local.preview_text !== undefined && local.preview_text !== null) {
                (metaFields as any).preview_text = local.preview_text;
            }
            await supabase
                .from('notes')
                .update(metaFields)
                .eq('id', local.id);
        }

        // 5b. Compartidas: update atómico (PATCH) sin user_id para respetar la política RLS
        for (const local of toUpdateRemoteShared) {
            const ownerId = local.shared_owner_id || local.user_id || userId;
            const remoteData = this.localNoteToRemote(local, ownerId);
            const { id, user_id, created_at, created_at_ms, ...updateFields } = remoteData;
            // No sincronizar is_pinned en notas compartidas: fijar es una preferencia de visualización individual
            delete updateFields.is_pinned;
            delete (updateFields as any).sync_mode;
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
            await withSerializedTransaction(db, async () => {
                for (const remote of toUpsertLocal) {
                    await this.upsertLocalEvent(db, remote, userId);
                }
            });

            // Programar notificaciones de eventos descargados de forma diferida para no competir con el resto del sync
            setTimeout(async () => {
                try {
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
            }, 4000);
        }

        // 5a. Propios: batch upsert seguro (el usuario es propietario de user_id)
        if (toUpsertRemoteOwn.length > 0) {
            let { error: upsertErr } = await supabase.from('events').upsert(toUpsertRemoteOwn, { onConflict: 'id' });
            if (upsertErr && (upsertErr.message?.includes('tags') || upsertErr.message?.includes('is_all_day') || upsertErr.message?.includes('folder_id') || upsertErr.code === 'PGRST204')) {
                const fallback = toUpsertRemoteOwn.map(({ tags, is_all_day, all_day_date, timezone, recurrence_rule, recurrence_parent_id, is_birthday_like, category_id, folder_id, ...rest }) => rest);
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

            if (updateErr && (updateErr.message?.includes('tags') || updateErr.message?.includes('is_all_day') || updateErr.message?.includes('folder_id') || updateErr.code === 'PGRST204')) {
                const { tags, is_all_day, all_day_date, timezone, recurrence_rule, recurrence_parent_id, is_birthday_like, category_id, folder_id, ...fallbackFields } = updateFields;
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
            folder_id: local.folder_id || null,
            tags: parsedTags,
            created_at_ms: createdAtMs,
            updated_at_ms: updatedAtMs,
            last_modified_ms: local.last_modified_ms || updatedAtMs,
            deleted: (local.deleted === 1 || (local.deleted as any) === true) ? 1 : 0,
            is_all_day: (local.is_all_day === 1 || (local.is_all_day as any) === true) ? true : false,
            all_day_date: local.all_day_date || null,
            timezone: local.timezone || null,
            recurrence_rule: local.recurrence_rule ? (typeof local.recurrence_rule === 'string' ? local.recurrence_rule : JSON.stringify(local.recurrence_rule)) : null,
            recurrence_parent_id: local.recurrence_parent_id || null,
            is_birthday_like: (local.is_birthday_like === 1 || (local.is_birthday_like as any) === true) ? true : false,
            category_id: local.category_id || null,
        };
    },

    async upsertLocalEvent(db: any, remote: any, userId: string): Promise<void> {
        const existing = await db.getFirstAsync(
            `SELECT id, created_at_ms, updated_at_ms, folder_id FROM events WHERE id = ?`, [remote.id]
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

        const resolvedFolderId = remote.folder_id !== undefined ? (remote.folder_id || null) : (existing?.folder_id || null);

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
            resolvedFolderId,
            tagsJson,
            createdAtMs,
            updatedAtMs,
            remote.last_modified_ms || updatedAtMs,
            remote.deleted ? 1 : 0,
            isShared,
            sharedOwnerId,
            (remote.is_all_day === 1 || remote.is_all_day === true) ? 1 : 0,
            remote.all_day_date || null,
            remote.timezone || null,
            remote.recurrence_rule ? (typeof remote.recurrence_rule === 'string' ? remote.recurrence_rule : JSON.stringify(remote.recurrence_rule)) : null,
            remote.recurrence_parent_id || null,
            (remote.is_birthday_like === 1 || remote.is_birthday_like === true) ? 1 : 0,
            remote.category_id || null,
        ];

        if (existing) {
            await db.runAsync(
                `UPDATE events SET user_id=?, title=?, description=?, start_time_ms=?, end_time_ms=?, repeat_rule=?, location=?, color=?, notification_offset_min=?, notification_offsets=?, notification_ids=?, note_id=?, folder_id=?, tags=?, created_at_ms=?, updated_at_ms=?, last_modified_ms=?, deleted=?, is_shared=?, shared_owner_id=?, is_all_day=?, all_day_date=?, timezone=?, recurrence_rule=?, recurrence_parent_id=?, is_birthday_like=?, category_id=? WHERE id=?`,
                [...params.slice(1), remote.id]
            );
        } else {
            await db.runAsync(
                `INSERT INTO events (id, user_id, title, description, start_time_ms, end_time_ms, repeat_rule, location, color, notification_offset_min, notification_offsets, notification_ids, note_id, folder_id, tags, created_at_ms, updated_at_ms, last_modified_ms, deleted, is_shared, shared_owner_id, is_all_day, all_day_date, timezone, recurrence_rule, recurrence_parent_id, is_birthday_like, category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params
            );
        }
    },

    // ─── Folders Sync ────────────────────────────────────────────────

    async syncFolders(userId: string, isInitialLogin = false): Promise<void> {
        const db = await getDB();
        const syncKey = `${userId}_folders_sync_v2`;
        const lastSync = isInitialLogin ? 0 : await this.getLastSyncTime(syncKey);

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
            console.warn('[Sync] Folders remote query error:', fetchError.message);
            throw fetchError;
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
            await withSerializedTransaction(db, async () => {
                for (const remote of toUpsertLocal) {
                    await this.upsertLocalFolder(db, remote, userId);
                }
            });
        }

        // 5a. Propias: subir primero carpetas raíz y luego subcarpetas para respetar FK parent_id
        if (toUpsertRemoteOwn.length > 0) {
            const rootFolders = toUpsertRemoteOwn.filter(f => !f.parent_id);
            const childFolders = toUpsertRemoteOwn.filter(f => Boolean(f.parent_id));

            if (rootFolders.length > 0) {
                const { error: rootErr } = await supabase
                    .from('folders')
                    .upsert(rootFolders, { onConflict: 'id' });
                if (rootErr) throw rootErr;
            }

            if (childFolders.length > 0) {
                const { error: childErr } = await supabase
                    .from('folders')
                    .upsert(childFolders, { onConflict: 'id' });
                if (childErr) {
                    // Si alguna subcarpeta apunta a un parent_id inexistente en remoto, subir con parent_id nulo como fallback
                    const fallbackChildren = childFolders.map(f => ({ ...f, parent_id: null }));
                    const { error: retryErr } = await supabase
                        .from('folders')
                        .upsert(fallbackChildren, { onConflict: 'id' });
                    if (retryErr) throw retryErr;
                }
            }
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

        await this.setLastSyncTime(syncKey, Date.now());
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
            is_pinned: (local.is_pinned === 1 || (local.is_pinned as any) === true) ? 1 : 0,
            created_at_ms: createdAtMs,
            updated_at_ms: updatedAtMs,
            last_modified_ms: local.last_modified_ms || updatedAtMs,
            deleted: (local.deleted === 1 || (local.deleted as any) === true) ? 1 : 0,
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
            is_pinned: (local.is_pinned === 1 || (local.is_pinned as any) === true) ? 1 : 0,
            attachments: local.attachments ? (typeof local.attachments === 'string' ? JSON.parse(local.attachments) : local.attachments) : [],
            links: local.links ? (typeof local.links === 'string' ? JSON.parse(local.links) : local.links) : [],
            deleted: (local.deleted === 1 || (local.deleted as any) === true) ? 1 : 0,
            last_modified_ms: local.last_modified_ms || updatedAtMs,
            // NOTA: sync_mode SE OMITE INTENCIONALMENTE aquí porque public.notes
            // en Supabase todavía no tiene esa columna en producción en esta fase.
        };
    },

    async upsertLocalNote(db: any, remote: any, userId: string): Promise<void> {
        const existing = (await db.getFirstAsync(
            `SELECT id, created_at_ms, updated_at_ms, is_pinned, is_shared, shared_owner_id, content, sync_mode, preview_text FROM notes WHERE id = ?`, [remote.id]
        )) as (Note & { is_pinned?: number; is_shared?: number; shared_owner_id?: string; content?: string; sync_mode?: any; preview_text?: string | null }) | null;

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

        // ─── AISLAMIENTO FASE 1 (YJS) ───────────────────────────────────
        // Si la nota local ya existe y es 'yjs', blindamos su contenido HTML/JSON
        // y su modo para que un payload REST remoto desactualizado nunca la sobrescriba
        // ni restablezca sync_mode a 'rest'.
        const isLocalYjs = existing?.sync_mode === 'yjs';
        const resolvedContent = isLocalYjs ? (existing?.content ?? null) : (remote.content || null);
        const resolvedSyncMode = isLocalYjs ? 'yjs' : (remote.sync_mode === 'yjs' ? 'yjs' : (existing?.sync_mode || 'rest'));
        const resolvedPreviewText = remote.preview_text
            ? remote.preview_text
            : (resolvedContent ? computeNotePreviewText(resolvedContent) : (existing?.preview_text ?? null));

        const params = [
            remote.id,
            remote.user_id || userId,
            remote.folder_id || null,
            remote.event_id || null,
            remote.title || null,
            resolvedContent,
            createdAtMs,
            updatedAtMs,
            resolvedIsPinned,
            remote.attachments ? (typeof remote.attachments === 'string' ? remote.attachments : JSON.stringify(remote.attachments)) : null,
            remote.links ? (typeof remote.links === 'string' ? remote.links : JSON.stringify(remote.links)) : null,
            remote.deleted ? 1 : 0,
            lastModifiedMs,
            isShared,
            sharedOwnerId,
            resolvedSyncMode,
            resolvedPreviewText,
        ];

        if (existing) {
            await db.runAsync(
                `UPDATE notes SET user_id=?, folder_id=?, event_id=?, title=?, content=?, created_at_ms=?, updated_at_ms=?, is_pinned=?, attachments=?, links=?, deleted=?, last_modified_ms=?, is_shared=?, shared_owner_id=?, sync_mode=?, preview_text=? WHERE id=?`,
                [...params.slice(1), remote.id]
            );
        } else {
            await db.runAsync(
                `INSERT INTO notes (id, user_id, folder_id, event_id, title, content, created_at_ms, updated_at_ms, is_pinned, attachments, links, deleted, last_modified_ms, is_shared, shared_owner_id, sync_mode, preview_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

        await withSerializedTransaction(db, async () => {
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


    // ─── Tags & ItemTags Sync ─────────────────────────────────────────

    async syncTags(userId: string, isInitialLogin = false): Promise<void> {
        const db = await getDB();
        const syncKey = `${userId}_tags_sync_v2`;
        const lastSync = isInitialLogin ? 0 : await this.getLastSyncTime(syncKey);

        const [
            localTags,
            localItemTags,
            remoteTagsRes,
            remoteItemTagsRes,
        ] = await Promise.all([
            db.getAllAsync<{ id: string; name: string; slug: string; color: string | null; created_at: number; updated_at: number }>(
                `SELECT * FROM tags`
            ),
            db.getAllAsync<{ item_type: string; item_id: string; tag_id: string }>(
                `SELECT * FROM item_tags`
            ),
            supabase.from('tags').select('*').eq('user_id', userId),
            supabase.from('item_tags').select('*').eq('user_id', userId),
        ]);

        if (remoteTagsRes.error) {
            console.warn('[Sync] Tags remote query error:', remoteTagsRes.error.message);
            throw remoteTagsRes.error;
        }
        if (remoteItemTagsRes.error) {
            console.warn('[Sync] ItemTags remote query error:', remoteItemTagsRes.error.message);
            throw remoteItemTagsRes.error;
        }

        const remoteTags = remoteTagsRes.data || [];
        const remoteItemTags = remoteItemTagsRes.data || [];

        const remoteTagBySlug = new Map<string, any>();
        remoteTags.forEach((t: any) => remoteTagBySlug.set(t.slug, t));

        const localTagBySlug = new Map<string, any>();
        localTags.forEach(t => localTagBySlug.set(t.slug, t));

        const tagsToUpsertRemote: any[] = [];
        const tagsToInsertLocal: any[] = [];
        const tagsToUpdateLocal: Array<{ localId: string; remoteId: string; name: string; slug: string; color: string | null; created_at: number; updated_at: number }> = [];
        const localToRemoteTagIdMap = new Map<string, string>();

        for (const [slug, local] of localTagBySlug) {
            const remote = remoteTagBySlug.get(slug);
            if (!remote) {
                tagsToUpsertRemote.push({
                    id: local.id,
                    user_id: userId,
                    name: local.name,
                    slug: local.slug,
                    color: local.color || null,
                    created_at: Number(local.created_at) || Date.now(),
                    updated_at: Number(local.updated_at) || Date.now(),
                });
            } else {
                const canonicalId = remote.id;
                if (local.id !== canonicalId) {
                    localToRemoteTagIdMap.set(local.id, canonicalId);
                }

                if (Number(local.updated_at) > (Number(remote.updated_at) || 0)) {
                    tagsToUpsertRemote.push({
                        id: canonicalId,
                        user_id: userId,
                        name: local.name,
                        slug: local.slug,
                        color: local.color || null,
                        created_at: Number(local.created_at) || Number(remote.created_at) || Date.now(),
                        updated_at: Number(local.updated_at) || Date.now(),
                    });
                    if (local.id !== canonicalId) {
                        tagsToUpdateLocal.push({
                            localId: local.id,
                            remoteId: canonicalId,
                            name: local.name,
                            slug: local.slug,
                            color: local.color || null,
                            created_at: Number(local.created_at) || Date.now(),
                            updated_at: Number(local.updated_at) || Date.now(),
                        });
                    }
                } else if ((Number(remote.updated_at) || 0) > Number(local.updated_at) || local.id !== canonicalId) {
                    tagsToUpdateLocal.push({
                        localId: local.id,
                        remoteId: canonicalId,
                        name: remote.name,
                        slug: remote.slug,
                        color: remote.color || null,
                        created_at: Number(remote.created_at) || Date.now(),
                        updated_at: Number(remote.updated_at) || Date.now(),
                    });
                }
            }
        }

        for (const [slug, remote] of remoteTagBySlug) {
            if (!localTagBySlug.has(slug)) {
                tagsToInsertLocal.push(remote);
            }
        }

        // Aplicar cambios de tags en SQLite SIN usar INSERT OR REPLACE (para no disparar ON DELETE CASCADE en item_tags)
        if (tagsToInsertLocal.length > 0 || tagsToUpdateLocal.length > 0) {
            await withSerializedTransaction(db, async () => {
                for (const r of tagsToInsertLocal) {
                    await db.runAsync(
                        `INSERT OR IGNORE INTO tags (id, name, slug, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
                        [r.id, r.name, r.slug, r.color || null, Number(r.created_at) || Date.now(), Number(r.updated_at) || Date.now()]
                    );
                }

                for (const u of tagsToUpdateLocal) {
                    if (u.localId === u.remoteId) {
                        await db.runAsync(
                            `UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ?`,
                            [u.name, u.color, u.updated_at, u.remoteId]
                        );
                    } else {
                        const existingRefs = await db.getAllAsync<{ item_type: string; item_id: string }>(
                            `SELECT item_type, item_id FROM item_tags WHERE tag_id = ?`,
                            [u.localId]
                        );
                        await db.runAsync(`DELETE FROM item_tags WHERE tag_id = ?`, [u.localId]);
                        await db.runAsync(
                            `UPDATE tags SET id = ?, name = ?, color = ?, created_at = ?, updated_at = ? WHERE id = ?`,
                            [u.remoteId, u.name, u.color, u.created_at, u.updated_at, u.localId]
                        );
                        for (const ref of existingRefs) {
                            await db.runAsync(
                                `INSERT OR IGNORE INTO item_tags (item_type, item_id, tag_id) VALUES (?, ?, ?)`,
                                [ref.item_type, ref.item_id, u.remoteId]
                            );
                        }
                    }
                }
            });
        }

        if (tagsToUpsertRemote.length > 0) {
            const { error: upsertTagsErr } = await supabase
                .from('tags')
                .upsert(tagsToUpsertRemote, { onConflict: 'user_id,slug' });
            if (upsertTagsErr) {
                console.warn('[Sync] Error upserting tags to Supabase:', upsertTagsErr.message);
                throw upsertTagsErr;
            }
        }

        // Identificar items (recordatorios y eventos) modificados localmente desde el último sync de tags
        // para que si se quitó un tag localmente, no se vuelva a reinsertar desde remoto.
        const locallyModifiedItems = new Set<string>();
        if (lastSync > 0) {
            const [modRems, modEvs] = await Promise.all([
                db.getAllAsync<{ id: string }>(`SELECT id FROM reminders WHERE last_modified_ms > ?`, [lastSync]),
                db.getAllAsync<{ id: string }>(`SELECT id FROM events WHERE last_modified_ms > ?`, [lastSync]),
            ]);
            modRems.forEach(r => locallyModifiedItems.add(`reminder:${r.id}`));
            modEvs.forEach(e => locallyModifiedItems.add(`event:${e.id}`));
        }

        const validTagIds = new Set<string>();
        localTags.forEach(t => validTagIds.add(localToRemoteTagIdMap.get(t.id) || t.id));
        remoteTags.forEach((t: any) => validTagIds.add(t.id));

        const normalizedLocalItemTags = localItemTags
            .map(it => ({
                item_type: it.item_type,
                item_id: it.item_id,
                tag_id: localToRemoteTagIdMap.get(it.tag_id) || it.tag_id,
            }))
            .filter(it => validTagIds.has(it.tag_id));

        const remoteItemTagSet = new Set<string>();
        remoteItemTags.forEach((it: any) => remoteItemTagSet.add(`${it.item_type}:${it.item_id}:${it.tag_id}`));

        const localItemTagSet = new Set<string>();
        normalizedLocalItemTags.forEach(it => localItemTagSet.add(`${it.item_type}:${it.item_id}:${it.tag_id}`));

        const itemTagsToRemote: any[] = [];
        for (const it of normalizedLocalItemTags) {
            const key = `${it.item_type}:${it.item_id}:${it.tag_id}`;
            if (!remoteItemTagSet.has(key)) {
                itemTagsToRemote.push({
                    user_id: userId,
                    item_type: it.item_type,
                    item_id: it.item_id,
                    tag_id: it.tag_id,
                });
            }
        }

        const itemTagsToLocal: any[] = [];
        const itemTagsToDeleteRemote: any[] = [];
        for (const it of remoteItemTags) {
            const key = `${it.item_type}:${it.item_id}:${it.tag_id}`;
            if (!localItemTagSet.has(key) && validTagIds.has(it.tag_id)) {
                if (locallyModifiedItems.has(`${it.item_type}:${it.item_id}`)) {
                    itemTagsToDeleteRemote.push(it);
                } else {
                    itemTagsToLocal.push(it);
                }
            }
        }

        if (itemTagsToLocal.length > 0) {
            await withSerializedTransaction(db, async () => {
                for (const it of itemTagsToLocal) {
                    await db.runAsync(
                        `INSERT OR IGNORE INTO item_tags (item_type, item_id, tag_id) VALUES (?, ?, ?)`,
                        [it.item_type, it.item_id, it.tag_id]
                    );
                }
            });
        }

        if (itemTagsToDeleteRemote.length > 0) {
            for (const it of itemTagsToDeleteRemote) {
                await supabase
                    .from('item_tags')
                    .delete()
                    .eq('item_type', it.item_type)
                    .eq('item_id', it.item_id)
                    .eq('tag_id', it.tag_id);
            }
        }

        if (itemTagsToRemote.length > 0) {
            const { error: itemTagUpsertErr } = await supabase
                .from('item_tags')
                .upsert(itemTagsToRemote, { onConflict: 'item_type,item_id,tag_id' });
            if (itemTagUpsertErr) {
                console.warn('[Sync] Error upserting item_tags to Supabase:', itemTagUpsertErr.message);
                throw itemTagUpsertErr;
            }
        }

        await this.setLastSyncTime(syncKey, Date.now());
    },

    // ─── Files Sync ─────────────────────────────────────────────────

    /**
     * Recorre todos los reminders y notes locales que tengan attachments
     * con URIs locales (file://) y los sube a Supabase Storage.
     * Luego actualiza la referencia local con el remotePath.
     */
    async syncAttachmentFiles(userId: string): Promise<void> {
        const db = await getDB();

        // 1. Procesar attachments de reminders activos
        const remindersWithAttachments = await db.getAllAsync<{ id: string; attachments: string }>(
            `SELECT id, attachments FROM reminders WHERE deleted = 0 AND attachments IS NOT NULL AND attachments != '[]' AND attachments != '"[]"' AND user_id = ?`,
            [userId]
        );

        for (const row of remindersWithAttachments) {
            try {
                let atts: any;
                try {
                    atts = JSON.parse(row.attachments);
                    if (typeof atts === 'string') atts = JSON.parse(atts);
                } catch {
                    continue;
                }
                if (!Array.isArray(atts) || atts.length === 0) continue;

                const hasLocalFiles = atts.some((a: any) =>
                    a && typeof a === 'object' && a.uri && typeof a.uri === 'string' && (a.uri.startsWith('file://') || a.uri.startsWith('/')) && !a.remotePath
                );

                if (hasLocalFiles) {
                    const updated = await StorageService.uploadAttachments(userId, atts);
                    const updatedJson = JSON.stringify(updated);
                    if (updatedJson !== row.attachments) {
                        await db.runAsync(
                            `UPDATE reminders SET attachments = ? WHERE id = ?`,
                            [updatedJson, row.id]
                        );
                        await supabase.from('reminders').update({
                            attachments: updated
                        }).eq('id', row.id);
                    }
                }
            } catch (e) {
                console.warn(`[Sync] Error uploading reminder attachments ${row.id}:`, e);
            }
        }

        // 2. Procesar attachments de notes activas
        const notesWithAttachments = await db.getAllAsync<{ id: string; attachments: string }>(
            `SELECT id, attachments FROM notes WHERE deleted = 0 AND attachments IS NOT NULL AND attachments != '[]' AND attachments != '"[]"' AND (user_id = ? OR user_id IS NULL)`,
            [userId]
        );

        for (const row of notesWithAttachments) {
            try {
                let atts: any;
                try {
                    atts = JSON.parse(row.attachments);
                    if (typeof atts === 'string') atts = JSON.parse(atts);
                } catch {
                    continue;
                }
                if (!Array.isArray(atts) || atts.length === 0) continue;

                const hasLocalFiles = atts.some((a: any) =>
                    a && typeof a === 'object' && a.uri && typeof a.uri === 'string' && (a.uri.startsWith('file://') || a.uri.startsWith('/')) && !a.remotePath
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

        // 3. Descargar archivos remotos que faltan localmente (solo registros activos)
        const allWithRemotePaths = await db.getAllAsync<{ id: string; attachments: string; item_type: 'reminder' | 'note' }>(
            `SELECT id, attachments, 'reminder' as item_type FROM reminders WHERE deleted = 0 AND attachments LIKE '%remotePath%' AND attachments NOT LIKE '%remoteNotFound%' AND user_id = ?
             UNION ALL
             SELECT id, attachments, 'note' as item_type FROM notes WHERE deleted = 0 AND attachments LIKE '%remotePath%' AND attachments NOT LIKE '%remoteNotFound%' AND (user_id = ? OR user_id IS NULL)`,
            [userId, userId]
        );

        // Procesar un máximo de 5 filas por ciclo para no saturar la red ni la sincronización
        const rowsToProcess = allWithRemotePaths.slice(0, 5);

        for (const row of rowsToProcess) {
            try {
                let atts: any;
                try {
                    atts = JSON.parse(row.attachments);
                    if (typeof atts === 'string') atts = JSON.parse(atts);
                } catch {
                    continue;
                }
                if (!Array.isArray(atts) || atts.length === 0) continue;

                const downloaded = await StorageService.downloadAttachments(atts);
                const downloadedJson = JSON.stringify(downloaded);
                if (downloadedJson !== row.attachments) {
                    if (row.item_type === 'reminder') {
                        await db.runAsync(
                            `UPDATE reminders SET attachments = ? WHERE id = ?`,
                            [downloadedJson, row.id]
                        );
                    } else {
                        await db.runAsync(
                            `UPDATE notes SET attachments = ? WHERE id = ?`,
                            [downloadedJson, row.id]
                        );
                    }
                }
            } catch (e) {
                console.warn(`[Sync] Error downloading attachments for ${row.id}:`, e);
            }
        }
    },

    /**
     * Sincronización parcial liviana de preview_text y updated_at_ms para notas en modo 'yjs'.
     * Permite reflejar cambios remotos en la lista de notas e indicar actualizaciones no leídas (•)
     * sin descargar documentos Yjs completos ni interferir con el subsistema colaborativo.
     */
    async syncYjsNotesPreview(userId?: string): Promise<boolean> {
        try {
            const db = await getDB();
            const syncKey = userId ? `${userId}_yjs_preview_sync` : 'yjs_preview_sync';
            const lastSync = await this.getLastSyncTime(syncKey);
            const syncStart = Date.now();

            let query = supabase
                .from('notes')
                .select('id, preview_text, updated_at_ms, last_modified_ms')
                .eq('sync_mode', 'yjs');

            if (lastSync > 0) {
                query = query.gt('last_modified_ms', lastSync);
            }

            const { data: remoteNotes, error } = await query;
            if (error) {
                console.warn('[Sync] Error consultando preview_text de notas Yjs:', error.message);
                return false;
            }

            if (!remoteNotes || remoteNotes.length === 0) {
                await this.setLastSyncTime(syncKey, syncStart);
                return false;
            }

            let hasChanges = false;
            await withSerializedTransaction(db, async () => {
                for (const remote of remoteNotes) {
                    if (!remote.id) continue;
                    const updatedAt = remote.updated_at_ms || remote.last_modified_ms || syncStart;
                    if (remote.preview_text !== null && remote.preview_text !== undefined) {
                        await db.runAsync(
                            `UPDATE notes SET preview_text = ?, updated_at_ms = ? WHERE id = ?`,
                            [remote.preview_text, updatedAt, remote.id]
                        );
                    } else {
                        await db.runAsync(
                            `UPDATE notes SET updated_at_ms = ? WHERE id = ?`,
                            [updatedAt, remote.id]
                        );
                    }
                    hasChanges = true;
                }
            });

            await this.setLastSyncTime(syncKey, syncStart);

            if (hasChanges) {
                await syncStoreHandlers.loadNotes?.();
            }

            return hasChanges;
        } catch (err: any) {
            console.warn('[Sync] Error en syncYjsNotesPreview:', err.message);
            return false;
        }
    },
};
