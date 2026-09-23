import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    LayoutAnimation,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isToday,
    isPast,
} from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import {
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon,
    Plus,
    Check,
    Clock,
    CheckSquare,
} from '@tamagui/lucide-icons';

import { useStore } from '../../store/useStore';
import { Reminder } from '../../types/db';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import {
    VeyraSurface,
    VeyraCard,
    VeyraButton,
    VeyraIconButton,
} from '../ui';

interface MonthCalendarViewProps {
    onSelectReminder?: (id: string) => void;
}

export function MonthCalendarView({ onSelectReminder }: MonthCalendarViewProps) {
    const router = useRouter();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { colors, radii, spacing, accent, isDark, getControlLevelColor } = useVeyraTheme();
    const { reminders, markAsCompleted, language } = useStore();

    const locale = language === 'es' ? es : enUS;

    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'completed'>('all');
    const [completingId, setCompletingId] = useState<string | null>(null);

    // Navegación de mes
    const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
    const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
    const handleGoToToday = () => {
        const today = new Date();
        setCurrentMonth(today);
        setSelectedDate(today);
    };

    // Agrupación de recordatorios por día (formato YYYY-MM-DD)
    const remindersByDate = useMemo(() => {
        const map = new Map<string, Reminder[]>();
        reminders.forEach(reminder => {
            const dateKey = format(new Date(reminder.due_date_ms), 'yyyy-MM-dd');
            const list = map.get(dateKey) || [];
            list.push(reminder);
            map.set(dateKey, list);
        });
        return map;
    }, [reminders]);

    // Generar días del mes para la cuadrícula (incluye días adyacentes para completar semanas)
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Comienza en Lunes
        const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

        return eachDayOfInterval({ start: startDate, end: endDate });
    }, [currentMonth]);

    // Días de la semana para la cabecera (Lun - Dom)
    const weekDays = useMemo(() => {
        const sampleMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
        return Array.from({ length: 7 }, (_, i) => {
            const day = new Date(sampleMonday);
            day.setDate(sampleMonday.getDate() + i);
            return format(day, 'EEEEEE', { locale }); // 'Lu', 'Ma', 'Mi', etc. o 'Mo', 'Tu'
        });
    }, [locale]);

    // Recordatorios del día seleccionado
    const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');
    const dayReminders = useMemo(() => {
        const list = remindersByDate.get(selectedDateKey) || [];
        // Ordenar por hora
        const sorted = [...list].sort((a, b) => a.due_date_ms - b.due_date_ms);

        if (filterTab === 'pending') {
            return sorted.filter(r => r.status === 'pending');
        }
        if (filterTab === 'completed') {
            return sorted.filter(r => r.status === 'completed');
        }
        return sorted;
    }, [remindersByDate, selectedDateKey, filterTab]);

    const totalDayReminders = remindersByDate.get(selectedDateKey)?.length || 0;
    const pendingDayCount = (remindersByDate.get(selectedDateKey) || []).filter(r => r.status === 'pending').length;
    const completedDayCount = (remindersByDate.get(selectedDateKey) || []).filter(r => r.status === 'completed').length;

    const handleDayPress = (day: Date) => {
        setSelectedDate(day);
        if (!isSameMonth(day, currentMonth)) {
            setCurrentMonth(day);
        }
    };

    const handleCreateForDay = () => {
        const target = new Date(selectedDate);
        const now = new Date();
        if (isSameDay(target, now)) {
            target.setHours(now.getHours() + 1, 0, 0, 0);
        } else {
            target.setHours(9, 0, 0, 0);
        }
        router.push({
            pathname: '/create',
            params: { initialDate: target.getTime().toString() },
        });
    };

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
            showsVerticalScrollIndicator={false}
        >
            {/* Header del Calendario: Mes, Año y Controles */}
            <VeyraSurface level={1} radius="xl" style={styles.calendarCard}>
                <View style={styles.headerRow}>
                    <View style={styles.monthTitleWrapper}>
                        <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
                            {format(currentMonth, 'MMMM yyyy', { locale })}
                        </Text>
                        {!isSameMonth(currentMonth, new Date()) && (
                            <TouchableOpacity
                                style={[styles.todayButton, { backgroundColor: accent.primary + '20' }]}
                                onPress={handleGoToToday}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.todayButtonText, { color: accent.primary }]}>
                                    {t('calendar.today')}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.navButtonsRow}>
                        <VeyraIconButton
                            variant="ghost"
                            size="sm"
                            icon={<ChevronLeft size={20} color={colors.textPrimary as any} />}
                            onPress={handlePrevMonth}
                        />
                        <VeyraIconButton
                            variant="ghost"
                            size="sm"
                            icon={<ChevronRight size={20} color={colors.textPrimary as any} />}
                            onPress={handleNextMonth}
                        />
                    </View>
                </View>

                {/* Días de la Semana */}
                <View style={styles.weekDaysRow}>
                    {weekDays.map((dayName, idx) => (
                        <Text
                            key={`wd-${idx}`}
                            style={[
                                styles.weekDayText,
                                { color: colors.textMuted },
                            ]}
                        >
                            {dayName.toUpperCase()}
                        </Text>
                    ))}
                </View>

                {/* Cuadrícula de Días */}
                <View style={styles.grid}>
                    {calendarDays.map((day, idx) => {
                        const isCurrentMonth = isSameMonth(day, currentMonth);
                        const isSelected = isSameDay(day, selectedDate);
                        const isTodayDay = isToday(day);
                        const dayKey = format(day, 'yyyy-MM-dd');
                        const dayItems = remindersByDate.get(dayKey) || [];

                        // Categorización de puntos indicadores
                        const hasCritical = dayItems.some(r => r.status === 'pending' && r.control_level === 'critical');
                        const hasStrict = dayItems.some(r => r.status === 'pending' && r.control_level === 'strict');
                        const hasNormal = dayItems.some(r => r.status === 'pending' && r.control_level === 'normal');
                        const hasCompleted = dayItems.some(r => r.status === 'completed');

                        return (
                            <TouchableOpacity
                                key={`day-${idx}`}
                                style={styles.dayCell}
                                activeOpacity={0.7}
                                onPress={() => handleDayPress(day)}
                            >
                                <View
                                    style={[
                                        styles.dayInner,
                                        isSelected && [styles.selectedDay, { backgroundColor: accent.primary }],
                                        isTodayDay && !isSelected && [styles.todayDay, { borderColor: accent.primary }],
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.dayNumber,
                                            {
                                                color: isSelected
                                                    ? '#ffffff'
                                                    : !isCurrentMonth
                                                    ? colors.textMuted + '66'
                                                    : isTodayDay
                                                    ? accent.primary
                                                    : colors.textPrimary,
                                                fontWeight: isSelected || isTodayDay ? '700' : '500',
                                            },
                                        ]}
                                    >
                                        {format(day, 'd')}
                                    </Text>

                                    {/* Puntos de estado de recordatorios */}
                                    {dayItems.length > 0 && (
                                        <View style={styles.dotsRow}>
                                            {hasCritical && (
                                                <View
                                                    style={[
                                                        styles.dot,
                                                        { backgroundColor: isSelected ? '#ffffff' : (isDark ? '#FB7185' : '#E11D48') },
                                                    ]}
                                                />
                                            )}
                                            {hasStrict && !hasCritical && (
                                                <View
                                                    style={[
                                                        styles.dot,
                                                        { backgroundColor: isSelected ? '#ffffff' : (isDark ? '#FBBF24' : '#F59E0B') },
                                                    ]}
                                                />
                                            )}
                                            {hasNormal && (!hasCritical || !hasStrict) && (
                                                <View
                                                    style={[
                                                        styles.dot,
                                                        { backgroundColor: isSelected ? '#ffffff' : accent.primary },
                                                    ]}
                                                />
                                            )}
                                            {hasCompleted && !hasCritical && !hasStrict && !hasNormal && (
                                                <View
                                                    style={[
                                                        styles.dot,
                                                        { backgroundColor: isSelected ? '#ffffff' : (isDark ? '#34D399' : '#10B981') },
                                                    ]}
                                                />
                                            )}
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </VeyraSurface>

            {/* Panel de Agenda del Día Seleccionado */}
            <View style={styles.agendaSection}>
                <View style={styles.agendaHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.agendaDateTitle, { color: colors.textPrimary }]}>
                            {format(selectedDate, language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale })}
                        </Text>
                        <Text style={[styles.agendaSubtitle, { color: colors.textSecondary }]}>
                            {isToday(selectedDate)
                                ? t('calendar.today') + ' • '
                                : ''}
                            {totalDayReminders === 1
                                ? t('calendar.reminders_count', { count: totalDayReminders })
                                : t('calendar.reminders_count_plural', { count: totalDayReminders })}
                        </Text>
                    </View>

                    <VeyraButton
                        variant="secondary"
                        size="sm"
                        radius="pill"
                        label={t('calendar.create_for_day')}
                        iconLeft={<Plus size={14} color={accent.primary} />}
                        onPress={handleCreateForDay}
                    />
                </View>

                {/* Filtros de estado para el día */}
                {totalDayReminders > 0 && (
                    <View style={styles.filterTabsRow}>
                        <TouchableOpacity
                            style={[
                                styles.filterTab,
                                filterTab === 'all' && [styles.filterTabActive, { backgroundColor: accent.primary + '20', borderColor: accent.primary }],
                            ]}
                            onPress={() => setFilterTab('all')}
                        >
                            <Text
                                style={[
                                    styles.filterTabText,
                                    { color: filterTab === 'all' ? accent.primary : colors.textSecondary },
                                ]}
                            >
                                {t('calendar.all')} ({totalDayReminders})
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.filterTab,
                                filterTab === 'pending' && [styles.filterTabActive, { backgroundColor: accent.primary + '20', borderColor: accent.primary }],
                            ]}
                            onPress={() => setFilterTab('pending')}
                        >
                            <Text
                                style={[
                                    styles.filterTabText,
                                    { color: filterTab === 'pending' ? accent.primary : colors.textSecondary },
                                ]}
                            >
                                {t('calendar.pending')} ({pendingDayCount})
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.filterTab,
                                filterTab === 'completed' && [styles.filterTabActive, { backgroundColor: accent.primary + '20', borderColor: accent.primary }],
                            ]}
                            onPress={() => setFilterTab('completed')}
                        >
                            <Text
                                style={[
                                    styles.filterTabText,
                                    { color: filterTab === 'completed' ? accent.primary : colors.textSecondary },
                                ]}
                            >
                                {t('calendar.completed')} ({completedDayCount})
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Lista de recordatorios del día */}
                {dayReminders.length > 0 ? (
                    <View style={styles.remindersList}>
                        {dayReminders.map(item => {
                            const controlColor = getControlLevelColor(item.control_level);
                            const isCompleted = item.status === 'completed';
                            const itemDate = new Date(item.due_date_ms);
                            const isItemPast = isPast(itemDate) && !isCompleted;

                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        if (onSelectReminder) {
                                            onSelectReminder(item.id);
                                        } else {
                                            router.push({ pathname: '/reminder/[id]', params: { id: item.id } });
                                        }
                                    }}
                                    style={[
                                        styles.reminderCard,
                                        isItemDone && { opacity: 0.65 },
                                    ]}
                                >
                                    <VeyraCard
                                        level={2}
                                    >
                                        <View style={styles.cardContent}>
                                            {/* Checkbox / Botón de Completar */}
                                            <TouchableOpacity
                                                style={[
                                                    styles.checkButton,
                                                    {
                                                        borderColor: isItemDone
                                                            ? (isDark ? '#34D399' : '#10B981')
                                                            : colors.borderSubtle,
                                                        backgroundColor: isItemDone
                                                            ? (isDark ? '#34D39922' : '#10B98122')
                                                            : 'transparent',
                                                    },
                                                ]}
                                                onPress={async () => {
                                                    if (!isCompleted && completingId !== item.id) {
                                                        setCompletingId(item.id);
                                                        try {
                                                            LayoutAnimation.configureNext({
                                                                duration: 320,
                                                                create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                                                                update: { type: LayoutAnimation.Types.spring, springDamping: 0.82 },
                                                                delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                                                            });
                                                        } catch {}
                                                        setTimeout(async () => {
                                                            await markAsCompleted(item.id);
                                                            setCompletingId(null);
                                                        }, 240);
                                                    }
                                                }}
                                            >
                                                {isItemDone ? (
                                                    <Check size={14} color={isDark ? '#34D399' : '#10B981'} />
                                                ) : null}
                                            </TouchableOpacity>

                                            {/* Información principal */}
                                            <View style={styles.reminderInfo}>
                                                <View style={styles.reminderHeaderLine}>
                                                    <View style={styles.timeTag}>
                                                        <Clock size={12} color={colors.textSecondary as any} />
                                                        <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                                                            {format(itemDate, 'HH:mm')}
                                                        </Text>
                                                    </View>

                                                    <View
                                                        style={[
                                                            styles.priorityPill,
                                                            { backgroundColor: controlColor.bg, borderColor: controlColor.border },
                                                        ]}
                                                    >
                                                        <Text style={[styles.priorityPillText, { color: controlColor.color }]}>
                                                            {item.control_level.toUpperCase()}
                                                        </Text>
                                                    </View>

                                                    {isItemPast && (
                                                        <View style={[styles.priorityPill, { backgroundColor: isDark ? '#FB718520' : '#FFE4E6', borderColor: isDark ? '#FB7185' : '#E11D48' }]}>
                                                            <Text style={[styles.priorityPillText, { color: isDark ? '#FB7185' : '#E11D48' }]}>
                                                                {t('home.overdue_label')}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>

                                                <Text
                                                    style={[
                                                        styles.reminderTitle,
                                                        {
                                                            color: colors.textPrimary,
                                                            textDecorationLine: isCompleted ? 'line-through' : 'none',
                                                        },
                                                    ]}
                                                    numberOfLines={2}
                                                >
                                                    {item.title}
                                                </Text>

                                                {item.description ? (
                                                    <Text
                                                        style={[styles.reminderDesc, { color: colors.textSecondary }]}
                                                        numberOfLines={1}
                                                    >
                                                        {item.description.replace(/<[^>]+>/g, '').trim()}
                                                    </Text>
                                                ) : null}

                                                {item.subtasks && (() => {
                                                    try {
                                                        const list = JSON.parse(item.subtasks);
                                                        if (Array.isArray(list) && list.length > 0) {
                                                            const done = list.filter((s: any) => s.completed).length;
                                                            return (
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                                                    <CheckSquare size={11} color={done === list.length ? (isDark ? '#34D399' : '#10B981') : colors.textMuted} />
                                                                    <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '500' }}>
                                                                        {done}/{list.length}
                                                                    </Text>
                                                                </View>
                                                            );
                                                        }
                                                        return null;
                                                    } catch {
                                                        return null;
                                                    }
                                                })()}
                                            </View>
                                        </View>
                                    </VeyraCard>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ) : (
                    /* Estado vacío para el día */
                    <VeyraSurface level={1} radius="lg" style={styles.emptyCard}>
                        <CalendarIcon size={32} color={colors.textMuted} style={{ marginBottom: 8 }} />
                        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                            {filterTab === 'pending'
                                ? t('calendar.no_pending')
                                : filterTab === 'completed'
                                ? t('calendar.no_completed')
                                : t('calendar.no_reminders')}
                        </Text>
                        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                            {t('calendar.no_reminders_desc')}
                        </Text>
                        <VeyraButton
                            variant="primary"
                            size="md"
                            radius="md"
                            style={{ marginTop: 12 }}
                            label={t('calendar.create_for_day')}
                            iconLeft={<Plus size={16} color="#ffffff" />}
                            onPress={handleCreateForDay}
                        />
                    </VeyraSurface>
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 120,
    },
    calendarCard: {
        padding: 16,
        marginBottom: 16,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    monthTitleWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    monthTitle: {
        fontSize: 18,
        fontWeight: '700',
        textTransform: 'capitalize',
    },
    todayButton: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    todayButtonText: {
        fontSize: 11,
        fontWeight: '700',
    },
    navButtonsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    weekDaysRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 8,
        paddingVertical: 4,
    },
    weekDayText: {
        width: '14.28%',
        textAlign: 'center',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        aspectRatio: 1,
        padding: 2,
    },
    dayInner: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
    },
    selectedDay: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 2,
    },
    todayDay: {
        borderWidth: 1.5,
    },
    dayNumber: {
        fontSize: 14,
    },
    dotsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        marginTop: 2,
        position: 'absolute',
        bottom: 3,
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    agendaSection: {
        marginTop: 4,
    },
    agendaHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingHorizontal: 2,
    },
    agendaDateTitle: {
        fontSize: 16,
        fontWeight: '700',
        textTransform: 'capitalize',
    },
    agendaSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        marginTop: 2,
    },
    filterTabsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    filterTab: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    filterTabActive: {
        borderWidth: 1,
    },
    filterTabText: {
        fontSize: 12,
        fontWeight: '600',
    },
    remindersList: {
        gap: 10,
    },
    reminderCard: {
        padding: 14,
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    checkButton: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    reminderInfo: {
        flex: 1,
    },
    reminderHeaderLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    timeTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    timeText: {
        fontSize: 12,
        fontWeight: '600',
    },
    priorityPill: {
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 4,
        borderWidth: 1,
    },
    priorityPillText: {
        fontSize: 9.5,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    reminderTitle: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    reminderDesc: {
        fontSize: 12,
        lineHeight: 16,
    },
    emptyCard: {
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 4,
    },
    emptySubtitle: {
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 16,
    },
});
