import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    PanResponder,
    Vibration,
    Animated,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
    X,
    Plus,
    Trash2,
    Columns,
    Rows,
    Check,
    GripVertical,
    Copy,
    Edit3,
    ChevronUp,
    ChevronDown,
    MoreVertical,
} from '@tamagui/lucide-icons';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';
import { VeyraIconButton } from '../ui/VeyraIconButton';
import { VeyraButton } from '../ui/VeyraButton';
import { NotePage, PageLayoutMode } from '../../utils/pageUtils';

export interface PagesOverviewModalProps {
    visible: boolean;
    onClose: () => void;
    pages: NotePage[];
    currentPageIndex: number;
    onSelectPage: (index: number) => void;
    onAddPage: () => void;
    onDeletePage: (index: number) => void;
    onDuplicatePage?: (index: number) => void;
    onInsertPageAfter?: (index: number) => void;
    onRenamePage?: (index: number, newTitle: string) => void;
    onMovePage?: (index: number, direction: 'up' | 'down') => void;
    onReorderPages?: (fromIndex: number, toIndex: number) => void;
    layout: PageLayoutMode;
    onChangeLayout: (layout: PageLayoutMode) => void;
}

const CARD_HEIGHT = 64;
const CARD_MARGIN = 8;
const SLOT_HEIGHT = CARD_HEIGHT + CARD_MARGIN;
const AUTO_SCROLL_ZONE = 60;

interface PageRowItemProps {
    page: NotePage;
    index: number;
    totalPages: number;
    isCurrent: boolean;
    isBeingDragged: boolean;
    isTargetSlot: boolean;
    dragTranslateY: Animated.Value;
    snippet: string;
    onSelect: () => void;
    onOpenOptions: () => void;
    onDragStart: (index: number) => void;
    onDragMove: (index: number, dy: number) => void;
    onDragEnd: () => void;
    colors: any;
    accent: any;
    isDark: boolean;
    t: any;
}

function PageRowItem({
    page,
    index,
    totalPages,
    isCurrent,
    isBeingDragged,
    isTargetSlot,
    dragTranslateY,
    snippet,
    onSelect,
    onOpenOptions,
    onDragStart,
    onDragMove,
    onDragEnd,
    colors,
    accent,
    isDark,
    t,
}: PageRowItemProps) {
    const panResponder = useMemo(() => {
        return PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onStartShouldSetPanResponderCapture: () => true,
            onMoveShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponderCapture: () => true,
            onPanResponderGrant: () => {
                onDragStart(index);
            },
            onPanResponderMove: (_, gestureState) => {
                onDragMove(index, gestureState.dy);
            },
            onPanResponderRelease: () => {
                onDragEnd();
            },
            onPanResponderTerminate: () => {
                onDragEnd();
            },
        });
    }, [index, onDragStart, onDragMove, onDragEnd]);

    const formattedNumber = index < 9 ? `0${index + 1}` : `${index + 1}`;

    return (
        <View
            style={[
                styles.pageRowSlot,
                isTargetSlot && {
                    borderColor: accent.primary,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderRadius: 12,
                    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.05)',
                },
                isBeingDragged && {
                    zIndex: 9999,
                    elevation: 16,
                },
            ]}
        >
            <Animated.View
                style={[
                    styles.pageCard,
                    {
                        backgroundColor: isDark ? '#1C1F26' : '#FFFFFF',
                        borderColor: isCurrent ? accent.primary : colors.borderSubtle,
                        borderWidth: 1,
                        borderLeftWidth: isCurrent ? 3.5 : 1,
                        borderLeftColor: isCurrent ? accent.primary : colors.borderSubtle,
                    },
                    isBeingDragged && {
                        transform: [
                            { translateY: dragTranslateY },
                            { scale: 1.02 },
                        ],
                        zIndex: 9999,
                        elevation: 16,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.3,
                        shadowRadius: 10,
                        borderColor: accent.primary,
                    },
                ]}
            >
                {/* Tirador de Arrastre Táctil */}
                {totalPages > 1 ? (
                    <View
                        style={styles.dragHandle}
                        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                        {...panResponder.panHandlers}
                    >
                        <GripVertical
                            size={18}
                            color={isBeingDragged ? accent.primary : (colors.textMuted as any)}
                        />
                    </View>
                ) : (
                    <View style={styles.dragHandleSpacer} />
                )}

                {/* Número de Hoja Minimalista (01, 02) */}
                <Text
                    style={[
                        styles.pageNumberText,
                        {
                            color: isCurrent ? accent.primary : colors.textSecondary,
                            fontWeight: isCurrent ? '700' : '500',
                        },
                    ]}
                >
                    {formattedNumber}
                </Text>

                {/* Contenido / Tap para seleccionar hoja */}
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={onSelect}
                    style={styles.pageCardBody}
                >
                    <View style={styles.pageMetaRow}>
                        <Text
                            style={[
                                styles.pageTitleLabel,
                                {
                                    color: isCurrent ? accent.primary : colors.textPrimary,
                                    fontWeight: isCurrent ? '700' : '600',
                                },
                            ]}
                            numberOfLines={1}
                        >
                            {page.title || `${t('notes.page_single', { defaultValue: 'Hoja' })} ${index + 1}`}
                        </Text>
                    </View>

                    <Text
                        style={[styles.pageSnippet, { color: colors.textSecondary }]}
                        numberOfLines={1}
                    >
                        {snippet}
                    </Text>
                </TouchableOpacity>

                {/* Botón de Menú de Opciones (3 Puntos Minimalista) */}
                <TouchableOpacity
                    onPress={onOpenOptions}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.moreOptionsBtn}
                >
                    <MoreVertical size={16} color={colors.textSecondary as any} />
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}

export function PagesOverviewModal({
    visible,
    onClose,
    pages,
    currentPageIndex,
    onSelectPage,
    onAddPage,
    onDeletePage,
    onDuplicatePage,
    onInsertPageAfter,
    onRenamePage,
    onMovePage,
    onReorderPages,
    layout,
    onChangeLayout,
}: PagesOverviewModalProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { colors, accent, isDark } = useVeyraTheme();

    // Menú contextual de opciones para una hoja
    const [actionSheetIndex, setActionSheetIndex] = useState<number | null>(null);

    // Modal para renombrar hoja
    const [renameModalVisible, setRenameModalVisible] = useState(false);
    const [renamingIndex, setRenamingIndex] = useState<number | null>(null);
    const [renameTitleText, setRenameTitleText] = useState('');

    // Estado del Drag & Drop (Modo Lista)
    const [isDragging, setIsDragging] = useState(false);
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    const hoverIndexRef = useRef<number | null>(null);
    const draggingIndexRef = useRef<number | null>(null);
    const pagesLengthRef = useRef(pages.length);
    pagesLengthRef.current = pages.length;

    const onReorderPagesRef = useRef(onReorderPages);
    onReorderPagesRef.current = onReorderPages;

    // ScrollView y Auto-scroll para Drag & Drop
    const scrollViewRef = useRef<ScrollView>(null);
    const [scrollViewHeight, setScrollViewHeight] = useState(320);
    const scrollViewHeightRef = useRef(320);
    scrollViewHeightRef.current = scrollViewHeight;

    const scrollYRef = useRef(0);
    const startScrollYRef = useRef(0);
    const latestDyRef = useRef(0);
    const dragTranslateY = useRef(new Animated.Value(0)).current;
    const autoScrollAnimIdRef = useRef<number | null>(null);
    const autoScrollDirectionRef = useRef<'up' | 'down' | null>(null);

    const stopAutoScroll = useCallback(() => {
        if (autoScrollAnimIdRef.current !== null) {
            cancelAnimationFrame(autoScrollAnimIdRef.current);
            autoScrollAnimIdRef.current = null;
        }
        autoScrollDirectionRef.current = null;
    }, []);

    const updateHoverSlot = useCallback((startIndex: number, dy: number, scrollDelta: number) => {
        const totalTranslation = dy + scrollDelta;
        const rawTarget = startIndex + Math.round(totalTranslation / SLOT_HEIGHT);
        const clampedTarget = Math.max(0, Math.min(pagesLengthRef.current - 1, rawTarget));
        if (clampedTarget !== hoverIndexRef.current) {
            hoverIndexRef.current = clampedTarget;
            setHoverIndex(clampedTarget);
        }
    }, []);

    const checkAndTriggerAutoScroll = useCallback((startIndex: number, dy: number) => {
        const height = scrollViewHeightRef.current;
        const itemInitialViewportY = startIndex * SLOT_HEIGHT - startScrollYRef.current;
        const fingerViewportY = itemInitialViewportY + dy;

        let direction: 'up' | 'down' | null = null;
        if (fingerViewportY > height - AUTO_SCROLL_ZONE) {
            direction = 'down';
        } else if (fingerViewportY < AUTO_SCROLL_ZONE) {
            direction = 'up';
        }

        if (direction === null) {
            stopAutoScroll();
            return;
        }

        if (autoScrollDirectionRef.current === direction) {
            return;
        }

        autoScrollDirectionRef.current = direction;
        if (autoScrollAnimIdRef.current !== null) {
            cancelAnimationFrame(autoScrollAnimIdRef.current);
            autoScrollAnimIdRef.current = null;
        }

        const step = () => {
            if (draggingIndexRef.current === null) {
                stopAutoScroll();
                return;
            }

            const currentHeight = scrollViewHeightRef.current;
            const currentItemInitialY = startIndex * SLOT_HEIGHT - startScrollYRef.current;
            const currentFingerY = currentItemInitialY + latestDyRef.current;

            const maxScroll = Math.max(0, pagesLengthRef.current * SLOT_HEIGHT - currentHeight);

            if (currentFingerY > currentHeight - AUTO_SCROLL_ZONE) {
                const overflow = currentFingerY - (currentHeight - AUTO_SCROLL_ZONE);
                // Velocidad gradual y controlada ("poco a poco") entre 1.8px y 5px por cuadro
                const speed = Math.min(5, Math.max(1.8, 1.8 + overflow * 0.08));
                const newScroll = Math.min(maxScroll, scrollYRef.current + speed);

                if (newScroll > scrollYRef.current) {
                    scrollYRef.current = newScroll;
                    scrollViewRef.current?.scrollTo({ y: newScroll, animated: false });

                    const scrollDelta = newScroll - startScrollYRef.current;
                    dragTranslateY.setValue(latestDyRef.current + scrollDelta);
                    updateHoverSlot(startIndex, latestDyRef.current, scrollDelta);

                    autoScrollAnimIdRef.current = requestAnimationFrame(step);
                } else {
                    stopAutoScroll();
                }
            } else if (currentFingerY < AUTO_SCROLL_ZONE) {
                const overflow = AUTO_SCROLL_ZONE - currentFingerY;
                const speed = Math.min(5, Math.max(1.8, 1.8 + overflow * 0.08));
                const newScroll = Math.max(0, scrollYRef.current - speed);

                if (newScroll < scrollYRef.current) {
                    scrollYRef.current = newScroll;
                    scrollViewRef.current?.scrollTo({ y: newScroll, animated: false });

                    const scrollDelta = newScroll - startScrollYRef.current;
                    dragTranslateY.setValue(latestDyRef.current + scrollDelta);
                    updateHoverSlot(startIndex, latestDyRef.current, scrollDelta);

                    autoScrollAnimIdRef.current = requestAnimationFrame(step);
                } else {
                    stopAutoScroll();
                }
            } else {
                stopAutoScroll();
            }
        };

        autoScrollAnimIdRef.current = requestAnimationFrame(step);
    }, [dragTranslateY, stopAutoScroll, updateHoverSlot]);

    useEffect(() => {
        if (!visible) {
            stopAutoScroll();
        }
        return () => {
            stopAutoScroll();
        };
    }, [visible, stopAutoScroll]);

    const onDragStart = useCallback((index: number) => {
        stopAutoScroll();
        startScrollYRef.current = scrollYRef.current;
        latestDyRef.current = 0;
        dragTranslateY.setValue(0);
        draggingIndexRef.current = index;
        hoverIndexRef.current = index;
        setDraggingIndex(index);
        setHoverIndex(index);
        setIsDragging(true);
    }, [dragTranslateY, stopAutoScroll]);

    const onDragMove = useCallback((index: number, dy: number) => {
        latestDyRef.current = dy;
        const scrollDelta = scrollYRef.current - startScrollYRef.current;
        dragTranslateY.setValue(dy + scrollDelta);
        updateHoverSlot(index, dy, scrollDelta);
        checkAndTriggerAutoScroll(index, dy);
    }, [dragTranslateY, updateHoverSlot, checkAndTriggerAutoScroll]);

    const onDragEnd = useCallback(() => {
        stopAutoScroll();
        dragTranslateY.setValue(0);
        const origin = draggingIndexRef.current;
        const target = hoverIndexRef.current;
        if (
            origin !== null &&
            target !== null &&
            origin !== target &&
            onReorderPagesRef.current
        ) {
            onReorderPagesRef.current(origin, target);
        }
        draggingIndexRef.current = null;
        hoverIndexRef.current = null;
        setIsDragging(false);
        setDraggingIndex(null);
        setHoverIndex(null);
    }, [dragTranslateY, stopAutoScroll]);

    const getPageSnippet = (content?: string): string => {
        if (!content) return t('notes.empty_page', { defaultValue: 'Hoja en blanco' });
        const clean = content
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/\s+/g, ' ')
            .trim();
        return clean || t('notes.empty_page', { defaultValue: 'Hoja en blanco' });
    };

    const handleDelete = (index: number) => {
        if (pages.length <= 1) {
            Alert.alert(
                t('notes.cannot_delete_last_page', { defaultValue: 'No se puede eliminar' }),
                t('notes.cannot_delete_last_page_desc', { defaultValue: 'La nota debe tener al menos una hoja.' })
            );
            return;
        }

        Alert.alert(
            t('notes.delete_page_title', { defaultValue: '¿Eliminar esta hoja?' }),
            t('notes.delete_page_desc', { defaultValue: 'Se eliminará esta hoja y todo su contenido.' }),
            [
                { text: t('common.cancel', { defaultValue: 'Cancelar' }), style: 'cancel' },
                {
                    text: t('common.delete', { defaultValue: 'Eliminar' }),
                    style: 'destructive',
                    onPress: () => {
                        setActionSheetIndex(null);
                        onDeletePage(index);
                    },
                },
            ]
        );
    };

    const openRenameDialog = (index: number) => {
        setRenamingIndex(index);
        setRenameTitleText(pages[index]?.title || '');
        setActionSheetIndex(null);
        setRenameModalVisible(true);
    };

    const handleSaveRename = () => {
        if (renamingIndex !== null && onRenamePage) {
            onRenamePage(renamingIndex, renameTitleText.trim());
        }
        setRenameModalVisible(false);
        setRenamingIndex(null);
        setRenameTitleText('');
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <GestureHandlerRootView style={{ flex: 1 }}>
                <View style={styles.modalBackdrop}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={onClose}
                    />

                    <VeyraSurface
                        level={2}
                        radius="xl"
                        style={[
                            styles.centeredDialogContainer,
                            {
                                backgroundColor: isDark ? '#16181D' : '#FFFFFF',
                                borderColor: colors.borderSubtle,
                            },
                        ]}
                    >
                        {/* Encabezado */}
                        <View style={styles.sheetHeader}>
                            <View style={styles.sheetTitleCol}>
                                <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                                    {t('notes.pages_manager', { defaultValue: 'Organizador de Hojas' })}
                                </Text>
                                <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
                                    {pages.length} {pages.length === 1 ? t('notes.page_single', { defaultValue: 'hoja' }) : t('notes.pages_plural', { defaultValue: 'hojas' })}
                                </Text>
                            </View>

                            <VeyraIconButton
                                variant="ghost"
                                size="sm"
                                icon={<X size={18} color={colors.textSecondary} />}
                                onPress={onClose}
                            />
                        </View>

                        {/* Barra de Controles: Selector de Orientación (Vertical / Horizontal) */}
                        <View style={styles.toolbarRow}>
                            <Text style={[styles.toolbarLabel, { color: colors.textSecondary }]}>
                                {t('notes.scroll_layout', { defaultValue: 'Desplazamiento' })}
                            </Text>

                            {/* Selector de Orientación de Lectura */}
                            <View style={[styles.compactSegmentGroup, { backgroundColor: isDark ? '#1C1F26' : '#F1F5F9' }]}>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => onChangeLayout('vertical')}
                                    style={[
                                        styles.compactSegmentBtn,
                                        layout === 'vertical' && [
                                            styles.compactSegmentBtnActive,
                                            { backgroundColor: isDark ? '#2D323E' : '#FFFFFF' },
                                        ],
                                    ]}
                                >
                                    <Rows
                                        size={14}
                                        color={(layout === 'vertical' ? accent.primary : colors.textMuted) as any}
                                    />
                                    <Text
                                        style={[
                                            styles.compactSegmentText,
                                            {
                                                color: layout === 'vertical' ? colors.textPrimary : colors.textSecondary,
                                                fontWeight: layout === 'vertical' ? '700' : '500',
                                            },
                                        ]}
                                    >
                                        {t('notes.layout_vertical', { defaultValue: 'Vertical' })}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => onChangeLayout('horizontal')}
                                    style={[
                                        styles.compactSegmentBtn,
                                        layout === 'horizontal' && [
                                            styles.compactSegmentBtnActive,
                                            { backgroundColor: isDark ? '#2D323E' : '#FFFFFF' },
                                        ],
                                    ]}
                                >
                                    <Columns
                                        size={14}
                                        color={(layout === 'horizontal' ? accent.primary : colors.textMuted) as any}
                                    />
                                    <Text
                                        style={[
                                            styles.compactSegmentText,
                                            {
                                                color: layout === 'horizontal' ? colors.textPrimary : colors.textSecondary,
                                                fontWeight: layout === 'horizontal' ? '700' : '500',
                                            },
                                        ]}
                                    >
                                        {t('notes.layout_horizontal', { defaultValue: 'Horizontal' })}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Contenedor Principal: Lista de Hojas */}
                        <ScrollView
                            ref={scrollViewRef}
                            style={styles.pagesList}
                            contentContainerStyle={styles.pagesListContent}
                            showsVerticalScrollIndicator={false}
                            scrollEnabled={!isDragging}
                            nestedScrollEnabled={true}
                            keyboardShouldPersistTaps="handled"
                            onLayout={(e) => {
                                const h = e.nativeEvent.layout.height;
                                if (h > 0) setScrollViewHeight(h);
                            }}
                            onScroll={(e) => {
                                scrollYRef.current = e.nativeEvent.contentOffset.y;
                            }}
                            scrollEventThrottle={16}
                        >
                            <View style={styles.listContainer}>
                                {pages.map((page, index) => {
                                    const isCurrent = index === currentPageIndex;
                                    const isBeingDragged = draggingIndex === index;
                                    const isTargetSlot = isDragging && hoverIndex === index && draggingIndex !== index;
                                    const snippet = getPageSnippet(page.content);

                                    return (
                                        <PageRowItem
                                            key={page.id || `page_${index}`}
                                            page={page}
                                            index={index}
                                            totalPages={pages.length}
                                            isCurrent={isCurrent}
                                            isBeingDragged={isBeingDragged}
                                            isTargetSlot={isTargetSlot}
                                            dragTranslateY={dragTranslateY}
                                            snippet={snippet}
                                            onSelect={() => {
                                                if (!isDragging) {
                                                    onSelectPage(index);
                                                    onClose();
                                                }
                                            }}
                                            onOpenOptions={() => setActionSheetIndex(index)}
                                            onDragStart={onDragStart}
                                            onDragMove={onDragMove}
                                            onDragEnd={onDragEnd}
                                            colors={colors}
                                            accent={accent}
                                            isDark={isDark}
                                            t={t}
                                        />
                                    );
                                })}
                            </View>
                        </ScrollView>

                        {/* Botón Inferior: Agregar Hoja */}
                        <View style={styles.sheetFooter}>
                            <VeyraButton
                                variant="primary"
                                size="md"
                                radius="lg"
                                label={t('notes.add_page', { defaultValue: 'Agregar Hoja' })}
                                iconLeft={<Plus size={17} color={isDark ? '#1B1B1B' : '#FFFFFF'} strokeWidth={2.6} />}
                                onPress={() => {
                                    onAddPage();
                                    onClose();
                                }}
                            />
                        </View>
                    </VeyraSurface>
                </View>
            </GestureHandlerRootView>

            {/* ==================== SUB-MODAL: ACCIONES DE LA HOJA ==================== */}
            <Modal
                visible={actionSheetIndex !== null}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setActionSheetIndex(null)}
            >
                <TouchableOpacity
                    style={styles.actionSheetBackdrop}
                    activeOpacity={1}
                    onPress={() => setActionSheetIndex(null)}
                >
                    <View style={styles.actionSheetWrapper}>
                        <VeyraSurface
                            level={3}
                            radius="xl"
                            style={[
                                styles.actionSheetContent,
                                {
                                    backgroundColor: isDark ? '#1C1F26' : '#FFFFFF',
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                        >
                            {/* Cabecera del sub-modal */}
                            <View style={styles.actionSheetHeader}>
                                <Text style={[styles.actionSheetTitle, { color: colors.textPrimary }]}>
                                    {actionSheetIndex !== null && (
                                        pages[actionSheetIndex]?.title ||
                                        `${t('notes.page_single', { defaultValue: 'Hoja' })} ${actionSheetIndex + 1}`
                                    )}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => setActionSheetIndex(null)}
                                    style={styles.actionSheetCloseBtn}
                                >
                                    <X size={18} color={colors.textSecondary as any} />
                                </TouchableOpacity>
                            </View>

                            {/* Lista de Opciones */}
                            <View style={styles.actionOptionsList}>
                                {/* Renombrar */}
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        if (actionSheetIndex !== null) {
                                            openRenameDialog(actionSheetIndex);
                                        }
                                    }}
                                    style={styles.actionOptionRow}
                                >
                                    <View style={[styles.actionIconContainer, { backgroundColor: isDark ? '#2D323E' : '#F1F5F9' }]}>
                                        <Edit3 size={16} color={colors.textPrimary as any} />
                                    </View>
                                    <Text style={[styles.actionOptionLabel, { color: colors.textPrimary }]}>
                                        {t('notes.rename_page', { defaultValue: 'Renombrar hoja' })}
                                    </Text>
                                </TouchableOpacity>

                                {/* Duplicar */}
                                {onDuplicatePage && (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => {
                                            if (actionSheetIndex !== null) {
                                                const idx = actionSheetIndex;
                                                setActionSheetIndex(null);
                                                onDuplicatePage(idx);
                                            }
                                        }}
                                        style={styles.actionOptionRow}
                                    >
                                        <View style={[styles.actionIconContainer, { backgroundColor: isDark ? '#2D323E' : '#F1F5F9' }]}>
                                            <Copy size={16} color={colors.textPrimary as any} />
                                        </View>
                                        <Text style={[styles.actionOptionLabel, { color: colors.textPrimary }]}>
                                            {t('notes.duplicate_page', { defaultValue: 'Duplicar hoja' })}
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {/* Insertar Hoja Después */}
                                {onInsertPageAfter && (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => {
                                            if (actionSheetIndex !== null) {
                                                const idx = actionSheetIndex;
                                                setActionSheetIndex(null);
                                                onInsertPageAfter(idx);
                                            }
                                        }}
                                        style={styles.actionOptionRow}
                                    >
                                        <View style={[styles.actionIconContainer, { backgroundColor: isDark ? '#2D323E' : '#F1F5F9' }]}>
                                            <Plus size={16} color={colors.textPrimary as any} />
                                        </View>
                                        <Text style={[styles.actionOptionLabel, { color: colors.textPrimary }]}>
                                            {t('notes.insert_page_after', { defaultValue: 'Insertar hoja después' })}
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {/* Mover Arriba */}
                                {pages.length > 1 && onMovePage && actionSheetIndex !== null && (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        disabled={actionSheetIndex === 0}
                                        onPress={() => {
                                            if (actionSheetIndex !== null && actionSheetIndex > 0) {
                                                onMovePage(actionSheetIndex, 'up');
                                                setActionSheetIndex(actionSheetIndex - 1);
                                            }
                                        }}
                                        style={[styles.actionOptionRow, actionSheetIndex === 0 && styles.btnDisabled]}
                                    >
                                        <View style={[styles.actionIconContainer, { backgroundColor: isDark ? '#2D323E' : '#F1F5F9' }]}>
                                            <ChevronUp
                                                size={16}
                                                color={(actionSheetIndex === 0 ? colors.borderSubtle : colors.textPrimary) as any}
                                            />
                                        </View>
                                        <Text
                                            style={[
                                                styles.actionOptionLabel,
                                                { color: actionSheetIndex === 0 ? colors.textMuted : colors.textPrimary },
                                            ]}
                                        >
                                            {t('notes.move_up', { defaultValue: 'Mover arriba' })}
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {/* Mover Abajo */}
                                {pages.length > 1 && onMovePage && actionSheetIndex !== null && (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        disabled={actionSheetIndex === pages.length - 1}
                                        onPress={() => {
                                            if (actionSheetIndex !== null && actionSheetIndex < pages.length - 1) {
                                                onMovePage(actionSheetIndex, 'down');
                                                setActionSheetIndex(actionSheetIndex + 1);
                                            }
                                        }}
                                        style={[styles.actionOptionRow, actionSheetIndex === pages.length - 1 && styles.btnDisabled]}
                                    >
                                        <View style={[styles.actionIconContainer, { backgroundColor: isDark ? '#2D323E' : '#F1F5F9' }]}>
                                            <ChevronDown
                                                size={16}
                                                color={(actionSheetIndex === pages.length - 1 ? colors.borderSubtle : colors.textPrimary) as any}
                                            />
                                        </View>
                                        <Text
                                            style={[
                                                styles.actionOptionLabel,
                                                { color: actionSheetIndex === pages.length - 1 ? colors.textMuted : colors.textPrimary },
                                            ]}
                                        >
                                            {t('notes.move_down', { defaultValue: 'Mover abajo' })}
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {/* Separador */}
                                <View style={[styles.actionMenuDivider, { backgroundColor: colors.borderSubtle }]} />

                                {/* Eliminar */}
                                {pages.length > 1 && (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => {
                                            if (actionSheetIndex !== null) {
                                                handleDelete(actionSheetIndex);
                                            }
                                        }}
                                        style={styles.actionOptionRow}
                                    >
                                        <View
                                            style={[
                                                styles.actionIconContainer,
                                                { backgroundColor: isDark ? 'rgba(244, 63, 94, 0.15)' : 'rgba(244, 63, 94, 0.1)' },
                                            ]}
                                        >
                                            <Trash2 size={16} color={isDark ? '#FB7185' : '#E11D48'} />
                                        </View>
                                        <Text style={[styles.actionOptionLabel, { color: isDark ? '#FB7185' : '#E11D48', fontWeight: '600' }]}>
                                            {t('common.delete', { defaultValue: 'Eliminar' })}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </VeyraSurface>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ==================== SUB-MODAL: RENOMBRAR HOJA ==================== */}
            <Modal
                visible={renameModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setRenameModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.renameModalBackdrop}
                >
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={() => setRenameModalVisible(false)}
                    />
                    <VeyraSurface
                        level={3}
                        radius="xl"
                        style={[
                            styles.renameDialogContainer,
                            {
                                backgroundColor: isDark ? '#1C1F26' : '#FFFFFF',
                                borderColor: colors.borderSubtle,
                            },
                        ]}
                    >
                        <Text style={[styles.renameDialogTitle, { color: colors.textPrimary }]}>
                            {t('notes.rename_page', { defaultValue: 'Renombrar hoja' })}
                        </Text>

                        <TextInput
                            style={[
                                styles.renameInput,
                                {
                                    backgroundColor: isDark ? '#16181D' : '#F8FAFC',
                                    color: colors.textPrimary,
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            value={renameTitleText}
                            onChangeText={setRenameTitleText}
                            placeholder={t('notes.page_title_placeholder', { defaultValue: 'Título de la hoja' })}
                            placeholderTextColor={colors.textMuted}
                            autoFocus={true}
                            maxLength={40}
                            selectTextOnFocus={true}
                        />

                        <View style={styles.renameActionsRow}>
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => setRenameModalVisible(false)}
                                style={[styles.renameBtn, { backgroundColor: isDark ? '#2D323E' : '#F1F5F9' }]}
                            >
                                <Text style={[styles.renameBtnText, { color: colors.textSecondary }]}>
                                    {t('common.cancel', { defaultValue: 'Cancelar' })}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={handleSaveRename}
                                style={[styles.renameBtn, { backgroundColor: accent.primary }]}
                            >
                                <Text style={[styles.renameBtnText, { color: isDark ? '#111827' : '#FFFFFF', fontWeight: '700' }]}>
                                    {t('notes.save_title', { defaultValue: 'Guardar' })}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </VeyraSurface>
                </KeyboardAvoidingView>
            </Modal>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 32,
    },
    centeredDialogContainer: {
        width: '100%',
        maxWidth: 390,
        maxHeight: '82%',
        borderRadius: 20,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 16,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 14,
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
    },
    sheetTitleCol: {
        gap: 1,
        flex: 1,
    },
    sheetTitle: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    sheetSubtitle: {
        fontSize: 12,
        fontWeight: '400',
    },
    toolbarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    toolbarLabel: {
        fontSize: 12.5,
        fontWeight: '500',
    },
    compactSegmentGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 3,
        borderRadius: 10,
        gap: 2,
    },
    compactSegmentBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
    },
    compactSegmentText: {
        fontSize: 12,
        letterSpacing: 0.1,
    },
    compactSegmentBtnActive: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 2.5,
        elevation: 2,
    },
    pagesList: {
        maxHeight: 350,
    },
    pagesListContent: {
        paddingVertical: 2,
    },

    /* Estilos Vista Lista */
    listContainer: {
        gap: CARD_MARGIN,
    },
    pageRowSlot: {
        height: CARD_HEIGHT,
        borderRadius: 12,
    },
    pageCard: {
        height: CARD_HEIGHT,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        gap: 10,
    },
    dragHandle: {
        width: 26,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dragHandleSpacer: {
        width: 6,
    },
    pageNumberText: {
        fontSize: 13,
        letterSpacing: 0.2,
        minWidth: 18,
        textAlign: 'center',
    },
    pageCardBody: {
        flex: 1,
        justifyContent: 'center',
        gap: 2,
    },
    pageMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    pageTitleLabel: {
        fontSize: 13.5,
        flexShrink: 1,
    },
    pageSnippet: {
        fontSize: 11.5,
    },
    moreOptionsBtn: {
        padding: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },

    btnDisabled: {
        opacity: 0.35,
    },
    sheetFooter: {
        paddingTop: 4,
    },

    /* Sub-modal: Acciones */
    actionSheetBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    actionSheetWrapper: {
        width: '100%',
        maxWidth: 320,
    },
    actionSheetContent: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        gap: 10,
    },
    actionSheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 2,
    },
    actionSheetTitle: {
        fontSize: 14.5,
        fontWeight: '700',
        flex: 1,
    },
    actionSheetCloseBtn: {
        padding: 4,
    },
    actionOptionsList: {
        gap: 2,
    },
    actionOptionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 9,
        paddingHorizontal: 8,
        borderRadius: 8,
    },
    actionIconContainer: {
        width: 30,
        height: 30,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionOptionLabel: {
        fontSize: 13,
        fontWeight: '500',
    },
    actionMenuDivider: {
        height: 1,
        marginVertical: 4,
    },

    /* Sub-modal: Renombrar */
    renameModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    renameDialogContainer: {
        width: '100%',
        maxWidth: 300,
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        gap: 12,
    },
    renameDialogTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    renameInput: {
        height: 40,
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 10,
        fontSize: 13.5,
    },
    renameActionsRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
    },
    renameBtn: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    renameBtnText: {
        fontSize: 12.5,
        fontWeight: '600',
    },
});
