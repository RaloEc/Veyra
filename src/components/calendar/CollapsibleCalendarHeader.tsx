import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
    MoreVertical,
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
    const insets = useSafeAreaInsets();
    const locale = language === 'es' ? es : enUS;

    const [isMenuVisible, setIsMenuVisible] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [currentMonth, setCurrentMonth] = useState<Date>(selectedDate || new Date());

    // Reanimated shared values (UI thread 60/120 FPS)
    const anim = useSharedValue(0);
    const contentHeight = useSharedValue(330);

    const toggleExpand = () => {
        const nextExpanded = !isExpanded;
        setIsExpanded(nextExpanded);

        if (nextExpanded) {
            const target = selectedDate || new Date();
            setCurrentMonth(target);
            onSelectDate(target);

            anim.value = withTiming(1, {
                duration: 290,
                easing: Easing.bezier(0.16, 1, 0.3, 1),
            });
        } else {
            onSelectDate(null);

            anim.value = withTiming(0, {
                duration: 230,
                easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            });
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
        const raw = isCurrentDay ? (language === 'es' ? `Hoy • ${dateStr}` : `Today • ${dateStr}`) : dateStr;
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    }, [displayDate, language, locale]);

    // ── Reanimated Styles (UI Thread 60/120 FPS) ─────────────────────────────

    const chevronAnimatedStyle = useAnimatedStyle(() => {
        const rotate = interpolate(anim.value, [0, 1], [0, 180], Extrapolation.CLAMP);
        return {
            transform: [{ rotate: `${rotate}deg` }],
        };
    });

    const panelWrapperAnimatedStyle = useAnimatedStyle(() => {
        const height = interpolate(anim.value, [0, 1], [0, contentHeight.value], Extrapolation.CLAMP);
        const opacity = interpolate(anim.value, [0, 0.2, 1], [0, 0.6, 1], Extrapolation.CLAMP);

        return {
            height,
            opacity,
        };
    });

    const panelContentAnimatedStyle = useAnimatedStyle(() => {
        const translateY = interpolate(anim.value, [0, 1], [-12, 0], Extrapolation.CLAMP);
        const scale = interpolate(anim.value, [0, 1], [0.98, 1], Extrapolation.CLAMP);

        return {
            transform: [
                { translateY },
                { scale },
            ],
        };
    });

    return (
        <View style={[styles.container, { borderBottomColor: colors.borderSubtle }]}>
            {/* ─── FILA PRINCIPAL COMPACTA (Opción 1: Acciones agrupadas + Reset integrado) ─── */}
            <View style={styles.headerRow}>
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={toggleExpand}
                    style={styles.dateToggleBtn}
                >
                    <View style={[styles.calendarIconBox, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.14)' : 'rgba(37, 99, 235, 0.08)' }]}>
                        <CalendarIcon size={14} color={accent.primary as any} />
                    </View>

                    <View style={styles.dateTextGroup}>
                        <Text
                            style={[
                                styles.dateTitleText,
                                { color: selectedDate ? accent.primary : colors.textPrimary },
                            ]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                        >
                            {formattedDateText}
                        </Text>
                    </View>

                    {selectedDate && !isExpanded && (
                        <TouchableOpacity
                            onPress={(e) => {
                                e.stopPropagation?.();
                                onSelectDate(null);
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                            style={[
                                styles.clearDateBtn,
                                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.07)' },
                            ]}
                        >
                            <X size={11} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}

                    <Animated.View style={chevronAnimatedStyle}>
                        <ChevronDown size={14} color={colors.textSecondary} />
                    </Animated.View>
                </TouchableOpacity>
            </View>

            {/* ─── PANEL DEL CALENDARIO (animado en UI thread con Reanimated) ─── */}
            <Animated.View
                style={[
                    { overflow: 'hidden' },
                    panelWrapperAnimatedStyle,
                ]}
                pointerEvents={isExpanded ? 'auto' : 'none'}
            >
                <Animated.View
                    style={panelContentAnimatedStyle}
                    onLayout={(e) => {
                        const h = e.nativeEvent.layout.height;
                        if (h > 50 && Math.abs(h - contentHeight.value) > 1) {
                            contentHeight.value = h;
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
                </Animated.View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
        gap: 8,
    },
    dateToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
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
        flexShrink: 1,
        minWidth: 0,
        justifyContent: 'center',
    },
    dateTitleText: {
        fontSize: 13.5,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    clearDateBtn: {
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 2,
    },
    actionsPill: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 3,
    },
    pillActionBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pillDivider: {
        width: 1,
        height: 14,
        marginHorizontal: 1,
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
    menuModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    menuModalCardWrap: {
        position: 'absolute',
        right: 16,
        width: 230,
    },
    menuModalCard: {
        borderRadius: 16,
        borderWidth: 1,
        paddingVertical: 6,
        paddingHorizontal: 4,
        overflow: 'hidden',
    },
    menuModalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    menuModalItemText: {
        fontSize: 13.5,
        fontWeight: '600',
    },
    menuModalDivider: {
        height: StyleSheet.hairlineWidth,
        marginVertical: 4,
        marginHorizontal: 8,
    },
});
