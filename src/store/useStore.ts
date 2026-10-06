import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LayoutAnimation } from 'react-native';
import { ReminderService } from '../services/reminderService';
import { NotificationService } from '../services/notificationService';
import { ComplianceService } from '../services/complianceService';
import { WidgetService } from '../services/widgetService';
import { CollaborationService } from '../services/collaborationService';
import { Reminder, ControlLevel, ReminderStatus } from '../types/db';
import { AccentTheme } from '../theme/accentColors';
import { defaultLanguage } from '../lib/i18n';

export const PREMIUM_WHITELIST_EMAILS = [
    'ricardo.lopez.18.ralo@gmail.com',
];

export const isWhitelistedPremiumEmail = (email?: string | null): boolean => {
    if (!email) return false;
    return PREMIUM_WHITELIST_EMAILS.includes(email.toLowerCase().trim());
};

const safeParseArray = (jsonString: string | null | undefined): string[] => {
    if (!jsonString) return [];
    try {
        const parsed = JSON.parse(jsonString);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

interface AppState {
    reminders: Reminder[];
    history: Reminder[];
    isRemindersDirty: boolean;
    markRemindersDirty: (dirty: boolean) => void;
    isLoading: boolean;
    loadReminders: () => Promise<void>;
    loadHistory: () => Promise<void>;
    addReminder: (title: string, dueDate: number, controlLevel: ControlLevel, description?: string, repeatRule?: string, attachments?: string, links?: string, subtasks?: string) => Promise<void>;
    markAsCompleted: (id: string) => Promise<void>;
    markRemindersAsCompleted: (ids: string[]) => Promise<void>;
    markAsPending: (id: string) => Promise<void>;
    updateReminder: (id: string, updates: Partial<Reminder>) => Promise<void>;
    toggleSubtask: (reminderId: string, subtaskId: string) => Promise<void>;
    deleteReminder: (id: string) => Promise<void>;
    deleteReminders: (ids: string[]) => Promise<void>;
    restoreReminder: (id: string) => Promise<void>;
    restoreRemindersBatch: (ids: string[]) => Promise<void>;
    reactivateReminder: (id: string) => Promise<void>;
    reactivateRemindersBatch: (ids: string[]) => Promise<void>;
    deleteForever: (id: string) => Promise<void>;
    deleteRemindersForeverBatch: (ids: string[]) => Promise<void>;
    emptyRemindersTrash: () => Promise<void>;
    snoozeReminder: (id: string, minutes: number, isMassSnooze?: boolean) => Promise<void>;
    snoozeRemindersBatch: (ids: string[], minutes: number) => Promise<void>;
    toggleTheme: () => void;
    theme: 'system' | 'light' | 'dark';
    setTheme: (theme: 'system' | 'light' | 'dark') => void;
    onboardingCompleted: boolean;
    userProfile: 'student' | 'work' | 'personal' | 'custom' | null;
    userName: string | null;
    userEmail: string | null;
    userAvatar?: string | null;
    completeOnboarding: () => void;
    setUserProfile: (profile: 'student' | 'work' | 'personal' | 'custom') => void;
    setUserName: (name: string) => void;
    setUserEmail: (email: string) => void;
    setUserAvatar: (avatar: string | null) => void;
    defaultControlLevel: ControlLevel;
    isHydrated: boolean;
    session: any | null;
    setSession: (session: any | null) => void;
    signOut: () => Promise<void>;
    detailReminder: Reminder | null;
    setDetailReminder: (reminder: Reminder | null) => void;
    setDefaultControlLevel: (level: ControlLevel) => void;
    soundSettings: {
        normal: string;
        strict: string;
        critical: string;
    };
    setSoundSetting: (level: 'normal' | 'strict' | 'critical', sound: string) => void;
    isPremium: boolean;
    setPremium: (status: boolean) => void;
    language: string;
    setLanguage: (lang: string) => void;
    cloudSyncEnabled: boolean;
    setCloudSyncEnabled: (enabled: boolean) => void;
    isSyncing: boolean;
    lastSyncTime: number | null;
    syncError: string | null;
    triggerSync: (isInitialLogin?: boolean, isBackground?: boolean) => Promise<void>;
    streak: number;
    loadStreak: () => Promise<void>;
    accentTheme: AccentTheme;
    setAccentTheme: (theme: AccentTheme) => void;
    homeViewMode: 'list' | 'calendar';
    setHomeViewMode: (mode: 'list' | 'calendar') => void;
    tabTransitionDirection: 'forward' | 'backward' | 'none';
    setTabTransitionDirection: (direction: 'forward' | 'backward' | 'none') => void;
    mainActiveTab: 'reminders' | 'notes';
    setMainActiveTab: (tab: 'reminders' | 'notes') => void;
    widgetTextScale: number;
    setWidgetTextScale: (scale: number) => void;
    widgetHighContrast: boolean;
    setWidgetHighContrast: (enabled: boolean) => void;
}

export const useStore = create<AppState>()(
    persist(
        (set, get) => ({
            reminders: [],
            history: [],
            isRemindersDirty: true,
            markRemindersDirty: (dirty: boolean) => set({ isRemindersDirty: dirty }),
            theme: 'system',
            isLoading: false,

            loadReminders: async () => {
                set({ isLoading: true });
                try {
                    const reminders = await ReminderService.getReminders();
                    set({ reminders, isRemindersDirty: false });
                    WidgetService.sync(reminders).catch(() => {});
                    WidgetService.syncSchedule().catch(() => {});
                } catch (error: any) {
                    if (!error.message?.includes('no such table')) console.error(error);
                } finally {
                    set({ isLoading: false });
                }
            },

            loadHistory: async () => {
                set({ isLoading: true });
                try {
                    const history = await ReminderService.getHistory();
                    set({ history });
                } catch (error) {
                    console.error('Failed to load history', error);
                } finally {
                    set({ isLoading: false });
                }
            },

            addReminder: async (title, dueDate, controlLevel, description, repeatRule, attachments, links, subtasks) => {
                const isPremium = get().isPremium;
                const activeCount = get().reminders.filter(r => r.status === 'pending').length;
                if (!isPremium && activeCount >= 5) {
                    set({
                        // Podríamos activar el modal aquí si tuviéramos acceso a la UI, 
                        // por ahora mantenemos el alert hasta integrar el modal en la Home
                    });
                    alert("Has alcanzado el límite de 5 recordatorios activos gratuitos. Pásate a Premium para crear recordatorios ilimitados.");
                    return;
                }
                try {
                    const userId = get().session?.user?.id || 'local_user';
                    const reminder = await ReminderService.createReminder(title, dueDate, controlLevel, userId, description, repeatRule, attachments, links, subtasks);
                    const notifIds = await NotificationService.scheduleReminderNotification(reminder, get().soundSettings);
                    if (notifIds.length > 0) {
                        await ReminderService.updateReminder(reminder.id, { notification_ids: JSON.stringify(notifIds) });
                    }
                    await get().loadReminders();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to create reminder', error);
                }
            },

            markAsCompleted: async (id) => {
                try {
                    // Limpiar inmediatamente notificaciones de la barra (tanto nativas como de expo)
                    await NotificationService.cancelNotificationsForReminder(id);

                    let reminder = get().reminders.find(r => r.id === id);
                    if (!reminder) {
                        reminder = await ReminderService.getReminderById(id) || undefined;
                    }
                    if (!reminder) return;

                    await ReminderService.markAsCompleted(id);
                    await ComplianceService.logEvent(id, 'completed');

                    if (reminder && (reminder.is_shared === 1 || reminder.shared_owner_id)) {
                        CollaborationService.notifyChange({
                            targetType: 'reminder',
                            targetId: reminder.id,
                            action: 'completed',
                            itemTitle: reminder.title,
                        });
                    }

                    // Handle recurrence: create next occurrence
                    if (reminder.repeat_rule) {
                        const { parseRepeatRule, getNextRecurrenceDate } = await import('../utils/recurrence');
                        const rule = parseRepeatRule(reminder.repeat_rule);
                        if (rule) {
                            const nextDate = getNextRecurrenceDate(reminder.due_date_ms, rule);
                            if (nextDate) {
                                const userId = get().session?.user?.id || 'local_user';
                                const nextReminder = await ReminderService.createReminder(
                                    reminder.title,
                                    nextDate,
                                    reminder.control_level,
                                    userId,
                                    reminder.description,
                                    reminder.repeat_rule,
                                    reminder.attachments,
                                    reminder.links
                                );
                                const notifIds = await NotificationService.scheduleReminderNotification(nextReminder, get().soundSettings);
                                if (notifIds.length > 0) {
                                    await ReminderService.updateReminder(nextReminder.id, { notification_ids: JSON.stringify(notifIds) });
                                }
                            }
                        }
                    }

                    await get().loadReminders();
                    await get().loadHistory();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to complete reminder', error);
                }
            },

            markRemindersAsCompleted: async (ids) => {
                try {
                    const idsSet = new Set(ids);
                    // Optimistic update
                    set(state => ({
                        reminders: state.reminders.map(r => idsSet.has(r.id) ? { ...r, status: 'completed', last_modified_ms: Date.now() } : r)
                    }));

                    for (const id of ids) {
                        const reminder = get().reminders.find(r => r.id === id);
                        if (reminder) {
                            const storedIds = safeParseArray(reminder.notification_ids);
                            await NotificationService.cancelNotificationsForReminder(id, storedIds);
                            await ReminderService.markAsCompleted(id);
                            await ComplianceService.logEvent(id, 'completed');
                        }
                    }
                    await get().loadReminders();
                    await get().loadHistory();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to complete reminders batch', error);
                    await get().loadReminders();
                }
            },

            markAsPending: async (id) => {
                try {
                    await ReminderService.updateReminder(id, { status: 'pending', last_modified_ms: Date.now() });
                    const reminder = await ReminderService.getReminderById(id);
                    if (reminder) {
                        if (reminder.is_shared === 1 || reminder.shared_owner_id) {
                            CollaborationService.notifyChange({
                                targetType: 'reminder',
                                targetId: reminder.id,
                                action: 'uncompleted',
                                itemTitle: reminder.title,
                            });
                        }
                        const notifIds = await NotificationService.scheduleReminderNotification(reminder, get().soundSettings);
                        if (notifIds.length > 0) {
                            await ReminderService.updateReminder(id, { notification_ids: JSON.stringify(notifIds) });
                        }
                    }
                    await get().loadReminders();
                    await get().loadHistory();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to mark reminder as pending', error);
                }
            },

            updateReminder: async (id, updates) => {
                try {
                    await ReminderService.updateReminder(id, updates);
                    const reminder = get().reminders.find(r => r.id === id);

                    if (reminder) {
                        if (reminder.is_shared === 1 || reminder.shared_owner_id) {
                            CollaborationService.notifyChange({
                                targetType: 'reminder',
                                targetId: reminder.id,
                                action: 'edited',
                                itemTitle: updates.title || reminder.title,
                            });
                        }
                        // Always cancel old notifications when updating critical fields
                        if (updates.due_date_ms || updates.title || updates.control_level) {
                            const storedIds = safeParseArray(reminder.notification_ids);
                            await NotificationService.cancelNotificationsForReminder(id, storedIds);

                            const updatedReminder = { ...reminder, ...updates };
                            const notifIds = await NotificationService.scheduleReminderNotification(updatedReminder, get().soundSettings);

                            if (notifIds.length > 0) {
                                await ReminderService.updateReminder(id, { notification_ids: JSON.stringify(notifIds) });
                            }
                        }
                    }
                    await get().loadReminders();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to update reminder', error);
                }
            },

            toggleSubtask: async (reminderId, subtaskId) => {
                try {
                    let reminder = get().reminders.find(r => r.id === reminderId);
                    let inHistory = false;
                    if (!reminder) {
                        reminder = get().history.find(r => r.id === reminderId);
                        inHistory = true;
                    }
                    if (!reminder || !reminder.subtasks) return;

                    const list = JSON.parse(reminder.subtasks);
                    if (!Array.isArray(list)) return;

                    const updated = list.map((st: any) =>
                        st.id === subtaskId ? { ...st, completed: !st.completed } : st
                    );

                    const subtasksJson = JSON.stringify(updated);
                    await ReminderService.updateReminder(reminderId, { subtasks: subtasksJson });
                    await get().loadReminders();
                    if (inHistory) {
                        await get().loadHistory();
                    }
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to toggle subtask', error);
                }
            },

            deleteReminder: async (id) => {
                try {
                    const reminder = get().reminders.find(r => r.id === id);
                    const storedIds = safeParseArray(reminder?.notification_ids);

                    // Optimistic update: retirar inmediatamente de la lista para fluidez total
                    set(state => ({
                        reminders: state.reminders.filter(r => r.id !== id)
                    }));

                    await NotificationService.cancelNotificationsForReminder(id, storedIds);
                    await ReminderService.deleteReminder(id);
                    await ComplianceService.logEvent(id, 'failed');

                    if (reminder && (reminder.is_shared === 1 || reminder.shared_owner_id)) {
                        CollaborationService.notifyChange({
                            targetType: 'reminder',
                            targetId: reminder.id,
                            action: 'deleted',
                            itemTitle: reminder.title,
                        });
                    }
                    await get().loadReminders();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to delete reminder', error);
                    await get().loadReminders();
                }
            },

            deleteReminders: async (ids: string[]) => {
                try {
                    for (const id of ids) {
                        const reminder = get().reminders.find(r => r.id === id);
                        const storedIds = safeParseArray(reminder?.notification_ids);
                        await NotificationService.cancelNotificationsForReminder(id, storedIds);
                        await ReminderService.deleteReminder(id);
                        await ComplianceService.logEvent(id, 'failed');
                    }
                    await get().loadReminders();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to delete reminders', error);
                }
            },

            restoreReminder: async (id: string) => {
                // Optimistic removal from history
                set(state => ({
                    history: state.history.filter(r => r.id !== id)
                }));
                try {
                    await ReminderService.restoreReminder(id);
                    await get().loadReminders();
                    await get().loadHistory();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to restore reminder', error);
                    await get().loadHistory();
                }
            },

            restoreRemindersBatch: async (ids: string[]) => {
                if (!ids || ids.length === 0) return;
                const idsSet = new Set(ids);
                set(state => ({
                    history: state.history.filter(r => !idsSet.has(r.id))
                }));
                try {
                    await ReminderService.restoreReminders(ids);
                    await get().loadReminders();
                    await get().loadHistory();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to restore reminders batch', error);
                    await get().loadHistory();
                }
            },

            reactivateReminder: async (id: string) => {
                try {
                    LayoutAnimation.configureNext({
                        duration: 320,
                        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                        update: { type: LayoutAnimation.Types.spring, springDamping: 0.82 },
                        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                    });
                } catch {}
                set(state => ({
                    history: state.history.filter(r => r.id !== id)
                }));
                try {
                    await ReminderService.reactivateReminder(id);
                    const reminder = await ReminderService.getReminderById(id);
                    if (reminder && reminder.due_date_ms > Date.now()) {
                        const notifIds = await NotificationService.scheduleReminderNotification(reminder, get().soundSettings);
                        if (notifIds.length > 0) {
                            await ReminderService.updateReminder(id, { notification_ids: JSON.stringify(notifIds) });
                        }
                    }
                    await get().loadReminders();
                    await get().loadHistory();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to reactivate reminder', error);
                    await get().loadHistory();
                }
            },

            reactivateRemindersBatch: async (ids: string[]) => {
                if (!ids || ids.length === 0) return;
                const idsSet = new Set(ids);
                try {
                    LayoutAnimation.configureNext({
                        duration: 320,
                        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                        update: { type: LayoutAnimation.Types.spring, springDamping: 0.82 },
                        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                    });
                } catch {}
                set(state => ({
                    history: state.history.filter(r => !idsSet.has(r.id))
                }));
                try {
                    await ReminderService.reactivateReminders(ids);
                    await get().loadReminders();
                    await get().loadHistory();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to reactivate reminders batch', error);
                    await get().loadHistory();
                }
            },

            deleteForever: async (id: string) => {
                set(state => ({
                    history: state.history.filter(r => r.id !== id)
                }));
                try {
                    await ReminderService.deleteForever(id);
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        try {
                            const { supabase } = await import('../lib/supabase');
                            await supabase.from('reminders').delete().eq('id', id);
                        } catch (cloudErr) {
                            console.warn('[Sync] Could not delete reminder from cloud:', cloudErr);
                        }
                    }
                    await get().loadHistory();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to delete reminder forever', error);
                    await get().loadHistory();
                }
            },

            deleteRemindersForeverBatch: async (ids: string[]) => {
                if (!ids || ids.length === 0) return;
                const idsSet = new Set(ids);
                set(state => ({
                    history: state.history.filter(r => !idsSet.has(r.id))
                }));
                try {
                    await ReminderService.deleteRemindersForever(ids);
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        try {
                            const { supabase } = await import('../lib/supabase');
                            await supabase.from('reminders').delete().in('id', ids);
                        } catch (cloudErr) {
                            console.warn('[Sync] Could not delete reminders from cloud:', cloudErr);
                        }
                    }
                    await get().loadHistory();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to delete reminders forever batch', error);
                    await get().loadHistory();
                }
            },

            emptyRemindersTrash: async () => {
                const deletedIds = get().history.filter(r => r.deleted === 1).map(r => r.id);
                set(state => ({
                    history: state.history.filter(r => r.deleted === 0)
                }));
                try {
                    await ReminderService.emptyRemindersTrash();
                    if (deletedIds.length > 0 && get().session?.user?.id && get().cloudSyncEnabled) {
                        try {
                            const { supabase } = await import('../lib/supabase');
                            await supabase.from('reminders').delete().in('id', deletedIds);
                        } catch (cloudErr) {
                            console.warn('[Sync] Could not delete trash reminders from cloud:', cloudErr);
                        }
                    }
                    await get().loadHistory();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to empty reminders trash', error);
                    await get().loadHistory();
                }
            },

            snoozeReminder: async (id: string, minutes: number, isMassSnooze: boolean = false) => {
                try {
                    let reminder = get().reminders.find(r => r.id === id);
                    if (!reminder) {
                        reminder = await ReminderService.getReminderById(id) || undefined;
                    }
                    if (!reminder) {
                        await NotificationService.cancelNotificationsForReminder(id);
                        return;
                    }

                    const newTime = Date.now() + (minutes * 60 * 1000);
                    const storedIds = safeParseArray(reminder.notification_ids);

                    await NotificationService.cancelNotificationsForReminder(id, storedIds);

                    const updatedReminder = { ...reminder, due_date_ms: newTime };
                    const notifIds = await NotificationService.scheduleReminderNotification(updatedReminder);

                    await ReminderService.updateReminder(id, {
                        due_date_ms: newTime,
                        notification_ids: JSON.stringify(notifIds)
                    });

                    await ComplianceService.logEvent(id, isMassSnooze ? 'mass_snooze' : 'snoozed');
                    await get().loadReminders();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to snooze reminder', error);
                }
            },

            snoozeRemindersBatch: async (ids, minutes) => {
                try {
                    const newTime = Date.now() + (minutes * 60 * 1000);
                    const idsSet = new Set(ids);
                    set(state => ({
                        reminders: state.reminders.map(r => idsSet.has(r.id) ? { ...r, due_date_ms: newTime, status: 'pending', last_modified_ms: Date.now() } : r)
                    }));

                    for (const id of ids) {
                        const reminder = get().reminders.find(r => r.id === id);
                        if (reminder) {
                            const storedIds = safeParseArray(reminder.notification_ids);
                            await NotificationService.cancelNotificationsForReminder(id, storedIds);
                            const updatedReminder = { ...reminder, due_date_ms: newTime, status: 'pending' as ReminderStatus };
                            const notifIds = await NotificationService.scheduleReminderNotification(updatedReminder);
                            await ReminderService.updateReminder(id, {
                                due_date_ms: newTime,
                                status: 'pending',
                                notification_ids: JSON.stringify(notifIds)
                            });
                            await ComplianceService.logEvent(id, 'mass_snooze');
                        }
                    }
                    await get().loadReminders();
                    if (get().session?.user?.id && get().cloudSyncEnabled) {
                        get().triggerSync();
                    }
                } catch (error) {
                    console.error('Failed to snooze reminders batch', error);
                    await get().loadReminders();
                }
            },

            toggleTheme: () => {
                set((state) => {
                    const next = state.theme === 'dark' ? 'light' : 'dark';
                    WidgetService.syncTheme(next, state.accentTheme).catch(() => {});
                    return { theme: next };
                });
            },

            setTheme: (theme) => {
                set({ theme });
                WidgetService.syncTheme(theme, get().accentTheme).catch(() => {});
            },

            onboardingCompleted: false,
            userProfile: null,
            userName: null,
            userEmail: null as string | null,
            userAvatar: null,
            completeOnboarding: () => set({ onboardingCompleted: true }),
            setUserProfile: (profile) => set({ userProfile: profile }),
            setUserName: (name) => set({ userName: name }),
            setUserEmail: (email) => {
                const authenticatedEmail = get().session?.user?.email;
                const isOwner = isWhitelistedPremiumEmail(authenticatedEmail || email);
                set({
                    userEmail: email,
                    isPremium: isOwner ? true : (authenticatedEmail ? get().isPremium : false),
                });
            },
            setUserAvatar: (avatar) => set({ userAvatar: avatar }),
            defaultControlLevel: 'normal',
            setDefaultControlLevel: (level: ControlLevel) => set({ defaultControlLevel: level }),
            isHydrated: false,
            session: null,
            setSession: (session) => {
                const email = session?.user?.email ?? null;
                const isOwner = isWhitelistedPremiumEmail(email);
                set({
                    session,
                    userEmail: email,
                    isPremium: isOwner ? true : false,
                });

                if (session?.user?.id) {
                    NotificationService.registerPushToken(session.user.id).catch(err => {
                        console.warn('[useStore] Error registering push token on session change:', err);
                    });
                }
            },
            signOut: async () => {
                const currentUserId = get().session?.user?.id;
                if (currentUserId) {
                    await NotificationService.unregisterPushToken(currentUserId).catch(() => {});
                }
                const { supabase } = await import('../lib/supabase');
                await supabase.auth.signOut();
                set({ session: null, userEmail: null, isPremium: false, lastSyncTime: null });
            },
            detailReminder: null,
            setDetailReminder: (reminder) => set({ detailReminder: reminder }),
            soundSettings: {
                normal: 'ping_brillante.wav',
                strict: 'buzzer_fabrica.wav',
                critical: 'alarma_fuego.mp3',
            },
            setSoundSetting: (level: 'normal' | 'strict' | 'critical', sound: string) => set(state => ({
                soundSettings: {
                    ...state.soundSettings,
                    [level]: sound
                }
            })),
            isPremium: false,
            setPremium: (status: boolean) => {
                const authEmail = get().session?.user?.email;
                const isOwner = isWhitelistedPremiumEmail(authEmail);
                set({ isPremium: isOwner ? true : status });
            },
            language: defaultLanguage,
            setLanguage: (lang: string) => set({ language: lang }),
            accentTheme: 'blue' as AccentTheme,
            setAccentTheme: (accentTheme: AccentTheme) => {
                set({ accentTheme });
                WidgetService.syncTheme(get().theme || 'system', accentTheme).catch(() => {});
                const session = get().session;
                if (session?.user?.id) {
                    import('../lib/supabase').then(({ supabase }) => {
                        supabase.auth.updateUser({
                            data: {
                                settings: {
                                    ...(session.user?.user_metadata?.settings || {}),
                                    accentTheme,
                                },
                            },
                        }).catch((e) => console.warn('[Accent] Could not sync accentTheme to cloud:', e));
                    });
                }
            },
            cloudSyncEnabled: true,
            setCloudSyncEnabled: (enabled: boolean) => set({ cloudSyncEnabled: enabled }),
            isSyncing: false,
            lastSyncTime: null,
            syncError: null,
            triggerSync: async (isInitialLogin = false, isBackground = false) => {
                const state = get();
                if (!state.session?.user?.id || state.isSyncing) return;

                // Cooldown inteligente para aperturas automáticas y reanudación desde segundo plano:
                // Si la sincronización es en segundo plano / automática (isBackground = true) y no es login inicial,
                // omitimos si la última sincronización ocurrió hace menos de 2.5 minutos (150 segundos).
                const BACKGROUND_SYNC_COOLDOWN_MS = 150 * 1000;
                if (isBackground && !isInitialLogin && state.lastSyncTime) {
                    const elapsed = Date.now() - state.lastSyncTime;
                    if (elapsed < BACKGROUND_SYNC_COOLDOWN_MS) {
                        return;
                    }
                }

                set({ isSyncing: true, syncError: null });
                try {
                    const { SyncService } = await import('../services/syncService');
                    const result = await SyncService.syncAll(state.session.user.id, isInitialLogin);
                    // Recargar datos locales inmediatamente para que todo lo descargado se refleje en la UI
                    await get().loadReminders();
                    await get().loadHistory();
                    await get().loadStreak();
                    try {
                        const { useNotesStore } = await import('./useNotesStore');
                        await useNotesStore.getState().loadNotes();
                    } catch (e) {
                        console.warn('[Sync] Could not reload notes store:', e);
                    }
                    try {
                        const { useFoldersStore } = await import('./useFoldersStore');
                        await useFoldersStore.getState().loadFolders();
                    } catch (e) {
                        console.warn('[Sync] Could not reload folders store:', e);
                    }
                    try {
                        const { useEventsStore } = await import('./useEventsStore');
                        await useEventsStore.getState().loadAllEvents();
                    } catch (e) {
                        console.warn('[Sync] Could not reload events store:', e);
                    }

                    if (result.success) {
                        set({ lastSyncTime: Date.now(), isSyncing: false });
                    } else {
                        set({ syncError: result.errors.join(', '), isSyncing: false });
                    }
                } catch (e: any) {
                    console.error('Sync failed:', e);
                    set({ syncError: e.message, isSyncing: false });
                }
            },
            streak: 0,
            loadStreak: async () => {
                try {
                    const streak = await ComplianceService.getCurrentStreak();
                    set({ streak });
                } catch (e) {
                    console.warn('Error loading streak in store:', e);
                }
            },
            homeViewMode: 'list',
            setHomeViewMode: (mode: 'list' | 'calendar') => set({ homeViewMode: mode }),
            tabTransitionDirection: 'none',
            setTabTransitionDirection: (direction: 'forward' | 'backward' | 'none') => set({ tabTransitionDirection: direction }),
            mainActiveTab: 'reminders',
            setMainActiveTab: (tab: 'reminders' | 'notes') => set({ mainActiveTab: tab }),
            widgetTextScale: 1.0,
            setWidgetTextScale: (scale: number) => {
                set({ widgetTextScale: scale });
                WidgetService.setTextScale(scale).catch(() => {});
            },
            widgetHighContrast: false,
            setWidgetHighContrast: (enabled: boolean) => {
                set({ widgetHighContrast: enabled });
                WidgetService.setHighContrast(enabled).catch(() => {});
            },
        }),
        {
            name: 'app-storage',
            storage: createJSONStorage(() => AsyncStorage),
            // Solo persistimos el tema y el onboarding para evitar conflictos de sincronización con SQLite
            partialize: (state) => ({
                theme: state.theme,
                onboardingCompleted: state.onboardingCompleted,
                userProfile: state.userProfile,
                userName: state.userName,
                userEmail: state.userEmail,
                defaultControlLevel: state.defaultControlLevel,
                soundSettings: state.soundSettings,
                isPremium: state.isPremium,
                language: state.language,
                accentTheme: state.accentTheme,
                cloudSyncEnabled: state.cloudSyncEnabled,
                lastSyncTime: state.lastSyncTime,
                homeViewMode: state.homeViewMode,
                widgetTextScale: state.widgetTextScale,
                widgetHighContrast: state.widgetHighContrast,
            }),
            onRehydrateStorage: () => (state) => {
                const sessionEmail = state?.session?.user?.email;
                // Si no hay sesión o el email guardado es el del propietario sin sesión activa, limpiarlo
                const effectiveEmail = sessionEmail || (state?.userEmail && !isWhitelistedPremiumEmail(state.userEmail) ? state.userEmail : null);
                const isOwner = isWhitelistedPremiumEmail(sessionEmail);
                useStore.setState({
                    isHydrated: true,
                    userEmail: effectiveEmail,
                    isPremium: isOwner ? true : (sessionEmail ? Boolean(state?.isPremium) : false),
                });
            },
        }
    )
);
