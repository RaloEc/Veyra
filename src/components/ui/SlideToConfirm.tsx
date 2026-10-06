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

    const sliderX = useRef(new Animated.Value(0)).current;
    const thumbWidth = 50;
    const padding = 4;
    const maxSlide = Math.max(0, containerWidth - thumbWidth - padding * 2);

    // Keep ref to avoid stale closure in PanResponder
    const maxSlideRef = useRef(maxSlide);
    maxSlideRef.current = maxSlide;

    const isConfirmedRef = useRef(isConfirmed);
    isConfirmedRef.current = isConfirmed;

    const onConfirmRef = useRef(onConfirm);
    onConfirmRef.current = onConfirm;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => !disabled && !isConfirmedRef.current,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return !disabled && !isConfirmedRef.current && Math.abs(gestureState.dx) > 5;
            },
            onPanResponderGrant: () => {
                // Initial touch
            },
            onPanResponderMove: (_, gestureState) => {
                if (isConfirmedRef.current || disabled) return;
                const newX = Math.max(0, Math.min(gestureState.dx, maxSlideRef.current));
                sliderX.setValue(newX);
            },
            onPanResponderRelease: (_, gestureState) => {
                if (isConfirmedRef.current || disabled) return;
                const threshold = maxSlideRef.current * 0.72;

                if (gestureState.dx >= threshold && maxSlideRef.current > 0) {
                    // Confirmed!
                    try {
                        Vibration.vibrate(35);
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
                    Animated.spring(sliderX, {
                        toValue: 0,
                        friction: 6,
                        tension: 60,
                        useNativeDriver: false,
                    }).start();
                }
            },
            onPanResponderTerminate: () => {
                Animated.spring(sliderX, {
                    toValue: 0,
                    friction: 6,
                    tension: 60,
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
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
                },
            ]}
            onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w > 0) {
                    setContainerWidth(w);
                }
            }}
        >
            {/* Animated Fill Layer */}
            <Animated.View
                style={[
                    styles.fillLayer,
                    {
                        width: fillWidth,
                        backgroundColor: `${themeColor}25`,
                    },
                ]}
            />

            {/* Centered Instructional Label */}
            <Animated.View style={[styles.labelWrap, { opacity: textOpacity }]} pointerEvents="none">
                <Text
                    style={[
                        styles.label,
                        { color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)' },
                    ]}
                    numberOfLines={1}
                >
                    {label}
                </Text>
                <ChevronsRight
                    size={18}
                    color={isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.35)'}
                />
            </Animated.View>

            {/* Draggable Thumb */}
            <Animated.View
                {...panResponder.panHandlers}
                style={[
                    styles.thumb,
                    {
                        backgroundColor: themeColor,
                        transform: [{ translateX: sliderX }],
                    },
                ]}
            >
                <Check size={22} color="#FFFFFF" strokeWidth={3.2} />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    track: {
        height: 58,
        borderRadius: 29,
        borderWidth: 1.5,
        justifyContent: 'center',
        paddingHorizontal: 4,
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
        paddingHorizontal: 54,
    },
    label: {
        fontSize: 14.5,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    thumb: {
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 5,
    },
});
