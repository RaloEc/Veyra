import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

interface CachedNoteViewProps {
    visible: boolean;
    isDark?: boolean;
    isAmoled?: boolean;
    onReady?: () => void;
}

export function CachedNoteView({
    visible,
    isDark = true,
    isAmoled = false,
    onReady,
}: CachedNoteViewProps) {
    const shimmerAnim = useRef(new Animated.Value(0.35)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerAnim, { toValue: 0.8, duration: 800, useNativeDriver: true }),
                Animated.timing(shimmerAnim, { toValue: 0.35, duration: 800, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [shimmerAnim]);

    useEffect(() => {
        if (visible) {
            onReady?.();
        }
    }, [visible, onReady]);

    if (!visible) return null;

    const skeletonColor = isAmoled ? '#161616' : (isDark ? '#27272A' : '#E4E4E7');

    return (
        <View
            style={[
                styles.container,
                { backgroundColor: isAmoled ? '#000000' : (isDark ? '#121214' : '#FFFFFF') },
            ]}
        >
            {/* Título simulado */}
            <Animated.View style={[styles.bar, { height: 24, width: '65%', backgroundColor: skeletonColor, marginBottom: 20, opacity: shimmerAnim }]} />

            {/* Párrafo 1 */}
            <Animated.View style={[styles.bar, { height: 16, width: '100%', backgroundColor: skeletonColor, marginBottom: 12, opacity: shimmerAnim }]} />
            <Animated.View style={[styles.bar, { height: 16, width: '95%', backgroundColor: skeletonColor, marginBottom: 12, opacity: shimmerAnim }]} />
            <Animated.View style={[styles.bar, { height: 16, width: '88%', backgroundColor: skeletonColor, marginBottom: 12, opacity: shimmerAnim }]} />
            <Animated.View style={[styles.bar, { height: 16, width: '75%', backgroundColor: skeletonColor, marginBottom: 24, opacity: shimmerAnim }]} />

            {/* Párrafo 2 */}
            <Animated.View style={[styles.bar, { height: 18, width: '45%', backgroundColor: skeletonColor, marginBottom: 16, opacity: shimmerAnim }]} />
            <Animated.View style={[styles.bar, { height: 16, width: '92%', backgroundColor: skeletonColor, marginBottom: 12, opacity: shimmerAnim }]} />
            <Animated.View style={[styles.bar, { height: 16, width: '80%', backgroundColor: skeletonColor, marginBottom: 12, opacity: shimmerAnim }]} />
            <Animated.View style={[styles.bar, { height: 16, width: '60%', backgroundColor: skeletonColor, opacity: shimmerAnim }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 28,
        paddingHorizontal: 16,
    },
    bar: {
        borderRadius: 4,
    },
});
