import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    LayoutAnimation,
    TextInput,
    Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import {
    ChevronLeft,
    RefreshCw,
    Trash2,
    FileText,
    Check,
    Search,
    X,
    CheckSquare,
    Square,
    Image as ImageIcon,
    Paperclip,
} from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { useStore } from '../src/store/useStore';
import { useNotesStore } from '../src/store/useNotesStore';
import { Note } from '../src/types/db';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraGlass } from '../src/components/ui/VeyraGlass';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { extractPlainTextFromPages } from '../src/utils/pageUtils';

const smoothLayoutAnimation = {
    duration: 300,
    create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
    },
    update: {
        type: LayoutAnimation.Types.spring,
        springDamping: 0.82,
    },
    delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
    },
};

const hasMediaOrAttachments = (attachmentsStr?: string, contentStr?: string): boolean => {
    if (attachmentsStr && attachmentsStr !== '[]' && attachmentsStr.trim().length > 2) {
        return true;
    }
    if (contentStr && /<img/i.test(contentStr)) {
        return true;
    }
    return false;
};

export default function NotesHistoryScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { language } = useStore();
    const {
        deletedNotes,
        loadDeletedNotes,
        restoreNote,
        restoreNotesBatch,
        deleteForever,
        deleteNotesForeverBatch,
        emptyTrash,
    } = useNotesStore();
    const insets = useSafeAreaInsets();
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();

    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const isSelectionMode = selectedItems.length > 0;

    useFocusEffect(
        useCallback(() => {
            loadDeletedNotes();
        }, [])
    );

    const filteredNotes = useMemo(() => {
        if (!searchQuery.trim()) return deletedNotes;
        const query = searchQuery.toLowerCase().trim();
        return deletedNotes.filter(note => {
            const titleMatch = note.title?.toLowerCase().includes(query);
            const plainText = extractPlainTextFromPages(note.content).toLowerCase();
            const contentMatch = plainText.includes(query);
            return titleMatch || contentMatch;
        });
    }, [deletedNotes, searchQuery]);

    const isAllSelected = filteredNotes.length > 0 && selectedItems.length === filteredNotes.length;

    const toggleSelection = (id: string) => {
        setSelectedItems(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
    };

    const handleSelectAll = () => {
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        const allIds = filteredNotes.map(n => n.id);
        if (selectedItems.length === allIds.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(allIds);
        }
    };

    const handlePress = (item: Note) => {
        if (isSelectionMode) {
            toggleSelection(item.id);
        } else {
            router.push(`/notes/${item.id}`);
        }
    };

    const handleLongPress = (item: Note) => {
        if (!isSelectionMode) {
            LayoutAnimation.configureNext(smoothLayoutAnimation);
            setSelectedItems([item.id]);
        } else {
            toggleSelection(item.id);
        }
    };

    // Acciones individuales
    const handleRestoreSingle = async (id: string) => {
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        await restoreNote(id);
    };

    const handleDeleteForeverSingle = (id: string) => {
        Alert.alert(
            language === 'es' ? '¿Eliminar nota definitivamente?' : 'Delete note permanently?',
            language === 'es'
                ? 'Esta nota se borrará para siempre y no se podrá recuperar.'
                : 'This note will be permanently erased and cannot be restored.',
            [
                { text: language === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
                {
                    text: language === 'es' ? 'Eliminar' : 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        LayoutAnimation.configureNext(smoothLayoutAnimation);
                        await deleteForever(id);
                    },
                },
            ]
        );
    };

    // Acciones en lote
    const handleBulkRestore = async () => {
        if (selectedItems.length === 0) return;
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        const ids = [...selectedItems];
        setSelectedItems([]);
        await restoreNotesBatch(ids);
    };

    const handleBulkDeleteForever = () => {
        if (selectedItems.length === 0) return;
        const count = selectedItems.length;
        Alert.alert(
            language === 'es' ? `¿Eliminar ${count} notas definitivamente?` : `Permanently delete ${count} notes?`,
            language === 'es'
                ? 'Las notas seleccionadas se borrarán permanentemente sin posibilidad de recuperarlas.'
                : 'The selected notes will be permanently erased and cannot be recovered.',
            [
                { text: language === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
                {
                    text: language === 'es' ? 'Eliminar permanentemente' : 'Delete permanently',
                    style: 'destructive',
                    onPress: async () => {
                        LayoutAnimation.configureNext(smoothLayoutAnimation);
                        const ids = [...selectedItems];
                        setSelectedItems([]);
                        await deleteNotesForeverBatch(ids);
                    },
                },
            ]
        );
    };

    const handleEmptyTrash = () => {
        if (deletedNotes.length === 0) return;
        Alert.alert(
            language === 'es' ? '¿Vaciar papelera de notas?' : 'Empty notes trash?',
            language === 'es'
                ? `Se eliminarán permanentemente todas las ${deletedNotes.length} notas de la papelera.`
                : `All ${deletedNotes.length} notes in the trash will be permanently erased.`,
            [
                { text: language === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
                {
                    text: language === 'es' ? 'Vaciar papelera' : 'Empty trash',
                    style: 'destructive',
                    onPress: async () => {
                        LayoutAnimation.configureNext(smoothLayoutAnimation);
                        setSelectedItems([]);
                        await emptyTrash();
                    },
                },
            ]
        );
    };

    const renderItem = ({ item }: { item: Note }) => {
        const date = item.updated_at_ms || item.created_at_ms;
        const plainText = extractPlainTextFromPages(item.content);
        const previewText = plainText.length > 120 ? plainText.substring(0, 120) + '...' : plainText;
        const isSelected = selectedItems.includes(item.id);
        const hasMedia = hasMediaOrAttachments(item.attachments, item.content);

        return (
            <TouchableOpacity
                activeOpacity={0.75}
                delayPressIn={0}
                onPress={() => handlePress(item)}
                onLongPress={() => handleLongPress(item)}
                style={styles.itemWrapper}
            >
                <VeyraSurface
                    level={1}
                    radius="md"
                    style={[
                        styles.itemCard,
                        {
                            borderColor: isSelected ? accent.primary : colors.borderSubtle,
                            borderWidth: isSelected ? 1.5 : 1,
                            backgroundColor: isSelected
                                ? (isDark ? 'rgba(59, 130, 246, 0.14)' : 'rgba(59, 130, 246, 0.08)')
                                : colors.surface,
                        },
                    ]}
                >
                    <View style={styles.itemMainCol}>
                        <View style={styles.itemTitleRow}>
                            {isSelectionMode && (
                                <View
                                    style={[
                                        styles.selectionCheck,
                                        {
                                            backgroundColor: isSelected ? accent.primary : 'transparent',
                                            borderColor: isSelected ? accent.primary : colors.borderMedium,
                                        },
                                    ]}
                                >
                                    {isSelected && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                                </View>
                            )}

                            <FileText size={15} color={accent.primary} />

                            <Text
                                style={[
                                    styles.itemTitle,
                                    { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize },
                                ]}
                                numberOfLines={1}
                            >
                                {item.title || t('notes.no_title')}
                            </Text>

                            {hasMedia && (
                                <View style={[styles.mediaBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                                    <ImageIcon size={11} color={colors.textMuted} />
                                </View>
                            )}
                        </View>

                        {previewText.length > 0 && (
                            <Text
                                style={[
                                    styles.itemPreview,
                                    { color: colors.textSecondary, fontSize: typography.caption.fontSize },
                                ]}
                                numberOfLines={2}
                            >
                                {previewText}
                            </Text>
                        )}

                        <Text
                            style={[
                                styles.itemDate,
                                { color: colors.textMuted, fontSize: typography.micro.fontSize },
                            ]}
                        >
                            {language === 'es' ? 'Eliminada: ' : 'Deleted: '}
                            {format(date, language === 'es' ? "d 'de' MMMM, HH:mm" : 'MMMM d, HH:mm', {
                                locale: language === 'es' ? es : enUS,
                            })}
                        </Text>
                    </View>

                    {!isSelectionMode && (
                        <View style={styles.actionsCol}>
                            <VeyraIconButton
                                variant="surface"
                                size="sm"
                                icon={<RefreshCw size={15} color={isDark ? '#34D399' : '#059669'} />}
                                onPress={() => handleRestoreSingle(item.id)}
                            />
                            <VeyraIconButton
                                variant="danger"
                                size="sm"
                                icon={<Trash2 size={15} color={isDark ? '#FB7185' : '#E11D48'} />}
                                onPress={() => handleDeleteForeverSingle(item.id)}
                            />
                        </View>
                    )}
                </VeyraSurface>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'right', 'left']}>
            {/* Header unificado y elegante */}
            <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
                {isSelectionMode ? (
                    <View style={styles.headerRow}>
                        <View style={styles.headerLeft}>
                            <VeyraIconButton
                                variant="ghost"
                                size="sm"
                                icon={<X size={20} color={colors.textPrimary} />}
                                onPress={() => {
                                    LayoutAnimation.configureNext(smoothLayoutAnimation);
                                    setSelectedItems([]);
                                }}
                            />
                            <View style={styles.headerTitleGroup}>
                                <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: 17 }]}>
                                    {selectedItems.length} {t('notes.selected')}
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={handleSelectAll}
                            activeOpacity={0.7}
                            delayPressIn={0}
                            style={[
                                styles.headerSelectAllBtn,
                                {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                        >
                            {isAllSelected ? (
                                <CheckSquare size={14} color={accent.primary} />
                            ) : (
                                <Square size={14} color={colors.textSecondary} />
                            )}
                            <Text
                                style={[
                                    styles.headerSelectAllText,
                                    {
                                        color: isAllSelected ? accent.primary : colors.textPrimary,
                                        fontSize: typography.caption.fontSize,
                                    },
                                ]}
                            >
                                {isAllSelected
                                    ? (language === 'es' ? 'Deseleccionar' : 'Deselect')
                                    : (language === 'es' ? 'Todas' : 'All')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.headerRow}>
                        <View style={styles.headerLeft}>
                            <VeyraIconButton
                                variant="ghost"
                                size="sm"
                                icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                                onPress={() => router.back()}
                            />
                            <View style={styles.headerTitleGroup}>
                                <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: 18 }]}>
                                    {t('notes_history.title')}
                                </Text>
                                <Text style={[styles.headerSubtitle, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                    {deletedNotes.length} {language === 'es' ? 'notas en papelera' : 'notes in trash'}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.headerActionsRight}>
                            <VeyraIconButton
                                variant="ghost"
                                size="sm"
                                icon={<Search size={18} color={isSearchOpen ? accent.primary : colors.textSecondary} />}
                                onPress={() => {
                                    LayoutAnimation.configureNext(smoothLayoutAnimation);
                                    setIsSearchOpen(!isSearchOpen);
                                    if (isSearchOpen) setSearchQuery('');
                                }}
                            />

                            {deletedNotes.length > 0 && (
                                <VeyraIconButton
                                    variant="danger"
                                    size="sm"
                                    icon={<Trash2 size={17} color={isDark ? '#FB7185' : '#E11D48'} />}
                                    onPress={handleEmptyTrash}
                                />
                            )}
                        </View>
                    </View>
                )}

                {/* Barra de búsqueda expandible */}
                {isSearchOpen && !isSelectionMode && (
                    <View style={styles.searchBarContainer}>
                        <VeyraSurface level={2} radius="pill" style={styles.searchBarSurface}>
                            <Search size={15} color={colors.textMuted} style={{ marginLeft: 10 }} />
                            <TextInput
                                placeholder={language === 'es' ? 'Buscar en papelera...' : 'Search in trash...'}
                                placeholderTextColor={colors.textMuted}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                style={[
                                    styles.searchInput,
                                    { color: colors.textPrimary, fontSize: typography.body.fontSize },
                                ]}
                                autoFocus
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity
                                    onPress={() => setSearchQuery('')}
                                    style={styles.searchClearBtn}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <X size={14} color={colors.textMuted} />
                                </TouchableOpacity>
                            )}
                        </VeyraSurface>
                    </View>
                )}
            </View>

            {/* List */}
            <FlatList
                data={filteredNotes}
                renderItem={renderItem}
                keyExtractor={item => item.id}
                contentContainerStyle={[
                    styles.listContent,
                    { paddingBottom: insets.bottom + (isSelectionMode ? 140 : 40) },
                ]}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <View style={[styles.emptyIconWrapper, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
                            <FileText size={32} color={colors.textMuted} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                            {searchQuery.length > 0
                                ? (language === 'es' ? 'Sin coincidencias' : 'No matches found')
                                : t('notes_history.empty_trash_title')}
                        </Text>
                        <Text style={[styles.emptySubtitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                            {searchQuery.length > 0
                                ? (language === 'es' ? 'Intenta con otro término de búsqueda.' : 'Try another search keyword.')
                                : t('notes_history.empty_trash_desc')}
                        </Text>
                    </View>
                }
            />

            {/* Píldora Flotante de Acciones en Selección */}
            {isSelectionMode && (
                <View
                    pointerEvents="box-none"
                    style={[
                        styles.floatingSelectionPillWrapper,
                        { bottom: insets.bottom + 16 },
                    ]}
                >
                    <VeyraGlass
                        intensity={90}
                        radius="pill"
                        bordered
                        style={styles.floatingSelectionGlass}
                        contentStyle={styles.floatingSelectionContent}
                    >
                        <TouchableOpacity
                            style={[styles.pillActionBtn, { backgroundColor: isDark ? 'rgba(52, 211, 153, 0.16)' : 'rgba(5, 150, 105, 0.12)' }]}
                            onPress={handleBulkRestore}
                            activeOpacity={0.75}
                            delayPressIn={0}
                        >
                            <RefreshCw size={15} color={isDark ? '#34D399' : '#059669'} />
                            <Text style={[styles.pillActionText, { color: isDark ? '#34D399' : '#059669' }]}>
                                {language === 'es' ? `Restaurar (${selectedItems.length})` : `Restore (${selectedItems.length})`}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.pillActionBtn, { backgroundColor: isDark ? 'rgba(244, 63, 94, 0.16)' : 'rgba(225, 29, 72, 0.12)' }]}
                            onPress={handleBulkDeleteForever}
                            activeOpacity={0.75}
                            delayPressIn={0}
                        >
                            <Trash2 size={15} color={isDark ? '#FB7185' : '#E11D48'} />
                            <Text style={[styles.pillActionText, { color: isDark ? '#FB7185' : '#E11D48' }]}>
                                {language === 'es' ? `Eliminar (${selectedItems.length})` : `Delete (${selectedItems.length})`}
                            </Text>
                        </TouchableOpacity>
                    </VeyraGlass>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 44,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    headerTitleGroup: {
        justifyContent: 'center',
    },
    headerTitle: {
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    headerSubtitle: {
        fontWeight: '500',
        marginTop: 1,
    },
    headerActionsRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerSelectAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
    },
    headerSelectAllText: {
        fontWeight: '700',
    },
    searchBarContainer: {
        marginTop: 8,
        marginBottom: 2,
    },
    searchBarSurface: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 38,
        paddingRight: 8,
    },
    searchInput: {
        flex: 1,
        paddingHorizontal: 8,
        paddingVertical: 0,
        height: '100%',
    },
    searchClearBtn: {
        padding: 4,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingTop: 14,
    },
    itemWrapper: {
        marginBottom: 10,
    },
    itemCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
    },
    itemMainCol: {
        flex: 1,
        gap: 4,
        paddingRight: 10,
    },
    itemTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    selectionCheck: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemTitle: {
        fontWeight: '700',
        flex: 1,
    },
    mediaBadge: {
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemPreview: {
        lineHeight: 18,
        marginTop: 2,
    },
    itemDate: {
        fontWeight: '500',
        marginTop: 4,
    },
    actionsCol: {
        flexDirection: 'row',
        gap: 6,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        gap: 8,
    },
    emptyIconWrapper: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        marginBottom: 8,
    },
    emptyTitle: {
        fontWeight: '800',
    },
    emptySubtitle: {
        textAlign: 'center',
        paddingHorizontal: 24,
    },
    floatingSelectionPillWrapper: {
        position: 'absolute',
        left: 20,
        right: 20,
        alignItems: 'center',
        zIndex: 999,
    },
    floatingSelectionGlass: {
        width: '100%',
        maxWidth: 380,
    },
    floatingSelectionContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingVertical: 8,
        paddingHorizontal: 12,
        gap: 10,
    },
    pillActionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 999,
    },
    pillActionText: {
        fontWeight: '700',
        fontSize: 13,
    },
});
