import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Platform } from 'react-native';
import { BlurView, BlurTint } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraRadii } from '../../theme/tokens';

export interface VeyraGlassProps {
    intensity?: number;
    tint?: BlurTint;
    bordered?: boolean;
    radius?: VeyraRadii;
    showGradientHighlight?: boolean;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
}

/**
 * VeyraGlass — Superficie translúcida / frosted glass con aceleración por hardware (GPU)
 * usando expo-blur en iOS y Android.
 */
export const VeyraGlass: React.FC<VeyraGlassProps> = ({
    intensity = 60,
    tint,
    bordered = true,
    radius = 'lg',
    showGradientHighlight = true,
    style,
    contentStyle,
    children,
}) => {
    const { colors, radii, isDark } = useVeyraTheme();
    const borderRadius = radii[radius] ?? radii.lg;
    const computedTint: BlurTint = tint ?? (isDark ? 'dark' : 'light');

    const glassBg = isDark ? 'rgba(18, 20, 24, 0.72)' : 'rgba(255, 255, 255, 0.78)';
    const glassBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.6)';

    return (
        <View
            style={[
                styles.container,
                {
                    borderRadius,
                    borderColor: bordered ? glassBorder : 'transparent',
                    borderWidth: bordered ? 1 : 0,
                    backgroundColor: glassBg,
                },
                style,
            ]}
        >
            {/* Native Blur Layer (iOS & Android) */}
            <BlurView
                intensity={intensity}
                tint={computedTint}
                style={StyleSheet.absoluteFill}
            />

            {/* Subtle Glass Reflection Gradient */}
            {showGradientHighlight && (
                <LinearGradient
                    colors={
                        isDark
                            ? ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.01)', 'rgba(0, 0, 0, 0.1)']
                            : ['rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.1)', 'rgba(0, 0, 0, 0.02)']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />
            )}

            <View style={[styles.content, contentStyle]}>
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        overflow: 'hidden',
    },
    content: {
        position: 'relative',
        zIndex: 1,
    },
});
