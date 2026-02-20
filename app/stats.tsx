import { View, YStack, XStack, Text, H2, H4, Card, Button, ScrollView, Progress } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';
import { Target, TrendingUp, Award, Flame, Clock, Zap } from '@tamagui/lucide-icons';
import { useState, useEffect } from 'react';
import { ComplianceService } from '../src/services/complianceService';

export default function StatsScreen() {
    const { theme } = useStore();
    const [stats, setStats] = useState({
        totalCompleted: 0,
        totalFailed: 0,
        totalSnoozed: 0,
        completionRate: 0,
        currentStreak: 0,
        bestStreak: 0,
        productiveHours: {} as { [key: number]: number }
    });

    useEffect(() => {
        async function loadStats() {
            const data = await ComplianceService.getComplianceStats();
            setStats(data);
        }
        loadStats();
    }, []);

    const StatCard = ({ icon: Icon, label, value, color, subtitle }: any) => (
        <Card
            flex={1}
            minWidth={150}
            padding="$4"
            backgroundColor={theme === 'dark' ? '$gray2' : 'white'}
            borderWidth={2}
            borderColor={color}
        >
            <YStack gap="$2">
                <XStack justifyContent="space-between" alignItems="center">
                    <Icon size={24} color={color} />
                </XStack>
                <Text fontSize="$8" fontWeight="900" color={color}>
                    {value}
                </Text>
                <Text fontSize="$3" fontWeight="600" color={theme === 'dark' ? 'white' : 'black'}>
                    {label}
                </Text>
                {subtitle && (
                    <Text fontSize="$2" color="$gray10">
                        {subtitle}
                    </Text>
                )}
            </YStack>
        </Card>
    );

    // Get top productive hours
    const topHours = Object.entries(stats.productiveHours)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .filter(([, count]) => count > 0);

    return (
        <View style={{ flex: 1, backgroundColor: theme === 'dark' ? '#000' : '#F9F9F9' }}>

            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 100 }}>
                <YStack gap="$4">
                    <H2 color={theme === 'dark' ? 'white' : 'black'}>Estadísticas</H2>

                    {/* Tasa de Cumplimiento */}
                    <Card padding="$4" backgroundColor={theme === 'dark' ? '$gray2' : 'white'}>
                        <YStack gap="$3">
                            <XStack justifyContent="space-between" alignItems="center">
                                <H4 color={theme === 'dark' ? 'white' : 'black'}>
                                    Tasa de Cumplimiento
                                </H4>
                                <Text fontSize="$7" fontWeight="900" color="$blue10">
                                    {stats.completionRate.toFixed(1)}%
                                </Text>
                            </XStack>

                            <Progress value={stats.completionRate} size="$2">
                                <Progress.Indicator backgroundColor="$blue10" />
                            </Progress>

                            <Text fontSize="$2" color="$gray10">
                                De {stats.totalCompleted + stats.totalFailed} tareas totales
                            </Text>
                        </YStack>
                    </Card>

                    {/* Grid de Estadísticas */}
                    <XStack gap="$3" flexWrap="wrap">
                        <StatCard
                            icon={Target}
                            label="Completadas"
                            value={stats.totalCompleted}
                            color="$green10"
                            subtitle="Total de tareas completadas"
                        />

                        <StatCard
                            icon={TrendingUp}
                            label="Fallidas"
                            value={stats.totalFailed}
                            color="$red10"
                            subtitle="Tareas no completadas"
                        />
                    </XStack>

                    <XStack gap="$3" flexWrap="wrap">
                        <StatCard
                            icon={Clock}
                            label="Posposiciones"
                            value={stats.totalSnoozed}
                            color="$orange10"
                            subtitle="Veces que posponiste"
                        />

                        <StatCard
                            icon={Flame}
                            label="Racha Actual"
                            value={stats.currentStreak}
                            color="$purple10"
                            subtitle="Días consecutivos"
                        />
                    </XStack>

                    {/* Racha Más Larga */}
                    <Card padding="$4" backgroundColor={theme === 'dark' ? '$gray2' : 'white'}>
                        <YStack gap="$3">
                            <XStack gap="$2" alignItems="center">
                                <Award size={24} color="$yellow10" />
                                <H4 color={theme === 'dark' ? 'white' : 'black'}>
                                    Mejor Racha
                                </H4>
                            </XStack>

                            <XStack justifyContent="space-between" alignItems="center">
                                <Text fontSize="$4" color={theme === 'dark' ? '$gray11' : '$gray12'}>
                                    Racha más larga alcanzada
                                </Text>
                                <Text fontSize="$6" fontWeight="800" color="$yellow10">
                                    {stats.bestStreak} {stats.bestStreak === 1 ? 'día' : 'días'}
                                </Text>
                            </XStack>

                            <Text fontSize="$2" color="$gray10">
                                {stats.currentStreak >= stats.bestStreak && stats.currentStreak > 0
                                    ? "¡Estás en tu mejor momento!"
                                    : "¡Completa tareas diariamente para superar tu récord!"}
                            </Text>
                        </YStack>
                    </Card>

                    {/* Horas Más Productivas */}
                    <Card padding="$4" backgroundColor={theme === 'dark' ? '$gray2' : 'white'}>
                        <YStack gap="$3">
                            <XStack gap="$2" alignItems="center">
                                <Zap size={24} color="$blue10" />
                                <H4 color={theme === 'dark' ? 'white' : 'black'}>
                                    Horas Más Productivas
                                </H4>
                            </XStack>

                            {topHours.length === 0 ? (
                                <Text fontSize="$2" color="$gray10">
                                    Completa más tareas para ver tus horarios más productivos
                                </Text>
                            ) : (
                                <YStack gap="$3" mt="$2">
                                    {topHours.map(([hour, count]) => (
                                        <XStack key={hour} justifyContent="space-between" alignItems="center">
                                            <YStack>
                                                <Text fontWeight="700" color={theme === 'dark' ? 'white' : 'black'}>
                                                    {hour}:00 - {parseInt(hour) + 1}:00
                                                </Text>
                                                <Text fontSize="$1" color="$gray10">
                                                    {count} {count === 1 ? 'tarea' : 'tareas'}
                                                </Text>
                                            </YStack>
                                            <Progress value={(count / stats.totalCompleted) * 100} size="$1" width={120}>
                                                <Progress.Indicator backgroundColor="$blue10" />
                                            </Progress>
                                        </XStack>
                                    ))}
                                </YStack>
                            )}
                        </YStack>
                    </Card>

                    {/* Motivación */}
                    <Card
                        padding="$4"
                        backgroundColor="$blue10"
                    >
                        <YStack gap="$2" alignItems="center">
                            <Text fontSize="$5" fontWeight="800" color="white" textAlign="center">
                                {stats.currentStreak > 0 ? `🔥 ¡Llevas ${stats.currentStreak} días!` : "💪 ¡Empecemos hoy!"}
                            </Text>
                            <Text fontSize="$3" color="white" textAlign="center" opacity={0.9}>
                                {stats.currentStreak > 0
                                    ? "No dejes que se apague la llama."
                                    : "Completa tu primer recordatorio hoy para iniciar tu racha."}
                            </Text>
                        </YStack>
                    </Card>
                </YStack>
            </ScrollView>
        </View>
    );
}
