import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Pressable,
    Platform,
} from 'react-native';
import { ChevronDown, Check, Repeat, X } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface RecurrenceSelectorProps {
    value: RecurrenceType;
    onChange: (value: RecurrenceType) => void;
    isDark?: boolean;
    flat?: boolean;
}

const RECURRENCE_OPTIONS: RecurrenceType[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

/**
 * RecurrenceSelector — Selector modal de repetición (sin desplazar el formulario)
 */
export function RecurrenceSelector({ value, onChange, flat }: RecurrenceSelectorProps) {
    const { t } = useTranslation();
    const { colors, typography, accent, isDark } = useVeyraTheme();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const getLabel = (type: RecurrenceType) => t(`create.recurrence.${type}`);

    return (
        <View style={flat ? styles.flatContainer : styles.container}>
            {flat ? (
                <TouchableOpacity
                    onPress={() => setIsModalOpen(true)}
                    style={[
                        styles.flatPill,
                        {
                            backgroundColor: value !== 'none'
                                ? (isDark ? 'rgba(139, 92, 246, 0.18)' : 'rgba(139, 92, 246, 0.10)')
                                : colors.surfaceElevated,
                            borderColor: value !== 'none' ? accent.primary : colors.borderSubtle,
                        },
                    ]}
                    activeOpacity={0.7}
                >
                    <Repeat size={14} color={value !== 'none' ? accent.primary : colors.textMuted} strokeWidth={2.2} />
                    <Text
                        style={[
                            styles.flatPillText,
                            {
                                color: value !== 'none' ? accent.primary : colors.textSecondary,
                                fontWeight: value !== 'none' ? '700' : '500',
                            },
                        ]}
                    >
                        {value === 'none' ? t('create.recurrence.none_label', { defaultValue: 'Repetir' }) : getLabel(value)}
                    </Text>
                    <ChevronDown size={12} color={value !== 'none' ? accent.primary : colors.textMuted} />
                </TouchableOpacity>
            ) : (
                <>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                        {t('create.sections.recurrence').toUpperCase()}
                    </Text>

                    <VeyraSurface
                        level={1}
                        radius="md"
                        style={styles.card}
                    >
                        {/* Current Selection Row */}
                        <TouchableOpacity
                            onPress={() => setIsModalOpen(true)}
                            style={styles.toggleRow}
                            activeOpacity={0.7}
                        >
                            <View style={styles.selectedRow}>
                                <Repeat size={16} color={value === 'none' ? colors.textMuted : accent.primary} />
                                <Text
                                    style={[
                                        styles.currentText,
                                        {
                                            color: value === 'none' ? colors.textMuted : colors.textPrimary,
                                            fontSize: typography.bodyMedium.fontSize,
                                        },
                                    ]}
                                >
                                    {getLabel(value)}
                                </Text>
                            </View>
                            <ChevronDown
                                size={18}
                                color={colors.textSecondary}
                            />
                        </TouchableOpacity>
                    </VeyraSurface>
                </>
            )}

            {/* Modal de Opciones de Repetición */}
            <Modal
                visible={isModalOpen}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsModalOpen(false)}
            >
                <Pressable
                    style={styles.modalBackdrop}
                    onPress={() => setIsModalOpen(false)}
                >
                    <Pressable
                        style={[
                            styles.modalCard,
                            {
                                backgroundColor: colors.surface,
                                borderColor: colors.borderSubtle,
                            },
                        ]}
                        onPress={e => e.stopPropagation()}
                    >
                        {/* Header del Modal */}
                        <View style={styles.modalHeader}>
                            <View style={styles.modalTitleRow}>
                                <Repeat size={18} color={accent.primary} />
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                                    {t('create.sections.recurrence', { defaultValue: 'Repetir Recordatorio' })}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.modalCloseBtn}
                                onPress={() => setIsModalOpen(false)}
                            >
                                <X size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {/* Lista de Opciones */}
                        <View style={styles.optionsList}>
                            {RECURRENCE_OPTIONS.map((option, index) => {
                                const isSelected = value === option;
                                const isLast = index === RECURRENCE_OPTIONS.length - 1;

                                return (
                                    <TouchableOpacity
                                        key={option}
                                        onPress={() => {
                                            onChange(option);
                                            setIsModalOpen(false);
                                        }}
                                        style={[
                                            styles.optionRow,
                                            {
                                                borderBottomColor: colors.borderSubtle,
                                                borderBottomWidth: isLast ? 0 : 1,
                                                backgroundColor: isSelected
                                                    ? isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.03)'
                                                    : 'transparent',
                                            },
                                        ]}
                                        activeOpacity={0.7}
                                    >
                                        <View style={styles.optionContent}>
                                            <View style={{ flex: 1, paddingRight: 10 }}>
                                                <Text
                                                    style={[
                                                        styles.optionLabel,
                                                        {
                                                            color: isSelected ? accent.primary : colors.textPrimary,
                                                            fontWeight: isSelected ? '700' : '500',
                                                            fontSize: typography.body.fontSize,
                                                        },
                                                    ]}
                                                >
                                                    {getLabel(option)}
                                                </Text>
                                                {option !== 'none' && (
                                                    <Text
                                                        style={[
                                                            styles.optionDesc,
                                                            { color: colors.textSecondary, fontSize: typography.caption.fontSize },
                                                        ]}
                                                    >
                                                        {t(`create.recurrence.${option}_desc`)}
                                                    </Text>
                                                )}
                                            </View>

                                            {isSelected && (
                                                <View
                                                    style={[
                                                        styles.checkBadge,
                                                        { backgroundColor: accent.primary },
                                                    ]}
                                                >
                                                    <Check color={isDark ? '#1B1B1B' : '#FFFFFF'} size={13} strokeWidth={3} />
                                                </View>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
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
    card: {
        width: '100%',
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    selectedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    currentText: {
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
        paddingHorizontal: 8,
    },
    optionContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    optionLabel: {
        letterSpacing: 0.1,
    },
    optionDesc: {
        marginTop: 2,
    },
    checkBadge: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    flatContainer: {
        marginBottom: 0,
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
});
