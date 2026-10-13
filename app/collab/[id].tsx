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
    Image as RNImage,
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
    Image as ImageIcon,
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
import { supabase } from '../../src/lib/supabase';
import { NoteChangeDetail } from '../../src/utils/diffNoteChanges';

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
    const [ownerInfo, setOwnerInfo] = useState<{ id?: string; name: string; email?: string } | null>(null);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    const loadData = useCallback(async () => {
        if (!id) return;
        try {
            // Asegurar que nuestra propia identidad esté registrada en el historial
            if (session?.user?.id) {
                CollaborationService.ensureActorIdentity(targetType, id, targetTitle, isOwner).catch(() => {});
            }

            const [fetchedMembers, fetchedActivities, fetchedVisibility, fetchedOwner] = await Promise.all([
                CollaborationService.getCollaborators(targetType, id),
                CollaborationService.getActivity(targetType, id, 30),
                CollaborationService.getMembersVisibility(targetType, id),
                CollaborationService.getResourceOwner(targetType, id),
            ]);
            setMembers(fetchedMembers);
            setActivities(fetchedActivities);
            setIsPublicMembers(fetchedVisibility);
            setOwnerInfo(fetchedOwner);

            const currentUserId = session?.user?.id;
            const currentIsMember = fetchedMembers.some((m) => m.member_id === currentUserId);
            const userIsOwner = !currentIsMember;
            setIsOwner(userIsOwner);

            // Si se confirmó que es dueño, registrar con flag correcto
            if (session?.user?.id && userIsOwner) {
                CollaborationService.ensureActorIdentity(targetType, id, targetTitle, true).catch(() => {});
            }
        } catch (err) {
            console.warn('[CollaborationScreen] Error loading data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id, targetType, targetTitle, isOwner, session?.user?.id]);

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

        if (!id) return;

        // Suscribirse a cambios en tiempo real de actividad y colaboraciones
        const channelName = `collab_mgmt_${targetType}_${id}_${Date.now()}`;
        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'collaboration_activity', filter: `target_id=eq.${id}` },
                () => {
                    loadData();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'collaborations', filter: `target_id=eq.${id}` },
                () => {
                    loadData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel).catch(() => {});
        };
    }, [id, targetType, loadData]);

    const handleRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const handleToggleRole = async (member: CollaboratorMember) => {
        if (!isOwner) return;
        const newRole: CollabRole = member.role === 'editor' ? 'viewer' : 'editor';
        try {
            await CollaborationService.updateRole(member.collaboration_id, newRole, {
                targetType,
                targetId: id,
                memberId: member.member_id,
            });
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

    const getActionIcon = (action: string, diffDetail?: NoteChangeDetail | null) => {
        if (action === 'edited') {
            if (diffDetail?.imagesAdded && diffDetail.imagesAdded.length > 0) {
                return <ImageIcon size={14} color={'#10B981' as any} strokeWidth={2} />;
            }
            if (diffDetail?.imagesRemoved && diffDetail.imagesRemoved.length > 0) {
                return <Trash2 size={14} color={'#EF4444' as any} strokeWidth={2} />;
            }
            return <Edit3 size={14} color={'#3B82F6' as any} strokeWidth={2} />;
        }
        switch (action) {
            case 'completed':
                return <Check size={14} color={'#10B981' as any} strokeWidth={2.5} />;
            case 'uncompleted':
                return <Clock size={14} color={'#F59E0B' as any} strokeWidth={2.5} />;
            case 'deleted':
                return <Trash2 size={14} color={'#EF4444' as any} strokeWidth={2} />;
            case 'joined':
                return <Users size={14} color={'#8B5CF6' as any} strokeWidth={2} />;
            default:
                return <Plus size={14} color={accent.primary as any} strokeWidth={2} />;
        }
    };

    const parseActivityDetail = (raw?: string | null): NoteChangeDetail | null => {
        if (!raw || typeof raw !== 'string') return null;
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && (parsed.type === 'note_diff' || parsed.summary)) {
                    return parsed as NoteChangeDetail;
                }
            } catch {}
        }
        return null;
    };

    const formatActorDisplayName = (raw?: string | null) => {
        if (!raw) return 'Un colaborador';
        if (raw.includes('@')) {
            const prefix = raw.split('@')[0];
            return prefix.charAt(0).toUpperCase() + prefix.slice(1);
        }
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    };

    const getActionText = (
        action: string,
        actorName?: string | null,
        itemTitle?: string | null,
        diffDetail?: NoteChangeDetail | null
    ) => {
        const name = formatActorDisplayName(actorName);
        const titleStr = itemTitle ? `"${itemTitle}"` : '';

        if (action === 'edited') {
            if (diffDetail?.summary) {
                return `${name} ${diffDetail.summary.toLowerCase()}${titleStr ? ` en ${titleStr}` : ''}`;
            }
            return `${name} editó los detalles ${titleStr}`.trim();
        }

        switch (action) {
            case 'completed':
                return `${name} marcó completado ${titleStr}`;
            case 'uncompleted':
                return `${name} reactivó ${titleStr}`;
            case 'deleted':
                return `${name} eliminó ${titleStr || 'un elemento'}`.trim();
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

            {/* Tabs Minimalistas (Sin píldoras pesadas) */}
            <View style={[styles.tabsHeader, { borderBottomColor: colors.borderSubtle }]}>
                <TouchableOpacity
                    style={[
                        styles.tabItem,
                        activeTab === 'members' && [styles.tabItemActive, { borderBottomColor: accent.primary }],
                    ]}
                    onPress={() => setActiveTab('members')}
                    activeOpacity={0.7}
                >
                    <Users
                        size={15}
                        color={(activeTab === 'members' ? accent.primary : colors.textMuted) as any}
                    />
                    <Text
                        style={[
                            styles.tabLabel,
                            { color: activeTab === 'members' ? colors.textPrimary : colors.textMuted },
                            activeTab === 'members' && styles.tabLabelActive,
                        ]}
                    >
                        {language === 'es' ? 'Miembros' : 'Members'}
                    </Text>
                    <View
                        style={[
                            styles.tabCountBadge,
                            {
                                backgroundColor:
                                    activeTab === 'members'
                                        ? accent.primary + '18'
                                        : isDark
                                        ? 'rgba(255,255,255,0.06)'
                                        : 'rgba(0,0,0,0.05)',
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.tabCountText,
                                { color: activeTab === 'members' ? accent.primary : colors.textMuted },
                            ]}
                        >
                            {members.length + 1}
                        </Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.tabItem,
                        activeTab === 'activity' && [styles.tabItemActive, { borderBottomColor: accent.primary }],
                    ]}
                    onPress={() => setActiveTab('activity')}
                    activeOpacity={0.7}
                >
                    <Clock
                        size={15}
                        color={(activeTab === 'activity' ? accent.primary : colors.textMuted) as any}
                    />
                    <Text
                        style={[
                            styles.tabLabel,
                            { color: activeTab === 'activity' ? colors.textPrimary : colors.textMuted },
                            activeTab === 'activity' && styles.tabLabelActive,
                        ]}
                    >
                        {language === 'es' ? 'Actividad' : 'Activity'}
                    </Text>
                    {activities.length > 0 && (
                        <View
                            style={[
                                styles.tabCountBadge,
                                {
                                    backgroundColor:
                                        activeTab === 'activity'
                                            ? accent.primary + '18'
                                            : isDark
                                            ? 'rgba(255,255,255,0.06)'
                                            : 'rgba(0,0,0,0.05)',
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.tabCountText,
                                    { color: activeTab === 'activity' ? accent.primary : colors.textMuted },
                                ]}
                            >
                                {activities.length}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
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
                            {/* Configuración de Visibilidad de Integrantes (Solo Dueño) */}
                            {isOwner && (
                                <View style={[styles.visibilityCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderColor: colors.borderSubtle }]}>
                                    <View style={styles.visibilityInfo}>
                                        <View style={styles.visibilityLabelRow}>
                                            {isPublicMembers ? (
                                                <Eye size={15} color={colors.textSecondary as any} />
                                            ) : (
                                                <EyeOff size={15} color={colors.textSecondary as any} />
                                            )}
                                            <Text style={[styles.visibilityTitle, { color: colors.textPrimary }]}>
                                                Visibilidad de integrantes
                                            </Text>
                                            {updatingVisibility && (
                                                <ActivityIndicator size="small" color={accent.primary} style={{ marginLeft: 6 }} />
                                            )}
                                        </View>
                                        <Text style={[styles.visibilitySubtitle, { color: colors.textMuted }]}>
                                            {isPublicMembers
                                                ? 'Todos los participantes pueden ver la lista.'
                                                : 'Lista oculta. Solo tú ves los participantes.'}
                                        </Text>
                                    </View>

                                    <View style={[styles.visibilitySegment, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                                        <TouchableOpacity
                                            style={[
                                                styles.visibilitySegmentItem,
                                                isPublicMembers && [styles.visibilitySegmentItemActive, { backgroundColor: accent.primary }],
                                            ]}
                                            onPress={() => handleToggleVisibility(true)}
                                            disabled={updatingVisibility}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[styles.visibilitySegmentText, { color: isPublicMembers ? '#FFFFFF' : colors.textSecondary }, isPublicMembers && styles.visibilitySegmentTextActive]}>
                                                Pública
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.visibilitySegmentItem,
                                                !isPublicMembers && [styles.visibilitySegmentItemActive, { backgroundColor: accent.primary }],
                                            ]}
                                            onPress={() => handleToggleVisibility(false)}
                                            disabled={updatingVisibility}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[styles.visibilitySegmentText, { color: !isPublicMembers ? '#FFFFFF' : colors.textSecondary }, !isPublicMembers && styles.visibilitySegmentTextActive]}>
                                                Oculta
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            {/* Banner Informativo si es Privado y no es el Dueño */}
                            {!isOwner && !isPublicMembers && (
                                <View
                                    style={[styles.privateNoticeBanner, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: colors.borderSubtle }]}
                                >
                                    <EyeOff size={15} color={accent.primary as any} />
                                    <Text style={[styles.privateNoticeText, { color: colors.textSecondary }]}>
                                        Lista configurada como privada por el creador. Solo tú ves tu propio acceso.
                                    </Text>
                                </View>
                            )}

                            {/* Lista Unificada de Integrantes */}
                            <View style={styles.sectionHeadingRow}>
                                <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                                    {language === 'es' ? 'PERSONAS CON ACCESO' : 'PEOPLE WITH ACCESS'}
                                </Text>
                                <Text style={[styles.sectionHeadingCount, { color: colors.textMuted }]}>
                                    {members.length + 1}
                                </Text>
                            </View>

                            <View style={[styles.unifiedMembersContainer, { borderColor: colors.borderSubtle, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }]}>
                                {/* Fila de Propietario */}
                                <View style={[styles.memberRowItem, members.length > 0 && { borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                                    <View style={[styles.memberAvatar, { backgroundColor: accent.primary + '18' }]}>
                                        <Crown size={15} color={accent.primary as any} />
                                    </View>
                                    <View style={styles.memberInfoCol}>
                                        <Text style={[styles.memberNameText, { color: colors.textPrimary }]} numberOfLines={1}>
                                            {isOwner
                                                ? (useStore.getState().userName || session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Tú')
                                                : (ownerInfo?.name || 'Creador del recurso')}
                                        </Text>
                                        <Text style={[styles.memberSubText, { color: colors.textMuted }]} numberOfLines={1}>
                                            {isOwner
                                                ? (session?.user?.email || 'Tú (Propietario)')
                                                : (ownerInfo?.email || 'Propietario original')}
                                        </Text>
                                    </View>
                                    <View style={[styles.ownerBadge, { backgroundColor: accent.primary + '14', borderColor: accent.primary + '30' }]}>
                                        <Text style={[styles.ownerBadgeText, { color: accent.primary }]}>
                                            Propietario
                                        </Text>
                                    </View>
                                </View>

                                {/* Filas de Miembros Invitados */}
                                {members.map((member, index) => {
                                    const displayName = member.name || member.full_name || (member.email && member.email !== 'Usuario' ? (member.email.includes('@') ? member.email.split('@')[0] : member.email) : 'Colaborador');
                                    const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                                    const initial = capitalizedName[0]?.toUpperCase() || 'U';
                                    const isLast = index === members.length - 1;
                                    const timeJoined = formatDistanceToNow(new Date(member.joined_at), {
                                        addSuffix: true,
                                        locale: dateLocale,
                                    });

                                    return (
                                        <View
                                            key={member.collaboration_id}
                                            style={[
                                                styles.memberRowItem,
                                                !isLast && { borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth },
                                            ]}
                                        >
                                            <View style={[styles.memberAvatar, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                                                <Text style={[styles.memberAvatarInitial, { color: colors.textPrimary }]}>
                                                    {initial}
                                                </Text>
                                            </View>
                                            <View style={styles.memberInfoCol}>
                                                <Text style={[styles.memberNameText, { color: colors.textPrimary }]} numberOfLines={1}>
                                                    {capitalizedName}
                                                </Text>
                                                <Text style={[styles.memberSubText, { color: colors.textMuted }]} numberOfLines={1}>
                                                    {language === 'es' ? `Unido ${timeJoined}` : `Joined ${timeJoined}`}
                                                </Text>
                                            </View>

                                            {isOwner ? (
                                                <View style={styles.memberActionsRow}>
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.roleBadgeBtn,
                                                            {
                                                                backgroundColor:
                                                                    member.role === 'editor'
                                                                        ? accent.primary + '15'
                                                                        : isDark
                                                                        ? 'rgba(255,255,255,0.05)'
                                                                        : 'rgba(0,0,0,0.04)',
                                                                borderColor:
                                                                    member.role === 'editor'
                                                                        ? accent.primary + '35'
                                                                        : colors.borderSubtle,
                                                            },
                                                        ]}
                                                        onPress={() => handleToggleRole(member)}
                                                        activeOpacity={0.7}
                                                    >
                                                        {member.role === 'editor' ? (
                                                            <Shield size={11} color={accent.primary as any} />
                                                        ) : (
                                                            <Users size={11} color={colors.textSecondary as any} />
                                                        )}
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

                                                    <TouchableOpacity
                                                        style={styles.removeMemberBtn}
                                                        onPress={() => handleRemoveMember(member)}
                                                        activeOpacity={0.7}
                                                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                                    >
                                                        <Trash2 size={14} color={colors.textMuted as any} />
                                                    </TouchableOpacity>
                                                </View>
                                            ) : (
                                                <View
                                                    style={[
                                                        styles.roleBadgeBtn,
                                                        {
                                                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                                            borderColor: colors.borderSubtle,
                                                        },
                                                    ]}
                                                >
                                                    <Text style={[styles.roleBadgeText, { color: colors.textSecondary }]}>
                                                        {member.role === 'editor' ? 'Editor' : 'Lector'}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>

                            {/* Botón Invitar (si es dueño) o Abandonar (si es invitado) */}
                            {isOwner ? (
                                <TouchableOpacity
                                    style={[styles.inviteFooterBtn, { borderColor: accent.primary + '40', backgroundColor: accent.primary + '10' }]}
                                    onPress={() => setIsShareModalOpen(true)}
                                    activeOpacity={0.75}
                                >
                                    <Plus size={15} color={accent.primary as any} />
                                    <Text style={[styles.inviteFooterBtnText, { color: accent.primary }]}>
                                        {language === 'es' ? 'Invitar más personas' : 'Invite more people'}
                                    </Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.leaveFooterBtn, { borderColor: semantics.critical.primary + '40' }]}
                                    onPress={handleLeave}
                                    activeOpacity={0.75}
                                >
                                    <LogOut size={14} color={semantics.critical.primary as any} />
                                    <Text style={[styles.leaveFooterBtnText, { color: semantics.critical.primary }]}>
                                        {language === 'es' ? 'Abandonar colaboración' : 'Leave collaboration'}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </>
                    ) : (
                        /* Tab de Historial de Actividad */
                        <>
                            <View style={styles.sectionHeadingRow}>
                                <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                                    {language === 'es' ? 'REGISTRO DE CAMBIOS' : 'ACTIVITY LOG'}
                                </Text>
                                {activities.length > 0 && (
                                    <Text style={[styles.sectionHeadingCount, { color: colors.textMuted }]}>
                                        {activities.length}
                                    </Text>
                                )}
                            </View>

                            {activities.length === 0 ? (
                                <View style={[styles.emptyStateBox, { borderColor: colors.borderSubtle }]}>
                                    <Clock size={22} color={colors.textMuted as any} />
                                    <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
                                        {language === 'es'
                                            ? 'No hay registros de cambios todavía.'
                                            : 'No activity recorded yet.'}
                                    </Text>
                                </View>
                            ) : (
                                <View style={[styles.timelineCard, { borderColor: colors.borderSubtle, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }]}>
                                    {activities.map((act, index) => {
                                        const timeAgo = formatDistanceToNow(new Date(act.created_at), {
                                            addSuffix: true,
                                            locale: dateLocale,
                                        });
                                        const isLast = index === activities.length - 1;
                                        const diffDetail = parseActivityDetail(act.details);

                                        return (
                                            <View
                                                key={act.id || index}
                                                style={[
                                                    styles.timelineRow,
                                                    !isLast && { borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth },
                                                ]}
                                            >
                                                <View style={[styles.actionIconBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                                                    {getActionIcon(act.action, diffDetail)}
                                                </View>

                                                <View style={styles.timelineTextCol}>
                                                    <Text style={[styles.activityText, { color: colors.textPrimary }]}>
                                                        {getActionText(act.action, act.actor_name, act.item_title || undefined, diffDetail)}
                                                    </Text>

                                                    {/* Vista previa de imágenes añadidas */}
                                                    {diffDetail?.imagesAdded && diffDetail.imagesAdded.length > 0 && (
                                                        <View style={styles.imageDiffContainer}>
                                                            <Text style={[styles.imageDiffLabel, { color: semantics.success.primary }]}>
                                                                {diffDetail.imagesAdded.length === 1 ? '+ 1 imagen añadida:' : `+ ${diffDetail.imagesAdded.length} imágenes añadidas:`}
                                                            </Text>
                                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageThumbRow}>
                                                                {diffDetail.imagesAdded.map((uri, imgIdx) => (
                                                                    <View key={`add_${imgIdx}`} style={[styles.imageThumbWrapper, { borderColor: semantics.success.primary + '50' }]}>
                                                                        <RNImage
                                                                            source={{ uri }}
                                                                            style={styles.imageThumb}
                                                                            resizeMode="cover"
                                                                        />
                                                                        <View style={[styles.imageThumbBadge, { backgroundColor: semantics.success.primary }]}>
                                                                            <Plus size={9} color="#FFF" strokeWidth={3} />
                                                                        </View>
                                                                    </View>
                                                                ))}
                                                            </ScrollView>
                                                        </View>
                                                    )}

                                                    {/* Vista previa de imágenes eliminadas */}
                                                    {diffDetail?.imagesRemoved && diffDetail.imagesRemoved.length > 0 && (
                                                        <View style={styles.imageDiffContainer}>
                                                            <Text style={[styles.imageDiffLabel, { color: semantics.critical.primary }]}>
                                                                {diffDetail.imagesRemoved.length === 1 ? '- 1 imagen eliminada:' : `- ${diffDetail.imagesRemoved.length} imágenes eliminadas:`}
                                                            </Text>
                                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageThumbRow}>
                                                                {diffDetail.imagesRemoved.map((uri, imgIdx) => (
                                                                    <View key={`rem_${imgIdx}`} style={[styles.imageThumbWrapper, { borderColor: semantics.critical.primary + '50' }]}>
                                                                        <RNImage
                                                                            source={{ uri }}
                                                                            style={[styles.imageThumb, { opacity: 0.6 }]}
                                                                            resizeMode="cover"
                                                                        />
                                                                        <View style={[styles.imageThumbBadge, { backgroundColor: semantics.critical.primary }]}>
                                                                            <Trash2 size={9} color="#FFF" />
                                                                        </View>
                                                                    </View>
                                                                ))}
                                                            </ScrollView>
                                                        </View>
                                                    )}

                                                    {/* Snippet de texto añadido o editado */}
                                                    {Boolean(diffDetail?.textSnippet) && (
                                                        <View style={[styles.snippetBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: colors.borderSubtle, borderLeftColor: accent.primary }]}>
                                                            <Text style={[styles.snippetText, { color: colors.textSecondary }]} numberOfLines={2}>
                                                                "{diffDetail?.textSnippet}"
                                                            </Text>
                                                        </View>
                                                    )}

                                                    {/* Cambio de título */}
                                                    {Boolean(diffDetail?.titleChanged) && (
                                                        <View style={[styles.snippetBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: colors.borderSubtle, borderLeftColor: '#3B82F6' }]}>
                                                            <Text style={[styles.snippetText, { color: colors.textSecondary }]}>
                                                                {diffDetail?.titleChanged?.from ? `"${diffDetail.titleChanged.from}" → ` : ''}"{diffDetail?.titleChanged?.to}"
                                                            </Text>
                                                        </View>
                                                    )}

                                                    {/* Fallback de texto si details no es JSON estructurado */}
                                                    {Boolean(act.details && !diffDetail) && (
                                                        <Text style={[styles.activityDetails, { color: colors.textMuted }]}>
                                                            {act.details}
                                                        </Text>
                                                    )}

                                                    <Text style={[styles.activityTime, { color: colors.textMuted }]}>
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
        borderBottomWidth: StyleSheet.hairlineWidth,
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
        letterSpacing: -0.2,
    },

    // Tabs Minimalistas
    tabsHeader: {
        flexDirection: 'row',
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 16,
    },
    tabItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 12,
        marginRight: 24,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabItemActive: {},
    tabLabel: {
        fontSize: 14,
        fontWeight: '500',
    },
    tabLabelActive: {
        fontWeight: '700',
    },
    tabCountBadge: {
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 10,
    },
    tabCountText: {
        fontSize: 11,
        fontWeight: '700',
    },

    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
    },

    // Tarjeta de Visibilidad
    visibilityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 16,
        gap: 12,
    },
    visibilityInfo: {
        flex: 1,
    },
    visibilityLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    visibilityTitle: {
        fontSize: 13,
        fontWeight: '600',
    },
    visibilitySubtitle: {
        fontSize: 11,
        marginTop: 2,
        lineHeight: 15,
    },
    visibilitySegment: {
        flexDirection: 'row',
        borderRadius: 8,
        padding: 2,
    },
    visibilitySegmentItem: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    visibilitySegmentItemActive: {},
    visibilitySegmentText: {
        fontSize: 11,
        fontWeight: '500',
    },
    visibilitySegmentTextActive: {
        fontWeight: '700',
    },

    privateNoticeBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
    },
    privateNoticeText: {
        fontSize: 12,
        flex: 1,
        lineHeight: 16,
    },

    // Secciones y títulos
    sectionHeadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        marginTop: 4,
    },
    sectionHeading: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    sectionHeadingCount: {
        fontSize: 11,
        fontWeight: '600',
    },

    // Lista unificada de miembros
    unifiedMembersContainer: {
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden',
        marginBottom: 16,
    },
    memberRowItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 10,
    },
    memberAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    memberAvatarInitial: {
        fontSize: 13,
        fontWeight: '700',
    },
    memberInfoCol: {
        flex: 1,
    },
    memberNameText: {
        fontSize: 13,
        fontWeight: '600',
    },
    memberSubText: {
        fontSize: 11,
        marginTop: 1,
    },
    ownerBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
    },
    ownerBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },

    memberActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    roleBadgeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
    },
    roleBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    removeMemberBtn: {
        padding: 6,
    },

    // Botones de pie
    inviteFooterBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 42,
        borderRadius: 12,
        borderWidth: 1,
        marginTop: 4,
        marginBottom: 20,
    },
    inviteFooterBtnText: {
        fontSize: 13,
        fontWeight: '600',
    },
    leaveFooterBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 42,
        borderRadius: 12,
        borderWidth: 1,
        marginTop: 16,
        marginBottom: 20,
    },
    leaveFooterBtnText: {
        fontSize: 13,
        fontWeight: '600',
    },

    // Estado vacío
    emptyStateBox: {
        paddingVertical: 28,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
    },
    emptyStateText: {
        fontSize: 12,
        textAlign: 'center',
    },

    // Actividad / Timeline
    timelineCard: {
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden',
    },
    timelineRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 12,
        paddingHorizontal: 12,
        gap: 10,
    },
    actionIconBadge: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },
    timelineTextCol: {
        flex: 1,
    },
    activityText: {
        fontSize: 13,
        lineHeight: 18,
    },
    activityDetails: {
        fontSize: 11,
        marginTop: 2,
        lineHeight: 15,
    },
    activityTime: {
        fontSize: 11,
        marginTop: 3,
    },
    imageDiffContainer: {
        marginTop: 6,
        marginBottom: 2,
    },
    imageDiffLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.4,
        marginBottom: 5,
        textTransform: 'uppercase',
    },
    imageThumbRow: {
        flexDirection: 'row',
        gap: 8,
    },
    imageThumbWrapper: {
        width: 52,
        height: 52,
        borderRadius: 10,
        borderWidth: 1.5,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: 'rgba(128,128,128,0.08)',
    },
    imageThumb: {
        width: '100%',
        height: '100%',
    },
    imageThumbBadge: {
        position: 'absolute',
        bottom: 3,
        right: 3,
        width: 16,
        height: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    snippetBox: {
        marginTop: 6,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 8,
        borderWidth: 1,
        borderLeftWidth: 3,
    },
    snippetText: {
        fontSize: 11,
        fontStyle: 'italic',
        lineHeight: 15,
    },
});
