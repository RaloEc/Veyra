import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Bell, AlertCircle, ShieldAlert, ChevronDown, Check, X } from '@tamagui/lucide-icons';
import { ControlLevel } from '../../types/db';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';

interface PrioritySelectorProps {
    controlLevel: ControlLevel;
    setControlLevel: (level: ControlLevel) => void;
    isDark?: boolean;
    flat?: boolean;
}

/**
 * PrioritySelector — Selector de nivel de control (Normal, Strict, Critical)
 */
export function PrioritySelector({ controlLevel, setControlLevel, flat }: PrioritySelectorProps) {
    const { t } = useTranslation();
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const levels: { key: ControlLevel; label: string; icon: any; color: string; descKey: string }[] = [
        {
            key: 'normal',
            label: t('create.priority.normal.label'),
            icon: Bell,
            color: colors.textSecondary,
            descKey: 'create.priority.normal.desc',
        },
        {
            key: 'strict',
            label: t('create.priority.strict.label'),
            icon: AlertCircle,
            color: isDark ? '#FBBF24' : '#F59E0B',
            descKey: 'create.priority.strict.desc',
        },
        {
            key: 'critical',
            label: t('create.priority.critical.label'),
            icon: ShieldAlert,
            color: isDark ? '#FB7185' : '#E11D48',
            descKey: 'create.priority.critical.desc',
        },
    ];

    const currentLevel = levels.find(l => l.key === controlLevel) || levels[0];
    const IconComponent = currentLevel.icon;

    return (
        <View style={flat ? styles.flatContainer : styles.container}>
            {flat ? (
                <>
                    <View style={styles.flatSegmentsRow}>
                        {levels.map(item => {
                            const isSelected = controlLevel === item.key;
                            const ItemIcon = item.icon;
                            return (
                                <TouchableOpacity
                                    key={item.key}
                                    activeOpacity={0.75}
                                    onPress={() => setControlLevel(item.key)}
                                    style={[
                                        styles.flatSegmentBtn,
                                        {
                                            backgroundColor: isSelected
                                                ? (isDark ? `${item.color}25` : `${item.color}15`)
                                                : colors.surfaceElevated,
                                            borderColor: isSelected ? item.color : colors.borderSubtle,
                                        },
                                    ]}
                                >
                                    <ItemIcon
                                        size={14}
                                        color={isSelected ? item.color : colors.textMuted}
                                        strokeWidth={isSelected ? 2.5 : 2}
                                    />
                                    <Text
                                        style={[
                                            styles.flatSegmentText,
                                            {
                                                color: isSelected ? (isDark ? '#FFFFFF' : item.color) : colors.textSecondary,
                                                fontWeight: isSelected ? '700' : '500',
                                            },
                                        ]}
                                    >
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <Text style={[styles.flatHelpText, { color: colors.textMuted }]}>
                        {t(currentLevel.descKey)}
                    </Text>
                </>
            ) : (
                <>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                        {t('create.sections.priority').toUpperCase()}
                    </Text>

                    <View style={styles.buttonsRow}>
                        {levels.map(level => {
                            const isActive = controlLevel === level.key;
                            const Icon = level.icon;

                            return (
                                <TouchableOpacity
                                    key={level.key}
                                    activeOpacity={0.8}
                                    onPress={() => setControlLevel(level.key)}
                                    style={[
                                        styles.levelButton,
                                        {
                                            backgroundColor: isActive
                                                ? (isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)')
                                                : colors.surface,
                                            borderColor: isActive ? level.color : colors.borderSubtle,
                                            borderRadius: radii.md,
                                        },
                                    ]}
                                >
                                    <Icon
                                        size={18}
                                        color={isActive ? level.color : colors.textMuted}
                                        strokeWidth={isActive ? 2.5 : 2}
                                    />
                                    <Text
                                        style={[
                                            styles.levelButtonText,
                                            {
                                                color: isActive ? colors.textPrimary : colors.textMuted,
                                                fontWeight: isActive ? '700' : '500',
                                                fontSize: typography.caption.fontSize,
                                            },
                                        ]}
                                    >
                                        {level.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Description Info Card */}
                    <VeyraSurface
                        level={2}
                        radius="md"
                        style={styles.descCard}
                    >
                        <IconComponent size={16} color={currentLevel.color} />
                        <Text style={[styles.descText, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                            {t(currentLevel.descKey)}
                        </Text>
                    </VeyraSurface>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        gap: 8,
    },
    sectionTitle: {
        fontWeight: '700',
        letterSpacing: 0.8,
        marginBottom: 2,
    },
    buttonsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    levelButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderWidth: 1,
        gap: 6,
    },
    levelButtonText: {
        letterSpacing: 0.2,
    },
    descCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 10,
    },
    descText: {
        flex: 1,
        lineHeight: 18,
    },
    flatContainer: {
        marginBottom: 0,
        gap: 6,
    },
    flatSegmentsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    flatSegmentBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 9,
        paddingHorizontal: 8,
        borderRadius: 20,
        borderWidth: 1,
    },
    flatSegmentText: {
        fontSize: 13,
    },
    flatHelpText: {
        fontSize: 12,
        paddingHorizontal: 4,
        lineHeight: 16,
    },
    flatPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
    },
    flatPillText: {
        fontSize: 13,
        fontWeight: '600',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalCard: {
        width: '100%',
        maxWidth: 360,
        borderRadius: 20,
        borderWidth: 1,
        padding: 18,
        gap: 12,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.3,
                shadowRadius: 18,
            },
            android: {
                elevation: 10,
            },
        }),
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 8,
    },
    modalTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    modalCloseBtn: {
        padding: 4,
    },
    optionsList: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    optionRow: {
        paddingVertical: 12,
        paddingHorizontal: 10,
    },
    optionContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    optionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    optionLabel: {
        letterSpacing: 0.1,
    },
    optionDesc: {
        marginTop: 2,
        lineHeight: 16,
    },
    checkBadge: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
});
