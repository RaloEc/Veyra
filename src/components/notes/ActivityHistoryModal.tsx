import React, { useState, useEffect, useCallback } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    RefreshControl,
    Image,
    TouchableWithoutFeedback,
    LayoutAnimation,
    Platform,
    UIManager,
} from 'react-native';
import {
    X,
    Clock,
    ChevronDown,
    ChevronUp,
    FileText,
    Code2,
    User,
    CheckCircle2,
    Calendar,
} from '@tamagui/lucide-icons';
import { format, formatDistanceToNow } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../store/useStore';
import { VeyraIconButton } from '../ui/VeyraIconButton';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface ActivityHistoryModalProps {
    noteId: string;
    visible: boolean;
    onClose: () => void;
}

interface YjsActivityRecord {
    id: number;
    note_id: string;
    user_id: string;
    session_bucket_ms: number;
    started_at: string;
    ended_at: string;
    edit_count: number;
    last_snippet: string | null;
}

interface UserProfileInfo {
    name: string;
    avatarUrl?: string;
    initial: string;
}

export const ActivityHistoryModal: React.FC<ActivityHistoryModalProps> = ({
    noteId,
    visible,
    onClose,
}) => {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { colors, accent, isDark, radii, typography } = useVeyraTheme();
    const language = useStore((state) => state.language);
    const dateLocale = language === 'es' ? es : enUS;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activities, setActivities] = useState<YjsActivityRecord[]>([]);
    const [userProfiles, setUserProfiles] = useState<Record<string, UserProfileInfo>>({});
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

    const loadActivity = useCallback(async () => {
        if (!noteId) return;

        try {
            // 1. Consultar sesiones de actividad Yjs para la nota
            const { data, error } = await supabase
                .from('note_yjs_activity')
                .select('*')
                .eq('note_id', noteId)
                .order('started_at', { ascending: false })
                .limit(30);

            if (error) {
                console.warn('[ActivityHistoryModal] Error fetching activity:', error);
                setActivities([]);
                return;
            }

            const rows: YjsActivityRecord[] = (data as any) || [];
            setActivities(rows);

            // 2. Obtener perfiles de usuarios involucrados
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
                    console.warn('[ActivityHistoryModal] Error fetching profiles:', profErr);
                }

                // Enriquecer con datos del usuario local si faltan
                const currentUser = useStore.getState().session?.user;
                const currentStoreUserName = useStore.getState().userName;
                if (currentUser && userIds.includes(currentUser.id)) {
                    const existing = profilesMap[currentUser.id];
                    const bestName =
                        currentStoreUserName ||
                        currentUser.user_metadata?.full_name ||
                        currentUser.user_metadata?.name ||
                        existing?.name ||
                        currentUser.email?.split('@')[0] ||
                        (language === 'es' ? 'Tú' : 'You');
                    profilesMap[currentUser.id] = {
                        name: bestName,
                        avatarUrl: existing?.avatarUrl || currentUser.user_metadata?.avatar_url,
                        initial: (bestName[0] || 'U').toUpperCase(),
                    };
                }

                setUserProfiles(profilesMap);
            }
        } catch (e) {
            console.warn('[ActivityHistoryModal] Error general cargando historial:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [noteId, language]);

    useEffect(() => {
        if (visible) {
            setLoading(true);
            setExpandedIds(new Set());
            loadActivity();
        }
    }, [visible, loadActivity]);

    const handleRefresh = () => {
        setRefreshing(true);
        loadActivity();
    };

    const toggleExpand = (id: number) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const formatSessionTime = (startedAt: string, endedAt: string): string => {
        try {
            const start = new Date(startedAt);
            const end = new Date(endedAt);
            const startStr = format(start, 'HH:mm');
            const endStr = format(end, 'HH:mm');
            if (startStr === endStr) {
                return language === 'es' ? `A las ${startStr}` : `At ${startStr}`;
            }
            return `${startStr} – ${endStr}`;
        } catch {
            return language === 'es' ? 'Sesión reciente' : 'Recent session';
        }
    };

    const formatRelativeTime = (endedAt: string): string => {
        try {
            const date = new Date(endedAt);
            const now = Date.now();
            if (now - date.getTime() < 24 * 60 * 60 * 1000) {
                return formatDistanceToNow(date, { addSuffix: true, locale: dateLocale });
            }
            return format(date, 'd MMM, HH:mm', { locale: dateLocale });
        } catch {
            return '';
        }
    };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                {/* Backdrop con token de cristal Veyra */}
                <TouchableWithoutFeedback onPress={onClose}>
                    <View
                        style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: colors.glassBackdrop },
                        ]}
                    />
                </TouchableWithoutFeedback>

                {/* Hoja BottomSheet alineada con Veyra Solid Core */}
                <View
                    style={[
                        styles.sheetContainer,
                        {
                            backgroundColor: colors.surface,
                            borderColor: colors.borderSubtle,
                            paddingBottom: Math.max(insets.bottom, 16) + 8,
                        },
                    ]}
                >
                    {/* Pull Bar */}
                    <View style={styles.pullBarContainer}>
                        <View
                            style={[
                                styles.pullBar,
                                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.12)' },
                            ]}
                        />
                    </View>

                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <View
                                style={[
                                    styles.iconBadge,
                                    {
                                        backgroundColor: accent.primaryBg || `${accent.primary}18`,
                                        borderColor: `${accent.primary}30`,
                                    },
                                ]}
                            >
                                <Clock size={18} color={accent.primary as any} strokeWidth={2.4} />
                            </View>
                            <View style={styles.headerTitleBox}>
                                <Text style={[styles.title, { color: colors.textPrimary }]}>
                                    {t('notes.activity_history', { defaultValue: 'Historial de cambios' })}
                                </Text>
                                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                                    {t('notes.activity_sessions_subtitle', { defaultValue: 'Auditoría en bloques de 5 min' })}
                                </Text>
                            </View>
                        </View>
                        <VeyraIconButton
                            variant="ghost"
                            size="sm"
                            icon={<X size={18} color={colors.textSecondary} />}
                            onPress={onClose}
                            accessibilityLabel={t('common.close', { defaultValue: 'Cerrar' })}
                        />
                    </View>

                    {/* Contenido */}
                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color={accent.primary} />
                            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                                {t('common.loading', { defaultValue: 'Cargando historial…' })}
                            </Text>
                        </View>
                    ) : activities.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <View
                                style={[
                                    styles.emptyIconBadge,
                                    {
                                        backgroundColor: colors.surfaceElevated,
                                        borderColor: colors.borderSubtle,
                                    },
                                ]}
                            >
                                <Clock size={26} color={colors.textMuted as any} strokeWidth={1.8} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                                {t('notes.no_activity_title', { defaultValue: 'Sin actividad registrada' })}
                            </Text>
                            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                                {t('notes.no_activity_desc', { defaultValue: 'Las sesiones de edición aparecerán aquí agrupadas.' })}
                            </Text>
                        </View>
                    ) : (
                        <ScrollView
                            style={styles.scrollList}
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={handleRefresh}
                                    tintColor={accent.primary}
                                    colors={[accent.primary]}
                                />
                            }
                        >
                            {activities.map((item) => {
                                const profile = userProfiles[item.user_id] || {
                                    name: 'Usuario',
                                    initial: 'U',
                                };
                                const isExpanded = expandedIds.has(item.id);
                                const editCountLabel =
                                    item.edit_count === 1
                                        ? `1 ${t('notes.single_change', { defaultValue: 'cambio' })}`
                                        : `${item.edit_count} ${t('notes.multiple_changes', { defaultValue: 'cambios' })}`;
                                const relativeTime = formatRelativeTime(item.ended_at);
                                const sessionTimeStr = formatSessionTime(item.started_at, item.ended_at);

                                return (
                                    <View
                                        key={item.id}
                                        style={[
                                            styles.cardContainer,
                                            {
                                                backgroundColor: isExpanded
                                                    ? (isDark ? colors.surfaceHover : colors.surfaceElevated)
                                                    : colors.surfaceElevated,
                                                borderColor: isExpanded ? `${accent.primary}50` : colors.borderSubtle,
                                            },
                                        ]}
                                    >
                                        {/* Fila Táctil Principal */}
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            onPress={() => toggleExpand(item.id)}
                                            style={styles.cardHeaderRow}
                                        >
                                            {/* Avatar con paleta Veyra */}
                                            {profile.avatarUrl ? (
                                                <Image
                                                    source={{ uri: profile.avatarUrl }}
                                                    style={[styles.avatarImg, { borderColor: colors.borderSubtle }]}
                                                />
                                            ) : (
                                                <View
                                                    style={[
                                                        styles.avatarFallback,
                                                        {
                                                            backgroundColor: accent.primaryBg || `${accent.primary}20`,
                                                            borderColor: `${accent.primary}40`,
                                                        },
                                                    ]}
                                                >
                                                    <Text style={[styles.avatarText, { color: accent.primary }]}>
                                                        {profile.initial}
                                                    </Text>
                                                </View>
                                            )}

                                            {/* Datos del autor y cronología */}
                                            <View style={styles.cardTextCol}>
                                                <View style={styles.cardUserRow}>
                                                    <Text
                                                        numberOfLines={1}
                                                        style={[styles.userName, { color: colors.textPrimary }]}
                                                    >
                                                        {profile.name}
                                                    </Text>
                                                    {relativeTime ? (
                                                        <Text style={[styles.timeAgo, { color: colors.textMuted }]}>
                                                            {relativeTime}
                                                        </Text>
                                                    ) : null}
                                                </View>

                                                <View style={styles.sessionMetaRow}>
                                                    <View style={styles.timeTagRow}>
                                                        <Clock size={11} color={colors.textSecondary as any} />
                                                        <Text style={[styles.sessionTime, { color: colors.textSecondary }]}>
                                                            {sessionTimeStr}
                                                        </Text>
                                                    </View>

                                                    <View
                                                        style={[
                                                            styles.badgeCount,
                                                            {
                                                                backgroundColor: isDark
                                                                    ? 'rgba(255, 255, 255, 0.07)'
                                                                    : 'rgba(0, 0, 0, 0.05)',
                                                                borderColor: colors.borderSubtle,
                                                            },
                                                        ]}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.badgeCountText,
                                                                { color: isExpanded ? accent.primary : colors.textSecondary },
                                                            ]}
                                                        >
                                                            {editCountLabel}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>

                                            {/* Indicador de Acordeón */}
                                            <View
                                                style={[
                                                    styles.accordionIconSlot,
                                                    {
                                                        backgroundColor: isExpanded
                                                            ? (accent.primaryBg || `${accent.primary}18`)
                                                            : 'transparent',
                                                    },
                                                ]}
                                            >
                                                {isExpanded ? (
                                                    <ChevronUp size={16} color={accent.primary as any} />
                                                ) : (
                                                    <ChevronDown size={16} color={colors.textSecondary as any} />
                                                )}
                                            </View>
                                        </TouchableOpacity>

                                        {/* Acordeón: Extracto de Auditoría */}
                                        {isExpanded && (() => {
                                            const rawSnippet = item.last_snippet || '';
                                            const cleanSnippet = rawSnippet
                                                .replace(/<[^>]*>?/gm, '')
                                                .replace(/&nbsp;/gi, ' ')
                                                .replace(/&amp;/gi, '&')
                                                .replace(/&quot;/gi, '"')
                                                .replace(/&#39;/gi, "'")
                                                .replace(/&lt;/gi, '<')
                                                .replace(/&gt;/gi, '>')
                                                .replace(/\s+/g, ' ')
                                                .trim();

                                            return (
                                                <View
                                                    style={[
                                                        styles.expandedBox,
                                                        {
                                                            backgroundColor: colors.surface,
                                                            borderTopColor: colors.borderSubtle,
                                                            borderLeftColor: accent.primary,
                                                        },
                                                    ]}
                                                >
                                                    <View style={styles.snippetHeaderRow}>
                                                        <Code2 size={13} color={accent.primary as any} strokeWidth={2.2} />
                                                        <Text style={[styles.snippetLabel, { color: colors.textSecondary }]}>
                                                            {language === 'es' ? 'Último fragmento editado:' : 'Last edited excerpt:'}
                                                        </Text>
                                                    </View>

                                                    {/* Bloque estilo Diff / Código con fondo gris y fuente monoespaciada */}
                                                    <View
                                                        style={[
                                                            styles.codeBlock,
                                                            {
                                                                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.40)' : 'rgba(0, 0, 0, 0.04)',
                                                                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                                                            },
                                                        ]}
                                                    >
                                                        <Text
                                                            numberOfLines={4}
                                                            ellipsizeMode="tail"
                                                            style={[
                                                                styles.codeText,
                                                                {
                                                                    color: cleanSnippet ? (isDark ? '#E2E8F0' : '#1E293B') : colors.textMuted,
                                                                    fontStyle: cleanSnippet ? 'normal' : 'italic',
                                                                },
                                                            ]}
                                                        >
                                                            {cleanSnippet || (language === 'es' ? 'Sin extracto de texto disponible' : 'No text excerpt available')}
                                                        </Text>
                                                    </View>
                                                </View>
                                            );
                                        })()}
                                    </View>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        borderBottomWidth: 0,
        maxHeight: '82%',
    },
    pullBarContainer: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    pullBar: {
        width: 38,
        height: 4,
        borderRadius: 2,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    iconBadge: {
        width: 38,
        height: 38,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitleBox: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    subtitle: {
        fontSize: 12,
        fontWeight: '400',
        marginTop: 1,
    },
    loadingContainer: {
        paddingVertical: 52,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 13,
        fontWeight: '500',
    },
    emptyContainer: {
        paddingVertical: 48,
        paddingHorizontal: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyIconBadge: {
        width: 54,
        height: 54,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 6,
    },
    emptyDesc: {
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
    },
    scrollList: {
        maxHeight: 460,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 14,
        gap: 8,
    },
    cardContainer: {
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    avatarImg: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
    },
    avatarFallback: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 13,
        fontWeight: '700',
    },
    cardTextCol: {
        flex: 1,
        marginLeft: 12,
        marginRight: 8,
    },
    cardUserRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 3,
    },
    userName: {
        fontSize: 13.5,
        fontWeight: '600',
        letterSpacing: -0.1,
        flex: 1,
        marginRight: 8,
    },
    timeAgo: {
        fontSize: 11,
        fontWeight: '400',
    },
    sessionMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    timeTagRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    sessionTime: {
        fontSize: 11.5,
        fontWeight: '400',
    },
    badgeCount: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
    },
    badgeCountText: {
        fontSize: 10.5,
        fontWeight: '600',
    },
    accordionIconSlot: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    expandedBox: {
        borderTopWidth: 1,
        borderLeftWidth: 3,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginHorizontal: 8,
        marginBottom: 8,
        borderRadius: 8,
    },
    snippetHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    snippetLabel: {
        fontSize: 10.5,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    snippetBody: {
        fontSize: 12.5,
        lineHeight: 18,
        fontStyle: 'italic',
    },
    codeBlock: {
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginTop: 4,
    },
    codeText: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: 12,
        lineHeight: 18,
        letterSpacing: -0.1,
    },
});
