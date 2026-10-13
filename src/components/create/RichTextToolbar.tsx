import React, { useState, useEffect, useRef } from 'react';
import {
    Platform,
    Keyboard,
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { actions } from 'react-native-pell-rich-editor';
import {
    Plus,
    ChevronLeft,
    Bold,
    Italic,
    Underline,
    Strikethrough,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    List,
    ListOrdered,
    Quote,
    Minus,
    Palette,
    Highlighter,
    Eraser,
    Image as ImageIcon,
    Camera,
    FileText,
    CheckSquare,
    Type,
    Check,
    RotateCcw,
} from '@tamagui/lucide-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { NOTE_FONTS, DEFAULT_NOTE_FONT_ID } from '../../constants/noteFonts';

interface RichTextToolbarProps {
    editorRef: React.RefObject<any>;
    isNotesFocused?: boolean;
    isDark?: boolean;
    onPressCamera?: () => void;
    onPressGallery?: () => void;
    onPressDocument?: () => void;
    onPressAddImage?: () => void;
    onPressAttachment?: () => void;
    alwaysVisible?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    onOpenNoteFontPicker?: () => void;
    currentFontFamily?: string;
    onSelectFont?: (fontId: string) => void;
    onApplyFontToSelection?: (fontName: string) => void;
}

type SubMenuType = 'main' | 'insert' | 'headings' | 'lists' | 'align' | 'color' | 'fonts';

// Colores de texto disponibles
const TEXT_COLORS = [
    { label: 'Normal', color: 'default', preview: '#FFFFFF' },
    { label: 'Rojo', color: '#EF4444', preview: '#EF4444' },
    { label: 'Naranja', color: '#F97316', preview: '#F97316' },
    { label: 'Ámbar', color: '#F59E0B', preview: '#F59E0B' },
    { label: 'Verde', color: '#10B981', preview: '#10B981' },
    { label: 'Azul', color: '#3B82F6', preview: '#3B82F6' },
    { label: 'Morado', color: '#8B5CF6', preview: '#8B5CF6' },
    { label: 'Rosa', color: '#EC4899', preview: '#EC4899' },
    { label: 'Gris', color: '#94A3B8', preview: '#94A3B8' },
];

// Colores de resaltado (Marcatextos)
const HIGHLIGHT_COLORS = [
    { label: 'Ninguno', color: 'transparent', preview: 'transparent' },
    { label: 'Amarillo', color: '#FEF08A', preview: '#FEF08A' },
    { label: 'Verde', color: '#BBF7D0', preview: '#BBF7D0' },
    { label: 'Azul', color: '#BAE6FD', preview: '#BAE6FD' },
    { label: 'Rosa', color: '#FBCFE8', preview: '#FBCFE8' },
    { label: 'Morado', color: '#DDD6FE', preview: '#DDD6FE' },
    { label: 'Naranja', color: '#FED7AA', preview: '#FED7AA' },
];

// Helpers para normalización y comparación exacta de colores (hex / rgb / transparent)
function parseRgb(color: string | null | undefined): { r: number; g: number; b: number } | null {
    if (!color || typeof color !== 'string') return null;
    const s = color.trim().toLowerCase();
    if (s === 'transparent' || s === 'rgba(0, 0, 0, 0)' || s === 'rgba(0,0,0,0)' || s === 'default' || s === 'inherit') {
        return null;
    }
    const match = s.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
        return {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10),
        };
    }
    if (s.startsWith('#')) {
        let hex = s.slice(1);
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        if (hex.length === 6) {
            return {
                r: parseInt(hex.substring(0, 2), 16),
                g: parseInt(hex.substring(2, 4), 16),
                b: parseInt(hex.substring(4, 6), 16),
            };
        }
    }
    return null;
}

function areColorsEqual(c1: string | null | undefined, c2: string | null | undefined): boolean {
    if (!c1 || !c2) return false;
    const rgb1 = parseRgb(c1);
    const rgb2 = parseRgb(c2);
    if (!rgb1 || !rgb2) return false;
    return Math.abs(rgb1.r - rgb2.r) <= 4 && Math.abs(rgb1.g - rgb2.g) <= 4 && Math.abs(rgb1.b - rgb2.b) <= 4;
}

function isCustomTextColor(colorStr: string | null | undefined, isDark: boolean): boolean {
    if (!colorStr) return false;
    const rgb = parseRgb(colorStr);
    if (!rgb) return false;
    if (isDark) {
        if (rgb.r >= 235 && rgb.g >= 235 && rgb.b >= 235) return false;
    } else {
        if (rgb.r <= 32 && rgb.g <= 32 && rgb.b <= 45) return false;
    }
    return true;
}

function isNonTransparentColor(colorStr: string | null | undefined): boolean {
    if (!colorStr) return false;
    return parseRgb(colorStr) !== null;
}

export function RichTextToolbar({
    editorRef,
    isNotesFocused,
    onPressCamera,
    onPressGallery,
    onPressDocument,
    onPressAddImage,
    onPressAttachment,
    alwaysVisible = true,
    onOpenNoteFontPicker,
    currentFontFamily,
    onSelectFont,
    onApplyFontToSelection,
}: RichTextToolbarProps) {
    const insets = useSafeAreaInsets();
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    const [activeSubMenu, setActiveSubMenu] = useState<SubMenuType>('main');
    const [colorTarget, setColorTarget] = useState<'text' | 'highlight'>('text');
    const [fontScope, setFontScope] = useState<'whole' | 'selection'>('whole');
    const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
    const [activeTextColor, setActiveTextColor] = useState<string | null>(null);
    const [activeHighlightColor, setActiveHighlightColor] = useState<string | null>(null);
    const lastActionTimestamp = useRef<number>(0);
    const { colors, accent, isDark } = useVeyraTheme();

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSubscription = Keyboard.addListener(showEvent, () => {
            setIsKeyboardVisible(true);
        });
        const hideSubscription = Keyboard.addListener(hideEvent, () => {
            setIsKeyboardVisible(false);
            setActiveSubMenu('main');
        });

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    // Registrar listener con el editor para sincronizar en tiempo real estilos y colores activos del cursor
    useEffect(() => {
        let isMounted = true;
        const interval = setInterval(() => {
            const editor = editorRef.current;
            if (editor?.registerToolbar) {
                editor.registerToolbar((items: any[]) => {
                    if (!isMounted || !Array.isArray(items)) return;

                    // Si el usuario interactuó hace <220ms, preservar la respuesta táctil optimista
                    if (Date.now() - lastActionTimestamp.current < 220) {
                        return;
                    }

                    const styles: string[] = [];
                    let foundTextColor: string | null = null;
                    let foundHighlightColor: string | null = null;

                    for (const item of items) {
                        if (typeof item === 'string') {
                            styles.push(item);
                        } else if (item && typeof item === 'object') {
                            if (item.type === 'foreColor' && item.value) {
                                foundTextColor = item.value;
                            } else if (item.type === 'hiliteColor' && item.value) {
                                foundHighlightColor = item.value;
                            } else if (item.type) {
                                styles.push(item.type);
                            }
                        }
                    }

                    setSelectedStyles(styles);

                    if (foundTextColor && isCustomTextColor(foundTextColor, isDark)) {
                        setActiveTextColor(foundTextColor);
                    } else {
                        setActiveTextColor(null);
                    }

                    if (foundHighlightColor && isNonTransparentColor(foundHighlightColor)) {
                        setActiveHighlightColor(foundHighlightColor);
                    } else {
                        setActiveHighlightColor(null);
                    }
                });
                clearInterval(interval);
            }
        }, 120);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [editorRef, isDark]);

    const isVisible = alwaysVisible || isNotesFocused || isKeyboardVisible;
    if (!isVisible) return null;

    // Comprobar si un estilo o acción está activa actualmente
    const isStyleActive = (actionName: string) => selectedStyles.includes(actionName);

    // Detección de estados activos
    const isBoldActive = isStyleActive(actions.setBold);
    const isItalicActive = isStyleActive(actions.setItalic);
    const isUnderlineActive = isStyleActive(actions.setUnderline);
    const isStrikeActive = isStyleActive(actions.setStrikethrough);
    const isH1Active = isStyleActive(actions.heading1);
    const isH2Active = isStyleActive(actions.heading2);
    const isBulletsActive = isStyleActive(actions.insertBulletsList);
    const isOrderedActive = isStyleActive(actions.insertOrderedList);
    const isCheckboxActive = isStyleActive(actions.checkboxList);
    const isAlignLeftActive = isStyleActive(actions.alignLeft);
    const isAlignCenterActive = isStyleActive(actions.alignCenter);
    const isAlignRightActive = isStyleActive(actions.alignRight);
    const isAlignFullActive = isStyleActive(actions.alignFull);

    // Detección de grupos activos para los botones de la barra principal
    const isHeadingsGroupActive = isH1Active || isH2Active || isUnderlineActive || isStrikeActive;
    const isListsGroupActive = isBulletsActive || isOrderedActive;
    const isAlignGroupActive = isAlignCenterActive || isAlignRightActive || isAlignFullActive;
    const isColorGroupActive = activeTextColor !== null || activeHighlightColor !== null;
    const isFontActive = Boolean(currentFontFamily && currentFontFamily !== DEFAULT_NOTE_FONT_ID && currentFontFamily !== 'sans');

    // Comprobar si hay algún formato activo (para iluminar el botón de borrar formato)
    const hasAnyFormattingActive =
        isBoldActive ||
        isItalicActive ||
        isUnderlineActive ||
        isStrikeActive ||
        isH1Active ||
        isH2Active ||
        isBulletsActive ||
        isOrderedActive ||
        isAlignCenterActive ||
        isAlignRightActive ||
        isAlignFullActive ||
        isColorGroupActive;

    // Ejecuta una acción de pell-rich-editor con actualización optimista inmediata en 0ms
    const handleAction = (action: string, data?: any) => {
        if (!editorRef.current) return;
        lastActionTimestamp.current = Date.now();

        if (data !== undefined) {
            editorRef.current.sendAction(action, 'result', data);
        } else {
            editorRef.current.sendAction(action, 'result');
        }

        // Toggle optimista instantáneo para que la UI reaccione en 0ms
        if (['bold', 'italic', 'underline', 'strikeThrough', 'checkboxList'].includes(action)) {
            setSelectedStyles(prev =>
                prev.includes(action) ? prev.filter(s => s !== action) : [...prev, action]
            );
        } else if (['heading1', 'heading2'].includes(action)) {
            setSelectedStyles(prev =>
                prev.includes(action) ? prev.filter(s => s !== action) : [...prev.filter(s => !s.startsWith('heading')), action]
            );
        } else if (['unorderedList', 'orderedList'].includes(action)) {
            setSelectedStyles(prev =>
                prev.includes(action) ? prev.filter(s => s !== action) : [...prev.filter(s => s !== 'unorderedList' && s !== 'orderedList'), action]
            );
        } else if (['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(action)) {
            setSelectedStyles(prev => [
                ...prev.filter(s => !s.startsWith('justify')),
                action,
            ]);
        }
    };

    // Color de texto con actualización optimista
    const handleSetTextColor = (color: string) => {
        if (!editorRef.current) return;
        lastActionTimestamp.current = Date.now();

        if (color === 'default') {
            const finalColor = isDark ? '#F4F4F5' : '#0F172A';
            editorRef.current.sendAction(actions.foreColor, 'result', finalColor);
            setActiveTextColor(null);
        } else {
            editorRef.current.sendAction(actions.foreColor, 'result', color);
            setActiveTextColor(color);
        }
    };

    // Color de fondo / resaltador con actualización optimista
    const handleSetHighlight = (color: string) => {
        if (!editorRef.current) return;
        lastActionTimestamp.current = Date.now();

        if (color === 'transparent') {
            editorRef.current.sendAction(actions.hiliteColor, 'result', 'transparent');
            setActiveHighlightColor(null);
        } else {
            editorRef.current.sendAction(actions.hiliteColor, 'result', color);
            setActiveHighlightColor(color);
        }
    };

    // Borrar todo formato y restablecer a los valores por defecto
    const handleClearFormatting = () => {
        if (!editorRef.current) return;
        lastActionTimestamp.current = Date.now();

        // 1. Quitar formato en línea
        editorRef.current.sendAction(actions.removeFormat, 'result');
        // 2. Restablecer bloque a párrafo normal <p>
        editorRef.current.sendAction(actions.setParagraph, 'result');
        // 3. Quitar resaltador de fondo
        editorRef.current.sendAction(actions.hiliteColor, 'result', 'transparent');
        // 4. Restablecer color de texto normal
        const defaultColor = isDark ? '#F4F4F5' : '#0F172A';
        editorRef.current.sendAction(actions.foreColor, 'result', defaultColor);
        // 5. Restablecer alineación
        editorRef.current.sendAction(actions.alignLeft, 'result');

        // Reseteo optimista inmediato de la UI
        setSelectedStyles([]);
        setActiveTextColor(null);
        setActiveHighlightColor(null);
    };

    // Generador de estilos para botones activos con el color de acento del usuario
    const getActiveBtnStyle = (isActive: boolean) => [
        styles.toolBtn,
        isActive && {
            backgroundColor: accent.primary + '22',
            borderColor: accent.primary + '66',
            borderWidth: 1.5,
        },
    ];

    // Color de icono según el estado
    const getActiveIconColor = (isActive: boolean) =>
        (isActive ? accent.primary : colors.textPrimary) as any;

    // Botón estándar para regresar a la barra principal
    const renderBackButton = () => (
        <View style={styles.backButtonWrapper}>
            <TouchableOpacity
                style={[
                    styles.backBtn,
                    {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                    },
                ]}
                activeOpacity={0.65}
                delayPressIn={0}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => setActiveSubMenu('main')}
            >
                <ChevronLeft size={18} color={accent.primary as any} strokeWidth={2.6} />
            </TouchableOpacity>
            <View style={[styles.separator, { backgroundColor: colors.borderSubtle, marginHorizontal: 6 }]} />
        </View>
    );

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: colors.surfaceElevated,
                    borderTopColor: colors.borderSubtle,
                    paddingBottom: isKeyboardVisible ? 6 : Math.max(insets.bottom, 8),
                },
            ]}
        >
            {/* SUBMENÚ: INSERTAR / MULTIMEDIA */}
            {activeSubMenu === 'insert' && (
                <View style={styles.submenuContainer}>
                    {renderBackButton()}
                    <ScrollView
                        horizontal
                        keyboardShouldPersistTaps="always"
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.submenuScroll}
                    >
                        {onPressCamera && (
                            <TouchableOpacity style={styles.toolBtn} activeOpacity={0.6} delayPressIn={0} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} onPress={onPressCamera}>
                                <Camera size={18} color={colors.textPrimary as any} />
                            </TouchableOpacity>
                        )}
                        {(onPressGallery || onPressAddImage) && (
                            <TouchableOpacity style={styles.toolBtn} activeOpacity={0.6} delayPressIn={0} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} onPress={onPressGallery || onPressAddImage}>
                                <ImageIcon size={18} color={colors.textPrimary as any} />
                            </TouchableOpacity>
                        )}
                        {(onPressDocument || onPressAttachment) && (
                            <TouchableOpacity style={styles.toolBtn} activeOpacity={0.6} delayPressIn={0} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} onPress={onPressDocument || onPressAttachment}>
                                <FileText size={18} color={colors.textPrimary as any} />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.toolBtn} activeOpacity={0.6} delayPressIn={0} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} onPress={() => handleAction(actions.setHR)}>
                            <Minus size={18} color={colors.textPrimary as any} />
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            )}

            {/* SUBMENÚ: ENCABEZADOS Y FORMATO (H1, H2, Subrayado, Tachado, Cita, Borrador de formato) */}
            {activeSubMenu === 'headings' && (
                <View style={styles.submenuContainer}>
                    {renderBackButton()}
                    <ScrollView
                        horizontal
                        keyboardShouldPersistTaps="always"
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.submenuScroll}
                    >
                        <TouchableOpacity
                            style={[
                                styles.toolBtnText,
                                isH1Active && {
                                    backgroundColor: accent.primary + '22',
                                    borderColor: accent.primary + '66',
                                    borderWidth: 1.5,
                                },
                            ]}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => handleAction(actions.heading1)}
                        >
                            <Text style={[styles.headingBtnText, { color: isH1Active ? accent.primary : colors.textPrimary }]}>
                                H1
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.toolBtnText,
                                isH2Active && {
                                    backgroundColor: accent.primary + '22',
                                    borderColor: accent.primary + '66',
                                    borderWidth: 1.5,
                                },
                            ]}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => handleAction(actions.heading2)}
                        >
                            <Text style={[styles.headingBtnText, { color: isH2Active ? accent.primary : colors.textPrimary }]}>
                                H2
                            </Text>
                        </TouchableOpacity>

                        <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />

                        <TouchableOpacity
                            style={getActiveBtnStyle(isUnderlineActive)}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => handleAction(actions.setUnderline)}
                        >
                            <Underline size={17} color={getActiveIconColor(isUnderlineActive)} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={getActiveBtnStyle(isStrikeActive)}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => handleAction(actions.setStrikethrough)}
                        >
                            <Strikethrough size={17} color={getActiveIconColor(isStrikeActive)} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.toolBtn}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => handleAction(actions.blockquote)}
                        >
                            <Quote size={17} color={colors.textPrimary as any} />
                        </TouchableOpacity>

                        <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />

                        {/* Opción de borrar formato completo dentro del menú de encabezados */}
                        <TouchableOpacity
                            style={[
                                styles.toolBtn,
                                hasAnyFormattingActive && {
                                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                                },
                            ]}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={handleClearFormatting}
                        >
                            <Eraser size={17} color={hasAnyFormattingActive ? (accent.primary as any) : (colors.textPrimary as any)} />
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            )}

            {/* SUBMENÚ: LISTAS (Checklist, Viñetas, Numeradas) */}
            {activeSubMenu === 'lists' && (
                <View style={styles.submenuContainer}>
                    {renderBackButton()}
                    <ScrollView
                        horizontal
                        keyboardShouldPersistTaps="always"
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.submenuScroll}
                    >
                        <TouchableOpacity
                            style={getActiveBtnStyle(isCheckboxActive)}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => handleAction(actions.checkboxList)}
                        >
                            <CheckSquare size={17} color={getActiveIconColor(isCheckboxActive)} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={getActiveBtnStyle(isBulletsActive)}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => handleAction(actions.insertBulletsList)}
                        >
                            <List size={17} color={getActiveIconColor(isBulletsActive)} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={getActiveBtnStyle(isOrderedActive)}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => handleAction(actions.insertOrderedList)}
                        >
                            <ListOrdered size={17} color={getActiveIconColor(isOrderedActive)} />
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            )}

            {/* SUBMENÚ: ALINEACIÓN (Izquierda, Centro, Derecha, Justificado) */}
            {activeSubMenu === 'align' && (
                <View style={styles.submenuContainer}>
                    {renderBackButton()}
                    <ScrollView
                        horizontal
                        keyboardShouldPersistTaps="always"
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.submenuScroll}
                    >
                        <TouchableOpacity
                            style={getActiveBtnStyle(isAlignLeftActive)}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => handleAction(actions.alignLeft)}
                        >
                            <AlignLeft size={18} color={getActiveIconColor(isAlignLeftActive)} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={getActiveBtnStyle(isAlignCenterActive)}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => handleAction(actions.alignCenter)}
                        >
                            <AlignCenter size={18} color={getActiveIconColor(isAlignCenterActive)} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={getActiveBtnStyle(isAlignRightActive)}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => handleAction(actions.alignRight)}
                        >
                            <AlignRight size={18} color={getActiveIconColor(isAlignRightActive)} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={getActiveBtnStyle(isAlignFullActive)}
                            activeOpacity={0.6}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => handleAction(actions.alignFull)}
                        >
                            <AlignJustify size={18} color={getActiveIconColor(isAlignFullActive)} />
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            )}

            {/* SUBMENÚ: COLOR Y RESALTADOR */}
            {activeSubMenu === 'color' && (
                <View style={styles.submenuContainer}>
                    {renderBackButton()}
                    {/* Toggle selector: Color de texto vs Resaltador con indicadores */}
                    <View style={[styles.colorTargetToggle, { backgroundColor: isDark ? '#232838' : '#E2E8F0' }]}>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => setColorTarget('text')}
                            style={[
                                styles.colorTargetBtn,
                                colorTarget === 'text' && { backgroundColor: isDark ? '#161922' : '#FFFFFF' },
                            ]}
                        >
                            <Palette size={14} color={(colorTarget === 'text' ? accent.primary : colors.textSecondary) as any} />
                            {activeTextColor && (
                                <View style={[styles.toggleMiniDot, { backgroundColor: activeTextColor }]} />
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => setColorTarget('highlight')}
                            style={[
                                styles.colorTargetBtn,
                                colorTarget === 'highlight' && { backgroundColor: isDark ? '#161922' : '#FFFFFF' },
                            ]}
                        >
                            <Highlighter size={14} color={(colorTarget === 'highlight' ? accent.primary : colors.textSecondary) as any} />
                            {activeHighlightColor && (
                                <View style={[styles.toggleMiniDot, { backgroundColor: activeHighlightColor }]} />
                            )}
                        </TouchableOpacity>
                    </View>
                    <View style={[styles.separator, { backgroundColor: colors.borderSubtle, marginHorizontal: 6 }]} />
                    {/* Lista horizontal de muestras de color con indicadores de selección activa */}
                    <ScrollView
                        horizontal
                        keyboardShouldPersistTaps="always"
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.colorRow}
                    >
                        {colorTarget === 'text'
                            ? TEXT_COLORS.map((item, idx) => {
                                const isSelected =
                                    (item.color === 'default' && activeTextColor === null) ||
                                    (item.color !== 'default' && areColorsEqual(item.color, activeTextColor));

                                const previewColor = item.color === 'default' ? (isDark ? '#FFFFFF' : '#0F172A') : item.preview;
                                const checkColor =
                                    (item.color === 'default' && !isDark) ||
                                    item.color === '#EF4444' ||
                                    item.color === '#3B82F6' ||
                                    item.color === '#8B5CF6'
                                        ? '#FFFFFF'
                                        : '#000000';

                                return (
                                    <TouchableOpacity
                                        key={`tc-${idx}`}
                                        activeOpacity={0.65}
                                        delayPressIn={0}
                                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                        onPress={() => handleSetTextColor(item.color)}
                                        style={[
                                            styles.colorCircleBtn,
                                            {
                                                backgroundColor: previewColor,
                                                borderColor: isSelected ? accent.primary : (isDark ? '#334155' : '#CBD5E1'),
                                                borderWidth: isSelected ? 2.5 : 1,
                                                transform: [{ scale: isSelected ? 1.15 : 1 }],
                                            },
                                        ]}
                                    >
                                        {isSelected && (
                                            <Check size={11} color={checkColor as any} strokeWidth={3.5} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })
                            : HIGHLIGHT_COLORS.map((item, idx) => {
                                const isSelected =
                                    (item.color === 'transparent' && activeHighlightColor === null) ||
                                    (item.color !== 'transparent' && areColorsEqual(item.color, activeHighlightColor));

                                return (
                                    <TouchableOpacity
                                        key={`hl-${idx}`}
                                        activeOpacity={0.65}
                                        delayPressIn={0}
                                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                        onPress={() => handleSetHighlight(item.color)}
                                        style={[
                                            styles.colorCircleBtn,
                                            {
                                                backgroundColor: item.color === 'transparent' ? (isDark ? '#334155' : '#E2E8F0') : item.preview,
                                                borderColor: isSelected ? accent.primary : (item.color === 'transparent' ? '#EF4444' : (isDark ? '#334155' : '#CBD5E1')),
                                                borderWidth: isSelected ? 2.5 : (item.color === 'transparent' ? 1.5 : 1),
                                                transform: [{ scale: isSelected ? 1.15 : 1 }],
                                            },
                                        ]}
                                    >
                                        {item.color === 'transparent' && <View style={styles.slashLine} />}
                                        {isSelected && item.color !== 'transparent' && (
                                            <Check size={11} color="#000000" strokeWidth={3.5} />
                                        )}
                                        {isSelected && item.color === 'transparent' && (
                                            <View style={[styles.innerCheckDot, { backgroundColor: accent.primary }]} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })
                        }

                        {/* Botón rápido para borrar formato / restablecer colores */}
                        <View style={[styles.separator, { backgroundColor: colors.borderSubtle, marginHorizontal: 2 }]} />
                        <TouchableOpacity
                            style={[
                                styles.toolBtn,
                                { width: 32, height: 32 },
                                isColorGroupActive && {
                                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                                },
                            ]}
                            activeOpacity={0.65}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={handleClearFormatting}
                        >
                            <Eraser size={16} color={isColorGroupActive ? (accent.primary as any) : (colors.textPrimary as any)} />
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            )}

            {/* SUBMENÚ: TIPOGRAFÍA COMPACTA */}
            {activeSubMenu === 'fonts' && (
                <View style={styles.submenuContainer}>
                    {renderBackButton()}
                    {/* Toggle selector: Toda la nota vs Selección */}
                    <View style={[styles.fontScopeToggle, { backgroundColor: isDark ? '#232838' : '#E2E8F0' }]}>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => setFontScope('whole')}
                            style={[
                                styles.fontScopeBtn,
                                fontScope === 'whole' && { backgroundColor: isDark ? '#161922' : '#FFFFFF' },
                            ]}
                        >
                            <Text style={[styles.fontScopeText, { color: fontScope === 'whole' ? accent.primary : colors.textSecondary }]}>
                                Nota
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => setFontScope('selection')}
                            style={[
                                styles.fontScopeBtn,
                                fontScope === 'selection' && { backgroundColor: isDark ? '#161922' : '#FFFFFF' },
                            ]}
                        >
                            <Text style={[styles.fontScopeText, { color: fontScope === 'selection' ? accent.primary : colors.textSecondary }]}>
                                Texto
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.separator, { backgroundColor: colors.borderSubtle, marginHorizontal: 6 }]} />

                    {/* Fila horizontal de chips compactos de cada fuente */}
                    <ScrollView
                        horizontal
                        keyboardShouldPersistTaps="always"
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.fontsScrollRow}
                    >
                        {/* Chip para restablecer a fuente original */}
                        <TouchableOpacity
                            activeOpacity={0.65}
                            delayPressIn={0}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                            onPress={() => {
                                if (fontScope === 'whole') {
                                    onSelectFont?.(DEFAULT_NOTE_FONT_ID);
                                } else {
                                    onApplyFontToSelection?.('Plus Jakarta Sans');
                                }
                            }}
                            style={[
                                styles.fontChip,
                                {
                                    backgroundColor: (currentFontFamily === DEFAULT_NOTE_FONT_ID || !currentFontFamily)
                                        ? (accent.primary + '18')
                                        : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                                    borderColor: (currentFontFamily === DEFAULT_NOTE_FONT_ID || !currentFontFamily)
                                        ? accent.primary
                                        : colors.borderSubtle,
                                },
                            ]}
                        >
                            <RotateCcw size={12} color={accent.primary as any} style={{ marginRight: 4 }} />
                            <Text style={[styles.fontChipText, { color: colors.textPrimary }]}>
                                Original
                            </Text>
                        </TouchableOpacity>

                        {/* Cada fuente con su propio nombre en su propia tipografía */}
                        {NOTE_FONTS.map(font => {
                            const isSelected = fontScope === 'whole' && (currentFontFamily === font.id || (!currentFontFamily && font.id === 'sans'));
                            return (
                                <TouchableOpacity
                                    key={font.id}
                                    activeOpacity={0.65}
                                    delayPressIn={0}
                                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                    onPress={() => {
                                        if (fontScope === 'whole') {
                                            onSelectFont?.(font.id);
                                        } else {
                                            onApplyFontToSelection?.(font.fontName);
                                        }
                                    }}
                                    style={[
                                        styles.fontChip,
                                        {
                                            backgroundColor: isSelected
                                                ? (accent.primary + '20')
                                                : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                                            borderColor: isSelected ? accent.primary : colors.borderSubtle,
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.fontChipText,
                                            {
                                                fontFamily: font.fontName,
                                                color: isSelected ? accent.primary : colors.textPrimary,
                                                fontWeight: isSelected ? '700' : '500',
                                            },
                                        ]}
                                    >
                                        {font.name}
                                    </Text>
                                    {isSelected && (
                                        <Check size={11} color={accent.primary as any} strokeWidth={3} style={{ marginLeft: 4 }} />
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

            {/* BARRA PRINCIPAL (NIVEL 1) */}
            {activeSubMenu === 'main' && (
                <ScrollView
                    horizontal
                    style={{ height: 48 }}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.toolbarScroll}
                    keyboardShouldPersistTaps="always"
                >
                    {/* 1. Insertar / Multimedia */}
                    <TouchableOpacity
                        style={[styles.toolBtn, { backgroundColor: accent.primary + '14' }]}
                        activeOpacity={0.65}
                        delayPressIn={0}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        onPress={() => setActiveSubMenu('insert')}
                    >
                        <Plus size={18} color={accent.primary as any} strokeWidth={2.4} />
                    </TouchableOpacity>

                    {/* 2. Checklist (Acceso directo inmediato) */}
                    <TouchableOpacity
                        style={getActiveBtnStyle(isCheckboxActive)}
                        activeOpacity={0.6}
                        delayPressIn={0}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        onPress={() => handleAction(actions.checkboxList)}
                    >
                        <CheckSquare size={17} color={getActiveIconColor(isCheckboxActive)} />
                    </TouchableOpacity>

                    {/* 3. Submenú de Listas (con indicador de grupo activo) */}
                    <TouchableOpacity
                        style={[
                            styles.toolBtn,
                            isListsGroupActive && {
                                backgroundColor: accent.primary + '22',
                                borderColor: accent.primary + '66',
                                borderWidth: 1.5,
                            },
                        ]}
                        activeOpacity={0.6}
                        delayPressIn={0}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        onPress={() => setActiveSubMenu('lists')}
                    >
                        <List size={18} color={getActiveIconColor(isListsGroupActive)} />
                        {isListsGroupActive && (
                            <View style={[styles.activeDot, { backgroundColor: accent.primary }]} />
                        )}
                    </TouchableOpacity>

                    <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />

                    {/* 4. Negrita directa con indicador y respuesta en 0ms */}
                    <TouchableOpacity
                        style={getActiveBtnStyle(isBoldActive)}
                        activeOpacity={0.6}
                        delayPressIn={0}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        onPress={() => handleAction(actions.setBold)}
                    >
                        <Bold size={17} color={getActiveIconColor(isBoldActive)} />
                    </TouchableOpacity>

                    {/* 5. Cursiva directa con indicador y respuesta en 0ms */}
                    <TouchableOpacity
                        style={getActiveBtnStyle(isItalicActive)}
                        activeOpacity={0.6}
                        delayPressIn={0}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        onPress={() => handleAction(actions.setItalic)}
                    >
                        <Italic size={17} color={getActiveIconColor(isItalicActive)} />
                    </TouchableOpacity>

                    {/* 6. Submenú de Encabezados y Estilos (con indicador de grupo activo) */}
                    <TouchableOpacity
                        style={[
                            styles.toolBtnText,
                            isHeadingsGroupActive && {
                                backgroundColor: accent.primary + '22',
                                borderColor: accent.primary + '66',
                                borderWidth: 1.5,
                            },
                        ]}
                        activeOpacity={0.6}
                        delayPressIn={0}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        onPress={() => setActiveSubMenu('headings')}
                    >
                        <Text
                            style={[
                                styles.headingBtnText,
                                {
                                    color: isHeadingsGroupActive ? accent.primary : colors.textPrimary,
                                    letterSpacing: -0.5,
                                },
                            ]}
                        >
                            Aa
                        </Text>
                        {isHeadingsGroupActive && (
                            <View style={[styles.activeDot, { backgroundColor: accent.primary }]} />
                        )}
                    </TouchableOpacity>

                    <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />

                    {/* 7. Submenú Color & Resaltador (con indicadores de color seleccionado) */}
                    <TouchableOpacity
                        style={[
                            styles.toolBtn,
                            isColorGroupActive && {
                                backgroundColor: accent.primary + '22',
                                borderColor: accent.primary + '66',
                                borderWidth: 1.5,
                            },
                        ]}
                        activeOpacity={0.6}
                        delayPressIn={0}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        onPress={() => setActiveSubMenu('color')}
                    >
                        <Palette size={17} color={getActiveIconColor(isColorGroupActive)} />
                        {isColorGroupActive && (
                            <View style={styles.colorBadgeContainer}>
                                {activeHighlightColor && (
                                    <View style={[styles.miniColorDot, { backgroundColor: activeHighlightColor }]} />
                                )}
                                {activeTextColor && (
                                    <View style={[styles.miniColorDot, { backgroundColor: activeTextColor }]} />
                                )}
                                {!activeHighlightColor && !activeTextColor && (
                                    <View style={[styles.activeDot, { backgroundColor: accent.primary }]} />
                                )}
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* 8. Submenú Alineación (con indicador de grupo activo) */}
                    <TouchableOpacity
                        style={[
                            styles.toolBtn,
                            isAlignGroupActive && {
                                backgroundColor: accent.primary + '22',
                                borderColor: accent.primary + '66',
                                borderWidth: 1.5,
                            },
                        ]}
                        activeOpacity={0.6}
                        delayPressIn={0}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        onPress={() => setActiveSubMenu('align')}
                    >
                        <AlignCenter size={17} color={getActiveIconColor(isAlignGroupActive)} />
                        {isAlignGroupActive && (
                            <View style={[styles.activeDot, { backgroundColor: accent.primary }]} />
                        )}
                    </TouchableOpacity>

                    {/* 9. Tipografía (Abre submenú in-place de fuentes) */}
                    <TouchableOpacity
                        style={[
                            styles.toolBtn,
                            isFontActive && {
                                backgroundColor: accent.primary + '22',
                                borderColor: accent.primary + '66',
                                borderWidth: 1.5,
                            },
                        ]}
                        activeOpacity={0.6}
                        delayPressIn={0}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        onPress={() => setActiveSubMenu('fonts')}
                    >
                        <Type size={17} color={getActiveIconColor(isFontActive)} />
                        {isFontActive && (
                            <View style={[styles.activeDot, { backgroundColor: accent.primary }]} />
                        )}
                    </TouchableOpacity>

                    <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />

                    {/* 10. Borrar formato / restablecer a por defecto (acceso directo) */}
                    <TouchableOpacity
                        style={[
                            styles.toolBtn,
                            hasAnyFormattingActive && {
                                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                            },
                        ]}
                        activeOpacity={0.6}
                        delayPressIn={0}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                        onPress={handleClearFormatting}
                    >
                        <Eraser size={17} color={hasAnyFormattingActive ? (accent.primary as any) : (colors.textPrimary as any)} />
                        {hasAnyFormattingActive && (
                            <View style={[styles.activeDot, { backgroundColor: accent.primary }]} />
                        )}
                    </TouchableOpacity>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        borderTopWidth: 1,
        zIndex: 1000,
    },
    toolbarScroll: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        height: 48,
        gap: 3,
    },
    submenuContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        height: 48,
    },
    backButtonWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submenuScroll: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    toolBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        position: 'relative',
    },
    toolBtnText: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        position: 'relative',
    },
    headingBtnText: {
        fontSize: 14,
        fontWeight: '800',
    },
    activeDot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    colorBadgeContainer: {
        position: 'absolute',
        top: 3,
        right: 3,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    miniColorDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        borderWidth: 0.8,
        borderColor: '#FFFFFF',
    },
    toggleMiniDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        marginLeft: 4,
        borderWidth: 0.5,
        borderColor: '#FFFFFF',
    },
    separator: {
        width: 1,
        height: 20,
        marginHorizontal: 3,
    },
    colorTargetToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        padding: 2,
    },
    colorTargetBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 6,
        justifyContent: 'center',
    },
    colorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingRight: 10,
    },
    colorCircleBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    slashLine: {
        width: '100%',
        height: 1.5,
        backgroundColor: '#EF4444',
        transform: [{ rotate: '-45deg' }],
    },
    innerCheckDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    fontScopeToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        padding: 2,
    },
    fontScopeBtn: {
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fontScopeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    fontsScrollRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingRight: 10,
    },
    fontChip: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 30,
        paddingHorizontal: 10,
        borderRadius: 15,
        borderWidth: 1,
    },
    fontChipText: {
        fontSize: 12.5,
    },
});
