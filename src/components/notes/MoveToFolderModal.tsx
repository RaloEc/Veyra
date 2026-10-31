import React, { useState, useMemo } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Dimensions,
    Alert,
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
    noteCount?: number;
    onSelectFolder: (folderId: string | null) => Promise<void>;
    onCreateNewFolder: (parentId?: string | null) => void;
    type?: 'note' | 'folder';
    movingFolderId?: string | null;
}

export const MoveToFolderModal: React.FC<MoveToFolderModalProps> = ({
    visible,
    onClose,
    folders,
    currentFolderId,
    noteCount = 0,
    onSelectFolder,
    onCreateNewFolder,
    type = 'note',
    movingFolderId = null,
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

    const movingFolder = movingFolderId ? folders.find(f => f.id === movingFolderId) : null;

    // Prevención de ciclos: una carpeta no puede moverse dentro de sí misma ni de sus descendientes
    const invalidTargetFolderIds = useMemo(() => {
        if (type !== 'folder' || !movingFolderId) return new Set<string>();
        const invalid = new Set<string>([movingFolderId]);
        const queue = [movingFolderId];
        while (queue.length > 0) {
            const curr = queue.shift()!;
            const children = folders.filter(f => f.parent_id === curr && f.deleted !== 1);
            for (const child of children) {
                if (!invalid.has(child.id)) {
                    invalid.add(child.id);
                    queue.push(child.id);
                }
            }
        }
        return invalid;
    }, [type, movingFolderId, folders]);

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
        if (type === 'folder' && folderId && invalidTargetFolderIds.has(folderId)) {
            Alert.alert(
                language === 'es' ? 'Acción no permitida' : 'Action not allowed',
                language === 'es'
                    ? 'No puedes mover una carpeta dentro de sí misma o de una de sus subcarpetas.'
                    : 'You cannot move a folder into itself or one of its subfolders.'
            );
            return;
        }
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
                                {type === 'folder'
                                    ? (language === 'es' ? 'Mover carpeta' : 'Move folder')
                                    : (language === 'es' ? 'Mover a carpeta' : 'Move to folder')}
                            </Text>
                            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                                {type === 'folder'
                                    ? (movingFolder?.name ? `"${movingFolder.name}"` : (language === 'es' ? '1 carpeta seleccionada' : '1 folder selected'))
                                    : (language === 'es'
                                        ? `${noteCount} nota${noteCount > 1 ? 's' : ''} seleccionada${noteCount > 1 ? 's' : ''}`
                                        : `${noteCount} note${noteCount > 1 ? 's' : ''} selected`)}
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
                        {/* Opción en Raíz: Sin carpeta / General o Nivel Principal */}
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
                                        {type === 'folder'
                                            ? (language === 'es' ? 'Nivel Principal (Sin carpeta padre)' : 'Root Level (No parent folder)')
                                            : (language === 'es' ? 'Sin carpeta (General)' : 'No folder (General)')}
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
                                        opacity: (type === 'folder' && invalidTargetFolderIds.has(currentBrowsedFolder.id)) ? 0.45 : 1,
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
                                        {type === 'folder'
                                            ? (language === 'es'
                                                ? `Mover dentro de "${currentBrowsedFolder.name}"`
                                                : `Move into "${currentBrowsedFolder.name}"`)
                                            : (language === 'es'
                                                ? `Mover directamente a "${currentBrowsedFolder.name}"`
                                                : `Move directly into "${currentBrowsedFolder.name}"`)}
                                    </Text>
                                    {type === 'folder' && invalidTargetFolderIds.has(currentBrowsedFolder.id) && (
                                        <Text style={[styles.folderChildSubtext, { color: isDark ? '#F87171' : '#EF4444' }]}>
                                            {language === 'es' ? 'No disponible (carpeta actual o subcarpeta)' : 'Unavailable (current or subfolder)'}
                                        </Text>
                                    )}
                                </View>
                                {currentFolderId === currentBrowsedFolder.id && (
                                    <Check size={18} color={(currentBrowsedFolder.color || accent.primary) as any} />
                                )}
                            </TouchableOpacity>
                        )}

                        {/* Lista de carpetas del nivel actual */}
                        {visibleFolders.map((folder) => {
                            const isCurrent = currentFolderId === folder.id;
                            const isInvalid = type === 'folder' && invalidTargetFolderIds.has(folder.id);
                            const folderColor = folder.color || '#8B5CF6';
                            const childCount = folders.filter(f => f.parent_id === folder.id && f.deleted !== 1).length;

                            return (
                                <View
                                    key={folder.id}
                                    style={[
                                        styles.folderItemRow,
                                        {
                                            backgroundColor: isDark ? '#20232B' : '#F8FAFC',
                                            borderColor: isCurrent ? folderColor : colors.borderSubtle,
                                            opacity: isInvalid ? 0.45 : 1,
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
                                            {isInvalid ? (
                                                <Text style={[styles.folderChildSubtext, { color: isDark ? '#F87171' : '#EF4444' }]}>
                                                    {folder.id === movingFolderId
                                                        ? (language === 'es' ? 'Carpeta actual' : 'Current folder')
                                                        : (language === 'es' ? 'Subcarpeta descendiente' : 'Descendant subfolder')}
                                                </Text>
                                            ) : childCount > 0 ? (
                                                <Text style={[styles.folderChildSubtext, { color: colors.textMuted }]}>
                                                    {childCount === 1
                                                        ? (language === 'es' ? '1 subcarpeta' : '1 subfolder')
                                                        : (language === 'es' ? `${childCount} subcarpetas` : `${childCount} subfolders`)}
                                                </Text>
                                            ) : null}
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
