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
} from 'react-native';
import {
    X,
    Clock,
    User,
    CheckCircle2,
    Edit3,
    PlusCircle,
    Trash2,
    UserPlus,
    RotateCcw,
} from '@tamagui/lucide-icons';
import { formatDistanceToNow } from 'date-fns';
import { es, enUS } from 'date-fns/locale';

import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';
import { VeyraIconButton } from '../ui/VeyraIconButton';
import { CollaborationService } from '../../services/collaborationService';
import { CollabTargetType, CollaborationActivity } from '../../types/db';
import { useStore } from '../../store/useStore';

interface ActivityHistoryModalProps {
    visible: boolean;
    onClose: () => void;
    targetType: CollabTargetType;
    targetId: string;
    targetTitle?: string;
}

export const ActivityHistoryModal: React.FC<ActivityHistoryModalProps> = ({
    visible,
    onClose,
    targetType,
    targetId,
    targetTitle,
}) => {
    const { colors, accent, isDark, radii, semantics } = useVeyraTheme();
    const language = useStore((state) => state.language);
    const dateLocale = language === 'es' ? es : enUS;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activities, setActivities] = useState<CollaborationActivity[]>([]);

    const loadActivity = useCallback(async () => {
        if (!targetId) return;
        try {
            const list = await CollaborationService.getActivity(targetType, targetId, 40);
            setActivities(list);
        } catch (e) {
            console.warn('[ActivityHistoryModal] Error loading activity:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [targetType, targetId]);

    useEffect(() => {
        if (visible) {
            setLoading(true);
            loadActivity();
        }
    }, [visible, loadActivity]);

    const getActionBadge = (action: CollaborationActivity['action']) => {
        switch (action) {
            case 'completed':
                return {
                    label: language === 'es' ? 'Completado' : 'Completed',
                    color: semantics?.success?.primary || '#10B981',
                    icon: <CheckCircle2 size={13} color={(semantics?.success?.primary || '#10B981') as any} />,
                };
            case 'uncompleted':
                return {
                    label: language === 'es' ? 'Reactivado' : 'Reopened',
                    color: accent.primary,
                    icon: <RotateCcw size={13} color={accent.primary as any} />,
                };
            case 'edited':
                return {
                    label: language === 'es' ? 'Editado' : 'Edited',
                    color: '#3B82F6',
                    icon: <Edit3 size={13} color="#3B82F6" />,
                };
            case 'added':
                return {
                    label: language === 'es' ? 'Nuevo / Unido' : 'Added / Joined',
                    color: accent.primary,
                    icon: <UserPlus size={13} color={accent.primary as any} />,
                };
            case 'deleted':
                return {
                    label: language === 'es' ? 'Eliminado' : 'Deleted',
                    color: semantics?.critical?.primary || '#EF4444',
                    icon: <Trash2 size={13} color={(semantics?.critical?.primary || '#EF4444') as any} />,
                };
            default:
                return {
                    label: action,
                    color: colors.textSecondary,
                    icon: <Edit3 size={13} color={colors.textSecondary as any} />,
                };
        }
    };

    const getTargetTypeName = () => {
        switch (targetType) {
            case 'folder':
                return language === 'es' ? 'Carpeta' : 'Folder';
            case 'reminder':
                return language === 'es' ? 'Recordatorio' : 'Reminder';
            case 'note':
                return language === 'es' ? 'Nota' : 'Note';
            case 'event':
                return language === 'es' ? 'Evento' : 'Event';
            default:
                return language === 'es' ? 'Elemento' : 'Item';
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <VeyraSurface style={styles.modalCard}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerTitleBox}>
                            <View style={[styles.headerIconBox, { backgroundColor: `${accent.primary}20` }]}>
                                <Clock size={16} color={accent.primary as any} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                                    {language === 'es' ? 'Historial de cambios' : 'Change History'}
                                </Text>
                                <Text
                                    style={[styles.targetTitle, { color: colors.textSecondary }]}
                                    numberOfLines={1}
                                >
                                    {targetTitle || getTargetTypeName()}
                                </Text>
                            </View>
                        </View>
                        <VeyraIconButton
                            icon={<X size={20} color={colors.textSecondary as any} />}
                            onPress={onClose}
                            accessibilityLabel="Cerrar"
                        />
                    </View>

                    {/* Contenido / Lista de cambios */}
                    {loading ? (
                        <View style={styles.loadingBox}>
                            <ActivityIndicator size="small" color={accent.primary} />
                            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                                {language === 'es' ? 'Cargando historial...' : 'Loading history...'}
                            </Text>
                        </View>
                    ) : (
                        <ScrollView
                            style={styles.scrollBody}
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={() => {
                                        setRefreshing(true);
                                        loadActivity();
                                    }}
                                    tintColor={accent.primary}
                                />
                            }
                        >
                            {activities.length === 0 ? (
                                <View style={styles.emptyBox}>
                                    <View style={[styles.emptyIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                                        <Clock size={32} color={colors.textMuted as any} />
                                    </View>
                                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                                        {language === 'es' ? 'Sin cambios registrados' : 'No activity yet'}
                                    </Text>
                                    <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                                        {language === 'es'
                                            ? 'Las modificaciones, ediciones y acciones realizadas por los colaboradores aparecerán aquí.'
                                            : 'Edits and actions made by collaborators will appear here.'}
                                    </Text>
                                </View>
                            ) : (
                                activities.map((item, index) => {
                                    const badge = getActionBadge(item.action);
                                    let relativeTime = '';
                                    try {
                                        relativeTime = formatDistanceToNow(new Date(item.created_at), {
                                            addSuffix: true,
                                            locale: dateLocale,
                                        });
                                    } catch {
                                        relativeTime = item.created_at;
                                    }

                                    const initial = (item.actor_name?.[0] || 'U').toUpperCase();

                                    return (
                                        <View
                                            key={item.id || index}
                                            style={[
                                                styles.activityRow,
                                                {
                                                    borderBottomColor: colors.borderSubtle,
                                                    borderBottomWidth: index < activities.length - 1 ? 1 : 0,
                                                },
                                            ]}
                                        >
                                            {/* Avatar del autor */}
                                            <View
                                                style={[
                                                    styles.authorAvatar,
                                                    {
                                                        backgroundColor: isDark
                                                            ? 'rgba(255, 255, 255, 0.1)'
                                                            : 'rgba(0, 0, 0, 0.06)',
                                                        borderColor: colors.borderSubtle,
                                                    },
                                                ]}
                                            >
                                                <Text style={[styles.avatarInitial, { color: accent.primary }]}>
                                                    {initial}
                                                </Text>
                                            </View>

                                            {/* Detalles del cambio */}
                                            <View style={styles.activityInfo}>
                                                <View style={styles.activityTopRow}>
                                                    <Text
                                                        style={[styles.actorName, { color: colors.textPrimary }]}
                                                        numberOfLines={1}
                                                    >
                                                        {item.actor_name || (language === 'es' ? 'Usuario' : 'User')}
                                                    </Text>

                                                    <View
                                                        style={[
                                                            styles.badge,
                                                            { backgroundColor: `${badge.color}18` },
                                                        ]}
                                                    >
                                                        {badge.icon}
                                                        <Text style={[styles.badgeText, { color: badge.color }]}>
                                                            {badge.label}
                                                        </Text>
                                                    </View>
                                                </View>

                                                {Boolean(item.details || item.item_title) && (
                                                    <Text
                                                        style={[styles.activityDetails, { color: colors.textSecondary }]}
                                                        numberOfLines={2}
                                                    >
                                                        {item.details || item.item_title}
                                                    </Text>
                                                )}

                                                <Text style={[styles.activityTime, { color: colors.textMuted }]}>
                                                    {relativeTime}
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })
                            )}
                        </ScrollView>
                    )}
                </VeyraSurface>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalCard: {
        width: '100%',
        maxWidth: 440,
        maxHeight: '80%',
        borderRadius: 24,
        padding: 20,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(150, 150, 150, 0.2)',
    },
    headerTitleBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    headerIconBox: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
    },
    targetTitle: {
        fontSize: 13,
        marginTop: 2,
    },
    loadingBox: {
        paddingVertical: 48,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
    },
    scrollBody: {
        maxHeight: 460,
    },
    scrollContent: {
        paddingVertical: 12,
    },
    emptyBox: {
        alignItems: 'center',
        paddingVertical: 40,
        paddingHorizontal: 24,
    },
    emptyIconBox: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 8,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 13.5,
        lineHeight: 19,
        textAlign: 'center',
    },
    activityRow: {
        flexDirection: 'row',
        paddingVertical: 12,
        gap: 12,
        alignItems: 'flex-start',
    },
    authorAvatar: {
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        marginTop: 2,
    },
    avatarInitial: {
        fontSize: 14,
        fontWeight: '700',
    },
    activityInfo: {
        flex: 1,
        gap: 4,
    },
    activityTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    actorName: {
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 2.5,
        borderRadius: 8,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    activityDetails: {
        fontSize: 13,
        lineHeight: 17,
    },
    activityTime: {
        fontSize: 11.5,
        marginTop: 2,
    },
});
