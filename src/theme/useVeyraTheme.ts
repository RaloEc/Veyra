import { useStore } from '../store/useStore';
import { useAccentColor, AccentTheme, AccentPalette } from './accentColors';
import { VEYRA_TOKENS, ControlLevelType } from './tokens';

/**
 * useVeyraTheme
 * Hook unificado para acceder a tokens, modo claro/oscuro, color de acento y colores semánticos.
 */
export function useVeyraTheme() {
    const themeMode = useStore(state => state.theme) || 'dark';
    const accentTheme = (useStore(state => state.accentTheme) || 'purple') as AccentTheme;
    const accentPalette = useAccentColor();

    const isDark = themeMode === 'dark';
    const modeColors = isDark ? VEYRA_TOKENS.colors.dark : VEYRA_TOKENS.colors.light;

    // Helper for semantic control level tokens
    const getControlLevelColor = (level?: string | null) => {
        const lvl = (level?.toLowerCase() || 'normal') as ControlLevelType;
        if (lvl === 'critical') {
            return {
                main: isDark ? VEYRA_TOKENS.colors.semantics.critical.primaryDark : VEYRA_TOKENS.colors.semantics.critical.primary,
                bg: isDark ? VEYRA_TOKENS.colors.semantics.critical.badgeBgDark : VEYRA_TOKENS.colors.semantics.critical.badgeBgLight,
                text: isDark ? VEYRA_TOKENS.colors.semantics.critical.badgeTextDark : VEYRA_TOKENS.colors.semantics.critical.badgeTextLight,
                dot: isDark ? VEYRA_TOKENS.colors.semantics.critical.primaryDark : VEYRA_TOKENS.colors.semantics.critical.dot,
                hasSideBar: true,
            };
        }
        if (lvl === 'strict') {
            return {
                main: isDark ? VEYRA_TOKENS.colors.semantics.strict.primaryDark : VEYRA_TOKENS.colors.semantics.strict.primary,
                bg: isDark ? VEYRA_TOKENS.colors.semantics.strict.badgeBgDark : VEYRA_TOKENS.colors.semantics.strict.badgeBgLight,
                text: isDark ? VEYRA_TOKENS.colors.semantics.strict.badgeTextDark : VEYRA_TOKENS.colors.semantics.strict.badgeTextLight,
                dot: isDark ? VEYRA_TOKENS.colors.semantics.strict.primaryDark : VEYRA_TOKENS.colors.semantics.strict.dot,
                hasSideBar: true,
            };
        }
        return {
            main: isDark ? '#71717A' : '#94A3B8',
            bg: isDark ? VEYRA_TOKENS.colors.semantics.normal.badgeBgDark : VEYRA_TOKENS.colors.semantics.normal.badgeBgLight,
            text: isDark ? VEYRA_TOKENS.colors.semantics.normal.badgeTextDark : VEYRA_TOKENS.colors.semantics.normal.badgeTextLight,
            dot: isDark ? '#71717A' : '#94A3B8',
            hasSideBar: false,
        };
    };

    return {
        // State
        isDark,
        themeMode,
        accentTheme,

        // Palettes
        colors: modeColors,
        accent: accentPalette,
        semantics: VEYRA_TOKENS.colors.semantics,

        // Tokens
        radii: VEYRA_TOKENS.radii,
        spacing: VEYRA_TOKENS.spacing,
        motion: VEYRA_TOKENS.motion,
        typography: VEYRA_TOKENS.typography,

        // Helpers
        getControlLevelColor,
    };
}
