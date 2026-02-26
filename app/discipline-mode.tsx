import { View, YStack, XStack, Text, H2, H4, Card, Button, ScrollView, Switch, Separator } from 'tamagui';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store/useStore';
import { Shield, Zap, AlertTriangle, Lock, Clock, ChevronLeft } from '@tamagui/lucide-icons';
import { useState } from 'react';
import { TouchableOpacity, OpaqueColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAccentColor } from '../src/theme/accentColors';

export default function DisciplineModeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { theme } = useStore();
    const [strictModeActive, setStrictModeActive] = useState(false);
    const [blockSnooze, setBlockSnooze] = useState(false);
    const [maxSnoozes, setMaxSnoozes] = useState(3);
    const [duration, setDuration] = useState('1_hour');
    const { accent } = useAccentColor();

    const colors = {
        bg: theme === 'dark' ? '#0a0a0a' : '#F8FAFC',
        surface: theme === 'dark' ? '#171717' : '#FFFFFF',
        textPrimary: theme === 'dark' ? '#EDEDED' : '#0c0a09',
        textSecondary: theme === 'dark' ? '#A1A1A1' : '#64748B',
        border: theme === 'dark' ? '#262626' : '#E2E8F0',
        brand: accent,
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
                <H2 fow="900" col={colors.textPrimary as any} fos="$6">{t('discipline.title')}</H2>
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
                            {t('discipline.rules_title')}
                        </Text>
                        <Text fos="$4" col={colors.textSecondary as any} o={0.8}>
                            {t('discipline.intro')}
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
                                        {t('discipline.status_card_title')}
                                    </Text>
                                </XStack>
                                <Text fos="$2" col={colors.textSecondary as any}>
                                    {strictModeActive ? t('discipline.status_strict') : t('discipline.status_standard')}
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
                                        {t('discipline.reinforced_system')}
                                    </Text>
                                </XStack>
                                <Text fos="$2" col={colors.textSecondary as any} fow="600">
                                    {t('discipline.reinforced_desc')}
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
                                {t('discipline.restrictions_title')}
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
                                        {t('discipline.block_snooze_title')}
                                    </Text>
                                    <Text fos="$2" col={colors.textSecondary as any}>
                                        {t('discipline.block_snooze_desc')}
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
                                            {t('discipline.daily_limit_title')}
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
                                {t('discipline.mode_validity_title')}
                            </Text>
                        </XStack>

                        <XStack gap="$2" fw="wrap">
                            {[
                                { key: '1_hour', label: t('discipline.durations.1_hour') },
                                { key: '24_hours', label: t('discipline.durations.24_hours') },
                                { key: '1_week', label: t('discipline.durations.1_week') },
                                { key: 'indefinite', label: t('discipline.durations.indefinite') }
                            ].map((item) => (
                                <TouchableOpacity
                                    key={item.key}
                                    onPress={() => setDuration(item.key)}
                                    style={{ flex: 1, minWidth: '45%' }}
                                >
                                    <View
                                        style={{
                                            backgroundColor: duration === item.key ? 'rgba(139, 92, 246, 0.1)' : colors.surface,
                                            padding: 12,
                                            borderRadius: 8,
                                            alignItems: 'center',
                                            borderWidth: 2,
                                            borderColor: duration === item.key ? '#8B5CF6' : colors.border
                                        }}
                                    >
                                        <Text
                                            fow="700"
                                            fos="$2"
                                            col={(duration === item.key ? '#8B5CF6' : colors.textSecondary) as any}
                                        >
                                            {item.label}
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
                            {t('discipline.apply_button')}
                        </Text>
                    </Button>

                    <Text fos="$2" col={colors.textSecondary as any} ta="center" o={0.6}>
                        {t('discipline.footer_note')}
                    </Text>
                </YStack>
            </ScrollView>
        </View>
    );
}
