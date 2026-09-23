import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { Plus, X, CheckSquare, Square, Trash2 } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import * as Crypto from 'expo-crypto';

import { Subtask } from '../../types/db';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';
import { VeyraIconButton } from '../ui/VeyraIconButton';

interface SubtasksSectionProps {
    subtasks: Subtask[];
    setSubtasks: React.Dispatch<React.SetStateAction<Subtask[]>>;
    flat?: boolean;
}

export function SubtasksSection({ subtasks, setSubtasks, flat }: SubtasksSectionProps) {
    const { t } = useTranslation();
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();
    const [newTitle, setNewTitle] = useState('');

    const handleAdd = () => {
        const trimmed = newTitle.trim();
        if (!trimmed) return;

        const newItem: Subtask = {
            id: Crypto.randomUUID(),
            title: trimmed,
            completed: false,
        };

        setSubtasks(prev => [...prev, newItem]);
        setNewTitle('');
    };

    const handleToggle = (id: string) => {
        setSubtasks(prev =>
            prev.map(item => (item.id === id ? { ...item, completed: !item.completed } : item))
        );
    };

    const handleRemove = (id: string) => {
        setSubtasks(prev => prev.filter(item => item.id !== id));
    };

    const completedCount = subtasks.filter(s => s.completed).length;

    if (flat) {
        return (
            <View style={styles.flatContainer}>
                {subtasks.length > 0 && (
                    <View style={styles.flatHeaderRow}>
                        <Text style={[styles.flatSectionTitle, { color: colors.textSecondary }]}>
                            {t('create.sections.subtasks', { defaultValue: 'Subtareas' })}
                        </Text>
                        <Text style={[styles.counterText, { color: colors.textMuted }]}>
                            {completedCount}/{subtasks.length}
                        </Text>
                    </View>
                )}

                {/* Lista de subtareas plana */}
                {subtasks.map(item => (
                    <View
                        key={item.id}
                        style={styles.flatItemRow}
                    >
                        <TouchableOpacity
                            style={styles.itemLeft}
                            onPress={() => handleToggle(item.id)}
                            activeOpacity={0.7}
                        >
                            {item.completed ? (
                                <CheckSquare size={18} color={accent.primary as any} />
                            ) : (
                                <Square size={18} color={colors.textMuted as any} />
                            )}
                            <Text
                                style={[
                                    styles.itemText,
                                    {
                                        color: item.completed ? colors.textMuted : colors.textPrimary,
                                        textDecorationLine: item.completed ? 'line-through' : 'none',
                                    },
                                ]}
                                numberOfLines={2}
                            >
                                {item.title}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.removeBtn}
                            onPress={() => handleRemove(item.id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <X size={15} color={colors.textMuted as any} />
                        </TouchableOpacity>
                    </View>
                ))}

                {/* Input plano para agregar subtarea */}
                <View style={[styles.flatInputRow, { borderColor: colors.borderSubtle }]}>
                    <Plus size={16} color={colors.textMuted as any} />
                    <TextInput
                        style={[styles.flatInput, { color: colors.textPrimary }]}
                        placeholder={t('create.subtasks.placeholder', { defaultValue: 'Agregar subtarea...' })}
                        placeholderTextColor={colors.textMuted}
                        value={newTitle}
                        onChangeText={setNewTitle}
                        onSubmitEditing={handleAdd}
                        returnKeyType="done"
                    />
                    {newTitle.trim().length > 0 && (
                        <TouchableOpacity
                            style={[styles.addButton, { backgroundColor: accent.primary }]}
                            onPress={handleAdd}
                            activeOpacity={0.8}
                        >
                            <Plus size={15} color="#ffffff" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                    {t('create.sections.subtasks', { defaultValue: 'SUBTAREAS' }).toUpperCase()}
                </Text>
                {subtasks.length > 0 && (
                    <Text style={[styles.counterText, { color: colors.textMuted }]}>
                        {completedCount}/{subtasks.length}
                    </Text>
                )}
            </View>

            {/* Input para agregar nueva subtarea */}
            <VeyraSurface level={1} radius="md" style={styles.inputCard}>
                <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    placeholder={t('create.subtasks.placeholder', { defaultValue: 'Agregar un paso o subtarea...' })}
                    placeholderTextColor={colors.textMuted}
                    value={newTitle}
                    onChangeText={setNewTitle}
                    onSubmitEditing={handleAdd}
                    returnKeyType="done"
                />
                <TouchableOpacity
                    style={[
                        styles.addButton,
                        {
                            backgroundColor: newTitle.trim() ? accent.primary : (isDark ? '#262626' : '#E2E8F0'),
                        },
                    ]}
                    onPress={handleAdd}
                    disabled={!newTitle.trim()}
                    activeOpacity={0.8}
                >
                    <Plus
                        size={16}
                        color={newTitle.trim() ? '#ffffff' : (colors.textMuted as any)}
                    />
                </TouchableOpacity>
            </VeyraSurface>

            {/* Lista de subtareas */}
            {subtasks.length > 0 && (
                <View style={styles.list}>
                    {subtasks.map(item => (
                        <VeyraSurface
                            key={item.id}
                            level={1}
                            radius="sm"
                            style={styles.itemRow}
                        >
                            <TouchableOpacity
                                style={styles.itemLeft}
                                onPress={() => handleToggle(item.id)}
                                activeOpacity={0.7}
                            >
                                {item.completed ? (
                                    <CheckSquare size={18} color={accent.primary as any} />
                                ) : (
                                    <Square size={18} color={colors.textMuted as any} />
                                )}
                                <Text
                                    style={[
                                        styles.itemText,
                                        {
                                            color: item.completed ? colors.textMuted : colors.textPrimary,
                                            textDecorationLine: item.completed ? 'line-through' : 'none',
                                        },
                                    ]}
                                    numberOfLines={2}
                                >
                                    {item.title}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.removeBtn}
                                onPress={() => handleRemove(item.id)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <X size={16} color={colors.textMuted as any} />
                            </TouchableOpacity>
                        </VeyraSurface>
                    ))}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        paddingHorizontal: 2,
    },
    sectionTitle: {
        fontWeight: '700',
        letterSpacing: 0.8,
    },
    counterText: {
        fontSize: 12,
        fontWeight: '600',
    },
    inputCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    input: {
        flex: 1,
        fontSize: 14,
        paddingVertical: 6,
    },
    addButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
    list: {
        marginTop: 8,
        gap: 6,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    itemLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    itemText: {
        flex: 1,
        fontSize: 14,
    },
    removeBtn: {
        padding: 4,
        marginLeft: 8,
    },
    flatContainer: {
        marginBottom: 8,
        marginTop: 4,
    },
    flatHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
        paddingHorizontal: 4,
    },
    flatSectionTitle: {
        fontSize: 13,
        fontWeight: '700',
    },
    flatItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    flatInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
        gap: 8,
    },
    flatInput: {
        flex: 1,
        fontSize: 14,
        paddingVertical: 2,
    },
});
