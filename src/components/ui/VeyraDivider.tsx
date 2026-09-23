import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useVeyraTheme } from '../../theme/useVeyraTheme';

export interface VeyraDividerProps {
    orientation?: 'horizontal' | 'vertical';
    borderLevel?: 'subtle' | 'medium' | 'strong';
    style?: StyleProp<ViewStyle>;
}

/**
 * VeyraDivider — Separador lineal sutil de 1px con opacidad calibrada.
 */
export const VeyraDivider: React.FC<VeyraDividerProps> = ({
    orientation = 'horizontal',
    borderLevel = 'subtle',
    style,
}) => {
    const { colors } = useVeyraTheme();

    let color: string = colors.borderSubtle;
    if (borderLevel === 'medium') color = colors.borderMedium;
    else if (borderLevel === 'strong') color = colors.borderStrong;

    const isHorizontal = orientation === 'horizontal';

    return (
        <View
            style={[
                isHorizontal ? styles.horizontal : styles.vertical,
                { backgroundColor: color },
                style,
            ]}
        />
    );
};

const styles = StyleSheet.create({
    horizontal: {
        height: 1,
        width: '100%',
    },
    vertical: {
        width: 1,
        height: '100%',
    },
});
