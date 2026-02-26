import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReminderService } from '../services/reminderService';
import { NotificationService } from '../services/notificationService';
import { ComplianceService } from '../services/complianceService';
import { Reminder, ControlLevel, ReminderStatus } from '../types/db';
import { AccentTheme } from '../theme/accentColors';

interface AppState {
    reminders: Reminder[];
    history: Reminder[];
    theme: 'light' | 'dark';
    isLoading: boolean;
    loadReminders: () => Promise<void>;
    loadHistory: () => Promise<void>;
    addReminder: (title: string, dueDate: number, controlLevel: ControlLevel, description?: string, repeatRule?: string, attachments?: string, links?: string) => Promise<void>;
    markAsCompleted: (id: string) => Promise<void>;
    updateReminder: (id: string, updates: Partial<Reminder>) => Promise<void>;
    deleteReminder: (id: string) => Promise<void>;
    deleteReminders: (ids: string[]) => Promise<void>;
    restoreReminder: (id: string) => Promise<void>;
    deleteForever: (id: string) => Promise<void>;
    snoozeReminder: (id: string, minutes: number, isMassSnooze?: boolean) => Promise<void>;
    toggleTheme: () => void;
    setTheme: (theme: 'light' | 'dark') => void;
    onboardingCompleted: boolean;
    userProfile: 'student' | 'work' | 'personal' | 'custom' | null;
    userName: string | null;
    userEmail: string | null;
    completeOnboarding: () => void;
    setUserProfile: (profile: 'student' | 'work' | 'personal' | 'custom') => void;
    setUserName: (name: string) => void;
    setUserEmail: (email: string) => void;
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
    triggerSync: () => Promise<void>;
    accentTheme: AccentTheme;
    setAccentTheme: (theme: AccentTheme) => void;
}

export const useStore = create<AppState>()(
    persist(
        (set, get) => ({
            reminders: [],
            history: [],
            theme: 'light',
            isLoading: false,

            loadReminders: async () => {
                set({ isLoading: true });
                try {
                    const reminders = await ReminderService.getReminders();
                    set({ reminders });
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

            addReminder: async (title, dueDate, controlLevel, description, repeatRule, attachments, links) => {
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
                    const reminder = await ReminderService.createReminder(title, dueDate, controlLevel, userId, description, repeatRule, attachments, links);
                    const notifIds = await NotificationService.scheduleReminderNotification(reminder);
                    if (notifIds.length > 0) {
                        await ReminderService.updateReminder(reminder.id, { notification_ids: JSON.stringify(notifIds) });
                    }
                    await get().loadReminders();
                } catch (error) {
                    console.error('Failed to create reminder', error);
                }
            },

            markAsCompleted: async (id) => {
                try {
                    let reminder = get().reminders.find(r => r.id === id);
                    if (!reminder) {
                        reminder = await ReminderService.getReminderById(id) || undefined;
                    }
                    if (!reminder) return;

                    const storedIds = reminder.notification_ids ? JSON.parse(reminder.notification_ids) : [];
                    await NotificationService.cancelNotificationsForReminder(id, storedIds);

                    await ReminderService.markAsCompleted(id);
                    await ComplianceService.logEvent(id, 'completed');

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
                                const notifIds = await NotificationService.scheduleReminderNotification(nextReminder);
                                if (notifIds.length > 0) {
                                    await ReminderService.updateReminder(nextReminder.id, { notification_ids: JSON.stringify(notifIds) });
                                }
                            }
                        }
                    }

                    await get().loadReminders();
                } catch (error) {
                    console.error('Failed to complete reminder', error);
                }
            },

            updateReminder: async (id, updates) => {
                try {
                    await ReminderService.updateReminder(id, updates);
                    const reminder = get().reminders.find(r => r.id === id);

                    if (reminder) {
                        // Always cancel old notifications when updating critical fields
                        if (updates.due_date_ms || updates.title || updates.control_level) {
                            const storedIds = reminder.notification_ids ? JSON.parse(reminder.notification_ids) : [];
                            await NotificationService.cancelNotificationsForReminder(id, storedIds);

                            const updatedReminder = { ...reminder, ...updates };
                            const notifIds = await NotificationService.scheduleReminderNotification(updatedReminder);

                            if (notifIds.length > 0) {
                                await ReminderService.updateReminder(id, { notification_ids: JSON.stringify(notifIds) });
                            }
                        }
                    }
                    await get().loadReminders();
                } catch (error) {
                    console.error('Failed to update reminder', error);
                }
            },

            deleteReminder: async (id) => {
                try {
                    const reminder = get().reminders.find(r => r.id === id);
                    const storedIds = reminder?.notification_ids ? JSON.parse(reminder.notification_ids) : [];
                    await NotificationService.cancelNotificationsForReminder(id, storedIds);

                    await ReminderService.deleteReminder(id);
                    await ComplianceService.logEvent(id, 'failed');
                    await get().loadReminders();
                } catch (error) {
                    console.error('Failed to delete reminder', error);
                }
            },

            deleteReminders: async (ids) => {
                try {
                    for (const id of ids) {
                        const reminder = get().reminders.find(r => r.id === id);
                        const storedIds = reminder?.notification_ids ? JSON.parse(reminder.notification_ids) : [];
                        await NotificationService.cancelNotificationsForReminder(id, storedIds);
                        await ReminderService.deleteReminder(id);
                        await ComplianceService.logEvent(id, 'failed');
                    }
                    await get().loadReminders();
                } catch (error) {
                    console.error('Failed to delete reminders', error);
                }
            },

            restoreReminder: async (id) => {
                try {
                    await ReminderService.restoreReminder(id);
                    await get().loadReminders();
                    await get().loadHistory();
                } catch (error) {
                    console.error('Failed to restore reminder', error);
                }
            },

            deleteForever: async (id) => {
                try {
                    await ReminderService.deleteForever(id);
                    await get().loadHistory();
                } catch (error) {
                    console.error('Failed to delete reminder forever', error);
                }
            },

            snoozeReminder: async (id: string, minutes: number, isMassSnooze: boolean = false) => {
                try {
                    let reminder = get().reminders.find(r => r.id === id);
                    if (!reminder) {
                        reminder = await ReminderService.getReminderById(id) || undefined;
                    }
                    if (!reminder) return;

                    const newTime = Date.now() + (minutes * 60 * 1000);
                    const storedIds = reminder.notification_ids ? JSON.parse(reminder.notification_ids) : [];

                    await NotificationService.cancelNotificationsForReminder(id, storedIds);

                    const updatedReminder = { ...reminder, due_date_ms: newTime };
                    const notifIds = await NotificationService.scheduleReminderNotification(updatedReminder);

                    await ReminderService.updateReminder(id, {
                        due_date_ms: newTime,
                        notification_ids: JSON.stringify(notifIds)
                    });

                    await ComplianceService.logEvent(id, isMassSnooze ? 'mass_snooze' : 'snoozed');
                    await get().loadReminders();
                } catch (error) {
                    console.error('Failed to snooze reminder', error);
                }
            },

            toggleTheme: () => {
                set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' }));
            },

            setTheme: (theme) => set({ theme }),

            onboardingCompleted: false,
            userProfile: null,
            userName: null,
            userEmail: null,
            completeOnboarding: () => set({ onboardingCompleted: true }),
            setUserProfile: (profile) => set({ userProfile: profile }),
            setUserName: (name) => set({ userName: name }),
            setUserEmail: (email) => set({ userEmail: email }),
            defaultControlLevel: 'normal',
            setDefaultControlLevel: (level: ControlLevel) => set({ defaultControlLevel: level }),
            isHydrated: false,
            session: null,
            setSession: (session) => set({ session }),
            signOut: async () => {
                const { supabase } = await import('../lib/supabase');
                await supabase.auth.signOut();
                set({ session: null });
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
            setPremium: (status: boolean) => set({ isPremium: status }),
            language: 'es',
            setLanguage: (lang: string) => set({ language: lang }),
            accentTheme: 'purple' as AccentTheme,
            setAccentTheme: (accentTheme: AccentTheme) => set({ accentTheme }),
            cloudSyncEnabled: false,
            setCloudSyncEnabled: (enabled: boolean) => set({ cloudSyncEnabled: enabled }),
            isSyncing: false,
            lastSyncTime: null,
            syncError: null,
            triggerSync: async () => {
                const state = get();
                if (!state.session?.user?.id || state.isSyncing) return;
                set({ isSyncing: true, syncError: null });
                try {
                    const { SyncService } = await import('../services/syncService');
                    const result = await SyncService.syncAll(state.session.user.id);
                    if (result.success) {
                        set({ lastSyncTime: Date.now(), isSyncing: false });
                        // Recargar datos locales después del sync
                        await get().loadReminders();
                        await get().loadHistory();
                    } else {
                        set({ syncError: result.errors.join(', '), isSyncing: false });
                    }
                } catch (e: any) {
                    console.error('Sync failed:', e);
                    set({ syncError: e.message, isSyncing: false });
                }
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
            }),
            onRehydrateStorage: () => (state) => {
                useStore.setState({ isHydrated: true });
            },
        }
    )
);
