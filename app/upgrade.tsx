import { View, YStack, XStack, Text, H2, H4, Card, Button, ScrollView, Separator } from 'tamagui';
import { useStore } from '../src/store/useStore';
import { Crown, Check, Zap, Cloud, BarChart, Image as ImageIcon, Flame, Minus } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

export default function UpgradeScreen() {
    const { t } = useTranslation();
    const { theme } = useStore();

    const isDark = theme === 'dark';
    const bg = isDark ? '#0A0A0A' : '#F8FAFC';
    const surface = isDark ? '#171717' : '#FFFFFF';
    const primaryText = isDark ? '#FFFFFF' : '#0F172A';
    const secondaryText = isDark ? '#A1A1A1' : '#64748B';
    const borderColor = isDark ? '#262626' : '#E2E8F0';

    const features = [
        {
            icon: Cloud,
            title: t('upgrade.features.sync.title'),
            description: t('upgrade.features.sync.desc'),
            free: t('upgrade.features.sync.free'),
            pro: t('upgrade.features.sync.pro'),
            iconColor: '#3B82F6' // blue
        },
        {
            icon: ImageIcon,
            title: t('upgrade.features.media.title'),
            description: t('upgrade.features.media.desc'),
            free: t('upgrade.features.media.free'),
            pro: t('upgrade.features.media.pro'),
            iconColor: '#8B5CF6' // purple
        },
        {
            icon: Zap,
            title: t('upgrade.features.levels.title'),
            description: t('upgrade.features.levels.desc'),
            free: t('upgrade.features.levels.free'),
            pro: t('upgrade.features.levels.pro'),
            iconColor: '#F59E0B' // orange/yellow
        },
        {
            icon: BarChart,
            title: t('upgrade.features.stats.title'),
            description: t('upgrade.features.stats.desc'),
            free: t('upgrade.features.stats.free'),
            pro: t('upgrade.features.stats.pro'),
            iconColor: '#10B981' // green
        },
    ];

    const plans = [
        {
            name: t('upgrade.plans.monthly'),
            price: '$4.99',
            period: t('upgrade.plans.period_month'),
            color: '#3B82F6', // blue
            bgLight: 'rgba(59, 130, 246, 0.1)',
            popular: false,
        },
        {
            name: t('upgrade.plans.yearly'),
            price: '$39.99',
            period: t('upgrade.plans.period_year'),
            color: '#8B5CF6', // purple
            bgLight: 'rgba(139, 92, 246, 0.1)',
            popular: true,
            savings: t('upgrade.plans.savings', { percent: 33 }),
        },
        {
            name: t('upgrade.plans.lifetime'),
            price: '$149.99',
            period: t('upgrade.plans.period_lifetime'),
            color: '#F59E0B', // gold
            bgLight: 'rgba(245, 158, 11, 0.1)',
            popular: false,
            badge: t('upgrade.coming_soon_lifetime'),
            isLifetime: true,
        },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: bg }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 30, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                <YStack gap="$5">

                    {/* Header - Hero Section */}
                    <YStack gap="$3" alignItems="center" paddingVertical="$6">
                        <XStack backgroundColor={isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)'} paddingHorizontal="$3" paddingVertical="$1" borderRadius="$10" alignItems="center" gap="$2">
                            <Crown size={16} color="#F59E0B" />
                            <Text fontSize="$2" fontWeight="800" color="#F59E0B" textTransform="uppercase" letterSpacing={1}>Veyra PRO</Text>
                        </XStack>

                        <H2 color={primaryText} textAlign="center" fontWeight="900" mt="$2">
                            {t('upgrade.title')}
                        </H2>

                        <Text fontSize="$4" color={secondaryText} textAlign="center" maxWidth={320} alignSelf="center" lineHeight={22}>
                            {t('upgrade.description')}
                        </Text>
                    </YStack>

                    {/* Planes de Suscripción */}
                    <YStack gap="$3" marginTop="$2">
                        <H4 color={primaryText} fontWeight="800" mb="$2">
                            {t('upgrade.plans.title')}
                        </H4>

                        {plans.map((plan, index) => (
                            <Card
                                key={index}
                                padding="$4"
                                backgroundColor={surface}
                                borderWidth={plan.popular ? 2 : 1}
                                borderColor={plan.popular ? plan.color : borderColor}
                                position="relative"
                                borderRadius="$5"
                                elevation={plan.popular ? 10 : 2}
                                shadowColor={plan.color}
                            >
                                {/* Badges */}
                                {plan.popular && (
                                    <View position="absolute" top={-12} right={16} backgroundColor={plan.color} paddingHorizontal="$3" paddingVertical="$1" borderRadius="$6" elevation={5}>
                                        <XStack alignItems="center" gap="$1">
                                            <Flame size={14} color="white" />
                                            <Text fontSize="$2" fontWeight="900" color="white" textTransform="uppercase">
                                                {t('upgrade.popular')}
                                            </Text>
                                        </XStack>
                                    </View>
                                )}

                                {plan.badge && !plan.popular && (
                                    <View position="absolute" top={-12} right={16} backgroundColor={plan.color} paddingHorizontal="$3" paddingVertical="$1" borderRadius="$6" elevation={5}>
                                        <Text fontSize="$2" fontWeight="900" color="white" textTransform="uppercase">
                                            {plan.badge}
                                        </Text>
                                    </View>
                                )}

                                <YStack gap="$3">
                                    <XStack justifyContent="space-between" alignItems="flex-start">
                                        <YStack>
                                            <Text fontSize="$5" fontWeight="900" color={plan.color}>
                                                {plan.name}
                                            </Text>
                                            {plan.savings && (
                                                <XStack backgroundColor="rgba(16, 185, 129, 0.15)" alignSelf="flex-start" px="$2" py="$1" borderRadius="$2" mt="$1">
                                                    <Text fontSize="$2" color="#10B981" fontWeight="800">
                                                        {plan.savings}
                                                    </Text>
                                                </XStack>
                                            )}
                                        </YStack>

                                        <YStack alignItems="flex-end">
                                            <XStack alignItems="baseline" gap="$1">
                                                <Text fontSize="$8" fontWeight="900" color={primaryText}>
                                                    {plan.price}
                                                </Text>
                                            </XStack>
                                            <Text fontSize="$3" color={secondaryText} fontWeight="600" mt="$-1">
                                                {plan.period}
                                            </Text>
                                        </YStack>
                                    </XStack>

                                    <Button
                                        size="$4"
                                        backgroundColor={isDark ? '#262626' : '#F1F5F9'}
                                        disabled
                                        opacity={0.8}
                                        mt="$2"
                                        borderRadius="$4"
                                    >
                                        <Text color={secondaryText} fontWeight="800" textTransform="uppercase" letterSpacing={1}>
                                            {t('upgrade.coming_soon_btn')}
                                        </Text>
                                    </Button>
                                </YStack>
                            </Card>
                        ))}
                    </YStack>

                    <Separator marginVertical="$2" borderColor={borderColor} />

                    {/* Comparación de Características (Tabla) */}
                    <YStack gap="$4">
                        <H4 color={primaryText} fontWeight="800">
                            {t('upgrade.features_title')}
                        </H4>

                        <YStack borderWidth={1} borderColor={borderColor} borderRadius="$5" backgroundColor={surface} overflow="hidden">
                            {/* Header de la tabla */}
                            <XStack paddingVertical="$3" paddingHorizontal="$4" backgroundColor={isDark ? '#262626' : '#F1F5F9'} borderBottomWidth={1} borderColor={borderColor}>
                                <Text flex={1.5} fontSize="$2" fontWeight="800" color={secondaryText} textTransform="uppercase"></Text>
                                <Text flex={1} fontSize="$2" fontWeight="800" color={secondaryText} textAlign="center" textTransform="uppercase">{t('upgrade.free_label')}</Text>
                                <XStack flex={1} justifyContent="center" alignItems="center" gap="$1">
                                    <Crown size={14} color="#F59E0B" />
                                    <Text fontSize="$2" fontWeight="900" color="#F59E0B" textAlign="center" textTransform="uppercase">{t('upgrade.pro_label')}</Text>
                                </XStack>
                            </XStack>

                            {/* Filas */}
                            {features.map((feature, index) => {
                                const Icon = feature.icon;
                                const isLast = index === features.length - 1;
                                return (
                                    <YStack key={index}>
                                        <XStack paddingVertical="$3" paddingHorizontal="$4" alignItems="center" borderBottomWidth={isLast ? 0 : 1} borderColor={borderColor}>

                                            <YStack flex={1.5} gap="$1" paddingRight="$2">
                                                <XStack gap="$2" alignItems="center">
                                                    <View backgroundColor={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'} p="$1.5" borderRadius="$3">
                                                        <Icon size={16} color={feature.iconColor} />
                                                    </View>
                                                    <Text fontSize="$3" fontWeight="800" color={primaryText} flex={1}>
                                                        {feature.title}
                                                    </Text>
                                                </XStack>
                                                <Text fontSize="$1" color={secondaryText} lineHeight={16}>
                                                    {feature.description}
                                                </Text>
                                            </YStack>

                                            <YStack flex={1} alignItems="center" justifyContent="center" px="$1">
                                                {typeof feature.free === 'boolean' ? (
                                                    feature.free ? <Check size={20} color={secondaryText} /> : <Minus size={20} color={secondaryText} opacity={0.5} />
                                                ) : (
                                                    <Text fontSize="$2" color={secondaryText} fontWeight="600" textAlign="center">
                                                        {feature.free}
                                                    </Text>
                                                )}
                                            </YStack>

                                            <YStack flex={1} alignItems="center" justifyContent="center" px="$1" backgroundColor="rgba(245, 158, 11, 0.05)" py="$2" borderRadius="$3">
                                                {typeof feature.pro === 'boolean' ? (
                                                    feature.pro ? <Check size={20} color="#F59E0B" /> : <Minus size={20} color={secondaryText} />
                                                ) : (
                                                    <Text fontSize="$2" color="#F59E0B" fontWeight="800" textAlign="center">
                                                        {feature.pro}
                                                    </Text>
                                                )}
                                            </YStack>
                                        </XStack>
                                    </YStack>
                                );
                            })}
                        </YStack>
                    </YStack>

                    {/* Footer Info */}
                    <Text fontSize="$1" color={secondaryText} textAlign="center" marginTop="$4" opacity={0.6}>
                        {t('upgrade.footer_msg')}
                    </Text>
                </YStack>
            </ScrollView>
        </View>
    );
}
