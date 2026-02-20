import * as Notifications from 'expo-notifications';
import { Reminder, ControlLevel } from '../types/db';
import { Platform } from 'react-native';
import { useStore } from '../store/useStore';

export const NotificationService = {
    async setup() {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: true,
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });
    },

    async requestPermissions() {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        // Explicitly set channels for Android
        if (Platform.OS === 'android') {
            const { soundSettings } = useStore.getState();

            // Normal Channel
            await Notifications.setNotificationChannelAsync('normal', {
                name: 'Normal',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#3b82f6',
                sound: soundSettings.normal,
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
                bypassDnd: false,
            });

            // Strict Channel
            await Notifications.setNotificationChannelAsync('strict', {
                name: 'Estricto',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 500, 250, 500],
                lightColor: '#f59e0b',
                sound: soundSettings.strict,
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
                bypassDnd: true,
            });

            // Critical Channel (Max Priority)
            await Notifications.setNotificationChannelAsync('critical', {
                name: 'Críticos',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 500, 500, 500, 500, 500],
                lightColor: '#ef4444',
                sound: soundSettings.critical,
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
                bypassDnd: true,
                audioAttributes: {
                    usage: Notifications.AndroidAudioUsage.ALARM,
                    contentType: Notifications.AndroidAudioContentType.SONIFICATION,
                }
            });
        }

        return finalStatus === 'granted';
    },

    async scheduleReminderNotification(reminder: Reminder): Promise<string[]> {
        const trigger = reminder.due_date_ms;
        const notificationIds: string[] = [];
        if (trigger < Date.now()) return [];

        // Gestión del límite de notificaciones de iOS (64 máx)
        if (Platform.OS === 'ios') {
            try {
                const scheduled = await Notifications.getAllScheduledNotificationsAsync();

                // Calculamos cuántos slots necesitamos para este nuevo recordatorio
                let slotsNeeded = 1; // Base
                if (reminder.control_level === 'strict') slotsNeeded += 2;
                if (reminder.control_level === 'critical') slotsNeeded += 5;

                // Mantenemos un margen de seguridad (60 en lugar de 64)
                const MAX_SCHEDULED = 60;

                if (scheduled.length + slotsNeeded > MAX_SCHEDULED) {
                    console.log(`[iOS Notification Limit] Limit reached (${scheduled.length}). Clearing space for ${slotsNeeded} new notifications.`);

                    // Ordenar notificaciones: las más cercanas primero (ascendente)
                    const sorted = scheduled.sort((a, b) => {
                        const triggerA = a.trigger as any;
                        const triggerB = b.trigger as any;
                        // Intentamos obtener el timestamp tanto si es objeto Date como si es número
                        const dateA = triggerA.date instanceof Date ? triggerA.date.getTime() : (new Date(triggerA.date || triggerA.value || 0).getTime());
                        const dateB = triggerB.date instanceof Date ? triggerB.date.getTime() : (new Date(triggerB.date || triggerB.value || 0).getTime());
                        return dateA - dateB;
                    });

                    // Calculamos cuántas borrar
                    const countToRemove = (scheduled.length + slotsNeeded) - MAX_SCHEDULED;

                    // Borramos las notificaciones MÁS LEJANAS (al final del array ordenado)
                    // para priorizar los recordatorios inmediatos/cercanos.
                    // Aseguramos que countToRemove sea positivo y no exceda el length
                    if (countToRemove > 0) {
                        const toRemove = sorted.slice(sorted.length - countToRemove);
                        for (const notif of toRemove) {
                            await Notifications.cancelScheduledNotificationAsync(notif.identifier);
                        }
                    }
                }
            } catch (error) {
                console.warn('[iOS Limit Handler] Error checking limits:', error);
            }
        }

        const { soundSettings } = useStore.getState();
        let channelId = 'normal';
        let soundFile = soundSettings.normal;

        switch (reminder.control_level) {
            case 'strict':
                channelId = 'strict';
                soundFile = soundSettings.strict;
                break;
            case 'critical':
                channelId = 'critical';
                soundFile = soundSettings.critical;
                break;
            default:
                channelId = 'normal';
                soundFile = soundSettings.normal;
                break;
        }

        const baseContent = {
            title: reminder.title,
            body: 'Es hora de actuar. Confirma tu acción.',
            data: {
                reminderId: reminder.id,
                url: `apprecordatorio://confirm/${reminder.id}`
            },
            sound: soundFile, // iOS custom sound
            categoryIdentifier: 'REMINDER_ACTION',
            priority: reminder.control_level === 'critical' ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
        };

        // Schedule primary notification
        const primaryId = await Notifications.scheduleNotificationAsync({
            content: baseContent,
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: new Date(trigger),
                channelId: channelId, // Android channel
            },
        });
        notificationIds.push(primaryId);

        // Schedule follow-ups for Strict and Critical
        if (reminder.control_level === 'strict' || reminder.control_level === 'critical') {
            const interval = reminder.control_level === 'critical' ? 5 * 60 * 1000 : 15 * 60 * 1000; // 5 min critical, 15 min strict
            const repeats = reminder.control_level === 'critical' ? 5 : 2; // +5 times for critical, +2 for strict

            for (let i = 1; i <= repeats; i++) {
                const followUpId = await Notifications.scheduleNotificationAsync({
                    content: {
                        ...baseContent,
                        body: `RECORDATORIO ${reminder.control_level.toUpperCase()}: ${reminder.title} sigue pendiente.`,
                    },
                    trigger: {
                        type: Notifications.SchedulableTriggerInputTypes.DATE,
                        date: new Date(trigger + (interval * i)),
                        channelId: channelId,
                    },
                });
                notificationIds.push(followUpId);
            }
        }
        return notificationIds;
    },

    async cancelNotificationsForReminder(reminderId: string, storedIds?: string[]) {
        if (storedIds && storedIds.length > 0) {
            await Promise.all(storedIds.map(id => Notifications.cancelScheduledNotificationAsync(id)));
        } else {
            // Fallback for legacy or missing IDs
            const scheduled = await Notifications.getAllScheduledNotificationsAsync();
            for (const notif of scheduled) {
                if (notif.content.data?.reminderId === reminderId) {
                    await Notifications.cancelScheduledNotificationAsync(notif.identifier);
                }
            }
        }
    },

    async registerCategories() {
        await Notifications.setNotificationCategoryAsync('REMINDER_ACTION', [
            {
                identifier: 'DONE',
                buttonTitle: 'Ya lo hice',
                options: {
                    opensAppToForeground: false, // Background action ideally, but we might want to open app to confirm for "Active Control"
                },
            },
            {
                identifier: 'SNOOZE',
                buttonTitle: 'Posponer',
                options: {
                    opensAppToForeground: false,
                },
            },
        ]);
    },

    async cancelAllNotifications() {
        await Notifications.cancelAllScheduledNotificationsAsync();
    },

    async scheduleImmediateNotification(reminder: Reminder) {
        const { soundSettings } = useStore.getState();
        let channelId = 'normal';
        let soundFile = soundSettings.normal;

        switch (reminder.control_level) {
            case 'strict':
                channelId = 'strict';
                soundFile = soundSettings.strict;
                break;
            case 'critical':
                channelId = 'critical';
                soundFile = soundSettings.critical;
                break;
            default:
                channelId = 'normal';
                soundFile = soundSettings.normal;
                break;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: `⚠️ VENCIDO: ${reminder.title}`,
                body: 'Este recordatorio está pendiente. Por favor, actúa ahora.',
                data: {
                    reminderId: reminder.id,
                    url: `apprecordatorio://confirm/${reminder.id}`
                },
                sound: soundFile,
                categoryIdentifier: 'REMINDER_ACTION',
                priority: reminder.control_level === 'critical' ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: null, // Immediate
        });
    }
};
