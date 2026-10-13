import React from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    TouchableWithoutFeedback,
    ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Type, Check, X, RotateCcw } from '@tamagui/lucide-icons';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { NOTE_FONTS, DEFAULT_NOTE_FONT_ID } from '../../constants/noteFonts';

export interface NoteFontModalProps {
    visible: boolean;
    onClose: () => void;
    selectedFont?: string;
    onSelectFont: (fontId: string) => void;
    onApplyFontToSelection?: (fontName: string) => void;
    initialScope?: 'whole' | 'selection';
}

export function NoteFontModal({
    visible,
    onClose,
    selectedFont = 'sans',
    onSelectFont,
    onApplyFontToSelection,
    initialScope = 'whole',
}: NoteFontModalProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { colors, accent, isDark } = useVeyraTheme();
    const [scope, setScope] = React.useState<'whole' | 'selection'>(initialScope);

    React.useEffect(() => {
        if (visible) {
            setScope(initialScope);
        }
    }, [visible, initialScope]);

    const isDefaultBaseFont = !selectedFont || selectedFont === DEFAULT_NOTE_FONT_ID || selectedFont === 'default' || selectedFont === 'sans';

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                {/* Backdrop táctil para cerrar */}
                <TouchableWithoutFeedback onPress={onClose}>
                    <View
                        style={[
                            StyleSheet.absoluteFill,
                            { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.35)' },
                        ]}
                    />
                </TouchableWithoutFeedback>

                {/* Hoja de selección compacta */}
                <View
                    style={[
                        styles.sheetContainer,
                        {
                            backgroundColor: isDark ? '#161922' : '#FFFFFF',
                            borderColor: colors.borderSubtle,
                            paddingBottom: Math.max(insets.bottom, 16) + 6,
                        },
                    ]}
                >
                    {/* Encabezado compacto */}
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <View
                                style={[
                                    styles.iconBadge,
                                    { backgroundColor: accent.primary + '18' },
                                ]}
                            >
                                <Type size={17} color={accent.primary as any} strokeWidth={2.4} />
                            </View>
                            <View>
                                <Text style={[styles.title, { color: colors.textPrimary }]}>
                                    {t('notes.font_family_title', { defaultValue: 'Tipografía' })}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <X size={16} color={colors.textSecondary as any} />
                        </TouchableOpacity>
                    </View>

                    {/* Selector de alcance: Toda la nota vs Texto seleccionado */}
                    {onApplyFontToSelection && (
                        <View
                            style={[
                                styles.scopeContainer,
                                { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
                            ]}
                        >
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => setScope('whole')}
                                style={[
                                    styles.scopeTab,
                                    scope === 'whole' && {
                                        backgroundColor: isDark ? '#242938' : '#FFFFFF',
                                        shadowColor: '#000',
                                        shadowOffset: { width: 0, height: 1 },
                                        shadowOpacity: isDark ? 0.3 : 0.08,
                                        shadowRadius: 2,
                                        elevation: 2,
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.scopeTabText,
                                        {
                                            color: scope === 'whole' ? accent.primary : colors.textSecondary,
                                            fontWeight: scope === 'whole' ? '700' : '500',
                                        },
                                    ]}
                                >
                                    📄 Toda la nota
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => setScope('selection')}
                                style={[
                                    styles.scopeTab,
                                    scope === 'selection' && {
                                        backgroundColor: isDark ? '#242938' : '#FFFFFF',
                                        shadowColor: '#000',
                                        shadowOffset: { width: 0, height: 1 },
                                        shadowOpacity: isDark ? 0.3 : 0.08,
                                        shadowRadius: 2,
                                        elevation: 2,
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.scopeTabText,
                                        {
                                            color: scope === 'selection' ? accent.primary : colors.textSecondary,
                                            fontWeight: scope === 'selection' ? '700' : '500',
                                        },
                                    ]}
                                >
                                    ✍️ Selección
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Lista compacta de fuentes */}
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        style={styles.fontList}
                        contentContainerStyle={styles.fontListContent}
                    >
                        {/* Fila para restablecer la tipografía original */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => {
                                if (scope === 'whole') {
                                    onSelectFont(DEFAULT_NOTE_FONT_ID);
                                } else {
                                    onApplyFontToSelection?.('Plus Jakarta Sans');
                                }
                                onClose();
                            }}
                            style={[
                                styles.fontRow,
                                {
                                    backgroundColor: (scope === 'whole' && isDefaultBaseFont)
                                        ? (accent.primary + '14')
                                        : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                                    borderColor: (scope === 'whole' && isDefaultBaseFont)
                                        ? accent.primary
                                        : colors.borderSubtle,
                                },
                            ]}
                        >
                            <View style={styles.fontRowLeft}>
                                <View
                                    style={[
                                        styles.resetIconBadge,
                                        { backgroundColor: accent.primary + '18' },
                                    ]}
                                >
                                    <RotateCcw size={14} color={accent.primary as any} strokeWidth={2.4} />
                                </View>
                                <View>
                                    <Text style={[styles.fontNameText, { color: colors.textPrimary, fontWeight: '700' }]}>
                                        Fuente original (Predeterminada)
                                    </Text>
                                    <Text style={[styles.fontMetaText, { color: colors.textSecondary }]}>
                                        Plus Jakarta Sans • Sistema
                                    </Text>
                                </View>
                            </View>

                            {scope === 'whole' && isDefaultBaseFont && (
                                <View style={[styles.checkCircle, { backgroundColor: accent.primary, borderColor: accent.primary }]}>
                                    <Check size={11} color="#FFFFFF" strokeWidth={3} />
                                </View>
                            )}
                        </TouchableOpacity>

                        {/* Filas compactas por cada tipografía */}
                        {NOTE_FONTS.map((font) => {
                            const isSelected = scope === 'whole' && (selectedFont === font.id || (isDefaultBaseFont && font.id === DEFAULT_NOTE_FONT_ID));

                            return (
                                <TouchableOpacity
                                    key={font.id}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        if (scope === 'whole') {
                                            onSelectFont(font.id);
                                        } else {
                                            onApplyFontToSelection?.(font.fontName);
                                        }
                                        onClose();
                                    }}
                                    style={[
                                        styles.fontRow,
                                        {
                                            backgroundColor: isSelected
                                                ? (accent.primary + '14')
                                                : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                                            borderColor: isSelected ? accent.primary : colors.borderSubtle,
                                        },
                                    ]}
                                >
                                    <View style={styles.fontRowLeft}>
                                        <View>
                                            <Text
                                                style={[
                                                    styles.fontNameText,
                                                    {
                                                        fontFamily: font.fontName,
                                                        color: isSelected ? accent.primary : colors.textPrimary,
                                                        fontSize: 16,
                                                    },
                                                ]}
                                            >
                                                {font.name}
                                            </Text>
                                            <Text style={[styles.fontMetaText, { color: colors.textSecondary }]}>
                                                {font.fontName} • {font.description}
                                            </Text>
                                        </View>
                                    </View>

                                    {isSelected && (
                                        <View style={[styles.checkCircle, { backgroundColor: accent.primary, borderColor: accent.primary }]}>
                                            <Check size={11} color="#FFFFFF" strokeWidth={3} />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        borderBottomWidth: 0,
        maxHeight: '65%',
        paddingTop: 14,
        paddingHorizontal: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    iconBadge: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
    },
    closeBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scopeContainer: {
        flexDirection: 'row',
        borderRadius: 10,
        padding: 3,
        marginBottom: 12,
    },
    scopeTab: {
        flex: 1,
        paddingVertical: 7,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scopeTabText: {
        fontSize: 12.5,
    },
    fontList: {
        maxHeight: 340,
    },
    fontListContent: {
        gap: 7,
        paddingBottom: 10,
    },
    fontRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    fontRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    resetIconBadge: {
        width: 28,
        height: 28,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fontNameText: {
        fontSize: 14.5,
    },
    fontMetaText: {
        fontSize: 11,
        marginTop: 1,
    },
    checkCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
