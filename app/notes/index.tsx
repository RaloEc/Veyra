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
    duration: 250,
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
    Users,
    Lock,
} from '@tamagui/lucide-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { format, isToday, isYesterday, isThisWeek, isThisMonth, isThisYear } from 'date-fns';
import { es, enUS } from 'date-fns/locale';

import { useStore } from '../../src/store/useStore';
import { useNotesStore } from '../../src/store/useNotesStore';
import { useFoldersStore } from '../../src/store/useFoldersStore';
import { useSelectionStore } from '../../src/store/useSelectionStore';
import { useVeyraTheme } from '../../src/theme/useVeyraTheme';
import { VeyraSurface } from '../../src/components/ui/VeyraSurface';
import { VeyraButton } from '../../src/components/ui/VeyraButton';
import { VeyraIconButton } from '../../src/components/ui/VeyraIconButton';
import { VeyraDivider } from '../../src/components/ui/VeyraDivider';
import { Note, Folder } from '../../src/types/db';
import { extractPlainTextFromPages } from '../../src/utils/pageUtils';
import { FolderIconRenderer, FOLDER_COLORS } from '../../src/components/notes/FolderIconRenderer';
import { FolderModal } from '../../src/components/notes/FolderModal';
import { MoveToFolderModal } from '../../src/components/notes/MoveToFolderModal';
import { FolderCardGrid } from '../../src/components/notes/FolderCardGrid';
import { FolderBreadcrumb } from '../../src/components/notes/FolderBreadcrumb';
import { useCardTransitionStore, CardRect } from '../../src/store/cardTransitionStore';
import { TopBar } from '../../src/components/TopBar';
import { BottomTabBar } from '../../src/components/layout/BottomTabBar';
import { ShareModal } from '../../src/components/collaboration/ShareModal';
import { CollaboratorsAvatars } from '../../src/components/collaboration/CollaboratorsAvatars';

/**
 * Normaliza cualquier formato de color o nombre ('purple', 'blue') a HEX de 6 caracteres seguro.
 */
function normalizeHex(colorStr?: string | null, fallback = '#8B5CF6'): string {
    if (!colorStr || typeof colorStr !== 'string') return fallback;
    const trimmed = colorStr.trim();
    if (trimmed.startsWith('#')) {
        if (trimmed.length === 4) {
            return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
        }
        if (trimmed.length === 7) return trimmed;
        if (trimmed.length === 9) return trimmed.slice(0, 7);
    }
    const match = FOLDER_COLORS.find(
        (c) => c.key.toLowerCase() === trimmed.toLowerCase() || c.color.toLowerCase() === trimmed.toLowerCase()
    );
    if (match) return match.color;
    return fallback;
}

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
    const plainText = useMemo(() => extractPlainTextFromPages(item.content), [item.content]);
    const imageThumb = useMemo(() => extractFirstImageUri(item.attachments, item.content), [item.attachments, item.content]);
    const hasAttachments = Boolean(item.attachments && item.attachments !== '[]');
    const isGuestRevoked = useMemo(() => {
        if (item.is_revoked !== 1) return false;
        const currentUserId = useStore.getState().session?.user?.id;
        const isGuest = Boolean(
            (item.shared_owner_id && item.shared_owner_id !== currentUserId) ||
            (item.user_id && currentUserId && item.user_id !== currentUserId && item.user_id !== 'local_user' && item.shared_owner_id)
        );
        return isGuest;
    }, [item.is_revoked, item.shared_owner_id, item.user_id]);

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
                                isGuestRevoked && { opacity: 0.72 },
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
                                        {formatNoteDate(item.created_at_ms || item.updated_at_ms)}
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

                                    {isGuestRevoked ? (
                                        <View
                                            style={[
                                                styles.folderInlineBadge,
                                                {
                                                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.1)',
                                                    borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)',
                                                },
                                            ]}
                                        >
                                            <Lock size={10} color={isDark ? '#F87171' : '#DC2626'} strokeWidth={2.2} />
                                            <Text
                                                style={[
                                                    styles.folderInlineText,
                                                    { color: isDark ? '#F87171' : '#DC2626', fontWeight: '700' },
                                                ]}
                                                numberOfLines={1}
                                            >
                                                {language === 'es' ? 'Acceso bloqueado' : 'Access blocked'}
                                            </Text>
                                        </View>
                                    ) : (item.is_shared === 1 || item.shared_owner_id) && (
                                        <View
                                            style={[
                                                styles.folderInlineBadge,
                                                {
                                                    backgroundColor: `${accent.primary}${isDark ? '25' : '15'}`,
                                                    borderColor: `${accent.primary}30`,
                                                },
                                            ]}
                                        >
                                            <Users size={10} color={accent.primary as any} strokeWidth={2} />
                                            <Text
                                                style={[styles.folderInlineText, { color: accent.primary }]}
                                                numberOfLines={1}
                                            >
                                                {language === 'es' ? 'Compartida' : 'Shared'}
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
function NotesScreenComponent({ hideBars = false }: { hideBars?: boolean } = {}) {
    const { t } = useTranslation();
    const router = useRouter();

    useEffect(() => {
        if (!hideBars) {
            useStore.getState().setMainActiveTab('notes');
            router.replace('/');
        }
    }, [hideBars, router]);
    const language = useStore(state => state.language);
    const triggerSync = useStore(state => state.triggerSync);
    const session = useStore(state => state.session);
    const notes = useNotesStore(state => state.notes);
    const loadNotes = useNotesStore(state => state.loadNotes);
    const deleteNote = useNotesStore(state => state.deleteNote);
    const deleteNotesBatch = useNotesStore(state => state.deleteNotesBatch);
    const updateNote = useNotesStore(state => state.updateNote);
    const updateNotesBatch = useNotesStore(state => state.updateNotesBatch);
    const moveNotesBatch = useNotesStore(state => state.moveNotesBatch);
    const addNote = useNotesStore(state => state.addNote);
    const markNoteRevoked = useNotesStore(state => state.markNoteRevoked);
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
    const folderStack = useFoldersStore(state => state.folderStack);
    const pushFolder = useFoldersStore(state => state.pushFolder);
    const popFolder = useFoldersStore(state => state.popFolder);
    const resetFolderStack = useFoldersStore(state => state.resetFolderStack);
    const setFolderStack = useFoldersStore(state => state.setFolderStack);

    const [modalParentFolder, setModalParentFolder] = useState<Folder | null>(null);

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

    // Origin rect of clicked folder card or pill for physical morphing
    const screenContainerRef = useRef<View>(null);
    const screenOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: insets.top + 46 });
    const originCardRectRef = useRef<{ x: number; y: number; width: number; height: number }>({ x: 16, y: 12, width: 100, height: 34 });
    const pillRefs = useRef<Record<string, View | null>>({});
    const [openedFolderId, setOpenedFolderId] = useState<string | null>(null);

    // Shared values for container and rect so worklet can read them without closures
    const svContainerW = useSharedValue(windowWidth);
    const svContainerH = useSharedValue(windowHeight);
    const svOriginX = useSharedValue(16);
    const svOriginY = useSharedValue(12);
    const svOriginW = useSharedValue(100);
    const svOriginH = useSharedValue(34);

    // Folder options menu popover state
    const isFolderMenuVisible = useFoldersStore(state => state.isFolderMenuVisible);
    const setIsFolderMenuVisible = useFoldersStore(state => state.setIsFolderMenuVisible);

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
    const [isFolderShareModalVisible, setIsFolderShareModalVisible] = useState(false);
    const [sharingNote, setSharingNote] = useState<Note | null>(null);

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
            : { x: 16, y: 12, width: 100, height: 34 };

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
        const currentStack = useFoldersStore.getState().folderStack;
        if (currentStack.length === 0) {
            const targetFolder = folders.find(f => f.id === folderId);
            if (targetFolder) {
                pushFolder(targetFolder);
            }
        }

        // Defer animation start to AFTER the overlay has been painted for the first time
        requestAnimationFrame(() => {
            folderMorphProgress.value = withTiming(1, {
                duration: 380,
                easing: ReanimatedEasing.bezier(0.22, 1, 0.36, 1),
            });
        });
    }, [setActiveFolderId, folders, pushFolder]);

    const handlePillPress = useCallback((folderId: string) => {
        const pillView = pillRefs.current[folderId];
        if (pillView) {
            pillView.measureInWindow((x, y, width, height) => {
                if (typeof x === 'number' && typeof y === 'number' && width > 0 && height > 0) {
                    handleOpenFolder(folderId, { x, y, width, height });
                } else {
                    handleOpenFolder(folderId);
                }
            });
        } else {
            handleOpenFolder(folderId);
        }
    }, [handleOpenFolder]);

    const isClosingFolderRef = useRef(false);

    const finishCloseFolder = useCallback(() => {
        isClosingFolderRef.current = false;
        setOpenedFolderId(null);
        setActiveFolderId('all');
        resetFolderStack();
    }, [setActiveFolderId, resetFolderStack]);

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

        const timeoutId = setTimeout(safeFinish, 290);

        folderMorphProgress.value = withTiming(
            0,
            {
                duration: 260,
                easing: ReanimatedEasing.bezier(0.25, 1, 0.35, 1),
            },
            () => {
                clearTimeout(timeoutId);
                runOnJS(safeFinish)();
            }
        );
    }, [isSearching, isFolderMenuVisible, finishCloseFolder]);

    const handleBackPress = useCallback(() => {
        if (folderStack.length > 1) {
            popFolder();
            const prev = folderStack[folderStack.length - 2];
            setOpenedFolderId(prev.id);
        } else {
            handleCloseFolder();
        }
    }, [folderStack, popFolder, handleCloseFolder]);

    const handleBreadcrumbNavigate = useCallback((targetIndex: number) => {
        if (targetIndex === -1) {
            handleCloseFolder();
        } else if (targetIndex >= 0 && targetIndex < folderStack.length - 1) {
            const targetFolder = folderStack[targetIndex];
            const newStack = folderStack.slice(0, targetIndex + 1);
            setFolderStack(newStack);
            setOpenedFolderId(targetFolder.id);
        }
    }, [folderStack, handleCloseFolder, setFolderStack]);

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
            const targetNote = notes.find(n => n.id === id);
            const currentUserId = session?.user?.id;
            const isGuestNote = targetNote && Boolean(
                (targetNote.shared_owner_id && targetNote.shared_owner_id !== currentUserId) ||
                (targetNote.user_id && currentUserId && targetNote.user_id !== currentUserId && targetNote.user_id !== 'local_user' && targetNote.shared_owner_id)
            );
            if (targetNote && targetNote.is_revoked === 1) {
                if (!isGuestNote) {
                    markNoteRevoked(id, false);
                } else {
                    Alert.alert(
                        t('collaboration.access_revoked_title', { defaultValue: 'Acceso bloqueado' }),
                        t('collaboration.access_revoked_modal', { defaultValue: 'El propietario ha revocado tu acceso a esta nota. Ya no puedes acceder a su contenido.' }),
                        [
                            {
                                text: t('common.cancel', { defaultValue: 'Entendido' }),
                                style: 'cancel',
                            },
                            {
                                text: t('collaboration.remove_from_list', { defaultValue: 'Eliminar de mi lista' }),
                                style: 'destructive',
                                onPress: () => {
                                    deleteNote(id);
                                },
                            },
                        ]
                    );
                    return;
                }
            }
            router.push(`/notes/${id}`);
        }
    }, [isFolderSelectionMode, isSelectionMode, router, notes, t, deleteNote, markNoteRevoked, session?.user?.id]);

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

        if (selectedObjList.length === 1) {
            const noteToShare = selectedObjList[0];
            setSelectedNotes([]);
            setSharingNote(noteToShare);
            return;
        }

        // Si hay más de una nota seleccionada, advertir que la colaboración es individual y ofrecer enviar copia en texto
        Alert.alert(
            language === 'es' ? 'Compartir notas' : 'Share notes',
            language === 'es'
                ? `Has seleccionado ${selectedObjList.length} notas. La colaboración en tiempo real se gestiona por nota individual. ¿Deseas enviar una copia en texto de todas las notas seleccionadas?`
                : `You have selected ${selectedObjList.length} notes. Real-time collaboration is managed per individual note. Would you like to send a text copy of all selected notes?`,
            [
                {
                    text: language === 'es' ? 'Enviar copia de texto' : 'Send text copy',
                    onPress: async () => {
                        const shareText = selectedObjList
                            .map((n, idx) => {
                                const plain = extractPlainTextFromPages(n.content);
                                return `--- ${n.title || (language === 'es' ? `Nota ${idx + 1}` : `Note ${idx + 1}`)} ---\n${plain}`;
                            })
                            .join('\n\n');

                        try {
                            await Share.share({
                                title: language === 'es' ? 'Notas de Veyra' : 'Veyra Notes',
                                message: shareText,
                            });
                        } catch (e) {}
                    },
                },
                {
                    text: language === 'es' ? 'Cancelar' : 'Cancel',
                    style: 'cancel',
                },
            ]
        );
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
                handleBackPress();
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
    }, [isFolderSelectionMode, isSelectionMode, isFolderMenuVisible, isSearching, openedFolderId, activeFolderId, handleBackPress]);

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
                const time = note.created_at_ms || note.updated_at_ms || Date.now();
                const { key, title } = getSectionInfo(time);
                if (!sectionsMap.has(key)) {
                    sectionsMap.set(key, { key, title, data: [] });
                }
                sectionsMap.get(key)!.data.push(note);
            }
        } else {
            for (const note of notesList) {
                const time = note.created_at_ms || note.updated_at_ms || Date.now();
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
            const timeA = a.created_at_ms || a.updated_at_ms || 0;
            const timeB = b.created_at_ms || b.updated_at_ms || 0;
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
            const timeA = a.created_at_ms || a.updated_at_ms || 0;
            const timeB = b.created_at_ms || b.updated_at_ms || 0;
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

    // Sincronizar selección de notas y carpetas con el dock morpheado
    useEffect(() => {
        if (selectedNotes.length > 0) {
            useSelectionStore.getState().setSelection({
                title: `${selectedNotes.length} ${language === 'es' ? (selectedNotes.length === 1 ? 'seleccionada' : 'seleccionadas') : 'selected'}`,
                isAllSelected: isAllFilteredSelected,
                selectAllText: isAllFilteredSelected
                    ? (language === 'es' ? 'Deseleccionar' : 'Deselect')
                    : (language === 'es' ? 'Todas' : 'All'),
                onToggleSelectAll: handleToggleSelectAll,
                onClose: () => setSelectedNotes([]),
                actions: [
                    {
                        id: 'pin',
                        label: isAllPinned
                            ? (language === 'es' ? 'Desfijar' : 'Unpin')
                            : (language === 'es' ? 'Fijar' : 'Pin'),
                        icon: (color) => isAllPinned
                            ? <PinOff size={16} color={isDark ? '#FBBF24' : '#F59E0B'} strokeWidth={2.4} />
                            : <Pin size={16} color={isDark ? '#FBBF24' : '#F59E0B'} strokeWidth={2.4} />,
                        onPress: handleTogglePinSelected,
                        color: isDark ? '#FBBF24' : '#F59E0B',
                        bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    },
                    {
                        id: 'move',
                        label: language === 'es' ? 'Mover' : 'Move',
                        icon: (color) => <FolderInput size={16} color={accent.primary} strokeWidth={2.4} />,
                        onPress: () => setIsMoveModalVisible(true),
                        color: accent.primary,
                        bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    },
                    {
                        id: 'duplicate',
                        label: language === 'es' ? 'Duplicar' : 'Duplicate',
                        icon: (color) => <Copy size={16} color={color} strokeWidth={2.4} />,
                        onPress: handleDuplicateSelected,
                        color: colors.textPrimary,
                        bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    },
                    {
                        id: 'share',
                        label: language === 'es' ? 'Compartir' : 'Share',
                        icon: (color) => <Share2 size={16} color={colors.textPrimary} strokeWidth={2.4} />,
                        onPress: handleShareSelected,
                        color: colors.textPrimary,
                        bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    },
                    {
                        id: 'delete',
                        label: language === 'es' ? 'Eliminar' : 'Delete',
                        icon: (color) => <Trash2 size={16} color={isDark ? '#FB7185' : '#E11D48'} strokeWidth={2.4} />,
                        onPress: handleDeleteSelected,
                        color: isDark ? '#FB7185' : '#E11D48',
                        bg: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                    },
                ],
            });
        } else if (selectedFolderIds.length > 0) {
            const folderActions: any[] = [];
            if (selectedFolderIds.length === 1) {
                folderActions.push({
                    id: 'edit',
                    label: language === 'es' ? 'Editar' : 'Edit',
                    icon: (color: string) => <Edit3 size={16} color={colors.textPrimary} strokeWidth={2.4} />,
                    onPress: handleEditSelectedFolder,
                    color: colors.textPrimary,
                    bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                });
            }
            folderActions.push({
                id: 'pin',
                label: isAllSelectedFoldersPinned
                    ? (language === 'es' ? 'Desfijar' : 'Unpin')
                    : (language === 'es' ? 'Fijar' : 'Pin'),
                icon: (color: string) => isAllSelectedFoldersPinned
                    ? <PinOff size={16} color={isDark ? '#FBBF24' : '#F59E0B'} strokeWidth={2.4} />
                    : <Pin size={16} color={isDark ? '#FBBF24' : '#F59E0B'} strokeWidth={2.4} />,
                onPress: handleTogglePinSelectedFolders,
                color: isDark ? '#FBBF24' : '#F59E0B',
                bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            });
            folderActions.push({
                id: 'delete',
                label: language === 'es' ? 'Eliminar' : 'Delete',
                icon: (color: string) => <Trash2 size={16} color={isDark ? '#FB7185' : '#E11D48'} strokeWidth={2.4} />,
                onPress: handleDeleteSelectedFolders,
                color: isDark ? '#FB7185' : '#E11D48',
                bg: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
            });

            useSelectionStore.getState().setSelection({
                title: `${selectedFolderIds.length} ${language === 'es' ? (selectedFolderIds.length === 1 ? 'carpeta' : 'carpetas') : (selectedFolderIds.length === 1 ? 'folder' : 'folders')}`,
                isAllSelected: isAllFoldersSelected,
                selectAllText: isAllFoldersSelected
                    ? (language === 'es' ? 'Deseleccionar' : 'Deselect')
                    : (language === 'es' ? 'Todas' : 'All'),
                onToggleSelectAll: handleToggleSelectAllFolders,
                onClose: () => setSelectedFolderIds([]),
                actions: folderActions,
            });
        } else {
            useSelectionStore.getState().clearSelection();
        }
    }, [
        selectedNotes,
        selectedFolderIds,
        isAllFilteredSelected,
        isAllFoldersSelected,
        isAllPinned,
        isAllSelectedFoldersPinned,
        language,
        isDark,
        accent.primary,
        colors.textPrimary,
    ]);

    // Compartir notas desde el menú contextual
    const handleShareNotesMenu = async () => {
        const notesToShare = isFolderViewActive
            ? filteredFolderNotes
            : filteredBaseNotes;

        if (notesToShare.length === 0) {
            Alert.alert(
                language === 'es' ? 'Sin notas' : 'No notes',
                language === 'es' ? 'No hay notas para compartir.' : 'No notes to share.'
            );
            return;
        }

        let shareText = '';
        if (notesToShare.length === 1) {
            const n = notesToShare[0];
            const plain = extractPlainTextFromPages(n.content);
            shareText = `${n.title || (language === 'es' ? 'Sin título' : 'Untitled')}\n\n${plain}`;
        } else {
            shareText = notesToShare
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

    useEffect(() => {
        useFoldersStore.getState().setOnShareNotesRequest(handleShareNotesMenu);
        return () => {
            useFoldersStore.getState().setOnShareNotesRequest(undefined);
        };
    }, [handleShareNotesMenu]);

    // Color de la carpeta activa actual
    const activeFolderColor = useMemo(() => {
        if (currentTargetFolderId && currentTargetFolderId !== 'all' && currentTargetFolderId !== 'pinned' && currentTargetFolderId !== 'unassigned') {
            const f = foldersMap.get(currentTargetFolderId);
            return normalizeHex(f?.color, '#8B5CF6');
        }
        if (currentTargetFolderId === 'pinned') {
            return isDark ? '#FBBF24' : '#F59E0B';
        }
        return normalizeHex(accent.primary, '#8B5CF6');
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

    // Conteo de notas por carpeta (recursivo: incluye notas de subcarpetas descendientes)
    const noteCountsMap = useMemo(() => {
        const directCounts: Record<string, number> = {};
        for (const n of notes) {
            if (n.folder_id) {
                directCounts[n.folder_id] = (directCounts[n.folder_id] || 0) + 1;
            }
        }

        const totalCounts: Record<string, number> = {};
        for (const f of folders) {
            let sum = directCounts[f.id] || 0;
            let queue = [f.id];
            while (queue.length > 0) {
                const curr = queue.shift()!;
                const children = folders.filter(c => c.parent_id === curr);
                for (const child of children) {
                    sum += (directCounts[child.id] || 0);
                    queue.push(child.id);
                }
            }
            totalCounts[f.id] = sum;
        }
        return totalCounts;
    }, [folders, notes]);

    // Conteo de subcarpetas directas por carpeta
    const subfolderCountsMap = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const f of folders) {
            if (f.parent_id) {
                counts[f.parent_id] = (counts[f.parent_id] || 0) + 1;
            }
        }
        return counts;
    }, [folders]);

    // Carpetas raíz para la pantalla principal
    const rootFolders = useMemo(() => {
        return folders.filter(f => !f.parent_id);
    }, [folders]);

    // Carpetas para la cinta horizontal superior: ordenadas con fijadas primero, luego las demás
    const stripFolders = useMemo(() => {
        const root = folders.filter(f => !f.parent_id);
        const pinned = root.filter(f => f.is_pinned === 1);
        const unpinned = root.filter(f => f.is_pinned !== 1);
        return [...pinned, ...unpinned];
    }, [folders]);

    // Subcarpetas de la carpeta actualmente abierta
    const currentSubfolders = useMemo(() => {
        if (!openedFolderId) return [];
        return folders.filter(f => f.parent_id === openedFolderId);
    }, [folders, openedFolderId]);

    // Carpetas para el carrusel de Acceso Rápido (máximo 3 fijadas + la actualmente activa)
    const quickAccessFolders = useMemo(() => {
        const pinned = folders.filter(f => f.is_pinned === 1 && !f.parent_id).slice(0, 3);
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
        if (searchQuery.trim().length > 0) return null;

        return (
            <View style={styles.folderGridWrapper}>
                <FolderCardGrid
                    folders={rootFolders}
                    noteCounts={noteCountsMap}
                    subfolderCounts={subfolderCountsMap}
                    selectedFolderIds={selectedFolderIds}
                    isSelectionMode={isFolderSelectionMode}
                    onToggleSelectFolder={handleToggleSelectFolder}
                    onLongPressFolder={handleLongPressFolder}
                    onSelectFolder={(id, rect) => {
                        handleOpenFolder(id, rect);
                    }}
                    onEditFolder={(folder) => {
                        setEditingFolder(folder);
                        setModalParentFolder(null);
                        setIsFolderModalVisible(true);
                    }}
                    onCreateFolder={() => {
                        setEditingFolder(null);
                        setModalParentFolder(null);
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

        // Radio colapsado adaptativo: si es píldora (alto <= 40), radio = alto / 2; si es tarjeta, 14
        const targetRadius = svOriginH.value <= 40 ? svOriginH.value / 2 : 14;
        const borderRadius = interpolate(folderMorphProgress.value, [0, 0.8, 1], [targetRadius, 6, 0], 'clamp');
        const borderWidth = interpolate(folderMorphProgress.value, [0, 0.7, 1], [1, 0.5, 0], 'clamp');
        const elevation = interpolate(folderMorphProgress.value, [0, 0.35, 1], [0, 10, 0], 'clamp');
        const shadowOpacity = interpolate(folderMorphProgress.value, [0, 0.35, 1], [0, 0.2, 0], 'clamp');
        const shadowRadius = interpolate(folderMorphProgress.value, [0, 0.35, 1], [0, 16, 0], 'clamp');

        // Desvanecimiento suave en el último 6% del cierre para revelar el elemento subyacente sin saltos
        const opacity = interpolate(folderMorphProgress.value, [0, 0.06], [0, 1], 'clamp');

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
            opacity,
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
                                <View
                                    ref={(el) => { pillRefs.current['all'] = el; }}
                                    collapsable={false}
                                >
                                    <TouchableOpacity
                                        style={[
                                            styles.folderChip,
                                            {
                                                backgroundColor: (!isFolderViewActive && activeFolderId === 'all')
                                                    ? (isDark ? `${accent.primary}25` : `${accent.primary}18`)
                                                    : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                                                borderColor: (!isFolderViewActive && activeFolderId === 'all')
                                                    ? (isDark ? `${accent.primary}60` : `${accent.primary}45`)
                                                    : colors.borderSubtle,
                                            },
                                        ]}
                                        onPress={() => {
                                            if (isFolderViewActive) {
                                                handleCloseFolder();
                                            }
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Layers size={13} color={(!isFolderViewActive && activeFolderId === 'all') ? accent.primary : (colors.textSecondary as any)} />
                                        <Text
                                            style={[
                                                styles.folderChipText,
                                                {
                                                    color: (!isFolderViewActive && activeFolderId === 'all') ? colors.textPrimary : colors.textSecondary,
                                                    fontWeight: (!isFolderViewActive && activeFolderId === 'all') ? '700' : '600',
                                                },
                                            ]}
                                        >
                                            {language === 'es' ? 'Todas' : 'All'}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.folderChipBadge,
                                                {
                                                    backgroundColor: (!isFolderViewActive && activeFolderId === 'all')
                                                        ? (isDark ? `${accent.primary}35` : `${accent.primary}22`)
                                                        : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'),
                                                    color: (!isFolderViewActive && activeFolderId === 'all') ? accent.primary : colors.textMuted,
                                                },
                                            ]}
                                        >
                                            {notes.length}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {/* 2. FIJADAS */}
                                {pinnedCount > 0 && (
                                    <View
                                        ref={(el) => { pillRefs.current['pinned'] = el; }}
                                        collapsable={false}
                                    >
                                        <TouchableOpacity
                                            style={[
                                                styles.folderChip,
                                                {
                                                    backgroundColor: (isFolderViewActive && currentTargetFolderId === 'pinned')
                                                        ? (isDark ? 'rgba(251, 191, 36, 0.20)' : 'rgba(245, 158, 11, 0.15)')
                                                        : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                                                    borderColor: (isFolderViewActive && currentTargetFolderId === 'pinned')
                                                        ? (isDark ? '#FBBF2480' : '#F59E0B60')
                                                        : colors.borderSubtle,
                                                },
                                            ]}
                                            onPress={() => handlePillPress('pinned')}
                                            activeOpacity={0.7}
                                        >
                                            <Pin size={12} color={(isDark ? '#FBBF24' : '#F59E0B') as any} />
                                            <Text
                                                style={[
                                                    styles.folderChipText,
                                                    {
                                                        color: (isFolderViewActive && currentTargetFolderId === 'pinned') ? colors.textPrimary : colors.textSecondary,
                                                        fontWeight: (isFolderViewActive && currentTargetFolderId === 'pinned') ? '700' : '600',
                                                    },
                                                ]}
                                            >
                                                {language === 'es' ? 'Fijadas' : 'Pinned'}
                                            </Text>
                                            <Text
                                                style={[
                                                    styles.folderChipBadge,
                                                    {
                                                        backgroundColor: (isFolderViewActive && currentTargetFolderId === 'pinned')
                                                            ? (isDark ? 'rgba(251, 191, 36, 0.32)' : 'rgba(245, 158, 11, 0.22)')
                                                            : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'),
                                                        color: isDark ? '#FBBF24' : '#F59E0B',
                                                    },
                                                ]}
                                            >
                                                {pinnedCount}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {/* 3. SIN CARPETA */}
                                {unassignedCount > 0 && (
                                    <View
                                        ref={(el) => { pillRefs.current['unassigned'] = el; }}
                                        collapsable={false}
                                    >
                                        <TouchableOpacity
                                            style={[
                                                styles.folderChip,
                                                {
                                                    backgroundColor: (isFolderViewActive && currentTargetFolderId === 'unassigned')
                                                        ? (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                                                        : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                                                    borderColor: (isFolderViewActive && currentTargetFolderId === 'unassigned')
                                                        ? (isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.25)')
                                                        : colors.borderSubtle,
                                                },
                                            ]}
                                            onPress={() => handlePillPress('unassigned')}
                                            activeOpacity={0.7}
                                        >
                                            <Inbox size={12} color={colors.textSecondary as any} />
                                            <Text
                                                style={[
                                                    styles.folderChipText,
                                                    {
                                                        color: (isFolderViewActive && currentTargetFolderId === 'unassigned') ? colors.textPrimary : colors.textSecondary,
                                                        fontWeight: (isFolderViewActive && currentTargetFolderId === 'unassigned') ? '700' : '600',
                                                    },
                                                ]}
                                            >
                                                {language === 'es' ? 'Sin carpeta' : 'Unassigned'}
                                            </Text>
                                            <Text
                                                style={[
                                                    styles.folderChipBadge,
                                                    {
                                                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                                                        color: colors.textMuted,
                                                    },
                                                ]}
                                            >
                                                {unassignedCount}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {/* 4. CARPETAS RAÍZ */}
                                {stripFolders.map(f => {
                                    const folderColor = normalizeHex(f.color, '#8B5CF6');
                                    const count = noteCountsMap[f.id] || 0;
                                    const isFolderActive = isFolderViewActive && currentTargetFolderId === f.id;

                                    return (
                                        <View
                                            key={f.id}
                                            ref={(el) => { pillRefs.current[f.id] = el; }}
                                            collapsable={false}
                                        >
                                            <TouchableOpacity
                                                style={[
                                                    styles.folderChip,
                                                    {
                                                        backgroundColor: isFolderActive
                                                            ? `${folderColor}${isDark ? '24' : '16'}`
                                                            : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                                                        borderColor: isFolderActive
                                                            ? `${folderColor}${isDark ? '60' : '45'}`
                                                            : (isDark ? `${folderColor}35` : `${folderColor}25`),
                                                    },
                                                ]}
                                                onPress={() => handlePillPress(f.id)}
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
                                                        {
                                                            color: isFolderActive ? colors.textPrimary : colors.textSecondary,
                                                            fontWeight: isFolderActive ? '700' : '600',
                                                        },
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
                                                                backgroundColor: isFolderActive
                                                                    ? `${folderColor}${isDark ? '35' : '22'}`
                                                                    : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'),
                                                                color: folderColor,
                                                            },
                                                        ]}
                                                    >
                                                        {count}
                                                    </Text>
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })}

                                {/* 5. BOTÓN NUEVA CARPETA */}
                                <TouchableOpacity
                                    style={[
                                        styles.newFolderChip,
                                        {
                                            borderColor: isDark ? `${accent.primary}50` : `${accent.primary}35`,
                                            backgroundColor: isDark ? `${accent.primary}12` : `${accent.primary}08`,
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
                    </View>
                )}
            </Animated.View>

            {/* Lista Base de Secciones */}
            <ScrollView
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={Platform.OS === 'android'}
                scrollEventThrottle={16}
                contentContainerStyle={{
                    paddingTop: 8,
                    paddingBottom: insets.bottom + ((isSelectionMode || isFolderSelectionMode) ? 130 : 90),
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
                                                onPress={handleBackPress}
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

                                    {/* Lado Derecho: Colaboradores + Acciones de Carpeta */}
                                    {activeFolderObj ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <CollaboratorsAvatars
                                                targetType="folder"
                                                targetId={activeFolderObj.id}
                                                onPress={() => setIsFolderShareModalVisible(true)}
                                            />
                                        </View>
                                    ) : null}
                                </View>
                            )}
                        </Animated.View>

                        {/* Breadcrumbs de navegación jerárquica */}
                        {folderStack.length > 0 && (
                            <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                                <FolderBreadcrumb
                                    stack={folderStack}
                                    onNavigate={handleBreadcrumbNavigate}
                                    accentColor={activeFolderColor}
                                />
                            </View>
                        )}

                        {/* Contenido de Notas de la Carpeta (Fade + Slide progresivo en la 2da mitad) */}
                        <Animated.View style={[{ flex: 1 }, morphNotesContentStyle]}>
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{
                                    paddingTop: 8,
                                    paddingBottom: insets.bottom + (isSelectionMode ? 130 : 90),
                                }}
                            >
                                {/* Subcarpetas dentro de esta carpeta */}
                                {currentSubfolders.length > 0 && (
                                    <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
                                        <FolderCardGrid
                                            folders={currentSubfolders}
                                            noteCounts={noteCountsMap}
                                            subfolderCounts={subfolderCountsMap}
                                            headerTitle={
                                                language === 'es'
                                                    ? `SUBCARPETAS (${currentSubfolders.length})`
                                                    : `SUBFOLDERS (${currentSubfolders.length})`
                                            }
                                            onSelectFolder={(id) => {
                                                const sub = folders.find(f => f.id === id);
                                                if (sub) {
                                                    pushFolder(sub);
                                                    setOpenedFolderId(sub.id);
                                                }
                                            }}
                                            onEditFolder={(folder) => {
                                                setEditingFolder(folder);
                                                setModalParentFolder(activeFolderObj);
                                                setIsFolderModalVisible(true);
                                            }}
                                            onCreateFolder={() => {
                                                setEditingFolder(null);
                                                setModalParentFolder(activeFolderObj);
                                                setIsFolderModalVisible(true);
                                            }}
                                            onTogglePin={() => {}}
                                        />
                                    </View>
                                )}

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

            {/* Modal de Creación / Edición de Carpeta */}
            <FolderModal
                visible={isFolderModalVisible}
                onClose={() => {
                    setIsFolderModalVisible(false);
                    setEditingFolder(null);
                    setModalParentFolder(null);
                }}
                folderToEdit={editingFolder}
                parentFolder={modalParentFolder}
                onSave={async (name, icon, color, isPinned, parentId) => {
                    LayoutAnimation.configureNext(smoothLayoutAnimation);
                    if (editingFolder) {
                        await updateFolder(editingFolder.id, {
                            name,
                            icon,
                            color,
                            is_pinned: isPinned ? 1 : 0,
                        });
                    } else {
                        await createFolder(name, icon, color, isPinned, parentId);
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
                onCreateNewFolder={(parentId) => {
                    setEditingFolder(null);
                    setModalParentFolder(parentId ? folders.find(f => f.id === parentId) || null : null);
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
                    <View style={[styles.menuModalCardWrap, { top: insets.top + 50 }]}>
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
                            {/* 1. Historial de notas */}
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

                            {/* 2. Compartir notas */}
                            <TouchableOpacity
                                style={styles.menuModalItem}
                                onPress={() => {
                                    setIsFolderMenuVisible(false);
                                    handleShareNotesMenu();
                                }}
                                activeOpacity={0.7}
                            >
                                <Share2 size={16} color={colors.textSecondary as any} strokeWidth={2} />
                                <Text style={[styles.menuModalItemText, { color: colors.textPrimary }]}>
                                    {language === 'es' ? 'Compartir notas' : 'Share notes'}
                                </Text>
                            </TouchableOpacity>

                            {/* Opciones de Carpeta (si estamos dentro de una carpeta activa) */}
                            {activeFolderObj && (
                                <>
                                    <View style={[styles.menuModalDivider, { backgroundColor: colors.borderSubtle }]} />

                                    {/* Compartir carpeta (Colaboración) */}
                                    <TouchableOpacity
                                        style={styles.menuModalItem}
                                        onPress={() => {
                                            setIsFolderMenuVisible(false);
                                            setIsFolderShareModalVisible(true);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Users size={16} color={colors.textSecondary as any} strokeWidth={2} />
                                        <Text style={[styles.menuModalItemText, { color: colors.textPrimary }]}>
                                            {language === 'es' ? 'Compartir carpeta' : 'Share folder'}
                                        </Text>
                                    </TouchableOpacity>

                                    {/* 3. Nueva subcarpeta */}
                                    <TouchableOpacity
                                        style={styles.menuModalItem}
                                        onPress={() => {
                                            setIsFolderMenuVisible(false);
                                            setEditingFolder(null);
                                            setModalParentFolder(activeFolderObj);
                                            setIsFolderModalVisible(true);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <FolderPlus size={16} color={colors.textSecondary as any} strokeWidth={2} />
                                        <Text style={[styles.menuModalItemText, { color: colors.textPrimary }]}>
                                            {language === 'es' ? 'Nueva subcarpeta' : 'New subfolder'}
                                        </Text>
                                    </TouchableOpacity>

                                    {/* 4. Fijar / Desfijar (Solo para carpetas raíz) */}
                                    {!activeFolderObj.parent_id && (
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

                                    {/* 5. Editar carpeta */}
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

                                    <View style={[styles.menuModalDivider, { backgroundColor: colors.borderSubtle }]} />

                                    {/* 5. Eliminar carpeta */}
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

            {/* Modal de Colaboración de Carpeta */}
            {activeFolderObj && (
                <ShareModal
                    visible={isFolderShareModalVisible}
                    onClose={() => setIsFolderShareModalVisible(false)}
                    targetType="folder"
                    targetId={activeFolderObj.id}
                    targetTitle={activeFolderObj.name}
                    isOwner={activeFolderObj.is_shared !== 1}
                />
            )}

            {/* Modal de Colaboración de Nota */}
            {sharingNote && (
                <ShareModal
                    visible={Boolean(sharingNote)}
                    onClose={() => setSharingNote(null)}
                    targetType="note"
                    targetId={sharingNote.id}
                    targetTitle={sharingNote.title || (language === 'es' ? 'Nota sin título' : 'Untitled note')}
                    isOwner={!sharingNote.shared_owner_id || sharingNote.shared_owner_id === session?.user?.id || sharingNote.is_shared !== 1}
                />
            )}
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

const NotesScreen = React.memo(NotesScreenComponent);
export default NotesScreen;

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    headerContainer: {
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 4,
        minHeight: 52,
        justifyContent: 'center',
    },
    mainTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 44,
    },
    mainFiltersStrip: {
        flex: 1,
        marginLeft: -16,
    },
    mainFiltersScrollContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 16,
        paddingRight: 4,
        paddingVertical: 4,
    },
    actionsPill: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        paddingHorizontal: 3,
    },
    pillActionBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pillDivider: {
        width: 1,
        height: 14,
        marginHorizontal: 1,
    },
    folderChip: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 34,
        gap: 6,
        paddingHorizontal: 10,
        borderRadius: 17,
        borderWidth: 1,
    },
    folderChipText: {
        fontSize: 12,
    },
    folderChipBadge: {
        fontSize: 10,
        fontWeight: '700',
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 999,
        overflow: 'hidden',
    },
    newFolderChip: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 34,
        gap: 5,
        paddingHorizontal: 10,
        borderRadius: 17,
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
        width: '100%',
        minHeight: 44,
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
        right: 16,
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
        bottom: 0,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        borderRadius: 16,
        borderWidth: 1,
        zIndex: 10,
    },
    cardIconBox: {
        width: 24,
        height: 24,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 6,
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
