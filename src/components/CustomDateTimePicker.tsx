import React, { useState, useEffect } from 'react';
import { Sheet, YStack, XStack, Text, Button, Separator } from 'tamagui';
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
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function CustomDateTimePicker({ visible, mode, value, onClose, onChange, isDark = false }: CustomDateTimePickerProps) {
    const [tempDate, setTempDate] = useState(new Date(value));
    const [viewDate, setViewDate] = useState(new Date(value));

    useEffect(() => {
        if (visible) {
            setTempDate(new Date(value));
            setViewDate(new Date(value));
        }
    }, [visible, value]);

    const handleSave = () => {
        onChange(tempDate);
        onClose();
    };

    const renderCalendar = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const days = [];

        for (let i = 0; i < firstDay; i++) {
            days.push(<YStack key={`empty-${i}`} width={`${100 / 7}%`} height={40} />);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isSelected = date.getDate() === tempDate.getDate() &&
                date.getMonth() === tempDate.getMonth() &&
                date.getFullYear() === tempDate.getFullYear();
            const isToday = new Date().toDateString() === date.toDateString();

            days.push(
                <Button
                    key={day}
                    width={`${100 / 7}%`}
                    height={40}
                    circular
                    chromeless={!isSelected}
                    backgroundColor={isSelected ? '$blue10' : 'transparent'}
                    onPress={() => {
                        const newDate = new Date(tempDate);
                        newDate.setFullYear(year, month, day);
                        setTempDate(newDate);
                    }}
                    padding={0}
                >
                    <Text
                        color={isSelected ? 'white' : (isToday ? '$blue10' : (isDark ? 'white' : 'black'))}
                        fontWeight={isSelected || isToday ? 'bold' : 'normal'}
                    >
                        {day}
                    </Text>
                </Button>
            );
        }

        return (
            <YStack gap="$4" paddingHorizontal="$2">
                <XStack justifyContent="space-between" alignItems="center" marginBottom="$2">
                    <Button size="$3" circular chromeless onPress={() => setViewDate(new Date(year, month - 1, 1))} icon={<ChevronLeft size={20} color={isDark ? 'white' : 'black'} />} />
                    <Text fontSize="$6" fontWeight="bold" color={isDark ? 'white' : 'black'}>{MONTHS[month]} {year}</Text>
                    <Button size="$3" circular chromeless onPress={() => setViewDate(new Date(year, month + 1, 1))} icon={<ChevronRight size={20} color={isDark ? 'white' : 'black'} />} />
                </XStack>
                <XStack mb="$2">
                    {DAYS.map((d, i) => (
                        <YStack key={i} width={`${100 / 7}%`} alignItems="center">
                            <Text fontSize="$2" fontWeight="bold" color="$gray10">{d}</Text>
                        </YStack>
                    ))}
                </XStack>
                <XStack flexWrap="wrap">{days}</XStack>
            </YStack>
        );
    };

    const snapPoints = mode === 'time' ? [45] : [65];

    return (
        <Sheet
            modal
            open={visible}
            onOpenChange={onClose}
            snapPoints={snapPoints}
            dismissOnSnapToBottom
            zIndex={100_000}
        >
            <Sheet.Overlay enterStyle={{ opacity: 0 }} exitStyle={{ opacity: 0 }} />
            <Sheet.Frame padding="$4" backgroundColor={isDark ? '$gray1' : 'white'} borderTopLeftRadius="$6" borderTopRightRadius="$6">
                <Sheet.Handle backgroundColor="$gray8" />

                <YStack flex={1} gap="$2" marginTop="$2">
                    <XStack justifyContent="space-between" alignItems="center">
                        <Text fontSize="$6" fontWeight="bold" color={isDark ? 'white' : 'black'}>
                            {mode === 'date' ? 'Seleccionar Fecha' : 'Hora'}
                        </Text>
                        <Button
                            size="$3"
                            circular
                            icon={<X size={20} />}
                            onPress={onClose}
                            chromeless
                        />
                    </XStack>

                    {!mode || mode === 'date' && <Separator borderColor="$gray4" />}

                    <YStack flex={1} justifyContent="center" alignItems="center">
                        {mode === 'date' ? renderCalendar() : <TimeWheel value={tempDate} onChange={setTempDate} isDark={isDark} />}
                    </YStack>

                    <Button
                        size="$5"
                        backgroundColor="$blue10"
                        onPress={handleSave}
                        icon={<Check size={20} color="white" />}
                        borderRadius="$4"
                        marginBottom="$2"
                    >
                        <Text color="white" fontWeight="bold">Confirmar</Text>
                    </Button>
                </YStack>
            </Sheet.Frame>
        </Sheet>
    );
}
