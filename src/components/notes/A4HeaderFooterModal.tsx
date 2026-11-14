import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    TextInput,
    Switch,
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Platform,
    Alert,
} from 'react-native';
import {
    X,
    FileText,
    Hash,
    Calendar,
    User,
    Trash2,
    Bookmark,
    Plus,
    Sparkles,
    Check,
    AlignLeft,
    AlignCenter,
    AlignRight,
} from '@tamagui/lucide-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';
import { VeyraIconButton } from '../ui/VeyraIconButton';
import {
    A4HeaderFooterConfig,
    A4BandConfig,
    A4HeaderFooterSavedTemplate,
    A4HeaderFooterImageItem,
    A4_HEADER_PRESETS,
    A4_FOOTER_PRESETS,
    syncSavedA4TemplatesFromCloud,
    saveNewA4Template,
    deleteSavedA4Template,
    uploadHeaderFooterLogoMobile,
} from '../../utils/a4HeaderFooterUtils';

export interface A4HeaderFooterModalProps {
    visible: boolean;
    onClose: () => void;
    initialKind?: 'header' | 'footer';
    initialPageNumber?: number;
    config: A4HeaderFooterConfig;
    onChangeConfig: (next: A4HeaderFooterConfig) => void;
    canEdit?: boolean;
}

export function A4HeaderFooterModal({
    visible,
    onClose,
    initialKind = 'header',
    initialPageNumber = 1,
    config,
    onChangeConfig,
    canEdit = true,
}: A4HeaderFooterModalProps) {
    const { colors, accent, isDark } = useVeyraTheme();

    const [activeKind, setActiveKind] = useState<'header' | 'footer'>(initialKind);
    const [activeCol, setActiveCol] = useState<'left' | 'center' | 'right'>('left');
    const [activeTab, setActiveTab] = useState<'edit' | 'templates' | 'options'>('edit');
    const [savedTemplates, setSavedTemplates] = useState<A4HeaderFooterSavedTemplate[]>([]);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);

    useEffect(() => {
        if (visible) {
            setActiveKind(initialKind);
            syncSavedA4TemplatesFromCloud().then(list => {
                setSavedTemplates(list);
            });
        }
    }, [visible, initialKind]);

    const getBandKey = (kind: 'header' | 'footer'): keyof A4HeaderFooterConfig => {
        if (initialPageNumber === 1 && config.differentFirstPage) {
            return kind === 'header' ? 'firstPageHeader' : 'firstPageFooter';
        }
        if (config.oddEvenDifferent && initialPageNumber % 2 === 0) {
            return kind === 'header' ? 'evenHeader' : 'evenFooter';
        }
        return kind === 'header' ? 'header' : 'footer';
    };

    const currentBandKey = getBandKey(activeKind);
    const currentBand = (config[currentBandKey] as A4BandConfig) || { left: '', center: '', right: '', images: [] };
    const currentImages = Array.isArray(currentBand.images) ? currentBand.images : [];

    const updateBand = (nextBand: A4BandConfig) => {
        if (!canEdit) return;
        onChangeConfig({
            ...config,
            [currentBandKey]: nextBand,
        });
    };

    const handleChangeSlotText = (col: 'left' | 'center' | 'right', text: string) => {
        updateBand({
            ...currentBand,
            [col]: text,
        });
    };

    const handleInsertToken = (token: string) => {
        if (!canEdit) return;
        const currentVal = currentBand[activeCol] || '';
        const sep = currentVal && !currentVal.endsWith(' ') ? ' ' : '';
        handleChangeSlotText(activeCol, `${currentVal}${sep}${token}`);
    };

    const handleAddLogo = async () => {
        if (!canEdit || isUploadingLogo) return;
        try {
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.9,
            });
            if (res.canceled || !res.assets || !res.assets[0]) return;
            setIsUploadingLogo(true);
            const asset = res.assets[0];
            const remoteUrl = await uploadHeaderFooterLogoMobile(asset.uri);
            const finalSrc = remoteUrl || asset.uri;

            const ratio = asset.width && asset.height ? asset.width / asset.height : 2;
            const targetH = 38;
            const targetW = Math.min(180, Math.max(28, Math.round(targetH * ratio)));
            const defaultX = activeCol === 'left' ? 113 : activeCol === 'center' ? Math.round((794 - targetW) / 2) : Math.round(794 - 113 - targetW);

            const newImg: A4HeaderFooterImageItem = {
                id: `hf_img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                src: finalSrc,
                x: defaultX,
                y: 22,
                width: targetW,
                height: targetH,
            };

            updateBand({
                ...currentBand,
                images: [...currentImages, newImg],
            });
        } catch (err) {
            Alert.alert('Error', 'No se pudo cargar la imagen del encabezado.');
        } finally {
            setIsUploadingLogo(false);
        }
    };

    const handleAlignImage = (imgId: string, pos: 'left' | 'center' | 'right') => {
        const nextImgs = currentImages.map(img => {
            if (img.id !== imgId) return img;
            const x = pos === 'left' ? 113 : pos === 'center' ? Math.round((794 - img.width) / 2) : Math.round(794 - 113 - img.width);
            return { ...img, x };
        });
        updateBand({ ...currentBand, images: nextImgs });
    };

    const handleResizeImage = (imgId: string, scaleFactor: number) => {
        const nextImgs = currentImages.map(img => {
            if (img.id !== imgId) return img;
            const ratio = img.width / Math.max(1, img.height);
            const nextH = Math.min(82, Math.max(18, Math.round(img.height * scaleFactor)));
            const nextW = Math.min(260, Math.max(24, Math.round(nextH * ratio)));
            return { ...img, width: nextW, height: nextH };
        });
        updateBand({ ...currentBand, images: nextImgs });
    };

    const handleRemoveImage = (imgId: string) => {
        updateBand({
            ...currentBand,
            images: currentImages.filter(img => img.id !== imgId),
        });
    };

    const handleSaveCurrentAsTemplate = async () => {
        if (isSavingTemplate) return;
        setIsSavingTemplate(true);
        try {
            const list = await saveNewA4Template(
                newTemplateName.trim() || `Plantilla ${savedTemplates.length + 1}`,
                config
            );
            setSavedTemplates(list);
            setNewTemplateName('');
        } finally {
            setIsSavingTemplate(false);
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        const list = await deleteSavedA4Template(id);
        setSavedTemplates(list);
    };

    const presets = activeKind === 'header' ? A4_HEADER_PRESETS : A4_FOOTER_PRESETS;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                style={styles.backdrop}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={onClose}
                />

                <VeyraSurface
                    level={2}
                    radius="xl"
                    style={[
                        styles.dialog,
                        {
                            backgroundColor: isDark ? '#16181D' : '#FFFFFF',
                            borderColor: colors.borderSubtle,
                        },
                    ]}
                >
                    {/* Cabecera */}
                    <View style={[styles.headerRow, { borderBottomColor: colors.borderSubtle }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.title, { color: colors.textPrimary }]}>
                                Encabezado y Pie de página A4
                            </Text>
                            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                                Configuración individual de esta nota
                            </Text>
                        </View>
                        <VeyraIconButton
                            variant="ghost"
                            size="sm"
                            icon={<X size={18} color={colors.textSecondary as any} />}
                            onPress={onClose}
                        />
                    </View>

                    {/* Selector Encabezado vs Pie */}
                    <View style={styles.segmentRow}>
                        <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => setActiveKind('header')}
                            style={[
                                styles.segmentBtn,
                                {
                                    backgroundColor: activeKind === 'header' ? accent.primary : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                                },
                            ]}
                        >
                            <Text style={[styles.segmentText, { color: activeKind === 'header' ? '#FFFFFF' : colors.textSecondary }]}>
                                Encabezado (Superior)
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => setActiveKind('footer')}
                            style={[
                                styles.segmentBtn,
                                {
                                    backgroundColor: activeKind === 'footer' ? accent.primary : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                                },
                            ]}
                        >
                            <Text style={[styles.segmentText, { color: activeKind === 'footer' ? '#FFFFFF' : colors.textSecondary }]}>
                                Pie de página (Inferior)
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Sub-pestañas: Editar | Plantillas | Opciones */}
                    <View style={[styles.subTabsRow, { borderBottomColor: colors.borderSubtle }]}>
                        {(['edit', 'templates', 'options'] as const).map(tab => {
                            const isSelected = activeTab === tab;
                            const label = tab === 'edit' ? 'Contenido y Logo' : tab === 'templates' ? `Plantillas (${savedTemplates.length})` : 'Opciones';
                            return (
                                <TouchableOpacity
                                    key={tab}
                                    onPress={() => setActiveTab(tab)}
                                    style={[
                                        styles.subTabBtn,
                                        isSelected && { borderBottomColor: accent.primary, borderBottomWidth: 2 },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.subTabText,
                                            { color: isSelected ? accent.primary : colors.textSecondary },
                                        ]}
                                    >
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <ScrollView
                        style={styles.bodyScroll}
                        contentContainerStyle={{ padding: 16, gap: 14 }}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {activeTab === 'edit' && (
                            <>
                                {/* 3 Columnas: Izquierda, Centro, Derecha */}
                                <View style={{ gap: 10 }}>
                                    {([
                                        { key: 'left', label: 'Columna Izquierda' },
                                        { key: 'center', label: 'Columna Central' },
                                        { key: 'right', label: 'Columna Derecha' },
                                    ] as const).map(col => (
                                        <View key={col.key} style={{ gap: 4 }}>
                                            <Text style={[styles.fieldLabel, { color: activeCol === col.key ? accent.primary : colors.textSecondary }]}>
                                                {col.label}
                                            </Text>
                                            <TextInput
                                                value={currentBand[col.key] || ''}
                                                editable={canEdit}
                                                onFocus={() => setActiveCol(col.key)}
                                                onChangeText={val => handleChangeSlotText(col.key, val)}
                                                placeholder={col.key === 'left' ? 'Ej: {title}' : col.key === 'center' ? 'Ej: {author}' : 'Ej: Página {page} de {total}'}
                                                placeholderTextColor={colors.textMuted}
                                                style={[
                                                    styles.input,
                                                    {
                                                        color: colors.textPrimary,
                                                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                                        borderColor: activeCol === col.key ? accent.primary : colors.borderSubtle,
                                                    },
                                                ]}
                                            />
                                        </View>
                                    ))}
                                </View>

                                {/* Variables dinámicas */}
                                <View style={{ gap: 6 }}>
                                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                                        Insertar variable automática en columna activa:
                                    </Text>
                                    <View style={styles.tokensWrap}>
                                        {[
                                            { label: 'Página X de Y', token: 'Página {page} de {total}', icon: Hash },
                                            { label: 'N.º Página', token: '{page}', icon: Hash },
                                            { label: 'Fecha', token: '{date}', icon: Calendar },
                                            { label: 'Título', token: '{title}', icon: FileText },
                                            { label: 'Autor', token: '{author}', icon: User },
                                        ].map(item => {
                                            const IconComp = item.icon;
                                            return (
                                                <TouchableOpacity
                                                    key={item.label}
                                                    onPress={() => handleInsertToken(item.token)}
                                                    style={[
                                                        styles.tokenChip,
                                                        {
                                                            backgroundColor: isDark ? 'rgba(139,92,246,0.14)' : 'rgba(139,92,246,0.1)',
                                                            borderColor: isDark ? 'rgba(139,92,246,0.35)' : 'rgba(139,92,246,0.25)',
                                                        },
                                                    ]}
                                                >
                                                    <IconComp size={12} color={accent.primary as any} />
                                                    <Text style={[styles.tokenChipText, { color: colors.textPrimary }]}>
                                                        {item.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>

                                {/* Logos / Imágenes */}
                                <View style={{ gap: 8, marginTop: 4 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                                            Logos / Imágenes ({currentImages.length})
                                        </Text>
                                        {canEdit && (
                                            <TouchableOpacity
                                                onPress={handleAddLogo}
                                                disabled={isUploadingLogo}
                                                style={[
                                                    styles.addLogoBtn,
                                                    { backgroundColor: accent.primary },
                                                ]}
                                            >
                                                {isUploadingLogo ? (
                                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                                ) : (
                                                    <>
                                                        <Plus size={13} color="#FFFFFF" />
                                                        <Text style={styles.addLogoBtnText}>Subir imagen/logo</Text>
                                                    </>
                                                )}
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {currentImages.map(img => (
                                        <View
                                            key={img.id}
                                            style={[
                                                styles.imgItemRow,
                                                {
                                                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                                    borderColor: colors.borderSubtle,
                                                },
                                            ]}
                                        >
                                            <Image
                                                source={{ uri: img.src }}
                                                style={styles.imgThumb}
                                                resizeMode="contain"
                                            />
                                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                                                <TouchableOpacity
                                                    onPress={() => handleAlignImage(img.id, 'left')}
                                                    style={[styles.miniIconBtn, { borderColor: colors.borderSubtle }]}
                                                >
                                                    <AlignLeft size={14} color={colors.textPrimary as any} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleAlignImage(img.id, 'center')}
                                                    style={[styles.miniIconBtn, { borderColor: colors.borderSubtle }]}
                                                >
                                                    <AlignCenter size={14} color={colors.textPrimary as any} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleAlignImage(img.id, 'right')}
                                                    style={[styles.miniIconBtn, { borderColor: colors.borderSubtle }]}
                                                >
                                                    <AlignRight size={14} color={colors.textPrimary as any} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleResizeImage(img.id, 0.85)}
                                                    style={[styles.miniIconBtn, { borderColor: colors.borderSubtle }]}
                                                >
                                                    <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '700' }}>-</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleResizeImage(img.id, 1.18)}
                                                    style={[styles.miniIconBtn, { borderColor: colors.borderSubtle }]}
                                                >
                                                    <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '700' }}>+</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleRemoveImage(img.id)}
                                                    style={[styles.miniIconBtn, { borderColor: 'rgba(239,68,68,0.35)' }]}
                                                >
                                                    <Trash2 size={14} color="#EF4444" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </>
                        )}

                        {activeTab === 'templates' && (
                            <>
                                {/* Guardar configuración actual como plantilla */}
                                {canEdit && (
                                    <View
                                        style={[
                                            styles.templateSaveBox,
                                            {
                                                backgroundColor: isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.06)',
                                                borderColor: isDark ? 'rgba(139,92,246,0.28)' : 'rgba(139,92,246,0.22)',
                                            },
                                        ]}
                                    >
                                        <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
                                            Guardar encabezado y pie actual en la nube
                                        </Text>
                                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                                            <TextInput
                                                value={newTemplateName}
                                                onChangeText={setNewTemplateName}
                                                placeholder="Ej: Membrete Universidad"
                                                placeholderTextColor={colors.textMuted}
                                                style={[
                                                    styles.input,
                                                    {
                                                        flex: 1,
                                                        color: colors.textPrimary,
                                                        backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : '#FFFFFF',
                                                        borderColor: colors.borderSubtle,
                                                    },
                                                ]}
                                            />
                                            <TouchableOpacity
                                                onPress={handleSaveCurrentAsTemplate}
                                                disabled={isSavingTemplate}
                                                style={[styles.saveTplBtn, { backgroundColor: accent.primary }]}
                                            >
                                                <Bookmark size={14} color="#FFFFFF" />
                                                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                                                    Guardar
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                {/* Mis plantillas sincronizadas */}
                                <View style={{ gap: 8 }}>
                                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                                        Mis plantillas guardadas ({savedTemplates.length})
                                    </Text>
                                    {savedTemplates.length === 0 ? (
                                        <Text style={{ fontSize: 12, color: colors.textMuted, fontStyle: 'italic' }}>
                                            Aún no tienes plantillas guardadas. Las que guardes en Web o aquí aparecerán sincronizadas automáticamente.
                                        </Text>
                                    ) : (
                                        savedTemplates.map(tpl => (
                                            <View
                                                key={tpl.id}
                                                style={[
                                                    styles.presetCard,
                                                    {
                                                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
                                                        borderColor: colors.borderSubtle,
                                                    },
                                                ]}
                                            >
                                                <TouchableOpacity
                                                    style={{ flex: 1 }}
                                                    onPress={() => {
                                                        onChangeConfig(tpl.config);
                                                        setActiveTab('edit');
                                                    }}
                                                >
                                                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700' }}>
                                                        {tpl.name}
                                                    </Text>
                                                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                                                        {[tpl.config.header.left, tpl.config.header.center, tpl.config.header.right].filter(Boolean).join(' • ') || 'Con logo / pie personalizado'}
                                                    </Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleDeleteTemplate(tpl.id)}
                                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                    style={{ padding: 6 }}
                                                >
                                                    <Trash2 size={15} color="#EF4444" />
                                                </TouchableOpacity>
                                            </View>
                                        ))
                                    )}
                                </View>

                                {/* Diseños rápidos */}
                                <View style={{ gap: 8, marginTop: 6 }}>
                                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                                        Diseños rápidos ({activeKind === 'header' ? 'Encabezado' : 'Pie de página'})
                                    </Text>
                                    {presets.map(preset => (
                                        <TouchableOpacity
                                            key={preset.id}
                                            onPress={() => {
                                                updateBand({
                                                    ...preset.band,
                                                    images: preset.id === 'none' ? [] : currentImages,
                                                });
                                                setActiveTab('edit');
                                            }}
                                            style={[
                                                styles.presetCard,
                                                {
                                                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
                                                    borderColor: colors.borderSubtle,
                                                },
                                            ]}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
                                                    {preset.label}
                                                </Text>
                                                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                                    {preset.subtitle}
                                                </Text>
                                            </View>
                                            <Sparkles size={14} color={accent.primary as any} />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </>
                        )}

                        {activeTab === 'options' && (
                            <View style={{ gap: 14 }}>
                                <View style={styles.switchRow}>
                                    <View style={{ flex: 1, paddingRight: 12 }}>
                                        <Text style={{ color: colors.textPrimary, fontSize: 13.5, fontWeight: '600' }}>
                                            Primera página diferente
                                        </Text>
                                        <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 2 }}>
                                            Útil para portadas o carátulas sin encabezado en la Hoja 1.
                                        </Text>
                                    </View>
                                    <Switch
                                        value={config.differentFirstPage}
                                        onValueChange={val => onChangeConfig({ ...config, differentFirstPage: val })}
                                        trackColor={{ false: '#52525B', true: accent.primary }}
                                    />
                                </View>

                                <View style={styles.switchRow}>
                                    <View style={{ flex: 1, paddingRight: 12 }}>
                                        <Text style={{ color: colors.textPrimary, fontSize: 13.5, fontWeight: '600' }}>
                                            Páginas pares e impares diferentes
                                        </Text>
                                        <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 2 }}>
                                            Alterna el diseño entre hojas impares (1, 3, 5) y pares (2, 4, 6).
                                        </Text>
                                    </View>
                                    <Switch
                                        value={config.oddEvenDifferent}
                                        onValueChange={val => onChangeConfig({ ...config, oddEvenDifferent: val })}
                                        trackColor={{ false: '#52525B', true: accent.primary }}
                                    />
                                </View>
                            </View>
                        )}
                    </ScrollView>

                    {/* Botón Listo */}
                    <View style={[styles.footerBar, { borderTopColor: colors.borderSubtle }]}>
                        <TouchableOpacity
                            onPress={onClose}
                            style={[styles.doneBtn, { backgroundColor: accent.primary }]}
                        >
                            <Check size={15} color="#FFFFFF" />
                            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                                Listo
                            </Text>
                        </TouchableOpacity>
                    </View>
                </VeyraSurface>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    dialog: {
        width: '100%',
        maxWidth: 440,
        maxHeight: '84%',
        borderWidth: 1,
        overflow: 'hidden',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
    },
    subtitle: {
        fontSize: 11.5,
        marginTop: 2,
    },
    segmentRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    segmentBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    segmentText: {
        fontSize: 12,
        fontWeight: '700',
    },
    subTabsRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    subTabBtn: {
        paddingVertical: 9,
        marginRight: 18,
    },
    subTabText: {
        fontSize: 12,
        fontWeight: '700',
    },
    bodyScroll: {
        maxHeight: 380,
    },
    fieldLabel: {
        fontSize: 11.5,
        fontWeight: '700',
    },
    input: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 13,
    },
    tokensWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    tokenChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 8,
        borderWidth: 1,
    },
    tokenChipText: {
        fontSize: 11.5,
        fontWeight: '600',
    },
    addLogoBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    addLogoBtnText: {
        color: '#FFFFFF',
        fontSize: 11.5,
        fontWeight: '700',
    },
    imgItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        borderRadius: 10,
        borderWidth: 1,
        gap: 10,
    },
    imgThumb: {
        width: 56,
        height: 28,
        borderRadius: 4,
    },
    miniIconBtn: {
        width: 28,
        height: 28,
        borderRadius: 7,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    templateSaveBox: {
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    saveTplBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        borderRadius: 10,
        justifyContent: 'center',
    },
    presetCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
    },
    footerBar: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    doneBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 18,
        paddingVertical: 9,
        borderRadius: 10,
    },
});

