import React, { useRef } from 'react';
import { View, Animated, TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraRadii, ControlLevelType } from '../../theme/tokens';

export interface VeyraCardProps {
    level?: 1 | 2 | 3;
    radius?: VeyraRadii;
    bordered?: boolean;
    borderLevel?: 'subtle' | 'medium' | 'strong';
    controlLevel?: ControlLevelType | string | null;
    showControlIndicator?: boolean;
    onPress?: () => void;
    onLongPress?: () => void;
    activeOpacity?: number;
    style?: StyleProp<ViewStyle>;
    contentContainerStyle?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
}

/**
 * VeyraCard — Tarjeta de contenido sólido con soporte táctil, bordes calibrados
 * y opcionalmente barra lateral indicadora de nivel de control (Normal / Strict / Critical).
 */
export const VeyraCard: React.FC<VeyraCardProps> = ({
    level = 1,
    radius = 'md',
    bordered = true,
    borderLevel = 'subtle',
    controlLevel,
    showControlIndicator = false,
    onPress,
    onLongPress,
    activeOpacity = 0.88,
    style,
    contentContainerStyle,
    children,
}) => {
    const { colors, radii, motion, getControlLevelColor } = useVeyraTheme();
    const scaleAnim = useRef(new Animated.Value(1)).current;

    let backgroundColor: string = colors.surface;
    if (level === 2) backgroundColor = colors.surfaceElevated;
    else if (level === 3) backgroundColor = colors.surfaceCard;

    let borderColor: string = colors.borderSubtle;
    if (borderLevel === 'medium') borderColor = colors.borderMedium;
    else if (borderLevel === 'strong') borderColor = colors.borderStrong;

    const borderRadius = radii[radius] ?? radii.md;
    const isInteractive = Boolean(onPress || onLongPress);

    const handlePressIn = () => {
        if (!isInteractive) return;
        Animated.timing(scaleAnim, {
            toValue: 0.985,
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

    const controlInfo = controlLevel ? getControlLevelColor(controlLevel) : null;
    const showSideBar = showControlIndicator && controlInfo?.hasSideBar;

    const CardContent = (
        <View
            style={[
                styles.card,
                {
                    backgroundColor,
                    borderRadius,
                    borderColor: bordered ? borderColor : 'transparent',
                    borderWidth: bordered ? 1 : 0,
                },
                contentContainerStyle,
            ]}
        >
            {showSideBar && (
                <View
                    style={[
                        styles.controlIndicator,
                        {
                            backgroundColor: controlInfo.main,
                            borderTopLeftRadius: borderRadius,
                            borderBottomLeftRadius: borderRadius,
                        },
                    ]}
                />
            )}
            {children}
        </View>
    );

    if (isInteractive) {
        return (
            <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
                <TouchableOpacity
                    activeOpacity={activeOpacity}
                    onPress={onPress}
                    onLongPress={onLongPress}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                >
                    {CardContent}
                </TouchableOpacity>
            </Animated.View>
        );
    }

    return <View style={style}>{CardContent}</View>;
};

const styles = StyleSheet.create({
    card: {
        position: 'relative',
        overflow: 'hidden',
    },
    controlIndicator: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 3.5,
        zIndex: 2,
    },
});
