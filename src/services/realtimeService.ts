import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { getDB } from '../db';
import { SyncService } from './syncService';
import { NotificationService } from './notificationService';
import { useStore } from '../store/useStore';
import { useNotesStore } from '../store/useNotesStore';
import { useFoldersStore } from '../store/useFoldersStore';
import { useEventsStore } from '../store/useEventsStore';

class RealtimeServiceManager {
    private channel: RealtimeChannel | null = null;
    private currentUserId: string | null = null;

    /**
     * Inicia la escucha en tiempo real de cambios en Supabase Realtime
     * para reminders, notes, folders y events.
     */
    startListening(userId: string) {
        if (!userId) return;

        // Evitar suscripciones duplicadas
        if (this.channel && this.currentUserId === userId) {
            return;
        }

        this.stopListening();
        this.currentUserId = userId;

        console.log(`[RealtimeService] 🚀 Iniciando suscripción Realtime para usuario: ${userId}`);

        this.channel = supabase
            .channel(`collab_sync_${userId}`)
            // ─── 1. REMINDERS ──────────────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'reminders' },
                async (payload) => {
                    console.log(`[RealtimeService] 🔔 Cambio en reminders: ${payload.eventType}`);
                    try {
                        const db = await getDB();
                        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                            const remote = payload.new;
                            // Actualizar SQLite local
                            await SyncService.upsertLocalReminder(db, remote, this.currentUserId!);

                            // Si se marcó como completado por otro usuario, cancelar alarma local
                            if (remote.status === 'completed') {
                                try {
                                    const notifIds = remote.notification_ids ? JSON.parse(remote.notification_ids) : undefined;
                                    await NotificationService.cancelNotificationsForReminder(remote.id, notifIds);
                                } catch (e) {
                                    // Silenciar
                                }
                            }

                            // Refrescar store de Zustand en memoria (UI instantánea)
                            await useStore.getState().loadReminders();
                        } else if (payload.eventType === 'DELETE') {
                            const oldRecord = payload.old;
                            if (oldRecord?.id) {
                                await db.runAsync('UPDATE reminders SET deleted = 1 WHERE id = ?', [oldRecord.id]);
                                await useStore.getState().loadReminders();
                            }
                        }
                    } catch (err) {
                        console.warn('[RealtimeService] Error procesando cambio de reminder:', err);
                    }
                }
            )
            // ─── 2. NOTES ──────────────────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'notes' },
                async (payload) => {
                    console.log(`[RealtimeService] 🔔 Cambio en notes: ${payload.eventType}`);
                    try {
                        const db = await getDB();
                        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                            await SyncService.upsertLocalNote(db, payload.new, this.currentUserId!);
                            await useNotesStore.getState().loadNotes();
                        } else if (payload.eventType === 'DELETE') {
                            const oldRecord = payload.old;
                            if (oldRecord?.id) {
                                await db.runAsync('UPDATE notes SET deleted = 1 WHERE id = ?', [oldRecord.id]);
                                await useNotesStore.getState().loadNotes();
                            }
                        }
                    } catch (err) {
                        console.warn('[RealtimeService] Error procesando cambio de note:', err);
                    }
                }
            )
            // ─── 3. FOLDERS ────────────────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'folders' },
                async (payload) => {
                    console.log(`[RealtimeService] 🔔 Cambio en folders: ${payload.eventType}`);
                    try {
                        const db = await getDB();
                        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                            await SyncService.upsertLocalFolder(db, payload.new, this.currentUserId!);
                            await useFoldersStore.getState().loadFolders();
                        } else if (payload.eventType === 'DELETE') {
                            const oldRecord = payload.old;
                            if (oldRecord?.id) {
                                await db.runAsync('UPDATE folders SET deleted = 1 WHERE id = ?', [oldRecord.id]);
                                await useFoldersStore.getState().loadFolders();
                            }
                        }
                    } catch (err) {
                        console.warn('[RealtimeService] Error procesando cambio de folder:', err);
                    }
                }
            )
            // ─── 4. EVENTS ─────────────────────────────────────────────
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'events' },
                async (payload) => {
                    console.log(`[RealtimeService] 🔔 Cambio en events: ${payload.eventType}`);
                    try {
                        const db = await getDB();
                        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                            await SyncService.upsertLocalEvent(db, payload.new, this.currentUserId!);
                            await useEventsStore.getState().loadAllEvents();
                        } else if (payload.eventType === 'DELETE') {
                            const oldRecord = payload.old;
                            if (oldRecord?.id) {
                                await db.runAsync('UPDATE events SET deleted = 1 WHERE id = ?', [oldRecord.id]);
                                await useEventsStore.getState().loadAllEvents();
                            }
                        }
                    } catch (err) {
                        console.warn('[RealtimeService] Error procesando cambio de event:', err);
                    }
                }
            )
            .subscribe((status) => {
                console.log(`[RealtimeService] Estado del canal colaborativo: ${status}`);
            });
    }

    /**
     * Detiene la escucha activa y libera el WebSocket.
     */
    stopListening() {
        if (this.channel) {
            console.log('[RealtimeService] Deteniendo suscripción Realtime...');
            supabase.removeChannel(this.channel).catch(() => {});
            this.channel = null;
            this.currentUserId = null;
        }
    }
}

export const RealtimeService = new RealtimeServiceManager();
