import { Button, Text, AnimatePresence, YStack } from 'tamagui';
import { Plus } from '@tamagui/lucide-icons';
import { useRouter, useSegments } from 'expo-router';
import { useStore } from '../store/useStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function FloatingCreateButton() {
    const router = useRouter();
    const segments = useSegments();
    const { theme, detailReminder } = useStore();
    const insets = useSafeAreaInsets();

    // El botón SOLO debe aparecer en la pantalla principal (cuando segments esté vacío)
    // y cuando NO haya un recordatorio abierto en detalle.
    const isMainScreen = segments[0] === undefined;
    const shouldHide = !isMainScreen;

    return (
        <AnimatePresence>
            {!shouldHide && (
                <YStack
                    key="floating-create-container"
                    position="absolute"
                    bottom={insets.bottom + 30}
                    alignSelf="center"
                    zIndex={1000}
                    // @ts-ignore
                    animation="quick"
                    enterStyle={{ opacity: 0, scale: 0.8, y: 50 }}
                    exitStyle={{ opacity: 0, scale: 0.8, y: 50 }}
                >
                    <Button
                        size="$4"
                        borderRadius={100}
                        height={52}

                        // Diseño Monocromático de Alto Contraste (Estilo Premium)
                        backgroundColor={theme === 'dark' ? '#FFFFFF' : '#000000'}
                        borderWidth={0}

                        elevation={15}
                        shadowColor={theme === 'dark' ? '$white' : '$black'}
                        shadowOffset={{ width: 0, height: 8 }}
                        shadowOpacity={0.25}
                        shadowRadius={15}

                        pressStyle={{
                            scale: 0.95,
                            opacity: 0.9,
                            backgroundColor: theme === 'dark' ? '#f0f0f0' : '#1a1a1a'
                        }}

                        onPress={() => router.push('/create')}
                        icon={<Plus size={20} color={theme === 'dark' ? '#000000' : '#FFFFFF'} strokeWidth={3} />}
                        paddingHorizontal="$5"
                    >
                        <Text
                            color={theme === 'dark' ? '#000000' : '#FFFFFF'}
                            fontWeight="900"
                            fontSize="$4"
                            fontFamily="$body"
                            letterSpacing={1.5}
                            textTransform="uppercase"
                        >
                            Crear
                        </Text>
                    </Button>
                </YStack>
            )}
        </AnimatePresence>
    );
}
