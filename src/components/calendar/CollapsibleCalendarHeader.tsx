import React, { useState, useMemo, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Easing,
} from 'react-native';
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
    startOfDay,
    getDay,
} from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import {
    Calendar as CalendarIcon,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    History,
    Search,
    Share2,
    X,
} from '@tamagui/lucide-icons';

import { Reminder, CalendarEvent } from '../../types/db';
import { isEventOccurringOnDate } from '../../services/eventService';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';

interface CollapsibleCalendarHeaderProps {
    selectedDate: Date | null;
    onSelectDate: (date: Date | null) => void;
    reminders: Reminder[];
    events?: CalendarEvent[];
    language: string;
    onPressSearch?: () => void;
    onPressHistory?: () => void;
    onPressShare?: () => void;
    hasTodayTasks?: boolean;
}

export function CollapsibleCalendarHeader({
    selectedDate,
    onSelectDate,
    reminders,
    events = [],
    language,
    onPressSearch,
    onPressHistory,
    onPressShare,
    hasTodayTasks = false,
}: CollapsibleCalendarHeaderProps) {
    const { t } = useTranslation();
    const { colors, accent, isDark } = useVeyraTheme();
    const locale = language === 'es' ? es : enUS;

    const [isExpanded, setIsExpanded] = useState(false);
    const [currentMonth, setCurrentMonth] = useState<Date>(selectedDate || new Date());
    const [cardHeight, setCardHeight] = useState<number>(310);

    // Single shared animation value drives everything
    const anim = useRef(new Animated.Value(0)).current;

    const toggleExpand = () => {
        const nextExpanded = !isExpanded;
        setIsExpanded(nextExpanded);

        if (nextExpanded) {
            const target = selectedDate || new Date();
            setCurrentMonth(target);
            onSelectDate(target);

            Animated.timing(anim, {
                toValue: 1,
                duration: 260,
                easing: Easing.bezier(0.2, 0.9, 0.3, 1),
                useNativeDriver: false,
            }).start();
        } else {
            onSelectDate(null);

            Animated.timing(anim, {
                toValue: 0,
                duration: 220,
                easing: Easing.bezier(0.3, 0, 0.2, 1),
                useNativeDriver: false,
            }).start();
        }
    };

    const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
    const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

    const handleGoToToday = () => {
        const today = new Date();
        setCurrentMonth(today);
        onSelectDate(today);
    };

    const handleDayPress = (day: Date) => {
        onSelectDate(day);
    };

    // Grouping reminders by day
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

    // Calendar grid
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
        const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
        return eachDayOfInterval({ start: startDate, end: endDate });
    }, [currentMonth]);

    const weekDays = useMemo(() => {
        const sampleMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
        return Array.from({ length: 7 }, (_, i) => {
            const day = new Date(sampleMonday);
            day.setDate(sampleMonday.getDate() + i);
            return format(day, 'EEEEEE', { locale });
        });
    }, [locale]);

    const displayDate = selectedDate || new Date();
    const formattedDateText = useMemo(() => {
        const isCurrentDay = isToday(displayDate);
        const dateStr = format(displayDate, language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale });
        return isCurrentDay ? (language === 'es' ? `Hoy • ${dateStr}` : `Today • ${dateStr}`) : dateStr;
    }, [displayDate, language, locale]);

    // ── Derived animated values ───────────────────────────────────────────────

    // Chevron rotates 180°
    const chevronRotate = anim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });

    // Panel slides from 0 → exact measured height
    const panelHeight = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, cardHeight],
    });

    // Panel fades in/out cleanly
    const panelOpacity = anim.interpolate({
        inputRange: [0, 0.25, 1],
        outputRange: [0, 0.5, 1],
    });

    const panelScale = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.98, 1],
    });

    return (
        <View style={[styles.container, { borderBottomColor: colors.borderSubtle }]}>
            {/* ─── FILA PRINCIPAL COMPACTA ─── */}
            <View style={styles.headerRow}>
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={toggleExpand}
                    style={styles.dateToggleBtn}
                >
                    <View style={[styles.calendarIconBox, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.14)' : 'rgba(37, 99, 235, 0.08)' }]}>
                        <CalendarIcon size={14} color={accent.primary} />
                    </View>

                    <View style={styles.dateTextGroup}>
                        <Text
                            style={[
                                styles.dateTitleText,
                                { color: selectedDate ? accent.primary : colors.textPrimary },
                            ]}
                            numberOfLines={1}
                        >
                            {formattedDateText}
                        </Text>
                    </View>

                    <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
                        <ChevronDown size={15} color={colors.textSecondary} />
                    </Animated.View>
                </TouchableOpacity>

                {/* Acciones derecha */}
                <View style={styles.rightActions}>
                    {selectedDate && !isExpanded && (
                        <TouchableOpacity
                            onPress={() => onSelectDate(null)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={[styles.clearFilterChip, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }]}
                        >
                            <Text style={[styles.clearFilterText, { color: colors.textSecondary }]}>
                                {language === 'es' ? 'Ver todo' : 'Clear'}
                            </Text>
                            <X size={10} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}

                    {onPressSearch && (
                        <TouchableOpacity
                            onPress={onPressSearch}
                            activeOpacity={0.7}
                            style={[
                                styles.actionBtn,
                                {
                                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.035)',
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Search size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}

                    {onPressHistory && (
                        <TouchableOpacity
                            onPress={onPressHistory}
                            activeOpacity={0.7}
                            delayPressIn={0}
                            style={[
                                styles.actionBtn,
                                {
                                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.035)',
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <History size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}

                    {hasTodayTasks && onPressShare && (
                        <TouchableOpacity
                            onPress={onPressShare}
                            activeOpacity={0.7}
                            style={[
                                styles.actionBtn,
                                {
                                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.035)',
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Share2 size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* ─── PANEL DEL CALENDARIO (siempre montado, animado por altura) ─── */}
            <Animated.View
                style={{
                    height: panelHeight,
                    opacity: panelOpacity,
                    overflow: 'hidden',
                    transform: [
                        { scale: panelScale },
                    ],
                }}
                pointerEvents={isExpanded ? 'auto' : 'none'}
            >
                <View
                    onLayout={(e) => {
                        const h = e.nativeEvent.layout.height;
                        if (h > 50 && Math.abs(h - cardHeight) > 1) {
                            setCardHeight(h);
                        }
                    }}
                >
                    <VeyraSurface
                        level={2}
                        radius="lg"
                        style={[
                            styles.calendarDropdownCard,
                            { borderColor: colors.borderSubtle },
                        ]}
                    >
                    {/* Barra de Navegación de Mes */}
                    <View style={styles.monthNavRow}>
                        <TouchableOpacity
                            onPress={handlePrevMonth}
                            style={[styles.navArrowBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                            <ChevronLeft size={16} color={colors.textPrimary} />
                        </TouchableOpacity>

                        <TouchableOpacity onPress={handleGoToToday} activeOpacity={0.7} style={styles.monthTitleWrapper}>
                            <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
                                {format(currentMonth, 'MMMM yyyy', { locale })}
                            </Text>
                            {!isSameMonth(currentMonth, new Date()) && (
                                <View style={[styles.todayChip, { backgroundColor: accent.primary + '20' }]}>
                                    <Text style={[styles.todayChipText, { color: accent.primary }]}>
                                        {t('calendar.today')}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleNextMonth}
                            style={[styles.navArrowBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                            <ChevronRight size={16} color={colors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    {/* Días de la semana */}
                    <View style={styles.weekDaysRow}>
                        {weekDays.map((dayName, idx) => (
                            <Text
                                key={`wd-${idx}`}
                                style={[
                                    styles.weekDayText,
                                    { color: colors.textMuted },
                                    (idx === 5 || idx === 6) && { color: isDark ? '#FB7185' : '#E11D48' },
                                ]}
                            >
                                {dayName.toUpperCase()}
                            </Text>
                        ))}
                    </View>

                    {/* Cuadrícula de Días */}
                    <View style={styles.daysGrid}>
                        {calendarDays.map((day, idx) => {
                            const isCurrentMonth = isSameMonth(day, currentMonth);
                            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                            const isTodayDay = isToday(day);
                            const dayKey = format(day, 'yyyy-MM-dd');
                            const dayItems = remindersByDate.get(dayKey) || [];

                            const hasCritical = dayItems.some(r => r.status === 'pending' && r.control_level === 'critical');
                            const hasStrict = dayItems.some(r => r.status === 'pending' && r.control_level === 'strict');
                            const hasNormal = dayItems.some(r => r.status === 'pending' && (r.control_level === 'normal' || !r.control_level));
                            const hasCompleted = dayItems.some(r => r.status === 'completed');

                            // Comprobar eventos para este día
                            const dayEvents = events.filter(e => isEventOccurringOnDate(e, day));
                            const hasEvent = dayEvents.length > 0;
                            const firstEventColor = dayEvents[0]?.color || '#3B82F6';

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
                                                        ? '#FFFFFF'
                                                        : !isCurrentMonth
                                                        ? (isDark ? '#475569' : '#CBD5E1')
                                                        : isTodayDay
                                                        ? accent.primary
                                                        : colors.textPrimary,
                                                    fontWeight: isSelected || isTodayDay ? '700' : '500',
                                                },
                                            ]}
                                        >
                                            {format(day, 'd')}
                                        </Text>

                                        {(dayItems.length > 0 || hasEvent) && (
                                            <View style={styles.dotsRow}>
                                                {hasCritical && (
                                                    <View
                                                        style={[
                                                            styles.dot,
                                                            { backgroundColor: isSelected ? '#FFFFFF' : (isDark ? '#FB7185' : '#E11D48') },
                                                        ]}
                                                    />
                                                )}
                                                {hasStrict && (
                                                    <View
                                                        style={[
                                                            styles.dot,
                                                            { backgroundColor: isSelected ? '#FFFFFF' : '#F59E0B' },
                                                        ]}
                                                    />
                                                )}
                                                {hasNormal && !hasCritical && !hasStrict && (
                                                    <View
                                                        style={[
                                                            styles.dot,
                                                            { backgroundColor: isSelected ? '#FFFFFF' : colors.textSecondary },
                                                        ]}
                                                    />
                                                )}
                                                {hasCompleted && !hasCritical && !hasStrict && !hasNormal && (
                                                    <View
                                                        style={[
                                                            styles.dot,
                                                            { backgroundColor: isSelected ? '#FFFFFF' : (isDark ? '#34D399' : '#10B981') },
                                                        ]}
                                                    />
                                                )}
                                                {hasEvent && (
                                                    <View
                                                        style={[
                                                            styles.dot,
                                                            { backgroundColor: isSelected ? '#FFFFFF' : firstEventColor },
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
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 24,
        paddingTop: 4,
        paddingBottom: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    dateToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        paddingVertical: 4,
    },
    calendarIconBox: {
        width: 26,
        height: 26,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateTextGroup: {
        justifyContent: 'center',
    },
    dateTitleText: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    clearFilterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        marginLeft: 4,
    },
    clearFilterText: {
        fontSize: 10.5,
        fontWeight: '600',
    },
    rightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginLeft: 8,
    },
    actionBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    calendarDropdownCard: {
        marginTop: 6,
        marginBottom: 8,
        padding: 12,
        borderWidth: 1,
    },
    monthNavRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    monthTitleWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    monthTitle: {
        fontSize: 14,
        fontWeight: '700',
    },
    todayChip: {
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 4,
    },
    todayChipText: {
        fontSize: 10,
        fontWeight: '700',
    },
    navArrowBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekDaysRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 6,
    },
    weekDayText: {
        width: 32,
        textAlign: 'center',
        fontSize: 10,
        fontWeight: '700',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
    },
    dayCell: {
        width: `${100 / 7}%`,
        aspectRatio: 1,
        padding: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayInner: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    selectedDay: {
        // Flat, clean modern circle without Android elevation square artifacts
    },
    todayDay: {
        borderWidth: 1.5,
    },
    dayNumber: {
        fontSize: 12,
    },
    dotsRow: {
        position: 'absolute',
        bottom: 2,
        flexDirection: 'row',
        gap: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dot: {
        width: 3.5,
        height: 3.5,
        borderRadius: 2,
    },
});
