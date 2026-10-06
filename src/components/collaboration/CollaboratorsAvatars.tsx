import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Users } from '@tamagui/lucide-icons';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { CollaborationService } from '../../services/collaborationService';
import { CollabTargetType, CollaboratorMember } from '../../types/db';

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

    useEffect(() => {
        let isMounted = true;
        CollaborationService.getCollaborators(targetType, targetId)
            .then((list) => {
                if (isMounted) setCollaborators(list);
            })
            .catch(() => {});

        return () => {
            isMounted = false;
        };
    }, [targetType, targetId]);

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
                    const initial = (member.email?.[0] || 'U').toUpperCase();
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
