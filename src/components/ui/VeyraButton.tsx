import React, { useRef } from 'react';
import {
    TouchableOpacity,
    Text,
    Animated,
    StyleSheet,
    ActivityIndicator,
    ViewStyle,
    TextStyle,
    StyleProp,
    View,
} from 'react-native';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraRadii } from '../../theme/tokens';

export type VeyraButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type VeyraButtonSize = 'sm' | 'md' | 'lg';

export interface VeyraButtonProps {
    variant?: VeyraButtonVariant;
    size?: VeyraButtonSize;
    radius?: VeyraRadii;
    label?: string;
    iconLeft?: React.ReactNode;
    iconRight?: React.ReactNode;
    loading?: boolean;
    disabled?: boolean;
    onPress?: () => void;
    onLongPress?: () => void;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    fullWidth?: boolean;
    children?: React.ReactNode;
}

/**
 * VeyraButton — Botón nativo de alta precisión con micro-interacciones táctiles,
 * soporte de variantes de color, iconos y accesibilidad.
 */
export const VeyraButton: React.FC<VeyraButtonProps> = ({
    variant = 'primary',
    size = 'md',
    radius = 'md',
    label,
    iconLeft,
    iconRight,
    loading = false,
    disabled = false,
    onPress,
    onLongPress,
    style,
    textStyle,
    fullWidth = false,
    children,
}) => {
    const { colors, radii, motion, accent, typography, isDark } = useVeyraTheme();
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const borderRadius = radii[radius] ?? radii.md;
    const isInteractive = !disabled && !loading;

    const handlePressIn = () => {
        if (!isInteractive) return;
        Animated.timing(scaleAnim, {
            toValue: 0.97,
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

    // Styling logic based on variant & theme
    let bg: string = accent.primary;
    let textColor: string = isDark ? '#1B1B1B' : '#FFFFFF';
    let borderColor: string = 'transparent';
    let borderWidth: number = 0;

    if (variant === 'secondary') {
        bg = colors.surfaceElevated;
        textColor = colors.textPrimary;
        borderColor = colors.borderMedium;
        borderWidth = 1;
    } else if (variant === 'outline') {
        bg = 'transparent';
        textColor = colors.textPrimary;
        borderColor = colors.borderStrong;
        borderWidth = 1;
    } else if (variant === 'ghost') {
        bg = 'transparent';
        textColor = colors.textSecondary;
    } else if (variant === 'danger') {
        bg = isDark ? 'rgba(225, 29, 72, 0.16)' : 'rgba(225, 29, 72, 0.10)';
        textColor = isDark ? '#FB7185' : '#E11D48';
        borderColor = isDark ? 'rgba(225, 29, 72, 0.3)' : 'rgba(225, 29, 72, 0.2)';
        borderWidth = 1;
    }

    // Size metrics
    let paddingVertical = 10;
    let paddingHorizontal = 16;
    let fontSize: number = typography.bodyMedium.fontSize;
    let iconGap = 8;
    let minHeight = 44;

    if (size === 'sm') {
        paddingVertical = 6;
        paddingHorizontal = 12;
        fontSize = typography.caption.fontSize;
        iconGap = 6;
        minHeight = 34;
    } else if (size === 'lg') {
        paddingVertical = 14;
        paddingHorizontal = 22;
        fontSize = typography.h3.fontSize;
        iconGap = 10;
        minHeight = 52;
    }

    return (
        <Animated.View
            style={[
                { transform: [{ scale: scaleAnim }] },
                fullWidth && { width: '100%' },
                style,
            ]}
        >
            <TouchableOpacity
                activeOpacity={0.88}
                disabled={!isInteractive}
                onPress={onPress}
                onLongPress={onLongPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={[
                    styles.button,
                    {
                        backgroundColor: bg,
                        borderRadius,
                        borderColor,
                        borderWidth,
                        paddingVertical,
                        paddingHorizontal,
                        minHeight,
                        opacity: disabled ? 0.45 : 1,
                    },
                    fullWidth && { width: '100%' },
                ]}
            >
                {loading ? (
                    <ActivityIndicator size="small" color={textColor} />
                ) : (
                    <View style={[styles.content, { gap: iconGap }]}>
                        {iconLeft}
                        {label ? (
                            <Text
                                style={[
                                    styles.label,
                                    {
                                        color: textColor,
                                        fontSize,
                                        fontWeight: '600',
                                    },
                                    textStyle,
                                ]}
                            >
                                {label}
                            </Text>
                        ) : null}
                        {children}
                        {iconRight}
                    </View>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        letterSpacing: 0.1,
    },
});
