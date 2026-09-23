import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    TouchableOpacity,
    Animated,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Image as ImageIcon, FileText, X } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import { useVeyraTheme } from '../../theme/useVeyraTheme';

interface AttachmentBottomSheetProps {
    isVisible: boolean;
    onClose: () => void;
    onSelectCamera: () => void;
    onSelectGallery: () => void;
    onSelectDocument: () => void;
}

/**
 * AttachmentBottomSheet — Menú deslizable inferior moderno tipo Samsung Notes / Apple Notes.
 */
export function AttachmentBottomSheet({
    isVisible,
    onClose,
    onSelectCamera,
    onSelectGallery,
    onSelectDocument,
}: AttachmentBottomSheetProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();

    const slideAnim = useRef(new Animated.Value(300)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isVisible) {
            Animated.parallel([
                Animated.timing(backdropAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 65,
                    friction: 9,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(backdropAnim, {
                    toValue: 0,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 300,
                    duration: 150,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [isVisible]);

    if (!isVisible) return null;

    const handleAction = (action: () => void) => {
        onClose();
        setTimeout(action, 200);
    };

    return (
        <Modal
            transparent
            visible={isVisible}
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                {/* Backdrop táctil */}
                <Animated.View
                    style={[
                        styles.backdrop,
                        {
                            opacity: backdropAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 0.55],
                            }),
                        },
                    ]}
                >
                    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                </Animated.View>

                {/* Sheet deslizable */}
                <Animated.View
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: colors.surfaceElevated,
                            borderColor: colors.borderSubtle,
                            paddingBottom: Math.max(insets.bottom, 20) + 8,
                            transform: [{ translateY: slideAnim }],
                        },
                    ]}
                >
                    {/* Indicador de arrastre */}
                    <View style={styles.dragHandleContainer}>
                        <View style={[styles.dragHandle, { backgroundColor: colors.borderSubtle }]} />
                    </View>

                    {/* Header del Sheet */}
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.textPrimary, fontSize: 17, fontWeight: '700' }]}>
                            {t('create.sections.attachments', { defaultValue: 'Adjuntar a la nota' })}
                        </Text>
                        <TouchableOpacity
                            onPress={onClose}
                            style={[styles.closeBtn, { backgroundColor: colors.surface }]}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <X size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Opciones */}
                    <View style={styles.optionsContainer}>
                        {/* Opción 1: Cámara */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[styles.optionItem, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
                            onPress={() => handleAction(onSelectCamera)}
                        >
                            <View style={[styles.iconCircle, { backgroundColor: `${accent.primary}18` }]}>
                                <Camera size={22} color={accent.primary} />
                            </View>
                            <View style={styles.optionTextContainer}>
                                <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                                    {t('create.multimedia.camera', { defaultValue: 'Hacer foto con la cámara' })}
                                </Text>
                                <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
                                    {t('create.multimedia.camera_hint', { defaultValue: 'Capturar e insertar en la nota' })}
                                </Text>
                            </View>
                        </TouchableOpacity>

                        {/* Opción 2: Galería */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[styles.optionItem, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
                            onPress={() => handleAction(onSelectGallery)}
                        >
                            <View style={[styles.iconCircle, { backgroundColor: '#10B98118' }]}>
                                <ImageIcon size={22} color="#10B981" />
                            </View>
                            <View style={styles.optionTextContainer}>
                                <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                                    {t('create.multimedia.gallery', { defaultValue: 'Elegir de la galería' })}
                                </Text>
                                <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
                                    {t('create.multimedia.gallery_hint', { defaultValue: 'Insertar en la posición del cursor' })}
                                </Text>
                            </View>
                        </TouchableOpacity>

                        {/* Opción 3: Documento / PDF */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[styles.optionItem, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
                            onPress={() => handleAction(onSelectDocument)}
                        >
                            <View style={[styles.iconCircle, { backgroundColor: '#3B82F618' }]}>
                                <FileText size={22} color="#3B82F6" />
                            </View>
                            <View style={styles.optionTextContainer}>
                                <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                                    {t('create.multimedia.document', { defaultValue: 'Adjuntar documento o PDF' })}
                                </Text>
                                <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
                                    {t('create.multimedia.document_hint', { defaultValue: 'Archivos legibles por el sistema' })}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...(StyleSheet.absoluteFill as object),
        backgroundColor: '#000000',
    },
    sheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        paddingHorizontal: 20,
        paddingTop: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 20,
    },
    dragHandleContainer: {
        alignItems: 'center',
        paddingVertical: 6,
    },
    dragHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 6,
        marginBottom: 16,
    },
    title: {
        letterSpacing: -0.3,
    },
    closeBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionsContainer: {
        gap: 10,
    },
    optionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        gap: 14,
    },
    iconCircle: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionTextContainer: {
        flex: 1,
        gap: 2,
    },
    optionTitle: {
        fontSize: 15,
        fontWeight: '600',
    },
    optionSubtitle: {
        fontSize: 12,
    },
});
