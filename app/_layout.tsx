import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import { TamaguiProvider, Theme, PortalProvider, PortalHost } from 'tamagui';
import tamaguiConfig from '../tamagui.config';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { initDatabase } from '../src/db';
import { StatusBar } from 'expo-status-bar';
import { NotificationService } from '../src/services/notificationService';
import * as Notifications from 'expo-notifications';
import { useStore } from '../src/store/useStore';
import { View, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { ReminderService } from '../src/services/reminderService';

const BACKGROUND_FETCH_TASK = 'background-reminder-check';

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    try {
        // Obtenemos recordatorios que deberían haber sonado y siguen pendientes
        const overdue = await ReminderService.getOverdueReminders();

        if (overdue.length > 0) {
            for (const reminder of overdue) {
                if (reminder.retry_count < (reminder.max_retries || 3)) {
                    // Notificación inmediata si se perdió la original
                    await NotificationService.scheduleImmediateNotification(reminder);
                    await ReminderService.incrementRetryCount(reminder.id);
                } else {
                    // Si ya intentamos suficientes veces, marcar como fallido
                    await ReminderService.markAsFailed(reminder.id);
                }
            }
            return BackgroundFetch.BackgroundFetchResult.NewData;
        }

        return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
        console.error('Background fetch failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

import { FloatingCreateButton } from '../src/components/FloatingCreateButton';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TopBar } from '../src/components/TopBar';

export default function RootLayout() {
    const [loaded] = useFonts({
        Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
        InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
    });

    const [dbReady, setDbReady] = useState(false);
    const [isAuthChecking, setIsAuthChecking] = useState(true);
    const router = useRouter();
    const theme = useStore(state => state.theme);
    const setSession = useStore(state => state.setSession);
    const session = useStore(state => state.session);
    const onboardingCompleted = useStore(state => state.onboardingCompleted);
    const isHydrated = useStore(state => state.isHydrated);

    // Listener de sesión de Supabase
    useEffect(() => {
        const checkSession = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                setSession(session);
            } catch (e) {
                console.error('Error checking session:', e);
            } finally {
                setIsAuthChecking(false);
            }
        };

        checkSession();

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setIsAuthChecking(false);
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, []);

    const segments = useSegments();

    // Lógica de redirección basada en auth y onboarding
    useEffect(() => {
        if (!isHydrated || !dbReady) return;

        const inAuthGroup = segments[0] === 'login' || segments[0] === 'register';
        const inOnboarding = segments[0] === 'onboarding';

        if (!onboardingCompleted) {
            // Si el onboarding no está hecho, obligamos a ir allí (a menos que quiera loguearse)
            if (!inOnboarding && !inAuthGroup) {
                router.replace('/onboarding');
            }
        } else {
            // Onboarding hecho: si está en onboarding, lo mandamos al home
            if (inOnboarding) {
                router.replace('/');
            }
            // No obligamos a login. El usuario puede elegir loguearse desde settings o TopBar.
        }
    }, [session, isHydrated, onboardingCompleted, segments, dbReady, isAuthChecking]);

    useEffect(() => {
        async function prepare() {
            try {
                await initDatabase();
                await NotificationService.setup();
                await NotificationService.requestPermissions();
                await NotificationService.registerCategories();

                // Registrar tarea de background
                await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
                    minimumInterval: 15 * 60, // 15 minutos
                    stopOnTerminate: false,
                    startOnBoot: true,
                });

                setDbReady(true);
            } catch (err) {
                console.error('Initialization Failed:', err);
                setDbReady(true); // Permitir entrar aunque falle lo no crítico
            }
        }
        prepare();

        const subscription = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data;
            const reminderId = data.reminderId as string;
            const actionId = response.actionIdentifier;

            if (reminderId) {
                if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
                    router.push(`/confirm/${reminderId}`);
                } else if (actionId === 'DONE') {
                    useStore.getState().markAsCompleted(reminderId);
                } else if (actionId === 'SNOOZE') {
                    useStore.getState().snoozeReminder(reminderId, 10);
                }
            }
        });

        return () => subscription.remove();
    }, []);

    if (!loaded || !dbReady || !isHydrated || isAuthChecking) {
        return (
            <View style={{ flex: 1, backgroundColor: theme === 'dark' ? '#0a0a0a' : '#F8FAFC', justifyContent: 'center', alignItems: 'center' }}>
                <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
                <PortalProvider shouldAddRootHost>
                    <SafeAreaProvider>
                        <Theme name={theme}>
                            <View style={{ flex: 1, backgroundColor: theme === 'dark' ? '#0a0a0a' : '#F8FAFC' }}>
                                {/* Solo mostramos el TopBar en las rutas principales */}
                                {/* Se oculta el TopBar en onboarding, auth y pantallas de creación/edición */}
                                {segments[0] !== 'onboarding' &&
                                    segments[0] !== 'login' &&
                                    segments[0] !== 'register' &&
                                    segments[0] !== 'confirm' &&
                                    segments[0] !== 'create' &&
                                    !(segments[0] === 'notes' && segments.length > 1) && (
                                        <SafeAreaView edges={['top']} style={{ backgroundColor: theme === 'dark' ? '#0a0a0a' : '#F8FAFC', zIndex: 9999 }}>
                                            <TopBar />
                                        </SafeAreaView>
                                    )}
                                <Stack screenOptions={{
                                    headerShown: false,
                                    contentStyle: { backgroundColor: theme === 'dark' ? '#0a0a0a' : '#F8FAFC' },
                                    freezeOnBlur: true
                                }}>
                                    <Stack.Screen name="index" options={{ title: 'Recordatorios' }} />
                                    <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
                                    <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
                                    <Stack.Screen name="register" options={{ headerShown: false, animation: 'fade' }} />
                                    <Stack.Screen name="create" options={{ presentation: 'modal', title: 'Nuevo' }} />
                                    <Stack.Screen name="settings" options={{
                                        presentation: 'card',
                                        animation: 'default',
                                    }} />
                                    <Stack.Screen name="sounds" options={{
                                        presentation: 'card',
                                        animation: 'default',
                                    }} />
                                    <Stack.Screen name="confirm/[id]" options={{ presentation: 'fullScreenModal', headerShown: false }} />
                                </Stack>
                                <FloatingCreateButton />
                                <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
                            </View>
                        </Theme>
                    </SafeAreaProvider>
                </PortalProvider>
            </TamaguiProvider>
        </GestureHandlerRootView>
    );
}

