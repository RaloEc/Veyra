import React, { useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Animated,
    Image,
    Easing,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Settings,
    BarChart3,
    LogOut,
    LogIn,
    Crown,
    ChevronRight,
    Cloud,
    RefreshCw,
    Users,
    Radio,
} from '@tamagui/lucide-icons';

import { useStore } from '../../store/useStore';
import { useVeyraTheme } from '../../theme/useVeyraTheme';

interface UserProfileDropdownProps {
    isVisible: boolean;
    onClose: () => void;
}

/**
 * UserProfileDropdown — Menú flotante accesible y compacto estilo macOS / Apple HIG.
 * Diseñado con zonas táctiles amplias (44px), tipografía clara (14px).
 * El encabezado es la vía de acceso a Mi Perfil.
 */
export function UserProfileDropdown({ isVisible, onClose }: UserProfileDropdownProps) {
    const router = useRouter();
    const pathname = usePathname();
    const insets = useSafeAreaInsets();
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

    const [renderModal, setRenderModal] = React.useState(isVisible);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.92)).current;
    const translateYAnim = useRef(new Animated.Value(-6)).current;
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

    useEffect(() => {
        if (isVisible) {
            setRenderModal(true);
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 140,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 100,
                    friction: 8,
                    useNativeDriver: true,
                }),
                Animated.spring(translateYAnim, {
                    toValue: 0,
                    tension: 100,
                    friction: 8,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 100,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 0.94,
                    duration: 100,
                    useNativeDriver: true,
                }),
                Animated.timing(translateYAnim, {
                    toValue: -6,
                    duration: 100,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                setRenderModal(false);
            });
        }
    }, [isVisible]);

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
            if (route === '/poc-yjs' || pathname === '/') {
                router.push(route as any);
            } else {
                router.replace(route as any);
            }
        }, 120);
    };

    const handleLogout = async () => {
        onClose();
        setTimeout(async () => {
            await signOut();
        }, 120);
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
            icon: Radio,
            label: 'PoC Colaboración Yjs',
            route: '/poc-yjs',
            color: '#10B981',
            bg: isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.12)',
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

    if (!renderModal) return null;

    const topPosition = Math.max(insets.top, 12) + 44;

    return (
        <Modal
            transparent
            visible={renderModal}
            animationType="none"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={styles.modalRoot}>
                {/* Backdrop sutil para capturar toque fuera */}
                <TouchableWithoutFeedback onPress={onClose}>
                    <View
                        style={[
                            styles.backdrop,
                            { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.10)' },
                        ]}
                    />
                </TouchableWithoutFeedback>

                {/* Dropdown Card anclada bajo el avatar */}
                <Animated.View
                    style={[
                        styles.dropdownCard,
                        {
                            top: topPosition,
                            backgroundColor: colors.bg,
                            borderColor: colors.borderMedium,
                            shadowOpacity: isDark ? 0.35 : 0.12,
                            opacity: fadeAnim,
                            transform: [
                                { translateY: translateYAnim },
                                { scale: scaleAnim },
                            ],
                        },
                    ]}
                >
                    {/* 1. Header de perfil de usuario (Al tocarlo navega a /profile) */}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleNavigate('/profile')}
                        style={styles.profileHeaderRow}
                    >
                        <View style={[styles.avatarMini, { backgroundColor: accent.primary }]}>
                            {avatarUrl ? (
                                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                            ) : (
                                <Text style={styles.avatarInitial}>
                                    {displayName.charAt(0).toUpperCase()}
                                </Text>
                            )}
                        </View>

                        <View style={styles.profileInfoCol}>
                            <View style={styles.nameRow}>
                                <Text
                                    style={[styles.profileNameText, { color: colors.textPrimary }]}
                                    numberOfLines={1}
                                >
                                    {displayName}
                                </Text>
                                {isPremium && (
                                    <View style={styles.proMiniBadge}>
                                        <Crown size={10} color="#F59E0B" />
                                        <Text style={styles.proMiniText}>PRO</Text>
                                    </View>
                                )}
                            </View>

                            {session ? (
                                <View style={styles.emailRow}>
                                    <Text
                                        style={[styles.profileEmailText, { color: colors.textSecondary }]}
                                        numberOfLines={1}
                                    >
                                        {session.user?.email}
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.emailRow}>
                                    <Cloud size={11} color={colors.textMuted} />
                                    <Text style={[styles.profileEmailText, { color: colors.textMuted }]}>
                                        {t('menu.local_account', { defaultValue: 'Modo local' })}
                                    </Text>
                                </View>
                            )}
                        </View>

                        <ChevronRight size={16} color={colors.textMuted as any} />
                    </TouchableOpacity>

                    <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

                    {/* Indicador compacto de Sincronización */}
                    {session ? (
                        <>
                            <View style={[styles.syncCompactRow, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.025)' }]}>
                                <View style={styles.syncCompactLeft}>
                                    <View
                                        style={[
                                            styles.syncIndicatorDot,
                                            { backgroundColor: isSyncing ? '#3B82F6' : syncError ? '#EF4444' : '#10B981' },
                                        ]}
                                    />
                                    <Text style={[styles.syncCompactText, { color: colors.textSecondary }]} numberOfLines={1}>
                                        {isSyncing
                                            ? t('settings.syncing', { defaultValue: 'Sincronizando...' })
                                            : syncError
                                            ? (language === 'es' ? 'Error al sincronizar' : 'Sync error')
                                            : lastSyncTime
                                            ? `${language === 'es' ? 'Sincronizado' : 'Synced'} · ${new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                            : (language === 'es' ? 'Nube sincronizada' : 'Cloud synced')}
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    disabled={isSyncing}
                                    onPress={() => triggerSync()}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={styles.syncCompactBtn}
                                    activeOpacity={0.6}
                                >
                                    <Animated.View style={{ transform: [{ rotate: isSyncing ? spin : '0deg' }] }}>
                                        <RefreshCw
                                            size={12}
                                            color={(isSyncing ? accent.primary : colors.textMuted) as any}
                                        />
                                    </Animated.View>
                                </TouchableOpacity>
                            </View>
                            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
                        </>
                    ) : null}

                    {/* 2. Lista de acciones principales (altura ergonómica de 44px) */}
                    <View style={styles.menuList}>
                        {menuItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.route;

                            return (
                                <TouchableOpacity
                                    key={item.route}
                                    activeOpacity={0.65}
                                    onPress={() => handleNavigate(item.route)}
                                    style={[
                                        styles.itemRow,
                                        isActive && {
                                            backgroundColor: isDark
                                                ? 'rgba(255, 255, 255, 0.08)'
                                                : 'rgba(0, 0, 0, 0.05)',
                                        },
                                    ]}
                                >
                                    <View style={styles.itemLeft}>
                                        <View style={[styles.iconBox, { backgroundColor: item.bg }]}>
                                            <Icon size={16} color={(isActive ? accent.primary : item.color) as any} />
                                        </View>
                                        <Text
                                            style={[
                                                styles.itemLabel,
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

                                    <ChevronRight size={15} color={colors.textMuted as any} />
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

                    {/* 3. Pie de sesión (Cerrar sesión / Iniciar sesión) */}
                    {session ? (
                        <TouchableOpacity
                            activeOpacity={0.65}
                            onPress={handleLogout}
                            style={[styles.itemRow, styles.logoutRow]}
                        >
                            <View style={styles.itemLeft}>
                                <View
                                    style={[
                                        styles.iconBox,
                                        {
                                            backgroundColor: isDark
                                                ? 'rgba(244, 63, 94, 0.16)'
                                                : 'rgba(239, 68, 68, 0.12)',
                                        },
                                    ]}
                                >
                                    <LogOut size={16} color={isDark ? '#FB7185' : '#EF4444'} />
                                </View>
                                <Text
                                    style={[
                                        styles.itemLabel,
                                        { color: isDark ? '#FB7185' : '#EF4444', fontWeight: '600' },
                                    ]}
                                >
                                    {t('menu.logout', { defaultValue: 'Cerrar sesión' })}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            activeOpacity={0.65}
                            onPress={() => handleNavigate('/login')}
                            style={[styles.itemRow, { backgroundColor: `${accent.primary}12` }]}
                        >
                            <View style={styles.itemLeft}>
                                <View
                                    style={[
                                        styles.iconBox,
                                        { backgroundColor: `${accent.primary}22` },
                                    ]}
                                >
                                    <LogIn size={16} color={accent.primary as any} />
                                </View>
                                <Text
                                    style={[
                                        styles.itemLabel,
                                        { color: accent.primary, fontWeight: '700' },
                                    ]}
                                >
                                    {t('menu.login', { defaultValue: 'Iniciar sesión' })}
                                </Text>
                            </View>
                            <ChevronRight size={15} color={accent.primary as any} />
                        </TouchableOpacity>
                    )}
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalRoot: {
        flex: 1,
    },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.10)',
    },
    dropdownCard: {
        position: 'absolute',
        right: 16,
        width: 254,
        borderRadius: 16,
        borderWidth: 1,
        padding: 7,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 18,
        elevation: 14,
    },
    profileHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 8,
        gap: 11,
        borderRadius: 12,
    },
    avatarMini: {
        width: 38,
        height: 38,
        borderRadius: 19,
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
        fontWeight: '800',
        fontSize: 16,
    },
    profileInfoCol: {
        flex: 1,
        gap: 2,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    profileNameText: {
        fontSize: 14.5,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    proMiniBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        backgroundColor: 'rgba(245, 158, 11, 0.16)',
        paddingHorizontal: 5,
        paddingVertical: 1.5,
        borderRadius: 4,
    },
    proMiniText: {
        color: '#F59E0B',
        fontSize: 8.5,
        fontWeight: '900',
    },
    emailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    profileEmailText: {
        fontSize: 11.5,
        fontWeight: '500',
        maxWidth: 140,
    },
    syncMiniDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    divider: {
        height: 1,
        marginVertical: 5,
        marginHorizontal: 4,
    },
    menuList: {
        gap: 2,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 9,
        paddingHorizontal: 8,
        borderRadius: 10,
        minHeight: 44,
    },
    itemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        flex: 1,
    },
    iconBox: {
        width: 30,
        height: 30,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemLabel: {
        fontSize: 14,
        letterSpacing: -0.15,
    },
    logoutRow: {
        marginTop: 1,
    },
    syncCompactRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
        paddingHorizontal: 9,
        marginHorizontal: 4,
        marginVertical: 2,
        borderRadius: 8,
    },
    syncCompactLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        flex: 1,
    },
    syncIndicatorDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    syncCompactText: {
        fontSize: 11.5,
        fontWeight: '500',
        letterSpacing: -0.1,
    },
    syncCompactBtn: {
        padding: 4,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
