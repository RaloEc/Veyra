import React from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Dimensions,
} from 'react-native';
import { X, FolderPlus, Inbox, Check } from '@tamagui/lucide-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { useStore } from '../../store/useStore';
import { Folder } from '../../types/db';
import { FolderIconRenderer } from './FolderIconRenderer';
import { VeyraSurface } from '../ui';

interface MoveToFolderModalProps {
    visible: boolean;
    onClose: () => void;
    folders: Folder[];
    currentFolderId?: string | null;
    noteCount: number;
    onSelectFolder: (folderId: string | null) => Promise<void>;
    onCreateNewFolder: () => void;
}

export const MoveToFolderModal: React.FC<MoveToFolderModalProps> = ({
    visible,
    onClose,
    folders,
    currentFolderId,
    noteCount,
    onSelectFolder,
    onCreateNewFolder,
}) => {
    const { colors, typography, isDark, accent } = useVeyraTheme();
    const language = useStore(state => state.language);
    const insets = useSafeAreaInsets();

    if (!visible) return null;

    const handleSelect = async (folderId: string | null) => {
        await onSelectFolder(folderId);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={styles.backdrop}>
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
                                {language === 'es' ? 'Mover a carpeta' : 'Move to folder'}
                            </Text>
                            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                                {language === 'es'
                                    ? `${noteCount} nota${noteCount > 1 ? 's' : ''} seleccionada${noteCount > 1 ? 's' : ''}`
                                    : `${noteCount} note${noteCount > 1 ? 's' : ''} selected`}
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
                    >
                        {/* Opción 1: Sin carpeta / General */}
                        <TouchableOpacity
                            style={[
                                styles.folderItemRow,
                                {
                                    backgroundColor: isDark ? '#20232B' : '#F8FAFC',
                                    borderColor: currentFolderId === null || currentFolderId === undefined
                                        ? accent.primary
                                        : colors.borderSubtle,
                                },
                            ]}
                            onPress={() => handleSelect(null)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.folderIconBox, { backgroundColor: isDark ? '#2D323E' : '#E2E8F0' }]}>
                                <Inbox size={20} color={colors.textSecondary as any} />
                            </View>
                            <View style={styles.folderTextCol}>
                                <Text style={[styles.folderName, { color: colors.textPrimary }]}>
                                    {language === 'es' ? 'Sin carpeta (General)' : 'No folder (General)'}
                                </Text>
                            </View>
                            {(currentFolderId === null || currentFolderId === undefined) && (
                                <Check size={18} color={accent.primary as any} />
                            )}
                        </TouchableOpacity>

                        {/* Carpetas personalizadas */}
                        {folders.map((folder) => {
                            const isCurrent = currentFolderId === folder.id;
                            const folderColor = folder.color || '#8B5CF6';

                            return (
                                <TouchableOpacity
                                    key={folder.id}
                                    style={[
                                        styles.folderItemRow,
                                        {
                                            backgroundColor: isDark ? '#20232B' : '#F8FAFC',
                                            borderColor: isCurrent ? folderColor : colors.borderSubtle,
                                        },
                                    ]}
                                    onPress={() => handleSelect(folder.id)}
                                    activeOpacity={0.7}
                                >
                                    <View
                                        style={[
                                            styles.folderIconBox,
                                            { backgroundColor: `${folderColor}${isDark ? '25' : '15'}` },
                                        ]}
                                    >
                                        <FolderIconRenderer
                                            name={folder.icon}
                                            size={20}
                                            color={folderColor}
                                            strokeWidth={2}
                                        />
                                    </View>
                                    <View style={styles.folderTextCol}>
                                        <Text style={[styles.folderName, { color: colors.textPrimary }]}>
                                            {folder.name}
                                        </Text>
                                    </View>
                                    {isCurrent && <Check size={18} color={folderColor as any} />}
                                </TouchableOpacity>
                            );
                        })}

                        {/* Botón Crear Nueva Carpeta */}
                        <TouchableOpacity
                            style={[
                                styles.newFolderBtn,
                                {
                                    backgroundColor: isDark ? '#262933' : '#F1F5F9',
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            onPress={() => {
                                onClose();
                                setTimeout(onCreateNewFolder, 200);
                            }}
                            activeOpacity={0.7}
                        >
                            <FolderPlus size={18} color={colors.textSecondary as any} />
                            <Text style={[styles.newFolderText, { color: colors.textPrimary }]}>
                                {language === 'es' ? 'Crear nueva carpeta...' : 'Create new folder...'}
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>
                </VeyraSurface>
            </View>
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
        maxHeight: '75%',
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
        gap: 8,
    },
    folderItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
    },
    folderIconBox: {
        width: 38,
        height: 38,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    folderTextCol: {
        flex: 1,
    },
    folderName: {
        fontSize: 15,
        fontWeight: '600',
    },
    newFolderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: 'dashed',
        marginTop: 6,
    },
    newFolderText: {
        fontSize: 14,
        fontWeight: '600',
    },
});
