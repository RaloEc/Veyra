import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
    AppState,
    AppStateStatus,
    ActivityIndicator,
    Modal,
    Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
    ChevronLeft,
    ChevronRight,
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
    Eye,
    AlignLeft,
    AlignCenter,
    AlignRight,
    MessageSquare,
    Replace,
    Download,
    Play,
    Link as LinkIcon,
    Video,
} from '@tamagui/lucide-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import ImageViewing from 'react-native-image-viewing';
import { Image as ExpoImage } from 'expo-image';
import * as NavigationBar from 'expo-navigation-bar';

import { useCreateNote } from '../../src/hooks/useCreateNote';
import { useStore } from '../../src/store/useStore';
import { useNotesStore } from '../../src/store/useNotesStore';
import { useFoldersStore } from '../../src/store/useFoldersStore';
import { useEventsStore } from '../../src/store/useEventsStore';
import { useCardTransitionStore } from '../../src/store/cardTransitionStore';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    interpolate,
    Extrapolation,
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
import { NoteUnifiedBreadcrumb } from '../../src/components/notes/NoteUnifiedBreadcrumb';
import { navigateToFolderInNotes } from '../../src/utils/folderNavigationUtils';
import { MoveToFolderModal } from '../../src/components/notes/MoveToFolderModal';
import { FolderModal } from '../../src/components/notes/FolderModal';
import { NoteOptionsMenu } from '../../src/components/notes/NoteOptionsMenu';
import { NoteFontModal } from '../../src/components/notes/NoteFontModal';
import { ShareModal } from '../../src/components/collaboration/ShareModal';
import { CollaboratorsAvatars } from '../../src/components/collaboration/CollaboratorsAvatars';
import { exportNoteToPdf } from '../../src/utils/pdfExportUtils';
import { actions } from 'react-native-pell-rich-editor';
import * as Y from 'yjs';
import { supabase } from '../../src/lib/supabase';
import { getDB, withDB, withSerializedTransaction, ensureYjsPersistenceReady } from '../../src/db/index';
import { getFontOption } from '../../src/constants/noteFonts';
import { VeyraTiptapYjsEditor, VeyraTiptapEditorRef, EditorToolbarState } from '../../src/poc-yjs/VeyraTiptapYjsEditor';
import { CachedNoteView } from '../../src/poc-yjs/CachedNoteView';
import { SupabaseYjsProvider, SupabaseYjsStatus } from '../../src/poc-yjs/supabaseYjsProvider';
import { YjsLocalPersistence, bytesToBase64, base64ToBytes } from '../../src/poc-yjs/yjsLocalPersistence';
import { YjsRemotePersistence } from '../../src/poc-yjs/yjsRemotePersistence';
import { diagLog } from '../../src/poc-yjs/diagLog';
import { useYjsPreviewSync } from '../../src/poc-yjs/useYjsPreviewSync';
import { useYjsActivity } from '../../src/poc-yjs/useYjsActivity';
import { executePilotActivation } from '../../src/poc-yjs/pilotActivationStrategy';
import { NoteService } from '../../src/services/noteService';
import { StorageService } from '../../src/services/storageService';
import { Note } from '../../src/types/db';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { registerActiveEditor } from '../../src/services/uploadQueueService';

export default function NoteDetailAndEditScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { id, pageIndex } = useLocalSearchParams<{ id: string; pageIndex?: string }>();
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const { colors, typography, radii, accent, isDark, isAmoled } = useVeyraTheme();
    const language = useStore(state => state.language);
    const isCreating = !id || id === 'create';
    const [isEditMode, setIsEditMode] = useState(isCreating);
    const [isNotesFocused, setIsNotesFocused] = useState(false);
    const [galleryVisible, setGalleryVisible] = useState(false);
    const [galleryIndex, setGalleryIndex] = useState(0);
    const [isPagesModalVisible, setIsPagesModalVisible] = useState(false);
    const [isOptionsMenuVisible, setIsOptionsMenuVisible] = useState(false);
    const [isFontModalVisible, setIsFontModalVisible] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isShareModalVisible, setIsShareModalVisible] = useState(false);
    const [isHistoryModalVisible, setIsHistoryModalVisible] = useState(false);

    const currentNote = useNotesStore(state => state.notes.find(n => n.id === id));
    const syncMode = currentNote?.sync_mode || 'rest';
    const isYjsMode = syncMode === 'yjs';

    // Al abrir la nota, actualizar last_opened_ms en SQLite y store para limpiar indicador de no visto
    useEffect(() => {
        if (id && id !== 'create') {
            useNotesStore.getState().markNoteOpened(id);
        }
    }, [id]);

    // Estado e instancias dedicadas para el editor colaborativo Yjs (Fase 3.3)
    const yjsEditorRef = useRef<VeyraTiptapEditorRef>(null);
    const yjsProviderRef = useRef<SupabaseYjsProvider | null>(null);

    // Registrar el editor Yjs activo para reemplazo de imágenes en background tras reconexión
    useEffect(() => {
        if (isYjsMode && id && id !== 'create') {
            return registerActiveEditor(id, (oldUri, newUrl) => {
                yjsEditorRef.current?.replaceImageSrc(oldUri, newUrl);
            });
        }
    }, [isYjsMode, id]);
    const [isYjsPersistenceReady, setIsYjsPersistenceReady] = useState<boolean | null>(null);
    const [yjsPersistenceError, setYjsPersistenceError] = useState<string | null>(null);
    const [yjsConnectionStatus, setYjsConnectionStatus] = useState<SupabaseYjsStatus>('DISCONNECTED');
    const [yjsToolbarState, setYjsToolbarState] = useState<EditorToolbarState>({
        canUndo: false,
        canRedo: false,
        isBold: false,
        isItalic: false,
        isUnderline: false,
        isStrike: false,
        isH1: false,
        isH2: false,
        isBlockquote: false,
        isBulletList: false,
        isOrderedList: false,
        isTaskList: false,
        textAlign: 'left',
        textColor: null,
        highlightColor: null,
        fontFamily: null,
    });
    const [yjsActivePeers, setYjsActivePeers] = useState<
        Array<{ clientId: number; userId?: string | null; name: string; color: string; hasCursor: boolean; isEditing?: boolean }>
    >([]);

    // Filtrar exclusivamente a los colaboradores que se encuentran en Modo Edición (excluyendo al usuario actual)
    const editingPeers = useMemo(() => {
        return yjsActivePeers.filter(peer => {
            if (peer.isEditing !== true) return false;
            if (peer.userId && currentUserId && peer.userId === currentUserId) return false;
            return true;
        });
    }, [yjsActivePeers, currentUserId]);

    // ─── Tooltip Flotante de Imagen y Visor a Pantalla Completa (Yjs) ───
    const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
    const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
    const [imageCoords, setImageCoords] = useState<{
        x: number;
        y: number;
        w: number;
        h: number;
        url: string;
        attrs?: { width?: number | null; caption?: string | null; textAlign?: string | null };
    } | null>(null);
    const imageTooltipAnim = useRef(new Animated.Value(0)).current;

    const handleImageClicked = useCallback((url: string, rect?: { x: number; y: number; width: number; height: number; top?: number; bottom?: number }, attrs?: { width?: number | null; caption?: string | null; textAlign?: string | null }) => {
        setSelectedImageUrl(url);
        if (rect) {
            setImageCoords({
                x: rect.x,
                y: rect.y,
                w: rect.width,
                h: rect.height,
                url,
                attrs,
            });
        } else {
            setImageCoords({
                x: windowWidth / 2,
                y: 160,
                w: 120,
                h: 120,
                url,
                attrs,
            });
        }
    }, [windowWidth]);

    const handleImageDismissed = useCallback(() => {
        setImageCoords(null);
    }, []);

    useEffect(() => {
        if (imageCoords) {
            Animated.spring(imageTooltipAnim, {
                toValue: 1,
                useNativeDriver: true,
                friction: 7,
                tension: 60,
            }).start();
        } else {
            imageTooltipAnim.setValue(0);
        }
    }, [imageCoords, imageTooltipAnim]);

    useEffect(() => {
        if (!isEditMode) {
            setImageCoords(null);
        }
    }, [isEditMode]);

    // ─── Tooltip Flotante de YouTube (Yjs) ───
    const [youtubeCoords, setYoutubeCoords] = useState<{
        x: number;
        y: number;
        w: number;
        h: number;
        videoId: string;
        attrs?: { width?: number | null; textAlign?: string | null; embed?: boolean };
    } | null>(null);
    const youtubeTooltipAnim = useRef(new Animated.Value(0)).current;

    const handleYoutubeClicked = useCallback((videoId: string, rect?: { x: number; y: number; width: number; height: number; top?: number; bottom?: number }, attrs?: { width?: number | null; textAlign?: string | null; embed?: boolean }) => {
        if (rect) {
            setYoutubeCoords({
                x: rect.x,
                y: rect.y,
                w: rect.width,
                h: rect.height,
                videoId,
                attrs,
            });
        } else {
            setYoutubeCoords({
                x: windowWidth / 2,
                y: 160,
                w: 120,
                h: 80,
                videoId,
                attrs,
            });
        }
    }, [windowWidth]);

    const handleYoutubeDismissed = useCallback(() => {
        setYoutubeCoords(null);
    }, []);

    useEffect(() => {
        if (youtubeCoords) {
            Animated.spring(youtubeTooltipAnim, {
                toValue: 1,
                useNativeDriver: true,
                friction: 7,
                tension: 60,
            }).start();
        } else {
            youtubeTooltipAnim.setValue(0);
        }
    }, [youtubeCoords, youtubeTooltipAnim]);

    useEffect(() => {
        if (!isEditMode) {
            setYoutubeCoords(null);
        }
    }, [isEditMode]);

    // ─── Apertura instantánea con contenido cacheado + fade al WebView ───
    const [showCached, setShowCached] = useState(isYjsMode);
    const [webViewReady, setWebViewReady] = useState(false);
    const [cachedPreviewText, setCachedPreviewText] = useState<string | null>(null);
    const [contentRendered, setContentRendered] = useState(false);

    const prevIdRef = useRef(id);
    const prevIsYjsModeRef = useRef(isYjsMode);

    const cachedOpacityAnim = useRef(new Animated.Value(1)).current;
    const editorOpacityAnim = useRef(new Animated.Value(0)).current;
    const hasTransitionedRef = useRef(false);

    const folders = useFoldersStore(state => state.folders);
    const createFolder = useFoldersStore(state => state.createFolder);
    const events = useEventsStore(state => state.events);

    const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
    const [isCreateFolderModalVisible, setIsCreateFolderModalVisible] = useState(false);
    const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);

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

    // Visibilidad inmediata en 0ms; la transición nativa del Stack gestiona la navegación fluida
    const fadeProgress = useSharedValue(1);

    const screenAnimatedStyle = useAnimatedStyle(() => ({
        opacity: fadeProgress.value,
    }));


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
        fontFamily,
        setFontFamily,
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
        remoteSyncNotice,
        liveCollaborator,
        broadcastCursorMove,
        broadcastCursorRemove,
        userPermission,
        canEdit,
        hasAccess,
        isRevoked,
        syncPagesFromYjs,
    } = useCreateNote(id, undefined, undefined, undefined, undefined, { isEditMode, yjsProviderRef });

    const isOwner = userPermission.isOwner;
    const effectiveCanEdit = canEdit && (isYjsMode ? isYjsPersistenceReady === true : true);

    const currentUserId = useStore(state => state.session?.user?.id);

    // Hook para sincronizar preview_text derivado desde el WebView
    const { onPreviewUpdate: baseOnPreviewUpdate } = useYjsPreviewSync({
        noteId: id,
        enabled: Boolean(isYjsMode && isYjsPersistenceReady === true),
    });

    // Hook para registrar auditoría de actividad de edición Yjs en sesiones de 5 minutos
    const { recordEdit: recordYjsActivityEdit, flush: flushYjsActivity } = useYjsActivity({
        noteId: id,
        userId: currentUserId || undefined,
        enabled: Boolean(isYjsMode && id && id !== 'create'),
    });

    const handlePreviewUpdate = useCallback((preview: string, origin?: string) => {
        baseOnPreviewUpdate?.(preview, origin);
    }, [baseOnPreviewUpdate]);

    const handleActivitySnippetHtml = useCallback((snippetHtml: string) => {
        if (!snippetHtml) return;
        const cleanSnippet = snippetHtml
            .replace(/<\/?(bold|italic|strong|em|p|div|span|br)[^>]*>?/gmi, '')
            .replace(/<[^>]*>?/gm, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/\s+/g, ' ')
            .trim();

        if (cleanSnippet) {
            recordYjsActivityEdit(cleanSnippet);
        }
    }, [recordYjsActivityEdit]);

    const isComponentMountedRef = useRef(true);
    const hasLoadedYjsDocRef = useRef(false);
    const activeProviderNoteIdRef = useRef<string | null>(null);
    const transitionTimersRef = useRef<any[]>([]);

    useEffect(() => {
        isComponentMountedRef.current = true;
        return () => {
            isComponentMountedRef.current = false;
            transitionTimersRef.current.forEach(t => clearTimeout(t));
            transitionTimersRef.current = [];
        };
    }, []);

    useEffect(() => {
        const isSameNote = prevIdRef.current === id;
        const isHotTransition = isSameNote && !prevIsYjsModeRef.current && isYjsMode;

        prevIdRef.current = id;
        prevIsYjsModeRef.current = isYjsMode;

        if (isHotTransition) {
            // Transición en caliente de 'rest' a 'yjs' (sin salir de la pantalla):
            // NO mostrar el Skeleton de carga (`showCached`). La transición debe ser instantánea.
            transitionTimersRef.current.forEach(t => clearTimeout(t));
            transitionTimersRef.current = [];
            setShowCached(false);
            setWebViewReady(true);
            setContentRendered(true);
            hasTransitionedRef.current = true;
            cachedOpacityAnim.setValue(0);
            editorOpacityAnim.setValue(1);

            // Mantener el foco si el usuario estaba editando
            if (isNotesFocused || isEditMode) {
                setTimeout(() => {
                    yjsEditorRef.current?.focus();
                }, 150);
            }
            return;
        }

        transitionTimersRef.current.forEach(t => clearTimeout(t));
        transitionTimersRef.current = [];
        hasLoadedYjsDocRef.current = false;
        hasTransitionedRef.current = false;
        setWebViewReady(false);
        setContentRendered(false);
        setShowCached(isYjsMode);
        cachedOpacityAnim.setValue(1);
        editorOpacityAnim.setValue(0);
    }, [id, isYjsMode]);

    // Carga inicial de previewText desde SQLite para skeleton inmediato frame 1
    useEffect(() => {
        if (!isYjsMode || !id || id === 'create') return;
        let isMounted = true;
        (async () => {
            try {
                const row = await withDB(async (db) => {
                    return await db.getFirstAsync<{ preview_text?: string | null }>(
                        'SELECT preview_text FROM notes WHERE id = ?',
                        [id]
                    );
                });
                if (isMounted && row?.preview_text) {
                    setCachedPreviewText(row.preview_text);
                }
            } catch (e) {
                console.warn('[CachedSkeleton] Error leyendo preview_text de SQLite:', e);
            }
        })();
        return () => {
            isMounted = false;
        };
    }, [isYjsMode, id]);

    // Disparar fade al haber pintado el contenido local (contentRendered) y persistencia lista
    useEffect(() => {
        if (!isYjsMode) return;
        if (contentRendered && isYjsPersistenceReady === true && !hasTransitionedRef.current && !webViewReady) {
            // Pequeño delay extra para permitir que el CSS del WebView se aplique completamente
            const timer = setTimeout(() => {
                if (isComponentMountedRef.current) {
                    setWebViewReady(true);
                }
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [contentRendered, isYjsPersistenceReady, isYjsMode, webViewReady]);

    // Transición suave: cross-fade cached -> editor cuando el contenido está listo
    useEffect(() => {
        if (!isYjsMode) return;
        if (webViewReady && !hasTransitionedRef.current) {
            hasTransitionedRef.current = true;

            // Cross-fade suave: skeleton (1 -> 0, 250ms) y editor (0 -> 1, 250ms)
            Animated.parallel([
                Animated.timing(cachedOpacityAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                }),
                Animated.timing(editorOpacityAnim, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                if (isComponentMountedRef.current) {
                    setShowCached(false);
                }
            });
        }
    }, [webViewReady, isYjsMode]);

    // Fallback: Si tras 3s no llega EDITOR_READY, forzar setWebViewReady(true) para no bloquear la UI
    useEffect(() => {
        if (!isYjsMode || !id || id === 'create') return;
        const fallbackTimer = setTimeout(() => {
            if (isComponentMountedRef.current && !webViewReady) {
                setWebViewReady(true);
            }
        }, 3000);
        return () => clearTimeout(fallbackTimer);
    }, [isYjsMode, id, webViewReady]);

    // ─── COMPROBACIÓN ESTRUCTURAL Y GUARD DE PERSISTENCIA LOCAL SQLITE (TAREA 3) ───
    useEffect(() => {
        if (!isYjsMode || !id || id === 'create') return;
        diagLog('open_start', { noteId: id });
        let isMounted = true;
        (async () => {
            try {
                const db = await getDB();
                const verification = await ensureYjsPersistenceReady(db);
                if (isMounted) {
                    setIsYjsPersistenceReady(verification.ready);
                    if (!verification.ready) {
                        setYjsPersistenceError(verification.error || 'Persistencia local SQLite no disponible');
                    }
                }
            } catch (err: any) {
                if (isMounted) {
                    setIsYjsPersistenceReady(false);
                    setYjsPersistenceError(err?.message || 'Error verificando esquema SQLite');
                }
            }
        })();
        return () => { isMounted = false; };
    }, [isYjsMode, id]);

    // Adaptadores de persistencia para Yjs
    const session = useStore(state => state.session);
    const storeUserName = useStore(state => state.userName);
    const authEmail = session?.user?.email || null;
    const authUserId = session?.user?.id || null;
    const metaName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name;

    const effectiveUserName = React.useMemo(() => {
        const candidate =
            (userPermission as any)?.displayName ||
            (userPermission as any)?.name ||
            storeUserName ||
            metaName;

        const base = candidate && typeof candidate === 'string' && candidate.trim() !== ''
            ? candidate.trim()
            : (authEmail ? authEmail.split('@')[0] : 'Usuario');

        return `${base} • Móvil`;
    }, [userPermission, storeUserName, metaName, authEmail]);

    const effectiveUserColor = React.useMemo(() => {
        const PALETTE = ['#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#3B82F6', '#06B6D4'];
        if (authUserId) {
            let hash = 0;
            for (let i = 0; i < authUserId.length; i++) {
                hash = (hash << 5) - hash + authUserId.charCodeAt(i);
                hash |= 0;
            }
            return PALETTE[Math.abs(hash) % PALETTE.length];
        }
        return accent.primary || '#8B5CF6';
    }, [authUserId, accent.primary]);

    const localPersistence = React.useMemo(() => {
        if (!isYjsMode) return null;
        return new YjsLocalPersistence({
            execAsync: async (sql) => withDB(db => db.execAsync(sql)),
            runAsync: async (sql, params) => withDB(db => db.runAsync(sql, params)),
            getAllAsync: async (sql, params) => withDB(db => db.getAllAsync(sql, params)),
            getFirstAsync: async (sql, params) => withDB(db => db.getFirstAsync(sql, params)),
            withTransactionAsync: async (action) => withDB(db => withSerializedTransaction(db, action)),
        });
    }, [isYjsMode]);

    const remotePersistence = React.useMemo(() => {
        if (!isYjsMode) return null;
        return new YjsRemotePersistence(supabase);
    }, [isYjsMode]);

    // Configuración del proveedor Supabase Yjs (Fase 3.3)
    // Se inicializa UNA SOLA VEZ por nota cuando el modo Yjs y la persistencia local SQLite están listos.
    useEffect(() => {
        if (!isYjsMode || !id || id === 'create' || isYjsPersistenceReady !== true || !localPersistence || !remotePersistence) {
            if (yjsProviderRef.current) {
                yjsProviderRef.current.destroy();
                yjsProviderRef.current = null;
                activeProviderNoteIdRef.current = null;
                setYjsConnectionStatus('DISCONNECTED');
            }
            return;
        }

        // Si ya existe un proveedor activo para esta misma nota, evitar recreación destructiva
        if (yjsProviderRef.current && activeProviderNoteIdRef.current === id) {
            return;
        }

        activeProviderNoteIdRef.current = id;
        const clientId = `client-${Math.random().toString(36).substring(2, 7)}`;
        diagLog('provider_create', { noteId: id, clientId, isYjsPersistenceReady });
        diagLog('provider_mount', { noteId: id });

        const provider = new SupabaseYjsProvider({
            supabase,
            documentId: id,
            clientId,
            localPersistence,
            remotePersistence,
            user: {
                id: authUserId || undefined,
                name: effectiveUserName,
                color: effectiveUserColor,
                role: userPermission.role || 'editor',
                isEditing: Boolean(isEditMode && effectiveCanEdit),
            },
            onStatusChange: (status) => {
                setYjsConnectionStatus(status);
                if (status === 'CONNECTED') {
                    yjsEditorRef.current?.requestSyncStep1();
                    yjsEditorRef.current?.broadcastAwareness();
                }
            },
            onRemoteUpdate: (base64Update, origin) => {
                const originRemoto = origin || 'remote-broadcast';
                if (base64Update.startsWith('[')) {
                    yjsEditorRef.current?.applyRemoteUpdate(base64Update, originRemoto);
                    return;
                }
                try {
                    const bytes = base64ToBytes(base64Update);
                    diagLog('apply_update', { origin: originRemoto, bytes: bytes?.byteLength ?? bytes?.length });
                    console.log('[YJS-DIAG] aplicando update remoto', { origin: originRemoto, bytes: bytes?.byteLength ?? bytes?.length });
                } catch (_) { }
                yjsEditorRef.current?.applyRemoteUpdate(base64Update, originRemoto);
            },
            onRemoteAwareness: (base64Awareness, senderClientId) => {
                console.log('[RN-BRIDGE] onRemoteAwareness recibido en [id].tsx, pasando a yjsEditorRef', {
                    hasEditorRef: Boolean(yjsEditorRef.current),
                    base64Length: base64Awareness?.length || 0,
                    senderClientId
                });
                yjsEditorRef.current?.applyRemoteAwareness(base64Awareness, senderClientId);
            },
            onSyncStep1Received: (remoteSv, correlationId, isReturnHandshake) => {
                yjsEditorRef.current?.handleSyncStep1(remoteSv, correlationId, isReturnHandshake);
            },
            onPeerLeft: (remoteClientId) => {
                yjsEditorRef.current?.removePeer(remoteClientId);
            },
            onHeartbeat: (remoteClientId) => {
                yjsEditorRef.current?.touchPeer(remoteClientId);
            },
            onError: (err) => {
                console.warn('[Notes Yjs] Error en SupabaseYjsProvider:', err);
            },
            onPageOrderChange: (pageIds) => {
                console.log('[Notes Yjs] Sincronizando orden de páginas desde Yjs:', pageIds);
                syncPagesFromYjs(pageIds);
            },
        });

        yjsProviderRef.current = provider;
        provider.connect();

        return () => {
            diagLog('provider_unmount', { noteId: id, reason: 'cleanup' });
            activeProviderNoteIdRef.current = null;

            yjsProviderRef.current?.updateUser({ isEditing: false });
            yjsEditorRef.current?.setEditing?.(false);
            yjsEditorRef.current?.destroyAwareness();
            const ch = provider.getChannel();
            if (ch) {
                try { ch.unsubscribe(); } catch (_) { }
                try { supabase.removeChannel(ch); } catch (_) { }
            }
            provider.destroy();
            if (yjsProviderRef.current === provider) {
                yjsProviderRef.current = null;
            }

            // Higiene automática: regenerar snapshot si hay muchos deltas pendientes
            if (id && remotePersistence) {
                setTimeout(async () => {
                    try {
                        // Query ligera: max id actual vs snapshot clock
                        const { data: snapshotRow } = await supabase
                            .from('note_yjs_snapshots')
                            .select('server_clock')
                            .eq('note_id', id)
                            .maybeSingle();

                        const { data: maxRow } = await supabase
                            .from('note_yjs_updates')
                            .select('id')
                            .eq('note_id', id)
                            .order('id', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        const snapshotClock = Number(snapshotRow?.server_clock) || 0;
                        const maxId = Number(maxRow?.id) || 0;
                        const diff = maxId - snapshotClock;

                        diagLog('snapshot_regen_auto', { noteId: id, diff, triggered: diff > 200 });

                        if (diff > 200) {
                            console.log('[Higiene] Regenerando snapshot:', { noteId: id, maxId, snapshotClock, diff });
                            await remotePersistence.regenerateSnapshot(id);
                            console.log('[Higiene] Snapshot regenerado correctamente');
                        }
                    } catch (e) {
                        console.warn('[Higiene] Error regenerando snapshot:', e);
                    }
                }, 3000); // Esperar 3s para que termine el cleanup
            }
        };
    }, [isYjsMode, id, isYjsPersistenceReady, localPersistence, remotePersistence]);

    // Sincronización reactiva de información de usuario sin destruir ni recrear el proveedor
    useEffect(() => {
        if (yjsProviderRef.current) {
            yjsProviderRef.current.updateUser({
                id: authUserId || undefined,
                name: effectiveUserName,
                color: effectiveUserColor,
                role: userPermission.role || 'editor',
            });
        }
    }, [authUserId, effectiveUserName, effectiveUserColor, userPermission.role]);

    // Ciclo de vida Android AppState para presencia Yjs
    useEffect(() => {
        if (!isYjsMode) return;
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                yjsEditorRef.current?.restoreAwareness();
                if (yjsProviderRef.current) {
                    const status = yjsProviderRef.current.getStatus();
                    if (status !== 'CONNECTED' && status !== 'SYNCED') {
                        yjsProviderRef.current.reconnect();
                    } else {
                        yjsEditorRef.current?.requestSyncStep1();
                        yjsEditorRef.current?.broadcastAwareness();
                    }
                }
            } else if (nextAppState === 'background' || nextAppState === 'inactive') {
                yjsEditorRef.current?.destroyAwareness();
                yjsProviderRef.current?.sendPeerLeft();
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => subscription.remove();
    }, [isYjsMode]);

    // Sincronizar visibilidad de cursores colaborativos y estado de edición según modo de nota
    useEffect(() => {
        if (!isYjsMode) return;
        const editing = Boolean(isEditMode && effectiveCanEdit);
        yjsProviderRef.current?.updateUser({ isEditing: editing });
        yjsEditorRef.current?.setEditing?.(editing);
        const trySet = () => {
            if (yjsEditorRef.current) {
                yjsEditorRef.current.setCursorVisible(editing);
            } else {
                setTimeout(trySet, 50);
            }
        };
        trySet();

        return () => {
            yjsProviderRef.current?.updateUser({ isEditing: false });
            yjsEditorRef.current?.setEditing?.(false);
        };
    }, [isYjsMode, isEditMode, effectiveCanEdit]);

    // Callbacks del Editor Tiptap / Yjs
    const handleYjsReady = useCallback(() => {
        if (!isComponentMountedRef.current || !localPersistence || !id) return;
        if (hasLoadedYjsDocRef.current) {
            console.log('[YJS-DIAG] [OPEN] handleYjsReady omitido porque ya fue ejecutado previamente para esta nota:', id);
            return;
        }
        hasLoadedYjsDocRef.current = true;

        diagLog('open_start', { noteId: id, phase: 'handleYjsReady' });
        // 1. Cargar estado local SQLite de inmediato en el editor para visualización offline-first instantánea
        console.log('[YJS-DIAG] [OPEN] 1. Leyendo estado inicial desde SQLite local para nota:', id);
        localPersistence.loadDocument(id).then(localRes => {
            if (!isComponentMountedRef.current) return;
            console.log('[YJS-DIAG] [OPEN] Estado SQLite local obtenido:', {
                noteId: id,
                hasSnapshot: localRes.hasSnapshot,
                appliedUpdatesCount: localRes.appliedUpdatesCount,
            });
            if (localRes.hasSnapshot || localRes.appliedUpdatesCount > 0) {
                const fullState = Y.encodeStateAsUpdate(localRes.doc);
                console.log('[YJS-DIAG] [OPEN] Aplicando estado SQLite al editor y al proveedor', { bytes: fullState.byteLength });
                yjsProviderRef.current?.applyInitialDoc(localRes.doc);
                yjsEditorRef.current?.applyRemoteUpdate(bytesToBase64(fullState), 'remote-replay-load');
            } else {
                console.log('[YJS-DIAG] [OPEN] SQLite local no contiene deltas ni snapshot');
                const initialIds = pages.map(p => p.id).filter(Boolean);
                yjsProviderRef.current?.initializePageOrderIfEmpty(initialIds);
            }
        }).catch(err => {
            if (!isComponentMountedRef.current) return;
            console.warn('[YJS-DIAG] [OPEN] Error cargando estado inicial de SQLite:', err);
        });

        // 2. Recuperar deltas remotos acumulados
        if (yjsProviderRef.current) {
            console.log('[YJS-DIAG] [OPEN] 2. Solicitando catchUpRemoteUpdates()...');
            yjsProviderRef.current.catchUpRemoteUpdates().then(res => {
                if (!isComponentMountedRef.current) return;
                console.log('[YJS-DIAG] [OPEN] catchUpRemoteUpdates completado:', res);
            }).catch((err) => {
                if (!isComponentMountedRef.current) return;
                console.warn('[YJS-DIAG] [OPEN] Error en catchUpRemoteUpdates:', err);
            });
            const status = yjsProviderRef.current.getStatus();
            if (status === 'CONNECTED' || status === 'SYNCED') {
                yjsEditorRef.current?.requestSyncStep1();
                yjsEditorRef.current?.broadcastAwareness();
            }
        }

        yjsEditorRef.current?.setCursorVisible(isEditMode && effectiveCanEdit);
    }, [localPersistence, id, isEditMode, effectiveCanEdit]);

    const handleYjsUpdate = useCallback((base64Update: string) => {
        // Si la persistencia local no está verificada, no emitir ni difundir
        if (isYjsPersistenceReady === false) return;
        yjsProviderRef.current?.sendUpdate(base64Update).catch(err => {
            console.warn('[Notes Yjs] Error enviando actualización Yjs:', err);
        });
    }, [isYjsPersistenceReady]);

    const handleYjsAwarenessUpdate = useCallback((base64Awareness: string) => {
        yjsProviderRef.current?.sendAwareness(base64Awareness);
    }, []);

    const handleYjsSyncStep1 = useCallback((base64Sv: string, correlationId?: string | null, isReturnHandshake?: boolean) => {
        yjsProviderRef.current?.sendSyncStep1(base64Sv, Boolean(isReturnHandshake), correlationId);
    }, []);

    const handleYjsSyncStep2 = useCallback((base64Update: string, correlationId?: string | null) => {
        yjsProviderRef.current?.sendSyncStep2(base64Update, correlationId);
    }, []);

    const handleYjsApplyUpdateAck = useCallback((success: boolean) => {
        if (success) {
            yjsProviderRef.current?.setSynced();
        }
    }, []);

    // Saltar a la página especificada en los parámetros de navegación (ej: desde búsqueda global)
    useEffect(() => {
        if (pageIndex !== undefined && pageIndex !== null) {
            const pIdx = parseInt(pageIndex, 10);
            if (!isNaN(pIdx) && pIdx >= 0 && pIdx < pages.length) {
                setCurrentPageIndex(pIdx);
            }
        }
    }, [pageIndex, pages.length, setCurrentPageIndex]);

    // Si el acceso a la nota fue revocado por el propietario
    useEffect(() => {
        if (isRevoked || !hasAccess) {
            Keyboard.dismiss();
            setIsEditMode(false);
            Alert.alert(
                t('collaboration.access_revoked_title', { defaultValue: 'Acceso bloqueado' }),
                t('collaboration.access_revoked_desc', { defaultValue: 'El propietario ha retirado tu acceso a esta nota. Ya no puedes acceder a su contenido.' }),
                [
                    {
                        text: t('common.accept', { defaultValue: 'Entendido' }),
                        onPress: () => {
                            router.replace('/notes');
                        },
                    },
                ],
                { cancelable: false }
            );
        }
    }, [isRevoked, hasAccess]);

    const [showSyncNotice, setShowSyncNotice] = useState(false);
    const syncNoticeAnim = useRef(new Animated.Value(0)).current;
    const syncNoticeTimeoutRef = useRef<any>(null);

    // Si los permisos se actualizan en tiempo real a solo lectura, salir del modo edición inmediatamente
    useEffect(() => {
        if (!canEdit && !isRevoked) {
            Keyboard.dismiss();
            editorRefs.current.forEach(ed => {
                try {
                    ed?.blurContentEditor?.();
                    ed?.injectJavaScript?.(`
                        (function() {
                            var ed = document.querySelector('.pell-content') || document.getElementById('content') || document.getElementById('editor') || document.body;
                            if (ed) {
                                ed.setAttribute('contenteditable', 'false');
                                ed.blur();
                            }
                            if (document.activeElement && document.activeElement.blur) {
                                document.activeElement.blur();
                            }
                        })();
                        true;
                    `);
                } catch (e) { }
            });
            if (isEditMode) {
                handleExitEditMode();
                Alert.alert(
                    t('collaboration.view_only_title', { defaultValue: 'Solo lectura' }),
                    t('collaboration.view_only_desc', { defaultValue: 'Tus permisos han sido actualizados a solo lectura por el propietario.' })
                );
            }
        }
    }, [canEdit, isEditMode, isRevoked]);

    useEffect(() => {
        if (!remoteSyncNotice) return;
        setShowSyncNotice(true);
        Animated.timing(syncNoticeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();

        if (syncNoticeTimeoutRef.current) {
            clearTimeout(syncNoticeTimeoutRef.current);
        }

        syncNoticeTimeoutRef.current = setTimeout(() => {
            Animated.timing(syncNoticeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
                setShowSyncNotice(false);
            });
        }, 2200);

        return () => {
            if (syncNoticeTimeoutRef.current) clearTimeout(syncNoticeTimeoutRef.current);
        };
    }, [remoteSyncNotice]);

    const currentFolder = folders.find(f => f.id === folderId);
    const linkedEvent = events.find(e => e.id === eventId || (Boolean(folderId) && e.folder_id === folderId));

    const activeEditorRef = {
        current: editorRefs.current[currentPageIndex] || editorRefs.current[0] || null,
    };

    useFocusEffect(
        React.useCallback(() => {
            isExiting.current = false;
            headerAnim.setValue(1);
            titleAnim.setValue(1);
            bodyAnim.setValue(1);

            // Refrescar notas del almacenamiento local únicamente al ganar foco la pantalla
            useNotesStore.getState().loadNotes().catch(() => { });
        }, [])
    );

    useFocusEffect(
        React.useCallback(() => {
            const onHardwareBack = () => {
                if (imageCoords) {
                    setImageCoords(null);
                    return true;
                }
                if (youtubeCoords) {
                    setYoutubeCoords(null);
                    return true;
                }
                if (isImageViewerVisible) {
                    setIsImageViewerVisible(false);
                    return true;
                }
                if (isOptionsMenuVisible) {
                    setIsOptionsMenuVisible(false);
                    return true;
                }
                if (isFontModalVisible) {
                    setIsFontModalVisible(false);
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
        }, [isEditMode, isOptionsMenuVisible, isFontModalVisible, isPagesModalVisible, isCropperVisible, alertVisible, imageCoords, youtubeCoords, isImageViewerVisible])
    );

    const editModeAnim = useRef(new Animated.Value(isCreating ? 1 : 0)).current;

    const handleEnterEditMode = () => {
        if (!canEdit) {
            Alert.alert(
                t('collaboration.view_only', { defaultValue: 'Solo lectura' }),
                t('collaboration.view_only_desc', { defaultValue: 'Tienes permisos de solo lectura en esta nota.' })
            );
            return;
        }
        if (isYjsMode && isYjsPersistenceReady !== true) {
            Alert.alert(
                t('collaboration.persistence_unavailable_title', { defaultValue: 'Persistencia no disponible' }),
                t('collaboration.persistence_unavailable_desc', { defaultValue: 'La persistencia local SQLite requerida para notas colaborativas no está disponible. No es seguro editar sin persistencia local.' })
            );
            return;
        }
        setIsEditMode(true);
        setTimeout(() => {
            yjsEditorRef.current?.setCursorVisible(true);
        }, 50);
        Animated.spring(editModeAnim, {
            toValue: 1,
            tension: 65,
            friction: 8,
            useNativeDriver: true,
        }).start();
    };

    const handleExitEditMode = async () => {
        setIsEditMode(false);
        Keyboard.dismiss();
        if (!isYjsMode) {
            editorRefs.current.forEach(ed => {
                try {
                    ed?.blurContentEditor?.();
                    ed?.injectJavaScript?.(`
                        (function() {
                            var ed = document.querySelector('.pell-content') || document.getElementById('content') || document.getElementById('editor') || document.body;
                            if (ed) {
                                ed.setAttribute('contenteditable', 'false');
                                ed.blur();
                            }
                            if (document.activeElement && document.activeElement.blur) {
                                document.activeElement.blur();
                            }
                        })();
                        true;
                    `);
                } catch (e) { }
            });
        }
        await saveSilently();
        Animated.timing(editModeAnim, {
            toValue: 0,
            duration: 160,
            useNativeDriver: true,
        }).start();
    };

    const handleInsertImage = async (useCamera: boolean) => {
        setIsEditingExistingImage(false);
        const pickedUri = await pickImage(useCamera);
        if (!pickedUri) return;

        if (isYjsMode) {
            setCropperUri(pickedUri);
            setIsCropperVisible(true);
            return;
        }

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
            await exportNoteToPdf(title, pages, { fontFamily });
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

    const handleApplyFontToSelection = useCallback((fontName: string) => {
        if (isYjsMode) {
            yjsEditorRef.current?.setFont(fontName);
            return;
        }
        const editor = editorRefs.current[currentPageIndex] || editorRefs.current[0] || null;
        if (!editor) return;
        try {
            editor.injectJavaScript?.(`
                (function() {
                    if (typeof window.__veyraApplyFont === 'function') {
                        window.__veyraApplyFont("${fontName.replace(/"/g, '\\"')}");
                    } else {
                        document.execCommand('fontName', false, "${fontName.replace(/"/g, '\\"')}");
                    }
                })();
                true;
            `);
        } catch { }
        editor.sendAction(actions.fontName, 'result', fontName);
    }, [isYjsMode, currentPageIndex, editorRefs]);

    const handleBack = async () => {
        if (isEditMode) {
            await handleExitEditMode();
        } else {
            if (isExiting.current) return;
            isExiting.current = true;
            await saveSilently();
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
        const rawUri = item?.uri || (typeof item === 'string' ? item : '');
        if (!rawUri || typeof rawUri !== 'string') return false;
        const uri = rawUri.toLowerCase();
        return (
            uri.includes('imagepicker') ||
            uri.endsWith('.jpg') ||
            uri.endsWith('.png') ||
            uri.endsWith('.jpeg') ||
            uri.endsWith('.webp') ||
            uri.startsWith('data:image')
        );
    });

    const otherAttachments = attachments.filter(item => {
        if (!item) return false;
        const rawUri = item?.uri || (typeof item === 'string' ? item : '');
        if (!rawUri) return false;
        return !imageAttachments.includes(item);
    });
    const pageLayoutsRef = useRef<{ [index: number]: number }>({});
    const lastCursorY = useRef<number>(0);

    const handleCursorPosition = useCallback((pageIndex: number, offsetY: number) => {
        const pageY = pageLayoutsRef.current[pageIndex] || 0;
        const cursorY = pageY + offsetY;
        lastCursorY.current = cursorY;

        if (scrollLayout === 'vertical' && verticalScrollRef.current) {
            const currentY = currentScrollY.current;
            const visibleHeight = windowHeight - (60 + toolbarHeight + (isKeyboardVisible ? lift : 0));
            // Si el cursor se encuentra por debajo de la zona visible o por encima de ella, scrollear suavemente
            if (cursorY > currentY + visibleHeight - 40 || cursorY < currentY + 30) {
                const targetY = Math.max(0, cursorY - 100);
                verticalScrollRef.current.scrollTo({ y: targetY, animated: true });
            }
        }
    }, [scrollLayout, windowHeight, toolbarHeight, isKeyboardVisible, lift]);

    // Cuando el teclado se despliega por primera vez, asegurar que la posición actual del cursor esté a la vista
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

    const handleAddPage = useCallback(() => {
        if (!effectiveCanEdit) return;
        if (isYjsMode && yjsProviderRef.current) {
            const newPageId = `page_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
            yjsProviderRef.current.addPage(newPageId);
            setCurrentPageIndex(pages.length);
        } else {
            addPage();
        }
    }, [effectiveCanEdit, isYjsMode, pages.length, addPage, setCurrentPageIndex]);

    const handleDeletePage = useCallback((index: number) => {
        if (!effectiveCanEdit) return;
        if (isYjsMode && yjsProviderRef.current) {
            if (pages.length <= 1) return;
            const target = pages[index];
            if (target?.id) {
                yjsProviderRef.current.removePage(target.id);
                const nextIndex = Math.min(currentPageIndex, pages.length - 2);
                setCurrentPageIndex(Math.max(0, nextIndex));
            }
        } else {
            deletePage(index);
        }
    }, [effectiveCanEdit, isYjsMode, pages, currentPageIndex, deletePage, setCurrentPageIndex]);

    const handleReorderPages = useCallback((fromIndex: number, toIndex: number) => {
        if (!effectiveCanEdit) return;
        if (isYjsMode && yjsProviderRef.current) {
            yjsProviderRef.current.movePage(fromIndex, toIndex);
            let nextIndex = currentPageIndex;
            if (nextIndex === fromIndex) nextIndex = toIndex;
            else if (fromIndex < nextIndex && toIndex >= nextIndex) nextIndex = nextIndex - 1;
            else if (fromIndex > nextIndex && toIndex <= nextIndex) nextIndex = nextIndex + 1;
            setCurrentPageIndex(nextIndex);
        } else {
            reorderPages(fromIndex, toIndex);
        }
    }, [effectiveCanEdit, isYjsMode, currentPageIndex, reorderPages, setCurrentPageIndex]);

    const [isActivatingPilot, setIsActivatingPilot] = useState(false);

    const handlePromptActivatePilot = useCallback(() => {
        if (!id || id === 'create' || !currentNote) {
            Alert.alert(
                t('common.error', { defaultValue: 'Error' }),
                'No se puede activar una nota que aún no ha sido creada o guardada en base de datos.'
            );
            return;
        }

        if (currentNote.sync_mode === 'yjs') {
            Alert.alert(
                'Nota ya en modo Yjs',
                'Esta nota ya se encuentra activada en modo colaborativo Yjs.'
            );
            return;
        }

        if (!isOwner) {
            Alert.alert(
                'Permiso denegado',
                'Solo el propietario legítimo de la nota puede activar el modo piloto Yjs.'
            );
            return;
        }

        Alert.alert(
            'Confirmar activación de nota piloto Yjs',
            `¿Deseas activar esta nota en modo colaborativo Yjs?\n\n• Título: "${currentNote.title || 'Sin título'}"\n• ID: ${currentNote.id}\n• Modo actual: ${currentNote.sync_mode || 'rest'}\n\nSe usará tu sesión autenticada para invocar la RPC 'activate_note_yjs_mode' con los hashes calculados de su contenido. Ninguna otra nota será modificada.`,
            [
                {
                    text: t('common.cancel', { defaultValue: 'Cancelar' }),
                    style: 'cancel',
                },
                {
                    text: 'Activar piloto',
                    style: 'default',
                    onPress: async () => {
                        try {
                            setIsActivatingPilot(true);
                            // 1. Obtener la sesión autenticada activa
                            const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
                            const currentUserId = sessionData?.session?.user?.id;
                            if (sessionErr || !currentUserId) {
                                Alert.alert('Error de sesión', 'No hay una sesión activa de Supabase. Inicia sesión con la cuenta propietaria para activar la nota.');
                                return;
                            }

                            // 2. Verificar que la nota exista y esté sincronizada en Supabase
                            const { data: remoteNote, error: remoteErr } = await supabase
                                .from('notes')
                                .select('id, user_id, title, content, updated_at_ms, last_modified_ms, sync_mode, deleted')
                                .eq('id', currentNote.id)
                                .maybeSingle();

                            if (remoteErr || !remoteNote) {
                                Alert.alert(
                                    'Nota remota no encontrada',
                                    `La nota aún no existe en Supabase o no ha sido sincronizada. Guarda o sincroniza la nota antes de activar.\n\nDetalle: ${remoteErr?.message || 'No encontrada'}`
                                );
                                return;
                            }

                            if (remoteNote.sync_mode === 'yjs') {
                                await NoteService.setNoteSyncMode(currentNote.id, 'yjs');
                                await useNotesStore.getState().updateNote(currentNote.id, { sync_mode: 'yjs' });
                                Alert.alert('Nota ya activada', 'La nota ya fue activada remotamente en Supabase. El estado local ha sido actualizado a Yjs.');
                                return;
                            }

                            // 3. Preparar e invocar la RPC con executePilotActivation
                            const targetLocalPersistence = new YjsLocalPersistence({
                                execAsync: async (sql) => withDB(db => db.execAsync(sql)),
                                runAsync: async (sql, params) => withDB(db => db.runAsync(sql, params)),
                                getAllAsync: async (sql, params) => withDB(db => db.getAllAsync(sql, params)),
                                getFirstAsync: async (sql, params) => withDB(db => db.getFirstAsync(sql, params)),
                                withTransactionAsync: async (action) => withDB(db => withSerializedTransaction(db, action)),
                            });
                            const noteToActivate: Note = {
                                ...currentNote,
                                content: remoteNote.content ?? currentNote.content,
                                updated_at_ms: remoteNote.updated_at_ms ?? currentNote.updated_at_ms,
                                last_modified_ms: remoteNote.last_modified_ms ?? currentNote.last_modified_ms,
                            };

                            const result = await executePilotActivation(
                                supabase,
                                targetLocalPersistence,
                                noteToActivate,
                                currentUserId,
                                async (noteId) => {
                                    await NoteService.setNoteSyncMode(noteId, 'yjs');
                                    await useNotesStore.getState().updateNote(noteId, { sync_mode: 'yjs' });
                                }
                            );

                            if (result.success) {
                                Alert.alert(
                                    'Activación piloto exitosa',
                                    `La nota piloto ha sido activada en modo Yjs correctamente.\n\n• ID: ${result.noteId}\n• Modo: ${result.syncMode}\n• Update ID: ${result.initialUpdateId}\n• Timestamp: ${result.updatedAtMs}\n\nEl editor colaborativo Yjs se cargará inmediatamente.`
                                );
                            } else {
                                Alert.alert(
                                    'Fallo en la activación piloto',
                                    `La RPC retornó el siguiente resultado o error:\n\n${result.error || 'Error desconocido'}`
                                );
                            }
                        } catch (err: any) {
                            Alert.alert('Excepción durante la activación', err?.message || 'Error inesperado');
                        } finally {
                            setIsActivatingPilot(false);
                        }
                    },
                },
            ]
        );
    }, [id, currentNote, isOwner, t]);

    const renderYjsEditor = () => {
        return (
            <View style={{ flex: 1, paddingHorizontal: 0 }}>
                {/* Título en la parte superior */}
                <Animated.View
                    style={{
                        opacity: titleAnim,
                        marginBottom: 10,
                        marginTop: 14,
                        paddingHorizontal: 18,
                    }}
                >
                    {isEditMode && effectiveCanEdit ? (
                        <TitleInput
                            title={title}
                            setTitle={setTitle}
                            isEditing={true}
                            flat={true}
                            placeholder={t('notes.placeholder_title', { defaultValue: 'Título' })}
                            inputStyle={[styles.viewTitle, { color: colors.textPrimary, fontSize: typography.h1.fontSize }]}
                        />
                    ) : (
                        <Text style={[styles.viewTitle, { color: colors.textPrimary, fontSize: typography.h1.fontSize }]}>
                            {title || t('notes.no_title', { defaultValue: 'Sin título' })}
                        </Text>
                    )}
                </Animated.View>

                {/* Aviso si la persistencia SQLite no está lista */}
                {isYjsPersistenceReady === false && (
                    <View
                        style={{
                            marginHorizontal: 16,
                            padding: 12,
                            borderRadius: 12,
                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                            borderWidth: 1,
                            borderColor: '#EF4444',
                            marginBottom: 12,
                        }}
                    >
                        <Text style={{ color: isDark ? '#FCA5A5' : '#B91C1C', fontSize: 13, fontWeight: '600' }}>
                            {yjsPersistenceError || t('collaboration.persistence_blocked', { defaultValue: 'Persistencia local SQLite no disponible. La edición colaborativa está bloqueada para proteger la integridad de la nota.' })}
                        </Text>
                    </View>
                )}

                {/* Editor Tiptap / Yjs empaquetado (Navegación mediante píldora flotante) */}
                <View style={{ flex: 1, position: 'relative' }}>
                    {/* Editor real debajo con swap instantáneo */}
                    <Animated.View
                        style={[
                            StyleSheet.absoluteFill,
                            { opacity: showCached ? editorOpacityAnim : 1, zIndex: showCached ? -1 : 1 },
                        ]}
                        pointerEvents={showCached ? 'none' : 'auto'}
                    >
                        <VeyraTiptapYjsEditor
                            ref={yjsEditorRef}
                            isDark={isDark}
                            isAmoled={isAmoled}
                            accentColor={accent.primary}
                            userId={authUserId || currentUserId || undefined}
                            userName={effectiveUserName}
                            userColor={effectiveUserColor}
                            activePageId={pages[currentPageIndex]?.id || (pages.length > 0 ? pages[0].id : undefined)}
                            isEditing={isEditMode && effectiveCanEdit}
                            showSkeleton={showCached}
                            onYjsUpdate={handleYjsUpdate}
                            onAwarenessUpdate={handleYjsAwarenessUpdate}
                            onSyncStep1={handleYjsSyncStep1}
                            onSyncStep2={handleYjsSyncStep2}
                            onToolbarStateChange={setYjsToolbarState}
                            onApplyUpdateAck={handleYjsApplyUpdateAck}
                            onReady={handleYjsReady}
                            onAwarenessPeersChanged={setYjsActivePeers}
                            onPreviewUpdate={handlePreviewUpdate}
                            onActivitySnippet={handleActivitySnippetHtml}
                            onActivitySnippetHtml={handleActivitySnippetHtml}
                            onContentRendered={() => setContentRendered(true)}
                            onImageClicked={handleImageClicked}
                            onImageDismissed={handleImageDismissed}
                            onYoutubeClicked={handleYoutubeClicked}
                            onYoutubeDismissed={handleYoutubeDismissed}
                        />
                    </Animated.View>

                    {/* Tooltip flotante de opciones de imagen (elegante como el de selección de texto) */}
                    {imageCoords && !showCached && (() => {
                        const isGif = Boolean(imageCoords.url?.toLowerCase().endsWith('.gif'));
                        const canEdit = Boolean(isEditMode && effectiveCanEdit);
                        const menuWidth = canEdit ? Math.min(windowWidth - 24, 340) : 112;
                        const currentImgWidth = imageCoords.attrs?.width || null;
                        const currentImgAlign = imageCoords.attrs?.textAlign || 'center';
                        return (
                        <Animated.View
                            style={[
                                styles.floatingSelectionMenu,
                                {
                                    backgroundColor: isDark ? (isAmoled ? 'rgba(18, 18, 18, 0.96)' : 'rgba(28, 28, 30, 0.96)') : 'rgba(255, 255, 255, 0.96)',
                                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
                                    top: imageCoords.y > 54 ? imageCoords.y - 48 : imageCoords.y + imageCoords.h + 8,
                                    left: Math.max(12, Math.min(windowWidth - menuWidth - 12, imageCoords.x - (menuWidth / 2))),
                                    maxWidth: canEdit ? windowWidth - 24 : menuWidth,
                                    paddingHorizontal: 0,
                                    opacity: imageTooltipAnim,
                                    transform: [
                                        {
                                            scale: imageTooltipAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [0.85, 1],
                                            }),
                                        },
                                    ],
                                },
                            ]}
                        >
                            {canEdit ? (
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    style={{ flexGrow: 0 }}
                                    contentContainerStyle={{
                                        paddingHorizontal: 12,
                                        gap: 8,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                    }}
                                >
                                    <TouchableOpacity
                                        style={[
                                            styles.imageTooltipPillBtn,
                                            currentImgWidth === 25 && { backgroundColor: accent.primary }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setImageSize(25);
                                            setImageCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, width: 25 } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.imageTooltipBtnText, { color: currentImgWidth === 25 ? '#FFFFFF' : (isDark ? '#E4E4E7' : '#27272A') }]}>
                                            25%
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.imageTooltipPillBtn,
                                            currentImgWidth === 50 && { backgroundColor: accent.primary }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setImageSize(50);
                                            setImageCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, width: 50 } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.imageTooltipBtnText, { color: currentImgWidth === 50 ? '#FFFFFF' : (isDark ? '#E4E4E7' : '#27272A') }]}>
                                            50%
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.imageTooltipPillBtn,
                                            currentImgWidth === 75 && { backgroundColor: accent.primary }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setImageSize(75);
                                            setImageCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, width: 75 } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.imageTooltipBtnText, { color: currentImgWidth === 75 ? '#FFFFFF' : (isDark ? '#E4E4E7' : '#27272A') }]}>
                                            75%
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.imageTooltipPillBtn,
                                            currentImgWidth === 100 && { backgroundColor: accent.primary }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setImageSize(100);
                                            setImageCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, width: 100 } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.imageTooltipBtnText, { color: currentImgWidth === 100 ? '#FFFFFF' : (isDark ? '#E4E4E7' : '#27272A') }]}>
                                            100%
                                        </Text>
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />

                                    <TouchableOpacity
                                        style={[
                                            styles.floatingMenuBtn,
                                            currentImgAlign === 'left' && { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)' }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setImageAlign('left');
                                            setImageCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, textAlign: 'left' } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <AlignLeft size={16} color={currentImgAlign === 'left' ? accent.primary : (isDark ? '#E4E4E7' : '#27272A')} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.floatingMenuBtn,
                                            currentImgAlign === 'center' && { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)' }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setImageAlign('center');
                                            setImageCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, textAlign: 'center' } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <AlignCenter size={16} color={currentImgAlign === 'center' ? accent.primary : (isDark ? '#E4E4E7' : '#27272A')} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.floatingMenuBtn,
                                            currentImgAlign === 'right' && { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)' }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setImageAlign('right');
                                            setImageCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, textAlign: 'right' } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <AlignRight size={16} color={currentImgAlign === 'right' ? accent.primary : (isDark ? '#E4E4E7' : '#27272A')} />
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />

                                    {/* Botón Caption (Pie de foto) */}
                                    <TouchableOpacity
                                        style={styles.floatingMenuBtn}
                                        onPress={() => {
                                            yjsEditorRef.current?.toggleCaption ? yjsEditorRef.current.toggleCaption() : yjsEditorRef.current?.injectJS?.('window.veyraToggleCaption && window.veyraToggleCaption()');
                                            setImageCoords(null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <MessageSquare size={16} color={isDark ? '#E4E4E7' : '#27272A'} />
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />

                                    {/* Botón Replace (Reemplazar imagen) */}
                                    <TouchableOpacity
                                        style={styles.floatingMenuBtn}
                                        onPress={async () => {
                                            try {
                                                const result = await ImagePicker.launchImageLibraryAsync({
                                                    mediaTypes: ['images'],
                                                    quality: 1,
                                                });
                                                if (result.canceled || !result.assets || !result.assets[0]) return;
                                                const asset = result.assets[0];
                                                const currentImageUrl = imageCoords.url;
                                                setImageCoords(null);

                                                const userId = currentUserId || useStore.getState().session?.user?.id || 'anonymous';
                                                const ext = asset.uri.split('.').pop() || 'webp';
                                                const fileName = `replaced_${Date.now()}.${ext}`;
                                                const remotePath = await StorageService.uploadFile(userId, asset.uri, fileName);
                                                if (remotePath) {
                                                    const { data: publicUrlData } = supabase.storage
                                                        .from('attachments')
                                                        .getPublicUrl(remotePath);
                                                    const newUrl = publicUrlData?.publicUrl;
                                                    if (newUrl) {
                                                        yjsEditorRef.current?.replaceImageSrc(currentImageUrl, newUrl);
                                                        if (currentImageUrl && currentImageUrl.includes('attachments')) {
                                                            StorageService.deleteFile(currentImageUrl).catch(e => console.warn('[Mobile] Error eliminando imagen antigua tras replace:', e));
                                                        }
                                                    }
                                                }
                                            } catch (err) {
                                                console.warn('[Mobile] Error en reemplazo de imagen:', err);
                                            }
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Replace size={16} color={isDark ? '#E4E4E7' : '#27272A'} />
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />

                                    {/* Botón Download (Descargar y compartir imagen) */}
                                    <TouchableOpacity
                                        style={styles.floatingMenuBtn}
                                        onPress={async () => {
                                            try {
                                                const currentImageUrl = imageCoords.url;
                                                setImageCoords(null);
                                                const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
                                                const fileUri = dir + 'image_' + Date.now() + '.webp';
                                                await FileSystem.downloadAsync(currentImageUrl, fileUri);
                                                await Sharing.shareAsync(fileUri, { mimeType: 'image/webp' });
                                            } catch (err) {
                                                console.warn('[Mobile] Error descargando imagen:', err);
                                            }
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Download size={16} color={isDark ? '#E4E4E7' : '#27272A'} />
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />

                                    <TouchableOpacity
                                        style={styles.floatingMenuBtn}
                                        onPress={() => {
                                            const oldUrl = imageCoords.url;
                                            yjsEditorRef.current?.deleteImage();
                                            setImageCoords(null);
                                            if (oldUrl && oldUrl.includes('attachments')) {
                                                StorageService.deleteFile(oldUrl).catch(e => console.warn('[Mobile] Error eliminando imagen de storage:', e));
                                            }
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Trash2 size={16} color="#EF4444" />
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />

                                    <TouchableOpacity
                                        style={styles.floatingMenuBtn}
                                        onPress={() => {
                                            setSelectedImageUrl(imageCoords.url);
                                            setImageCoords(null);
                                            setTimeout(() => {
                                                setIsImageViewerVisible(true);
                                            }, 80);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Eye size={16} color={accent.primary} />
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />
                                    <TouchableOpacity
                                        style={styles.floatingMenuBtn}
                                        onPress={() => setImageCoords(null)}
                                        activeOpacity={0.7}
                                    >
                                        <X size={16} color={isDark ? '#A1A1AA' : '#71717A'} />
                                    </TouchableOpacity>
                                </ScrollView>
                            ) : (
                                <View
                                    style={{
                                        paddingHorizontal: 8,
                                        gap: 6,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                    }}
                                >
                                    <TouchableOpacity
                                        style={styles.floatingMenuBtn}
                                        onPress={() => {
                                            setSelectedImageUrl(imageCoords.url);
                                            setImageCoords(null);
                                            setTimeout(() => {
                                                setIsImageViewerVisible(true);
                                            }, 80);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Eye size={16} color={accent.primary} />
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />
                                    <TouchableOpacity
                                        style={styles.floatingMenuBtn}
                                        onPress={() => setImageCoords(null)}
                                        activeOpacity={0.7}
                                    >
                                        <X size={16} color={isDark ? '#A1A1AA' : '#71717A'} />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </Animated.View>
                        );
                    })()}

                    {/* Tooltip flotante de opciones de video de YouTube (Modo Edición) */}
                    {youtubeCoords && !showCached && isEditMode && effectiveCanEdit && (() => {
                        const menuWidth = Math.min(windowWidth - 24, 380);
                        const isEmbed = youtubeCoords.attrs?.embed !== false;
                        const currentYtWidth = youtubeCoords.attrs?.width || null;
                        const currentYtAlign = youtubeCoords.attrs?.textAlign || 'center';
                        return (
                            <Animated.View
                                style={[
                                    styles.floatingSelectionMenu,
                                    {
                                        backgroundColor: isDark ? (isAmoled ? 'rgba(18, 18, 18, 0.96)' : 'rgba(28, 28, 30, 0.96)') : 'rgba(255, 255, 255, 0.96)',
                                        borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
                                        top: youtubeCoords.y > 54 ? youtubeCoords.y - 48 : youtubeCoords.y + youtubeCoords.h + 8,
                                        left: Math.max(12, Math.min(windowWidth - menuWidth - 12, youtubeCoords.x - (menuWidth / 2))),
                                        maxWidth: windowWidth - 24,
                                        paddingHorizontal: 0,
                                        opacity: youtubeTooltipAnim,
                                        transform: [
                                            {
                                                scale: youtubeTooltipAnim.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [0.85, 1],
                                                }),
                                            },
                                        ],
                                    },
                                ]}
                            >
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    style={{ flexGrow: 0 }}
                                    contentContainerStyle={{
                                        paddingHorizontal: 12,
                                        gap: 8,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                    }}
                                >
                                    {/* Presets de tamaño */}
                                    <TouchableOpacity
                                        style={[
                                            styles.imageTooltipPillBtn,
                                            currentYtWidth === 50 && { backgroundColor: accent.primary }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setYoutubeSize(50);
                                            setYoutubeCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, width: 50 } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.imageTooltipBtnText, { color: currentYtWidth === 50 ? '#FFFFFF' : (isDark ? '#E4E4E7' : '#27272A') }]}>
                                            50%
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.imageTooltipPillBtn,
                                            currentYtWidth === 75 && { backgroundColor: accent.primary }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setYoutubeSize(75);
                                            setYoutubeCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, width: 75 } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.imageTooltipBtnText, { color: currentYtWidth === 75 ? '#FFFFFF' : (isDark ? '#E4E4E7' : '#27272A') }]}>
                                            75%
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.imageTooltipPillBtn,
                                            currentYtWidth === 100 && { backgroundColor: accent.primary }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setYoutubeSize(100);
                                            setYoutubeCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, width: 100 } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.imageTooltipBtnText, { color: currentYtWidth === 100 ? '#FFFFFF' : (isDark ? '#E4E4E7' : '#27272A') }]}>
                                            100%
                                        </Text>
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />

                                    {/* Alineación */}
                                    <TouchableOpacity
                                        style={[
                                            styles.floatingMenuBtn,
                                            currentYtAlign === 'left' && { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)' }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setYoutubeAlign('left');
                                            setYoutubeCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, textAlign: 'left' } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <AlignLeft size={16} color={currentYtAlign === 'left' ? accent.primary : (isDark ? '#E4E4E7' : '#27272A')} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.floatingMenuBtn,
                                            currentYtAlign === 'center' && { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)' }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setYoutubeAlign('center');
                                            setYoutubeCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, textAlign: 'center' } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <AlignCenter size={16} color={currentYtAlign === 'center' ? accent.primary : (isDark ? '#E4E4E7' : '#27272A')} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.floatingMenuBtn,
                                            currentYtAlign === 'right' && { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)' }
                                        ]}
                                        onPress={() => {
                                            yjsEditorRef.current?.setYoutubeAlign('right');
                                            setYoutubeCoords(prev => prev ? { ...prev, attrs: { ...prev.attrs, textAlign: 'right' } } : null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <AlignRight size={16} color={currentYtAlign === 'right' ? accent.primary : (isDark ? '#E4E4E7' : '#27272A')} />
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />

                                    {/* Botón Reproducir */}
                                    <TouchableOpacity
                                        style={styles.floatingMenuBtn}
                                        onPress={() => {
                                            yjsEditorRef.current?.playYoutube();
                                            setYoutubeCoords(null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Play size={16} color={accent.primary} />
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />

                                    {/* Botón Convertir Enlace / Modo Embed */}
                                    <TouchableOpacity
                                        style={styles.floatingMenuBtn}
                                        onPress={() => {
                                            yjsEditorRef.current?.toggleYoutubeEmbed();
                                            setYoutubeCoords(null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        {isEmbed ? (
                                            <LinkIcon size={16} color={isDark ? '#E4E4E7' : '#27272A'} />
                                        ) : (
                                            <Video size={16} color={isDark ? '#E4E4E7' : '#27272A'} />
                                        )}
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />

                                    {/* Botón Eliminar */}
                                    <TouchableOpacity
                                        style={styles.floatingMenuBtn}
                                        onPress={() => {
                                            yjsEditorRef.current?.deleteYoutube();
                                            setYoutubeCoords(null);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Trash2 size={16} color="#EF4444" />
                                    </TouchableOpacity>
                                    <View style={[styles.floatingMenuDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }]} />

                                    {/* Botón Cerrar Menú */}
                                    <TouchableOpacity
                                        style={styles.floatingMenuBtn}
                                        onPress={() => setYoutubeCoords(null)}
                                        activeOpacity={0.7}
                                    >
                                        <X size={16} color={isDark ? '#A1A1AA' : '#71717A'} />
                                    </TouchableOpacity>
                                </ScrollView>
                            </Animated.View>
                        );
                    })()}

                    {/* Vista cacheada superpuesta durante la carga (Skeleton) */}
                    {showCached && (
                        <Animated.View
                            style={[
                                StyleSheet.absoluteFill,
                                { opacity: cachedOpacityAnim, zIndex: 10 },
                            ]}
                            pointerEvents="none"
                        >
                            <CachedNoteView
                                visible={showCached}
                                isDark={isDark}
                                isAmoled={isAmoled}
                            />
                        </Animated.View>
                    )}
                </View>
            </View>
        );
    };

    const renderVertical = () => {
        return (
            <ScrollView
                ref={verticalScrollRef}
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                alwaysBounceHorizontal={false}
                bounces={false}
                overScrollMode="never"
                contentContainerStyle={[styles.scrollContent, { paddingBottom: isEditMode ? insets.bottom + 110 : insets.bottom + 80 }]}
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
                    {isEditMode && canEdit ? (
                        <TitleInput
                            title={title}
                            setTitle={setTitle}
                            isEditing={true}
                            flat={true}
                            placeholder={t('notes.placeholder_title', { defaultValue: 'Título' })}
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
                                    {!isEditMode && !hasPageContent && (
                                        <Text style={[styles.emptyContentText, { color: colors.textMuted, position: 'absolute', top: 6, left: 4, zIndex: 10, pointerEvents: 'none' }]}>
                                            {t('notes.empty_page', { defaultValue: 'Hoja en blanco' })}
                                        </Text>
                                    )}
                                    <RichTextEditorSection
                                        description={pageContent}
                                        setDescription={html => updatePageContent(index, html)}
                                        readOnly={!isEditMode || !canEdit}
                                        isDark={isDark}
                                        isAmoled={isAmoled}
                                        fontFamily={fontFamily}
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
                                        onBlur={() => {
                                            setIsNotesFocused(false);
                                            broadcastCursorRemove(index);
                                        }}
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
                                        onCursorActivity={(cursor) => broadcastCursorMove(index, cursor)}
                                        onCursorRemove={() => broadcastCursorRemove(index)}
                                    />
                                </View>
                            </View>
                        );
                    })}

                    {/* Botón para Añadir Nueva Hoja — Solo en modo edición */}
                    {isEditMode && canEdit && (
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
                    {isEditMode && canEdit ? (
                        <TitleInput
                            title={title}
                            setTitle={setTitle}
                            isEditing={true}
                            flat={true}
                            placeholder={t('notes.placeholder_title', { defaultValue: 'Título' })}
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
                    scrollEnabled={pages.length > 1 && !isDraggingImage}
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
                                    keyboardShouldPersistTaps="always"
                                    keyboardDismissMode="none"
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
                                        {!isEditMode && !hasPageContent && (
                                            <Text style={[styles.emptyContentText, { color: colors.textMuted, position: 'absolute', top: 6, left: 4, zIndex: 10, pointerEvents: 'none' }]}>
                                                {t('notes.empty_page', { defaultValue: 'Hoja en blanco' })}
                                            </Text>
                                        )}
                                        <RichTextEditorSection
                                            description={pageContent}
                                            setDescription={html => updatePageContent(index, html)}
                                            readOnly={!isEditMode || !canEdit}
                                            isDark={isDark}
                                            isAmoled={isAmoled}
                                            fontFamily={fontFamily}
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
                                            onBlur={() => {
                                                setIsNotesFocused(false);
                                                broadcastCursorRemove(index);
                                            }}
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
                                            onCursorActivity={(cursor) => broadcastCursorMove(index, cursor)}
                                            onCursorRemove={() => broadcastCursorRemove(index)}
                                        />
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
        <Reanimated.View style={[{ flex: 1, backgroundColor: colors.bg }, screenAnimatedStyle]}>
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
                            {/* Colaboradores de la nota */}
                            {!isCreating && id && (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <CollaboratorsAvatars
                                        targetType="note"
                                        targetId={id}
                                        onPress={() => setIsShareModalVisible(true)}
                                        activePeers={isYjsMode ? editingPeers : undefined}
                                        currentUserId={currentUserId || authUserId || undefined}
                                    />
                                </View>
                            )}

                            {/* Breadcrumb Unificado en la Cabecera de la Nota */}
                            <NoteUnifiedBreadcrumb
                                folder={currentFolder}
                                event={linkedEvent}
                                allFolders={folders}
                                onFolderPress={(f) => navigateToFolderInNotes(f, folders)}
                                onParentFolderPress={(pf) => navigateToFolderInNotes(pf, folders)}
                                onEventPress={(ev) => router.push({ pathname: '/events/[id]', params: { id: ev.id } })}
                                onCategoryPress={() => {
                                    useStore.getState().setMainActiveTab('notes');
                                    router.push('/notes');
                                }}
                                onSelectFolderPress={() => setIsMoveModalVisible(true)}
                                onFolderLongPress={() => setIsMoveModalVisible(true)}
                            />

                            {isEditMode && (
                                <>
                                    <VeyraIconButton
                                        variant="ghost"
                                        size="sm"
                                        disabled={isYjsMode ? !yjsToolbarState.canUndo : !canUndo}
                                        style={{ opacity: (isYjsMode ? yjsToolbarState.canUndo : canUndo) ? 1 : 0.35 }}
                                        icon={<Undo2 size={18} color={((isYjsMode ? yjsToolbarState.canUndo : canUndo) ? colors.textPrimary : colors.textMuted) as any} />}
                                        onPress={isYjsMode ? () => yjsEditorRef.current?.undo() : undo}
                                    />
                                    <VeyraIconButton
                                        variant="ghost"
                                        size="sm"
                                        disabled={isYjsMode ? !yjsToolbarState.canRedo : !canRedo}
                                        style={{ opacity: (isYjsMode ? yjsToolbarState.canRedo : canRedo) ? 1 : 0.35 }}
                                        icon={<Redo2 size={18} color={((isYjsMode ? yjsToolbarState.canRedo : canRedo) ? colors.textPrimary : colors.textMuted) as any} />}
                                        onPress={isYjsMode ? () => yjsEditorRef.current?.redo() : redo}
                                    />
                                </>
                            )}

                            {!canEdit ? (
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 5,
                                        paddingHorizontal: 10,
                                        paddingVertical: 6,
                                        borderRadius: 14,
                                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                                        borderWidth: 1,
                                        borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                                    }}
                                >
                                    <Eye size={13} color={colors.textSecondary} />
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                                        {t('collaboration.viewer_badge', { defaultValue: 'Solo lectura' })}
                                    </Text>
                                </View>
                            ) : !isEditMode ? (
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



                    {/* Contenido Unificado — Selección mutuamente excluyente de editores */}
                    <View style={{ flex: 1 }}>
                        {isYjsMode ? renderYjsEditor() : (scrollLayout === 'vertical' || pages.length <= 1 ? renderVertical() : renderHorizontal())}

                        {/* Floating Page Switcher Pill — Para notas multipágina o modo edición */}
                        {(pages.length > 1 || (isEditMode && effectiveCanEdit)) && (
                            <View style={[styles.floatingPageBar, { bottom: floatingPillBottom }]}>
                                {pages.length > 1 && (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => setCurrentPageIndex(p => Math.max(0, p - 1))}
                                        disabled={currentPageIndex === 0}
                                        style={[
                                            styles.pageNavBtn,
                                            {
                                                backgroundColor: isDark ? (isAmoled ? 'rgba(18, 18, 18, 0.94)' : 'rgba(28, 31, 38, 0.94)') : 'rgba(255, 255, 255, 0.94)',
                                                borderColor: colors.borderSubtle,
                                                opacity: currentPageIndex === 0 ? 0.35 : 1,
                                            },
                                        ]}
                                    >
                                        <ChevronLeft size={16} color={colors.textPrimary} />
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => setIsPagesModalVisible(true)}
                                    style={[
                                        styles.pageIndicatorPill,
                                        {
                                            backgroundColor: isDark ? (isAmoled ? 'rgba(18, 18, 18, 0.94)' : 'rgba(28, 31, 38, 0.94)') : 'rgba(255, 255, 255, 0.94)',
                                            borderColor: colors.borderSubtle,
                                        },
                                    ]}
                                >
                                    <Layers size={13} color={accent.primary as any} />
                                    <Text style={[styles.pageIndicatorText, { color: colors.textPrimary }]}>
                                        {t('notes.page_indicator', {
                                            current: currentPageIndex + 1,
                                            total: pages.length,
                                            defaultValue: `Pág. ${currentPageIndex + 1} / ${pages.length}`,
                                        })}
                                    </Text>
                                </TouchableOpacity>

                                {pages.length > 1 && (
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => setCurrentPageIndex(p => Math.min(pages.length - 1, p + 1))}
                                        disabled={currentPageIndex === pages.length - 1}
                                        style={[
                                            styles.pageNavBtn,
                                            {
                                                backgroundColor: isDark ? (isAmoled ? 'rgba(18, 18, 18, 0.94)' : 'rgba(28, 31, 38, 0.94)') : 'rgba(255, 255, 255, 0.94)',
                                                borderColor: colors.borderSubtle,
                                                opacity: currentPageIndex === pages.length - 1 ? 0.35 : 1,
                                            },
                                        ]}
                                    >
                                        <ChevronRight size={16} color={colors.textPrimary} />
                                    </TouchableOpacity>
                                )}

                                {isEditMode && effectiveCanEdit && (
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
                                            onPress={handleAddPage}
                                            style={[
                                                styles.pageAddPill,
                                                {
                                                    backgroundColor: accent.primary,
                                                },
                                            ]}
                                        >
                                            <Plus size={15} color={colors.textInverse} strokeWidth={3} />
                                        </TouchableOpacity>
                                    </Animated.View>
                                )}
                            </View>
                        )}

                        {/* Toolbar anclada encima del teclado en modo edición */}
                        {isEditMode && effectiveCanEdit && (
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
                                    editorRef={isYjsMode ? yjsEditorRef : activeEditorRef}
                                    isNotesFocused={isNotesFocused}
                                    isDark={isDark}
                                    isAmoled={isAmoled}
                                    onPressCamera={() => handleInsertImage(true)}
                                    onPressGallery={() => handleInsertImage(false)}
                                    onPressDocument={pickDocument}
                                    onUndo={isYjsMode ? () => yjsEditorRef.current?.undo() : undo}
                                    onRedo={isYjsMode ? () => yjsEditorRef.current?.redo() : redo}
                                    canUndo={isYjsMode ? yjsToolbarState.canUndo : canUndo}
                                    canRedo={isYjsMode ? yjsToolbarState.canRedo : canRedo}
                                    onOpenNoteFontPicker={() => setIsFontModalVisible(true)}
                                    currentFontFamily={isYjsMode ? (yjsToolbarState.fontFamily || fontFamily) : fontFamily}
                                    onSelectFont={(fontId) => {
                                        setFontFamily(fontId);
                                        if (isYjsMode) {
                                            const opt = getFontOption(fontId);
                                            yjsEditorRef.current?.setFont(opt.fontName);
                                        }
                                    }}
                                    onApplyFontToSelection={handleApplyFontToSelection}
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
                                    if (isYjsMode) {
                                        let finalUrl: string | null = null;
                                        const netState = await NetInfo.fetch();
                                        const isOnline = Boolean(netState.isConnected && netState.isInternetReachable !== false);

                                        if (isOnline) {
                                            try {
                                                const userId = currentUserId || useStore.getState().session?.user?.id || 'anonymous';
                                                const fileName = `img_${Date.now()}.jpg`;
                                                const remotePath = await StorageService.uploadFile(userId, result.uri, fileName);
                                                if (remotePath) {
                                                    const { data: publicUrlData } = supabase.storage
                                                        .from('attachments')
                                                        .getPublicUrl(remotePath);
                                                    if (publicUrlData?.publicUrl) {
                                                        finalUrl = publicUrlData.publicUrl;
                                                    }
                                                }
                                            } catch (err) {
                                                console.warn('[Yjs Image Upload] Error subiendo imagen directa a Supabase:', err);
                                            }
                                        }

                                        if (finalUrl) {
                                            yjsEditorRef.current?.insertImage(finalUrl);
                                        } else {
                                            // Modo Offline o fallo de red: persistir localmente y encolar
                                            try {
                                                const dir = `${FileSystem.documentDirectory}images/`;
                                                const dirInfo = await FileSystem.getInfoAsync(dir);
                                                if (!dirInfo.exists) {
                                                    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
                                                }
                                                const imgId = Crypto.randomUUID();
                                                const persistentUri = `${dir}${imgId}.jpg`;
                                                await FileSystem.copyAsync({
                                                    from: result.uri,
                                                    to: persistentUri,
                                                });

                                                await withDB(async (db) => {
                                                    await db.runAsync(
                                                        'INSERT INTO pending_image_uploads (id, note_id, local_uri, created_at_ms) VALUES (?, ?, ?, ?);',
                                                        [imgId, id, persistentUri, Date.now()]
                                                    );
                                                });

                                                yjsEditorRef.current?.insertImage(persistentUri);
                                            } catch (err) {
                                                console.error('[Yjs Image Offline] Error guardando imagen localmente:', err);
                                                Alert.alert('Error', 'No se pudo guardar la imagen localmente.');
                                            }
                                        }
                                    } else {
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

                    {/* Modal de Gestión y Navegación de Hojas */}
                    <PagesOverviewModal
                        visible={isPagesModalVisible}
                        onClose={() => setIsPagesModalVisible(false)}
                        pages={pages}
                        currentPageIndex={currentPageIndex}
                        onSelectPage={handleSelectPage}
                        onAddPage={effectiveCanEdit ? handleAddPage : () => { }}
                        onDeletePage={effectiveCanEdit ? handleDeletePage : () => { }}
                        onDuplicatePage={effectiveCanEdit ? duplicatePage : undefined}
                        onInsertPageAfter={effectiveCanEdit ? insertPageAfter : undefined}
                        onRenamePage={isYjsMode ? undefined : (effectiveCanEdit ? renamePage : undefined)}
                        onMovePage={effectiveCanEdit ? movePage : undefined}
                        onReorderPages={effectiveCanEdit ? handleReorderPages : undefined}
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
                        onOpenFontPicker={() => setIsFontModalVisible(true)}
                        pageCount={pages.length}
                        isPinned={isPinned}
                        onTogglePin={() => setIsPinned(!isPinned)}
                        onMoveFolder={() => setIsMoveModalVisible(true)}
                        folderName={currentFolder?.name}
                        onDelete={isEditing ? handleDelete : undefined}
                        onShare={!isCreating && id ? () => {
                            setIsOptionsMenuVisible(false);
                            setIsShareModalVisible(true);
                        } : undefined}
                        onViewHistory={!isCreating && id && isYjsMode ? () => {
                            setIsOptionsMenuVisible(false);
                            flushYjsActivity();
                            router.push(`/notes/${id}/history`);
                        } : undefined}
                        isEditMode={isEditMode}
                        onToggleEditMode={canEdit ? () => {
                            if (isEditMode) {
                                handleExitEditMode();
                            } else {
                                handleEnterEditMode();
                            }
                        } : undefined}
                        onActivatePilotYjs={
                            (!isCreating && id && currentNote?.sync_mode !== 'yjs' && isOwner)
                                ? handlePromptActivatePilot
                                : undefined
                        }
                        stats={yjsToolbarState.stats}
                    />

                    {/* Modal de Tipografía General de la Nota */}
                    <NoteFontModal
                        visible={isFontModalVisible}
                        onClose={() => setIsFontModalVisible(false)}
                        selectedFont={fontFamily}
                        onSelectFont={setFontFamily}
                        onApplyFontToSelection={handleApplyFontToSelection}
                    />

                    {/* Modal de Colaboración y Recursos Compartidos */}
                    {!isCreating && id && (
                        <ShareModal
                            visible={isShareModalVisible}
                            onClose={() => setIsShareModalVisible(false)}
                            targetType="note"
                            targetId={id}
                            targetTitle={title || t('notes.untitled', { defaultValue: 'Nota sin título' })}
                            isOwner={isOwner}
                        />
                    )}

                    <ImageViewing
                        images={imageAttachments.map(img => ({ uri: img.uri }))}
                        imageIndex={galleryIndex}
                        visible={galleryVisible}
                        onRequestClose={() => setGalleryVisible(false)}
                        swipeToCloseEnabled={true}
                        doubleTapToZoomEnabled={true}
                    />



                    {/* Visor a Pantalla Completa para imagen clickeada en editor */}
                    <ImageViewing
                        images={selectedImageUrl ? [{ uri: selectedImageUrl }] : []}
                        imageIndex={0}
                        visible={isImageViewerVisible}
                        onRequestClose={() => setIsImageViewerVisible(false)}
                        swipeToCloseEnabled={true}
                        doubleTapToZoomEnabled={true}
                    />
                </View>
            </SafeAreaView>
        </Reanimated.View>
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
    pageNavBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 1,
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
    imageTooltipPillBtn: {
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 2,
    },
    imageTooltipBtnText: {
        fontSize: 12,
        fontWeight: '700',
    },
    floatingSelectionMenu: {
        position: 'absolute',
        top: 8,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRadius: 26,
        borderWidth: StyleSheet.hairlineWidth,
        zIndex: 120,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
            },
            android: {
                elevation: 12,
            },
        }),
    },
    floatingMenuBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 1,
    },
    floatingMenuDivider: {
        width: 1,
        height: 22,
        marginHorizontal: 3,
    },
});
