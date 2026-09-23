import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraRadii, ControlLevelType } from '../../theme/tokens';

export type VeyraBadgeVariant = 'default' | 'controlLevel' | 'success' | 'warning' | 'critical' | 'info';

export interface VeyraBadgeProps {
    label: string;
    variant?: VeyraBadgeVariant;
    controlLevel?: ControlLevelType | string | null;
    icon?: React.ReactNode;
    dot?: boolean;
    radius?: VeyraRadii;
    size?: 'sm' | 'md';
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
}

/**
 * VeyraBadge — Badge semántico para etiquetas, estados y niveles de control.
 */
export const VeyraBadge: React.FC<VeyraBadgeProps> = ({
    label,
    variant = 'default',
    controlLevel,
    icon,
    dot = false,
    radius = 'pill',
    size = 'sm',
    style,
    textStyle,
}) => {
    const { colors, radii, isDark, getControlLevelColor, semantics } = useVeyraTheme();
    const borderRadius = radii[radius] ?? radii.pill;

    let bg: string = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    let textColor: string = colors.textSecondary;
    let dotColor: string = colors.textMuted;
    let borderColor: string = colors.borderSubtle;

    if (variant === 'controlLevel' || controlLevel) {
        const lvlColors = getControlLevelColor(controlLevel);
        bg = lvlColors.bg;
        textColor = lvlColors.text;
        dotColor = lvlColors.dot;
        borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
    } else if (variant === 'success') {
        bg = isDark ? semantics.success.badgeBgDark : semantics.success.badgeBgLight;
        textColor = isDark ? semantics.success.badgeTextDark : semantics.success.badgeTextLight;
        dotColor = semantics.success.primary;
    } else if (variant === 'warning') {
        bg = isDark ? semantics.warning.badgeBgDark : semantics.warning.badgeBgLight;
        textColor = isDark ? semantics.warning.badgeTextDark : semantics.warning.badgeTextLight;
        dotColor = semantics.warning.primary;
    } else if (variant === 'critical') {
        bg = isDark ? semantics.critical.badgeBgDark : semantics.critical.badgeBgLight;
        textColor = isDark ? semantics.critical.badgeTextDark : semantics.critical.badgeTextLight;
        dotColor = semantics.critical.primary;
    } else if (variant === 'info') {
        bg = isDark ? semantics.info.badgeBgDark : semantics.info.badgeBgLight;
        textColor = isDark ? semantics.info.badgeTextDark : semantics.info.badgeTextLight;
        dotColor = semantics.info.primary;
    }

    const isSmall = size === 'sm';

    return (
        <View
            style={[
                styles.badge,
                {
                    backgroundColor: bg,
                    borderColor,
                    borderRadius,
                    paddingVertical: isSmall ? 3 : 5,
                    paddingHorizontal: isSmall ? 8 : 10,
                },
                style,
            ]}
        >
            {dot && (
                <View
                    style={[
                        styles.dot,
                        {
                            backgroundColor: dotColor,
                            width: isSmall ? 5 : 6,
                            height: isSmall ? 5 : 6,
                        },
                    ]}
                />
            )}
            {icon}
            <Text
                style={[
                    styles.text,
                    {
                        color: textColor,
                        fontSize: isSmall ? 10.5 : 12,
                        fontWeight: '600',
                    },
                    textStyle,
                ]}
            >
                {label}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        gap: 5,
        alignSelf: 'flex-start',
    },
    dot: {
        borderRadius: 999,
    },
    text: {
        letterSpacing: 0.2,
    },
});
