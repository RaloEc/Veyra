import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    LayoutAnimation,
    TextInput,
    Alert,
    Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import {
    ChevronLeft,
    RefreshCw,
    Trash2,
    CheckCircle2,
    Trash,
    AlertCircle,
    Clock,
    Check,
    Search,
    X,
    CheckSquare,
    Square,
    RotateCcw,
} from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { useStore } from '../src/store/useStore';
import { Reminder } from '../src/types/db';
import { extractPlainTextFromPages } from '../src/utils/pageUtils';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraGlass } from '../src/components/ui/VeyraGlass';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';

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

export default function HistoryScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const {
        history,
        loadHistory,
        restoreReminder,
        restoreRemindersBatch,
        reactivateReminder,
        reactivateRemindersBatch,
        deleteReminder,
        deleteForever,
        deleteRemindersForeverBatch,
        emptyRemindersTrash,
        language,
    } = useStore();
    const insets = useSafeAreaInsets();
    const { colors, typography, accent, isDark } = useVeyraTheme();

    const [filter, setFilter] = useState<'completed' | 'deleted'>('completed');
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const isSelectionMode = selectedItems.length > 0;

    useFocusEffect(
        useCallback(() => {
            loadHistory();
        }, [])
    );

    const completedCount = useMemo(
        () => history.filter(item => item.status === 'completed' && item.deleted === 0).length,
        [history]
    );

    const deletedCount = useMemo(
        () => history.filter(item => item.deleted === 1).length,
        [history]
    );

    const filteredHistory = useMemo(() => {
        return history.filter(item => {
            const matchesTab =
                filter === 'completed'
                    ? item.status === 'completed' && item.deleted === 0
                    : item.deleted === 1;

            if (!matchesTab) return false;

            if (searchQuery.trim().length > 0) {
                const query = searchQuery.toLowerCase().trim();
                const titleMatch = item.title?.toLowerCase().includes(query);
                const descText = item.description ? extractPlainTextFromPages(item.description).toLowerCase() : '';
                const descMatch = descText.includes(query);
                return titleMatch || descMatch;
            }

            return true;
        });
    }, [history, filter, searchQuery]);

    const handleFilterChange = (newFilter: 'completed' | 'deleted') => {
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        setFilter(newFilter);
        setSelectedItems([]);
    };

    const toggleSelection = (id: string) => {
        setSelectedItems(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
    };

    const handleSelectAll = () => {
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        const allIds = filteredHistory.map(item => item.id);
        if (selectedItems.length === allIds.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(allIds);
        }
    };

    const handlePress = (item: Reminder) => {
        if (isSelectionMode) {
            toggleSelection(item.id);
        } else {
            router.push({ pathname: '/reminder/[id]', params: { id: item.id } });
        }
    };

    const handleLongPress = (item: Reminder) => {
        if (!isSelectionMode) {
            LayoutAnimation.configureNext(smoothLayoutAnimation);
            setSelectedItems([item.id]);
        } else {
            toggleSelection(item.id);
        }
    };

    // Acciones individuales
    const handleReactivateSingle = async (id: string) => {
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        await reactivateReminder(id);
    };

    const handleRestoreSingle = async (id: string) => {
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        await restoreReminder(id);
    };

    const handleMoveToTrashSingle = async (id: string) => {
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        await deleteReminder(id);
        await loadHistory();
    };

    const handleDeleteForeverSingle = (id: string) => {
        Alert.alert(
            language === 'es' ? '¿Eliminar definitivamente?' : 'Delete permanently?',
            language === 'es'
                ? 'Esta acción no se puede deshacer y borrará el recordatorio para siempre.'
                : 'This action cannot be undone and will permanently erase this reminder.',
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
    const handleBulkReactivate = async () => {
        if (selectedItems.length === 0) return;
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        const ids = [...selectedItems];
        setSelectedItems([]);
        await reactivateRemindersBatch(ids);
    };

    const handleBulkRestore = async () => {
        if (selectedItems.length === 0) return;
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        const ids = [...selectedItems];
        setSelectedItems([]);
        await restoreRemindersBatch(ids);
    };

    const handleBulkMoveToTrash = async () => {
        if (selectedItems.length === 0) return;
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        const ids = [...selectedItems];
        setSelectedItems([]);
        for (const id of ids) {
            await deleteReminder(id);
        }
        await loadHistory();
    };

    const handleBulkDeleteForever = () => {
        if (selectedItems.length === 0) return;
        const count = selectedItems.length;
        Alert.alert(
            language === 'es' ? `¿Eliminar ${count} recordatorios?` : `Delete ${count} reminders?`,
            language === 'es'
                ? 'Se eliminarán definitivamente y no se podrán recuperar.'
                : 'They will be permanently deleted and cannot be restored.',
            [
                { text: language === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
                {
                    text: language === 'es' ? 'Eliminar permanentemente' : 'Delete permanently',
                    style: 'destructive',
                    onPress: async () => {
                        LayoutAnimation.configureNext(smoothLayoutAnimation);
                        const ids = [...selectedItems];
                        setSelectedItems([]);
                        await deleteRemindersForeverBatch(ids);
                    },
                },
            ]
        );
    };

    const handleEmptyTrash = () => {
        if (deletedCount === 0) return;
        Alert.alert(
            language === 'es' ? '¿Vaciar papelera de recordatorios?' : 'Empty reminders trash?',
            language === 'es'
                ? `Se eliminarán definitivamente los ${deletedCount} recordatorios de la papelera.`
                : `All ${deletedCount} reminders in the trash will be permanently erased.`,
            [
                { text: language === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
                {
                    text: language === 'es' ? 'Vaciar papelera' : 'Empty trash',
                    style: 'destructive',
                    onPress: async () => {
                        LayoutAnimation.configureNext(smoothLayoutAnimation);
                        setSelectedItems([]);
                        await emptyRemindersTrash();
                    },
                },
            ]
        );
    };

    const isAllSelected = filteredHistory.length > 0 && selectedItems.length === filteredHistory.length;

    const renderItem = ({ item }: { item: Reminder }) => {
        const isDeleted = filter === 'deleted';
        const date = item.last_modified_ms || item.due_date_ms;
        const isSelected = selectedItems.includes(item.id);

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

                            {filter === 'completed' ? (
                                <CheckCircle2 size={16} color={isDark ? '#34D399' : '#059669'} />
                            ) : (
                                <Trash size={15} color={isDark ? '#FB7185' : '#E11D48'} />
                            )}

                            <Text
                                style={[
                                    styles.itemTitle,
                                    { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize },
                                ]}
                                numberOfLines={1}
                            >
                                {item.title}
                            </Text>
                        </View>

                        {item.description ? (
                            <Text
                                style={[
                                    styles.itemPreview,
                                    { color: colors.textMuted, fontSize: typography.caption.fontSize },
                                ]}
                                numberOfLines={1}
                            >
                                {extractPlainTextFromPages(item.description)}
                            </Text>
                        ) : null}

                        <View style={styles.itemMetaRow}>
                            <Clock size={11} color={colors.textSecondary} />
                            <Text style={[styles.itemDate, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                                {filter === 'completed'
                                    ? (language === 'es' ? 'Completado: ' : 'Completed: ')
                                    : (language === 'es' ? 'Eliminado: ' : 'Deleted: ')}
                                {format(date, language === 'es' ? "d 'de' MMMM, HH:mm" : 'MMMM d, HH:mm', {
                                    locale: language === 'es' ? es : enUS,
                                })}
                            </Text>
                        </View>
                    </View>

                    {!isSelectionMode && (
                        <View style={styles.actionsCol}>
                            {isDeleted ? (
                                <>
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
                                </>
                            ) : (
                                <>
                                    <VeyraIconButton
                                        variant="surface"
                                        size="sm"
                                        icon={<RotateCcw size={15} color={isDark ? '#34D399' : '#059669'} />}
                                        onPress={() => handleReactivateSingle(item.id)}
                                    />
                                    <VeyraIconButton
                                        variant="ghost"
                                        size="sm"
                                        icon={<Trash size={15} color={colors.textSecondary} />}
                                        onPress={() => handleMoveToTrashSingle(item.id)}
                                    />
                                </>
                            )}
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
                                    : (language === 'es' ? 'Todos' : 'All')}
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
                                    {t('history.title')}
                                </Text>
                                <Text style={[styles.headerSubtitle, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                    {filter === 'completed'
                                        ? `${completedCount} ${language === 'es' ? 'completados' : 'completed'}`
                                        : `${deletedCount} ${language === 'es' ? 'en papelera' : 'in trash'}`}
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

                            {filter === 'deleted' && deletedCount > 0 && (
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
                                placeholder={language === 'es' ? 'Buscar en historial...' : 'Search in history...'}
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

            {/* Segmented Control con Contadores */}
            <View style={styles.tabsContainer}>
                <VeyraSurface
                    level={1}
                    radius="pill"
                    style={styles.segmentedControl}
                >
                    <TouchableOpacity
                        activeOpacity={0.8}
                        delayPressIn={0}
                        onPress={() => handleFilterChange('completed')}
                        style={[
                            styles.tabButton,
                            filter === 'completed' && [
                                styles.tabButtonActive,
                                { backgroundColor: colors.surfaceElevated },
                            ],
                        ]}
                    >
                        <CheckCircle2
                            size={14}
                            color={filter === 'completed' ? (isDark ? '#34D399' : '#059669') : colors.textMuted}
                        />
                        <Text
                            style={[
                                styles.tabText,
                                {
                                    color: filter === 'completed' ? colors.textPrimary : colors.textMuted,
                                    fontWeight: filter === 'completed' ? '800' : '600',
                                    fontSize: typography.caption.fontSize,
                                },
                            ]}
                        >
                            {t('history.completed_tab')} ({completedCount})
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        activeOpacity={0.8}
                        delayPressIn={0}
                        onPress={() => handleFilterChange('deleted')}
                        style={[
                            styles.tabButton,
                            filter === 'deleted' && [
                                styles.tabButtonActive,
                                { backgroundColor: colors.surfaceElevated },
                            ],
                        ]}
                    >
                        <Trash
                            size={14}
                            color={filter === 'deleted' ? (isDark ? '#FB7185' : '#E11D48') : colors.textMuted}
                        />
                        <Text
                            style={[
                                styles.tabText,
                                {
                                    color: filter === 'deleted' ? colors.textPrimary : colors.textMuted,
                                    fontWeight: filter === 'deleted' ? '800' : '600',
                                    fontSize: typography.caption.fontSize,
                                },
                            ]}
                        >
                            {t('history.trash_tab')} ({deletedCount})
                        </Text>
                    </TouchableOpacity>
                </VeyraSurface>
            </View>

            {/* List */}
            <FlatList
                data={filteredHistory}
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
                            {filter === 'completed' ? (
                                <Clock size={32} color={colors.textMuted} />
                            ) : (
                                <AlertCircle size={32} color={colors.textMuted} />
                            )}
                        </View>
                        <Text style={[styles.emptyTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                            {searchQuery.length > 0
                                ? (language === 'es' ? 'Sin coincidencias' : 'No matches found')
                                : filter === 'completed'
                                ? t('history.empty_completed_title')
                                : t('history.empty_trash_title')}
                        </Text>
                        <Text style={[styles.emptySubtitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                            {searchQuery.length > 0
                                ? (language === 'es' ? 'Intenta con otro término de búsqueda.' : 'Try another search keyword.')
                                : filter === 'completed'
                                ? t('history.empty_completed_desc')
                                : t('history.empty_trash_desc')}
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
                        {filter === 'completed' ? (
                            <>
                                <TouchableOpacity
                                    style={[styles.pillActionBtn, { backgroundColor: isDark ? 'rgba(52, 211, 153, 0.16)' : 'rgba(5, 150, 105, 0.12)' }]}
                                    onPress={handleBulkReactivate}
                                    activeOpacity={0.75}
                                    delayPressIn={0}
                                >
                                    <RotateCcw size={15} color={isDark ? '#34D399' : '#059669'} />
                                    <Text style={[styles.pillActionText, { color: isDark ? '#34D399' : '#059669' }]}>
                                        {language === 'es' ? `Reactivar (${selectedItems.length})` : `Reactivate (${selectedItems.length})`}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.pillActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                                    onPress={handleBulkMoveToTrash}
                                    activeOpacity={0.75}
                                    delayPressIn={0}
                                >
                                    <Trash size={15} color={colors.textSecondary} />
                                    <Text style={[styles.pillActionText, { color: colors.textPrimary }]}>
                                        {language === 'es' ? `Papelera (${selectedItems.length})` : `Trash (${selectedItems.length})`}
                                    </Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
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
                            </>
                        )}
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
    tabsContainer: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 4,
    },
    segmentedControl: {
        flexDirection: 'row',
        padding: 4,
    },
    tabButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 999,
        gap: 6,
    },
    tabButtonActive: {},
    tabText: {},
    listContent: {
        paddingHorizontal: 20,
        paddingTop: 12,
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
    itemPreview: {
        lineHeight: 16,
        marginTop: 2,
    },
    itemMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    itemDate: {
        fontWeight: '500',
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
