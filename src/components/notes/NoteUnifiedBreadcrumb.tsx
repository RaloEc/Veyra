import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
    Calendar,
    ChevronRight,
    Folder as LucideFolder,
    GraduationCap,
    BookOpen,
    Briefcase,
} from '@tamagui/lucide-icons';
import { Folder, CalendarEvent } from '../../types/db';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { FolderIconRenderer } from './FolderIconRenderer';
import { getEventCategoryTag } from '../../utils/eventCategoryUtils';

interface NoteUnifiedBreadcrumbProps {
    folder?: Folder | null;
    event?: CalendarEvent | null;
    allFolders?: Folder[];
    onFolderPress?: (folder: Folder) => void;
    onParentFolderPress?: (parentFolder: Folder) => void;
    onEventPress?: (event: CalendarEvent) => void;
    onCategoryPress?: (category: string) => void;
    onSelectFolderPress?: () => void;
    onFolderLongPress?: () => void;
}

export const NoteUnifiedBreadcrumb: React.FC<NoteUnifiedBreadcrumbProps> = ({
    folder,
    event,
    allFolders = [],
    onFolderPress,
    onParentFolderPress,
    onEventPress,
    onCategoryPress,
    onSelectFolderPress,
    onFolderLongPress,
}) => {
    const { colors, accent, isDark } = useVeyraTheme();

    const hasFolder = Boolean(folder && folder.name);
    const hasEvent = Boolean(event && event.title);

    // Si no tiene carpeta ni evento, mostrar el botón sutil para asignar carpeta
    if (!hasFolder && !hasEvent) {
        return (
            <TouchableOpacity
                style={[
                    styles.singlePill,
                    {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                        borderColor: colors.borderSubtle,
                    },
                ]}
                onPress={onSelectFolderPress}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
                <LucideFolder
                    size={14}
                    color={colors.textSecondary as any}
                    strokeWidth={2}
                />
            </TouchableOpacity>
        );
    }

    const eventColor = event?.color || '#3B82F6';
    const folderColor = folder?.color || '#8B5CF6';

    // 1. Caso: Solo Evento
    if (!hasFolder && hasEvent && event) {
        return (
            <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => onEventPress?.(event)}
                style={[
                    styles.singlePill,
                    {
                        backgroundColor: `${eventColor}${isDark ? '25' : '15'}`,
                        borderColor: `${eventColor}40`,
                    },
                ]}
            >
                <Calendar size={13} color={eventColor as any} strokeWidth={2.2} />
                <Text
                    style={[styles.segmentText, { color: eventColor, maxWidth: 110 }]}
                    numberOfLines={1}
                >
                    {event.title}
                </Text>
            </TouchableOpacity>
        );
    }

    // 2. Caso: Solo Carpeta
    if (hasFolder && !hasEvent && folder) {
        return (
            <TouchableOpacity
                style={[
                    styles.singlePill,
                    {
                        backgroundColor: `${folderColor}${isDark ? '25' : '15'}`,
                        borderColor: `${folderColor}40`,
                    },
                ]}
                onPress={() => onFolderPress ? onFolderPress(folder) : onSelectFolderPress?.()}
                onLongPress={onFolderLongPress || onSelectFolderPress}
                activeOpacity={0.7}
            >
                <FolderIconRenderer
                    name={folder.icon || 'folder'}
                    size={14}
                    color={folderColor}
                    strokeWidth={2}
                />
                <Text
                    style={[styles.segmentText, { color: folderColor, maxWidth: 120 }]}
                    numberOfLines={1}
                >
                    {folder.name}
                </Text>
            </TouchableOpacity>
        );
    }

    // 3. Caso: Tiene Carpeta Y Evento vinculados
    if (folder && event) {
        const isSameName = folder.name.trim().toLowerCase() === event.title.trim().toLowerCase();

        // Si tienen nombres idénticos:
        if (isSameName) {
            // A. Si la carpeta tiene padre: [📁 CarpetaPadre / 📅 TituloEvento]
            if (folder.parent_id) {
                const parentFolder = allFolders.find(f => f.id === folder.parent_id);
                if (parentFolder) {
                    const parentColor = parentFolder.color || '#8B5CF6';
                    return (
                        <View
                            style={[
                                styles.unifiedContainer,
                                {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                                },
                            ]}
                        >
                            <TouchableOpacity
                                style={styles.segmentBtn}
                                onPress={() => onParentFolderPress ? onParentFolderPress(parentFolder) : onFolderPress?.(parentFolder)}
                                onLongPress={onFolderLongPress || onSelectFolderPress}
                                activeOpacity={0.7}
                                hitSlop={{ top: 6, bottom: 6, left: 4, right: 2 }}
                            >
                                <FolderIconRenderer
                                    name={parentFolder.icon || 'folder'}
                                    size={13}
                                    color={parentColor}
                                    strokeWidth={2}
                                />
                                <Text
                                    style={[styles.segmentText, { color: parentColor, maxWidth: 75 }]}
                                    numberOfLines={1}
                                >
                                    {parentFolder.name}
                                </Text>
                            </TouchableOpacity>

                            <View style={styles.separator}>
                                <ChevronRight size={11} color={colors.textMuted as any} strokeWidth={2.4} />
                            </View>

                            <TouchableOpacity
                                style={styles.segmentBtn}
                                onPress={() => onEventPress?.(event)}
                                activeOpacity={0.75}
                                hitSlop={{ top: 6, bottom: 6, left: 2, right: 4 }}
                            >
                                <Calendar size={13} color={eventColor as any} strokeWidth={2.2} />
                                <Text
                                    style={[styles.segmentText, { color: eventColor, maxWidth: 85 }]}
                                    numberOfLines={1}
                                >
                                    {event.title}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    );
                }
            }

            // B. Si no tiene padre pero el evento tiene categoría: [🎓 Categoria / 📅 TituloEvento]
            const category = getEventCategoryTag(event);
            if (category && category !== 'Eventos') {
                const categoryColor = accent.primary;
                return (
                    <View
                        style={[
                            styles.unifiedContainer,
                            {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                            },
                        ]}
                    >
                        <TouchableOpacity
                            style={styles.segmentBtn}
                            onPress={() => onCategoryPress?.(category)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 2 }}
                        >
                            {renderCategoryThematicIcon(category, categoryColor)}
                            <Text
                                style={[styles.segmentText, { color: categoryColor, maxWidth: 75 }]}
                                numberOfLines={1}
                            >
                                {category}
                            </Text>
                        </TouchableOpacity>

                        <View style={styles.separator}>
                            <ChevronRight size={11} color={colors.textMuted as any} strokeWidth={2.4} />
                        </View>

                        <TouchableOpacity
                            style={styles.segmentBtn}
                            onPress={() => onEventPress?.(event)}
                            activeOpacity={0.75}
                            hitSlop={{ top: 6, bottom: 6, left: 2, right: 4 }}
                        >
                            <Calendar size={13} color={eventColor as any} strokeWidth={2.2} />
                            <Text
                                style={[styles.segmentText, { color: eventColor, maxWidth: 85 }]}
                                numberOfLines={1}
                            >
                                {event.title}
                            </Text>
                        </TouchableOpacity>
                    </View>
                );
            }

            // C. Si no tiene padre ni categoría, mostrar únicamente la píldora del evento: [📅 TituloEvento]
            return (
                <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => onEventPress?.(event)}
                    style={[
                        styles.singlePill,
                        {
                            backgroundColor: `${eventColor}${isDark ? '25' : '15'}`,
                            borderColor: `${eventColor}40`,
                        },
                    ]}
                >
                    <Calendar size={13} color={eventColor as any} strokeWidth={2.2} />
                    <Text
                        style={[styles.segmentText, { color: eventColor, maxWidth: 110 }]}
                        numberOfLines={1}
                    >
                        {event.title}
                    </Text>
                </TouchableOpacity>
            );
        }

        // Si la carpeta tiene un nombre DISTINTO (ej. "Semestre 2" y "Matemáticas"): [📁 NombreCarpeta / 📅 TituloEvento]
        return (
            <View
                style={[
                    styles.unifiedContainer,
                    {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                    },
                ]}
            >
                <TouchableOpacity
                    style={styles.segmentBtn}
                    onPress={() => onFolderPress ? onFolderPress(folder) : onSelectFolderPress?.()}
                    onLongPress={onFolderLongPress || onSelectFolderPress}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 2 }}
                >
                    <FolderIconRenderer
                        name={folder.icon || 'folder'}
                        size={13}
                        color={folderColor}
                        strokeWidth={2}
                    />
                    <Text
                        style={[styles.segmentText, { color: folderColor, maxWidth: 75 }]}
                        numberOfLines={1}
                    >
                        {folder.name}
                    </Text>
                </TouchableOpacity>

                <View style={styles.separator}>
                    <ChevronRight size={11} color={colors.textMuted as any} strokeWidth={2.4} />
                </View>

                <TouchableOpacity
                    style={styles.segmentBtn}
                    onPress={() => onEventPress?.(event)}
                    activeOpacity={0.75}
                    hitSlop={{ top: 6, bottom: 6, left: 2, right: 4 }}
                >
                    <Calendar size={13} color={eventColor as any} strokeWidth={2.2} />
                    <Text
                        style={[styles.segmentText, { color: eventColor, maxWidth: 85 }]}
                        numberOfLines={1}
                    >
                        {event.title}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }

    return null;
};

/**
 * Renderiza el icono temático para categorías
 */
function renderCategoryThematicIcon(category: string, color: string) {
    switch (category) {
        case 'Universidad':
            return <GraduationCap size={13} color={color as any} strokeWidth={2.2} />;
        case 'Clases':
            return <BookOpen size={13} color={color as any} strokeWidth={2.2} />;
        case 'Trabajo':
            return <Briefcase size={13} color={color as any} strokeWidth={2.2} />;
        default:
            return <LucideFolder size={13} color={color as any} strokeWidth={2.2} />;
    }
}

const styles = StyleSheet.create({
    singlePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: StyleSheet.hairlineWidth,
        maxWidth: 160,
    },
    unifiedContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: StyleSheet.hairlineWidth,
        maxWidth: 220,
    },
    segmentBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    separator: {
        marginHorizontal: 3,
        opacity: 0.6,
    },
    segmentText: {
        fontSize: 12,
        fontWeight: '600',
    },
});

