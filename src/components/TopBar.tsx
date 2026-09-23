import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Animated,
    Dimensions,
    StyleSheet,
    Image,
    ScrollView,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    User,
    Settings,
    BarChart3,
    History,
    HelpCircle,
    Crown,
    Zap,
    LogOut,
    LogIn,
    Flame,
    Sun,
    Moon,
    Sparkles,
    ChevronRight,
    Cloud,
} from '@tamagui/lucide-icons';

import { useStore } from '../store/useStore';
import { useVeyraTheme } from '../theme/useVeyraTheme';
import { VeyraSurface } from './ui/VeyraSurface';
import { VeyraGlass } from './ui/VeyraGlass';
import { VeyraDivider } from './ui/VeyraDivider';
import { VeyraBadge } from './ui/VeyraBadge';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface TopBarProps {
    title?: string;
}

/**
 * TopBar — Barra de navegación superior con menú contextual de usuario (Command Popover),
 * selector de tema, acceso directo a Notas/Tareas y contador de racha.
 */
export function TopBar({ title }: TopBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { t } = useTranslation();
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();

    const toggleTheme = useStore(state => state.toggleTheme);
    const userProfile = useStore(state => state.userProfile);
    const userName = useStore(state => state.userName);
    const signOut = useStore(state => state.signOut);
    const session = useStore(state => state.session);
    const language = useStore(state => state.language);
    const streak = useStore(state => state.streak);
    const loadStreak = useStore(state => state.loadStreak);
    const isPremium = useStore(state => state.isPremium);
    const isSyncing = useStore(state => state.isSyncing);

    const [isOpen, setIsOpen] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    useEffect(() => {
        loadStreak();
    }, []);

    // Animaciones fluidas de apertura/cierre del popover
    const menuFadeAnim = useRef(new Animated.Value(0)).current;
    const menuScaleAnim = useRef(new Animated.Value(0.94)).current;
    const menuSlideAnim = useRef(new Animated.Value(-10)).current;

    useEffect(() => {
        if (isOpen) {
            setShowMenu(true);
            Animated.parallel([
                Animated.timing(menuFadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
                Animated.spring(menuScaleAnim, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
                Animated.spring(menuSlideAnim, { toValue: 0, tension: 70, friction: 8, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(menuFadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
                Animated.timing(menuScaleAnim, { toValue: 0.94, duration: 150, useNativeDriver: true }),
                Animated.timing(menuSlideAnim, { toValue: -10, duration: 150, useNativeDriver: true }),
            ]).start(() => {
                setShowMenu(false);
            });
        }
    }, [isOpen]);

    // Ítems agrupados por contexto
    const workspaceItems = useMemo(() => [
        {
            icon: BarChart3,
            label: t('menu.stats'),
            route: '/stats',
            color: '#3B82F6',
            bg: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
        },
        {
            icon: History,
            label: t('menu.history'),
            route: '/history',
            color: '#8B5CF6',
            bg: isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)',
        },
        {
            icon: Zap,
            label: t('menu.strict_mode'),
            route: '/discipline-mode',
            color: '#F59E0B',
            bg: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
        },
    ], [t, isDark]);

    const accountItems = useMemo(() => [
        {
            icon: User,
            label: t('menu.profile'),
            route: '/profile',
            color: accent.primary,
            bg: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
        },
        {
            icon: Settings,
            label: t('menu.settings'),
            route: '/settings',
            color: colors.textSecondary,
            bg: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
        },
        {
            icon: HelpCircle,
            label: t('menu.help'),
            route: '/help',
            color: colors.textSecondary,
            bg: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
        },
    ], [t, accent.primary, colors.textSecondary, isDark]);

    const handleMenuItemClick = (route: string) => {
        setIsOpen(false);
        if (pathname === route) return;

        if (pathname === '/') {
            router.push(route as any);
        } else {
            router.replace(route as any);
        }
    };

    const handleLogout = async () => {
        setIsOpen(false);
        await signOut();
    };

    const displayName = userName || (session?.user?.email?.split('@')[0] || t('menu.profiles.default'));
    const avatarUrl = session?.user?.user_metadata?.avatar_url;

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

    const renderMenuItem = (item: { icon: any; label: string; route: string; color: string; bg: string }) => {
        const Icon = item.icon;
        const isActive = pathname === item.route;
        return (
            <TouchableOpacity
                key={item.route}
                activeOpacity={0.7}
                onPress={() => handleMenuItemClick(item.route)}
                style={[
                    styles.menuItemRow,
                    isActive && {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                    },
                ]}
            >
                <View style={styles.menuItemLeft}>
                    <View style={[styles.menuItemIconBox, { backgroundColor: item.bg }]}>
                        <Icon size={14} color={item.color} />
                    </View>
                    <Text
                        style={[
                            styles.menuItemLabel,
                            {
                                color: isActive ? accent.primary : colors.textPrimary,
                                fontWeight: isActive ? '700' : '500',
                            },
                        ]}
                    >
                        {item.label}
                    </Text>
                </View>
                <ChevronRight
                    size={14}
                    color={isActive ? accent.primary : colors.textMuted}
                />
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.topBar}>
            {/* Left: User greeting & contextual phrase */}
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
                    {t('home.hello')}, {displayName}
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

            {/* Right: Actions (Streak badge & User profile menu trigger) */}
            <View style={styles.actionsRow}>
                {/* Streak Badge */}
                {streak > 0 && (
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
                )}

                {/* Avatar / Menu Trigger */}
                <View style={styles.avatarWrapper}>
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setIsOpen(!isOpen)}
                        style={[
                            styles.avatarButton,
                            {
                                borderColor: isOpen ? accent.primary : colors.borderSubtle,
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

                    {/* Command Popover Modal */}
                    {showMenu && (
                        <>
                            {/* Full-Screen Dimmed Backdrop */}
                            <Animated.View
                                style={[
                                    styles.menuBackdrop,
                                    {
                                        opacity: menuFadeAnim,
                                        backgroundColor: colors.glassBackdrop,
                                    },
                                ]}
                            >
                                <TouchableWithoutFeedback onPress={() => setIsOpen(false)}>
                                    <View style={StyleSheet.absoluteFill} />
                                </TouchableWithoutFeedback>
                            </Animated.View>

                            {/* Command Popover Card */}
                            <Animated.View
                                style={[
                                    styles.menuCardContainer,
                                    {
                                        opacity: menuFadeAnim,
                                        transform: [{ translateY: menuSlideAnim }, { scale: menuScaleAnim }],
                                    },
                                ]}
                            >
                                <VeyraGlass
                                    radius="xl"
                                    intensity={85}
                                    bordered={true}
                                    showGradientHighlight={true}
                                    style={styles.menuGlass}
                                    contentStyle={styles.menuContent}
                                >
                                    <ScrollView
                                        showsVerticalScrollIndicator={false}
                                        bounces={false}
                                        contentContainerStyle={styles.scrollContent}
                                    >
                                        {/* 1. Header de Identidad de Usuario */}
                                        <View style={styles.menuProfileHeader}>
                                            <View style={styles.menuHeaderRow}>
                                                <View style={[styles.headerAvatar, { backgroundColor: accent.primary }]}>
                                                    {avatarUrl ? (
                                                        <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                                                    ) : (
                                                        <Text style={styles.headerAvatarInitial}>
                                                            {displayName.charAt(0).toUpperCase()}
                                                        </Text>
                                                    )}
                                                </View>

                                                <View style={styles.headerUserInfo}>
                                                    <View style={styles.headerNameRow}>
                                                        <Text
                                                            style={[
                                                                styles.menuProfileName,
                                                                { color: colors.textPrimary },
                                                            ]}
                                                            numberOfLines={1}
                                                        >
                                                            {displayName}
                                                        </Text>
                                                        {isPremium && (
                                                            <View style={styles.proHeaderBadge}>
                                                                <Crown size={10} color="#F59E0B" />
                                                                <Text style={styles.proHeaderBadgeText}>PRO</Text>
                                                            </View>
                                                        )}
                                                    </View>

                                                    {session ? (
                                                        <View style={styles.headerMetaRow}>
                                                            <Text
                                                                style={[
                                                                    styles.menuProfileEmail,
                                                                    { color: colors.textSecondary },
                                                                ]}
                                                                numberOfLines={1}
                                                            >
                                                                {session.user?.email}
                                                            </Text>
                                                            <View style={styles.syncIndicator}>
                                                                <View
                                                                    style={[
                                                                        styles.syncDot,
                                                                        { backgroundColor: isSyncing ? '#F59E0B' : '#10B981' },
                                                                    ]}
                                                                />
                                                                <Text style={[styles.syncText, { color: colors.textMuted }]}>
                                                                    {isSyncing ? t('settings.syncing') : t('menu.synced')}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    ) : (
                                                        <View style={styles.headerMetaRow}>
                                                            <Cloud size={11} color={colors.textMuted} />
                                                            <Text
                                                                style={[
                                                                    styles.menuProfileEmail,
                                                                    { color: colors.textMuted },
                                                                ]}
                                                            >
                                                                {t('menu.local_account')}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </View>

                                            {userProfile && (
                                                <View style={styles.roleBadgeContainer}>
                                                    <VeyraBadge
                                                        label={t(`menu.profiles.${userProfile}`) || userProfile}
                                                        size="sm"
                                                    />
                                                </View>
                                            )}
                                        </View>

                                        {/* 2. Barra de Controles Rápidos */}
                                        <View style={styles.quickControlsRow}>
                                            <TouchableOpacity
                                                activeOpacity={0.7}
                                                onPress={toggleTheme}
                                                style={[
                                                    styles.quickControlBtn,
                                                    {
                                                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                                                        borderColor: colors.borderSubtle,
                                                    },
                                                ]}
                                            >
                                                {isDark ? (
                                                    <Sun size={14} color="#F59E0B" />
                                                ) : (
                                                    <Moon size={14} color="#6366F1" />
                                                )}
                                                <Text style={[styles.quickControlText, { color: colors.textPrimary }]}>
                                                    {isDark ? t('menu.theme_light') : t('menu.theme_dark')}
                                                </Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                activeOpacity={0.7}
                                                onPress={() => handleMenuItemClick('/discipline-mode')}
                                                style={[
                                                    styles.quickControlBtn,
                                                    {
                                                        backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.08)',
                                                        borderColor: isDark ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.2)',
                                                    },
                                                ]}
                                            >
                                                <Flame size={14} color="#F59E0B" />
                                                <Text
                                                    style={[
                                                        styles.quickControlText,
                                                        { color: isDark ? '#FBBF24' : '#D97706', fontWeight: '700' },
                                                    ]}
                                                >
                                                    {streak > 0 ? `${streak} ${t('menu.streak_label')}` : t('menu.strict_mode')}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        {/* 3. Banner PRO (si no es Premium) */}
                                        {!isPremium && (
                                            <TouchableOpacity
                                                activeOpacity={0.8}
                                                onPress={() => handleMenuItemClick('/upgrade')}
                                                style={[
                                                    styles.proBannerCard,
                                                    {
                                                        borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : 'rgba(245, 158, 11, 0.3)',
                                                        backgroundColor: isDark ? 'rgba(245, 158, 11, 0.08)' : 'rgba(254, 243, 199, 0.45)',
                                                    },
                                                ]}
                                            >
                                                <View style={styles.proBannerLeft}>
                                                    <View style={styles.proBannerIconWrapper}>
                                                        <Sparkles size={15} color="#F59E0B" />
                                                    </View>
                                                    <View style={styles.proBannerTextCol}>
                                                        <View style={styles.proBannerTitleRow}>
                                                            <Text style={[styles.proBannerTitle, { color: colors.textPrimary }]}>
                                                                {t('menu.upgrade_title')}
                                                            </Text>
                                                            <View style={styles.proMiniBadge}>
                                                                <Text style={styles.proMiniBadgeText}>PRO</Text>
                                                            </View>
                                                        </View>
                                                        <Text
                                                            style={[styles.proBannerDesc, { color: colors.textSecondary }]}
                                                            numberOfLines={1}
                                                        >
                                                            {t('menu.upgrade_desc')}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <ChevronRight size={14} color="#F59E0B" />
                                            </TouchableOpacity>
                                        )}

                                        <VeyraDivider style={{ marginVertical: 3 }} />

                                        {/* 4. Sección Productividad */}
                                        <View style={styles.menuSection}>
                                            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                                                {t('menu.section_workspace')}
                                            </Text>
                                            <View style={styles.sectionItems}>
                                                {workspaceItems.map(renderMenuItem)}
                                            </View>
                                        </View>

                                        <VeyraDivider style={{ marginVertical: 3 }} />

                                        {/* 5. Sección Cuenta y Preferencias */}
                                        <View style={styles.menuSection}>
                                            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                                                {t('menu.section_account')}
                                            </Text>
                                            <View style={styles.sectionItems}>
                                                {accountItems.map(renderMenuItem)}
                                            </View>
                                        </View>

                                        <VeyraDivider style={{ marginVertical: 3 }} />

                                        {/* 6. Footer de Autenticación */}
                                        {session ? (
                                            <TouchableOpacity
                                                activeOpacity={0.7}
                                                onPress={handleLogout}
                                                style={[styles.menuItemRow, styles.authRow]}
                                            >
                                                <View style={styles.menuItemLeft}>
                                                    <View
                                                        style={[
                                                            styles.menuItemIconBox,
                                                            {
                                                                backgroundColor: isDark ? 'rgba(244, 63, 94, 0.12)' : 'rgba(239, 68, 68, 0.08)',
                                                            },
                                                        ]}
                                                    >
                                                        <LogOut size={14} color={isDark ? '#FB7185' : '#EF4444'} />
                                                    </View>
                                                    <Text
                                                        style={[
                                                            styles.menuItemLabel,
                                                            { color: isDark ? '#FB7185' : '#EF4444', fontWeight: '600' },
                                                        ]}
                                                    >
                                                        {t('menu.logout')}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        ) : (
                                            <TouchableOpacity
                                                activeOpacity={0.7}
                                                onPress={() => {
                                                    setIsOpen(false);
                                                    router.push('/login');
                                                }}
                                                style={[styles.menuItemRow, styles.authRow]}
                                            >
                                                <View style={styles.menuItemLeft}>
                                                    <View
                                                        style={[
                                                            styles.menuItemIconBox,
                                                            { backgroundColor: `${accent.primary}18` },
                                                        ]}
                                                    >
                                                        <LogIn size={14} color={accent.primary} />
                                                    </View>
                                                    <Text
                                                        style={[
                                                            styles.menuItemLabel,
                                                            { color: accent.primary, fontWeight: '700' },
                                                        ]}
                                                    >
                                                        {t('menu.login')}
                                                    </Text>
                                                </View>
                                                <ChevronRight size={14} color={accent.primary} />
                                            </TouchableOpacity>
                                        )}
                                    </ScrollView>
                                </VeyraGlass>
                            </Animated.View>
                        </>
                    )}
                </View>
            </View>
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
        zIndex: 9999,
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
        gap: 6,
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
    avatarWrapper: {
        position: 'relative',
        zIndex: 1000,
    },
    avatarButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
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
        fontSize: 13,
    },
    menuBackdrop: {
        position: 'absolute',
        top: -SCREEN_HEIGHT,
        left: -SCREEN_WIDTH,
        width: SCREEN_WIDTH * 2,
        height: SCREEN_HEIGHT * 2,
        zIndex: 999,
    },
    menuCardContainer: {
        position: 'absolute',
        top: 42,
        right: 0,
        width: Math.min(SCREEN_WIDTH - 24, 284),
        maxHeight: SCREEN_HEIGHT * 0.8,
        zIndex: 1000,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 14,
    },
    menuGlass: {
        width: '100%',
        overflow: 'hidden',
    },
    menuContent: {
        padding: 10,
    },
    scrollContent: {
        gap: 7,
    },
    menuProfileHeader: {
        paddingHorizontal: 4,
        paddingTop: 2,
        paddingBottom: 2,
        gap: 4,
    },
    menuHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    headerAvatarInitial: {
        color: '#FFFFFF',
        fontWeight: '800',
        fontSize: 14,
    },
    headerUserInfo: {
        flex: 1,
        justifyContent: 'center',
        gap: 2,
    },
    headerNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    menuProfileName: {
        fontWeight: '700',
        fontSize: 14,
        letterSpacing: -0.2,
    },
    proHeaderBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    proHeaderBadgeText: {
        color: '#F59E0B',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    headerMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    menuProfileEmail: {
        fontSize: 11,
        fontWeight: '500',
        maxWidth: 130,
    },
    syncIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    syncDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    syncText: {
        fontSize: 10,
        fontWeight: '500',
    },
    roleBadgeContainer: {
        marginTop: 2,
        alignSelf: 'flex-start',
    },
    quickControlsRow: {
        flexDirection: 'row',
        gap: 6,
    },
    quickControlBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 7,
        paddingHorizontal: 8,
        borderRadius: 8,
        borderWidth: 1,
    },
    quickControlText: {
        fontSize: 11,
        fontWeight: '600',
    },
    proBannerCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 7,
        paddingHorizontal: 9,
        borderRadius: 9,
        borderWidth: 1,
    },
    proBannerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    proBannerIconWrapper: {
        width: 26,
        height: 26,
        borderRadius: 6,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    proBannerTextCol: {
        flex: 1,
    },
    proBannerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    proBannerTitle: {
        fontSize: 11.5,
        fontWeight: '700',
    },
    proMiniBadge: {
        backgroundColor: '#F59E0B',
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
    },
    proMiniBadgeText: {
        color: '#FFFFFF',
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 0.3,
    },
    proBannerDesc: {
        fontSize: 10,
        fontWeight: '500',
        marginTop: 1,
    },
    menuSection: {
        gap: 2,
    },
    sectionTitle: {
        fontSize: 9.5,
        fontWeight: '700',
        letterSpacing: 0.6,
        paddingHorizontal: 4,
        marginBottom: 1,
        textTransform: 'uppercase',
    },
    sectionItems: {
        gap: 1,
    },
    menuItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
        paddingHorizontal: 6,
        borderRadius: 8,
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
    },
    menuItemIconBox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuItemLabel: {
        fontSize: 12.5,
        letterSpacing: -0.1,
    },
    authRow: {
        marginTop: 1,
    },
});

