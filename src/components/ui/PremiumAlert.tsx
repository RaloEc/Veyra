import React from 'react';
import { Modal, TouchableOpacity, View } from 'react-native';
import { YStack, XStack, Text, Button, Theme } from 'tamagui';
import { Crown, X } from '@tamagui/lucide-icons';

interface PremiumAlertProps {
    isVisible: boolean;
    onClose: () => void;
    title: string;
    description: string;
    isDark: boolean;
    onUpgrade?: () => void;
}

export function PremiumAlert({ isVisible, onClose, title, description, isDark, onUpgrade }: PremiumAlertProps) {
    return (
        <Modal
            visible={isVisible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <YStack
                flex={1}
                style={{
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    paddingHorizontal: 20
                }}
            >
                <Theme name={isDark ? 'dark' : 'light'}>
                    <YStack
                        width="90%"
                        style={{
                            maxWidth: 400,
                            backgroundColor: isDark ? '#1a1a1a' : '#fff',
                            borderRadius: 24,
                            padding: 24,
                            borderWidth: 1,
                            borderColor: isDark ? '#333' : '#eee',
                            elevation: 10,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.3,
                            shadowRadius: 8
                        }}
                    >
                        <XStack
                            style={{
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 16
                            }}
                        >
                            <XStack style={{ alignItems: 'center' }} gap="$2">
                                <YStack
                                    style={{
                                        backgroundColor: '#FEF9C3', // $yellow2 approx
                                        padding: 8,
                                        borderRadius: 12
                                    }}
                                >
                                    <Crown size={20} color="#CA8A04" /> {/* $yellow10 approx */}
                                </YStack>
                                <Text fontWeight="800" fontSize="$5" color={isDark ? '$gray1' : '$gray12'}>
                                    {title}
                                </Text>
                            </XStack>
                            <TouchableOpacity onPress={onClose}>
                                <X size={20} color={isDark ? '$gray8' : '$gray10'} />
                            </TouchableOpacity>
                        </XStack>

                        <Text
                            fontSize="$4"
                            lineHeight={24}
                            color={isDark ? '$gray9' : '$gray11'}
                            style={{ marginBottom: 24 }}
                        >
                            {description}
                        </Text>

                        <YStack gap="$3">
                            <Button
                                background="#EAB308" // $yellow10
                                style={{ borderRadius: 12, height: 50 }}
                                onPress={onUpgrade}
                                hoverStyle={{ scale: 0.98 }}
                                pressStyle={{ scale: 0.95 }}
                            >
                                <Text color="black" fontWeight="800">Hazte Premium</Text>
                            </Button>
                            <Button
                                variant="outlined"
                                style={{
                                    borderRadius: 12,
                                    height: 50,
                                    borderColor: isDark ? '#333' : '#ddd',
                                    borderWidth: 1
                                }}
                                onPress={onClose}
                            >
                                <Text color={isDark ? '$gray1' : '$gray12'} fontWeight="600">Entendido</Text>
                            </Button>
                        </YStack>
                    </YStack>
                </Theme>
            </YStack>
        </Modal>
    );
}
