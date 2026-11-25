import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { withDB } from '../db';
import { WidgetService } from './widgetService';
import { VeyraAlarm } from './veyraAlarm';
import { useStore } from '../store/useStore';
import { useNotesStore } from '../store/useNotesStore';
import { useFoldersStore } from '../store/useFoldersStore';
import { useEventsStore } from '../store/useEventsStore';

export interface DeletionResult {
    success: boolean;
    error?: string;
    details?: {
        cloudDeleted: boolean;
        localPurged: boolean;
        notificationsCancelled: boolean;
    };
}

export const AccountDeletionService = {
    /**
     * Elimina permanentemente la cuenta del usuario, tanto en la nube (Supabase)
     * como en el almacenamiento local del dispositivo (SQLite + AsyncStorage + Widgets),
     * cancelando todas las notificaciones y alarmas programadas.
     * 
     * Requisito obligatorio para Google Play Store y Apple App Store.
     */
    async deleteAccountAndData(): Promise<DeletionResult> {
        let cloudDeleted = false;
        let localPurged = false;
        let notificationsCancelled = false;

        try {
            // 1. Obtener la sesión activa si existe
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id;

            // 2. Si el usuario está autenticado en Supabase, eliminar datos en la nube vía RPC atómica
            if (userId) {
                console.log(`[AccountDeletion] 🗑️ Iniciando eliminación de cuenta remota para usuario: ${userId}`);

                const { error: rpcError } = await supabase.rpc('delete_user_account');
                if (rpcError) {
                    console.error('[AccountDeletion] ❌ Error en RPC delete_user_account:', rpcError.message);
                    return {
                        success: false,
                        error: rpcError.message || 'No se pudo eliminar la cuenta en el servidor.',
                        details: {
                            cloudDeleted: false,
                            localPurged: false,
                            notificationsCancelled: false,
                        },
                    };
                }

                // Cerrar sesión local tras confirmación exitosa del borrado remoto
                try {
                    await supabase.auth.signOut();
                } catch (e) {
                    console.warn('[AccountDeletion] Error en auth.signOut post-borrado:', e);
                }

                cloudDeleted = true;
            } else {
                cloudDeleted = true; // No había cuenta remota conectada, era modo invitado local
            }

            // 3. Cancelar alarmas nativas (AlarmManager) y notificaciones locales programadas
            try {
                if (VeyraAlarm.isAvailable()) {
                    let reminderIds: string[] = [];
                    await withDB(async (db) => {
                        const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM reminders');
                        reminderIds = rows.map((r) => r.id).filter(Boolean);
                    });
                    await Promise.allSettled(reminderIds.map((id) => VeyraAlarm.cancel(id)));
                }
                await Notifications.cancelAllScheduledNotificationsAsync();
                notificationsCancelled = true;
            } catch (err) {
                console.warn('[AccountDeletion] Advertencia al cancelar notificaciones/alarmas:', err);
            }

            // 4. Purgar todas las tablas de la base de datos local SQLite (incluyendo Yjs y caché de búsqueda)
            try {
                await withDB(async (db) => {
                    await db.execAsync(`
                        DELETE FROM yjs_note_updates;
                        DELETE FROM yjs_note_snapshots;
                        DELETE FROM pending_image_uploads;
                        DELETE FROM search_index;
                        DELETE FROM item_tags;
                        DELETE FROM tags;
                        DELETE FROM reminders;
                        DELETE FROM compliance_events;
                        DELETE FROM notification_attempts;
                        DELETE FROM folders;
                        DELETE FROM notes;
                        DELETE FROM events;
                        DELETE FROM sync_metadata;
                        DELETE FROM users;
                    `);
                });
                localPurged = true;
            } catch (dbErr) {
                console.error('[AccountDeletion] Error purgando SQLite:', dbErr);
                throw dbErr;
            }

            // 4b. Limpiar cachés de archivos locales (cloud_cache, veyra-yjs-*)
            try {
                const dirs = [FileSystem.cacheDirectory, FileSystem.documentDirectory].filter(
                    (d): d is string => Boolean(d)
                );
                for (const baseDir of dirs) {
                    const entries = await FileSystem.readDirectoryAsync(baseDir).catch(() => [] as string[]);
                    for (const entry of entries) {
                        if (entry === 'cloud_cache' || entry.startsWith('veyra-yjs-') || entry === 'images') {
                            await FileSystem.deleteAsync(`${baseDir}${entry}`, { idempotent: true }).catch(() => {});
                        }
                    }
                }
            } catch (fsErr) {
                console.warn('[AccountDeletion] FileSystem cleanup warning:', fsErr);
            }

            // 5. Restablecer los estados de los stores en memoria (Zustand)
            useStore.setState({
                reminders: [],
                history: [],
                session: null,
                userEmail: null,
                userName: null,
                userAvatar: null,
                isPremium: false,
                lastSyncTime: null,
                isSyncing: false,
                syncError: null,
            });

            useNotesStore.setState({
                notes: [],
                deletedNotes: [],
                selectedNote: null,
                selectedNotesIds: [],
                isNotesDirty: true,
            });

            useFoldersStore.setState({
                folders: [],
                folderStack: [],
                currentParentId: null,
                activeFolderId: 'all',
                selectedFolderIds: [],
                isFoldersDirty: true,
            });

            useEventsStore.setState({
                events: [],
                eventsForSelectedDate: [],
                isEventsDirty: true,
            });

            // 6. Limpiar widgets en Android
            try {
                await WidgetService.syncAgenda([], []);
                await WidgetService.syncNotes([]);
            } catch (widgetErr) {
                console.warn('[AccountDeletion] Widget clear note:', widgetErr);
            }

            // 7. Limpiar almacenamiento de AsyncStorage relacionado con usuario y sincronización
            try {
                const keys = await AsyncStorage.getAllKeys();
                const keysToRemove = keys.filter(k => 
                    k.includes('veyra') || 
                    k.includes('yjs') ||
                    k.includes('supabase') || 
                    k.includes('sync') || 
                    k.includes('auth') ||
                    k.includes('user') ||
                    k === 'app-storage'
                );
                if (keysToRemove.length > 0) {
                    await AsyncStorage.multiRemove(keysToRemove);
                }
            } catch (storageErr) {
                console.warn('[AccountDeletion] AsyncStorage clear warning:', storageErr);
            }

            return {
                success: true,
                details: {
                    cloudDeleted,
                    localPurged,
                    notificationsCancelled,
                },
            };
        } catch (error: any) {
            console.error('[AccountDeletion] ❌ Error crítico durante la eliminación de cuenta:', error);
            return {
                success: false,
                error: error?.message || 'Error desconocido al eliminar los datos de la cuenta.',
                details: {
                    cloudDeleted,
                    localPurged,
                    notificationsCancelled,
                },
            };
        }
    },
};
