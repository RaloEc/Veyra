import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import { TamaguiProvider, Theme, PortalProvider, PortalHost } from 'tamagui';
import tamaguiConfig from '../tamagui.config';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { initDatabase } from '../src/db';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { NotificationService } from '../src/services/notificationService';
import * as Notifications from 'expo-notifications';
import { useStore } from '../src/store/useStore';
import { View, Platform, BackHandler } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { ReminderService } from '../src/services/reminderService';
import '../src/lib/i18n';
import i18n from 'i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { VEYRA_TOKENS } from '../src/theme/tokens';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

const BACKGROUND_FETCH_TASK = 'background-reminder-check';

// Tarea de seguridad no-op: si un APK anterior dejó el Job registrado en el sistema operativo,
// responde instantáneamente en 0ms y se desregistra para evitar cualquier congelamiento (ANR).
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    try {
        await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    } catch {}
    return BackgroundFetch.BackgroundFetchResult.NoData;
});

function AppShell({ theme }: { theme: 'dark' | 'light' }) {
    const insets = useSafeAreaInsets();

    // Sincronizar barra de navegación nativa de Android con el tema y la barra inferior
    const navBarStyle = theme === 'dark' ? 'light' : 'dark';

    useEffect(() => {
        if (Platform.OS === 'android') {
            try {
                if (typeof NavigationBar.setStyle === 'function') {
                    NavigationBar.setStyle(navBarStyle);
                }
            } catch (err) {
                console.warn('[NavigationBar] Failed to set navigation bar style:', err);
            }
        }
    }, [navBarStyle]);

    const mainBg = theme === 'dark' ? VEYRA_TOKENS.colors.dark.bg : VEYRA_TOKENS.colors.light.bg;

    return (
        <View style={{ flex: 1, backgroundColor: mainBg }}>
            <Stack screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: mainBg },
                animation: 'none',
            }}>
                <Stack.Screen name="index" options={{ title: 'Recordatorios', presentation: 'card', animation: 'none', contentStyle: { backgroundColor: mainBg } }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
                <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
                <Stack.Screen name="register" options={{ headerShown: false, animation: 'fade' }} />
                <Stack.Screen name="forgot-password" options={{ headerShown: false, animation: 'slide_from_right' }} />
                <Stack.Screen name="create" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
                <Stack.Screen name="events/create" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
                <Stack.Screen name="reminder/[id]" options={{ presentation: 'card', animation: 'fade', animationDuration: 240, contentStyle: { backgroundColor: mainBg } }} />
                <Stack.Screen name="history" options={{ presentation: 'card', animation: 'fade_from_bottom', animationDuration: 180, title: 'Historial' }} />
                <Stack.Screen name="notes/index" options={{ title: 'Notas', presentation: 'card', animation: 'none', contentStyle: { backgroundColor: mainBg } }} />
                <Stack.Screen name="notes/create" options={{ presentation: 'card', animation: 'fade', animationDuration: 240, contentStyle: { backgroundColor: mainBg } }} />
                <Stack.Screen name="notes/[id]" options={{ presentation: 'card', animation: 'fade', animationDuration: 240, contentStyle: { backgroundColor: mainBg } }} />
                <Stack.Screen name="notes-history" options={{ presentation: 'card', animation: 'fade_from_bottom', animationDuration: 180, title: 'Papelera de Notas' }} />
                <Stack.Screen name="settings" options={{
                    presentation: 'card',
                    animation: 'slide_from_right',
                }} />
                <Stack.Screen name="sounds" options={{
                    presentation: 'card',
                    animation: 'slide_from_right',
                }} />

                <Stack.Screen name="confirm/[id]" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            </Stack>
            <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        </View>
    );
}

export default function RootLayout() {
    const [loaded] = useFonts({
        Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
        InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
    });

    const [dbReady, setDbReady] = useState(false);
    const [isAuthChecking, setIsAuthChecking] = useState(true);
    const router = useRouter();
    const pathname = usePathname();
    const theme = useStore(state => state.theme);
    const setSession = useStore(state => state.setSession);
    const session = useStore(state => state.session);
    const onboardingCompleted = useStore(state => state.onboardingCompleted);
    const isHydrated = useStore(state => state.isHydrated);
    const language = useStore(state => state.language);
    const cloudSyncEnabled = useStore(state => state.cloudSyncEnabled);
    const triggerSync = useStore(state => state.triggerSync);

    // Listener de sesión de Supabase con timeout de seguridad para evitar ANR
    useEffect(() => {
        let isMounted = true;
        const safetyTimer = setTimeout(() => {
            if (isMounted) setIsAuthChecking(false);
        }, 5000);

        const checkSession = async () => {
            try {
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session check timeout')), 4000)
                );
                const { data: { session } } = (await Promise.race([sessionPromise, timeoutPromise])) as any;
                if (isMounted) setSession(session);
            } catch (e) {
                console.warn('[Auth] Session check timed out or failed:', e);
            } finally {
                if (isMounted) {
                    clearTimeout(safetyTimer);
                    setIsAuthChecking(false);
                }
            }
        };

        checkSession();

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (isMounted) {
                setSession(session);
                setIsAuthChecking(false);
            }
        });

        return () => {
            isMounted = false;
            clearTimeout(safetyTimer);
            authListener.subscription.unsubscribe();
        };
    }, []);

    // Auto-sync cuando el usuario tiene sesión y sync habilitado
    useEffect(() => {
        if (!isHydrated || !dbReady || !session?.user?.id || !cloudSyncEnabled) return;

        // Sync inicial al entrar
        triggerSync();

        // Sync periódico cada 5 minutos
        const syncInterval = setInterval(() => {
            triggerSync();
        }, 5 * 60 * 1000);

        return () => clearInterval(syncInterval);
    }, [session?.user?.id, cloudSyncEnabled, isHydrated, dbReady]);

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
            // Onboarding hecho: El usuario puede navegar libremente.
            // No obligamos a login. El usuario puede elegir loguearse desde settings o TopBar.
        }
    }, [session, isHydrated, onboardingCompleted, segments, dbReady, isAuthChecking]);

    // Manejo del botón físico de Atrás (Android)
    useEffect(() => {
        const backAction = () => {
            const inAuthGroup = segments[0] === 'login' || segments[0] === 'register' || segments[0] === 'onboarding';

            // Si no estamos en el Home, no estamos en auth, y el stack no tiene a donde volver nativamente
            if (pathname !== '/' && !inAuthGroup && !router.canGoBack()) {
                router.replace('/');
                return true; // Previene salir de la app
            }
            return false;
        };

        const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
        return () => backHandler.remove();
    }, [pathname, segments, router]);

    useEffect(() => {
        async function prepare() {
            try {
                await initDatabase();
                await NotificationService.setup();
                const initialSounds = useStore.getState().soundSettings;
                await NotificationService.requestPermissions(initialSounds);
                await NotificationService.registerCategories();
                await NotificationService.getDiagnosticInfo();

                // Asegurar que no quede ninguna tarea de fondo periódica activa (previene ANR cuando la app está cerrada)
                const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient || Constants.appOwnership === 'expo';
                if (!isExpoGo) {
                    try {
                        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
                        if (isRegistered) {
                            await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
                        }
                    } catch (bfErr) {
                        // Silenciar error no crítico
                    }
                }

                setDbReady(true);
            } catch (err) {
                console.error('Initialization Failed:', err);
                setDbReady(true); // Permitir entrar aunque falle lo no crítico
            }
        }
        prepare();

        const subscription = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data;
            const reminderId = data?.reminderId as string;
            const actionId = response.actionIdentifier;
            console.log(`[NotificationResponse] Accion recibida: "${actionId}" para reminder: "${reminderId}"`);

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

        // Manejo de apertura en frío (Cold Start) cuando la alarma despierta la app
        Notifications.getLastNotificationResponseAsync().then(response => {
            if (response) {
                const data = response.notification.request.content.data;
                const reminderId = data?.reminderId as string;
                const actionId = response.actionIdentifier;
                console.log(`[NotificationResponse] Cold start respuesta: "${actionId}" para reminder: "${reminderId}"`);
                if (reminderId) {
                    if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
                        router.push(`/confirm/${reminderId}`);
                    } else if (actionId === 'DONE') {
                        useStore.getState().markAsCompleted(reminderId);
                    } else if (actionId === 'SNOOZE') {
                        useStore.getState().snoozeReminder(reminderId, 10);
                    }
                }
            }
        }).catch(err => {
            console.warn('[Notifications] Error getting last response:', err);
        });

        return () => subscription.remove();
    }, []);

    // Sincronizar idioma de i18n con el store
    useEffect(() => {
        if (isHydrated && i18n.language !== language) {
            i18n.changeLanguage(language);
            // Actualizar categorías de notificación con el nuevo idioma
            if (dbReady) {
                NotificationService.registerCategories();
            }
        }
    }, [language, isHydrated, dbReady]);

    if (!loaded || !dbReady || !isHydrated || isAuthChecking) {
        return (
            <View style={{ flex: 1, backgroundColor: theme === 'dark' ? VEYRA_TOKENS.colors.dark.bg : VEYRA_TOKENS.colors.light.bg, justifyContent: 'center', alignItems: 'center' }}>
                <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ErrorBoundary>
                <TamaguiProvider config={tamaguiConfig} defaultTheme={theme}>
                    <PortalProvider shouldAddRootHost>
                        <SafeAreaProvider>
                            <Theme name={theme}>
                                <AppShell theme={theme} />
                            </Theme>
                        </SafeAreaProvider>
                    </PortalProvider>
                </TamaguiProvider>
            </ErrorBoundary>
        </GestureHandlerRootView>
    );
}
