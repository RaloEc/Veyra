import { XStack, YStack, Text, Avatar, Button, Separator, AnimatePresence } from 'tamagui';
import { User, Settings, BarChart3, History, HelpCircle, Crown, Zap, LogOut, Flame, Home, Notebook, Bell, Rocket, Sun, Moon } from '@tamagui/lucide-icons';
import { useRouter, usePathname } from 'expo-router';
import { useStore } from '../store/useStore';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TouchableWithoutFeedback, View, Animated, Dimensions } from 'react-native';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { ComplianceService } from '../services/complianceService';
import { BlurView } from 'expo-blur';
import { useAccentColor } from '../theme/accentColors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function TopBar({ title }: { title?: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const { t } = useTranslation();
    const theme = useStore(state => state.theme);
    const toggleTheme = useStore(state => state.toggleTheme);
    const userProfile = useStore(state => state.userProfile);
    const userName = useStore(state => state.userName);
    const signOut = useStore(state => state.signOut);
    const session = useStore(state => state.session);
    const language = useStore(state => state.language);
    const [isOpen, setIsOpen] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [streak, setStreak] = useState(0);
    const isNotesPath = pathname.startsWith('/notes');

    useEffect(() => {
        async function loadStreak() {
            try {
                const stats = await ComplianceService.getComplianceStats();
                setStreak(stats.currentStreak);
            } catch (e) {
                console.error('Error loading streak in TopBar:', e);
            }
        }
        loadStreak();
    }, []);

    // --- LÓGICA DE ANIMACIÓN NATIVA ---
    const menuFadeAnim = useRef(new Animated.Value(0)).current;
    const menuScaleAnim = useRef(new Animated.Value(0.95)).current;
    const menuSlideAnim = useRef(new Animated.Value(-10)).current;

    useEffect(() => {
        if (isOpen) {
            setShowMenu(true);
            Animated.parallel([
                Animated.timing(menuFadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
                Animated.spring(menuScaleAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
                Animated.spring(menuSlideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(menuFadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(menuScaleAnim, { toValue: 0.95, duration: 200, useNativeDriver: true }),
                Animated.timing(menuSlideAnim, { toValue: -10, duration: 200, useNativeDriver: true })
            ]).start(() => {
                setShowMenu(false);
            });
        }
    }, [isOpen]);

    // --- PALETA SEMÁNTICA (Focus & Alarm) ---
    const { accent } = useAccentColor();
    const colors = {
        surface: theme === 'dark' ? '#171717' : '#FFFFFF',
        textPrimary: theme === 'dark' ? '#EDEDED' : '#0c0a09',
        textSecondary: theme === 'dark' ? '#A1A1A1' : '#64748B',
        border: theme === 'dark' ? '#262626' : '#E2E8F0',
        brand: accent,
    };

    const menuItems = [
        {
            icon: Home,
            label: t('menu.start'),
            route: '/',
            color: colors.brand,
        },
        {
            icon: User,
            label: t('menu.profile'),
            route: '/profile',
            color: colors.brand,
        },
        {
            icon: Settings,
            label: t('menu.settings'),
            route: '/settings',
            color: colors.textSecondary,
        },
        {
            icon: Zap,
            label: t('menu.strict_mode'),
            route: '/discipline-mode',
            color: '#F59E0B',
        },
        {
            icon: BarChart3,
            label: t('menu.stats'),
            route: '/stats',
            color: '#8B5CF6',
        },
        {
            icon: History,
            label: t('menu.history'),
            route: '/history',
            color: colors.brand,
        },

        'separator',
        {
            icon: HelpCircle,
            label: t('menu.help'),
            route: '/help',
            color: colors.textSecondary,
        },
        {
            icon: Crown,
            label: t('menu.upgrade'),
            route: '/upgrade',
            color: '#F59E0B',
            badge: 'PRO',
        },
    ];

    const handleMenuItemClick = (route: string) => {
        setIsOpen(false);
        if (pathname === route) return;


        // ESTRATEGIA DE NAVEGACIÓN LIMPIA:
        // Si estamos en el home (/), hacemos push para poder volver.
        // Si ya estamos en una subpágina, usamos replace para no acumular historial.
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

    // Determinar el nombre a mostrar
    const displayName = userName || (session ? (session.user?.email?.split('@')[0] || t('menu.profiles.default')) : t('menu.profiles.default'));

    return (
        <XStack
            px="$4"
            py="$2"
            style={{
                justifyContent: 'space-between',
                alignItems: 'center',
                zIndex: 9999,
                marginBottom: 8,
                marginTop: 8
            }}
            bg="transparent"
        >
            <TouchableWithoutFeedback onPress={() => {
                if (pathname !== '/') router.replace('/');
            }}>
                <YStack>
                    <Text fontSize="$3" fontWeight="900" color={colors.textPrimary} textTransform="capitalize">
                        {t('home.hello')}, {displayName}
                    </Text>
                    <Text fontSize="$1" fontWeight="600" color={colors.textSecondary} textTransform="uppercase" letterSpacing={1}>
                        {format(new Date(), language === 'es' ? "EEEE, d 'de' MMMM" : "EEEE, MMMM d", { locale: language === 'es' ? es : enUS })}
                    </Text>
                </YStack>
            </TouchableWithoutFeedback>

            <XStack flex={1} />

            <Button
                circular
                size="$3"
                chromeless
                onPress={() => isNotesPath ? router.replace('/') : router.replace('/notes')}
                marginRight="$1"
            >
                {isNotesPath ? (
                    <Bell size={24} color={colors.brand as any} />
                ) : (
                    <Notebook size={24} color={colors.brand as any} />
                )}
            </Button>

            <Button
                circular
                size="$3"
                chromeless
                onPress={toggleTheme}
                marginRight="$2"
            >
                {theme === 'dark' ? (
                    <Sun size={24} color="#F59E0B" />
                ) : (
                    <Moon size={24} color="#64748B" />
                )}
            </Button>

            {streak > 0 && (
                <XStack style={{ alignItems: 'center', marginRight: 12 }} gap="$1" bg={theme === 'dark' ? '$gray2' : 'white'} px="$2" py="$1" borderRadius="$10" borderWidth={1} borderColor={accent as any}>
                    <Flame size={16} color={accent as any} />
                    <Text fontWeight="900" fontSize="$2" color={accent as any}>
                        {streak}
                    </Text>
                </XStack>
            )}

            <View style={{ position: 'relative', zIndex: 1000 }}>
                <Button
                    circular
                    style={{ padding: 0 }}
                    chromeless
                    onPress={() => setIsOpen(!isOpen)}
                >
                    <Avatar circular size="$3" alignItems="center" justifyContent="center">
                        {session?.user?.user_metadata?.avatar_url && (
                            <Avatar.Image src={session.user.user_metadata.avatar_url} />
                        )}
                        <Avatar.Fallback backgroundColor={colors.brand} alignItems="center" justifyContent="center">
                            {userName ? (
                                <Text fontSize="$4" fontWeight="800" color="white" textTransform="uppercase">
                                    {userName.charAt(0)}
                                </Text>
                            ) : (
                                <User size={16} color="white" />
                            )}
                        </Avatar.Fallback>
                    </Avatar>
                </Button>

                {showMenu && (
                    <>
                        {/* Backdrop invisible para cerrar al clickear fuera */}
                        <Animated.View
                            style={{
                                position: 'absolute',
                                top: -SCREEN_HEIGHT,
                                left: -SCREEN_WIDTH,
                                width: SCREEN_WIDTH * 2,
                                height: SCREEN_HEIGHT * 2,
                                zIndex: 999,
                                opacity: menuFadeAnim,
                            }}
                        >
                            <TouchableWithoutFeedback onPress={() => setIsOpen(false)}>
                                <BlurView
                                    intensity={30}
                                    tint={theme === 'dark' ? 'dark' : 'light'}
                                    style={{ flex: 1 }}
                                />
                            </TouchableWithoutFeedback>
                        </Animated.View>

                        <Animated.View
                            style={{
                                position: "absolute",
                                top: 42,
                                right: 0,
                                width: 240,
                                zIndex: 1000,
                                opacity: menuFadeAnim,
                                transform: [
                                    { translateY: menuSlideAnim },
                                    { scale: menuScaleAnim }
                                ]
                            }}
                        >
                            <YStack
                                backgroundColor={colors.surface}
                                borderRadius="$4"
                                borderWidth={1}
                                borderColor={colors.border}
                                padding="$2"
                                elevation={10}
                            >
                                <YStack gap="$1">
                                    {/* Header de perfil */}
                                    <YStack padding="$3" gap="$1">
                                        <Text fontSize="$4" fontWeight="700" color={colors.textPrimary} numberOfLines={1}>
                                            {displayName}
                                        </Text>
                                        {session ? (
                                            <>
                                                <XStack backgroundColor={colors.brand} alignSelf="flex-start" px="$2" py="$0.5" borderRadius="$2" mb="$1">
                                                    <Text fontSize="$1" fontWeight="800" color="white">
                                                        {userProfile ? ({
                                                            student: t('menu.profiles.student'),
                                                            work: t('menu.profiles.work'),
                                                            personal: t('menu.profiles.personal'),
                                                            custom: t('menu.profiles.custom')
                                                        } as any)[userProfile] : t('menu.profiles.default')}
                                                    </Text>
                                                </XStack>
                                                <Text fontSize="$1" color={colors.textSecondary} numberOfLines={1}>
                                                    {session.user?.email}
                                                </Text>
                                            </>
                                        ) : (
                                            <Text fontSize="$2" color={colors.textSecondary}>
                                                {t('menu.sync')}
                                            </Text>
                                        )}
                                    </YStack>

                                    <Separator marginVertical="$2" borderColor={colors.border} />

                                    {/* Menu Items */}
                                    {menuItems.map((item: any, index) => {
                                        if (item === 'separator') {
                                            return <Separator key={`sep-${index}`} marginVertical="$2" borderColor={colors.border} />;
                                        }

                                        // OCULTAR SI ES LA PÁGINA ACTUAL
                                        if (pathname === item.route) return null;

                                        const Icon = item.icon;
                                        return (
                                            <Button
                                                key={item.route}
                                                size="$3"
                                                justifyContent="flex-start"
                                                chromeless
                                                onPress={() => handleMenuItemClick(item.route)}
                                                iconAfter={item.badge ? () => (
                                                    <Text
                                                        fontSize="$1"
                                                        fontWeight="800"
                                                        color="#F59E0B"
                                                        backgroundColor="rgba(245, 158, 11, 0.1)"
                                                        paddingHorizontal="$2"
                                                        paddingVertical="$0.5"
                                                        borderRadius="$2"
                                                    >
                                                        {item.badge}
                                                    </Text>
                                                ) : undefined}
                                            >
                                                <XStack gap="$3" alignItems="center">
                                                    <Icon size={18} color={item.color} />
                                                    <Text
                                                        fontSize="$3"
                                                        color={colors.textPrimary}
                                                    >
                                                        {item.label}
                                                    </Text>
                                                </XStack>
                                            </Button>
                                        );
                                    })}

                                    <Separator marginVertical="$2" borderColor={colors.border} />

                                    {session ? (
                                        <Button
                                            size="$3"
                                            justifyContent="flex-start"
                                            chromeless
                                            onPress={handleLogout}
                                            theme="red"
                                        >
                                            <XStack gap="$3" alignItems="center">
                                                <LogOut size={18} color="#E11D48" />
                                                <Text fontSize="$3" color="#E11D48" fontWeight="600">{t('menu.logout')}</Text>
                                            </XStack>
                                        </Button>
                                    ) : (
                                        <Button
                                            size="$3"
                                            justifyContent="flex-start"
                                            chromeless
                                            onPress={() => { setIsOpen(false); router.push('/login'); }}
                                            theme="active"
                                        >
                                            <XStack gap="$3" alignItems="center">
                                                <User size={18} color={colors.brand} />
                                                <Text fontSize="$3" color={colors.brand} fontWeight="700">{t('menu.login')}</Text>
                                            </XStack>
                                        </Button>
                                    )}
                                </YStack>
                            </YStack>
                        </Animated.View>
                    </>
                )}
            </View>
        </XStack>
    );
}
