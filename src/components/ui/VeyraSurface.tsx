import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraRadii } from '../../theme/tokens';

export interface VeyraSurfaceProps extends ViewProps {
    level?: 0 | 1 | 2 | 3; // 0 = bg, 1 = surface, 2 = elevated, 3 = card
    bordered?: boolean;
    radius?: VeyraRadii;
    children?: React.ReactNode;
}

/**
 * VeyraSurface — Contenedor sólido base por niveles de elevación.
 * Diseñado según la regla Solid Core de Veyra.
 */
export const VeyraSurface: React.FC<VeyraSurfaceProps> = ({
    level = 1,
    bordered = true,
    radius = 'md',
    style,
    children,
    ...props
}) => {
    const { colors, radii } = useVeyraTheme();

    let backgroundColor: string = colors.surface;
    if (level === 0) backgroundColor = colors.bg;
    else if (level === 2) backgroundColor = colors.surfaceElevated;
    else if (level === 3) backgroundColor = colors.surfaceCard;

    const borderRadius = radii[radius] ?? radii.md;

    return (
        <View
            style={[
                styles.base,
                {
                    backgroundColor,
                    borderRadius,
                    borderColor: bordered ? colors.borderSubtle : 'transparent',
                    borderWidth: bordered ? 1 : 0,
                },
                style,
            ]}
            {...props}
        >
            {children}
        </View>
    );
};

const styles = StyleSheet.create({
    base: {
        overflow: 'hidden',
    },
});
