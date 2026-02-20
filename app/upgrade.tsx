import { View, YStack, XStack, Text, H2, H4, Card, Button, ScrollView } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';
import { Crown, Check, Zap, TrendingUp, Cloud, Download } from '@tamagui/lucide-icons';

export default function UpgradeScreen() {
    const { theme } = useStore();

    const features = [
        {
            icon: Zap,
            title: 'Recordatorios Ilimitados',
            description: 'Crea tantos recordatorios como necesites sin límites',
            free: '3 activos',
            pro: 'Ilimitados',
        },
        {
            icon: TrendingUp,
            title: 'Todos los Niveles de Control',
            description: 'Acceso a niveles Normal, Estricto y Crítico',
            free: 'Solo Normal',
            pro: 'Todos',
        },
        {
            icon: Cloud,
            title: 'Sincronización en la Nube',
            description: 'Tus recordatorios en todos tus dispositivos',
            free: false,
            pro: true,
        },
        {
            icon: Download,
            title: 'Exportar Datos',
            description: 'Descarga tu historial en CSV o JSON',
            free: false,
            pro: true,
        },
    ];

    const plans = [
        {
            name: 'Pro Mensual',
            price: '$4.99',
            period: '/mes',
            color: '$blue10',
            popular: false,
        },
        {
            name: 'Pro Anual',
            price: '$39.99',
            period: '/año',
            color: '$purple10',
            popular: true,
            savings: 'Ahorra 33%',
        },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: theme === 'dark' ? '#000' : '#F9F9F9' }}>

            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 20, paddingBottom: 100 }}>
                <YStack gap="$4">
                    {/* Header */}
                    <YStack gap="$2" alignItems="center" paddingVertical="$4">
                        <Crown size={48} color="$yellow10" />
                        <H2 color={theme === 'dark' ? 'white' : 'black'} textAlign="center">
                            Mejora a Pro
                        </H2>
                        <Text fontSize="$4" color="$gray10" textAlign="center">
                            Desbloquea todo el potencial de la app
                        </Text>
                    </YStack>

                    {/* Comparación de Características */}
                    <YStack gap="$2">
                        <H4 color={theme === 'dark' ? 'white' : 'black'}>
                            Características
                        </H4>

                        {features.map((feature, index) => {
                            const Icon = feature.icon;
                            return (
                                <Card
                                    key={index}
                                    padding="$4"
                                    backgroundColor={theme === 'dark' ? '$gray2' : 'white'}
                                >
                                    <YStack gap="$3">
                                        <XStack gap="$3" alignItems="flex-start">
                                            <Icon size={24} color="$blue10" />
                                            <YStack flex={1} gap="$1">
                                                <Text
                                                    fontSize="$4"
                                                    fontWeight="700"
                                                    color={theme === 'dark' ? 'white' : 'black'}
                                                >
                                                    {feature.title}
                                                </Text>
                                                <Text fontSize="$2" color="$gray10">
                                                    {feature.description}
                                                </Text>
                                            </YStack>
                                        </XStack>

                                        <XStack gap="$4" marginTop="$2">
                                            <YStack flex={1} gap="$1">
                                                <Text fontSize="$2" color="$gray10">Gratis</Text>
                                                <XStack gap="$2" alignItems="center">
                                                    {feature.free === true || feature.free === false ? (
                                                        feature.free ? (
                                                            <Check size={16} color="$green10" />
                                                        ) : (
                                                            <Text color="$red10">✗</Text>
                                                        )
                                                    ) : (
                                                        <Text fontSize="$3" color={theme === 'dark' ? '$gray11' : '$gray12'}>
                                                            {feature.free as string}
                                                        </Text>
                                                    )}
                                                </XStack>
                                            </YStack>
                                            <YStack flex={1} gap="$1">
                                                <Text fontSize="$2" color="$yellow10" fontWeight="700">Pro</Text>
                                                <XStack gap="$2" alignItems="center">
                                                    {feature.pro === true || feature.pro === false ? (
                                                        feature.pro && <Check size={16} color="$yellow10" />
                                                    ) : (
                                                        <Text fontSize="$3" fontWeight="700" color="$yellow10">
                                                            {feature.pro as string}
                                                        </Text>
                                                    )}
                                                </XStack>
                                            </YStack>
                                        </XStack>
                                    </YStack>
                                </Card>
                            );
                        })}
                    </YStack>

                    {/* Planes */}
                    <YStack gap="$2" marginTop="$4">
                        <H4 color={theme === 'dark' ? 'white' : 'black'}>
                            Elige tu Plan
                        </H4>

                        {plans.map((plan, index) => (
                            <Card
                                key={index}
                                padding="$4"
                                backgroundColor={theme === 'dark' ? '$gray2' : 'white'}
                                borderWidth={plan.popular ? 3 : 1}
                                borderColor={plan.popular ? '$yellow10' : '$gray5'}
                                position="relative"
                                opacity={0.7}
                            >
                                {plan.popular && (
                                    <View
                                        position="absolute"
                                        top={-12}
                                        right={16}
                                        backgroundColor="$yellow10"
                                        paddingHorizontal="$3"
                                        paddingVertical="$1"
                                        borderRadius="$4"
                                    >
                                        <Text fontSize="$2" fontWeight="800" color="white">
                                            MÁS POPULAR
                                        </Text>
                                    </View>
                                )}

                                <YStack gap="$3">
                                    <XStack justifyContent="space-between" alignItems="center">
                                        <YStack>
                                            <Text fontSize="$5" fontWeight="800" color={plan.color}>
                                                {plan.name}
                                            </Text>
                                            {plan.savings && (
                                                <Text fontSize="$2" color="$green10" fontWeight="700">
                                                    {plan.savings}
                                                </Text>
                                            )}
                                        </YStack>
                                        <View backgroundColor="$gray5" paddingHorizontal="$2" paddingVertical="$0.5" borderRadius="$2">
                                            <Text fontSize="$1" fontWeight="800" color="$gray10">PROXIMAMENTE</Text>
                                        </View>
                                    </XStack>

                                    <XStack alignItems="baseline" gap="$1">
                                        <Text fontSize="$8" fontWeight="900" color={theme === 'dark' ? 'white' : 'black'}>
                                            {plan.price}
                                        </Text>
                                        <Text fontSize="$3" color="$gray10">
                                            {plan.period}
                                        </Text>
                                    </XStack>

                                    <Button
                                        size="$4"
                                        backgroundColor="$gray7"
                                        disabled
                                        opacity={0.6}
                                    >
                                        <Text color="white" fontWeight="700">Próximamente</Text>
                                    </Button>
                                </YStack>
                            </Card>
                        ))}
                    </YStack>

                    {/* Términos (Opcional, reducidos ya que no hay suscripción activa) */}
                    <Text fontSize="$1" color="$gray10" textAlign="center" marginTop="$2" opacity={0.5}>
                        La sección Pro estará disponible en las próximas actualizaciones.
                    </Text>
                </YStack>
            </ScrollView>
        </View>
    );
}
