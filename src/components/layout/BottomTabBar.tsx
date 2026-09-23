import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    StyleSheet,
    Dimensions,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    Easing,
    interpolate,
    Extrapolation,
    runOnJS,
} from 'react-native-reanimated';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    Bell,
    Notebook,
    Plus,
    Clock,
    Calendar as CalendarIcon,
} from '@tamagui/lucide-icons';

import { useScreenInsets } from '../../hooks/useScreenInsets';
import { useStore } from '../../store/useStore';
import { useFoldersStore } from '../../store/useFoldersStore';
import { useVeyraTheme } from '../../theme/useVeyraTheme';

const screenHeight = Dimensions.get('window').height;
const MENU_HEIGHT = 106;

/**
 * BottomTabBar — Barra de navegación inferior ergonómica inspirada en One UI.
 * 
 * Principios:
 * - Coloca la navegación principal y la acción de creación primaria dentro del alcance natural del pulgar.
 * - Superficie sólida (colors.navBar), la barra SIEMPRE se mantiene por delante (zIndex: 1000).
 * - Menú deslizante detrás de la barra (zIndex: 990):
 *   - Fondo idéntico al color de la barra inferior.
 *   - Al pulsar (+), se desliza desde DETRÁS de la barra inferior.
 *   - El botón (+) de la barra rota suavemente 45° a (×).
 *   - Al seleccionar una opción, se termina de deslizar hacia arriba cubriendo la pantalla y abriendo la pantalla de creación.
 */
export function BottomTabBar() {
    const router = useRouter();
    const pathname = usePathname();
    const { insets, bottom: bottomInset } = useScreenInsets();
    const { t } = useTranslation();
    const { colors, accent, isDark } = useVeyraTheme();

    const language = useStore(state => state.language);
    const mainActiveTab = useStore(state => state.mainActiveTab);
    const setMainActiveTab = useStore(state => state.setMainActiveTab);
    const activeFolderId = useFoldersStore(state => state.activeFolderId);
    const selectedFolderIds = useFoldersStore(state => state.selectedFolderIds);
    const isFolderSelecting = selectedFolderIds.length > 0;

    const isRouteNotes = pathname.startsWith('/notes');
    const isNotesActive = mainActiveTab === 'notes' || isRouteNotes;
    const isRemindersActive = !isNotesActive;

    const bottomPadding = Math.max(bottomInset, 10);
    const barHeight = 58 + bottomPadding;

    const barBgColor = colors.navBar || (isDark ? '#1B1B1B' : '#FFFFFF');

    const fabScale = useSharedValue(1);
    const sheetTranslateY = useSharedValue(MENU_HEIGHT + 20);
    const fabRotateProgress = useSharedValue(0);
    const backdropOpacity = useSharedValue(0);

    const [isCreateOptionsVisible, setIsCreateOptionsVisible] = useState(false);

    const fabAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: fabScale.value }],
    }));

    const fabRotateStyle = useAnimatedStyle(() => ({
        transform: [
            {
                rotate: `${interpolate(
                    fabRotateProgress.value,
                    [0, 1],
                    [0, 45],
                    Extrapolation.CLAMP
                )}deg`,
            },
        ],
    }));

    const handleFabPressIn = () => {
        'worklet';
        fabScale.value = withSpring(0.9, { damping: 15, stiffness: 300 });
    };

    const handleFabPressOut = () => {
        'worklet';
        fabScale.value = withSpring(1, { damping: 12, stiffness: 200 });
    };

    const sheetContentOpacity = useSharedValue(1);

    const bellScale = useSharedValue(1);
    const notesScale = useSharedValue(1);
    const activeTabProgress = useSharedValue(isNotesActive ? 1 : 0);
    const isInitialMount = useRef(true);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            activeTabProgress.value = isNotesActive ? 1 : 0;
            return;
        }

        activeTabProgress.value = withSpring(isNotesActive ? 1 : 0, {
            damping: 18,
            stiffness: 220,
            mass: 0.8,
        });
        if (isNotesActive) {
            notesScale.value = 0.88;
            notesScale.value = withSpring(1, { damping: 12, stiffness: 280 });
        } else {
            bellScale.value = 0.88;
            bellScale.value = withSpring(1, { damping: 12, stiffness: 280 });
        }
    }, [isNotesActive]);

    const bellAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: bellScale.value }],
    }));

    const notesAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: notesScale.value }],
    }));

    const bellPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(activeTabProgress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
        transform: [
            {
                scale: interpolate(activeTabProgress.value, [0, 1], [1, 0.75], Extrapolation.CLAMP),
            },
        ],
    }));

    const notesPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(activeTabProgress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
        transform: [
            {
                scale: interpolate(activeTabProgress.value, [0, 1], [0.75, 1], Extrapolation.CLAMP),
            },
        ],
    }));

    const sheetContentAnimatedStyle = useAnimatedStyle(() => ({
        opacity: sheetContentOpacity.value,
    }));

    const openMenu = () => {
        sheetContentOpacity.value = 1;
        sheetTranslateY.value = MENU_HEIGHT + 20;
        backdropOpacity.value = 0;
        setIsCreateOptionsVisible(true);

        sheetTranslateY.value = withTiming(0, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
        });
        fabRotateProgress.value = withTiming(1, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
        });
        backdropOpacity.value = withTiming(1, {
            duration: 200,
            easing: Easing.out(Easing.cubic),
        });
    };

    const closeMenu = () => {
        sheetTranslateY.value = withTiming(
            MENU_HEIGHT + 20,
            {
                duration: 180,
                easing: Easing.out(Easing.cubic),
            },
            (finished) => {
                if (finished) {
                    runOnJS(setIsCreateOptionsVisible)(false);
                }
            }
        );
        fabRotateProgress.value = withTiming(0, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
        });
        backdropOpacity.value = withTiming(0, {
            duration: 160,
            easing: Easing.out(Easing.cubic),
        });
    };

    const handleSelectOption = (route: string) => {
        setIsCreateOptionsVisible(false);
        sheetTranslateY.value = MENU_HEIGHT + 20;
        fabRotateProgress.value = 0;
        backdropOpacity.value = 0;
        router.push(route as any);
    };

    const handleFabPress = () => {
        if (isNotesActive) {
            const folderParam = activeFolderId !== 'all' && activeFolderId !== 'pinned' && activeFolderId !== 'unassigned'
                ? `?folderId=${activeFolderId}`
                : '';
            router.push(`/notes/create${folderParam}`);
        } else {
            if (isCreateOptionsVisible) {
                closeMenu();
            } else {
                openMenu();
            }
        }
    };

    const handleTabReminders = () => {
        if (!isRemindersActive) {
            activeTabProgress.value = withSpring(0, {
                damping: 20,
                stiffness: 260,
                mass: 0.7,
            });
            bellScale.value = 0.88;
            bellScale.value = withSpring(1, { damping: 12, stiffness: 280 });
            if (isCreateOptionsVisible) closeMenu();
            setMainActiveTab('reminders');
            if (pathname !== '/') router.replace('/');
        }
    };

    const handleTabNotes = () => {
        if (!isNotesActive) {
            activeTabProgress.value = withSpring(1, {
                damping: 20,
                stiffness: 260,
                mass: 0.7,
            });
            notesScale.value = 0.88;
            notesScale.value = withSpring(1, { damping: 12, stiffness: 280 });
            if (isCreateOptionsVisible) closeMenu();
            setMainActiveTab('notes');
            if (pathname !== '/') router.replace('/');
        }
    };

    const backdropAnimatedStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value * (isDark ? 0.45 : 0.25),
    }));

    const sheetAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: sheetTranslateY.value }],
    }));

    return (
        <>
            {/* 1. Backdrop para cerrar al tocar fuera (detrás del menú y de la barra) */}
            {isCreateOptionsVisible && (
                <TouchableWithoutFeedback onPress={closeMenu}>
                    <Animated.View
                        style={[
                            StyleSheet.absoluteFill,
                            styles.backdrop,
                            backdropAnimatedStyle,
                        ]}
                    />
                </TouchableWithoutFeedback>
            )}

            {/* 2. Menú de creación deslizante (zIndex: 990, DETRÁS de la barra inferior) */}
            {isCreateOptionsVisible && (
                <Animated.View
                    pointerEvents={isCreateOptionsVisible ? 'auto' : 'none'}
                    style={[
                        styles.menuSheet,
                        {
                            height: screenHeight + MENU_HEIGHT + barHeight,
                            backgroundColor: barBgColor,
                        },
                        sheetAnimatedStyle,
                    ]}
                >
                    <Animated.View style={sheetContentAnimatedStyle}>
                        {/* Título de la sección */}
                        <Text style={[styles.menuHeaderTitle, { color: colors.textSecondary }]}>
                            {language === 'es' ? '¿Qué deseas crear?' : 'What do you want to create?'}
                        </Text>

                        {/* Opciones minimalistas en cápsula / pill */}
                        <View style={styles.actionPillsRow}>
                            {/* Opción 1: Recordatorio */}
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => handleSelectOption('/create')}
                                style={[
                                    styles.actionPill,
                                    {
                                        backgroundColor: isDark ? colors.bg : 'rgba(0, 0, 0, 0.05)',
                                        borderColor: isDark ? colors.borderSubtle : 'rgba(0, 0, 0, 0.04)',
                                    },
                                ]}
                            >
                                <Clock size={16} color={accent.primary as any} strokeWidth={2.2} />
                                <Text style={[styles.actionPillText, { color: colors.textPrimary }]}>
                                    {language === 'es' ? 'Recordatorio' : 'Reminder'}
                                </Text>
                            </TouchableOpacity>

                            {/* Opción 2: Evento */}
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => handleSelectOption('/events/create')}
                                style={[
                                    styles.actionPill,
                                    {
                                        backgroundColor: isDark ? colors.bg : 'rgba(0, 0, 0, 0.05)',
                                        borderColor: isDark ? colors.borderSubtle : 'rgba(0, 0, 0, 0.04)',
                                    },
                                ]}
                            >
                                <CalendarIcon size={16} color={accent.primary as any} strokeWidth={2.2} />
                                <Text style={[styles.actionPillText, { color: colors.textPrimary }]}>
                                    {language === 'es' ? 'Evento' : 'Event'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </Animated.View>
            )}

            {/* 3. Barra de navegación inferior principal (zIndex: 1000, SIEMPRE POR DELANTE) */}
            <View
                style={[
                    styles.wrapper,
                    {
                        backgroundColor: barBgColor,
                        paddingBottom: bottomPadding,
                    },
                ]}
            >
                <View
                    style={[
                        styles.barContent,
                        isFolderSelecting && { opacity: 0.28 },
                    ]}
                    pointerEvents={isFolderSelecting ? 'none' : 'auto'}
                >
                    {/* 1. Tab Recordatorios */}
                    <TouchableOpacity
                        activeOpacity={0.75}
                        disabled={isFolderSelecting}
                        onPress={handleTabReminders}
                        style={styles.tabButton}
                        hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                    >
                        <View style={styles.iconContainer}>
                            <Animated.View
                                style={[
                                    styles.tabActivePill,
                                    { backgroundColor: isDark ? `${accent.primary}2E` : `${accent.primary}18` },
                                    bellPillStyle,
                                ]}
                            />
                            <Animated.View style={bellAnimatedStyle}>
                                <Bell
                                    size={22}
                                    color={isRemindersActive ? (accent.primary as any) : (colors.textMuted as any)}
                                    strokeWidth={isRemindersActive ? 2.5 : 2}
                                />
                            </Animated.View>
                        </View>
                        <Text
                            style={[
                                styles.tabLabel,
                                {
                                    color: isRemindersActive ? colors.textPrimary : colors.textMuted,
                                    fontWeight: isRemindersActive ? '700' : '500',
                                    fontSize: 11,
                                },
                            ]}
                            numberOfLines={1}
                        >
                            {language === 'es' ? 'Recordatorios' : 'Reminders'}
                        </Text>
                    </TouchableOpacity>

                    {/* 2. Botón Central Flotante (FAB que rota a x cuando el menú está abierto) */}
                    <View style={styles.fabSlot}>
                        <Animated.View style={fabAnimatedStyle}>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                disabled={isFolderSelecting}
                                onPress={handleFabPress}
                                onPressIn={handleFabPressIn}
                                onPressOut={handleFabPressOut}
                                style={[
                                    styles.fabButton,
                                    {
                                        backgroundColor: accent.primary,
                                    },
                                ]}
                            >
                                <Animated.View style={fabRotateStyle}>
                                    <Plus size={24} color={isDark ? '#1B1B1B' : '#FFFFFF'} strokeWidth={3} />
                                </Animated.View>
                            </TouchableOpacity>
                        </Animated.View>
                    </View>

                    {/* 3. Tab Notas */}
                    <TouchableOpacity
                        activeOpacity={0.75}
                        disabled={isFolderSelecting}
                        onPress={handleTabNotes}
                        style={styles.tabButton}
                        hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                    >
                        <View style={styles.iconContainer}>
                            <Animated.View
                                style={[
                                    styles.tabActivePill,
                                    { backgroundColor: isDark ? `${accent.primary}2E` : `${accent.primary}18` },
                                    notesPillStyle,
                                ]}
                            />
                            <Animated.View style={notesAnimatedStyle}>
                                <Notebook
                                    size={22}
                                    color={isNotesActive ? (accent.primary as any) : (colors.textMuted as any)}
                                    strokeWidth={isNotesActive ? 2.5 : 2}
                                />
                            </Animated.View>
                        </View>
                        <Text
                            style={[
                                styles.tabLabel,
                                {
                                    color: isNotesActive ? colors.textPrimary : colors.textMuted,
                                    fontWeight: isNotesActive ? '700' : '500',
                                    fontSize: 11,
                                },
                            ]}
                            numberOfLines={1}
                        >
                            {language === 'es' ? 'Notas' : 'Notes'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        backgroundColor: '#000000',
        zIndex: 980,
    },
    menuSheet: {
        position: 'absolute',
        bottom: -screenHeight,
        left: 0,
        right: 0,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
        elevation: 8,
        zIndex: 990,
    },
    menuHeaderTitle: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.2,
        textAlign: 'center',
        marginTop: 14,
        marginBottom: 12,
        textTransform: 'uppercase',
        opacity: 0.6,
    },
    actionPillsRow: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
        marginBottom: 14,
    },
    actionPill: {
        flex: 1,
        height: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 22,
        borderWidth: 1,
    },
    actionPillText: {
        fontSize: 13.5,
        fontWeight: '600',
        letterSpacing: -0.1,
    },
    wrapper: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopWidth: 0,
        zIndex: 1000,
    },
    barContent: {
        height: 58,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: 24,
    },
    tabButton: {
        minWidth: 80,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingVertical: 4,
    },
    iconContainer: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 28,
    },
    tabActivePill: {
        position: 'absolute',
        width: 44,
        height: 28,
        borderRadius: 14,
    },
    tabLabel: {
        letterSpacing: 0.1,
    },
    fabSlot: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -16,
    },
    fabButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
