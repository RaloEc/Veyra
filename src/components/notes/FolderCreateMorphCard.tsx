import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    Switch,
    Vibration,
    ActivityIndicator,
} from 'react-native';
import {
    ChevronLeft,
    Check,
    Folder as FolderIcon,
    Pin,
    Sparkles,
} from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { useStore } from '../../store/useStore';
import { useFoldersStore } from '../../store/useFoldersStore';
import { Folder } from '../../types/db';
import { FOLDER_ICONS, FOLDER_COLORS, FolderIconRenderer } from './FolderIconRenderer';

interface FolderCreateMorphCardProps {
    parentFolder?: Folder | null;
    folderToEdit?: Folder | null;
    onClose: () => void;
    onSuccess?: () => void;
}

/**
 * FolderCreateMorphCard — Tarjeta de creación/edición de carpetas y subcarpetas
 * integrada directamente en el dock morpheado inferior de Veyra.
 */
export function FolderCreateMorphCard({
    parentFolder,
    folderToEdit,
    onClose,
    onSuccess,
}: FolderCreateMorphCardProps) {
    const { colors, accent, isDark } = useVeyraTheme();
    const language = useStore(state => state.language);
    const { folders, createFolder, updateFolder } = useFoldersStore();

    const defaultAccent = accent?.primary || '#8B5CF6';
    const [name, setName] = useState('');
    const [selectedIcon, setSelectedIcon] = useState('folder');
    const [selectedColor, setSelectedColor] = useState(defaultAccent);
    const [isPinned, setIsPinned] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef<TextInput>(null);

    const isEdit = Boolean(folderToEdit);
    const effectiveParentFolder = parentFolder || (isEdit && folderToEdit?.parent_id ? folders.find(f => f.id === folderToEdit.parent_id) : null);
    const isSubfolder = Boolean(effectiveParentFolder);

    useEffect(() => {
        if (folderToEdit) {
            setName(folderToEdit.name);
            setSelectedIcon(folderToEdit.icon || 'folder');
            setSelectedColor(folderToEdit.color || defaultAccent);
            setIsPinned(folderToEdit.is_pinned === 1);
        } else {
            setName('');
            setSelectedIcon(isSubfolder ? (effectiveParentFolder?.icon || 'folder') : 'folder');
            setSelectedColor(isSubfolder ? (effectiveParentFolder?.color || defaultAccent) : defaultAccent);
            setIsPinned(false);
        }
        setIsSubmitting(false);

        // Autofoco suave en el input al expandirse el morph
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 120);
        return () => clearTimeout(timer);
    }, [folderToEdit, effectiveParentFolder, defaultAccent, isSubfolder]);

    const handleTogglePin = (value: boolean) => {
        if (value) {
            const currentPinnedCount = folders.filter(f => f.is_pinned === 1 && f.id !== folderToEdit?.id).length;
            if (currentPinnedCount >= 3) {
                Alert.alert(
                    language === 'es' ? 'Límite alcanzado' : 'Limit reached',
                    language === 'es'
                        ? 'Solo puedes fijar un máximo de 3 carpetas en el acceso rápido. Desfija otra para agregar esta.'
                        : 'You can only pin up to 3 folders in quick access. Unpin another one first.'
                );
                return;
            }
        }
        setIsPinned(value);
    };

    const handleSave = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            Alert.alert(
                language === 'es' ? 'Nombre requerido' : 'Name required',
                language === 'es' ? 'Por favor escribe un nombre para la carpeta.' : 'Please enter a folder name.'
            );
            return;
        }

        setIsSubmitting(true);
        try {
            try { Vibration.vibrate(15); } catch {}
            if (isEdit && folderToEdit) {
                await updateFolder(folderToEdit.id, {
                    name: trimmed,
                    icon: selectedIcon,
                    color: selectedColor,
                    is_pinned: isSubfolder ? 0 : (isPinned ? 1 : 0),
                });
            } else {
                const targetParentId = effectiveParentFolder ? effectiveParentFolder.id : null;
                await createFolder(trimmed, selectedIcon, selectedColor, isSubfolder ? false : isPinned, targetParentId);
            }
            onSuccess?.();
            onClose();
        } catch (error) {
            console.error('[FolderCreateMorphCard] Error guardando carpeta:', error);
            Alert.alert(
                language === 'es' ? 'Error' : 'Error',
                language === 'es' ? 'No se pudo guardar la carpeta.' : 'Could not save the folder.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <View style={styles.cardContainer}>
            {/* 1. Header con botón Atrás, Título y Preview Dinámico */}
            <View style={styles.headerRow}>
                <TouchableOpacity
                    onPress={onClose}
                    style={[
                        styles.backButton,
                        { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' },
                    ]}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <ChevronLeft size={18} color={colors.textPrimary as any} strokeWidth={2.4} />
                </TouchableOpacity>

                <View style={styles.headerTitleWrap}>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {isEdit
                            ? (language === 'es' ? 'Editar Carpeta' : 'Edit Folder')
                            : isSubfolder
                                ? (language === 'es' ? 'Nueva Subcarpeta' : 'New Subfolder')
                                : (language === 'es' ? 'Nueva Carpeta' : 'New Folder')}
                    </Text>
                    {isSubfolder && effectiveParentFolder && (
                        <View style={styles.parentBadgeRow}>
                            <Text style={[styles.parentBadgePrefix, { color: colors.textMuted }]}>
                                {language === 'es' ? 'En:' : 'In:'}
                            </Text>
                            <View
                                style={[
                                    styles.parentBadge,
                                    {
                                        backgroundColor: `${effectiveParentFolder.color || selectedColor}${isDark ? '25' : '15'}`,
                                        borderColor: `${effectiveParentFolder.color || selectedColor}40`,
                                    },
                                ]}
                            >
                                <FolderIconRenderer
                                    name={effectiveParentFolder.icon}
                                    size={10}
                                    color={effectiveParentFolder.color || selectedColor}
                                    strokeWidth={2}
                                />
                                <Text
                                    style={[styles.parentBadgeText, { color: effectiveParentFolder.color || selectedColor }]}
                                    numberOfLines={1}
                                >
                                    {effectiveParentFolder.name}
                                </Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Preview del icono y color seleccionado */}
                <View
                    style={[
                        styles.liveIconPreview,
                        {
                            backgroundColor: `${selectedColor}${isDark ? '30' : '20'}`,
                            borderColor: `${selectedColor}60`,
                        },
                    ]}
                >
                    <FolderIconRenderer
                        name={selectedIcon}
                        size={17}
                        color={selectedColor}
                        strokeWidth={2.2}
                    />
                </View>
            </View>

            {/* 2. Cuerpo con scroll horizontal/vertical ergonómico sin desborde */}
            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollContent}
            >
                {/* Input de Nombre */}
                <View
                    style={[
                        styles.inputContainer,
                        {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                        },
                    ]}
                >
                    <TextInput
                        ref={inputRef}
                        value={name}
                        onChangeText={setName}
                        placeholder={
                            isSubfolder
                                ? (language === 'es' ? 'Nombre de la subcarpeta...' : 'Subfolder name...')
                                : (language === 'es' ? 'Nombre de la carpeta...' : 'Folder name...')
                        }
                        placeholderTextColor={colors.textMuted}
                        style={[styles.textInput, { color: colors.textPrimary }]}
                        maxLength={40}
                        returnKeyType="done"
                        onSubmitEditing={handleSave}
                        selectionColor={selectedColor}
                    />
                </View>

                {/* Selector de Colores (Fila Horizontal Rápida) */}
                <View style={styles.selectorSection}>
                    <Text style={[styles.selectorLabel, { color: colors.textMuted }]}>
                        {language === 'es' ? 'COLOR' : 'COLOR'}
                    </Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalChipsScroll}
                    >
                        {FOLDER_COLORS.map(colorItem => {
                            const isSelected = selectedColor === colorItem.color;
                            return (
                                <TouchableOpacity
                                    key={colorItem.key}
                                    style={[
                                        styles.colorCircle,
                                        { backgroundColor: colorItem.color },
                                        isSelected && [
                                            styles.colorCircleSelected,
                                            { borderColor: isDark ? '#FFFFFF' : '#181A20' },
                                        ],
                                    ]}
                                    onPress={() => setSelectedColor(colorItem.color)}
                                    activeOpacity={0.7}
                                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                >
                                    {isSelected && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Selector de Iconos (Fila Horizontal Rápida) */}
                <View style={styles.selectorSection}>
                    <Text style={[styles.selectorLabel, { color: colors.textMuted }]}>
                        {language === 'es' ? 'ICONO' : 'ICON'}
                    </Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalChipsScroll}
                    >
                        {FOLDER_ICONS.map(iconItem => {
                            const isSelected = selectedIcon === iconItem.key;
                            return (
                                <TouchableOpacity
                                    key={iconItem.key}
                                    style={[
                                        styles.iconItemBtn,
                                        {
                                            backgroundColor: isSelected
                                                ? `${selectedColor}${isDark ? '35' : '22'}`
                                                : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'),
                                            borderColor: isSelected
                                                ? selectedColor
                                                : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                                        },
                                    ]}
                                    onPress={() => setSelectedIcon(iconItem.key)}
                                    activeOpacity={0.7}
                                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                >
                                    <FolderIconRenderer
                                        name={iconItem.key}
                                        size={16}
                                        color={isSelected ? selectedColor : colors.textSecondary}
                                        strokeWidth={isSelected ? 2.5 : 2}
                                    />
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Switch de Fijar en Acceso Rápido (Solo carpetas raíz) */}
                {!isSubfolder && (
                    <View
                        style={[
                            styles.pinRow,
                            {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
                                borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                            },
                        ]}
                    >
                        <View style={styles.pinLeftWrap}>
                            <Pin size={15} color={isPinned ? (isDark ? '#FBBF24' : '#F59E0B') : colors.textMuted as any} />
                            <Text style={[styles.pinLabel, { color: colors.textPrimary }]}>
                                {language === 'es' ? 'Fijar en acceso rápido' : 'Pin to quick access'}
                            </Text>
                        </View>
                        <Switch
                            value={isPinned}
                            onValueChange={handleTogglePin}
                            trackColor={{
                                false: isDark ? '#333742' : '#E2E8F0',
                                true: isDark ? `${selectedColor}80` : selectedColor,
                            }}
                            thumbColor={isPinned ? (isDark ? '#FFFFFF' : '#FFFFFF') : (isDark ? '#94A3B8' : '#CBD5E1')}
                            style={{ transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] }}
                        />
                    </View>
                )}
            </ScrollView>

            {/* 3. Botón de Acción Principal al Fondo del Dock */}
            <View style={styles.footerRow}>
                <TouchableOpacity
                    style={[
                        styles.submitBtn,
                        {
                            backgroundColor: selectedColor,
                            opacity: name.trim().length === 0 || isSubmitting ? 0.6 : 1,
                        },
                    ]}
                    onPress={handleSave}
                    disabled={name.trim().length === 0 || isSubmitting}
                    activeOpacity={0.8}
                >
                    {isSubmitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <>
                            <Check size={16} color="#FFFFFF" strokeWidth={2.6} />
                            <Text style={styles.submitBtnText}>
                                {isEdit
                                    ? (language === 'es' ? 'Guardar Cambios' : 'Save Changes')
                                    : isSubfolder
                                        ? (language === 'es' ? 'Crear Subcarpeta' : 'Create Subfolder')
                                        : (language === 'es' ? 'Crear Carpeta' : 'Create Folder')}
                            </Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    cardContainer: {
        flex: 1,
        paddingTop: 14,
        paddingHorizontal: 16,
        paddingBottom: 12,
        justifyContent: 'space-between',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10,
    },
    backButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitleWrap: {
        flex: 1,
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    parentBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    parentBadgePrefix: {
        fontSize: 11,
        fontWeight: '600',
    },
    parentBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 6,
        borderWidth: 0.5,
        maxWidth: 150,
    },
    parentBadgeText: {
        fontSize: 10.5,
        fontWeight: '700',
    },
    liveIconPreview: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    scrollContent: {
        gap: 10,
        paddingBottom: 4,
    },
    inputContainer: {
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 14,
        height: 44,
        justifyContent: 'center',
    },
    textInput: {
        fontSize: 14,
        fontWeight: '600',
        padding: 0,
    },
    selectorSection: {
        gap: 5,
    },
    selectorLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.8,
        marginLeft: 2,
    },
    horizontalChipsScroll: {
        gap: 8,
        alignItems: 'center',
        paddingVertical: 2,
    },
    colorCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    colorCircleSelected: {
        borderWidth: 2,
        transform: [{ scale: 1.08 }],
    },
    iconItemBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    pinRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        marginTop: 2,
    },
    pinLeftWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    pinLabel: {
        fontSize: 12.5,
        fontWeight: '600',
    },
    footerRow: {
        marginTop: 8,
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        height: 42,
        borderRadius: 21,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 4,
    },
    submitBtnText: {
        color: '#FFFFFF',
        fontSize: 13.5,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
});
