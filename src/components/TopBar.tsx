import React, { useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Flame, MoreVertical, History, Share2 } from '@tamagui/lucide-icons';

import { useStore } from '../store/useStore';
import { useVeyraTheme } from '../theme/useVeyraTheme';
import { VeyraSurface } from './ui/VeyraSurface';

interface TopBarProps {
    title?: string;
    onHistoryPress?: () => void;
    onSharePress?: () => void;
    onOptionsPress?: () => void;
}

/**
 * TopBar — Barra de navegación superior con saludo contextual, contador de racha
 * e indicador de progreso de sincronización en tiempo real.
 */
export const TopBar = React.memo(function TopBar({
    title,
    onHistoryPress,
    onSharePress,
    onOptionsPress,
}: TopBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { t } = useTranslation();
    const { colors, typography, isDark } = useVeyraTheme();

    const userName = useStore(state => state.userName);
    const session = useStore(state => state.session);
    const language = useStore(state => state.language);
    const streak = useStore(state => state.streak);
    const loadStreak = useStore(state => state.loadStreak);

    useEffect(() => {
        loadStreak();
    }, []);

    // Saludo según la hora del día (para cuando no hay sesión iniciada)
    const timeGreeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) {
            return t('home.good_morning', { defaultValue: 'Buenos días' });
        } else if (hour >= 12 && hour < 19) {
            return t('home.good_afternoon', { defaultValue: 'Buenas tardes' });
        } else {
            return t('home.good_evening', { defaultValue: 'Buenas noches' });
        }
    }, [language, t]);

    // Obtener el primer nombre limpio si existe
    const cleanUserName = useMemo(() => {
        const rawName = userName || session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name;
        if (!rawName) return null;
        const trimmed = rawName.trim();
        if (!trimmed) return null;
        return trimmed.split(' ')[0];
    }, [userName, session]);

    // Título del saludo
    const greetingTitle = useMemo(() => {
        if (session) {
            if (cleanUserName) {
                return `${t('home.hello', { defaultValue: 'Hola' })}, ${cleanUserName}.`;
            }
            return `${t('home.hello', { defaultValue: 'Hola' })}.`;
        }
        return timeGreeting;
    }, [session, cleanUserName, timeGreeting, t]);

    // Mensaje motivacional/contextual según la hora del día
    const contextualMessage = useMemo(() => {
        const hour = new Date().getHours();
        const isEs = language === 'es';

        if (hour >= 5 && hour < 12) {
            return isEs ? 'Que tengas un día productivo' : 'Have a productive day';
        } else if (hour >= 12 && hour < 19) {
            return isEs ? 'Sigue con el buen ritmo' : 'Keep up the momentum';
        } else {
            return isEs ? 'Hora de descansar y desconectar' : 'Time to unwind and rest';
        }
    }, [language]);

    return (
        <View style={styles.topBar}>
            {/* Izquierda: Saludo de usuario & frase contextual */}
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                    if (pathname !== '/' && pathname !== '/notes') router.replace('/');
                }}
                style={styles.greetingCol}
            >
                <Text
                    style={[
                        styles.greetingTitle,
                        { color: colors.textPrimary, fontSize: 16 },
                    ]}
                    numberOfLines={1}
                >
                    {greetingTitle}
                </Text>
                <Text
                    style={[
                        styles.greetingDate,
                        { color: colors.textSecondary, fontSize: typography.caption.fontSize },
                    ]}
                    numberOfLines={1}
                >
                    {contextualMessage}
                </Text>
            </TouchableOpacity>

            {/* Derecha: Acciones (Badge de racha + Botón de 3 puntos) */}
            <View style={styles.actionsRow}>
                {streak > 0 && (
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                            if (pathname !== '/stats') router.push('/stats');
                        }}
                    >
                        <VeyraSurface
                            level={2}
                            radius="pill"
                            style={styles.streakBadge}
                        >
                            <Flame size={14} color="#F59E0B" />
                            <Text style={[styles.streakText, { color: colors.textPrimary, fontSize: 12 }]}>
                                {streak}
                            </Text>
                        </VeyraSurface>
                    </TouchableOpacity>
                )}

                {onHistoryPress && (
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={onHistoryPress}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        style={[
                            styles.actionIconButton,
                            {
                                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                                borderColor: colors.borderSubtle,
                            },
                        ]}
                    >
                        <History size={16} color={colors.textSecondary as any} strokeWidth={2.2} />
                    </TouchableOpacity>
                )}

                {onSharePress && (
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={onSharePress}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        style={[
                            styles.actionIconButton,
                            {
                                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                                borderColor: colors.borderSubtle,
                            },
                        ]}
                    >
                        <Share2 size={16} color={colors.textSecondary as any} strokeWidth={2.2} />
                    </TouchableOpacity>
                )}

                {onOptionsPress && (
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={onOptionsPress}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={[
                            styles.actionIconButton,
                            {
                                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                                borderColor: colors.borderSubtle,
                            },
                        ]}
                    >
                        <MoreVertical size={16} color={colors.textSecondary as any} strokeWidth={2.4} />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 6,
        zIndex: 100,
    },
    greetingCol: {
        flex: 1,
        justifyContent: 'center',
        paddingRight: 10,
    },
    greetingTitle: {
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    greetingDate: {
        fontWeight: '500',
        marginTop: 1,
    },
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    streakBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        gap: 4,
    },
    streakText: {
        fontWeight: '800',
    },
    actionIconButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionsButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

