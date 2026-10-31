import React, { useRef, useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    PanResponder,
    Vibration,
} from 'react-native';
import { Check, ChevronsRight } from '@tamagui/lucide-icons';

interface SlideToConfirmProps {
    onConfirm: () => void;
    label?: string;
    themeColor?: string;
    isDark?: boolean;
    disabled?: boolean;
}

export function SlideToConfirm({
    onConfirm,
    label = 'Desliza para completar',
    themeColor = '#10B981',
    isDark = true,
    disabled = false,
}: SlideToConfirmProps) {
    const [containerWidth, setContainerWidth] = useState(0);
    const [isConfirmed, setIsConfirmed] = useState(false);
    const [isPastThreshold, setIsPastThreshold] = useState(false);

    const sliderX = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const arrowSlideAnim = useRef(new Animated.Value(0)).current;

    const thumbWidth = 54;
    const padding = 5;
    const maxSlide = Math.max(0, containerWidth - thumbWidth - padding * 2);

    // Keep ref to avoid stale closure in PanResponder
    const maxSlideRef = useRef(maxSlide);
    maxSlideRef.current = maxSlide;

    const isConfirmedRef = useRef(isConfirmed);
    isConfirmedRef.current = isConfirmed;

    const onConfirmRef = useRef(onConfirm);
    onConfirmRef.current = onConfirm;

    // Pulse animation inviting user to slide
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(arrowSlideAnim, {
                    toValue: 6,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(arrowSlideAnim, {
                    toValue: 0,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => !disabled && !isConfirmedRef.current,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return !disabled && !isConfirmedRef.current && Math.abs(gestureState.dx) > 4;
            },
            onPanResponderGrant: () => {
                try {
                    Vibration.vibrate(10);
                } catch {}
            },
            onPanResponderMove: (_, gestureState) => {
                if (isConfirmedRef.current || disabled) return;
                const newX = Math.max(0, Math.min(gestureState.dx, maxSlideRef.current));
                sliderX.setValue(newX);

                const threshold = maxSlideRef.current * 0.72;
                if (newX >= threshold && !isPastThreshold) {
                    setIsPastThreshold(true);
                    try { Vibration.vibrate(15); } catch {}
                } else if (newX < threshold && isPastThreshold) {
                    setIsPastThreshold(false);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (isConfirmedRef.current || disabled) return;
                const threshold = maxSlideRef.current * 0.72;

                if (gestureState.dx >= threshold && maxSlideRef.current > 0) {
                    // Confirmed!
                    try {
                        Vibration.vibrate(40);
                    } catch {}

                    Animated.timing(sliderX, {
                        toValue: maxSlideRef.current,
                        duration: 160,
                        useNativeDriver: false,
                    }).start(() => {
                        setIsConfirmed(true);
                        onConfirmRef.current();
                    });
                } else {
                    // Snap back
                    setIsPastThreshold(false);
                    Animated.spring(sliderX, {
                        toValue: 0,
                        friction: 7,
                        tension: 70,
                        useNativeDriver: false,
                    }).start();
                }
            },
            onPanResponderTerminate: () => {
                setIsPastThreshold(false);
                Animated.spring(sliderX, {
                    toValue: 0,
                    friction: 7,
                    tension: 70,
                    useNativeDriver: false,
                }).start();
            },
        })
    ).current;

    const textOpacity = maxSlide > 0
        ? sliderX.interpolate({
            inputRange: [0, maxSlide * 0.45],
            outputRange: [1, 0],
            extrapolate: 'clamp',
        })
        : 1;

    const fillWidth = maxSlide > 0
        ? Animated.add(sliderX, new Animated.Value(thumbWidth + padding * 2))
        : 0;

    return (
        <View
            style={[
                styles.track,
                {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.12)',
                },
            ]}
            onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w > 0) {
                    setContainerWidth(w);
                }
            }}
        >
            {/* Animated Fill Layer with Glow */}
            <Animated.View
                style={[
                    styles.fillLayer,
                    {
                        width: fillWidth,
                        backgroundColor: `${themeColor}2A`,
                    },
                ]}
            />

            {/* Centered Instructional Label with animated nudge chevron */}
            <Animated.View style={[styles.labelWrap, { opacity: textOpacity }]} pointerEvents="none">
                <Text
                    style={[
                        styles.label,
                        { color: isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.8)' },
                    ]}
                    numberOfLines={1}
                >
                    {label}
                </Text>
                <Animated.View style={{ transform: [{ translateX: arrowSlideAnim }] }}>
                    <ChevronsRight
                        size={18}
                        color={isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)'}
                    />
                </Animated.View>
            </Animated.View>

            {/* Draggable Thumb with State Indicator */}
            <Animated.View
                {...panResponder.panHandlers}
                style={[
                    styles.thumb,
                    {
                        backgroundColor: themeColor,
                        transform: [{ translateX: sliderX }],
                        shadowColor: themeColor,
                    },
                ]}
            >
                {isPastThreshold || isConfirmed ? (
                    <Check size={24} color="#FFFFFF" strokeWidth={3.5} />
                ) : (
                    <ChevronsRight size={24} color="#FFFFFF" strokeWidth={3} />
                )}
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    track: {
        height: 64,
        borderRadius: 32,
        borderWidth: 1.5,
        justifyContent: 'center',
        paddingHorizontal: 5,
        position: 'relative',
        overflow: 'hidden',
    },
    fillLayer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
    },
    labelWrap: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 60,
    },
    label: {
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    thumb: {
        width: 54,
        height: 54,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 8,
    },
});
