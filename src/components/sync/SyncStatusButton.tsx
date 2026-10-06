import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
    Alert,
    Text,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    RefreshCw,
    Cloud,
    CloudOff,
    Check,
    AlertCircle,
} from '@tamagui/lucide-icons';

import { useStore } from '../../store/useStore';
import { useVeyraTheme } from '../../theme/useVeyraTheme';

interface SyncStatusButtonProps {
    size?: number;
    showLabel?: boolean;
}

/**
 * SyncStatusButton — Botón e indicador de sincronización visual situado junto al avatar.
 * Muestra el estado en tiempo real (Sincronizando con giro 360°, Sincronizado con check verde, Error, o Modo local)
 * y permite disparar sincronización manual al tocarlo.
 */
export function SyncStatusButton({ size = 36, showLabel = false }: SyncStatusButtonProps) {
    const router = useRouter();
    const { t } = useTranslation();
    const { colors, accent, isDark } = useVeyraTheme();

    const session = useStore(state => state.session);
    const cloudSyncEnabled = useStore(state => state.cloudSyncEnabled);
    const isSyncing = useStore(state => state.isSyncing);
    const lastSyncTime = useStore(state => state.lastSyncTime);
    const syncError = useStore(state => state.syncError);
    const triggerSync = useStore(state => state.triggerSync);
    const language = useStore(state => state.language);

    const [justSynced, setJustSynced] = useState(false);
    const prevSyncingRef = useRef(isSyncing);

    // Animaciones
    const spinAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const checkScaleAnim = useRef(new Animated.Value(0)).current;
    const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null);
    const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

    // Control de giro cuando isSyncing cambia
    useEffect(() => {
        if (isSyncing) {
            setJustSynced(false);

            // Giro 360 continuo
            spinAnim.setValue(0);
            spinLoopRef.current = Animated.loop(
                Animated.timing(spinAnim, {
                    toValue: 1,
                    duration: 900,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            );
            spinLoopRef.current.start();

            // Pulso sutil de escala
            pulseAnim.setValue(1);
            pulseLoopRef.current = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.08,
                        duration: 600,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 600,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            );
            pulseLoopRef.current.start();
        } else {
            spinLoopRef.current?.stop();
            pulseLoopRef.current?.stop();
            spinAnim.setValue(0);
            pulseAnim.setValue(1);

            // Si acabamos de terminar de sincronizar exitosamente
            if (prevSyncingRef.current && !syncError) {
                setJustSynced(true);
                checkScaleAnim.setValue(0);
                Animated.spring(checkScaleAnim, {
                    toValue: 1,
                    friction: 5,
                    tension: 100,
                    useNativeDriver: true,
                }).start();

                const timer = setTimeout(() => {
                    setJustSynced(false);
                }, 2800);
                return () => clearTimeout(timer);
            }
        }

        prevSyncingRef.current = isSyncing;
        return () => {
            spinLoopRef.current?.stop();
            pulseLoopRef.current?.stop();
        };
    }, [isSyncing, syncError]);

    const handlePress = useCallback(() => {
        if (isSyncing) {
            return;
        }

        if (!session) {
            Alert.alert(
                language === 'es' ? 'Sincronización en la nube' : 'Cloud Synchronization',
                language === 'es'
                    ? 'Inicia sesión con tu cuenta para respaldar y sincronizar tus notas y recordatorios en todos tus dispositivos.'
                    : 'Sign in to sync your reminders and notes across all your devices.',
                [
                    { text: language === 'es' ? 'Más tarde' : 'Later', style: 'cancel' },
                    {
                        text: language === 'es' ? 'Iniciar sesión' : 'Sign in',
                        onPress: () => router.push('/login'),
                    },
                ]
            );
            return;
        }

        if (!cloudSyncEnabled) {
            Alert.alert(
                language === 'es' ? 'Sincronización desactivada' : 'Sync Disabled',
                language === 'es'
                    ? 'La sincronización en la nube está desactivada. ¿Deseas activarla en Ajustes?'
                    : 'Cloud sync is disabled. Would you like to enable it in Settings?',
                [
                    { text: language === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
                    {
                        text: language === 'es' ? 'Ir a Ajustes' : 'Go to Settings',
                        onPress: () => router.push('/settings'),
                    },
                ]
            );
            return;
        }

        if (syncError) {
            Alert.alert(
                language === 'es' ? 'Error al sincronizar' : 'Sync Error',
                language === 'es'
                    ? `Ocurrió un problema durante la sincronización:\n\n${syncError}\n\n¿Deseas reintentar ahora?`
                    : `A problem occurred during sync:\n\n${syncError}\n\nWould you like to retry now?`,
                [
                    { text: language === 'es' ? 'Cerrar' : 'Close', style: 'cancel' },
                    {
                        text: language === 'es' ? 'Reintentar' : 'Retry',
                        onPress: () => triggerSync(),
                    },
                ]
            );
            return;
        }

        // Sincronizar inmediatamente
        triggerSync();
    }, [isSyncing, session, cloudSyncEnabled, syncError, language, router, triggerSync]);

    const spinInterpolate = spinAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    // Determinar colores y estilos según el estado
    let buttonBg: string = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.035)';
    let buttonBorder: string = colors.borderSubtle;
    let iconColor: string = colors.textSecondary;

    if (isSyncing) {
        buttonBg = `${accent.primary}18`;
        buttonBorder = `${accent.primary}55`;
        iconColor = accent.primary;
    } else if (justSynced) {
        buttonBg = isDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.12)';
        buttonBorder = isDark ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.35)';
        iconColor = '#10B981';
    } else if (syncError) {
        buttonBg = isDark ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.12)';
        buttonBorder = isDark ? 'rgba(239, 68, 68, 0.45)' : 'rgba(239, 68, 68, 0.35)';
        iconColor = '#EF4444';
    } else if (!session) {
        iconColor = colors.textMuted;
    }

    return (
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={handlePress}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={[
                    styles.button,
                    {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        backgroundColor: buttonBg,
                        borderColor: buttonBorder,
                    },
                ]}
            >
                {isSyncing ? (
                    <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
                        <RefreshCw size={15} color={iconColor as any} strokeWidth={2.2} />
                    </Animated.View>
                ) : justSynced ? (
                    <Animated.View style={{ transform: [{ scale: checkScaleAnim }] }}>
                        <Check size={16} color="#10B981" strokeWidth={2.5} />
                    </Animated.View>
                ) : syncError ? (
                    <AlertCircle size={15} color="#EF4444" strokeWidth={2.2} />
                ) : session ? (
                    <View style={styles.cloudIconWrapper}>
                        <Cloud size={15} color={iconColor as any} strokeWidth={2} />
                        {/* Mini punto verde que denota sincronizado */}
                        <View style={styles.idleGreenDot} />
                    </View>
                ) : (
                    <CloudOff size={15} color={iconColor as any} strokeWidth={1.8} />
                )}
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    button: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        position: 'relative',
    },
    cloudIconWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    idleGreenDot: {
        position: 'absolute',
        bottom: -2,
        right: -3,
        width: 5.5,
        height: 5.5,
        borderRadius: 3,
        backgroundColor: '#10B981',
    },
});
