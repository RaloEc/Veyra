import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
    FlatList,
    TouchableOpacity,
    StatusBar,
    LayoutAnimation,
    Platform,
    BackHandler,
    View,
    Text,
    TextInput,
    Image,
    StyleSheet,
    Share,
    Alert,
    ScrollView,
    Modal,
    Dimensions,
    useWindowDimensions,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withSequence,
    withDelay,
    interpolate,
    Extrapolation,
    runOnJS,
    Easing as ReanimatedEasing,
    LinearTransition,
    FadeIn,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const smoothLayoutAnimation = {
    duration: 350,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
    Plus,
    Search,
    FileText,
    Pin,
    PinOff,
    Trash2,
    History,
    Check,
    Paperclip,
    Sun,
    Moon,
    Bell,
    X,
    Copy,
    Share2,
    CheckSquare,
    Square,
    Folder as FolderIcon,
    FolderPlus,
    FolderInput,
    Inbox,
    Layers,
    ChevronLeft,
    MoreVertical,
    Edit3,
} from '@tamagui/lucide-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { format, isToday, isYesterday, isThisWeek, isThisMonth, isThisYear } from 'date-fns';
import { es, enUS } from 'date-fns/locale';

import { useStore } from '../../src/store/useStore';
import { useNotesStore } from '../../src/store/useNotesStore';
import { useFoldersStore } from '../../src/store/useFoldersStore';
import { useVeyraTheme } from '../../src/theme/useVeyraTheme';
import { VeyraSurface } from '../../src/components/ui/VeyraSurface';
import { VeyraButton } from '../../src/components/ui/VeyraButton';
import { VeyraIconButton } from '../../src/components/ui/VeyraIconButton';
import { VeyraDivider } from '../../src/components/ui/VeyraDivider';
import { Note, Folder } from '../../src/types/db';
import { extractPlainTextFromPages } from '../../src/utils/pageUtils';
import { FolderIconRenderer } from '../../src/components/notes/FolderIconRenderer';
import { FolderModal } from '../../src/components/notes/FolderModal';
import { MoveToFolderModal } from '../../src/components/notes/MoveToFolderModal';
import { FolderCardGrid } from '../../src/components/notes/FolderCardGrid';
import { useCardTransitionStore, CardRect } from '../../src/store/cardTransitionStore';
import { TopBar } from '../../src/components/TopBar';
import { BottomTabBar } from '../../src/components/layout/BottomTabBar';

interface NoteSection {
    key: string;
    title: string;
    data: Note[];
}

const extractFirstImageUri = (attachmentsStr?: string, contentStr?: string): string | null => {
    if (attachmentsStr) {
        try {
            const parsed = JSON.parse(attachmentsStr);
            if (Array.isArray(parsed)) {
                for (const item of parsed) {
                    const uri = (typeof item === 'string' ? item : item?.uri || '').toLowerCase();
                    if (
                        uri.includes('imagepicker') ||
                        uri.endsWith('.jpg') ||
                        uri.endsWith('.png') ||
                        uri.endsWith('.jpeg') ||
                        uri.endsWith('.webp') ||
                        uri.startsWith('data:image')
                    ) {
                        return typeof item === 'string' ? item : item.uri;
                    }
                }
            }
        } catch {}
    }

    if (contentStr) {
        try {
            const imgMatch = contentStr.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (imgMatch && imgMatch[1]) {
                return imgMatch[1];
            }
        } catch {}
    }

    return null;
};

interface NoteItemRowProps {
    item: Note;
    index: number;
    totalCount: number;
    sectionKey: string;
    isSelected: boolean;
    isSelectionMode: boolean;
    isDeleting: boolean;
    folderInfo?: Folder | null;
    showFolderBadge?: boolean;
    colors: any;
    typography: any;
    accent: any;
    isDark: boolean;
    language: string;
    locale: any;
    t: any;
    onPress: (id: string, rect?: CardRect) => void;
    onLongPress: (id: string) => void;
    onDeleteNote: (id: string) => void;
    onTogglePinNote: (id: string) => void;
    formatNoteDate: (ms: number) => string;
}

const NoteItemRow = React.memo(function NoteItemRow({
    item,
    index,
    totalCount,
    sectionKey,
    isSelected,
    isSelectionMode,
    isDeleting,
    folderInfo,
    showFolderBadge,
    colors,
    typography,
    accent,
    isDark,
    language,
    locale,
    t,
    onPress,
    onLongPress,
    formatNoteDate,
    onDeleteNote,
    onTogglePinNote,
}: NoteItemRowProps) {
    const plainText = extractPlainTextFromPages(item.content);
    const imageThumb = extractFirstImageUri(item.attachments, item.content);
    const hasAttachments = item.attachments && item.attachments !== '[]';

    const measuredHeight = useRef(0);
    const translateX = useSharedValue(0);
    const rowOpacity = useSharedValue(1);
    const rowHeight = useSharedValue<number | null>(null);
    const isDismissingSV = useSharedValue(false);
    const isDismissing = useRef(false);
    const dismissTimer = useRef<any>(null);

    // Delete animation on UI thread for bulk delete
    const deleteOpacity = useSharedValue(1);
    const deleteTranslateX = useSharedValue(0);

    useEffect(() => {
        return () => {
            if (dismissTimer.current) {
                clearTimeout(dismissTimer.current);
            }
        };
    }, []);

    useEffect(() => {
        if (isDeleting) {
            deleteOpacity.value = withTiming(0, {
                duration: 220,
                easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
            });
            deleteTranslateX.value = withTiming(-60, {
                duration: 220,
                easing: ReanimatedEasing.in(ReanimatedEasing.quad),
            });
        } else {
            deleteOpacity.value = 1;
            deleteTranslateX.value = 0;
        }
    }, [isDeleting]);

    const triggerDismiss = useCallback(() => {
        if (isDismissing.current) return;
        isDismissing.current = true;
        isDismissingSV.value = true;
        const initialH = measuredHeight.current > 0 ? measuredHeight.current : 72;
        rowHeight.value = initialH;

        translateX.value = withTiming(
            -380,
            { duration: 200, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) }
        );
        rowOpacity.value = withDelay(
            25,
            withTiming(0, { duration: 180, easing: ReanimatedEasing.out(ReanimatedEasing.quad) })
        );
        rowHeight.value = withDelay(
            35,
            withTiming(0, { duration: 240, easing: ReanimatedEasing.bezier(0.25, 1, 0.5, 1) })
        );

        dismissTimer.current = setTimeout(() => {
            onDeleteNote(item.id);
        }, 285);
    }, [item.id, onDeleteNote]);

    const triggerTogglePin = useCallback(() => {
        translateX.value = withTiming(0, {
            duration: 220,
            easing: ReanimatedEasing.bezier(0.25, 1, 0.5, 1),
        });
        onTogglePinNote(item.id);
    }, [item.id, onTogglePinNote]);

    const panGesture = Gesture.Pan()
        .enabled(!isSelectionMode)
        .activeOffsetX([-15, 15])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
            'worklet';
            if (isDismissingSV.value) return;
            translateX.value = e.translationX;
        })
        .onFinalize((e) => {
            'worklet';
            if (isDismissingSV.value) return;
            if (e.translationX < -105) {
                isDismissingSV.value = true;
                runOnJS(triggerDismiss)();
            } else if (e.translationX > 105) {
                runOnJS(triggerTogglePin)();
            } else {
                translateX.value = withTiming(0, {
                    duration: 220,
                    easing: ReanimatedEasing.bezier(0.25, 1, 0.5, 1),
                });
            }
        });

    const collapseAnimatedStyle = useAnimatedStyle(() => {
        'worklet';
        if (rowHeight.value === null) {
            return {};
        }
        return {
            height: rowHeight.value,
            opacity: rowOpacity.value,
        };
    });

    const rowAnimatedStyle = useAnimatedStyle(() => ({
        opacity: deleteOpacity.value,
        transform: [
            { translateX: translateX.value + deleteTranslateX.value },
        ],
    }));

    const bgAnimatedStyle = useAnimatedStyle(() => {
        'worklet';
        const tx = translateX.value;
        if (tx > 5) {
            const opacity = interpolate(tx, [5, 25, 75], [0, 0.6, 1], Extrapolation.CLAMP);
            return {
                backgroundColor: isDark ? '#D97706' : '#F59E0B',
                opacity,
            };
        } else if (tx < -5) {
            const opacity = interpolate(tx, [-75, -25, -5], [1, 0.6, 0], Extrapolation.CLAMP);
            return {
                backgroundColor: isDark ? '#DC2626' : '#EF4444',
                opacity,
            };
        }
        return { opacity: 0 };
    });

    const leftActionStyle = useAnimatedStyle(() => {
        'worklet';
        const tx = translateX.value;
        const isVisible = tx > 5;
        const opacity = interpolate(tx, [5, 25, 70], [0, 0.45, 1], Extrapolation.CLAMP);
        const scale = interpolate(tx, [5, 30, 85], [0.85, 0.94, 1], Extrapolation.CLAMP);
        return {
            opacity: isVisible ? opacity : 0,
            transform: [{ scale }],
        };
    });

    const rightActionStyle = useAnimatedStyle(() => {
        'worklet';
        const tx = translateX.value;
        const isVisible = tx < -5;
        const opacity = interpolate(tx, [-70, -25, -5], [1, 0.45, 0], Extrapolation.CLAMP);
        const scale = interpolate(tx, [-85, -30, -5], [1, 0.94, 0.85], Extrapolation.CLAMP);
        return {
            opacity: isVisible ? opacity : 0,
            transform: [{ scale }],
        };
    });

    const folderColor = folderInfo?.color || '#8B5CF6';

    const handlePressItem = () => {
        if (!isDismissing.current) {
            onPress(item.id);
        }
    };

    return (
        <Animated.View
            pointerEvents={isDismissing.current ? 'none' : 'auto'}
            style={[styles.collapsibleWrapper, collapseAnimatedStyle]}
            onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0 && !isDismissing.current) {
                    measuredHeight.current = h;
                }
            }}
        >
            <View collapsable={false} style={styles.noteRowWrapper}>
                <Animated.View style={[styles.swipeActionBg, bgAnimatedStyle]}>
                    <Animated.View style={[styles.swipeActionContentLeft, leftActionStyle]}>
                        {item.is_pinned === 1 ? (
                            <PinOff size={18} color="#FFFFFF" strokeWidth={2.5} />
                        ) : (
                            <Pin size={18} color="#FFFFFF" strokeWidth={2.5} />
                        )}
                        <Text style={styles.swipeActionLabel}>
                            {item.is_pinned === 1
                                ? (language === 'es' ? 'Desfijar' : 'Unpin')
                                : (language === 'es' ? 'Fijar' : 'Pin')}
                        </Text>
                    </Animated.View>
                    <Animated.View style={[styles.swipeActionContentRight, rightActionStyle]}>
                        <Text style={styles.swipeActionLabel}>
                            {language === 'es' ? 'Eliminar' : 'Delete'}
                        </Text>
                        <Trash2 size={18} color="#FFFFFF" strokeWidth={2.5} />
                    </Animated.View>
                </Animated.View>

                <GestureDetector gesture={panGesture}>
                    <Animated.View
                        style={[
                            styles.swipeFrontRow,
                            {
                                backgroundColor: isSelected
                                    ? (isDark ? 'rgba(59, 130, 246, 0.16)' : 'rgba(59, 130, 246, 0.09)')
                                    : (isDark ? '#1C1F26' : '#FFFFFF'),
                            },
                            rowAnimatedStyle,
                        ]}
                    >
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={handlePressItem}
                            onLongPress={() => onLongPress(item.id)}
                            style={[
                                styles.noteItem,
                                isSelected && {
                                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.16)' : 'rgba(59, 130, 246, 0.09)',
                                    borderLeftWidth: 3.5,
                                    borderLeftColor: accent.primary,
                                },
                            ]}
                        >
                            {/* Columna de Texto */}
                            <View style={styles.noteTextCol}>
                                {/* Fila Meta: Fecha / Hora + Fijada + Carpeta + Adjuntos */}
                                <View style={styles.noteMetaRow}>
                                    <Text style={[styles.noteDate, { color: colors.textMuted }]}>
                                        {formatNoteDate(item.updated_at_ms || item.created_at_ms)}
                                    </Text>

                                    {item.is_pinned === 1 && sectionKey !== 'pinned' && (
                                        <View style={styles.pinInlineBadge}>
                                            <Pin size={10} color={(isDark ? '#FBBF24' : '#F59E0B') as any} />
                                            <Text style={[styles.pinInlineText, { color: isDark ? '#FBBF24' : '#F59E0B' }]}>
                                                {language === 'es' ? 'Fijada' : 'Pinned'}
                                            </Text>
                                        </View>
                                    )}

                                    {showFolderBadge && folderInfo && (
                                        <View
                                            style={[
                                                styles.folderInlineBadge,
                                                {
                                                    backgroundColor: `${folderColor}${isDark ? '25' : '15'}`,
                                                    borderColor: `${folderColor}30`,
                                                },
                                            ]}
                                        >
                                            <FolderIconRenderer
                                                name={folderInfo.icon}
                                                size={10}
                                                color={folderColor}
                                                strokeWidth={2}
                                            />
                                            <Text
                                                style={[styles.folderInlineText, { color: folderColor }]}
                                                numberOfLines={1}
                                            >
                                                {folderInfo.name}
                                            </Text>
                                        </View>
                                    )}

                                    {hasAttachments && !imageThumb && (
                                        <Paperclip size={11} color={colors.textMuted as any} />
                                    )}
                                </View>

                                {/* Título de la Nota */}
                                <Text
                                    style={[
                                        styles.noteTitle,
                                        {
                                            color: colors.textPrimary,
                                            fontSize: typography.bodyMedium.fontSize,
                                        },
                                    ]}
                                    numberOfLines={1}
                                >
                                    {item.title || t('notes.no_title', { defaultValue: 'Sin título' })}
                                </Text>

                                {/* Extracto de Texto */}
                                {plainText ? (
                                    <Text
                                        style={[
                                            styles.noteSnippet,
                                            {
                                                color: colors.textSecondary,
                                                fontSize: typography.caption.fontSize,
                                            },
                                        ]}
                                        numberOfLines={2}
                                    >
                                        {plainText}
                                    </Text>
                                ) : null}
                            </View>

                            {/* Thumbnail lateral si contiene imagen */}
                            {imageThumb && (
                                <View style={[styles.thumbWrapper, { borderColor: colors.borderSubtle }]}>
                                    <Image
                                        source={{ uri: imageThumb }}
                                        style={styles.thumbImage}
                                        resizeMode="cover"
                                    />
                                </View>
                            )}
                        </TouchableOpacity>
                    </Animated.View>
                </GestureDetector>
            </View>

            {/* Divisor entre notas dentro del mismo contenedor */}
            {index < totalCount - 1 && (
                <VeyraDivider style={{ marginHorizontal: 16, opacity: 0.4 }} />
            )}
        </Animated.View>
    );
});

/**
 * NotesScreen — Organización por Contenedores Cronológicos y Carpetas Personalizadas
 */
export default function NotesScreen({ hideBars = false }: { hideBars?: boolean } = {}) {
    const { t } = useTranslation();
    const router = useRouter();

    useEffect(() => {
        if (!hideBars) {
            useStore.getState().setMainActiveTab('notes');
            router.replace('/');
        }
    }, [hideBars, router]);
    const language = useStore(state => state.language);
    const notes = useNotesStore(state => state.notes);
    const loadNotes = useNotesStore(state => state.loadNotes);
    const deleteNote = useNotesStore(state => state.deleteNote);
    const deleteNotesBatch = useNotesStore(state => state.deleteNotesBatch);
    const updateNote = useNotesStore(state => state.updateNote);
    const updateNotesBatch = useNotesStore(state => state.updateNotesBatch);
    const moveNotesBatch = useNotesStore(state => state.moveNotesBatch);
    const addNote = useNotesStore(state => state.addNote);
    const setSelectedNotesIds = useNotesStore(state => state.setSelectedNotesIds);

    const folders = useFoldersStore(state => state.folders);
    const loadFolders = useFoldersStore(state => state.loadFolders);
    const createFolder = useFoldersStore(state => state.createFolder);
    const updateFolder = useFoldersStore(state => state.updateFolder);
    const togglePinFolder = useFoldersStore(state => state.togglePinFolder);
    const deleteFolder = useFoldersStore(state => state.deleteFolder);
    const deleteFolders = useFoldersStore(state => state.deleteFolders);
    const activeFolderId = useFoldersStore(state => state.activeFolderId);
    const setActiveFolderId = useFoldersStore(state => state.setActiveFolderId);
    const setSelectedFolderIdsStore = useFoldersStore(state => state.setSelectedFolderIds);

    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();
    const locale = language === 'es' ? es : enUS;

    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
    const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
    const [deletingIds, setDeletingIds] = useState<string[]>([]);
    const isSelectionMode = selectedNotes.length > 0;
    const isFolderSelectionMode = selectedFolderIds.length > 0;

    // Origin rect of clicked folder card for physical morphing
    // useRef preserves the rect during close animation without triggering re-renders
    const screenContainerRef = useRef<View>(null);
    const screenOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: insets.top + 46 });
    const originCardRectRef = useRef<{ x: number; y: number; width: number; height: number }>({ x: 20, y: 50, width: windowWidth - 40, height: 48 });
    const [openedFolderId, setOpenedFolderId] = useState<string | null>(null);

    // Shared values for container and rect so worklet can read them without closures
    const svContainerW = useSharedValue(windowWidth);
    const svContainerH = useSharedValue(windowHeight);
    const svOriginX = useSharedValue(20);
    const svOriginY = useSharedValue(50);
    const svOriginW = useSharedValue(windowWidth - 40);
    const svOriginH = useSharedValue(48);

    // Folder options menu popover state
    const [isFolderMenuVisible, setIsFolderMenuVisible] = useState(false);

    // Reset search & menu when active folder changes
    useEffect(() => {
        setIsSearching(false);
        setIsFolderMenuVisible(false);
        setSearchQuery('');
    }, [activeFolderId]);

    // Folder Modals state
    const [isFolderModalVisible, setIsFolderModalVisible] = useState(false);
    const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
    const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);

    // Animated values with Reanimated (runs on UI thread)
    const selectionAnim = useSharedValue(0);
    const folderSelectionAnim = useSharedValue(0);
    const pinButtonAnim = useSharedValue(1);

    // Folder morphing progress shared value (0 = collapsed card, 1 = full screen)
    const folderMorphProgress = useSharedValue(0);

    const handleOpenFolder = useCallback((folderId: string, rect?: { x: number; y: number; width: number; height: number }) => {
        const sx = screenOffsetRef.current.x;
        const sy = screenOffsetRef.current.y;

        const initialRect = (rect && rect.width > 0 && rect.height > 0)
            ? {
                x: rect.x - sx,
                y: rect.y - sy,
                width: rect.width,
                height: rect.height,
            }
            : { x: 20, y: 50, width: svContainerW.value - 40, height: 48 };

        // Persist the origin rect in ref (survives close animation without re-renders)
        originCardRectRef.current = initialRect;
        // Write to shared values so the worklet sees them immediately on UI thread
        svOriginX.value = initialRect.x;
        svOriginY.value = initialRect.y;
        svOriginW.value = initialRect.width;
        svOriginH.value = initialRect.height;

        // Reset progress to 0 synchronously BEFORE mounting the overlay
        folderMorphProgress.value = 0;

        setOpenedFolderId(folderId);
        setActiveFolderId(folderId);

        // Defer animation start to AFTER the overlay has been painted for the first time
        requestAnimationFrame(() => {
            folderMorphProgress.value = withTiming(1, {
                duration: 440,
                easing: ReanimatedEasing.bezier(0.22, 1, 0.36, 1),
            });
        });
    }, [setActiveFolderId]);

    const isClosingFolderRef = useRef(false);

    const finishCloseFolder = useCallback(() => {
        isClosingFolderRef.current = false;
        setOpenedFolderId(null);
        setActiveFolderId('all');
        // Reset shared values back to defaults after close
        svOriginX.value = 20;
        svOriginY.value = 50;
        svOriginW.value = svContainerW.value - 40;
        svOriginH.value = 48;
    }, [setActiveFolderId]);

    const handleCloseFolder = useCallback(() => {
        if (isClosingFolderRef.current) return;
        isClosingFolderRef.current = true;

        if (isSearching) {
            setIsSearching(false);
            setSearchQuery('');
        }
        if (isFolderMenuVisible) {
            setIsFolderMenuVisible(false);
        }

        const safeFinish = () => {
            finishCloseFolder();
        };

        const timeoutId = setTimeout(safeFinish, 360);

        folderMorphProgress.value = withTiming(
            0,
            {
                duration: 320,
                easing: ReanimatedEasing.bezier(0.25, 1, 0.5, 1),
            },
            () => {
                clearTimeout(timeoutId);
                runOnJS(safeFinish)();
            }
        );
    }, [isSearching, isFolderMenuVisible, finishCloseFolder]);

    useEffect(() => {
        LayoutAnimation.configureNext({
            duration: 180,
            create: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
            },
            update: {
                type: LayoutAnimation.Types.easeInEaseOut,
            },
            delete: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
            },
        });
        selectionAnim.value = withTiming(isSelectionMode ? 1 : 0, {
            duration: isSelectionMode ? 200 : 150,
            easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
        });
    }, [isSelectionMode]);

    useEffect(() => {
        folderSelectionAnim.value = withTiming(isFolderSelectionMode ? 1 : 0, {
            duration: isFolderSelectionMode ? 200 : 150,
            easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
        });
    }, [isFolderSelectionMode]);

    // Sincronizar selección con el store global para ocultar la barra de pestañas
    useEffect(() => {
        setSelectedNotesIds(selectedNotes);
        return () => setSelectedNotesIds([]);
    }, [selectedNotes, setSelectedNotesIds]);

    useEffect(() => {
        setSelectedFolderIdsStore(selectedFolderIds);
        return () => setSelectedFolderIdsStore([]);
    }, [selectedFolderIds, setSelectedFolderIdsStore]);

    const toggleSelection = (id: string) => {
        setSelectedNotes(prev => (prev.includes(id) ? prev.filter(noteId => noteId !== id) : [...prev, id]));
    };

    const setCardOrigin = useCardTransitionStore(state => state.setOrigin);

    const handlePress = useCallback((id: string) => {
        if (isFolderSelectionMode) {
            setSelectedFolderIds([]);
            return;
        }
        if (isSelectionMode) {
            toggleSelection(id);
        } else {
            router.push(`/notes/${id}`);
        }
    }, [isFolderSelectionMode, isSelectionMode, router]);

    const handleLongPress = (id: string) => {
        if (isFolderSelectionMode) {
            setSelectedFolderIds([]);
        }
        if (!isSelectionMode) {
            LayoutAnimation.configureNext({
                duration: 180,
                create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                update: { type: LayoutAnimation.Types.easeInEaseOut },
                delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            });
            setSelectedNotes([id]);
        } else {
            toggleSelection(id);
        }
    };

    const handleToggleSelectFolder = useCallback((id: string) => {
        setSelectedFolderIds(prev =>
            prev.includes(id) ? prev.filter(fId => fId !== id) : [...prev, id]
        );
    }, []);

    const handleLongPressFolder = useCallback((id: string) => {
        if (isSelectionMode) {
            setSelectedNotes([]);
        }
        if (!isFolderSelectionMode) {
            setSelectedFolderIds([id]);
        } else {
            handleToggleSelectFolder(id);
        }
    }, [isSelectionMode, isFolderSelectionMode, handleToggleSelectFolder]);

    const isAllFoldersSelected = folders.length > 0 && selectedFolderIds.length === folders.length;

    const handleToggleSelectAllFolders = () => {
        if (isAllFoldersSelected) {
            setSelectedFolderIds([]);
        } else {
            setSelectedFolderIds(folders.map(f => f.id));
        }
    };

    const isAllSelectedFoldersPinned = useMemo(() => {
        if (selectedFolderIds.length === 0) return false;
        return selectedFolderIds.every(id => {
            const f = folders.find(item => item.id === id);
            return f?.is_pinned === 1;
        });
    }, [selectedFolderIds, folders]);

    const handleTogglePinSelectedFolders = async () => {
        const targetIds = [...selectedFolderIds];
        setSelectedFolderIds([]);
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        for (const id of targetIds) {
            await togglePinFolder(id);
        }
    };

    const handleEditSelectedFolder = () => {
        if (selectedFolderIds.length !== 1) return;
        const targetFolder = folders.find(f => f.id === selectedFolderIds[0]);
        if (targetFolder) {
            setSelectedFolderIds([]);
            setEditingFolder(targetFolder);
            setIsFolderModalVisible(true);
        }
    };

    const handleDeleteSelectedFolders = () => {
        const count = selectedFolderIds.length;
        Alert.alert(
            language === 'es' ? '¿Eliminar carpetas?' : 'Delete folders?',
            language === 'es'
                ? `¿Deseas eliminar ${count} carpeta${count > 1 ? 's' : ''}? Las notas no se eliminarán, quedarán sin carpeta.`
                : `Do you want to delete ${count} folder${count > 1 ? 's' : ''}? Notes will not be deleted.`,
            [
                { text: language === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
                {
                    text: language === 'es' ? 'Eliminar' : 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        const toDelete = [...selectedFolderIds];
                        if (openedFolderId && toDelete.includes(openedFolderId)) {
                            finishCloseFolder();
                        }
                        LayoutAnimation.configureNext(smoothLayoutAnimation);
                        setSelectedFolderIds([]);
                        await deleteFolders(toDelete, false);
                    },
                },
            ]
        );
    };

    const handleDeleteNote = useCallback((id: string) => {
        deleteNote(id);
    }, [deleteNote]);

    const handleTogglePinNote = useCallback((id: string) => {
        const target = notes.find(n => n.id === id);
        if (target) {
            const newPin = target.is_pinned === 1 ? 0 : 1;
            updateNote(id, { is_pinned: newPin });
        }
    }, [notes, updateNote]);

    // 1. Fijar / Desfijar notas seleccionadas con animación atómica fluida
    const isAllPinned = useMemo(() => {
        if (selectedNotes.length === 0) return false;
        return selectedNotes.every(id => {
            const n = notes.find(item => item.id === id);
            return n?.is_pinned === 1;
        });
    }, [selectedNotes, notes]);

    const handleTogglePinSelected = async () => {
        pinButtonAnim.value = withSequence(
            withTiming(0.72, { duration: 90 }),
            withSpring(1, { damping: 10, stiffness: 150 })
        );

        const newPinStatus = isAllPinned ? 0 : 1;
        const targetIds = [...selectedNotes];

        LayoutAnimation.configureNext(smoothLayoutAnimation);
        setSelectedNotes([]);
        await updateNotesBatch(targetIds, { is_pinned: newPinStatus });
    };

    // 2. Mover notas seleccionadas a carpeta
    const handleMoveSelected = async (targetFolderId: string | null) => {
        const targetIds = [...selectedNotes];
        LayoutAnimation.configureNext(smoothLayoutAnimation);
        setSelectedNotes([]);
        await moveNotesBatch(targetIds, targetFolderId);
    };

    // 3. Duplicar notas seleccionadas con animación
    const handleDuplicateSelected = async () => {
        const toDuplicate = notes.filter(n => selectedNotes.includes(n.id));
        setSelectedNotes([]);

        LayoutAnimation.configureNext(smoothLayoutAnimation);
        for (const n of toDuplicate) {
            const copyTitle = n.title ? `${n.title} (${language === 'es' ? 'Copia' : 'Copy'})` : (language === 'es' ? 'Nota duplicada' : 'Duplicated note');
            await addNote(copyTitle, n.content, n.attachments, n.links, false, n.folder_id);
        }
    };

    // 4. Compartir notas seleccionadas
    const handleShareSelected = async () => {
        const selectedObjList = notes.filter(n => selectedNotes.includes(n.id));
        if (selectedObjList.length === 0) return;

        let shareText = '';
        if (selectedObjList.length === 1) {
            const n = selectedObjList[0];
            const plain = extractPlainTextFromPages(n.content);
            shareText = `${n.title || (language === 'es' ? 'Sin título' : 'Untitled')}\n\n${plain}`;
        } else {
            shareText = selectedObjList
                .map((n, idx) => {
                    const plain = extractPlainTextFromPages(n.content);
                    return `--- ${n.title || (language === 'es' ? `Nota ${idx + 1}` : `Note ${idx + 1}`)} ---\n${plain}`;
                })
                .join('\n\n');
        }

        try {
            await Share.share({
                title: language === 'es' ? 'Notas de Veyra' : 'Veyra Notes',
                message: shareText,
            });
        } catch (e) {}
    };

    // 5. Eliminar notas seleccionadas en bloque con salida animada suave
    const handleDeleteSelected = () => {
        Alert.alert(
            language === 'es' ? '¿Eliminar notas?' : 'Delete notes?',
            language === 'es'
                ? `¿Deseas mover ${selectedNotes.length} nota${selectedNotes.length > 1 ? 's' : ''} a la papelera?`
                : `Do you want to move ${selectedNotes.length} note${selectedNotes.length > 1 ? 's' : ''} to trash?`,
            [
                { text: language === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
                {
                    text: language === 'es' ? 'Eliminar' : 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        const toDelete = [...selectedNotes];
                        setDeletingIds(toDelete);
                        setTimeout(async () => {
                            LayoutAnimation.configureNext(smoothLayoutAnimation);
                            setDeletingIds([]);
                            setSelectedNotes([]);
                            await deleteNotesBatch(toDelete);
                        }, 230);
                    },
                },
            ]
        );
    };

    useEffect(() => {
        const backAction = () => {
            if (isFolderSelectionMode) {
                setSelectedFolderIds([]);
                return true;
            }
            if (isSelectionMode) {
                setSelectedNotes([]);
                return true;
            }
            if (isFolderMenuVisible) {
                setIsFolderMenuVisible(false);
                return true;
            }
            if (isSearching) {
                setIsSearching(false);
                setSearchQuery('');
                return true;
            }
            if (openedFolderId !== null || activeFolderId !== 'all') {
                handleCloseFolder();
                return true;
            }
            if (router.canGoBack()) {
                router.back();
                return true;
            }
            if (useStore.getState().mainActiveTab === 'notes') {
                useStore.getState().setMainActiveTab('reminders');
                return true;
            }
            return false;
        };

        const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
        return () => backHandler.remove();
    }, [isFolderSelectionMode, isSelectionMode, isFolderMenuVisible, isSearching, openedFolderId, activeFolderId, handleCloseFolder]);

    useFocusEffect(
        useCallback(() => {
            folderSelectionAnim.value = 0;
            selectionAnim.value = 0;

            const { isNotesDirty, notes: currentNotes, loadNotes: refreshNotes } = useNotesStore.getState();
            const { isFoldersDirty, folders: currentFolders, loadFolders: refreshFolders } = useFoldersStore.getState();

            // Caché inteligente: solo consultar SQLite si hay cambios pendientes o en la primera carga
            if (isNotesDirty || currentNotes.length === 0) {
                refreshNotes();
            }
            if (isFoldersDirty || currentFolders.length === 0) {
                refreshFolders();
            }

            if (!openedFolderId && useFoldersStore.getState().activeFolderId !== 'all') {
                setActiveFolderId('all');
            }

            return () => {
                setSelectedNotes([]);
                setSelectedFolderIds([]);
            };
        }, [openedFolderId, setActiveFolderId])
    );

    useEffect(() => {
        const { isNotesDirty, notes: currentNotes, loadNotes: refreshNotes } = useNotesStore.getState();
        const { isFoldersDirty, folders: currentFolders, loadFolders: refreshFolders } = useFoldersStore.getState();
        if (isNotesDirty || currentNotes.length === 0) refreshNotes();
        if (isFoldersDirty || currentFolders.length === 0) refreshFolders();
    }, []);

    // Formateo de fecha editorial relativo (Hoy, Ayer, o "2 Sep")
    const formatNoteDate = (ms: number) => {
        const d = new Date(ms);
        if (isToday(d)) {
            return format(d, 'HH:mm');
        }
        if (isYesterday(d)) {
            return language === 'es' ? 'Ayer' : 'Yesterday';
        }
        return format(d, language === 'es' ? 'd MMM' : 'MMM d', { locale });
    };

    // Conteo de fijadas y sin carpeta
    const pinnedCount = useMemo(() => notes.filter(n => n.is_pinned === 1).length, [notes]);
    const unassignedCount = useMemo(() => notes.filter(n => !n.folder_id).length, [notes]);

    // Mapa rápido de carpetas por ID
    const foldersMap = useMemo(() => {
        const map = new Map<string, Folder>();
        for (const f of folders) {
            map.set(f.id, f);
        }
        return map;
    }, [folders]);

    // Helper para generar secciones cronológicas
    const generateSections = useCallback((notesList: Note[], isAllView: boolean): NoteSection[] => {
        if (notesList.length === 0) return [];

        const getSectionInfo = (timeMs: number) => {
            const d = new Date(timeMs);
            if (isToday(d)) {
                return {
                    key: 'today',
                    title: t('notes.today', { defaultValue: language === 'es' ? 'Hoy' : 'Today' }),
                };
            }
            if (isYesterday(d)) {
                return {
                    key: 'yesterday',
                    title: t('notes.yesterday', { defaultValue: language === 'es' ? 'Ayer' : 'Yesterday' }),
                };
            }
            if (isThisWeek(d, { weekStartsOn: 1 })) {
                return {
                    key: 'this_week',
                    title: t('notes.this_week', { defaultValue: language === 'es' ? 'Esta semana' : 'This week' }),
                };
            }
            if (isThisMonth(d)) {
                return {
                    key: 'this_month',
                    title: t('notes.this_month', { defaultValue: language === 'es' ? 'Este mes' : 'This month' }),
                };
            }
            if (isThisYear(d)) {
                const rawMonth = format(d, 'MMMM', { locale });
                const capitalizedMonth = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);
                return {
                    key: `month_${format(d, 'yyyy_MM')}`,
                    title: capitalizedMonth,
                };
            }
            const rawMonthYear = format(d, language === 'es' ? "MMMM 'de' yyyy" : 'MMMM yyyy', { locale });
            const capitalizedMonthYear = rawMonthYear.charAt(0).toUpperCase() + rawMonthYear.slice(1);
            return {
                key: `year_${format(d, 'yyyy_MM')}`,
                title: capitalizedMonthYear,
            };
        };

        const sectionsMap = new Map<string, NoteSection>();

        if (isAllView) {
            const pinned = notesList.filter(n => n.is_pinned === 1);
            const unpinned = notesList.filter(n => n.is_pinned !== 1);

            if (pinned.length > 0) {
                sectionsMap.set('pinned', {
                    key: 'pinned',
                    title: t('notes.pinned', { defaultValue: language === 'es' ? 'Fijadas' : 'Pinned' }),
                    data: pinned,
                });
            }

            for (const note of unpinned) {
                const time = note.updated_at_ms || note.created_at_ms || Date.now();
                const { key, title } = getSectionInfo(time);
                if (!sectionsMap.has(key)) {
                    sectionsMap.set(key, { key, title, data: [] });
                }
                sectionsMap.get(key)!.data.push(note);
            }
        } else {
            for (const note of notesList) {
                const time = note.updated_at_ms || note.created_at_ms || Date.now();
                const { key, title } = getSectionInfo(time);
                if (!sectionsMap.has(key)) {
                    sectionsMap.set(key, { key, title, data: [] });
                }
                sectionsMap.get(key)!.data.push(note);
            }
        }

        return Array.from(sectionsMap.values());
    }, [language, locale, t]);

    // 1. Filtrado para la pantalla base (Todas las notas)
    const filteredBaseNotes = useMemo(() => {
        return notes.filter(note => {
            if (openedFolderId) return true; // Base screen stays cached
            const plainContent = extractPlainTextFromPages(note.content);
            const matchesSearch =
                note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                plainContent.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesSearch;
        });
    }, [notes, searchQuery, openedFolderId]);

    const sortedBaseNotes = useMemo(() => {
        return [...filteredBaseNotes].sort((a, b) => {
            const timeA = a.updated_at_ms || a.created_at_ms || 0;
            const timeB = b.updated_at_ms || b.created_at_ms || 0;
            return timeB - timeA;
        });
    }, [filteredBaseNotes]);

    const baseSections = useMemo(() => {
        return generateSections(sortedBaseNotes, true);
    }, [sortedBaseNotes, generateSections]);

    // 2. Filtrado para la pantalla de Carpeta Animada
    const currentTargetFolderId = openedFolderId || activeFolderId;
    const isFolderViewActive = currentTargetFolderId !== 'all';

    const filteredFolderNotes = useMemo(() => {
        if (!isFolderViewActive) return [];
        return notes.filter(note => {
            const plainContent = extractPlainTextFromPages(note.content);
            const matchesSearch =
                note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                plainContent.toLowerCase().includes(searchQuery.toLowerCase());

            if (!matchesSearch) return false;

            if (currentTargetFolderId === 'pinned') return note.is_pinned === 1;
            if (currentTargetFolderId === 'unassigned') return !note.folder_id;
            return note.folder_id === currentTargetFolderId;
        });
    }, [notes, searchQuery, currentTargetFolderId, isFolderViewActive]);

    const sortedFolderNotes = useMemo(() => {
        return [...filteredFolderNotes].sort((a, b) => {
            const timeA = a.updated_at_ms || a.created_at_ms || 0;
            const timeB = b.updated_at_ms || b.created_at_ms || 0;
            return timeB - timeA;
        });
    }, [filteredFolderNotes]);

    const folderSections = useMemo(() => {
        return generateSections(sortedFolderNotes, false);
    }, [sortedFolderNotes, generateSections]);

    // Selección total
    const activeNotesForSelection = isFolderViewActive ? filteredFolderNotes : filteredBaseNotes;
    const isAllFilteredSelected = activeNotesForSelection.length > 0 && selectedNotes.length === activeNotesForSelection.length;

    const handleToggleSelectAll = () => {
        if (isAllFilteredSelected) {
            setSelectedNotes([]);
        } else {
            setSelectedNotes(activeNotesForSelection.map(n => n.id));
        }
    };

    // Color de la carpeta activa actual
    const activeFolderColor = useMemo(() => {
        if (currentTargetFolderId && currentTargetFolderId !== 'all' && currentTargetFolderId !== 'pinned' && currentTargetFolderId !== 'unassigned') {
            const f = foldersMap.get(currentTargetFolderId);
            return f?.color || '#8B5CF6';
        }
        if (currentTargetFolderId === 'pinned') {
            return isDark ? '#FBBF24' : '#F59E0B';
        }
        return accent.primary;
    }, [currentTargetFolderId, foldersMap, accent.primary, isDark]);

    // 1. Render de sección para la Pantalla Base (Siempre estilo neutro, sin teñir)
    const renderBaseSectionContainer = ({ item: section }: { item: NoteSection }) => {
        return (
            <Animated.View
                key={section.key}
                layout={LinearTransition.duration(260).easing(ReanimatedEasing.bezier(0.25, 1, 0.5, 1))}
                style={styles.sectionBlock}
            >
                {/* Título limpio de la sección */}
                <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                        {section.title}
                    </Text>
                    <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
                        {section.data.length}
                    </Text>
                </View>

                {/* Contenedor tipo Tarjeta para este período (Estilo base neutro) */}
                <VeyraSurface
                    level={1}
                    radius="lg"
                    style={[
                        styles.sectionCard,
                        {
                            borderColor: colors.borderSubtle,
                            borderLeftWidth: 1,
                            borderLeftColor: colors.borderSubtle,
                        },
                    ]}
                >
                    {section.data.map((note, idx) => (
                        <NoteItemRow
                            key={note.id}
                            item={note}
                            index={idx}
                            totalCount={section.data.length}
                            sectionKey={section.key}
                            isSelected={selectedNotes.includes(note.id)}
                            isSelectionMode={isSelectionMode}
                            isDeleting={deletingIds.includes(note.id)}
                            folderInfo={note.folder_id ? foldersMap.get(note.folder_id) : null}
                            showFolderBadge={true}
                            colors={colors}
                            typography={typography}
                            accent={accent}
                            isDark={isDark}
                            language={language}
                            locale={locale}
                            t={t}
                            onPress={handlePress}
                            onLongPress={handleLongPress}
                            formatNoteDate={formatNoteDate}
                            onDeleteNote={handleDeleteNote}
                            onTogglePinNote={handleTogglePinNote}
                        />
                    ))}
                </VeyraSurface>
            </Animated.View>
        );
    };

    // 2. Render de sección para la Vista de Carpeta en el Overlay (Teñido con activeFolderColor)
    const renderFolderSectionContainer = ({ item: section }: { item: NoteSection }) => {
        return (
            <Animated.View
                key={section.key}
                layout={LinearTransition.duration(260).easing(ReanimatedEasing.bezier(0.25, 1, 0.5, 1))}
                style={styles.sectionBlock}
            >
                {/* Título de la sección teñido con el color de la carpeta */}
                <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: activeFolderColor }]}>
                        {section.title}
                    </Text>
                    <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
                        {section.data.length}
                    </Text>
                </View>

                {/* Contenedor tipo Tarjeta para este período con color de carpeta */}
                <VeyraSurface
                    level={1}
                    radius="lg"
                    style={[
                        styles.sectionCard,
                        {
                            borderColor: isDark ? `${activeFolderColor}35` : `${activeFolderColor}28`,
                            backgroundColor: isDark ? `${activeFolderColor}0F` : `${activeFolderColor}08`,
                            borderLeftWidth: 3.5,
                            borderLeftColor: activeFolderColor,
                        },
                    ]}
                >
                    {section.data.map((note, idx) => (
                        <NoteItemRow
                            key={note.id}
                            item={note}
                            index={idx}
                            totalCount={section.data.length}
                            sectionKey={section.key}
                            isSelected={selectedNotes.includes(note.id)}
                            isSelectionMode={isSelectionMode}
                            isDeleting={deletingIds.includes(note.id)}
                            folderInfo={null}
                            showFolderBadge={false}
                            colors={colors}
                            typography={typography}
                            accent={accent}
                            isDark={isDark}
                            language={language}
                            locale={locale}
                            t={t}
                            onPress={handlePress}
                            onLongPress={handleLongPress}
                            formatNoteDate={formatNoteDate}
                            onDeleteNote={handleDeleteNote}
                            onTogglePinNote={handleTogglePinNote}
                        />
                    ))}
                </VeyraSurface>
            </Animated.View>
        );
    };

    // Conteo de notas por carpeta
    const noteCountsMap = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const n of notes) {
            if (n.folder_id) {
                counts[n.folder_id] = (counts[n.folder_id] || 0) + 1;
            }
        }
        return counts;
    }, [notes]);

    // Carpetas para el carrusel de Acceso Rápido (máximo 3 fijadas + la actualmente activa)
    const quickAccessFolders = useMemo(() => {
        const pinned = folders.filter(f => f.is_pinned === 1).slice(0, 3);
        if (currentTargetFolderId !== 'all' && currentTargetFolderId !== 'pinned' && currentTargetFolderId !== 'unassigned') {
            const isAlreadyIncluded = pinned.some(f => f.id === currentTargetFolderId);
            if (!isAlreadyIncluded) {
                const currentActive = folders.find(f => f.id === currentTargetFolderId);
                if (currentActive) {
                    return [...pinned, currentActive];
                }
            }
        }
        return pinned;
    }, [folders, currentTargetFolderId]);

    // Carpeta activa como objeto
    const activeFolderObj = useMemo(() => {
        if (currentTargetFolderId === 'all' || currentTargetFolderId === 'pinned' || currentTargetFolderId === 'unassigned') {
            return null;
        }
        return foldersMap.get(currentTargetFolderId) || null;
    }, [currentTargetFolderId, foldersMap]);

    // Header superior de la lista: Grid de carpetas colapsable solo en la vista 'all'
    const renderListHeader = () => {
        if (isSearching || searchQuery) return null;

        return (
            <View style={styles.folderGridWrapper}>
                <FolderCardGrid
                    folders={folders}
                    noteCounts={noteCountsMap}
                    selectedFolderIds={selectedFolderIds}
                    isSelectionMode={isFolderSelectionMode}
                    onToggleSelectFolder={handleToggleSelectFolder}
                    onLongPressFolder={handleLongPressFolder}
                    onSelectFolder={(id, rect) => {
                        handleOpenFolder(id, rect);
                    }}
                    onEditFolder={(folder) => {
                        setEditingFolder(folder);
                        setIsFolderModalVisible(true);
                    }}
                    onCreateFolder={() => {
                        setEditingFolder(null);
                        setIsFolderModalVisible(true);
                    }}
                    onTogglePin={async (id) => {
                        await togglePinFolder(id);
                    }}
                />
            </View>
        );
    };

    // Derived animation styles for the floating pill with Reanimated
    const pillAnimatedStyle = useAnimatedStyle(() => {
        const translateY = interpolate(selectionAnim.value, [0, 1], [20, 0], Extrapolation.CLAMP);
        const scale = interpolate(selectionAnim.value, [0, 1], [0.96, 1], Extrapolation.CLAMP);
        const opacity = interpolate(selectionAnim.value, [0, 1], [0, 1], Extrapolation.CLAMP);
        return {
            opacity,
            transform: [{ translateY }, { scale }],
        };
    });

    const folderPillAnimatedStyle = useAnimatedStyle(() => {
        const translateY = interpolate(folderSelectionAnim.value, [0, 1], [20, 0], Extrapolation.CLAMP);
        const scale = interpolate(folderSelectionAnim.value, [0, 1], [0.96, 1], Extrapolation.CLAMP);
        const opacity = interpolate(folderSelectionAnim.value, [0, 1], [0, 1], Extrapolation.CLAMP);
        return {
            opacity,
            transform: [{ translateY }, { scale }],
        };
    });

    // Atenuación suave por GPU del resto de la pantalla durante selección de carpetas (sin reflows ni layout shifts)
    const dimTopHeaderAnimatedStyle = useAnimatedStyle(() => {
        if (!isFolderSelectionMode && folderSelectionAnim.value === 0) return { opacity: 1 };
        return {
            opacity: interpolate(folderSelectionAnim.value, [0, 1], [1, 0.25], Extrapolation.CLAMP),
        };
    });

    const dimNotesListAnimatedStyle = useAnimatedStyle(() => {
        if (!isFolderSelectionMode && folderSelectionAnim.value === 0) return { opacity: 1 };
        return {
            opacity: interpolate(folderSelectionAnim.value, [0, 1], [1, 0.18], Extrapolation.CLAMP),
        };
    });

    const pinButtonAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pinButtonAnim.value }],
    }));

    // Animated styles para la transformación y expansión física de la tarjeta
    const morphBgColor = colors.bg;
    const morphBorderColor = isDark ? `${activeFolderColor}40` : `${activeFolderColor}25`;

    const morphCardStyle = useAnimatedStyle(() => {
        const left = interpolate(folderMorphProgress.value, [0, 1], [svOriginX.value, 0]);
        const top = interpolate(folderMorphProgress.value, [0, 1], [svOriginY.value, 0]);
        const width = interpolate(folderMorphProgress.value, [0, 1], [svOriginW.value, svContainerW.value]);
        const height = interpolate(folderMorphProgress.value, [0, 1], [svOriginH.value, svContainerH.value]);
        const borderRadius = interpolate(folderMorphProgress.value, [0, 0.8, 1], [13, 6, 0], 'clamp');
        const borderWidth = interpolate(folderMorphProgress.value, [0, 0.7, 1], [1, 0.5, 0], 'clamp');
        const elevation = interpolate(folderMorphProgress.value, [0, 0.35, 1], [2, 10, 0], 'clamp');
        const shadowOpacity = interpolate(folderMorphProgress.value, [0, 0.35, 1], [0.06, 0.2, 0], 'clamp');
        const shadowRadius = interpolate(folderMorphProgress.value, [0, 0.35, 1], [3, 16, 0], 'clamp');

        return {
            position: 'absolute',
            left,
            top,
            width,
            height,
            borderRadius,
            borderWidth,
            borderColor: morphBorderColor,
            backgroundColor: morphBgColor,
            overflow: 'hidden',
            zIndex: 2000,
            elevation,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity,
            shadowRadius,
        };
    }, [morphBorderColor, morphBgColor]);

    const morphHeaderStyle = useAnimatedStyle(() => {
        const translateY = interpolate(folderMorphProgress.value, [0.22, 1], [-8, 0], 'clamp');
        return {
            paddingTop: 4,
            transform: [{ translateY }],
        };
    });

    const morphMiniCardStyle = useAnimatedStyle(() => {
        const opacity = interpolate(
            folderMorphProgress.value,
            [0, 0.18, 0.42],
            [1, 0.85, 0],
            'clamp'
        );
        const scale = interpolate(
            folderMorphProgress.value,
            [0, 0.42],
            [1, 1.04],
            'clamp'
        );
        return {
            opacity,
            transform: [{ scale }],
        };
    });

    const morphFullScreenStyle = useAnimatedStyle(() => {
        const opacity = interpolate(
            folderMorphProgress.value,
            [0.22, 0.65, 1],
            [0, 0.85, 1],
            'clamp'
        );
        return {
            opacity,
        };
    });

    const morphBackBtnStyle = useAnimatedStyle(() => {
        const opacity = interpolate(folderMorphProgress.value, [0.42, 0.85], [0, 1], 'clamp');
        const scale = interpolate(folderMorphProgress.value, [0.42, 1], [0.82, 1], 'clamp');
        return {
            opacity,
            transform: [{ scale }],
        };
    });

    const morphActionsStyle = useAnimatedStyle(() => {
        const opacity = interpolate(folderMorphProgress.value, [0.42, 0.85], [0, 1], 'clamp');
        return {
            opacity,
        };
    });

    const morphNotesContentStyle = useAnimatedStyle(() => {
        const opacity = interpolate(folderMorphProgress.value, [0.35, 0.85], [0, 1], 'clamp');
        const translateY = interpolate(folderMorphProgress.value, [0.35, 1], [16, 0], 'clamp');
        return {
            opacity,
            transform: [{ translateY }],
        };
    });

    // Título y datos de cabecera de la vista de carpeta
    const activeFolderTitle = useMemo(() => {
        if (currentTargetFolderId === 'pinned') return language === 'es' ? 'Notas fijadas' : 'Pinned notes';
        if (currentTargetFolderId === 'unassigned') return language === 'es' ? 'Sin carpeta' : 'Unassigned notes';
        if (activeFolderObj) return activeFolderObj.name;
        return language === 'es' ? 'Todas las notas' : 'All notes';
    }, [currentTargetFolderId, activeFolderObj, language]);

    const activeFolderNotesCount = useMemo(() => {
        if (!currentTargetFolderId || currentTargetFolderId === 'all') return 0;
        if (currentTargetFolderId === 'pinned') return pinnedCount;
        if (currentTargetFolderId === 'unassigned') return unassignedCount;
        return noteCountsMap[currentTargetFolderId] || filteredFolderNotes.length;
    }, [currentTargetFolderId, pinnedCount, unassignedCount, noteCountsMap, filteredFolderNotes]);

    const isFolderPinned = activeFolderObj?.is_pinned === 1;

    const content = (
        <View
            ref={screenContainerRef}
            collapsable={false}
                onLayout={(e) => {
                    const { width, height } = e.nativeEvent.layout;
                    svContainerW.value = width;
                    svContainerH.value = height;
                    if (screenContainerRef.current) {
                        screenContainerRef.current.measureInWindow((sx, sy, sw, sh) => {
                            if (typeof sx === 'number' && typeof sy === 'number') {
                                screenOffsetRef.current = { x: sx, y: sy };
                                if (typeof sw === 'number' && sw > 0) svContainerW.value = sw;
                                if (typeof sh === 'number' && sh > 0) svContainerH.value = sh;
                            }
                        });
                    }
                }}
                style={{ flex: 1, position: 'relative' }}
            >
                {/* 1. PANTALLA BASE (TODAS LAS NOTAS) */}
                <Animated.View
                style={[
                    styles.headerContainer,
                    dimTopHeaderAnimatedStyle,
                ]}
                pointerEvents={isFolderSelectionMode ? 'none' : 'auto'}
            >
                {isSearching && !isFolderViewActive ? (
                    <VeyraSurface level={1} radius="md" style={styles.searchExpandedBar}>
                        <Search size={16} color={accent.primary as any} />
                        <TextInput
                            autoFocus
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder={t('notes.search_placeholder', { defaultValue: 'Buscar en tus notas...' })}
                            placeholderTextColor={colors.textMuted}
                            style={[
                                styles.searchExpandedInput,
                                { color: colors.textPrimary, fontSize: typography.body.fontSize },
                            ]}
                            selectionColor={accent.primary}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity
                                onPress={() => setSearchQuery('')}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={styles.searchIconBtn}
                            >
                                <X size={15} color={colors.textMuted as any} />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={() => {
                                LayoutAnimation.configureNext(smoothLayoutAnimation);
                                setIsSearching(false);
                                setSearchQuery('');
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={[
                                styles.searchCloseBtn,
                                { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
                            ]}
                            activeOpacity={0.7}
                        >
                            <X size={14} color={colors.textSecondary as any} />
                        </TouchableOpacity>
                    </VeyraSurface>
                ) : (
                    <View style={styles.mainTopRow}>
                        {/* Fila de Filtros / Acceso Rápido ocupando el espacio principal */}
                        <View style={styles.mainFiltersStrip}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.mainFiltersScrollContent}
                            >
                                {/* 1. TODAS */}
                                <TouchableOpacity
                                    style={[
                                        styles.folderChip,
                                        {
                                            backgroundColor: isDark ? '#262933' : '#E2E8F0',
                                            borderColor: accent.primary,
                                        },
                                    ]}
                                    onPress={() => {
                                        if (isFolderViewActive) {
                                            handleCloseFolder();
                                        }
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Layers size={13} color={accent.primary as any} />
                                    <Text
                                        style={[
                                            styles.folderChipText,
                                            {
                                                color: colors.textPrimary,
                                                fontWeight: '700',
                                            },
                                        ]}
                                    >
                                        {language === 'es' ? 'Todas' : 'All'}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.folderChipBadge,
                                            {
                                                backgroundColor: isDark ? '#1C1F26' : '#FFFFFF',
                                                color: accent.primary,
                                            },
                                        ]}
                                    >
                                        {notes.length}
                                    </Text>
                                </TouchableOpacity>

                                {/* 2. FIJADAS */}
                                {pinnedCount > 0 && (
                                    <TouchableOpacity
                                        style={[
                                            styles.folderChip,
                                            {
                                                backgroundColor: isDark ? '#1C1F26' : '#FFFFFF',
                                                borderColor: isDark ? '#FBBF2440' : '#F59E0B30',
                                            },
                                        ]}
                                        onPress={() => handleOpenFolder('pinned')}
                                        activeOpacity={0.7}
                                    >
                                        <Pin size={12} color={(isDark ? '#FBBF24' : '#F59E0B') as any} />
                                        <Text
                                            style={[
                                                styles.folderChipText,
                                                { color: colors.textPrimary },
                                            ]}
                                        >
                                            {language === 'es' ? 'Fijadas' : 'Pinned'}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.folderChipBadge,
                                                {
                                                    backgroundColor: isDark ? '#262933' : '#F1F5F9',
                                                    color: isDark ? '#FBBF24' : '#F59E0B',
                                                },
                                            ]}
                                        >
                                            {pinnedCount}
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {/* 3. SIN CARPETA */}
                                {unassignedCount > 0 && (
                                    <TouchableOpacity
                                        style={[
                                            styles.folderChip,
                                            {
                                                backgroundColor: isDark ? '#1C1F26' : '#FFFFFF',
                                                borderColor: colors.borderSubtle,
                                            },
                                        ]}
                                        onPress={() => handleOpenFolder('unassigned')}
                                        activeOpacity={0.7}
                                    >
                                        <Inbox size={12} color={colors.textSecondary as any} />
                                        <Text
                                            style={[
                                                styles.folderChipText,
                                                { color: colors.textSecondary },
                                            ]}
                                        >
                                            {language === 'es' ? 'Sin carpeta' : 'Unassigned'}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.folderChipBadge,
                                                {
                                                    backgroundColor: isDark ? '#262933' : '#F1F5F9',
                                                    color: colors.textMuted,
                                                },
                                            ]}
                                        >
                                            {unassignedCount}
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {/* 4. CARPETAS DE ACCESO RÁPIDO */}
                                {quickAccessFolders.map(f => {
                                    const folderColor = f.color || '#8B5CF6';
                                    const count = noteCountsMap[f.id] || 0;

                                    return (
                                        <TouchableOpacity
                                            key={f.id}
                                            style={[
                                                styles.folderChip,
                                                {
                                                    backgroundColor: isDark ? '#1C1F26' : '#FFFFFF',
                                                    borderColor: isDark ? `${folderColor}40` : `${folderColor}30`,
                                                },
                                            ]}
                                            onPress={() => handleOpenFolder(f.id)}
                                            activeOpacity={0.7}
                                        >
                                            <FolderIconRenderer
                                                name={f.icon || 'folder'}
                                                size={12}
                                                color={folderColor}
                                                strokeWidth={2}
                                            />
                                            <Text
                                                style={[
                                                    styles.folderChipText,
                                                    { color: colors.textPrimary },
                                                ]}
                                                numberOfLines={1}
                                            >
                                                {f.name}
                                            </Text>
                                            {count > 0 && (
                                                <Text
                                                    style={[
                                                        styles.folderChipBadge,
                                                        {
                                                            backgroundColor: isDark ? '#262933' : '#F1F5F9',
                                                            color: folderColor,
                                                        },
                                                    ]}
                                                >
                                                    {count}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}

                                {/* 5. BOTÓN NUEVA CARPETA */}
                                <TouchableOpacity
                                    style={[
                                        styles.newFolderChip,
                                        {
                                            borderColor: accent.primary,
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                        },
                                    ]}
                                    onPress={() => {
                                        setEditingFolder(null);
                                        setIsFolderModalVisible(true);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <FolderPlus size={13} color={accent.primary as any} />
                                    <Text style={[styles.newFolderChipText, { color: accent.primary }]}>
                                        {language === 'es' ? 'Nueva' : 'New'}
                                    </Text>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>

                        {/* Botones de Acción a la Derecha */}
                        <View style={styles.mainTopActions}>
                            <TouchableOpacity
                                style={[
                                    styles.mainTopActionIconBtn,
                                    {
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)',
                                        borderColor: colors.borderSubtle,
                                    },
                                ]}
                                onPress={() => {
                                    LayoutAnimation.configureNext(smoothLayoutAnimation);
                                    setIsSearching(true);
                                }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                activeOpacity={0.7}
                            >
                                <Search size={16} color={colors.textSecondary as any} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.mainTopActionIconBtn,
                                    {
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)',
                                        borderColor: colors.borderSubtle,
                                    },
                                ]}
                                onPress={() => router.push('/notes-history')}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                activeOpacity={0.7}
                            >
                                <History size={16} color={colors.textSecondary as any} />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </Animated.View>

            {/* Lista Base de Secciones */}
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingTop: 8,
                    paddingBottom: insets.bottom + ((isSelectionMode || isFolderSelectionMode) ? 220 : 100),
                }}
            >
                {renderListHeader()}

                {/* Contenedor de notas base con atenuación fluida en GPU durante selección de carpetas */}
                <Animated.View
                    style={[
                        styles.baseNotesSectionWrapper,
                        dimNotesListAnimatedStyle,
                    ]}
                    pointerEvents={isFolderSelectionMode ? 'none' : 'auto'}
                >
                    {baseSections.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <View
                                style={[
                                    styles.emptyIconWrapper,
                                    {
                                        backgroundColor: isDark ? '#1F222A' : '#F1F5F9',
                                        borderColor: colors.borderSubtle,
                                    },
                                ]}
                            >
                                <FileText size={28} color={colors.textMuted} />
                            </View>
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                {searchQuery
                                    ? (language === 'es' ? 'No se encontraron notas' : 'No notes found')
                                    : (language === 'es' ? 'No tienes notas aún' : 'You have no notes yet')}
                            </Text>
                        </View>
                    ) : (
                        baseSections.map(section => renderBaseSectionContainer({ item: section }))
                    )}
                </Animated.View>

                {/* Backdrop táctil para cancelar la selección de carpetas al tocar fuera */}
                {isFolderSelectionMode && (
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => {
                            setSelectedFolderIds([]);
                        }}
                        style={[
                            StyleSheet.absoluteFill,
                            {
                                top: 220,
                                zIndex: 10,
                            },
                        ]}
                    />
                )}
            </ScrollView>

            {/* 2. OVERLAY ANIMADO DE EXPANSIÓN Y RETORNO DE LA TARJETA DE CARPETA (SHARED ELEMENT MORPH) */}
            {openedFolderId !== null && (
                <Animated.View style={morphCardStyle}>
                    {/* Capa A: Miniatura idéntica de la tarjeta en el grid (crossfade suave al inicio/fin) */}
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.morphMiniCardLayer,
                            morphMiniCardStyle,
                            {
                                backgroundColor: isDark
                                    ? `${activeFolderColor}14`
                                    : `${activeFolderColor}0C`,
                                borderColor: isDark
                                    ? `${activeFolderColor}32`
                                    : `${activeFolderColor}24`,
                            },
                        ]}
                    >
                        <View
                            style={[
                                styles.cardIconBox,
                                {
                                    backgroundColor: isDark
                                        ? `${activeFolderColor}28`
                                        : `${activeFolderColor}1C`,
                                },
                            ]}
                        >
                            <FolderIconRenderer
                                name={activeFolderObj?.icon || (currentTargetFolderId === 'pinned' ? 'pin' : 'folder')}
                                size={15}
                                color={activeFolderColor}
                                strokeWidth={2.2}
                            />
                        </View>

                        <View style={styles.cardTextCol}>
                            <Text
                                numberOfLines={1}
                                style={[styles.folderName, { color: colors.textPrimary }]}
                            >
                                {activeFolderTitle}
                            </Text>
                            <Text style={[styles.folderCount, { color: colors.textMuted }]}>
                                {activeFolderNotesCount === 1
                                    ? (language === 'es' ? '1 nota' : '1 note')
                                    : (language === 'es' ? `${activeFolderNotesCount} notas` : `${activeFolderNotesCount} notes`)}
                            </Text>
                        </View>

                        {isFolderPinned && (
                            <View style={styles.pinIndicator}>
                                <Pin size={10} color={activeFolderColor as any} strokeWidth={2.5} />
                            </View>
                        )}
                    </Animated.View>

                    {/* Capa B: Vista de Pantalla Completa (Cabecera expandida + Lista de notas) */}
                    <Animated.View style={[{ flex: 1 }, morphFullScreenStyle]}>
                        {/* Cabecera de la Pantalla de Carpeta Animada */}
                        <Animated.View style={[styles.headerContainer, morphHeaderStyle]}>
                            {isSearching ? (
                                <VeyraSurface level={1} radius="md" style={styles.searchExpandedBar}>
                                    <Search size={16} color={activeFolderColor as any} />
                                    <TextInput
                                        autoFocus
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                        placeholder={
                                            language === 'es'
                                                ? `Buscar en ${activeFolderTitle}...`
                                                : `Search in ${activeFolderTitle}...`
                                        }
                                        placeholderTextColor={colors.textMuted}
                                        style={[
                                            styles.searchExpandedInput,
                                            { color: colors.textPrimary, fontSize: typography.body.fontSize },
                                        ]}
                                        selectionColor={activeFolderColor}
                                    />
                                    {searchQuery.length > 0 && (
                                        <TouchableOpacity
                                            onPress={() => setSearchQuery('')}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            style={styles.searchIconBtn}
                                        >
                                            <X size={15} color={colors.textMuted as any} />
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        onPress={() => {
                                            LayoutAnimation.configureNext(smoothLayoutAnimation);
                                            setIsSearching(false);
                                            setSearchQuery('');
                                        }}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        style={[
                                            styles.searchCloseBtn,
                                            { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
                                        ]}
                                        activeOpacity={0.7}
                                    >
                                        <X size={14} color={colors.textSecondary as any} />
                                    </TouchableOpacity>
                                </VeyraSurface>
                            ) : (
                                <View style={styles.mainTopRow}>
                                    {/* Lado Izquierdo: Botón Volver + Identidad de la Carpeta */}
                                    <View style={styles.folderHeaderLeftCol}>
                                        <Animated.View style={morphBackBtnStyle}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.folderBackBtn,
                                                    {
                                                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                                        borderColor: colors.borderSubtle,
                                                    },
                                                ]}
                                                onPress={handleCloseFolder}
                                                activeOpacity={0.7}
                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            >
                                                <ChevronLeft size={18} color={colors.textSecondary as any} />
                                            </TouchableOpacity>
                                        </Animated.View>

                                        <View style={styles.folderHeaderTitleWrap}>
                                            <View
                                                style={[
                                                    styles.folderCompactIconBox,
                                                    {
                                                        backgroundColor: `${activeFolderColor}${isDark ? '25' : '18'}`,
                                                        borderColor: `${activeFolderColor}40`,
                                                    },
                                                ]}
                                            >
                                                {activeFolderObj ? (
                                                    <FolderIconRenderer
                                                        name={activeFolderObj.icon}
                                                        size={13}
                                                        color={activeFolderColor}
                                                        strokeWidth={2}
                                                    />
                                                ) : currentTargetFolderId === 'pinned' ? (
                                                    <Pin size={13} color={activeFolderColor as any} />
                                                ) : (
                                                    <Inbox size={13} color={activeFolderColor as any} />
                                                )}
                                            </View>

                                            <Text
                                                style={[
                                                    styles.folderHeaderTitleText,
                                                    { color: colors.textPrimary },
                                                ]}
                                                numberOfLines={1}
                                            >
                                                {activeFolderTitle}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Lado Derecho: Acciones de Carpeta */}
                                    <Animated.View style={[styles.mainTopActions, morphActionsStyle]}>
                                        <TouchableOpacity
                                            style={[
                                                styles.mainTopActionIconBtn,
                                                {
                                                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)',
                                                    borderColor: colors.borderSubtle,
                                                },
                                            ]}
                                            onPress={() => {
                                                LayoutAnimation.configureNext(smoothLayoutAnimation);
                                                setIsSearching(true);
                                            }}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            activeOpacity={0.7}
                                        >
                                            <Search size={16} color={colors.textSecondary as any} />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.mainTopActionIconBtn,
                                                {
                                                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)',
                                                    borderColor: colors.borderSubtle,
                                                },
                                            ]}
                                            onPress={() => setIsFolderMenuVisible(true)}
                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            activeOpacity={0.7}
                                        >
                                            <MoreVertical size={16} color={colors.textSecondary as any} />
                                        </TouchableOpacity>
                                    </Animated.View>
                                </View>
                            )}
                        </Animated.View>

                        {/* Contenido de Notas de la Carpeta (Fade + Slide progresivo en la 2da mitad) */}
                        <Animated.View style={[{ flex: 1 }, morphNotesContentStyle]}>
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{
                                    paddingTop: 8,
                                    paddingBottom: insets.bottom + (isSelectionMode ? 220 : 100),
                                }}
                            >
                                {folderSections.length === 0 ? (
                                    <View style={styles.emptyContainer}>
                                        <View
                                            style={[
                                                styles.emptyIconWrapper,
                                                {
                                                    backgroundColor: isDark ? '#1F222A' : '#F1F5F9',
                                                    borderColor: colors.borderSubtle,
                                                },
                                            ]}
                                        >
                                            <FileText size={28} color={colors.textMuted} />
                                        </View>
                                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                            {searchQuery
                                                ? (language === 'es' ? 'No se encontraron notas' : 'No notes found')
                                                : (language === 'es' ? 'No hay notas en esta carpeta' : 'No notes in this folder')}
                                        </Text>
                                    </View>
                                ) : (
                                    folderSections.map(section => renderFolderSectionContainer({ item: section }))
                                )}
                            </ScrollView>
                        </Animated.View>
                    </Animated.View>
                </Animated.View>
            )}

            {/* Píldora Flotante Inferior de Selección Múltiple */}
            <Animated.View
                pointerEvents={isSelectionMode ? 'auto' : 'none'}
                style={[
                    styles.floatingSelectionPill,
                    {
                        backgroundColor: colors.navBar || (isDark ? '#1B1B1B' : '#FFFFFF'),
                        borderColor: colors.borderSubtle,
                        bottom: Math.max(insets.bottom, 10) + 72,
                    },
                    pillAnimatedStyle,
                ]}
            >
                {/* Cabecera de la píldora: Contador y Seleccionar todas */}
                <View style={styles.pillHeaderRow}>
                    <View style={styles.pillCounterContainer}>
                        <TouchableOpacity
                            onPress={() => setSelectedNotes([])}
                            style={[
                                styles.pillCloseBtn,
                                { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.7}
                        >
                            <X size={13} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <Text style={[styles.pillTitle, { color: colors.textPrimary }]}>
                            {selectedNotes.length} {language === 'es' ? (selectedNotes.length === 1 ? 'seleccionada' : 'seleccionadas') : 'selected'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={handleToggleSelectAll}
                        style={[
                            styles.pillSelectAllBtn,
                            {
                                backgroundColor: isAllFilteredSelected ? accent.primary + '18' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                                borderColor: isAllFilteredSelected ? accent.primary : colors.borderSubtle,
                            },
                        ]}
                        activeOpacity={0.7}
                    >
                        {isAllFilteredSelected ? (
                            <CheckSquare size={13} color={accent.primary as any} />
                        ) : (
                            <Square size={13} color={colors.textSecondary as any} />
                        )}
                        <Text style={[styles.pillSelectAllText, { color: isAllFilteredSelected ? accent.primary : colors.textSecondary }]}>
                            {isAllFilteredSelected ? (language === 'es' ? 'Deseleccionar' : 'Deselect') : (language === 'es' ? 'Todas' : 'All')}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Divisor sutil */}
                <View style={[styles.pillDivider, { backgroundColor: colors.borderSubtle }]} />

                {/* Acciones principales: Fijar, Mover a carpeta, Duplicar, Compartir, Eliminar */}
                <View style={styles.pillActionsRow}>
                    {/* 1. Fijar / Desfijar */}
                    <TouchableOpacity
                        style={styles.pillActionBtn}
                        onPress={handleTogglePinSelected}
                        activeOpacity={0.7}
                    >
                        <Animated.View
                            style={[
                                styles.pillActionIconCircle,
                                {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                },
                                pinButtonAnimatedStyle,
                            ]}
                        >
                            {isAllPinned ? (
                                <PinOff size={16} color={(isDark ? '#FBBF24' : '#F59E0B') as any} />
                            ) : (
                                <Pin size={16} color={(isDark ? '#FBBF24' : '#F59E0B') as any} />
                            )}
                        </Animated.View>
                        <Text style={[styles.pillActionLabel, { color: colors.textSecondary }]}>
                            {isAllPinned ? (language === 'es' ? 'Desfijar' : 'Unpin') : (language === 'es' ? 'Fijar' : 'Pin')}
                        </Text>
                    </TouchableOpacity>

                    {/* 2. Mover a Carpeta */}
                    <TouchableOpacity
                        style={styles.pillActionBtn}
                        onPress={() => setIsMoveModalVisible(true)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.pillActionIconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                            <FolderInput size={16} color={accent.primary as any} />
                        </View>
                        <Text style={[styles.pillActionLabel, { color: colors.textSecondary }]}>
                            {language === 'es' ? 'Mover' : 'Move'}
                        </Text>
                    </TouchableOpacity>

                    {/* 3. Duplicar */}
                    <TouchableOpacity
                        style={styles.pillActionBtn}
                        onPress={handleDuplicateSelected}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.pillActionIconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                            <Copy size={16} color={colors.textPrimary as any} />
                        </View>
                        <Text style={[styles.pillActionLabel, { color: colors.textSecondary }]}>
                            {language === 'es' ? 'Duplicar' : 'Duplicate'}
                        </Text>
                    </TouchableOpacity>

                    {/* 4. Compartir */}
                    <TouchableOpacity
                        style={styles.pillActionBtn}
                        onPress={handleShareSelected}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.pillActionIconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                            <Share2 size={16} color={colors.textPrimary as any} />
                        </View>
                        <Text style={[styles.pillActionLabel, { color: colors.textSecondary }]}>
                            {language === 'es' ? 'Compartir' : 'Share'}
                        </Text>
                    </TouchableOpacity>

                    {/* 5. Eliminar */}
                    <TouchableOpacity
                        style={styles.pillActionBtn}
                        onPress={handleDeleteSelected}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.pillActionIconCircle, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)' }]}>
                            <Trash2 size={16} color={(isDark ? '#FB7185' : '#E11D48') as any} />
                        </View>
                        <Text style={[styles.pillActionLabel, { color: isDark ? '#FB7185' : '#E11D48' }]}>
                            {language === 'es' ? 'Eliminar' : 'Delete'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>

            {/* Píldora Flotante Inferior de Selección Múltiple de Carpetas */}
            <Animated.View
                pointerEvents={isFolderSelectionMode ? 'auto' : 'none'}
                style={[
                    styles.floatingSelectionPill,
                    {
                        backgroundColor: colors.navBar || (isDark ? '#1B1B1B' : '#FFFFFF'),
                        borderColor: colors.borderSubtle,
                        bottom: Math.max(insets.bottom, 10) + 72,
                    },
                    folderPillAnimatedStyle,
                ]}
            >
                {/* Cabecera de la píldora: Contador y Seleccionar todas */}
                <View style={styles.pillHeaderRow}>
                    <View style={styles.pillCounterContainer}>
                        <TouchableOpacity
                            onPress={() => setSelectedFolderIds([])}
                            style={[
                                styles.pillCloseBtn,
                                { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.7}
                        >
                            <X size={13} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <Text style={[styles.pillTitle, { color: colors.textPrimary }]}>
                            {selectedFolderIds.length} {language === 'es' ? (selectedFolderIds.length === 1 ? 'carpeta' : 'carpetas') : (selectedFolderIds.length === 1 ? 'folder' : 'folders')}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={handleToggleSelectAllFolders}
                        style={[
                            styles.pillSelectAllBtn,
                            {
                                backgroundColor: isAllFoldersSelected ? accent.primary + '18' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                                borderColor: isAllFoldersSelected ? accent.primary : colors.borderSubtle,
                            },
                        ]}
                        activeOpacity={0.7}
                    >
                        {isAllFoldersSelected ? (
                            <CheckSquare size={13} color={accent.primary as any} />
                        ) : (
                            <Square size={13} color={colors.textSecondary as any} />
                        )}
                        <Text style={[styles.pillSelectAllText, { color: isAllFoldersSelected ? accent.primary : colors.textSecondary }]}>
                            {isAllFoldersSelected ? (language === 'es' ? 'Deseleccionar' : 'Deselect') : (language === 'es' ? 'Todas' : 'All')}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Divisor sutil */}
                <View style={[styles.pillDivider, { backgroundColor: colors.borderSubtle }]} />

                {/* Acciones: Editar (si 1), Fijar/Desfijar, Eliminar */}
                <View style={styles.pillActionsRow}>
                    {selectedFolderIds.length === 1 && (
                        <TouchableOpacity
                            style={styles.pillActionBtn}
                            onPress={handleEditSelectedFolder}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.pillActionIconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                                <Edit3 size={16} color={colors.textPrimary as any} />
                            </View>
                            <Text style={[styles.pillActionLabel, { color: colors.textSecondary }]}>
                                {language === 'es' ? 'Editar' : 'Edit'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={styles.pillActionBtn}
                        onPress={handleTogglePinSelectedFolders}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.pillActionIconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                            {isAllSelectedFoldersPinned ? (
                                <PinOff size={16} color={(isDark ? '#FBBF24' : '#F59E0B') as any} />
                            ) : (
                                <Pin size={16} color={(isDark ? '#FBBF24' : '#F59E0B') as any} />
                            )}
                        </View>
                        <Text style={[styles.pillActionLabel, { color: colors.textSecondary }]}>
                            {isAllSelectedFoldersPinned ? (language === 'es' ? 'Desfijar' : 'Unpin') : (language === 'es' ? 'Fijar' : 'Pin')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.pillActionBtn}
                        onPress={handleDeleteSelectedFolders}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.pillActionIconCircle, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)' }]}>
                            <Trash2 size={16} color={(isDark ? '#FB7185' : '#E11D48') as any} />
                        </View>
                        <Text style={[styles.pillActionLabel, { color: isDark ? '#FB7185' : '#E11D48' }]}>
                            {language === 'es' ? 'Eliminar' : 'Delete'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>

            {/* Modal de Creación / Edición de Carpeta */}
            <FolderModal
                visible={isFolderModalVisible}
                onClose={() => {
                    setIsFolderModalVisible(false);
                    setEditingFolder(null);
                }}
                folderToEdit={editingFolder}
                onSave={async (name, icon, color, isPinned) => {
                    LayoutAnimation.configureNext(smoothLayoutAnimation);
                    if (editingFolder) {
                        await updateFolder(editingFolder.id, {
                            name,
                            icon,
                            color,
                            is_pinned: isPinned ? 1 : 0,
                        });
                    } else {
                        await createFolder(name, icon, color, isPinned);
                    }
                }}
                onDelete={async (folderId) => {
                    LayoutAnimation.configureNext(smoothLayoutAnimation);
                    if (openedFolderId === folderId) {
                        finishCloseFolder();
                    }
                    await deleteFolder(folderId, false);
                }}
            />

            {/* Modal de Mover Notas a Carpeta */}
            <MoveToFolderModal
                visible={isMoveModalVisible}
                onClose={() => setIsMoveModalVisible(false)}
                folders={folders}
                noteCount={selectedNotes.length}
                onSelectFolder={handleMoveSelected}
                onCreateNewFolder={() => {
                    setEditingFolder(null);
                    setIsFolderModalVisible(true);
                }}
            />

            {/* Menú Contextual de Opciones de Carpeta */}
            <Modal
                transparent
                visible={isFolderMenuVisible}
                animationType="fade"
                onRequestClose={() => setIsFolderMenuVisible(false)}
            >
                <TouchableOpacity
                    style={styles.menuModalBackdrop}
                    activeOpacity={1}
                    onPress={() => setIsFolderMenuVisible(false)}
                >
                    <View style={[styles.menuModalCardWrap, { top: insets.top + 48 }]}>
                        <VeyraSurface
                            level={2}
                            radius="lg"
                            style={[
                                styles.menuModalCard,
                                {
                                    borderColor: colors.borderSubtle,
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 6 },
                                    shadowOpacity: isDark ? 0.35 : 0.1,
                                    shadowRadius: 14,
                                    elevation: 10,
                                },
                            ]}
                        >
                            {/* 1. Fijar / Desfijar */}
                            {activeFolderObj && (
                                <TouchableOpacity
                                    style={styles.menuModalItem}
                                    onPress={async () => {
                                        setIsFolderMenuVisible(false);
                                        await togglePinFolder(activeFolderObj.id);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Pin
                                        size={16}
                                        color={(isFolderPinned ? (isDark ? '#FBBF24' : '#F59E0B') : colors.textSecondary) as any}
                                        strokeWidth={2}
                                    />
                                    <Text style={[styles.menuModalItemText, { color: colors.textPrimary }]}>
                                        {isFolderPinned
                                            ? (language === 'es' ? 'Desfijar de acceso rápido' : 'Unpin from quick access')
                                            : (language === 'es' ? 'Fijar en acceso rápido' : 'Pin to quick access')}
                                    </Text>
                                </TouchableOpacity>
                            )}

                            {/* 2. Editar carpeta */}
                            {activeFolderObj && (
                                <TouchableOpacity
                                    style={styles.menuModalItem}
                                    onPress={() => {
                                        setIsFolderMenuVisible(false);
                                        setEditingFolder(activeFolderObj);
                                        setIsFolderModalVisible(true);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Edit3 size={16} color={colors.textSecondary as any} strokeWidth={2} />
                                    <Text style={[styles.menuModalItemText, { color: colors.textPrimary }]}>
                                        {language === 'es' ? 'Editar carpeta' : 'Edit folder'}
                                    </Text>
                                </TouchableOpacity>
                            )}

                            {/* 3. Historial de notas */}
                            <TouchableOpacity
                                style={styles.menuModalItem}
                                onPress={() => {
                                    setIsFolderMenuVisible(false);
                                    router.push('/notes-history');
                                }}
                                activeOpacity={0.7}
                            >
                                <History size={16} color={colors.textSecondary as any} strokeWidth={2} />
                                <Text style={[styles.menuModalItemText, { color: colors.textPrimary }]}>
                                    {language === 'es' ? 'Historial de notas' : 'Notes history'}
                                </Text>
                            </TouchableOpacity>

                            {/* 4. Eliminar carpeta */}
                            {activeFolderObj && (
                                <>
                                    <View style={[styles.menuModalDivider, { backgroundColor: colors.borderSubtle }]} />
                                    <TouchableOpacity
                                        style={styles.menuModalItem}
                                        onPress={() => {
                                            setIsFolderMenuVisible(false);
                                            Alert.alert(
                                                language === 'es' ? '¿Eliminar carpeta?' : 'Delete folder?',
                                                language === 'es'
                                                    ? `¿Deseas eliminar la carpeta "${activeFolderObj.name}"? Las notas no se eliminarán, quedarán sin carpeta.`
                                                    : `Do you want to delete folder "${activeFolderObj.name}"? Notes will not be deleted.`,
                                                [
                                                    { text: language === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
                                                    {
                                                        text: language === 'es' ? 'Eliminar' : 'Delete',
                                                        style: 'destructive',
                                                        onPress: async () => {
                                                            LayoutAnimation.configureNext(smoothLayoutAnimation);
                                                            finishCloseFolder();
                                                            await deleteFolder(activeFolderObj.id, false);
                                                        },
                                                    },
                                                ]
                                            );
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Trash2 size={16} color={(isDark ? '#FB7185' : '#E11D48') as any} strokeWidth={2} />
                                        <Text style={[styles.menuModalItemText, { color: isDark ? '#FB7185' : '#E11D48' }]}>
                                            {language === 'es' ? 'Eliminar carpeta' : 'Delete folder'}
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </VeyraSurface>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );

    if (hideBars) {
        return (
            <View style={[styles.screen, { backgroundColor: colors.bg }]}>
                {content}
            </View>
        );
    }

    return (
        <View style={[styles.screen, { backgroundColor: colors.bg }]}>
            <View style={{ paddingTop: insets.top, backgroundColor: colors.bg, zIndex: 1000 }}>
                <TopBar />
            </View>
            <View style={{ flex: 1 }}>
                {content}
            </View>
            <BottomTabBar />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    headerContainer: {
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 4,
    },
    mainTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 44,
    },
    mainFiltersStrip: {
        flex: 1,
        marginLeft: -20,
    },
    mainFiltersScrollContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 20,
        paddingRight: 4,
        paddingVertical: 4,
    },
    mainTopActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    mainTopActionIconBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    folderChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingLeft: 10,
        paddingRight: 8,
        borderRadius: 14,
        borderWidth: 1,
    },
    folderChipText: {
        fontSize: 12,
    },
    folderChipBadge: {
        fontSize: 10.5,
        fontWeight: '700',
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 8,
        overflow: 'hidden',
    },
    newFolderChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: 'dashed',
    },
    newFolderChipText: {
        fontSize: 12,
        fontWeight: '600',
    },
    sectionBlock: {
        marginBottom: 18,
        paddingHorizontal: 20,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        paddingHorizontal: 4,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    sectionCount: {
        fontSize: 12,
        fontWeight: '600',
    },
    sectionCard: {
        overflow: 'hidden',
        borderWidth: 1,
    },
    noteItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 12,
    },
    noteTextCol: {
        flex: 1,
        gap: 3,
    },
    noteMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 2,
    },
    noteDate: {
        fontSize: 11.5,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    pinInlineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
    },
    pinInlineText: {
        fontSize: 9.5,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    folderInlineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 6,
        borderWidth: 0.5,
        maxWidth: 130,
    },
    folderInlineText: {
        fontSize: 9.5,
        fontWeight: '700',
        letterSpacing: 0.1,
    },
    noteTitle: {
        fontWeight: '700',
        letterSpacing: -0.2,
        lineHeight: 20,
    },
    noteSnippet: {
        lineHeight: 18,
        opacity: 0.8,
        marginTop: 2,
    },
    thumbWrapper: {
        width: 52,
        height: 52,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 1,
        alignSelf: 'center',
    },
    thumbImage: {
        width: '100%',
        height: '100%',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
        gap: 12,
    },
    emptyIconWrapper: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    emptyText: {
        fontWeight: '600',
    },
    fabContainer: {
        position: 'absolute',
        alignSelf: 'center',
        zIndex: 1000,
    },
    floatingSelectionPill: {
        position: 'absolute',
        left: 16,
        right: 16,
        borderRadius: 22,
        borderWidth: 1,
        paddingTop: 10,
        paddingBottom: 8,
        paddingHorizontal: 14,
        zIndex: 9999,
        elevation: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
    },
    pillHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        paddingBottom: 6,
    },
    pillCounterContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    pillCloseBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pillTitle: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    pillSelectAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 4,
        paddingHorizontal: 9,
        borderRadius: 12,
        borderWidth: 1,
    },
    pillSelectAllText: {
        fontSize: 11,
        fontWeight: '600',
    },
    pillDivider: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 4,
        marginBottom: 8,
    },
    pillActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    pillActionBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingVertical: 2,
        paddingHorizontal: 6,
        minWidth: 50,
    },
    pillActionIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pillActionLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.1,
    },
    folderHeaderLeftCol: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
    },
    folderBackBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    folderHeaderTitleWrap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        minWidth: 0,
    },
    folderCompactIconBox: {
        width: 26,
        height: 26,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    folderHeaderTitleText: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: -0.2,
        flexShrink: 1,
    },
    searchExpandedBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        height: 44,
    },
    searchExpandedInput: {
        flex: 1,
        height: 40,
        padding: 0,
        fontWeight: '500',
    },
    searchIconBtn: {
        padding: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchCloseBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    menuModalCardWrap: {
        position: 'absolute',
        right: 20,
        width: 230,
    },
    menuModalCard: {
        borderRadius: 16,
        borderWidth: 1,
        paddingVertical: 6,
        paddingHorizontal: 4,
        overflow: 'hidden',
    },
    menuModalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    menuModalItemText: {
        fontSize: 13.5,
        fontWeight: '600',
    },
    menuModalDivider: {
        height: StyleSheet.hairlineWidth,
        marginVertical: 4,
        marginHorizontal: 8,
    },
    morphMiniCardLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 9,
        borderRadius: 13,
        borderWidth: 1,
        zIndex: 10,
    },
    cardIconBox: {
        width: 30,
        height: 30,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    cardTextCol: {
        flex: 1,
        justifyContent: 'center',
    },
    folderName: {
        fontSize: 12.5,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    folderCount: {
        fontSize: 10,
        fontWeight: '500',
        marginTop: 1,
    },
    pinIndicator: {
        marginLeft: 4,
        opacity: 0.85,
    },
    noteRowWrapper: {
        position: 'relative',
        overflow: 'hidden',
    },
    swipeActionBg: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
    },
    swipeActionContentLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    swipeActionContentRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    swipeActionLabel: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    swipeFrontRow: {
        width: '100%',
    },
    collapsibleWrapper: {
        width: '100%',
        overflow: 'hidden',
    },
    folderGridWrapper: {
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 2,
    },
    baseNotesSectionWrapper: {
        flex: 1,
    },
});
