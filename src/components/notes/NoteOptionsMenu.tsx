import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    Animated,
    TouchableWithoutFeedback,
    ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
    FileDown,
    Layers,
    FolderInput,
    Pin,
    Trash2,
    Edit3,
    Eye,
} from '@tamagui/lucide-icons';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';

export interface NoteOptionsMenuProps {
    visible: boolean;
    onClose: () => void;
    onExportPdf: () => void;
    isExportingPdf?: boolean;
    onOpenPagesManager: () => void;
    pageCount: number;
    isPinned: boolean;
    onTogglePin: () => void;
    onMoveFolder?: () => void;
    folderName?: string | null;
    onDelete?: () => void;
    isEditMode?: boolean;
    onToggleEditMode?: () => void;
}

export function NoteOptionsMenu({
    visible,
    onClose,
    onExportPdf,
    isExportingPdf = false,
    onOpenPagesManager,
    pageCount,
    isPinned,
    onTogglePin,
    onMoveFolder,
    onDelete,
    isEditMode,
    onToggleEditMode,
}: NoteOptionsMenuProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { colors, accent, isDark } = useVeyraTheme();

    const [shouldRender, setShouldRender] = useState(visible);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const translateYAnim = useRef(new Animated.Value(-6)).current;

    useEffect(() => {
        if (visible) {
            setShouldRender(true);
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 160,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 90,
                    friction: 8,
                    useNativeDriver: true,
                }),
                Animated.spring(translateYAnim, {
                    toValue: 0,
                    tension: 90,
                    friction: 8,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 120,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 0.92,
                    duration: 120,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                setShouldRender(false);
            });
        }
    }, [visible]);

    if (!shouldRender) return null;

    const topPosition = Math.max(insets.top, 12) + 46;

    return (
        <Modal
            visible={true}
            transparent={true}
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={styles.fullscreenContainer}>
                {/* Backdrop invisible para cerrar al tocar fuera */}
                <TouchableWithoutFeedback onPress={onClose}>
                    <Animated.View
                        style={[
                            StyleSheet.absoluteFill,
                            {
                                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.12)',
                                opacity: fadeAnim,
                            },
                        ]}
                    />
                </TouchableWithoutFeedback>

                {/* Popover anclado a la esquina superior derecha */}
                <Animated.View
                    style={[
                        styles.popoverContainer,
                        {
                            top: topPosition,
                            opacity: fadeAnim,
                            transform: [
                                { translateY: translateYAnim },
                                { scale: scaleAnim },
                            ],
                        },
                    ]}
                >
                    <VeyraSurface
                        level={2}
                        radius="lg"
                        style={[
                            styles.surfaceCard,
                            {
                                backgroundColor: isDark ? '#1C1F26' : '#FFFFFF',
                                borderColor: colors.borderSubtle,
                            },
                        ]}
                    >
                        {/* 1. Exportar a PDF */}
                        <TouchableOpacity
                            activeOpacity={0.65}
                            disabled={isExportingPdf}
                            onPress={() => {
                                onClose();
                                onExportPdf();
                            }}
                            style={styles.menuRow}
                        >
                            <View style={styles.iconSlot}>
                                {isExportingPdf ? (
                                    <ActivityIndicator size="small" color={accent.primary} />
                                ) : (
                                    <FileDown size={16} color={accent.primary as any} strokeWidth={2.2} />
                                )}
                            </View>
                            <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>
                                {t('notes.export_pdf', { defaultValue: 'Exportar a PDF' })}
                            </Text>
                        </TouchableOpacity>

                        {/* 2. Organizador de Hojas */}
                        <TouchableOpacity
                            activeOpacity={0.65}
                            onPress={() => {
                                onClose();
                                onOpenPagesManager();
                            }}
                            style={styles.menuRow}
                        >
                            <View style={styles.iconSlot}>
                                <Layers size={16} color="#8B5CF6" strokeWidth={2.2} />
                            </View>
                            <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>
                                {t('notes.pages_manager', { defaultValue: 'Organizar hojas' })}
                            </Text>
                            <View style={[styles.badgePill, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' }]}>
                                <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                                    {pageCount}
                                </Text>
                            </View>
                        </TouchableOpacity>

                        {/* 3. Mover a Carpeta */}
                        {onMoveFolder && (
                            <TouchableOpacity
                                activeOpacity={0.65}
                                onPress={() => {
                                    onClose();
                                    onMoveFolder();
                                }}
                                style={styles.menuRow}
                            >
                                <View style={styles.iconSlot}>
                                    <FolderInput size={16} color="#3B82F6" strokeWidth={2.2} />
                                </View>
                                <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>
                                    {t('notes.move_folder', { defaultValue: 'Mover a carpeta' })}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {/* 4. Fijar / Desfijar */}
                        <TouchableOpacity
                            activeOpacity={0.65}
                            onPress={() => {
                                onTogglePin();
                            }}
                            style={styles.menuRow}
                        >
                            <View style={styles.iconSlot}>
                                <Pin
                                    size={16}
                                    color={isPinned ? '#F59E0B' : (colors.textSecondary as any)}
                                    strokeWidth={2.2}
                                    style={{ transform: [{ rotate: isPinned ? '45deg' : '0deg' }] }}
                                />
                            </View>
                            <Text style={[styles.menuLabel, { color: isPinned ? '#F59E0B' : colors.textPrimary }]}>
                                {isPinned
                                    ? t('notes.unpin_note', { defaultValue: 'Desfijar' })
                                    : t('notes.pin_note', { defaultValue: 'Fijar nota' })}
                            </Text>
                        </TouchableOpacity>

                        {/* 5. Alternar Modo Lectura / Edición */}
                        {onToggleEditMode && (
                            <TouchableOpacity
                                activeOpacity={0.65}
                                onPress={() => {
                                    onClose();
                                    onToggleEditMode();
                                }}
                                style={styles.menuRow}
                            >
                                <View style={styles.iconSlot}>
                                    {isEditMode ? (
                                        <Eye size={16} color="#10B981" strokeWidth={2.2} />
                                    ) : (
                                        <Edit3 size={16} color="#10B981" strokeWidth={2.2} />
                                    )}
                                </View>
                                <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>
                                    {isEditMode
                                        ? t('notes.view_mode', { defaultValue: 'Modo lectura' })
                                        : t('notes.edit_mode', { defaultValue: 'Modo edición' })}
                                </Text>
                            </TouchableOpacity>
                        )}

                        {/* Línea divisoria minimalista */}
                        {onDelete && (
                            <>
                                <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

                                {/* 6. Eliminar nota */}
                                <TouchableOpacity
                                    activeOpacity={0.65}
                                    onPress={() => {
                                        onClose();
                                        onDelete();
                                    }}
                                    style={styles.menuRow}
                                >
                                    <View style={styles.iconSlot}>
                                        <Trash2 size={16} color={isDark ? '#FB7185' : '#E11D48'} strokeWidth={2.2} />
                                    </View>
                                    <Text style={[styles.menuLabel, { color: isDark ? '#FB7185' : '#E11D48' }]}>
                                        {t('notes.delete_note', { defaultValue: 'Eliminar nota' })}
                                    </Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </VeyraSurface>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    fullscreenContainer: {
        flex: 1,
    },
    popoverContainer: {
        position: 'absolute',
        right: 14,
        width: 198,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
        elevation: 14,
    },
    surfaceCard: {
        borderRadius: 16,
        paddingVertical: 5,
        paddingHorizontal: 5,
        borderWidth: 1,
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        paddingHorizontal: 10,
        borderRadius: 10,
        gap: 10,
    },
    iconSlot: {
        width: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuLabel: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: -0.1,
    },
    badgePill: {
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 8,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '700',
    },
    divider: {
        height: 1,
        marginVertical: 4,
        marginHorizontal: 8,
    },
});
