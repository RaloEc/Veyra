import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    ActivityIndicator,
    Alert,
    LayoutAnimation,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
    ChevronLeft,
    GraduationCap,
    Plus,
    Clock,
    MapPin,
    Calendar,
    ChevronRight,
    Share2,
    Trash2,
    Check,
} from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { useVeyraTheme } from '../../src/theme/useVeyraTheme';
import { VeyraSurface } from '../../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../../src/components/ui/VeyraIconButton';
import { VeyraButton } from '../../src/components/ui/VeyraButton';
import { EventService, CalendarEvent } from '../../src/services/eventService';
import { ReminderService } from '../../src/services/reminderService';
import { Reminder } from '../../src/types/db';
import { getDB } from '../../src/db';
import { WidgetService } from '../../src/services/widgetService';
import { useSelectionStore } from '../../src/store/useSelectionStore';
import { useShareEventsStore } from '../../src/store/useShareEventsStore';
import { BottomTabBar } from '../../src/components/layout/BottomTabBar';

export interface ScheduleItemView {
    id: string;
    originalId: string;
    title: string;
    description?: string;
    dayOfWeek: number; // 1 = Lunes ... 7 = Domingo
    startTime: string; // "08:00"
    endTime: string;   // "09:30"
    startTimeMs: number;
    endTimeMs: number;
    location?: string;
    color?: string;
    repeatRule?: string;
    tags?: string;
    type: 'event' | 'reminder';
    isOngoing?: boolean;
}

const DAYS_OF_WEEK = [
    { iso: 1, shortEs: 'Lun', shortEn: 'Mon', fullEs: 'Lunes', fullEn: 'Monday' },
    { iso: 2, shortEs: 'Mar', shortEn: 'Tue', fullEs: 'Martes', fullEn: 'Tuesday' },
    { iso: 3, shortEs: 'Mié', shortEn: 'Wed', fullEs: 'Miércoles', fullEn: 'Wednesday' },
    { iso: 4, shortEs: 'Jue', shortEn: 'Thu', fullEs: 'Jueves', fullEn: 'Thursday' },
    { iso: 5, shortEs: 'Vie', shortEn: 'Fri', fullEs: 'Viernes', fullEn: 'Friday' },
    { iso: 6, shortEs: 'Sáb', shortEn: 'Sat', fullEs: 'Sábado', fullEn: 'Saturday' },
    { iso: 7, shortEs: 'Dom', shortEn: 'Sun', fullEs: 'Domingo', fullEn: 'Sunday' },
];

function getTodayIso(): number {
    const day = new Date().getDay();
    return day === 0 ? 7 : day;
}

function parseTimeToMinutes(timeStr: string): number {
    if (!timeStr || !timeStr.includes(':')) return 0;
    try {
        const [h, m] = timeStr.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    } catch {
        return 0;
    }
}

export default function ScheduleScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ id?: string }>();
    const { colors, accent, isDark } = useVeyraTheme();
    const { i18n } = useTranslation();
    const insets = useSafeAreaInsets();
    const isEs = i18n.language !== 'en';

    const [todayIso] = useState<number>(getTodayIso);
    const [selectedDay, setSelectedDay] = useState<number>(getTodayIso);
    const [items, setItems] = useState<ScheduleItemView[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [highlightedId, setHighlightedId] = useState<string | undefined>(params.id);

    // Selección múltiple
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const isSelectionMode = selectedIds.length > 0;

    const pad = (n: number) => n.toString().padStart(2, '0');

    const isClassTagged = useCallback((tags?: string, title?: string, description?: string): boolean => {
        if (tags) {
            try {
                const parsed = JSON.parse(tags);
                if (Array.isArray(parsed)) {
                    if (parsed.some(t => typeof t === 'string' && t.trim().toLowerCase().replace(/^#/, '') === 'clase')) {
                        return true;
                    }
                } else if (typeof parsed === 'string') {
                    if (parsed.trim().toLowerCase().replace(/^#/, '') === 'clase') {
                        return true;
                    }
                }
            } catch {
                if (tags.toLowerCase().replace(/#/g, '').includes('clase')) return true;
            }
        }
        const text = `${title || ''} ${description || ''}`.toLowerCase();
        return /(?:^|\s|[#])clase(?:s)?\b/i.test(text);
    }, []);

    const getScheduleIsoDays = useCallback((startMs: number, repeatRuleStr?: string): number[] => {
        const start = new Date(startMs);
        const defaultIso = start.getDay() === 0 ? 7 : start.getDay();

        if (!repeatRuleStr || repeatRuleStr === 'null') {
            return [defaultIso];
        }

        try {
            const rr = typeof repeatRuleStr === 'object' ? repeatRuleStr : JSON.parse(repeatRuleStr);
            if (rr) {
                if (rr.type === 'daily') {
                    return [1, 2, 3, 4, 5, 6, 7];
                }
                if (rr.type === 'weekdays') {
                    return [1, 2, 3, 4, 5];
                }
                if (rr.type === 'weekly') {
                    if (Array.isArray(rr.days) && rr.days.length > 0) {
                        return rr.days.map((d: number) => (d === 0 ? 7 : d));
                    }
                    return [defaultIso];
                }
            }
        } catch {}

        return [defaultIso];
    }, []);

    const cleanSubject = useCallback((rawTitle: string): string => {
        const cleaned = rawTitle.replace(/#clase(?:s)?\b/gi, '').trim();
        return cleaned.length > 0 ? cleaned : rawTitle.trim();
    }, []);

    const loadScheduleData = useCallback(async () => {
        try {
            const result: ScheduleItemView[] = [];

            // 1. Obtener eventos de calendario
            try {
                const allEvents = await EventService.getAllEvents();
                const classEvents = allEvents.filter(e => !e.deleted && isClassTagged(e.tags, e.title, e.description));

                for (const e of classEvents) {
                    const start = new Date(e.start_time_ms);
                    const end = new Date(e.end_time_ms && e.end_time_ms > e.start_time_ms ? e.end_time_ms : e.start_time_ms + 50 * 60 * 1000);
                    const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
                    const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
                    const isoDays = getScheduleIsoDays(e.start_time_ms, e.repeat_rule);

                    for (const dayIso of isoDays) {
                        result.push({
                            id: isoDays.length > 1 ? `${e.id}_${dayIso}` : e.id,
                            originalId: e.id,
                            title: cleanSubject(e.title),
                            description: e.description,
                            dayOfWeek: dayIso,
                            startTime,
                            endTime,
                            startTimeMs: e.start_time_ms,
                            endTimeMs: end.getTime(),
                            location: e.location || '',
                            color: e.color || '',
                            repeatRule: e.repeat_rule,
                            tags: e.tags,
                            type: 'event',
                        });
                    }
                }
            } catch (err) {
                console.warn('[ScheduleScreen] Error cargando eventos:', err);
            }

            // 2. Obtener recordatorios con #clase
            try {
                const db = await getDB();
                const activeReminders = await db.getAllAsync<Reminder>(
                    `SELECT * FROM reminders WHERE deleted = 0 AND (status = 'pending' OR status = 'snoozed')`
                );
                const classReminders = activeReminders.filter(r => isClassTagged(undefined, r.title, r.description));

                for (const r of classReminders) {
                    const start = new Date(r.due_date_ms);
                    const end = new Date(r.due_date_ms + 50 * 60 * 1000);
                    const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
                    const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
                    const isoDays = getScheduleIsoDays(r.due_date_ms, r.repeat_rule);

                    for (const dayIso of isoDays) {
                        result.push({
                            id: isoDays.length > 1 ? `${r.id}_${dayIso}` : r.id,
                            originalId: r.id,
                            title: cleanSubject(r.title),
                            description: r.description,
                            dayOfWeek: dayIso,
                            startTime,
                            endTime,
                            startTimeMs: r.due_date_ms,
                            endTimeMs: end.getTime(),
                            location: '',
                            color: '',
                            repeatRule: r.repeat_rule,
                            tags: '["clase"]',
                            type: 'reminder',
                        });
                    }
                }
            } catch (err) {
                console.warn('[ScheduleScreen] Error cargando recordatorios:', err);
            }

            setItems(result);

            // Sincronizar el widget en background
            WidgetService.syncSchedule().catch(() => {});
        } finally {
            setIsLoading(false);
        }
    }, [isClassTagged, getScheduleIsoDays, cleanSubject]);

    useFocusEffect(
        useCallback(() => {
            loadScheduleData();
            return () => {
                useSelectionStore.getState().clearSelection();
            };
        }, [loadScheduleData])
    );

    // Si viene un ID como parámetro, seleccionar el día de esa clase
    useEffect(() => {
        if (params.id && items.length > 0) {
            const cleanTargetId = params.id.split('_')[0];
            const found = items.find(it => it.originalId === cleanTargetId || it.id === params.id);
            if (found) {
                setSelectedDay(found.dayOfWeek);
                setHighlightedId(cleanTargetId);
            }
        }
    }, [params.id, items]);

    // Calcular clases en curso si es el día de hoy
    const now = new Date();
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

    const classesForSelectedDay = useMemo(() => {
        return items
            .filter(item => item.dayOfWeek === selectedDay)
            .map(item => {
                const startM = parseTimeToMinutes(item.startTime);
                const endM = parseTimeToMinutes(item.endTime);
                const isOngoing = selectedDay === todayIso && currentTotalMinutes >= startM && currentTotalMinutes <= endM;
                return { ...item, isOngoing };
            })
            .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
    }, [items, selectedDay, todayIso, currentTotalMinutes]);

    const ongoingClass = useMemo(() => {
        return classesForSelectedDay.find(c => c.isOngoing);
    }, [classesForSelectedDay]);

    // Selección lógica
    const isAllSelected = classesForSelectedDay.length > 0 && classesForSelectedDay.every(c => selectedIds.includes(c.id));

    const toggleSelect = useCallback((id: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    }, []);

    const toggleSelectAll = useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        if (isAllSelected) {
            setSelectedIds([]);
        } else {
            setSelectedIds(classesForSelectedDay.map(c => c.id));
        }
    }, [isAllSelected, classesForSelectedDay]);

    const handleDeleteSelected = useCallback(async () => {
        const selectedItems = items.filter(it => selectedIds.includes(it.id));
        if (selectedItems.length === 0) return;

        Alert.alert(
            isEs ? 'Eliminar Clases' : 'Delete Classes',
            isEs
                ? `¿Estás seguro de que deseas eliminar las ${selectedItems.length} clases seleccionadas?`
                : `Are you sure you want to delete the ${selectedItems.length} selected classes?`,
            [
                { text: isEs ? 'Cancelar' : 'Cancel', style: 'cancel' },
                {
                    text: isEs ? 'Eliminar' : 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        const uniqueIds = Array.from(new Set(selectedItems.map(it => it.originalId)));
                        for (const targetId of uniqueIds) {
                            const item = selectedItems.find(it => it.originalId === targetId);
                            if (item?.type === 'event') {
                                await EventService.deleteEvent(targetId);
                            } else if (item?.type === 'reminder') {
                                await ReminderService.deleteReminder(targetId);
                            }
                        }
                        setSelectedIds([]);
                        useSelectionStore.getState().clearSelection();
                        loadScheduleData();
                    },
                },
            ]
        );
    }, [items, selectedIds, isEs, loadScheduleData]);

    // Conexión con useSelectionStore para mostrar la barra flotante existente
    useEffect(() => {
        if (selectedIds.length > 0) {
            useSelectionStore.getState().setSelection({
                title: `${selectedIds.length} ${isEs ? (selectedIds.length === 1 ? 'seleccionada' : 'seleccionadas') : 'selected'}`,
                isAllSelected,
                selectAllText: isAllSelected
                    ? (isEs ? 'Deseleccionar' : 'Deselect')
                    : (isEs ? 'Todos' : 'All'),
                onToggleSelectAll: toggleSelectAll,
                onClose: () => setSelectedIds([]),
                actions: [
                    {
                        id: 'share',
                        label: isEs ? 'Compartir' : 'Share',
                        icon: (color) => <Share2 size={16} color={accent.primary} strokeWidth={2.4} />,
                        onPress: () => {
                            useShareEventsStore.getState().openShare(selectedEventsForSharing, {
                                onSuccess: () => {
                                    setSelectedIds([]);
                                    useSelectionStore.getState().clearSelection();
                                },
                            });
                        },
                        color: accent.primary,
                        bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    },
                    {
                        id: 'delete',
                        label: isEs ? 'Eliminar' : 'Delete',
                        icon: (color) => <Trash2 size={16} color={color} strokeWidth={2.4} />,
                        onPress: handleDeleteSelected,
                        color: isDark ? '#FB7185' : '#E11D48',
                        bg: isDark ? 'rgba(251, 113, 133, 0.15)' : 'rgba(225, 29, 72, 0.12)',
                    },
                ],
            });
        } else {
            useSelectionStore.getState().clearSelection();
        }
    }, [selectedIds, isAllSelected, isEs, accent.primary, isDark, toggleSelectAll, handleDeleteSelected]);

    const handleItemPress = (item: ScheduleItemView) => {
        if (isSelectionMode) {
            toggleSelect(item.id);
            return;
        }
        if (item.type === 'event') {
            router.push({ pathname: '/events/create', params: { id: item.originalId } } as any);
        } else {
            router.push(`/reminder/${item.originalId}` as any);
        }
    };

    const handleItemLongPress = (item: ScheduleItemView) => {
        toggleSelect(item.id);
    };

    const handleAddClass = () => {
        router.push({
            pathname: '/events/create',
            params: {
                tag: 'clase',
                dayOfWeek: selectedDay.toString(),
            },
        } as any);
    };

    // Convertir items seleccionados a formato CalendarEvent para el modal de compartir
    const selectedEventsForSharing = useMemo<CalendarEvent[]>(() => {
        const selected = items.filter(it => selectedIds.includes(it.id));
        return selected.map(it => ({
            id: it.originalId,
            title: it.title,
            description: it.description,
            start_time_ms: it.startTimeMs,
            end_time_ms: it.endTimeMs,
            location: it.location,
            color: it.color,
            repeat_rule: it.repeatRule,
            tags: it.tags || '["clase"]',
        }));
    }, [items, selectedIds]);

    const selectedDayObj = DAYS_OF_WEEK.find(d => d.iso === selectedDay) || DAYS_OF_WEEK[0];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
            <StatusBar
                barStyle={isDark ? 'light-content' : 'dark-content'}
                backgroundColor={colors.bg}
            />

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
                <VeyraIconButton
                    icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                    onPress={() => router.back()}
                    style={styles.backButton}
                />
                <View style={styles.headerTitleContainer}>
                    <View style={styles.titleRow}>
                        <GraduationCap size={22} color={accent.primary} />
                        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                            {isEs ? 'Horario de Clases' : 'Class Schedule'}
                        </Text>
                    </View>
                    <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                        {isEs ? 'Sincronizado con el widget' : 'Synced with home widget'}
                    </Text>
                </View>
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleAddClass}
                    style={[styles.addHeaderBtn, { backgroundColor: `${accent.primary}18`, borderColor: `${accent.primary}35` }]}
                >
                    <Plus size={20} color={accent.primary} />
                </TouchableOpacity>
            </View>

            {/* Selector de días de la semana (Lun - Dom) */}
            <View style={styles.weekSelectorContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.weekSelectorContent}
                >
                    {DAYS_OF_WEEK.map(day => {
                        const isSelected = day.iso === selectedDay;
                        const isToday = day.iso === todayIso;
                        const dayCount = items.filter(it => it.dayOfWeek === day.iso).length;

                        return (
                            <TouchableOpacity
                                key={day.iso}
                                activeOpacity={0.7}
                                onPress={() => {
                                    if (isSelectionMode) setSelectedIds([]);
                                    setSelectedDay(day.iso);
                                }}
                                style={[
                                    styles.dayChip,
                                    {
                                        backgroundColor: isSelected
                                            ? accent.primary
                                            : isDark ? '#1C1E22' : '#F1F5F9',
                                        borderColor: isSelected
                                            ? accent.primary
                                            : isToday ? `${accent.primary}50` : 'transparent',
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.dayChipText,
                                        {
                                            color: isSelected
                                                ? '#FFFFFF'
                                                : isToday ? accent.primary : colors.textPrimary,
                                            fontWeight: isSelected || isToday ? '700' : '500',
                                        },
                                    ]}
                                >
                                    {isEs ? day.shortEs : day.shortEn}
                                </Text>
                                {dayCount > 0 && (
                                    <View
                                        style={[
                                            styles.dayBadge,
                                            {
                                                backgroundColor: isSelected
                                                    ? 'rgba(255, 255, 255, 0.28)'
                                                    : `${accent.primary}20`,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.dayBadgeText,
                                                {
                                                    color: isSelected ? '#FFFFFF' : accent.primary,
                                                },
                                            ]}
                                        >
                                            {dayCount}
                                        </Text>
                                    </View>
                                )}
                                {isToday && !isSelected && (
                                    <View style={[styles.todayDot, { backgroundColor: accent.primary }]} />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Contenido principal */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={accent.primary} />
                </View>
            ) : (
                <ScrollView
                    style={styles.scrollArea}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Banner de resumen del día */}
                    <VeyraSurface level={1} radius="lg" style={styles.summaryCard}>
                        <View style={styles.summaryRow}>
                            <View>
                                <Text style={[styles.summaryDayName, { color: colors.textPrimary }]}>
                                    {isEs ? selectedDayObj.fullEs : selectedDayObj.fullEn}
                                    {selectedDay === todayIso && (
                                        <Text style={{ color: accent.primary, fontSize: 13, fontWeight: '700' }}>
                                            {'  · '}{isEs ? 'Hoy' : 'Today'}
                                        </Text>
                                    )}
                                </Text>
                                <Text style={[styles.summaryCount, { color: colors.textMuted }]}>
                                    {classesForSelectedDay.length === 0
                                        ? (isEs ? 'Sin clases programadas' : 'No classes scheduled')
                                        : classesForSelectedDay.length === 1
                                        ? (isEs ? '1 clase programada' : '1 class scheduled')
                                        : `${classesForSelectedDay.length} ${isEs ? 'clases programadas' : 'classes scheduled'}`}
                                </Text>
                            </View>

                            {ongoingClass && (
                                <View style={styles.ongoingBadge}>
                                    <View style={styles.ongoingDot} />
                                    <Text style={styles.ongoingBadgeText}>
                                        {isEs ? 'En curso' : 'Ongoing'}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </VeyraSurface>

                    {/* Lista de clases */}
                    {classesForSelectedDay.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? '#1C1E22' : '#F1F5F9' }]}>
                                <GraduationCap size={40} color={colors.textMuted} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                                {isEs ? 'No tienes clases este día' : 'No classes for this day'}
                            </Text>
                            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                                {isEs
                                    ? 'Crea un evento o recordatorio con el hashtag #clase para organizarlo aquí y sincronizarlo con el widget de inicio.'
                                    : 'Create an event or reminder with the tag #clase to organize it here and sync it with your home widget.'}
                            </Text>
                            <VeyraButton
                                label={isEs ? 'Añadir Clase' : 'Add Class'}
                                onPress={handleAddClass}
                                style={styles.emptyAddBtn}
                            />
                        </View>
                    ) : (
                        <View style={styles.classesList}>
                            {classesForSelectedDay.map(item => {
                                const isCurrent = item.isOngoing;
                                const isSelected = selectedIds.includes(item.id);
                                const isHighlighted = highlightedId === item.originalId;
                                const itemColor = item.color || accent.primary;

                                return (
                                    <TouchableOpacity
                                        key={item.id}
                                        activeOpacity={0.75}
                                        onPress={() => handleItemPress(item)}
                                        onLongPress={() => handleItemLongPress(item)}
                                    >
                                        <VeyraSurface
                                            level={isCurrent ? 2 : 1}
                                            radius="lg"
                                            style={[
                                                styles.classCard,
                                                isSelected && {
                                                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)',
                                                    borderColor: accent.primary,
                                                    borderWidth: 1.5,
                                                },
                                                !isSelected && isCurrent && {
                                                    borderColor: `${accent.primary}70`,
                                                    borderWidth: 1.5,
                                                },
                                                !isSelected && !isCurrent && isHighlighted && {
                                                    borderColor: accent.primary,
                                                    borderWidth: 2,
                                                },
                                            ]}
                                        >
                                            {/* Barra de color lateral */}
                                            <View style={[styles.colorBar, { backgroundColor: itemColor }]} />

                                            {/* Checkbox en modo de selección */}
                                            {isSelectionMode && (
                                                <View
                                                    style={[
                                                        styles.selectionCheck,
                                                        {
                                                            backgroundColor: isSelected ? accent.primary : 'transparent',
                                                            borderColor: isSelected ? accent.primary : colors.borderSubtle,
                                                        },
                                                    ]}
                                                >
                                                    {isSelected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                                                </View>
                                            )}

                                            <View style={styles.classCardContent}>
                                                <View style={styles.classTopRow}>
                                                    <Text
                                                        style={[styles.classTitle, { color: colors.textPrimary }]}
                                                        numberOfLines={1}
                                                    >
                                                        {item.title}
                                                    </Text>
                                                    {isCurrent && (
                                                        <View style={styles.ongoingPill}>
                                                            <View style={styles.ongoingDot} />
                                                            <Text style={styles.ongoingPillText}>
                                                                {isEs ? 'En curso' : 'Ongoing'}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>

                                                {/* Horario y Ubicación */}
                                                <View style={styles.classMetaRow}>
                                                    <View style={styles.metaItem}>
                                                        <Clock size={14} color={colors.textSecondary} />
                                                        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                                                            {item.startTime} - {item.endTime}
                                                        </Text>
                                                    </View>

                                                    {item.location ? (
                                                        <View style={[styles.metaItem, { marginLeft: 14 }]}>
                                                            <MapPin size={14} color={colors.textMuted} />
                                                            <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={1}>
                                                                {item.location}
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                </View>
                                            </View>

                                            {!isSelectionMode && (
                                                <ChevronRight size={18} color={colors.textMuted} style={styles.arrowIcon} />
                                            )}
                                        </VeyraSurface>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </ScrollView>
            )}

            {/* Barra inferior flotante unificada con morph de selección y compartir */}
            <BottomTabBar />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backButton: {
        marginRight: 8,
    },
    headerTitleContainer: {
        flex: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
    },
    headerSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    addHeaderBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
    },
    weekSelectorContainer: {
        paddingVertical: 10,
    },
    weekSelectorContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    dayChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1.5,
        gap: 6,
        position: 'relative',
    },
    dayChipText: {
        fontSize: 14,
    },
    dayBadge: {
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 1,
    },
    dayBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    todayDot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollArea: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    summaryCard: {
        padding: 16,
        marginBottom: 16,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    summaryDayName: {
        fontSize: 18,
        fontWeight: '700',
    },
    summaryCount: {
        fontSize: 13,
        marginTop: 4,
    },
    ongoingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(52, 211, 153, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        gap: 6,
    },
    ongoingDot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: '#10B981',
    },
    ongoingBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#10B981',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 48,
        paddingHorizontal: 24,
    },
    emptyIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    emptyAddBtn: {
        minWidth: 160,
    },
    classesList: {
        gap: 10,
    },
    classCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        overflow: 'hidden',
        position: 'relative',
    },
    colorBar: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
    },
    selectionCheck: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 4,
        marginRight: 10,
    },
    classCardContent: {
        flex: 1,
        paddingLeft: 6,
    },
    classTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    classTitle: {
        fontSize: 16,
        fontWeight: '700',
        flex: 1,
        marginRight: 8,
    },
    ongoingPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(52, 211, 153, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        gap: 5,
    },
    ongoingPillText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#10B981',
    },
    classMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    metaText: {
        fontSize: 13,
        fontWeight: '500',
    },
    arrowIcon: {
        marginLeft: 8,
    },
});
