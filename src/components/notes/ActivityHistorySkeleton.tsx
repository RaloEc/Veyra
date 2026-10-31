import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

interface ActivityHistorySkeletonProps {
    isDark?: boolean;
}

export function ActivityHistorySkeleton({ isDark = true }: ActivityHistorySkeletonProps) {
    const shimmerAnim = useRef(new Animated.Value(0.35)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerAnim, {
                    toValue: 0.8,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(shimmerAnim, {
                    toValue: 0.35,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [shimmerAnim]);

    const blockBg = isDark ? '#27272A' : '#E4E4E7';
    const lineBg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';

    return (
        <View style={styles.container}>
            {Array.from({ length: 5 }).map((_, index) => (
                <View key={index} style={styles.itemRow}>
                    {/* Columna Izquierda: Avatar y línea conectora */}
                    <View style={styles.trackCol}>
                        <Animated.View
                            style={[
                                styles.avatarCircle,
                                {
                                    backgroundColor: blockBg,
                                    opacity: shimmerAnim,
                                },
                            ]}
                        />
                        {index < 4 && (
                            <View
                                style={[
                                    styles.trackLine,
                                    {
                                        backgroundColor: lineBg,
                                    },
                                ]}
                            />
                        )}
                    </View>

                    {/* Columna Derecha: Contenido de la tarjeta */}
                    <View style={styles.contentCol}>
                        {/* Fila Superior: Nombre y Badge */}
                        <View style={styles.headerRow}>
                            <Animated.View
                                style={[
                                    styles.nameBox,
                                    {
                                        backgroundColor: blockBg,
                                        opacity: shimmerAnim,
                                    },
                                ]}
                            />
                            <Animated.View
                                style={[
                                    styles.badgeBox,
                                    {
                                        backgroundColor: blockBg,
                                        opacity: shimmerAnim,
                                    },
                                ]}
                            />
                        </View>

                        {/* Fila Media: Fecha */}
                        <Animated.View
                            style={[
                                styles.dateBox,
                                {
                                    backgroundColor: blockBg,
                                    opacity: shimmerAnim,
                                },
                            ]}
                        />

                        {/* Fila Inferior: Snippet de texto */}
                        <Animated.View
                            style={[
                                styles.snippetBox,
                                {
                                    backgroundColor: blockBg,
                                    opacity: shimmerAnim,
                                },
                            ]}
                        />
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        marginBottom: 24,
    },
    trackCol: {
        width: 36,
        alignItems: 'center',
        marginRight: 12,
    },
    avatarCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    trackLine: {
        flex: 1,
        width: 2,
        marginTop: 6,
        marginBottom: 2,
        borderRadius: 1,
    },
    contentCol: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    nameBox: {
        width: 120,
        height: 16,
        borderRadius: 4,
    },
    badgeBox: {
        width: 90,
        height: 24,
        borderRadius: 12,
    },
    dateBox: {
        width: 100,
        height: 12,
        borderRadius: 4,
        marginTop: 8,
    },
    snippetBox: {
        width: '100%',
        height: 60,
        borderRadius: 8,
        marginTop: 12,
    },
});
