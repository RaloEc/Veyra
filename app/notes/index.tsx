import { FlatList, TouchableOpacity, StatusBar, LayoutAnimation, Platform, UIManager, BackHandler } from 'react-native';
import { useStore } from '../../src/store/useStore';
import { useNotesStore } from '../../src/store/useNotesStore';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { XStack, YStack, Text, Button, Input, Separator, AnimatePresence, View } from 'tamagui';
import { useTranslation } from 'react-i18next';
import { Plus, ChevronLeft, Search, FileText, Pin, Trash2, Edit3, LayoutGrid, List, History } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import RenderHtml from 'react-native-render-html';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function NotesScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { theme } = useStore();
    const notes = useNotesStore(state => state.notes);
    const loadNotes = useNotesStore(state => state.loadNotes);
    const deleteNote = useNotesStore(state => state.deleteNote);
    const updateNote = useNotesStore(state => state.updateNote);
    const insets = useSafeAreaInsets();

    const togglePin = async (id: string, currentPinStatus: number) => {
        await updateNote(id, { is_pinned: currentPinStatus === 1 ? 0 : 1 });
    };

    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
    const isDark = theme === 'dark';
    const isSelectionMode = selectedNotes.length > 0;

    const toggleSelection = (id: string) => {
        if (selectedNotes.includes(id)) {
            setSelectedNotes(prev => prev.filter(noteId => noteId !== id));
        } else {
            setSelectedNotes(prev => [...prev, id]);
        }
    };

    const handlePress = (id: string) => {
        if (isSelectionMode) {
            toggleSelection(id);
        } else {
            router.push(`/notes/${id}`);
        }
    };

    const handleLongPress = (id: string) => {
        if (!isSelectionMode) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSelectedNotes([id]);
        } else {
            toggleSelection(id);
        }
    };

    const handleDeleteSelected = async () => {
        for (const id of selectedNotes) {
            await deleteNote(id);
        }
        setSelectedNotes([]);
        loadNotes();
    };

    useEffect(() => {
        const backAction = () => {
            if (isSelectionMode) {
                setSelectedNotes([]);
                return true; // Previene el comportamiento por defecto de volver atrás
            }
            return false; // Permite el comportamiento por defecto
        };

        const backHandler = BackHandler.addEventListener(
            'hardwareBackPress',
            backAction,
        );

        return () => backHandler.remove();
    }, [isSelectionMode]);

    useEffect(() => {
        if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
            UIManager.setLayoutAnimationEnabledExperimental(true);
        }
    }, []);

    useEffect(() => {
        loadNotes();
    }, []);

    const filteredNotes = notes.filter(note =>
    (note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const renderNoteItem = ({ item }: { item: any }) => {
        // Simple HTML strip for preview
        const plainText = item.content?.replace(/<[^>]+>/g, '') || '';
        const previewText = plainText.length > (viewMode === 'grid' ? 100 : 200) ? plainText.substring(0, viewMode === 'grid' ? 100 : 200) + '...' : plainText;
        const isSelected = selectedNotes.includes(item.id);

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handlePress(item.id)}
                onLongPress={() => handleLongPress(item.id)}
                style={{
                    flex: 1,
                    margin: viewMode === 'grid' ? 6 : 0,
                    marginBottom: viewMode === 'grid' ? 6 : 12,
                    transform: isSelected ? [{ scale: 0.95 }] : [{ scale: 1 }],
                }}
            >
                <YStack
                    bg={isSelected ? (isDark ? '#333333' : '#E2E8F0') : (isDark ? '#1a1a1a' : 'white')}
                    p="$3"
                    borderRadius="$4"
                    borderWidth={isSelected ? 2 : 1}
                    borderColor={isSelected ? '$blue8' : (isDark ? '#333' : '#eee')}
                    minHeight={viewMode === 'grid' ? 120 : 80}
                    justifyContent="space-between"
                    shadowColor="black"
                    shadowOpacity={0.05}
                    shadowRadius={5}
                    shadowOffset={{ width: 0, height: 2 }}
                    // @ts-ignore
                    animation="quick"
                    enterStyle={{ opacity: 0, scale: 0.95 }}
                >
                    <YStack gap="$2">
                        <XStack justifyContent="space-between" alignItems="flex-start">
                            <Text
                                fontSize="$4"
                                fontWeight="700"
                                color={isDark ? 'white' : 'black'}
                                numberOfLines={viewMode === 'grid' ? 2 : 1}
                                style={{ flex: 1, marginRight: 8 }}
                            >
                                {item.title || t('notes.no_title')}
                            </Text>
                            {item.is_pinned === 1 && (
                                <Pin size={14} color="#F59E0B" style={{ transform: [{ rotate: '45deg' }] }} />
                            )}
                        </XStack>

                        <Text fontSize="$3" color={isDark ? '#aaa' : '#666'} numberOfLines={viewMode === 'grid' ? 4 : 2} lineHeight={18}>
                            {previewText || t('notes.no_content')}
                        </Text>
                    </YStack>

                    <XStack justifyContent="space-between" alignItems="center" mt="$3">
                        <Text fontSize="$2" color={isDark ? '#666' : '#999'}>
                            {format(item.updated_at_ms, "d MMM", { locale: es })}
                        </Text>
                    </XStack>
                </YStack>
            </TouchableOpacity>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? '#0a0a0a' : '#F8FAFC' }}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

            {/* Header */}
            <YStack px="$4" py="$1" gap="$4">
                {isSelectionMode ? (
                    <XStack alignItems="center" justifyContent="space-between" h={40} mb="$2">
                        <XStack alignItems="center" gap="$3">
                            <TouchableOpacity onPress={() => setSelectedNotes([])}>
                                <ChevronLeft size={28} color={isDark ? 'white' : 'black'} />
                            </TouchableOpacity>
                            <Text fontSize="$6" fontWeight="900" color={isDark ? 'white' : 'black'}>
                                {selectedNotes.length} {t('notes.selected')}
                            </Text>
                        </XStack>

                        <TouchableOpacity
                            onPress={handleDeleteSelected}
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
                            <Trash2 size={22} color="$red9" />
                        </TouchableOpacity>
                    </XStack>
                ) : (
                    <XStack alignItems="center" justifyContent="space-between" h={40} mb="$2">
                        <XStack alignItems="center" gap="$3">
                            <TouchableOpacity onPress={() => router.replace('/')}>
                                <ChevronLeft size={28} color={isDark ? 'white' : 'black'} />
                            </TouchableOpacity>
                            <Text fontSize="$6" fontWeight="900" color={isDark ? 'white' : 'black'}>
                                {t('notes.title')}
                            </Text>
                        </XStack>

                        <XStack gap="$4" alignItems="center">
                            <TouchableOpacity
                                onPress={() => router.push('/notes-history')}
                                style={{ padding: 4 }}
                            >
                                <History size={20} color={isDark ? '#A1A1A1' : '#64748B'} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => {
                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                    setViewMode(viewMode === 'grid' ? 'list' : 'grid');
                                }}
                                style={{ padding: 4 }}
                            >
                                {viewMode === 'grid' ? (
                                    <List size={20} color={isDark ? '#A1A1A1' : '#64748B'} />
                                ) : (
                                    <LayoutGrid size={20} color={isDark ? '#A1A1A1' : '#64748B'} />
                                )}
                            </TouchableOpacity>
                        </XStack>
                    </XStack>
                )}

                <XStack
                    background={isDark ? '#1a1a1a' : 'white'}
                    height={45}
                    borderRadius="$4"
                    alignItems="center"
                    px="$3"
                    borderWidth={1}
                    borderColor={isDark ? '#333' : '#eee'}
                >
                    <Search size={18} color={isDark ? '#666' : '#999'} />
                    <Input
                        flex={1}
                        unstyled
                        placeholder={t('notes.search_placeholder')}
                        placeholderTextColor={isDark ? '#666' : '#999'}
                        color={isDark ? 'white' : 'black'}
                        ml="$2"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </XStack>
            </YStack>

            <FlatList
                key={viewMode}
                data={filteredNotes}
                renderItem={renderNoteItem}
                keyExtractor={item => item.id}
                numColumns={viewMode === 'grid' ? 2 : 1}
                contentContainerStyle={{ padding: 10, paddingBottom: 100 }}
                columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between' } : undefined}
                ListEmptyComponent={
                    <YStack alignItems="center" justifyContent="center" py="$10" gap="$4">
                        <View style={{
                            width: 80,
                            height: 80,
                            borderRadius: 40,
                            backgroundColor: isDark ? '#1a1a1a' : '#f0f0f0',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <FileText size={40} color={isDark ? '#333' : '#ccc'} />
                        </View>
                        <Text fontSize="$5" color={isDark ? '#666' : '#999'} fontWeight="600">
                            {t('notes.no_notes')}
                        </Text>
                    </YStack>
                }
            />

            {/* Floating Action Button (FAB) con el mismo diseño premium que los recordatorios */}
            <AnimatePresence>
                {!isSelectionMode && (
                    <YStack
                        key="floating-create-note-container"
                        position="absolute"
                        bottom={insets.bottom + 30}
                        alignSelf="center"
                        zIndex={1000}
                        // @ts-ignore
                        animation="quick"
                        enterStyle={{ opacity: 0, scale: 0.8, y: 50 }}
                        exitStyle={{ opacity: 0, scale: 0.8, y: 50 }}
                    >
                        <Button
                            size="$4"
                            borderRadius={100}
                            height={52}
                            backgroundColor={isDark ? '#FFFFFF' : '#000000'}
                            borderWidth={0}
                            elevation={15}
                            shadowColor={isDark ? '$white' : '$black'}
                            shadowOffset={{ width: 0, height: 8 }}
                            shadowOpacity={0.25}
                            shadowRadius={15}
                            pressStyle={{
                                scale: 0.95,
                                opacity: 0.9,
                                background: isDark ? '#f0f0f0' : '#1a1a1a'
                            }}
                            onPress={() => router.push('/notes/create')}
                            icon={<Plus size={20} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={3} />}
                            paddingHorizontal="$5"
                        >
                            <Text
                                color={isDark ? '#000000' : '#FFFFFF'}
                                fontWeight="900"
                                fontSize="$4"
                                letterSpacing={1.5}
                                textTransform="uppercase"
                            >
                                {t('notes.fab_note')}
                            </Text>
                        </Button>
                    </YStack>
                )}
            </AnimatePresence>
        </View >
    );
}
