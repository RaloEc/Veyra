import { Button, Text, AnimatePresence, YStack } from 'tamagui';
import { Plus } from '@tamagui/lucide-icons';
import { useRouter, useSegments } from 'expo-router';
import { useStore } from '../store/useStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAccentColor } from '../theme/accentColors';

export function FloatingCreateButton() {
    const router = useRouter();
    const segments = useSegments();
    const { theme, detailReminder } = useStore();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { accent, primaryMuted } = useAccentColor();

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

                        // Diseño con el Tema Dinámico (Más sutil en modo oscuro)
                        backgroundColor={theme === 'dark' ? (primaryMuted as any) : (accent as any)}
                        borderWidth={0}

                        elevation={15}
                        shadowColor={theme === 'dark' ? (primaryMuted as any) : (accent as any)}
                        shadowOffset={{ width: 0, height: 8 }}
                        shadowOpacity={0.35}
                        shadowRadius={15}

                        pressStyle={{
                            scale: 0.95,
                            opacity: 0.85,
                        }}

                        onPress={() => router.push('/create')}
                        icon={<Plus size={20} color="#FFFFFF" strokeWidth={3} />}
                        paddingHorizontal="$5"
                    >
                        <Text
                            color="#FFFFFF"
                            fontWeight="900"
                            fontSize="$4"
                            fontFamily="$body"
                            letterSpacing={1.5}
                            textTransform="uppercase"
                        >
                            {t('home.create_fab')}
                        </Text>
                    </Button>
                </YStack>
            )}
        </AnimatePresence>
    );
}
