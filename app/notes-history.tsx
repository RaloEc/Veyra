import { useState, useCallback } from 'react';
import { View, Text, YStack, XStack, H2 } from 'tamagui';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store/useStore';
import { useNotesStore } from '../src/store/useNotesStore';
import { useFocusEffect } from 'expo-router';
import { FlatList, TouchableOpacity, StyleSheet, LayoutAnimation } from 'react-native';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { ChevronLeft, RefreshCw, Trash2, FileText, Pin, Check } from '@tamagui/lucide-icons';
import { Note } from '../src/types/db';
import { useTranslation } from 'react-i18next';

export default function NotesHistoryScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { theme, language } = useStore();
    const { deletedNotes, loadDeletedNotes, restoreNote, deleteForever } = useNotesStore();
    const isDark = theme === 'dark';

    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const isSelectionMode = selectedItems.length > 0;

    const colors = {
        bg: isDark ? '#0a0a0a' : '#F8FAFC',
        surface: isDark ? '#171717' : '#FFFFFF',
        textPrimary: isDark ? '#EDEDED' : '#0c0a09',
        textSecondary: isDark ? '#A1A1A1' : '#64748B',
        border: isDark ? '#262626' : '#E2E8F0',
        completed: isDark ? '#22c55e' : '#10B981',
        deleted: isDark ? '#ef4444' : '#E11D48',
        purple: isDark ? '#a855f7' : '#7C3AED',
    };

    useFocusEffect(
        useCallback(() => {
            loadDeletedNotes();
        }, [])
    );

    const toggleSelection = (id: string) => {
        setSelectedItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handlePress = (item: Note) => {
        if (isSelectionMode) {
            toggleSelection(item.id);
        }
    };

    const handleLongPress = (item: Note) => {
        if (!isSelectionMode) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSelectedItems([item.id]);
        } else {
            toggleSelection(item.id);
        }
    };

    const handleRestore = async (id: string) => {
        await restoreNote(id);
        await loadDeletedNotes();
    };

    const handleDeleteForever = async (id: string) => {
        await deleteForever(id);
        await loadDeletedNotes();
    };

    const handleBulkDelete = async () => {
        for (const id of selectedItems) {
            await deleteForever(id);
        }
        setSelectedItems([]);
        await loadDeletedNotes();
    };

    const renderItem = ({ item }: { item: Note }) => {
        const date = item.updated_at_ms || item.created_at_ms;
        const plainText = item.content?.replace(/<[^>]+>/g, '') || '';
        const previewText = plainText.length > 120 ? plainText.substring(0, 120) + '...' : plainText;
        const isSelected = selectedItems.includes(item.id);

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handlePress(item)}
                onLongPress={() => handleLongPress(item)}
            >
                <YStack
                    backgroundColor={isSelected ? (isDark ? '#1c2a1c' : '#ECFDF5') : colors.surface}
                    borderRadius="$5"
                    padding="$4"
                    mb="$3"
                    borderWidth={isSelected ? 2 : 1}
                    borderColor={isSelected ? colors.completed : colors.border}
                    elevation={2}
                    shadowColor="black"
                    shadowOpacity={0.03}
                    shadowRadius={10}
                >
                    <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
                        <YStack flex={1} gap="$1.5">
                            <XStack alignItems="center" gap="$2">
                                {isSelectionMode && (
                                    <View
                                        width={22}
                                        height={22}
                                        borderRadius={11}
                                        borderWidth={2}
                                        borderColor={isSelected ? colors.completed : colors.border}
                                        backgroundColor={isSelected ? colors.completed : 'transparent'}
                                        justifyContent="center"
                                        alignItems="center"
                                    >
                                        {isSelected && <Check size={14} color="white" strokeWidth={3} />}
                                    </View>
                                )}
                                <FileText size={16} color={colors.purple} />
                                <Text
                                    fontSize="$4"
                                    fontWeight="700"
                                    color={colors.textPrimary}
                                    numberOfLines={1}
                                    flex={1}
                                >
                                    {item.title || t('notes.no_title')}
                                </Text>
                                {item.is_pinned === 1 && (
                                    <Pin size={12} color="#F59E0B" style={{ transform: [{ rotate: '45deg' }] }} />
                                )}
                            </XStack>

                            {previewText.length > 0 && (
                                <Text
                                    fontSize="$2"
                                    color={colors.textSecondary}
                                    opacity={0.8}
                                    numberOfLines={2}
                                    mt="$1"
                                >
                                    {previewText}
                                </Text>
                            )}

                            <Text fontSize="$2" color={colors.textSecondary} fontWeight="500" mt="$1">
                                {format(date, language === 'es' ? "d 'de' MMMM, HH:mm" : "MMMM d, HH:mm", { locale: language === 'es' ? es : enUS })}
                            </Text>
                        </YStack>

                        {!isSelectionMode && (
                            <XStack gap="$2">
                                <TouchableOpacity
                                    onPress={() => handleRestore(item.id)}
                                    style={styles.actionButton}
                                >
                                    <RefreshCw size={18} color={colors.completed} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => handleDeleteForever(item.id)}
                                    style={[styles.actionButton, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(225, 29, 72, 0.05)' }]}
                                >
                                    <Trash2 size={18} color={colors.deleted} />
                                </TouchableOpacity>
                            </XStack>
                        )}
                    </XStack>
                </YStack>
            </TouchableOpacity>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <YStack f={1} px="$4" pt="$2">
                {/* Header */}
                {isSelectionMode ? (
                    <XStack alignItems="center" justifyContent="space-between" h={50} mb="$4">
                        <XStack alignItems="center" gap="$3">
                            <TouchableOpacity onPress={() => setSelectedItems([])}>
                                <ChevronLeft size={28} color={colors.textPrimary} />
                            </TouchableOpacity>
                            <Text fontSize="$6" fontWeight="900" color={colors.textPrimary}>
                                {selectedItems.length} {t('notes.selected')}
                            </Text>
                        </XStack>

                        <TouchableOpacity
                            onPress={handleBulkDelete}
                            style={{
                                padding: 8,
                                borderRadius: 12,
                                backgroundColor: isDark ? '#3a1a1a' : '#fee2e2',
                                width: 40,
                                height: 40,
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <Trash2 size={22} color={colors.deleted} />
                        </TouchableOpacity>
                    </XStack>
                ) : (
                    <XStack alignItems="center" justifyContent="space-between" h={50} mb="$4">
                        <XStack alignItems="center" gap="$3">
                            <TouchableOpacity onPress={() => router.back()}>
                                <ChevronLeft size={28} color={colors.textPrimary} />
                            </TouchableOpacity>
                            <H2 fontSize="$7" fontWeight="900" color={colors.textPrimary} letterSpacing={-0.5}>
                                {t('notes_history.title')}
                            </H2>
                        </XStack>
                    </XStack>
                )}


                <FlatList
                    data={deletedNotes}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <YStack alignItems="center" justifyContent="center" py="$12" gap="$4" opacity={0.6}>
                            <View
                                backgroundColor={isDark ? '#171717' : '#f0f0f0'}
                                padding="$5"
                                borderRadius={50}
                            >
                                <FileText size={40} color={colors.textSecondary} />
                            </View>
                            <YStack alignItems="center" gap="$1">
                                <Text fontSize="$5" fontWeight="800" color={colors.textPrimary}>
                                    {t('notes_history.empty_trash_title')}
                                </Text>
                                <Text fontSize="$3" color={colors.textSecondary} textAlign="center" px="$8">
                                    {t('notes_history.empty_trash_desc')}
                                </Text>
                            </YStack>
                        </YStack>
                    }
                />
            </YStack>
        </View>
    );
}

const styles = StyleSheet.create({
    tab: {
        flex: 1,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 25,
    },
    tabActiveLight: {
        backgroundColor: 'white',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    tabActiveDark: {
        backgroundColor: '#262626',
    },
    actionButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(128, 128, 128, 0.1)',
    }
});
