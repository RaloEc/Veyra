import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    StyleSheet,
    ScrollView,
    Alert,
    Modal,
    BackHandler,
    useWindowDimensions,
    Keyboard,
    Platform,
} from 'react-native';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    interpolate,
    Extrapolation,
    Easing as ReanimatedEasing,
    runOnJS,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useScreenInsets } from '../../src/hooks/useScreenInsets';
import {
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Sliders,
    Trash2,
    Calendar as CalendarIcon,
    Clock,
    MapPin,
    Repeat,
    Bell,
    Palette,
    FileText,
    Check,
    Plus,
    X,
    Search,
    Link,
    Unlink,
    Notebook,
    Share2,
    Tag as TagIcon,
    Sun,
    ShieldAlert,
    AlertCircle,
    Folder as FolderIcon,
    FolderPlus,
} from '@tamagui/lucide-icons';
import { format, isToday, isTomorrow } from 'date-fns';
import { es } from 'date-fns/locale';

import { useStore } from '../../src/store/useStore';
import { useEventsStore } from '../../src/store/useEventsStore';
import { useNotesStore } from '../../src/store/useNotesStore';
import { useFoldersStore } from '../../src/store/useFoldersStore';
import { FolderIconRenderer } from '../../src/components/notes/FolderIconRenderer';
import { useVeyraTheme } from '../../src/theme/useVeyraTheme';
import { VeyraSurface } from '../../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../../src/components/ui/VeyraIconButton';
import { DatePickerModal, TimePickerModal } from '../../src/components/ui';
import { RecurringDeleteModal } from '../../src/components/events/RecurringDeleteModal';
import { ShareModal } from '../../src/components/collaboration/ShareModal';
import { CalendarEvent, Reminder, ControlLevel } from '../../src/types/db';
import { looksLikeBirthday } from '../../src/utils/birthdayDetector';
import { getDeviceTimezone, makeZonedDateMs } from '../../src/services/recurrence/recurrenceEngine';
import { ReminderService } from '../../src/services/reminderService';
import { parseInitialDate } from '../../src/hooks/useCreateReminder';

const EVENT_COLORS = [
    { label: 'Azul', color: '#3B82F6' },
    { label: 'Morado', color: '#8B5CF6' },
    { label: 'Rosa', color: '#EC4899' },
    { label: 'Ámbar', color: '#F59E0B' },
    { label: 'Verde', color: '#10B981' },
    { label: 'Rojo', color: '#EF4444' },
    { label: 'Cian', color: '#06B6D4' },
    { label: 'Índigo', color: '#6366F1' },
];

const CONTROL_LEVELS: { key: ControlLevel; label: string; shortDesc: string; icon: any; color: string; desc: string }[] = [
    {
        key: 'normal',
        label: 'Normal',
        shortDesc: 'Estándar',
        icon: Bell,
        color: '#64748B',
        desc: 'Notificación estándar. Ideal para clases, reuniones y eventos habituales.',
    },
    {
        key: 'strict',
        label: 'Estricto',
        shortDesc: 'Insistente',
        icon: AlertCircle,
        color: '#F59E0B',
        desc: 'Alarma persistente. Te avisará insistentemente antes del evento.',
    },
    {
        key: 'critical',
        label: 'Crítico',
        shortDesc: 'Alarma máxima',
        icon: ShieldAlert,
        color: '#EF4444',
        desc: 'Alarma con sonido continuo hasta que confirmes tu asistencia.',
    },
];

const RECURRENCE_TYPES: { key: string; label: string; desc: string }[] = [
    { key: 'none', label: 'No repetir', desc: 'Evento único en la fecha seleccionada' },
    { key: 'daily', label: 'Diario', desc: 'Se repite todos los días' },
    { key: 'weekly', label: 'Semanal', desc: 'Elige qué días de la semana se repite' },
    { key: 'weekdays', label: 'Lun a Vie', desc: 'Todos los días hábiles de lunes a viernes' },
    { key: 'monthly', label: 'Mensual', desc: 'El mismo día de cada mes' },
    { key: 'yearly', label: 'Anual', desc: 'Cada año en esta fecha (ej. cumpleaños)' },
];

const AVAILABLE_OFFSETS: { label: string; value: number }[] = [
    { label: 'A la hora del evento', value: 0 },
    { label: '5 minutos antes', value: 5 },
    { label: '10 minutos antes', value: 10 },
    { label: '15 minutos antes', value: 15 },
    { label: '30 minutos antes', value: 30 },
    { label: '1 hora antes', value: 60 },
    { label: '2 horas antes', value: 120 },
    { label: '1 día antes', value: 1440 },
    { label: '2 días antes', value: 2880 },
    { label: '1 semana antes', value: 10080 },
];

const getOffsetLabel = (minutes: number): string => {
    const found = AVAILABLE_OFFSETS.find(o => o.value === minutes);
    if (found) return found.label;
    if (minutes === 0) return 'A la hora del evento';
    if (minutes >= 10080 && minutes % 10080 === 0) {
        const weeks = minutes / 10080;
        return `${weeks} ${weeks === 1 ? 'semana' : 'semanas'} antes`;
    }
    if (minutes >= 1440 && minutes % 1440 === 0) {
        const days = minutes / 1440;
        return `${days} ${days === 1 ? 'día' : 'días'} antes`;
    }
    if (minutes >= 60 && minutes % 60 === 0) {
        const hours = minutes / 60;
        return `${hours} ${hours === 1 ? 'hora' : 'horas'} antes`;
    }
    return `${minutes} minutos antes`;
};

const WEEKDAYS = [
    { label: 'L', name: 'Lun', day: 1 },
    { label: 'M', name: 'Mar', day: 2 },
    { label: 'M', name: 'Mié', day: 3 },
    { label: 'J', name: 'Jue', day: 4 },
    { label: 'V', name: 'Vie', day: 5 },
    { label: 'S', name: 'Sáb', day: 6 },
    { label: 'D', name: 'Dom', day: 0 },
];

const PRESET_TAGS = ['clase', 'universidad', 'trabajo', 'personal', 'salud', 'gym'];

export default function CreateOrEditEventScreen() {
    const router = useRouter();
    const { insets, bottom: bottomInset } = useScreenInsets();
    const { id, initialDate, occurrenceDate, tag, isBirthday, title: initialTitle, fromMorph, cardHeight } = useLocalSearchParams<{
        id?: string;
        initialDate?: string;
        occurrenceDate?: string;
        tag?: string;
        dayOfWeek?: string;
        isBirthday?: string;
        title?: string;
        fromMorph?: string;
        cardHeight?: string;
    }>();
    const { colors, accent, isDark, isAmoled } = useVeyraTheme();

    const screenBgColor = isAmoled ? '#000000' : (isDark ? '#121212' : '#F8FAFC');
    const cardBgColor = isAmoled ? '#161616' : (isDark ? '#22242B' : '#FFFFFF');
    const controlBgColor = isAmoled ? '#222222' : (isDark ? '#2D3039' : '#F1F5F9');
    const cardBorderColor = isAmoled ? 'rgba(255, 255, 255, 0.14)' : (isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)');
    const controlBorderColor = isAmoled ? 'rgba(255, 255, 255, 0.18)' : (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)');

    const { events, createEvent, updateEvent, deleteEvent, deleteEventOccurrence } = useEventsStore();
    const { notes, addNote } = useNotesStore();
    const { folders, createFolder } = useFoldersStore();

    const isEditing = Boolean(id && id !== 'create');
    const existingEventFromStore = isEditing ? events.find(e => e.id === id) : null;
    const [fetchedEvent, setFetchedEvent] = useState<CalendarEvent | null>(null);
    const existingEvent = existingEventFromStore || fetchedEvent;

    // Estado de formulario
    const [title, setTitle] = useState(existingEvent?.title || initialTitle || '');
    const [description, setDescription] = useState(existingEvent?.description || '');
    const [location, setLocation] = useState(existingEvent?.location || '');
    const [selectedColor, setSelectedColor] = useState(
        existingEvent?.color || (isBirthday === 'true' ? '#EC4899' : EVENT_COLORS[0].color)
    );
    const [isAllDay, setIsAllDay] = useState<boolean>(() => {
        if (isBirthday === 'true') return true;
        if (existingEvent?.is_all_day !== undefined) return Boolean(existingEvent.is_all_day);
        return false;
    });
    const [isBirthdayLike, setIsBirthdayLike] = useState<boolean>(() => {
        if (isBirthday === 'true') return true;
        if (existingEvent?.is_birthday_like !== undefined) return Boolean(existingEvent.is_birthday_like);
        return false;
    });
    const [extendedRecurrenceType, setExtendedRecurrenceType] = useState<string>(() => {
        if (isBirthday === 'true') return 'yearly';
        if (existingEvent?.recurrence_rule) {
            try {
                return JSON.parse(existingEvent.recurrence_rule).type || 'none';
            } catch { }
        }
        if (existingEvent?.repeat_rule) {
            try {
                return JSON.parse(existingEvent.repeat_rule).type || 'none';
            } catch { }
        }
        return 'none';
    });
    const [feb29Policy, setFeb29Policy] = useState<'feb28' | 'mar01' | 'skip'>('feb28');
    const [linkedReminders, setLinkedReminders] = useState<Reminder[]>([]);
    const [controlLevel, setControlLevel] = useState<ControlLevel>('normal');
    const [isRecurringDeleteModalVisible, setIsRecurringDeleteModalVisible] = useState(false);
    const [isShareModalVisible, setIsShareModalVisible] = useState(false);

    // Carga de fallback desde SQLite o Supabase si el evento no está en el store en memoria
    useEffect(() => {
        if (!isEditing || !id || existingEventFromStore) return;

        let isMounted = true;
        (async () => {
            try {
                const { getDB } = await import('../../src/db');
                const db = await getDB();
                const local = await db.getFirstAsync<CalendarEvent>('SELECT * FROM events WHERE id = ?', [id]);
                if (local && isMounted) {
                    setFetchedEvent(local);
                    return;
                }

                const { supabase } = await import('../../src/lib/supabase');
                const { data: remote } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
                if (remote && isMounted) {
                    const { SyncService } = await import('../../src/services/syncService');
                    const userId = useStore.getState().session?.user?.id || 'local_user';
                    await SyncService.upsertLocalEvent(db, remote, userId);
                    setFetchedEvent({
                        id: remote.id,
                        user_id: remote.user_id,
                        title: remote.title,
                        description: remote.description,
                        start_time_ms: remote.start_time_ms,
                        end_time_ms: remote.end_time_ms,
                        repeat_rule: remote.repeat_rule,
                        location: remote.location,
                        color: remote.color,
                        notification_offset_min: remote.notification_offset_min,
                        notification_offsets: remote.notification_offsets,
                        notification_ids: remote.notification_ids,
                        note_id: remote.note_id,
                        tags: remote.tags,
                        created_at_ms: remote.created_at_ms,
                        updated_at_ms: remote.updated_at_ms,
                        last_modified_ms: remote.last_modified_ms,
                        deleted: remote.deleted,
                        is_shared: 1,
                    });
                }
            } catch (err) {
                console.warn('[CreateEvent] Error buscando evento por ID:', err);
            }
        })();

        return () => {
            isMounted = false;
        };
    }, [id, isEditing, existingEventFromStore]);

    // Cargar recordatorios asociados a este evento
    useEffect(() => {
        if (!isEditing || !existingEvent?.id) return;
        (async () => {
            try {
                const { getDB } = await import('../../src/db');
                const db = await getDB();
                const rems = await db.getAllAsync<Reminder>(
                    'SELECT * FROM reminders WHERE event_id = ? AND deleted = 0 ORDER BY due_date_ms ASC',
                    [existingEvent.id]
                );
                setLinkedReminders(rems || []);
            } catch (err) {
                console.warn('[CreateEvent] Error cargando recordatorios vinculados:', err);
            }
        })();
    }, [isEditing, existingEvent?.id]);

    // Fechas y horas
    const parsedOccurrenceDate = useMemo(() => (occurrenceDate ? new Date(occurrenceDate) : null), [occurrenceDate]);
    const initialBaseDate = parsedOccurrenceDate || (initialDate ? parseInitialDate(initialDate) : new Date());
    const [eventDate, setEventDate] = useState<Date>(
        parsedOccurrenceDate || (existingEvent ? new Date(existingEvent.start_time_ms) : initialBaseDate)
    );
    const [startTime, setStartTime] = useState<Date>(() => {
        if (existingEvent) return new Date(existingEvent.start_time_ms);
        const d = new Date(initialBaseDate);
        d.setMinutes(0, 0, 0);
        d.setHours(d.getHours() + 1);
        return d;
    });
    const [endTime, setEndTime] = useState<Date>(() => {
        if (existingEvent) return new Date(existingEvent.end_time_ms);
        const d = new Date(initialBaseDate);
        d.setMinutes(0, 0, 0);
        d.setHours(d.getHours() + 2);
        return d;
    });

    // Recurrencia
    const [isRecurring, setIsRecurring] = useState(() => {
        if (!existingEvent?.repeat_rule && !existingEvent?.recurrence_rule) return isBirthday === 'true';
        try {
            const raw = existingEvent?.recurrence_rule || existingEvent?.repeat_rule;
            const parsed = raw ? JSON.parse(raw) : null;
            return Boolean(parsed?.type && parsed.type !== 'none');
        } catch {
            return false;
        }
    });
    const [selectedDays, setSelectedDays] = useState<number[]>(() => {
        if (!existingEvent?.repeat_rule && !existingEvent?.recurrence_rule) return [eventDate.getDay()];
        try {
            const raw = existingEvent?.recurrence_rule || existingEvent?.repeat_rule;
            const parsed = raw ? JSON.parse(raw) : null;
            const days = parsed?.by_weekday || parsed?.days;
            return Array.isArray(days) && days.length > 0 ? days : [eventDate.getDay()];
        } catch {
            return [eventDate.getDay()];
        }
    });

    // Sincronizar el formulario cuando el evento esté disponible
    useEffect(() => {
        if (!existingEvent) return;
        setTitle(existingEvent.title || '');
        setDescription(existingEvent.description || '');
        setLocation(existingEvent.location || '');
        setSelectedColor(existingEvent.color || EVENT_COLORS[0].color);
        if (existingEvent.note_id) setLinkedNoteId(existingEvent.note_id);
        if (existingEvent.folder_id) setLinkedFolderId(existingEvent.folder_id);
        if (existingEvent.tags) {
            try {
                const parsed = JSON.parse(existingEvent.tags);
                if (Array.isArray(parsed)) setTags(parsed);
            } catch { }
        }
        if (existingEvent.notification_offsets) {
            try {
                const parsed = JSON.parse(existingEvent.notification_offsets);
                if (Array.isArray(parsed)) setSelectedOffsets(parsed.sort((a, b) => a - b));
            } catch { }
        } else if (existingEvent.notification_offset_min !== undefined && existingEvent.notification_offset_min !== null) {
            setSelectedOffsets([existingEvent.notification_offset_min]);
        }
        const evStart = new Date(existingEvent.start_time_ms);
        const evEnd = new Date(existingEvent.end_time_ms || existingEvent.start_time_ms);
        setEventDate(evStart);
        setStartTime(evStart);
        setEndTime(evEnd);
        if (existingEvent.is_all_day !== undefined) {
            setIsAllDay(Boolean(existingEvent.is_all_day));
        }
        if (existingEvent.is_birthday_like !== undefined) {
            setIsBirthdayLike(Boolean(existingEvent.is_birthday_like));
        }
        const ruleRaw = existingEvent.recurrence_rule || existingEvent.repeat_rule;
        if (ruleRaw) {
            try {
                const parsed = JSON.parse(ruleRaw);
                const rType = parsed.type || 'none';
                setExtendedRecurrenceType(rType);
                setIsRecurring(rType !== 'none');
                if (Array.isArray(parsed.by_weekday || parsed.days)) setSelectedDays(parsed.by_weekday || parsed.days);
                if (parsed.feb29_policy) setFeb29Policy(parsed.feb29_policy);
            } catch { }
        }
    }, [existingEvent]);

    // Tags / Etiquetas
    const [tags, setTags] = useState<string[]>(() => {
        const cleanTag = tag ? tag.toLowerCase().replace(/^#/, '') : null;
        if (!existingEvent?.tags) {
            return cleanTag ? [cleanTag] : [];
        }
        try {
            const parsed = JSON.parse(existingEvent.tags);
            const list = Array.isArray(parsed) ? parsed : [];
            if (cleanTag && !list.includes(cleanTag)) list.push(cleanTag);
            return list;
        } catch {
            return cleanTag ? [cleanTag] : [];
        }
    });
    const [customTagInput, setCustomTagInput] = useState('');

    const handleAddTag = (tagToAdd: string) => {
        const cleaned = tagToAdd.trim().toLowerCase().replace(/^#/, '');
        if (cleaned && !tags.includes(cleaned)) {
            setTags(prev => [...prev, cleaned]);
        }
        setCustomTagInput('');
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(prev => prev.filter(t => t !== tagToRemove));
    };

    // Múltiples avisos preventivos en pila
    const [selectedOffsets, setSelectedOffsets] = useState<number[]>(() => {
        if (existingEvent?.notification_offsets) {
            try {
                const parsed = JSON.parse(existingEvent.notification_offsets);
                if (Array.isArray(parsed)) return parsed.sort((a, b) => a - b);
            } catch { }
        }
        if (existingEvent?.notification_offset_min !== undefined && existingEvent?.notification_offset_min !== null) {
            return [existingEvent.notification_offset_min];
        }
        if (existingEvent) {
            return [];
        }
        return [15];
    });

    const [isAddAvisoModalOpen, setIsAddAvisoModalOpen] = useState(false);

    const handleAddOffset = (value: number) => {
        if (!selectedOffsets.includes(value)) {
            setSelectedOffsets([...selectedOffsets, value].sort((a, b) => a - b));
        }
    };

    const handleRemoveOffset = (value: number) => {
        setSelectedOffsets(selectedOffsets.filter(v => v !== value));
    };

    // Enlace a nota y carpeta
    const [linkedNoteId, setLinkedNoteId] = useState<string | null>(existingEvent?.note_id || null);
    const [linkedFolderId, setLinkedFolderId] = useState<string | null>(existingEvent?.folder_id || null);
    const [isLinkNoteModalVisible, setIsLinkNoteModalVisible] = useState(false);
    const [isLinkFolderModalVisible, setIsLinkFolderModalVisible] = useState(false);
    const [noteSearchQuery, setNoteSearchQuery] = useState('');
    const [folderSearchQuery, setFolderSearchQuery] = useState('');

    // Pickers
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false);

    const linkedNote = useMemo(() => {
        if (!linkedNoteId) return null;
        return notes.find(n => n.id === linkedNoteId) || null;
    }, [linkedNoteId, notes]);

    const linkedFolder = useMemo(() => {
        if (!linkedFolderId) return null;
        return folders.find(f => f.id === linkedFolderId && !f.deleted) || null;
    }, [linkedFolderId, folders]);

    const filteredNotes = useMemo(() => {
        if (!noteSearchQuery.trim()) return notes;
        const q = noteSearchQuery.toLowerCase();
        return notes.filter(n => (n.title || 'Sin título').toLowerCase().includes(q));
    }, [notes, noteSearchQuery]);

    const filteredFolders = useMemo(() => {
        const active = folders.filter(f => !f.deleted);
        if (!folderSearchQuery.trim()) return active;
        const q = folderSearchQuery.toLowerCase();
        return active.filter(f => f.name.toLowerCase().includes(q));
    }, [folders, folderSearchQuery]);

    const toggleDay = (dayIndex: number) => {
        if (selectedDays.includes(dayIndex)) {
            if (selectedDays.length === 1) return;
            setSelectedDays(selectedDays.filter(d => d !== dayIndex));
        } else {
            setSelectedDays([...selectedDays, dayIndex].sort());
        }
    };

    const handleSelectRecurrenceType = (typeKey: string) => {
        setExtendedRecurrenceType(typeKey);
        setIsRecurring(typeKey !== 'none');
        if (typeKey === 'weekly' && selectedDays.length === 0) {
            setSelectedDays([eventDate.getDay()]);
        }
    };

    const handleCreateNewNoteForEvent = async () => {
        const defaultTitle = title.trim()
            ? `${title.trim()} - ${format(eventDate, 'dd/MM/yyyy')}`
            : `Apuntes - ${format(eventDate, 'dd/MM/yyyy')}`;
        const newNote = await addNote(defaultTitle, '', undefined, undefined, false, linkedFolderId);
        if (newNote?.id) {
            setLinkedNoteId(newNote.id);
            Alert.alert('Nota Creada', `Se ha creado y vinculado la nota "${defaultTitle}".`);
        }
    };

    const handleCreateNewFolderForEvent = async () => {
        const defaultFolderName = title.trim() || `Carpeta - ${format(eventDate, 'dd/MM/yyyy')}`;
        const newFolder = await createFolder(defaultFolderName, 'folder', selectedColor, false, null);
        if (newFolder?.id) {
            setLinkedFolderId(newFolder.id);
            Alert.alert('Carpeta Creada', `Se ha creado y vinculado la carpeta "${defaultFolderName}".`);
        }
    };

    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    const activeAdvancedCount = useMemo(() => {
        let count = 0;
        if (extendedRecurrenceType && extendedRecurrenceType !== 'none') count++;
        if (selectedOffsets.length > 0) count++;
        if (tags.length > 0) count++;
        if (linkedNoteId || linkedFolderId) count++;
        if (description && description.trim().length > 0) count++;
        if (controlLevel !== 'normal') count++;
        return count;
    }, [extendedRecurrenceType, selectedOffsets, tags, linkedNoteId, linkedFolderId, description, controlLevel]);

    useEffect(() => {
        if (existingEvent) {
            const hasAdvanced =
                (existingEvent.recurrence_rule && existingEvent.recurrence_rule !== 'none') ||
                (existingEvent.repeat_rule && existingEvent.repeat_rule !== 'none') ||
                Boolean(existingEvent.tags && existingEvent.tags !== '[]') ||
                Boolean(existingEvent.note_id) ||
                Boolean(existingEvent.folder_id) ||
                Boolean(existingEvent.description && existingEvent.description.trim().length > 0) ||
                Boolean(existingEvent.notification_offsets && existingEvent.notification_offsets !== '[]') ||
                Boolean(existingEvent.notification_offset_min);
            if (hasAdvanced) {
                setIsAdvancedOpen(true);
            }
        }
    }, [existingEvent]);

    const handleSave = async () => {
        if (!title.trim()) {
            Alert.alert('Título requerido', 'Por favor ingresa un título para el evento.');
            return;
        }

        const tz = getDeviceTimezone();
        let startTimeMs: number;
        let endTimeMs: number;
        let allDayDate: string | null = null;

        if (isAllDay) {
            allDayDate = format(eventDate, 'yyyy-MM-dd');
            const [y, m, d] = allDayDate.split('-').map(Number);
            startTimeMs = makeZonedDateMs(y, m, d, 0, 0, 0, tz);
            endTimeMs = makeZonedDateMs(y, m, d, 23, 59, 59, tz) + 999;
        } else {
            const start = new Date(eventDate);
            start.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);

            const end = new Date(eventDate);
            end.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);

            if (end.getTime() <= start.getTime()) {
                Alert.alert('Horario no válido', 'La hora de finalización debe ser posterior a la hora de inicio.');
                return;
            }
            startTimeMs = start.getTime();
            endTimeMs = end.getTime();
        }

        let recurrenceRuleObj: any = null;
        if (extendedRecurrenceType === 'daily') {
            recurrenceRuleObj = { type: 'daily', interval: 1 };
        } else if (extendedRecurrenceType === 'weekly') {
            recurrenceRuleObj = { type: 'weekly', interval: 1, by_weekday: selectedDays };
        } else if (extendedRecurrenceType === 'weekdays') {
            recurrenceRuleObj = { type: 'weekdays' };
        } else if (extendedRecurrenceType === 'monthly') {
            recurrenceRuleObj = { type: 'monthly', interval: 1, by_monthday: [eventDate.getDate()] };
        } else if (extendedRecurrenceType === 'yearly') {
            recurrenceRuleObj = {
                type: 'yearly',
                interval: 1,
                by_month: eventDate.getMonth() + 1,
                by_monthday: eventDate.getDate(),
                feb29_policy: feb29Policy,
            };
        }

        const recurrenceRuleJson = recurrenceRuleObj ? JSON.stringify(recurrenceRuleObj) : undefined;
        const legacyRepeatRule =
            recurrenceRuleObj && extendedRecurrenceType === 'weekly'
                ? JSON.stringify({ type: 'weekly', days: selectedDays })
                : recurrenceRuleJson;

        const notificationOffsetsJson = JSON.stringify(selectedOffsets);
        const primaryOffset = selectedOffsets.length > 0 ? selectedOffsets[0] : null;

        const finalTags = [...tags];
        const combinedText = `${title} ${description}`.toLowerCase();
        if (/#clase\b/i.test(combinedText) && !finalTags.includes('clase')) {
            finalTags.push('clase');
        }
        const tagsJson = finalTags.length > 0 ? JSON.stringify(finalTags) : undefined;

        const isBirthdayDetected = isBirthdayLike || looksLikeBirthday(title);

        if (isEditing && existingEvent) {
            await updateEvent(
                existingEvent.id,
                {
                    title: title.trim(),
                    description: description.trim() || undefined,
                    location: location.trim() || undefined,
                    color: selectedColor,
                    start_time_ms: startTimeMs,
                    end_time_ms: endTimeMs,
                    is_all_day: isAllDay ? 1 : 0,
                    all_day_date: isAllDay ? allDayDate : null,
                    timezone: tz,
                    repeat_rule: legacyRepeatRule,
                    recurrence_rule: recurrenceRuleJson,
                    is_birthday_like: isBirthdayDetected ? 1 : 0,
                    notification_offset_min: primaryOffset ?? undefined,
                    notification_offsets: notificationOffsetsJson,
                    note_id: linkedNoteId,
                    folder_id: linkedFolderId,
                    tags: tagsJson,
                },
                finalTags
            );
        } else {
            const created = await createEvent({
                title: title.trim(),
                description: description.trim() || undefined,
                location: location.trim() || undefined,
                color: selectedColor,
                startTimeMs,
                endTimeMs,
                isAllDay,
                allDayDate,
                timezone: tz,
                repeatRule: legacyRepeatRule,
                recurrenceRule: recurrenceRuleJson,
                isBirthdayLike: isBirthdayDetected,
                notificationOffsetMin: primaryOffset ?? undefined,
                notificationOffsets: notificationOffsetsJson,
                noteId: linkedNoteId,
                folderId: linkedFolderId,
                tags: tagsJson,
                tagNames: finalTags,
            });

            if (created?.id && linkedReminders.length > 0) {
                for (const rem of linkedReminders) {
                    if (!rem.id || rem.id.startsWith('temp_')) {
                        const dueDate = created.start_time_ms + (rem.offset_minutes || 0) * 60000;
                        await ReminderService.createReminder(
                            rem.title,
                            dueDate,
                            rem.control_level,
                            undefined,
                            rem.description,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            created.id,
                            rem.offset_minutes
                        );
                    }
                }
            }
        }

        Keyboard.dismiss();
        router.back();
    };

    const handleDelete = () => {
        if (!existingEvent) return;
        if (isRecurring || extendedRecurrenceType !== 'none') {
            setIsRecurringDeleteModalVisible(true);
        } else {
            Alert.alert('Eliminar Evento', '¿Estás seguro de que deseas eliminar este evento?', [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteEvent(existingEvent.id);
                        handleBack();
                    },
                },
            ]);
        }
    };

    const handleConfirmRecurringDelete = async (mode: 'this' | 'following' | 'all') => {
        setIsRecurringDeleteModalVisible(false);
        if (!existingEvent) return;
        await deleteEventOccurrence(existingEvent.id, eventDate, mode);
        handleBack();
    };

    const { height: screenHeight, width: screenWidth } = useWindowDimensions();
    const layoutHeight = useSharedValue(screenHeight);
    const language = useStore(state => state.language);
    const bottomOffset = insets.bottom > 0 ? insets.bottom + 6 : 14;
    const isFromMorph = fromMorph === 'true';
    const initialCardH = isFromMorph && cardHeight ? Math.max(120, Number(cardHeight)) : (58 + bottomOffset);
    const morphedDockWidth = Math.min(screenWidth - 20, 440);
    const dockMarginHorizontal = Math.max(10, Math.round((screenWidth - morphedDockWidth) / 2));

    const morphProgress = useSharedValue(0);
    const isExiting = useRef(false);

    useEffect(() => {
        morphProgress.value = withTiming(1, {
            duration: 280,
            easing: ReanimatedEasing.bezier(0.16, 1, 0.3, 1),
        });
    }, []);

    const backdropAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(morphProgress.value, [0, 0.8], [0, isDark ? 0.35 : 0.18], Extrapolation.CLAMP),
    }));

    const containerAnimatedStyle = useAnimatedStyle(() => {
        const totalHeight = layoutHeight.value > 0 ? layoutHeight.value : screenHeight;
        const initialH = initialCardH;

        // Comienza exactamente en la coordenada Y de la tarjeta "Crear con Veyra"
        const translateY = interpolate(
            morphProgress.value,
            [0, 1],
            [totalHeight - (initialH + bottomOffset), 0],
            Extrapolation.CLAMP
        );

        // Se expande desde la altura de la tarjeta dock hasta la pantalla completa
        const height = interpolate(
            morphProgress.value,
            [0, 1],
            [initialH, totalHeight],
            Extrapolation.CLAMP
        );

        // Se expande horizontalmente hasta cubrir los bordes de la pantalla
        const marginHorizontal = interpolate(
            morphProgress.value,
            [0, 0.75, 1],
            [dockMarginHorizontal, 4, 0],
            Extrapolation.CLAMP
        );

        // Las 4 esquinas redondeadas pasan de 28px (dock flotante) a 0px (pantalla completa)
        const borderRadius = interpolate(
            morphProgress.value,
            [0, 0.75, 1],
            [28, 14, 0],
            Extrapolation.CLAMP
        );

        return {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height,
            transform: [{ translateY }],
            marginHorizontal,
            borderRadius,
            overflow: 'hidden',
        };
    });

    const safePaddingTopStyle = useAnimatedStyle(() => {
        const pad = interpolate(
            morphProgress.value,
            [0.35, 1],
            [Platform.OS === 'ios' ? 8 : 10, insets.top],
            Extrapolation.CLAMP
        );
        return {
            paddingTop: pad,
        };
    });

    const formAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(morphProgress.value, [0.15, 0.7], [0, 1], Extrapolation.CLAMP),
        transform: [
            {
                translateY: interpolate(morphProgress.value, [0.15, 1], [28, 0], Extrapolation.CLAMP),
            },
        ],
    }));

    const hasNavigated = useRef(false);

    const navigateBack = () => {
        if (hasNavigated.current) return;
        hasNavigated.current = true;
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/');
        }
    };

    const handleBack = () => {
        if (isExiting.current) return;
        isExiting.current = true;
        Keyboard.dismiss();
        morphProgress.value = withTiming(
            0,
            {
                duration: 220,
                easing: ReanimatedEasing.bezier(0.4, 0, 0.2, 1),
            },
            (finished) => {
                if (finished) {
                    runOnJS(navigateBack)();
                }
            }
        );
        setTimeout(() => {
            navigateBack();
        }, 240);
    };

    useFocusEffect(
        React.useCallback(() => {
            isExiting.current = false;
            hasNavigated.current = false;
            morphProgress.value = withTiming(1, {
                duration: 280,
                easing: ReanimatedEasing.bezier(0.16, 1, 0.3, 1),
            });

            const onHardwareBack = () => {
                Keyboard.dismiss();
                handleBack();
                return true;
            };
            const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
            return () => subscription.remove();
        }, [])
    );

    const getFormattedDateBadge = (d: Date): string => {
        if (isToday(d)) return `Hoy, ${format(d, "d 'de' MMM", { locale: es })}`;
        if (isTomorrow(d)) return `Mañana, ${format(d, "d 'de' MMM", { locale: es })}`;
        return format(d, "EEE, d 'de' MMM", { locale: es });
    };

    const currentControlLevel = CONTROL_LEVELS.find(l => l.key === controlLevel) || CONTROL_LEVELS[0];
    const currentRecurrenceObj = RECURRENCE_TYPES.find(r => r.key === extendedRecurrenceType) || RECURRENCE_TYPES[0];
    const selectedColorObj = EVENT_COLORS.find(c => c.color === selectedColor) || EVENT_COLORS[0];

    return (
        <View
            style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
            onLayout={(e) => {
                const h = Math.round(e.nativeEvent.layout.height);
                if (h > 0) {
                    layoutHeight.value = h;
                }
            }}
        >
            {/* Backdrop oscuro sutil que acompaña la expansión */}
            <TouchableWithoutFeedback onPress={handleBack}>
                <Reanimated.View
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: '#000000' },
                        backdropAnimatedStyle,
                    ]}
                />
            </TouchableWithoutFeedback>

            {/* Contenedor principal que hace morphing desde la tarjeta "Crear con Veyra" */}
            <Reanimated.View
                style={[
                    {
                        backgroundColor: colors.bg,
                    },
                    containerAnimatedStyle,
                ]}
            >
                <Reanimated.View style={[{ flex: 1 }, safePaddingTopStyle]}>
                    <View style={styles.container}>
                        {/* ─── HEADER ─── */}
                        <View style={[styles.header, { borderBottomColor: colors.borderSubtle, backgroundColor: colors.bg }]}>
                            <VeyraIconButton
                                icon={<ChevronLeft size={24} color={colors.textPrimary as any} />}
                                onPress={handleBack}
                                variant="ghost"
                                size="sm"
                            />
                            <View style={styles.headerCenter}>
                                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                                    {isEditing ? 'Editar Evento' : 'Nuevo Evento'}
                                </Text>
                            </View>
                            <View style={styles.headerActions}>
                                {isEditing && existingEvent && (
                                    <VeyraIconButton
                                        icon={<Share2 size={17} color={colors.textPrimary as any} />}
                                        onPress={() => setIsShareModalVisible(true)}
                                        variant="ghost"
                                        size="sm"
                                    />
                                )}
                                {isEditing && (
                                    <VeyraIconButton
                                        icon={<Trash2 size={17} color={isDark ? '#FB7185' : '#E11D48'} />}
                                        onPress={handleDelete}
                                        variant="danger"
                                        size="sm"
                                    />
                                )}
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    disabled={!title.trim()}
                                    onPress={handleSave}
                                    style={[
                                        styles.headerSaveBtn,
                                        {
                                            backgroundColor: title.trim() ? (accent.primary || '#3B82F6') : controlBgColor,
                                            opacity: title.trim() ? 1 : 0.5,
                                        },
                                    ]}
                                >
                                    <Check size={15} color={(title.trim() ? colors.textInverse : colors.textMuted) as any} strokeWidth={3} />
                                    <Text
                                        style={[
                                            styles.headerSaveText,
                                            {
                                                color: title.trim() ? colors.textInverse : colors.textMuted,
                                            },
                                        ]}
                                    >
                                        Guardar
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* ─── CONTENIDO MODULAR FLAT (BÁSICO + AVANZADO) ─── */}
                        <Reanimated.View style={[{ flex: 1 }, formAnimatedStyle]}>
                            <ScrollView
                                style={styles.scroll}
                                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 48 }]}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                {/* ─── 1. SECCIÓN BÁSICA: TÍTULO, COLOR Y UBICACIÓN ─── */}
                                <View
                                    style={[
                                        styles.sectionCard,
                                        {
                                            backgroundColor: cardBgColor,
                                            borderColor: cardBorderColor,
                                            borderTopColor: selectedColor,
                                            borderTopWidth: 3,
                                        },
                                    ]}
                                >
                                    <View style={styles.heroTopMeta}>
                                        <View
                                            style={[
                                                styles.typePill,
                                                {
                                                    backgroundColor: `${selectedColor}18`,
                                                },
                                            ]}
                                        >
                                            <View style={[styles.statusDot, { backgroundColor: selectedColor }]} />
                                            <Text style={[styles.typePillText, { color: selectedColor }]}>
                                                EVENTO • {selectedColorObj.label.toUpperCase()}
                                            </Text>
                                        </View>

                                        {isAllDay && (
                                            <View
                                                style={[
                                                    styles.typePill,
                                                    {
                                                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                                    },
                                                ]}
                                            >
                                                <Sun size={11} color="#F59E0B" />
                                                <Text style={[styles.typePillText, { color: '#F59E0B' }]}>
                                                    TODO EL DÍA
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    <TextInput
                                        placeholder="Título del evento (ej: Clase de Cálculo, Reunión...)"
                                        placeholderTextColor={colors.textMuted}
                                        value={title}
                                        onChangeText={setTitle}
                                        style={[styles.titleInput, { color: colors.textPrimary }]}
                                        autoFocus={false}
                                    />

                                    <View style={[styles.cardInternalDivider, { backgroundColor: colors.borderSubtle }]} />

                                    {/* Ubicación rápida */}
                                    <View
                                        style={[
                                            styles.flatBoxInputRow,
                                            {
                                                backgroundColor: controlBgColor,
                                                borderColor: controlBorderColor,
                                            },
                                        ]}
                                    >
                                        <MapPin size={16} color={selectedColor as any} />
                                        <TextInput
                                            placeholder="Ubicación o enlace (ej: Aula 302, Meet/Zoom...)"
                                            placeholderTextColor={colors.textMuted}
                                            value={location}
                                            onChangeText={setLocation}
                                            style={[styles.flatBoxTextInput, { color: colors.textPrimary }]}
                                        />
                                        {location.length > 0 && (
                                            <TouchableOpacity onPress={() => setLocation('')} style={{ padding: 4 }}>
                                                <X size={14} color={colors.textMuted as any} />
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    <View style={[styles.cardInternalDivider, { backgroundColor: colors.borderSubtle }]} />

                                    {/* Paleta de Color Horizontal Compacta */}
                                    <View>
                                        <View style={styles.colorHeaderRow}>
                                            <Text style={[styles.microLabel, { color: colors.textMuted, marginBottom: 0 }]}>
                                                COLOR DEL EVENTO
                                            </Text>
                                            <Text style={[styles.selectedColorLabel, { color: selectedColor }]}>
                                                {selectedColorObj.label}
                                            </Text>
                                        </View>
                                        <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={styles.colorPaletteRow}
                                        >
                                            {EVENT_COLORS.map(c => {
                                                const isSelected = selectedColor === c.color;
                                                return (
                                                    <TouchableOpacity
                                                        key={c.color}
                                                        activeOpacity={0.75}
                                                        onPress={() => setSelectedColor(c.color)}
                                                        style={[
                                                            styles.colorSwatchItem,
                                                            {
                                                                backgroundColor: isSelected ? `${c.color}18` : controlBgColor,
                                                                borderColor: isSelected ? c.color : controlBorderColor,
                                                            },
                                                        ]}
                                                    >
                                                        <View style={[styles.colorBall, { backgroundColor: c.color }]}>
                                                            {isSelected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                                                        </View>
                                                        <Text
                                                            style={[
                                                                styles.colorSwatchName,
                                                                {
                                                                    color: isSelected ? colors.textPrimary : colors.textSecondary,
                                                                    fontWeight: isSelected ? '700' : '500',
                                                                },
                                                            ]}
                                                        >
                                                            {c.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </ScrollView>
                                    </View>
                                </View>

                                {/* ─── 2. SECCIÓN BÁSICA: FECHA Y HORARIO ─── */}
                                <View style={styles.sectionWrapper}>
                                    <View style={styles.sectionHeader}>
                                        <View style={styles.sectionHeaderLeft}>
                                            <View style={[styles.sectionIconBadge, { backgroundColor: `${accent.primary}18` }]}>
                                                <CalendarIcon size={15} color={accent.primary as any} strokeWidth={2.3} />
                                            </View>
                                            <View>
                                                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                    Fecha y Horario
                                                </Text>
                                                <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                    Define el día y la duración del evento
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    <View
                                        style={[
                                            styles.sectionCard,
                                            {
                                                backgroundColor: cardBgColor,
                                                borderColor: cardBorderColor,
                                            },
                                        ]}
                                    >
                                        {/* Toggle: Todo el día */}
                                        <TouchableOpacity
                                            activeOpacity={0.75}
                                            onPress={() => setIsAllDay(!isAllDay)}
                                            style={styles.interactiveRow}
                                        >
                                            <View style={styles.rowIconLabel}>
                                                <View style={[styles.rowMiniIcon, { backgroundColor: controlBgColor }]}>
                                                    <Sun size={16} color={isAllDay ? '#F59E0B' : (colors.textMuted as any)} />
                                                </View>
                                                <View>
                                                    <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                                                        Evento de todo el día
                                                    </Text>
                                                    <Text style={[styles.rowHint, { color: colors.textMuted }]}>
                                                        Sin hora de inicio ni fin específica
                                                    </Text>
                                                </View>
                                            </View>
                                            <View
                                                style={[
                                                    styles.switchBtn,
                                                    {
                                                        backgroundColor: isAllDay ? accent.primary : (isDark ? '#334155' : '#E2E8F0'),
                                                    },
                                                ]}
                                            >
                                                <View
                                                    style={[
                                                        styles.switchThumb,
                                                        {
                                                            transform: [{ translateX: isAllDay ? 20 : 2 }],
                                                            backgroundColor: '#FFFFFF',
                                                        },
                                                    ]}
                                                />
                                            </View>
                                        </TouchableOpacity>

                                        <View style={[styles.cardInternalDivider, { backgroundColor: colors.borderSubtle }]} />

                                        {/* Selector de Fecha */}
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            onPress={() => setShowDatePicker(true)}
                                            style={styles.interactiveRow}
                                        >
                                            <View style={styles.rowIconLabel}>
                                                <View style={[styles.rowMiniIcon, { backgroundColor: controlBgColor }]}>
                                                    <CalendarIcon size={16} color={accent.primary as any} />
                                                </View>
                                                <View>
                                                    <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Fecha</Text>
                                                    <Text style={[styles.rowHint, { color: colors.textMuted }]}>Día en el calendario</Text>
                                                </View>
                                            </View>
                                            <View style={[styles.valuePill, { backgroundColor: controlBgColor, borderColor: controlBorderColor }]}>
                                                <Text style={[styles.valuePillText, { color: accent.primary }]}>
                                                    {getFormattedDateBadge(eventDate)}
                                                </Text>
                                                <ChevronRight size={14} color={colors.textMuted as any} />
                                            </View>
                                        </TouchableOpacity>

                                        {/* Horas de inicio y fin en bloques lado a lado cuando no es todo el día */}
                                        {!isAllDay && (
                                            <>
                                                <View style={[styles.cardInternalDivider, { backgroundColor: colors.borderSubtle }]} />
                                                <View style={styles.timeRangeGrid}>
                                                    <TouchableOpacity
                                                        activeOpacity={0.75}
                                                        onPress={() => setShowStartTimePicker(true)}
                                                        style={[
                                                            styles.timeRangeBox, {
                                                                backgroundColor: controlBgColor,
                                                                borderColor: controlBorderColor,
                                                            },
                                                        ]}
                                                    >
                                                        <View style={styles.timeRangeHeader}>
                                                            <Clock size={13} color={accent.primary as any} />
                                                            <Text style={[styles.timeRangeLabel, { color: colors.textMuted }]}>
                                                                HORA INICIO
                                                            </Text>
                                                        </View>
                                                        <Text style={[styles.timeRangeValue, { color: colors.textPrimary }]}>
                                                            {format(startTime, 'HH:mm')}
                                                        </Text>
                                                    </TouchableOpacity>

                                                    <TouchableOpacity
                                                        activeOpacity={0.75}
                                                        onPress={() => setShowEndTimePicker(true)}
                                                        style={[
                                                            styles.timeRangeBox, {
                                                                backgroundColor: controlBgColor,
                                                                borderColor: controlBorderColor,
                                                            },
                                                        ]}
                                                    >
                                                        <View style={styles.timeRangeHeader}>
                                                            <Clock size={13} color={accent.primary as any} />
                                                            <Text style={[styles.timeRangeLabel, { color: colors.textMuted }]}>
                                                                HORA FIN
                                                            </Text>
                                                        </View>
                                                        <Text style={[styles.timeRangeValue, { color: colors.textPrimary }]}>
                                                            {format(endTime, 'HH:mm')}
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </>
                                        )}
                                    </View>
                                </View>

                                {/* ─── BOTÓN / HEADER ACORDEÓN: OPCIONES AVANZADAS ─── */}
                                <TouchableOpacity
                                    activeOpacity={0.75}
                                    onPress={() => setIsAdvancedOpen(prev => !prev)}
                                    style={[
                                        styles.advancedAccordionHeader,
                                        {
                                            backgroundColor: cardBgColor,
                                            borderColor: isAdvancedOpen ? accent.primary : cardBorderColor,
                                        },
                                    ]}
                                >
                                    <View style={styles.advancedAccordionLeft}>
                                        <View style={[styles.advancedIconBadge, { backgroundColor: isAdvancedOpen ? `${accent.primary}25` : `${accent.primary}15` }]}>
                                            <Sliders size={16} color={accent.primary as any} strokeWidth={2.3} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                                <Text style={[styles.advancedTitle, { color: colors.textPrimary }]}>
                                                    Opciones avanzadas
                                                </Text>
                                                {activeAdvancedCount > 0 && (
                                                    <View style={[styles.advancedCountBadge, { backgroundColor: `${accent.primary}20`, borderColor: `${accent.primary}40` }]}>
                                                        <Text style={[styles.advancedCountText, { color: accent.primary }]}>
                                                            {activeAdvancedCount} {activeAdvancedCount === 1 ? 'activa' : 'activas'}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={[styles.advancedSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                                                {isAdvancedOpen ? 'Toca para contraer' : 'Repetición, avisos, notas, etiquetas...'}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={[styles.advancedChevronCircle, { backgroundColor: controlBgColor }]}>
                                        <ChevronDown
                                            size={16}
                                            color={colors.textSecondary as any}
                                            style={{
                                                transform: [{ rotate: isAdvancedOpen ? '180deg' : '0deg' }],
                                            }}
                                        />
                                    </View>
                                </TouchableOpacity>

                                {/* ─── CONTENIDO AVANZADO (COLAPSABLE) ─── */}
                                {isAdvancedOpen && (
                                    <View style={styles.advancedContentBlock}>
                                        {/* ─── 3. SECCIÓN: REPETICIÓN Y FRECUENCIA ─── */}
                                        <View style={styles.sectionWrapper}>
                                            <View style={styles.sectionHeader}>
                                                <View style={styles.sectionHeaderLeft}>
                                                    <View style={[styles.sectionIconBadge, { backgroundColor: `${accent.primary}18` }]}>
                                                        <Repeat size={15} color={accent.primary as any} strokeWidth={2.3} />
                                                    </View>
                                                    <View>
                                                        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                            Repetición
                                                        </Text>
                                                        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                            {currentRecurrenceObj.desc}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>

                                            <View
                                                style={[
                                                    styles.sectionCard,
                                                    {
                                                        backgroundColor: cardBgColor,
                                                        borderColor: cardBorderColor,
                                                    },
                                                ]}
                                            >
                                                <View style={styles.recurrenceGrid}>
                                                    {RECURRENCE_TYPES.map(r => {
                                                        const isSelected = extendedRecurrenceType === r.key;
                                                        return (
                                                            <TouchableOpacity
                                                                key={r.key}
                                                                activeOpacity={0.75}
                                                                onPress={() => handleSelectRecurrenceType(r.key)}
                                                                style={[
                                                                    styles.recurrenceOptionPill,
                                                                    {
                                                                        backgroundColor: isSelected ? `${accent.primary}18` : controlBgColor,
                                                                        borderColor: isSelected ? accent.primary : controlBorderColor,
                                                                    },
                                                                ]}
                                                            >
                                                                <Text
                                                                    style={[
                                                                        styles.recurrenceOptionText,
                                                                        {
                                                                            color: isSelected ? accent.primary : colors.textSecondary,
                                                                            fontWeight: isSelected ? '700' : '500',
                                                                        },
                                                                    ]}
                                                                >
                                                                    {r.label}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>

                                                {extendedRecurrenceType === 'weekly' && (
                                                    <View style={styles.daysSelectorBlock}>
                                                        <View style={[styles.cardInternalDivider, { backgroundColor: colors.borderSubtle, marginBottom: 10 }]} />
                                                        <Text style={[styles.microLabel, { color: colors.textMuted }]}>
                                                            DÍAS DE LA SEMANA QUE SE REPITE
                                                        </Text>
                                                        <View style={styles.daysRow}>
                                                            {WEEKDAYS.map(w => {
                                                                const selected = selectedDays.includes(w.day);
                                                                return (
                                                                    <TouchableOpacity
                                                                        key={w.day}
                                                                        activeOpacity={0.75}
                                                                        onPress={() => toggleDay(w.day)}
                                                                        style={[
                                                                            styles.dayButton,
                                                                            {
                                                                                backgroundColor: selected ? accent.primary : controlBgColor,
                                                                                borderColor: selected ? accent.primary : controlBorderColor,
                                                                            },
                                                                        ]}
                                                                    >
                                                                        <Text
                                                                            style={[
                                                                                styles.dayLetter,
                                                                                {
                                                                                    color: selected ? colors.textInverse : colors.textPrimary,
                                                                                    fontWeight: selected ? '800' : '600',
                                                                                },
                                                                            ]}
                                                                        >
                                                                            {w.label}
                                                                        </Text>
                                                                        <Text
                                                                            style={[
                                                                                styles.dayShortName,
                                                                                {
                                                                                    color: selected ? colors.textInverse : colors.textMuted,
                                                                                    opacity: selected ? 0.9 : 1,
                                                                                },
                                                                            ]}
                                                                        >
                                                                            {w.name}
                                                                        </Text>
                                                                    </TouchableOpacity>
                                                                );
                                                            })}
                                                        </View>
                                                    </View>
                                                )}
                                            </View>
                                        </View>

                                        {/* ─── 4. SECCIÓN: PRIORIDAD Y AVISOS PREVENTIVOS ─── */}
                                        <View style={styles.sectionWrapper}>
                                            <View style={styles.sectionHeader}>
                                                <View style={styles.sectionHeaderLeft}>
                                                    <View style={[styles.sectionIconBadge, { backgroundColor: `${currentControlLevel.color}20` }]}>
                                                        <Bell size={15} color={currentControlLevel.color as any} strokeWidth={2.3} />
                                                    </View>
                                                    <View>
                                                        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                            Prioridad y Avisos
                                                        </Text>
                                                        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                            Configura el nivel de alerta y los recordatorios previos
                                                        </Text>
                                                    </View>
                                                </View>
                                                {selectedOffsets.length > 0 && (
                                                    <View style={[styles.counterPill, { backgroundColor: `${accent.primary}18` }]}>
                                                        <Text style={[styles.counterPillText, { color: accent.primary }]}>
                                                            {selectedOffsets.length} {selectedOffsets.length === 1 ? 'aviso' : 'avisos'}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>

                                            <View
                                                style={[
                                                    styles.sectionCard,
                                                    {
                                                        backgroundColor: cardBgColor,
                                                        borderColor: cardBorderColor,
                                                    },
                                                ]}
                                            >
                                                <Text style={[styles.microLabel, { color: colors.textMuted, marginBottom: -4 }]}>
                                                    NIVEL DE CONTROL DE LA ALARMA
                                                </Text>
                                                <View style={styles.priorityCardsGrid}>
                                                    {CONTROL_LEVELS.map(item => {
                                                        const isSelected = controlLevel === item.key;
                                                        const ItemIcon = item.icon;
                                                        return (
                                                            <TouchableOpacity
                                                                key={item.key}
                                                                activeOpacity={0.75}
                                                                onPress={() => setControlLevel(item.key)}
                                                                style={[
                                                                    styles.priorityOptionCard,
                                                                    {
                                                                        backgroundColor: isSelected
                                                                            ? (isDark ? `${item.color}22` : `${item.color}12`)
                                                                            : controlBgColor,
                                                                        borderColor: isSelected ? item.color : controlBorderColor,
                                                                        borderWidth: isSelected ? 1.5 : 1,
                                                                    },
                                                                ]}
                                                            >
                                                                <View style={styles.priorityCardTop}>
                                                                    <View
                                                                        style={[
                                                                            styles.priorityIconCircle,
                                                                            {
                                                                                backgroundColor: isSelected ? `${item.color}28` : controlBgColor,
                                                                            },
                                                                        ]}
                                                                    >
                                                                        <ItemIcon
                                                                            size={15}
                                                                            color={isSelected ? item.color : (colors.textMuted as any)}
                                                                            strokeWidth={isSelected ? 2.5 : 2}
                                                                        />
                                                                    </View>
                                                                    {isSelected && (
                                                                        <View style={[styles.priorityCheckDot, { backgroundColor: item.color }]}>
                                                                            <Check size={10} color="#FFFFFF" strokeWidth={3} />
                                                                        </View>
                                                                    )}
                                                                </View>

                                                                <Text
                                                                    style={[
                                                                        styles.priorityOptionTitle,
                                                                        {
                                                                            color: isSelected ? (isDark ? '#FFFFFF' : item.color) : colors.textPrimary,
                                                                            fontWeight: isSelected ? '700' : '600',
                                                                        },
                                                                    ]}
                                                                >
                                                                    {item.label}
                                                                </Text>
                                                                <Text
                                                                    style={[
                                                                        styles.priorityOptionSub,
                                                                        {
                                                                            color: isSelected ? colors.textSecondary : colors.textMuted,
                                                                        },
                                                                    ]}
                                                                    numberOfLines={1}
                                                                >
                                                                    {item.shortDesc}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>

                                                <View
                                                    style={[
                                                        styles.priorityInfoBanner,
                                                        {
                                                            backgroundColor: controlBgColor,
                                                            borderColor: `${currentControlLevel.color}40`,
                                                            borderLeftColor: currentControlLevel.color,
                                                        },
                                                    ]}
                                                >
                                                    <Text style={[styles.priorityInfoText, { color: colors.textSecondary }]}>
                                                        <Text style={{ fontWeight: '700', color: currentControlLevel.color }}>
                                                            {currentControlLevel.label}:{' '}
                                                        </Text>
                                                        {currentControlLevel.desc}
                                                    </Text>
                                                </View>

                                                <View style={[styles.cardInternalDivider, { backgroundColor: colors.borderSubtle }]} />

                                                {/* Pila de avisos preventivos */}
                                                <View style={{ gap: 8 }}>
                                                    <Text style={[styles.microLabel, { color: colors.textMuted, marginBottom: 0 }]}>
                                                        AVISOS ANTES DEL EVENTO
                                                    </Text>

                                                    {selectedOffsets.length === 0 ? (
                                                        <Text style={[styles.emptyHintText, { color: colors.textMuted }]}>
                                                            Sin avisos configurados para este evento.
                                                        </Text>
                                                    ) : (
                                                        <View style={styles.avisosList}>
                                                            {selectedOffsets.map(offset => (
                                                                <View
                                                                    key={offset}
                                                                    style={[
                                                                        styles.avisoItemRow,
                                                                        {
                                                                            backgroundColor: controlBgColor,
                                                                            borderColor: controlBorderColor,
                                                                        },
                                                                    ]}
                                                                >
                                                                    <View style={styles.avisoLeft}>
                                                                        <Bell size={14} color={accent.primary as any} />
                                                                        <Text style={[styles.avisoText, { color: colors.textPrimary }]}>
                                                                            {getOffsetLabel(offset)}
                                                                        </Text>
                                                                    </View>
                                                                    <TouchableOpacity
                                                                        activeOpacity={0.7}
                                                                        onPress={() => handleRemoveOffset(offset)}
                                                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                                        style={{ padding: 2 }}
                                                                    >
                                                                        <X size={15} color={colors.textMuted as any} />
                                                                    </TouchableOpacity>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    )}

                                                    <TouchableOpacity
                                                        activeOpacity={0.75}
                                                        onPress={() => setIsAddAvisoModalOpen(true)}
                                                        style={[
                                                            styles.addFullBtn,
                                                            {
                                                                backgroundColor: `${accent.primary}14`,
                                                                borderColor: `${accent.primary}35`,
                                                            },
                                                        ]}
                                                    >
                                                        <Plus size={15} color={accent.primary as any} strokeWidth={2.5} />
                                                        <Text style={[styles.addFullBtnText, { color: accent.primary }]}>
                                                            Agregar aviso preventivo
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        </View>

                                        {/* ─── 5. SECCIÓN: DESCRIPCIÓN Y NOTAS EXTENSAS ─── */}
                                        <View style={styles.sectionWrapper}>
                                            <View style={styles.sectionHeader}>
                                                <View style={styles.sectionHeaderLeft}>
                                                    <View style={[styles.sectionIconBadge, { backgroundColor: `${accent.primary}18` }]}>
                                                        <FileText size={15} color={accent.primary as any} strokeWidth={2.3} />
                                                    </View>
                                                    <View>
                                                        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                            Descripción y Notas
                                                        </Text>
                                                        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                            Detalles, temario o enlaces adicionales
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>

                                            <View
                                                style={[
                                                    styles.sectionCard,
                                                    {
                                                        backgroundColor: cardBgColor,
                                                        borderColor: cardBorderColor,
                                                    },
                                                ]}
                                            >
                                                <TextInput
                                                    placeholder="Escribe aquí temario, detalles o enlaces para el evento..."
                                                    placeholderTextColor={colors.textMuted}
                                                    value={description}
                                                    onChangeText={setDescription}
                                                    style={[styles.descInputStandalone, { color: colors.textPrimary }]}
                                                    multiline
                                                    scrollEnabled={false}
                                                />
                                            </View>
                                        </View>

                                        {/* ─── 6. SECCIÓN: ETIQUETAS / CATEGORÍAS ─── */}
                                        <View style={styles.sectionWrapper}>
                                            <View style={styles.sectionHeader}>
                                                <View style={styles.sectionHeaderLeft}>
                                                    <View style={[styles.sectionIconBadge, { backgroundColor: `${accent.primary}18` }]}>
                                                        <TagIcon size={15} color={accent.primary as any} strokeWidth={2.3} />
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                            Etiquetas y Categorías
                                                        </Text>
                                                        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                            Usa <Text style={{ color: accent.primary, fontWeight: '700' }}>#clase</Text> para sincronizar con el Horario
                                                        </Text>
                                                    </View>
                                                </View>
                                                {tags.length > 0 && (
                                                    <View style={[styles.counterPill, { backgroundColor: `${accent.primary}18` }]}>
                                                        <Text style={[styles.counterPillText, { color: accent.primary }]}>
                                                            {tags.length}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>

                                            <View
                                                style={[
                                                    styles.sectionCard,
                                                    {
                                                        backgroundColor: cardBgColor,
                                                        borderColor: cardBorderColor,
                                                    },
                                                ]}
                                            >
                                                <View
                                                    style={[
                                                        styles.flatBoxInputRow,
                                                        {
                                                            backgroundColor: controlBgColor,
                                                            borderColor: controlBorderColor,
                                                        },
                                                    ]}
                                                >
                                                    <TagIcon size={15} color={colors.textMuted as any} />
                                                    <TextInput
                                                        placeholder="Nueva etiqueta (ej: examen, proyecto)..."
                                                        placeholderTextColor={colors.textMuted}
                                                        value={customTagInput}
                                                        onChangeText={setCustomTagInput}
                                                        onSubmitEditing={() => handleAddTag(customTagInput)}
                                                        returnKeyType="done"
                                                        style={[styles.flatBoxTextInput, { color: colors.textPrimary }]}
                                                    />
                                                    <TouchableOpacity
                                                        activeOpacity={0.7}
                                                        disabled={!customTagInput.trim()}
                                                        onPress={() => handleAddTag(customTagInput)}
                                                        style={[
                                                            styles.inlineAddBtn,
                                                            {
                                                                backgroundColor: customTagInput.trim() ? accent.primary : controlBgColor,
                                                                opacity: customTagInput.trim() ? 1 : 0.5,
                                                            },
                                                        ]}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.inlineAddBtnText,
                                                                {
                                                                    color: customTagInput.trim() ? colors.textInverse : colors.textMuted,
                                                                },
                                                            ]}
                                                        >
                                                            Añadir
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>

                                                {tags.length > 0 && (
                                                    <View style={styles.activeTagsBlock}>
                                                        <Text style={[styles.microLabel, { color: colors.textMuted }]}>
                                                            ACTIVAS
                                                        </Text>
                                                        <View style={styles.tagsContainer}>
                                                            {tags.map(tagItem => (
                                                                <View
                                                                    key={tagItem}
                                                                    style={[
                                                                        styles.tagBadgeActive,
                                                                        {
                                                                            backgroundColor: `${accent.primary}18`,
                                                                            borderColor: `${accent.primary}45`,
                                                                        },
                                                                    ]}
                                                                >
                                                                    <Text style={[styles.tagBadgeText, { color: accent.primary, fontWeight: '700' }]}>
                                                                        #{tagItem}
                                                                    </Text>
                                                                    <TouchableOpacity
                                                                        activeOpacity={0.7}
                                                                        onPress={() => handleRemoveTag(tagItem)}
                                                                        style={styles.tagRemoveBtn}
                                                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                                    >
                                                                        <X size={12} color={accent.primary as any} />
                                                                    </TouchableOpacity>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    </View>
                                                )}

                                                <View style={styles.suggestedTagsBlock}>
                                                    <Text style={[styles.microLabel, { color: colors.textMuted }]}>
                                                        SUGERENCIAS RÁPIDAS
                                                    </Text>
                                                    <View style={styles.tagChipsWrap}>
                                                        {PRESET_TAGS.map(preset => {
                                                            const isSelected = tags.includes(preset);
                                                            return (
                                                                <TouchableOpacity
                                                                    key={preset}
                                                                    activeOpacity={0.7}
                                                                    onPress={() => (isSelected ? handleRemoveTag(preset) : handleAddTag(preset))}
                                                                    style={[
                                                                        styles.tagChipPreset,
                                                                        {
                                                                            backgroundColor: isSelected ? `${accent.primary}20` : controlBgColor,
                                                                            borderColor: isSelected ? accent.primary : controlBorderColor,
                                                                        },
                                                                    ]}
                                                                >
                                                                    <Text
                                                                        style={[
                                                                            styles.tagChipPresetText,
                                                                            {
                                                                                color: isSelected ? accent.primary : colors.textSecondary,
                                                                                fontWeight: isSelected ? '700' : '500',
                                                                            },
                                                                        ]}
                                                                    >
                                                                        #{preset}
                                                                    </Text>
                                                                    {isSelected && <Check size={11} color={accent.primary as any} style={{ marginLeft: 4 }} />}
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </View>
                                                </View>
                                            </View>
                                        </View>

                                        {/* ─── 7. SECCIÓN: CUADERNO Y APUNTES ─── */}
                                        <View style={styles.sectionWrapper}>
                                            <View style={styles.sectionHeader}>
                                                <View style={styles.sectionHeaderLeft}>
                                                    <View style={[styles.sectionIconBadge, { backgroundColor: 'rgba(59, 130, 246, 0.16)' }]}>
                                                        <FileText size={15} color="#3B82F6" strokeWidth={2.3} />
                                                    </View>
                                                    <View>
                                                        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                            Cuaderno de Apuntes
                                                        </Text>
                                                        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                            Vincula una página de notas para esta clase o reunión
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>

                                            <View
                                                style={[
                                                    styles.sectionCard,
                                                    {
                                                        backgroundColor: cardBgColor,
                                                        borderColor: cardBorderColor,
                                                        gap: 12,
                                                    },
                                                ]}
                                            >
                                                {/* Carpeta Vinculada */}
                                                {linkedFolder ? (
                                                    <View
                                                        style={[
                                                            styles.linkedNoteBox,
                                                            {
                                                                backgroundColor: controlBgColor,
                                                                borderColor: controlBorderColor,
                                                            },
                                                        ]}
                                                    >
                                                        <View style={styles.linkedCardContent}>
                                                            <View style={[styles.sectionIconBadge, { backgroundColor: `${linkedFolder.color || selectedColor}22` }]}>
                                                                <FolderIconRenderer
                                                                    name={linkedFolder.icon || 'folder'}
                                                                    size={16}
                                                                    color={linkedFolder.color || selectedColor}
                                                                />
                                                            </View>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={[styles.linkedNoteTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                                                                    {linkedFolder.name}
                                                                </Text>
                                                                <Text style={[styles.linkedNoteDate, { color: colors.textMuted }]}>
                                                                    Carpeta vinculada al evento
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        <View style={styles.linkedCardActions}>
                                                            <TouchableOpacity
                                                                onPress={() => setLinkedFolderId(null)}
                                                                style={[styles.noteSmallPill, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}
                                                            >
                                                                <Unlink size={14} color="#EF4444" />
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                ) : (
                                                    <View style={styles.noteOptionsGrid}>
                                                        <TouchableOpacity
                                                            activeOpacity={0.75}
                                                            onPress={handleCreateNewFolderForEvent}
                                                            style={[
                                                                styles.noteOptionTile,
                                                                {
                                                                    backgroundColor: `${selectedColor}12`,
                                                                    borderColor: `${selectedColor}40`,
                                                                },
                                                            ]}
                                                        >
                                                            <View style={[styles.attachTileIcon, { backgroundColor: `${selectedColor}20` }]}>
                                                                <FolderPlus size={17} color={selectedColor as any} strokeWidth={2.3} />
                                                            </View>
                                                            <Text style={[styles.noteTileTitle, { color: selectedColor }]}>
                                                                Crear carpeta
                                                            </Text>
                                                            <Text style={[styles.noteTileSub, { color: colors.textMuted }]}>
                                                                Cuaderno para todas las notas del evento
                                                            </Text>
                                                        </TouchableOpacity>

                                                        <TouchableOpacity
                                                            activeOpacity={0.75}
                                                            onPress={() => setIsLinkFolderModalVisible(true)}
                                                            style={[
                                                                styles.noteOptionTile,
                                                                {
                                                                    backgroundColor: controlBgColor,
                                                                    borderColor: controlBorderColor,
                                                                },
                                                            ]}
                                                        >
                                                            <View style={[styles.attachTileIcon, { backgroundColor: controlBgColor }]}>
                                                                <FolderIcon size={16} color={colors.textPrimary as any} />
                                                            </View>
                                                            <Text style={[styles.noteTileTitle, { color: colors.textPrimary }]}>
                                                                Vincular carpeta
                                                            </Text>
                                                            <Text style={[styles.noteTileSub, { color: colors.textMuted }]}>
                                                                Usa una carpeta existente
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}

                                                {/* Nota Vinculada */}
                                                {linkedNote ? (
                                                    <View
                                                        style={[
                                                            styles.linkedNoteBox,
                                                            {
                                                                backgroundColor: controlBgColor,
                                                                borderColor: controlBorderColor,
                                                            },
                                                        ]}
                                                    >
                                                        <View style={styles.linkedCardContent}>
                                                            <View style={[styles.sectionIconBadge, { backgroundColor: 'rgba(59, 130, 246, 0.16)' }]}>
                                                                <FileText size={16} color="#3B82F6" />
                                                            </View>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={[styles.linkedNoteTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                                                                    {linkedNote.title || 'Sin título'}
                                                                </Text>
                                                                <Text style={[styles.linkedNoteDate, { color: colors.textMuted }]}>
                                                                    Nota vinculada al evento
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        <View style={styles.linkedCardActions}>
                                                            <TouchableOpacity
                                                                onPress={() => router.push({ pathname: '/notes/[id]', params: { id: linkedNote.id } })}
                                                                style={[styles.noteSmallPill, { backgroundColor: `${accent.primary}18` }]}
                                                            >
                                                                <Text style={[styles.noteSmallPillText, { color: accent.primary }]}>Abrir</Text>
                                                            </TouchableOpacity>
                                                            <TouchableOpacity
                                                                onPress={() => setLinkedNoteId(null)}
                                                                style={[styles.noteSmallPill, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}
                                                            >
                                                                <Unlink size={14} color="#EF4444" />
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                ) : (
                                                    <View style={styles.noteOptionsGrid}>
                                                        <TouchableOpacity
                                                            activeOpacity={0.75}
                                                            onPress={handleCreateNewNoteForEvent}
                                                            style={[
                                                                styles.noteOptionTile,
                                                                {
                                                                    backgroundColor: `${accent.primary}12`,
                                                                    borderColor: `${accent.primary}40`,
                                                                },
                                                            ]}
                                                        >
                                                            <View style={[styles.attachTileIcon, { backgroundColor: `${accent.primary}20` }]}>
                                                                <Plus size={17} color={accent.primary as any} strokeWidth={2.5} />
                                                            </View>
                                                            <Text style={[styles.noteTileTitle, { color: accent.primary }]}>
                                                                Crear nueva nota
                                                            </Text>
                                                            <Text style={[styles.noteTileSub, { color: colors.textMuted }]}>
                                                                Genera una hoja con el nombre del evento
                                                            </Text>
                                                        </TouchableOpacity>

                                                        <TouchableOpacity
                                                            activeOpacity={0.75}
                                                            onPress={() => setIsLinkNoteModalVisible(true)}
                                                            style={[
                                                                styles.noteOptionTile,
                                                                {
                                                                    backgroundColor: controlBgColor,
                                                                    borderColor: controlBorderColor,
                                                                },
                                                            ]}
                                                        >
                                                            <View style={[styles.attachTileIcon, { backgroundColor: controlBgColor }]}>
                                                                <Link size={16} color={colors.textPrimary as any} />
                                                            </View>
                                                            <Text style={[styles.noteTileTitle, { color: colors.textPrimary }]}>
                                                                Vincular nota
                                                            </Text>
                                                            <Text style={[styles.noteTileSub, { color: colors.textMuted }]}>
                                                                Elige una nota de tu cuaderno
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                )}
                            </ScrollView>

                            {/* Modal para Vincular Carpeta Existente */}
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
                                        style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
                                    >
                                        <View style={styles.modalHeader}>
                                            <View style={styles.rowIconLabel}>
                                                <FolderIcon size={18} color={selectedColor} />
                                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Vincular Carpeta</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => setIsLinkFolderModalVisible(false)}>
                                                <X size={20} color={colors.textSecondary as any} />
                                            </TouchableOpacity>
                                        </View>

                                        <View style={[styles.searchBox, { backgroundColor: controlBgColor, borderColor: controlBorderColor, borderWidth: 1 }]}>
                                            <Search size={16} color={colors.textMuted as any} />
                                            <TextInput
                                                placeholder="Buscar carpeta..."
                                                placeholderTextColor={colors.textMuted}
                                                value={folderSearchQuery}
                                                onChangeText={setFolderSearchQuery}
                                                style={[styles.searchTextInput, { color: colors.textPrimary }]}
                                            />
                                        </View>

                                        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                                            {filteredFolders.length === 0 ? (
                                                <Text style={[styles.emptyModalText, { color: colors.textMuted }]}>
                                                    No se encontraron carpetas.
                                                </Text>
                                            ) : (
                                                filteredFolders.map(f => (
                                                    <TouchableOpacity
                                                        key={f.id}
                                                        activeOpacity={0.7}
                                                        onPress={() => {
                                                            setLinkedFolderId(f.id);
                                                            setIsLinkFolderModalVisible(false);
                                                        }}
                                                        style={[styles.noteRowItem, { borderBottomColor: colors.borderSubtle }]}
                                                    >
                                                        <FolderIconRenderer
                                                            name={f.icon || 'folder'}
                                                            size={16}
                                                            color={f.color || selectedColor}
                                                        />
                                                        <Text style={[styles.noteRowText, { color: colors.textPrimary }]} numberOfLines={1}>
                                                            {f.name}
                                                        </Text>
                                                        <ChevronRight size={15} color={colors.textMuted as any} />
                                                    </TouchableOpacity>
                                                ))
                                            )}
                                        </ScrollView>
                                    </VeyraSurface>
                                </View>
                            </Modal>

                            {/* Modal para Vincular Nota Existente */}
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
                                        style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
                                    >
                                        <View style={styles.modalHeader}>
                                            <View style={styles.rowIconLabel}>
                                                <FileText size={18} color="#3B82F6" />
                                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Vincular Nota</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => setIsLinkNoteModalVisible(false)}>
                                                <X size={20} color={colors.textSecondary as any} />
                                            </TouchableOpacity>
                                        </View>

                                        <View style={[styles.searchBox, { backgroundColor: controlBgColor, borderColor: controlBorderColor, borderWidth: 1 }]}>
                                            <Search size={16} color={colors.textMuted as any} />
                                            <TextInput
                                                placeholder="Buscar nota por título..."
                                                placeholderTextColor={colors.textMuted}
                                                value={noteSearchQuery}
                                                onChangeText={setNoteSearchQuery}
                                                style={[styles.searchTextInput, { color: colors.textPrimary }]}
                                            />
                                        </View>

                                        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                                            {filteredNotes.length === 0 ? (
                                                <Text style={[styles.emptyModalText, { color: colors.textMuted }]}>
                                                    No se encontraron notas.
                                                </Text>
                                            ) : (
                                                filteredNotes.map(n => (
                                                    <TouchableOpacity
                                                        key={n.id}
                                                        activeOpacity={0.7}
                                                        onPress={() => {
                                                            setLinkedNoteId(n.id);
                                                            setIsLinkNoteModalVisible(false);
                                                        }}
                                                        style={[styles.noteRowItem, { borderBottomColor: colors.borderSubtle }]}
                                                    >
                                                        <FileText size={16} color="#3B82F6" />
                                                        <Text style={[styles.noteRowText, { color: colors.textPrimary }]} numberOfLines={1}>
                                                            {n.title || 'Sin título'}
                                                        </Text>
                                                        <ChevronRight size={15} color={colors.textMuted as any} />
                                                    </TouchableOpacity>
                                                ))
                                            )}
                                        </ScrollView>
                                    </VeyraSurface>
                                </View>
                            </Modal>

                            {/* Modal BottomSheet: Agregar Aviso Preventivo */}
                            <Modal
                                visible={isAddAvisoModalOpen}
                                transparent
                                animationType="slide"
                                onRequestClose={() => setIsAddAvisoModalOpen(false)}
                            >
                                <View style={styles.modalBackdrop}>
                                    <TouchableOpacity
                                        style={styles.backdropDismiss}
                                        activeOpacity={1}
                                        onPress={() => setIsAddAvisoModalOpen(false)}
                                    />
                                    <VeyraSurface
                                        level={2}
                                        radius="xl"
                                        style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
                                    >
                                        <View style={styles.modalHeader}>
                                            <View style={styles.rowIconLabel}>
                                                <Bell size={18} color={accent.primary as any} />
                                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                                                    Agregar Aviso Preventivo
                                                </Text>
                                            </View>
                                            <TouchableOpacity
                                                onPress={() => setIsAddAvisoModalOpen(false)}
                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            >
                                                <X size={20} color={colors.textSecondary as any} />
                                            </TouchableOpacity>
                                        </View>

                                        <ScrollView style={{ maxHeight: 360, marginTop: 6 }} showsVerticalScrollIndicator={false}>
                                            {AVAILABLE_OFFSETS.map(item => {
                                                const isAlreadyAdded = selectedOffsets.includes(item.value);
                                                return (
                                                    <TouchableOpacity
                                                        key={item.value}
                                                        activeOpacity={0.7}
                                                        disabled={isAlreadyAdded}
                                                        onPress={() => {
                                                            handleAddOffset(item.value);
                                                            setIsAddAvisoModalOpen(false);
                                                        }}
                                                        style={[
                                                            styles.avisoOptionRow,
                                                            {
                                                                borderBottomColor: colors.borderSubtle,
                                                                opacity: isAlreadyAdded ? 0.45 : 1,
                                                            },
                                                        ]}
                                                    >
                                                        <View style={styles.rowIconLabel}>
                                                            <Bell
                                                                size={15}
                                                                color={isAlreadyAdded ? (colors.textMuted as any) : (accent.primary as any)}
                                                            />
                                                            <Text
                                                                style={[
                                                                    styles.avisoOptionLabel,
                                                                    {
                                                                        color: isAlreadyAdded ? colors.textMuted : colors.textPrimary,
                                                                        fontWeight: isAlreadyAdded ? '400' : '600',
                                                                    },
                                                                ]}
                                                            >
                                                                {item.label}
                                                            </Text>
                                                        </View>
                                                        {isAlreadyAdded ? (
                                                            <Text style={[styles.alreadyAddedBadge, { color: colors.textMuted }]}>
                                                                Agregado
                                                            </Text>
                                                        ) : (
                                                            <Plus size={16} color={accent.primary as any} strokeWidth={2.5} />
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </ScrollView>
                                    </VeyraSurface>
                                </View>
                            </Modal>

                            {/* Modales de Fecha y Hora Personalizados */}
                            <DatePickerModal
                                visible={showDatePicker}
                                value={eventDate}
                                title="Fecha del Evento"
                                onClose={() => setShowDatePicker(false)}
                                onConfirm={(selectedDate) => {
                                    setEventDate(selectedDate);
                                }}
                            />

                            <TimePickerModal
                                visible={showStartTimePicker}
                                value={startTime}
                                title="Hora de Inicio"
                                onClose={() => setShowStartTimePicker(false)}
                                onConfirm={(selectedTime) => {
                                    setStartTime(selectedTime);
                                    if (endTime.getTime() <= selectedTime.getTime()) {
                                        const nextHour = new Date(selectedTime);
                                        nextHour.setHours(nextHour.getHours() + 1);
                                        setEndTime(nextHour);
                                    }
                                }}
                            />

                            <TimePickerModal
                                visible={showEndTimePicker}
                                value={endTime}
                                title="Hora de Fin"
                                onClose={() => setShowEndTimePicker(false)}
                                onConfirm={(selectedTime) => {
                                    setEndTime(selectedTime);
                                }}
                            />

                            <RecurringDeleteModal
                                visible={isRecurringDeleteModalVisible}
                                eventTitle={title || existingEvent?.title}
                                occurrenceDate={eventDate}
                                onClose={() => setIsRecurringDeleteModalVisible(false)}
                                onConfirm={handleConfirmRecurringDelete}
                            />

                            {isEditing && existingEvent && (
                                <ShareModal
                                    visible={isShareModalVisible}
                                    onClose={() => setIsShareModalVisible(false)}
                                    targetType="event"
                                    targetId={existingEvent.id}
                                    targetTitle={title.trim() || existingEvent.title || 'Evento'}
                                    isOwner={existingEvent.is_shared !== 1}
                                />
                            )}
                        </Reanimated.View>
                    </View>
                </Reanimated.View>
            </Reanimated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: 1,
    },
    container: {
        flex: 1,
    },
    morphBottomBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        justifyContent: 'center',
        zIndex: 20,
    },
    morphBarContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        height: 58,
        paddingHorizontal: 12,
    },
    morphTabButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
    },
    morphIconContainer: {
        width: 36,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    morphTabLabel: {
        fontSize: 11,
        letterSpacing: 0.1,
        fontWeight: '500',
    },
    morphFabSlot: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -16,
    },
    morphFabButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    headerCenter: {
        flex: 1,
        paddingHorizontal: 8,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerSaveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
    },
    headerSaveText: {
        fontSize: 13.5,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
        gap: 20,
    },
    sectionWrapper: {
        gap: 10,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
    },
    sectionHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    sectionIconBadge: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    sectionSubtitle: {
        fontSize: 12,
        marginTop: 1,
    },
    counterPill: {
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 10,
    },
    counterPillText: {
        fontSize: 12,
        fontWeight: '700',
    },
    sectionCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        gap: 12,
    },
    heroTopMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    typePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    typePillText: {
        fontSize: 10.5,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    titleInput: {
        fontSize: 21,
        fontWeight: '700',
        paddingVertical: 4,
        paddingHorizontal: 0,
    },
    notesFieldWrapper: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    descInput: {
        flex: 1,
        fontSize: 14.5,
        lineHeight: 21,
        minHeight: 46,
        paddingVertical: 0,
        paddingHorizontal: 0,
        textAlignVertical: 'top',
    },
    cardInternalDivider: {
        height: 1,
        width: '100%',
    },
    microLabel: {
        fontSize: 10.5,
        fontWeight: '700',
        letterSpacing: 0.7,
        marginBottom: 6,
    },
    interactiveRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    rowIconLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    rowMiniIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
    rowHint: {
        fontSize: 11.5,
        marginTop: 1,
    },
    valuePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: 10,
        borderWidth: 1,
    },
    valuePillText: {
        fontSize: 13,
        fontWeight: '700',
    },
    switchBtn: {
        width: 44,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
    },
    switchThumb: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    timeRangeGrid: {
        flexDirection: 'row',
        gap: 10,
    },
    timeRangeBox: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        gap: 4,
    },
    timeRangeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    timeRangeLabel: {
        fontSize: 10.5,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    timeRangeValue: {
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    recurrenceGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    recurrenceOptionPill: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
    },
    recurrenceOptionText: {
        fontSize: 13,
    },
    daysSelectorBlock: {
        marginTop: 2,
    },
    daysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 6,
    },
    dayButton: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        gap: 2,
    },
    dayLetter: {
        fontSize: 13,
    },
    dayShortName: {
        fontSize: 9.5,
        fontWeight: '600',
    },
    flatBoxInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 12,
        paddingRight: 8,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
    },
    flatBoxTextInput: {
        flex: 1,
        fontSize: 13.5,
        paddingVertical: 4,
        paddingHorizontal: 0,
    },
    inlineAddBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    inlineAddBtnText: {
        fontSize: 12,
        fontWeight: '700',
    },
    colorHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    selectedColorLabel: {
        fontSize: 12,
        fontWeight: '700',
    },
    colorPaletteRow: {
        flexDirection: 'row',
        gap: 8,
        paddingVertical: 2,
    },
    colorSwatchItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
    },
    colorBall: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    colorSwatchName: {
        fontSize: 12.5,
    },
    priorityCardsGrid: {
        flexDirection: 'row',
        gap: 8,
    },
    priorityOptionCard: {
        flex: 1,
        padding: 11,
        borderRadius: 12,
        gap: 4,
    },
    priorityCardTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    priorityIconCircle: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    priorityCheckDot: {
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    priorityOptionTitle: {
        fontSize: 13.5,
    },
    priorityOptionSub: {
        fontSize: 11,
    },
    priorityInfoBanner: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderLeftWidth: 3.5,
    },
    priorityInfoText: {
        fontSize: 12.5,
        lineHeight: 18,
    },
    avisosList: {
        gap: 6,
    },
    avisoItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
    },
    avisoLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    avisoText: {
        fontSize: 13.5,
        fontWeight: '500',
    },
    addFullBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
    },
    addFullBtnText: {
        fontSize: 13,
        fontWeight: '700',
    },
    emptyHintText: {
        fontSize: 12.5,
        textAlign: 'center',
        paddingVertical: 4,
    },
    activeTagsBlock: {
        gap: 2,
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    tagBadgeActive: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        gap: 6,
    },
    tagBadgeText: {
        fontSize: 12.5,
    },
    tagRemoveBtn: {
        padding: 2,
    },
    suggestedTagsBlock: {
        gap: 2,
    },
    tagChipsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    tagChipPreset: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
    },
    tagChipPresetText: {
        fontSize: 12.5,
    },
    linkedNoteBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    linkedCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    linkedNoteTitle: {
        fontSize: 14,
        fontWeight: '700',
    },
    linkedNoteDate: {
        fontSize: 11.5,
        marginTop: 2,
    },
    linkedCardActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    noteSmallPill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noteSmallPillText: {
        fontSize: 12.5,
        fontWeight: '700',
    },
    noteOptionsGrid: {
        flexDirection: 'row',
        gap: 10,
    },
    noteOptionTile: {
        flex: 1,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        gap: 4,
    },
    attachTileIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    noteTileTitle: {
        fontSize: 13.5,
        fontWeight: '700',
    },
    noteTileSub: {
        fontSize: 11.5,
        lineHeight: 15,
    },
    avisoOptionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 13,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    avisoOptionLabel: {
        fontSize: 14,
    },
    alreadyAddedBadge: {
        fontSize: 12,
        fontWeight: '500',
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
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: '700',
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 12,
        gap: 8,
        marginBottom: 12,
    },
    searchTextInput: {
        flex: 1,
        fontSize: 14,
        padding: 0,
    },
    noteRowItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    noteRowText: {
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    emptyModalText: {
        textAlign: 'center',
        paddingVertical: 24,
        fontSize: 13,
    },
    descInputStandalone: {
        fontSize: 14,
        lineHeight: 21,
        minHeight: 70,
        textAlignVertical: 'top',
        padding: 4,
    },
    advancedAccordionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 16,
        borderWidth: 1,
        marginTop: 6,
    },
    advancedAccordionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    advancedIconBadge: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    advancedTitle: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    advancedSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    advancedCountBadge: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
        borderWidth: 1,
    },
    advancedCountText: {
        fontSize: 11,
        fontWeight: '700',
    },
    advancedChevronCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
    advancedContentBlock: {
        gap: 16,
        marginTop: 4,
    },
});