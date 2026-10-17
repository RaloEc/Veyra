import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Camera, Image as ImageIcon, FilePlus2, FileText, Trash2, Eye } from '@tamagui/lucide-icons';
import ImageViewing from 'react-native-image-viewing';
import { useTranslation } from 'react-i18next';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';

interface AttachmentsSectionProps {
    attachments: { uri: string; name: string }[];
    MAX_ATTACHMENTS: number;
    pickImage: (useCamera: boolean) => void;
    pickDocument: () => void;
    openAttachment: (uri: string) => void;
    removeAttachment: (index: number) => void;
    isDark?: boolean;
    flat?: boolean;
}

const isImageUri = (uri?: string) => {
    if (!uri || typeof uri !== 'string') return false;
    const lower = uri.toLowerCase();
    return (
        lower.includes('imagepicker') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.webp') ||
        lower.startsWith('data:image')
    );
};

/**
 * AttachmentsSection — Sección de carga y gestión de archivos adjuntos con previsualización de imágenes
 */
export function AttachmentsSection({
    attachments,
    MAX_ATTACHMENTS,
    pickImage,
    pickDocument,
    openAttachment,
    removeAttachment,
    flat,
}: AttachmentsSectionProps) {
    const { t } = useTranslation();
    const { colors, typography, radii, isDark } = useVeyraTheme();
    const isLimitReached = attachments.length >= MAX_ATTACHMENTS;

    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);

    // Filtrar imágenes para el visor a pantalla completa
    const imageAttachments = attachments.filter(a => isImageUri(a.uri));

    const handleOpenImage = (uri: string) => {
        const idx = imageAttachments.findIndex(img => img.uri === uri);
        if (idx !== -1) {
            setViewerIndex(idx);
            setViewerVisible(true);
        } else {
            openAttachment(uri);
        }
    };

    if (flat && attachments.length === 0) {
        return null;
    }

    if (flat) {
        return (
            <View style={styles.flatContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.flatAttachmentsList}
                >
                    {attachments.map((item, index) => {
                        const isImage = isImageUri(item.uri);

                        if (isImage) {
                            return (
                                <View key={index} style={styles.imageCardWrapper}>
                                    <TouchableOpacity
                                        activeOpacity={0.85}
                                        onPress={() => handleOpenImage(item.uri)}
                                        style={[
                                            styles.imageCard,
                                            {
                                                borderColor: colors.borderSubtle,
                                                borderRadius: radii.md,
                                                backgroundColor: colors.surfaceElevated,
                                            },
                                        ]}
                                    >
                                        <Image
                                            source={{ uri: item.uri }}
                                            style={[styles.thumbnailImage, { borderRadius: radii.md - 1 }]}
                                            resizeMode="cover"
                                        />
                                        <View style={styles.imageOverlayBadge}>
                                            <Eye size={12} color="#FFFFFF" />
                                        </View>
                                    </TouchableOpacity>

                                    {/* Delete Floating Pill */}
                                    <TouchableOpacity
                                        onPress={() => removeAttachment(index)}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        style={styles.deleteBadge}
                                    >
                                        <Trash2 size={12} color="#FFFFFF" />
                                    </TouchableOpacity>
                                </View>
                            );
                        }

                        // Non-image document chip
                        return (
                            <VeyraSurface
                                key={index}
                                level={2}
                                radius="md"
                                style={styles.attachmentChip}
                            >
                                <TouchableOpacity
                                    onPress={() => openAttachment(item.uri)}
                                    style={styles.attachmentOpenBtn}
                                >
                                    <FileText size={14} color={colors.textSecondary} />
                                    <Text
                                        numberOfLines={1}
                                        style={[
                                            styles.attachmentName,
                                            { color: colors.textPrimary, fontSize: typography.caption.fontSize },
                                        ]}
                                    >
                                        {item.name}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => removeAttachment(index)}
                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    style={styles.attachmentDeleteBtn}
                                >
                                    <Trash2 size={13} color={isDark ? '#FB7185' : '#E11D48'} />
                                </TouchableOpacity>
                            </VeyraSurface>
                        );
                    })}
                </ScrollView>

                {/* Fullscreen Image Viewer Modal */}
                <ImageViewing
                    images={imageAttachments.map(img => ({ uri: img.uri }))}
                    imageIndex={viewerIndex}
                    visible={viewerVisible}
                    onRequestClose={() => setViewerVisible(false)}
                    swipeToCloseEnabled={true}
                    doubleTapToZoomEnabled={true}
                />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                    {t('create.sections.multimedia').toUpperCase()}
                </Text>
                <Text
                    style={[
                        styles.countText,
                        {
                            color: isLimitReached ? (isDark ? '#FB7185' : '#E11D48') : colors.textMuted,
                            fontSize: typography.micro.fontSize,
                        },
                    ]}
                >
                    {attachments.length} / {MAX_ATTACHMENTS}
                </Text>
            </View>

            {/* Action Buttons Row */}
            <View style={styles.buttonsRow}>
                <TouchableOpacity
                    onPress={() => pickImage(true)}
                    disabled={isLimitReached}
                    activeOpacity={0.8}
                    style={[
                        styles.actionButton,
                        {
                            backgroundColor: colors.surface,
                            borderColor: colors.borderSubtle,
                            borderRadius: radii.md,
                            opacity: isLimitReached ? 0.4 : 1,
                        },
                    ]}
                >
                    <Camera size={18} color={colors.textSecondary} />
                    <Text style={[styles.actionLabel, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                        {t('create.multimedia.camera')}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => pickImage(false)}
                    disabled={isLimitReached}
                    activeOpacity={0.8}
                    style={[
                        styles.actionButton,
                        {
                            backgroundColor: colors.surface,
                            borderColor: colors.borderSubtle,
                            borderRadius: radii.md,
                            opacity: isLimitReached ? 0.4 : 1,
                        },
                    ]}
                >
                    <ImageIcon size={18} color={colors.textSecondary} />
                    <Text style={[styles.actionLabel, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                        {t('create.multimedia.gallery')}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => pickDocument()}
                    disabled={isLimitReached}
                    activeOpacity={0.8}
                    style={[
                        styles.actionButton,
                        {
                            backgroundColor: colors.surface,
                            borderColor: colors.borderSubtle,
                            borderRadius: radii.md,
                            opacity: isLimitReached ? 0.4 : 1,
                        },
                    ]}
                >
                    <FilePlus2 size={18} color={colors.textSecondary} />
                    <Text style={[styles.actionLabel, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                        {t('create.multimedia.file')}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Attachments List with Previews */}
            {attachments.length > 0 && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.attachmentsList}
                >
                    {attachments.map((item, index) => {
                        const isImage = isImageUri(item.uri);

                        if (isImage) {
                            return (
                                <View key={index} style={styles.imageCardWrapper}>
                                    <TouchableOpacity
                                        activeOpacity={0.85}
                                        onPress={() => handleOpenImage(item.uri)}
                                        style={[
                                            styles.imageCard,
                                            {
                                                borderColor: colors.borderSubtle,
                                                borderRadius: radii.md,
                                                backgroundColor: colors.surfaceElevated,
                                            },
                                        ]}
                                    >
                                        <Image
                                            source={{ uri: item.uri }}
                                            style={[styles.thumbnailImage, { borderRadius: radii.md - 1 }]}
                                            resizeMode="cover"
                                        />
                                        <View style={styles.imageOverlayBadge}>
                                            <Eye size={12} color="#FFFFFF" />
                                        </View>
                                    </TouchableOpacity>

                                    {/* Delete Floating Pill */}
                                    <TouchableOpacity
                                        onPress={() => removeAttachment(index)}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        style={styles.deleteBadge}
                                    >
                                        <Trash2 size={12} color="#FFFFFF" />
                                    </TouchableOpacity>
                                </View>
                            );
                        }

                        // Non-image document chip
                        return (
                            <VeyraSurface
                                key={index}
                                level={2}
                                radius="md"
                                style={styles.attachmentChip}
                            >
                                <TouchableOpacity
                                    onPress={() => openAttachment(item.uri)}
                                    style={styles.attachmentOpenBtn}
                                >
                                    <FileText size={14} color={colors.textSecondary} />
                                    <Text
                                        numberOfLines={1}
                                        style={[
                                            styles.attachmentName,
                                            { color: colors.textPrimary, fontSize: typography.caption.fontSize },
                                        ]}
                                    >
                                        {item.name}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => removeAttachment(index)}
                                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    style={styles.attachmentDeleteBtn}
                                >
                                    <Trash2 size={13} color={isDark ? '#FB7185' : '#E11D48'} />
                                </TouchableOpacity>
                            </VeyraSurface>
                        );
                    })}
                </ScrollView>
            )}

            {/* Fullscreen Image Viewer Modal */}
            <ImageViewing
                images={imageAttachments.map(img => ({ uri: img.uri }))}
                imageIndex={viewerIndex}
                visible={viewerVisible}
                onRequestClose={() => setViewerVisible(false)}
                swipeToCloseEnabled={true}
                doubleTapToZoomEnabled={true}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        gap: 8,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    sectionTitle: {
        fontWeight: '700',
        letterSpacing: 0.8,
    },
    countText: {
        fontWeight: '700',
    },
    buttonsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        flex: 1,
        height: 62,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        gap: 4,
    },
    actionLabel: {
        fontWeight: '600',
    },
    attachmentsList: {
        paddingVertical: 6,
        gap: 8,
    },
    attachmentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 10,
        gap: 8,
    },
    attachmentOpenBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        maxWidth: 140,
    },
    attachmentName: {
        fontWeight: '600',
    },
    attachmentDeleteBtn: {
        padding: 2,
    },
    imageCardWrapper: {
        position: 'relative',
        marginRight: 4,
    },
    imageCard: {
        width: 76,
        height: 76,
        borderWidth: 1,
        overflow: 'hidden',
        position: 'relative',
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
    },
    imageOverlayBadge: {
        position: 'absolute',
        bottom: 4,
        left: 4,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteBadge: {
        position: 'absolute',
        top: -6,
        right: -6,
        backgroundColor: '#E11D48',
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#0A0A0A',
        zIndex: 10,
    },
    flatContainer: {
        marginBottom: 8,
    },
    flatAttachmentsList: {
        paddingVertical: 4,
        gap: 8,
    },
});
