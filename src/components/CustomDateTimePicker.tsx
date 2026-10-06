import React, { useState, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    StyleSheet,
} from 'react-native';
import { ChevronLeft, ChevronRight, Check, X } from '@tamagui/lucide-icons';
import { TimeWheel } from './TimeWheel';

interface CustomDateTimePickerProps {
    visible: boolean;
    mode: 'date' | 'time';
    value: Date;
    onClose: () => void;
    onChange: (date: Date) => void;
    isDark?: boolean;
}

const DAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function CustomDateTimePicker({
    visible,
    mode,
    value,
    onClose,
    onChange,
    isDark = false,
}: CustomDateTimePickerProps) {
    if (!visible) return null;

    const [tempDate, setTempDate] = useState(() => new Date(value || Date.now()));
    const [viewDate, setViewDate] = useState(() => new Date(value || Date.now()));

    useEffect(() => {
        if (visible && value) {
            setTempDate(new Date(value));
            setViewDate(new Date(value));
        }
    }, [visible, value]);

    const handleSave = () => {
        onChange(tempDate);
        onClose();
    };

    const bgCard = isDark ? '#1C1D22' : '#FFFFFF';
    const textColor = isDark ? '#F3F4F6' : '#111827';
    const textMuted = isDark ? '#9CA3AF' : '#6B7280';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

    const renderCalendar = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const days = [];

        for (let i = 0; i < firstDay; i++) {
            days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const isSelected =
                day === tempDate.getDate() &&
                month === tempDate.getMonth() &&
                year === tempDate.getFullYear();
            const isToday =
                new Date().toDateString() === new Date(year, month, day).toDateString();

            days.push(
                <TouchableOpacity
                    key={day}
                    style={[
                        styles.dayCell,
                        styles.dayBtn,
                        isSelected && styles.dayBtnSelected,
                    ]}
                    onPress={() => {
                        const newDate = new Date(tempDate);
                        newDate.setFullYear(year, month, day);
                        setTempDate(newDate);
                    }}
                    activeOpacity={0.7}
                >
                    <Text
                        style={[
                            styles.dayText,
                            { color: isSelected ? '#FFFFFF' : isToday ? '#2563EB' : textColor },
                            (isSelected || isToday) && styles.dayTextBold,
                        ]}
                    >
                        {day}
                    </Text>
                </TouchableOpacity>
            );
        }

        return (
            <View style={styles.calendarContainer}>
                {/* Selector de Mes */}
                <View style={styles.monthHeaderRow}>
                    <TouchableOpacity
                        style={styles.navArrowBtn}
                        onPress={() => setViewDate(new Date(year, month - 1, 1))}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <ChevronLeft size={22} color={textColor as any} />
                    </TouchableOpacity>
                    <Text style={[styles.monthTitleText, { color: textColor }]}>
                        {MONTHS[month]} {year}
                    </Text>
                    <TouchableOpacity
                        style={styles.navArrowBtn}
                        onPress={() => setViewDate(new Date(year, month + 1, 1))}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <ChevronRight size={22} color={textColor as any} />
                    </TouchableOpacity>
                </View>

                {/* Días de la semana */}
                <View style={styles.weekDaysRow}>
                    {DAYS.map((d, i) => (
                        <View key={i} style={styles.dayCell}>
                            <Text style={[styles.weekDayLabel, { color: textMuted }]}>{d}</Text>
                        </View>
                    ))}
                </View>

                {/* Grid de días */}
                <View style={styles.daysGrid}>{days}</View>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={styles.modalBackdrop}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <View style={StyleSheet.absoluteFill} />
                </TouchableWithoutFeedback>

                <View style={[styles.sheetCard, { backgroundColor: bgCard, borderColor }]}>
                    {/* Tirador */}
                    <View style={styles.sheetHandle} />

                    {/* Cabecera */}
                    <View style={styles.headerRow}>
                        <Text style={[styles.headerTitle, { color: textColor }]}>
                            {mode === 'date' ? 'Seleccionar Fecha' : 'Seleccionar Hora'}
                        </Text>
                        <TouchableOpacity
                            style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                            onPress={onClose}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <X size={18} color={textColor as any} />
                        </TouchableOpacity>
                    </View>

                    {/* Contenido: Calendario o TimeWheel */}
                    <View style={styles.contentWrap}>
                        {mode === 'date' ? (
                            renderCalendar()
                        ) : (
                            <View style={styles.timeWheelWrap}>
                                <TimeWheel value={tempDate} onChange={setTempDate} isDark={isDark} />
                            </View>
                        )}
                    </View>

                    {/* Botón de Confirmación Grande */}
                    <TouchableOpacity
                        style={styles.confirmBtn}
                        onPress={handleSave}
                        activeOpacity={0.8}
                    >
                        <Check size={20} color="#FFFFFF" strokeWidth={2.8} />
                        <Text style={styles.confirmBtnText}>Confirmar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheetCard: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: 1,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 20,
    },
    sheetHandle: {
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(150,150,150,0.4)',
        alignSelf: 'center',
        marginBottom: 12,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: -0.3,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    contentWrap: {
        marginBottom: 18,
    },
    calendarContainer: {
        width: '100%',
    },
    monthHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        paddingHorizontal: 6,
    },
    monthTitleText: {
        fontSize: 16,
        fontWeight: '700',
    },
    navArrowBtn: {
        padding: 4,
    },
    weekDaysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    weekDayLabel: {
        fontSize: 12,
        fontWeight: '700',
        textAlign: 'center',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: `${100 / 7}%`,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayBtn: {
        borderRadius: 20,
    },
    dayBtnSelected: {
        backgroundColor: '#2563EB',
    },
    dayText: {
        fontSize: 14,
    },
    dayTextBold: {
        fontWeight: '700',
    },
    timeWheelWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
    },
    confirmBtn: {
        backgroundColor: '#2563EB',
        height: 48,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
    confirmBtnText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
    },
});
