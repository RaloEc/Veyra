import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useVeyraTheme } from '../../theme/useVeyraTheme';

interface VeyraScreenProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    /**
     * Bordes protegidos por SafeArea.
     * Por defecto ['top', 'left', 'right'] para permitir que las barras inferiores
     * o ScrollViews extiendan su fondo visual hasta el borde físico.
     */
    edges?: Edge[];
    backgroundColor?: string;
}

/**
 * VeyraScreen — Contenedor base de pantalla que implementa la gestión consistente de Safe Areas.
 * Evita doble padding y asegura compatibilidad transparente entre iOS y Android.
 */
export function VeyraScreen({
    children,
    style,
    edges = ['top', 'left', 'right'],
    backgroundColor,
}: VeyraScreenProps) {
    const { colors } = useVeyraTheme();
    const bg = backgroundColor || colors.bg;

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: bg }, style]}
            edges={edges}
        >
            {children}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
