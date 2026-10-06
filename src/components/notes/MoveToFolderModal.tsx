import React, { useState, useMemo } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Dimensions,
} from 'react-native';
import { X, FolderPlus, Inbox, Check, ChevronRight, ChevronLeft, CornerDownRight, Folder as FolderIcon } from '@tamagui/lucide-icons';
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
    onCreateNewFolder: (parentId?: string | null) => void;
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

    const [browseFolderId, setBrowseFolderId] = useState<string | null>(null);

    // Reset browseFolderId when opening/closing
    React.useEffect(() => {
        if (!visible) {
            setBrowseFolderId(null);
        }
    }, [visible]);

    if (!visible) return null;

    const currentBrowsedFolder = browseFolderId ? folders.find(f => f.id === browseFolderId) : null;

    // Build breadcrumbs chain
    const breadcrumbChain = useMemo(() => {
        if (!currentBrowsedFolder) return [];
        const chain: Folder[] = [currentBrowsedFolder];
        let curr = currentBrowsedFolder;
        while (curr.parent_id) {
            const parent = folders.find(f => f.id === curr.parent_id);
            if (parent) {
                chain.unshift(parent);
                curr = parent;
            } else {
                break;
            }
        }
        return chain;
    }, [currentBrowsedFolder, folders]);

    const visibleFolders = folders.filter(f =>
        browseFolderId === null
            ? !f.parent_id
            : f.parent_id === browseFolderId
    );

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

                    {/* Breadcrumb de navegación si estamos dentro de una carpeta */}
                    {breadcrumbChain.length > 0 && (
                        <View style={styles.breadcrumbBar}>
                            <TouchableOpacity
                                style={styles.breadcrumbBtn}
                                onPress={() => setBrowseFolderId(null)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.breadcrumbText, { color: colors.textMuted }]}>
                                    {language === 'es' ? 'Carpetas' : 'Folders'}
                                </Text>
                            </TouchableOpacity>

                            {breadcrumbChain.map((item, idx) => {
                                const isLast = idx === breadcrumbChain.length - 1;
                                return (
                                    <React.Fragment key={item.id}>
                                        <ChevronRight size={12} color={colors.textMuted as any} />
                                        <TouchableOpacity
                                            style={styles.breadcrumbBtn}
                                            disabled={isLast}
                                            onPress={() => setBrowseFolderId(item.id)}
                                            activeOpacity={0.7}
                                        >
                                            <Text
                                                numberOfLines={1}
                                                style={[
                                                    styles.breadcrumbText,
                                                    isLast
                                                        ? { color: item.color || accent.primary, fontWeight: '700' }
                                                        : { color: colors.textMuted },
                                                ]}
                                            >
                                                {item.name}
                                            </Text>
                                        </TouchableOpacity>
                                    </React.Fragment>
                                );
                            })}
                        </View>
                    )}

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                    >
                        {/* Opción en Raíz: Sin carpeta / General */}
                        {browseFolderId === null && (
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
                        )}

                        {/* Si estamos dentro de una carpeta: Opción para soltar directamente aquí */}
                        {currentBrowsedFolder && (
                            <TouchableOpacity
                                style={[
                                    styles.folderItemRow,
                                    {
                                        backgroundColor: `${currentBrowsedFolder.color || accent.primary}${isDark ? '20' : '12'}`,
                                        borderColor: currentFolderId === currentBrowsedFolder.id
                                            ? (currentBrowsedFolder.color || accent.primary)
                                            : colors.borderSubtle,
                                        borderWidth: 1.5,
                                    },
                                ]}
                                onPress={() => handleSelect(currentBrowsedFolder.id)}
                                activeOpacity={0.7}
                            >
                                <View
                                    style={[
                                        styles.folderIconBox,
                                        { backgroundColor: `${currentBrowsedFolder.color || accent.primary}${isDark ? '35' : '25'}` },
                                    ]}
                                >
                                    <CornerDownRight
                                        size={18}
                                        color={(currentBrowsedFolder.color || accent.primary) as any}
                                        strokeWidth={2.2}
                                    />
                                </View>
                                <View style={styles.folderTextCol}>
                                    <Text style={[styles.folderName, { color: colors.textPrimary, fontWeight: '700' }]}>
                                        {language === 'es'
                                            ? `Mover directamente a "${currentBrowsedFolder.name}"`
                                            : `Move directly into "${currentBrowsedFolder.name}"`}
                                    </Text>
                                </View>
                                {currentFolderId === currentBrowsedFolder.id && (
                                    <Check size={18} color={(currentBrowsedFolder.color || accent.primary) as any} />
                                )}
                            </TouchableOpacity>
                        )}

                        {/* Lista de carpetas del nivel actual */}
                        {visibleFolders.map((folder) => {
                            const isCurrent = currentFolderId === folder.id;
                            const folderColor = folder.color || '#8B5CF6';
                            const childCount = folders.filter(f => f.parent_id === folder.id).length;

                            return (
                                <View
                                    key={folder.id}
                                    style={[
                                        styles.folderItemRow,
                                        {
                                            backgroundColor: isDark ? '#20232B' : '#F8FAFC',
                                            borderColor: isCurrent ? folderColor : colors.borderSubtle,
                                        },
                                    ]}
                                >
                                    <TouchableOpacity
                                        style={styles.folderRowMain}
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
                                                size={18}
                                                color={folderColor}
                                                strokeWidth={2}
                                            />
                                        </View>
                                        <View style={styles.folderTextCol}>
                                            <Text numberOfLines={1} style={[styles.folderName, { color: colors.textPrimary }]}>
                                                {folder.name}
                                            </Text>
                                            {childCount > 0 && (
                                                <Text style={[styles.folderChildSubtext, { color: colors.textMuted }]}>
                                                    {childCount === 1
                                                        ? (language === 'es' ? '1 subcarpeta' : '1 subfolder')
                                                        : (language === 'es' ? `${childCount} subcarpetas` : `${childCount} subfolders`)}
                                                </Text>
                                            )}
                                        </View>
                                        {isCurrent && <Check size={18} color={folderColor as any} />}
                                    </TouchableOpacity>

                                    {/* Botón para entrar a ver subcarpetas si las tiene */}
                                    {childCount > 0 && (
                                        <TouchableOpacity
                                            style={[
                                                styles.drillDownBtn,
                                                { backgroundColor: isDark ? '#2D323E' : '#E2E8F0' },
                                            ]}
                                            onPress={() => setBrowseFolderId(folder.id)}
                                            activeOpacity={0.7}
                                        >
                                            <ChevronRight size={16} color={colors.textSecondary as any} />
                                        </TouchableOpacity>
                                    )}
                                </View>
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
                                setTimeout(() => onCreateNewFolder(browseFolderId), 200);
                            }}
                            activeOpacity={0.7}
                        >
                            <FolderPlus size={18} color={colors.textSecondary as any} />
                            <Text style={[styles.newFolderText, { color: colors.textPrimary }]}>
                                {browseFolderId
                                    ? (language === 'es' ? `Nueva subcarpeta en "${currentBrowsedFolder?.name}"...` : `New subfolder in "${currentBrowsedFolder?.name}"...`)
                                    : (language === 'es' ? 'Crear nueva carpeta...' : 'Create new folder...')}
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
    breadcrumbBar: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        paddingHorizontal: 4,
        marginBottom: 12,
    },
    breadcrumbBtn: {
        paddingVertical: 4,
        paddingHorizontal: 6,
        borderRadius: 8,
    },
    breadcrumbText: {
        fontSize: 12,
        fontWeight: '600',
    },
    scrollContent: {
        paddingBottom: 16,
        gap: 8,
    },
    folderItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderRadius: 14,
        borderWidth: 1,
    },
    folderRowMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
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
    folderChildSubtext: {
        fontSize: 11,
        marginTop: 2,
    },
    drillDownBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
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
