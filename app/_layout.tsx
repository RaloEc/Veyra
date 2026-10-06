import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import { TamaguiProvider, Theme, PortalProvider, PortalHost } from 'tamagui';
import tamaguiConfig from '../tamagui.config';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { useEffect, useState, useRef, useCallback } from 'react';
import { initDatabase } from '../src/db';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { NotificationService } from '../src/services/notificationService';
import * as Notifications from 'expo-notifications';
import { useStore } from '../src/store/useStore';
import { View, Platform, BackHandler, useColorScheme, ActivityIndicator, AppState } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { ReminderService } from '../src/services/reminderService';
import { WidgetService } from '../src/services/widgetService';
import '../src/lib/i18n';
import i18n from 'i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { VEYRA_TOKENS } from '../src/theme/tokens';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { RealtimeService } from '../src/services/realtimeService';
import * as Linking from 'expo-linking';

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
    const segments = useSegments();


    useEffect(() => {
        if (Platform.OS === 'android') {
            try {
                if (typeof NavigationBar.setStyle === 'function') {
                    NavigationBar.setStyle(navBarStyle);
                }
                if (typeof NavigationBar.setHidden === 'function') {
                    NavigationBar.setHidden(false);
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
                <Stack.Screen name="notes/[id]" options={{ presentation: 'card', animation: 'fade', animationDuration: 220, contentStyle: { backgroundColor: mainBg } }} />
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
                <Stack.Screen name="join" options={{ presentation: 'modal', animation: 'slide_from_bottom', headerShown: false }} />
                <Stack.Screen name="collab/[id]" options={{ presentation: 'card', animation: 'slide_from_right', headerShown: false }} />
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
    const systemColorScheme = useColorScheme();
    const themeSetting = useStore(state => state.theme);
    const resolvedTheme: 'light' | 'dark' = themeSetting === 'system'
        ? (systemColorScheme === 'dark' ? 'dark' : 'light')
        : (themeSetting || 'dark');
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
        }, 1500);

        const checkSession = async () => {
            try {
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session check timeout')), 1200)
                );
                const { data: { session } } = (await Promise.race([sessionPromise, timeoutPromise])) as any;
                if (isMounted) setSession(session);
            } catch (e: any) {
                console.warn('[Auth] Session check timed out or failed:', e);
                // Si el refresh token es inválido o no se encuentra en el servidor, limpiar sesión huérfana
                const errMsg = String(e?.message || '');
                if (errMsg.includes('Refresh Token') || errMsg.includes('refresh_token_not_found') || e?.name === 'AuthApiError') {
                    console.log('[Auth] Limpiando sesión huérfana de almacenamiento local...');
                    await supabase.auth.signOut().catch(() => {});
                    if (isMounted) setSession(null);
                }
            } finally {
                if (isMounted) {
                    clearTimeout(safetyTimer);
                    setIsAuthChecking(false);
                }
            }
        };

        checkSession();

        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT') {
                if (isMounted) {
                    setSession(null);
                    setIsAuthChecking(false);
                }
            } else if (event === 'USER_DELETED') {
                await supabase.auth.signOut().catch(() => {});
                if (isMounted) {
                    setSession(null);
                    setIsAuthChecking(false);
                }
            } else if (isMounted) {
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

    // Auto-sync inteligente con cooldown cuando el usuario tiene sesión y sync habilitado
    useEffect(() => {
        if (!isHydrated || !dbReady || !session?.user?.id || !cloudSyncEnabled) return;

        // Sync inicial en segundo plano al entrar (respetará el cooldown de 2.5 min si ya sincronizó)
        triggerSync(false, true);

        // Sync periódico en segundo plano cada 5 minutos mientras la app esté abierta
        const syncInterval = setInterval(() => {
            triggerSync(false, true);
        }, 5 * 60 * 1000);

        return () => clearInterval(syncInterval);
    }, [session?.user?.id, cloudSyncEnabled, isHydrated, dbReady]);

    // Escucha en vivo de cambios colaborativos (Realtime WebSockets)
    useEffect(() => {
        if (session?.user?.id && dbReady) {
            RealtimeService.startListening(session.user.id);
        } else {
            RealtimeService.stopListening();
        }
        return () => {
            RealtimeService.stopListening();
        };
    }, [session?.user?.id, dbReady]);

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

    const isAppReady = loaded && dbReady && isHydrated && !isAuthChecking;
    const pendingConfirmIdRef = useRef<string | null>(null);
    const lastNavigatedRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

    const navigateToConfirm = useCallback((reminderId: string) => {
        if (!reminderId) return;
        const cleanId = String(reminderId).trim();
        if (!cleanId || cleanId === 'undefined' || cleanId === 'null') return;

        const now = Date.now();
        // Evitar dobles navegaciones instantáneas concurrentes (linking + notification response listener)
        if (lastNavigatedRef.current.id === cleanId && (now - lastNavigatedRef.current.time) < 1500) {
            console.log(`[Navigation] Saltando navegación duplicada para: ${cleanId}`);
            return;
        }

        if (!isAppReady) {
            console.log(`[Navigation] App inicializándose, encolando navegación a confirm/${cleanId}`);
            pendingConfirmIdRef.current = cleanId;
            return;
        }

        console.log(`[Navigation] Ejecutando navegación directa a confirm/${cleanId}`);
        lastNavigatedRef.current = { id: cleanId, time: now };
        pendingConfirmIdRef.current = null;

        try {
            router.navigate(`/confirm/${cleanId}`);
        } catch (err) {
            console.warn('[Navigation] router.navigate falló, reintentando con router.push:', err);
            try {
                router.push(`/confirm/${cleanId}`);
            } catch (pushErr) {
                console.error('[Navigation] Error fatal navegando a confirm:', pushErr);
            }
        }
    }, [isAppReady, router]);

    // Cuando la app termine de cargar (BD, fuentes, auth, store), si había un destino pendiente de la notificación, navegar de inmediato
    useEffect(() => {
        if (isAppReady && pendingConfirmIdRef.current) {
            const targetId = pendingConfirmIdRef.current;
            pendingConfirmIdRef.current = null;
            const timer = setTimeout(() => {
                navigateToConfirm(targetId);
            }, 60);
            return () => clearTimeout(timer);
        }
    }, [isAppReady, navigateToConfirm]);

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
                WidgetService.processPendingActions()
                    .then(() => WidgetService.syncAll())
                    .catch(err => console.warn('[Widget] Startup sync error:', err));
                WidgetService.syncTheme(
                    useStore.getState().theme || 'system',
                    useStore.getState().accentTheme || 'blue'
                ).catch(() => {});
                WidgetService.syncAccessibility(
                    useStore.getState().widgetTextScale ?? 1.0,
                    useStore.getState().widgetHighContrast ?? false
                ).catch(() => {});
            } catch (err) {
                console.error('Initialization Failed:', err);
                setDbReady(true); // Permitir entrar aunque falle lo no crítico
            }
        }
        prepare();

        const subscription = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data;
            const reminderId = data?.reminderId as string;
            const targetType = data?.targetType as string;
            const targetId = data?.targetId as string;
            const actionId = response.actionIdentifier;
            console.log(`[NotificationResponse] Accion recibida: "${actionId}" para reminder: "${reminderId || targetId}"`);

            if (reminderId) {
                if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
                    navigateToConfirm(reminderId);
                } else if (actionId === 'DONE') {
                    useStore.getState().markAsCompleted(reminderId);
                } else if (actionId === 'SNOOZE') {
                    useStore.getState().snoozeReminder(reminderId, 10);
                }
            } else if (targetType && targetId && actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
                if (targetType === 'reminder') {
                    router.push(`/reminder/${targetId}` as any);
                } else if (targetType === 'note') {
                    router.push(`/notes/${targetId}` as any);
                } else if (targetType === 'folder') {
                    router.push('/notes' as any);
                }
            }
        });

        // Escucha en primer plano: si otro usuario completa un recordatorio compartido, cancelar alarmas locales
        const foregroundNotificationSub = Notifications.addNotificationReceivedListener(notification => {
            const data = notification.request.content.data;
            if (data?.targetType === 'reminder' && data?.action === 'completed' && data?.targetId) {
                NotificationService.cancelNotificationsForReminder(data.targetId as string);
                useStore.getState().loadReminders();
            }
        });

        // Manejo de apertura en frío (Cold Start) cuando la notificación despierta la app
        Notifications.getLastNotificationResponseAsync().then(response => {
            if (response) {
                const data = response.notification.request.content.data;
                const reminderId = data?.reminderId as string;
                const targetType = data?.targetType as string;
                const targetId = data?.targetId as string;
                const actionId = response.actionIdentifier;
                console.log(`[NotificationResponse] Cold start respuesta: "${actionId}" para reminder: "${reminderId || targetId}"`);
                if (reminderId && actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
                    navigateToConfirm(reminderId);
                } else if (targetType && targetId && actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
                    if (targetType === 'reminder') {
                        router.push(`/reminder/${targetId}` as any);
                    } else if (targetType === 'note') {
                        router.push(`/notes/${targetId}` as any);
                    } else if (targetType === 'folder') {
                        router.push('/notes' as any);
                    }
                }
            }
        }).catch(err => {
            console.warn('[Notifications] Error getting last response:', err);
        });

        // Manejo de Deep Links entrantes (AlarmBroadcastReceiver veyra://confirm/{id}, veyra://join?code=XYZ)
        const handleIncomingUrl = (url: string) => {
            console.log('[RootLayout] DeepLink URL received:', url);
            if (!url) return;

            if (url.includes('confirm/')) {
                const match = url.match(/confirm\/([^/?#]+)/);
                if (match && match[1]) {
                    navigateToConfirm(match[1]);
                }
            } else if (url.includes('join')) {
                try {
                    const parsed = Linking.parse(url);
                    const code = (parsed.queryParams?.code as string) || (parsed.path?.split('/')[1]);
                    const importParam = parsed.queryParams?.import as string;
                    if (code) {
                        router.push({ pathname: '/join', params: { code } });
                    } else if (importParam) {
                        router.push({ pathname: '/join', params: { import: importParam } });
                    }
                } catch (e) {
                    console.warn('[RootLayout] Error parsing join deep link:', e);
                }
            } else if (url.includes('schedule')) {
                try {
                    const match = url.match(/schedule\/([^/?#]+)/);
                    const rawId = match && match[1] ? match[1] : undefined;
                    const cleanId = rawId ? rawId.split('_')[0] : undefined;
                    router.push({ pathname: '/schedule', params: cleanId ? { id: cleanId } : undefined } as any);
                } catch (e) {
                    console.warn('[RootLayout] Error parsing schedule deep link:', e);
                }
            }
        };

        const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
            handleIncomingUrl(url);
        });

        Linking.getInitialURL().then(initialUrl => {
            if (initialUrl) {
                handleIncomingUrl(initialUrl);
            }
        }).catch(() => {});

        // Sincronizar y procesar acciones del widget y nube al volver a primer plano
        const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'active') {
                WidgetService.processPendingActions()
                    .then(() => WidgetService.syncAll())
                    .catch(() => {});

                // Sincronización en segundo plano con Supabase al reabrir la app (respetando cooldown de 2.5 min)
                const state = useStore.getState();
                if (state.session?.user?.id && state.cloudSyncEnabled && !state.isSyncing) {
                    state.triggerSync(false, true).catch(() => {});
                }
            }
        });

        return () => {
            subscription.remove();
            foregroundNotificationSub.remove();
            linkingSubscription.remove();
            appStateSubscription.remove();
        };
    }, [navigateToConfirm, router]);

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

    if (!isAppReady) {
        return (
            <View style={{ flex: 1, backgroundColor: resolvedTheme === 'dark' ? VEYRA_TOKENS.colors.dark.bg : VEYRA_TOKENS.colors.light.bg, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ErrorBoundary>
                <TamaguiProvider config={tamaguiConfig} defaultTheme={resolvedTheme}>
                    <PortalProvider shouldAddRootHost>
                        <SafeAreaProvider>
                            <Theme name={resolvedTheme}>
                                <AppShell theme={resolvedTheme} />
                            </Theme>
                        </SafeAreaProvider>
                    </PortalProvider>
                </TamaguiProvider>
            </ErrorBoundary>
        </GestureHandlerRootView>
    );
}
