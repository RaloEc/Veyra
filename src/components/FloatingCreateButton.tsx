import React, { useState } from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    View,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import { Plus, Zap } from '@tamagui/lucide-icons';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useVeyraTheme } from '../theme/useVeyraTheme';
import { QuickAddSheet } from './QuickAddSheet';

/**
 * FloatingCreateButton — Botón flotante accesible de creación rápida (FAB)
 * Diseñado según la sección 23 de VEYRA_DESIGN_SYSTEM.md
 */
export function FloatingCreateButton() {
    const router = useRouter();
    const segments = useSegments();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { colors, accent, motion, isDark, typography } = useVeyraTheme();
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    // Solo visible en el Dashboard principal
    const isMainScreen = segments[0] === undefined;
    if (!isMainScreen) return null;

    const handlePressIn = () => {
        'worklet';
        scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
    };

    const handlePressOut = () => {
        'worklet';
        scale.value = withSpring(1, { damping: 12, stiffness: 200 });
    };

    return (
        <>
            <Animated.View
                style={[
                    styles.container,
                    {
                        bottom: insets.bottom + 24,
                    },
                    animatedStyle,
                ]}
            >
                <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => router.push('/create')}
                    onLongPress={() => setIsQuickAddOpen(true)}
                    delayLongPress={350}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    style={[
                        styles.button,
                        {
                            backgroundColor: accent.primary,
                            shadowColor: accent.primary,
                        },
                    ]}
                >
                    <Plus size={18} color={colors.textInverse} strokeWidth={3} />
                    <Text
                        style={[
                            styles.label,
                            {
                                color: colors.textInverse,
                                fontSize: typography.caption.fontSize,
                            },
                        ]}
                    >
                        {t('home.create_fab')}
                    </Text>
                </TouchableOpacity>
            </Animated.View>

            <QuickAddSheet
                visible={isQuickAddOpen}
                onClose={() => setIsQuickAddOpen(false)}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        alignSelf: 'center',
        zIndex: 1000,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 999,
        gap: 6,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 6,
    },
    label: {
        fontWeight: '800',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
});
