import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Modal,
    Alert,
    ActivityIndicator,
    BackHandler,
    Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { format, isToday, isTomorrow, isPast, differenceInMinutes, isSameDay } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import {
    ChevronLeft,
    ChevronRight,
    Edit3,
    Trash2,
    Share2,
    MoreVertical,
    Calendar as CalendarIcon,
    Clock,
    MapPin,
    Repeat,
    FileText,
    Folder as FolderIcon,
    FolderPlus,
    Plus,
    Link as LinkIcon,
    Unlink,
    Search,
    X,
    Bell,
    Check,
    Pin,
    ExternalLink,
    Sparkles,
    Eye,
    AlignLeft,
} from '@tamagui/lucide-icons';

import { CalendarEvent, Note, Folder, Reminder } from '../../src/types/db';
import { useStore } from '../../src/store/useStore';
import { useEventsStore } from '../../src/store/useEventsStore';
import { useNotesStore } from '../../src/store/useNotesStore';
import { useFoldersStore } from '../../src/store/useFoldersStore';
import { useVeyraTheme } from '../../src/theme/useVeyraTheme';
import { VeyraSurface, VeyraIconButton } from '../../src/components/ui';
import { FolderIconRenderer } from '../../src/components/notes/FolderIconRenderer';
import { ShareModal } from '../../src/components/collaboration/ShareModal';
import { CollaboratorsAvatars } from '../../src/components/collaboration/CollaboratorsAvatars';
import { RecurringDeleteModal } from '../../src/components/events/RecurringDeleteModal';
import { isEventOccurringOnDate } from '../../src/services/eventService';
import { getAllDescendantFolderIds } from '../../src/services/folderService';
import { extractPlainTextFromPages } from '../../src/utils/pageUtils';

const CATEGORY_LABELS: Record<string, string> = {
    class: 'Clase',
    work: 'Trabajo',
    meeting: 'Reunión',
    personal: 'Personal',
    health: 'Salud',
    birthday: 'Cumpleaños',
};

function getNoteSnippet(note: Note): string {
    if (note.preview_text && note.preview_text.trim().length > 0) {
        return note.preview_text.trim();
    }
    if (!note.content) return '';
    try {
        return extractPlainTextFromPages(note.content).trim();
    } catch {
        return note.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
}

function formatOffsetLabel(mins: number): string {
    if (mins === 0) return 'A la hora del evento';
    if (mins < 60) return `${mins} min antes`;
    if (mins === 60) return '1 hora antes';
    if (mins < 1440) return `${Math.round(mins / 60)} horas antes`;
    if (mins === 1440) return '1 día antes';
    return `${Math.round(mins / 1440)} días antes`;
}

export default function EventDetailScreen() {
    const { id, occurrenceDate: occurrenceDateParam } = useLocalSearchParams<{
        id: string;
        occurrenceDate?: string;
    }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, accent, isDark, isAmoled } = useVeyraTheme();

    const language = useStore(state => state.language);
    const session = useStore(state => state.session);
    const itemTagsMap = useStore(state => state.itemTagsMap);
    const markReminderCompleted = useStore(state => state.markAsCompleted);
    const markReminderPending = useStore(state => state.markAsPending);
    const locale = language === 'es' ? es : enUS;

    const events = useEventsStore(state => state.events);
    const loadAllEvents = useEventsStore(state => state.loadAllEvents);
    const deleteEvent = useEventsStore(state => state.deleteEvent);
    const deleteEventOccurrence = useEventsStore(state => state.deleteEventOccurrence);
    const linkNoteToEvent = useEventsStore(state => state.linkNoteToEvent);
    const unlinkNoteFromEvent = useEventsStore(state => state.unlinkNoteFromEvent);
    const linkFolderToEvent = useEventsStore(state => state.linkFolderToEvent);
    const unlinkFolderFromEvent = useEventsStore(state => state.unlinkFolderFromEvent);

    const notes = useNotesStore(state => state.notes);
    const loadNotes = useNotesStore(state => state.loadNotes);
    const moveNotesBatch = useNotesStore(state => state.moveNotesBatch);

    const folders = useFoldersStore(state => state.folders);
    const loadFolders = useFoldersStore(state => state.loadFolders);
    const createFolder = useFoldersStore(state => state.createFolder);
    const resetFolderStack = useFoldersStore(state => state.resetFolderStack);
    const pushFolder = useFoldersStore(state => state.pushFolder);

    const event = useMemo(() => events.find(e => e.id === id) || null, [events, id]);
    const [isLoadingFallback, setIsLoadingFallback] = useState(!event);
    const [linkedReminders, setLinkedReminders] = useState<Reminder[]>([]);

    // Modals state
    const [isLinkNoteModalVisible, setIsLinkNoteModalVisible] = useState(false);
    const [isLinkFolderModalVisible, setIsLinkFolderModalVisible] = useState(false);
    const [isCreateFolderModalVisible, setIsCreateFolderModalVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [noteSearchQuery, setNoteSearchQuery] = useState('');
    const [folderSearchQuery, setFolderSearchQuery] = useState('');
    const [isOptionsModalVisible, setIsOptionsModalVisible] = useState(false);
    const [isShareModalVisible, setIsShareModalVisible] = useState(false);
    const [isRecurringDeleteModalVisible, setIsRecurringDeleteModalVisible] = useState(false);

    // Load fresh data when screen focuses
    useFocusEffect(
        useCallback(() => {
            loadAllEvents().catch(() => {});
            loadNotes().catch(() => {});
            loadFolders().catch(() => {});
            if (id) {
                (async () => {
                    try {
                        const { getDB } = await import('../../src/db');
                        const db = await getDB();
                        const rems = await db.getAllAsync<Reminder>(
                            'SELECT * FROM reminders WHERE event_id = ? AND deleted = 0 ORDER BY due_date_ms ASC',
                            [id]
                        );
                        setLinkedReminders(rems || []);
                    } catch {}
                })();
            }
        }, [id, loadAllEvents, loadNotes, loadFolders])
    );

    // Fallback load from SQLite / Supabase if not in store yet
    useEffect(() => {
        if (!event && id) {
            let isCancelled = false;
            setIsLoadingFallback(true);
            (async () => {
                try {
                    const { getDB } = await import('../../src/db');
                    const db = await getDB();
                    const local = await db.getFirstAsync<CalendarEvent>(
                        'SELECT * FROM events WHERE id = ? AND deleted = 0',
                        [id]
                    );
                    if (local && !isCancelled) {
                        await loadAllEvents();
                        return;
                    }
                    if (session?.user?.id) {
                        const { supabase } = await import('../../src/lib/supabase');
                        const { data: remote } = await supabase
                            .from('events')
                            .select('*')
                            .eq('id', id)
                            .maybeSingle();
                        if (remote && !isCancelled) {
                            const { SyncService } = await import('../../src/services/syncService');
                            await SyncService.upsertLocalEvent(db, remote, session.user.id);
                            await loadAllEvents();
                        }
                    }
                } catch (e) {
                    console.warn('[EventHub] Error loading event fallback:', e);
                } finally {
                    if (!isCancelled) setIsLoadingFallback(false);
                }
            })();
            return () => {
                isCancelled = true;
            };
        } else {
            setIsLoadingFallback(false);
        }
    }, [id, event, session?.user?.id, loadAllEvents]);

    // Hardware back handler
    useFocusEffect(
        useCallback(() => {
            const onBack = () => {
                if (isLinkNoteModalVisible) {
                    setIsLinkNoteModalVisible(false);
                    return true;
                }
                if (isLinkFolderModalVisible) {
                    setIsLinkFolderModalVisible(false);
                    return true;
                }
                if (isCreateFolderModalVisible) {
                    setIsCreateFolderModalVisible(false);
                    return true;
                }
                if (isOptionsModalVisible) {
                    setIsOptionsModalVisible(false);
                    return true;
                }
                return false;
            };
            const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
            return () => sub.remove();
        }, [
            isLinkNoteModalVisible,
            isLinkFolderModalVisible,
            isCreateFolderModalVisible,
            isOptionsModalVisible,
        ])
    );

    const screenBgColor = isAmoled ? '#000000' : isDark ? '#121212' : '#F8FAFC';
    const cardBgColor = isAmoled ? '#141414' : isDark ? '#1C1E26' : '#FFFFFF';
    const controlBgColor = isAmoled ? '#1E1E1E' : isDark ? '#262934' : '#F1F5F9';
    const cardBorderColor = isAmoled
        ? 'rgba(255, 255, 255, 0.12)'
        : isDark
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(0, 0, 0, 0.07)';

    const eventColor = event?.color || accent.primary || '#3B82F6';
    const isShared = event?.is_shared === 1 || Boolean(event?.shared_owner_id);
    const isOwner = !isShared || !event?.shared_owner_id || event.shared_owner_id === session?.user?.id;
    const isReadOnly = isShared && !isOwner;

    // Dates & status computation
    const startDate = useMemo(() => new Date(event?.start_time_ms || Date.now()), [event?.start_time_ms]);
    const endDate = useMemo(() => new Date(event?.end_time_ms || Date.now()), [event?.end_time_ms]);
    const displayDate = useMemo(() => {
        if (occurrenceDateParam) {
            const parsed = new Date(occurrenceDateParam);
            if (!isNaN(parsed.getTime())) return parsed;
        }
        return startDate;
    }, [occurrenceDateParam, startDate]);

    const isAllDay = Boolean(event?.is_all_day);
    const isRecurring = Boolean(
        (event?.recurrence_rule && event.recurrence_rule !== 'none' && event.recurrence_rule !== '{"type":"none"}') ||
        (event?.repeat_rule && event.repeat_rule !== 'none' && event.repeat_rule !== 'null')
    );

    const nowMs = Date.now();
    const today = new Date(nowMs);
    const occursToday = event ? isSameDay(displayDate, today) && isEventOccurringOnDate(event, today) : false;
    let isHappeningNow = false;
    if (occursToday && !isAllDay) {
        const sToday = new Date(today);
        sToday.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
        const eToday = new Date(today);
        eToday.setHours(endDate.getHours(), endDate.getMinutes(), 59, 999);
        isHappeningNow = nowMs >= sToday.getTime() && nowMs <= eToday.getTime();
    } else if (occursToday && isAllDay) {
        isHappeningNow = true;
    }

    const durationMin = Math.max(0, differenceInMinutes(endDate, startDate));
    const durationStr = useMemo(() => {
        if (isAllDay) return 'Todo el día';
        if (durationMin <= 0) return '';
        if (durationMin < 60) return `${durationMin} min`;
        const h = Math.floor(durationMin / 60);
        const m = durationMin % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }, [isAllDay, durationMin]);

    // Linked Folder
    const linkedFolder = useMemo(() => {
        if (!event?.folder_id) return null;
        return folders.find(f => f.id === event.folder_id && !f.deleted) || null;
    }, [event?.folder_id, folders]);

    // Descendant folder IDs if a folder is linked
    const linkedFolderTreeIds = useMemo(() => {
        if (!linkedFolder) return new Set<string>();
        const ids = getAllDescendantFolderIds(linkedFolder.id, folders);
        return new Set([linkedFolder.id, ...ids]);
    }, [linkedFolder, folders]);

    // Subfolders inside the linked folder
    const linkedSubfolders = useMemo(() => {
        if (!linkedFolder) return [];
        return folders.filter(f => !f.deleted && f.parent_id === linkedFolder.id);
    }, [linkedFolder, folders]);

    // All notes associated with this event (either directly via event_id / note_id, or inside the linked folder tree)
    const eventNotes = useMemo(() => {
        if (!event) return [];
        const seen = new Set<string>();
        const list: Note[] = [];

        for (const n of notes) {
            if (n.deleted) continue;
            const isDirect = n.event_id === event.id || (event.note_id && n.id === event.note_id);
            const isInFolder = n.folder_id ? linkedFolderTreeIds.has(n.folder_id) : false;
            if ((isDirect || isInFolder) && !seen.has(n.id)) {
                seen.add(n.id);
                list.push(n);
            }
        }

        return list.sort((a, b) => {
            if ((b.is_pinned || 0) !== (a.is_pinned || 0)) {
                return (b.is_pinned || 0) - (a.is_pinned || 0);
            }
            return (b.updated_at_ms || 0) - (a.updated_at_ms || 0);
        });
    }, [event, notes, linkedFolderTreeIds]);

    // Available notes to link (not already in eventNotes)
    const availableNotesToLink = useMemo(() => {
        const currentIds = new Set(eventNotes.map(n => n.id));
        const available = notes.filter(n => !n.deleted && !currentIds.has(n.id));
        if (!noteSearchQuery.trim()) return available;
        const q = noteSearchQuery.toLowerCase();
        return available.filter(n =>
            (n.title || 'Sin título').toLowerCase().includes(q) ||
            (n.preview_text || '').toLowerCase().includes(q)
        );
    }, [notes, eventNotes, noteSearchQuery]);

    // Available folders to link
    const availableFoldersToLink = useMemo(() => {
        const active = folders.filter(f => !f.deleted && f.id !== event?.folder_id);
        if (!folderSearchQuery.trim()) return active;
        const q = folderSearchQuery.toLowerCase();
        return active.filter(f => f.name.toLowerCase().includes(q));
    }, [folders, event?.folder_id, folderSearchQuery]);

    // Tags for this event
    const eventTags = useMemo(() => {
        if (!event) return [];
        const fromMap = itemTagsMap[`event:${event.id}`];
        if (fromMap && fromMap.length > 0) return fromMap.map(t => t.name);
        if (event.tags) {
            try {
                const parsed = JSON.parse(event.tags);
                if (Array.isArray(parsed)) return parsed;
            } catch {}
        }
        return [];
    }, [event, itemTagsMap]);

    // Notification offsets
    const notificationOffsets = useMemo(() => {
        if (!event) return [];
        if (event.notification_offsets) {
            try {
                const parsed = JSON.parse(event.notification_offsets);
                if (Array.isArray(parsed)) return parsed.map(Number).filter(n => !isNaN(n));
            } catch {}
        }
        if (event.notification_offset_min !== undefined && event.notification_offset_min !== null) {
            return [event.notification_offset_min];
        }
        return [];
    }, [event]);

    // Handlers
    const handleEditEvent = () => {
        if (!event) return;
        router.push({
            pathname: '/events/create',
            params: {
                id: event.id,
                occurrenceDate: occurrenceDateParam,
            },
        });
    };

    const handleCreateNoteForEvent = () => {
        if (!event) return;
        const defaultTitle = `${event.title} - ${format(displayDate, 'dd/MM/yyyy')}`;
        router.push({
            pathname: '/notes/create',
            params: {
                eventId: event.id,
                folderId: event.folder_id || undefined,
                initialTitle: defaultTitle,
            },
        });
    };

    const handleOpenCreateFolderModal = () => {
        if (!event) return;
        setNewFolderName(event.title);
        setIsCreateFolderModalVisible(true);
    };

    const handleConfirmCreateFolderForEvent = async () => {
        if (!event) return;
        const nameToUse = newFolderName.trim() || event.title;
        setIsCreateFolderModalVisible(false);
        const created = await createFolder(nameToUse, 'folder', eventColor, false, null);
        if (created?.id) {
            await linkFolderToEvent(event.id, created.id);
            // Si ya habían notas directas del evento sin carpeta, moverlas automáticamente a la nueva carpeta del evento
            const directUnassignedNoteIds = eventNotes
                .filter(n => !n.folder_id)
                .map(n => n.id);
            if (directUnassignedNoteIds.length > 0) {
                await moveNotesBatch(directUnassignedNoteIds, created.id);
            }
        }
    };

    const handleOpenFolderInNotesTab = (folderToOpen: Folder) => {
        resetFolderStack();
        pushFolder(folderToOpen);
        useStore.getState().setMainActiveTab('notes');
        router.push('/notes');
    };

    const handleLinkExistingNote = async (note: Note) => {
        if (!event) return;
        await linkNoteToEvent(event.id, note.id);
        if (event.folder_id && !note.folder_id) {
            await moveNotesBatch([note.id], event.folder_id);
        }
        setIsLinkNoteModalVisible(false);
        setNoteSearchQuery('');
    };

    const handleUnlinkNote = (note: Note) => {
        if (!event) return;
        Alert.alert(
            'Desvincular nota',
            `¿Quieres desvincular "${note.title || 'Sin título'}" de este evento? La nota no se eliminará.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Desvincular',
                    style: 'destructive',
                    onPress: async () => {
                        await unlinkNoteFromEvent(event.id, note.id);
                        if (event.folder_id && note.folder_id === event.folder_id) {
                            await moveNotesBatch([note.id], null);
                        }
                    },
                },
            ]
        );
    };

    const handleUnlinkFolder = () => {
        if (!event || !linkedFolder) return;
        Alert.alert(
            'Desvincular carpeta',
            `¿Quieres desvincular la carpeta "${linkedFolder.name}" de este evento? La carpeta y sus notas se conservarán intactas.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Desvincular',
                    style: 'destructive',
                    onPress: async () => {
                        await unlinkFolderFromEvent(event.id);
                    },
                },
            ]
        );
    };

    const handleDeleteEventPress = () => {
        if (!event) return;
        setIsOptionsModalVisible(false);
        if (isRecurring) {
            setIsRecurringDeleteModalVisible(true);
            return;
        }
        Alert.alert(
            'Eliminar evento',
            `¿Estás seguro de eliminar "${event.title}"? Tus notas y carpetas vinculadas se conservarán.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteEvent(event.id);
                        router.back();
                    },
                },
            ]
        );
    };

    const handleConfirmRecurringDelete = async (mode: 'this' | 'following' | 'all') => {
        if (!event) return;
        setIsRecurringDeleteModalVisible(false);
        await deleteEventOccurrence(event.id, displayDate, mode);
        router.back();
    };

    const handleToggleReminderStatus = async (rem: Reminder) => {
        if (rem.status === 'completed') {
            await markReminderPending(rem.id);
        } else {
            await markReminderCompleted(rem.id);
        }
        if (id) {
            const { getDB } = await import('../../src/db');
            const db = await getDB();
            const updated = await db.getAllAsync<Reminder>(
                'SELECT * FROM reminders WHERE event_id = ? AND deleted = 0 ORDER BY due_date_ms ASC',
                [id]
            );
            setLinkedReminders(updated || []);
        }
    };

    if (isLoadingFallback) {
        return (
            <View style={[styles.screen, { backgroundColor: screenBgColor, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={accent.primary} />
            </View>
        );
    }

    if (!event) {
        return (
            <SafeAreaView style={[styles.screen, { backgroundColor: screenBgColor }]} edges={['top', 'left', 'right']}>
                <View style={[styles.header, { borderBottomColor: cardBorderColor }]}>
                    <VeyraIconButton
                        variant="ghost"
                        size="sm"
                        icon={<ChevronLeft size={24} color={colors.textPrimary as any} />}
                        onPress={() => router.back()}
                    />
                </View>
                <View style={styles.notFoundContainer}>
                    <CalendarIcon size={42} color={colors.textMuted as any} />
                    <Text style={[styles.notFoundTitle, { color: colors.textPrimary }]}>
                        Evento no encontrado
                    </Text>
                    <Text style={[styles.notFoundSub, { color: colors.textMuted }]}>
                        Es posible que este evento haya sido eliminado.
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    const formattedFullDate = format(displayDate, "EEEE, d 'de' MMMM yyyy", { locale });
    const capitalizedDate = formattedFullDate.charAt(0).toUpperCase() + formattedFullDate.slice(1);
    const timeRangeStr = isAllDay
        ? 'Todo el día'
        : `${format(startDate, 'HH:mm')} – ${format(endDate, 'HH:mm')}`;

    const isLocationWebLink = useMemo(() => {
        if (!event?.location) return false;
        const loc = event.location.trim();
        return /^https?:\/\//i.test(loc) || /^(www\.|zoom\.us|meet\.google\.com|teams\.microsoft\.com)/i.test(loc);
    }, [event?.location]);

    const handleOpenLocation = useCallback(() => {
        if (!event?.location) return;
        const loc = event.location.trim();
        if (/^https?:\/\//i.test(loc)) {
            Linking.openURL(loc).catch(() => {
                Alert.alert('Error', 'No se pudo abrir el enlace');
            });
        } else if (/^(www\.|zoom\.us|meet\.google\.com|teams\.microsoft\.com)/i.test(loc)) {
            Linking.openURL(`https://${loc}`).catch(() => {
                Alert.alert('Error', 'No se pudo abrir el enlace');
            });
        } else {
            const query = encodeURIComponent(loc);
            Linking.openURL(`https://maps.google.com/?q=${query}`).catch(() => {
                Alert.alert('Error', 'No se pudo abrir el mapa');
            });
        }
    }, [event?.location]);

    return (
        <View style={[styles.screen, { backgroundColor: screenBgColor }]}>
            <SafeAreaView style={[styles.screen, { backgroundColor: screenBgColor }]} edges={['top', 'left', 'right']}>
                {/* ─── TOP BAR ─── */}
                <View style={[styles.header, { borderBottomColor: cardBorderColor }]}>
                    <VeyraIconButton
                        variant="ghost"
                        size="sm"
                        icon={<ChevronLeft size={24} color={colors.textPrimary as any} />}
                        onPress={() => router.back()}
                    />

                    <View style={styles.headerRight}>
                        <CollaboratorsAvatars
                            targetType="event"
                            targetId={event.id}
                            onPress={() => setIsShareModalVisible(true)}
                        />

                        <VeyraIconButton
                            variant="ghost"
                            size="sm"
                            icon={<Share2 size={19} color={colors.textSecondary as any} />}
                            onPress={() => setIsShareModalVisible(true)}
                        />

                        {!isReadOnly && (
                            <TouchableOpacity
                                activeOpacity={0.75}
                                onPress={handleEditEvent}
                                style={[
                                    styles.editHeaderPill,
                                    {
                                        backgroundColor: `${eventColor}18`,
                                        borderColor: `${eventColor}40`,
                                    },
                                ]}
                            >
                                <Edit3 size={14} color={eventColor as any} />
                                <Text style={[styles.editHeaderPillText, { color: eventColor }]}>
                                    Editar
                                </Text>
                            </TouchableOpacity>
                        )}

                        <VeyraIconButton
                            variant="ghost"
                            size="sm"
                            icon={<MoreVertical size={20} color={colors.textSecondary as any} />}
                            onPress={() => setIsOptionsModalVisible(true)}
                        />
                    </View>
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
                >
                    {/* ─── ENCABEZADO COMPACTO DEL EVENTO ─── */}
                    <View style={styles.compactHeroSection}>
                        {/* Fila 1: Acento de color + Badges */}
                        <View style={styles.compactMetaRow}>
                            <View style={[styles.compactColorDot, { backgroundColor: eventColor }]} />

                            {isHappeningNow ? (
                                <View style={[styles.compactBadge, { backgroundColor: `${eventColor}22` }]}>
                                    <View style={[styles.liveDot, { backgroundColor: eventColor }]} />
                                    <Text style={[styles.compactBadgeText, { color: eventColor, fontWeight: '800' }]}>
                                        EN CURSO
                                    </Text>
                                </View>
                            ) : isToday(displayDate) ? (
                                <View style={[styles.compactBadge, { backgroundColor: `${eventColor}18` }]}>
                                    <Text style={[styles.compactBadgeText, { color: eventColor, fontWeight: '700' }]}>
                                        HOY
                                    </Text>
                                </View>
                            ) : isTomorrow(displayDate) ? (
                                <View style={[styles.compactBadge, { backgroundColor: controlBgColor }]}>
                                    <Text style={[styles.compactBadgeText, { color: colors.textSecondary }]}>
                                        MAÑANA
                                    </Text>
                                </View>
                            ) : isPast(endDate) && !isRecurring ? (
                                <View style={[styles.compactBadge, { backgroundColor: controlBgColor }]}>
                                    <Text style={[styles.compactBadgeText, { color: colors.textMuted }]}>
                                        FINALIZADO
                                    </Text>
                                </View>
                            ) : null}

                            {event.category_id && CATEGORY_LABELS[event.category_id] && (
                                <View style={[styles.compactBadge, { backgroundColor: controlBgColor }]}>
                                    <Text style={[styles.compactBadgeText, { color: colors.textSecondary }]}>
                                        {CATEGORY_LABELS[event.category_id]}
                                    </Text>
                                </View>
                            )}

                            {isRecurring && (
                                <View style={[styles.compactBadge, { backgroundColor: controlBgColor }]}>
                                    <Repeat size={10.5} color={colors.textMuted as any} />
                                    <Text style={[styles.compactBadgeText, { color: colors.textSecondary }]}>
                                        Recurrente
                                    </Text>
                                </View>
                            )}

                            {isReadOnly && (
                                <View style={[styles.compactBadge, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
                                    <Eye size={10.5} color={"#38BDF8" as any} />
                                    <Text style={[styles.compactBadgeText, { color: '#38BDF8' }]}>
                                        Solo lectura
                                    </Text>
                                </View>
                            )}

                            {eventTags.map(tag => (
                                <TouchableOpacity
                                    key={tag}
                                    activeOpacity={0.7}
                                    onPress={() => router.push({ pathname: '/tag/[slug]', params: { slug: tag } })}
                                    style={[styles.compactTagPill, { backgroundColor: controlBgColor }]}
                                >
                                    <Text style={[styles.compactTagText, { color: colors.textMuted }]}>
                                        #{tag}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Fila 2: Título del evento */}
                        <Text style={[styles.compactTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                            {event.title}
                        </Text>

                        {/* Fila 3: Horario y fecha */}
                        <View style={[styles.compactDetailsBar, { backgroundColor: controlBgColor, borderColor: cardBorderColor }]}>
                            <Clock size={13} color={(isHappeningNow ? eventColor : colors.textSecondary) as any} />
                            <Text style={[styles.compactDateText, { color: isHappeningNow ? eventColor : colors.textPrimary }]} numberOfLines={1}>
                                {capitalizedDate}  •  {timeRangeStr}
                            </Text>
                            {durationStr && !isAllDay ? (
                                <Text style={[styles.compactDurationText, { color: colors.textMuted }]}>
                                    ({durationStr})
                                </Text>
                            ) : null}
                        </View>

                        {/* Fila 4: Lugar o Enlace debajo de la fecha */}
                        {Boolean(event.location && event.location.trim()) ? (
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={handleOpenLocation}
                                style={[styles.compactLocationBar, { backgroundColor: controlBgColor, borderColor: cardBorderColor }]}
                            >
                                {isLocationWebLink ? (
                                    <ExternalLink size={13} color={accent.primary as any} />
                                ) : (
                                    <MapPin size={13} color={(isHappeningNow ? eventColor : colors.textSecondary) as any} />
                                )}
                                <Text
                                    style={[
                                        styles.compactLocationText,
                                        { color: isLocationWebLink ? accent.primary : colors.textSecondary },
                                        isLocationWebLink && styles.compactLocationLinkText,
                                    ]}
                                    numberOfLines={1}
                                >
                                    {event.location?.trim()}
                                </Text>
                            </TouchableOpacity>
                        ) : null}

                        {/* Descripción concisa si existe */}
                        {Boolean(event.description && event.description.trim()) && (
                            <View style={[styles.compactDescriptionBox, { borderLeftColor: eventColor }]}>
                                <Text style={[styles.compactDescriptionText, { color: colors.textSecondary }]} numberOfLines={3}>
                                    {event.description}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* ─── CUADERNO / CARPETA DEL EVENTO ─── */}
                    <View style={styles.sectionBlock}>
                        <View style={styles.sectionHeaderRow}>
                            <View style={styles.sectionTitleRow}>
                                <FolderIcon size={16} color={eventColor as any} />
                                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                    Carpeta del Evento
                                </Text>
                            </View>
                            {linkedFolder && !isReadOnly && (
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setIsLinkFolderModalVisible(true)}
                                >
                                    <Text style={[styles.sectionActionLink, { color: accent.primary }]}>
                                        Cambiar
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {linkedFolder ? (
                            <View
                                style={[
                                    styles.folderHubCard,
                                    {
                                        backgroundColor: cardBgColor,
                                        borderColor: `${linkedFolder.color || eventColor}45`,
                                    },
                                ]}
                            >
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => handleOpenFolderInNotesTab(linkedFolder)}
                                    style={styles.folderHubMainRow}
                                >
                                    <View
                                        style={[
                                            styles.folderIconContainer,
                                            { backgroundColor: `${linkedFolder.color || eventColor}20` },
                                        ]}
                                    >
                                        <FolderIconRenderer
                                            name={linkedFolder.icon || 'folder'}
                                            size={22}
                                            color={linkedFolder.color || eventColor}
                                        />
                                    </View>

                                    <View style={{ flex: 1 }}>
                                        <Text
                                            style={[styles.folderHubTitle, { color: colors.textPrimary }]}
                                            numberOfLines={1}
                                        >
                                            {linkedFolder.name}
                                        </Text>
                                        <Text style={[styles.folderHubSubtitle, { color: colors.textSecondary }]}>
                                            {eventNotes.length === 1
                                                ? '1 nota en este evento'
                                                : `${eventNotes.length} notas en este evento`}
                                            {linkedSubfolders.length > 0
                                                ? ` • ${linkedSubfolders.length} subcarpeta${linkedSubfolders.length > 1 ? 's' : ''}`
                                                : ''}
                                        </Text>
                                    </View>

                                    <View style={styles.folderHubRightActions}>
                                        <View
                                            style={[
                                                styles.openFolderPill,
                                                { backgroundColor: `${linkedFolder.color || eventColor}18` },
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.openFolderPillText,
                                                    { color: linkedFolder.color || eventColor },
                                                ]}
                                            >
                                                Ver carpeta
                                            </Text>
                                            <ExternalLink size={12} color={(linkedFolder.color || eventColor) as any} />
                                        </View>

                                        {!isReadOnly && (
                                            <TouchableOpacity
                                                activeOpacity={0.7}
                                                onPress={handleUnlinkFolder}
                                                style={[
                                                    styles.unlinkIconBtn,
                                                    { backgroundColor: 'rgba(239, 68, 68, 0.12)' },
                                                ]}
                                            >
                                                <Unlink size={14} color={"#EF4444" as any} />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </TouchableOpacity>

                                {/* Subfolders preview inside linked folder */}
                                {linkedSubfolders.length > 0 && (
                                    <View style={[styles.subfoldersRow, { borderTopColor: cardBorderColor }]}>
                                        <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={{ gap: 8 }}
                                        >
                                            {linkedSubfolders.map(sub => (
                                                <TouchableOpacity
                                                    key={sub.id}
                                                    activeOpacity={0.75}
                                                    onPress={() => handleOpenFolderInNotesTab(sub)}
                                                    style={[
                                                        styles.subfolderChip,
                                                        {
                                                            backgroundColor: controlBgColor,
                                                            borderColor: cardBorderColor,
                                                        },
                                                    ]}
                                                >
                                                    <FolderIconRenderer
                                                        name={sub.icon || 'folder'}
                                                        size={13}
                                                        color={sub.color || eventColor}
                                                    />
                                                    <Text
                                                        style={[styles.subfolderChipText, { color: colors.textPrimary }]}
                                                        numberOfLines={1}
                                                    >
                                                        {sub.name}
                                                    </Text>
                                                    <ChevronRight size={12} color={colors.textMuted as any} />
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}
                            </View>
                        ) : (
                            <View style={styles.folderSetupRow}>
                                <TouchableOpacity
                                    activeOpacity={0.75}
                                    onPress={handleOpenCreateFolderModal}
                                    style={[
                                        styles.folderSetupTile,
                                        {
                                            backgroundColor: `${eventColor}12`,
                                            borderColor: `${eventColor}40`,
                                        },
                                    ]}
                                >
                                    <View style={[styles.setupTileIcon, { backgroundColor: `${eventColor}22` }]}>
                                        <FolderPlus size={18} color={eventColor as any} />
                                    </View>
                                    <Text style={[styles.setupTileTitle, { color: eventColor }]}>
                                        Crear carpeta
                                    </Text>
                                    <Text style={[styles.setupTileSub, { color: colors.textSecondary }]}>
                                        Organiza todos los apuntes de este evento
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    activeOpacity={0.75}
                                    onPress={() => setIsLinkFolderModalVisible(true)}
                                    style={[
                                        styles.folderSetupTile,
                                        {
                                            backgroundColor: cardBgColor,
                                            borderColor: cardBorderColor,
                                        },
                                    ]}
                                >
                                    <View style={[styles.setupTileIcon, { backgroundColor: controlBgColor }]}>
                                        <LinkIcon size={17} color={colors.textPrimary as any} />
                                    </View>
                                    <Text style={[styles.setupTileTitle, { color: colors.textPrimary }]}>
                                        Vincular carpeta
                                    </Text>
                                    <Text style={[styles.setupTileSub, { color: colors.textSecondary }]}>
                                        Conecta una carpeta de notas existente
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* ─── APUNTES Y NOTAS DEL EVENTO ─── */}
                    <View style={styles.sectionBlock}>
                        <View style={styles.sectionHeaderRow}>
                            <View style={styles.sectionTitleRow}>
                                <FileText size={16} color={"#3B82F6" as any} />
                                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                    Apuntes y Notas
                                </Text>
                                <View style={[styles.countBadge, { backgroundColor: controlBgColor }]}>
                                    <Text style={[styles.countBadgeText, { color: colors.textSecondary }]}>
                                        {eventNotes.length}
                                    </Text>
                                </View>
                            </View>

                            {!isReadOnly && (
                                <View style={styles.notesHeaderActions}>
                                    <TouchableOpacity
                                        activeOpacity={0.75}
                                        onPress={() => setIsLinkNoteModalVisible(true)}
                                        style={[
                                            styles.secondaryHeaderBtn,
                                            {
                                                backgroundColor: controlBgColor,
                                                borderColor: cardBorderColor,
                                            },
                                        ]}
                                    >
                                        <LinkIcon size={13} color={colors.textPrimary as any} />
                                        <Text style={[styles.secondaryHeaderBtnText, { color: colors.textPrimary }]}>
                                            Vincular
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={handleCreateNoteForEvent}
                                        style={[styles.primaryHeaderBtn, { backgroundColor: eventColor }]}
                                    >
                                        <Plus size={14} color={"#FFFFFF" as any} strokeWidth={2.5} />
                                        <Text style={styles.primaryHeaderBtnText}>Nueva nota</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        {eventNotes.length > 0 ? (
                            <View style={styles.notesList}>
                                {eventNotes.map(note => {
                                    const snippet = getNoteSnippet(note);
                                    const noteFolder = note.folder_id
                                        ? folders.find(f => f.id === note.folder_id)
                                        : null;
                                    const updatedStr = format(
                                        new Date(note.updated_at_ms || note.created_at_ms || Date.now()),
                                        "d MMM, HH:mm",
                                        { locale }
                                    );

                                    return (
                                        <TouchableOpacity
                                            key={note.id}
                                            activeOpacity={0.78}
                                            onPress={() =>
                                                router.push({
                                                    pathname: '/notes/[id]',
                                                    params: { id: note.id },
                                                })
                                            }
                                            style={[
                                                styles.noteItemCard,
                                                {
                                                    backgroundColor: cardBgColor,
                                                    borderColor: cardBorderColor,
                                                },
                                            ]}
                                        >
                                            <View style={styles.noteItemHeader}>
                                                <View style={styles.noteItemTitleRow}>
                                                    <View
                                                        style={[
                                                            styles.noteDocIcon,
                                                            { backgroundColor: 'rgba(59, 130, 246, 0.14)' },
                                                        ]}
                                                    >
                                                        <FileText size={15} color={"#3B82F6" as any} />
                                                    </View>
                                                    <Text
                                                        style={[styles.noteItemTitle, { color: colors.textPrimary }]}
                                                        numberOfLines={1}
                                                    >
                                                        {note.title || 'Sin título'}
                                                    </Text>
                                                    {note.is_pinned === 1 && (
                                                        <Pin size={12} color={accent.primary as any} />
                                                    )}
                                                </View>

                                                {!isReadOnly && (
                                                    <TouchableOpacity
                                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                        onPress={() => handleUnlinkNote(note)}
                                                        style={styles.noteUnlinkBtn}
                                                    >
                                                        <Unlink size={14} color={colors.textMuted as any} />
                                                    </TouchableOpacity>
                                                )}
                                            </View>

                                            {Boolean(snippet) && (
                                                <Text
                                                    style={[styles.noteItemSnippet, { color: colors.textSecondary }]}
                                                    numberOfLines={2}
                                                >
                                                    {snippet}
                                                </Text>
                                            )}

                                            <View style={styles.noteItemFooter}>
                                                <Text style={[styles.noteItemDate, { color: colors.textMuted }]}>
                                                    {updatedStr}
                                                </Text>

                                                {noteFolder && (
                                                    <View
                                                        style={[
                                                            styles.noteFolderMiniChip,
                                                            { backgroundColor: controlBgColor },
                                                        ]}
                                                    >
                                                        <FolderIconRenderer
                                                            name={noteFolder.icon || 'folder'}
                                                            size={10}
                                                            color={noteFolder.color || eventColor}
                                                        />
                                                        <Text
                                                            style={[
                                                                styles.noteFolderMiniText,
                                                                { color: colors.textSecondary },
                                                            ]}
                                                            numberOfLines={1}
                                                        >
                                                            {noteFolder.name}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ) : (
                            <View
                                style={[
                                    styles.emptyNotesCard,
                                    {
                                        backgroundColor: cardBgColor,
                                        borderColor: cardBorderColor,
                                    },
                                ]}
                            >
                                <View style={[styles.emptyNotesIconCircle, { backgroundColor: `${eventColor}15` }]}>
                                    <Sparkles size={22} color={eventColor as any} />
                                </View>
                                <Text style={[styles.emptyNotesTitle, { color: colors.textPrimary }]}>
                                    Sin apuntes todavía
                                </Text>
                                <Text style={[styles.emptyNotesSub, { color: colors.textSecondary }]}>
                                    Crea una nota rápida para esta sesión o vincula apuntes que ya tengas creados.
                                </Text>
                                {!isReadOnly && (
                                    <View style={styles.emptyNotesActions}>
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            onPress={handleCreateNoteForEvent}
                                            style={[styles.emptyPrimaryBtn, { backgroundColor: eventColor }]}
                                        >
                                            <Plus size={15} color={"#FFFFFF" as any} strokeWidth={2.5} />
                                            <Text style={styles.emptyPrimaryBtnText}>
                                                Crear primer apunte
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            activeOpacity={0.75}
                                            onPress={() => setIsLinkNoteModalVisible(true)}
                                            style={[
                                                styles.emptySecondaryBtn,
                                                {
                                                    backgroundColor: controlBgColor,
                                                    borderColor: cardBorderColor,
                                                },
                                            ]}
                                        >
                                            <LinkIcon size={14} color={colors.textPrimary as any} />
                                            <Text style={[styles.emptySecondaryBtnText, { color: colors.textPrimary }]}>
                                                Vincular nota
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>

                    {/* ─── RECORDATORIOS Y ALERTAS VINCULADAS ─── */}
                    {(notificationOffsets.length > 0 || linkedReminders.length > 0) && (
                        <View style={styles.sectionBlock}>
                            <View style={styles.sectionHeaderRow}>
                                <View style={styles.sectionTitleRow}>
                                    <Bell size={16} color={"#F59E0B" as any} />
                                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                        Recordatorios y Alertas
                                    </Text>
                                </View>
                            </View>

                            <View
                                style={[
                                    styles.remindersCard,
                                    {
                                        backgroundColor: cardBgColor,
                                        borderColor: cardBorderColor,
                                    },
                                ]}
                            >
                                {notificationOffsets.length > 0 && (
                                    <View style={styles.offsetsWrap}>
                                        {notificationOffsets.map((mins, idx) => (
                                            <View
                                                key={`${mins}-${idx}`}
                                                style={[
                                                    styles.offsetChip,
                                                    { backgroundColor: controlBgColor },
                                                ]}
                                            >
                                                <Bell size={12} color={"#F59E0B" as any} />
                                                <Text style={[styles.offsetChipText, { color: colors.textPrimary }]}>
                                                    {formatOffsetLabel(mins)}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {linkedReminders.map((rem, idx) => {
                                    const isDone = rem.status === 'completed';
                                    return (
                                        <View
                                            key={rem.id}
                                            style={[
                                                styles.linkedReminderRow,
                                                (idx > 0 || notificationOffsets.length > 0) && {
                                                    borderTopWidth: StyleSheet.hairlineWidth,
                                                    borderTopColor: cardBorderColor,
                                                },
                                            ]}
                                        >
                                            <TouchableOpacity
                                                onPress={() => handleToggleReminderStatus(rem)}
                                                style={[
                                                    styles.reminderCheckCircle,
                                                    {
                                                        borderColor: isDone ? '#10B981' : colors.textMuted,
                                                        backgroundColor: isDone ? '#10B981' : 'transparent',
                                                    },
                                                ]}
                                            >
                                                {isDone && <Check size={12} color={"#FFFFFF" as any} strokeWidth={3} />}
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={{ flex: 1 }}
                                                onPress={() =>
                                                    router.push({
                                                        pathname: '/reminder/[id]',
                                                        params: { id: rem.id },
                                                    })
                                                }
                                            >
                                                <Text
                                                    style={[
                                                        styles.linkedReminderTitle,
                                                        { color: colors.textPrimary },
                                                        isDone && {
                                                            textDecorationLine: 'line-through',
                                                            opacity: 0.6,
                                                        },
                                                    ]}
                                                    numberOfLines={1}
                                                >
                                                    {rem.title}
                                                </Text>
                                                <Text style={[styles.linkedReminderDate, { color: colors.textMuted }]}>
                                                    {format(new Date(rem.due_date_ms), "d MMM, HH:mm", { locale })}
                                                </Text>
                                            </TouchableOpacity>

                                            <ChevronRight size={15} color={colors.textMuted as any} />
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    )}
                </ScrollView>

                {/* ─── MODAL: CREAR CARPETA DEL EVENTO ─── */}
                <Modal
                    visible={isCreateFolderModalVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setIsCreateFolderModalVisible(false)}
                >
                    <View style={styles.modalBackdrop}>
                        <TouchableOpacity
                            style={styles.backdropDismiss}
                            activeOpacity={1}
                            onPress={() => setIsCreateFolderModalVisible(false)}
                        />
                        <VeyraSurface
                            level={2}
                            radius="xl"
                            style={[styles.dialogSheet, { backgroundColor: cardBgColor, borderColor: cardBorderColor }]}
                        >
                            <View style={styles.modalHeader}>
                                <View style={styles.sectionTitleRow}>
                                    <FolderPlus size={18} color={eventColor as any} />
                                    <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                                        Nueva carpeta del evento
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => setIsCreateFolderModalVisible(false)}>
                                    <X size={20} color={colors.textSecondary as any} />
                                </TouchableOpacity>
                            </View>

                            <Text style={[styles.dialogSubtitle, { color: colors.textSecondary }]}>
                                Todas las notas de este evento quedarán organizadas dentro de esta carpeta.
                            </Text>

                            <TextInput
                                value={newFolderName}
                                onChangeText={setNewFolderName}
                                placeholder="Nombre de la carpeta..."
                                placeholderTextColor={colors.textMuted}
                                autoFocus
                                style={[
                                    styles.dialogInput,
                                    {
                                        backgroundColor: controlBgColor,
                                        borderColor: cardBorderColor,
                                        color: colors.textPrimary,
                                    },
                                ]}
                            />

                            <View style={styles.dialogActions}>
                                <TouchableOpacity
                                    onPress={() => setIsCreateFolderModalVisible(false)}
                                    style={[styles.dialogBtn, { backgroundColor: controlBgColor }]}
                                >
                                    <Text style={[styles.dialogBtnText, { color: colors.textSecondary }]}>
                                        Cancelar
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleConfirmCreateFolderForEvent}
                                    style={[styles.dialogBtn, { backgroundColor: eventColor }]}
                                >
                                    <Text style={[styles.dialogBtnText, { color: '#FFFFFF' }]}>
                                        Crear y vincular
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </VeyraSurface>
                    </View>
                </Modal>

                {/* ─── MODAL: VINCULAR CARPETA EXISTENTE ─── */}
                <Modal
                    visible={isLinkFolderModalVisible}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setIsLinkFolderModalVisible(false)}
                >
                    <View style={styles.modalBackdrop}>
                        <TouchableOpacity
                            style={styles.backdropDismiss}
                            activeOpacity={1}
                            onPress={() => setIsLinkFolderModalVisible(false)}
                        />
                        <VeyraSurface
                            level={2}
                            radius="xl"
                            style={[
                                styles.modalSheet,
                                {
                                    backgroundColor: cardBgColor,
                                    paddingBottom: Math.max(insets.bottom, 16) + 16,
                                },
                            ]}
                        >
                            <View style={styles.modalHeader}>
                                <View style={styles.sectionTitleRow}>
                                    <FolderIcon size={18} color={eventColor as any} />
                                    <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                                        Vincular carpeta al evento
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => setIsLinkFolderModalVisible(false)}>
                                    <X size={20} color={colors.textSecondary as any} />
                                </TouchableOpacity>
                            </View>

                            <View
                                style={[
                                    styles.searchBox,
                                    { backgroundColor: controlBgColor, borderColor: cardBorderColor },
                                ]}
                            >
                                <Search size={16} color={colors.textMuted as any} />
                                <TextInput
                                    placeholder="Buscar carpeta..."
                                    placeholderTextColor={colors.textMuted}
                                    value={folderSearchQuery}
                                    onChangeText={setFolderSearchQuery}
                                    style={[styles.searchInput, { color: colors.textPrimary }]}
                                />
                            </View>

                            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                                {availableFoldersToLink.length === 0 ? (
                                    <Text style={[styles.emptyModalText, { color: colors.textMuted }]}>
                                        No hay carpetas disponibles para vincular.
                                    </Text>
                                ) : (
                                    availableFoldersToLink.map(folder => (
                                        <TouchableOpacity
                                            key={folder.id}
                                            activeOpacity={0.7}
                                            onPress={async () => {
                                                await linkFolderToEvent(event.id, folder.id);
                                                setIsLinkFolderModalVisible(false);
                                                setFolderSearchQuery('');
                                            }}
                                            style={[
                                                styles.modalRowItem,
                                                { borderBottomColor: cardBorderColor },
                                            ]}
                                        >
                                            <FolderIconRenderer
                                                name={folder.icon || 'folder'}
                                                size={18}
                                                color={folder.color || eventColor}
                                            />
                                            <Text
                                                style={[styles.modalRowText, { color: colors.textPrimary }]}
                                                numberOfLines={1}
                                            >
                                                {folder.name}
                                            </Text>
                                            <ChevronRight size={15} color={colors.textMuted as any} />
                                        </TouchableOpacity>
                                    ))
                                )}
                            </ScrollView>
                        </VeyraSurface>
                    </View>
                </Modal>

                {/* ─── MODAL: VINCULAR NOTA EXISTENTE ─── */}
                <Modal
                    visible={isLinkNoteModalVisible}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setIsLinkNoteModalVisible(false)}
                >
                    <View style={styles.modalBackdrop}>
                        <TouchableOpacity
                            style={styles.backdropDismiss}
                            activeOpacity={1}
                            onPress={() => setIsLinkNoteModalVisible(false)}
                        />
                        <VeyraSurface
                            level={2}
                            radius="xl"
                            style={[
                                styles.modalSheet,
                                {
                                    backgroundColor: cardBgColor,
                                    paddingBottom: Math.max(insets.bottom, 16) + 16,
                                },
                            ]}
                        >
                            <View style={styles.modalHeader}>
                                <View style={styles.sectionTitleRow}>
                                    <FileText size={18} color={"#3B82F6" as any} />
                                    <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                                        Vincular nota existente
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => setIsLinkNoteModalVisible(false)}>
                                    <X size={20} color={colors.textSecondary as any} />
                                </TouchableOpacity>
                            </View>

                            <View
                                style={[
                                    styles.searchBox,
                                    { backgroundColor: controlBgColor, borderColor: cardBorderColor },
                                ]}
                            >
                                <Search size={16} color={colors.textMuted as any} />
                                <TextInput
                                    placeholder="Buscar nota por título..."
                                    placeholderTextColor={colors.textMuted}
                                    value={noteSearchQuery}
                                    onChangeText={setNoteSearchQuery}
                                    style={[styles.searchInput, { color: colors.textPrimary }]}
                                />
                            </View>

                            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                                {availableNotesToLink.length === 0 ? (
                                    <Text style={[styles.emptyModalText, { color: colors.textMuted }]}>
                                        No se encontraron más notas disponibles.
                                    </Text>
                                ) : (
                                    availableNotesToLink.map(n => (
                                        <TouchableOpacity
                                            key={n.id}
                                            activeOpacity={0.7}
                                            onPress={() => handleLinkExistingNote(n)}
                                            style={[
                                                styles.modalRowItem,
                                                { borderBottomColor: cardBorderColor },
                                            ]}
                                        >
                                            <FileText size={16} color={"#3B82F6" as any} />
                                            <View style={{ flex: 1 }}>
                                                <Text
                                                    style={[styles.modalRowText, { color: colors.textPrimary }]}
                                                    numberOfLines={1}
                                                >
                                                    {n.title || 'Sin título'}
                                                </Text>
                                                {Boolean(n.preview_text) && (
                                                    <Text
                                                        style={[styles.modalRowSub, { color: colors.textMuted }]}
                                                        numberOfLines={1}
                                                    >
                                                        {n.preview_text}
                                                    </Text>
                                                )}
                                            </View>
                                            <ChevronRight size={15} color={colors.textMuted as any} />
                                        </TouchableOpacity>
                                    ))
                                )}
                            </ScrollView>
                        </VeyraSurface>
                    </View>
                </Modal>

                {/* ─── MODAL: OPCIONES DEL EVENTO ─── */}
                <Modal
                    visible={isOptionsModalVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setIsOptionsModalVisible(false)}
                >
                    <View style={styles.modalBackdrop}>
                        <TouchableOpacity
                            style={styles.backdropDismiss}
                            activeOpacity={1}
                            onPress={() => setIsOptionsModalVisible(false)}
                        />
                        <VeyraSurface
                            level={2}
                            radius="xl"
                            style={[
                                styles.modalSheet,
                                {
                                    backgroundColor: cardBgColor,
                                    paddingBottom: Math.max(insets.bottom, 16) + 12,
                                },
                            ]}
                        >
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                                    {event.title}
                                </Text>
                                <TouchableOpacity onPress={() => setIsOptionsModalVisible(false)}>
                                    <X size={20} color={colors.textSecondary as any} />
                                </TouchableOpacity>
                            </View>

                            {!isReadOnly && (
                                <TouchableOpacity
                                    style={[styles.optionRow, { borderBottomColor: cardBorderColor }]}
                                    onPress={() => {
                                        setIsOptionsModalVisible(false);
                                        handleEditEvent();
                                    }}
                                >
                                    <Edit3 size={18} color={colors.textPrimary as any} />
                                    <Text style={[styles.optionRowText, { color: colors.textPrimary }]}>
                                        Editar detalles del evento
                                    </Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity
                                style={[styles.optionRow, { borderBottomColor: cardBorderColor }]}
                                onPress={() => {
                                    setIsOptionsModalVisible(false);
                                    setIsShareModalVisible(true);
                                }}
                            >
                                <Share2 size={18} color={colors.textPrimary as any} />
                                <Text style={[styles.optionRowText, { color: colors.textPrimary }]}>
                                    Compartir evento
                                </Text>
                            </TouchableOpacity>

                            {!isReadOnly && (
                                <TouchableOpacity
                                    style={[styles.optionRow, { borderBottomColor: cardBorderColor }]}
                                    onPress={() => {
                                        setIsOptionsModalVisible(false);
                                        handleCreateNoteForEvent();
                                    }}
                                >
                                    <Plus size={18} color={"#3B82F6" as any} />
                                    <Text style={[styles.optionRowText, { color: '#3B82F6' }]}>
                                        Crear nueva nota para este evento
                                    </Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity
                                style={[styles.optionRow, { borderBottomWidth: 0 }]}
                                onPress={handleDeleteEventPress}
                            >
                                <Trash2 size={18} color={"#EF4444" as any} />
                                <Text style={[styles.optionRowText, { color: '#EF4444' }]}>
                                    Eliminar evento
                                </Text>
                            </TouchableOpacity>
                        </VeyraSurface>
                    </View>
                </Modal>

                <RecurringDeleteModal
                    visible={isRecurringDeleteModalVisible}
                    eventTitle={event.title}
                    occurrenceDate={displayDate}
                    onClose={() => setIsRecurringDeleteModalVisible(false)}
                    onConfirm={handleConfirmRecurringDelete}
                />

                <ShareModal
                    visible={isShareModalVisible}
                    onClose={() => setIsShareModalVisible(false)}
                    targetType="event"
                    targetId={event.id}
                    targetTitle={event.title}
                    isOwner={isOwner}
                />
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    editHeaderPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
    },
    editHeaderPillText: {
        fontSize: 12.5,
        fontWeight: '700',
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 20,
        gap: 18,
    },
    /* ─── Encabezado Compacto ─── */
    compactHeroSection: {
        gap: 8,
        paddingBottom: 4,
    },
    compactMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
    },
    compactColorDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 2,
    },
    compactBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 2.5,
        borderRadius: 5,
    },
    compactBadgeText: {
        fontSize: 10,
        letterSpacing: 0.2,
    },
    liveDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    compactTagPill: {
        paddingHorizontal: 7,
        paddingVertical: 2.5,
        borderRadius: 5,
    },
    compactTagText: {
        fontSize: 10,
        fontWeight: '500',
    },
    compactTitle: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.3,
        lineHeight: 25,
    },
    compactDetailsBar: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 10,
        paddingVertical: 6.5,
        gap: 6,
    },
    compactDateText: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: -0.1,
    },
    compactDurationText: {
        fontSize: 11,
    },
    compactLocationBar: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 10,
        paddingVertical: 6.5,
        gap: 6,
    },
    compactLocationText: {
        fontSize: 12,
        fontWeight: '500',
        flex: 1,
    },
    compactLocationLinkText: {
        textDecorationLine: 'underline',
    },
    compactDescriptionBox: {
        borderLeftWidth: 2,
        paddingLeft: 8,
        paddingVertical: 1,
        marginTop: 2,
    },
    compactDescriptionText: {
        fontSize: 12.5,
        lineHeight: 17,
    },
    sectionBlock: {
        gap: 10,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionTitle: {
        fontSize: 15.5,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    sectionActionLink: {
        fontSize: 13,
        fontWeight: '600',
    },
    countBadge: {
        paddingHorizontal: 7,
        paddingVertical: 1.5,
        borderRadius: 999,
    },
    countBadgeText: {
        fontSize: 11.5,
        fontWeight: '700',
    },
    folderHubCard: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    folderHubMainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        gap: 12,
    },
    folderIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    folderHubTitle: {
        fontSize: 15.5,
        fontWeight: '700',
    },
    folderHubSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    folderHubRightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    openFolderPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    openFolderPillText: {
        fontSize: 12,
        fontWeight: '700',
    },
    unlinkIconBtn: {
        width: 30,
        height: 30,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    subfoldersRow: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    subfolderChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
    },
    subfolderChipText: {
        fontSize: 12,
        fontWeight: '600',
        maxWidth: 140,
    },
    folderSetupRow: {
        flexDirection: 'row',
        gap: 10,
    },
    folderSetupTile: {
        flex: 1,
        padding: 14,
        borderRadius: 15,
        borderWidth: 1,
        gap: 6,
    },
    setupTileIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    setupTileTitle: {
        fontSize: 13.5,
        fontWeight: '700',
    },
    setupTileSub: {
        fontSize: 11.5,
        lineHeight: 15,
    },
    notesHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    secondaryHeaderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
    },
    secondaryHeaderBtnText: {
        fontSize: 12,
        fontWeight: '600',
    },
    primaryHeaderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 11,
        paddingVertical: 6.5,
        borderRadius: 8,
    },
    primaryHeaderBtnText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    notesList: {
        gap: 10,
    },
    noteItemCard: {
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        gap: 8,
    },
    noteItemHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    noteItemTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    noteDocIcon: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noteItemTitle: {
        fontSize: 15,
        fontWeight: '700',
        flexShrink: 1,
    },
    noteUnlinkBtn: {
        padding: 4,
    },
    noteItemSnippet: {
        fontSize: 13,
        lineHeight: 18,
    },
    noteItemFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 2,
    },
    noteItemDate: {
        fontSize: 11.5,
        fontWeight: '500',
    },
    noteFolderMiniChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 2.5,
        borderRadius: 6,
        maxWidth: 150,
    },
    noteFolderMiniText: {
        fontSize: 11,
        fontWeight: '500',
    },
    emptyNotesCard: {
        padding: 22,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        gap: 8,
    },
    emptyNotesIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    emptyNotesTitle: {
        fontSize: 15.5,
        fontWeight: '700',
    },
    emptyNotesSub: {
        fontSize: 12.5,
        textAlign: 'center',
        lineHeight: 18,
        maxWidth: 280,
    },
    emptyNotesActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 8,
    },
    emptyPrimaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 10,
    },
    emptyPrimaryBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    emptySecondaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 13,
        paddingVertical: 9,
        borderRadius: 10,
        borderWidth: 1,
    },
    emptySecondaryBtnText: {
        fontSize: 13,
        fontWeight: '600',
    },
    remindersCard: {
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden',
    },
    offsetsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        padding: 12,
    },
    offsetChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    offsetChipText: {
        fontSize: 12,
        fontWeight: '600',
    },
    linkedReminderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    reminderCheckCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 1.8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    linkedReminderTitle: {
        fontSize: 14,
        fontWeight: '600',
    },
    linkedReminderDate: {
        fontSize: 11.5,
        marginTop: 2,
    },
    notFoundContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 10,
    },
    notFoundTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    notFoundSub: {
        fontSize: 13.5,
        textAlign: 'center',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
    },
    backdropDismiss: {
        flex: 1,
    },
    modalSheet: {
        padding: 18,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        gap: 14,
    },
    dialogSheet: {
        marginHorizontal: 20,
        marginBottom: 'auto',
        marginTop: 'auto',
        padding: 20,
        borderRadius: 20,
        borderWidth: 1,
        gap: 14,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    modalTitle: {
        fontSize: 16.5,
        fontWeight: '700',
        flexShrink: 1,
    },
    dialogSubtitle: {
        fontSize: 13,
        lineHeight: 18,
    },
    dialogInput: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 11,
        fontSize: 15,
    },
    dialogActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 4,
    },
    dialogBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
    },
    dialogBtnText: {
        fontSize: 13.5,
        fontWeight: '700',
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 12,
        borderWidth: 1,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        paddingVertical: 0,
    },
    emptyModalText: {
        textAlign: 'center',
        paddingVertical: 24,
        fontSize: 13.5,
    },
    modalRowItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    modalRowText: {
        fontSize: 14.5,
        fontWeight: '600',
    },
    modalRowSub: {
        fontSize: 12,
        marginTop: 2,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    optionRowText: {
        fontSize: 15,
        fontWeight: '600',
    },
});
