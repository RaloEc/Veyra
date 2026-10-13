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
    Clipboard,
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
    FileText,
    Folder,
    CheckSquare,
} from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';

import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';
import { VeyraButton } from '../ui/VeyraButton';
import { VeyraIconButton } from '../ui/VeyraIconButton';
import { CollaborationService } from '../../services/collaborationService';
import { CollabTargetType, CollabRole, CollaboratorMember } from '../../types/db';
import { useStore } from '../../store/useStore';
import { supabase } from '../../lib/supabase';
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

    const [actualIsOwner, setActualIsOwner] = useState(isOwner);
    useEffect(() => {
        setActualIsOwner(isOwner);
    }, [isOwner]);

    const [selectedRole, setSelectedRole] = useState<CollabRole>(targetType === 'reminder' ? 'viewer' : 'editor');
    const [updatingRole, setUpdatingRole] = useState(false);
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
            const [list, isPublic, guestRole, perms] = await Promise.all([
                CollaborationService.getCollaborators(targetType, targetId),
                CollaborationService.getMembersVisibility(targetType, targetId),
                CollaborationService.getGuestPermission(targetType, targetId),
                CollaborationService.getUserPermission(targetType, targetId),
            ]);
            setCollaborators(list);
            setIsPublicMembers(isPublic);
            if (guestRole) setSelectedRole(guestRole);
            if (perms) setActualIsOwner(perms.isOwner);
        } catch (e) {
            console.warn('[ShareModal] Error loading collaborators:', e);
        } finally {
            setLoading(false);
        }
    }, [targetType, targetId, isEvent]);

    const handleSharePlainText = async () => {
        try {
            let plainText = '';
            if (targetType === 'note') {
                const { useNotesStore } = await import('../../store/useNotesStore');
                const { extractPlainTextFromPages } = await import('../../utils/pageUtils');
                const note = useNotesStore.getState().notes.find(n => n.id === targetId);
                if (note) {
                    const plain = extractPlainTextFromPages(note.content);
                    plainText = `${note.title || 'Sin título'}\n\n${plain}`;
                }
            }
            if (plainText) {
                await Share.share({
                    title: targetTitle || 'Notas de Veyra',
                    message: plainText,
                });
            }
        } catch (e) {
            console.warn('[ShareModal] Error sharing plain text:', e);
        }
    };

    const handleSelectRole = async (newRole: CollabRole) => {
        if (updatingRole || newRole === selectedRole) return;
        setSelectedRole(newRole);
        setUpdatingRole(true);
        try {
            const success = await CollaborationService.setGuestPermission(targetType, targetId, newRole);
            if (success) {
                setCollaborators(prev => prev.map(m => ({ ...m, role: newRole })));
                if (onUpdated) onUpdated();
            } else {
                Alert.alert('Error', 'No se pudo actualizar el permiso para invitados.');
            }
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'Error al cambiar el permiso para invitados.');
        } finally {
            setUpdatingRole(false);
        }
    };

    const handleToggleMemberRole = async (member: CollaboratorMember) => {
        if (!actualIsOwner || updatingRole) return;
        const newRole: CollabRole = member.role === 'editor' ? 'viewer' : 'editor';
        setUpdatingRole(true);
        try {
            await CollaborationService.updateRole(member.collaboration_id, newRole, {
                targetType,
                targetId,
                memberId: member.member_id,
            });
            setCollaborators(prev =>
                prev.map(m =>
                    m.collaboration_id === member.collaboration_id ? { ...m, role: newRole } : m
                )
            );
            if (onUpdated) onUpdated();
        } catch (err: any) {
            console.warn('[ShareModal] Error updating member role:', err);
            Alert.alert('Error', err?.message || 'No se pudo actualizar el rol del miembro.');
        } finally {
            setUpdatingRole(false);
        }
    };

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
            if (session?.user?.id) {
                CollaborationService.ensureActorIdentity(targetType, targetId, targetTitle, isOwner).catch(() => {});
            }
        }
    }, [visible, isOwner, targetType, targetId, targetTitle, session?.user?.id, loadCollaborators]);

    // Suscripción en tiempo real a cambios de roles, miembros o visibilidad mientras el modal está abierto
    useEffect(() => {
        if (!visible || !targetId || isEvent) return;

        const channel = supabase
            .channel(`share_modal_live_${targetId}`)
            .on('broadcast', { event: 'LIVE_NOTE_CHANGE' }, ({ payload }) => {
                if (!payload) return;
                if (payload.changeType === 'PERMISSIONS_UPDATE') {
                    if (typeof payload.isPublicMembers === 'boolean') {
                        setIsPublicMembers(payload.isPublicMembers);
                    }
                    loadCollaborators();
                }
            })
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'collaborations',
                    filter: `target_id=eq.${targetId}`,
                },
                () => {
                    loadCollaborators();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel).catch(() => {});
        };
    }, [visible, targetId, isEvent, loadCollaborators]);

    const handleCreateShare = async () => {
        if (!session?.user?.id) {
            Alert.alert('Sesión requerida', 'Debes iniciar sesión para invitar a otros usuarios.');
            return;
        }

        setGeneratingLink(true);
        try {
            // Asegurar que el elemento exista en Supabase antes de generar la invitación colaborativa
            try {
                const { getDB } = await import('../../db');
                const { supabase } = await import('../../lib/supabase');
                const { SyncService } = await import('../../services/syncService');
                const db = await getDB();
                const userId = session.user.id;

                if (targetType === 'event') {
                    const localEvent = await db.getFirstAsync<any>('SELECT * FROM events WHERE id = ?', [targetId]);
                    if (localEvent) {
                        const remote = SyncService.localEventToRemote(localEvent, userId);
                        await supabase.from('events').upsert(remote, { onConflict: 'id' });
                    }
                } else if (targetType === 'note') {
                    const localNote = await db.getFirstAsync<any>('SELECT * FROM notes WHERE id = ?', [targetId]);
                    if (localNote) {
                        await db.runAsync('UPDATE notes SET is_shared = 1 WHERE id = ?', [targetId]);
                        const { useNotesStore } = await import('../../store/useNotesStore');
                        useNotesStore.setState(state => ({
                            notes: state.notes.map(n => n.id === targetId ? { ...n, is_shared: 1 } : n)
                        }));
                        const remote = SyncService.localNoteToRemote({ ...localNote, is_shared: 1 }, userId);
                        await supabase.from('notes').upsert(remote, { onConflict: 'id' });
                    }
                } else if (targetType === 'reminder') {
                    const localReminder = await db.getFirstAsync<any>('SELECT * FROM reminders WHERE id = ?', [targetId]);
                    if (localReminder) {
                        const remote = SyncService.localReminderToRemote(localReminder, userId);
                        await supabase.from('reminders').upsert(remote, { onConflict: 'id' });
                    }
                } else if (targetType === 'folder') {
                    const localFolder = await db.getFirstAsync<any>('SELECT * FROM folders WHERE id = ?', [targetId]);
                    if (localFolder) {
                        await db.runAsync('UPDATE folders SET is_shared = 1 WHERE id = ?', [targetId]);
                        const { useFoldersStore } = await import('../../store/useFoldersStore');
                        useFoldersStore.setState(state => ({
                            folders: state.folders.map(f => f.id === targetId ? { ...f, is_shared: 1 } : f)
                        }));
                        const remote = SyncService.localFolderToRemote({ ...localFolder, is_shared: 1 }, userId);
                        await supabase.from('folders').upsert(remote, { onConflict: 'id' });

                        // Subir y marcar como compartidas todas las notas pertenecientes a esta carpeta
                        const folderNotes = await db.getAllAsync<any>('SELECT * FROM notes WHERE folder_id = ? AND deleted = 0', [targetId]);
                        if (folderNotes && folderNotes.length > 0) {
                            await db.runAsync('UPDATE notes SET is_shared = 1 WHERE folder_id = ? AND deleted = 0', [targetId]);
                            const { useNotesStore } = await import('../../store/useNotesStore');
                            useNotesStore.setState(state => ({
                                notes: state.notes.map(n => n.folder_id === targetId ? { ...n, is_shared: 1 } : n)
                            }));
                            const remoteNotes = folderNotes.map(n => SyncService.localNoteToRemote({ ...n, is_shared: 1 }, userId));
                            await supabase.from('notes').upsert(remoteNotes, { onConflict: 'id' });
                        }
                    }
                }
            } catch (preSyncErr) {
                console.warn('[ShareModal] Error al pre-sincronizar en Supabase:', preSyncErr);
            }

            const role = isEvent ? 'viewer' : selectedRole;
            const { invitation, inviteUrl, deepLink } = await CollaborationService.createInvitation(
                targetType,
                targetId,
                targetTitle,
                role
            );

            setLastInviteUrl(inviteUrl);

            // Abrir menú nativo de compartir con enlace y código
            const shareMessage = isEvent
                ? `📅 Te comparto el evento "${targetTitle}" en Veyra.\n\n🔑 Código de invitación: ${invitation.invite_code}\n(Pégalo en Veyra > Unirse con código)\n\n👉 O abre directamente:\n${inviteUrl}`
                : `¡Hola! Te invito a colaborar en "${targetTitle}" en Veyra.\n\n🔑 Código de invitación: ${invitation.invite_code}\n(Pégalo en Veyra > Unirse con código)\n\n👉 O abre directamente:\n${inviteUrl}`;

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

    const handleCopyLink = async () => {
        try {
            let urlToCopy = lastInviteUrl;
            if (!urlToCopy) {
                setGeneratingLink(true);
                const role = isEvent ? 'viewer' : selectedRole;
                const { inviteUrl } = await CollaborationService.createInvitation(
                    targetType,
                    targetId,
                    targetTitle,
                    role
                );
                urlToCopy = inviteUrl;
                setLastInviteUrl(inviteUrl);
            }
            Clipboard.setString(urlToCopy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e: any) {
            console.warn('[ShareModal] Error copying to clipboard:', e);
            Alert.alert('Error', e.message || 'No se pudo copiar el enlace.');
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
                <VeyraSurface style={[styles.modalCard, { borderColor: colors.borderSubtle }]}>
                    {/* Header Minimalista y Pulido */}
                    <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
                        <View style={styles.headerLeft}>
                            {/* Icon Squircle Badge */}
                            <View
                                style={[
                                    styles.headerIconSquircle,
                                    {
                                        backgroundColor: `${accent.primary}15`,
                                        borderColor: `${accent.primary}28`,
                                    },
                                ]}
                            >
                                {targetType === 'note' ? (
                                    <FileText size={20} color={accent.primary as any} strokeWidth={2.2} />
                                ) : targetType === 'folder' ? (
                                    <Folder size={20} color={accent.primary as any} strokeWidth={2.2} />
                                ) : targetType === 'reminder' ? (
                                    <CheckSquare size={20} color={accent.primary as any} strokeWidth={2.2} />
                                ) : (
                                    <Calendar size={20} color={accent.primary as any} strokeWidth={2.2} />
                                )}
                            </View>

                            {/* Título & Subtítulo con Contexto */}
                            <View style={styles.headerTitleBox}>
                                <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                                    Compartir {getTargetTypeName()}
                                </Text>
                                <View style={styles.headerSubtitleRow}>
                                    <Text
                                        style={[styles.targetTitleText, { color: colors.textSecondary }]}
                                        numberOfLines={1}
                                    >
                                        {targetTitle || 'Sin título'}
                                    </Text>
                                    <View style={[styles.dotSeparator, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)' }]} />
                                    <View style={styles.roleBadgeRow}>
                                        <Shield size={11} color={(actualIsOwner ? accent.primary : colors.textMuted) as any} />
                                        <Text
                                            style={[
                                                styles.roleBadgeText,
                                                { color: actualIsOwner ? accent.primary : colors.textMuted },
                                            ]}
                                        >
                                            {actualIsOwner ? 'Propietario' : 'Invitado'}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Botón de Cerrar */}
                        <TouchableOpacity
                            style={[
                                styles.closeButton,
                                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' },
                            ]}
                            onPress={onClose}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <X size={16} color={colors.textSecondary as any} strokeWidth={2.4} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
                        {isEvent ? (
                            isOwner ? (
                                <View style={styles.eventShareCard}>
                                    <View style={[styles.eventIconWrap, { backgroundColor: accent.primary + '16' }]}>
                                        <Calendar size={24} color={accent.primary as any} />
                                    </View>

                                    <Text style={[styles.eventTitle, { color: colors.textPrimary }]}>
                                        Compartir este evento
                                    </Text>
                                    <Text style={[styles.eventDescription, { color: colors.textSecondary }]}>
                                        Los invitados podrán añadir este evento a su calendario y mantenerse sincronizados.
                                    </Text>

                                    <View style={{ width: '100%', marginTop: 8 }}>
                                        <VeyraButton
                                            label={generatingLink ? 'Preparando enlace...' : 'Compartir evento'}
                                            variant="primary"
                                            loading={generatingLink}
                                            iconLeft={<Share2 size={16} color="#FFFFFF" />}
                                            onPress={handleCreateShare}
                                        />
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.eventShareCard}>
                                    <View style={[styles.eventIconWrap, { backgroundColor: accent.primary + '16' }]}>
                                        <Calendar size={24} color={accent.primary as any} />
                                    </View>

                                    <Text style={[styles.eventTitle, { color: colors.textPrimary }]}>
                                        Evento sincronizado
                                    </Text>
                                    <Text style={[styles.eventDescription, { color: colors.textSecondary }]}>
                                        Este evento se mantiene sincronizado con el calendario del organizador.
                                    </Text>

                                    <TouchableOpacity
                                        style={[styles.minimalLeaveBtn, { borderColor: semantics.critical.primary }]}
                                        onPress={handleLeaveEvent}
                                        activeOpacity={0.7}
                                    >
                                        <Trash2 size={14} color={semantics.critical.primary as any} />
                                        <Text style={[styles.minimalLeaveBtnText, { color: semantics.critical.primary }]}>
                                            Eliminar de mi calendario
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )
                        ) : (
                            <>
                                {actualIsOwner ? (
                                    <>
                                        {/* Acciones principales: Compartir & Copiar Enlace */}
                                        <View style={styles.actionSection}>
                                            <TouchableOpacity
                                                style={[styles.primaryShareBtn, { backgroundColor: accent.primary }]}
                                                onPress={handleCreateShare}
                                                disabled={generatingLink}
                                                activeOpacity={0.85}
                                            >
                                                {generatingLink ? (
                                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                                ) : (
                                                    <>
                                                        <Share2 size={15} color="#FFFFFF" />
                                                        <Text style={styles.primaryShareBtnText}>Compartir invitación</Text>
                                                    </>
                                                )}
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[
                                                    styles.copyLinkBtn,
                                                    {
                                                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                                        borderColor: colors.borderSubtle,
                                                    },
                                                ]}
                                                onPress={handleCopyLink}
                                                disabled={generatingLink}
                                                activeOpacity={0.7}
                                            >
                                                {copied ? (
                                                    <Check size={15} color={accent.primary as any} />
                                                ) : (
                                                    <Copy size={15} color={colors.textPrimary as any} />
                                                )}
                                                <Text style={[styles.copyLinkBtnText, { color: copied ? accent.primary : colors.textPrimary }]}>
                                                    {copied ? 'Copiado' : 'Copiar'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        {/* Configuración Compacta */}
                                        <View style={[styles.settingsCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderColor: colors.borderSubtle }]}>
                                            {/* Permiso para invitados */}
                                            <View style={styles.settingsRow}>
                                                <View style={styles.settingsLabelWrap}>
                                                    <Shield size={14} color={colors.textSecondary as any} />
                                                    <Text style={[styles.settingsLabel, { color: colors.textPrimary }]}>
                                                        Permiso
                                                    </Text>
                                                    {updatingRole && (
                                                        <ActivityIndicator size="small" color={accent.primary} style={{ marginLeft: 4 }} />
                                                    )}
                                                </View>
                                                <View style={[styles.segmentContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.segmentItem,
                                                            selectedRole === 'editor' && [styles.segmentItemActive, { backgroundColor: accent.primary }],
                                                        ]}
                                                        onPress={() => handleSelectRole('editor')}
                                                        disabled={updatingRole}
                                                        activeOpacity={0.8}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.segmentText,
                                                                { color: selectedRole === 'editor' ? '#FFFFFF' : colors.textSecondary },
                                                                selectedRole === 'editor' && styles.segmentTextActive,
                                                            ]}
                                                        >
                                                            Editor
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.segmentItem,
                                                            selectedRole === 'viewer' && [styles.segmentItemActive, { backgroundColor: accent.primary }],
                                                        ]}
                                                        onPress={() => handleSelectRole('viewer')}
                                                        disabled={updatingRole}
                                                        activeOpacity={0.8}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.segmentText,
                                                                { color: selectedRole === 'viewer' ? '#FFFFFF' : colors.textSecondary },
                                                                selectedRole === 'viewer' && styles.segmentTextActive,
                                                            ]}
                                                        >
                                                            Lector
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>

                                            <View style={[styles.settingsDivider, { backgroundColor: colors.borderSubtle }]} />

                                            {/* Visibilidad de integrantes */}
                                            <View style={styles.settingsRow}>
                                                <View style={styles.settingsLabelWrap}>
                                                    {isPublicMembers ? (
                                                        <Eye size={14} color={colors.textSecondary as any} />
                                                    ) : (
                                                        <EyeOff size={14} color={colors.textSecondary as any} />
                                                    )}
                                                    <Text style={[styles.settingsLabel, { color: colors.textPrimary }]}>
                                                        Lista
                                                    </Text>
                                                    {updatingVisibility && (
                                                        <ActivityIndicator size="small" color={accent.primary} style={{ marginLeft: 4 }} />
                                                    )}
                                                </View>
                                                <View style={[styles.segmentContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.segmentItem,
                                                            isPublicMembers && [styles.segmentItemActive, { backgroundColor: accent.primary }],
                                                        ]}
                                                        onPress={() => handleToggleVisibility(true)}
                                                        disabled={updatingVisibility}
                                                        activeOpacity={0.8}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.segmentText,
                                                                { color: isPublicMembers ? '#FFFFFF' : colors.textSecondary },
                                                                isPublicMembers && styles.segmentTextActive,
                                                            ]}
                                                        >
                                                            Pública
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.segmentItem,
                                                            !isPublicMembers && [styles.segmentItemActive, { backgroundColor: accent.primary }],
                                                        ]}
                                                        onPress={() => handleToggleVisibility(false)}
                                                        disabled={updatingVisibility}
                                                        activeOpacity={0.8}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.segmentText,
                                                                { color: !isPublicMembers ? '#FFFFFF' : colors.textSecondary },
                                                                !isPublicMembers && styles.segmentTextActive,
                                                            ]}
                                                        >
                                                            Oculta
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        </View>
                                    </>
                                ) : (
                                    <View style={[styles.guestCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderColor: colors.borderSubtle }]}>
                                        <View style={styles.guestCardHeader}>
                                            <View style={[styles.guestIconDot, { backgroundColor: accent.primary + '25' }]}>
                                                <Users size={14} color={accent.primary as any} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.guestCardTitle, { color: colors.textPrimary }]}>
                                                    Colaborando como invitado
                                                </Text>
                                                {!isPublicMembers && (
                                                    <Text style={[styles.guestCardSubtitle, { color: colors.textMuted }]}>
                                                        Lista privada. Solo tú ves tu propio acceso.
                                                    </Text>
                                                )}
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            style={[styles.leaveBtn, { borderColor: semantics.critical.primary + '40' }]}
                                            onPress={handleLeave}
                                            activeOpacity={0.7}
                                        >
                                            <LogOut size={13} color={semantics.critical.primary as any} />
                                            <Text style={[styles.leaveBtnText, { color: semantics.critical.primary }]}>
                                                Abandonar
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                            {/* Lista de Colaboradores */}
                            {(() => {
                                const displayedCollaborators = (!actualIsOwner && !isPublicMembers)
                                    ? collaborators.filter(m => m.member_id === session?.user?.id)
                                    : collaborators;

                                return (
                                    <View style={styles.collaboratorsSection}>
                                        <View style={styles.sectionHeaderRow}>
                                            <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                                                {!actualIsOwner && !isPublicMembers
                                                    ? 'Tu acceso'
                                                    : 'Personas con acceso'}
                                            </Text>
                                            {displayedCollaborators.length > 0 && (
                                                <View style={[styles.countBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                                                    <Text style={[styles.countBadgeText, { color: colors.textSecondary }]}>
                                                        {displayedCollaborators.length}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>

                                        {loading ? (
                                            <ActivityIndicator
                                                size="small"
                                                color={accent.primary}
                                                style={{ marginVertical: 14 }}
                                            />
                                        ) : displayedCollaborators.length === 0 ? (
                                            <View style={[styles.emptyBox, { borderColor: colors.borderSubtle }]}>
                                                <Users size={18} color={colors.textMuted as any} />
                                                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                                                    {!actualIsOwner && !isPublicMembers
                                                        ? 'No se pudo cargar la información de tu acceso.'
                                                        : 'Aún no hay colaboradores. Comparte un enlace para empezar.'}
                                                </Text>
                                            </View>
                                        ) : (
                                            <View style={[styles.membersListContainer, { borderColor: colors.borderSubtle, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }]}>
                                                {displayedCollaborators.map((member, index) => {
                                                    const displayName = member.name || member.full_name || (member.email && member.email !== 'Usuario' ? (member.email.includes('@') ? member.email.split('@')[0] : member.email) : 'Usuario');
                                                    const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                                                    const initial = capitalizedName[0]?.toUpperCase() || 'U';
                                                    const roleLabel = member.role === 'editor' ? 'Editor' : 'Lector';
                                                    const hasEmail = Boolean(member.email && member.email.includes('@') && member.email.toLowerCase() !== capitalizedName.toLowerCase());
                                                    const isLast = index === displayedCollaborators.length - 1;

                                                    return (
                                                        <View
                                                            key={member.collaboration_id}
                                                            style={[
                                                                styles.memberRow,
                                                                !isLast && { borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth },
                                                            ]}
                                                        >
                                                            <View
                                                                style={[
                                                                    styles.memberAvatar,
                                                                    { backgroundColor: accent.primary + '18' },
                                                                ]}
                                                            >
                                                                <Text style={[styles.memberAvatarText, { color: accent.primary }]}>
                                                                    {initial}
                                                                </Text>
                                                            </View>

                                                            <View style={styles.memberInfo}>
                                                                <Text
                                                                    style={[styles.memberEmail, { color: colors.textPrimary }]}
                                                                    numberOfLines={1}
                                                                >
                                                                    {capitalizedName}
                                                                </Text>
                                                                {hasEmail ? (
                                                                    <Text style={[styles.memberEmailSub, { color: colors.textMuted }]} numberOfLines={1}>
                                                                        {member.email}
                                                                    </Text>
                                                                ) : null}
                                                            </View>

                                                            {actualIsOwner ? (
                                                                <TouchableOpacity
                                                                    style={[
                                                                        styles.memberRoleBadge,
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
                                                                    onPress={() => handleToggleMemberRole(member)}
                                                                    activeOpacity={0.7}
                                                                    disabled={updatingRole}
                                                                >
                                                                    {member.role === 'editor' ? (
                                                                        <Shield size={11} color={accent.primary as any} />
                                                                    ) : (
                                                                        <Users size={11} color={colors.textSecondary as any} />
                                                                    )}
                                                                    <Text
                                                                        style={[
                                                                            styles.memberRoleBadgeText,
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
                                                            ) : (
                                                                <View
                                                                    style={[
                                                                        styles.memberRoleBadge,
                                                                        {
                                                                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                                                            borderColor: colors.borderSubtle,
                                                                        },
                                                                    ]}
                                                                >
                                                                    <Text style={[styles.memberRoleBadgeText, { color: colors.textSecondary }]}>
                                                                        {roleLabel}
                                                                    </Text>
                                                                </View>
                                                            )}

                                                            {actualIsOwner && (
                                                                <TouchableOpacity
                                                                    onPress={() =>
                                                                        handleRevoke(member.collaboration_id, capitalizedName)
                                                                    }
                                                                    style={styles.revokeBtn}
                                                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                                                >
                                                                    <Trash2
                                                                        size={14}
                                                                        color={colors.textMuted as any}
                                                                    />
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        )}

                                        {/* Acciones discretas al pie */}
                                        <View style={[styles.footerActionsContainer, { borderColor: colors.borderSubtle }]}>
                                            {targetType === 'note' && (
                                                <TouchableOpacity
                                                    style={[styles.footerActionRow, { borderBottomColor: colors.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth }]}
                                                    onPress={handleSharePlainText}
                                                    activeOpacity={0.7}
                                                >
                                                    <View style={styles.footerActionLeft}>
                                                        <FileText size={14} color={colors.textSecondary as any} />
                                                        <Text style={[styles.footerActionText, { color: colors.textSecondary }]}>
                                                            Enviar copia como texto plano
                                                        </Text>
                                                    </View>
                                                    <ChevronRight size={14} color={colors.textMuted as any} />
                                                </TouchableOpacity>
                                            )}

                                            <TouchableOpacity
                                                style={[styles.footerActionRow, { borderBottomColor: actualIsOwner ? colors.borderSubtle : 'transparent', borderBottomWidth: actualIsOwner ? StyleSheet.hairlineWidth : 0 }]}
                                                onPress={() => setShowHistoryModal(true)}
                                                activeOpacity={0.7}
                                            >
                                                <View style={styles.footerActionLeft}>
                                                    <Clock size={14} color={colors.textSecondary as any} />
                                                    <Text style={[styles.footerActionText, { color: colors.textSecondary }]}>
                                                        Historial de cambios
                                                    </Text>
                                                </View>
                                                <ChevronRight size={14} color={colors.textMuted as any} />
                                            </TouchableOpacity>

                                            {actualIsOwner && (
                                                <TouchableOpacity
                                                    style={styles.footerActionRow}
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
                                                    activeOpacity={0.7}
                                                >
                                                    <View style={styles.footerActionLeft}>
                                                        <Users size={14} color={colors.textSecondary as any} />
                                                        <Text style={[styles.footerActionText, { color: colors.textSecondary }]}>
                                                            Opciones avanzadas
                                                        </Text>
                                                    </View>
                                                    <ChevronRight size={14} color={colors.textMuted as any} />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                );
                    })()}
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
        borderRadius: 26,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 16,
        marginBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 10,
    },
    headerIconSquircle: {
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitleBox: {
        flex: 1,
        marginLeft: 12,
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: -0.3,
    },
    headerSubtitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 3,
        gap: 6,
    },
    targetTitleText: {
        fontSize: 12.5,
        fontWeight: '500',
        maxWidth: 130,
    },
    dotSeparator: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
    },
    roleBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    roleBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollBody: {
        maxHeight: 480,
    },

    // Acciones principales
    actionSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
    },
    primaryShareBtn: {
        flex: 1,
        flexDirection: 'row',
        height: 42,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    primaryShareBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
    copyLinkBtn: {
        flexDirection: 'row',
        height: 42,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    copyLinkBtnText: {
        fontSize: 12,
        fontWeight: '600',
    },

    // Tarjeta compacta de configuración
    settingsCard: {
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 2,
        marginBottom: 18,
    },
    settingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
    },
    settingsLabelWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    settingsLabel: {
        fontSize: 13,
        fontWeight: '600',
    },
    segmentContainer: {
        flexDirection: 'row',
        borderRadius: 8,
        padding: 2,
    },
    segmentItem: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    segmentItemActive: {},
    segmentText: {
        fontSize: 11,
        fontWeight: '500',
    },
    segmentTextActive: {
        fontWeight: '700',
    },
    settingsDivider: {
        height: StyleSheet.hairlineWidth,
        width: '100%',
    },

    // Vista de Invitado
    guestCard: {
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        marginBottom: 18,
        gap: 12,
    },
    guestCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    guestIconDot: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    guestCardTitle: {
        fontSize: 13,
        fontWeight: '600',
    },
    guestCardSubtitle: {
        fontSize: 11,
        marginTop: 2,
        lineHeight: 15,
    },
    leaveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    leaveBtnText: {
        fontSize: 11,
        fontWeight: '600',
    },

    // Colaboradores
    collaboratorsSection: {
        marginBottom: 6,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    sectionHeading: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    countBadge: {
        paddingHorizontal: 7,
        paddingVertical: 1.5,
        borderRadius: 10,
    },
    countBadgeText: {
        fontSize: 10,
        fontWeight: '700',
    },
    emptyBox: {
        paddingVertical: 20,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
    },
    emptyText: {
        fontSize: 12,
        textAlign: 'center',
        paddingHorizontal: 16,
        lineHeight: 16,
    },
    membersListContainer: {
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden',
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    memberAvatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    memberAvatarText: {
        fontSize: 13,
        fontWeight: '700',
    },
    memberInfo: {
        flex: 1,
        marginLeft: 10,
        marginRight: 8,
    },
    memberEmail: {
        fontSize: 13,
        fontWeight: '600',
    },
    memberEmailSub: {
        fontSize: 11,
        marginTop: 1,
    },
    memberRoleBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
    },
    memberRoleBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    revokeBtn: {
        padding: 6,
        marginLeft: 4,
    },

    // Acciones discretas al pie
    footerActionsContainer: {
        marginTop: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    footerActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 11,
        paddingHorizontal: 4,
    },
    footerActionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    footerActionText: {
        fontSize: 12,
        fontWeight: '500',
    },

    // Modos de Evento
    minimalEventWrap: {
        paddingVertical: 6,
    },
    eventNoticeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        marginBottom: 16,
    },
    eventNoticeText: {
        fontSize: 12,
        flex: 1,
        lineHeight: 16,
    },
    minimalLeaveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
    },
    minimalLeaveBtnText: {
        fontSize: 12,
        fontWeight: '600',
    },
    eventShareCard: {
        alignItems: 'center',
        paddingVertical: 18,
        paddingHorizontal: 12,
    },
    eventIconWrap: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    eventTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 6,
        textAlign: 'center',
    },
    eventDescription: {
        fontSize: 13,
        lineHeight: 18,
        textAlign: 'center',
        marginBottom: 16,
    },
});
