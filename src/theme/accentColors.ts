import { useStore } from '../store/useStore';

export type AccentTheme = 'purple' | 'blue' | 'red' | 'green' | 'amber' | 'pink';

export interface AccentPalette {
    primary: string;       // Color principal del acento
    primaryMuted: string;  // Versión suave para fondos
    primaryBg: string;     // Fondo muy tenue
}

const ACCENT_PALETTES: Record<AccentTheme, { light: AccentPalette; dark: AccentPalette }> = {
    purple: {
        light: { primary: '#8B5CF6', primaryMuted: '#C4B5FD', primaryBg: 'rgba(139, 92, 246, 0.08)' },
        dark: { primary: '#A78BFA', primaryMuted: '#7C3AED', primaryBg: 'rgba(167, 139, 250, 0.12)' },
    },
    blue: {
        light: { primary: '#3B82F6', primaryMuted: '#93C5FD', primaryBg: 'rgba(59, 130, 246, 0.08)' },
        dark: { primary: '#60A5FA', primaryMuted: '#2563EB', primaryBg: 'rgba(96, 165, 250, 0.12)' },
    },
    red: {
        light: { primary: '#E11D48', primaryMuted: '#FDA4AF', primaryBg: 'rgba(225, 29, 72, 0.08)' },
        dark: { primary: '#FB7185', primaryMuted: '#BE123C', primaryBg: 'rgba(251, 113, 133, 0.12)' },
    },
    green: {
        light: { primary: '#10B981', primaryMuted: '#6EE7B7', primaryBg: 'rgba(16, 185, 129, 0.08)' },
        dark: { primary: '#34D399', primaryMuted: '#059669', primaryBg: 'rgba(52, 211, 153, 0.12)' },
    },
    amber: {
        light: { primary: '#F59E0B', primaryMuted: '#FCD34D', primaryBg: 'rgba(245, 158, 11, 0.08)' },
        dark: { primary: '#FBBF24', primaryMuted: '#D97706', primaryBg: 'rgba(251, 191, 36, 0.12)' },
    },
    pink: {
        light: { primary: '#EC4899', primaryMuted: '#F9A8D4', primaryBg: 'rgba(236, 72, 153, 0.08)' },
        dark: { primary: '#F472B6', primaryMuted: '#DB2777', primaryBg: 'rgba(244, 114, 182, 0.12)' },
    },
};

export const ACCENT_OPTIONS: { key: AccentTheme; lightColor: string; darkColor: string }[] = [
    { key: 'purple', lightColor: '#8B5CF6', darkColor: '#A78BFA' },
    { key: 'blue', lightColor: '#3B82F6', darkColor: '#60A5FA' },
    { key: 'red', lightColor: '#E11D48', darkColor: '#FB7185' },
    { key: 'green', lightColor: '#10B981', darkColor: '#34D399' },
    { key: 'amber', lightColor: '#F59E0B', darkColor: '#FBBF24' },
    { key: 'pink', lightColor: '#EC4899', darkColor: '#F472B6' },
];

export function getAccentPalette(accentTheme: AccentTheme, mode: 'light' | 'dark'): AccentPalette {
    return ACCENT_PALETTES[accentTheme]?.[mode] ?? ACCENT_PALETTES.purple[mode];
}

export function useAccentColor(): AccentPalette & { accent: string } {
    const theme = useStore(state => state.theme);
    const accentTheme = useStore(state => state.accentTheme);
    const palette = getAccentPalette(accentTheme || 'purple', theme);
    return { ...palette, accent: palette.primary };
}
