import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { withDB } from '../db';
import { WidgetService } from './widgetService';
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

            // 2. Si el usuario está autenticado en Supabase, eliminar datos en la nube
            if (userId) {
                console.log(`[AccountDeletion] 🗑️ Iniciando eliminación de cuenta remota para usuario: ${userId}`);

                // Intentar mediante la función RPC delete_user_account() (si fue creada en Supabase)
                const { error: rpcError } = await supabase.rpc('delete_user_account');

                if (rpcError) {
                    console.warn('[AccountDeletion] RPC delete_user_account no disponible o falló, borrando tablas manualmente:', rpcError.message);
                    
                    // Fallback directo a borrar los registros del usuario en cada tabla pública
                    await Promise.allSettled([
                        supabase.from('reminders').delete().eq('user_id', userId),
                        supabase.from('notes').delete().eq('user_id', userId),
                        supabase.from('folders').delete().eq('user_id', userId),
                        supabase.from('events').delete().eq('user_id', userId),
                        supabase.from('compliance_events').delete().eq('user_id', userId),
                        supabase.from('profiles').delete().eq('id', userId),
                    ]);
                }

                // Cerrar sesión en el cliente de autenticación de Supabase
                try {
                    await supabase.auth.signOut();
                } catch (e) {
                    console.warn('[AccountDeletion] Error en auth.signOut post-borrado:', e);
                }

                cloudDeleted = true;
            } else {
                cloudDeleted = true; // No había cuenta remota conectada, era modo invitado local
            }

            // 3. Cancelar todas las notificaciones locales y alarmas
            try {
                await Notifications.cancelAllScheduledNotificationsAsync();
                notificationsCancelled = true;
            } catch (err) {
                console.warn('[AccountDeletion] Advertencia al cancelar notificaciones:', err);
            }

            // 4. Purgar todas las tablas de la base de datos local SQLite
            try {
                await withDB(async (db) => {
                    await db.execAsync(`
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
                streak: 0,
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
                    k.includes('supabase') || 
                    k.includes('sync') || 
                    k.includes('auth') ||
                    k.includes('user')
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
