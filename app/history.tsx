import { useState, useCallback } from 'react';
import { View, Text, YStack, XStack, Button, Card, H3, Paragraph, ScrollView, Theme } from 'tamagui';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store/useStore';
import { useFocusEffect } from 'expo-router';
import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { ArrowLeft, RefreshCw, Trash2, CheckCircle, XCircle } from '@tamagui/lucide-icons';
import { Reminder } from '../src/types/db';

export default function HistoryScreen() {
    const router = useRouter();
    const { history, loadHistory, restoreReminder, deleteForever, theme } = useStore();
    const [filter, setFilter] = useState<'completed' | 'deleted'>('completed');

    useFocusEffect(
        useCallback(() => {
            loadHistory();
        }, [])
    );

    const filteredHistory = history.filter(item => {
        if (filter === 'completed') return item.status === 'completed' && item.deleted === 0;
        if (filter === 'deleted') return item.deleted === 1;
        return false;
    });

    const renderItem = ({ item }: { item: Reminder }) => (
        <Card
            elevation={2}
            borderWidth={1}
            marginVertical="$2"
            backgroundColor={theme === 'dark' ? '$gray2' : 'white'}
            borderColor={theme === 'dark' ? '$gray4' : '$gray5'}
        >
            <Card.Header padding="$3">
                <XStack justifyContent="space-between" alignItems="center">
                    <YStack flex={1}>
                        <H3 fontSize="$4" color={theme === 'dark' ? 'white' : 'black'} textDecorationLine={filter === 'deleted' ? 'line-through' : 'none'}>
                            {item.title}
                        </H3>
                        <Paragraph theme="alt2" fontSize="$2">
                            {format(item.due_date_ms, 'PPp')}
                        </Paragraph>
                        {item.description && (
                            <Paragraph fontSize="$2" opacity={0.7} numberOfLines={1}>
                                {item.description}
                            </Paragraph>
                        )}
                    </YStack>

                    <XStack gap="$2">
                        {filter === 'deleted' ? (
                            <>
                                <Button
                                    size="$3"
                                    circular
                                    icon={RefreshCw}
                                    backgroundColor="$blue9"
                                    onPress={() => restoreReminder(item.id)}
                                />
                                <Button
                                    size="$3"
                                    circular
                                    icon={Trash2}
                                    backgroundColor="$red9"
                                    onPress={() => deleteForever(item.id)}
                                />
                            </>
                        ) : (
                            <Button
                                size="$3"
                                circular
                                icon={Trash2} // Move completed to trash
                                backgroundColor="$gray8"
                                onPress={() => useStore.getState().deleteReminder(item.id).then(loadHistory)}
                            />
                        )}
                    </XStack>
                </XStack>
            </Card.Header>
        </Card>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme === 'dark' ? '#000' : 'white' }} edges={['top', 'left', 'right', 'bottom']}>
            <YStack f={1} padding="$4" gap="$4">
                <XStack alignItems="center" gap="$3">
                    <Button icon={ArrowLeft} circular chromeless onPress={() => router.back()} />
                    <H3 color={theme === 'dark' ? 'white' : 'black'}>Historial</H3>
                </XStack>

                <XStack gap="$2" backgroundColor="$gray4" padding="$1" borderRadius="$4">
                    <Button
                        flex={1}
                        size="$3"
                        theme={filter === 'completed' ? 'active' : undefined}
                        backgroundColor={filter === 'completed' ? '$blue9' : 'transparent'}
                        onPress={() => setFilter('completed')}
                    >
                        <Text color={filter === 'completed' ? 'white' : '$gray11'}>Completados</Text>
                    </Button>
                    <Button
                        flex={1}
                        size="$3"
                        theme={filter === 'deleted' ? 'active' : undefined}
                        backgroundColor={filter === 'deleted' ? '$red9' : 'transparent'}
                        onPress={() => setFilter('deleted')}
                    >
                        <Text color={filter === 'deleted' ? 'white' : '$gray11'}>Papelera</Text>
                    </Button>
                </XStack>

                <FlatList
                    data={filteredHistory}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    ListEmptyComponent={
                        <YStack alignItems="center" marginTop="$10" gap="$4">
                            <Text color="$gray10">
                                {filter === 'completed' ? 'No hay tareas completadas aún' : 'La papelera está vacía'}
                            </Text>
                        </YStack>
                    }
                />
            </YStack>
        </SafeAreaView>
    );
}
