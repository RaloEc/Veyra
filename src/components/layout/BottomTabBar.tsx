import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    TouchableWithoutFeedback,
    StyleSheet,
    ActivityIndicator,
    Keyboard,
    Platform,
    Alert,
    Vibration,
    useWindowDimensions,
    Image as RNImage,
} from 'react-native';
import { AudioModule, useAudioRecorder, RecordingPresets } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: (event: string, listener: (ev: any) => void) => void = () => {};

try {
    const speechMod = require('expo-speech-recognition');
    if (speechMod?.ExpoSpeechRecognitionModule) {
        ExpoSpeechRecognitionModule = speechMod.ExpoSpeechRecognitionModule;
        useSpeechRecognitionEvent = speechMod.useSpeechRecognitionEvent || useSpeechRecognitionEvent;
    }
} catch {
    // Si el dev-client actual no tiene el módulo nativo compilado en el APK, no romper la app
    ExpoSpeechRecognitionModule = null;
}
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withRepeat,
    withSequence,
    Easing,
    interpolate,
    Extrapolation,
    runOnJS,
} from 'react-native-reanimated';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    Bell,
    Notebook,
    Plus,
    Clock,
    Calendar as CalendarIcon,
    X,
    CheckSquare,
    Square,
    Sparkles,
    Mic,
    MicOff,
    Check,
    ArrowRight,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Paperclip,
    Repeat,
    MapPin,
    Camera,
    Image as ImageIcon,
    FileText,
    Trash2,
    Folder as FolderIcon,
} from '@tamagui/lucide-icons';

import { useScreenInsets } from '../../hooks/useScreenInsets';
import { useStore } from '../../store/useStore';
import { useFoldersStore } from '../../store/useFoldersStore';
import { useSelectionStore } from '../../store/useSelectionStore';
import { useShareEventsStore } from '../../store/useShareEventsStore';
import { ShareEventsMorphCard } from '../events/ShareEventsMorphCard';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { useAIQuickAdd } from '../../hooks/useAIQuickAdd';
import { AIActionProposal, ReminderIntent, EventIntent, NoteIntent } from '../../lib/ai/schemas';
import { CustomDateTimePicker } from '../CustomDateTimePicker';

/**
 * BottomTabBar — Barra de navegación inferior flotante inspirada en Samsung One UI.
 * 
 * Características:
 * - Cápsula flotante redondeada elevada sobre los gestos y la barra del sistema.
 * - Morph dinámico 1: Modo Selección Múltiple (al seleccionar elementos en listas).
 * - Morph dinámico 2: Modo Creación con IA y Accesos Directos (al pulsar el botón central Hero "+").
 * - Elevación reactiva al abrir el teclado en móviles.
 */
const GlowAuraOrb = ({ color, active }: { color: string; active: boolean }) => {
    const pulseAnim = useSharedValue(0);

    useEffect(() => {
        if (!active) {
            pulseAnim.value = withTiming(0, { duration: 180 });
            return;
        }

        pulseAnim.value = withRepeat(
            withTiming(1, {
                duration: 1100,
                easing: Easing.inOut(Easing.sin),
            }),
            -1,
            true
        );
    }, [active]);

    // Halo exterior que respira y se difumina (Aura exterior)
    const outerHaloStyle = useAnimatedStyle(() => {
        const p = pulseAnim.value;
        return {
            transform: [{ scale: interpolate(p, [0, 1], [0.85, 1.45], Extrapolation.CLAMP) }],
            opacity: interpolate(p, [0, 1], [0.22, 0.55], Extrapolation.CLAMP),
        };
    });

    // Halo medio con brillo intermedio
    const middleHaloStyle = useAnimatedStyle(() => {
        const p = pulseAnim.value;
        return {
            transform: [{ scale: interpolate(p, [0, 1], [0.95, 1.2], Extrapolation.CLAMP) }],
            opacity: interpolate(p, [0, 1], [0.45, 0.85], Extrapolation.CLAMP),
        };
    });

    // Esfera central brillante y sólida
    const coreOrbStyle = useAnimatedStyle(() => {
        const p = pulseAnim.value;
        return {
            transform: [{ scale: interpolate(p, [0, 1], [0.95, 1.12], Extrapolation.CLAMP) }],
        };
    });

    return (
        <View style={styles.glowOrbContainer}>
            <Animated.View
                style={[
                    styles.glowOrbOuterHalo,
                    { backgroundColor: color },
                    outerHaloStyle,
                ]}
            />
            <Animated.View
                style={[
                    styles.glowOrbMiddleHalo,
                    { backgroundColor: color },
                    middleHaloStyle,
                ]}
            />
            <Animated.View
                style={[
                    styles.glowOrbCore,
                    { backgroundColor: color },
                    coreOrbStyle,
                ]}
            />
        </View>
    );
};

interface PendingAttachment {
    id: string;
    base64Data: string;
    mimeType: string;
    uri: string;
    name?: string;
    isImage: boolean;
}

export function BottomTabBar() {
    const router = useRouter();
    const pathname = usePathname();
    const { bottom: bottomInset } = useScreenInsets();
    const { t } = useTranslation();
    const { colors, accent, isDark } = useVeyraTheme();

    const language = useStore(state => state.language);
    const mainActiveTab = useStore(state => state.mainActiveTab);
    const setMainActiveTab = useStore(state => state.setMainActiveTab);

    const isRouteNotes = pathname.startsWith('/notes');
    const isNotesActive = mainActiveTab === 'notes' || isRouteNotes;
    const isRemindersActive = !isNotesActive;

    // Detección contextual de carpeta activa en notas
    const folderStack = useFoldersStore((state) => state.folderStack);
    const activeFolderId = useFoldersStore((state) => state.activeFolderId);
    const folders = useFoldersStore((state) => state.folders);

    const activeFolder = useMemo(() => {
        if (folderStack.length > 0) {
            return folderStack[folderStack.length - 1];
        }
        if (activeFolderId && activeFolderId !== 'all' && activeFolderId !== 'pinned' && activeFolderId !== 'unassigned') {
            return folders.find((f) => f.id === activeFolderId) || null;
        }
        return null;
    }, [folderStack, activeFolderId, folders]);

    const isInsideFolder = isNotesActive && !!activeFolder;

    // Distancia desde el borde inferior de la pantalla
    const bottomOffset = Math.max(bottomInset + 20, 32);

    // Colores One UI para la píldora flotante
    const dockBg = isDark ? '#202227' : '#FFFFFF';
    const dockBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const activePillBg = isDark ? `${accent.primary}2A` : `${accent.primary}18`;

    // Selección global para morphear el dock a selección múltiple
    const selection = useSelectionStore();
    const isSelecting = selection.active && selection.actions.length > 0;
    const morphProgress = useSharedValue(0);

    // Estado del modo Compartir Eventos (Morph del Dock)
    const shareEventsState = useShareEventsStore();
    const isSharingEvents = shareEventsState.isOpen && shareEventsState.events.length > 0;
    const shareEventsList = shareEventsState.events;
    const shareMorphProgress = useSharedValue(0);

    // Estado del modo Creación (Morph del Dock)
    const [isCreating, setIsCreating] = useState(false);
    const [inputPrompt, setInputPrompt] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [recordDuration, setRecordDuration] = useState(0);
    const createMorphProgress = useSharedValue(0);
    const isCreatingShared = useSharedValue(false);
    const createHeightShared = useSharedValue(215);
    const keyboardOffset = useSharedValue(0);

    // Sincronizar estado booleano de creación con el shared value en UI thread
    useEffect(() => {
        isCreatingShared.value = isCreating;
    }, [isCreating]);

    // Escala táctil del botón al mantener pulsado
    const recordBtnScale = useSharedValue(1);
    const recordStartTimeRef = useRef<number>(0);

    // Cronómetro dinámico durante la grabación de audio
    useEffect(() => {
        let interval: any = null;
        if (isRecording) {
            setRecordDuration(0);
            interval = setInterval(() => {
                setRecordDuration((prev) => prev + 1);
            }, 1000);
        } else {
            setRecordDuration(0);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isRecording]);

    // Grabador de voz y modo activo (Opción 1: speech en tiempo real; Fallback: audio)
    const voiceModeRef = useRef<'speech' | 'audio'>('speech');
    const inputRef = useRef<TextInput>(null);
    const isKeyboardVisibleRef = useRef(false);

    // Eventos de Speech-to-Text nativo en tiempo real (Opción 1)
    useSpeechRecognitionEvent('result', (ev) => {
        const transcript = ev.results[0]?.transcript;
        if (transcript) {
            setInputPrompt(transcript);
        }
    });

    useSpeechRecognitionEvent('start', () => {
        setIsRecording(true);
    });

    useSpeechRecognitionEvent('end', () => {
        setIsRecording(false);
    });

    useSpeechRecognitionEvent('error', (ev) => {
        console.warn('[SpeechRecognition] Native event error:', ev);
        setIsRecording(false);
    });

    // Configuración ligera y mono optimizada para voz humana
    const audioRecorder = useAudioRecorder({
        extension: '.m4a',
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 32000,
        android: {
            outputFormat: 'mpeg4',
            audioEncoder: 'aac',
        },
        ios: {
            outputFormat: 'mpeg4aac',
            audioQuality: 0x20,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
        },
    } as any);

    // AI Quick Add Hook
    const {
        isLoading,
        proposal,
        error,
        successMessage,
        processPrompt,
        processAudioPrompt,
        processMediaPrompt,
        confirmProposal,
        cancelProposal,
        clearMessages,
        updateProposalData,
        toggleBatchItem,
        updateBatchItemData,
    } = useAIQuickAdd();

    // Estado del selector de fecha y hora para la propuesta de IA
    const [pickerVisible, setPickerVisible] = useState(false);
    const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
    const [pickerDate, setPickerDate] = useState<Date>(new Date());
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

    // Sección expandida en propuesta de IA: 'none' | 'date' | 'time' (Morph inline)
    const [expandedSection, setExpandedSection] = useState<'none' | 'date' | 'time'>('none');
    const [inlineCalendarMonth, setInlineCalendarMonth] = useState<Date>(() => new Date());

    // Restablecer sección expandida y asegurar estado de creación activo al recibir o cambiar propuesta de IA
    useEffect(() => {
        setExpandedSection('none');
        if (proposal) {
            setIsCreating(true);
            isCreatingShared.value = true;
            createMorphProgress.value = withSpring(1, { damping: 19, stiffness: 220, mass: 0.8 });
            backdropOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
            fabRotateProgress.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
            setShowAttachMenu(false);

            if ('data' in proposal && (proposal.data as any)?.date) {
                try {
                    const [y, m, d] = String((proposal.data as any).date).split('-').map(Number);
                    setInlineCalendarMonth(new Date(y, (m || 1) - 1, 1));
                } catch {}
            }
        }
    }, [proposal]);

    // Animaciones del dock y tabs
    const fabScale = useSharedValue(1);
    const fabRotateProgress = useSharedValue(0);
    const backdropOpacity = useSharedValue(0);

    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const normalDockWidth = Math.min(screenWidth * 0.9, 330);
    const morphedDockWidth = Math.min(screenWidth - 20, 440);
    const maxDockHeight = Math.min(screenHeight - bottomOffset - 36, screenHeight * 0.82);

    const bellScale = useSharedValue(1);
    const notesScale = useSharedValue(1);
    const activeTabProgress = useSharedValue(isNotesActive ? 1 : 0);
    const isInitialMount = useRef(true);

    // Sincronizar selección múltiple
    useEffect(() => {
        if (isSelecting && isCreating) {
            closeCreate();
        }
        morphProgress.value = withSpring(isSelecting ? 1 : 0, {
            damping: 19,
            stiffness: 220,
            mass: 0.8,
        });
    }, [isSelecting]);

    // Sincronizar morph de compartir eventos
    useEffect(() => {
        if (isSharingEvents) {
            shareMorphProgress.value = withSpring(1, {
                damping: 19,
                stiffness: 220,
                mass: 0.8,
            });
            backdropOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
        } else {
            shareMorphProgress.value = withSpring(0, {
                damping: 19,
                stiffness: 220,
                mass: 0.8,
            });
            if (!isCreating) {
                backdropOpacity.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
            }
        }
    }, [isSharingEvents, isCreating]);

    // Adaptar altura de creación según contenido y estado de plegado/desplegado (Totalmente dinámico sin scroll)
    useEffect(() => {
        const hasAttachments = pendingAttachments.length > 0;
        const attachmentsHeight = hasAttachments ? 52 : 0;
        let targetHeight = 160 + attachmentsHeight;

        if (proposal) {
            if (proposal.action === 'create_batch' || proposal.action === 'batch_update') {
                const hasExplanation = Boolean(proposal.contextExplanation);
                const baseBatchHeight = 175 + (hasExplanation ? 36 : 0);
                let displayRows = proposal.items.length;
                if (proposal.action === 'create_batch') {
                    const uniqueTitles = new Set(
                        proposal.items.map(i => ((i.data as any)?.title || '').trim().toLowerCase())
                    );
                    displayRows = uniqueTitles.size || proposal.items.length;
                }
                const itemsHeight = Math.min(360, displayRows * 76);
                targetHeight = Math.min(maxDockHeight, baseBatchHeight + itemsHeight);
            } else if (proposal.action === 'move_note') {
                const itemsHeight = Math.min(proposal.targetIds.length * 38, 140);
                targetHeight = Math.min(maxDockHeight, 230 + itemsHeight);
            } else if (proposal.action === 'delete_filtered') {
                const itemsHeight = Math.min(proposal.targetIds.length * 36, 140);
                targetHeight = Math.min(maxDockHeight, 240 + itemsHeight);
            } else if (proposal.action === 'update_reminder' || proposal.action === 'update_event') {
                targetHeight = 295;
            } else {
                const hasContext = Boolean(('data' in proposal) && (proposal.data as any)?.contextExplanation);
                const contextExtra = hasContext ? 42 : 0;
                if (expandedSection === 'date') {
                    targetHeight = Math.min(maxDockHeight, 550 + contextExtra);
                } else if (expandedSection === 'time') {
                    targetHeight = Math.min(maxDockHeight, 465 + contextExtra);
                } else if (proposal.action === 'create_note') {
                    targetHeight = 295;
                } else if (proposal.action === 'create_reminder') {
                    targetHeight = 425 + contextExtra;
                } else {
                    targetHeight = 405 + contextExtra;
                }
            }
        } else if (showAttachMenu) {
            targetHeight = 244 + attachmentsHeight + (error || successMessage ? 26 : 0);
        } else if (error || successMessage) {
            targetHeight = 186 + attachmentsHeight;
        }
        createHeightShared.value = withTiming(targetHeight, {
            duration: 220,
            easing: Easing.out(Easing.cubic),
        });
    }, [proposal, expandedSection, showAttachMenu, error, successMessage, maxDockHeight, pendingAttachments.length]);

    // Desplazamiento reactivo con el teclado en dispositivos móviles
    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, (e) => {
            isKeyboardVisibleRef.current = true;
            keyboardOffset.value = withTiming(e.endCoordinates.height - (Platform.OS === 'android' ? 8 : 0), {
                duration: 250,
                easing: Easing.out(Easing.cubic),
            });
        });
        const hideSub = Keyboard.addListener(hideEvent, () => {
            isKeyboardVisibleRef.current = false;
            keyboardOffset.value = withTiming(0, {
                duration: 200,
                easing: Easing.out(Easing.cubic),
            });
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    // Sincronizar tab activo
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            activeTabProgress.value = isNotesActive ? 1 : 0;
            return;
        }

        activeTabProgress.value = withSpring(isNotesActive ? 1 : 0, {
            damping: 18,
            stiffness: 220,
            mass: 0.8,
        });

        if (isNotesActive) {
            notesScale.value = 0.88;
            notesScale.value = withSpring(1, { damping: 12, stiffness: 280 });
        } else {
            bellScale.value = 0.88;
            bellScale.value = withSpring(1, { damping: 12, stiffness: 280 });
        }
    }, [isNotesActive]);

    // Estilos animados
    const fabAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: fabScale.value }],
    }));

    const fabRotateStyle = useAnimatedStyle(() => ({
        transform: [
            {
                rotate: `${interpolate(
                    fabRotateProgress.value,
                    [0, 1],
                    [0, 45],
                    Extrapolation.CLAMP
                )}deg`,
            },
        ],
    }));

    const bellAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: bellScale.value }],
    }));

    const notesAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: notesScale.value }],
    }));

    const bellPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(activeTabProgress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
        transform: [
            {
                scale: interpolate(activeTabProgress.value, [0, 1], [1, 0.75], Extrapolation.CLAMP),
            },
        ],
    }));

    const notesPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(activeTabProgress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
        transform: [
            {
                scale: interpolate(activeTabProgress.value, [0, 1], [0.75, 1], Extrapolation.CLAMP),
            },
        ],
    }));

    const backdropAnimatedStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value * (isDark ? 0.28 : 0.12),
    }));

    // Morph suave entre icono Micrófono y Enviar
    const inputActionMorph = useSharedValue(0);

    useEffect(() => {
        const isSend = Boolean(inputPrompt.trim() || pendingAttachments.length > 0) && !isRecording;
        inputActionMorph.value = withSpring(isSend ? 1 : 0, {
            damping: 18,
            stiffness: 260,
            mass: 0.6,
        });
    }, [inputPrompt, isRecording, pendingAttachments.length]);

    const micMorphStyle = useAnimatedStyle(() => {
        const p = inputActionMorph.value;
        return {
            opacity: interpolate(p, [0, 0.4, 0.8], [1, 0.2, 0], Extrapolation.CLAMP),
            transform: [
                { scale: interpolate(p, [0, 1], [1, 0.2], Extrapolation.CLAMP) },
                { rotate: `${interpolate(p, [0, 1], [0, -75], Extrapolation.CLAMP)}deg` },
            ],
        };
    });

    const sendMorphStyle = useAnimatedStyle(() => {
        const p = inputActionMorph.value;
        return {
            opacity: interpolate(p, [0.2, 0.6, 1], [0, 0.5, 1], Extrapolation.CLAMP),
            transform: [
                { scale: interpolate(p, [0, 1], [0.2, 1], Extrapolation.CLAMP) },
                { rotate: `${interpolate(p, [0, 1], [75, 0], Extrapolation.CLAMP)}deg` },
            ],
        };
    });

    const actionBtnAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: recordBtnScale.value }],
    }));

    const dockContainerAnimatedStyle = useAnimatedStyle(() => ({
        bottom: bottomOffset + keyboardOffset.value,
    }));

    // Morph dinámico del contenedor del dock
    const dockAnimatedStyle = useAnimatedStyle(() => {
        const pSel = morphProgress.value;
        const pCreate = createMorphProgress.value;
        const pShare = shareMorphProgress.value;

        // Ancho
        const widthCreate = interpolate(pCreate, [0, 1], [normalDockWidth, morphedDockWidth], Extrapolation.CLAMP);
        const widthSel = interpolate(pSel, [0, 1], [widthCreate, morphedDockWidth], Extrapolation.CLAMP);
        const finalWidth = interpolate(pShare, [0, 1], [widthSel, morphedDockWidth], Extrapolation.CLAMP);

        // Alto
        const shareCardHeight = Math.min(screenHeight - bottomOffset - 36, 400);
        const heightCreate = interpolate(pCreate, [0, 1], [56, createHeightShared.value], Extrapolation.CLAMP);
        const heightSel = interpolate(pSel, [0, 1], [heightCreate, 108], Extrapolation.CLAMP);
        const finalHeight = interpolate(pShare, [0, 1], [heightSel, shareCardHeight], Extrapolation.CLAMP);

        // Radio de borde
        const radiusCreate = interpolate(pCreate, [0, 1], [28, 22], Extrapolation.CLAMP);
        const radiusSel = interpolate(pSel, [0, 1], [radiusCreate, 22], Extrapolation.CLAMP);
        const finalRadius = interpolate(pShare, [0, 1], [radiusSel, 24], Extrapolation.CLAMP);

        return {
            width: finalWidth,
            height: finalHeight,
            borderRadius: finalRadius,
        };
    });

    // Navegación normal (Tabs)
    const normalTabsAnimatedStyle = useAnimatedStyle(() => {
        const p = Math.max(morphProgress.value, createMorphProgress.value, shareMorphProgress.value);
        const shouldHide = p >= 0.35 || isCreatingShared.value || isSharingEvents;
        return {
            opacity: interpolate(p, [0, 0.35], [1, 0], Extrapolation.CLAMP),
            display: shouldHide ? 'none' : 'flex',
            zIndex: shouldHide ? -1 : 1,
            transform: [
                { scale: interpolate(p, [0, 0.35], [1, 0.82], Extrapolation.CLAMP) },
                { translateY: interpolate(p, [0, 0.35], [0, 10], Extrapolation.CLAMP) },
            ],
        };
    });

    // Menú de Selección Múltiple
    const selectionMenuAnimatedStyle = useAnimatedStyle(() => {
        const p = morphProgress.value;
        const pShare = shareMorphProgress.value;
        return {
            opacity: interpolate(p, [0.42, 1], [0, 1], Extrapolation.CLAMP) * (1 - pShare),
            transform: [
                { scale: interpolate(p, [0.42, 1], [0.88, 1], Extrapolation.CLAMP) * (1 - pShare * 0.08) },
                { translateY: interpolate(p, [0.42, 1], [-8, 0], Extrapolation.CLAMP) },
            ],
        };
    });

    // Tarjeta de Compartir Eventos Morpheada
    const shareCardAnimatedStyle = useAnimatedStyle(() => {
        const p = shareMorphProgress.value;
        const isVisible = p > 0.05 || isSharingEvents;
        return {
            opacity: interpolate(p, [0.25, 1], [0, 1], Extrapolation.CLAMP),
            display: isVisible ? 'flex' : 'none',
            zIndex: isVisible ? 12 : -1,
            transform: [
                { scale: interpolate(p, [0.25, 1], [0.93, 1], Extrapolation.CLAMP) },
                { translateY: interpolate(p, [0.25, 1], [8, 0], Extrapolation.CLAMP) },
            ],
        };
    });

    // Tarjeta de Creación Morpheada
    const createCardAnimatedStyle = useAnimatedStyle(() => {
        const p = createMorphProgress.value;
        const isVisible = p > 0.05 || isCreatingShared.value;
        return {
            opacity: interpolate(p, [0.35, 1], [0, 1], Extrapolation.CLAMP),
            display: isVisible ? 'flex' : 'none',
            zIndex: isVisible ? 10 : -1,
            transform: [
                { scale: interpolate(p, [0.35, 1], [0.92, 1], Extrapolation.CLAMP) },
                { translateY: interpolate(p, [0.35, 1], [8, 0], Extrapolation.CLAMP) },
            ],
        };
    });

    // Interacciones del botón central Hero (+)
    const handleFabPressIn = () => {
        'worklet';
        fabScale.value = withSpring(0.9, { damping: 15, stiffness: 300 });
    };

    const handleFabPressOut = () => {
        'worklet';
        fabScale.value = withSpring(1, { damping: 12, stiffness: 200 });
    };

    const openCreate = () => {
        if (isSelecting) return;
        isCreatingShared.value = true;
        setIsCreating(true);
        createMorphProgress.value = withSpring(1, { damping: 19, stiffness: 220, mass: 0.8 });
        backdropOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
        fabRotateProgress.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    };

    const closeCreate = async () => {
        if (isRecording) {
            if (voiceModeRef.current === 'speech' && ExpoSpeechRecognitionModule) {
                try { ExpoSpeechRecognitionModule.stop(); } catch {}
            } else {
                try { await audioRecorder.stop(); } catch {}
            }
            setIsRecording(false);
        }
        Keyboard.dismiss();

        // Limpieza de estado síncrona inmediata para garantizar sincronía total y evitar bugs visuales
        isCreatingShared.value = false;
        setIsCreating(false);
        setInputPrompt('');
        setPendingAttachments([]);
        cancelProposal();
        clearMessages();
        setShowAttachMenu(false);
        setExpandedSection('none');

        createMorphProgress.value = withSpring(0, { damping: 20, stiffness: 240, mass: 0.8 });
        backdropOpacity.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.cubic) });
        fabRotateProgress.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.cubic) });
    };

    const handleFabPress = () => {
        if (isCreating) {
            closeCreate();
            return;
        }

        // Si el usuario está dentro de una carpeta de notas, crear directamente una nota en esa carpeta
        if (isInsideFolder && activeFolder) {
            try { Vibration.vibrate(15); } catch {}
            router.push({
                pathname: '/notes/create',
                params: { folderId: activeFolder.id },
            });
            return;
        }

        openCreate();
    };

    const handleFabLongPress = () => {
        if (isInsideFolder && !isCreating) {
            try { Vibration.vibrate(25); } catch {}
            openCreate();
        }
    };

    const handleSendPrompt = async () => {
        if ((!inputPrompt.trim() && pendingAttachments.length === 0) || isLoading) return;
        if (isRecording) {
            setIsRecording(false);
            if (ExpoSpeechRecognitionModule) {
                try {
                    ExpoSpeechRecognitionModule.stop();
                } catch {}
            }
        }
        Keyboard.dismiss();

        const userText = inputPrompt.trim();

        if (pendingAttachments.length > 0) {
            const mediaList = pendingAttachments.map(att => ({
                base64Data: att.base64Data,
                mimeType: att.mimeType,
                name: att.name,
                uri: att.uri,
            }));
            const primaryMime = pendingAttachments[0].mimeType || 'image/jpeg';
            setPendingAttachments([]);
            setInputPrompt('');
            await processMediaPrompt(mediaList, primaryMime, userText || undefined);
        } else if (userText) {
            await processPrompt(userText);
        }
    };

    const handleConfirmProposal = async () => {
        if (proposal && proposal.action === 'create_note' && activeFolder) {
            const noteData = proposal.data as any;
            if (!noteData.folderId) {
                noteData.folderId = activeFolder.id;
            }
        }
        const ok = await confirmProposal();
        if (ok) {
            setTimeout(() => {
                closeCreate();
            }, 600);
        }
    };

    const handleRemoveAttachment = (id: string) => {
        setPendingAttachments(prev => prev.filter(att => att.id !== id));
    };

    const handlePickImage = async () => {
        if (pendingAttachments.length >= 3) {
            Alert.alert(
                language === 'es' ? 'Límite de adjuntos' : 'Attachment limit',
                language === 'es' ? 'Puedes adjuntar un máximo de 3 archivos.' : 'You can attach up to 3 files.'
            );
            return;
        }

        setShowAttachMenu(false);
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(
                    language === 'es' ? 'Permiso requerido' : 'Permission needed',
                    language === 'es' ? 'Necesitamos acceso a tus fotos para analizar el documento o horario.' : 'We need photo access to analyze the document or schedule.'
                );
                return;
            }

            const remaining = 3 - pendingAttachments.length;
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsMultipleSelection: true,
                selectionLimit: remaining,
                quality: 0.85,
                base64: true,
            });

            if (!res.canceled && res.assets && res.assets.length > 0) {
                isCreatingShared.value = true;
                setIsCreating(true);
                createMorphProgress.value = 1;
                backdropOpacity.value = 1;
                const newItems: PendingAttachment[] = [];
                for (const asset of res.assets.slice(0, remaining)) {
                    let b64 = asset.base64;
                    if (!b64 && asset.uri) {
                        b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
                    }
                    if (b64) {
                        newItems.push({
                            id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                            base64Data: b64,
                            mimeType: asset.mimeType || 'image/jpeg',
                            uri: asset.uri,
                            name: asset.fileName || 'imagen.jpg',
                            isImage: true,
                        });
                    }
                }
                if (newItems.length > 0) {
                    setPendingAttachments(prev => [...prev, ...newItems].slice(0, 3));
                }
            }
        } catch (err: any) {
            console.warn('[BottomTabBar] Image pick error:', err);
            Alert.alert(
                language === 'es' ? 'Error' : 'Error',
                language === 'es' ? 'No se pudo cargar la imagen seleccionada.' : 'Could not load selected image.'
            );
        }
    };

    const handleTakePhoto = async () => {
        if (pendingAttachments.length >= 3) {
            Alert.alert(
                language === 'es' ? 'Límite de adjuntos' : 'Attachment limit',
                language === 'es' ? 'Puedes adjuntar un máximo de 3 archivos.' : 'You can attach up to 3 files.'
            );
            return;
        }

        setShowAttachMenu(false);
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(
                    language === 'es' ? 'Permiso requerido' : 'Permission needed',
                    language === 'es' ? 'Necesitamos acceso a tu cámara para fotografiar el documento o horario.' : 'We need camera access to capture the document or schedule.'
                );
                return;
            }

            const res = await ImagePicker.launchCameraAsync({
                quality: 0.85,
                base64: true,
            });

            if (!res.canceled && res.assets && res.assets[0]) {
                isCreatingShared.value = true;
                setIsCreating(true);
                createMorphProgress.value = 1;
                backdropOpacity.value = 1;
                const asset = res.assets[0];
                let b64 = asset.base64;
                if (!b64 && asset.uri) {
                    b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
                }
                if (b64) {
                    setPendingAttachments(prev => [
                        ...prev,
                        {
                            id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                            base64Data: b64,
                            mimeType: asset.mimeType || 'image/jpeg',
                            uri: asset.uri,
                            name: asset.fileName || 'foto.jpg',
                            isImage: true,
                        },
                    ].slice(0, 3));
                }
            }
        } catch (err: any) {
            console.warn('[BottomTabBar] Camera capture error:', err);
            Alert.alert(
                language === 'es' ? 'Error' : 'Error',
                language === 'es' ? 'No se pudo capturar la foto.' : 'Could not take photo.'
            );
        }
    };

    const handlePickDocument = async () => {
        if (pendingAttachments.length >= 3) {
            Alert.alert(
                language === 'es' ? 'Límite de adjuntos' : 'Attachment limit',
                language === 'es' ? 'Puedes adjuntar un máximo de 3 archivos.' : 'You can attach up to 3 files.'
            );
            return;
        }

        setShowAttachMenu(false);
        try {
            const res = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*'],
                multiple: true,
                copyToCacheDirectory: true,
            });

            if (!res.canceled && res.assets && res.assets.length > 0) {
                isCreatingShared.value = true;
                setIsCreating(true);
                createMorphProgress.value = 1;
                backdropOpacity.value = 1;
                const remaining = 3 - pendingAttachments.length;
                const newItems: PendingAttachment[] = [];
                for (const doc of res.assets.slice(0, remaining)) {
                    if (doc.uri) {
                        const b64 = await FileSystem.readAsStringAsync(doc.uri, { encoding: 'base64' });
                        if (b64) {
                            const isImg = (doc.mimeType || '').startsWith('image/');
                            newItems.push({
                                id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                base64Data: b64,
                                mimeType: doc.mimeType || 'application/pdf',
                                uri: doc.uri,
                                name: doc.name || 'documento.pdf',
                                isImage: isImg,
                            });
                        }
                    }
                }
                if (newItems.length > 0) {
                    setPendingAttachments(prev => [...prev, ...newItems].slice(0, 3));
                }
            }
        } catch (err: any) {
            console.warn('[BottomTabBar] Document pick error:', err);
            Alert.alert(
                language === 'es' ? 'Error' : 'Error',
                language === 'es' ? 'No se pudo cargar el documento.' : 'Could not load document.'
            );
        }
    };

    const handleOpenAttachmentOptions = () => {
        if (isLoading) return;
        setShowAttachMenu(prev => !prev);
    };

    const handleOpenDatePicker = () => {
        if (!proposal || !('data' in proposal)) return;
        const data = proposal.data as any;
        const curDateStr = data.date || new Date().toISOString().split('T')[0];
        const parts = String(curDateStr).split('-').map(Number);
        const y = parts[0] || new Date().getFullYear();
        const m = parts[1] || new Date().getMonth() + 1;
        const d = parts[2] || new Date().getDate();
        setPickerDate(new Date(y, m - 1, d, 12, 0, 0));
        setPickerMode('date');
        setPickerVisible(true);
    };

    const handleOpenTimePicker = () => {
        if (!proposal || !('data' in proposal)) return;
        const data = proposal.data as any;
        const curTimeStr = proposal.action === 'create_event' ? data.startTime : data.time;
        const d = new Date();
        if (curTimeStr && String(curTimeStr).includes(':')) {
            const [h, min] = String(curTimeStr).split(':').map(Number);
            d.setHours(h || 0, min || 0, 0, 0);
        } else {
            d.setHours(9, 0, 0, 0);
        }
        setPickerDate(d);
        setPickerMode('time');
        setPickerVisible(true);
    };

    const handleClearTime = () => {
        if (!proposal || !('data' in proposal)) return;
        if (proposal.action === 'create_event') {
            updateProposalData((prev: any) => ({ ...prev, startTime: '09:00', endTime: '10:00' }));
        } else {
            updateProposalData((prev: any) => ({ ...prev, time: undefined }));
        }
    };

    const handlePickerChange = (selectedDate: Date) => {
        if (pickerMode === 'date') {
            const y = selectedDate.getFullYear();
            const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const d = String(selectedDate.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;
            updateProposalData((prev: any) => ({ ...prev, date: dateStr }));
        } else if (pickerMode === 'time') {
            const h = String(selectedDate.getHours()).padStart(2, '0');
            const min = String(selectedDate.getMinutes()).padStart(2, '0');
            const timeStr = `${h}:${min}`;
            if (proposal?.action === 'create_event') {
                updateProposalData((prev: any) => ({ ...prev, startTime: timeStr }));
            } else {
                updateProposalData((prev: any) => ({ ...prev, time: timeStr }));
            }
        }
    };

    const formatDateDisplay = (dateStr?: string) => {
        if (!dateStr) return language === 'es' ? 'Hoy' : 'Today';
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

        if (dateStr === todayStr) {
            return language === 'es' ? 'Hoy' : 'Today';
        }
        if (dateStr === tomorrowStr) {
            return language === 'es' ? 'Mañana' : 'Tomorrow';
        }

        try {
            const [y, m, d] = String(dateStr).split('-').map(Number);
            const monthsEs = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const months = language === 'es' ? monthsEs : monthsEn;
            return `${d} ${months[(m || 1) - 1]}${y !== now.getFullYear() ? ' ' + y : ''}`;
        } catch {
            return dateStr;
        }
    };

    const getTodayDateStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const getTomorrowDateStr = () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const getDaysAheadDateStr = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const isCustomDate = (prop: any) => {
        if (!prop || !('data' in prop)) return false;
        const d = (prop.data as any)?.date;
        if (!d) return false;
        return (
            d !== getTodayDateStr() &&
            d !== getTomorrowDateStr() &&
            d !== getDaysAheadDateStr(2) &&
            d !== getDaysAheadDateStr(7)
        );
    };

    const isCustomTime = (prop: any) => {
        if (!prop || !('data' in prop)) return false;
        const t = prop.action === 'create_event' ? (prop.data as any)?.startTime : (prop.data as any)?.time;
        if (!t) return false;
        return t !== '09:00' && t !== '14:00' && t !== '20:00';
    };

    const handleSelectQuickDate = (dateStr: string) => {
        try { Vibration.vibrate(15); } catch {}
        updateProposalData((prev: any) => ({ ...prev, date: dateStr }));
    };

    const handleSelectQuickTime = (timeStr?: string) => {
        try { Vibration.vibrate(15); } catch {}
        if (proposal?.action === 'create_event') {
            if (timeStr) {
                const [h, m] = timeStr.split(':').map(Number);
                const endH = String((h + 1) % 24).padStart(2, '0');
                const endM = String(m || 0).padStart(2, '0');
                updateProposalData((prev: any) => ({ ...prev, startTime: timeStr, endTime: `${endH}:${endM}` }));
            }
        } else {
            updateProposalData((prev: any) => ({ ...prev, time: timeStr }));
        }
    };

    const handleSelectRecurrence = (rec: 'none' | 'daily' | 'weekly' | 'monthly') => {
        try { Vibration.vibrate(15); } catch {}
        updateProposalData((prev: any) => ({ ...prev, recurrence: rec }));
    };

    const renderInlineCalendar = () => {
        const year = inlineCalendarMonth.getFullYear();
        const month = inlineCalendarMonth.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const proposalData = (proposal && 'data' in proposal) ? (proposal.data as any) : undefined;
        const curDateStr = proposalData?.date || getTodayDateStr();

        const monthNamesEs = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthNames = language === 'es' ? monthNamesEs : monthNamesEn;

        const dayCells = [];
        for (let i = 0; i < firstDay; i++) {
            dayCells.push(<View key={`empty-${i}`} style={styles.inlineDayCell} />);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isSelected = curDateStr === dateStr;
            const isToday = getTodayDateStr() === dateStr;

            dayCells.push(
                <TouchableOpacity
                    key={d}
                    style={[
                        styles.inlineDayCell,
                        isSelected && { backgroundColor: accent.primary, borderRadius: 10 },
                        !isSelected && isToday && { borderWidth: 1, borderColor: accent.primary, borderRadius: 10 },
                    ]}
                    onPress={() => {
                        handleSelectQuickDate(dateStr);
                    }}
                    activeOpacity={0.7}
                >
                    <Text
                        style={[
                            styles.inlineDayText,
                            { color: isSelected ? '#FFFFFF' : (isDark ? '#F3F4F6' : '#1F2937') },
                            (isSelected || isToday) && { fontWeight: '700' },
                        ]}
                    >
                        {d}
                    </Text>
                </TouchableOpacity>
            );
        }

        return (
            <View style={styles.inlineCalendarContainer}>
                {/* Navegación de mes */}
                <View style={styles.inlineMonthNavRow}>
                    <TouchableOpacity
                        onPress={() => {
                            try { Vibration.vibrate(10); } catch {}
                            setInlineCalendarMonth(new Date(year, month - 1, 1));
                        }}
                        style={[styles.inlineNavBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <ChevronLeft size={16} color={colors.textPrimary as any} />
                    </TouchableOpacity>

                    <Text style={[styles.inlineMonthTitleText, { color: colors.textPrimary }]}>
                        {monthNames[month]} {year}
                    </Text>

                    <TouchableOpacity
                        onPress={() => {
                            try { Vibration.vibrate(10); } catch {}
                            setInlineCalendarMonth(new Date(year, month + 1, 1));
                        }}
                        style={[styles.inlineNavBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <ChevronRight size={16} color={colors.textPrimary as any} />
                    </TouchableOpacity>
                </View>

                {/* Días de la semana */}
                <View style={styles.inlineWeekHeadersRow}>
                    {(language === 'es' ? ['D', 'L', 'M', 'M', 'J', 'V', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']).map((dw, idx) => (
                        <View key={idx} style={styles.inlineDayCell}>
                            <Text style={[styles.inlineWeekDayLabel, { color: colors.textMuted }]}>{dw}</Text>
                        </View>
                    ))}
                </View>

                {/* Grid de días */}
                <View style={styles.inlineDaysGrid}>{dayCells}</View>
            </View>
        );
    };

    const renderInlineTimeEditor = () => {
        const proposalData = (proposal && 'data' in proposal) ? (proposal.data as any) : undefined;
        const curTime = proposal?.action === 'create_event'
            ? (proposalData?.startTime || '09:00')
            : (proposalData?.time || '09:00');

        const [hStr, mStr] = String(curTime).includes(':') ? curTime.split(':') : ['09', '00'];
        let h = parseInt(hStr, 10);
        if (isNaN(h)) h = 9;
        let m = parseInt(mStr, 10);
        if (isNaN(m)) m = 0;

        const adjustHour = (delta: number) => {
            let nextH = (h + delta) % 24;
            if (nextH < 0) nextH += 24;
            const newT = `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            handleSelectQuickTime(newT);
        };

        const adjustMinute = (delta: number) => {
            let nextM = (m + delta) % 60;
            if (nextM < 0) nextM += 60;
            const newT = `${String(h).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`;
            handleSelectQuickTime(newT);
        };

        const setExactMinute = (exactM: number) => {
            const newT = `${String(h).padStart(2, '0')}:${String(exactM).padStart(2, '0')}`;
            handleSelectQuickTime(newT);
        };

        return (
            <View style={styles.inlineTimeContainer}>
                {/* Steppers grandes y accesibles */}
                <View style={styles.inlineSteppersRow}>
                    {/* Stepper Hora */}
                    <View style={[styles.inlineStepperBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                        <TouchableOpacity
                            onPress={() => adjustHour(-1)}
                            style={styles.inlineStepperActionBtn}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                            <Text style={[styles.inlineStepperPlusMinus, { color: accent.primary }]}>−</Text>
                        </TouchableOpacity>

                        <View style={styles.inlineStepperValueWrap}>
                            <Text style={[styles.inlineStepperValue, { color: colors.textPrimary }]}>
                                {String(h).padStart(2, '0')}
                            </Text>
                            <Text style={[styles.inlineStepperTag, { color: colors.textMuted }]}>
                                {language === 'es' ? 'HORA' : 'HOUR'}
                            </Text>
                        </View>

                        <TouchableOpacity
                            onPress={() => adjustHour(1)}
                            style={styles.inlineStepperActionBtn}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                            <Text style={[styles.inlineStepperPlusMinus, { color: accent.primary }]}>+</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.inlineStepperColon, { color: colors.textPrimary }]}>:</Text>

                    {/* Stepper Minutos */}
                    <View style={[styles.inlineStepperBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                        <TouchableOpacity
                            onPress={() => adjustMinute(-5)}
                            style={styles.inlineStepperActionBtn}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                            <Text style={[styles.inlineStepperPlusMinus, { color: accent.primary }]}>−</Text>
                        </TouchableOpacity>

                        <View style={styles.inlineStepperValueWrap}>
                            <Text style={[styles.inlineStepperValue, { color: colors.textPrimary }]}>
                                {String(m).padStart(2, '0')}
                            </Text>
                            <Text style={[styles.inlineStepperTag, { color: colors.textMuted }]}>
                                {language === 'es' ? 'MIN' : 'MIN'}
                            </Text>
                        </View>

                        <TouchableOpacity
                            onPress={() => adjustMinute(5)}
                            style={styles.inlineStepperActionBtn}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                            <Text style={[styles.inlineStepperPlusMinus, { color: accent.primary }]}>+</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Presets rápidos de minutos sin emoticonos */}
                <View style={styles.inlineMinutePresetsRow}>
                    {[0, 15, 30, 45].map((presetM) => {
                        const isPresetActive = m === presetM;
                        return (
                            <TouchableOpacity
                                key={presetM}
                                style={[
                                    styles.inlineMinutePresetChip,
                                    {
                                        backgroundColor: isPresetActive
                                            ? accent.primary
                                            : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)'),
                                        borderColor: isPresetActive
                                            ? accent.primary
                                            : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
                                    },
                                ]}
                                onPress={() => setExactMinute(presetM)}
                                activeOpacity={0.7}
                            >
                                <Text
                                    style={[
                                        styles.inlineMinutePresetText,
                                        {
                                            color: isPresetActive ? '#FFFFFF' : colors.textPrimary,
                                            fontWeight: isPresetActive ? '700' : '600',
                                        },
                                    ]}
                                >
                                    {`:${String(presetM).padStart(2, '0')}`}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}

                    {proposal?.action === 'create_reminder' && (
                        <TouchableOpacity
                            style={[
                                styles.inlineMinutePresetChip,
                                {
                                    backgroundColor: !proposalData?.time
                                        ? accent.primary
                                        : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)'),
                                    borderColor: !proposalData?.time
                                        ? accent.primary
                                        : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
                                },
                            ]}
                            onPress={() => handleSelectQuickTime(undefined)}
                            activeOpacity={0.7}
                        >
                            <Text
                                style={[
                                    styles.inlineMinutePresetText,
                                    {
                                        color: !proposalData?.time ? '#FFFFFF' : colors.textPrimary,
                                        fontWeight: !proposalData?.time ? '700' : '600',
                                    },
                                ]}
                            >
                                {language === 'es' ? 'Sin hora' : 'No time'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    const handleStartRecording = async () => {
        if (isLoading || isRecording) return;
        clearMessages();
        setInputPrompt('');
        recordStartTimeRef.current = Date.now();
        recordBtnScale.value = withSpring(1.15, { damping: 12, stiffness: 280 });

        // Si el teclado virtual estaba visible, preservamos el foco para que no se oculte al grabar
        if (isKeyboardVisibleRef.current) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 10);
        }

        // Haptic feedback de inicio
        try {
            Vibration.vibrate(35);
        } catch {}

        // Intento 1: Speech-to-Text nativo con transcripción en vivo si está compilado
        if (ExpoSpeechRecognitionModule && typeof ExpoSpeechRecognitionModule.requestPermissionsAsync === 'function') {
            try {
                const speechPermission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
                if (speechPermission.granted) {
                    voiceModeRef.current = 'speech';
                    setIsRecording(true);
                    ExpoSpeechRecognitionModule.start({
                        lang: language === 'es' ? 'es-ES' : 'en-US',
                        interimResults: true,
                        continuous: false,
                        addsPunctuation: true,
                    });
                    return;
                }
            } catch (speechErr) {
                console.warn('[Voice] SpeechRecognition nativo no disponible en dev-client actual, usando fallback audio...', speechErr);
            }
        }

        // Intento 2 (Fallback): Grabador de audio con expo-audio
        try {
            const permission = await AudioModule.requestRecordingPermissionsAsync();
            if (!permission.granted) {
                recordBtnScale.value = withSpring(1);
                Alert.alert(
                    language === 'es' ? 'Permiso de Micrófono' : 'Microphone Permission',
                    language === 'es'
                        ? 'Veyra requiere acceso al micrófono para registrar notas o recordatorios por voz.'
                        : 'Veyra requires microphone access to record voice reminders.'
                );
                return;
            }

            voiceModeRef.current = 'audio';
            await audioRecorder.prepareToRecordAsync();
            audioRecorder.record();
            setIsRecording(true);
        } catch (err: any) {
            console.error('[Voice] Error al iniciar grabación fallback:', err);
            recordBtnScale.value = withSpring(1);
            setIsRecording(false);
            Alert.alert(
                language === 'es' ? 'Error de Grabación' : 'Recording Error',
                language === 'es'
                    ? 'No se pudo iniciar la grabación de audio en el dispositivo.'
                    : 'Could not start audio recording on this device.'
            );
        }
    };

    const handleStopRecordingAndSend = async () => {
        recordBtnScale.value = withSpring(1, { damping: 14, stiffness: 220 });
        if (!isRecording) return;
        setIsRecording(false);

        // Si el teclado estaba abierto, garantizamos que se mantenga
        if (isKeyboardVisibleRef.current) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 20);
        }

        const elapsed = Date.now() - recordStartTimeRef.current;

        // Si fue una pulsación accidentalmente corta (< 350ms), cancelar
        if (elapsed < 350) {
            if (voiceModeRef.current === 'speech' && ExpoSpeechRecognitionModule) {
                try { ExpoSpeechRecognitionModule.stop(); } catch {}
            } else {
                try { await audioRecorder.stop(); } catch {}
            }
            setInputPrompt('');
            return;
        }

        // Haptic feedback de fin de grabación
        try {
            Vibration.vibrate(25);
        } catch {}

        if (voiceModeRef.current === 'speech') {
            if (ExpoSpeechRecognitionModule) {
                try {
                    ExpoSpeechRecognitionModule.stop();
                } catch {}
            }

            // Esperar brevemente a que el speech recognizer complete el último texto
            setTimeout(async () => {
                if (pendingAttachments.length > 0 || inputPrompt.trim()) {
                    await handleSendPrompt();
                }
            }, 300);
            return;
        }

        // Fallback: expo-audio
        try {
            setInputPrompt(language === 'es' ? 'Analizando audio...' : 'Analyzing audio...');
            await audioRecorder.stop();
            const uri = audioRecorder.uri;
            if (!uri) {
                setInputPrompt('');
                return;
            }
            const base64Audio = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
            });

            // Timeout de seguridad de 25 segundos para dar margen al cold-start y análisis multimodal
            const audioPromise = processAudioPrompt(base64Audio, 'audio/m4a');
            const timeoutPromise = new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT')), 25000)
            );

            const res = await Promise.race([audioPromise, timeoutPromise]);
            if (res?.transcription) {
                setInputPrompt(res.transcription);
            } else if (res && 'data' in res && (res.data as any)?.title) {
                setInputPrompt((res.data as any).title);
            } else {
                setInputPrompt('');
            }
        } catch (err: any) {
            console.error('[Voice] Error o timeout en audio fallback:', err);
            setInputPrompt('');
            if (err?.message === 'TIMEOUT') {
                Alert.alert(
                    language === 'es' ? 'Tiempo de espera agotado' : 'Timeout',
                    language === 'es'
                        ? 'El análisis de audio tardó demasiado en responder en la nube.'
                        : 'Audio analysis took too long in the cloud.'
                );
            }
        }
    };

    const handleManualNav = (route: string) => {
        closeCreate();
        router.push(route as any);
    };

    const handleTabReminders = () => {
        if (!isRemindersActive) {
            activeTabProgress.value = withSpring(0, {
                damping: 20,
                stiffness: 260,
                mass: 0.7,
            });
            bellScale.value = 0.88;
            bellScale.value = withSpring(1, { damping: 12, stiffness: 280 });
            if (isCreating) closeCreate();
            setMainActiveTab('reminders');
            if (pathname !== '/') router.replace('/');
        }
    };

    const handleTabNotes = () => {
        if (!isNotesActive) {
            activeTabProgress.value = withSpring(1, {
                damping: 20,
                stiffness: 260,
                mass: 0.7,
            });
            notesScale.value = 0.88;
            notesScale.value = withSpring(1, { damping: 12, stiffness: 280 });
            if (isCreating) closeCreate();
            setMainActiveTab('notes');
            if (pathname !== '/') router.replace('/');
        }
    };

    const renderProposalIcon = (action: string) => {
        switch (action) {
            case 'create_reminder':
            case 'update_reminder':
                return <Clock size={16} color="#EF4444" strokeWidth={2.4} />;
            case 'create_event':
            case 'update_event':
                return <CalendarIcon size={16} color="#3B82F6" strokeWidth={2.4} />;
            case 'create_note':
                return <Notebook size={16} color="#10B981" strokeWidth={2.4} />;
            case 'move_note':
                return <FolderIcon size={16} color="#8B5CF6" strokeWidth={2.4} />;
            case 'delete_filtered':
                return <Trash2 size={16} color="#EF4444" strokeWidth={2.4} />;
            case 'batch_update':
                return <Sparkles size={16} color="#F59E0B" strokeWidth={2.4} />;
            default:
                return <Sparkles size={16} color={accent.primary as any} strokeWidth={2.4} />;
        }
    };

    const formatFriendlyRepeatRule = (rule?: string) => {
        if (!rule || rule === 'none') return '';
        try {
            let parsed: any = rule;
            if (typeof rule === 'string' && (rule.trim().startsWith('{') || rule.trim().startsWith('['))) {
                parsed = JSON.parse(rule);
            }
            if (typeof parsed === 'object' && parsed !== null) {
                const type = parsed.type || parsed.frequency;
                const days = parsed.days;
                if (type === 'weekly') {
                    if (Array.isArray(days) && days.length > 0) {
                        const dayLabelsEs = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                        const dayLabelsEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                        if (days.length === 1) {
                            return language === 'es' ? 'Semanal' : 'Weekly';
                        }
                        if (days.length === 5 && [1, 2, 3, 4, 5].every((d: number) => days.includes(d))) {
                            return language === 'es' ? 'Lun a Vie' : 'Mon to Fri';
                        }
                        return days.map((d: number) => (language === 'es' ? dayLabelsEs[d] : dayLabelsEn[d])).join(', ');
                    }
                    return language === 'es' ? 'Semanal' : 'Weekly';
                }
                if (type === 'daily') return language === 'es' ? 'Todos los días' : 'Daily';
                if (type === 'monthly') return language === 'es' ? 'Cada mes' : 'Monthly';
                if (type === 'yearly') return language === 'es' ? 'Cada año' : 'Yearly';
            }

            const map: Record<string, string> = {
                daily: language === 'es' ? 'Todos los días' : 'Daily',
                weekly: language === 'es' ? 'Semanal' : 'Weekly',
                monthly: language === 'es' ? 'Cada mes' : 'Monthly',
                yearly: language === 'es' ? 'Cada año' : 'Yearly',
            };
            return map[String(rule).toLowerCase()] || String(rule);
        } catch {
            return language === 'es' ? 'Semanal' : 'Weekly';
        }
    };

    const formatFriendlyBatchDate = (dateStr?: string, hasRecurrence?: boolean) => {
        if (!dateStr) return '';
        try {
            const parts = String(dateStr).split('-').map(Number);
            if (parts.length < 3 || isNaN(parts[0])) return dateStr;
            const [y, m, d] = parts;
            const dateObj = new Date(y, m - 1, d);
            if (isNaN(dateObj.getTime())) return dateStr;

            const daysEs = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const monthsEs = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
            const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

            const dayName = language === 'es' ? daysEs[dateObj.getDay()] : daysEn[dateObj.getDay()];
            const monthName = language === 'es' ? monthsEs[m - 1] : monthsEn[m - 1];

            if (hasRecurrence) {
                return dayName;
            }
            return `${dayName}, ${d} ${monthName}`;
        } catch {
            return dateStr;
        }
    };

    const formatProposalDetails = (p: AIActionProposal) => {
        if (p.action === 'create_reminder') {
            const data = p.data as ReminderIntent;
            let recurText = '';
            if (data.recurrence && data.recurrence !== 'none') {
                recurText = ` · ${formatFriendlyRepeatRule(data.recurrence)}`;
            }
            return `${formatFriendlyBatchDate(data.date, Boolean(data.recurrence && data.recurrence !== 'none'))}${data.time ? ' · ' + data.time : ''} · ${(data.controlLevel || 'normal').toUpperCase()}${recurText}`;
        }
        if (p.action === 'create_event') {
            const data = p.data as EventIntent;
            const hasRecur = Boolean(data.repeatRule && data.repeatRule !== 'none');
            const recurText = hasRecur ? ` · ${formatFriendlyRepeatRule(data.repeatRule)}` : '';
            return `${formatFriendlyBatchDate(data.date, hasRecur)} · ${data.startTime} - ${data.endTime}${recurText}${data.location ? ' · ' + data.location : ''}`;
        }
        if (p.action === 'create_note') {
            const data = p.data as NoteIntent;
            return (data.content || '').slice(0, 45) + ((data.content || '').length > 45 ? '...' : '');
        }
        return '';
    };

    const renderProposalBatch = () => {
        if (!proposal || proposal.action !== 'create_batch') return null;

        const selectedCount = proposal.items.filter(i => i.selected !== false).length;
        const totalCount = proposal.items.length;
        const allSelected = selectedCount === totalCount;

        const handleToggleSelectAll = () => {
            try { Vibration.vibrate(15); } catch {}
            const shouldSelect = !allSelected;
            proposal.items.forEach(item => {
                if (item.selected !== shouldSelect) {
                    toggleBatchItem(item.id);
                }
            });
        };

        // Extraer día y hora formateados de cada sesión
        const getSessionDayTime = (item: any) => {
            const data = item.data || {};
            let day = '';

            // 1. De repeatRule si tiene days
            if (data.repeatRule) {
                try {
                    let rule = data.repeatRule;
                    if (typeof rule === 'string' && (rule.trim().startsWith('{') || rule.trim().startsWith('['))) {
                        rule = JSON.parse(rule);
                    }
                    if (rule && Array.isArray(rule.days) && rule.days.length > 0) {
                        const daysEs = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                        const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                        const list = language === 'es' ? daysEs : daysEn;
                        day = rule.days.map((d: number) => list[d]).join(', ');
                    }
                } catch {}
            }

            // 2. Si no hay día por repeatRule, extraer de data.date
            if (!day && data.date) {
                try {
                    const parts = String(data.date).split('-').map(Number);
                    if (parts.length >= 3 && !isNaN(parts[0])) {
                        const [y, m, d] = parts;
                        const dateObj = new Date(y, m - 1, d);
                        if (!isNaN(dateObj.getTime())) {
                            const daysEs = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                            const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                            day = (language === 'es' ? daysEs : daysEn)[dateObj.getDay()];
                        }
                    }
                } catch {}
            }

            // Horas limpias
            let time = '';
            if (data.startTime) {
                time = `${data.startTime}${data.endTime ? ` - ${data.endTime}` : ''}`;
            } else if (data.time) {
                time = data.time;
            }

            return { day, time };
        };

        // Agrupación inteligente por materia / título normalizado
        interface GroupedSession {
            item: any;
            dayLabel: string;
            timeLabel: string;
        }

        interface GroupedSubject {
            groupKey: string;
            title: string;
            location?: string;
            type: 'event' | 'reminder' | 'note';
            sessions: GroupedSession[];
        }

        const groups: GroupedSubject[] = [];
        const groupMap = new Map<string, GroupedSubject>();

        proposal.items.forEach(item => {
            const rawTitle = (item.data as any)?.title?.trim() || (item.data as any)?.content?.trim() || '';
            const normKey = `${item.type}_${rawTitle.toLowerCase().replace(/\s+/g, ' ')}`;
            const { day, time } = getSessionDayTime(item);

            if (!groupMap.has(normKey)) {
                const newGroup: GroupedSubject = {
                    groupKey: normKey,
                    title: rawTitle || (language === 'es' ? 'Sin título' : 'Untitled'),
                    location: (item.data as any)?.location,
                    type: item.type,
                    sessions: [{ item, dayLabel: day, timeLabel: time }],
                };
                groupMap.set(normKey, newGroup);
                groups.push(newGroup);
            } else {
                const existing = groupMap.get(normKey)!;
                if (!existing.location && (item.data as any)?.location) {
                    existing.location = (item.data as any)?.location;
                }
                existing.sessions.push({ item, dayLabel: day, timeLabel: time });
            }
        });

        return (
            <View style={styles.batchContainer}>
                {/* Header de Lote: Resumen y contador interactivo */}
                <View style={styles.batchSummaryRow}>
                    <View style={styles.batchSummaryTextWrap}>
                        <Sparkles size={14} color={accent.primary as any} strokeWidth={2.4} />
                        <Text style={[styles.batchSummaryTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {proposal.summary || (language === 'es' ? 'Elementos detectados' : 'Detected items')}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={[
                            styles.batchCountBadge,
                            {
                                backgroundColor: `${accent.primary}20`,
                                borderColor: `${accent.primary}45`,
                            },
                        ]}
                        onPress={handleToggleSelectAll}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.batchCountBadgeText, { color: accent.primary }]}>
                            {selectedCount}/{totalCount}
                        </Text>
                    </TouchableOpacity>
                </View>

                {Boolean(proposal.contextExplanation) && (
                    <Text style={[styles.batchContextText, { color: colors.textMuted }]} numberOfLines={2}>
                        {proposal.contextExplanation}
                    </Text>
                )}

                {/* Lista Scrolleable y Compacta de Materias */}
                <ScrollView
                    style={styles.batchScrollView}
                    contentContainerStyle={styles.batchScrollContent}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                    keyboardShouldPersistTaps="handled"
                >
                    {groups.map((group) => {
                        const isAllSelected = group.sessions.every(s => s.item.selected !== false);
                        const isNoneSelected = group.sessions.every(s => s.item.selected === false);
                        const isPartialSelected = !isAllSelected && !isNoneSelected;

                        const toggleGroup = () => {
                            try { Vibration.vibrate(15); } catch {}
                            const shouldSelect = !isAllSelected;
                            group.sessions.forEach(s => {
                                if ((s.item.selected !== false) !== shouldSelect) {
                                    toggleBatchItem(s.item.id);
                                }
                            });
                        };

                        const handleTitleChange = (newTitle: string) => {
                            group.sessions.forEach(s => {
                                updateBatchItemData(s.item.id, (prevData: any) => ({
                                    ...prevData,
                                    title: newTitle,
                                    ...(s.item.type === 'note' ? { content: newTitle } : {}),
                                }));
                            });
                        };

                        const iconBg = group.type === 'reminder'
                            ? (isDark ? 'rgba(239,68,68,0.18)' : '#FEE2E2')
                            : group.type === 'event'
                            ? (isDark ? 'rgba(59,130,246,0.18)' : '#DBEAFE')
                            : (isDark ? 'rgba(16,185,129,0.18)' : '#D1FAE5');

                        const iconColor = group.type === 'reminder' ? '#EF4444' : group.type === 'event' ? '#3B82F6' : '#10B981';

                        return (
                            <View
                                key={group.groupKey}
                                style={[
                                    styles.batchGroupCard,
                                    {
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                        borderColor: isAllSelected || isPartialSelected
                                            ? `${accent.primary}50`
                                            : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                                    },
                                    isNoneSelected && { opacity: 0.5 },
                                ]}
                            >
                                {/* Fila superior de la Materia: Checkbox + Icono + Nombre + Ubicación */}
                                <View style={styles.batchGroupHeader}>
                                    <TouchableOpacity
                                        style={styles.batchCheckboxWrap}
                                        onPress={toggleGroup}
                                        activeOpacity={0.7}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                        {isAllSelected ? (
                                            <CheckSquare size={18} color={accent.primary as any} strokeWidth={2.4} />
                                        ) : isPartialSelected ? (
                                            <View style={{ opacity: 0.7 }}>
                                                <CheckSquare size={18} color={accent.primary as any} strokeWidth={2.4} />
                                            </View>
                                        ) : (
                                            <Square size={18} color={colors.textMuted as any} strokeWidth={2} />
                                        )}
                                    </TouchableOpacity>

                                    <View style={[styles.batchItemIconPill, { backgroundColor: iconBg }]}>
                                        {group.type === 'reminder' && <Clock size={13} color={iconColor as any} strokeWidth={2.4} />}
                                        {group.type === 'event' && <CalendarIcon size={13} color={iconColor as any} strokeWidth={2.4} />}
                                        {group.type === 'note' && <Notebook size={13} color={iconColor as any} strokeWidth={2.4} />}
                                    </View>

                                    <View style={styles.batchGroupInfo}>
                                        <TextInput
                                            style={[
                                                styles.batchItemTitleInput,
                                                { color: colors.textPrimary },
                                                isNoneSelected && { textDecorationLine: 'line-through' },
                                            ]}
                                            value={group.title}
                                            onChangeText={handleTitleChange}
                                            placeholder={language === 'es' ? 'Materia...' : 'Course...'}
                                            placeholderTextColor={colors.textMuted}
                                            multiline={false}
                                        />

                                        {Boolean(group.location) && (
                                            <View style={styles.batchGroupLocationRow}>
                                                <MapPin size={10.5} color={colors.textMuted as any} strokeWidth={2.2} />
                                                <Text style={[styles.batchGroupLocationText, { color: colors.textMuted }]} numberOfLines={1}>
                                                    {group.location}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>

                                {/* Pastillas (Chips) Interactivas de Días y Horarios */}
                                {group.sessions.length > 0 && Boolean(group.sessions[0].timeLabel || group.sessions[0].dayLabel) && (
                                    <View style={styles.batchGroupSessionsRow}>
                                        {group.sessions.map((session) => {
                                            const isSessionSelected = session.item.selected !== false;
                                            return (
                                                <TouchableOpacity
                                                    key={session.item.id}
                                                    style={[
                                                        styles.batchSessionChip,
                                                        isSessionSelected
                                                            ? {
                                                                backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.12)',
                                                                borderColor: isDark ? 'rgba(59,130,246,0.45)' : 'rgba(59,130,246,0.35)',
                                                            }
                                                            : {
                                                                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                                                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                                                opacity: 0.5,
                                                            },
                                                    ]}
                                                    onPress={() => {
                                                        try { Vibration.vibrate(15); } catch {}
                                                        toggleBatchItem(session.item.id);
                                                    }}
                                                    activeOpacity={0.7}
                                                >
                                                    <Clock
                                                        size={11}
                                                        color={isSessionSelected ? '#3B82F6' : (colors.textMuted as any)}
                                                        strokeWidth={2.4}
                                                    />
                                                    <Text
                                                        style={[
                                                            styles.batchSessionChipText,
                                                            {
                                                                color: isSessionSelected
                                                                    ? (isDark ? '#93C5FD' : '#2563EB')
                                                                    : colors.textMuted,
                                                            },
                                                            !isSessionSelected && { textDecorationLine: 'line-through' },
                                                        ]}
                                                    >
                                                        {session.dayLabel ? `${session.dayLabel} · ` : ''}{session.timeLabel}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </ScrollView>
            </View>
        );
    };

    const renderProposalBatchUpdate = () => {
        if (!proposal || proposal.action !== 'batch_update') return null;

        const selectedCount = proposal.items.filter(i => i.selected !== false).length;
        const totalCount = proposal.items.length;
        const allSelected = selectedCount === totalCount;

        const handleToggleSelectAll = () => {
            const shouldSelect = !allSelected;
            proposal.items.forEach(item => {
                if (item.selected !== shouldSelect) {
                    toggleBatchItem(item.id);
                }
            });
        };

        const isEvent = proposal.targetType === 'event';

        return (
            <View style={styles.batchContainer}>
                <View style={styles.batchSummaryRow}>
                    <View style={styles.batchSummaryTextWrap}>
                        <Sparkles size={14} color={accent.primary as any} strokeWidth={2.4} />
                        <Text style={[styles.batchSummaryTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                            {proposal.summary || (language === 'es' ? 'Actualizaciones en lote' : 'Batch updates')}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={[
                            styles.batchCountBadge,
                            {
                                backgroundColor: `${accent.primary}20`,
                                borderColor: `${accent.primary}45`,
                            },
                        ]}
                        onPress={handleToggleSelectAll}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.batchCountBadgeText, { color: accent.primary }]}>
                            {selectedCount}/{totalCount}
                        </Text>
                    </TouchableOpacity>
                </View>

                {Boolean(proposal.contextExplanation) && (
                    <Text style={[styles.batchContextText, { color: colors.textMuted }]} numberOfLines={2}>
                        {proposal.contextExplanation}
                    </Text>
                )}

                <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                    <View style={styles.batchItemsList}>
                        {proposal.items.map((item) => {
                            const isSelected = item.selected !== false;
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    style={[
                                        styles.batchItemCard,
                                        {
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                            borderColor: isSelected
                                                ? `${accent.primary}60`
                                                : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                                        },
                                        !isSelected && { opacity: 0.5 },
                                    ]}
                                    activeOpacity={0.7}
                                    onPress={() => toggleBatchItem(item.id)}
                                >
                                    <View style={styles.batchCheckboxWrap}>
                                        {isSelected ? (
                                            <CheckSquare size={17} color={accent.primary as any} strokeWidth={2.4} />
                                        ) : (
                                            <Square size={17} color={colors.textMuted as any} strokeWidth={2} />
                                        )}
                                    </View>
                                    <View style={[styles.batchItemIconPill, { backgroundColor: isEvent ? (isDark ? 'rgba(59,130,246,0.18)' : '#DBEAFE') : (isDark ? 'rgba(245,158,11,0.18)' : '#FEF3C7') }]}>
                                        {isEvent ? <CalendarIcon size={13} color="#3B82F6" strokeWidth={2.4} /> : <Clock size={13} color="#F59E0B" strokeWidth={2.4} />}
                                    </View>
                                    <View style={styles.batchItemInfo}>
                                        <Text
                                            style={[
                                                styles.batchItemTitleInput,
                                                { color: colors.textPrimary },
                                                !isSelected && { textDecorationLine: 'line-through' },
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {item.title}
                                        </Text>
                                        {(item.currentValue || item.newValue) && (
                                            <View style={styles.batchItemSubRow}>
                                                {Boolean(item.currentValue) && (
                                                    <Text style={[styles.batchItemSubText, { color: colors.textMuted, textDecorationLine: 'line-through' }]}>
                                                        {item.currentValue}
                                                    </Text>
                                                )}
                                                {Boolean(item.currentValue && item.newValue) && (
                                                    <Text style={[styles.batchItemSubText, { color: colors.textMuted }]}> → </Text>
                                                )}
                                                {Boolean(item.newValue) && (
                                                    <Text style={[styles.batchItemSubText, { color: accent.primary, fontWeight: '600' }]}>
                                                        {item.newValue}
                                                    </Text>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>
        );
    };

    const renderProposalMoveNote = () => {
        if (!proposal || proposal.action !== 'move_note') return null;

        return (
            <View style={styles.batchContainer}>
                <View style={styles.batchSummaryRow}>
                    <View style={styles.batchSummaryTextWrap}>
                        <FolderIcon size={16} color="#8B5CF6" strokeWidth={2.4} />
                        <Text style={[styles.batchSummaryTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                            {proposal.summary || `${language === 'es' ? 'Mover a' : 'Move to'} "${proposal.folderName}"`}
                        </Text>
                    </View>
                    <View
                        style={[
                            styles.batchCountBadge,
                            {
                                backgroundColor: 'rgba(139,92,246,0.15)',
                                borderColor: 'rgba(139,92,246,0.3)',
                            },
                        ]}
                    >
                        <Text style={[styles.batchCountBadgeText, { color: '#8B5CF6' }]}>
                            {proposal.targetIds.length} {language === 'es' ? 'nota(s)' : 'note(s)'}
                        </Text>
                    </View>
                </View>

                <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
                    <View style={styles.batchItemsList}>
                        {proposal.targetIds.map((id, index) => {
                            const title = proposal.targetTitles?.[index] || `Nota ${index + 1}`;
                            return (
                                <View
                                    key={id}
                                    style={[
                                        styles.batchItemCard,
                                        {
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                        },
                                    ]}
                                >
                                    <View style={[styles.batchItemIconPill, { backgroundColor: isDark ? 'rgba(139,92,246,0.18)' : '#EDE9FE' }]}>
                                        <Notebook size={13} color="#8B5CF6" strokeWidth={2.4} />
                                    </View>
                                    <View style={styles.batchItemInfo}>
                                        <Text style={[styles.batchItemTitleInput, { color: colors.textPrimary }]} numberOfLines={1}>
                                            {title}
                                        </Text>
                                    </View>
                                    <ArrowRight size={13} color={colors.textMuted as any} />
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#8B5CF6', marginLeft: 6 }}>
                                        {proposal.folderName}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>
        );
    };

    const renderProposalDeleteFiltered = () => {
        if (!proposal || proposal.action !== 'delete_filtered') return null;

        return (
            <View style={styles.batchContainer}>
                <View style={styles.batchSummaryRow}>
                    <View style={styles.batchSummaryTextWrap}>
                        <Trash2 size={16} color="#EF4444" strokeWidth={2.4} />
                        <Text style={[styles.batchSummaryTitle, { color: '#EF4444' }]} numberOfLines={2}>
                            {proposal.summary || (language === 'es' ? 'Eliminar elementos' : 'Delete items')}
                        </Text>
                    </View>
                    <View
                        style={[
                            styles.batchCountBadge,
                            {
                                backgroundColor: 'rgba(239,68,68,0.15)',
                                borderColor: 'rgba(239,68,68,0.3)',
                            },
                        ]}
                    >
                        <Text style={[styles.batchCountBadgeText, { color: '#EF4444' }]}>
                            {proposal.targetIds.length} {language === 'es' ? 'a borrar' : 'to delete'}
                        </Text>
                    </View>
                </View>

                <View
                    style={[
                        styles.proposalContextBanner,
                        {
                            backgroundColor: 'rgba(239,68,68,0.08)',
                            borderColor: 'rgba(239,68,68,0.25)',
                        },
                    ]}
                >
                    <AlertCircle size={13} color="#EF4444" strokeWidth={2.4} />
                    <Text style={[styles.proposalContextBannerText, { color: colors.textPrimary }]} numberOfLines={2}>
                        {language === 'es'
                            ? `${proposal.filterDescription}. Podrás restaurarlos desde el Historial o Papelera.`
                            : `${proposal.filterDescription}. You can restore them from History or Trash.`}
                    </Text>
                </View>

                {Boolean(proposal.targetTitles && proposal.targetTitles.length > 0) && (
                    <ScrollView style={{ maxHeight: 110 }} showsVerticalScrollIndicator={false}>
                        <View style={styles.batchItemsList}>
                            {proposal.targetTitles!.map((title, idx) => (
                                <View
                                    key={idx}
                                    style={[
                                        styles.batchItemCard,
                                        {
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                        },
                                    ]}
                                >
                                    <View style={[styles.batchItemIconPill, { backgroundColor: isDark ? 'rgba(239,68,68,0.18)' : '#FEE2E2' }]}>
                                        <Trash2 size={12} color="#EF4444" strokeWidth={2.4} />
                                    </View>
                                    <View style={styles.batchItemInfo}>
                                        <Text style={[styles.batchItemTitleInput, { color: colors.textPrimary }]} numberOfLines={1}>
                                            {title}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </ScrollView>
                )}
            </View>
        );
    };

    const renderProposalEditSingle = () => {
        if (!proposal || (proposal.action !== 'update_reminder' && proposal.action !== 'update_event')) return null;

        const isEvent = proposal.action === 'update_event';
        const changes = (proposal.changes || {}) as any;

        return (
            <View style={styles.batchContainer}>
                {/* Header */}
                <View style={styles.batchSummaryRow}>
                    <View style={styles.batchSummaryTextWrap}>
                        {isEvent ? (
                            <CalendarIcon size={16} color="#3B82F6" strokeWidth={2.4} />
                        ) : (
                            <Clock size={16} color="#F59E0B" strokeWidth={2.4} />
                        )}
                        <Text style={[styles.batchSummaryTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                            {proposal.summary}
                        </Text>
                    </View>
                    <View
                        style={[
                            styles.batchCountBadge,
                            {
                                backgroundColor: isEvent ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)',
                                borderColor: isEvent ? 'rgba(59,130,246,0.3)' : 'rgba(245,158,11,0.3)',
                            },
                        ]}
                    >
                        <Text style={[styles.batchCountBadgeText, { color: isEvent ? '#3B82F6' : '#F59E0B' }]}>
                            {isEvent ? (language === 'es' ? 'Evento' : 'Event') : (language === 'es' ? 'Recordatorio' : 'Reminder')}
                        </Text>
                    </View>
                </View>

                {/* Target item title card */}
                <View
                    style={[
                        styles.proposalTitleRow,
                        {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                        },
                    ]}
                >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }} numberOfLines={1}>
                        "{proposal.targetTitle || (language === 'es' ? 'Elemento existente' : 'Existing item')}"
                    </Text>
                </View>

                {/* Changes chips */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {Boolean(changes.title) && (
                        <View style={[styles.batchSubTag, { backgroundColor: `${accent.primary}18`, paddingHorizontal: 10, paddingVertical: 5 }]}>
                            <Text style={{ fontSize: 12, color: accent.primary, fontWeight: '600' }}>
                                {language === 'es' ? 'Nuevo título: ' : 'New title: '} {changes.title}
                            </Text>
                        </View>
                    )}
                    {Boolean(changes.date) && (
                        <View style={[styles.batchSubTag, { backgroundColor: 'rgba(59,130,246,0.15)', paddingHorizontal: 10, paddingVertical: 5 }]}>
                            <CalendarIcon size={12} color="#3B82F6" strokeWidth={2.4} />
                            <Text style={{ fontSize: 12, color: '#3B82F6', fontWeight: '600', marginLeft: 4 }}>
                                {changes.date}
                            </Text>
                        </View>
                    )}
                    {Boolean(changes.time || changes.startTime) && (
                        <View style={[styles.batchSubTag, { backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 10, paddingVertical: 5 }]}>
                            <Clock size={12} color="#F59E0B" strokeWidth={2.4} />
                            <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600', marginLeft: 4 }}>
                                {changes.time || `${changes.startTime}${changes.endTime ? ` - ${changes.endTime}` : ''}`}
                            </Text>
                        </View>
                    )}
                    {Boolean(changes.control_level) && (
                        <View style={[styles.batchSubTag, { backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 10, paddingVertical: 5 }]}>
                            <Bell size={12} color="#EF4444" strokeWidth={2.4} />
                            <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '600', marginLeft: 4 }}>
                                {String(changes.control_level).toUpperCase()}
                            </Text>
                        </View>
                    )}
                    {Boolean(changes.location) && (
                        <View style={[styles.batchSubTag, { backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 10, paddingVertical: 5 }]}>
                            <MapPin size={12} color="#10B981" strokeWidth={2.4} />
                            <Text style={{ fontSize: 12, color: '#10B981', fontWeight: '600', marginLeft: 4 }}>
                                {changes.location}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Banner si hay contextExplanation */}
                {Boolean(proposal.contextExplanation) && (
                    <View
                        style={[
                            styles.proposalContextBanner,
                            {
                                backgroundColor: `${accent.primary}15`,
                                borderColor: `${accent.primary}38`,
                                marginTop: 10,
                            },
                        ]}
                    >
                        <Sparkles size={13} color={accent.primary as any} strokeWidth={2.4} />
                        <Text style={[styles.proposalContextBannerText, { color: colors.textPrimary }]} numberOfLines={2}>
                            {proposal.contextExplanation}
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <>
            {/* Backdrop oscuro translúcido para cerrar al pulsar fuera */}
            {(isCreating || isSharingEvents) && (
                <TouchableWithoutFeedback
                    onPress={() => {
                        if (isSharingEvents) {
                            useShareEventsStore.getState().closeShare();
                        } else if (isCreating && !isLoading) {
                            closeCreate();
                        }
                    }}
                >
                    <Animated.View
                        style={[
                            StyleSheet.absoluteFill,
                            styles.backdrop,
                            backdropAnimatedStyle,
                        ]}
                    />
                </TouchableWithoutFeedback>
            )}

            {/* Dock Principal Flotante (Samsung One UI) con Morph a Creación y Selección */}
            <Animated.View
                pointerEvents="box-none"
                style={[
                    styles.dockOuterContainer,
                    dockContainerAnimatedStyle,
                ]}
            >
                <Animated.View
                    style={[
                        styles.dockWrapper,
                        {
                            backgroundColor: dockBg,
                            borderColor: dockBorder,
                        },
                        dockAnimatedStyle,
                    ]}
                >
                    {/* Capa 1: Navegación Principal (Tabs normales) */}
                    <Animated.View
                        style={[
                            styles.normalNavRow,
                            normalTabsAnimatedStyle,
                            (isCreating || Boolean(proposal)) && styles.normalNavRowHidden,
                        ]}
                        pointerEvents={isSelecting || isCreating || Boolean(proposal) ? 'none' : 'auto'}
                    >
                        {/* Tab Recordatorios */}
                        <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={handleTabReminders}
                            style={styles.tabButton}
                            hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
                        >
                            <View style={styles.iconContainer}>
                                <Animated.View
                                    style={[
                                        styles.tabActivePill,
                                        { backgroundColor: activePillBg },
                                        bellPillStyle,
                                    ]}
                                />
                                <Animated.View style={bellAnimatedStyle}>
                                    <Bell
                                        size={19}
                                        color={isRemindersActive ? (accent.primary as any) : (colors.textMuted as any)}
                                        strokeWidth={isRemindersActive ? 2.5 : 2}
                                    />
                                </Animated.View>
                            </View>
                            <Text
                                style={[
                                    styles.tabLabel,
                                    {
                                        color: isRemindersActive ? colors.textPrimary : colors.textMuted,
                                        fontWeight: isRemindersActive ? '700' : '500',
                                    },
                                ]}
                                numberOfLines={1}
                            >
                                {language === 'es' ? 'Recordatorios' : 'Reminders'}
                            </Text>
                        </TouchableOpacity>

                        {/* Botón Central Hero (+) */}
                        <Animated.View style={fabAnimatedStyle}>
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={handleFabPress}
                                onLongPress={handleFabLongPress}
                                onPressIn={handleFabPressIn}
                                onPressOut={handleFabPressOut}
                                style={styles.centerButton}
                                hitSlop={{ top: 10, bottom: 8, left: 12, right: 12 }}
                            >
                                <View
                                    style={[
                                        styles.centerIconContainer,
                                        {
                                            backgroundColor: (isInsideFolder && activeFolder?.color)
                                                ? activeFolder.color
                                                : accent.primary,
                                            borderColor: dockBg,
                                        },
                                    ]}
                                >
                                    <Animated.View style={fabRotateStyle}>
                                        <Plus size={22} color="#FFFFFF" strokeWidth={2.8} />
                                    </Animated.View>
                                </View>
                                <Text
                                    style={[
                                        styles.tabLabel,
                                        {
                                            color: isCreating
                                                ? accent.primary
                                                : (isInsideFolder && activeFolder?.color ? activeFolder.color : colors.textSecondary),
                                            fontWeight: isInsideFolder ? '700' : '600',
                                        },
                                    ]}
                                    numberOfLines={1}
                                >
                                    {isInsideFolder
                                        ? (language === 'es' ? 'Nota' : 'Note')
                                        : (language === 'es' ? 'Crear' : 'Create')}
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Tab Notas */}
                        <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={handleTabNotes}
                            style={styles.tabButton}
                            hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
                        >
                            <View style={styles.iconContainer}>
                                <Animated.View
                                    style={[
                                        styles.tabActivePill,
                                        { backgroundColor: activePillBg },
                                        notesPillStyle,
                                    ]}
                                />
                                <Animated.View style={notesAnimatedStyle}>
                                    <Notebook
                                        size={19}
                                        color={isNotesActive ? (accent.primary as any) : (colors.textMuted as any)}
                                        strokeWidth={isNotesActive ? 2.5 : 2}
                                    />
                                </Animated.View>
                            </View>
                            <Text
                                style={[
                                    styles.tabLabel,
                                    {
                                        color: isNotesActive ? colors.textPrimary : colors.textMuted,
                                        fontWeight: isNotesActive ? '700' : '500',
                                    },
                                ]}
                                numberOfLines={1}
                            >
                                {language === 'es' ? 'Notas' : 'Notes'}
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Capa 2: Tarjeta de Creación Morpheada (IA + Accesos Directos) */}
                    <Animated.View
                        style={[
                            StyleSheet.absoluteFill,
                            styles.createContentContainer,
                            { backgroundColor: dockBg },
                            createCardAnimatedStyle,
                        ]}
                        pointerEvents={isCreating || Boolean(proposal) ? 'auto' : 'none'}
                    >
                        {/* Fila superior: Título con Sparkles + Botón Cerrar X */}
                        <View style={styles.createTopRow}>
                            <View style={styles.createTitleWrap}>
                                <Sparkles size={18} color={accent.primary as any} />
                                <Text style={[styles.createTitleText, { color: colors.textPrimary }]}>
                                    {proposal
                                        ? (language === 'es' ? 'Propuesta de IA' : 'AI Proposal')
                                        : (language === 'es' ? 'Crear con Veyra' : 'Create with Veyra')}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={closeCreate}
                                style={[
                                    styles.createCloseBtn,
                                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                                ]}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                activeOpacity={0.7}
                            >
                                <X size={16} color={colors.textSecondary as any} />
                            </TouchableOpacity>
                        </View>

                        {/* Contenido condicional: Propuesta de IA vs Input Inteligente y Opciones Rápidas */}
                        {proposal ? (
                            <View style={styles.proposalWrap}>
                                <View style={styles.proposalContentWrap}>
                                    {proposal.action === 'create_batch' ? (
                                        renderProposalBatch()
                                    ) : proposal.action === 'batch_update' ? (
                                        renderProposalBatchUpdate()
                                    ) : proposal.action === 'move_note' ? (
                                        renderProposalMoveNote()
                                    ) : proposal.action === 'delete_filtered' ? (
                                        renderProposalDeleteFiltered()
                                    ) : proposal.action === 'update_reminder' || proposal.action === 'update_event' ? (
                                        renderProposalEditSingle()
                                    ) : (
                                        <>
                                            {/* Input del Título (Editable en tiempo real) */}
                                            <View style={[styles.proposalTitleRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)' }]}>
                                    <View style={styles.proposalBadgeIcon}>
                                        {renderProposalIcon(proposal.action)}
                                    </View>
                                    <TextInput
                                        style={[styles.proposalTitleInput, { color: colors.textPrimary }]}
                                        value={('data' in proposal && (proposal.data as any)?.title) || ''}
                                        onChangeText={(newTitle) => {
                                            updateProposalData((prev: any) => ({ ...prev, title: newTitle }));
                                        }}
                                        placeholder={language === 'es' ? 'Título de la tarea...' : 'Task title...'}
                                        placeholderTextColor={colors.textMuted}
                                        returnKeyType="done"
                                        selectTextOnFocus
                                    />
                                </View>

                                {/* Banner inteligente de Conciencia de Agenda */}
                                {Boolean((proposal as any)?.data?.contextExplanation) && (
                                    <View
                                        style={[
                                            styles.proposalContextBanner,
                                            {
                                                backgroundColor: `${accent.primary}15`,
                                                borderColor: `${accent.primary}38`,
                                            },
                                        ]}
                                    >
                                        <Sparkles size={13} color={accent.primary as any} strokeWidth={2.4} />
                                        <Text
                                            style={[styles.proposalContextBannerText, { color: colors.textPrimary }]}
                                            numberOfLines={2}
                                        >
                                            {(proposal as any).data.contextExplanation}
                                        </Text>
                                    </View>
                                )}

                                 {/* Bloques One UI Interactivos con Desplegado/Plegado (Morph Inline) */}
                                 {('data' in proposal) && (
                                     <View style={styles.proposalBlocksContainer}>
                                         {/* Bloque 1: Fecha (One UI Card Plegable/Desplegable) */}
                                         {expandedSection !== 'time' && (
                                             <View
                                                 style={[
                                                     styles.proposalOneUiBlock,
                                                     {
                                                         backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                                                         borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.07)',
                                                     },
                                                     expandedSection === 'date' && { borderColor: `${accent.primary}50` },
                                                 ]}
                                             >
                                                 <View style={styles.proposalBlockHeaderRow}>
                                                     <View style={styles.proposalBlockHeaderLeft}>
                                                         <CalendarIcon size={15} color={accent.primary as any} strokeWidth={2.4} />
                                                         <Text style={[styles.proposalBlockHeaderLabel, { color: colors.textSecondary }]}>
                                                             {language === 'es' ? 'Fecha:' : 'Date:'}
                                                         </Text>
                                                         <Text style={[styles.proposalBlockHeaderValue, { color: colors.textPrimary }]}>
                                                             {formatDateDisplay((proposal.data as any)?.date)}
                                                         </Text>
                                                     </View>
                                                     <TouchableOpacity
                                                         onPress={() => {
                                                             try { Vibration.vibrate(20); } catch {}
                                                             setExpandedSection(prev => prev === 'date' ? 'none' : 'date');
                                                         }}
                                                         style={[
                                                             styles.proposalBlockHeaderBtn,
                                                             {
                                                                 backgroundColor: expandedSection === 'date'
                                                                     ? accent.primary
                                                                     : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                                                             },
                                                         ]}
                                                         activeOpacity={0.7}
                                                     >
                                                        {expandedSection === 'date' ? (
                                                            <ChevronUp size={16} color="#FFFFFF" strokeWidth={2.8} />
                                                        ) : (
                                                            <ChevronDown size={16} color={colors.textPrimary as any} strokeWidth={2.4} />
                                                        )}
                                                     </TouchableOpacity>
                                                 </View>

                                                 {/* Vista Desplegada: Mini Calendario Inline */}
                                                 {expandedSection === 'date' ? (
                                                     renderInlineCalendar()
                                                 ) : (
                                                     /* Vista Plegada: Accesos Rápidos de 1 toque */
                                                     <View style={styles.proposalQuickChipsRow}>
                                                         {[
                                                             { key: 'today', label: language === 'es' ? 'Hoy' : 'Today', val: getTodayDateStr() },
                                                             { key: 'tomorrow', label: language === 'es' ? 'Mañana' : 'Tomorrow', val: getTomorrowDateStr() },
                                                             { key: 'twoDays', label: language === 'es' ? '+2 días' : '+2 days', val: getDaysAheadDateStr(2) },
                                                             { key: 'nextWeek', label: language === 'es' ? '+1 sem' : '+1 wk', val: getDaysAheadDateStr(7) },
                                                         ].map((chip) => {
                                                             const isSelected = ((proposal.data as any)?.date || getTodayDateStr()) === chip.val;
                                                             return (
                                                                 <TouchableOpacity
                                                                     key={chip.key}
                                                                     style={[
                                                                         styles.proposalQuickChip,
                                                                         {
                                                                             backgroundColor: isSelected
                                                                                 ? accent.primary
                                                                                 : (isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.04)'),
                                                                             borderColor: isSelected
                                                                                 ? accent.primary
                                                                                 : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                                                                         },
                                                                     ]}
                                                                     onPress={() => handleSelectQuickDate(chip.val)}
                                                                     activeOpacity={0.75}
                                                                 >
                                                                     <Text
                                                                         style={[
                                                                             styles.proposalQuickChipText,
                                                                             {
                                                                                 color: isSelected ? '#FFFFFF' : colors.textPrimary,
                                                                                 fontWeight: isSelected ? '700' : '600',
                                                                             },
                                                                         ]}
                                                                     >
                                                                         {chip.label}
                                                                     </Text>
                                                                 </TouchableOpacity>
                                                             );
                                                         })}
                                                     </View>
                                                 )}
                                             </View>
                                         )}

                                         {/* Bloque 2: Hora (One UI Card Plegable/Desplegable) - si no es nota */}
                                         {proposal.action !== 'create_note' && expandedSection !== 'date' && (
                                             <View
                                                 style={[
                                                     styles.proposalOneUiBlock,
                                                     {
                                                         backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                                                         borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.07)',
                                                     },
                                                     expandedSection === 'time' && { borderColor: `${accent.primary}50` },
                                                 ]}
                                             >
                                                 <View style={styles.proposalBlockHeaderRow}>
                                                     <View style={styles.proposalBlockHeaderLeft}>
                                                         <Clock size={15} color={accent.primary as any} strokeWidth={2.4} />
                                                         <Text style={[styles.proposalBlockHeaderLabel, { color: colors.textSecondary }]}>
                                                             {language === 'es' ? 'Hora:' : 'Time:'}
                                                         </Text>
                                                         <Text style={[styles.proposalBlockHeaderValue, { color: colors.textPrimary }]}>
                                                             {proposal.action === 'create_event'
                                                                 ? `${(proposal.data as any)?.startTime || '09:00'} - ${(proposal.data as any)?.endTime || '10:00'}`
                                                                 : ((proposal.data as any)?.time || (language === 'es' ? 'Sin hora' : 'No time'))}
                                                         </Text>
                                                     </View>
                                                     <TouchableOpacity
                                                         onPress={() => {
                                                             try { Vibration.vibrate(20); } catch {}
                                                             setExpandedSection(prev => prev === 'time' ? 'none' : 'time');
                                                         }}
                                                         style={[
                                                             styles.proposalBlockHeaderBtn,
                                                             {
                                                                 backgroundColor: expandedSection === 'time'
                                                                     ? accent.primary
                                                                     : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                                                             },
                                                         ]}
                                                         activeOpacity={0.7}
                                                     >
                                                        {expandedSection === 'time' ? (
                                                            <ChevronUp size={16} color="#FFFFFF" strokeWidth={2.8} />
                                                        ) : (
                                                            <ChevronDown size={16} color={colors.textPrimary as any} strokeWidth={2.4} />
                                                        )}
                                                     </TouchableOpacity>
                                                 </View>

                                                 {/* Vista Desplegada: Editor de Hora Inline */}
                                                 {expandedSection === 'time' ? (
                                                     renderInlineTimeEditor()
                                                 ) : (
                                                     /* Vista Plegada: Accesos Rápidos de Hora (SIN EMOTICONOS) */
                                                     <View style={styles.proposalQuickChipsRow}>
                                                         {[
                                                             { key: 'h09', label: '09:00', val: '09:00' },
                                                             { key: 'h14', label: '14:00', val: '14:00' },
                                                             { key: 'h20', label: '20:00', val: '20:00' },
                                                             ...(proposal.action === 'create_reminder'
                                                                 ? [{ key: 'notime', label: language === 'es' ? 'Sin hora' : 'No time', val: undefined }]
                                                                 : []),
                                                         ].map((chip) => {
                                                             const currentT = proposal.action === 'create_event'
                                                                 ? (proposal.data as any)?.startTime
                                                                 : (proposal.data as any)?.time;
                                                             const isSelected = chip.val === undefined ? !currentT : currentT === chip.val;
                                                             return (
                                                                 <TouchableOpacity
                                                                     key={chip.key}
                                                                     style={[
                                                                         styles.proposalQuickChip,
                                                                         {
                                                                             backgroundColor: isSelected
                                                                                 ? accent.primary
                                                                                 : (isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.04)'),
                                                                             borderColor: isSelected
                                                                                 ? accent.primary
                                                                                 : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                                                                         },
                                                                     ]}
                                                                     onPress={() => handleSelectQuickTime(chip.val)}
                                                                     activeOpacity={0.75}
                                                                 >
                                                                     <Text
                                                                         style={[
                                                                             styles.proposalQuickChipText,
                                                                             {
                                                                                 color: isSelected ? '#FFFFFF' : colors.textPrimary,
                                                                                 fontWeight: isSelected ? '700' : '600',
                                                                             },
                                                                         ]}
                                                                     >
                                                                         {chip.label}
                                                                     </Text>
                                                                 </TouchableOpacity>
                                                             );
                                                         })}
                                                     </View>
                                                 )}
                                             </View>
                                         )}

                                         {/* Bloque 3: Recurrencia interactiva (solo visible si ninguna sección está expandida) */}
                                         {proposal.action === 'create_reminder' && expandedSection === 'none' && (
                                             <View style={styles.proposalRecurrenceRow}>
                                                 {[
                                                     { key: 'none', label: language === 'es' ? 'Una vez' : 'Once' },
                                                     { key: 'daily', label: language === 'es' ? 'Diario' : 'Daily' },
                                                     { key: 'weekly', label: language === 'es' ? 'Semanal' : 'Weekly' },
                                                     { key: 'monthly', label: language === 'es' ? 'Mensual' : 'Monthly' },
                                                 ].map((chip) => {
                                                     const currentRec = (proposal.data as any)?.recurrence || 'none';
                                                     const isSelected = currentRec === chip.key;
                                                     return (
                                                         <TouchableOpacity
                                                             key={chip.key}
                                                             style={[
                                                                 styles.proposalRecurrenceChip,
                                                                 {
                                                                     backgroundColor: isSelected
                                                                         ? `${accent.primary}22`
                                                                         : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
                                                                     borderColor: isSelected
                                                                         ? accent.primary
                                                                         : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                                                                 },
                                                             ]}
                                                             onPress={() => handleSelectRecurrence(chip.key as any)}
                                                             activeOpacity={0.7}
                                                         >
                                                             <Text
                                                                 style={[
                                                                     styles.proposalRecurrenceText,
                                                                     {
                                                                         color: isSelected ? accent.primary : colors.textSecondary,
                                                                         fontWeight: isSelected ? '700' : '600',
                                                                     },
                                                                 ]}
                                                             >
                                                                 {chip.label}
                                                             </Text>
                                                         </TouchableOpacity>
                                                     );
                                                 })}
                                             </View>
                                         )}
                                     </View>
                                 )}
                                        </>
                                    )}
                                </View>

                                {/* Botones Grandes y Accesibles: Descartar y Confirmar */}
                                <View style={styles.proposalButtonsRow}>
                                    <TouchableOpacity
                                        style={[
                                            styles.proposalDiscardBtn,
                                            { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                                        ]}
                                        onPress={cancelProposal}
                                        disabled={isLoading}
                                        activeOpacity={0.7}
                                    >
                                        <X size={18} color={colors.textSecondary as any} strokeWidth={2.6} />
                                        <Text style={[styles.proposalDiscardText, { color: colors.textSecondary }]}>
                                            {language === 'es' ? 'Descartar' : 'Discard'}
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[
                                            styles.proposalConfirmBtn,
                                            {
                                                backgroundColor: proposal.action === 'delete_filtered' ? '#EF4444' : accent.primary,
                                            },
                                            ((proposal.action === 'create_batch' || proposal.action === 'batch_update') &&
                                                proposal.items.filter(i => i.selected !== false).length === 0) && { opacity: 0.5 },
                                        ]}
                                        onPress={handleConfirmProposal}
                                        disabled={
                                            isLoading ||
                                            ((proposal.action === 'create_batch' || proposal.action === 'batch_update') &&
                                                proposal.items.filter(i => i.selected !== false).length === 0)
                                        }
                                        activeOpacity={0.8}
                                    >
                                        {isLoading ? (
                                            <ActivityIndicator size="small" color="#FFFFFF" />
                                        ) : (
                                            <>
                                                {proposal.action === 'delete_filtered' ? (
                                                    <Trash2 size={18} color="#FFFFFF" strokeWidth={2.6} />
                                                ) : (
                                                    <Check size={20} color="#FFFFFF" strokeWidth={3} />
                                                )}
                                                <Text style={styles.proposalConfirmText}>
                                                    {proposal.action === 'create_batch'
                                                        ? (language === 'es'
                                                            ? `Guardar (${proposal.items.filter(i => i.selected !== false).length})`
                                                            : `Save (${proposal.items.filter(i => i.selected !== false).length})`)
                                                        : proposal.action === 'batch_update'
                                                        ? (language === 'es'
                                                            ? `Actualizar (${proposal.items.filter(i => i.selected !== false).length})`
                                                            : `Update (${proposal.items.filter(i => i.selected !== false).length})`)
                                                        : proposal.action === 'delete_filtered'
                                                        ? (language === 'es'
                                                            ? `Eliminar (${proposal.targetIds.length})`
                                                            : `Delete (${proposal.targetIds.length})`)
                                                        : proposal.action === 'move_note'
                                                        ? (language === 'es'
                                                            ? `Mover (${proposal.targetIds.length})`
                                                            : `Move (${proposal.targetIds.length})`)
                                                        : proposal.action === 'update_reminder' || proposal.action === 'update_event'
                                                        ? (language === 'es' ? 'Aplicar cambio' : 'Apply change')
                                                        : (language === 'es' ? 'Confirmar' : 'Confirm')}
                                                </Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <>
                                {/* Previsualización de adjuntos pendientes */}
                                {pendingAttachments.length > 0 && (
                                    <View style={styles.pendingAttachStrip}>
                                        {pendingAttachments.map((att) => (
                                            <View key={att.id} style={styles.pendingAttachItem}>
                                                {att.isImage ? (
                                                    <RNImage
                                                        source={{ uri: att.uri }}
                                                        style={styles.pendingAttachThumb}
                                                        resizeMode="cover"
                                                    />
                                                ) : (
                                                    <View
                                                        style={[
                                                            styles.pendingAttachDocThumb,
                                                            { backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : '#DBEAFE' },
                                                        ]}
                                                    >
                                                        <FileText size={16} color="#3B82F6" strokeWidth={2.2} />
                                                        <Text style={styles.pendingAttachDocExt} numberOfLines={1}>
                                                            PDF
                                                        </Text>
                                                    </View>
                                                )}
                                                <TouchableOpacity
                                                    style={styles.pendingAttachRemoveBtn}
                                                    onPress={() => handleRemoveAttachment(att.id)}
                                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                                    activeOpacity={0.8}
                                                >
                                                    <X size={9} color="#FFFFFF" strokeWidth={3} />
                                                </TouchableOpacity>
                                            </View>
                                        ))}

                                        {pendingAttachments.length < 3 && (
                                            <TouchableOpacity
                                                style={[
                                                    styles.pendingAttachAddMoreBtn,
                                                    {
                                                        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
                                                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                                                    },
                                                ]}
                                                onPress={handleOpenAttachmentOptions}
                                                activeOpacity={0.7}
                                            >
                                                <Plus size={16} color={colors.textSecondary as any} strokeWidth={2.4} />
                                            </TouchableOpacity>
                                        )}

                                        <View style={styles.pendingAttachCountWrap}>
                                            <Text style={[styles.pendingAttachCountText, { color: colors.textMuted }]}>
                                                {`${pendingAttachments.length}/3`}
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                <View
                                    style={[
                                        styles.createInputBox,
                                        {
                                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                                            borderColor: isRecording ? accent.primary : dockBorder,
                                            borderWidth: isRecording ? 1.8 : 1,
                                        },
                                    ]}
                                >
                                    <View style={styles.createInputWrapper}>
                                        <TextInput
                                            ref={inputRef}
                                            style={[
                                                styles.createTextInput,
                                                { color: colors.textPrimary },
                                                isRecording && styles.createTextInputHiddenWhileRecording,
                                            ]}
                                            placeholder={
                                                isRecording
                                                    ? ''
                                                    : pendingAttachments.length > 0
                                                    ? (language === 'es'
                                                        ? 'Añade detalles o pulsa enviar...'
                                                        : 'Add details or press send...')
                                                    : (language === 'es'
                                                        ? 'Escribe o di qué quieres agendar...'
                                                        : 'Type or speak what to schedule...')
                                            }
                                            placeholderTextColor={colors.textMuted}
                                            value={inputPrompt}
                                            onChangeText={setInputPrompt}
                                            onSubmitEditing={handleSendPrompt}
                                            returnKeyType="send"
                                            multiline={false}
                                            editable={!isLoading}
                                        />

                                        {isRecording && (
                                            <View style={styles.recordingContentRow} pointerEvents="none">
                                                {/* Glow Aura Orb líquido y orgánico */}
                                                <GlowAuraOrb
                                                    color={accent.primary}
                                                    active={isRecording}
                                                />

                                                {/* Badge compacto de cronómetro */}
                                                <View
                                                    style={[
                                                        styles.compactTimerBadge,
                                                        {
                                                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                                                            borderColor: `${accent.primary}35`,
                                                        },
                                                    ]}
                                                >
                                                    <Text style={[styles.compactTimerText, { color: accent.primary }]}>
                                                        {`${Math.floor(recordDuration / 60)}:${(recordDuration % 60).toString().padStart(2, '0')}`}
                                                    </Text>
                                                </View>

                                                {/* Texto transcrito o indicador en una sola línea */}
                                                <Text
                                                    style={[
                                                        styles.recordingPlaceholderText,
                                                        { color: inputPrompt.trim() ? colors.textPrimary : colors.textMuted },
                                                    ]}
                                                    numberOfLines={1}
                                                    ellipsizeMode="tail"
                                                >
                                                    {inputPrompt.trim()
                                                        ? inputPrompt
                                                        : (language === 'es'
                                                            ? 'Escuchando... suelta para agendar'
                                                            : 'Listening... release to schedule')}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Botón Adjuntar Imagen o Documento */}
                                    <TouchableOpacity
                                        style={[
                                            styles.createAttachBtn,
                                            {
                                                backgroundColor: showAttachMenu
                                                    ? accent.primary
                                                    : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
                                            },
                                        ]}
                                        onPress={handleOpenAttachmentOptions}
                                        disabled={isLoading || isRecording}
                                        activeOpacity={0.7}
                                        accessibilityRole="button"
                                        accessibilityLabel={language === 'es' ? 'Adjuntar imagen o documento' : 'Attach image or document'}
                                    >
                                        <Paperclip
                                            size={16}
                                            color={showAttachMenu ? '#FFFFFF' : (colors.textSecondary as any)}
                                            strokeWidth={2.4}
                                        />
                                    </TouchableOpacity>

                                    {/* Botón Push-to-Talk y Enviar */}
                                    <Animated.View style={actionBtnAnimatedStyle}>
                                        <TouchableOpacity
                                            style={[
                                                styles.createActionBtn,
                                                { backgroundColor: accent.primary },
                                            ]}
                                            onPressIn={() => {
                                                if (isLoading || inputPrompt.trim() || pendingAttachments.length > 0) return;
                                                if (isKeyboardVisibleRef.current) {
                                                    inputRef.current?.focus();
                                                }
                                                handleStartRecording();
                                            }}
                                            onPressOut={() => {
                                                if (isLoading || inputPrompt.trim() || pendingAttachments.length > 0) return;
                                                handleStopRecordingAndSend();
                                            }}
                                            onPress={() => {
                                                if (isLoading) return;
                                                if (inputPrompt.trim() || pendingAttachments.length > 0) {
                                                    handleSendPrompt();
                                                } else if (!isRecording) {
                                                    Alert.alert(
                                                        language === 'es' ? 'Dictado por voz' : 'Voice Dictation',
                                                        language === 'es'
                                                            ? 'Mantén pulsado el botón para hablar y suéltalo para enviar tu orden.'
                                                            : 'Press and hold the button to speak, and release to send.'
                                                    );
                                                }
                                            }}
                                            delayPressIn={0}
                                            activeOpacity={0.85}
                                            accessibilityRole="button"
                                            accessibilityLabel={
                                                isRecording
                                                    ? (language === 'es' ? 'Grabando voz, suelta para enviar' : 'Recording voice, release to send')
                                                    : (inputPrompt.trim() || pendingAttachments.length > 0)
                                                    ? (language === 'es' ? 'Enviar a la inteligencia artificial' : 'Send to AI')
                                                    : (language === 'es' ? 'Mantén pulsado para dictar' : 'Hold to speak')
                                            }
                                        >
                                            {isLoading ? (
                                                <ActivityIndicator size="small" color="#FFFFFF" />
                                            ) : (
                                                <>
                                                    {/* Icono Micrófono con Morph */}
                                                    <Animated.View style={[styles.morphIconWrap, micMorphStyle]} pointerEvents="none">
                                                        <Mic size={16} color="#FFFFFF" strokeWidth={2.6} />
                                                    </Animated.View>

                                                    {/* Icono Enviar con Morph */}
                                                    <Animated.View style={[styles.morphIconWrap, sendMorphStyle]} pointerEvents="none">
                                                        <ArrowRight size={15} color="#FFFFFF" strokeWidth={2.8} />
                                                    </Animated.View>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </Animated.View>
                                </View>

                                    {/* Bandeja de opciones de adjuntos inline (Diseño distintivo de bandeja con iconos circulares) */}
                                    {showAttachMenu && (
                                        <View
                                            style={[
                                                styles.createAttachTray,
                                                {
                                                    backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.025)',
                                                    borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                                                },
                                            ]}
                                        >
                                            {/* Cámara */}
                                            <TouchableOpacity
                                                style={styles.createAttachItem}
                                                onPress={handleTakePhoto}
                                                activeOpacity={0.7}
                                            >
                                                <View
                                                    style={[
                                                        styles.createAttachIconCircle,
                                                        { backgroundColor: isDark ? `${accent.primary}25` : `${accent.primary}15` },
                                                    ]}
                                                >
                                                    <Camera size={17} color={accent.primary as any} strokeWidth={2.4} />
                                                </View>
                                                <Text style={[styles.createAttachItemLabel, { color: colors.textPrimary }]}>
                                                    {language === 'es' ? 'Cámara' : 'Camera'}
                                                </Text>
                                            </TouchableOpacity>

                                            {/* Galería */}
                                            <TouchableOpacity
                                                style={styles.createAttachItem}
                                                onPress={handlePickImage}
                                                activeOpacity={0.7}
                                            >
                                                <View
                                                    style={[
                                                        styles.createAttachIconCircle,
                                                        { backgroundColor: isDark ? 'rgba(16,185,129,0.20)' : '#D1FAE5' },
                                                    ]}
                                                >
                                                    <ImageIcon size={17} color="#10B981" strokeWidth={2.4} />
                                                </View>
                                                <Text style={[styles.createAttachItemLabel, { color: colors.textPrimary }]}>
                                                    {language === 'es' ? 'Galería' : 'Gallery'}
                                                </Text>
                                            </TouchableOpacity>

                                            {/* Documento */}
                                            <TouchableOpacity
                                                style={styles.createAttachItem}
                                                onPress={handlePickDocument}
                                                activeOpacity={0.7}
                                            >
                                                <View
                                                    style={[
                                                        styles.createAttachIconCircle,
                                                        { backgroundColor: isDark ? 'rgba(59,130,246,0.20)' : '#DBEAFE' },
                                                    ]}
                                                >
                                                    <FileText size={17} color="#3B82F6" strokeWidth={2.4} />
                                                </View>
                                                <Text style={[styles.createAttachItemLabel, { color: colors.textPrimary }]}>
                                                    {language === 'es' ? 'Documento' : 'Document'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                {/* Notificaciones de error o éxito */}
                                {error && (
                                    <View style={styles.createErrorRow}>
                                        <AlertCircle size={14} color="#EF4444" />
                                        <Text style={styles.createErrorText} numberOfLines={2}>{error}</Text>
                                    </View>
                                )}

                                {successMessage && (
                                    <View style={styles.createSuccessRow}>
                                        <Check size={14} color="#10B981" />
                                        <Text style={styles.createSuccessText} numberOfLines={1}>{successMessage}</Text>
                                    </View>
                                )}

                                {/* Divisor sutil entre el input con sus adjuntos y los accesos rápidos */}
                                <View
                                    style={[
                                        styles.createSectionDivider,
                                        { backgroundColor: dockBorder },
                                    ]}
                                />

                                {/* Fila de Opciones Manuales (Chips One UI Accesibles) */}
                                <View style={styles.createManualRow}>
                                    <TouchableOpacity
                                        style={[
                                            styles.createManualChip,
                                            { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
                                        ]}
                                        onPress={() => handleManualNav('/create')}
                                        activeOpacity={0.7}
                                    >
                                        <Clock size={16} color="#EF4444" strokeWidth={2.4} />
                                        <Text style={[styles.createManualChipText, { color: colors.textPrimary }]}>
                                            {language === 'es' ? 'Recordatorio' : 'Reminder'}
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[
                                            styles.createManualChip,
                                            { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
                                        ]}
                                        onPress={() => handleManualNav('/events/create')}
                                        activeOpacity={0.7}
                                    >
                                        <CalendarIcon size={16} color="#3B82F6" strokeWidth={2.4} />
                                        <Text style={[styles.createManualChipText, { color: colors.textPrimary }]}>
                                            {language === 'es' ? 'Evento' : 'Event'}
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[
                                            styles.createManualChip,
                                            { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
                                        ]}
                                        onPress={() => {
                                            closeCreate();
                                            if (activeFolder) {
                                                router.push({
                                                    pathname: '/notes/create',
                                                    params: { folderId: activeFolder.id },
                                                });
                                            } else {
                                                router.push('/notes/create');
                                            }
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Notebook size={16} color="#10B981" strokeWidth={2.4} />
                                        <Text style={[styles.createManualChipText, { color: colors.textPrimary }]}>
                                            {isInsideFolder && activeFolder
                                                ? (language === 'es' ? `Nota en ${activeFolder.name}` : `Note in ${activeFolder.name}`)
                                                : (language === 'es' ? 'Nota' : 'Note')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </Animated.View>

                    {/* Capa 3: Menú de Selección Morpheado */}
                    <Animated.View
                        style={[StyleSheet.absoluteFill, styles.selectionContentContainer, selectionMenuAnimatedStyle]}
                        pointerEvents={isSelecting && !isSharingEvents ? 'auto' : 'none'}
                    >
                        {/* Fila superior: Contador + Cerrar | Seleccionar Todo */}
                        <View style={styles.selectionTopRow}>
                            <View style={styles.selectionCounterWrap}>
                                <TouchableOpacity
                                    onPress={selection.onClose}
                                    style={[
                                        styles.selectionCloseBtn,
                                        { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                                    ]}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    activeOpacity={0.7}
                                >
                                    <X size={13} color={colors.textSecondary as any} />
                                </TouchableOpacity>
                                <Text style={[styles.selectionTitleText, { color: colors.textPrimary }]} numberOfLines={1}>
                                    {selection.title}
                                </Text>
                            </View>

                            {selection.onToggleSelectAll && (
                                <TouchableOpacity
                                    onPress={selection.onToggleSelectAll}
                                    style={[
                                        styles.selectionSelectAllBtn,
                                        {
                                            backgroundColor: selection.isAllSelected
                                                ? accent.primary + '18'
                                                : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                                            borderColor: selection.isAllSelected ? accent.primary : dockBorder,
                                        },
                                    ]}
                                    activeOpacity={0.7}
                                >
                                    {selection.isAllSelected ? (
                                        <CheckSquare size={13} color={accent.primary as any} />
                                    ) : (
                                        <Square size={13} color={colors.textSecondary as any} />
                                    )}
                                    <Text
                                        style={[
                                            styles.selectionSelectAllText,
                                            { color: selection.isAllSelected ? accent.primary : colors.textSecondary },
                                        ]}
                                    >
                                        {selection.selectAllText ||
                                            (selection.isAllSelected
                                                ? (language === 'es' ? 'Deseleccionar' : 'Deselect')
                                                : (language === 'es' ? 'Todos' : 'All'))}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Separador sutil */}
                        <View style={[styles.selectionDivider, { backgroundColor: dockBorder }]} />

                        {/* Fila de acciones contextuales */}
                        <View style={styles.selectionActionsRow}>
                            {selection.actions.map(action => (
                                <TouchableOpacity
                                    key={action.id}
                                    style={styles.selectionActionBtn}
                                    onPress={action.onPress}
                                    activeOpacity={0.7}
                                >
                                    <View
                                        style={[
                                            styles.selectionActionIconCircle,
                                            {
                                                backgroundColor: action.bg || (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                                            },
                                        ]}
                                    >
                                        {action.icon(action.color || (isDark ? colors.textPrimary : colors.textPrimary))}
                                    </View>
                                    <Text
                                        style={[
                                            styles.selectionActionLabel,
                                            { color: action.color || colors.textSecondary },
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {action.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </Animated.View>

                    {/* Capa 4: Tarjeta de Compartir Eventos Morpheada */}
                    <Animated.View
                        style={[StyleSheet.absoluteFill, styles.shareCardContentContainer, shareCardAnimatedStyle]}
                        pointerEvents={isSharingEvents ? 'auto' : 'none'}
                    >
                        <ShareEventsMorphCard
                            events={shareEventsList}
                            onClose={() => useShareEventsStore.getState().closeShare()}
                            onSuccess={() => useShareEventsStore.getState().notifySuccess()}
                        />
                    </Animated.View>
                </Animated.View>
            </Animated.View>

            {/* Modal Selector de Fecha y Hora interactivo para la propuesta de IA */}
            {pickerVisible && (
                <CustomDateTimePicker
                    visible={pickerVisible}
                    mode={pickerMode}
                    value={pickerDate}
                    onClose={() => setPickerVisible(false)}
                    onChange={handlePickerChange}
                    isDark={isDark}
                />
            )}
        </>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        backgroundColor: '#000000',
        zIndex: 998,
    },
    dockOuterContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    dockWrapper: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.10,
        shadowRadius: 12,
        elevation: 6,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    normalNavRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        height: 56,
        paddingHorizontal: 14,
    },
    normalNavRowHidden: {
        opacity: 0,
        display: 'none',
        pointerEvents: 'none',
    },
    tabButton: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        paddingVertical: 2,
        minWidth: 74,
    },
    iconContainer: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        width: 38,
        height: 24,
    },
    tabActivePill: {
        position: 'absolute',
        width: 38,
        height: 24,
        borderRadius: 12,
    },
    centerButton: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        marginTop: -16,
        minWidth: 54,
    },
    centerIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
        elevation: 6,
    },
    tabLabel: {
        fontSize: 9.5,
        letterSpacing: 0.1,
    },
    // Contenedor de Creación Morpheada
    createContentContainer: {
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        borderRadius: 24,
        overflow: 'hidden',
        zIndex: 10,
        elevation: 4,
    },
    createTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    createTitleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    createTitleText: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    createCloseBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pendingAttachStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 4,
        paddingBottom: 8,
        gap: 8,
    },
    pendingAttachItem: {
        width: 44,
        height: 44,
        borderRadius: 10,
        position: 'relative',
    },
    pendingAttachThumb: {
        width: 44,
        height: 44,
        borderRadius: 10,
    },
    pendingAttachDocThumb: {
        width: 44,
        height: 44,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 2,
    },
    pendingAttachDocExt: {
        fontSize: 9,
        fontWeight: '700',
        color: '#3B82F6',
        marginTop: 1,
    },
    pendingAttachRemoveBtn: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 1.5,
        elevation: 3,
    },
    pendingAttachAddMoreBtn: {
        width: 44,
        height: 44,
        borderRadius: 10,
        borderWidth: 1.2,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pendingAttachCountWrap: {
        marginLeft: 'auto',
        paddingHorizontal: 4,
    },
    pendingAttachCountText: {
        fontSize: 11,
        fontWeight: '600',
    },
    createInputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 22,
        paddingLeft: 14,
        paddingRight: 5,
        borderWidth: 1,
        height: 44,
        marginBottom: 8,
    },
    recordingContentRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 2,
    },
    glowOrbContainer: {
        width: 22,
        height: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    glowOrbOuterHalo: {
        position: 'absolute',
        width: 22,
        height: 22,
        borderRadius: 11,
    },
    glowOrbMiddleHalo: {
        position: 'absolute',
        width: 15,
        height: 15,
        borderRadius: 7.5,
    },
    glowOrbCore: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 3,
        elevation: 2,
    },
    compactTimerBadge: {
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 6,
        borderWidth: 1,
    },
    compactTimerText: {
        fontSize: 11.5,
        fontWeight: '700',
    },
    recordingPlaceholderText: {
        fontSize: 13,
        fontWeight: '600',
        flex: 1,
        letterSpacing: -0.2,
    },
    createTextInput: {
        flex: 1,
        fontSize: 14,
        paddingVertical: 0,
        paddingHorizontal: 0,
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    createActionBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
    },
    morphIconWrap: {
        position: 'absolute',
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
    },
    createManualRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'space-between',
    },
    createManualChip: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 36,
        borderRadius: 18,
    },
    createManualChipText: {
        fontSize: 12.5,
        fontWeight: '600',
        letterSpacing: -0.1,
    },
    createErrorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 6,
        paddingHorizontal: 2,
    },
    createErrorText: {
        color: '#EF4444',
        fontSize: 11.5,
        flex: 1,
    },
    createSuccessRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 6,
        paddingHorizontal: 2,
    },
    createSuccessText: {
        color: '#10B981',
        fontSize: 11.5,
        flex: 1,
        fontWeight: '600',
    },
    proposalWrap: {
        flex: 1,
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    proposalTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 13,
        paddingHorizontal: 10,
        paddingVertical: 2,
        marginBottom: 8,
        minHeight: 44,
        gap: 8,
    },
    proposalBadgeIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    proposalTitleInput: {
        flex: 1,
        fontSize: 14.5,
        fontWeight: '700',
        paddingVertical: 4,
    },
    proposalContextBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 11,
        borderWidth: 1,
        marginBottom: 8,
    },
    proposalContextBannerText: {
        fontSize: 11.5,
        fontWeight: '600',
        flex: 1,
        lineHeight: 15,
    },
    proposalBlocksContainer: {
        gap: 7,
        marginBottom: 8,
    },
    proposalOneUiBlock: {
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 7,
        gap: 6,
    },
    proposalBlockHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    proposalBlockHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flex: 1,
    },
    proposalBlockHeaderLabel: {
        fontSize: 12,
        fontWeight: '500',
    },
    proposalBlockHeaderValue: {
        fontSize: 13,
        fontWeight: '700',
    },
    proposalBlockHeaderBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    proposalBlockHeaderBtnText: {
        fontSize: 11,
        fontWeight: '600',
    },
    proposalQuickChipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    proposalQuickChip: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        borderRadius: 13,
        borderWidth: 1,
        paddingHorizontal: 2,
    },
    proposalQuickChipText: {
        fontSize: 12.5,
        fontWeight: '700',
        letterSpacing: -0.2,
        textAlign: 'center',
    },
    proposalRecurrenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 1,
    },
    proposalRecurrenceChip: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: 38,
        borderRadius: 11,
        borderWidth: 1,
    },
    proposalRecurrenceText: {
        fontSize: 11,
    },
    proposalContentWrap: {
        flex: 1,
        minHeight: 0,
        paddingBottom: 4,
    },
    proposalButtonsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingTop: 8,
        marginTop: 'auto',
        flexShrink: 0,
    },
    proposalDiscardBtn: {
        flex: 1,
        height: 48,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    proposalDiscardText: {
        fontSize: 14,
        fontWeight: '600',
    },
    proposalConfirmBtn: {
        flex: 1.35,
        height: 48,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    proposalConfirmText: {
        color: '#FFFFFF',
        fontSize: 14.5,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    // Menú de selección morpheado interior
    selectionContentContainer: {
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 8,
        borderRadius: 22,
        overflow: 'hidden',
    },
    selectionTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    selectionCounterWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    selectionCloseBtn: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectionTitleText: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    selectionSelectAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 4,
        paddingHorizontal: 9,
        borderRadius: 12,
        borderWidth: 1,
    },
    selectionSelectAllText: {
        fontSize: 11,
        fontWeight: '600',
    },
    selectionDivider: {
        height: StyleSheet.hairlineWidth,
        marginVertical: 4,
    },
    selectionActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    selectionActionBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingVertical: 2,
        paddingHorizontal: 4,
        minWidth: 46,
    },
    selectionActionIconCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectionActionLabel: {
        fontSize: 9.5,
        fontWeight: '600',
        letterSpacing: 0.1,
    },

    createInputWrapper: {
        flex: 1,
        height: '100%',
        justifyContent: 'center',
        position: 'relative',
    },
    createTextInputHiddenWhileRecording: {
        opacity: 0,
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
    },
    // Mini Calendario Inline (One UI)
    inlineCalendarContainer: {
        paddingTop: 4,
        paddingBottom: 2,
        gap: 6,
    },
    inlineMonthNavRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 2,
    },
    inlineNavBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    inlineMonthTitleText: {
        fontSize: 13.5,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    inlineWeekHeadersRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
    },
    inlineWeekDayLabel: {
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
    },
    inlineDaysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 4,
    },
    inlineDayCell: {
        width: '13.5%',
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    inlineDayText: {
        fontSize: 12.5,
        textAlign: 'center',
    },
    // Selector de Hora Inline con Steppers Grandes (One UI)
    inlineTimeContainer: {
        paddingTop: 6,
        paddingBottom: 2,
        gap: 10,
    },
    inlineSteppersRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    inlineStepperBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        paddingHorizontal: 6,
        paddingVertical: 4,
        gap: 6,
    },
    inlineStepperActionBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    inlineStepperPlusMinus: {
        fontSize: 22,
        fontWeight: '700',
        lineHeight: 24,
    },
    inlineStepperValueWrap: {
        alignItems: 'center',
        minWidth: 46,
    },
    inlineStepperValue: {
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    inlineStepperTag: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginTop: -2,
    },
    inlineStepperColon: {
        fontSize: 24,
        fontWeight: '800',
        marginHorizontal: -2,
    },
    inlineMinutePresetsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    inlineMinutePresetChip: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 7,
        borderRadius: 10,
        borderWidth: 1,
    },
    inlineMinutePresetText: {
        fontSize: 12,
        letterSpacing: -0.2,
    },
    createAttachBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 6,
    },
    // Estilos de Lote (Batch Items)
    batchContainer: {
        flex: 1,
        minHeight: 0,
        paddingTop: 4,
        paddingBottom: 4,
        gap: 8,
    },
    batchSummaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
    },
    batchSummaryTextWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flex: 1,
        marginRight: 8,
    },
    batchSummaryTitle: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    batchCountBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        borderWidth: 1,
    },
    batchCountBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    batchContextText: {
        fontSize: 11.5,
        lineHeight: 16,
        paddingHorizontal: 2,
    },
    batchScrollView: {
        maxHeight: 360,
    },
    batchScrollContent: {
        gap: 8,
        paddingBottom: 4,
    },
    batchGroupCard: {
        borderRadius: 14,
        paddingHorizontal: 11,
        paddingVertical: 9,
        borderWidth: 1,
        gap: 8,
    },
    batchGroupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
    },
    batchGroupInfo: {
        flex: 1,
        gap: 2,
    },
    batchGroupLocationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 1,
    },
    batchGroupLocationText: {
        fontSize: 11,
        fontWeight: '500',
    },
    batchGroupSessionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        paddingLeft: 35,
    },
    batchSessionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4.5,
        paddingHorizontal: 8.5,
        paddingVertical: 4.5,
        borderRadius: 9,
        borderWidth: 1,
    },
    batchSessionChipText: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: -0.1,
    },
    batchItemsList: {
        gap: 6,
    },
    batchItemCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderWidth: 1,
        gap: 10,
    },
    batchCheckboxWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    batchItemIconPill: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    batchItemInfo: {
        flex: 1,
        gap: 2,
    },
    batchItemTitleInput: {
        fontSize: 13.5,
        fontWeight: '600',
        padding: 0,
        margin: 0,
    },
    batchItemSubRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
    },
    batchItemSubText: {
        fontSize: 11,
    },
    batchSubTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    createAttachTray: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        borderRadius: 16,
        paddingVertical: 9,
        paddingHorizontal: 6,
        borderWidth: 1,
        marginBottom: 8,
    },
    createAttachItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
    },
    createAttachIconCircle: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    createAttachItemLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: -0.1,
    },
    createSectionDivider: {
        height: StyleSheet.hairlineWidth,
        width: '100%',
        marginBottom: 8,
        marginTop: 2,
    },
    shareCardContentContainer: {
        borderRadius: 22,
        overflow: 'hidden',
    },
});
