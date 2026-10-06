import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Flame } from '@tamagui/lucide-icons';

import { useStore } from '../store/useStore';
import { useVeyraTheme } from '../theme/useVeyraTheme';
import { VeyraSurface } from './ui/VeyraSurface';
import { UserProfileDropdown } from './layout/UserProfileDropdown';
import { SyncProgressBar } from './sync/SyncProgressBar';

interface TopBarProps {
    title?: string;
}

/**
 * TopBar — Barra de navegación superior con saludo contextual, contador de racha,
 * indicador de sincronización en tiempo real y disparador del menú compacto de usuario.
 */
export function TopBar({ title }: TopBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { t } = useTranslation();
    const { colors, typography, accent } = useVeyraTheme();

    const userName = useStore(state => state.userName);
    const session = useStore(state => state.session);
    const language = useStore(state => state.language);
    const streak = useStore(state => state.streak);
    const loadStreak = useStore(state => state.loadStreak);
    const isSyncing = useStore(state => state.isSyncing);
    const syncError = useStore(state => state.syncError);

    const [isMenuOpen, setIsMenuOpen] = useState(false);

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

    const displayName = cleanUserName
        ? (userName || session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name)
        : t('menu.profiles.default', { defaultValue: 'Usuario' });

    const avatarUrl = session?.user?.user_metadata?.avatar_url;

    // Color del indicador de estado en el avatar
    const avatarDotColor = useMemo(() => {
        if (!session) return colors.textMuted;
        if (isSyncing) return '#3B82F6';
        if (syncError) return '#EF4444';
        return '#10B981';
    }, [session, isSyncing, syncError, colors.textMuted]);

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

            {/* Derecha: Acciones (Badge de racha, Indicador de Sync y Avatar) */}
            <View style={styles.actionsRow}>
                {/* Badge de racha */}
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


                {/* Avatar Button con Indicador de Estado */}
                <View style={styles.avatarWrapper}>
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setIsMenuOpen(true)}
                        style={[
                            styles.avatarButton,
                            {
                                borderColor: isMenuOpen
                                    ? accent.primary
                                    : isSyncing
                                    ? `${accent.primary}80`
                                    : colors.borderSubtle,
                                backgroundColor: accent.primary,
                            },
                        ]}
                    >
                        {avatarUrl ? (
                            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                        ) : (
                            <Text style={styles.avatarInitial}>
                                {displayName.charAt(0).toUpperCase()}
                            </Text>
                        )}
                    </TouchableOpacity>

                    {/* Dot indicador sobre el avatar */}
                    <View
                        style={[
                            styles.avatarStatusDot,
                            {
                                backgroundColor: avatarDotColor,
                                borderColor: colors.bg,
                            },
                        ]}
                    />
                </View>
            </View>

            {/* Menú Flotante Compacto (Dropdown) */}
            <UserProfileDropdown
                isVisible={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
            />

            {/* Barra de progreso de sincronización activa */}
            <SyncProgressBar isSyncing={isSyncing} />
        </View>
    );
}

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
    avatarButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        overflow: 'hidden',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    avatarInitial: {
        color: '#FFFFFF',
        fontWeight: '800',
        fontSize: 14,
    },
    avatarWrapper: {
        position: 'relative',
    },
    avatarStatusDot: {
        position: 'absolute',
        bottom: -1,
        right: -1,
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 2,
    },
});
