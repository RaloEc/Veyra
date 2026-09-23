import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    Platform,
    Modal,
    BackHandler,
    useWindowDimensions,
} from 'react-native';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    interpolate,
    interpolateColor,
    Extrapolation,
    Easing as ReanimatedEasing,
    runOnJS,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useScreenInsets } from '../../src/hooks/useScreenInsets';
import {
    ChevronLeft,
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
} from '@tamagui/lucide-icons';
import { format, addHours } from 'date-fns';
import { es } from 'date-fns/locale';

import { useStore } from '../../src/store/useStore';
import { useEventsStore } from '../../src/store/useEventsStore';
import { useNotesStore } from '../../src/store/useNotesStore';
import { useVeyraTheme } from '../../src/theme/useVeyraTheme';
import { VeyraSurface } from '../../src/components/ui/VeyraSurface';
import { VeyraButton } from '../../src/components/ui/VeyraButton';
import { VeyraIconButton } from '../../src/components/ui/VeyraIconButton';
import { DatePickerModal, TimePickerModal } from '../../src/components/ui';
import { CalendarEvent, Note } from '../../src/types/db';

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
    { label: 'L', name: 'Lunes', day: 1 },
    { label: 'M', name: 'Martes', day: 2 },
    { label: 'M', name: 'Miércoles', day: 3 },
    { label: 'J', name: 'Jueves', day: 4 },
    { label: 'V', name: 'Viernes', day: 5 },
    { label: 'S', name: 'Sábado', day: 6 },
    { label: 'D', name: 'Domingo', day: 0 },
];

export default function CreateOrEditEventScreen() {
    const router = useRouter();
    const { insets, bottom: bottomInset } = useScreenInsets();
    const { id, initialDate } = useLocalSearchParams<{ id?: string; initialDate?: string }>();
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();

    const { events, createEvent, updateEvent, deleteEvent, linkNoteToEvent, unlinkNoteFromEvent } = useEventsStore();
    const { notes, addNote } = useNotesStore();

    const isEditing = Boolean(id && id !== 'create');
    const existingEvent = isEditing ? events.find(e => e.id === id) : null;

    // Estado de formulario
    const [title, setTitle] = useState(existingEvent?.title || '');
    const [description, setDescription] = useState(existingEvent?.description || '');
    const [location, setLocation] = useState(existingEvent?.location || '');
    const [selectedColor, setSelectedColor] = useState(existingEvent?.color || EVENT_COLORS[0].color);

    // Múltiples avisos preventivos en pila
    const [selectedOffsets, setSelectedOffsets] = useState<number[]>(() => {
        if (existingEvent?.notification_offsets) {
            try {
                const parsed = JSON.parse(existingEvent.notification_offsets);
                if (Array.isArray(parsed)) return parsed.sort((a, b) => a - b);
            } catch {}
        }
        if (existingEvent?.notification_offset_min !== undefined && existingEvent?.notification_offset_min !== null) {
            return [existingEvent.notification_offset_min];
        }
        if (existingEvent) {
            return [];
        }
        return [15]; // Por defecto 15 min antes para eventos nuevos
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

    // Fechas y horas
    const initialBaseDate = initialDate ? new Date(initialDate) : new Date();
    const [eventDate, setEventDate] = useState<Date>(
        existingEvent ? new Date(existingEvent.start_time_ms) : initialBaseDate
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
        if (!existingEvent?.repeat_rule) return false;
        try {
            const parsed = JSON.parse(existingEvent.repeat_rule);
            return parsed.type === 'weekly';
        } catch {
            return false;
        }
    });
    const [selectedDays, setSelectedDays] = useState<number[]>(() => {
        if (!existingEvent?.repeat_rule) return [eventDate.getDay()];
        try {
            const parsed = JSON.parse(existingEvent.repeat_rule);
            return Array.isArray(parsed.days) ? parsed.days : [eventDate.getDay()];
        } catch {
            return [eventDate.getDay()];
        }
    });

    // Enlace a nota
    const [linkedNoteId, setLinkedNoteId] = useState<string | null>(existingEvent?.note_id || null);
    const [isLinkNoteModalVisible, setIsLinkNoteModalVisible] = useState(false);
    const [noteSearchQuery, setNoteSearchQuery] = useState('');

    // Pickers nativos
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false);

    const linkedNote = useMemo(() => {
        if (!linkedNoteId) return null;
        return notes.find(n => n.id === linkedNoteId) || null;
    }, [linkedNoteId, notes]);

    const filteredNotes = useMemo(() => {
        if (!noteSearchQuery.trim()) return notes;
        const q = noteSearchQuery.toLowerCase();
        return notes.filter(n => (n.title || 'Sin título').toLowerCase().includes(q));
    }, [notes, noteSearchQuery]);

    const toggleDay = (dayIndex: number) => {
        if (selectedDays.includes(dayIndex)) {
            if (selectedDays.length === 1) return; // Al menos un día seleccionado
            setSelectedDays(selectedDays.filter(d => d !== dayIndex));
        } else {
            setSelectedDays([...selectedDays, dayIndex].sort());
        }
    };

    const handleCreateNewNoteForEvent = async () => {
        const defaultTitle = title.trim() ? `${title.trim()} - ${format(eventDate, 'dd/MM/yyyy')}` : `Apuntes - ${format(eventDate, 'dd/MM/yyyy')}`;
        const newNote = await addNote(defaultTitle, '');
        if (newNote?.id) {
            setLinkedNoteId(newNote.id);
            Alert.alert('Nota Creada', `Se ha creado y vinculado la nota "${defaultTitle}".`);
        }
    };

    const handleSave = async () => {
        if (!title.trim()) {
            Alert.alert('Título requerido', 'Por favor ingresa un título para el evento.');
            return;
        }

        // Construir timestamps combinando eventDate con startTime y endTime
        const start = new Date(eventDate);
        start.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);

        const end = new Date(eventDate);
        end.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);

        if (end.getTime() <= start.getTime()) {
            Alert.alert('Horario no válido', 'La hora de finalización debe ser posterior a la hora de inicio.');
            return;
        }

        const repeatRule = isRecurring
            ? JSON.stringify({ type: 'weekly', days: selectedDays })
            : undefined;

        const notificationOffsetsJson = JSON.stringify(selectedOffsets);
        const primaryOffset = selectedOffsets.length > 0 ? selectedOffsets[0] : null;

        if (isEditing && existingEvent) {
            await updateEvent(existingEvent.id, {
                title: title.trim(),
                description: description.trim() || undefined,
                location: location.trim() || undefined,
                color: selectedColor,
                start_time_ms: start.getTime(),
                end_time_ms: end.getTime(),
                repeat_rule: repeatRule,
                notification_offset_min: primaryOffset ?? undefined,
                notification_offsets: notificationOffsetsJson,
                note_id: linkedNoteId,
            });
        } else {
            await createEvent({
                title: title.trim(),
                description: description.trim() || undefined,
                location: location.trim() || undefined,
                color: selectedColor,
                startTimeMs: start.getTime(),
                endTimeMs: end.getTime(),
                repeatRule,
                notificationOffsetMin: primaryOffset ?? undefined,
                notificationOffsets: notificationOffsetsJson,
                noteId: linkedNoteId,
            });
        }

        router.back();
    };

    const handleDelete = () => {
        if (!existingEvent) return;
        Alert.alert(
            'Eliminar Evento',
            '¿Estás seguro de que deseas eliminar este evento?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteEvent(existingEvent.id);
                        handleBack();
                    },
                },
            ]
        );
    };

    const { height: screenHeight } = useWindowDimensions();
    const layoutHeight = useSharedValue(screenHeight);
    const language = useStore(state => state.language);
    const bottomPadding = Math.max(bottomInset, 10);
    const barHeight = 58 + bottomPadding;
    const barBgColor = colors.navBar || (isDark ? '#1B1B1B' : '#FFFFFF');

    const morphProgress = useSharedValue(0);
    const isExiting = useRef(false);

    useEffect(() => {
        morphProgress.value = withTiming(1, {
            duration: 210,
            easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
        });
    }, []);

    const containerAnimatedStyle = useAnimatedStyle(() => {
        const totalHeight = layoutHeight.value > 0 ? layoutHeight.value : screenHeight;
        return {
            transform: [
                {
                    translateY: interpolate(
                        morphProgress.value,
                        [0, 1],
                        [totalHeight - barHeight, 0],
                        Extrapolation.CLAMP
                    ),
                },
            ],
        };
    });

    const formAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            morphProgress.value,
            [0.2, 0.9],
            [0, 1],
            Extrapolation.CLAMP
        ),
    }));

    const morphPreviewAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            morphProgress.value,
            [0, 0.18],
            [1, 0],
            Extrapolation.CLAMP
        ),
    }));

    const navigateBack = () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/');
        }
    };

    const handleBack = () => {
        if (isExiting.current) return;
        isExiting.current = true;
        morphProgress.value = withTiming(
            0,
            {
                duration: 180,
                easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
            },
            (finished) => {
                if (finished) {
                    runOnJS(navigateBack)();
                }
            }
        );
        setTimeout(() => {
            navigateBack();
        }, 150);
    };

    useFocusEffect(
        React.useCallback(() => {
            isExiting.current = false;
            morphProgress.value = withTiming(1, {
                duration: 210,
                easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
            });

            const onHardwareBack = () => {
                handleBack();
                return true;
            };
            const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
            return () => subscription.remove();
        }, [])
    );

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
            <Reanimated.View
                style={[
                    styles.screen,
                    {
                        backgroundColor: colors.bg,
                        borderTopColor: colors.borderSubtle,
                    },
                    containerAnimatedStyle,
                ]}
            >
                {/* Formulario de Evento (se desvanece suavemente en el morph) */}
                <Reanimated.View style={[{ flex: 1 }, formAnimatedStyle]}>
                    <SafeAreaView style={styles.container}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
                        <VeyraIconButton
                            icon={<ChevronLeft size={24} color={colors.textPrimary as any} />}
                            onPress={handleBack}
                            variant="ghost"
                            size="sm"
                        />
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                    {isEditing ? 'Editar Evento' : 'Nuevo Evento'}
                </Text>
                <View style={styles.headerActions}>
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
                                backgroundColor: title.trim() ? (accent.primary || '#3B82F6') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
                                opacity: title.trim() ? 1 : 0.45,
                            },
                        ]}
                    >
                        <Check size={15} color={title.trim() ? (isDark ? '#1B1B1B' : '#FFFFFF') : colors.textMuted} strokeWidth={3} />
                        <Text
                            style={[
                                styles.headerSaveText,
                                {
                                    color: title.trim() ? (isDark ? '#1B1B1B' : '#FFFFFF') : colors.textMuted,
                                },
                            ]}
                        >
                            Guardar
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 36 }]}
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator={false}
            >
                {/* Título y Descripción */}
                <VeyraSurface level={1} radius="lg" style={styles.section}>
                    <TextInput
                        placeholder="Título del evento (ej: Clase, Reunión...)"
                        placeholderTextColor={colors.textMuted}
                        value={title}
                        onChangeText={setTitle}
                        style={[styles.titleInput, { color: colors.textPrimary }]}
                        autoFocus={!isEditing}
                    />
                    <TextInput
                        placeholder="Descripción o notas adicionales (opcional)"
                        placeholderTextColor={colors.textMuted}
                        value={description}
                        onChangeText={setDescription}
                        style={[styles.descInput, { color: colors.textSecondary }]}
                        multiline
                    />
                </VeyraSurface>

                {/* Fecha y Horario (Rango Inicio - Fin) */}
                <VeyraSurface level={1} radius="lg" style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                        FECHA Y HORARIO
                    </Text>

                    {/* Fecha */}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setShowDatePicker(true)}
                        style={[styles.rowSelector, { borderBottomColor: colors.borderSubtle }]}
                    >
                        <View style={styles.rowIconLabel}>
                            <CalendarIcon size={18} color={accent.primary as any} />
                            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Fecha</Text>
                        </View>
                        <Text style={[styles.rowValue, { color: accent.primary }]}>
                            {format(eventDate, "EEEE, d 'de' MMMM", { locale: es })}
                        </Text>
                    </TouchableOpacity>

                    {/* Hora de Inicio */}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setShowStartTimePicker(true)}
                        style={[styles.rowSelector, { borderBottomColor: colors.borderSubtle }]}
                    >
                        <View style={styles.rowIconLabel}>
                            <Clock size={18} color={accent.primary as any} />
                            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Hora de inicio</Text>
                        </View>
                        <Text style={[styles.rowValue, { color: accent.primary }]}>
                            {format(startTime, 'HH:mm')}
                        </Text>
                    </TouchableOpacity>

                    {/* Hora de Fin */}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setShowEndTimePicker(true)}
                        style={styles.rowSelector}
                    >
                        <View style={styles.rowIconLabel}>
                            <Clock size={18} color={accent.primary as any} />
                            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Hora de fin</Text>
                        </View>
                        <Text style={[styles.rowValue, { color: accent.primary }]}>
                            {format(endTime, 'HH:mm')}
                        </Text>
                    </TouchableOpacity>
                </VeyraSurface>

                {/* Recurrencia Semanal */}
                <VeyraSurface level={1} radius="lg" style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                        <View style={styles.rowIconLabel}>
                            <Repeat size={18} color={colors.textSecondary as any} />
                            <Text style={[styles.sectionTitleNoMargin, { color: colors.textSecondary }]}>
                                REPETIR SEMANALMENTE
                            </Text>
                        </View>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => setIsRecurring(!isRecurring)}
                            style={[
                                styles.switchBtn,
                                {
                                    backgroundColor: isRecurring ? accent.primary : (isDark ? '#334155' : '#E2E8F0'),
                                },
                            ]}
                        >
                            <View
                                style={[
                                    styles.switchThumb,
                                    {
                                        transform: [{ translateX: isRecurring ? 18 : 2 }],
                                        backgroundColor: '#FFFFFF',
                                    },
                                ]}
                            />
                        </TouchableOpacity>
                    </View>

                    {isRecurring && (
                        <View style={styles.daysContainer}>
                            <Text style={[styles.helperText, { color: colors.textMuted }]}>
                                Selecciona los días que se repite este evento:
                            </Text>
                            <View style={styles.daysRow}>
                                {WEEKDAYS.map(w => {
                                    const selected = selectedDays.includes(w.day);
                                    return (
                                        <TouchableOpacity
                                            key={w.day}
                                            activeOpacity={0.7}
                                            onPress={() => toggleDay(w.day)}
                                            style={[
                                                styles.dayCircle,
                                                {
                                                    backgroundColor: selected ? accent.primary : (isDark ? '#1E293B' : '#F1F5F9'),
                                                    borderColor: selected ? accent.primary : colors.borderSubtle,
                                                },
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.dayText,
                                                    {
                                                        color: selected ? '#FFFFFF' : colors.textSecondary,
                                                        fontWeight: selected ? '700' : '500',
                                                    },
                                                ]}
                                            >
                                                {w.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    )}
                </VeyraSurface>

                {/* Ubicación o Enlace */}
                <VeyraSurface level={1} radius="lg" style={styles.section}>
                    <View style={styles.rowIconLabel}>
                        <MapPin size={18} color={colors.textSecondary as any} />
                        <Text style={[styles.sectionTitleNoMargin, { color: colors.textSecondary }]}>
                            UBICACIÓN O ENLACE
                        </Text>
                    </View>
                    <TextInput
                        placeholder="Aula 302, Sala de Juntas, o link de Meet/Zoom"
                        placeholderTextColor={colors.textMuted}
                        value={location}
                        onChangeText={setLocation}
                        style={[styles.inputField, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
                    />
                </VeyraSurface>

                {/* Color del Evento */}
                <VeyraSurface level={1} radius="lg" style={styles.section}>
                    <View style={styles.rowIconLabel}>
                        <Palette size={18} color={colors.textSecondary as any} />
                        <Text style={[styles.sectionTitleNoMargin, { color: colors.textSecondary }]}>
                            COLOR DISTINTIVO
                        </Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorPaletteRow}>
                        {EVENT_COLORS.map(c => (
                            <TouchableOpacity
                                key={c.color}
                                activeOpacity={0.7}
                                onPress={() => setSelectedColor(c.color)}
                                style={[
                                    styles.colorBall,
                                    {
                                        backgroundColor: c.color,
                                        borderColor: selectedColor === c.color ? '#FFFFFF' : 'transparent',
                                        borderWidth: selectedColor === c.color ? 2 : 0,
                                    },
                                ]}
                            >
                                {selectedColor === c.color && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </VeyraSurface>

                {/* Avisos Preventivos en Pila con botón "+" */}
                <VeyraSurface level={1} radius="lg" style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                        <View style={styles.rowIconLabel}>
                            <Bell size={18} color={accent.primary as any} />
                            <Text style={[styles.sectionTitleNoMargin, { color: colors.textSecondary }]}>
                                AVISOS PREVENTIVOS
                            </Text>
                        </View>
                        {selectedOffsets.length > 0 && (
                            <Text style={[styles.badgeText, { color: accent.primary }]}>
                                {selectedOffsets.length} {selectedOffsets.length === 1 ? 'aviso' : 'avisos'}
                            </Text>
                        )}
                    </View>

                    {/* Pila de avisos configurados */}
                    {selectedOffsets.length === 0 ? (
                        <View style={styles.emptyAvisoBox}>
                            <Text style={[styles.emptyAvisoText, { color: colors.textMuted }]}>
                                Sin avisos configurados para este evento.
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.avisosStackContainer}>
                            {selectedOffsets.map(offset => (
                                <View
                                    key={offset}
                                    style={[
                                        styles.avisoStackedRow,
                                        {
                                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
                                            borderColor: colors.borderSubtle,
                                        },
                                    ]}
                                >
                                    <View style={styles.avisoStackedLeft}>
                                        <View style={[styles.avisoStackedIcon, { backgroundColor: `${accent.primary}18` }]}>
                                            <Bell size={13} color={accent.primary as any} />
                                        </View>
                                        <Text style={[styles.avisoStackedText, { color: colors.textPrimary }]}>
                                            {getOffsetLabel(offset)}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => handleRemoveOffset(offset)}
                                        style={styles.avisoStackedDelete}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <X size={16} color={colors.textMuted as any} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Botón "+" para agregar nuevo aviso */}
                    <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => setIsAddAvisoModalOpen(true)}
                        style={[
                            styles.addAvisoBtn,
                            {
                                borderColor: accent.primary + '50',
                                backgroundColor: isDark ? `${accent.primary}10` : `${accent.primary}08`,
                            },
                        ]}
                    >
                        <Plus size={16} color={accent.primary as any} strokeWidth={2.5} />
                        <Text style={[styles.addAvisoBtnText, { color: accent.primary }]}>
                            Agregar aviso
                        </Text>
                    </TouchableOpacity>
                </VeyraSurface>

                {/* SECCIÓN ESTRELLA: Enlace con Notas */}
                <VeyraSurface level={1} radius="lg" style={styles.section}>
                    <View style={styles.rowIconLabel}>
                        <FileText size={18} color="#3B82F6" />
                        <Text style={[styles.sectionTitleNoMargin, { color: colors.textSecondary }]}>
                            CUADERNO / NOTAS DEL EVENTO
                        </Text>
                    </View>

                    {linkedNote ? (
                        <View style={[styles.linkedCard, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.borderSubtle }]}>
                            <View style={styles.linkedCardContent}>
                                <FileText size={16} color="#3B82F6" />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.linkedNoteTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                                        {linkedNote.title || 'Sin título'}
                                    </Text>
                                    <Text style={[styles.linkedNoteDate, { color: colors.textMuted }]}>
                                        Nota vinculada
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.linkedCardActions}>
                                <TouchableOpacity
                                    onPress={() => router.push({ pathname: '/notes/[id]', params: { id: linkedNote.id } })}
                                    style={[styles.smallBtn, { backgroundColor: accent.primary + '20' }]}
                                >
                                    <Text style={[styles.smallBtnText, { color: accent.primary }]}>Abrir</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setLinkedNoteId(null)}
                                    style={[styles.smallBtn, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}
                                >
                                    <Unlink size={12} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.noNoteContainer}>
                            <Text style={[styles.helperText, { color: colors.textMuted }]}>
                                Vincula una nota para tomar apuntes de esta clase, minuta de reunión o notas importantes.
                            </Text>
                            <View style={styles.noNoteBtnRow}>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={handleCreateNewNoteForEvent}
                                    style={[styles.noteActionBtn, { backgroundColor: accent.primary }]}
                                >
                                    <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
                                    <Text style={styles.noteActionBtnText}>Crear nueva nota</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setIsLinkNoteModalVisible(true)}
                                    style={[styles.noteActionBtn, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
                                >
                                    <Link size={14} color={colors.textPrimary as any} />
                                    <Text style={[styles.noteActionBtnText, { color: colors.textPrimary }]}>Vincular existente</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </VeyraSurface>
            </ScrollView>

            {/* Modal para Vincular Nota Existente */}
            <Modal
                visible={isLinkNoteModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setIsLinkNoteModalVisible(false)}
            >
                <View style={styles.modalBackdrop}>
                    <TouchableOpacity style={styles.backdropDismiss} activeOpacity={1} onPress={() => setIsLinkNoteModalVisible(false)} />
                    <VeyraSurface level={2} radius="xl" style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Vincular Nota</Text>
                            <TouchableOpacity onPress={() => setIsLinkNoteModalVisible(false)}>
                                <X size={20} color={colors.textSecondary as any} />
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.searchBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                            <Search size={16} color={colors.textMuted} />
                            <TextInput
                                placeholder="Buscar nota..."
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
                    <VeyraSurface level={2} radius="xl" style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
                        <View style={styles.modalHeader}>
                            <View style={styles.rowIconLabel}>
                                <Bell size={18} color={accent.primary as any} />
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                                    Agregar Aviso Preventivo
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setIsAddAvisoModalOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <X size={20} color={colors.textSecondary as any} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ maxHeight: 360, marginTop: 10 }} showsVerticalScrollIndicator={false}>
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
                                            <Bell size={15} color={isAlreadyAdded ? (colors.textMuted as any) : (accent.primary as any)} />
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

            {/* Modales de Fecha y Hora Personalizados (estilo Veyra) */}
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
                    // Si la hora de fin es menor o igual a la nueva hora de inicio, ajustar fin automáticamente a +1h
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
                </SafeAreaView>
            </Reanimated.View>

            {/* Vista previa de la barra inferior (se fusiona hacia la barra inferior al colapsar) */}
            <Reanimated.View
                pointerEvents="none"
                style={[
                    styles.morphBottomBar,
                    {
                        height: barHeight,
                        paddingBottom: bottomPadding,
                        backgroundColor: barBgColor,
                    },
                    morphPreviewAnimatedStyle,
                ]}
            >
                <View style={styles.morphBarContent}>
                    {/* 1. Tab Recordatorios */}
                    <View style={styles.morphTabButton}>
                        <View style={styles.morphIconContainer}>
                            <Bell size={22} color={colors.textMuted as any} strokeWidth={2} />
                        </View>
                        <Text style={[styles.morphTabLabel, { color: colors.textMuted }]}>
                            {language === 'es' ? 'Recordatorios' : 'Reminders'}
                        </Text>
                    </View>

                    {/* 2. FAB Central (+) */}
                    <View style={styles.morphFabSlot}>
                        <View style={[styles.morphFabButton, { backgroundColor: accent.primary }]}>
                            <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
                        </View>
                    </View>

                    {/* 3. Tab Notas */}
                    <View style={styles.morphTabButton}>
                        <View style={styles.morphIconContainer}>
                            <Notebook size={22} color={colors.textMuted as any} strokeWidth={2} />
                        </View>
                        <Text style={[styles.morphTabLabel, { color: colors.textMuted }]}>
                            {language === 'es' ? 'Notas' : 'Notes'}
                        </Text>
                    </View>
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
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    morphBarContent: {
        height: 58,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: 24,
    },
    morphTabButton: {
        minWidth: 80,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingVertical: 4,
    },
    morphIconContainer: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        height: 24,
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
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 6,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
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
        paddingVertical: 7,
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
        padding: 16,
        gap: 14,
    },
    section: {
        padding: 16,
    },
    titleInput: {
        fontSize: 18,
        fontWeight: '700',
        paddingVertical: 4,
    },
    descInput: {
        fontSize: 14,
        marginTop: 8,
        minHeight: 40,
        textAlignVertical: 'top',
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
        marginBottom: 10,
    },
    sectionTitleNoMargin: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    rowSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    rowIconLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    rowLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
    rowValue: {
        fontSize: 14,
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
    daysContainer: {
        marginTop: 12,
    },
    helperText: {
        fontSize: 12,
        marginBottom: 8,
    },
    daysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    dayCircle: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    dayText: {
        fontSize: 13,
    },
    inputField: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginTop: 10,
        fontSize: 14,
    },
    colorPaletteRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 12,
        paddingVertical: 4,
    },
    colorBall: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '600',
    },
    emptyAvisoBox: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyAvisoText: {
        fontSize: 13,
    },
    avisosStackContainer: {
        gap: 8,
        marginTop: 10,
    },
    avisoStackedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
    },
    avisoStackedLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    avisoStackedIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avisoStackedText: {
        fontSize: 13,
        fontWeight: '600',
    },
    avisoStackedDelete: {
        padding: 4,
    },
    addAvisoBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderStyle: 'dashed',
        marginTop: 10,
    },
    addAvisoBtnText: {
        fontSize: 13,
        fontWeight: '700',
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
    linkedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        marginTop: 10,
    },
    linkedCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    linkedNoteTitle: {
        fontSize: 13,
        fontWeight: '700',
    },
    linkedNoteDate: {
        fontSize: 11,
        marginTop: 2,
    },
    linkedCardActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    smallBtn: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    smallBtnText: {
        fontSize: 12,
        fontWeight: '700',
    },
    noNoteContainer: {
        marginTop: 8,
    },
    noNoteBtnRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 6,
    },
    noteActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    noteActionBtnText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    backdropDismiss: {
        flex: 1,
    },
    modalSheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 16,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
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
});
