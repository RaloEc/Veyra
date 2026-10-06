import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { ChevronRight, Folder as LucideFolder } from '@tamagui/lucide-icons';
import { Folder } from '../../types/db';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { useStore } from '../../store/useStore';
import { FOLDER_COLORS, FolderIconRenderer } from './FolderIconRenderer';

interface FolderBreadcrumbProps {
    stack: Folder[];
    onNavigate: (targetIndex: number) => void; // -1 = Root, 0 = first level, etc.
    accentColor?: string;
    rootLabel?: string;
}

/**
 * Normaliza un color para garantizar que sea un código HEX válido de 6 caracteres (#RRGGBB).
 * Si es un nombre clave ('purple', 'blue', etc.), lo mapea a FOLDER_COLORS.
 */
function normalizeHex(colorStr?: string | null, fallback = '#8B5CF6'): string {
    if (!colorStr || typeof colorStr !== 'string') return fallback;
    const trimmed = colorStr.trim();
    if (trimmed.startsWith('#')) {
        if (trimmed.length === 4) {
            return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
        }
        if (trimmed.length === 7) return trimmed;
        if (trimmed.length === 9) return trimmed.slice(0, 7);
    }
    const match = FOLDER_COLORS.find(
        (c) => c.key.toLowerCase() === trimmed.toLowerCase() || c.color.toLowerCase() === trimmed.toLowerCase()
    );
    if (match) return match.color;
    return fallback;
}

export const FolderBreadcrumb: React.FC<FolderBreadcrumbProps> = ({
    stack,
    onNavigate,
    accentColor,
    rootLabel,
}) => {
    const { colors, accent, isDark } = useVeyraTheme();
    const language = useStore((state) => state.language);
    const scrollRef = useRef<ScrollView>(null);

    const defaultRootLabel = rootLabel || (language === 'es' ? 'Carpetas' : 'Folders');
    const effectiveAccent = normalizeHex(accentColor || accent?.primary, '#8B5CF6');

    // Sanitizar y deduplicar el stack de carpetas
    const safeStack = useMemo(() => {
        if (!Array.isArray(stack) || stack.length === 0) return [];
        const seen = new Set<string>();
        const result: Folder[] = [];
        for (const item of stack) {
            if (item && item.id && !seen.has(item.id)) {
                seen.add(item.id);
                result.push(item);
            }
        }
        return result;
    }, [stack]);

    useEffect(() => {
        if (safeStack.length > 0) {
            const timer = setTimeout(() => {
                scrollRef.current?.scrollToEnd({ animated: true });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [safeStack.length]);

    if (safeStack.length === 0) return null;

    try {
        return (
            <View style={styles.container}>
                <ScrollView
                    ref={scrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    {/* Botón Raíz: Volver al listado general de carpetas */}
                    <TouchableOpacity
                        style={[
                            styles.crumbItem,
                            {
                                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                                borderColor: colors.borderSubtle,
                                borderWidth: StyleSheet.hairlineWidth,
                            },
                        ]}
                        onPress={() => onNavigate(-1)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                        <LucideFolder size={13} color={colors.textSecondary as any} strokeWidth={2} />
                        <Text style={[styles.crumbText, { color: colors.textSecondary }]}>
                            {defaultRootLabel}
                        </Text>
                    </TouchableOpacity>

                    {/* Niveles del stack */}
                    {safeStack.map((item, index) => {
                        const isLast = index === safeStack.length - 1;
                        const folderColor = normalizeHex(item.color, effectiveAccent);

                        return (
                            <React.Fragment key={item.id}>
                                <View style={styles.separator}>
                                    <ChevronRight size={12} color={colors.textMuted as any} strokeWidth={2.4} />
                                </View>

                                <TouchableOpacity
                                    style={[
                                        styles.crumbItem,
                                        isLast
                                            ? {
                                                  backgroundColor: `${folderColor}${isDark ? '26' : '18'}`,
                                                  borderColor: `${folderColor}45`,
                                                  borderWidth: 1,
                                              }
                                            : {
                                                  backgroundColor: isDark
                                                      ? 'rgba(255, 255, 255, 0.05)'
                                                      : 'rgba(0, 0, 0, 0.04)',
                                                  borderColor: colors.borderSubtle,
                                                  borderWidth: StyleSheet.hairlineWidth,
                                              },
                                    ]}
                                    onPress={() => !isLast && onNavigate(index)}
                                    disabled={isLast}
                                    activeOpacity={0.7}
                                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                >
                                    <FolderIconRenderer
                                        name={item.icon || 'folder'}
                                        size={13}
                                        color={isLast ? folderColor : colors.textMuted}
                                        strokeWidth={isLast ? 2.4 : 1.8}
                                    />
                                    <Text
                                        numberOfLines={1}
                                        style={[
                                            styles.crumbText,
                                            isLast ? styles.crumbTextActive : null,
                                            { color: isLast ? folderColor : colors.textMuted },
                                        ]}
                                    >
                                        {item.name || (language === 'es' ? 'Carpeta' : 'Folder')}
                                    </Text>
                                </TouchableOpacity>
                            </React.Fragment>
                        );
                    })}
                </ScrollView>
            </View>
        );
    } catch (e) {
        console.warn('FolderBreadcrumb render error:', e);
        return null;
    }
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 2,
    },
    scrollContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    crumbItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        maxWidth: 160,
    },
    crumbText: {
        fontSize: 12,
        fontWeight: '500',
    },
    crumbTextActive: {
        fontWeight: '700',
    },
    separator: {
        paddingHorizontal: 1,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: 0.6,
    },
});
