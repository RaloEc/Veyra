import { useRef, useEffect } from 'react';
import { View, TouchableOpacity, Animated } from 'react-native';
import { YStack, XStack, Label, Text } from 'tamagui';
import { Calendar, ChevronDown } from '@tamagui/lucide-icons';
import { TimeWheel } from '../../components/TimeWheel';
import { InlineDatePicker } from '../../components/InlineDatePicker';

interface DateTimeSelectorProps {
    date: Date;
    setDate: (date: Date) => void;
    showPicker: boolean;
    setShowPicker: (show: boolean) => void;
    animationHeight: Animated.Value;
    isDark: boolean;
}

export function DateTimeSelector({
    date,
    setDate,
    showPicker,
    setShowPicker,
    animationHeight,
    isDark
}: DateTimeSelectorProps) {

    return (
        <YStack gap="$0">
            <XStack alignItems="center" gap="$2">
                <Calendar size={18} color="$blue10" />
                <Label fontWeight="600" fontSize="$3" color={isDark ? '$gray9' : '$gray10'}>Fecha y Hora</Label>
            </XStack>

            {/* Unified Date and Time Card */}
            <YStack
                backgroundColor={isDark ? '#111' : 'white'}
                borderRadius="$5"
                overflow="hidden"
                borderWidth={1}
                borderColor={isDark ? '#222' : '#eee'}
                elevation={2}
                shadowColor="#000"
                shadowOffset={{ width: 0, height: 2 }}
                shadowOpacity={0.05}
                shadowRadius={10}
            >
                {/* Date and Time Row */}
                <TouchableOpacity
                    onPress={() => setShowPicker(!showPicker)}
                    style={{ paddingVertical: 8, paddingHorizontal: 12 }}
                    activeOpacity={0.7}
                >
                    <XStack alignItems="center" justifyContent="space-between">
                        {/* Date - Left Side */}
                        <YStack flex={1} justifyContent="center">
                            <XStack alignItems="center" gap="$2">
                                <Text fontSize="$6" fontWeight="900" color={isDark ? 'white' : 'black'} textTransform="capitalize">
                                    {date.toLocaleDateString('es-ES', {
                                        weekday: 'short',
                                        day: 'numeric',
                                        month: 'short'
                                    }).replace('.', '')}
                                </Text>
                                <Animated.View
                                    style={{
                                        transform: [{
                                            rotate: animationHeight.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: ['0deg', '180deg'],
                                            })
                                        }]
                                    }}
                                >
                                    <ChevronDown
                                        size={20}
                                        color="$blue10"
                                    />
                                </Animated.View>
                            </XStack>
                        </YStack>

                        {/* Time - Right Side */}
                        <YStack alignItems="center">
                            <TimeWheel value={date} onChange={setDate} isDark={isDark} />
                        </YStack>
                    </XStack>
                </TouchableOpacity>

                {/* Inline Date Picker */}
                <Animated.View
                    style={{
                        maxHeight: animationHeight.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 400],
                        }),
                        opacity: animationHeight.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [0, 0.5, 1],
                        }),
                        overflow: 'hidden',
                    }}
                >
                    <View
                        style={{
                            paddingHorizontal: 8,
                            paddingBottom: 12,
                            paddingTop: 8,
                            borderTopWidth: 1,
                            borderTopColor: isDark ? '#333' : '#f0f0f0',
                            backgroundColor: isDark ? '#0a0a0a' : '#fafafa'
                        }}
                    >
                        <InlineDatePicker
                            value={date}
                            onChange={setDate}
                            isDark={isDark}
                        />
                    </View>
                </Animated.View>
            </YStack>
        </YStack>
    );
}
