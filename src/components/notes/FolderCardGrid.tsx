import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    LayoutAnimation,
    Platform,
    ScrollView,
    useWindowDimensions,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
} from 'react-native-reanimated';
import {
    ChevronDown,
    ChevronUp,
    Plus,
    Pin,
    Folder as FolderIcon,
    Check,
} from '@tamagui/lucide-icons';
import { Folder } from '../../types/db';
import { FolderIconRenderer } from './FolderIconRenderer';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { useStore } from '../../store/useStore';

interface FolderCardGridProps {
    folders: Folder[];
    noteCounts: Record<string, number>;
    subfolderCounts?: Record<string, number>;
    headerTitle?: string;
    onSelectFolder: (folderId: string, originRect?: { x: number; y: number; width: number; height: number }) => void;
    onEditFolder: (folder: Folder) => void;
    onCreateFolder: () => void;
    onTogglePin: (folderId: string, currentPin: boolean) => void;
    selectedFolderIds?: string[];
    isSelectionMode?: boolean;
    onToggleSelectFolder?: (folderId: string) => void;
    onLongPressFolder?: (folderId: string) => void;
}

interface FolderMiniCardProps {
    folder: Folder;
    count: number;
    subfolderCount?: number;
    isDark: boolean;
    colors: any;
    accent: any;
    language: string;
    isSelected?: boolean;
    isSelectionMode?: boolean;
    onSelect: (id: string, originRect?: { x: number; y: number; width: number; height: number }) => void;
    onEdit: (folder: Folder) => void;
    onToggleSelect?: (id: string) => void;
    onLongPress?: (id: string) => void;
}

const FolderMiniCard: React.FC<FolderMiniCardProps> = React.memo(({
    folder,
    count,
    subfolderCount = 0,
    isDark,
    colors,
    accent,
    language,
    isSelected = false,
    isSelectionMode = false,
    onSelect,
    onEdit,
    onToggleSelect,
    onLongPress,
}) => {
    const cardRef = React.useRef<View>(null);
    const scale = useSharedValue(1);
    const folderColor = folder.color || accent.primary;
    const isPinned = folder.is_pinned === 1;

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
        'worklet';
        scale.value = withSpring(0.97, { damping: 20, stiffness: 350 });
    };

    const handlePressOut = () => {
        'worklet';
        scale.value = withSpring(1, { damping: 18, stiffness: 260 });
    };

    const handlePress = () => {
        if (isSelectionMode) {
            onToggleSelect?.(folder.id);
            return;
        }
        if (cardRef.current) {
            cardRef.current.measureInWindow((x, y, width, height) => {
                onSelect(folder.id, { x, y, width, height });
            });
        } else {
            onSelect(folder.id);
        }
    };

    const handleLongPress = () => {
        if (isSelectionMode) {
            onToggleSelect?.(folder.id);
        } else if (onLongPress) {
            onLongPress(folder.id);
        } else {
            onEdit(folder);
        }
    };

    const noteCountText = count === 1
        ? (language === 'es' ? '1 nota' : '1 note')
        : (language === 'es' ? `${count} notas` : `${count} notes`);

    const subfolderText = subfolderCount > 0
        ? (subfolderCount === 1
            ? (language === 'es' ? '1 carpeta' : '1 folder')
            : (language === 'es' ? `${subfolderCount} carpetas` : `${subfolderCount} folders`))
        : null;

    return (
        <View ref={cardRef} collapsable={false} style={styles.cardWrapper}>
            <Animated.View style={[{ width: '100%' }, animatedStyle]}>
                <TouchableOpacity
                    style={[
                        styles.folderCard,
                        {
                            backgroundColor: isSelected
                                ? (isDark ? `${accent.primary}24` : `${accent.primary}14`)
                                : (isDark ? `${folderColor}14` : `${folderColor}0C`),
                            borderColor: isSelected
                                ? accent.primary
                                : (isDark ? `${folderColor}32` : `${folderColor}24`),
                            borderWidth: isSelected ? 1.5 : 1,
                        },
                    ]}
                    onPress={handlePress}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    onLongPress={handleLongPress}
                    delayLongPress={300}
                    activeOpacity={0.85}
                >
                    <View
                        style={[
                            styles.cardIconBox,
                            {
                                backgroundColor: isDark
                                ? `${folderColor}28`
                                : `${folderColor}1C`,
                            },
                        ]}
                    >
                        <FolderIconRenderer
                            name={folder.icon || 'folder'}
                            size={15}
                            color={folderColor}
                            strokeWidth={2.2}
                        />
                    </View>

                    <View style={styles.cardTextCol}>
                        <Text
                            numberOfLines={1}
                            style={[styles.folderName, { color: colors.textPrimary }]}
                        >
                            {folder.name}
                        </Text>
                        <Text numberOfLines={1} style={[styles.folderCount, { color: colors.textMuted }]}>
                            {subfolderText ? `${noteCountText} • ${subfolderText}` : noteCountText}
                        </Text>
                    </View>

                    {/* Pin Indicator (hidden during selection mode if space is constrained) */}
                    {isPinned && !isSelectionMode && (
                        <View style={styles.pinIndicator}>
                            <Pin size={10} color={folderColor as any} strokeWidth={2.5} />
                        </View>
                    )}

                    {/* Circular Selection Checkbox Indicator */}
                    {isSelectionMode && (
                        <View
                            style={[
                                styles.selectionIndicator,
                                isSelected
                                    ? {
                                        backgroundColor: accent.primary,
                                        borderColor: accent.primary,
                                    }
                                    : {
                                        backgroundColor: 'transparent',
                                        borderColor: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.22)',
                                    },
                            ]}
                        >
                            {isSelected && (
                                <Check size={11} color="#FFFFFF" strokeWidth={3} />
                            )}
                        </View>
                    )}
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
});

const PAGE_SIZE = 6; // 3 filas x 2 columnas = 6 carpetas por página

export const FolderCardGrid: React.FC<FolderCardGridProps> = ({
    folders,
    noteCounts,
    subfolderCounts,
    headerTitle,
    onSelectFolder,
    onEditFolder,
    onCreateFolder,
    onTogglePin,
    selectedFolderIds = [],
    isSelectionMode = false,
    onToggleSelectFolder,
    onLongPressFolder,
}) => {
    const { colors, isDark, accent } = useVeyraTheme();
    const language = useStore((state) => state.language);
    const { width: windowWidth } = useWindowDimensions();

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const [containerWidth, setContainerWidth] = useState(0);
    const scrollViewRef = useRef<ScrollView>(null);

    const toggleCollapse = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsCollapsed(!isCollapsed);
    };

    // Garantizar que cada carpeta sea única por su ID para evitar tarjetas duplicadas en la grilla
    const sanitizedFolders = useMemo(() => {
        const seen = new Set<string>();
        return folders.filter((f) => {
            if (!f?.id || seen.has(f.id)) return false;
            seen.add(f.id);
            return true;
        });
    }, [folders]);

    // Agrupación en páginas de 6 elementos (3 filas x 2 columnas)
    const pages = useMemo(() => {
        const result: Folder[][] = [];
        for (let i = 0; i < sanitizedFolders.length; i += PAGE_SIZE) {
            result.push(sanitizedFolders.slice(i, i + PAGE_SIZE));
        }
        return result;
    }, [sanitizedFolders]);

    // Ancho efectivo del contenedor y cálculo exacto de cada tarjeta
    const effectiveWidth = containerWidth > 0 ? containerWidth : Math.max(windowWidth - 40, 280);
    const cardWidth = Math.floor((effectiveWidth - 8) / 2);

    useEffect(() => {
        if (currentPage >= pages.length && pages.length > 0) {
            setCurrentPage(pages.length - 1);
        }
    }, [pages.length, currentPage]);

    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = e.nativeEvent.contentOffset.x;
        const page = Math.round(offsetX / (effectiveWidth || 1));
        if (page !== currentPage && page >= 0 && page < pages.length) {
            setCurrentPage(page);
        }
    };

    if (sanitizedFolders.length === 0) {
        return (
            <View
                style={[
                    styles.emptyContainer,
                    {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                        borderColor: colors.borderSubtle,
                    },
                ]}
            >
                <View
                    style={[
                        styles.emptyIconBox,
                        { backgroundColor: isDark ? `${accent.primary}26` : `${accent.primary}1A` },
                    ]}
                >
                    <FolderIcon size={16} color={accent.primary as any} />
                </View>
                <View style={styles.emptyTextCol}>
                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                        {language === 'es' ? 'Crea carpetas para organizar' : 'Create folders to organize'}
                    </Text>
                </View>
                <TouchableOpacity
                    style={[styles.emptyCreateBtn, { backgroundColor: accent.primary }]}
                    onPress={onCreateFolder}
                    activeOpacity={0.8}
                >
                    <Plus size={13} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.emptyCreateBtnText}>
                        {language === 'es' ? 'Nueva' : 'New'}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }

    const defaultTitle = language === 'es'
        ? `CARPETAS (${sanitizedFolders.length})`
        : `FOLDERS (${sanitizedFolders.length})`;

    return (
        <View
            style={styles.container}
            onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w > 0 && Math.abs(w - containerWidth) > 1) {
                    setContainerWidth(w);
                }
            }}
        >
            {/* Header / Bar */}
            <View style={styles.headerRow}>
                <TouchableOpacity
                    style={styles.headerTitleBtn}
                    onPress={toggleCollapse}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.headerTitle, { color: isSelectionMode ? accent.primary : colors.textSecondary }]}>
                        {headerTitle || defaultTitle}
                    </Text>
                    <View style={styles.chevronBox}>
                        {isCollapsed ? (
                            <ChevronDown size={14} color={colors.textMuted as any} strokeWidth={2.5} />
                        ) : (
                            <ChevronUp size={14} color={colors.textMuted as any} strokeWidth={2.5} />
                        )}
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.addFolderBtn,
                        {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                            borderColor: colors.borderSubtle,
                        },
                    ]}
                    onPress={onCreateFolder}
                    activeOpacity={0.7}
                >
                    <Plus size={13} color={colors.textPrimary as any} strokeWidth={2.5} />
                    <Text style={[styles.addFolderBtnText, { color: colors.textPrimary }]}>
                        {language === 'es' ? 'Nueva' : 'New'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Carrusel de Carpetas en Grilla 3x2 (3 filas x 2 columnas) */}
            {!isCollapsed && (
                <View style={styles.carouselWrapper}>
                    <ScrollView
                        ref={scrollViewRef}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        scrollEventThrottle={16}
                        onScroll={handleScroll}
                        contentContainerStyle={styles.scrollContent}
                    >
                        {pages.map((pageFolders, pageIndex) => (
                            <View
                                key={`page-${pageIndex}`}
                                style={[
                                    styles.pageGrid,
                                    { width: effectiveWidth },
                                ]}
                            >
                                {pageFolders.map((folder) => (
                                    <View key={folder.id} style={{ width: cardWidth }}>
                                        <FolderMiniCard
                                            folder={folder}
                                            count={noteCounts[folder.id] || 0}
                                            subfolderCount={subfolderCounts?.[folder.id] || 0}
                                            isDark={isDark}
                                            colors={colors}
                                            accent={accent}
                                            language={language}
                                            isSelected={selectedFolderIds.includes(folder.id)}
                                            isSelectionMode={isSelectionMode}
                                            onSelect={onSelectFolder}
                                            onEdit={onEditFolder}
                                            onToggleSelect={onToggleSelectFolder}
                                            onLongPress={onLongPressFolder}
                                        />
                                    </View>
                                ))}
                            </View>
                        ))}
                    </ScrollView>

                    {/* Indicador de páginas con puntos dinámicos (solo si hay más de 1 página) */}
                    {pages.length > 1 && (
                        <View style={styles.paginationRow}>
                            {pages.map((_, idx) => (
                                <View
                                    key={idx}
                                    style={[
                                        styles.paginationDot,
                                        {
                                            backgroundColor: idx === currentPage
                                                ? accent.primary
                                                : (isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.15)'),
                                            width: idx === currentPage ? 16 : 6,
                                        },
                                    ]}
                                />
                            ))}
                        </View>
                    )}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 12,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 8,
    },
    headerTitleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 3,
    },
    headerTitle: {
        fontSize: 11.5,
        fontWeight: '700',
        letterSpacing: 0.8,
    },
    chevronBox: {
        marginLeft: 1,
    },
    addFolderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
    },
    addFolderBtnText: {
        fontSize: 11.5,
        fontWeight: '600',
    },
    carouselWrapper: {
        width: '100%',
    },
    scrollContent: {
        alignItems: 'flex-start',
    },
    pageGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    cardWrapper: {
        width: '100%',
    },
    folderCard: {
        width: '100%',
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 9,
        borderRadius: 13,
        borderWidth: 1,
    },
    cardIconBox: {
        width: 30,
        height: 30,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    cardTextCol: {
        flex: 1,
        justifyContent: 'center',
    },
    folderName: {
        fontSize: 12.5,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    folderCount: {
        fontSize: 10,
        fontWeight: '500',
        marginTop: 1,
    },
    pinIndicator: {
        marginLeft: 4,
        opacity: 0.85,
    },
    selectionIndicator: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
    },
    paginationRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        marginTop: 10,
    },
    paginationDot: {
        height: 6,
        borderRadius: 3,
    },
    emptyContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 10,
        gap: 10,
    },
    emptyIconBox: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTextCol: {
        flex: 1,
    },
    emptyTitle: {
        fontSize: 12,
        fontWeight: '600',
    },
    emptyCreateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 9,
    },
    emptyCreateBtnText: {
        color: '#FFFFFF',
        fontSize: 11.5,
        fontWeight: '700',
    },
});
