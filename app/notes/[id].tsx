import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Keyboard,
    Platform,
    ScrollView,
    Image,
    Animated,
    BackHandler,
    useWindowDimensions,
    FlatList,
    Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
    ChevronLeft,
    Trash2,
    Pin,
    Edit3,
    Check,
    FileText,
    Paperclip,
    X,
    Columns,
    Rows,
    Plus,
    Layers,
    Calendar,
    MoreVertical,
    Undo2,
    Redo2,
} from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import ImageViewing from 'react-native-image-viewing';
import { Image as ExpoImage } from 'expo-image';
import * as NavigationBar from 'expo-navigation-bar';

import { useCreateNote } from '../../src/hooks/useCreateNote';
import { useStore } from '../../src/store/useStore';
import { useFoldersStore } from '../../src/store/useFoldersStore';
import { useEventsStore } from '../../src/store/useEventsStore';
import { useCardTransitionStore } from '../../src/store/cardTransitionStore';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    interpolate,
    Extrapolation,
    runOnJS,
    Easing as ReanimatedEasing,
} from 'react-native-reanimated';
import { TitleInput } from '../../src/components/create/TitleInput';
import { RichTextEditorSection } from '../../src/components/create/RichTextEditorSection';
import { AttachmentBottomSheet } from '../../src/components/create/AttachmentBottomSheet';
import { RichTextToolbar } from '../../src/components/create/RichTextToolbar';
import { ImageCropperModal } from '../../src/components/create/ImageCropperModal';
import { PremiumAlert } from '../../src/components/ui/PremiumAlert';
import { useVeyraTheme } from '../../src/theme/useVeyraTheme';
import { VeyraIconButton, VeyraButton, VeyraSurface } from '../../src/components/ui';
import { useAdaptiveKeyboard } from '../../src/hooks/useAdaptiveKeyboard';
import { PagesOverviewModal } from '../../src/components/notes/PagesOverviewModal';
import { FolderIconRenderer } from '../../src/components/notes/FolderIconRenderer';
import { MoveToFolderModal } from '../../src/components/notes/MoveToFolderModal';
import { FolderModal } from '../../src/components/notes/FolderModal';
import { NoteOptionsMenu } from '../../src/components/notes/NoteOptionsMenu';
import { exportNoteToPdf } from '../../src/utils/pdfExportUtils';

export default function NoteDetailAndEditScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();
    const language = useStore(state => state.language);
    const isCreating = !id || id === 'create';
    const [isEditMode, setIsEditMode] = useState(isCreating);
    const [isNotesFocused, setIsNotesFocused] = useState(false);
    const [galleryVisible, setGalleryVisible] = useState(false);
    const [galleryIndex, setGalleryIndex] = useState(0);
    const [isPagesModalVisible, setIsPagesModalVisible] = useState(false);
    const [isOptionsMenuVisible, setIsOptionsMenuVisible] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);

    const folders = useFoldersStore(state => state.folders);
    const createFolder = useFoldersStore(state => state.createFolder);
    const events = useEventsStore(state => state.events);

    const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
    const [isCreateFolderModalVisible, setIsCreateFolderModalVisible] = useState(false);

    const { lift, isKeyboardVisible } = useAdaptiveKeyboard(insets.bottom);

    const toolbarPaddingBottom = Platform.OS === 'ios'
        ? (isKeyboardVisible ? 6 : Math.max(insets.bottom, 8))
        : Math.max(insets.bottom, 8);
    const toolbarHeight = 49 + toolbarPaddingBottom;
    const floatingPillBottom = isEditMode
        ? ((isKeyboardVisible ? lift : 0) + toolbarHeight + 10)
        : (insets.bottom + 16);

    const horizontalListRef = useRef<FlatList>(null);

    // Animaciones Orquestadas en Cascada — Inicializadas en 1 para garantizar visibilidad inmediata
    const headerAnim = useRef(new Animated.Value(1)).current;
    const titleAnim = useRef(new Animated.Value(1)).current;
    const bodyAnim = useRef(new Animated.Value(1)).current;

    const isExiting = useRef(false);


    useEffect(() => {
        if (Platform.OS === 'android') {
            try {
                if (typeof NavigationBar.setStyle === 'function') {
                    NavigationBar.setStyle(isDark ? 'light' : 'dark');
                }
            } catch {
                // ignore
            }
        }
    }, [isDark]);

    const {
        title,
        setTitle,
        pages,
        currentPageIndex,
        setCurrentPageIndex,
        undo,
        redo,
        canUndo,
        canRedo,
        editorRefs,
        updatePageContent,
        addPage,
        deletePage,
        duplicatePage,
        insertPageAfter,
        renamePage,
        movePage,
        reorderPages,
        scrollLayout,
        setScrollLayout,
        folderId,
        setFolderId,
        eventId,
        attachments,
        isPinned,
        setIsPinned,
        saveSilently,
        handleDelete,
        pickImage,
        pickImageForEditor,
        processCroppedImage,
        cropperUri,
        setCropperUri,
        isCropperVisible,
        setIsCropperVisible,
        pickDocument,
        removeAttachment,
        openAttachment,
        isEditing,
        isLoading,
        alertVisible,
        setAlertVisible,
        alertConfig,
        maxAttachments,
    } = useCreateNote(id);

    const currentFolder = folders.find(f => f.id === folderId);
    const linkedEvent = events.find(e => e.id === eventId);

    const activeEditorRef = {
        current: editorRefs.current[currentPageIndex] || editorRefs.current[0] || null,
    };

    useFocusEffect(
        React.useCallback(() => {
            isExiting.current = false;
            headerAnim.setValue(1);
            titleAnim.setValue(1);
            bodyAnim.setValue(1);

            const onHardwareBack = () => {
                if (isOptionsMenuVisible) {
                    setIsOptionsMenuVisible(false);
                    return true;
                }
                if (isPagesModalVisible) {
                    setIsPagesModalVisible(false);
                    return true;
                }
                if (isCropperVisible) {
                    setIsCropperVisible(false);
                    return true;
                }
                if (alertVisible) {
                    setAlertVisible(false);
                    return true;
                }
                handleBack();
                return true;
            };
            const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
            return () => subscription.remove();
        }, [isEditMode, isOptionsMenuVisible, isPagesModalVisible, isCropperVisible, alertVisible])
    );

    const editModeAnim = useRef(new Animated.Value(isCreating ? 1 : 0)).current;

    const handleEnterEditMode = () => {
        setIsEditMode(true);
        Animated.spring(editModeAnim, {
            toValue: 1,
            tension: 65,
            friction: 8,
            useNativeDriver: true,
        }).start();
    };

    const handleExitEditMode = async () => {
        Keyboard.dismiss();
        await saveSilently();
        Animated.timing(editModeAnim, {
            toValue: 0,
            duration: 160,
            useNativeDriver: true,
        }).start(() => {
            setIsEditMode(false);
        });
    };

    const handleInsertImage = async (useCamera: boolean) => {
        setIsEditingExistingImage(false);
        const pickedUri = await pickImage(useCamera);
        if (!pickedUri) return;

        const base64Data = await processCroppedImage(pickedUri);
        const finalUri = base64Data || pickedUri;

        activeEditorRef.current?.insertImage(
            finalUri,
            'width: 75%; border-radius: 10px; display: block; margin: 12px auto;'
        );
        setTimeout(() => {
            activeEditorRef.current?.insertHTML('<br/>');
            activeEditorRef.current?.focusContentEditor();
        }, 300);
    };

    const handleExportPdf = async () => {
        try {
            setIsExportingPdf(true);
            await exportNoteToPdf(title, pages);
        } catch (error) {
            console.error('Error exporting note to PDF:', error);
            Alert.alert(
                t('common.error', { defaultValue: 'Error' }),
                t('notes.export_pdf_error', { defaultValue: 'No se pudo generar el documento PDF.' })
            );
        } finally {
            setIsExportingPdf(false);
        }
    };

    const handleBack = async () => {
        if (isEditMode) {
            await handleExitEditMode();
        } else {
            if (isExiting.current) return;
            isExiting.current = true;
            router.back();
        }
    };

    const [isEditingExistingImage, setIsEditingExistingImage] = useState(false);
    const [isDraggingImage, setIsDraggingImage] = useState(false);
    const verticalScrollRef = useRef<ScrollView>(null);
    const currentScrollY = useRef<number>(0);

    const handleAutoScroll = useCallback((deltaY: number) => {
        if (verticalScrollRef.current) {
            currentScrollY.current = Math.max(0, currentScrollY.current + deltaY);
            verticalScrollRef.current.setNativeProps?.({ scrollEnabled: true });
            verticalScrollRef.current.scrollTo({ y: currentScrollY.current, animated: false });
            verticalScrollRef.current.setNativeProps?.({ scrollEnabled: false });
        }
    }, []);

    const imageAttachments = attachments.filter(item => {
        const uri = item.uri.toLowerCase();
        return (
            uri.includes('imagepicker') ||
            uri.endsWith('.jpg') ||
            uri.endsWith('.png') ||
            uri.endsWith('.jpeg') ||
            uri.endsWith('.webp') ||
            uri.startsWith('data:image')
        );
    });

    const otherAttachments = attachments.filter(item => !imageAttachments.includes(item));
    const pageLayoutsRef = useRef<{ [index: number]: number }>({});

    const handleSelectPage = (index: number) => {
        setCurrentPageIndex(index);
        if (scrollLayout === 'horizontal') {
            if (horizontalListRef.current) {
                horizontalListRef.current.scrollToIndex({ index, animated: true });
            }
        } else {
            const targetY = pageLayoutsRef.current[index];
            if (typeof targetY === 'number' && verticalScrollRef.current) {
                verticalScrollRef.current.scrollTo({ y: Math.max(0, targetY - 16), animated: true });
            }
        }
    };

    const renderVertical = () => {
        return (
            <ScrollView
                ref={verticalScrollRef}
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: isEditMode ? insets.bottom + 110 : insets.bottom + 80 }]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets={false}
                nestedScrollEnabled={true}
                scrollEnabled={!isDraggingImage}
                onScroll={(e) => {
                    currentScrollY.current = e.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
            >
                {/* Título en la parte superior del cuerpo de la nota */}
                <Animated.View
                    style={{
                        opacity: titleAnim,
                        marginBottom: 10,
                        transform: [
                            {
                                scale: titleAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.94, 1],
                                    extrapolate: 'clamp',
                                }),
                            },
                            {
                                translateY: titleAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [18, 0],
                                    extrapolate: 'clamp',
                                }),
                            },
                        ],
                    }}
                >
                    {isEditMode ? (
                        <TitleInput
                            title={title}
                            setTitle={setTitle}
                            isEditing={true}
                            flat={true}
                            placeholder={t('create.placeholder_title')}
                            inputStyle={[styles.viewTitle, { color: colors.textPrimary, fontSize: typography.h1.fontSize }]}
                            onSubmit={() => activeEditorRef.current?.focusContentEditor()}
                        />
                    ) : (
                        <Text style={[styles.viewTitle, { color: colors.textPrimary, fontSize: typography.h1.fontSize }]}>
                            {title || t('notes.no_title', { defaultValue: 'Sin título' })}
                        </Text>
                    )}
                </Animated.View>

                <View style={styles.noteBody}>
                    {pages.map((page, index) => {
                        const pageContent = page.content || '';
                        const hasPageContent = Boolean(pageContent.replace(/<[^>]+>/g, '').trim()) || Boolean(pageContent.includes('<img')) || Boolean(pageContent.includes('<input')) || Boolean(pageContent.includes('x-todo'));

                        return (
                            <View
                                key={page.id}
                                style={styles.pageSheetWrapper}
                                onLayout={(e) => {
                                    pageLayoutsRef.current[index] = e.nativeEvent.layout.y;
                                }}
                            >
                                {/* Separador de página a partir de la pág 2 */}
                                {index > 0 && (
                                    <View style={styles.pageBreakDivider}>
                                        <View style={[styles.pageBreakLine, { backgroundColor: colors.borderSubtle }]} />
                                        <View style={[styles.pageBadgePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                                            <Text style={[styles.pageBadgeText, { color: colors.textSecondary }]}>
                                                {t('notes.page_indicator', {
                                                    current: index + 1,
                                                    total: pages.length,
                                                    defaultValue: `Pág. ${index + 1}`,
                                                })}
                                            </Text>
                                        </View>
                                        {isEditMode && pages.length > 1 && (
                                            <Animated.View
                                                style={{
                                                    opacity: editModeAnim,
                                                    transform: [
                                                        {
                                                            scale: editModeAnim.interpolate({
                                                                inputRange: [0, 1],
                                                                outputRange: [0.6, 1],
                                                            }),
                                                        },
                                                    ],
                                                }}
                                            >
                                                <TouchableOpacity
                                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                    onPress={() => deletePage(index)}
                                                    style={styles.deletePageBtn}
                                                >
                                                    <Trash2 size={13} color={isDark ? '#FB7185' : '#E11D48'} />
                                                </TouchableOpacity>
                                            </Animated.View>
                                        )}
                                        <View style={[styles.pageBreakLine, { backgroundColor: colors.borderSubtle }]} />
                                    </View>
                                )}

                                <View style={styles.pageSheetContent}>
                                    {!isEditMode && !hasPageContent ? (
                                        <Text style={[styles.emptyContentText, { color: colors.textMuted }]}>
                                            {t('notes.empty_page', { defaultValue: 'Hoja en blanco' })}
                                        </Text>
                                    ) : (
                                        <RichTextEditorSection
                                            description={pageContent}
                                            setDescription={html => updatePageContent(index, html)}
                                            readOnly={!isEditMode}
                                            isDark={isDark}
                                            editorRef={{
                                                get current() {
                                                    return editorRefs.current[index];
                                                },
                                                set current(val) {
                                                    editorRefs.current[index] = val;
                                                },
                                            }}
                                            onFocus={() => {
                                                setCurrentPageIndex(index);
                                                setIsNotesFocused(true);
                                            }}
                                            onBlur={() => setIsNotesFocused(false)}
                                            flat={true}
                                            onUndo={undo}
                                            onRedo={redo}
                                            onCropImage={uri => {
                                                setIsEditingExistingImage(true);
                                                setCropperUri(uri);
                                                setIsCropperVisible(true);
                                            }}
                                            onDragStateChange={setIsDraggingImage}
                                            onAutoScroll={handleAutoScroll}
                                        />
                                    )}
                                </View>
                            </View>
                        );
                    })}

                    {/* Botón para Añadir Nueva Hoja — Solo en modo edición */}
                    {isEditMode && (
                        <Animated.View
                            style={{
                                opacity: editModeAnim,
                                transform: [
                                    {
                                        translateY: editModeAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [10, 0],
                                        }),
                                    },
                                    {
                                        scale: editModeAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0.95, 1],
                                        }),
                                    },
                                ],
                            }}
                        >
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={addPage}
                                style={[
                                    styles.addPageMinimalBtn,
                                    {
                                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                                        borderColor: colors.borderSubtle,
                                    },
                                ]}
                            >
                                <Plus size={15} color={accent.primary} strokeWidth={2.4} />
                                <Text style={[styles.addPageMinimalText, { color: colors.textPrimary }]}>
                                    {t('notes.add_page', { defaultValue: 'Agregar página' })}
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>
                    )}

                    {/* Adjuntos no visuales */}
                    {otherAttachments.length > 0 && (
                        <View style={{ marginTop: 16, gap: 8 }}>
                            <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                                {t('create.sections.attachments', { defaultValue: 'Archivos adjuntos' }).toUpperCase()} ({otherAttachments.length})
                            </Text>
                            <View style={styles.fileChipsRow}>
                                {otherAttachments.map((file, idx) => (
                                    <TouchableOpacity
                                        key={idx}
                                        activeOpacity={0.8}
                                        onPress={() => openAttachment(file.uri)}
                                        style={[
                                            styles.fileChip,
                                            { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radii.pill, borderWidth: 1 },
                                        ]}
                                    >
                                        <FileText size={14} color={accent.primary} />
                                        <Text style={[styles.fileChipText, { color: colors.textPrimary }]} numberOfLines={1}>
                                            {file.name}
                                        </Text>
                                        {isEditMode && (
                                            <TouchableOpacity
                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                onPress={() => removeAttachment(idx)}
                                            >
                                                <X size={13} color={colors.textMuted} />
                                            </TouchableOpacity>
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}
                </View>
            </ScrollView>
        );
    };

    const renderHorizontal = () => {
        return (
            <View style={{ flex: 1, paddingTop: 10 }}>
                <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                    {isEditMode ? (
                        <TitleInput
                            title={title}
                            setTitle={setTitle}
                            isEditing={true}
                            flat={true}
                            placeholder={t('create.placeholder_title')}
                            inputStyle={[styles.viewTitle, { color: colors.textPrimary, fontSize: typography.h2.fontSize }]}
                            onSubmit={() => activeEditorRef.current?.focusContentEditor()}
                        />
                    ) : (
                        <Text style={[styles.viewTitle, { color: colors.textPrimary, fontSize: typography.h2.fontSize }]}>
                            {title || t('notes.no_title', { defaultValue: 'Sin título' })}
                        </Text>
                    )}
                </View>

                <FlatList
                    ref={horizontalListRef}
                    data={pages}
                    horizontal={true}
                    pagingEnabled={true}
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    snapToInterval={windowWidth}
                    snapToAlignment="center"
                    scrollEnabled={!isDraggingImage}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingHorizontal: 0 }}
                    onMomentumScrollEnd={ev => {
                        const newIdx = Math.round(ev.nativeEvent.contentOffset.x / windowWidth);
                        if (newIdx >= 0 && newIdx < pages.length) {
                            setCurrentPageIndex(newIdx);
                        }
                    }}
                    renderItem={({ item: page, index }) => {
                        const pageContent = page.content || '';
                        const hasPageContent = Boolean(pageContent.replace(/<[^>]+>/g, '').trim()) || Boolean(pageContent.includes('<img')) || Boolean(pageContent.includes('<input')) || Boolean(pageContent.includes('x-todo'));

                        return (
                            <View style={{ width: windowWidth, flex: 1 }}>
                                <ScrollView
                                    style={{ flex: 1 }}
                                    showsVerticalScrollIndicator={false}
                                    nestedScrollEnabled={true}
                                    keyboardShouldPersistTaps="handled"
                                    keyboardDismissMode="on-drag"
                                    automaticallyAdjustKeyboardInsets={false}
                                    scrollEnabled={!isDraggingImage}
                                    contentContainerStyle={{
                                        paddingHorizontal: 16,
                                        paddingBottom: isEditMode ? insets.bottom + 110 : insets.bottom + 80,
                                        flexGrow: 1,
                                    }}
                                >
                                    {isEditMode && pages.length > 1 && (
                                        <View style={styles.pageHorizontalHeader}>
                                            <View style={[styles.pageBadgePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                                                <Text style={[styles.pageBadgeText, { color: colors.textSecondary }]}>
                                                    {t('notes.page_indicator', {
                                                        current: index + 1,
                                                        total: pages.length,
                                                        defaultValue: `Pág. ${index + 1} / ${pages.length}`,
                                                    })}
                                                </Text>
                                            </View>

                                            <Animated.View
                                                style={{
                                                    opacity: editModeAnim,
                                                    transform: [
                                                        {
                                                            scale: editModeAnim.interpolate({
                                                                inputRange: [0, 1],
                                                                outputRange: [0.6, 1],
                                                            }),
                                                        },
                                                    ],
                                                }}
                                            >
                                                <TouchableOpacity
                                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                    onPress={() => deletePage(index)}
                                                    style={styles.deletePageBtn}
                                                >
                                                    <Trash2 size={13} color={isDark ? '#FB7185' : '#E11D48'} />
                                                </TouchableOpacity>
                                            </Animated.View>
                                        </View>
                                    )}

                                    <View style={styles.pageSheetContent}>
                                        {!isEditMode && !hasPageContent ? (
                                            <Text style={[styles.emptyContentText, { color: colors.textMuted }]}>
                                                {t('notes.empty_page', { defaultValue: 'Hoja en blanco' })}
                                            </Text>
                                        ) : (
                                            <RichTextEditorSection
                                                description={pageContent}
                                                setDescription={html => updatePageContent(index, html)}
                                                readOnly={!isEditMode}
                                                isDark={isDark}
                                                editorRef={{
                                                    get current() {
                                                        return editorRefs.current[index];
                                                    },
                                                    set current(val) {
                                                        editorRefs.current[index] = val;
                                                    },
                                                }}
                                                onFocus={() => {
                                                    setCurrentPageIndex(index);
                                                    setIsNotesFocused(true);
                                                }}
                                                onBlur={() => setIsNotesFocused(false)}
                                                flat={true}
                                                onUndo={undo}
                                                onRedo={redo}
                                                onCropImage={uri => {
                                                    setIsEditingExistingImage(true);
                                                    setCropperUri(uri);
                                                    setIsCropperVisible(true);
                                                }}
                                                onDragStateChange={setIsDraggingImage}
                                                onAutoScroll={handleAutoScroll}
                                            />
                                        )}
                                    </View>

                                    {/* Adjuntos en la última página */}
                                    {index === pages.length - 1 && otherAttachments.length > 0 && (
                                        <View style={{ marginTop: 16, gap: 8 }}>
                                            <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                                                {t('create.sections.attachments', { defaultValue: 'Archivos adjuntos' }).toUpperCase()} ({otherAttachments.length})
                                            </Text>
                                            <View style={styles.fileChipsRow}>
                                                {otherAttachments.map((file, idx) => (
                                                    <TouchableOpacity
                                                        key={idx}
                                                        activeOpacity={0.8}
                                                        onPress={() => openAttachment(file.uri)}
                                                        style={[
                                                            styles.fileChip,
                                                            { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: radii.pill, borderWidth: 1 },
                                                        ]}
                                                    >
                                                        <FileText size={14} color={accent.primary} />
                                                        <Text style={[styles.fileChipText, { color: colors.textPrimary }]} numberOfLines={1}>
                                                            {file.name}
                                                        </Text>
                                                        {isEditMode && (
                                                            <TouchableOpacity
                                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                                onPress={() => removeAttachment(idx)}
                                                            >
                                                                <X size={13} color={colors.textMuted} />
                                                            </TouchableOpacity>
                                                        )}
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    )}
                                </ScrollView>
                            </View>
                        );
                    }}
                />
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'right', 'left']}>
            <View style={styles.container}>
                {/* Header Superior */}
                <Animated.View
                    style={[
                        styles.header,
                        {
                            borderBottomColor: colors.borderSubtle,
                            opacity: headerAnim,
                        },
                    ]}
                >
                    <VeyraIconButton
                        variant="ghost"
                        size="sm"
                        icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                        onPress={handleBack}
                    />

                    <View style={styles.headerActions}>
                        {/* Selector de Carpeta */}
                        <TouchableOpacity
                            style={[
                                styles.headerFolderBtn,
                                {
                                    backgroundColor: currentFolder
                                        ? `${currentFolder.color || '#8B5CF6'}${isDark ? '25' : '15'}`
                                        : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                                    borderColor: currentFolder
                                        ? `${currentFolder.color || '#8B5CF6'}40`
                                        : colors.borderSubtle,
                                },
                            ]}
                            onPress={() => setIsMoveModalVisible(true)}
                            activeOpacity={0.7}
                        >
                            <FolderIconRenderer
                                name={currentFolder ? currentFolder.icon : 'folder'}
                                size={14}
                                color={currentFolder ? (currentFolder.color || '#8B5CF6') : colors.textSecondary}
                                strokeWidth={2}
                            />
                            {currentFolder && (
                                <Text
                                    style={[styles.headerFolderText, { color: currentFolder.color || '#8B5CF6' }]}
                                    numberOfLines={1}
                                >
                                    {currentFolder.name}
                                </Text>
                            )}
                        </TouchableOpacity>

                        {/* Evento Vinculado */}
                        {linkedEvent && (
                            <View
                                style={[
                                    styles.headerFolderBtn,
                                    {
                                        backgroundColor: `${linkedEvent.color || '#3B82F6'}${isDark ? '25' : '15'}`,
                                        borderColor: `${linkedEvent.color || '#3B82F6'}40`,
                                    },
                                ]}
                            >
                                <Calendar
                                    size={13}
                                    color={linkedEvent.color || '#3B82F6'}
                                    strokeWidth={2.2}
                                />
                                <Text
                                    style={[styles.headerFolderText, { color: linkedEvent.color || '#3B82F6', maxWidth: 100 }]}
                                    numberOfLines={1}
                                >
                                    {linkedEvent.title}
                                </Text>
                            </View>
                        )}

                        {isEditMode && (
                            <>
                                <VeyraIconButton
                                    variant="ghost"
                                    size="sm"
                                    disabled={!canUndo}
                                    style={{ opacity: canUndo ? 1 : 0.35 }}
                                    icon={<Undo2 size={18} color={(canUndo ? colors.textPrimary : colors.textMuted) as any} />}
                                    onPress={undo}
                                />
                                <VeyraIconButton
                                    variant="ghost"
                                    size="sm"
                                    disabled={!canRedo}
                                    style={{ opacity: canRedo ? 1 : 0.35 }}
                                    icon={<Redo2 size={18} color={(canRedo ? colors.textPrimary : colors.textMuted) as any} />}
                                    onPress={redo}
                                />
                            </>
                        )}

                        {!isEditMode ? (
                            <VeyraButton
                                variant="secondary"
                                size="sm"
                                label={t('common.edit', { defaultValue: 'Editar' })}
                                iconLeft={<Edit3 size={15} color={accent.primary} />}
                                onPress={handleEnterEditMode}
                            />
                        ) : (
                            <VeyraButton
                                variant="primary"
                                size="sm"
                                label={t('common.done', { defaultValue: 'Listo' })}
                                iconLeft={<Check size={15} color={isDark ? '#111827' : '#FFFFFF'} strokeWidth={2.5} />}
                                onPress={handleExitEditMode}
                            />
                        )}

                        {/* Botón de Más Opciones (One UI 3 Puntos) */}
                        <VeyraIconButton
                            variant="ghost"
                            size="sm"
                            icon={<MoreVertical size={18} color={colors.textPrimary} />}
                            onPress={() => setIsOptionsMenuVisible(true)}
                        />
                    </View>
                </Animated.View>

                {/* Contenido Unificado — Sin recargas ni parpadeos */}
                <View style={{ flex: 1 }}>
                    {scrollLayout === 'vertical' ? renderVertical() : renderHorizontal()}

                    {/* Floating Page Switcher Pill */}
                    <View style={[styles.floatingPageBar, { bottom: floatingPillBottom }]}>
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => setIsPagesModalVisible(true)}
                                style={[
                                    styles.pageIndicatorPill,
                                    {
                                        backgroundColor: isDark ? 'rgba(28, 31, 38, 0.94)' : 'rgba(255, 255, 255, 0.94)',
                                        borderColor: colors.borderSubtle,
                                    },
                                ]}
                            >
                                <Layers size={13} color={accent.primary} />
                                <Text style={[styles.pageIndicatorText, { color: colors.textPrimary }]}>
                                    {t('notes.page_indicator', {
                                        current: currentPageIndex + 1,
                                        total: pages.length,
                                        defaultValue: `Pág. ${currentPageIndex + 1} / ${pages.length}`,
                                    })}
                                </Text>
                            </TouchableOpacity>

                            {isEditMode && (
                                <Animated.View
                                    style={{
                                        opacity: editModeAnim,
                                        transform: [
                                            {
                                                scale: editModeAnim.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [0.5, 1],
                                                }),
                                            },
                                        ],
                                    }}
                                >
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={addPage}
                                        style={[
                                            styles.pageAddPill,
                                            {
                                                backgroundColor: accent.primary,
                                            },
                                        ]}
                                    >
                                        <Plus size={15} color={isDark ? '#1B1B1B' : '#FFFFFF'} strokeWidth={3} />
                                    </TouchableOpacity>
                                </Animated.View>
                            )}
                        </View>

                    {/* Toolbar anclada encima del teclado en modo edición */}
                    {isEditMode && (
                        <Animated.View
                            style={{
                                marginBottom: lift,
                                zIndex: 500,
                                opacity: editModeAnim,
                                transform: [
                                    {
                                        translateY: editModeAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [24, 0],
                                        }),
                                    },
                                ],
                            }}
                        >
                            <RichTextToolbar
                                editorRef={activeEditorRef}
                                isNotesFocused={isNotesFocused}
                                isDark={isDark}
                                onPressCamera={() => handleInsertImage(true)}
                                onPressGallery={() => handleInsertImage(false)}
                                onPressDocument={pickDocument}
                                onUndo={undo}
                                onRedo={redo}
                                canUndo={canUndo}
                                canRedo={canRedo}
                            />
                        </Animated.View>
                    )}

                    <ImageCropperModal
                        isVisible={isCropperVisible}
                        imageUri={cropperUri}
                        isDark={isDark}
                        onClose={() => {
                            setIsCropperVisible(false);
                            setCropperUri(null);
                            setIsEditingExistingImage(false);
                        }}
                        onEditingComplete={async (result) => {
                            setIsCropperVisible(false);
                            setCropperUri(null);
                            if (result?.uri) {
                                const base64 = await processCroppedImage(result.uri);
                                const finalUri = base64 || result.uri;
                                if (isEditingExistingImage) {
                                    const injectJs = `if (typeof window.__veyraReplaceEditingImage === 'function') { window.__veyraReplaceEditingImage(${JSON.stringify(finalUri)}); } true;`;
                                    activeEditorRef.current?.injectJavascript?.(injectJs);
                                    activeEditorRef.current?.injectJavaScript?.(injectJs);
                                    activeEditorRef.current?.webviewBridge?.injectJavaScript?.(injectJs);
                                } else {
                                    activeEditorRef.current?.insertImage(finalUri, 'width: 75%; border-radius: 10px; display: block; margin: 12px auto;');
                                    setTimeout(() => {
                                        activeEditorRef.current?.insertHTML('<br/>');
                                        activeEditorRef.current?.focusContentEditor();
                                    }, 300);
                                }
                            }
                            setIsEditingExistingImage(false);
                        }}
                    />

                    <PremiumAlert
                        isVisible={alertVisible}
                        onClose={() => setAlertVisible(false)}
                        title={alertConfig.title}
                        description={alertConfig.description}
                        isDark={isDark}
                    />

                    {/* Modal para mover/asignar carpeta a la nota */}
                    <MoveToFolderModal
                        visible={isMoveModalVisible}
                        onClose={() => setIsMoveModalVisible(false)}
                        folders={folders}
                        currentFolderId={folderId}
                        noteCount={1}
                        onSelectFolder={async (newFolderId) => {
                            setFolderId(newFolderId);
                        }}
                        onCreateNewFolder={() => {
                            setIsCreateFolderModalVisible(true);
                        }}
                    />

                    {/* Modal para crear nueva carpeta directamente desde la nota */}
                    <FolderModal
                        visible={isCreateFolderModalVisible}
                        onClose={() => setIsCreateFolderModalVisible(false)}
                        onSave={async (name, icon, color) => {
                            const newF = await createFolder(name, icon, color);
                            if (newF) {
                                setFolderId(newF.id);
                            }
                        }}
                    />
                </View>

                {/* Modal de Gestión y Navegación de Hojas */}
                <PagesOverviewModal
                    visible={isPagesModalVisible}
                    onClose={() => setIsPagesModalVisible(false)}
                    pages={pages}
                    currentPageIndex={currentPageIndex}
                    onSelectPage={handleSelectPage}
                    onAddPage={addPage}
                    onDeletePage={deletePage}
                    onDuplicatePage={duplicatePage}
                    onInsertPageAfter={insertPageAfter}
                    onRenamePage={renamePage}
                    onMovePage={movePage}
                    onReorderPages={reorderPages}
                    layout={scrollLayout}
                    onChangeLayout={setScrollLayout}
                />

                {/* Menú Contextual de Opciones (One UI 3 Puntos) */}
                <NoteOptionsMenu
                    visible={isOptionsMenuVisible}
                    onClose={() => setIsOptionsMenuVisible(false)}
                    onExportPdf={handleExportPdf}
                    isExportingPdf={isExportingPdf}
                    onOpenPagesManager={() => setIsPagesModalVisible(true)}
                    pageCount={pages.length}
                    isPinned={isPinned}
                    onTogglePin={() => setIsPinned(!isPinned)}
                    onMoveFolder={() => setIsMoveModalVisible(true)}
                    folderName={currentFolder?.name}
                    onDelete={isEditing ? handleDelete : undefined}
                    isEditMode={isEditMode}
                    onToggleEditMode={() => {
                        if (isEditMode) {
                            handleExitEditMode();
                        } else {
                            handleEnterEditMode();
                        }
                    }}
                />

                <ImageViewing
                    images={imageAttachments.map(img => ({ uri: img.uri }))}
                    imageIndex={galleryIndex}
                    visible={galleryVisible}
                    onRequestClose={() => setGalleryVisible(false)}
                    swipeToCloseEnabled={true}
                    doubleTapToZoomEnabled={true}
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        zIndex: 100,
    },
    headerTitleContainer: {
        flex: 1,
        justifyContent: 'center',
        marginHorizontal: 8,
    },
    headerTitleInput: {
        fontSize: 18,
        lineHeight: 22,
        fontWeight: '700',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginLeft: 'auto',
    },
    headerFolderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 12,
        borderWidth: 1,
        maxWidth: 110,
    },
    headerFolderText: {
        fontSize: 11,
        fontWeight: '700',
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 18,
        paddingTop: 14,
    },
    noteBody: {
        flex: 1,
        gap: 8,
    },
    pageSheetWrapper: {
        marginBottom: 8,
    },
    pageBreakDivider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginVertical: 18,
        paddingHorizontal: 4,
    },
    pageBreakLine: {
        flex: 1,
        height: 1,
    },
    pageBadgePill: {
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 12,
    },
    pageBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    deletePageBtn: {
        padding: 4,
    },
    pageSheetContent: {
        width: '100%',
    },
    addPageMinimalBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 20,
    },
    addPageMinimalText: {
        fontSize: 12.5,
        fontWeight: '600',
    },
    pageHorizontalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 6,
    },
    floatingPageBar: {
        position: 'absolute',
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        zIndex: 150,
    },
    pageIndicatorPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
    },
    pageIndicatorText: {
        fontSize: 11.5,
        fontWeight: '700',
    },
    pageAddPill: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
        gap: 12,
    },
    viewTitle: {
        fontWeight: '800',
        letterSpacing: -0.5,
        lineHeight: 34,
    },
    viewPageSection: {
        width: '100%',
    },
    viewPageDivider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginVertical: 20,
    },
    viewPageDividerLine: {
        flex: 1,
        height: 1,
    },
    viewPageDividerText: {
        fontSize: 11.5,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    emptyContentText: {
        fontSize: 14,
        fontStyle: 'italic',
        marginTop: 6,
    },
    viewAttachmentsSection: {
        marginTop: 16,
        gap: 8,
    },
    sectionHeading: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
    },
    fileChipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    fileChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 7,
        paddingHorizontal: 12,
    },
    fileChipText: {
        fontSize: 12,
        fontWeight: '600',
        maxWidth: 200,
    },
});
