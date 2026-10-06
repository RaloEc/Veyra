import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { useVeyraTheme } from '../../theme/useVeyraTheme';

interface SyncProgressBarProps {
    isSyncing: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * SyncProgressBar — Línea sutil animada (2px) en la base de la TopBar
 * que indica actividad de sincronización en segundo plano con la nube.
 */
export function SyncProgressBar({ isSyncing }: SyncProgressBarProps) {
    const { accent } = useVeyraTheme();
    const animX = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        let loopAnimation: Animated.CompositeAnimation | null = null;

        if (isSyncing) {
            // Mostrar la barra con fade-in
            Animated.timing(opacityAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }).start();

            // Animación continua de deslizamiento de izquierda a derecha
            animX.setValue(0);
            loopAnimation = Animated.loop(
                Animated.timing(animX, {
                    toValue: 1,
                    duration: 1200,
                    easing: Easing.bezier(0.4, 0, 0.2, 1),
                    useNativeDriver: true,
                })
            );
            loopAnimation.start();
        } else {
            // Ocultar con fade-out suave al terminar
            Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 350,
                useNativeDriver: true,
            }).start(() => {
                loopAnimation?.stop();
                animX.setValue(0);
            });
        }

        return () => {
            loopAnimation?.stop();
        };
    }, [isSyncing]);

    const barWidth = SCREEN_WIDTH * 0.45;
    const translateX = animX.interpolate({
        inputRange: [0, 1],
        outputRange: [-barWidth, SCREEN_WIDTH + barWidth],
    });

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.container,
                { opacity: opacityAnim },
            ]}
        >
            <Animated.View
                style={[
                    styles.indicatorBeam,
                    {
                        width: barWidth,
                        backgroundColor: accent.primary,
                        transform: [{ translateX }],
                    },
                ]}
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        overflow: 'hidden',
        zIndex: 999,
    },
    indicatorBeam: {
        height: '100%',
        borderRadius: 1,
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
        elevation: 2,
    },
});
