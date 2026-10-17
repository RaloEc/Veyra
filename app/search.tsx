import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    FlatList,
    ScrollView,
    ActivityIndicator,
    Vibration,
    Keyboard,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    ChevronLeft,
    Search as SearchIcon,
    X,
    Bell,
    Notebook,
    Calendar as CalendarIcon,
    Folder as FolderIcon,
    Clock,
    Paperclip,
    Sparkles,
    Trash2,
    History,
    FileText,
    ChevronRight,
    AlertCircle,
    CheckCircle2,
    Tag,
} from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { BottomTabBar } from '../src/components/layout/BottomTabBar';
import {
    SearchService,
    SearchResultItem,
    SearchFilterCategory,
    SearchEntityType,
    normalizeSearchText,
} from '../src/services/searchService';
import { useStore } from '../src/store/useStore';

// ─────────────────────────────────────────────────────────────────
// Categorías de Filtro
// ─────────────────────────────────────────────────────────────────
interface FilterTab {
    key: SearchFilterCategory;
    label: string;
    icon: React.ComponentType<{ size?: number; color?: any; strokeWidth?: number }>;
}

const FILTER_TABS: FilterTab[] = [
    { key: 'all', label: 'Todos', icon: Sparkles },
    { key: 'reminders', label: 'Recordatorios', icon: Bell },
    { key: 'notes', label: 'Notas', icon: Notebook },
    { key: 'events', label: 'Eventos', icon: CalendarIcon },
    { key: 'folders', label: 'Carpetas', icon: FolderIcon },
    { key: 'schedule', label: 'Horarios', icon: Clock },
    { key: 'attachments', label: 'Adjuntos', icon: Paperclip },
];

// ─────────────────────────────────────────────────────────────────
// Componente para resaltar coincidencias de texto
// ─────────────────────────────────────────────────────────────────
interface HighlightedTextProps {
    text: string;
    terms: string[];
    style?: any;
    highlightStyle?: any;
    numberOfLines?: number;
}

const HighlightedText: React.FC<HighlightedTextProps> = React.memo(({
    text,
    terms,
    style,
    highlightStyle,
    numberOfLines,
}) => {
    if (!text || !terms || terms.length === 0) {
        return <Text style={style} numberOfLines={numberOfLines}>{text || ''}</Text>;
    }

    const cleanTerms = terms.map(t => normalizeSearchText(t)).filter(t => t.length > 0);
    if (cleanTerms.length === 0) {
        return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
    }

    // Normalizar texto para ubicar índices
    const normText = normalizeSearchText(text);

    // Encontrar todas las ocurrencias y fusionar intervalos
    const intervals: [number, number][] = [];
    for (const term of cleanTerms) {
        let start = 0;
        while (start < normText.length) {
            const idx = normText.indexOf(term, start);
            if (idx === -1) break;
            intervals.push([idx, idx + term.length]);
            start = idx + term.length;
        }
    }

    if (intervals.length === 0) {
        return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
    }

    // Ordenar y fusionar intervalos solapados
    intervals.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
        const prev = merged[merged.length - 1];
        const cur = intervals[i];
        if (cur[0] <= prev[1]) {
            prev[1] = Math.max(prev[1], cur[1]);
        } else {
            merged.push(cur);
        }
    }

    // Reconstruir los chunks usando el texto original
    const elements: React.ReactNode[] = [];
    let curIndex = 0;

    merged.forEach(([start, end], idx) => {
        if (start > curIndex) {
            elements.push(
                <Text key={`plain-${idx}`} style={style}>
                    {text.substring(curIndex, start)}
                </Text>
            );
        }
        elements.push(
            <Text key={`hl-${idx}`} style={[style, highlightStyle]}>
                {text.substring(start, end)}
            </Text>
        );
        curIndex = end;
    });

    if (curIndex < text.length) {
        elements.push(
            <Text key="tail" style={style}>
                {text.substring(curIndex)}
            </Text>
        );
    }

    return (
        <Text style={style} numberOfLines={numberOfLines}>
            {elements}
        </Text>
    );
});

// ─────────────────────────────────────────────────────────────────
// Pantalla Principal de Búsqueda Global
// ─────────────────────────────────────────────────────────────────
export default function SearchScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { colors, isDark, accent, radii, typography, spacing } = useVeyraTheme();
    const language = useStore(state => state.language) || 'es';

    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<SearchFilterCategory>('all');
    const [results, setResults] = useState<SearchResultItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    const inputRef = useRef<TextInput>(null);

    // Cargar historial reciente al iniciar
    useEffect(() => {
        SearchService.getRecentSearches().then(setRecentSearches).catch(() => {});
        SearchService.ensureIndexWarm().catch(() => {});
    }, []);

    // Debounce de la búsqueda (180ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query.trim());
        }, 180);
        return () => clearTimeout(timer);
    }, [query]);

    // Ejecutar búsqueda cuando cambia la query o la categoría
    useEffect(() => {
        let isMounted = true;
        if (!debouncedQuery) {
            setResults([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        SearchService.search(debouncedQuery, selectedCategory, 50)
            .then(res => {
                if (isMounted) {
                    setResults(res);
                    setIsLoading(false);
                }
            })
            .catch(err => {
                console.warn('[SearchScreen] Error buscando:', err);
                if (isMounted) {
                    setResults([]);
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [debouncedQuery, selectedCategory]);

    // Guardar en historial al presionar enter o buscar con resultado
    const handleCommitSearch = useCallback((term: string) => {
        if (!term.trim()) return;
        SearchService.addRecentSearch(term).then(setRecentSearches).catch(() => {});
        Keyboard.dismiss();
    }, []);

    const handleSelectRecentSearch = (term: string) => {
        try { Vibration.vibrate(10); } catch {}
        setQuery(term);
        setDebouncedQuery(term);
        inputRef.current?.blur();
    };

    const handleRemoveRecentSearch = (term: string, e: any) => {
        e.stopPropagation();
        try { Vibration.vibrate(10); } catch {}
        SearchService.removeRecentSearch(term).then(setRecentSearches).catch(() => {});
    };

    const handleClearAllRecent = () => {
        try { Vibration.vibrate(15); } catch {}
        SearchService.clearRecentSearches().then(() => setRecentSearches([])).catch(() => {});
    };

    const handleSelectCategory = (cat: SearchFilterCategory) => {
        try { Vibration.vibrate(10); } catch {}
        setSelectedCategory(cat);
    };

    // Navegación directa al elemento
    const handlePressResult = useCallback((item: SearchResultItem) => {
        try { Vibration.vibrate(12); } catch {}
        Keyboard.dismiss();
        inputRef.current?.blur();
        handleCommitSearch(query);

        switch (item.type) {
            case 'note':
                router.push({
                    pathname: '/notes/[id]',
                    params: {
                        id: item.id,
                        pageIndex: item.meta.pageIndex !== undefined ? String(item.meta.pageIndex) : undefined,
                    },
                });
                break;

            case 'reminder':
                router.push({
                    pathname: '/reminder/[id]',
                    params: { id: item.id },
                });
                break;

            case 'event':
                router.push({
                    pathname: '/events/create',
                    params: { id: item.id },
                });
                break;

            case 'schedule':
                router.push({
                    pathname: '/schedule',
                    params: { id: item.id },
                });
                break;

            case 'folder':
                router.push({
                    pathname: '/notes',
                    params: { folderId: item.id },
                });
                break;

            case 'attachment':
                if (item.parentId) {
                    // Si el padre es recordatorio o nota
                    router.push({
                        pathname: '/notes/[id]',
                        params: { id: item.parentId },
                    });
                }
                break;

            default:
                break;
        }
    }, [query, router, handleCommitSearch]);

    // Formateo de fecha y hora para el resultado
    const formatItemDate = (item: SearchResultItem) => {
        const ms = item.meta.dueDateMs || item.meta.startTimeMs || item.updatedAt;
        if (!ms) return '';
        try {
            const date = new Date(ms);
            const now = new Date();
            const isSameYear = date.getFullYear() === now.getFullYear();

            return date.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
                month: 'short',
                day: 'numeric',
                year: isSameYear ? undefined : 'numeric',
                hour: item.meta.startTimeMs ? '2-digit' : undefined,
                minute: item.meta.startTimeMs ? '2-digit' : undefined,
            });
        } catch {
            return '';
        }
    };

    // Badge y estilo de tipo
    const getTypeBadgeConfig = (type: SearchEntityType, meta: any) => {
        switch (type) {
            case 'reminder': {
                const isCrit = meta.controlLevel === 'critical';
                const isStrict = meta.controlLevel === 'strict';
                const isDone = meta.status === 'completed';
                return {
                    label: isDone
                        ? (language === 'es' ? 'Recordatorio (Hecho)' : 'Reminder (Done)')
                        : (language === 'es' ? 'Recordatorio' : 'Reminder'),
                    icon: Bell,
                    color: isDone ? '#10B981' : isCrit ? '#EF4444' : isStrict ? '#F59E0B' : accent.primary,
                    bg: isDone
                        ? (isDark ? 'rgba(16,185,129,0.18)' : '#D1FAE5')
                        : isCrit
                        ? (isDark ? 'rgba(239,68,68,0.18)' : '#FEE2E2')
                        : isStrict
                        ? (isDark ? 'rgba(245,158,11,0.18)' : '#FEF3C7')
                        : (isDark ? `${accent.primary}25` : `${accent.primary}15`),
                };
            }
            case 'note':
                return {
                    label: meta.matchedPageTitle
                        ? `${language === 'es' ? 'Nota' : 'Note'} • ${meta.matchedPageTitle}`
                        : (language === 'es' ? 'Nota' : 'Note'),
                    icon: FileText,
                    color: '#3B82F6',
                    bg: isDark ? 'rgba(59,130,246,0.18)' : '#DBEAFE',
                };
            case 'event':
                return {
                    label: language === 'es' ? 'Evento' : 'Event',
                    icon: CalendarIcon,
                    color: '#8B5CF6',
                    bg: isDark ? 'rgba(139,92,246,0.18)' : '#EDE9FE',
                };
            case 'schedule':
                return {
                    label: language === 'es' ? 'Horario' : 'Schedule',
                    icon: Clock,
                    color: '#F97316',
                    bg: isDark ? 'rgba(249,115,22,0.18)' : '#FFEDD5',
                };
            case 'folder':
                return {
                    label: language === 'es' ? 'Carpeta' : 'Folder',
                    icon: FolderIcon,
                    color: meta.color || '#10B981',
                    bg: isDark ? 'rgba(16,185,129,0.18)' : '#D1FAE5',
                };
            case 'attachment':
                return {
                    label: language === 'es' ? 'Adjunto' : 'Attachment',
                    icon: Paperclip,
                    color: '#6366F1',
                    bg: isDark ? 'rgba(99,102,241,0.18)' : '#E0E7FF',
                };
            default:
                return {
                    label: 'Veyra',
                    icon: Sparkles,
                    color: accent.primary,
                    bg: `${accent.primary}20`,
                };
        }
    };

    // Renderizado de cada tarjeta de resultado
    const renderResultItem = ({ item }: { item: SearchResultItem }) => {
        const typeConfig = getTypeBadgeConfig(item.type, item.meta);
        const TypeIcon = typeConfig.icon;
        const dateStr = formatItemDate(item);

        return (
            <TouchableOpacity
                style={[
                    styles.resultCard,
                    {
                        backgroundColor: colors.surface,
                        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    },
                ]}
                activeOpacity={0.72}
                onPress={() => handlePressResult(item)}
            >
                {/* Cabecera de la tarjeta: Badge de tipo + Fecha */}
                <View style={styles.cardHeader}>
                    <View style={[styles.typeBadge, { backgroundColor: typeConfig.bg }]}>
                        <TypeIcon size={12} color={typeConfig.color as any} strokeWidth={2.4} />
                        <Text style={[styles.typeBadgeText, { color: typeConfig.color }]} numberOfLines={1}>
                            {typeConfig.label}
                        </Text>
                    </View>

                    {Boolean(dateStr) && (
                        <Text style={[styles.cardDateText, { color: colors.textMuted }]}>
                            {dateStr}
                        </Text>
                    )}
                </View>

                {/* Título resaltado */}
                <HighlightedText
                    text={item.title}
                    terms={item.highlightTerms}
                    style={[styles.cardTitle, { color: colors.textPrimary }]}
                    highlightStyle={{
                        color: accent.primary,
                        fontWeight: '800',
                        backgroundColor: isDark ? `${accent.primary}28` : `${accent.primary}18`,
                    }}
                    numberOfLines={2}
                />

                {/* Snippet de contenido contextual */}
                {Boolean(item.snippet) && (
                    <HighlightedText
                        text={item.snippet}
                        terms={item.highlightTerms}
                        style={[styles.cardSnippet, { color: colors.textMuted }]}
                        highlightStyle={{
                            color: isDark ? '#FFFFFF' : '#000000',
                            fontWeight: '700',
                            backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)',
                        }}
                        numberOfLines={3}
                    />
                )}

                {/* Metadata adicional: Padre / Carpeta / Subtarea */}
                {Boolean(item.parentTitle) && (
                    <View style={styles.cardFooterMeta}>
                        <FolderIcon size={11} color={colors.textMuted as any} />
                        <Text style={[styles.cardFooterText, { color: colors.textMuted }]} numberOfLines={1}>
                            {item.parentTitle}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    // Sugerencias de búsqueda rápida
    const quickSuggestions = [
        { label: language === 'es' ? 'Pendientes' : 'Pending', query: 'pendiente' },
        { label: language === 'es' ? 'Notas fijadas' : 'Pinned notes', query: 'fijada' },
        { label: language === 'es' ? 'Críticos' : 'Critical', query: 'critico' },
        { label: language === 'es' ? 'Clases' : 'Classes', query: 'clase' },
        { label: language === 'es' ? 'Con adjuntos' : 'With files', query: 'adjunto' },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
            {/* Barra Superior de Búsqueda */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => {
                        try { Vibration.vibrate(10); } catch {}
                        if (router.canGoBack()) {
                            router.back();
                        } else {
                            router.replace('/');
                        }
                    }}
                    style={[styles.iconButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <ChevronLeft size={22} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <View
                    style={[
                        styles.searchInputContainer,
                        {
                            backgroundColor: isDark ? '#202227' : '#F3F4F6',
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        },
                    ]}
                >
                    <SearchIcon size={18} color={accent.primary as any} strokeWidth={2.4} />
                    <TextInput
                        ref={inputRef}
                        style={[styles.searchInput, { color: colors.textPrimary }]}
                        value={query}
                        onChangeText={setQuery}
                        placeholder={language === 'es' ? 'Buscar en Veyra...' : 'Search in Veyra...'}
                        placeholderTextColor={colors.textMuted}
                        autoFocus={true}
                        returnKeyType="search"
                        onSubmitEditing={() => handleCommitSearch(query)}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {Boolean(query) && (
                        <TouchableOpacity
                            onPress={() => {
                                setQuery('');
                                setDebouncedQuery('');
                                setResults([]);
                                inputRef.current?.focus();
                            }}
                            style={styles.clearButton}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <X size={16} color={colors.textMuted as any} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Carrusel de Chips de Filtro */}
            <View style={styles.categoriesContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoriesScroll}
                    keyboardShouldPersistTaps="handled"
                >
                    {FILTER_TABS.map(tab => {
                        const isSelected = selectedCategory === tab.key;
                        const TabIcon = tab.icon;

                        return (
                            <TouchableOpacity
                                key={tab.key}
                                style={[
                                    styles.categoryChip,
                                    isSelected
                                        ? {
                                            backgroundColor: accent.primary,
                                            borderColor: accent.primary,
                                        }
                                        : {
                                            backgroundColor: isDark ? '#202227' : '#F3F4F6',
                                            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                        },
                                ]}
                                onPress={() => handleSelectCategory(tab.key)}
                                activeOpacity={0.7}
                            >
                                <TabIcon
                                    size={14}
                                    color={isSelected ? '#FFFFFF' : (colors.textMuted as any)}
                                    strokeWidth={isSelected ? 2.6 : 2}
                                />
                                <Text
                                    style={[
                                        styles.categoryChipText,
                                        {
                                            color: isSelected ? '#FFFFFF' : colors.textPrimary,
                                            fontWeight: isSelected ? '700' : '500',
                                        },
                                    ]}
                                >
                                    {tab.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Contenido: Historial Inicial o Resultados */}
            {!debouncedQuery ? (
                <ScrollView
                    style={styles.contentScrollView}
                    contentContainerStyle={styles.initialContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
                    {/* Búsquedas Recientes */}
                    {recentSearches.length > 0 && (
                        <View style={styles.section}>
                            <View style={styles.sectionHeader}>
                                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                    {language === 'es' ? 'Búsquedas recientes' : 'Recent searches'}
                                </Text>
                                <TouchableOpacity onPress={handleClearAllRecent} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                    <Text style={[styles.clearAllText, { color: accent.primary }]}>
                                        {language === 'es' ? 'Borrar todo' : 'Clear all'}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.recentWrap}>
                                {recentSearches.map(term => (
                                    <TouchableOpacity
                                        key={term}
                                        style={[
                                            styles.recentChip,
                                            {
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                            },
                                        ]}
                                        onPress={() => handleSelectRecentSearch(term)}
                                        activeOpacity={0.7}
                                    >
                                        <History size={13} color={colors.textMuted as any} />
                                        <Text style={[styles.recentChipText, { color: colors.textPrimary }]} numberOfLines={1}>
                                            {term}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={(e) => handleRemoveRecentSearch(term, e)}
                                            style={styles.recentRemoveBtn}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        >
                                            <X size={12} color={colors.textMuted as any} />
                                        </TouchableOpacity>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Descubrir y Sugerencias rápidas */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 12 }]}>
                            {language === 'es' ? 'Explorar rápidamente' : 'Quick explore'}
                        </Text>
                        <View style={styles.quickWrap}>
                            {quickSuggestions.map(item => (
                                <TouchableOpacity
                                    key={item.label}
                                    style={[
                                        styles.quickChip,
                                        {
                                            backgroundColor: isDark ? '#202227' : '#FFFFFF',
                                            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                        },
                                    ]}
                                    onPress={() => handleSelectRecentSearch(item.query)}
                                    activeOpacity={0.7}
                                >
                                    <Sparkles size={13} color={accent.primary as any} />
                                    <Text style={[styles.quickChipText, { color: colors.textPrimary }]}>
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </ScrollView>
            ) : (
                <View style={styles.resultsContainer}>
                    {/* Contador de resultados */}
                    <View style={styles.resultsHeader}>
                        {isLoading ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator size="small" color={accent.primary} />
                                <Text style={[styles.resultsCountText, { color: colors.textMuted, marginLeft: 8 }]}>
                                    {language === 'es' ? 'Buscando...' : 'Searching...'}
                                </Text>
                            </View>
                        ) : (
                            <Text style={[styles.resultsCountText, { color: colors.textMuted }]}>
                                {results.length}{' '}
                                {results.length === 1
                                    ? (language === 'es' ? 'resultado encontrado' : 'result found')
                                    : (language === 'es' ? 'resultados encontrados' : 'results found')}
                            </Text>
                        )}
                    </View>

                    {/* Lista de Resultados o Sin Resultados */}
                    {results.length > 0 ? (
                        <FlatList
                            data={results}
                            keyExtractor={item => `${item.type}_${item.id}`}
                            renderItem={renderResultItem}
                            contentContainerStyle={styles.resultsListContent}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            showsVerticalScrollIndicator={false}
                        />
                    ) : !isLoading ? (
                        <View style={styles.emptyContainer}>
                            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }]}>
                                <SearchIcon size={36} color={colors.textMuted as any} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                                {language === 'es' ? 'Sin coincidencias' : 'No results found'}
                            </Text>
                            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                                {language === 'es'
                                    ? `No encontramos nada para "${debouncedQuery}". Intenta con palabras clave más generales.`
                                    : `We couldn't find matches for "${debouncedQuery}". Try broader keywords.`}
                            </Text>
                            {selectedCategory !== 'all' && (
                                <TouchableOpacity
                                    style={[styles.resetFilterBtn, { backgroundColor: `${accent.primary}20` }]}
                                    onPress={() => setSelectedCategory('all')}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.resetFilterBtnText, { color: accent.primary }]}>
                                        {language === 'es' ? 'Buscar en todas las categorías' : 'Search in all categories'}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : null}
                </View>
            )}

            {/* Barra Inferior Flotante (Con Píldora de Búsqueda Activa) */}
            <BottomTabBar />
        </SafeAreaView>
    );
}

// ─────────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8,
        gap: 10,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchInputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        height: 44,
        borderRadius: 22,
        paddingHorizontal: 14,
        borderWidth: 1,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
        paddingVertical: 0,
    },
    clearButton: {
        padding: 4,
    },
    categoriesContainer: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(128, 128, 128, 0.15)',
        paddingBottom: 10,
    },
    categoriesScroll: {
        paddingHorizontal: 16,
        gap: 8,
    },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 16,
        borderWidth: 1,
        gap: 6,
    },
    categoryChipText: {
        fontSize: 13,
    },
    contentScrollView: {
        flex: 1,
    },
    initialContent: {
        padding: 16,
        paddingBottom: 120,
    },
    section: {
        marginBottom: 28,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    clearAllText: {
        fontSize: 13,
        fontWeight: '600',
    },
    recentWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    recentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 7,
        paddingHorizontal: 11,
        borderRadius: 14,
        borderWidth: 1,
        gap: 6,
    },
    recentChipText: {
        fontSize: 13,
        fontWeight: '500',
        maxWidth: 180,
    },
    recentRemoveBtn: {
        marginLeft: 2,
        padding: 2,
    },
    quickWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    quickChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        gap: 6,
    },
    quickChipText: {
        fontSize: 13,
        fontWeight: '500',
    },
    resultsContainer: {
        flex: 1,
    },
    resultsHeader: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    resultsCountText: {
        fontSize: 13,
        fontWeight: '600',
    },
    resultsListContent: {
        paddingHorizontal: 16,
        paddingBottom: 130,
        gap: 10,
    },
    resultCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        gap: 6,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    typeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        gap: 5,
    },
    typeBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    cardDateText: {
        fontSize: 11,
        fontWeight: '500',
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '700',
        lineHeight: 20,
    },
    cardSnippet: {
        fontSize: 13,
        lineHeight: 18,
    },
    cardFooterMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 4,
    },
    cardFooterText: {
        fontSize: 11,
        fontWeight: '500',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingBottom: 80,
    },
    emptyIconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 6,
    },
    emptySubtitle: {
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 19,
    },
    resetFilterBtn: {
        marginTop: 18,
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 20,
    },
    resetFilterBtnText: {
        fontSize: 13,
        fontWeight: '600',
    },
});
