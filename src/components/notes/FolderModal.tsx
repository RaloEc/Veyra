import React, { useState, useEffect, useRef } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Animated,
    KeyboardAvoidingView,
    Platform,
    Alert,
    Dimensions,
    Switch,
} from 'react-native';
import { X, Trash2, Check, Plus, Folder as FolderIcon, Pin } from '@tamagui/lucide-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { useStore } from '../../store/useStore';
import { useFoldersStore } from '../../store/useFoldersStore';
import { Folder } from '../../types/db';
import { FOLDER_ICONS, FOLDER_COLORS, FolderIconRenderer } from './FolderIconRenderer';
import { VeyraSurface, VeyraButton } from '../ui';

interface FolderModalProps {
    visible: boolean;
    onClose: () => void;
    folderToEdit?: Folder | null;
    onSave: (name: string, icon: string, color: string, isPinned?: boolean) => Promise<void>;
    onDelete?: (folderId: string) => void;
}

export const FolderModal: React.FC<FolderModalProps> = ({
    visible,
    onClose,
    folderToEdit,
    onSave,
    onDelete,
}) => {
    const { colors, typography, radii, isDark, accent } = useVeyraTheme();
    const language = useStore(state => state.language);
    const insets = useSafeAreaInsets();
    const folders = useFoldersStore(state => state.folders);

    const defaultAccent = accent?.primary || '#8B5CF6';
    const [name, setName] = useState('');
    const [selectedIcon, setSelectedIcon] = useState('folder');
    const [selectedColor, setSelectedColor] = useState(defaultAccent);
    const [isPinned, setIsPinned] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isEdit = Boolean(folderToEdit);

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

    useEffect(() => {
        if (visible) {
            if (folderToEdit) {
                setName(folderToEdit.name);
                setSelectedIcon(folderToEdit.icon || 'folder');
                setSelectedColor(folderToEdit.color || defaultAccent);
                setIsPinned(folderToEdit.is_pinned === 1);
            } else {
                setName('');
                setSelectedIcon('folder');
                setSelectedColor(defaultAccent);
                setIsPinned(false);
            }
            setIsSubmitting(false);
        }
    }, [visible, folderToEdit, defaultAccent]);

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
            await onSave(trimmed, selectedIcon, selectedColor, isPinned);
            onClose();
        } catch (error) {
            console.error('Error saving folder:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = () => {
        if (!folderToEdit || !onDelete) return;

        Alert.alert(
            language === 'es' ? '¿Eliminar carpeta?' : 'Delete folder?',
            language === 'es'
                ? `¿Qué deseas hacer con las notas dentro de "${folderToEdit.name}"?`
                : `What do you want to do with the notes in "${folderToEdit.name}"?`,
            [
                { text: language === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
                {
                    text: language === 'es' ? 'Conservar notas' : 'Keep notes',
                    onPress: () => {
                        onDelete(folderToEdit.id);
                        onClose();
                    },
                },
                {
                    text: language === 'es' ? 'Eliminar notas' : 'Delete notes',
                    style: 'destructive',
                    onPress: () => {
                        onDelete(folderToEdit.id);
                        onClose();
                    },
                },
            ]
        );
    };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <KeyboardAvoidingView
                style={styles.backdrop}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <TouchableOpacity
                    style={styles.backdropTouch}
                    activeOpacity={1}
                    onPress={onClose}
                />

                <VeyraSurface
                    level={2}
                    radius="xl"
                    style={[
                        styles.modalContainer,
                        {
                            backgroundColor: isDark ? '#181A20' : '#FFFFFF',
                            borderColor: colors.borderSubtle,
                            paddingBottom: Math.max(insets.bottom, 16),
                        },
                    ]}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.titleContainer}>
                            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                                {isEdit
                                    ? (language === 'es' ? 'Editar Carpeta' : 'Edit Folder')
                                    : (language === 'es' ? 'Nueva Carpeta' : 'New Folder')}
                            </Text>
                            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                                {language === 'es'
                                    ? 'Organiza tus notas con icono y color'
                                    : 'Organize your notes with icon & color'}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            style={[styles.closeButton, { backgroundColor: isDark ? '#262933' : '#F1F5F9' }]}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <X size={18} color={colors.textSecondary as any} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* Preview Card */}
                        <View
                            style={[
                                styles.previewCard,
                                {
                                    backgroundColor: `${selectedColor}${isDark ? '20' : '15'}`,
                                    borderColor: `${selectedColor}40`,
                                },
                            ]}
                        >
                            <View
                                style={[
                                    styles.previewIconBox,
                                    { backgroundColor: `${selectedColor}${isDark ? '35' : '25'}` },
                                ]}
                            >
                                <FolderIconRenderer
                                    name={selectedIcon}
                                    size={24}
                                    color={selectedColor}
                                    strokeWidth={2.2}
                                />
                            </View>
                            <View style={styles.previewTextCol}>
                                <Text
                                    numberOfLines={1}
                                    style={[
                                        styles.previewTitle,
                                        { color: colors.textPrimary },
                                    ]}
                                >
                                    {name.trim() || (language === 'es' ? 'Nombre de la carpeta' : 'Folder name')}
                                </Text>
                                <Text style={[styles.previewBadge, { color: selectedColor }]}>
                                    {language === 'es' ? 'Vista previa' : 'Preview'}
                                </Text>
                            </View>
                        </View>

                        {/* Input Nombre */}
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>
                                {language === 'es' ? 'NOMBRE' : 'NAME'}
                            </Text>
                            <View
                                style={[
                                    styles.inputWrapper,
                                    {
                                        backgroundColor: isDark ? '#20232B' : '#F8FAFC',
                                        borderColor: colors.borderSubtle,
                                    },
                                ]}
                            >
                                <TextInput
                                    value={name}
                                    onChangeText={setName}
                                    placeholder={language === 'es' ? 'Ej. Trabajo, Ideas, Universidad...' : 'e.g. Work, Ideas, College...'}
                                    placeholderTextColor={colors.textMuted}
                                    style={[
                                        styles.textInput,
                                        {
                                            color: colors.textPrimary,
                                            fontSize: typography.body.fontSize,
                                        },
                                    ]}
                                    autoFocus={!isEdit}
                                    maxLength={40}
                                    selectionColor={selectedColor}
                                />
                                {name.length > 0 && (
                                    <TouchableOpacity onPress={() => setName('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                        <X size={15} color={colors.textMuted as any} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {/* Selector de Icono Lucide */}
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>
                                {language === 'es' ? 'ICONO VECTORIAL (LUCIDE)' : 'VECTOR ICON (LUCIDE)'}
                            </Text>
                            <View style={styles.iconGrid}>
                                {FOLDER_ICONS.map((iconItem) => {
                                    const isSelected = selectedIcon === iconItem.key;
                                    return (
                                        <TouchableOpacity
                                            key={iconItem.key}
                                            style={[
                                                styles.iconItemBtn,
                                                {
                                                    backgroundColor: isSelected
                                                        ? `${selectedColor}${isDark ? '30' : '20'}`
                                                        : (isDark ? '#20232B' : '#F1F5F9'),
                                                    borderColor: isSelected ? selectedColor : 'transparent',
                                                },
                                            ]}
                                            onPress={() => setSelectedIcon(iconItem.key)}
                                            activeOpacity={0.7}
                                        >
                                            <FolderIconRenderer
                                                name={iconItem.key}
                                                size={20}
                                                color={isSelected ? selectedColor : (colors.textSecondary as any)}
                                                strokeWidth={isSelected ? 2.3 : 1.8}
                                            />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Selector de Color */}
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>
                                {language === 'es' ? 'COLOR DE ACENTO' : 'ACCENT COLOR'}
                            </Text>
                            <View style={styles.colorGrid}>
                                {FOLDER_COLORS.map((c) => {
                                    const isSelected = selectedColor.toLowerCase() === c.color.toLowerCase();
                                    return (
                                        <TouchableOpacity
                                            key={c.key}
                                            style={[
                                                styles.colorCircle,
                                                { backgroundColor: c.color },
                                                isSelected && styles.colorCircleSelected,
                                            ]}
                                            onPress={() => setSelectedColor(c.color)}
                                            activeOpacity={0.8}
                                        >
                                            {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Switch Fijar en Acceso Rápido */}
                        <View
                            style={[
                                styles.pinRow,
                                {
                                    backgroundColor: isDark ? '#20232B' : '#F8FAFC',
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                        >
                            <View style={styles.pinRowLeft}>
                                <View
                                    style={[
                                        styles.pinIconBox,
                                        { backgroundColor: isPinned ? `${selectedColor}25` : (isDark ? '#262933' : '#F1F5F9') },
                                    ]}
                                >
                                    <Pin
                                        size={18}
                                        color={isPinned ? selectedColor : (colors.textMuted as any)}
                                        strokeWidth={2.2}
                                    />
                                </View>
                                <View style={styles.pinTextCol}>
                                    <Text style={[styles.pinTitle, { color: colors.textPrimary }]}>
                                        {language === 'es' ? 'Fijar en Acceso Rápido' : 'Pin to Quick Access'}
                                    </Text>
                                    <Text style={[styles.pinSubtitle, { color: colors.textMuted }]}>
                                        {language === 'es'
                                            ? 'Mostrar en la barra superior (máx. 3)'
                                            : 'Show in top filter bar (max 3)'}
                                    </Text>
                                </View>
                            </View>
                            <Switch
                                value={isPinned}
                                onValueChange={handleTogglePin}
                                trackColor={{ false: isDark ? '#333A48' : '#E2E8F0', true: selectedColor }}
                                thumbColor="#FFFFFF"
                            />
                        </View>

                        {/* Botón Eliminar si está editando */}
                        {isEdit && onDelete && (
                            <TouchableOpacity
                                style={[
                                    styles.deleteButton,
                                    {
                                        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
                                        borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
                                    },
                                ]}
                                onPress={handleDelete}
                                activeOpacity={0.7}
                            >
                                <Trash2 size={16} color="#EF4444" />
                                <Text style={styles.deleteButtonText}>
                                    {language === 'es' ? 'Eliminar carpeta' : 'Delete folder'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </ScrollView>

                    {/* Footer Actions */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[
                                styles.cancelBtn,
                                { backgroundColor: isDark ? '#262933' : '#F1F5F9' },
                            ]}
                            onPress={onClose}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                                {language === 'es' ? 'Cancelar' : 'Cancel'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.saveBtn,
                                {
                                    backgroundColor: selectedColor,
                                    opacity: isSubmitting || !name.trim() ? 0.6 : 1,
                                },
                            ]}
                            onPress={handleSave}
                            disabled={isSubmitting || !name.trim()}
                            activeOpacity={0.8}
                        >
                            <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                            <Text style={styles.saveBtnText}>
                                {isEdit
                                    ? (language === 'es' ? 'Guardar' : 'Save')
                                    : (language === 'es' ? 'Crear Carpeta' : 'Create Folder')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </VeyraSurface>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
    },
    backdropTouch: {
        flex: 1,
    },
    modalContainer: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderBottomWidth: 0,
        maxHeight: '90%',
        paddingTop: 20,
        paddingHorizontal: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    titleContainer: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: -0.3,
    },
    headerSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 12,
    },
    scrollContent: {
        paddingBottom: 16,
    },
    previewCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 18,
    },
    previewIconBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    previewTextCol: {
        flex: 1,
    },
    previewTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    previewBadge: {
        fontSize: 11,
        fontWeight: '600',
        marginTop: 2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    inputGroup: {
        marginBottom: 18,
    },
    label: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
        marginBottom: 8,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        height: 48,
    },
    textInput: {
        flex: 1,
        height: '100%',
        padding: 0,
    },
    iconGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    iconItemBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    colorCircle: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    colorCircleSelected: {
        borderWidth: 3,
        borderColor: '#FFFFFF',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
    },
    pinRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 16,
    },
    pinRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 10,
    },
    pinIconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    pinTextCol: {
        flex: 1,
    },
    pinTitle: {
        fontSize: 14,
        fontWeight: '600',
    },
    pinSubtitle: {
        fontSize: 11,
        marginTop: 2,
    },
    deleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        marginTop: 6,
        marginBottom: 6,
    },
    deleteButtonText: {
        color: '#EF4444',
        fontSize: 14,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(150, 150, 150, 0.1)',
    },
    cancelBtn: {
        flex: 1,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelBtnText: {
        fontSize: 14,
        fontWeight: '600',
    },
    saveBtn: {
        flex: 2,
        height: 48,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    saveBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
});
