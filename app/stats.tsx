import { View, YStack, XStack, Text, H2, ScrollView } from 'tamagui';
import { useStore } from '../src/store/useStore';
import {
    Target, TrendingUp, Award, Flame, Clock, Zap, BarChart3,
    Layers, ChevronLeft, AlertTriangle, CheckCircle2, Lightbulb,
    StickyNote, Pin, Paperclip, ArrowUpRight, ArrowDownRight, Minus, Info
} from '@tamagui/lucide-icons';
import { useState, useEffect, useCallback } from 'react';
import { ComplianceService, FullStats, SmartInsight } from '../src/services/complianceService';
import { useTranslation } from 'react-i18next';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useAccentColor } from '../src/theme/accentColors';

export default function StatsScreen() {
    const { t } = useTranslation();
    const { theme, language } = useStore();
    const router = useRouter();
    const isDark = theme === 'dark';

    const { accent } = useAccentColor();

    const colors = {
        bg: isDark ? '#0a0a0a' : '#F8FAFC',
        surface: isDark ? '#171717' : '#FFFFFF',
        textPrimary: isDark ? '#EDEDED' : '#0c0a09',
        textSecondary: isDark ? '#A1A1A1' : '#64748B',
        textMuted: isDark ? '#525252' : '#94A3B8',
        border: isDark ? '#262626' : '#E2E8F0',
        brand: accent,
        green: isDark ? '#22c55e' : '#10B981',
        red: isDark ? '#ef4444' : '#E11D48',
        orange: isDark ? '#f97316' : '#EA580C',
        blue: isDark ? '#3b82f6' : '#2563EB',
        purple: isDark ? '#a855f7' : '#7C3AED',
        yellow: isDark ? '#eab308' : '#D97706',
        cyan: isDark ? '#06b6d4' : '#0891B2',
    };

    const [stats, setStats] = useState<FullStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

    const toggleTooltip = (key: string) => {
        setActiveTooltip(prev => prev === key ? null : key);
    };

    useFocusEffect(
        useCallback(() => {
            loadStats();
        }, [])
    );

    async function loadStats() {
        setLoading(true);
        try {
            const data = await ComplianceService.getFullStats();
            setStats(data);
        } catch (e) {
            console.error('Failed to load stats:', e);
        } finally {
            setLoading(false);
        }
    }

    if (!stats && loading) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
                <Text color={colors.textSecondary}>{t('stats.title')}...</Text>
            </View>
        );
    }

    if (!stats) return null;

    const total = stats.totalCompleted + stats.totalFailed;

    // Helper: productivity score (0-100)
    const score = Math.min(100, Math.round(
        (stats.completionRate * 0.5) +
        (Math.min(stats.currentStreak, 30) / 30 * 25) +
        (stats.behavior.snoozeRate < 20 ? 25 : stats.behavior.snoozeRate < 50 ? 15 : 5)
    ));

    // Weekly chart: max value for scaling
    const weeklyMax = Math.max(...stats.weeklyActivity.map(d => d.completed), 1);

    // Top productive hours (top 3)
    const topHours = Object.entries(stats.productiveHours)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
        .filter(([, count]) => count > 0);

    // Reorder weekly to start on Monday (1,2,3,4,5,6,0)
    const orderedWeek = [1, 2, 3, 4, 5, 6, 0].map(d => stats.weeklyActivity[d]);

    // Day names for insights
    const dayNames: Record<number, string> = {};
    for (let i = 0; i < 7; i++) {
        dayNames[i] = t(`stats.days_short.${i}`);
    }

    // Get insight text
    const getInsightText = (insight: SmartInsight): string => {
        switch (insight.key) {
            case 'best_hour':
                return t('stats.insight_best_hour', { hour: insight.params?.hour });
            case 'best_day':
                return t('stats.insight_best_day', { day: dayNames[insight.params?.day ?? 0] });
            case 'level_comparison':
                return t('stats.insight_level_comparison', {
                    best_rate: insight.params?.best_rate,
                    best_level: t(`stats.levels.${insight.params?.best_level}`),
                    worst_rate: insight.params?.worst_rate,
                    worst_level: t(`stats.levels.${insight.params?.worst_level}`),
                });
            case 'no_snooze':
                return t('stats.insight_no_snooze');
            case 'high_snooze':
                return t('stats.insight_high_snooze', { rate: insight.params?.rate });
            case 'improving':
                return t('stats.insight_improving', { percent: insight.params?.percent });
            case 'declining':
                return t('stats.insight_declining', { percent: insight.params?.percent });
            case 'great_streak':
                return t('stats.insight_great_streak', { days: insight.params?.days });
            default:
                return '';
        }
    };

    const getInsightIcon = (insight: SmartInsight) => {
        if (insight.type === 'positive') return <CheckCircle2 size={14} color={colors.green} />;
        if (insight.type === 'warning') return <AlertTriangle size={14} color={colors.orange} />;
        return <Lightbulb size={14} color={colors.blue} />;
    };

    // ─── SECTION HEADER ───
    const SectionHeader = ({ icon: Icon, title, color = colors.textPrimary, subtitle }: any) => (
        <XStack alignItems="center" gap="$2" mb="$3" mt="$2">
            <Icon size={18} color={color} />
            <Text fontSize="$4" fontWeight="800" color={color} letterSpacing={-0.3}>
                {title}
            </Text>
            {subtitle && (
                <Text fontSize="$2" color={colors.textMuted} ml="auto" fontWeight="600">
                    {subtitle}
                </Text>
            )}
        </XStack>
    );

    // ─── MINI STAT CARD ───
    const MiniStat = ({ label, value, color, icon: Icon }: any) => (
        <YStack
            flex={1}
            backgroundColor={colors.surface}
            borderRadius="$4"
            padding="$3"
            borderWidth={1}
            borderColor={colors.border}
            gap="$1"
        >
            <XStack alignItems="center" gap="$1.5">
                <Icon size={14} color={color || colors.textSecondary} />
                <Text fontSize="$1" fontWeight="600" color={colors.textSecondary} textTransform="uppercase">
                    {label}
                </Text>
            </XStack>
            <Text fontSize="$6" fontWeight="900" color={color || colors.textPrimary}>
                {value}
            </Text>
        </YStack>
    );

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <ScrollView
                px="$4"
                contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
                showsVerticalScrollIndicator={false}
            >
                {/* ─── HEADER ─── */}
                <XStack alignItems="center" justifyContent="space-between" h={50} mb="$3">
                    <XStack alignItems="center" gap="$3">
                        <TouchableOpacity onPress={() => router.back()}>
                            <ChevronLeft size={28} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <H2 fontSize="$7" fontWeight="900" color={colors.textPrimary} letterSpacing={-0.5}>
                            {t('stats.title')}
                        </H2>
                    </XStack>
                </XStack>

                {/* ─── SCORE + STREAK + TODAY (Hero Row) ─── */}
                <XStack gap="$3" mb="$3">
                    {/* Score Circle */}
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleTooltip('score')} activeOpacity={0.8}>
                        <YStack
                            backgroundColor={activeTooltip === 'score' ? (isDark ? '#1c1c1c' : '#F1F5F9') : colors.surface}
                            borderRadius="$5"
                            padding="$4"
                            borderWidth={1}
                            borderColor={activeTooltip === 'score'
                                ? (score >= 70 ? colors.green : score >= 40 ? colors.orange : colors.red)
                                : colors.border}
                            alignItems="center"
                            gap="$2"
                        >
                            <View
                                width={64}
                                height={64}
                                borderRadius={32}
                                borderWidth={4}
                                borderColor={score >= 70 ? colors.green : score >= 40 ? colors.orange : colors.red}
                                justifyContent="center"
                                alignItems="center"
                            >
                                <Text fontSize="$6" fontWeight="900"
                                    color={score >= 70 ? colors.green : score >= 40 ? colors.orange : colors.red}>
                                    {score}
                                </Text>
                            </View>
                            <Text fontSize="$1" fontWeight="700" color={colors.textSecondary} textTransform="uppercase" letterSpacing={0.5}>
                                {t('stats.score')}
                            </Text>
                        </YStack>
                    </TouchableOpacity>

                    {/* Streak */}
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleTooltip('streak')} activeOpacity={0.8}>
                        <YStack
                            backgroundColor={activeTooltip === 'streak' ? (isDark ? '#1c1c1c' : '#F1F5F9') : colors.surface}
                            borderRadius="$5"
                            padding="$4"
                            borderWidth={1}
                            borderColor={activeTooltip === 'streak' ? colors.purple : colors.border}
                            alignItems="center"
                            gap="$2"
                        >
                            <View
                                width={64}
                                height={64}
                                borderRadius={32}
                                backgroundColor={isDark ? 'rgba(168, 85, 247, 0.12)' : 'rgba(124, 58, 237, 0.08)'}
                                justifyContent="center"
                                alignItems="center"
                            >
                                <Flame size={28} color={colors.purple} />
                            </View>
                            <Text fontSize="$6" fontWeight="900" color={colors.purple}>
                                {stats.currentStreak}
                            </Text>
                            <Text fontSize="$1" fontWeight="700" color={colors.textSecondary} textTransform="uppercase" letterSpacing={0.5}>
                                {t('stats.current_streak')}
                            </Text>
                        </YStack>
                    </TouchableOpacity>

                    {/* Today */}
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleTooltip('today')} activeOpacity={0.8}>
                        <YStack
                            backgroundColor={activeTooltip === 'today' ? (isDark ? '#1c1c1c' : '#F1F5F9') : colors.surface}
                            borderRadius="$5"
                            padding="$4"
                            borderWidth={1}
                            borderColor={activeTooltip === 'today' ? colors.green : colors.border}
                            alignItems="center"
                            gap="$2"
                        >
                            <View
                                width={64}
                                height={64}
                                borderRadius={32}
                                backgroundColor={isDark ? 'rgba(34, 197, 94, 0.12)' : 'rgba(16, 185, 129, 0.08)'}
                                justifyContent="center"
                                alignItems="center"
                            >
                                <Target size={28} color={colors.green} />
                            </View>
                            <Text fontSize="$6" fontWeight="900" color={colors.green}>
                                {stats.daily.completedToday}
                            </Text>
                            <Text fontSize="$1" fontWeight="700" color={colors.textSecondary} textTransform="uppercase" letterSpacing={0.5}>
                                {t('stats.completed_today')}
                            </Text>
                        </YStack>
                    </TouchableOpacity>
                </XStack>

                {/* Tooltip bubble for hero cards */}
                {activeTooltip && ['score', 'streak', 'today'].includes(activeTooltip) && (
                    <YStack
                        mb="$5"
                        backgroundColor={isDark ? '#1a1a1a' : '#F8FAFC'}
                        borderRadius="$4"
                        borderWidth={1}
                        borderColor={
                            activeTooltip === 'score'
                                ? (score >= 70 ? colors.green : score >= 40 ? colors.orange : colors.red)
                                : activeTooltip === 'streak' ? colors.purple : colors.green
                        }
                        padding="$3"
                    >
                        <XStack alignItems="flex-start" gap="$2">
                            <Info size={14} color={
                                activeTooltip === 'score'
                                    ? (score >= 70 ? colors.green : score >= 40 ? colors.orange : colors.red)
                                    : activeTooltip === 'streak' ? colors.purple : colors.green
                            } style={{ marginTop: 2 }} />
                            <Text fontSize="$2" color={colors.textSecondary} flex={1} lineHeight={18}>
                                {t(`stats.tooltip_${activeTooltip}`)}
                            </Text>
                        </XStack>
                    </YStack>
                )}

                {/* ─── COMPLIANCE RATE BAR ─── */}
                <TouchableOpacity onPress={() => toggleTooltip('compliance')} activeOpacity={0.9}>
                    <YStack
                        backgroundColor={activeTooltip === 'compliance' ? (isDark ? '#1c1c1c' : '#F1F5F9') : colors.surface}
                        borderRadius="$5"
                        padding="$4"
                        borderWidth={1}
                        borderColor={activeTooltip === 'compliance' ? colors.blue : colors.border}
                        mb={activeTooltip === 'compliance' ? '$2' : '$5'}
                    >
                        <XStack justifyContent="space-between" alignItems="center" mb="$3">
                            <XStack alignItems="center" gap="$2">
                                <TrendingUp size={18} color={colors.blue} />
                                <Text fontSize="$4" fontWeight="800" color={colors.textPrimary}>
                                    {t('stats.compliance_rate')}
                                </Text>
                            </XStack>
                            <Text fontSize="$6" fontWeight="900" color={colors.blue}>
                                {stats.completionRate.toFixed(1)}%
                            </Text>
                        </XStack>

                        {/* Progress bar */}
                        <View
                            height={8}
                            borderRadius={4}
                            backgroundColor={isDark ? '#262626' : '#E2E8F0'}
                            overflow="hidden"
                            mb="$2"
                        >
                            <View
                                height={8}
                                borderRadius={4}
                                backgroundColor={colors.blue}
                                width={`${Math.min(stats.completionRate, 100)}%` as any}
                            />
                        </View>

                        <XStack justifyContent="space-between">
                            <Text fontSize="$1" color={colors.textMuted} fontWeight="600">
                                {t('stats.total_tasks', { count: total })}
                            </Text>
                            <XStack gap="$3">
                                <XStack alignItems="center" gap="$1">
                                    <View width={8} height={8} borderRadius={4} backgroundColor={colors.green} />
                                    <Text fontSize="$1" color={colors.textSecondary} fontWeight="600">{stats.totalCompleted}</Text>
                                </XStack>
                                <XStack alignItems="center" gap="$1">
                                    <View width={8} height={8} borderRadius={4} backgroundColor={colors.red} />
                                    <Text fontSize="$1" color={colors.textSecondary} fontWeight="600">{stats.totalFailed}</Text>
                                </XStack>
                            </XStack>
                        </XStack>
                    </YStack>
                </TouchableOpacity>

                {/* Compliance tooltip */}
                {activeTooltip === 'compliance' && (
                    <YStack
                        mb="$5"
                        backgroundColor={isDark ? '#1a1a1a' : '#F8FAFC'}
                        borderRadius="$4"
                        borderWidth={1}
                        borderColor={colors.blue}
                        padding="$3"
                    >
                        <XStack alignItems="flex-start" gap="$2">
                            <Info size={14} color={colors.blue} style={{ marginTop: 2 }} />
                            <Text fontSize="$2" color={colors.textSecondary} flex={1} lineHeight={18}>
                                {t('stats.tooltip_compliance')}
                            </Text>
                        </XStack>
                    </YStack>
                )}

                {/* ─── WEEKLY ACTIVITY CHART ─── */}
                <YStack
                    backgroundColor={colors.surface}
                    borderRadius="$5"
                    padding="$4"
                    borderWidth={1}
                    borderColor={colors.border}
                    mb="$5"
                >
                    <SectionHeader
                        icon={BarChart3}
                        title={t('stats.weekly_activity')}
                        color={colors.cyan}
                        subtitle={t('stats.weekly_activity_desc')}
                    />

                    {/* Bar Chart */}
                    <XStack justifyContent="space-between" alignItems="flex-end" height={160} mt="$2" px="$1">
                        {orderedWeek.map((dayData, index) => {
                            const maxBarArea = 100;
                            const totalForDay = dayData.completed + dayData.failed;
                            const barHeight = weeklyMax > 0 ? (dayData.completed / weeklyMax) * maxBarArea : 0;
                            const failedHeight = weeklyMax > 0 ? (dayData.failed / weeklyMax) * maxBarArea : 0;
                            // Cap combined height so it never exceeds maxBarArea
                            const combinedHeight = barHeight + failedHeight;
                            const scale = combinedHeight > maxBarArea ? maxBarArea / combinedHeight : 1;
                            const finalBarHeight = Math.max(barHeight * scale, dayData.completed > 0 ? 4 : 2);
                            const finalFailedHeight = Math.max(failedHeight * scale, dayData.failed > 0 ? 4 : 0);

                            const dayIndex = [1, 2, 3, 4, 5, 6, 0][index];
                            const isToday = new Date().getDay() === dayIndex;

                            return (
                                <YStack key={index} alignItems="center" flex={1}>
                                    {/* Count label */}
                                    <Text fontSize={10} fontWeight="700" color={colors.textMuted} height={16}>
                                        {dayData.completed > 0 ? dayData.completed : ''}
                                    </Text>

                                    {/* Bars container */}
                                    <YStack alignItems="center" justifyContent="flex-end" height={maxBarArea} mt="$1">
                                        {dayData.failed > 0 && (
                                            <View
                                                width={22}
                                                height={finalFailedHeight}
                                                borderRadius={6}
                                                backgroundColor={isDark ? 'rgba(239,68,68,0.3)' : 'rgba(225,29,72,0.15)'}
                                                mb={2}
                                            />
                                        )}
                                        <View
                                            width={22}
                                            height={finalBarHeight}
                                            borderRadius={6}
                                            backgroundColor={isToday ? colors.cyan : (isDark ? 'rgba(6,182,212,0.4)' : 'rgba(8,145,178,0.25)')}
                                        />
                                    </YStack>

                                    {/* Day label */}
                                    <Text
                                        fontSize={11}
                                        fontWeight={isToday ? '900' : '600'}
                                        color={isToday ? colors.cyan : colors.textMuted}
                                        mt="$1.5"
                                        height={16}
                                    >
                                        {t(`stats.days_short.${dayIndex}`)}
                                    </Text>
                                </YStack>
                            );
                        })}
                    </XStack>
                </YStack>

                {/* ─── LEVEL DISTRIBUTION ─── */}
                <YStack
                    backgroundColor={colors.surface}
                    borderRadius="$5"
                    padding="$4"
                    borderWidth={1}
                    borderColor={colors.border}
                    mb="$5"
                >
                    <SectionHeader
                        icon={Layers}
                        title={t('stats.level_distribution')}
                        color={colors.yellow}
                    />

                    <YStack gap="$3" mt="$1">
                        {(['normal', 'strict', 'critical'] as const).map(level => {
                            const data = stats.levelDistribution[level];
                            const levelColor = level === 'normal' ? colors.green
                                : level === 'strict' ? colors.yellow
                                    : colors.red;
                            const decidedTotal = data.completed + data.failed;

                            return (
                                <YStack key={level} gap="$1.5">
                                    <XStack justifyContent="space-between" alignItems="center">
                                        <XStack alignItems="center" gap="$2">
                                            <View width={10} height={10} borderRadius={5} backgroundColor={levelColor} />
                                            <Text fontSize="$3" fontWeight="700" color={colors.textPrimary}>
                                                {t(`stats.levels.${level}`)}
                                            </Text>
                                            <Text fontSize="$1" color={colors.textMuted} fontWeight="600">
                                                ({data.total})
                                            </Text>
                                        </XStack>
                                        <Text fontSize="$2" fontWeight="800" color={levelColor}>
                                            {decidedTotal > 0 ? `${data.rate.toFixed(0)}%` : '—'}
                                        </Text>
                                    </XStack>

                                    {/* Progress */}
                                    <View
                                        height={6}
                                        borderRadius={3}
                                        backgroundColor={isDark ? '#262626' : '#E2E8F0'}
                                        overflow="hidden"
                                    >
                                        <View
                                            height={6}
                                            borderRadius={3}
                                            backgroundColor={levelColor}
                                            opacity={0.8}
                                            width={`${decidedTotal > 0 ? data.rate : 0}%` as any}
                                        />
                                    </View>
                                </YStack>
                            );
                        })}
                    </YStack>
                </YStack>

                {/* ─── QUICK STATS ROW ─── */}
                <XStack gap="$3" mb="$5">
                    <MiniStat
                        label={t('stats.snoozed')}
                        value={stats.totalSnoozed}
                        color={colors.orange}
                        icon={Clock}
                    />
                    <MiniStat
                        label={t('stats.best_streak')}
                        value={`${stats.bestStreak}d`}
                        color={colors.yellow}
                        icon={Award}
                    />
                </XStack>

                {/* ─── PRODUCTIVE HOURS ─── */}
                {topHours.length > 0 && (
                    <YStack
                        backgroundColor={colors.surface}
                        borderRadius="$5"
                        padding="$4"
                        borderWidth={1}
                        borderColor={colors.border}
                        mb="$5"
                    >
                        <SectionHeader
                            icon={Zap}
                            title={t('stats.productive_hours')}
                            color={colors.blue}
                        />

                        <YStack gap="$3" mt="$1">
                            {topHours.map(([hour, count], idx) => {
                                const percentage = stats.totalCompleted > 0 ? (count / stats.totalCompleted) * 100 : 0;
                                return (
                                    <XStack key={hour} alignItems="center" gap="$3">
                                        <View
                                            width={42}
                                            height={42}
                                            borderRadius={21}
                                            backgroundColor={isDark ? 'rgba(59,130,246,0.12)' : 'rgba(37,99,235,0.06)'}
                                            justifyContent="center"
                                            alignItems="center"
                                        >
                                            <Text fontSize="$2" fontWeight="800" color={colors.blue}>
                                                {hour}h
                                            </Text>
                                        </View>
                                        <YStack flex={1} gap="$1">
                                            <XStack justifyContent="space-between">
                                                <Text fontSize="$3" fontWeight="700" color={colors.textPrimary}>
                                                    {hour}:00 - {parseInt(hour) + 1}:00
                                                </Text>
                                                <Text fontSize="$2" fontWeight="700" color={colors.blue}>
                                                    {count}
                                                </Text>
                                            </XStack>
                                            <View
                                                height={4}
                                                borderRadius={2}
                                                backgroundColor={isDark ? '#262626' : '#E2E8F0'}
                                                overflow="hidden"
                                            >
                                                <View
                                                    height={4}
                                                    borderRadius={2}
                                                    backgroundColor={colors.blue}
                                                    opacity={idx === 0 ? 1 : 0.5 + (0.5 * (1 - idx / topHours.length))}
                                                    width={`${percentage}%` as any}
                                                />
                                            </View>
                                        </YStack>
                                    </XStack>
                                );
                            })}
                        </YStack>
                    </YStack>
                )}

                {/* ─── MONTHLY TREND ─── */}
                <YStack
                    backgroundColor={colors.surface}
                    borderRadius="$5"
                    padding="$4"
                    borderWidth={1}
                    borderColor={colors.border}
                    mb="$5"
                >
                    <SectionHeader
                        icon={TrendingUp}
                        title={t('stats.monthly_trend')}
                        color={stats.monthlyComparison.trend >= 0 ? colors.green : colors.red}
                    />

                    <XStack justifyContent="space-between" alignItems="center" mt="$1">
                        <YStack gap="$1">
                            <Text fontSize="$2" color={colors.textSecondary} fontWeight="600">
                                {t('stats.this_month')}
                            </Text>
                            <Text fontSize="$7" fontWeight="900" color={colors.textPrimary}>
                                {stats.monthlyComparison.current}
                            </Text>
                        </YStack>

                        <YStack alignItems="center" gap="$1">
                            {stats.monthlyComparison.trend > 0 ? (
                                <ArrowUpRight size={24} color={colors.green} />
                            ) : stats.monthlyComparison.trend < 0 ? (
                                <ArrowDownRight size={24} color={colors.red} />
                            ) : (
                                <Minus size={24} color={colors.textMuted} />
                            )}
                            <Text
                                fontSize="$3"
                                fontWeight="800"
                                color={stats.monthlyComparison.trend > 0 ? colors.green : stats.monthlyComparison.trend < 0 ? colors.red : colors.textMuted}
                            >
                                {stats.monthlyComparison.trend > 0 ? '+' : ''}{stats.monthlyComparison.trend}%
                            </Text>
                        </YStack>

                        <YStack alignItems="flex-end" gap="$1">
                            <Text fontSize="$2" color={colors.textSecondary} fontWeight="600">
                                {t('stats.last_month')}
                            </Text>
                            <Text fontSize="$7" fontWeight="900" color={colors.textMuted}>
                                {stats.monthlyComparison.previous}
                            </Text>
                        </YStack>
                    </XStack>
                </YStack>

                {/* ─── DAILY OVERVIEW ROW ─── */}
                <XStack gap="$3" mb="$5">
                    <MiniStat
                        label={t('stats.daily_average')}
                        value={stats.daily.dailyAverage}
                        color={colors.cyan}
                        icon={BarChart3}
                    />
                    <MiniStat
                        label={t('stats.active_now')}
                        value={stats.daily.activeNow}
                        color={colors.blue}
                        icon={Target}
                    />
                </XStack>

                <XStack gap="$3" mb="$5">
                    <MiniStat
                        label={t('stats.total_created')}
                        value={stats.daily.totalCreated}
                        color={colors.textSecondary}
                        icon={Layers}
                    />
                    {stats.daily.overdueNow > 0 && (
                        <MiniStat
                            label={t('stats.overdue_now')}
                            value={stats.daily.overdueNow}
                            color={colors.red}
                            icon={AlertTriangle}
                        />
                    )}
                </XStack>

                {/* ─── NOTES SECTION ─── */}
                <YStack
                    backgroundColor={colors.surface}
                    borderRadius="$5"
                    padding="$4"
                    borderWidth={1}
                    borderColor={colors.border}
                    mb="$5"
                >
                    <SectionHeader
                        icon={StickyNote}
                        title={t('stats.notes_section_title')}
                        color={colors.purple}
                    />
                    <XStack gap="$3" mt="$1">
                        {/* Total */}
                        <YStack flex={1} alignItems="center" gap="$1">
                            <View
                                width={44}
                                height={44}
                                borderRadius={22}
                                backgroundColor={isDark ? 'rgba(168,85,247,0.12)' : 'rgba(124,58,237,0.07)'}
                                justifyContent="center"
                                alignItems="center"
                            >
                                <StickyNote size={20} color={colors.purple} />
                            </View>
                            <Text fontSize="$6" fontWeight="900" color={colors.textPrimary}>
                                {stats.notesStats.totalNotes}
                            </Text>
                            <Text fontSize="$1" fontWeight="600" color={colors.textSecondary} textTransform="uppercase" letterSpacing={0.5}>
                                {t('stats.notes_total')}
                            </Text>
                        </YStack>

                        <View width={1} backgroundColor={colors.border} />

                        {/* Pinned */}
                        <YStack flex={1} alignItems="center" gap="$1">
                            <View
                                width={44}
                                height={44}
                                borderRadius={22}
                                backgroundColor={isDark ? 'rgba(234,179,8,0.12)' : 'rgba(217,119,6,0.07)'}
                                justifyContent="center"
                                alignItems="center"
                            >
                                <Pin size={20} color={colors.yellow} />
                            </View>
                            <Text fontSize="$6" fontWeight="900" color={colors.textPrimary}>
                                {stats.notesStats.pinnedNotes}
                            </Text>
                            <Text fontSize="$1" fontWeight="600" color={colors.textSecondary} textTransform="uppercase" letterSpacing={0.5}>
                                {t('stats.notes_pinned')}
                            </Text>
                        </YStack>

                        <View width={1} backgroundColor={colors.border} />

                        {/* With attachments */}
                        <YStack flex={1} alignItems="center" gap="$1">
                            <View
                                width={44}
                                height={44}
                                borderRadius={22}
                                backgroundColor={isDark ? 'rgba(6,182,212,0.12)' : 'rgba(8,145,178,0.07)'}
                                justifyContent="center"
                                alignItems="center"
                            >
                                <Paperclip size={20} color={colors.cyan} />
                            </View>
                            <Text fontSize="$6" fontWeight="900" color={colors.textPrimary}>
                                {stats.notesStats.notesWithAttachments}
                            </Text>
                            <Text fontSize="$1" fontWeight="600" color={colors.textSecondary} textTransform="uppercase" letterSpacing={0.5}>
                                {t('stats.notes_attachments')}
                            </Text>
                        </YStack>
                    </XStack>
                </YStack>

                {/* ─── INSIGHTS ─── */}
                {stats.insights.length > 0 && (
                    <YStack
                        backgroundColor={colors.surface}
                        borderRadius="$5"
                        padding="$4"
                        borderWidth={1}
                        borderColor={colors.border}
                        mb="$5"
                    >
                        <SectionHeader
                            icon={Lightbulb}
                            title={t('stats.insights_title')}
                            color={colors.yellow}
                        />

                        <YStack gap="$3" mt="$1">
                            {stats.insights.slice(0, 4).map((insight, idx) => (
                                <XStack
                                    key={idx}
                                    alignItems="flex-start"
                                    gap="$2.5"
                                    backgroundColor={
                                        insight.type === 'positive'
                                            ? (isDark ? 'rgba(34,197,94,0.06)' : 'rgba(16,185,129,0.05)')
                                            : insight.type === 'warning'
                                                ? (isDark ? 'rgba(249,115,22,0.06)' : 'rgba(234,88,12,0.05)')
                                                : (isDark ? 'rgba(59,130,246,0.06)' : 'rgba(37,99,235,0.05)')
                                    }
                                    padding="$3"
                                    borderRadius="$3"
                                >
                                    <View mt={2}>
                                        {getInsightIcon(insight)}
                                    </View>
                                    <Text
                                        fontSize="$3"
                                        fontWeight="600"
                                        color={colors.textPrimary}
                                        flex={1}
                                        lineHeight={20}
                                    >
                                        {getInsightText(insight)}
                                    </Text>
                                </XStack>
                            ))}
                        </YStack>
                    </YStack>
                )}

                {/* ─── MOTIVATION CARD ─── */}
                <YStack
                    backgroundColor={isDark ? 'rgba(59,130,246,0.07)' : 'rgba(37,99,235,0.05)'}
                    borderRadius="$5"
                    borderWidth={1}
                    borderColor={isDark ? 'rgba(59,130,246,0.25)' : 'rgba(37,99,235,0.18)'}
                    padding="$5"
                    mb="$4"
                >
                    <YStack gap="$2" ai="center">
                        <Text fontSize="$4" fontWeight="800" color={colors.blue} ta="center">
                            {stats.currentStreak > 0 ? t('stats.motivation_streak', { count: stats.currentStreak }) : t('stats.motivation_start')}
                        </Text>
                        <Text fontSize="$3" color={colors.textSecondary} ta="center" lineHeight={20}>
                            {stats.currentStreak > 0
                                ? t('stats.motivation_desc_streak')
                                : t('stats.motivation_desc_start')}
                        </Text>
                    </YStack>
                </YStack>

            </ScrollView>
        </View>
    );
}
