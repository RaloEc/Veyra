import React, { useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Image,
    Easing,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    ChevronLeft,
    ChevronRight,
    Settings,
    BarChart3,
    LogOut,
    LogIn,
    Crown,
    Cloud,
    RefreshCw,
    Users,
    User as UserIcon,
} from '@tamagui/lucide-icons';

import { useStore } from '../../store/useStore';
import { useVeyraTheme } from '../../theme/useVeyraTheme';

interface UserMenuMorphCardProps {
    onClose: () => void;
}

/**
 * UserMenuMorphCard — Menú de usuario rediseñado y optimizado para el dock flotante.
 * Proporciona acceso rápido al perfil, sincronización, estadísticas y ajustes en un
 * contenedor ergonómico sin scroll ni espacios vacíos.
 */
export function UserMenuMorphCard({ onClose }: UserMenuMorphCardProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { t } = useTranslation();
    const { colors, accent, isDark } = useVeyraTheme();

    const session = useStore(state => state.session);
    const userName = useStore(state => state.userName);
    const isPremium = useStore(state => state.isPremium);
    const isSyncing = useStore(state => state.isSyncing);
    const lastSyncTime = useStore(state => state.lastSyncTime);
    const syncError = useStore(state => state.syncError);
    const triggerSync = useStore(state => state.triggerSync);
    const language = useStore(state => state.language);
    const signOut = useStore(state => state.signOut);

    const spinAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        let loop: Animated.CompositeAnimation | null = null;
        if (isSyncing) {
            spinAnim.setValue(0);
            loop = Animated.loop(
                Animated.timing(spinAnim, {
                    toValue: 1,
                    duration: 900,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            );
            loop.start();
        } else {
            spinAnim.setValue(0);
        }
        return () => {
            loop?.stop();
        };
    }, [isSyncing]);

    const spin = spinAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const cleanUserName = useMemo(() => {
        const rawName = userName || session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name;
        if (!rawName) return null;
        const trimmed = rawName.trim();
        return trimmed ? trimmed.split(' ')[0] : null;
    }, [userName, session]);

    const displayName = cleanUserName
        ? (userName || session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name)
        : t('menu.profiles.default', { defaultValue: 'Usuario' });

    const avatarUrl = session?.user?.user_metadata?.avatar_url;

    const handleNavigate = (route: string) => {
        onClose();
        setTimeout(() => {
            if (pathname === route) return;
            if (pathname === '/') {
                router.push(route as any);
            } else {
                router.replace(route as any);
            }
        }, 180);
    };

    const handleLogout = async () => {
        onClose();
        setTimeout(async () => {
            await signOut();
        }, 180);
    };

    const menuItems = useMemo(() => [
        {
            icon: Users,
            label: t('menu.join_code', { defaultValue: 'Unirse con código' }),
            route: '/join',
            color: '#8B5CF6',
            bg: isDark ? 'rgba(139, 92, 246, 0.16)' : 'rgba(139, 92, 246, 0.12)',
        },
        {
            icon: BarChart3,
            label: t('menu.stats', { defaultValue: 'Estadísticas' }),
            route: '/stats',
            color: '#3B82F6',
            bg: isDark ? 'rgba(59, 130, 246, 0.16)' : 'rgba(59, 130, 246, 0.12)',
        },
        {
            icon: Settings,
            label: t('menu.settings', { defaultValue: 'Ajustes' }),
            route: '/settings',
            color: '#64748B',
            bg: isDark ? 'rgba(100, 116, 139, 0.16)' : 'rgba(100, 116, 139, 0.12)',
        },
    ], [t, isDark]);

    return (
        <View style={styles.cardContainer}>
            {/* 1. Barra de cabecera con botón Atrás y título */}
            <View style={styles.headerRow}>
                <TouchableOpacity
                    onPress={onClose}
                    style={[
                        styles.backButton,
                        { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' },
                    ]}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <ChevronLeft size={16} color={colors.textPrimary as any} strokeWidth={2.6} />
                    <Text style={[styles.backButtonText, { color: colors.textPrimary }]}>
                        {language === 'es' ? 'Atrás' : 'Back'}
                    </Text>
                </TouchableOpacity>

                <Text style={[styles.headerTitle, { color: colors.textSecondary }]}>
                    {language === 'es' ? 'Mi cuenta' : 'My Account'}
                </Text>

                <View style={styles.headerSpacer} />
            </View>

            {/* 2. Tarjeta de Perfil Integrada con Avatar y Sincronización */}
            <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handleNavigate('/profile')}
                style={[
                    styles.profileCard,
                    {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.025)',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.045)',
                    },
                ]}
            >
                <View style={[styles.avatarBox, { backgroundColor: accent.primary }]}>
                    {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                    ) : cleanUserName ? (
                        <Text style={styles.avatarInitial}>
                            {cleanUserName.charAt(0).toUpperCase()}
                        </Text>
                    ) : (
                        <UserIcon size={18} color="#FFFFFF" strokeWidth={2.4} />
                    )}
                </View>

                <View style={styles.profileTextCol}>
                    <View style={styles.nameRow}>
                        <Text
                            style={[styles.nameText, { color: colors.textPrimary }]}
                            numberOfLines={1}
                        >
                            {displayName}
                        </Text>
                        {isPremium && (
                            <View style={styles.proBadge}>
                                <Crown size={9} color="#F59E0B" />
                                <Text style={styles.proBadgeText}>PRO</Text>
                            </View>
                        )}
                    </View>

                    {session ? (
                        <View style={styles.syncStatusRow}>
                            <View
                                style={[
                                    styles.syncDot,
                                    { backgroundColor: isSyncing ? '#3B82F6' : syncError ? '#EF4444' : '#10B981' },
                                ]}
                            />
                            <Text
                                style={[styles.emailText, { color: colors.textSecondary }]}
                                numberOfLines={1}
                            >
                                {session.user?.email}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.localModeRow}>
                            <Cloud size={11} color={colors.textMuted} />
                            <Text style={[styles.emailText, { color: colors.textMuted }]}>
                                {t('menu.local_account', { defaultValue: 'Modo local' })}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={styles.profileRightCol}>
                    {session && (
                        <TouchableOpacity
                            disabled={isSyncing}
                            onPress={(e) => {
                                e.stopPropagation();
                                triggerSync();
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={[
                                styles.syncIconButton,
                                {
                                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            activeOpacity={0.6}
                        >
                            <Animated.View style={{ transform: [{ rotate: isSyncing ? spin : '0deg' }] }}>
                                <RefreshCw
                                    size={12}
                                    color={(isSyncing ? accent.primary : colors.textMuted) as any}
                                />
                            </Animated.View>
                        </TouchableOpacity>
                    )}
                    <ChevronRight size={15} color={colors.textMuted as any} />
                </View>
            </TouchableOpacity>

            {/* 3. Grupo de Accesos Rápidos (Estilo unificado One UI) */}
            <View
                style={[
                    styles.groupedMenuCard,
                    {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.02)',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.045)',
                    },
                ]}
            >
                {menuItems.map((item, index) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.route;
                    const isLast = index === menuItems.length - 1;

                    return (
                        <React.Fragment key={item.route}>
                            <TouchableOpacity
                                activeOpacity={0.65}
                                onPress={() => handleNavigate(item.route)}
                                style={[
                                    styles.groupRow,
                                    isActive && {
                                        backgroundColor: isDark
                                            ? 'rgba(255, 255, 255, 0.07)'
                                            : 'rgba(0, 0, 0, 0.04)',
                                    },
                                ]}
                            >
                                <View style={styles.actionLeft}>
                                    <View style={[styles.iconCircle, { backgroundColor: item.bg }]}>
                                        <Icon size={15} color={(isActive ? accent.primary : item.color) as any} />
                                    </View>
                                    <Text
                                        style={[
                                            styles.actionLabel,
                                            {
                                                color: isActive ? accent.primary : colors.textPrimary,
                                                fontWeight: isActive ? '700' : '600',
                                            },
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {item.label}
                                    </Text>
                                </View>

                                <ChevronRight size={14} color={colors.textMuted as any} />
                            </TouchableOpacity>

                            {!isLast && (
                                <View
                                    style={[
                                        styles.groupDivider,
                                        { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' },
                                    ]}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </View>

            {/* 4. Pie de Sesión (Cerrar / Iniciar Sesión) */}
            <View style={styles.footerWrap}>
                {session ? (
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handleLogout}
                        style={[
                            styles.logoutBtn,
                            {
                                backgroundColor: isDark ? 'rgba(244, 63, 94, 0.08)' : 'rgba(239, 68, 68, 0.06)',
                                borderColor: isDark ? 'rgba(244, 63, 94, 0.16)' : 'rgba(239, 68, 68, 0.12)',
                            },
                        ]}
                    >
                        <LogOut size={14} color={isDark ? '#FB7185' : '#EF4444'} />
                        <Text
                            style={[
                                styles.logoutText,
                                { color: isDark ? '#FB7185' : '#EF4444' },
                            ]}
                        >
                            {t('menu.logout', { defaultValue: 'Cerrar sesión' })}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleNavigate('/login')}
                        style={[
                            styles.loginBtn,
                            {
                                backgroundColor: `${accent.primary}12`,
                                borderColor: `${accent.primary}25`,
                            },
                        ]}
                    >
                        <View style={styles.loginLeft}>
                            <LogIn size={15} color={accent.primary as any} />
                            <Text style={[styles.loginText, { color: accent.primary }]}>
                                {t('menu.login', { defaultValue: 'Iniciar sesión' })}
                            </Text>
                        </View>
                        <ChevronRight size={14} color={accent.primary as any} />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    cardContainer: {
        flex: 1,
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 10,
        justifyContent: 'space-between',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 4,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingVertical: 5,
        paddingHorizontal: 8,
        borderRadius: 9,
    },
    backButtonText: {
        fontSize: 12.5,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    headerTitle: {
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: -0.2,
    },
    headerSpacer: {
        width: 54,
    },
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 14,
        borderWidth: 1,
        gap: 10,
    },
    avatarBox: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    avatarImg: {
        width: '100%',
        height: '100%',
    },
    avatarInitial: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    profileTextCol: {
        flex: 1,
        gap: 2,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    nameText: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    proBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        backgroundColor: 'rgba(245, 158, 11, 0.16)',
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
    },
    proBadgeText: {
        color: '#F59E0B',
        fontSize: 8,
        fontWeight: '900',
    },
    syncStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    emailText: {
        fontSize: 11,
        fontWeight: '500',
    },
    localModeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    syncDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    profileRightCol: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    syncIconButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    groupedMenuCard: {
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden',
    },
    groupRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingHorizontal: 10,
        minHeight: 40,
    },
    groupDivider: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 44,
        marginRight: 10,
    },
    actionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        flex: 1,
    },
    iconCircle: {
        width: 26,
        height: 26,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionLabel: {
        fontSize: 13,
        letterSpacing: -0.15,
    },
    footerWrap: {
        paddingTop: 2,
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 36,
        borderRadius: 10,
        borderWidth: 1,
    },
    logoutText: {
        fontSize: 12.5,
        fontWeight: '600',
        letterSpacing: -0.1,
    },
    loginBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 36,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
    },
    loginLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    loginText: {
        fontSize: 12.5,
        fontWeight: '700',
        letterSpacing: -0.1,
    },
});
