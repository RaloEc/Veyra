import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { ControlLevelType } from '../../theme/tokens';

export interface VeyraIndicatorProps {
    controlLevel?: ControlLevelType | string | null;
    color?: string;
    pulse?: boolean;
    size?: number;
    shape?: 'dot' | 'bar';
    style?: StyleProp<ViewStyle>;
}

/**
 * VeyraIndicator — Micro-indicador visual con respiración/pulso muy sutil
 * exclusivo para tareas críticas o activas.
 */
export const VeyraIndicator: React.FC<VeyraIndicatorProps> = ({
    controlLevel,
    color,
    pulse = false,
    size = 8,
    shape = 'dot',
    style,
}) => {
    const { getControlLevelColor, accent } = useVeyraTheme();
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const isCritical = controlLevel?.toLowerCase() === 'critical';
    const shouldPulse = pulse || isCritical;

    useEffect(() => {
        if (!shouldPulse) {
            pulseAnim.setValue(1);
            return;
        }

        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 0.45,
                    duration: 1100,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1100,
                    useNativeDriver: true,
                }),
            ])
        );

        animation.start();
        return () => animation.stop();
    }, [shouldPulse, pulseAnim]);

    let resolvedColor = color;
    if (!resolvedColor) {
        if (controlLevel) {
            resolvedColor = getControlLevelColor(controlLevel).dot;
        } else {
            resolvedColor = accent.primary;
        }
    }

    if (shape === 'bar') {
        return (
            <Animated.View
                style={[
                    styles.bar,
                    {
                        backgroundColor: resolvedColor,
                        width: size,
                        opacity: shouldPulse ? pulseAnim : 1,
                    },
                    style,
                ]}
            />
        );
    }

    return (
        <Animated.View
            style={[
                styles.dot,
                {
                    backgroundColor: resolvedColor,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    opacity: shouldPulse ? pulseAnim : 1,
                },
                style,
            ]}
        />
    );
};

const styles = StyleSheet.create({
    dot: {
        alignSelf: 'center',
    },
    bar: {
        height: '100%',
        borderRadius: 2,
    },
});
