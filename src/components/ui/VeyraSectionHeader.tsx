import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useVeyraTheme } from '../../theme/useVeyraTheme';

export interface VeyraSectionHeaderProps {
    title: string;
    count?: number;
    actionLabel?: string;
    onActionPress?: () => void;
    icon?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/**
 * VeyraSectionHeader — Encabezado minimalista para secciones de contenido.
 */
export const VeyraSectionHeader: React.FC<VeyraSectionHeaderProps> = ({
    title,
    count,
    actionLabel,
    onActionPress,
    icon,
    style,
}) => {
    const { colors, typography, accent } = useVeyraTheme();

    return (
        <View style={[styles.container, style]}>
            <View style={styles.titleGroup}>
                {icon}
                <Text
                    style={[
                        styles.title,
                        {
                            color: colors.textSecondary,
                            fontSize: typography.caption.fontSize,
                            fontWeight: '700',
                        },
                    ]}
                >
                    {title.toUpperCase()}
                </Text>
                {typeof count === 'number' && (
                    <View
                        style={[
                            styles.countBadge,
                            {
                                backgroundColor: colors.surfaceElevated,
                                borderColor: colors.borderSubtle,
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.countText,
                                {
                                    color: colors.textMuted,
                                    fontSize: typography.micro.fontSize,
                                },
                            ]}
                        >
                            {count}
                        </Text>
                    </View>
                )}
            </View>

            {actionLabel && onActionPress && (
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={onActionPress}
                    style={styles.actionButton}
                >
                    <Text
                        style={[
                            styles.actionText,
                            {
                                color: accent.primary,
                                fontSize: typography.caption.fontSize,
                            },
                        ]}
                    >
                        {actionLabel}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    titleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    title: {
        letterSpacing: 0.8,
    },
    countBadge: {
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 999,
        borderWidth: 1,
    },
    countText: {
        fontWeight: '700',
    },
    actionButton: {
        paddingVertical: 2,
        paddingHorizontal: 4,
    },
    actionText: {
        fontWeight: '600',
    },
});
