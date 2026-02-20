import React, { useRef, useEffect, useState, memo, useMemo } from 'react';
import { ScrollView, NativeSyntheticEvent, NativeScrollEvent, Platform, View as RNViewNative, TouchableOpacity, TextInput, StyleSheet, Vibration } from 'react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';
import * as Localization from 'expo-localization';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronUp, ChevronDown } from '@tamagui/lucide-icons';

interface TimeWheelProps {
    value: Date;
    onChange: (date: Date) => void;
    isDark?: boolean;
}

const ITEM_HEIGHT = 36; // More compact
const VISIBLE_ITEMS = 3;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PADDING = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

// Memoized item - color ONLY depends on isSelected, NOT on scroll position
const WheelItem = memo(({
    item,
    isSelected,
    isAbove,
    isBelow,
    isDark,
    isEditing,
    inputValue,
    onPress,
    onChangeText,
    onConfirm
}: {
    item: number;
    isSelected: boolean;
    isAbove: boolean;
    isBelow: boolean;
    isDark: boolean;
    isEditing: boolean;
    inputValue: string;
    onPress?: () => void;
    onChangeText?: (text: string) => void;
    onConfirm?: () => void;
}) => {
    if (isSelected && onPress) {
        return (
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={onPress}
                disabled={isEditing}
                style={{ height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' }}
            >
                {isEditing ? (
                    <TextInput
                        value={inputValue}
                        onChangeText={onChangeText}
                        keyboardType="number-pad"
                        maxLength={2}
                        autoFocus
                        selectTextOnFocus
                        style={[
                            styles.inlineInput,
                            { color: '#2979FF' }
                        ]}
                        onBlur={onConfirm}
                        onSubmitEditing={onConfirm}
                    />
                ) : (
                    <Text
                        fontSize={22}
                        fontWeight="900"
                        color="$blue10"
                    >
                        {item.toString().padStart(2, '0')}
                    </Text>
                )}
            </TouchableOpacity>
        );
    }

    if (isAbove) {
        return (
            <RNViewNative style={{ height: ITEM_HEIGHT, justifyContent: 'flex-end', alignItems: 'center' }}>
                <ChevronUp
                    size={20}
                    color={isDark ? '$blue10' : '$blue10'}
                    opacity={0.9}
                    style={{ marginBottom: -4 }}
                />
            </RNViewNative>
        );
    }

    if (isBelow) {
        return (
            <RNViewNative style={{ height: ITEM_HEIGHT, justifyContent: 'flex-start', alignItems: 'center' }}>
                <ChevronDown
                    size={20}
                    color={isDark ? '$blue10' : '$blue10'}
                    opacity={0.9}
                    style={{ marginTop: -4 }}
                />
            </RNViewNative>
        );
    }

    return (
        <RNViewNative style={{ height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
            <View width={4} height={4} borderRadius={2} backgroundColor={isDark ? '$gray11' : '$gray9'} opacity={0.2} />
        </RNViewNative>
    );
});

export function TimeWheel({ value, onChange, isDark = false }: TimeWheelProps) {
    const [isSystem24h, setIsSystem24h] = useState(true);

    // Selected index state - ONLY updated when scroll stops
    const [selectedHourIndex, setSelectedHourIndex] = useState(0);
    const [selectedMinuteIndex, setSelectedMinuteIndex] = useState(0);

    // Inline editing state
    const [editingHour, setEditingHour] = useState(false);
    const [editingMinute, setEditingMinute] = useState(false);
    const [hourInputValue, setHourInputValue] = useState('');
    const [minuteInputValue, setMinuteInputValue] = useState('');

    const hours12 = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
    const hours24 = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
    const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

    useEffect(() => {
        const locales = Localization.getLocales();
        const systemClock = locales?.[0]?.use24HourClock;
        if (systemClock !== undefined) {
            setIsSystem24h(systemClock);
        } else {
            const is24 = !new Date().toLocaleTimeString().toLowerCase().includes('am') &&
                !new Date().toLocaleTimeString().toLowerCase().includes('pm');
            setIsSystem24h(is24);
        }
    }, []);

    const hourScrollRef = useRef<ScrollView>(null);
    const minuteScrollRef = useRef<ScrollView>(null);

    // Sync from parent value (only when format changes or external update)
    useEffect(() => {
        const h = value.getHours();
        const m = value.getMinutes();

        const hIndex = isSystem24h ? hours24.indexOf(h) : hours12.indexOf(h % 12 || 12);
        const mIndex = minutes.indexOf(m);

        // Only update if indices actually changed
        if (hIndex !== selectedHourIndex) {
            setSelectedHourIndex(hIndex);
            setTimeout(() => {
                hourScrollRef.current?.scrollTo({ y: hIndex * ITEM_HEIGHT, animated: false });
            }, 50);
        }

        if (mIndex !== selectedMinuteIndex) {
            setSelectedMinuteIndex(mIndex);
            setTimeout(() => {
                minuteScrollRef.current?.scrollTo({ y: mIndex * ITEM_HEIGHT, animated: false });
            }, 50);
        }
    }, [isSystem24h]); // Only re-run when format detection completes

    // Real-time scroll handler to update visual index
    const handleScroll = (type: 'hour' | 'minute', event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = event.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);

        const data = type === 'hour' ? (isSystem24h ? hours24 : hours12) : minutes;
        if (index >= 0 && index < data.length) {
            if (type === 'hour') {
                if (selectedHourIndex !== index) setSelectedHourIndex(index);
            } else {
                if (selectedMinuteIndex !== index) setSelectedMinuteIndex(index);
            }
        }
    };

    // Manual snap + commit change when scroll ends
    const handleMomentumEnd = (type: 'hour' | 'minute', event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = event.nativeEvent.contentOffset.y;
        const index = Math.round(y / ITEM_HEIGHT);

        // Force exact snap to eliminate drift
        const scrollRef = type === 'hour' ? hourScrollRef : minuteScrollRef;
        scrollRef.current?.scrollTo({
            y: index * ITEM_HEIGHT,
            animated: true,
        });

        // Commit change to parent
        const newDate = new Date(value);

        if (type === 'hour') {
            const data = isSystem24h ? hours24 : hours12;
            if (index >= 0 && index < data.length) {
                const val = data[index];
                if (isSystem24h) {
                    newDate.setHours(val);
                } else {
                    const isPM = value.getHours() >= 12;
                    if (isPM) newDate.setHours(val === 12 ? 12 : val + 12);
                    else newDate.setHours(val === 12 ? 0 : val);
                }
            }
        } else {
            if (index >= 0 && index < minutes.length) {
                newDate.setMinutes(minutes[index]);
            }
        }

        if (newDate.getTime() !== value.getTime()) {
            onChange(newDate);
        }
    };

    // Handle tap to start inline editing
    const handleStartEditing = (type: 'hour' | 'minute') => {
        if (type === 'hour') {
            const data = isSystem24h ? hours24 : hours12;
            const currentValue = data[selectedHourIndex];
            setHourInputValue(String(currentValue).padStart(2, '0'));
            setEditingHour(true);
        } else {
            setMinuteInputValue(String(minutes[selectedMinuteIndex]).padStart(2, '0'));
            setEditingMinute(true);
        }
    };

    // Handle text change with auto-confirm on 2 digits
    const handleHourTextChange = (text: string) => {
        setHourInputValue(text);
        if (text.length === 2) {
            // Pass the text directly to avoid stale state
            setTimeout(() => confirmHourInput(text), 100);
        }
    };

    const handleMinuteTextChange = (text: string) => {
        setMinuteInputValue(text);
        if (text.length === 2) {
            // Pass the text directly to avoid stale state
            setTimeout(() => confirmMinuteInput(text), 100);
        }
    };

    // Confirm hour input
    const confirmHourInput = (textValue?: string) => {
        const valueToUse = textValue !== undefined ? textValue : hourInputValue;
        let inputValue = parseInt(valueToUse, 10);
        if (isNaN(inputValue)) {
            setEditingHour(false);
            return;
        }

        const newDate = new Date(value);
        const data = isSystem24h ? hours24 : hours12;
        const max = isSystem24h ? 23 : 12;
        const min = isSystem24h ? 0 : 1;

        inputValue = Math.max(min, Math.min(inputValue, max));

        const index = data.indexOf(inputValue);
        if (index !== -1) {
            setSelectedHourIndex(index);
            hourScrollRef.current?.scrollTo({
                y: index * ITEM_HEIGHT,
                animated: true,
            });

            if (isSystem24h) {
                newDate.setHours(inputValue);
            } else {
                const isPM = value.getHours() >= 12;
                if (isPM) newDate.setHours(inputValue === 12 ? 12 : inputValue + 12);
                else newDate.setHours(inputValue === 12 ? 0 : inputValue);
            }

            if (newDate.getTime() !== value.getTime()) {
                onChange(newDate);
            }

            // Light vibration feedback
            if (Platform.OS === 'ios' || Platform.OS === 'android') {
                Vibration.vibrate(10);
            }
        }

        setEditingHour(false);
    };

    // Confirm minute input
    const confirmMinuteInput = (textValue?: string) => {
        const valueToUse = textValue !== undefined ? textValue : minuteInputValue;
        let inputValue = parseInt(valueToUse, 10);
        if (isNaN(inputValue)) {
            setEditingMinute(false);
            return;
        }

        inputValue = Math.max(0, Math.min(inputValue, 59));
        const index = minutes.indexOf(inputValue);

        if (index !== -1) {
            setSelectedMinuteIndex(index);
            minuteScrollRef.current?.scrollTo({
                y: index * ITEM_HEIGHT,
                animated: true,
            });

            const newDate = new Date(value);
            newDate.setMinutes(inputValue);

            if (newDate.getTime() !== value.getTime()) {
                onChange(newDate);
            }

            // Light vibration feedback
            if (Platform.OS === 'ios' || Platform.OS === 'android') {
                Vibration.vibrate(10);
            }
        }

        setEditingMinute(false);
    };

    const toggleAmPm = () => {
        const newDate = new Date(value);
        const h = newDate.getHours();
        newDate.setHours(h >= 12 ? h - 12 : h + 12);
        onChange(newDate);
    };

    const renderWheel = (
        data: number[],
        selectedIndex: number,
        type: 'hour' | 'minute',
        ref: React.RefObject<ScrollView | null>,
        isEditing: boolean,
        inputValue: string,
        onTextChange: (text: string) => void,
        onConfirm: () => void
    ) => {
        return (
            <View height={WHEEL_HEIGHT} width={70} overflow="hidden" position="relative">
                {/* Selection Highlight Box */}
                <View
                    position="absolute"
                    top={PADDING}
                    left={4}
                    right={4}
                    height={ITEM_HEIGHT}
                    backgroundColor="$blue10"
                    borderRadius={10}
                    opacity={0.15}
                    pointerEvents="none"
                    zIndex={1}
                />

                <ScrollView
                    ref={ref}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    snapToAlignment="center"
                    decelerationRate="normal"
                    onScroll={(e) => handleScroll(type, e)}
                    scrollEventThrottle={16}
                    onMomentumScrollEnd={(e) => handleMomentumEnd(type, e)}
                    nestedScrollEnabled={true}
                    disableIntervalMomentum={true}
                    removeClippedSubviews={Platform.OS === 'android'}
                    scrollEnabled={!isEditing}
                >
                    {/* Dynamic Padding TOP */}
                    <RNViewNative style={{ height: PADDING }} />

                    {data.map((item, i) => (
                        <WheelItem
                            key={i}
                            item={item}
                            isSelected={selectedIndex === i}
                            isAbove={selectedIndex === i + 1}
                            isBelow={selectedIndex === i - 1}
                            isDark={isDark}
                            isEditing={isEditing && selectedIndex === i}
                            inputValue={inputValue}
                            onPress={selectedIndex === i ? () => handleStartEditing(type) : undefined}
                            onChangeText={onTextChange}
                            onConfirm={onConfirm}
                        />
                    ))}

                    {/* Dynamic Padding BOTTOM */}
                    <RNViewNative style={{ height: PADDING }} />
                </ScrollView>
            </View>
        );
    };

    const isPM = value.getHours() >= 12;

    return (
        <XStack justifyContent="center" gap="$2" alignItems="center">
            {renderWheel(
                isSystem24h ? hours24 : hours12,
                selectedHourIndex,
                'hour',
                hourScrollRef,
                editingHour,
                hourInputValue,
                handleHourTextChange,
                confirmHourInput
            )}

            <Text fontSize={22} fontWeight="900" color={isDark ? 'white' : 'black'} marginTop={-2}>:</Text>

            {renderWheel(
                minutes,
                selectedMinuteIndex,
                'minute',
                minuteScrollRef,
                editingMinute,
                minuteInputValue,
                handleMinuteTextChange,
                confirmMinuteInput
            )}

            {!isSystem24h && (
                <YStack marginLeft="$2" gap="$2">
                    <Button
                        size="$1"
                        paddingHorizontal="$3"
                        backgroundColor={!isPM ? '$blue10' : 'transparent'}
                        onPress={!isPM ? undefined : toggleAmPm}
                        chromeless={isPM}
                        borderRadius="$3"
                        height={30}
                        borderWidth={isPM ? 1 : 0}
                        borderColor={isDark ? '$gray6' : '$gray5'}
                    >
                        <Text fontSize={10} fontWeight="900" color={!isPM ? 'white' : (isDark ? '$gray11' : '$gray8')}>AM</Text>
                    </Button>
                    <Button
                        size="$1"
                        paddingHorizontal="$3"
                        backgroundColor={isPM ? '$blue10' : 'transparent'}
                        onPress={isPM ? undefined : toggleAmPm}
                        chromeless={!isPM}
                        borderRadius="$3"
                        height={30}
                        borderWidth={!isPM ? 1 : 0}
                        borderColor={isDark ? '$gray6' : '$gray5'}
                    >
                        <Text fontSize={10} fontWeight="900" color={isPM ? 'white' : (isDark ? '$gray11' : '$gray8')}>PM</Text>
                    </Button>
                </YStack>
            )}
        </XStack>
    );
}

const styles = StyleSheet.create({
    inlineInput: {
        fontSize: 20,
        fontWeight: '900',
        textAlign: 'center',
        padding: 0,
        margin: 0,
        width: 60,
        height: ITEM_HEIGHT,
    },
});
