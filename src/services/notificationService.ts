import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Reminder, ControlLevel, CalendarEvent } from '../types/db';
import { Platform } from 'react-native';
import { format } from 'date-fns';
import { getSoundName } from '../constants/sounds';
import i18n from '../lib/i18n';
import { VeyraAlarm } from './veyraAlarm';
import { getDB } from '../db';
import { supabase } from '../lib/supabase';
import { expandOccurrences } from './recurrence/recurrenceEngine';

export const DEFAULT_SOUND_SETTINGS = {
    normal: 'ping_brillante.wav',
    critical: 'alarma_fuego.mp3',
};

const stripHtml = (html: string) => {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '').trim();
};

const stripExtension = (filename: string): string => {
    if (!filename) return '';
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.substring(0, lastDot) : filename;
};

export const CURRENT_CHANNEL_VERSION = 'v7';

let isHandlerInitialized = false;

export const NotificationService = {
    async setup() {
        if (isHandlerInitialized) return;
        isHandlerInitialized = true;
        console.log('[NotificationService] 🚀 Inicializando NotificationHandler');
        Notifications.setNotificationHandler({
            handleNotification: async (notification) => {
                console.log(`[NotificationService] 🔔 Notificación recibida en primer plano: [${notification.request.identifier}] "${notification.request.content.title}"`);
                return {
                    shouldShowAlert: true,
                    shouldShowBanner: true,
                    shouldShowList: true,
                    shouldPlaySound: true,
                    shouldSetBadge: true,
                };
            },
        });
    },

    /**
     * Asegura la creación del canal de notificación dinámico en Android
     * según el nivel de control y el archivo de sonido elegido.
     */
    async ensureChannel(level: ControlLevel, soundFilename: string): Promise<string> {
        if (Platform.OS !== 'android') {
            return 'default';
        }

        const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient || (Constants as any).appOwnership === 'expo';
        if (isExpoGo) {
            return 'default';
        }

        try {
            const normalizedLevel: ControlLevel = level === 'critical' ? 'critical' : 'normal';
            const soundKey = stripExtension(soundFilename);
            const channelId = `veyra_${CURRENT_CHANNEL_VERSION}_${normalizedLevel}_${soundKey || 'default'}`;
            const soundLabel = getSoundName(soundFilename);

            let channelName = 'Normal';
            let importance = Notifications.AndroidImportance.HIGH;
            let vibrationPattern = [0, 300, 200, 300];
            let lightColor = '#3b82f6';
            let bypassDnd = false;

            if (normalizedLevel === 'critical') {
                channelName = `Crítico (${soundLabel})`;
                importance = Notifications.AndroidImportance.MAX;
                vibrationPattern = [0, 800, 300, 800, 300, 800, 300, 1000];
                lightColor = '#ef4444';
                bypassDnd = true;
            } else {
                channelName = `Normal (${soundLabel})`;
            }

            console.log(`[NotificationService] 📡 Configurando canal Android: ${channelId} | Sonido: ${soundFilename} | Importancia: ${importance}`);

            await Notifications.setNotificationChannelAsync(channelId, {
                name: channelName,
                importance,
                vibrationPattern,
                lightColor,
                sound: soundFilename,
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
                bypassDnd,
                enableVibrate: true,
                enableLights: true,
                audioAttributes: {
                    usage: normalizedLevel === 'normal'
                        ? Notifications.AndroidAudioUsage.NOTIFICATION
                        : Notifications.AndroidAudioUsage.ALARM,
                    contentType: Notifications.AndroidAudioContentType.SONIFICATION,
                    flags: {
                        enforceAudibility: true,
                        requestHardwareAudioVideoSynchronization: false,
                    },
                },
            });

            return channelId;
        } catch (e) {
            console.warn('[NotificationService] Error configurando canal:', e);
            return 'default';
        }
    },

    async requestPermissions(soundSettings?: { normal?: string; critical?: string }) {
        try {
            console.log('[NotificationService] 📋 Verificando permisos de notificación...');
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;

            if (existingStatus !== 'granted') {
                console.log('[NotificationService] Solicitando permisos al usuario...');
                const { status } = await Notifications.requestPermissionsAsync({
                    ios: {
                        allowAlert: true,
                        allowBadge: true,
                        allowSound: true,
                        allowCriticalAlerts: true,
                    },
                });
                finalStatus = status;
            }

            console.log(`[NotificationService] Estado final de permisos: ${finalStatus}`);

            // Crear canales iniciales según la configuración actual (solo en Android nativo/APK, omitido en Expo Go)
            if (Platform.OS === 'android') {
                const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient || (Constants as any).appOwnership === 'expo';
                if (!isExpoGo) {
                    try {
                        // Limpiar canales obsoletos (v1..v5 y canales strict obsoletos) para garantizar configuración limpia
                        const existingChannels = await Notifications.getNotificationChannelsAsync();
                        for (const ch of existingChannels) {
                            if (
                                ch.id.startsWith('veyra_v1_') ||
                                ch.id.startsWith('veyra_v2_') ||
                                ch.id.startsWith('veyra_v3_') ||
                                ch.id.startsWith('veyra_v4_') ||
                                ch.id.startsWith('veyra_v5_') ||
                                ch.id.includes('_strict_')
                            ) {
                                console.log(`[NotificationService] 🧹 Eliminando canal obsoleto: ${ch.id}`);
                                await Notifications.deleteNotificationChannelAsync(ch.id);
                            }
                        }
                    } catch (cleanErr) {
                        // Silenciar error en entornos donde el provider no esté disponible
                    }

                    const sounds = { ...DEFAULT_SOUND_SETTINGS, ...soundSettings };
                    await this.ensureChannel('normal', sounds.normal);
                    await this.ensureChannel('critical', sounds.critical);
                }
            }

            return finalStatus === 'granted';
        } catch (e) {
            console.warn('[NotificationService] Error requesting notification permissions:', e);
            return false;
        }
    },

    /**
     * Comprueba permisos avanzados necesarios para recordatorios críticos en Android (alarmas exactas y pantalla completa)
     */
    async checkCriticalAlarmPermissions(): Promise<{ canExact: boolean; canFullScreen: boolean }> {
        if (!VeyraAlarm.isAvailable()) {
            return { canExact: true, canFullScreen: true };
        }
        try {
            const [canExact, canFullScreen] = await Promise.all([
                VeyraAlarm.canScheduleExactAlarms(),
                VeyraAlarm.canUseFullScreenIntent(),
            ]);
            return { canExact, canFullScreen };
        } catch {
            return { canExact: true, canFullScreen: true };
        }
    },

    async getDiagnosticInfo() {
        try {
            const permissions = await Notifications.getPermissionsAsync();
            let channels: Notifications.NotificationChannel[] = [];
            const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient || (Constants as any).appOwnership === 'expo';
            if (Platform.OS === 'android' && !isExpoGo) {
                channels = await Notifications.getNotificationChannelsAsync();
            }
            const scheduled = await Notifications.getAllScheduledNotificationsAsync();
            const report = {
                platform: Platform.OS,
                permissionsGranted: permissions.granted,
                status: permissions.status,
                channelsCount: channels.length,
                channels: channels.map(c => ({
                    id: c.id,
                    name: c.name,
                    importance: c.importance,
                    sound: c.sound,
                    bypassDnd: c.bypassDnd,
                })),
                scheduledCount: scheduled.length,
            };
            console.log('[NotificationService Diagnostics]\n' + JSON.stringify(report, null, 2));
            return report;
        } catch (e) {
            console.warn('[NotificationService Diagnostics] Error gathering diagnostics:', e);
            return null;
        }
    },

    async scheduleReminderNotification(reminder: Reminder, soundSettings?: { normal?: string; critical?: string }): Promise<string[]> {
        const level: ControlLevel = reminder.control_level === 'critical' ? 'critical' : 'normal';
        let trigger = reminder.due_date_ms;
        if (reminder.event_id) {
            try {
                const db = await getDB();
                const ev = await db.getFirstAsync<any>('SELECT start_time_ms FROM events WHERE id = ? AND deleted = 0', [reminder.event_id]);
                if (ev && ev.start_time_ms) {
                    trigger = ev.start_time_ms + (reminder.offset_minutes || 0) * 60000;
                }
            } catch (err) {}
        }
        const notificationIds: string[] = [];
        if (trigger < Date.now()) return [];

        // Gestión del límite de notificaciones de iOS (64 máx)
        if (Platform.OS === 'ios') {
            try {
                const scheduled = await Notifications.getAllScheduledNotificationsAsync();
                let slotsNeeded = 1;
                if (level === 'critical') slotsNeeded += 5;

                const MAX_SCHEDULED = 60;
                if (scheduled.length + slotsNeeded > MAX_SCHEDULED) {
                    const sorted = scheduled.sort((a, b) => {
                        const levelA = (a.content as any)?.interruptionLevel as string | undefined;
                        const levelB = (b.content as any)?.interruptionLevel as string | undefined;

                        const getWeight = (level: string | undefined | null) => {
                            if (level === 'critical') return 3;
                            if (level === 'timeSensitive') return 2;
                            return 1;
                        };

                        const weightA = getWeight(levelA);
                        const weightB = getWeight(levelB);

                        if (weightA !== weightB) {
                            return weightA - weightB;
                        }

                        const triggerA = a.trigger as any;
                        const triggerB = b.trigger as any;
                        const dateA = triggerA?.date instanceof Date ? triggerA.date.getTime() : new Date(triggerA?.date || triggerA?.value || 0).getTime();
                        const dateB = triggerB?.date instanceof Date ? triggerB.date.getTime() : new Date(triggerB?.date || triggerB?.value || 0).getTime();

                        return dateB - dateA;
                    });

                    const countToRemove = (scheduled.length + slotsNeeded) - MAX_SCHEDULED;
                    if (countToRemove > 0) {
                        const toRemove = sorted.slice(0, countToRemove);
                        for (const notif of toRemove) {
                            await Notifications.cancelScheduledNotificationAsync(notif.identifier);
                        }
                    }
                }
            } catch (error) {
                console.warn('[iOS Limit Handler] Error checking limits:', error);
            }
        }

        const sounds = { ...DEFAULT_SOUND_SETTINGS, ...soundSettings };
        const soundFile = level === 'critical' ? sounds.critical : sounds.normal;

        // Crear/obtener canal dinámico en Android para el sonido específico
        const channelId = await this.ensureChannel(level, soundFile);

        const t = i18n.t.bind(i18n);
        const descriptionBody = stripHtml(reminder.description || '');

        const isPersistent = level === 'critical';

        const vibrationPattern = level === 'critical'
            ? [0, 800, 300, 800, 300, 800, 300, 1000]
            : [0, 300, 200, 300];

        const baseContent = {
            title: reminder.title,
            body: descriptionBody || t('notifications.default_body'),
            data: {
                reminderId: reminder.id,
                url: `veyra://confirm/${reminder.id}`,
            },
            channelId,
            sound: soundFile, // Usado en iOS
            vibrate: vibrationPattern, // Usado explícitamente en Android
            categoryIdentifier: 'REMINDER_ACTION',
            priority: level === 'critical'
                ? Notifications.AndroidNotificationPriority.MAX
                : Notifications.AndroidNotificationPriority.HIGH,
            interruptionLevel: (level === 'critical' ? 'critical' : 'active') as any,
            sticky: isPersistent,
            autoDismiss: !isPersistent,
        };

        console.log(`[NotificationService] ⏰ Programando recordatorio "${reminder.title}" [${level.toUpperCase()}] para ${new Date(trigger).toLocaleString()} | Canal: ${channelId} | Sonido: ${soundFile}`);

        // Programar notificación primaria
        const primaryId = await Notifications.scheduleNotificationAsync({
            content: baseContent,
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: new Date(trigger),
                channelId,
            },
        });
        notificationIds.push(primaryId);
        console.log(`[NotificationService] ✅ Notificación primaria programada: [${primaryId}]`);

        // Repeticiones para nivel Crítico (mecanismo de respaldo)
        if (level === 'critical') {
            const interval = 5 * 60 * 1000;
            const repeats = 5;

            for (let i = 1; i <= repeats; i++) {
                const followUpId = await Notifications.scheduleNotificationAsync({
                    content: {
                        ...baseContent,
                        body: t('notifications.follow_up_body', {
                            level: level.toUpperCase(),
                            title: reminder.title,
                        }),
                    },
                    trigger: {
                        type: Notifications.SchedulableTriggerInputTypes.DATE,
                        date: new Date(trigger + (interval * i)),
                        channelId,
                    },
                });
                notificationIds.push(followUpId);
            }
            console.log(`[NotificationService] 🔁 ${repeats} notificaciones de respaldo programadas a intervalos de ${interval / 60000}m`);
        }

        // Programar en el motor nativo de alarmas exactas (Android AlarmManager) para recordatorios críticos
        if (level === 'critical' && VeyraAlarm.isAvailable()) {
            try {
                console.log(`[NotificationService] 🚨 Programando alarma nativa exacta para [${reminder.id}]`);
                await VeyraAlarm.schedule({
                    id: reminder.id,
                    triggerAt: trigger,
                    title: reminder.title,
                    description: descriptionBody,
                    sound: soundFile,
                    controlLevel: level,
                });
            } catch (alarmErr) {
                console.warn('[NotificationService] Falló programación nativa de alarma exacta:', alarmErr);
            }
        }

        return notificationIds;
    },

    async cancelNotificationsForReminder(reminderId: string, storedIds?: string[]) {
        if (!reminderId) return;

        // Robustez: si se pasa un array de IDs (o JSON de IDs) como primer parámetro
        let actualReminderId = reminderId;
        const idsToCancel: string[] = storedIds ? [...storedIds] : [];
        if (typeof reminderId === 'string' && reminderId.trim().startsWith('[') && reminderId.trim().endsWith(']')) {
            try {
                const parsed = JSON.parse(reminderId);
                if (Array.isArray(parsed)) {
                    idsToCancel.push(...parsed);
                }
                actualReminderId = '';
            } catch {}
        }

        console.log(`[NotificationService] 🛑 Cancelando notificaciones para recordatorio: ${actualReminderId || 'por IDs'}`);
        // Cancelar también cualquier alarma activa en el motor nativo
        if (actualReminderId && VeyraAlarm.isAvailable()) {
            VeyraAlarm.cancel(actualReminderId).catch(() => {});
        }
        // Descartar notificaciones ya presentadas en la barra de estado
        try {
            const presented = await Notifications.getPresentedNotificationsAsync();
            for (const notif of presented) {
                const notifReminderId = notif.request.content.data?.reminderId;
                if (
                    (actualReminderId && (notifReminderId === actualReminderId || notif.request.identifier === actualReminderId)) ||
                    idsToCancel.includes(notif.request.identifier)
                ) {
                    await Notifications.dismissNotificationAsync(notif.request.identifier).catch(() => {});
                }
            }
        } catch (dismissErr) {
            console.warn('[NotificationService] Error descartando notificaciones presentadas:', dismissErr);
        }
        if (idsToCancel.length > 0) {
            await Promise.all(idsToCancel.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
            console.log(`[NotificationService] Canceladas ${idsToCancel.length} notificaciones por ID almacenado`);
        }
        if (actualReminderId) {
            try {
                const scheduled = await Notifications.getAllScheduledNotificationsAsync();
                let canceledCount = 0;
                for (const notif of scheduled) {
                    if (notif.content.data?.reminderId === actualReminderId) {
                        await Notifications.cancelScheduledNotificationAsync(notif.identifier).catch(() => {});
                        canceledCount++;
                    }
                }
                console.log(`[NotificationService] Canceladas ${canceledCount} notificaciones coincidentes`);
            } catch (schedErr) {
                console.warn('[NotificationService] Error leyendo notificaciones programadas:', schedErr);
            }
        }
    },

    async registerCategories() {
        const t = i18n.t.bind(i18n);
        await Notifications.setNotificationCategoryAsync('REMINDER_ACTION', [
            {
                identifier: 'DONE',
                buttonTitle: t('notifications.action_done'),
                options: {
                    opensAppToForeground: false,
                },
            },
            {
                identifier: 'SNOOZE',
                buttonTitle: t('notifications.action_snooze'),
                options: {
                    opensAppToForeground: false,
                },
            },
        ]);
    },

    async cancelAllNotifications() {
        await Notifications.cancelAllScheduledNotificationsAsync();
    },

    async scheduleImmediateNotification(reminder: Reminder, soundSettings?: { normal?: string; critical?: string }) {
        const level: ControlLevel = reminder.control_level === 'critical' ? 'critical' : 'normal';
        const sounds = { ...DEFAULT_SOUND_SETTINGS, ...soundSettings };
        const soundFile = level === 'critical' ? sounds.critical : sounds.normal;

        const channelId = await this.ensureChannel(level, soundFile);
        const t = i18n.t.bind(i18n);

        const isPersistent = level === 'critical';

        const vibrationPattern = level === 'critical'
            ? [0, 800, 300, 800, 300, 800, 300, 1000]
            : [0, 300, 200, 300];

        await Notifications.scheduleNotificationAsync({
            content: {
                title: t('notifications.overdue_title', { title: reminder.title }),
                body: t('notifications.overdue_body'),
                data: {
                    reminderId: reminder.id,
                    url: `veyra://confirm/${reminder.id}`,
                },
                sound: soundFile,
                vibrate: vibrationPattern,
                categoryIdentifier: 'REMINDER_ACTION',
                priority: level === 'critical'
                    ? Notifications.AndroidNotificationPriority.MAX
                    : Notifications.AndroidNotificationPriority.HIGH,
                sticky: isPersistent,
                autoDismiss: !isPersistent,
            },
            trigger: Platform.OS === 'android' ? { channelId } as any : null,
        });
    },

    /**
     * Programa una notificación amigable y puntual para un evento de calendario.
     */
    async scheduleEventNotification(event: CalendarEvent): Promise<string[]> {
        let offsets: number[] = [];
        if (event.notification_offsets) {
            try {
                const parsed = JSON.parse(event.notification_offsets);
                if (Array.isArray(parsed)) {
                    offsets = parsed.filter(n => typeof n === 'number');
                }
            } catch {}
        } else if (event.notification_offset_min !== undefined && event.notification_offset_min !== null) {
            offsets = [event.notification_offset_min];
        }

        if (offsets.length === 0) {
            return [];
        }

        const scheduledIds: string[] = [];
        const now = Date.now();

        const isRecurring = Boolean(
            (event.recurrence_rule && event.recurrence_rule !== 'none' && event.recurrence_rule !== 'null') ||
            (event.repeat_rule && event.repeat_rule !== 'none' && event.repeat_rule !== 'null')
        );

        // Si es recurrente, proyectar las ocurrencias de los próximos 14 días
        const occurrences: { startMs: number; endMs: number }[] = [];
        if (isRecurring) {
            try {
                const upcomingLimit = now + 14 * 24 * 60 * 60 * 1000;
                const occs = expandOccurrences(event, now, upcomingLimit);
                for (const occ of occs) {
                    occurrences.push({ startMs: occ.startTimeMs, endMs: occ.endTimeMs });
                }
            } catch (recErr) {
                console.warn('[NotificationService] Error expandiendo ocurrencias para notificaciones:', recErr);
            }
        }

        if (occurrences.length === 0) {
            occurrences.push({ startMs: event.start_time_ms, endMs: event.end_time_ms || event.start_time_ms });
        }

        for (const occ of occurrences) {
            for (const offsetMin of offsets) {
                const offsetMs = offsetMin * 60 * 1000;
                const triggerTime = occ.startMs - offsetMs;

                if (triggerTime <= now) {
                    continue;
                }

                try {
                    const channelId = await this.ensureChannel('normal', DEFAULT_SOUND_SETTINGS.normal);
                    const startTimeFormatted = format(new Date(occ.startMs), 'HH:mm');
                    const endTimeFormatted = format(new Date(occ.endMs), 'HH:mm');

                    let body = `${startTimeFormatted} - ${endTimeFormatted}`;
                    if (offsetMin > 0) {
                        if (offsetMin >= 10080 && offsetMin % 10080 === 0) {
                            const weeks = offsetMin / 10080;
                            body = `Comienza en ${weeks} ${weeks === 1 ? 'semana' : 'semanas'} (${startTimeFormatted} - ${endTimeFormatted})`;
                        } else if (offsetMin >= 1440) {
                            const days = Math.round(offsetMin / 1440);
                            body = `Comienza en ${days} ${days === 1 ? 'día' : 'días'} (${startTimeFormatted} - ${endTimeFormatted})`;
                        } else if (offsetMin >= 60) {
                            const hours = Math.round(offsetMin / 60);
                            body = `Comienza en ${hours} ${hours === 1 ? 'hora' : 'horas'} (${startTimeFormatted} - ${endTimeFormatted})`;
                        } else {
                            body = `Comienza en ${offsetMin} min (${startTimeFormatted} - ${endTimeFormatted})`;
                        }
                    } else {
                        body = `Comienza ahora (${startTimeFormatted} - ${endTimeFormatted})`;
                    }
                    if (event.location) {
                        body += ` • ${event.location}`;
                    }

                    const notifId = await Notifications.scheduleNotificationAsync({
                        content: {
                            title: `📅 ${event.title}`,
                            body,
                            data: {
                                eventId: event.id,
                                noteId: event.note_id || undefined,
                                url: `veyra://event/${event.id}`,
                            },
                            sound: DEFAULT_SOUND_SETTINGS.normal,
                            priority: Notifications.AndroidNotificationPriority.HIGH,
                        },
                        trigger: {
                            type: Notifications.SchedulableTriggerInputTypes.DATE,
                            date: new Date(triggerTime),
                            channelId,
                        },
                    });

                    scheduledIds.push(notifId);
                } catch (error) {
                    console.warn('[NotificationService] Error scheduling event notification:', error);
                }
            }
        }

        return scheduledIds;
    },

    /**
     * Registra el token de notificaciones push de Expo en Supabase para el usuario autenticado.
     * Permite recibir alertas colaborativas ("X completó la tarea", etc.).
     */
    async registerPushToken(userId: string): Promise<string | null> {
        if (!userId) return null;
        try {
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            if (finalStatus !== 'granted') {
                console.log('[NotificationService] Permiso de notificaciones no concedido para push token');
                return null;
            }

            const projectId = Constants.expoConfig?.extra?.eas?.projectId || '01983506-e77d-4420-9219-4d451f832e9a';
            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
            const token = tokenData.data;

            if (!token) return null;

            const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

            const { error } = await supabase.from('push_tokens').upsert(
                {
                    user_id: userId,
                    token,
                    platform,
                    device_id: Constants.installationId || undefined,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,token' }
            );

            if (error) {
                console.warn('[NotificationService] Error al guardar push token en Supabase:', error.message);
            } else {
                console.log('[NotificationService] ✅ Push token registrado exitosamente en Supabase');
            }

            return token;
        } catch (error) {
            console.warn('[NotificationService] No se pudo registrar push token (entorno sin soporte push o emulador):', error);
            return null;
        }
    },

    /**
     * Cancela las notificaciones programadas de un evento.
     */
    async cancelEventNotifications(notificationIdsJson?: string | string[]) {
        if (!notificationIdsJson) return;
        try {
            let ids: string[] = [];
            if (Array.isArray(notificationIdsJson)) {
                ids = notificationIdsJson;
            } else if (typeof notificationIdsJson === 'string') {
                if (notificationIdsJson.trim().startsWith('[')) {
                    ids = JSON.parse(notificationIdsJson);
                } else {
                    ids = [notificationIdsJson];
                }
            }
            if (Array.isArray(ids)) {
                for (const id of ids) {
                    try {
                        await Notifications.cancelScheduledNotificationAsync(id);
                    } catch {}
                }
            }
        } catch (error) {
            console.warn('[NotificationService] Error canceling event notifications:', error);
        }
    },

    /**
     * Desregistra el push token al cerrar sesión.
     */
    async unregisterPushToken(userId: string): Promise<void> {
        if (!userId) return;
        try {
            const projectId = Constants.expoConfig?.extra?.eas?.projectId || '01983506-e77d-4420-9219-4d451f832e9a';
            const tokenData = await Notifications.getExpoPushTokenAsync({ projectId }).catch(() => null);
            const token = tokenData?.data;

            if (token) {
                await supabase.from('push_tokens').delete().match({ user_id: userId, token });
                console.log('[NotificationService] Push token removido de Supabase');
            }
        } catch (error) {
            console.warn('[NotificationService] Error al desregistrar push token:', error);
        }
    },
};
