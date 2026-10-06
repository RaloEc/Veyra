import React, { useState, useEffect, useCallback } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Share,
    ScrollView,
} from 'react-native';
import {
    X,
    Share2,
    Users,
    Trash2,
    Shield,
    Check,
    LogOut,
    Copy,
    Eye,
    EyeOff,
    Clock,
    ChevronRight,
    Calendar,
} from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';

import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';
import { VeyraButton } from '../ui/VeyraButton';
import { VeyraIconButton } from '../ui/VeyraIconButton';
import { CollaborationService } from '../../services/collaborationService';
import { CollabTargetType, CollabRole, CollaboratorMember } from '../../types/db';
import { useStore } from '../../store/useStore';
import { ActivityHistoryModal } from './ActivityHistoryModal';

interface ShareModalProps {
    visible: boolean;
    onClose: () => void;
    targetType: CollabTargetType;
    targetId: string;
    targetTitle: string;
    isOwner?: boolean;
    onUpdated?: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
    visible,
    onClose,
    targetType,
    targetId,
    targetTitle,
    isOwner = true,
    onUpdated,
}) => {
    const router = useRouter();
    const { colors, accent, semantics, isDark } = useVeyraTheme();
    const session = useStore((state) => state.session);

    const [selectedRole, setSelectedRole] = useState<CollabRole>('editor');
    const [loading, setLoading] = useState(false);
    const [generatingLink, setGeneratingLink] = useState(false);
    const [collaborators, setCollaborators] = useState<CollaboratorMember[]>([]);
    const [isPublicMembers, setIsPublicMembers] = useState(true);
    const [updatingVisibility, setUpdatingVisibility] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const isEvent = targetType === 'event';

    const loadCollaborators = useCallback(async () => {
        if (!targetId || isEvent) return;
        setLoading(true);
        try {
            const [list, isPublic] = await Promise.all([
                CollaborationService.getCollaborators(targetType, targetId),
                CollaborationService.getMembersVisibility(targetType, targetId),
            ]);
            setCollaborators(list);
            setIsPublicMembers(isPublic);
        } catch (e) {
            console.warn('[ShareModal] Error loading collaborators:', e);
        } finally {
            setLoading(false);
        }
    }, [targetType, targetId, isEvent]);

    const handleToggleVisibility = async (makePublic: boolean) => {
        if (updatingVisibility || makePublic === isPublicMembers) return;
        setUpdatingVisibility(true);
        try {
            const success = await CollaborationService.setMembersVisibility(
                targetType,
                targetId,
                makePublic
            );
            if (success) {
                setIsPublicMembers(makePublic);
            } else {
                Alert.alert('Error', 'No se pudo actualizar la visibilidad.');
            }
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'Error al cambiar visibilidad.');
        } finally {
            setUpdatingVisibility(false);
        }
    };

    useEffect(() => {
        if (visible) {
            loadCollaborators();
            setLastInviteUrl(null);
            setCopied(false);
        }
    }, [visible, loadCollaborators]);

    const handleCreateShare = async () => {
        if (!session?.user?.id) {
            Alert.alert('Sesión requerida', 'Debes iniciar sesión para invitar a otros usuarios.');
            return;
        }

        setGeneratingLink(true);
        try {
            const role = isEvent ? 'viewer' : selectedRole;
            const { inviteUrl, deepLink } = await CollaborationService.createInvitation(
                targetType,
                targetId,
                targetTitle,
                role
            );

            setLastInviteUrl(inviteUrl);

            // Abrir menú nativo de compartir
            const shareMessage = isEvent
                ? `📅 Te comparto el evento "${targetTitle}" en Veyra. Ábrelo para agregarlo a tu calendario:\n\n${inviteUrl}`
                : `¡Hola! Te invito a colaborar en "${targetTitle}" en Veyra:\n\n${inviteUrl}`;

            await Share.share({
                title: isEvent ? `Evento: ${targetTitle}` : `Colaborar en ${targetTitle}`,
                message: shareMessage,
                url: inviteUrl,
            });

            if (onUpdated) onUpdated();
        } catch (error: any) {
            Alert.alert('Error', error.message || 'No se pudo crear la invitación.');
        } finally {
            setGeneratingLink(false);
        }
    };

    const handleLeaveEvent = () => {
        Alert.alert(
            'Eliminar de mi calendario',
            '¿Deseas dejar de sincronizar y eliminar este evento compartido de tu calendario?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await CollaborationService.leaveCollaboration(targetType, targetId);
                            onClose();
                            if (onUpdated) onUpdated();
                        } catch (e: any) {
                            Alert.alert('Error', e.message || 'No se pudo eliminar el evento');
                        }
                    },
                },
            ]
        );
    };

    const handleRevoke = (collaborationId: string, memberEmail?: string) => {
        Alert.alert(
            'Revocar acceso',
            `¿Estás seguro de que deseas eliminar a ${memberEmail || 'este usuario'}? Perderá acceso a este elemento.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Revocar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await CollaborationService.revokeAccess(collaborationId);
                            await loadCollaborators();
                            if (onUpdated) onUpdated();
                        } catch (e: any) {
                            Alert.alert('Error', e.message || 'No se pudo revocar el acceso');
                        }
                    },
                },
            ]
        );
    };

    const handleLeave = () => {
        Alert.alert(
            'Abandonar recurso',
            '¿Deseas dejar de colaborar en este recurso compartido?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Abandonar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await CollaborationService.leaveCollaboration(targetType, targetId);
                            onClose();
                            if (onUpdated) onUpdated();
                        } catch (e: any) {
                            Alert.alert('Error', e.message || 'No se pudo abandonar');
                        }
                    },
                },
            ]
        );
    };

    const getTargetTypeName = () => {
        switch (targetType) {
            case 'folder':
                return 'Carpeta';
            case 'reminder':
                return 'Recordatorio';
            case 'note':
                return 'Nota';
            case 'event':
                return 'Evento';
            default:
                return 'Elemento';
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
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                                Compartir {getTargetTypeName()}
                            </Text>
                            <Text
                                style={[styles.targetTitle, { color: colors.textSecondary }]}
                                numberOfLines={1}
                            >
                                {targetTitle || 'Sin título'}
                            </Text>
                        </View>
                        <VeyraIconButton
                            icon={<X size={20} color={colors.textSecondary as any} />}
                            onPress={onClose}
                            accessibilityLabel="Cerrar"
                        />
                    </View>

                    <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
                        {isEvent ? (
                            isOwner ? (
                                <View style={styles.eventShareCard}>
                                    <View style={[styles.eventIconWrap, { backgroundColor: accent.primary + '18' }]}>
                                        <Calendar size={28} color={accent.primary as any} />
                                    </View>

                                    <Text style={[styles.eventTitle, { color: colors.textPrimary }]}>
                                        Compartir este evento
                                    </Text>

                                    <Text style={[styles.eventDescription, { color: colors.textSecondary }]}>
                                        Cualquier persona con el enlace podrá ver los detalles y añadir este evento a su calendario de Veyra.
                                    </Text>

                                    <View style={[styles.eventFeatureList, { backgroundColor: colors.surfaceElevated }]}>
                                        <View style={styles.eventFeatureItem}>
                                            <Shield size={16} color={accent.primary as any} />
                                            <Text style={[styles.eventFeatureText, { color: colors.textSecondary }]}>
                                                <Text style={{ fontWeight: '600', color: colors.textPrimary }}>Solo lectura:</Text> Los invitados pueden ver la cita sin modificar tu evento original.
                                            </Text>
                                        </View>

                                        <View style={styles.eventFeatureItem}>
                                            <Clock size={16} color={accent.primary as any} />
                                            <Text style={[styles.eventFeatureText, { color: colors.textSecondary }]}>
                                                <Text style={{ fontWeight: '600', color: colors.textPrimary }}>Sincronizado:</Text> Si cambias la fecha u horario, se actualizará en sus calendarios automáticamente.
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={{ marginTop: 20, width: '100%' }}>
                                        <VeyraButton
                                            label={generatingLink ? 'Preparando enlace...' : 'Compartir enlace del evento'}
                                            variant="primary"
                                            loading={generatingLink}
                                            iconLeft={<Share2 size={18} color="#FFFFFF" />}
                                            onPress={handleCreateShare}
                                        />
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.eventShareCard}>
                                    <View style={[styles.eventIconWrap, { backgroundColor: accent.primary + '18' }]}>
                                        <Calendar size={28} color={accent.primary as any} />
                                    </View>

                                    <Text style={[styles.eventTitle, { color: colors.textPrimary }]}>
                                        Evento sincronizado
                                    </Text>

                                    <Text style={[styles.eventDescription, { color: colors.textSecondary }]}>
                                        Este evento está agregado a tu calendario desde una invitación y se mantiene sincronizado con los cambios del organizador.
                                    </Text>

                                    <View style={{ marginTop: 24, width: '100%' }}>
                                        <TouchableOpacity
                                            style={[styles.leaveBtn, { borderColor: semantics.critical.primary, justifyContent: 'center' }]}
                                            onPress={handleLeaveEvent}
                                        >
                                            <Trash2 size={16} color={semantics.critical.primary as any} />
                                            <Text style={[styles.leaveBtnText, { color: semantics.critical.primary }]}>
                                                Eliminar de mi calendario
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )
                        ) : (
                            <>
                                {isOwner ? (
                                    <>
                                        {/* Selector de Rol para nuevas invitaciones */}
                                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                                            Permiso para invitados
                                        </Text>
                                        <View style={styles.roleSelector}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.roleOption,
                                                    {
                                                        backgroundColor:
                                                            selectedRole === 'editor'
                                                                ? accent.primary + '20'
                                                                : colors.surfaceElevated,
                                                        borderColor:
                                                            selectedRole === 'editor'
                                                                ? accent.primary
                                                                : 'transparent',
                                                        borderWidth: 1,
                                                    },
                                                ]}
                                                onPress={() => setSelectedRole('editor')}
                                            >
                                                <Shield
                                                    size={16}
                                                    color={
                                                        selectedRole === 'editor'
                                                            ? (accent.primary as any)
                                                            : (colors.textSecondary as any)
                                                    }
                                                />
                                                <Text
                                                    style={[
                                                        styles.roleOptionText,
                                                        {
                                                            color:
                                                                selectedRole === 'editor'
                                                                    ? accent.primary
                                                                    : colors.textPrimary,
                                                            fontWeight:
                                                                selectedRole === 'editor' ? '700' : '500',
                                                        },
                                                    ]}
                                                >
                                                    Editor (Modificar)
                                                </Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[
                                                    styles.roleOption,
                                                    {
                                                        backgroundColor:
                                                            selectedRole === 'viewer'
                                                                ? accent.primary + '20'
                                                                : colors.surfaceElevated,
                                                        borderColor:
                                                            selectedRole === 'viewer'
                                                                ? accent.primary
                                                                : 'transparent',
                                                        borderWidth: 1,
                                                    },
                                                ]}
                                                onPress={() => setSelectedRole('viewer')}
                                            >
                                                <Users
                                                    size={16}
                                                    color={
                                                        selectedRole === 'viewer'
                                                            ? (accent.primary as any)
                                                            : (colors.textSecondary as any)
                                                    }
                                                />
                                                <Text
                                                    style={[
                                                        styles.roleOptionText,
                                                        {
                                                            color:
                                                                selectedRole === 'viewer'
                                                                    ? accent.primary
                                                                    : colors.textPrimary,
                                                            fontWeight:
                                                                selectedRole === 'viewer' ? '700' : '500',
                                                        },
                                                    ]}
                                                >
                                                    Lector (Solo ver)
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        {/* Selector de Visibilidad de Colaboradores */}
                                        <View style={{ marginBottom: 16 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0, marginTop: 0 }]}>
                                                    Visibilidad de integrantes
                                                </Text>
                                                {updatingVisibility && (
                                                    <ActivityIndicator size="small" color={accent.primary} />
                                                )}
                                            </View>
                                            <View style={styles.roleSelector}>
                                                <TouchableOpacity
                                                    style={[
                                                        styles.roleOption,
                                                        {
                                                            backgroundColor:
                                                                isPublicMembers
                                                                    ? accent.primary + '20'
                                                                    : colors.surfaceElevated,
                                                            borderColor:
                                                                isPublicMembers
                                                                    ? accent.primary
                                                                    : 'transparent',
                                                            borderWidth: 1,
                                                        },
                                                    ]}
                                                    onPress={() => handleToggleVisibility(true)}
                                                >
                                                    <Eye
                                                        size={16}
                                                        color={
                                                            isPublicMembers
                                                                ? (accent.primary as any)
                                                                : (colors.textSecondary as any)
                                                        }
                                                    />
                                                    <Text
                                                        style={[
                                                            styles.roleOptionText,
                                                            {
                                                                color:
                                                                    isPublicMembers
                                                                        ? accent.primary
                                                                        : colors.textPrimary,
                                                            fontWeight:
                                                                isPublicMembers ? '700' : '500',
                                                        },
                                                    ]}
                                                >
                                                    Públicos
                                                </Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[
                                                    styles.roleOption,
                                                    {
                                                        backgroundColor:
                                                            !isPublicMembers
                                                                ? accent.primary + '20'
                                                                : colors.surfaceElevated,
                                                        borderColor:
                                                            !isPublicMembers
                                                                ? accent.primary
                                                                : 'transparent',
                                                        borderWidth: 1,
                                                    },
                                                ]}
                                                onPress={() => handleToggleVisibility(false)}
                                            >
                                                <EyeOff
                                                    size={16}
                                                    color={
                                                        !isPublicMembers
                                                            ? (accent.primary as any)
                                                            : (colors.textSecondary as any)
                                                    }
                                                />
                                                <Text
                                                    style={[
                                                        styles.roleOptionText,
                                                        {
                                                            color:
                                                                !isPublicMembers
                                                                    ? accent.primary
                                                                    : colors.textPrimary,
                                                            fontWeight:
                                                                !isPublicMembers ? '700' : '500',
                                                        },
                                                    ]}
                                                >
                                                    Privados
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: -8, marginBottom: 12 }}>
                                            {isPublicMembers
                                                ? 'Todos los colaboradores podrán ver la lista de miembros.'
                                                : 'Solo tú verás los miembros. Los colaboradores no sabrán quién más participa.'}
                                        </Text>
                                    </View>

                                    {/* Botón Generar enlace y compartir */}
                                    <View style={styles.shareBtnWrapper}>
                                        <VeyraButton
                                            label={generatingLink ? 'Generando...' : 'Invitar personas'}
                                            variant="primary"
                                            loading={generatingLink}
                                            iconLeft={<Share2 size={18} color="#FFFFFF" />}
                                            onPress={handleCreateShare}
                                        />
                                    </View>
                                </>
                            ) : (
                                <View style={styles.memberNotice}>
                                    <Text style={[styles.memberNoticeText, { color: colors.textSecondary }]}>
                                        Estás colaborando como invitado en este elemento.
                                    </Text>
                                    {!isPublicMembers && (
                                        <View
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                gap: 8,
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                                paddingVertical: 8,
                                                paddingHorizontal: 12,
                                                borderRadius: 12,
                                                marginBottom: 12,
                                                width: '100%',
                                            }}
                                        >
                                            <EyeOff size={15} color={colors.textSecondary as any} />
                                            <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }}>
                                                Lista de integrantes privada por el creador. Solo tú ves tu propio acceso.
                                            </Text>
                                        </View>
                                    )}
                                    <TouchableOpacity
                                        style={[styles.leaveBtn, { borderColor: semantics.critical.primary }]}
                                        onPress={handleLeave}
                                    >
                                        <LogOut size={16} color={semantics.critical.primary as any} />
                                        <Text style={[styles.leaveBtnText, { color: semantics.critical.primary }]}>
                                            Abandonar recurso
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* Lista de Colaboradores */}
                            <View style={styles.collaboratorsSection}>
                                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                                    Personas con acceso ({collaborators.length})
                                </Text>

                                {loading ? (
                                    <ActivityIndicator
                                        size="small"
                                        color={accent.primary}
                                        style={{ marginVertical: 12 }}
                                    />
                                ) : collaborators.length === 0 ? (
                                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                        Aún no hay colaboradores invitados. Comparte un enlace para empezar.
                                    </Text>
                                ) : (
                                    collaborators.map((member) => {
                                        const initial = (member.email?.[0] || 'U').toUpperCase();
                                        return (
                                            <View
                                                key={member.collaboration_id}
                                                style={[
                                                    styles.memberRow,
                                                    { backgroundColor: colors.surfaceElevated },
                                                ]}
                                            >
                                                <View
                                                    style={[
                                                        styles.memberAvatar,
                                                        { backgroundColor: accent.primary },
                                                    ]}
                                                >
                                                    <Text style={styles.memberAvatarText}>
                                                        {initial}
                                                    </Text>
                                                </View>

                                                <View style={styles.memberInfo}>
                                                    <Text
                                                        style={[styles.memberEmail, { color: colors.textPrimary }]}
                                                        numberOfLines={1}
                                                    >
                                                        {member.email || 'Usuario de Veyra'}
                                                    </Text>
                                                    <Text style={[styles.memberRole, { color: colors.textSecondary }]}>
                                                        {member.role === 'editor' ? 'Editor' : 'Lector'}
                                                    </Text>
                                                </View>

                                                {isOwner && (
                                                    <TouchableOpacity
                                                        onPress={() =>
                                                            handleRevoke(member.collaboration_id, member.email)
                                                        }
                                                        style={styles.revokeBtn}
                                                    >
                                                        <Trash2
                                                            size={16}
                                                            color={semantics.critical.primary as any}
                                                        />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        );
                                    })
                                )}

                                {/* Botón rápido para abrir Historial de Actividad */}
                                <TouchableOpacity
                                    style={[
                                        styles.manageFullBtn,
                                        {
                                            borderColor: accent.primary + '50',
                                            backgroundColor: accent.primary + '15',
                                            marginTop: 14,
                                        },
                                    ]}
                                    onPress={() => setShowHistoryModal(true)}
                                >
                                    <Clock size={16} color={accent.primary as any} />
                                    <Text style={[styles.manageFullBtnText, { color: accent.primary, fontWeight: '700' }]}>
                                        Ver historial de cambios
                                    </Text>
                                    <ChevronRight size={15} color={accent.primary as any} />
                                </TouchableOpacity>

                                {/* Botón para ver pantalla completa de Gestión e Historial */}
                                <TouchableOpacity
                                    style={[
                                        styles.manageFullBtn,
                                        {
                                            borderColor: colors.borderSubtle,
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                                            marginTop: 8,
                                        },
                                    ]}
                                    onPress={() => {
                                        onClose();
                                        router.push({
                                            pathname: '/collab/[id]',
                                            params: {
                                                id: targetId,
                                                targetType,
                                                targetTitle,
                                            },
                                        });
                                    }}
                                >
                                    <Users size={15} color={colors.textSecondary as any} />
                                    <Text style={[styles.manageFullBtnText, { color: colors.textPrimary }]}>
                                        Administración completa de miembros
                                    </Text>
                                    <ChevronRight size={15} color={colors.textMuted as any} />
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </ScrollView>
            </VeyraSurface>
        </View>

        {/* Modal de Historial de Cambios */}
        {!isEvent && (
            <ActivityHistoryModal
                visible={showHistoryModal}
                onClose={() => setShowHistoryModal(false)}
                targetType={targetType}
                targetId={targetId}
                targetTitle={targetTitle}
            />
        )}
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
        maxHeight: '85%',
        borderRadius: 24,
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    targetTitle: {
        fontSize: 13,
        marginTop: 2,
    },
    scrollBody: {
        maxHeight: 460,
    },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 10,
        marginTop: 6,
    },
    roleSelector: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 16,
    },
    roleOption: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
    },
    roleOptionText: {
        fontSize: 13,
    },
    shareBtnWrapper: {
        marginBottom: 20,
    },
    memberNotice: {
        paddingVertical: 12,
        alignItems: 'center',
        marginBottom: 16,
    },
    memberNoticeText: {
        fontSize: 14,
        marginBottom: 12,
        textAlign: 'center',
    },
    leaveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    leaveBtnText: {
        fontSize: 13,
        fontWeight: '600',
    },
    collaboratorsSection: {
        marginTop: 6,
    },
    emptyText: {
        fontSize: 13,
        lineHeight: 18,
        paddingVertical: 8,
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderRadius: 14,
        marginBottom: 8,
    },
    memberAvatar: {
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
    },
    memberAvatarText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    memberInfo: {
        flex: 1,
        marginLeft: 12,
        marginRight: 8,
    },
    memberEmail: {
        fontSize: 13,
        fontWeight: '600',
    },
    memberRole: {
        fontSize: 11,
        marginTop: 2,
    },
    revokeBtn: {
        padding: 8,
    },
    manageFullBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        marginTop: 16,
    },
    manageFullBtnText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
    },
    eventShareCard: {
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 4,
    },
    eventIconWrap: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    eventTitle: {
        fontSize: 17,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 6,
    },
    eventDescription: {
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center',
        marginBottom: 16,
    },
    eventFeatureList: {
        width: '100%',
        borderRadius: 14,
        padding: 12,
        gap: 10,
    },
    eventFeatureItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    eventFeatureText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 17,
    },
});
