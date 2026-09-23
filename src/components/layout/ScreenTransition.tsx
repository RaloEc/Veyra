import React, { useCallback } from 'react';
import { ViewStyle, StyleSheet } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    cancelAnimation,
    Easing,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';

export const TRANSITION_DURATION = 220;

export type TabId = 'reminders' | 'notes';

let pendingTargetTab: TabId | null = null;

export function triggerTabTransition(targetTab: TabId) {
    console.log('[ScreenTransition] trigger', targetTab);
    pendingTargetTab = targetTab;
}

export function consumeTabTransition(tabId?: TabId): boolean {
    if (!tabId || pendingTargetTab !== tabId) {
        return false;
    }

    console.log('[ScreenTransition] consume', tabId, { pendingTargetTab });
    pendingTargetTab = null;
    return true;
}

export interface ScreenTransitionProps {
    children: React.ReactNode;
    style?: ViewStyle | ViewStyle[];
    tabId?: TabId;
    duration?: number;
}

/**
 * ScreenTransition: Transición de fundido / desvanecimiento suave (fade) entre pestañas principales.
 * - opacidad base: 1
 * - animación controlada exclusivamente por useFocusEffect y consumeTabTransition
 * - cleanup garantiza que la pantalla nunca quede en opacidad 0 al desenfocarse
 */
export function ScreenTransition({
    children,
    style,
    tabId,
    duration = TRANSITION_DURATION,
}: ScreenTransitionProps) {
    const opacity = useSharedValue(1);

    useFocusEffect(
        useCallback(() => {
            const shouldAnimate = consumeTabTransition(tabId);
            console.log('[ScreenTransition]', tabId, 'focus', { shouldAnimate });

            cancelAnimation(opacity);

            if (shouldAnimate) {
                opacity.value = 0;
                opacity.value = withTiming(1, {
                    duration,
                    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
                });
            } else {
                opacity.value = 1;
            }

            return () => {
                console.log('[ScreenTransition]', tabId, 'blur');
                cancelAnimation(opacity);
                opacity.value = 1;
            };
        }, [tabId, duration])
    );

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={[styles.container, animatedStyle, style]}>
            {children}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
