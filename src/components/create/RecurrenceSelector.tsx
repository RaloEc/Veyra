import { TouchableOpacity, StyleSheet } from 'react-native';
import { YStack, XStack, Label, Text } from 'tamagui';
import { Repeat, ChevronDown, Check } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface RecurrenceSelectorProps {
    value: RecurrenceType;
    onChange: (value: RecurrenceType) => void;
    isDark: boolean;
}

const RECURRENCE_OPTIONS: RecurrenceType[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

export function RecurrenceSelector({ value, onChange, isDark }: RecurrenceSelectorProps) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);

    const getLabel = (type: RecurrenceType) => t(`create.recurrence.${type}`);

    return (
        <YStack gap="$0">
            <XStack alignItems="center" gap="$2">
                <Repeat size={18} color="$purple10" />
                <Label fontWeight="600" fontSize="$3" color={isDark ? '$gray9' : '$gray10'}>
                    {t('create.sections.recurrence')}
                </Label>
            </XStack>

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
                {/* Current Selection / Toggle */}
                <TouchableOpacity
                    onPress={() => setExpanded(!expanded)}
                    style={{ paddingVertical: 14, paddingHorizontal: 16 }}
                    activeOpacity={0.7}
                >
                    <XStack alignItems="center" justifyContent="space-between">
                        <XStack alignItems="center">
                            <Text
                                fontSize="$5"
                                fontWeight="700"
                                color={value === 'none' ? (isDark ? '$gray8' : '$gray9') : (isDark ? 'white' : 'black')}
                            >
                                {getLabel(value)}
                            </Text>
                        </XStack>
                        <ChevronDown
                            size={20}
                            color="$purple10"
                            style={{
                                transform: [{ rotate: expanded ? '180deg' : '0deg' }],
                            }}
                        />
                    </XStack>
                </TouchableOpacity>

                {/* Options List */}
                {expanded && (
                    <YStack
                        borderTopWidth={1}
                        borderTopColor={isDark ? '#222' : '#f0f0f0'}
                    >
                        {RECURRENCE_OPTIONS.map((option) => {
                            const isSelected = value === option;
                            return (
                                <TouchableOpacity
                                    key={option}
                                    onPress={() => {
                                        onChange(option);
                                        setExpanded(false);
                                    }}
                                    style={[
                                        styles.optionRow,
                                        isSelected && {
                                            backgroundColor: isDark ? '#1a1a2e' : '#f0edff',
                                        },
                                    ]}
                                    activeOpacity={0.7}
                                >
                                    <XStack alignItems="center" flex={1}>
                                        <YStack flex={1}>
                                            <Text
                                                fontSize="$4"
                                                fontWeight={isSelected ? '700' : '500'}
                                                color={isSelected
                                                    ? '$purple10'
                                                    : (isDark ? '$gray11' : '$gray11')
                                                }
                                            >
                                                {getLabel(option)}
                                            </Text>
                                            {option !== 'none' && (
                                                <Text
                                                    fontSize="$2"
                                                    color={isDark ? '$gray8' : '$gray9'}
                                                    mt="$0.5"
                                                >
                                                    {t(`create.recurrence.${option}_desc`)}
                                                </Text>
                                            )}
                                        </YStack>
                                        {isSelected && (
                                            <XStack
                                                width={22}
                                                height={22}
                                                borderRadius={11}
                                                backgroundColor="$purple10"
                                                alignItems="center"
                                                justifyContent="center"
                                            >
                                                <Check color="white" size={14} strokeWidth={4} />
                                            </XStack>
                                        )}
                                    </XStack>
                                </TouchableOpacity>
                            );
                        })}
                    </YStack>
                )}
            </YStack>
        </YStack>
    );
}

const styles = StyleSheet.create({
    optionRow: {
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
});
