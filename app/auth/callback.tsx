import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useVeyraTheme } from '../../src/theme/useVeyraTheme';

/**
 * Ruta de respaldo para deep links veyra://auth/callback mientras
 * WebBrowser.openAuthSessionAsync completa el intercambio de credenciales.
 */
export default function AuthCallbackFallbackScreen() {
  const { colors, accent } = useVeyraTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ActivityIndicator size="large" color={accent.primary} />
      <Text style={[styles.label, { color: colors.textPrimary }]}>Conectando con Veyra...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
});
