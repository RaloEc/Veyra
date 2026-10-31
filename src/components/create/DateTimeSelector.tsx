import React, { useState, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Modal,
    Pressable,
    Platform,
} from 'react-native';
import {
    Calendar as CalendarIcon,
    Clock as ClockIcon,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Zap,
    X,
    Check,
    Sun,
    Moon,
} from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import { addDays, setHours, setMinutes, startOfTomorrow, isToday, isTomorrow, format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';

import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';
import { VeyraButton } from '../ui/VeyraButton';
import { DatePickerModal, TimePickerModal } from '../ui';

interface DateTimeSelectorProps {
    date: Date;
    setDate: (date: Date) => void;
    showPicker?: boolean;
    setShowPicker?: (show: boolean) => void;
    animationHeight?: any;
    isDark?: boolean;
    flat?: boolean;
}

/**
 * DateTimeSelector — Selector enfocado en Fecha y Hora con Calendario Embebido
 * y atajos rápidos situados por debajo.
 */
export function DateTimeSelector({
    date,
    setDate,
    flat,
}: DateTimeSelectorProps) {
    const { t, i18n } = useTranslation();
    const { colors, typography, radii, accent, isDark, isAmoled } = useVeyraTheme();
    const locale = i18n.language === 'es' ? es : enUS;

    const controlBgColor = isAmoled ? '#222222' : (isDark ? '#2D3039' : '#F1F5F9');
    const controlBorderColor = isAmoled ? 'rgba(255, 255, 255, 0.18)' : (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)');

    const [isDateModalOpen, setIsDateModalOpen] = useState(false);
    const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);

    // Estado del mes visualizado en el calendario embebido
    const [currentMonth, setCurrentMonth] = useState(() => new Date(date.getFullYear(), date.getMonth(), 1));

    // Si la fecha seleccionada cambia a otro mes (ej: vía presets), sincronizamos el calendario
    useEffect(() => {
        if (date.getFullYear() !== currentMonth.getFullYear() || date.getMonth() !== currentMonth.getMonth()) {
            setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
        }
    }, [date]);

    // Días de la semana para encabezados
    const DAYS_HEADER = useMemo(() => {
        return i18n.language === 'es'
            ? ['D', 'L', 'M', 'M', 'J', 'V', 'S']
            : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    }, [i18n.language]);

    // Cálculo de cuadrícula mensual
    const daysInMonth = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startingDayOfWeek = firstDay.getDay(); // 0 es Domingo
        const totalDays = lastDay.getDate();

        const list: (number | null)[] = [];
        for (let i = 0; i < startingDayOfWeek; i++) {
            list.push(null);
        }
        for (let d = 1; d <= totalDays; d++) {
            list.push(d);
        }
        return list;
    }, [currentMonth]);

    const monthYearTitle = useMemo(() => {
        const raw = format(currentMonth, 'MMMM yyyy', { locale });
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    }, [currentMonth, locale]);

    const goToPreviousMonth = () => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    };

    const handleDayPress = (day: number) => {
        const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        newDate.setHours(date.getHours(), date.getMinutes(), 0, 0);
        setDate(newDate);
    };

    const isSelectedDay = (day: number) => {
        return (
            date.getDate() === day &&
            date.getMonth() === currentMonth.getMonth() &&
            date.getFullYear() === currentMonth.getFullYear()
        );
    };

    const isTodayDay = (day: number) => {
        const today = new Date();
        return (
            today.getDate() === day &&
            today.getMonth() === currentMonth.getMonth() &&
            today.getFullYear() === currentMonth.getFullYear()
        );
    };

    // Formateo de fecha legible
    const getDateDisplay = () => {
        if (isToday(date)) {
            return `${t('create.presets.today', { defaultValue: 'Hoy' })}, ${format(date, "d 'de' MMMM", { locale })}`;
        }
        if (isTomorrow(date)) {
            return `${t('create.presets.tomorrow', { defaultValue: 'Mañana' })}, ${format(date, "d 'de' MMMM", { locale })}`;
        }
        return format(date, i18n.language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale });
    };

    const formattedDateDisplay = useMemo(() => {
        const raw = getDateDisplay();
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    }, [date, locale, t]);

    // Formateo de hora legible (ej. 14:30)
    const getTimeDisplay = () => {
        return format(date, 'HH:mm');
    };

    // Chips rápidos
    const handleQuickPreset = (preset: 'tonight' | 'tomorrow_9am' | 'weekend' | 'plus_30m' | 'plus_1h' | 'plus_2h') => {
        const now = new Date();
        let newDate = new Date(date);

        if (preset === 'tonight') {
            newDate.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
            newDate = setHours(setMinutes(newDate, 0), 20);
            if (newDate < now) {
                newDate = addDays(newDate, 1);
            }
        } else if (preset === 'tomorrow_9am') {
            const tmrw = startOfTomorrow();
            newDate.setFullYear(tmrw.getFullYear(), tmrw.getMonth(), tmrw.getDate());
            newDate = setHours(setMinutes(newDate, 0), 9);
        } else if (preset === 'weekend') {
            const dayOfWeek = now.getDay();
            const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
            const saturday = addDays(now, daysUntilSaturday);
            newDate.setFullYear(saturday.getFullYear(), saturday.getMonth(), saturday.getDate());
            newDate = setHours(setMinutes(newDate, 0), 10);
        } else if (preset === 'plus_30m') {
            newDate = new Date(now.getTime() + 30 * 60 * 1000);
        } else if (preset === 'plus_1h') {
            newDate = new Date(now.getTime() + 60 * 60 * 1000);
        } else if (preset === 'plus_2h') {
            newDate = new Date(now.getTime() + 120 * 60 * 1000);
        }

        setDate(newDate);
        setCurrentMonth(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
    };

    return (
        <View style={flat ? styles.flatContainer : styles.container}>
            {flat ? (
                <View style={styles.flatWrapper}>
                    {/* 1. ENFOQUE PRINCIPAL: FECHA SELECCIONADA + HORA */}
                    <View style={styles.dateTimeHeaderRow}>
                        <View style={styles.dateDisplayBlock}>
                            <Text style={[styles.dateMicroLabel, { color: colors.textMuted }]}>
                                {t('create.sections.selected_date', { defaultValue: 'FECHA PROGRAMADA' })}
                            </Text>
                            <Text style={[styles.dateSelectedHeading, { color: colors.textPrimary }]} numberOfLines={1}>
                                {formattedDateDisplay}
                            </Text>
                        </View>

                        {/* Botón interactivo para cambiar la hora */}
                        <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => setIsTimeModalOpen(true)}
                            style={[
                                styles.timeSelectBtn,
                                {
                                    backgroundColor: controlBgColor,
                                    borderColor: controlBorderColor,
                                },
                            ]}
                        >
                            <ClockIcon size={14} color={accent.primary as any} strokeWidth={2.4} />
                            <Text style={[styles.timeSelectText, { color: colors.textPrimary }]}>
                                {getTimeDisplay()}
                            </Text>
                            <ChevronDown size={12} color={colors.textMuted as any} />
                        </TouchableOpacity>
                    </View>

                    {/* Divisor sutil */}
                    <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

                    {/* 2. SELECTOR DE FECHA DIRECTO EN FORMA DE CALENDARIO EMBEBIDO */}
                    <View style={styles.calendarContainer}>
                        {/* Barra de Navegación del Mes */}
                        <View style={styles.monthNavRow}>
                            <TouchableOpacity
                                onPress={goToPreviousMonth}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={[styles.monthNavBtn, { backgroundColor: controlBgColor, borderColor: controlBorderColor }]}
                                activeOpacity={0.7}
                            >
                                <ChevronLeft size={16} color={colors.textPrimary as any} />
                            </TouchableOpacity>

                            <Text style={[styles.monthTitleText, { color: colors.textPrimary }]}>
                                {monthYearTitle}
                            </Text>

                            <TouchableOpacity
                                onPress={goToNextMonth}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={[styles.monthNavBtn, { backgroundColor: controlBgColor, borderColor: controlBorderColor }]}
                                activeOpacity={0.7}
                            >
                                <ChevronRight size={16} color={colors.textPrimary as any} />
                            </TouchableOpacity>
                        </View>

                        {/* Encabezados de Días (D L M M J V S) */}
                        <View style={styles.weekDaysHeaderRow}>
                            {DAYS_HEADER.map((d, index) => (
                                <Text key={`${d}-${index}`} style={[styles.weekDayLabel, { color: colors.textMuted }]}>
                                    {d}
                                </Text>
                            ))}
                        </View>

                        {/* Grilla de Días del Mes */}
                        <View style={styles.daysGrid}>
                            {daysInMonth.map((day, idx) => {
                                if (day === null) {
                                    return <View key={`empty-${idx}`} style={styles.daySlot} />;
                                }

                                const selected = isSelectedDay(day);
                                const isToday = isTodayDay(day);

                                return (
                                    <TouchableOpacity
                                        key={`day-${day}`}
                                        activeOpacity={0.7}
                                        onPress={() => handleDayPress(day)}
                                        style={styles.daySlot}
                                    >
                                        <View
                                            style={[
                                                styles.dayNumberCircle,
                                                selected && {
                                                    backgroundColor: accent.primary,
                                                },
                                                isToday && !selected && {
                                                    borderWidth: 1.5,
                                                    borderColor: accent.primary,
                                                },
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.dayNumberText,
                                                    {
                                                        color: selected
                                                            ? '#FFFFFF'
                                                            : isToday
                                                            ? accent.primary
                                                            : colors.textPrimary,
                                                        fontWeight: selected || isToday ? '700' : '500',
                                                    },
                                                ]}
                                            >
                                                {day}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* Divisor sutil */}
                    <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

                    {/* 3. ATAJOS RÁPIDOS POR DEBAJO (Esta noche, Mañana, Fin de semana, +1h) */}
                    <View style={styles.presetsSection}>
                        <Text style={[styles.presetsSectionTitle, { color: colors.textMuted }]}>
                            {t('create.presets.quick_shortcuts', { defaultValue: 'ATAJOS RÁPIDOS' })}
                        </Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.flatPresetsRow}
                        >
                            <TouchableOpacity
                                style={[
                                    styles.flatPresetChip,
                                    {
                                        backgroundColor: controlBgColor,
                                        borderColor: controlBorderColor,
                                    },
                                ]}
                                activeOpacity={0.75}
                                onPress={() => handleQuickPreset('tonight')}
                            >
                                <Moon size={12} color={colors.textSecondary as any} />
                                <Text style={[styles.flatPresetText, { color: colors.textPrimary }]}>
                                    {t('create.presets.tonight', { defaultValue: 'Esta noche' })}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.flatPresetChip,
                                    {
                                        backgroundColor: controlBgColor,
                                        borderColor: isTomorrow(date) && date.getHours() === 9 ? accent.primary : controlBorderColor,
                                    },
                                ]}
                                activeOpacity={0.75}
                                onPress={() => handleQuickPreset('tomorrow_9am')}
                            >
                                <Sun size={12} color={isTomorrow(date) && date.getHours() === 9 ? accent.primary : (colors.textSecondary as any)} />
                                <Text
                                    style={[
                                        styles.flatPresetText,
                                        { color: isTomorrow(date) && date.getHours() === 9 ? accent.primary : colors.textPrimary },
                                    ]}
                                >
                                    {t('create.presets.tomorrow_morning', { defaultValue: 'Mañana (9:00)' })}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.flatPresetChip,
                                    {
                                        backgroundColor: controlBgColor,
                                        borderColor: controlBorderColor,
                                    },
                                ]}
                                activeOpacity={0.75}
                                onPress={() => handleQuickPreset('weekend')}
                            >
                                <CalendarIcon size={12} color={colors.textSecondary as any} />
                                <Text style={[styles.flatPresetText, { color: colors.textPrimary }]}>
                                    {t('create.presets.weekend', { defaultValue: 'Fin de semana' })}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.flatPresetChip,
                                    {
                                        backgroundColor: controlBgColor,
                                        borderColor: controlBorderColor,
                                    },
                                ]}
                                activeOpacity={0.75}
                                onPress={() => handleQuickPreset('plus_1h')}
                            >
                                <Zap size={12} color={accent.primary as any} />
                                <Text style={[styles.flatPresetText, { color: colors.textPrimary }]}>
                                    +1h
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.flatPresetChip,
                                    {
                                        backgroundColor: controlBgColor,
                                        borderColor: controlBorderColor,
                                    },
                                ]}
                                activeOpacity={0.75}
                                onPress={() => handleQuickPreset('plus_2h')}
                            >
                                <Zap size={12} color={accent.primary as any} />
                                <Text style={[styles.flatPresetText, { color: colors.textPrimary }]}>
                                    +2h
                                </Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            ) : (
                <>
                    <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                        {t('create.sections.date_time', { defaultValue: 'FECHA Y HORA' }).toUpperCase()}
                    </Text>

                    {/* Quick Chips Row */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.presetsRow}
                    >
                        <TouchableOpacity
                            style={[
                                styles.presetChip,
                                {
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            activeOpacity={0.7}
                            onPress={() => handleQuickPreset('tonight')}
                        >
                            <Moon size={12} color={colors.textSecondary as any} />
                            <Text style={[styles.presetText, { color: colors.textPrimary }]}>
                                {t('create.presets.tonight', { defaultValue: 'Esta noche (20:00)' })}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.presetChip,
                                {
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: isTomorrow(date) && date.getHours() === 9 ? accent.primary : colors.borderSubtle,
                                },
                            ]}
                            activeOpacity={0.7}
                            onPress={() => handleQuickPreset('tomorrow_9am')}
                        >
                            <Sun size={12} color={isTomorrow(date) && date.getHours() === 9 ? accent.primary : (colors.textSecondary as any)} />
                            <Text
                                style={[
                                    styles.presetText,
                                    { color: isTomorrow(date) && date.getHours() === 9 ? accent.primary : colors.textPrimary },
                                ]}
                            >
                                {t('create.presets.tomorrow_morning', { defaultValue: 'Mañana (09:00)' })}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.presetChip,
                                {
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            activeOpacity={0.7}
                            onPress={() => handleQuickPreset('weekend')}
                        >
                            <CalendarIcon size={12} color={colors.textSecondary as any} />
                            <Text style={[styles.presetText, { color: colors.textPrimary }]}>
                                {t('create.presets.weekend', { defaultValue: 'Fin de semana' })}
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>

                    {/* Two Distinct Cards: Date & Time */}
                    <View style={styles.cardsRow}>
                        {/* Date Card */}
                        <TouchableOpacity
                            style={styles.cardCol}
                            activeOpacity={0.75}
                            onPress={() => setIsDateModalOpen(true)}
                        >
                            <VeyraSurface level={1} radius="md" style={styles.pickerCard}>
                                <View style={styles.pickerCardHeader}>
                                    <View style={styles.pickerCardTitleRow}>
                                        <CalendarIcon size={15} color={accent.primary as any} />
                                        <Text style={[styles.pickerCardLabel, { color: colors.textSecondary }]}>
                                            {t('create.sections.date', { defaultValue: 'Fecha' })}
                                        </Text>
                                    </View>
                                    <ChevronDown size={14} color={colors.textMuted as any} />
                                </View>
                                <Text style={[styles.pickerCardValue, { color: colors.textPrimary }]} numberOfLines={1}>
                                    {getDateDisplay()}
                                </Text>
                            </VeyraSurface>
                        </TouchableOpacity>

                        {/* Time Card */}
                        <TouchableOpacity
                            style={styles.cardCol}
                            activeOpacity={0.75}
                            onPress={() => setIsTimeModalOpen(true)}
                        >
                            <VeyraSurface level={1} radius="md" style={styles.pickerCard}>
                                <View style={styles.pickerCardHeader}>
                                    <View style={styles.pickerCardTitleRow}>
                                        <ClockIcon size={15} color={accent.primary as any} />
                                        <Text style={[styles.pickerCardLabel, { color: colors.textSecondary }]}>
                                            {t('create.sections.time', { defaultValue: 'Hora' })}
                                        </Text>
                                    </View>
                                    <ChevronDown size={14} color={colors.textMuted as any} />
                                </View>
                                <Text style={[styles.pickerCardValue, { color: colors.textPrimary }]}>
                                    {getTimeDisplay()}
                                </Text>
                            </VeyraSurface>
                        </TouchableOpacity>
                    </View>
                </>
            )}

            {/* Modal: Date Picker (fallback para modo clásico) */}
            <DatePickerModal
                visible={isDateModalOpen}
                value={date}
                onClose={() => setIsDateModalOpen(false)}
                onConfirm={(newDate) => setDate(newDate)}
                isDark={isDark}
            />

            {/* Modal: Time Picker */}
            <TimePickerModal
                visible={isTimeModalOpen}
                value={date}
                onClose={() => setIsTimeModalOpen(false)}
                onConfirm={(newTime) => setDate(newTime)}
                isDark={isDark}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        gap: 10,
    },
    sectionTitle: {
        fontWeight: '700',
        letterSpacing: 0.8,
        marginBottom: 2,
    },
    presetsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingBottom: 2,
    },
    presetChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
    },
    presetText: {
        fontSize: 12,
        fontWeight: '600',
    },
    cardsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    cardCol: {
        flex: 1,
    },
    pickerCard: {
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 6,
    },
    pickerCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    pickerCardTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    pickerCardLabel: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    pickerCardValue: {
        fontSize: 17,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    flatContainer: {
        marginBottom: 0,
    },
    flatWrapper: {
        gap: 12,
    },
    dateTimeHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    dateDisplayBlock: {
        flex: 1,
        gap: 2,
    },
    dateMicroLabel: {
        fontSize: 10.5,
        fontWeight: '700',
        letterSpacing: 0.6,
    },
    dateSelectedHeading: {
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    timeSelectBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 1,
        marginLeft: 10,
    },
    timeSelectText: {
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: -0.2,
    },
    divider: {
        height: 1,
        width: '100%',
    },
    calendarContainer: {
        gap: 10,
        paddingVertical: 2,
    },
    monthNavRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    monthNavBtn: {
        width: 30,
        height: 30,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    monthTitleText: {
        fontSize: 14.5,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    weekDaysHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingVertical: 2,
    },
    weekDayLabel: {
        width: '14.28%',
        textAlign: 'center',
        fontSize: 11.5,
        fontWeight: '700',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    daySlot: {
        width: '14.28%',
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayNumberCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayNumberText: {
        fontSize: 13,
    },
    presetsSection: {
        gap: 8,
        paddingTop: 2,
    },
    presetsSectionTitle: {
        fontSize: 10.5,
        fontWeight: '700',
        letterSpacing: 0.6,
    },
    flatPresetsRow: {
        flexDirection: 'row',
        gap: 6,
        paddingVertical: 2,
    },
    flatPresetChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: 14,
        borderWidth: 1,
    },
    flatPresetText: {
        fontSize: 12,
        fontWeight: '600',
    },
});
