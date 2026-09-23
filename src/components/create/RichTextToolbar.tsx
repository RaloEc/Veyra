import React, { useState, useEffect } from 'react';
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
    Heading1,
    Heading2,
    Quote,
    Minus,
    Palette,
    Highlighter,
    Undo2,
    Redo2,
    Eraser,
    Image as ImageIcon,
    Camera,
    Paperclip,
    FileText,
    CheckSquare,
    X,
    ChevronDown,
} from '@tamagui/lucide-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVeyraTheme } from '../../theme/useVeyraTheme';

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
}

// Colores de texto
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

export function RichTextToolbar({
    editorRef,
    isNotesFocused,
    onPressCamera,
    onPressGallery,
    onPressDocument,
    onPressAddImage,
    onPressAttachment,
    alwaysVisible = true,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
}: RichTextToolbarProps) {
    const insets = useSafeAreaInsets();
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    const [activeSubPanel, setActiveSubPanel] = useState<'none' | 'textColor' | 'highlight'>('none');
    const { colors, accent, isDark } = useVeyraTheme();

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSubscription = Keyboard.addListener(showEvent, () => {
            setIsKeyboardVisible(true);
        });
        const hideSubscription = Keyboard.addListener(hideEvent, () => {
            setIsKeyboardVisible(false);
            setActiveSubPanel('none');
        });

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    const isVisible = alwaysVisible || isNotesFocused || isKeyboardVisible;
    if (!isVisible) return null;

    // Ejecuta una acción estándar de pell-rich-editor
    const handleAction = (action: string, data?: any) => {
        if (!editorRef.current) return;
        if (data !== undefined) {
            editorRef.current.sendAction(action, 'result', data);
        } else {
            editorRef.current.sendAction(action, 'result');
        }
    };

    // Color de texto
    const handleSetTextColor = (color: string) => {
        if (!editorRef.current) return;
        const finalColor = color === 'default' ? (isDark ? '#F4F4F5' : '#0F172A') : color;
        editorRef.current.sendAction(actions.foreColor, 'result', finalColor);
        setActiveSubPanel('none');
    };

    // Color de fondo / resaltador
    const handleSetHighlight = (color: string) => {
        if (!editorRef.current) return;
        editorRef.current.sendAction(actions.hiliteColor, 'result', color);
        setActiveSubPanel('none');
    };

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
            {/* Sub-panel emergente: Paleta de color de texto */}
            {activeSubPanel === 'textColor' && (
                <View style={[styles.subPanel, { backgroundColor: isDark ? '#1A1D27' : '#F1F5F9', borderBottomColor: colors.borderSubtle }]}>
                    <Text style={[styles.subPanelLabel, { color: colors.textSecondary }]}>Color de texto:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
                        {TEXT_COLORS.map((item, idx) => (
                            <TouchableOpacity
                                key={`tc-${idx}`}
                                activeOpacity={0.7}
                                onPress={() => handleSetTextColor(item.color)}
                                style={[
                                    styles.colorCircleBtn,
                                    {
                                        backgroundColor: item.color === 'default' ? (isDark ? '#FFFFFF' : '#0F172A') : item.preview,
                                        borderColor: isDark ? '#334155' : '#CBD5E1',
                                    },
                                ]}
                            />
                        ))}
                    </ScrollView>
                    <TouchableOpacity onPress={() => setActiveSubPanel('none')} style={styles.closeSubPanelBtn}>
                        <X size={15} color={colors.textSecondary as any} />
                    </TouchableOpacity>
                </View>
            )}

            {/* Sub-panel emergente: Paleta de marcatextos */}
            {activeSubPanel === 'highlight' && (
                <View style={[styles.subPanel, { backgroundColor: isDark ? '#1A1D27' : '#F1F5F9', borderBottomColor: colors.borderSubtle }]}>
                    <Text style={[styles.subPanelLabel, { color: colors.textSecondary }]}>Resaltador:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
                        {HIGHLIGHT_COLORS.map((item, idx) => (
                            <TouchableOpacity
                                key={`hl-${idx}`}
                                activeOpacity={0.7}
                                onPress={() => handleSetHighlight(item.color)}
                                style={[
                                    styles.colorCircleBtn,
                                    {
                                        backgroundColor: item.color === 'transparent' ? (isDark ? '#334155' : '#E2E8F0') : item.preview,
                                        borderColor: item.color === 'transparent' ? '#EF4444' : (isDark ? '#334155' : '#CBD5E1'),
                                        borderWidth: item.color === 'transparent' ? 1.5 : 1,
                                    },
                                ]}
                            >
                                {item.color === 'transparent' && (
                                    <View style={styles.slashLine} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity onPress={() => setActiveSubPanel('none')} style={styles.closeSubPanelBtn}>
                        <X size={15} color={colors.textSecondary as any} />
                    </TouchableOpacity>
                </View>
            )}

            {/* Barra principal horizontal con herramientas de formato */}
            <ScrollView
                horizontal
                style={{ height: 48 }}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.toolbarScroll}
                keyboardShouldPersistTaps="always"
            >
                {/* 1. Acciones Multimedia Directas (Cámara, Galería, Archivos/Documentos) */}
                {onPressCamera && (
                    <TouchableOpacity
                        style={styles.toolBtn}
                        activeOpacity={0.6}
                        onPress={onPressCamera}
                    >
                        <Camera size={17} color={colors.textPrimary as any} />
                    </TouchableOpacity>
                )}

                {(onPressGallery || onPressAddImage) && (
                    <TouchableOpacity
                        style={styles.toolBtn}
                        activeOpacity={0.6}
                        onPress={onPressGallery || onPressAddImage}
                    >
                        <ImageIcon size={17} color={colors.textPrimary as any} />
                    </TouchableOpacity>
                )}

                {(onPressDocument || onPressAttachment) && (
                    <TouchableOpacity
                        style={styles.toolBtn}
                        activeOpacity={0.6}
                        onPress={onPressDocument || onPressAttachment}
                    >
                        <FileText size={17} color={colors.textPrimary as any} />
                    </TouchableOpacity>
                )}

                {(onPressCamera || onPressGallery || onPressDocument || onPressAttachment || onPressAddImage) && (
                    <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />
                )}

                {/* 2. Formato de Caracteres */}
                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.setBold)}
                >
                    <Bold size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.setItalic)}
                >
                    <Italic size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.setUnderline)}
                >
                    <Underline size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.setStrikethrough)}
                >
                    <Strikethrough size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />

                {/* 3. Alineación de Texto (Izquierda, Centro, Derecha, Justificado) */}
                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.alignLeft)}
                >
                    <AlignLeft size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.alignCenter)}
                >
                    <AlignCenter size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.alignRight)}
                >
                    <AlignRight size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.alignFull)}
                >
                    <AlignJustify size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />

                {/* 4. Estructura y Listas */}
                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.checkboxList)}
                >
                    <CheckSquare size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.insertBulletsList)}
                >
                    <List size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.insertOrderedList)}
                >
                    <ListOrdered size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtnText}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.heading1)}
                >
                    <Text style={[styles.headingBtnText, { color: colors.textPrimary }]}>H1</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtnText}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.heading2)}
                >
                    <Text style={[styles.headingBtnText, { color: colors.textPrimary }]}>H2</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.blockquote)}
                >
                    <Quote size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.setHR)}
                >
                    <Minus size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />

                {/* 5. Color y Resaltado */}
                <TouchableOpacity
                    style={[
                        styles.toolBtn,
                        activeSubPanel === 'textColor' && { backgroundColor: accent.primary + '25', borderRadius: 6 },
                    ]}
                    activeOpacity={0.6}
                    onPress={() => setActiveSubPanel(activeSubPanel === 'textColor' ? 'none' : 'textColor')}
                >
                    <Palette size={17} color={activeSubPanel === 'textColor' ? accent.primary : (colors.textPrimary as any)} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.toolBtn,
                        activeSubPanel === 'highlight' && { backgroundColor: accent.primary + '25', borderRadius: 6 },
                    ]}
                    activeOpacity={0.6}
                    onPress={() => setActiveSubPanel(activeSubPanel === 'highlight' ? 'none' : 'highlight')}
                >
                    <Highlighter size={17} color={activeSubPanel === 'highlight' ? accent.primary : (colors.textPrimary as any)} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => handleAction(actions.removeFormat)}
                >
                    <Eraser size={17} color={colors.textPrimary as any} />
                </TouchableOpacity>

                <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />

                {/* 6. Deshacer y Rehacer */}
                <TouchableOpacity
                    style={[
                        styles.toolBtn,
                        canUndo === false && { opacity: 0.35 },
                    ]}
                    activeOpacity={0.6}
                    disabled={canUndo === false}
                    onPress={() => {
                        if (onUndo) {
                            onUndo();
                        } else {
                            handleAction(actions.undo);
                        }
                    }}
                >
                    <Undo2 size={17} color={(canUndo ? colors.textPrimary : colors.textSecondary) as any} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.toolBtn,
                        canRedo === false && { opacity: 0.35 },
                    ]}
                    activeOpacity={0.6}
                    disabled={canRedo === false}
                    onPress={() => {
                        if (onRedo) {
                            onRedo();
                        } else {
                            handleAction(actions.redo);
                        }
                    }}
                >
                    <Redo2 size={17} color={(canRedo ? colors.textPrimary : colors.textSecondary) as any} />
                </TouchableOpacity>

                <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />

                {/* 7. Ocultar teclado */}
                <TouchableOpacity
                    style={styles.toolBtn}
                    activeOpacity={0.6}
                    onPress={() => {
                        Keyboard.dismiss();
                        editorRef.current?.blurContentEditor?.();
                    }}
                >
                    <ChevronDown size={18} color={colors.textSecondary as any} />
                </TouchableOpacity>
            </ScrollView>
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
        gap: 2,
    },
    toolBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
    },
    toolBtnText: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
    },
    headingBtnText: {
        fontSize: 13,
        fontWeight: '800',
    },
    separator: {
        width: 1,
        height: 20,
        marginHorizontal: 4,
    },
    subPanel: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        gap: 8,
    },
    subPanelLabel: {
        fontSize: 12,
        fontWeight: '600',
    },
    colorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 4,
    },
    colorCircleBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    slashLine: {
        width: 16,
        height: 1.5,
        backgroundColor: '#EF4444',
        transform: [{ rotate: '-45deg' }],
    },
    closeSubPanelBtn: {
        padding: 4,
        marginLeft: 4,
    },
});
