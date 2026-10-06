import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Platform,
    ScrollView,
    BackHandler,
    Animated,
    Easing,
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
    Paperclip,
    FileText,
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

import { useCreateNote } from '../../src/hooks/useCreateNote';
import { useFoldersStore } from '../../src/store/useFoldersStore';
import { useEventsStore } from '../../src/store/useEventsStore';
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

export default function CreateNoteScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const { id, folderId: paramFolderId, eventId: paramEventId, initialTitle: paramInitialTitle } = useLocalSearchParams<{
        id?: string;
        folderId?: string;
        eventId?: string;
        initialTitle?: string;
    }>();
    const { colors, typography, isDark, accent, radii } = useVeyraTheme();
    const [isNotesFocused, setIsNotesFocused] = useState(false);
    const { lift, isKeyboardVisible } = useAdaptiveKeyboard(insets.bottom);

    const folders = useFoldersStore(state => state.folders);
    const createFolder = useFoldersStore(state => state.createFolder);
    const events = useEventsStore(state => state.events);

    const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
    const [isCreateFolderModalVisible, setIsCreateFolderModalVisible] = useState(false);
    const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);

    const toolbarPaddingBottom = Platform.OS === 'ios'
        ? (isKeyboardVisible ? 6 : Math.max(insets.bottom, 8))
        : Math.max(insets.bottom, 8);
    const toolbarHeight = 49 + toolbarPaddingBottom;
    const floatingPillBottom = (isKeyboardVisible ? lift : 0) + toolbarHeight + 10;

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
        handleSave,
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
    } = useCreateNote(id, paramFolderId, paramEventId, paramInitialTitle);

    const currentFolder = folders.find(f => f.id === folderId);
    const linkedEvent = events.find(e => e.id === eventId);

    const [isPagesModalVisible, setIsPagesModalVisible] = useState(false);
    const [isOptionsMenuVisible, setIsOptionsMenuVisible] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isEditingExistingImage, setIsEditingExistingImage] = useState(false);
    const [isDraggingImage, setIsDraggingImage] = useState(false);
    const horizontalListRef = useRef<FlatList>(null);
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

    const activeEditorRef = {
        current: editorRefs.current[currentPageIndex] || editorRefs.current[0] || null,
    };

    const otherAttachments = attachments.filter(item => {
        const uri = item.uri.toLowerCase();
        return !(
            uri.includes('imagepicker') ||
            uri.endsWith('.jpg') ||
            uri.endsWith('.png') ||
            uri.endsWith('.jpeg') ||
            uri.endsWith('.webp') ||
            uri.startsWith('data:image')
        );
    });

    const headerAnim = useRef(new Animated.Value(1)).current;
    const bodyAnim = useRef(new Animated.Value(1)).current;
    const isExiting = useRef(false);

    const handleBack = async () => {
        if (isExiting.current) return;
        isExiting.current = true;
        await saveSilently();
        router.back();
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

    useFocusEffect(
        React.useCallback(() => {
            isExiting.current = false;
            headerAnim.setValue(1);
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
        }, [isOptionsMenuVisible, isPagesModalVisible, isCropperVisible, alertVisible])
    );

    const pageLayoutsRef = useRef<{ [index: number]: number }>({});
    const lastCursorY = useRef<number>(0);

    const handleCursorPosition = useCallback((pageIndex: number, offsetY: number) => {
        const pageY = pageLayoutsRef.current[pageIndex] || 0;
        const cursorY = pageY + offsetY;
        lastCursorY.current = cursorY;

        if (scrollLayout === 'vertical' && verticalScrollRef.current) {
            const currentY = currentScrollY.current;
            const visibleHeight = windowHeight - (60 + toolbarHeight + (isKeyboardVisible ? lift : 0));
            if (cursorY > currentY + visibleHeight - 40 || cursorY < currentY + 30) {
                const targetY = Math.max(0, cursorY - 100);
                verticalScrollRef.current.scrollTo({ y: targetY, animated: true });
            }
        }
    }, [scrollLayout, windowHeight, toolbarHeight, isKeyboardVisible, lift]);

    useEffect(() => {
        if (isKeyboardVisible && lastCursorY.current > 0) {
            const timer = setTimeout(() => {
                if (scrollLayout === 'vertical' && verticalScrollRef.current) {
                    const targetY = Math.max(0, lastCursorY.current - 100);
                    verticalScrollRef.current.scrollTo({ y: targetY, animated: true });
                }
            }, 160);
            return () => clearTimeout(timer);
        }
    }, [isKeyboardVisible, scrollLayout]);

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

    const renderVerticalPages = () => {
        return (
            <ScrollView
                ref={verticalScrollRef}
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="none"
                automaticallyAdjustKeyboardInsets={false}
                nestedScrollEnabled={true}
                scrollEnabled={!isDraggingImage}
                onScroll={(e) => {
                    currentScrollY.current = e.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
            >
                <View style={styles.noteBody}>
                    {pages.map((page, index) => {
                        return (
                            <View
                                key={page.id}
                                style={styles.pageSheetWrapper}
                                onLayout={(e) => {
                                    pageLayoutsRef.current[index] = e.nativeEvent.layout.y;
                                }}
                            >
                                {/* Separador de página minimalista a partir de la pág 2 */}
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
                                        {pages.length > 1 && (
                                            <TouchableOpacity
                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                onPress={() => deletePage(index)}
                                                style={styles.deletePageBtn}
                                            >
                                                <Trash2 size={13} color={isDark ? '#FB7185' : '#E11D48'} />
                                            </TouchableOpacity>
                                        )}
                                        <View style={[styles.pageBreakLine, { backgroundColor: colors.borderSubtle }]} />
                                    </View>
                                )}

                                {/* Editor de la Hoja — Lienzo limpio sin contenedor */}
                                <View style={styles.pageSheetContent}>
                                    <RichTextEditorSection
                                        description={page.content}
                                        setDescription={html => updatePageContent(index, html)}
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
                                        onCursorPosition={(offsetY) => handleCursorPosition(index, offsetY)}
                                    />
                                </View>
                            </View>
                        );
                    })}

                    {/* Botón para Añadir Nueva Hoja — Minimalista */}
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
                                        <TouchableOpacity
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            onPress={() => removeAttachment(idx)}
                                        >
                                            <X size={13} color={colors.textMuted} />
                                        </TouchableOpacity>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}
                </View>
            </ScrollView>
        );
    };

    const renderHorizontalPages = () => {
        return (
            <View style={{ flex: 1 }}>
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
                        return (
                            <View style={{ width: windowWidth, flex: 1 }}>
                                <ScrollView
                                    style={{ flex: 1 }}
                                    showsVerticalScrollIndicator={false}
                                    nestedScrollEnabled={true}
                                    keyboardShouldPersistTaps="always"
                                    keyboardDismissMode="none"
                                    automaticallyAdjustKeyboardInsets={false}
                                    scrollEnabled={!isDraggingImage}
                                    contentContainerStyle={{
                                        paddingHorizontal: 16,
                                        paddingBottom: insets.bottom + 110,
                                        flexGrow: 1,
                                    }}
                                >
                                    {pages.length > 1 && (
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

                                            <TouchableOpacity
                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                onPress={() => deletePage(index)}
                                                style={styles.deletePageBtn}
                                            >
                                                <Trash2 size={13} color={isDark ? '#FB7185' : '#E11D48'} />
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    <View style={styles.pageSheetContent}>
                                        <RichTextEditorSection
                                            description={page.content}
                                            setDescription={html => updatePageContent(index, html)}
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
                                            onCursorPosition={(offsetY) => handleCursorPosition(index, offsetY)}
                                        />
                                    </View>
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
                {/* Header con Título Integrado */}
                <Animated.View
                    style={[
                        styles.header,
                        {
                            borderBottomColor: colors.borderSubtle,
                            opacity: headerAnim,
                            transform: [
                                {
                                    translateY: headerAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [-12, 0],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    <VeyraIconButton
                        variant="ghost"
                        size="sm"
                        icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                        onPress={handleBack}
                    />

                    {/* Título en el encabezado */}
                    <View style={styles.headerTitleContainer}>
                        <TitleInput
                            title={title}
                            setTitle={setTitle}
                            isEditing={true}
                            isDark={isDark}
                            flat={true}
                            placeholder={t('notes.placeholder_title', { defaultValue: 'Título' })}
                            inputStyle={styles.headerTitleInput}
                            onSubmit={() => {
                                setIsNotesFocused(true);
                                activeEditorRef.current?.focusContentEditor();
                            }}
                        />
                    </View>

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

                        {/* Botones de Deshacer y Rehacer */}
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

                        {/* Botón de Más Opciones (One UI 3 Puntos) */}
                        <VeyraIconButton
                            variant="ghost"
                            size="sm"
                            icon={<MoreVertical size={18} color={colors.textPrimary} />}
                            onPress={() => setIsOptionsMenuVisible(true)}
                        />
                    </View>
                </Animated.View>

                {/* Vista Principal de Hojas (Vertical u Horizontal) */}
                <Animated.View
                    style={{
                        flex: 1,
                        opacity: bodyAnim,
                        transform: [
                            {
                                translateY: bodyAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [14, 0],
                                }),
                            },
                        ],
                    }}
                >
                    {scrollLayout === 'vertical' ? renderVerticalPages() : renderHorizontalPages()}
                </Animated.View>

                {/* Floating Page Switcher Pill al pie */}
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
                </View>

                {/* Toolbar anclada encima del teclado */}
                <View style={{ marginBottom: lift, zIndex: 500 }}>
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
                />

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
                            const base64Data = await processCroppedImage(result.uri);
                            const finalUri = base64Data || result.uri;
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
                    onCreateNewFolder={(parentId) => {
                        setCreateFolderParentId(parentId || null);
                        setIsCreateFolderModalVisible(true);
                    }}
                />

                {/* Modal para crear nueva carpeta directamente desde la nota */}
                <FolderModal
                    visible={isCreateFolderModalVisible}
                    onClose={() => {
                        setIsCreateFolderModalVisible(false);
                        setCreateFolderParentId(null);
                    }}
                    parentFolder={createFolderParentId ? folders.find(f => f.id === createFolderParentId) : null}
                    onSave={async (name, icon, color, isPinned, parentId) => {
                        const newF = await createFolder(name, icon, color, isPinned, parentId);
                        if (newF) {
                            setFolderId(newF.id);
                        }
                    }}
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
    sectionHeading: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
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
        paddingVertical: 6,
        paddingHorizontal: 12,
    },
    fileChipText: {
        fontSize: 12,
        maxWidth: 160,
    },
});
