import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
    RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    ChevronLeft,
    Users,
    Clock,
    Check,
    Edit3,
    Plus,
    Trash2,
    LogOut,
    Shield,
    Share2,
    FileText,
    Bell,
    Folder as FolderIcon,
    Calendar,
    Crown,
    Eye,
    EyeOff,
} from '@tamagui/lucide-icons';
import { formatDistanceToNow } from 'date-fns';
import { es, enUS } from 'date-fns/locale';

import { useVeyraTheme } from '../../src/theme/useVeyraTheme';
import { VeyraIconButton, VeyraButton, VeyraSurface } from '../../src/components/ui';
import { CollaborationService } from '../../src/services/collaborationService';
import {
    CollabTargetType,
    CollabRole,
    CollaboratorMember,
    CollaborationActivity,
} from '../../src/types/db';
import { useStore } from '../../src/store/useStore';
import { ShareModal } from '../../src/components/collaboration/ShareModal';

export default function CollaborationManagementScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, typography, radii, accent, isDark, semantics } = useVeyraTheme();
    const language = useStore((state) => state.language);
    const session = useStore((state) => state.session);
    const dateLocale = language === 'es' ? es : enUS;

    const { id, targetType: paramType, targetTitle: paramTitle } = useLocalSearchParams<{
        id: string;
        targetType?: CollabTargetType;
        targetTitle?: string;
    }>();

    const targetType: CollabTargetType = (paramType as CollabTargetType) || 'reminder';
    const targetTitle = paramTitle || 'Elemento compartido';

    const [activeTab, setActiveTab] = useState<'members' | 'activity'>('members');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [members, setMembers] = useState<CollaboratorMember[]>([]);
    const [activities, setActivities] = useState<CollaborationActivity[]>([]);
    const [isPublicMembers, setIsPublicMembers] = useState(true);
    const [updatingVisibility, setUpdatingVisibility] = useState(false);
    const [isOwner, setIsOwner] = useState(true);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    const loadData = useCallback(async () => {
        if (!id) return;
        try {
            const [fetchedMembers, fetchedActivities, fetchedVisibility] = await Promise.all([
                CollaborationService.getCollaborators(targetType, id),
                CollaborationService.getActivity(targetType, id, 30),
                CollaborationService.getMembersVisibility(targetType, id),
            ]);
            setMembers(fetchedMembers);
            setActivities(fetchedActivities);
            setIsPublicMembers(fetchedVisibility);

            const currentUserId = session?.user?.id;
            const currentIsMember = fetchedMembers.some((m) => m.member_id === currentUserId);
            setIsOwner(!currentIsMember);
        } catch (err) {
            console.warn('[CollaborationScreen] Error loading data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id, targetType, session?.user?.id]);

    const handleToggleVisibility = async (makePublic: boolean) => {
        if (updatingVisibility || makePublic === isPublicMembers) return;
        setUpdatingVisibility(true);
        try {
            const ok = await CollaborationService.setMembersVisibility(targetType, id, makePublic);
            if (ok) {
                setIsPublicMembers(makePublic);
            } else {
                Alert.alert('Error', 'No se pudo actualizar la visibilidad.');
            }
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'Error al cambiar visibilidad.');
        } finally {
            setUpdatingVisibility(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const handleToggleRole = async (member: CollaboratorMember) => {
        if (!isOwner) return;
        const newRole: CollabRole = member.role === 'editor' ? 'viewer' : 'editor';
        try {
            await CollaborationService.updateRole(member.collaboration_id, newRole);
            setMembers((prev) =>
                prev.map((m) =>
                    m.collaboration_id === member.collaboration_id ? { ...m, role: newRole } : m
                )
            );
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'No se pudo actualizar el rol');
        }
    };

    const handleRemoveMember = (member: CollaboratorMember) => {
        Alert.alert(
            'Revocar acceso',
            `¿Estás seguro de que deseas revocar el acceso a "${member.full_name || member.email || 'este usuario'}"?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Revocar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await CollaborationService.revokeAccess(member.collaboration_id);
                            setMembers((prev) =>
                                prev.filter((m) => m.collaboration_id !== member.collaboration_id)
                            );
                        } catch (err: any) {
                            Alert.alert('Error', err?.message || 'No se pudo revocar el acceso');
                        }
                    },
                },
            ]
        );
    };

    const handleLeave = () => {
        Alert.alert(
            'Abandonar recurso',
            'Ya no tendrás acceso a este recurso ni recibirás sus actualizaciones en tiempo real.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Abandonar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await CollaborationService.leaveCollaboration(targetType, id);
                            router.replace('/');
                        } catch (err: any) {
                            Alert.alert('Error', err?.message || 'No se pudo abandonar el recurso');
                        }
                    },
                },
            ]
        );
    };

    const getTypeIcon = () => {
        switch (targetType) {
            case 'note':
                return <FileText size={16} color={accent.primary as any} />;
            case 'folder':
                return <FolderIcon size={16} color={accent.primary as any} />;
            case 'event':
                return <Calendar size={16} color={accent.primary as any} />;
            default:
                return <Bell size={16} color={accent.primary as any} />;
        }
    };

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'completed':
                return <Check size={14} color={'#10B981' as any} strokeWidth={2.5} />;
            case 'uncompleted':
                return <Clock size={14} color={'#F59E0B' as any} strokeWidth={2.5} />;
            case 'edited':
                return <Edit3 size={14} color={'#3B82F6' as any} strokeWidth={2} />;
            case 'deleted':
                return <Trash2 size={14} color={'#EF4444' as any} strokeWidth={2} />;
            case 'joined':
                return <Users size={14} color={'#8B5CF6' as any} strokeWidth={2} />;
            default:
                return <Plus size={14} color={accent.primary as any} strokeWidth={2} />;
        }
    };

    const getActionText = (action: string, actorName?: string | null, itemTitle?: string | null) => {
        const name = actorName || 'Un colaborador';
        const titleStr = itemTitle ? `"${itemTitle}"` : '';
        switch (action) {
            case 'completed':
                return `${name} marcó completado ${titleStr}`;
            case 'uncompleted':
                return `${name} reactivó ${titleStr}`;
            case 'edited':
                return `${name} editó los detalles ${titleStr}`.trim();
            case 'deleted':
                return `${name} eliminó un elemento ${titleStr}`.trim();
            case 'joined':
                return `${name} se unió como colaborador`;
            default:
                return `${name} realizó cambios`;
        }
    };

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
            {/* Top Bar Minimalista */}
            <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
                <VeyraIconButton
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                    onPress={() => router.back()}
                />
                <View style={styles.headerTitleWrap}>
                    <View style={styles.headerTagRow}>
                        {getTypeIcon()}
                        <Text style={[styles.headerTypeTag, { color: accent.primary }]}>
                            {targetType.toUpperCase()}
                        </Text>
                    </View>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {targetTitle}
                    </Text>
                </View>
                {isOwner && (
                    <VeyraIconButton
                        variant="ghost"
                        size="sm"
                        icon={<Share2 size={19} color={accent.primary as any} />}
                        onPress={() => setIsShareModalOpen(true)}
                    />
                )}
            </View>

            {/* Segmented Control / Tabs */}
            <View style={styles.tabsContainer}>
                <View style={[styles.tabsTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                    <TouchableOpacity
                        style={[
                            styles.tabBtn,
                            activeTab === 'members' && {
                                backgroundColor: colors.surfaceElevated,
                                shadowColor: '#000',
                                shadowOpacity: isDark ? 0.3 : 0.08,
                                shadowRadius: 4,
                                elevation: 2,
                            },
                        ]}
                        onPress={() => setActiveTab('members')}
                        activeOpacity={0.8}
                    >
                        <Users size={14} color={(activeTab === 'members' ? accent.primary : colors.textMuted) as any} />
                        <Text
                            style={[
                                styles.tabText,
                                {
                                    color: activeTab === 'members' ? colors.textPrimary : colors.textMuted,
                                    fontWeight: activeTab === 'members' ? '700' : '500',
                                },
                            ]}
                        >
                            {language === 'es' ? `Miembros (${members.length})` : `Members (${members.length})`}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.tabBtn,
                            activeTab === 'activity' && {
                                backgroundColor: colors.surfaceElevated,
                                shadowColor: '#000',
                                shadowOpacity: isDark ? 0.3 : 0.08,
                                shadowRadius: 4,
                                elevation: 2,
                            },
                        ]}
                        onPress={() => setActiveTab('activity')}
                        activeOpacity={0.8}
                    >
                        <Clock size={14} color={(activeTab === 'activity' ? accent.primary : colors.textMuted) as any} />
                        <Text
                            style={[
                                styles.tabText,
                                {
                                    color: activeTab === 'activity' ? colors.textPrimary : colors.textMuted,
                                    fontWeight: activeTab === 'activity' ? '700' : '500',
                                },
                            ]}
                        >
                            {language === 'es' ? 'Actividad' : 'Activity'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Contenido Principal */}
            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={accent.primary} />
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={accent.primary} />
                    }
                >
                    {activeTab === 'members' ? (
                        <>
                            {/* Propietario */}
                            <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                                {language === 'es' ? 'PROPIETARIO' : 'OWNER'}
                            </Text>
                            <VeyraSurface level={2} radius="md" style={[styles.ownerCard, { borderColor: colors.borderSubtle }]}>
                                <View style={[styles.avatar, { backgroundColor: accent.primary }]}>
                                    <Crown size={16} color="#FFFFFF" strokeWidth={2.4} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.memberName, { color: colors.textPrimary }]}>
                                        {isOwner ? (session?.user?.email || 'Tú') : 'Creador del recurso'}
                                    </Text>
                                    <Text style={[styles.memberRoleTag, { color: accent.primary }]}>
                                        Propietario • Acceso total
                                    </Text>
                                </View>
                            </VeyraSurface>

                            {/* Configuración de Visibilidad de Integrantes (Solo Dueño) */}
                            {isOwner && (
                                <View style={{ marginTop: 20 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={[styles.sectionHeading, { color: colors.textSecondary, marginTop: 0 }]}>
                                            {language === 'es' ? 'VISIBILIDAD DE INTEGRANTES' : 'MEMBERS VISIBILITY'}
                                        </Text>
                                        {updatingVisibility && (
                                            <ActivityIndicator size="small" color={accent.primary} />
                                        )}
                                    </View>
                                    <VeyraSurface level={2} radius="md" style={{ padding: 12, borderColor: colors.borderSubtle }}>
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <TouchableOpacity
                                                style={{
                                                    flex: 1,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 6,
                                                    paddingVertical: 10,
                                                    paddingHorizontal: 8,
                                                    borderRadius: 12,
                                                    backgroundColor: isPublicMembers ? accent.primary + '20' : colors.surfaceElevated,
                                                    borderColor: isPublicMembers ? accent.primary : 'transparent',
                                                    borderWidth: 1,
                                                }}
                                                onPress={() => handleToggleVisibility(true)}
                                            >
                                                <Eye size={15} color={isPublicMembers ? (accent.primary as any) : (colors.textSecondary as any)} />
                                                <Text style={{ fontSize: 13, fontWeight: isPublicMembers ? '700' : '500', color: isPublicMembers ? accent.primary : colors.textPrimary }}>
                                                    Públicos
                                                </Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={{
                                                    flex: 1,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 6,
                                                    paddingVertical: 10,
                                                    paddingHorizontal: 8,
                                                    borderRadius: 12,
                                                    backgroundColor: !isPublicMembers ? accent.primary + '20' : colors.surfaceElevated,
                                                    borderColor: !isPublicMembers ? accent.primary : 'transparent',
                                                    borderWidth: 1,
                                                }}
                                                onPress={() => handleToggleVisibility(false)}
                                            >
                                                <EyeOff size={15} color={!isPublicMembers ? (accent.primary as any) : (colors.textSecondary as any)} />
                                                <Text style={{ fontSize: 13, fontWeight: !isPublicMembers ? '700' : '500', color: !isPublicMembers ? accent.primary : colors.textPrimary }}>
                                                    Privados
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 8 }}>
                                            {isPublicMembers
                                                ? 'Todos los colaboradores pueden ver quién más tiene acceso.'
                                                : 'Solo tú ves la lista completa. Los colaboradores no saben quién más participa.'}
                                        </Text>
                                    </VeyraSurface>
                                </View>
                            )}

                            {/* Banner Informativo si es Privado y no es el Dueño */}
                            {!isOwner && !isPublicMembers && (
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 10,
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                        padding: 12,
                                        borderRadius: 12,
                                        marginTop: 20,
                                    }}
                                >
                                    <EyeOff size={18} color={accent.primary as any} />
                                    <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }}>
                                        El creador ha configurado la lista de participantes en modo privado. Solo tú puedes ver tu estado y rol.
                                    </Text>
                                </View>
                            )}

                            {/* Colaboradores Invitados */}
                            <Text style={[styles.sectionHeading, { color: colors.textSecondary, marginTop: 24 }]}>
                                {language === 'es' ? 'COLABORADORES INVITADOS' : 'GUEST COLLABORATORS'}
                            </Text>

                            {members.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Users size={32} color={colors.textMuted as any} />
                                    <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
                                        {language === 'es'
                                            ? 'Aún no hay colaboradores en este elemento.'
                                            : 'No collaborators on this item yet.'}
                                    </Text>
                                    {isOwner && (
                                        <VeyraButton
                                            label={language === 'es' ? 'Invitar colaboradores' : 'Invite collaborators'}
                                            variant="secondary"
                                            size="sm"
                                            iconLeft={<Share2 size={15} color={accent.primary as any} />}
                                            onPress={() => setIsShareModalOpen(true)}
                                            style={{ marginTop: 12 }}
                                        />
                                    )}
                                </View>
                            ) : (
                                <View style={{ gap: 10 }}>
                                    {members.map((member) => {
                                        const initial = (member.email?.[0] || 'U').toUpperCase();
                                        return (
                                            <VeyraSurface
                                                key={member.collaboration_id}
                                                level={2}
                                                radius="md"
                                                style={[styles.memberCard, { borderColor: colors.borderSubtle }]}
                                            >
                                                <View style={[styles.avatar, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}>
                                                    <Text style={[styles.avatarText, { color: colors.textPrimary }]}>
                                                        {initial}
                                                    </Text>
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.memberName, { color: colors.textPrimary }]}>
                                                        {member.full_name || member.email || 'Colaborador'}
                                                    </Text>
                                                    <Text style={[styles.memberDate, { color: colors.textMuted }]}>
                                                        {language === 'es' ? 'Unido' : 'Joined'}{' '}
                                                        {formatDistanceToNow(new Date(member.joined_at), {
                                                            addSuffix: true,
                                                            locale: dateLocale,
                                                        })}
                                                    </Text>
                                                </View>

                                                {/* Selector de Rol o Indicador */}
                                                {isOwner ? (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <TouchableOpacity
                                                            style={[
                                                                styles.roleBadgeBtn,
                                                                {
                                                                    backgroundColor:
                                                                        member.role === 'editor'
                                                                            ? `${accent.primary}20`
                                                                            : isDark
                                                                            ? 'rgba(255,255,255,0.06)'
                                                                            : 'rgba(0,0,0,0.05)',
                                                                    borderColor:
                                                                        member.role === 'editor'
                                                                            ? `${accent.primary}50`
                                                                            : colors.borderSubtle,
                                                                },
                                                            ]}
                                                            onPress={() => handleToggleRole(member)}
                                                        >
                                                            <Shield size={12} color={accent.primary as any} />
                                                            <Text
                                                                style={[
                                                                    styles.roleBadgeText,
                                                                    {
                                                                        color:
                                                                            member.role === 'editor'
                                                                                ? accent.primary
                                                                                : colors.textSecondary,
                                                                    },
                                                                ]}
                                                            >
                                                                {member.role === 'editor' ? 'Editor' : 'Lector'}
                                                            </Text>
                                                        </TouchableOpacity>

                                                        <VeyraIconButton
                                                            variant="ghost"
                                                            size="sm"
                                                            icon={<Trash2 size={16} color={semantics.critical.primary} />}
                                                            onPress={() => handleRemoveMember(member)}
                                                        />
                                                    </View>
                                                ) : (
                                                    <View
                                                        style={[
                                                            styles.roleBadgeBtn,
                                                            {
                                                                backgroundColor: `${accent.primary}15`,
                                                                borderColor: `${accent.primary}30`,
                                                            },
                                                        ]}
                                                    >
                                                        <Text style={[styles.roleBadgeText, { color: accent.primary }]}>
                                                            {member.role === 'editor' ? 'Editor' : 'Lector'}
                                                        </Text>
                                                    </View>
                                                )}
                                            </VeyraSurface>
                                        );
                                    })}
                                </View>
                            )}

                            {/* Si no es dueño: Botón para abandonar */}
                            {!isOwner && (
                                <View style={{ marginTop: 32 }}>
                                    <VeyraButton
                                        label={language === 'es' ? 'Abandonar colaboración' : 'Leave collaboration'}
                                        variant="danger"
                                        size="md"
                                        iconLeft={<LogOut size={16} color="#FFFFFF" />}
                                        onPress={handleLeave}
                                    />
                                </View>
                            )}
                        </>
                    ) : (
                        /* Tab de Historial de Actividad */
                        <>
                            <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                                {language === 'es' ? 'HISTORIAL RECIENTE' : 'RECENT ACTIVITY'}
                            </Text>

                            {activities.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Clock size={32} color={colors.textMuted as any} />
                                    <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
                                        {language === 'es'
                                            ? 'No hay registros de actividad todavía.'
                                            : 'No activity recorded yet.'}
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.timelineContainer}>
                                    {activities.map((act, index) => {
                                        const timeAgo = formatDistanceToNow(new Date(act.created_at), {
                                            addSuffix: true,
                                            locale: dateLocale,
                                        });

                                        return (
                                            <View key={act.id || index} style={styles.timelineRow}>
                                                <View style={styles.timelineIconCol}>
                                                    <View
                                                        style={[
                                                            styles.actionIconBadge,
                                                            {
                                                                backgroundColor: isDark
                                                                    ? 'rgba(255,255,255,0.06)'
                                                                    : 'rgba(0,0,0,0.04)',
                                                                borderColor: colors.borderSubtle,
                                                            },
                                                        ]}
                                                    >
                                                        {getActionIcon(act.action)}
                                                    </View>
                                                    {index < activities.length - 1 && (
                                                        <View
                                                            style={[
                                                                styles.timelineLine,
                                                                { backgroundColor: colors.borderSubtle },
                                                            ]}
                                                        />
                                                    )}
                                                </View>

                                                <View style={styles.timelineTextCol}>
                                                    <Text style={[styles.activityText, { color: colors.textPrimary }]}>
                                                        {getActionText(act.action, act.actor_name, act.item_title || undefined)}
                                                    </Text>
                                                    {Boolean(act.details) && (
                                                        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                                                            {act.details}
                                                        </Text>
                                                    )}
                                                    <Text style={[styles.activityTime, { color: colors.textMuted, marginTop: 2 }]}>
                                                        {timeAgo}
                                                    </Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>
            )}

            {/* Modal de Compartir */}
            <ShareModal
                visible={isShareModalOpen}
                onClose={() => {
                    setIsShareModalOpen(false);
                    loadData();
                }}
                targetType={targetType}
                targetId={id}
                targetTitle={targetTitle}
                isOwner={isOwner}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    headerTitleWrap: {
        flex: 1,
        marginHorizontal: 12,
    },
    headerTagRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginBottom: 2,
    },
    headerTypeTag: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    tabsContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    tabsTrack: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: 12,
    },
    tabBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        borderRadius: 8,
    },
    tabText: {
        fontSize: 13,
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    sectionHeading: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
        marginBottom: 8,
    },
    ownerCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderWidth: 1,
    },
    memberCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderWidth: 1,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 14,
        fontWeight: '700',
    },
    memberName: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 2,
    },
    memberRoleTag: {
        fontSize: 12,
        fontWeight: '500',
    },
    memberDate: {
        fontSize: 11,
    },
    roleBadgeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
    },
    roleBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 36,
        gap: 8,
    },
    emptyStateText: {
        fontSize: 13,
        textAlign: 'center',
        maxWidth: 240,
    },
    timelineContainer: {
        paddingVertical: 8,
    },
    timelineRow: {
        flexDirection: 'row',
        minHeight: 52,
    },
    timelineIconCol: {
        alignItems: 'center',
        width: 36,
        marginRight: 10,
    },
    actionIconBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    timelineLine: {
        flex: 1,
        width: 2,
        marginVertical: 4,
    },
    timelineTextCol: {
        flex: 1,
        paddingBottom: 16,
    },
    activityText: {
        fontSize: 13,
        fontWeight: '500',
        marginBottom: 2,
    },
    activityTime: {
        fontSize: 11,
    },
});
