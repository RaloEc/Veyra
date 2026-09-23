import React, { useRef } from 'react';
import {
    TouchableOpacity,
    Animated,
    StyleSheet,
    ViewStyle,
    StyleProp,
    ActivityIndicator,
} from 'react-native';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraRadii } from '../../theme/tokens';

export type VeyraIconButtonVariant = 'default' | 'surface' | 'glass' | 'ghost' | 'accent' | 'danger';
export type VeyraIconButtonSize = 'sm' | 'md' | 'lg';

export interface VeyraIconButtonProps {
    icon: React.ReactNode;
    variant?: VeyraIconButtonVariant;
    size?: VeyraIconButtonSize;
    radius?: VeyraRadii;
    bordered?: boolean;
    loading?: boolean;
    disabled?: boolean;
    onPress?: () => void;
    onLongPress?: () => void;
    style?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
}

/**
 * VeyraIconButton — Botón para iconos con touch targets cómodos y respuesta táctil.
 */
export const VeyraIconButton: React.FC<VeyraIconButtonProps> = ({
    icon,
    variant = 'surface',
    size = 'md',
    radius = 'md',
    bordered = true,
    loading = false,
    disabled = false,
    onPress,
    onLongPress,
    style,
    accessibilityLabel,
}) => {
    const { colors, radii, motion, accent, isDark } = useVeyraTheme();
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const borderRadius = radii[radius] ?? radii.md;
    const isInteractive = !disabled && !loading;

    const handlePressIn = () => {
        if (!isInteractive) return;
        Animated.timing(scaleAnim, {
            toValue: 0.94,
            duration: motion.fast,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
        if (!isInteractive) return;
        Animated.timing(scaleAnim, {
            toValue: 1,
            duration: motion.fast,
            useNativeDriver: true,
        }).start();
    };

    let bg: string = colors.surface;
    let borderColor: string = colors.borderSubtle;
    let borderWidth: number = bordered ? 1 : 0;

    if (variant === 'surface') {
        bg = colors.surfaceElevated;
        borderColor = colors.borderSubtle;
    } else if (variant === 'glass') {
        bg = colors.glassBg;
        borderColor = colors.glassBorder;
    } else if (variant === 'ghost') {
        bg = 'transparent';
        borderWidth = 0;
    } else if (variant === 'accent') {
        bg = accent.primary;
        borderWidth = 0;
    } else if (variant === 'danger') {
        bg = isDark ? 'rgba(225, 29, 72, 0.16)' : 'rgba(225, 29, 72, 0.10)';
        borderColor = isDark ? 'rgba(225, 29, 72, 0.3)' : 'rgba(225, 29, 72, 0.2)';
    }

    let dimension = 42;
    if (size === 'sm') dimension = 34;
    else if (size === 'lg') dimension = 50;

    return (
        <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
            <TouchableOpacity
                accessibilityLabel={accessibilityLabel}
                activeOpacity={0.85}
                disabled={!isInteractive}
                onPress={onPress}
                onLongPress={onLongPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={[
                    styles.button,
                    {
                        width: dimension,
                        height: dimension,
                        backgroundColor: bg,
                        borderRadius,
                        borderColor,
                        borderWidth,
                        opacity: disabled ? 0.45 : 1,
                    },
                ]}
            >
                {loading ? (
                    <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                    icon
                )}
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    button: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
});
