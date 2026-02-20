import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { ChevronLeft, ChevronRight } from '@tamagui/lucide-icons';

interface InlineDatePickerProps {
    value: Date;
    onChange: (date: Date) => void;
    isDark?: boolean;
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function InlineDatePicker({ value, onChange, isDark = false }: InlineDatePickerProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date(value.getFullYear(), value.getMonth(), 1));

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days: (number | null)[] = [];

        // Add empty cells for days before the first day of the month
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }

        // Add all days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }

        return days;
    };

    const handleDayPress = (day: number) => {
        const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        newDate.setHours(value.getHours());
        newDate.setMinutes(value.getMinutes());
        onChange(newDate);
    };

    const goToPreviousMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const isToday = (day: number) => {
        const today = new Date();
        return day === today.getDate() &&
            currentMonth.getMonth() === today.getMonth() &&
            currentMonth.getFullYear() === today.getFullYear();
    };

    const isSelected = (day: number) => {
        return day === value.getDate() &&
            currentMonth.getMonth() === value.getMonth() &&
            currentMonth.getFullYear() === value.getFullYear();
    };

    const days = getDaysInMonth(currentMonth);

    return (
        <YStack gap="$2">
            {/* Header with month/year and navigation */}
            <XStack alignItems="center" justifyContent="space-between" paddingHorizontal="$2" marginTop="$2">
                <TouchableOpacity onPress={goToPreviousMonth}>
                    <YStack padding="$2">
                        <ChevronLeft size={20} color={isDark ? '#fff' : '#000'} />
                    </YStack>
                </TouchableOpacity>

                <Text style={[styles.monthYear, { color: isDark ? '#fff' : '#000' }]}>
                    {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </Text>

                <TouchableOpacity onPress={goToNextMonth}>
                    <YStack padding="$2">
                        <ChevronRight size={20} color={isDark ? '#fff' : '#000'} />
                    </YStack>
                </TouchableOpacity>
            </XStack>

            {/* Day headers */}
            <XStack justifyContent="space-around" paddingVertical="$2">
                {DAYS.map((day) => (
                    <View key={day} style={styles.dayHeader}>
                        <Text style={[styles.dayHeaderText, { color: isDark ? '#999' : '#666' }]}>
                            {day}
                        </Text>
                    </View>
                ))}
            </XStack>

            {/* Calendar grid */}
            <View style={styles.calendarGrid}>
                {days.map((day, index) => {
                    if (day === null) {
                        return <View key={`empty-${index}`} style={styles.dayCell} />;
                    }

                    const selected = isSelected(day);
                    const today = isToday(day);

                    return (
                        <TouchableOpacity
                            key={day}
                            onPress={() => handleDayPress(day)}
                            style={styles.dayCell}
                        >
                            <View
                                style={[
                                    styles.dayButton,
                                    selected && styles.selectedDay,
                                    today && !selected && styles.todayDay,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.dayText,
                                        { color: isDark ? '#fff' : '#000' },
                                        selected && styles.selectedDayText,
                                        today && !selected && styles.todayDayText,
                                    ]}
                                >
                                    {day}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </YStack>
    );
}

const styles = StyleSheet.create({
    monthYear: {
        fontSize: 16,
        fontWeight: '700',
    },
    dayHeader: {
        width: 40,
        alignItems: 'center',
    },
    dayHeaderText: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%', // 100% / 7 days
        aspectRatio: 1,
        padding: 2,
    },
    dayButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
    },
    dayText: {
        fontSize: 15,
        fontWeight: '500',
    },
    selectedDay: {
        backgroundColor: '#2979FF',
    },
    selectedDayText: {
        color: '#ffffff',
        fontWeight: '700',
    },
    todayDay: {
        borderWidth: 2,
        borderColor: '#2979FF',
    },
    todayDayText: {
        color: '#2979FF',
        fontWeight: '700',
    },
});
