import React, { useState } from 'react';
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

import { InlineDatePicker } from '../../components/InlineDatePicker';
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
 * DateTimeSelector — Selector moderno con chips rápidos, tarjetas separadas
 * de Fecha y Hora, y modales limpios sin conflictos de scroll vertical.
 */
export function DateTimeSelector({
    date,
    setDate,
    flat,
}: DateTimeSelectorProps) {
    const { t, i18n } = useTranslation();
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();
    const locale = i18n.language === 'es' ? es : enUS;

    const [isDateModalOpen, setIsDateModalOpen] = useState(false);
    const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);

    // Formateo de fecha legible
    const getDateDisplay = () => {
        if (isToday(date)) {
            return t('create.presets.today', { defaultValue: 'Hoy' });
        }
        if (isTomorrow(date)) {
            return t('create.presets.tomorrow', { defaultValue: 'Mañana' });
        }
        return format(date, i18n.language === 'es' ? "EEE, d 'de' MMM" : 'EEE, MMM d', { locale });
    };

    // Formateo de hora legible (ej. 14:30 o 2:30 PM)
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
                // Si ya pasaron las 20:00 hoy, ponerlo a las 20:00 de mañana
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
    };

    return (
        <View style={flat ? styles.flatContainer : styles.container}>
            {flat ? (
                <View style={styles.flatWrapper}>
                    {/* Presets rápidos */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.flatPresetsRow}
                    >
                        <TouchableOpacity
                            style={[
                                styles.flatPresetChip,
                                {
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: colors.borderSubtle,
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
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: isTomorrow(date) && date.getHours() === 9 ? accent.primary : colors.borderSubtle,
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
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: colors.borderSubtle,
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
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            activeOpacity={0.75}
                            onPress={() => handleQuickPreset('plus_1h')}
                        >
                            <Zap size={12} color={colors.textSecondary as any} />
                            <Text style={[styles.flatPresetText, { color: colors.textPrimary }]}>
                                +1h
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>

                    {/* Pills Fecha y Hora */}
                    <View style={styles.flatPillsContainer}>
                        <TouchableOpacity
                            style={[
                                styles.flatPill,
                                {
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            activeOpacity={0.75}
                            onPress={() => setIsDateModalOpen(true)}
                        >
                            <CalendarIcon size={14} color={accent.primary} strokeWidth={2.2} />
                            <Text style={[styles.flatPillText, { color: colors.textPrimary }]}>
                                {getDateDisplay()}
                            </Text>
                            <ChevronDown size={12} color={colors.textMuted} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.flatPill,
                                {
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            activeOpacity={0.75}
                            onPress={() => setIsTimeModalOpen(true)}
                        >
                            <ClockIcon size={14} color={accent.primary} strokeWidth={2.2} />
                            <Text style={[styles.flatPillText, { color: colors.textPrimary }]}>
                                {getTimeDisplay()}
                            </Text>
                            <ChevronDown size={12} color={colors.textMuted} />
                        </TouchableOpacity>
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

                        <TouchableOpacity
                            style={[
                                styles.presetChip,
                                {
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                            activeOpacity={0.7}
                            onPress={() => handleQuickPreset('plus_30m')}
                        >
                            <Zap size={12} color={accent.primary} />
                            <Text style={[styles.presetText, { color: colors.textPrimary }]}>
                                +30 min
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
                            onPress={() => handleQuickPreset('plus_1h')}
                        >
                            <Zap size={12} color={accent.primary} />
                            <Text style={[styles.presetText, { color: colors.textPrimary }]}>
                                +1 hora
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
                            onPress={() => handleQuickPreset('plus_2h')}
                        >
                            <Zap size={12} color={accent.primary} />
                            <Text style={[styles.presetText, { color: colors.textPrimary }]}>
                                +2 horas
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
                                        <CalendarIcon size={15} color={accent.primary} />
                                        <Text style={[styles.pickerCardLabel, { color: colors.textSecondary }]}>
                                            {t('create.sections.date', { defaultValue: 'Fecha' })}
                                        </Text>
                                    </View>
                                    <ChevronDown size={14} color={colors.textMuted} />
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
                                        <ClockIcon size={15} color={accent.primary} />
                                        <Text style={[styles.pickerCardLabel, { color: colors.textSecondary }]}>
                                            {t('create.sections.time', { defaultValue: 'Hora' })}
                                        </Text>
                                    </View>
                                    <ChevronDown size={14} color={colors.textMuted} />
                                </View>
                                <Text style={[styles.pickerCardValue, { color: colors.textPrimary }]}>
                                    {getTimeDisplay()}
                                </Text>
                            </VeyraSurface>
                        </TouchableOpacity>
                    </View>
                </>
            )}

            {/* Modal: Date Picker */}
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
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalCard: {
        width: '100%',
        maxWidth: 360,
        borderRadius: 20,
        borderWidth: 1,
        padding: 18,
        gap: 12,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.3,
                shadowRadius: 18,
            },
            android: {
                elevation: 10,
            },
        }),
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 4,
    },
    modalTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    modalCloseBtn: {
        padding: 4,
    },
    digitalClockRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 4,
    },
    timeBoxContainer: {
        alignItems: 'center',
        gap: 4,
    },
    stepBtn: {
        paddingVertical: 2,
        paddingHorizontal: 16,
    },
    stepBtnText: {
        fontSize: 12,
        fontWeight: '800',
    },
    timeDigitBox: {
        width: 84,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timeDigitText: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: 1,
    },
    timeDigitLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginTop: 2,
    },
    colonSeparator: {
        fontSize: 34,
        fontWeight: '800',
        marginBottom: 8,
    },
    minuteSnapsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    minuteSnapBtn: {
        flex: 1,
        paddingVertical: 6,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: 1,
    },
    minuteSnapText: {
        fontSize: 13,
        fontWeight: '700',
    },
    numpadGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 8,
        paddingVertical: 4,
    },
    numpadKey: {
        width: '31%',
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    numpadKeyText: {
        fontSize: 18,
        fontWeight: '700',
    },
    modalFooter: {
        paddingTop: 8,
    },
    modalFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingTop: 8,
    },
    flatContainer: {
        marginBottom: 0,
    },
    flatWrapper: {
        gap: 8,
    },
    flatPresetsRow: {
        flexDirection: 'row',
        gap: 6,
        paddingVertical: 1,
    },
    flatPresetChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
    },
    flatPresetText: {
        fontSize: 12,
        fontWeight: '600',
    },
    flatPillsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    flatPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
    },
    flatPillText: {
        fontSize: 13,
        fontWeight: '600',
    },
});

