import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Users } from '@tamagui/lucide-icons';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { CollaborationService } from '../../services/collaborationService';
import { CollabTargetType, CollaboratorMember } from '../../types/db';
import { supabase } from '../../lib/supabase';

interface CollaboratorsAvatarsProps {
    targetType: CollabTargetType;
    targetId: string;
    onPress?: () => void;
    size?: number;
    showIfEmpty?: boolean;
}

export const CollaboratorsAvatars: React.FC<CollaboratorsAvatarsProps> = ({
    targetType,
    targetId,
    onPress,
    size = 26,
    showIfEmpty = false,
}) => {
    const { colors, accent } = useVeyraTheme();
    const [collaborators, setCollaborators] = useState<CollaboratorMember[]>([]);
    const [isOwner, setIsOwner] = useState<boolean>(true);
    const [isPublicMembers, setIsPublicMembers] = useState<boolean>(true);

    const refresh = useCallback(async () => {
        if (!targetId) return;
        try {
            const [perms, isPublic, list] = await Promise.all([
                CollaborationService.getUserPermission(targetType, targetId),
                CollaborationService.getMembersVisibility(targetType, targetId),
                CollaborationService.getCollaborators(targetType, targetId),
            ]);
            setIsOwner(perms.isOwner);
            setIsPublicMembers(isPublic);
            setCollaborators(list);
        } catch {
            // Silencioso
        }
    }, [targetType, targetId]);

    useEffect(() => {
        refresh();

        if (!targetId) return;

        // Escuchar cambios de permisos, visibilidad o miembros en tiempo real
        const channel = supabase
            .channel(`avatars_live_${targetId}`)
            .on('broadcast', { event: 'LIVE_NOTE_CHANGE' }, ({ payload }) => {
                if (!payload) return;
                if (payload.changeType === 'PERMISSIONS_UPDATE') {
                    if (typeof payload.isPublicMembers === 'boolean') {
                        setIsPublicMembers(payload.isPublicMembers);
                    }
                    refresh();
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
                    refresh();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel).catch(() => {});
        };
    }, [targetId, refresh]);

    // Si los integrantes están configurados como privados y el usuario NO es el propietario, no mostrar avatares
    if (!isOwner && !isPublicMembers) {
        return null;
    }

    if (collaborators.length === 0 && !showIfEmpty) {
        return null;
    }

    const displayMembers = collaborators.slice(0, 3);
    const extraCount = collaborators.length - 3;

    return (
        <TouchableOpacity
            style={styles.container}
            onPress={onPress}
            activeOpacity={0.7}
            disabled={!onPress}
        >
            <View style={styles.avatarsRow}>
                {displayMembers.map((member, index) => {
                    const displayName = member.name || member.full_name || (member.email?.includes('@') ? member.email.split('@')[0] : member.email) || 'U';
                    const initial = displayName[0]?.toUpperCase() || 'U';
                    return (
                        <View
                            key={member.collaboration_id}
                            style={[
                                styles.avatar,
                                {
                                    width: size,
                                    height: size,
                                    borderRadius: size / 2,
                                    backgroundColor: accent.primary,
                                    borderColor: colors.bg,
                                    borderWidth: 1.5,
                                    marginLeft: index === 0 ? 0 : -8,
                                },
                            ]}
                        >
                            <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>
                                {initial}
                            </Text>
                        </View>
                    );
                })}

                {extraCount > 0 && (
                    <View
                        style={[
                            styles.avatar,
                            styles.extraBadge,
                            {
                                width: size,
                                height: size,
                                borderRadius: size / 2,
                                backgroundColor: colors.surfaceElevated,
                                borderColor: colors.bg,
                                borderWidth: 1.5,
                                marginLeft: -8,
                            },
                        ]}
                    >
                        <Text style={[styles.extraText, { color: colors.textSecondary, fontSize: size * 0.38 }]}>
                            +{extraCount}
                        </Text>
                    </View>
                )}

                {collaborators.length === 0 && showIfEmpty && (
                    <View style={[styles.shareBadge, { backgroundColor: colors.surfaceElevated }]}>
                        <Users size={14} color={colors.textSecondary as any} />
                        <Text style={[styles.shareBadgeText, { color: colors.textSecondary }]}>
                            Compartir
                        </Text>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarsRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    extraBadge: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    extraText: {
        fontWeight: '600',
    },
    shareBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    shareBadgeText: {
        fontSize: 12,
        fontWeight: '500',
    },
});
