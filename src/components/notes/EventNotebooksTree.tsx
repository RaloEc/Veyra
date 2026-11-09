import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    LayoutAnimation,
    Platform,
    UIManager,
} from 'react-native';
import {
    Calendar,
    ChevronDown,
    ChevronRight,
    Plus,
    FileText,
    ExternalLink,
    GraduationCap,
    BookOpen,
    Briefcase,
    Folder as LucideFolder,
} from '@tamagui/lucide-icons';
import { CalendarEvent, Note } from '../../types/db';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { useStore } from '../../store/useStore';
import { getEventCategoryTag, isNotebookEvent } from '../../utils/eventCategoryUtils';

// Habilitar LayoutAnimation en Android si es necesario
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface EventNotebooksTreeProps {
    events: CalendarEvent[];
    notes: Note[];
    onCreateNoteForEvent: (eventId: string) => void;
    onOpenEventDetails: (eventId: string) => void;
    onSelectNote: (note: Note) => void;
    filterFolderId?: string | null;
    headerTitle?: string;
}

interface CategoryGroup {
    category: string;
    events: {
        event: CalendarEvent;
        notes: Note[];
    }[];
    totalNotes: number;
}

export const EventNotebooksTree: React.FC<EventNotebooksTreeProps> = ({
    events,
    notes,
    onCreateNoteForEvent,
    onOpenEventDetails,
    onSelectNote,
    filterFolderId,
    headerTitle,
}) => {
    const { colors, accent, isDark } = useVeyraTheme();
    const language = useStore(state => state.language);

    // Estado de colapso de categorías y materias/eventos
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
    const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

    // Mapear notas por event_id
    const notesByEventId = useMemo(() => {
        const map = new Map<string, Note[]>();
        for (const note of notes) {
            if (note.deleted === 1) continue;
            if (note.event_id) {
                const list = map.get(note.event_id) || [];
                list.push(note);
                map.set(note.event_id, list);
            }
        }
        return map;
    }, [notes]);

    // Filtrar y agrupar eventos en categorías
    const categoryGroups = useMemo<CategoryGroup[]>(() => {
        const activeEvents = events.filter(e => {
            if (e.deleted === 1) return false;
            if (filterFolderId && e.folder_id !== filterFolderId) return false;

            const linkedNotes = notesByEventId.get(e.id) || [];
            return isNotebookEvent(e, linkedNotes.length);
        });

        if (activeEvents.length === 0) return [];

        const groupsMap = new Map<string, { event: CalendarEvent; notes: Note[] }[]>();

        for (const ev of activeEvents) {
            const cat = getEventCategoryTag(ev);
            const evNotes = (notesByEventId.get(ev.id) || []).slice().sort((a, b) => {
                const timeA = a.updated_at_ms || a.created_at_ms || 0;
                const timeB = b.updated_at_ms || b.created_at_ms || 0;
                return timeB - timeA;
            });

            const list = groupsMap.get(cat) || [];
            list.push({ event: ev, notes: evNotes });
            groupsMap.set(cat, list);
        }

        // Orden de categorías prioritarias
        const priorityOrder: Record<string, number> = {
            Universidad: 1,
            Clases: 2,
            Trabajo: 3,
        };

        const result: CategoryGroup[] = [];
        groupsMap.forEach((evList, cat) => {
            const totalNotes = evList.reduce((sum, item) => sum + item.notes.length, 0);
            result.push({
                category: cat,
                events: evList.sort((a, b) => a.event.title.localeCompare(b.event.title)),
                totalNotes,
            });
        });

        return result.sort((a, b) => {
            const pA = priorityOrder[a.category] || 99;
            const pB = priorityOrder[b.category] || 99;
            if (pA !== pB) return pA - pB;
            return a.category.localeCompare(b.category);
        });
    }, [events, filterFolderId, notesByEventId]);

    if (categoryGroups.length === 0) {
        return null;
    }

    const toggleCategory = (category: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setCollapsedCategories(prev => ({
            ...prev,
            [category]: !prev[category],
        }));
    };

    const toggleEvent = (eventId: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedEvents(prev => ({
            ...prev,
            [eventId]: !prev[eventId],
        }));
    };

    const defaultTitle = language === 'es' ? 'CUADERNOS INTELIGENTES' : 'SMART NOTEBOOKS';

    return (
        <View style={styles.container}>
            {/* Cabecera de la sección general */}
            <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                    {headerTitle || defaultTitle}
                </Text>
            </View>

            {/* Lista de Grupos por Categoría (Nivel 1) */}
            <View style={styles.groupsContainer}>
                {categoryGroups.map(group => {
                    const isCollapsed = Boolean(collapsedCategories[group.category]);
                    const categoryIconColor = accent.primary;

                    return (
                        <View
                            key={group.category}
                            style={[
                                styles.categoryCard,
                                {
                                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                                },
                            ]}
                        >
                            {/* Nivel 1: Header de Categoría */}
                            <TouchableOpacity
                                style={styles.categoryHeader}
                                onPress={() => toggleCategory(group.category)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.categoryLeft}>
                                    <View
                                        style={[
                                            styles.categoryIconBadge,
                                            { backgroundColor: `${categoryIconColor}${isDark ? '25' : '15'}` },
                                        ]}
                                    >
                                        {renderCategoryIcon(group.category, categoryIconColor)}
                                    </View>
                                    <Text style={[styles.categoryTitleText, { color: colors.textPrimary }]}>
                                        {group.category}
                                    </Text>
                                    <View
                                        style={[
                                            styles.countBadge,
                                            {
                                                backgroundColor: isDark
                                                    ? 'rgba(255, 255, 255, 0.08)'
                                                    : 'rgba(0, 0, 0, 0.06)',
                                            },
                                        ]}
                                    >
                                        <Text style={[styles.countBadgeText, { color: colors.textSecondary }]}>
                                            {group.totalNotes}{' '}
                                            {language === 'es'
                                                ? group.totalNotes === 1 ? 'nota' : 'notas'
                                                : group.totalNotes === 1 ? 'note' : 'notes'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.categoryChevron}>
                                    {isCollapsed ? (
                                        <ChevronRight size={16} color={colors.textMuted as any} />
                                    ) : (
                                        <ChevronDown size={16} color={colors.textMuted as any} />
                                    )}
                                </View>
                            </TouchableOpacity>

                            {/* Nivel 2: Eventos / Materias dentro de la Categoría */}
                            {!isCollapsed && (
                                <View style={styles.eventsList}>
                                    {group.events.map(({ event, notes: evNotes }) => {
                                        const isExpanded = Boolean(expandedEvents[event.id]);
                                        const eventColor = event.color || '#3B82F6';

                                        return (
                                            <View key={event.id} style={styles.eventItemWrapper}>
                                                {/* Fila del Evento */}
                                                <TouchableOpacity
                                                    style={[
                                                        styles.eventRow,
                                                        {
                                                            backgroundColor: isExpanded
                                                                ? `${eventColor}${isDark ? '14' : '0A'}`
                                                                : 'transparent',
                                                            borderColor: isExpanded
                                                                ? `${eventColor}30`
                                                                : 'transparent',
                                                        },
                                                    ]}
                                                    onPress={() => toggleEvent(event.id)}
                                                    activeOpacity={0.7}
                                                >
                                                    <View style={styles.eventRowLeft}>
                                                        <View
                                                            style={[
                                                                styles.eventIconBox,
                                                                { backgroundColor: `${eventColor}${isDark ? '25' : '15'}` },
                                                            ]}
                                                        >
                                                            <Calendar
                                                                size={13}
                                                                color={eventColor as any}
                                                                strokeWidth={2.2}
                                                            />
                                                        </View>
                                                        <Text
                                                            style={[styles.eventTitleText, { color: colors.textPrimary }]}
                                                            numberOfLines={1}
                                                        >
                                                            {event.title}
                                                        </Text>
                                                        <Text style={[styles.eventNotesCount, { color: colors.textMuted }]}>
                                                            ({evNotes.length})
                                                        </Text>
                                                    </View>

                                                    <View style={styles.eventRowRight}>
                                                        {/* Botón Acción Rápida: + Crear Nota vinculada */}
                                                        <TouchableOpacity
                                                            style={[
                                                                styles.actionBtn,
                                                                {
                                                                    backgroundColor: `${eventColor}${isDark ? '22' : '15'}`,
                                                                    borderColor: `${eventColor}40`,
                                                                },
                                                            ]}
                                                            onPress={(e) => {
                                                                e.stopPropagation();
                                                                onCreateNoteForEvent(event.id);
                                                            }}
                                                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                                            activeOpacity={0.7}
                                                        >
                                                            <Plus size={12} color={eventColor as any} strokeWidth={2.6} />
                                                        </TouchableOpacity>

                                                        {/* Botón: Abrir detalles en la Agenda */}
                                                        <TouchableOpacity
                                                            style={[
                                                                styles.actionBtn,
                                                                {
                                                                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                                                                    borderColor: colors.borderSubtle,
                                                                },
                                                            ]}
                                                            onPress={(e) => {
                                                                e.stopPropagation();
                                                                onOpenEventDetails(event.id);
                                                            }}
                                                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                                            activeOpacity={0.7}
                                                        >
                                                            <ExternalLink size={12} color={colors.textSecondary as any} strokeWidth={2} />
                                                        </TouchableOpacity>

                                                        {/* Indicador de Despliegue */}
                                                        <View style={styles.eventChevron}>
                                                            {isExpanded ? (
                                                                <ChevronDown size={14} color={colors.textMuted as any} />
                                                            ) : (
                                                                <ChevronRight size={14} color={colors.textMuted as any} />
                                                            )}
                                                        </View>
                                                    </View>
                                                </TouchableOpacity>

                                                {/* Nivel 3: Notas vinculadas al Evento */}
                                                {isExpanded && (
                                                    <View style={styles.notesSubtree}>
                                                        {/* Línea guía vertical de jerarquía */}
                                                        <View
                                                            style={[
                                                                styles.treeGuideLine,
                                                                { backgroundColor: `${eventColor}30` },
                                                            ]}
                                                        />

                                                        {evNotes.length === 0 ? (
                                                            /* Estado vacío con botón "+ Crear apunte" */
                                                            <View style={styles.emptyEventNotes}>
                                                                <Text style={[styles.emptyEventText, { color: colors.textMuted }]}>
                                                                    {language === 'es' ? 'Sin apuntes aún' : 'No notes yet'}
                                                                </Text>
                                                                <TouchableOpacity
                                                                    style={[
                                                                        styles.createFirstNoteBtn,
                                                                        {
                                                                            backgroundColor: `${eventColor}${isDark ? '25' : '15'}`,
                                                                            borderColor: `${eventColor}40`,
                                                                        },
                                                                    ]}
                                                                    onPress={() => onCreateNoteForEvent(event.id)}
                                                                    activeOpacity={0.75}
                                                                >
                                                                    <Plus size={11} color={eventColor as any} strokeWidth={2.4} />
                                                                    <Text style={[styles.createFirstNoteText, { color: eventColor }]}>
                                                                        {language === 'es' ? 'Crear apunte' : 'Create note'}
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            </View>
                                                        ) : (
                                                            /* Lista de Notas */
                                                            <View style={styles.notesListWrapper}>
                                                                {evNotes.map(note => (
                                                                    <TouchableOpacity
                                                                        key={note.id}
                                                                        style={[
                                                                            styles.noteItemRow,
                                                                            {
                                                                                backgroundColor: isDark
                                                                                    ? 'rgba(255, 255, 255, 0.04)'
                                                                                    : 'rgba(0, 0, 0, 0.025)',
                                                                                borderColor: colors.borderSubtle,
                                                                            },
                                                                        ]}
                                                                        onPress={() => onSelectNote(note)}
                                                                        activeOpacity={0.7}
                                                                    >
                                                                        <FileText size={12} color={colors.textSecondary as any} strokeWidth={2} />
                                                                        <Text
                                                                            style={[styles.noteTitleText, { color: colors.textPrimary }]}
                                                                            numberOfLines={1}
                                                                        >
                                                                            {note.title || (language === 'es' ? 'Nota sin título' : 'Untitled note')}
                                                                        </Text>
                                                                    </TouchableOpacity>
                                                                ))}
                                                            </View>
                                                        )}
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    );
                })}
            </View>
        </View>
    );
};

function renderCategoryIcon(category: string, color: string) {
    switch (category) {
        case 'Universidad':
            return <GraduationCap size={15} color={color as any} strokeWidth={2.2} />;
        case 'Clases':
            return <BookOpen size={15} color={color as any} strokeWidth={2.2} />;
        case 'Trabajo':
            return <Briefcase size={15} color={color as any} strokeWidth={2.2} />;
        default:
            return <LucideFolder size={15} color={color as any} strokeWidth={2.2} />;
    }
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
        paddingHorizontal: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    groupsContainer: {
        gap: 10,
    },
    categoryCard: {
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    categoryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    categoryLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    categoryIconBadge: {
        width: 26,
        height: 26,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryTitleText: {
        fontSize: 14,
        fontWeight: '700',
    },
    countBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
    },
    countBadgeText: {
        fontSize: 10,
        fontWeight: '600',
    },
    categoryChevron: {
        marginLeft: 8,
    },
    eventsList: {
        paddingBottom: 6,
        paddingHorizontal: 8,
        gap: 4,
    },
    eventItemWrapper: {
        marginVertical: 2,
    },
    eventRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
    },
    eventRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        flex: 1,
        marginRight: 6,
    },
    eventIconBox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    eventTitleText: {
        fontSize: 13,
        fontWeight: '600',
        flexShrink: 1,
    },
    eventNotesCount: {
        fontSize: 11,
        fontWeight: '500',
    },
    eventRowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    actionBtn: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
    },
    eventChevron: {
        marginLeft: 2,
    },
    notesSubtree: {
        position: 'relative',
        marginLeft: 18,
        paddingLeft: 14,
        paddingTop: 6,
        paddingBottom: 4,
    },
    treeGuideLine: {
        position: 'absolute',
        top: 0,
        bottom: 8,
        left: 4,
        width: 1.5,
        borderRadius: 1,
    },
    notesListWrapper: {
        gap: 4,
    },
    noteItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
    },
    noteTitleText: {
        fontSize: 12,
        fontWeight: '500',
        flex: 1,
    },
    emptyEventNotes: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
        paddingHorizontal: 8,
    },
    emptyEventText: {
        fontSize: 11,
        fontStyle: 'italic',
    },
    createFirstNoteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
    },
    createFirstNoteText: {
        fontSize: 11,
        fontWeight: '600',
    },
});

