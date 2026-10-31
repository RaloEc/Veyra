import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
    SectionList,
    StyleSheet,
    ActivityIndicator,
    Image,
    Platform,
    useWindowDimensions,
    TouchableOpacity,
    Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import RenderHTML, { HTMLElementModel, HTMLContentModel } from 'react-native-render-html';

const customHTMLElementModels = {
    bold: HTMLElementModel.fromCustomModel({
        tagName: 'bold',
        mixedUAStyles: { fontWeight: 'bold' },
        contentModel: HTMLContentModel.textual,
    }),
    italic: HTMLElementModel.fromCustomModel({
        tagName: 'italic',
        mixedUAStyles: { fontStyle: 'italic' },
        contentModel: HTMLContentModel.textual,
    }),
};
import {
    ChevronLeft,
    Clock,
    RefreshCw,
    User,
    Edit3,
    AlertCircle,
    Calendar,
    Layers,
} from '@tamagui/lucide-icons';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

import { useVeyraTheme } from '../../../src/theme/useVeyraTheme';
import { supabase } from '../../../src/lib/supabase';
import { useStore } from '../../../src/store/useStore';
import { VeyraIconButton } from '../../../src/components/ui';
import { ActivityHistorySkeleton } from '../../../src/components/notes/ActivityHistorySkeleton';

interface YjsActivityRecord {
    id: number;
    note_id: string;
    user_id: string;
    session_bucket_ms: number;
    started_at: string;
    ended_at: string;
    edit_count: number;
    snippets?: string[] | string | null;
    last_snippet?: string | null;
}

interface UserProfileInfo {
    name: string;
    avatarUrl?: string;
    initial: string;
}

interface ActivitySection {
    title: string;
    data: YjsActivityRecord[];
}

export default function NoteActivityHistoryScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { width: windowWidth } = useWindowDimensions();
    const { colors, accent, isDark, typography } = useVeyraTheme();
    const language = useStore((state) => state.language);
    const currentUserId = useStore((state) => state.session?.user?.id);
    const dateLocale = language === 'es' ? es : enUS;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [activities, setActivities] = useState<YjsActivityRecord[]>([]);
    const [userProfiles, setUserProfiles] = useState<Record<string, UserProfileInfo>>({});
    const [noteTitle, setNoteTitle] = useState<string>('');

    const contentFadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!loading && !refreshing) {
            Animated.timing(contentFadeAnim, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
            }).start();
        } else if (loading && !refreshing) {
            contentFadeAnim.setValue(0);
        }
    }, [loading, refreshing, contentFadeAnim]);

    const loadActivity = useCallback(async (isPullRefresh: boolean = false) => {
        if (!id || id === 'create') return;

        if (isPullRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setErrorMsg(null);

        try {
            // 1. Obtener título de la nota para el header
            try {
                const { data: noteData } = await supabase
                    .from('notes')
                    .select('title')
                    .eq('id', id)
                    .maybeSingle();

                if (noteData?.title) {
                    setNoteTitle(noteData.title);
                }
            } catch (_) {}

            // 2. Consultar historial de actividad Yjs para la nota
            const { data, error } = await supabase
                .from('note_yjs_activity')
                .select('*')
                .eq('note_id', id)
                .order('started_at', { ascending: false })
                .limit(50);

            if (error) {
                console.warn('[NoteHistoryScreen] Error consultando actividad:', error);
                setErrorMsg(error.message || 'Error al cargar el historial');
                setActivities([]);
                return;
            }

            const rows: YjsActivityRecord[] = (data as any) || [];
            setActivities(rows);

            // 3. Consultar perfiles de colaboradores involucrados
            const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
            if (userIds.length > 0) {
                const profilesMap: Record<string, UserProfileInfo> = {};

                try {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, email, user_profile')
                        .in('id', userIds);

                    if (profiles) {
                        for (const p of profiles) {
                            let name = p.email ? p.email.split('@')[0] : 'Usuario';
                            let avatarUrl: string | undefined = undefined;

                            if (p.user_profile) {
                                let up = p.user_profile;
                                if (typeof up === 'string' && up.startsWith('{')) {
                                    try {
                                        up = JSON.parse(up);
                                    } catch {}
                                }
                                if (typeof up === 'object' && up !== null) {
                                    name = up.name || up.full_name || up.displayName || name;
                                    avatarUrl = up.avatar_url || up.avatar || up.picture || undefined;
                                }
                            }

                            profilesMap[p.id] = {
                                name,
                                avatarUrl,
                                initial: (name[0] || 'U').toUpperCase(),
                            };
                        }
                    }
                } catch (profErr) {
                    console.warn('[NoteHistoryScreen] Error al obtener perfiles:', profErr);
                }

                // Enriquecer con datos del usuario de sesión actual si aplica
                const currentUser = useStore.getState().session?.user;
                const currentStoreUserName = useStore.getState().userName;
                if (currentUser && userIds.includes(currentUser.id)) {
                    const existing = profilesMap[currentUser.id];
                    const bestName =
                        currentStoreUserName ||
                        currentUser.user_metadata?.full_name ||
                        currentUser.user_metadata?.name ||
                        existing?.name ||
                        (currentUser.email ? currentUser.email.split('@')[0] : 'Tú');

                    const bestAvatar =
                        currentUser.user_metadata?.avatar_url ||
                        currentUser.user_metadata?.picture ||
                        existing?.avatarUrl;

                    profilesMap[currentUser.id] = {
                        name: bestName,
                        avatarUrl: bestAvatar,
                        initial: (bestName[0] || 'T').toUpperCase(),
                    };
                }

                setUserProfiles(profilesMap);
            }
        } catch (err: any) {
            console.warn('[NoteHistoryScreen] Excepción cargando historial:', err);
            setErrorMsg(err?.message || 'Error inesperado');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id]);

    useFocusEffect(
        useCallback(() => {
            loadActivity(false);
        }, [loadActivity])
    );

    // Agrupación de actividades por día (Hoy, Ayer, Fecha)
    const sections = useMemo(() => {
        if (!activities || activities.length === 0) return [];

        const map = new Map<string, YjsActivityRecord[]>();
        const titleMap = new Map<string, string>();

        for (const act of activities) {
            const d = act.ended_at ? new Date(act.ended_at) : new Date(act.started_at);
            const dayKey = format(d, 'yyyy-MM-dd');

            if (!map.has(dayKey)) {
                map.set(dayKey, []);
                let label: string;
                if (isToday(d)) {
                    label = language === 'es' ? 'Hoy' : 'Today';
                } else if (isYesterday(d)) {
                    label = language === 'es' ? 'Ayer' : 'Yesterday';
                } else {
                    label = format(d, 'd MMMM yyyy', { locale: dateLocale });
                }
                titleMap.set(dayKey, label);
            }
            map.get(dayKey)!.push(act);
        }

        const result: ActivitySection[] = [];
        for (const [key, items] of map.entries()) {
            result.push({
                title: titleMap.get(key) || key,
                data: items,
            });
        }
        return result;
    }, [activities, dateLocale, language]);

    // Normaliza etiquetas no estándar como <bold> a <strong> antes de renderizar
    const normalizeHtmlSnippet = (raw: string): string => {
        if (!raw) return '';
        return raw
            .replace(/<\s*bold\b[^>]*>/gi, '<strong>')
            .replace(/<\s*\/\s*bold\s*>/gi, '</strong>')
            .replace(/<\s*italic\b[^>]*>/gi, '<em>')
            .replace(/<\s*\/\s*italic\s*>/gi, '</em>');
    };

    // Extrae y normaliza el arreglo de fragmentos HTML (soporta jsonb y fallback last_snippet)
    const extractSnippets = useCallback((item: YjsActivityRecord): string[] => {
        let rawList: string[] = [];
        if (item.snippets && Array.isArray(item.snippets) && item.snippets.length > 0) {
            rawList = item.snippets.filter(Boolean);
        } else if (typeof item.snippets === 'string') {
            try {
                const parsed = JSON.parse(item.snippets);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    rawList = parsed.filter(Boolean);
                }
            } catch (_) {}
        } else if (item.last_snippet && item.last_snippet.trim()) {
            rawList = [item.last_snippet.trim()];
        }
        return rawList.map(normalizeHtmlSnippet);
    }, []);

    // Estilos de etiquetas HTML unificados con el tema
    const htmlTagsStyles = useMemo(
        () => ({
            body: {
                color: colors.textPrimary,
                fontSize: 13.5,
                lineHeight: 20,
                margin: 0,
                padding: 0,
            },
            p: {
                marginTop: 0,
                marginBottom: 4,
                color: colors.textPrimary,
            },
            strong: {
                fontWeight: '700' as const,
                color: colors.textPrimary,
            },
            b: {
                fontWeight: '700' as const,
                color: colors.textPrimary,
            },
            em: {
                fontStyle: 'italic' as const,
            },
            i: {
                fontStyle: 'italic' as const,
            },
            h1: {
                fontSize: 16,
                fontWeight: '800' as const,
                marginVertical: 4,
                color: colors.textPrimary,
            },
            h2: {
                fontSize: 15,
                fontWeight: '700' as const,
                marginVertical: 3,
                color: colors.textPrimary,
            },
            h3: {
                fontSize: 14,
                fontWeight: '700' as const,
                marginVertical: 2,
                color: colors.textPrimary,
            },
            ul: {
                marginVertical: 3,
                paddingLeft: 16,
            },
            ol: {
                marginVertical: 3,
                paddingLeft: 16,
            },
            li: {
                marginBottom: 2,
            },
            code: {
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                borderRadius: 4,
                paddingHorizontal: 4,
            },
        }),
        [colors.textPrimary, isDark]
    );

    const renderSectionHeader = useCallback(
        ({ section }: { section: ActivitySection }) => (
            <View style={styles.sectionHeaderContainer}>
                <View
                    style={[
                        styles.sectionHeaderPill,
                        {
                            backgroundColor: isDark
                                ? 'rgba(255, 255, 255, 0.05)'
                                : 'rgba(0, 0, 0, 0.04)',
                            borderColor: isDark
                                ? 'rgba(255, 255, 255, 0.08)'
                                : 'rgba(0, 0, 0, 0.06)',
                        },
                    ]}
                >
                    <Calendar size={11} color={colors.textMuted as any} />
                    <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                        {section.title}
                    </Text>
                </View>
            </View>
        ),
        [isDark, colors.textMuted, colors.textSecondary]
    );

    const renderActivityCard = useCallback(
        ({ item }: { item: YjsActivityRecord }) => {
            const profile = userProfiles[item.user_id];
            let displayName = profile?.name || 'Colaborador';
            displayName = displayName.replace(/\s*\((Tú|You)\)$/i, '');

            const isCurrentUser = Boolean(currentUserId && item.user_id === currentUserId);
            const avatarUrl = profile?.avatarUrl;
            const initial = profile?.initial || (displayName[0] || 'U').toUpperCase();

            const dateObj = item.ended_at ? new Date(item.ended_at) : new Date(item.started_at);
            const timeAgo = formatDistanceToNow(dateObj, { addSuffix: true, locale: dateLocale });
            const exactTime = format(dateObj, 'p', { locale: dateLocale });

            const snippets = extractSnippets(item);

            return (
                <View style={styles.timelineItemRow}>
                    {/* Columna Izquierda: Avatar y Línea conectora */}
                    <View style={styles.trackCol}>
                        {avatarUrl ? (
                            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                        ) : (
                            <View style={[styles.avatarFallback, { backgroundColor: accent.primary }]}>
                                <Text style={styles.avatarInitial}>{initial}</Text>
                            </View>
                        )}
                        <View
                            style={[
                                styles.trackLine,
                                {
                                    backgroundColor: isDark
                                        ? 'rgba(255, 255, 255, 0.08)'
                                        : 'rgba(0, 0, 0, 0.06)',
                                },
                            ]}
                        />
                    </View>

                    {/* Columna Derecha: Contenido del evento */}
                    <View style={styles.contentCol}>
                        {/* Cabecera: Nombre y Fecha vs Badge */}
                        <View style={styles.cardHeader}>
                            <View style={styles.userTextCol}>
                                <Text
                                    style={[
                                        styles.userName,
                                        { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize },
                                    ]}
                                    numberOfLines={1}
                                >
                                    {displayName}
                                    {isCurrentUser && (
                                        <Text style={[styles.userBadgeYou, { color: accent.primary }]}>
                                            {` (${language === 'es' ? 'Tú' : 'You'})`}
                                        </Text>
                                    )}
                                </Text>
                                <View style={styles.dateRow}>
                                    <Clock size={11} color={colors.textMuted} />
                                    <Text style={[styles.dateText, { color: colors.textMuted }]} numberOfLines={1}>
                                        {timeAgo}
                                    </Text>
                                    <Text style={[styles.dateDot, { color: colors.textMuted }]}>•</Text>
                                    <Text style={[styles.dateExact, { color: colors.textMuted }]} numberOfLines={1}>
                                        {exactTime}
                                    </Text>
                                </View>
                            </View>

                            {/* Badge sutil de bloques editados */}
                            <View
                                style={[
                                    styles.badge,
                                    {
                                        backgroundColor: isDark
                                            ? 'rgba(255, 255, 255, 0.04)'
                                            : 'rgba(0, 0, 0, 0.03)',
                                        borderColor: isDark
                                            ? 'rgba(255, 255, 255, 0.08)'
                                            : 'rgba(0, 0, 0, 0.06)',
                                    },
                                ]}
                            >
                                <Edit3 size={11} color={accent.primary as any} />
                                <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                                    {item.edit_count} {item.edit_count === 1 ? 'bloque' : 'bloques'}
                                </Text>
                            </View>
                        </View>

                        {/* Fragmentos HTML con separación superior clara */}
                        {snippets.length > 0 ? (
                            <View style={styles.snippetsList}>
                                {snippets.map((htmlSnippet, idx) => (
                                    <View
                                        key={idx}
                                        style={[
                                            styles.snippetContainer,
                                            {
                                                backgroundColor: isDark
                                                    ? 'rgba(255, 255, 255, 0.035)'
                                                    : 'rgba(0, 0, 0, 0.025)',
                                                borderColor: isDark
                                                    ? 'rgba(255, 255, 255, 0.06)'
                                                    : 'rgba(0, 0, 0, 0.05)',
                                            },
                                        ]}
                                    >
                                        <RenderHTML
                                            contentWidth={windowWidth - 104}
                                            source={{ html: htmlSnippet }}
                                            tagsStyles={htmlTagsStyles}
                                            customHTMLElementModels={customHTMLElementModels}
                                            baseStyle={{
                                                color: colors.textPrimary,
                                                fontSize: 13.5,
                                                lineHeight: 20,
                                            }}
                                        />
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View style={styles.emptySnippetContainer}>
                                <Text style={[styles.emptySnippetText, { color: colors.textMuted }]}>
                                    Sin fragmento textual capturado
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            );
        },
        [
            userProfiles,
            currentUserId,
            language,
            dateLocale,
            extractSnippets,
            colors,
            accent,
            isDark,
            typography,
            windowWidth,
            htmlTagsStyles,
        ]
    );

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'right', 'left']}>
            {/* Barra superior de navegación */}
            <View style={[styles.headerBar, { borderBottomColor: colors.borderSubtle }]}>
                <View style={styles.headerLeft}>
                    <VeyraIconButton
                        variant="ghost"
                        size="sm"
                        icon={<ChevronLeft size={22} color={colors.textPrimary} />}
                        onPress={() => router.back()}
                    />
                    <View style={styles.headerTitleContainer}>
                        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            Historial de Actividad
                        </Text>
                        {noteTitle ? (
                            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                                {noteTitle}
                            </Text>
                        ) : null}
                    </View>
                </View>

                <VeyraIconButton
                    variant="ghost"
                    size="sm"
                    icon={<RefreshCw size={18} color={(refreshing ? accent.primary : colors.textSecondary) as any} />}
                    onPress={() => loadActivity(true)}
                    disabled={refreshing || loading}
                />
            </View>

            {/* Contenido principal */}
            {loading && !refreshing ? (
                <ActivityHistorySkeleton isDark={isDark} />
            ) : (
                <Animated.View style={[styles.contentContainer, { opacity: contentFadeAnim }]}>
                    {errorMsg ? (
                        <View style={styles.centered}>
                            <AlertCircle size={38} color="#EF4444" />
                            <Text style={[styles.errorTitle, { color: colors.textPrimary, marginTop: 12 }]}>
                                No se pudo cargar el historial
                            </Text>
                            <Text style={[styles.errorSub, { color: colors.textMuted }]}>{errorMsg}</Text>
                            <TouchableOpacity
                                style={[styles.retryBtn, { backgroundColor: accent.primary }]}
                                onPress={() => loadActivity(false)}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.retryBtnText}>Reintentar</Text>
                            </TouchableOpacity>
                        </View>
                    ) : activities.length === 0 ? (
                        <View style={styles.centered}>
                            <View
                                style={[
                                    styles.emptyIconCircle,
                                    { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' },
                                ]}
                            >
                                <Layers size={36} color={colors.textMuted as any} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                                Sin actividad registrada
                            </Text>
                            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                                Las sesiones de edición colaborativa en esta nota aparecerán aquí automáticamente.
                            </Text>
                        </View>
                    ) : (
                        <SectionList
                            sections={sections}
                            keyExtractor={(item) => String(item.id)}
                            renderItem={renderActivityCard}
                            renderSectionHeader={renderSectionHeader}
                            contentContainerStyle={styles.listContent}
                            showsVerticalScrollIndicator={false}
                            refreshing={refreshing}
                            onRefresh={() => loadActivity(true)}
                            stickySectionHeadersEnabled={false}
                            windowSize={5}
                            maxToRenderPerBatch={5}
                            initialNumToRender={6}
                            removeClippedSubviews={Platform.OS === 'android'}
                        />
                    )}
                </Animated.View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    contentContainer: {
        flex: 1,
    },
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 8,
    },
    headerTitleContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
    },
    headerSubtitle: {
        fontSize: 12,
        marginTop: 1,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 40,
    },
    sectionHeaderContainer: {
        marginTop: 14,
        marginBottom: 12,
        alignItems: 'flex-start',
    },
    sectionHeaderPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
    },
    sectionHeaderText: {
        fontSize: 11.5,
        fontWeight: '600',
        letterSpacing: 0.2,
    },
    timelineItemRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    trackCol: {
        width: 34,
        alignItems: 'center',
        marginRight: 12,
    },
    avatarImage: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    avatarFallback: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitial: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    trackLine: {
        flex: 1,
        width: 2,
        marginTop: 6,
        marginBottom: 4,
        borderRadius: 1,
    },
    contentCol: {
        flex: 1,
        paddingBottom: 22,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    userTextCol: {
        flex: 1,
        flexShrink: 1,
        marginRight: 8,
    },
    userName: {
        fontWeight: '700',
    },
    userBadgeYou: {
        fontWeight: '600',
        fontSize: 12,
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
        flexShrink: 1,
    },
    dateText: {
        fontSize: 11,
        flexShrink: 1,
    },
    dateDot: {
        fontSize: 10,
    },
    dateExact: {
        fontSize: 11,
        flexShrink: 1,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginLeft: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        alignSelf: 'flex-start',
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '500',
    },
    snippetsList: {
        marginTop: 12,
        gap: 8,
    },
    snippetContainer: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
    },
    emptySnippetContainer: {
        marginTop: 8,
    },
    emptySnippetText: {
        fontSize: 12,
        fontStyle: 'italic',
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    statusText: {
        fontSize: 14,
    },
    errorTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    errorSub: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 16,
    },
    retryBtn: {
        paddingHorizontal: 18,
        paddingVertical: 9,
        borderRadius: 8,
    },
    retryBtnText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 14,
    },
    emptyIconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    emptyTitle: {
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 6,
    },
    emptySub: {
        fontSize: 13.5,
        textAlign: 'center',
        lineHeight: 20,
    },
});
