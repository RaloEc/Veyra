import { useColorScheme } from 'react-native';
import { useStore } from '../store/useStore';

export interface ResolvedThemeResult {
    resolvedTheme: 'light' | 'dark';
    isAmoled: boolean;
    isDark: boolean;
}

/**
 * useResolvedTheme
 * Hook centralizado para resolver el tema activo considerando la configuración del usuario
 * ('system' | 'light' | 'dark'), la preferencia del sistema operativo (useColorScheme)
 * y el modo AMOLED (negro puro).
 *
 * Reglas de diseño:
 * - isAmoled = resolvedTheme === 'dark' && amoledEnabled
 * - Si el tema resuelto es claro, amoledEnabled se conserva guardado pero no tiene efecto visual.
 * - Con amoledEnabled=false el comportamiento es 100% idéntico al estándar.
 */
export function useResolvedTheme(): ResolvedThemeResult {
    const systemColorScheme = useColorScheme();
    const themeMode = useStore(state => state.theme) || 'system';
    const amoledEnabled = useStore(state => state.amoledEnabled) ?? false;

    const resolvedTheme: 'light' | 'dark' = themeMode === 'system'
        ? (systemColorScheme === 'dark' ? 'dark' : 'light')
        : themeMode;

    const isDark = resolvedTheme === 'dark';
    const isAmoled = isDark && amoledEnabled;

    return {
        resolvedTheme,
        isAmoled,
        isDark,
    };
}

