import { View, YStack, XStack, Text, H2, H4, Card, Button, ScrollView, Switch, Separator } from 'tamagui';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store/useStore';
import { Shield, Zap, AlertTriangle, Lock, Clock, ChevronLeft } from '@tamagui/lucide-icons';
import { useState } from 'react';
import { TouchableOpacity, OpaqueColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DisciplineModeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { theme } = useStore();
    const [strictModeActive, setStrictModeActive] = useState(false);
    const [blockSnooze, setBlockSnooze] = useState(false);
    const [maxSnoozes, setMaxSnoozes] = useState(3);
    const [duration, setDuration] = useState('1 hora');

    const colors = {
        bg: theme === 'dark' ? '#0a0a0a' : '#F8FAFC',
        surface: theme === 'dark' ? '#171717' : '#FFFFFF',
        textPrimary: theme === 'dark' ? '#EDEDED' : '#0c0a09',
        textSecondary: theme === 'dark' ? '#A1A1A1' : '#64748B',
        border: theme === 'dark' ? '#262626' : '#E2E8F0',
        brand: theme === 'dark' ? '#A1A1A1' : '#64748B',
        strict: (theme === 'dark' ? '#eab308' : '#F59E0B') as any,
        critical: (theme === 'dark' ? '#ef4444' : '#E11D48') as any,
    };

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            {/* Header de navegación */}
            <XStack
                px="$4"
                pt={0}
                pb={0}
                ai="center"
                gap="$3"
                mt="$-6"
            >
                <TouchableOpacity onPress={() => router.back()}>
                    <XStack
                        bg={colors.surface}
                        p="$2"
                        br="$10"
                        bw={1}
                        bc={colors.border as any}
                    >
                        <ChevronLeft size={20} color={colors.textPrimary as any} />
                    </XStack>
                </TouchableOpacity>
                <H2 fow="900" col={colors.textPrimary as any} fos="$6">Modo Estricto</H2>
            </XStack>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingTop: 0,
                    paddingBottom: insets.bottom + 40
                }}
            >
                <YStack gap="$6">
                    {/* Intro */}
                    <YStack gap="$1">
                        <Text fos="$3" fow="600" col={colors.textSecondary as any}>
                            REGLAS ANTI-PROCRASTINACIÓN
                        </Text>
                        <Text fos="$4" col={colors.textSecondary as any} o={0.8}>
                            Configura límites estrictos para asegurar que tus tareas se cumplan sin excusas.
                        </Text>
                    </YStack>

                    {/* Switch Maestro */}
                    <YStack
                        bg={strictModeActive ? (theme === 'dark' ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB') : colors.surface}
                        p="$5"
                        br="$6"
                        bw={2}
                        bc={strictModeActive ? colors.strict : colors.border}
                        gap="$4"
                    >
                        <XStack jc="space-between" ai="center">
                            <YStack f={1} gap="$1">
                                <XStack gap="$2" ai="center">
                                    <Zap size={18} color={strictModeActive ? colors.strict : colors.textSecondary} />
                                    <Text fos="$5" fow="800" col={colors.textPrimary as any}>
                                        Estatus del Modo
                                    </Text>
                                </XStack>
                                <Text fos="$2" col={colors.textSecondary as any}>
                                    {strictModeActive ? 'Presión alta activada' : 'Modo estándar'}
                                </Text>
                            </YStack>
                            <Switch
                                checked={strictModeActive}
                                onCheckedChange={setStrictModeActive}
                                size="$4"
                            >
                                <Switch.Thumb animation="quick" />
                            </Switch>
                        </XStack>

                        {strictModeActive && (
                            <YStack
                                gap="$2"
                                p="$3"
                                bg={theme === 'dark' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.1)'}
                                br="$4"
                            >
                                <XStack gap="$2" ai="center">
                                    <AlertTriangle size={14} color={colors.strict} />
                                    <Text fos="$2" fow="800" col={colors.strict}>
                                        SISTEMA REFORZADO
                                    </Text>
                                </XStack>
                                <Text fos="$2" col={colors.textSecondary as any} fow="600">
                                    Seguimientos automáticos cada 15 min y sonidos de alta frecuencia activados.
                                </Text>
                            </YStack>
                        )}
                    </YStack>

                    <Separator bc={colors.border as any} />

                    {/* Bloqueo de Posposiciones */}
                    <YStack gap="$4">
                        <XStack gap="$2" ai="center">
                            <Lock size={18} color={colors.critical} />
                            <Text fos="$4" fow="900" col={colors.textPrimary as any} ttransform="uppercase" lsp={1}>
                                Restricciones
                            </Text>
                        </XStack>

                        <YStack
                            bg={colors.surface}
                            p="$4"
                            br="$5"
                            bw={1}
                            bc={colors.border as any}
                            gap="$4"
                        >
                            <XStack jc="space-between" ai="center">
                                <YStack f={1}>
                                    <Text fow="700" col={colors.textPrimary as any}>
                                        Bloqueo total de "Snooze"
                                    </Text>
                                    <Text fos="$2" col={colors.textSecondary as any}>
                                        Elimina el botón para posponer
                                    </Text>
                                </YStack>
                                <Switch
                                    checked={blockSnooze}
                                    onCheckedChange={setBlockSnooze}
                                    size="$3"
                                >
                                    <Switch.Thumb animation="quick" />
                                </Switch>
                            </XStack>

                            {!blockSnooze && (
                                <>
                                    <Separator bc={colors.border as any} />
                                    <YStack gap="$3">
                                        <Text fow="700" col={colors.textPrimary as any}>
                                            Límite diario de intentos
                                        </Text>
                                        <XStack gap="$2">
                                            {[1, 3, 5].map((num) => (
                                                <TouchableOpacity
                                                    key={num}
                                                    onPress={() => setMaxSnoozes(num)}
                                                    style={{ flex: 1 }}
                                                >
                                                    <View
                                                        style={{
                                                            backgroundColor: maxSnoozes === num ? colors.textPrimary : colors.bg,
                                                            padding: 12,
                                                            borderRadius: 8,
                                                            alignItems: 'center',
                                                            borderWidth: 1,
                                                            borderColor: colors.border
                                                        }}
                                                    >
                                                        <Text
                                                            fow="900"
                                                            col={(maxSnoozes === num ? colors.surface : colors.textSecondary) as any}
                                                        >
                                                            {num}
                                                        </Text>
                                                    </View>
                                                </TouchableOpacity>
                                            ))}
                                        </XStack>
                                    </YStack>
                                </>
                            )}
                        </YStack>
                    </YStack>

                    {/* Duración */}
                    <YStack gap="$4">
                        <XStack gap="$2" ai="center">
                            <Clock size={18} color="#8B5CF6" />
                            <Text fos="$4" fow="900" col={colors.textPrimary as any} ttransform="uppercase" lsp={1}>
                                Vigencia del Modo
                            </Text>
                        </XStack>

                        <XStack gap="$2" fw="wrap">
                            {['1 hora', '24 horas', '1 semana', 'Indefinido'].map((time) => (
                                <TouchableOpacity
                                    key={time}
                                    onPress={() => setDuration(time)}
                                    style={{ flex: 1, minWidth: '45%' }}
                                >
                                    <View
                                        style={{
                                            backgroundColor: duration === time ? 'rgba(139, 92, 246, 0.1)' : colors.surface,
                                            padding: 12,
                                            borderRadius: 8,
                                            alignItems: 'center',
                                            borderWidth: 2,
                                            borderColor: duration === time ? '#8B5CF6' : colors.border
                                        }}
                                    >
                                        <Text
                                            fow="700"
                                            fos="$2"
                                            col={(duration === time ? '#8B5CF6' : colors.textSecondary) as any}
                                        >
                                            {time}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </XStack>
                    </YStack>

                    {/* Botón de Guardar */}
                    <Button
                        size="$5"
                        bg={colors.textPrimary}
                        br="$5"
                        pressStyle={{ scale: 0.98, opacity: 0.9 }}
                        onPress={() => router.back()}
                    >
                        <Text col={colors.surface as any} fow="900" lsp={1}>
                            APLICAR CONFIGURACIÓN
                        </Text>
                    </Button>

                    <Text fos="$2" col={colors.textSecondary as any} ta="center" o={0.6}>
                        El Modo Estricto anulará cualquier configuración individual de recordatorios para priorizar el cumplimiento.
                    </Text>
                </YStack>
            </ScrollView>
        </View>
    );
}
