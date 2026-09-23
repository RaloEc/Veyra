/**
 * Veyra Design System — Tokens
 * Source of truth: VEYRA_DESIGN_SYSTEM.md
 */

export const VEYRA_TOKENS = {
    // ─── Radii ─────────────────────────────────────────────────────────────
    radii: {
        none: 0,
        sm: 6,       // Small elements, tags, micro badges
        md: 10,      // Inputs, standard cards, buttons
        lg: 14,      // Large containers, main modal sheets
        xl: 20,      // Floating panels
        pill: 999,   // Badges, circular icon buttons, floating pills
    },

    // ─── Spacing ───────────────────────────────────────────────────────────
    spacing: {
        none: 0,
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 20,
        '2xl': 24,
        '3xl': 32,
        '4xl': 40,
    },

    // ─── Motion (Duration in ms) ───────────────────────────────────────────
    motion: {
        fast: 140,     // Quick toggle, micro feedback, button tap
        normal: 200,   // Standard transitions, dropdowns, expand/collapse
        slow: 280,     // Modal enter/leave, full screen transitions
    },

    // ─── Typography Sizes & Weights ────────────────────────────────────────
    typography: {
        fontFamily: 'Inter',
        display: {
            fontSize: 28,
            lineHeight: 34,
            fontWeight: '800' as const,
        },
        h1: {
            fontSize: 22,
            lineHeight: 28,
            fontWeight: '700' as const,
        },
        h2: {
            fontSize: 18,
            lineHeight: 24,
            fontWeight: '700' as const,
        },
        h3: {
            fontSize: 16,
            lineHeight: 22,
            fontWeight: '600' as const,
        },
        body: {
            fontSize: 14,
            lineHeight: 20,
            fontWeight: '400' as const,
        },
        bodyMedium: {
            fontSize: 14,
            lineHeight: 20,
            fontWeight: '500' as const,
        },
        label: {
            fontSize: 12,
            lineHeight: 16,
            fontWeight: '600' as const,
            letterSpacing: 0.2,
        },
        caption: {
            fontSize: 11,
            lineHeight: 15,
            fontWeight: '500' as const,
        },
        micro: {
            fontSize: 10,
            lineHeight: 14,
            fontWeight: '600' as const,
            letterSpacing: 0.4,
        },
    },

    // ─── Theme Palettes ───────────────────────────────────────────────────
    colors: {
        dark: {
            // Background & Surfaces (Darker grey #121212 for canvas contrast)
            bg: '#121212',
            navBar: '#1B1B1B',
            surface: '#242424',
            surfaceElevated: '#2C2C2C',
            surfaceCard: '#242424',
            surfaceHover: '#323232',

            // Borders (Subtle 1px boundaries)
            borderSubtle: 'rgba(255, 255, 255, 0.08)',
            borderMedium: 'rgba(255, 255, 255, 0.12)',
            borderStrong: 'rgba(255, 255, 255, 0.20)',

            // Typography
            textPrimary: '#F4F4F5',
            textSecondary: '#A1A1AA',
            textMuted: '#71717A',
            textInverse: '#121212',

            // Glass Surfaces (Contextual / Overlays)
            glassBg: 'rgba(36, 36, 36, 0.80)',
            glassBorder: 'rgba(255, 255, 255, 0.09)',
            glassBackdrop: 'rgba(0, 0, 0, 0.65)',
        },
        light: {
            // Background & Surfaces (Solid Core based on #FFFFFF)
            bg: '#FFFFFF',
            navBar: '#FFFFFF',
            surface: '#F4F4F5',
            surfaceElevated: '#EAEAEC',
            surfaceCard: '#F4F4F5',
            surfaceHover: '#E4E4E7',

            // Borders (Subtle 1px boundaries)
            borderSubtle: 'rgba(0, 0, 0, 0.06)',
            borderMedium: 'rgba(0, 0, 0, 0.10)',
            borderStrong: 'rgba(0, 0, 0, 0.18)',

            // Typography
            textPrimary: '#0F172A',
            textSecondary: '#475569',
            textMuted: '#94A3B8',
            textInverse: '#FFFFFF',

            // Glass Surfaces (Contextual / Overlays)
            glassBg: 'rgba(255, 255, 255, 0.85)',
            glassBorder: 'rgba(0, 0, 0, 0.06)',
            glassBackdrop: 'rgba(15, 23, 42, 0.40)',
        },

        // Semantic states
        semantics: {
            normal: {
                badgeBgDark: 'rgba(161, 161, 170, 0.12)',
                badgeTextDark: '#D4D4D8',
                badgeBgLight: 'rgba(71, 85, 105, 0.10)',
                badgeTextLight: '#334155',
                dot: '#71717A',
            },
            strict: {
                primary: '#F59E0B',
                primaryDark: '#FBBF24',
                badgeBgDark: 'rgba(245, 158, 11, 0.14)',
                badgeTextDark: '#FBBF24',
                badgeBgLight: 'rgba(245, 158, 11, 0.12)',
                badgeTextLight: '#B45309',
                dot: '#F59E0B',
            },
            critical: {
                primary: '#E11D48',
                primaryDark: '#FB7185',
                badgeBgDark: 'rgba(225, 29, 72, 0.15)',
                badgeTextDark: '#FB7185',
                badgeBgLight: 'rgba(225, 29, 72, 0.12)',
                badgeTextLight: '#BE123C',
                dot: '#E11D48',
            },
            success: {
                primary: '#10B981',
                badgeBgDark: 'rgba(16, 185, 129, 0.14)',
                badgeTextDark: '#34D399',
                badgeBgLight: 'rgba(16, 185, 129, 0.12)',
                badgeTextLight: '#047857',
            },
            warning: {
                primary: '#F59E0B',
                badgeBgDark: 'rgba(245, 158, 11, 0.14)',
                badgeTextDark: '#FBBF24',
                badgeBgLight: 'rgba(245, 158, 11, 0.12)',
                badgeTextLight: '#B45309',
            },
            info: {
                primary: '#3B82F6',
                badgeBgDark: 'rgba(59, 130, 246, 0.14)',
                badgeTextDark: '#60A5FA',
                badgeBgLight: 'rgba(59, 130, 246, 0.12)',
                badgeTextLight: '#1D4ED8',
            },
        },
    },
} as const;

export type VeyraRadii = keyof typeof VEYRA_TOKENS.radii;
export type VeyraSpacing = keyof typeof VEYRA_TOKENS.spacing;
export type ControlLevelType = 'normal' | 'strict' | 'critical';
