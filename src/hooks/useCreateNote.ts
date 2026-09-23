import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotesStore } from '../store/useNotesStore';
import { useRouter } from 'expo-router';
import { Alert, StatusBar, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useStore } from '../store/useStore';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { parseNotePages, serializeNotePages, PageLayoutMode, NotePage, createPage } from '../utils/pageUtils';
import { useNoteHistory, NoteHistorySnapshot } from './useNoteHistory';

export function useCreateNote(
    id?: string,
    initialFolderId?: string | null,
    initialEventId?: string | null,
    initialTitleParam?: string,
    editorRefs?: React.MutableRefObject<any[]>
) {
    const { t } = useTranslation();
    const router = useRouter();
    const { theme, isPremium } = useStore();
    const isDark = theme === 'dark';
    const { notes, addNote, updateNote, deleteNote } = useNotesStore();
    const isEditing = Boolean(id && id !== 'create');
    const noteIdRef = useRef<string | undefined>(id && id !== 'create' ? id : undefined);

    // Obtener nota de la caché en memoria inmediatamente (0ms)
    const cachedNote = (id && id !== 'create')
        ? (useNotesStore.getState().notes.find(n => n.id === id) || useNotesStore.getState().deletedNotes.find(n => n.id === id) || null)
        : null;
    const initialParsed = parseNotePages(cachedNote?.content);

    const [title, setTitle] = useState(() => cachedNote?.title || initialTitleParam || '');
    const [pages, setPages] = useState<NotePage[]>(() => initialParsed.pages);
    const [scrollLayout, setScrollLayout] = useState<PageLayoutMode>(() => initialParsed.layout);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [folderId, setFolderId] = useState<string | null>(() => cachedNote?.folder_id || initialFolderId || null);
    const [eventId, setEventId] = useState<string | null>(() => cachedNote?.event_id || initialEventId || null);

    const internalEditorRefs = useRef<any[]>([]);
    const effectiveEditorRefs = editorRefs || internalEditorRefs;

    // Callback para aplicar un snapshot restaurado desde el historial
    const onApplySnapshot = useCallback((snapshot: NoteHistorySnapshot) => {
        setTitle(snapshot.title);
        setPages(snapshot.pages);
        setCurrentPageIndex(snapshot.currentPageIndex);

        // Actualizar el DOM del editor WebView de cada página
        snapshot.pages.forEach((page, idx) => {
            const editor = effectiveEditorRefs.current?.[idx];
            if (editor && typeof editor.setContentHTML === 'function') {
                editor.setContentHTML(page.content || '');
            }
        });
    }, [effectiveEditorRefs]);

    const {
        undo,
        redo,
        canUndo,
        canRedo,
        recordChange,
        initHistory,
        flushPendingDebounce,
    } = useNoteHistory({ onApplySnapshot });

    const [attachments, setAttachments] = useState<{ uri: string; name: string }[]>(() => {
        if (!cachedNote?.attachments) return [];
        try {
            const parsed = JSON.parse(cachedNote.attachments);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [isPinned, setIsPinned] = useState(() => cachedNote?.is_pinned === 1);

    // Ref para rastrear los valores más recientes sin retraso de closure
    const currentValuesRef = useRef({
        title,
        pages,
        currentPageIndex,
        scrollLayout,
        attachments,
        isPinned,
        folderId,
        eventId,
    });
    useEffect(() => {
        currentValuesRef.current = { title, pages, currentPageIndex, scrollLayout, attachments, isPinned, folderId, eventId };
    }, [title, pages, currentPageIndex, scrollLayout, attachments, isPinned, folderId, eventId]);

    // Rastrear la última versión guardada para evitar escrituras redundantes
    const lastSavedValuesRef = useRef({
        title: cachedNote?.title || initialTitleParam || '',
        serializedContent: cachedNote?.content || '',
        attachments: cachedNote?.attachments || '[]',
        isPinned: cachedNote?.is_pinned === 1,
        folderId: cachedNote?.folder_id || initialFolderId || null,
        eventId: cachedNote?.event_id || initialEventId || null,
    });

    // Mutex para evitar guardados concurrentes
    const isSavingRef = useRef(false);

    // UI states
    const [isLoading, setIsLoading] = useState(false);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: '', description: '' });

    // Cropper state
    const [cropperUri, setCropperUri] = useState<string | null>(null);
    const [isCropperVisible, setIsCropperVisible] = useState(false);

    // Inicializar historial con la versión base
    useEffect(() => {
        initHistory({
            title: cachedNote?.title || initialTitleParam || '',
            pages: initialParsed.pages,
            currentPageIndex: 0,
        });
    }, []);

    useEffect(() => {
        if (id && id !== 'create') {
            noteIdRef.current = id;
            const note = notes.find(n => n.id === id);
            if (note && note !== cachedNote) {
                const parsed = parseNotePages(note.content);
                setTitle(note.title || '');
                setPages(parsed.pages);
                setScrollLayout(parsed.layout);
                setIsPinned(note.is_pinned === 1);
                setFolderId(note.folder_id || null);
                setEventId(note.event_id || null);
                lastSavedValuesRef.current = {
                    title: note.title || '',
                    serializedContent: note.content || '',
                    attachments: note.attachments || '[]',
                    isPinned: note.is_pinned === 1,
                    folderId: note.folder_id || null,
                    eventId: note.event_id || null,
                };
                if (note.attachments) {
                    try {
                        setAttachments(JSON.parse(note.attachments));
                    } catch (e) {
                        setAttachments([]);
                    }
                }
                initHistory({
                    title: note.title || '',
                    pages: parsed.pages,
                    currentPageIndex: 0,
                });
            }
        }
    }, [id, notes]);

    // Establecer título con registro en historial debounced
    const handleSetTitle = useCallback((newTitle: string) => {
        setTitle(newTitle);
        recordChange({
            title: newTitle,
            pages: currentValuesRef.current.pages,
            currentPageIndex: currentValuesRef.current.currentPageIndex,
        }, false);
    }, [recordChange]);

    /**
     * Actualiza el contenido HTML de una página específica.
     */
    const updatePageContent = useCallback((index: number, newHtml: string) => {
        setPages(prev => {
            const next = [...prev];
            if (index >= 0 && index < next.length) {
                if (next[index].content === newHtml) return prev;
                next[index] = { ...next[index], content: newHtml };
            } else if (index === next.length) {
                next.push(createPage(newHtml));
            }
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: index,
            }, false);
            return next;
        });
    }, [recordChange]);

    /**
     * Agrega una nueva página en blanco al final.
     */
    const addPage = useCallback(() => {
        setPages(prev => {
            const next = [...prev, createPage('')];
            const nextIndex = next.length - 1;
            setCurrentPageIndex(nextIndex);
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: nextIndex,
            }, true);
            return next;
        });
    }, [recordChange]);

    /**
     * Elimina una página por su índice.
     */
    const deletePage = useCallback((index: number) => {
        setPages(prev => {
            if (prev.length <= 1) return prev;
            const next = prev.filter((_, i) => i !== index);
            const nextIndex = Math.min(currentValuesRef.current.currentPageIndex, next.length - 1);
            setCurrentPageIndex(nextIndex);
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: nextIndex,
            }, true);
            return next;
        });
    }, [recordChange]);

    /**
     * Duplica una página por su índice e inserta la copia inmediatamente después.
     */
    const duplicatePage = useCallback((index: number) => {
        setPages(prev => {
            if (index < 0 || index >= prev.length) return prev;
            const source = prev[index];
            const copyTitle = source.title ? `${source.title} (${t('notes.duplicate_page_copy', { defaultValue: 'Copia' })})` : undefined;
            const copy = createPage(source.content, copyTitle);
            const next = [...prev];
            next.splice(index + 1, 0, copy);
            const nextIndex = index + 1;
            setCurrentPageIndex(nextIndex);
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: nextIndex,
            }, true);
            return next;
        });
    }, [recordChange, t]);

    /**
     * Inserta una nueva hoja en blanco inmediatamente después del índice especificado.
     */
    const insertPageAfter = useCallback((index: number) => {
        setPages(prev => {
            const next = [...prev];
            const insertAt = Math.max(0, Math.min(next.length, index + 1));
            next.splice(insertAt, 0, createPage(''));
            setCurrentPageIndex(insertAt);
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: insertAt,
            }, true);
            return next;
        });
    }, [recordChange]);

    /**
     * Actualiza el título personalizado de una página.
     */
    const renamePage = useCallback((index: number, newTitle: string) => {
        setPages(prev => {
            if (index < 0 || index >= prev.length) return prev;
            const next = [...prev];
            next[index] = { ...next[index], title: newTitle.trim() || undefined };
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: currentValuesRef.current.currentPageIndex,
            }, false);
            return next;
        });
    }, [recordChange]);

    /**
     * Reordena las páginas desplazando un elemento desde fromIndex hacia toIndex,
     * sincronizando con precisión el índice activo para que el usuario no pierda su posición.
     */
    const reorderPages = useCallback((fromIndex: number, toIndex: number) => {
        setPages(prev => {
            if (
                fromIndex < 0 ||
                fromIndex >= prev.length ||
                toIndex < 0 ||
                toIndex >= prev.length ||
                fromIndex === toIndex
            ) {
                return prev;
            }
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            let nextIndex = currentValuesRef.current.currentPageIndex;
            if (nextIndex === fromIndex) nextIndex = toIndex;
            else if (fromIndex < nextIndex && toIndex >= nextIndex) nextIndex = nextIndex - 1;
            else if (fromIndex > nextIndex && toIndex <= nextIndex) nextIndex = nextIndex + 1;
            setCurrentPageIndex(nextIndex);
            recordChange({
                title: currentValuesRef.current.title,
                pages: next,
                currentPageIndex: nextIndex,
            }, true);
            return next;
        });
    }, [recordChange]);

    /**
     * Mueve una página un paso hacia arriba o hacia abajo.
     */
    const movePage = useCallback((index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        reorderPages(index, targetIndex);
    }, [reorderPages]);

    const recordSnapshot = useCallback((immediate: boolean = false) => {
        recordChange({
            title: currentValuesRef.current.title,
            pages: currentValuesRef.current.pages,
            currentPageIndex: currentValuesRef.current.currentPageIndex,
        }, immediate);
    }, [recordChange]);

    /**
     * Guarda la nota silenciosamente en segundo plano sin navegar ni bloquear la UI.
     */
    const saveSilently = async () => {
        flushPendingDebounce();
        const {
            title: currentTitle,
            pages: currentPages,
            scrollLayout: currentLayout,
            attachments: currentAtts,
            isPinned: currentPinned,
            folderId: currentFolderId,
            eventId: currentEventId,
        } = currentValuesRef.current;
        const currentAttsJson = currentAtts.length > 0 ? JSON.stringify(currentAtts) : '[]';
        const serializedContent = serializeNotePages(currentPages, currentLayout);

        // Si la nota está totalmente vacía y no existe en BD, no crear una nota fantasma
        const hasContent = currentPages.some(p => Boolean(p.content.replace(/<[^>]+>/g, '').trim()) || p.content.includes('<img') || p.content.includes('<input') || p.content.includes('x-todo'));
        if (!currentTitle.trim() && !hasContent && currentAtts.length === 0 && !noteIdRef.current) {
            return;
        }

        // Si los valores no han cambiado respecto a la última persistencia, omitir guardado
        const last = lastSavedValuesRef.current;
        if (
            noteIdRef.current &&
            last.title === currentTitle &&
            last.serializedContent === serializedContent &&
            last.attachments === currentAttsJson &&
            last.isPinned === currentPinned &&
            last.folderId === currentFolderId &&
            last.eventId === currentEventId
        ) {
            return;
        }

        if (isSavingRef.current) return;
        isSavingRef.current = true;

        try {
            const attsJsonToSave = currentAtts.length > 0 ? currentAttsJson : undefined;
            if (noteIdRef.current) {
                await updateNote(noteIdRef.current, {
                    title: currentTitle,
                    content: serializedContent,
                    attachments: attsJsonToSave,
                    is_pinned: currentPinned ? 1 : 0,
                    folder_id: currentFolderId,
                    event_id: currentEventId,
                });
            } else {
                const created = await addNote(currentTitle, serializedContent, attsJsonToSave, undefined, currentPinned, currentFolderId, currentEventId);
                if (created?.id) {
                    noteIdRef.current = created.id;
                }
            }

            lastSavedValuesRef.current = {
                title: currentTitle,
                serializedContent: serializedContent,
                attachments: currentAttsJson,
                isPinned: currentPinned,
                folderId: currentFolderId,
                eventId: currentEventId,
            };
        } catch (error) {
            console.error('Error in saveSilently:', error);
        } finally {
            isSavingRef.current = false;
        }
    };

    // Auto-guardado con debounce mientras el usuario edita
    useEffect(() => {
        const timer = setTimeout(() => {
            saveSilently();
        }, 1200);

        return () => clearTimeout(timer);
    }, [title, pages, scrollLayout, attachments, isPinned, folderId]);

    // Guardado explícito (con callback opcional)
    const handleSave = async (onSuccess?: () => void) => {
        setIsLoading(true);
        try {
            await saveSilently();
            if (onSuccess) {
                onSuccess();
            } else {
                router.back();
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo guardar la nota.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!id) return;
        Alert.alert(
            'Eliminar Nota',
            '¿Estás seguro? Esta acción enviará la nota a la papelera (puedes restaurarla después si no la borras definitivamente).',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteNote(id);
                        router.back();
                    }
                }
            ]
        );
    };

    const pickImage = async (useCamera: boolean) => {
        const totalImageCount = pages.reduce((acc, p) => acc + (p.content.match(/<img/g) || []).length, 0);
        const maxImages = isPremium ? 20 : 2;

        if (totalImageCount >= maxImages) {
            setAlertConfig({
                title: 'Imágenes en texto',
                description: isPremium
                    ? 'Máximo de 20 imágenes por nota para garantizar el rendimiento.'
                    : 'Límite de 2 imágenes dentro del texto en el plan gratuito. Pásate a Premium para subir hasta 20.'
            });
            setAlertVisible(true);
            return;
        }

        try {
            let result;
            if (useCamera) {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permiso denegado', 'Se requiere permiso para acceder a la cámara.');
                    return;
                }
                result = await ImagePicker.launchCameraAsync({
                    mediaTypes: ['images'],
                    quality: 0.8,
                });
            } else {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permiso denegado', 'Se requiere permiso para acceder a la galería.');
                    return;
                }
                result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsEditing: false,
                    quality: 0.8,
                });
            }

            if (!result.canceled && result.assets && result.assets.length > 0) {
                return result.assets[0].uri;
            }
            return null;
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo adjuntar la imagen');
            return null;
        }
    };

    const pickImageForEditor = async () => {
        return await pickImage(false);
    };

    const processCroppedImage = async (uri: string) => {
        try {
            const manipResult = await manipulateAsync(
                uri,
                [{ resize: { width: 1000 } }],
                { compress: 0.6, format: SaveFormat.JPEG, base64: true }
            );
            return `data:image/jpeg;base64,${manipResult.base64}`;
        } catch (error) {
            console.error('Error al procesar imagen recortada:', error);
            return null;
        }
    };

    const pickDocument = async () => {
        const maxAttachments = isPremium ? 10 : 3;
        if (attachments.length >= maxAttachments) {
            setAlertConfig({
                title: 'Límite de archivos',
                description: isPremium
                    ? 'Máximo de 10 archivos alcanzado.'
                    : 'Límite de 3 archivos en el plan gratuito. Hazte Premium para más.'
            });
            setAlertVisible(true);
            return;
        }

        try {
            const result = await DocumentPicker.getDocumentAsync({
                copyToCacheDirectory: true,
                type: '*/*'
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const uri = result.assets[0].uri;
                const name = result.assets[0].name;
                const newPath = (FileSystem.documentDirectory as string) + name;
                await FileSystem.copyAsync({
                    from: uri,
                    to: newPath
                });
                setAttachments([...attachments, { uri: newPath, name }]);
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'No se pudo adjuntar el archivo');
        }
    };

    const removeAttachment = (index: number) => {
        const newAtts = [...attachments];
        newAtts.splice(index, 1);
        setAttachments(newAtts);
    };

    const openAttachment = async (uri: string) => {
        try {
            if (Platform.OS === 'android') {
                const cUri = await FileSystem.getContentUriAsync(uri);
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                    data: cUri,
                    flags: 1,
                });
            } else {
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(uri);
                }
            }
        } catch (error) {
            console.error('Error al abrir archivo:', error);
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri);
            }
        }
    };

    return {
        title, setTitle: handleSetTitle,
        pages, setPages,
        currentPageIndex, setCurrentPageIndex,
        undo,
        redo,
        canUndo,
        canRedo,
        recordSnapshot,
        editorRefs: effectiveEditorRefs,
        updatePageContent,
        addPage,
        deletePage,
        duplicatePage,
        insertPageAfter,
        renamePage,
        movePage,
        reorderPages,
        scrollLayout, setScrollLayout,
        folderId, setFolderId,
        eventId, setEventId,
        attachments,
        isPinned, setIsPinned,
        isDark,
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
        maxAttachments: isPremium ? 10 : 3
    };
}
