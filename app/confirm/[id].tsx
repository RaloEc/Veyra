import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, YStack, H2, Paragraph, Button, Spacer } from 'tamagui';
import { useStore } from '../../src/store/useStore';
import { Check, X, Clock } from '@tamagui/lucide-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { Audio } from 'expo-av';

export default function ConfirmScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { reminders, markAsCompleted, snoozeReminder } = useStore();
    const [sound, setSound] = useState<Audio.Sound>();

    const reminder = reminders.find(r => r.id === id);

    useEffect(() => {
        // Play annoying sound if critical
        if (reminder?.control_level === 'critical') {
            playSound();
        }
        return () => {
            sound?.unloadAsync();
        };
    }, [reminder]);

    async function playSound() {
        // Placeholder for sound logic
        // const { sound } = await Audio.Sound.createAsync(require('../../assets/alarm.mp3'));
        // setSound(sound);
        // await sound.playAsync();
    }

    if (!reminder) {
        return (
            <YStack flex={1} justifyContent="center" alignItems="center">
                <Text>Recordatorio no encontrado o ya procesado.</Text>
                <Button onPress={() => router.replace('/')}>Volver</Button>
            </YStack>
        );
    }

    const handleDone = async () => {
        await markAsCompleted(id);
        router.replace('/');
    };

    const handleSnooze = async () => {
        // Snooze for 15 mins
        await snoozeReminder(String(id), 15);
        router.replace('/');
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#7c1f1f' }} edges={['top', 'bottom', 'left', 'right']}>
            <YStack flex={1} padding="$5" justifyContent="space-between" backgroundColor="#7c1f1f">
                <YStack gap="$4" alignItems="center" marginTop="$10">
                    <Clock size={64} color="white" />
                    <H2 textAlign="center" color="white">{reminder.title}</H2>
                    <Paragraph textAlign="center" size="$5" color="$white">
                        {reminder.control_level === 'critical' ? 'CRÍTICO: Debes confirmar ahora.' : '¿Ya lo hiciste?'}
                    </Paragraph>
                </YStack>

                <YStack gap="$3" marginBottom="$5">
                    <Button
                        size="$6"
                        theme="active"
                        backgroundColor="$green9"
                        icon={Check}
                        onPress={handleDone}
                    >
                        <Text fontWeight="bold" color="white">Sí, ya lo hice</Text>
                    </Button>

                    <Button
                        size="$5"
                        variant="outlined"
                        borderColor="white"
                        icon={Clock}
                        onPress={handleSnooze}
                    >
                        <Text color="white">No, posponer 15 min</Text>
                    </Button>

                    {reminder.control_level !== 'critical' && (
                        <Button chromeless onPress={() => router.replace('/')}>
                            <Text color="white" opacity={0.8}>Ignorar por ahora</Text>
                        </Button>
                    )}
                </YStack>
            </YStack>
        </SafeAreaView>
    );
}
