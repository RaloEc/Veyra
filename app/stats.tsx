import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    Target,
    TrendingUp,
    Flame,
    Clock,
    Zap,
    ChevronLeft,
    AlertTriangle,
    CheckCircle2,
    Lightbulb,
    Info,
} from '@tamagui/lucide-icons';

import { ComplianceService, FullStats, SmartInsight } from '../src/services/complianceService';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraSectionHeader } from '../src/components/ui/VeyraSectionHeader';
import { VeyraBadge } from '../src/components/ui/VeyraBadge';

export default function StatsScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { colors, typography, accent, isDark } = useVeyraTheme();
    const insets = useSafeAreaInsets();

    const [stats, setStats] = useState<FullStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

    const toggleTooltip = (key: string) => {
        setActiveTooltip(prev => (prev === key ? null : key));
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
            <SafeAreaView style={[styles.screen, styles.center, { backgroundColor: colors.bg }]}>
                <ActivityIndicator size="small" color={accent.primary} />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                    {t('stats.title')}...
                </Text>
            </SafeAreaView>
        );
    }

    if (!stats) return null;

    const total = (stats.totalCompleted || 0) + (stats.totalFailed || 0);

    // Helper: productivity score (0-100)
    const snoozeRate = stats.behavior?.snoozeRate ?? 0;
    const score = Math.min(
        100,
        Math.round(
            (stats.completionRate || 0) * 0.5 +
                (Math.min(stats.currentStreak || 0, 30) / 30) * 25 +
                (snoozeRate < 20 ? 25 : snoozeRate < 50 ? 15 : 5)
        )
    );

    const weeklyActivity = stats.weeklyActivity || [];
    const weeklyMax = Math.max(...weeklyActivity.map(d => d?.completed || 0), 1);
    const orderedWeek = [1, 2, 3, 4, 5, 6, 0].map(
        d => weeklyActivity[d] || { day: d, completed: 0, failed: 0, total: 0 }
    );

    const dayNames: Record<number, string> = {};
    for (let i = 0; i < 7; i++) {
        dayNames[i] = t(`stats.days_short.${i}`);
    }

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
        if (insight.type === 'positive') return <CheckCircle2 size={15} color="#10B981" />;
        if (insight.type === 'warning') return <AlertTriangle size={15} color="#F59E0B" />;
        return <Lightbulb size={15} color="#3B82F6" />;
    };

    const scoreColor = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#E11D48';

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'right', 'left']}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
                <VeyraIconButton
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                    onPress={() => router.back()}
                />
                <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: 20 }]}>
                    {t('stats.title')}
                </Text>
                <View style={{ width: 34 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            >
                {/* ─── HERO ROW (Score, Streak, Today) ─── */}
                <View style={styles.heroRow}>
                    {/* Score */}
                    <TouchableOpacity
                        style={{ flex: 1 }}
                        activeOpacity={0.8}
                        onPress={() => toggleTooltip('score')}
                    >
                        <VeyraSurface
                            level={activeTooltip === 'score' ? 2 : 1}
                            radius="lg"
                            style={styles.heroCard}
                        >
                            <View style={[styles.scoreRing, { borderColor: scoreColor }]}>
                                <Text style={[styles.scoreNumber, { color: scoreColor }]}>
                                    {score}
                                </Text>
                            </View>
                            <Text style={[styles.heroLabel, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                                {t('stats.score')}
                            </Text>
                        </VeyraSurface>
                    </TouchableOpacity>

                    {/* Streak */}
                    <TouchableOpacity
                        style={{ flex: 1 }}
                        activeOpacity={0.8}
                        onPress={() => toggleTooltip('streak')}
                    >
                        <VeyraSurface
                            level={activeTooltip === 'streak' ? 2 : 1}
                            radius="lg"
                            style={styles.heroCard}
                        >
                            <View style={[styles.heroIconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                                <Flame size={24} color="#F59E0B" />
                            </View>
                            <Text style={[styles.heroStatValue, { color: '#F59E0B' }]}>
                                {stats.currentStreak ?? 0}
                            </Text>
                            <Text style={[styles.heroLabel, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                                {t('stats.current_streak')}
                            </Text>
                        </VeyraSurface>
                    </TouchableOpacity>

                    {/* Today */}
                    <TouchableOpacity
                        style={{ flex: 1 }}
                        activeOpacity={0.8}
                        onPress={() => toggleTooltip('today')}
                    >
                        <VeyraSurface
                            level={activeTooltip === 'today' ? 2 : 1}
                            radius="lg"
                            style={styles.heroCard}
                        >
                            <View style={[styles.heroIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                                <Target size={24} color="#10B981" />
                            </View>
                            <Text style={[styles.heroStatValue, { color: '#10B981' }]}>
                                {stats.daily?.completedToday ?? 0}
                            </Text>
                            <Text style={[styles.heroLabel, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                                {t('stats.completed_today')}
                            </Text>
                        </VeyraSurface>
                    </TouchableOpacity>
                </View>

                {/* Tooltip Info */}
                {activeTooltip && ['score', 'streak', 'today'].includes(activeTooltip) && (
                    <VeyraSurface
                        level={2}
                        radius="md"
                        style={styles.tooltipBox}
                    >
                        <Info size={14} color={accent.primary} style={{ marginTop: 2 }} />
                        <Text style={[styles.tooltipText, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                            {t(`stats.tooltip_${activeTooltip}`)}
                        </Text>
                    </VeyraSurface>
                )}

                {/* ─── COMPLIANCE RATE ─── */}
                <VeyraSurface
                    level={1}
                    radius="lg"
                    style={styles.sectionCard}
                >
                    <View style={styles.cardHeaderRow}>
                        <View style={styles.cardHeaderTitleGroup}>
                            <TrendingUp size={16} color={accent.primary} />
                            <Text style={[styles.cardTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                                {t('stats.compliance_rate')}
                            </Text>
                        </View>
                        <Text style={[styles.bigRateNumber, { color: accent.primary }]}>
                            {(stats.completionRate || 0).toFixed(1)}%
                        </Text>
                    </View>

                    {/* Progress Track */}
                    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceElevated }]}>
                        <View
                            style={[
                                styles.progressBar,
                                {
                                    backgroundColor: accent.primary,
                                    width: `${Math.min(stats.completionRate || 0, 100)}%`,
                                },
                            ]}
                        />
                    </View>

                    <View style={styles.progressFooter}>
                        <Text style={[styles.totalTasksText, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                            {t('stats.total_tasks', { count: total })}
                        </Text>
                        <View style={styles.statsCountersRow}>
                            <View style={styles.counterItem}>
                                <View style={[styles.counterDot, { backgroundColor: '#10B981' }]} />
                                <Text style={[styles.counterText, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                                    {stats.totalCompleted ?? 0}
                                </Text>
                            </View>
                            <View style={styles.counterItem}>
                                <View style={[styles.counterDot, { backgroundColor: '#E11D48' }]} />
                                <Text style={[styles.counterText, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                                    {stats.totalFailed ?? 0}
                                </Text>
                            </View>
                        </View>
                    </View>
                </VeyraSurface>

                {/* ─── WEEKLY ACTIVITY ─── */}
                <VeyraSectionHeader title={t('stats.weekly_activity')} style={{ marginTop: 16 }} />

                <VeyraSurface
                    level={1}
                    radius="lg"
                    style={styles.sectionCard}
                >
                    <View style={styles.chartBarsRow}>
                        {orderedWeek.map((day, idx) => {
                            const dayIndex = [1, 2, 3, 4, 5, 6, 0][idx];
                            const completedCount = day?.completed || 0;
                            const heightPercent = completedCount > 0 ? Math.max((completedCount / weeklyMax) * 100, 15) : 8;
                            const isHighest = completedCount === weeklyMax && completedCount > 0;

                            return (
                                <View key={idx} style={styles.chartCol}>
                                    <Text style={[styles.chartCount, { color: completedCount > 0 ? colors.textPrimary : 'transparent' }]}>
                                        {completedCount}
                                    </Text>
                                    <View style={[styles.barTrack, { backgroundColor: colors.surfaceElevated }]}>
                                        <View
                                            style={[
                                                styles.barFill,
                                                {
                                                    height: `${heightPercent}%`,
                                                    backgroundColor: isHighest
                                                        ? accent.primary
                                                        : completedCount > 0
                                                        ? colors.textSecondary
                                                        : colors.borderSubtle,
                                                },
                                            ]}
                                        />
                                    </View>
                                    <Text style={[styles.chartDayLabel, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                                        {dayNames[dayIndex]}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                </VeyraSurface>

                {/* ─── CONTROL LEVELS BREAKDOWN ─── */}
                <VeyraSectionHeader title={t('stats.by_level')} style={{ marginTop: 16 }} />

                <View style={styles.levelsGrid}>
                    {(['normal', 'strict', 'critical'] as const).map(levelKey => {
                        const levelData = stats.levelDistribution?.[levelKey] || { completed: 0, failed: 0, total: 0, rate: 0 };
                        const totalLevel = (levelData.completed || 0) + (levelData.failed || 0);
                        const levelRate = totalLevel > 0 ? Math.round(((levelData.completed || 0) / totalLevel) * 100) : 0;
                        const levelColor = levelKey === 'critical' ? '#E11D48' : levelKey === 'strict' ? '#F59E0B' : accent.primary;

                        return (
                            <VeyraSurface
                                key={levelKey}
                                level={1}
                                radius="md"
                                style={styles.levelCard}
                            >
                                <View style={styles.levelHeader}>
                                    <VeyraBadge
                                        label={t(`stats.levels.${levelKey}`)}
                                        controlLevel={levelKey}
                                        size="sm"
                                        dot={true}
                                    />
                                    <Text style={[styles.levelRateText, { color: levelColor }]}>
                                        {levelRate}%
                                    </Text>
                                </View>
                                <Text style={[styles.levelCountSubtitle, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                    {levelData.completed || 0} / {totalLevel} {t('home.completed').toLowerCase()}
                                </Text>
                            </VeyraSurface>
                        );
                    })}
                </View>

                {/* ─── SMART INSIGHTS ─── */}
                {stats.insights && stats.insights.length > 0 && (
                    <>
                        <VeyraSectionHeader title={t('stats.insights')} style={{ marginTop: 16 }} />
                        <View style={{ gap: 8 }}>
                            {stats.insights.map((insight, idx) => (
                                <VeyraSurface
                                    key={idx}
                                    level={1}
                                    radius="md"
                                    style={styles.insightCard}
                                >
                                    {getInsightIcon(insight)}
                                    <Text style={[styles.insightText, { color: colors.textPrimary, fontSize: typography.caption.fontSize }]}>
                                        {getInsightText(insight)}
                                    </Text>
                                </VeyraSurface>
                            ))}
                        </View>
                    </>
                )}

                {/* ─── BEHAVIOR & METRICS ─── */}
                <VeyraSectionHeader title={t('stats.behavior_title')} style={{ marginTop: 16 }} />

                <View style={styles.behaviorRow}>
                    <VeyraSurface
                        level={1}
                        radius="md"
                        style={styles.behaviorCard}
                    >
                        <Zap size={16} color="#F59E0B" />
                        <Text style={[styles.behaviorValue, { color: colors.textPrimary }]}>
                            {stats.behavior?.snoozeRate ?? 0}%
                        </Text>
                        <Text style={[styles.behaviorLabel, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                            {t('stats.snooze_rate')}
                        </Text>
                    </VeyraSurface>

                    <VeyraSurface
                        level={1}
                        radius="md"
                        style={styles.behaviorCard}
                    >
                        <Clock size={16} color={accent.primary} />
                        <Text style={[styles.behaviorValue, { color: colors.textPrimary }]}>
                            {(stats.behavior?.avgResponseMinutes ?? 0) < 60
                                ? `${stats.behavior?.avgResponseMinutes ?? 0}m`
                                : `${Math.round((stats.behavior?.avgResponseMinutes ?? 0) / 60)}h`}
                        </Text>
                        <Text style={[styles.behaviorLabel, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                            {t('stats.avg_response_time')}
                        </Text>
                    </VeyraSurface>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        fontWeight: '600',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
        gap: 14,
    },
    heroRow: {
        flexDirection: 'row',
        gap: 10,
    },
    heroCard: {
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 8,
        gap: 6,
    },
    scoreRing: {
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 3.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreNumber: {
        fontSize: 18,
        fontWeight: '900',
    },
    heroIconCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroStatValue: {
        fontSize: 20,
        fontWeight: '900',
    },
    heroLabel: {
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    tooltipBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 12,
        gap: 8,
    },
    tooltipText: {
        flex: 1,
        lineHeight: 18,
    },
    sectionCard: {
        padding: 16,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardHeaderTitleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cardTitle: {
        fontWeight: '700',
    },
    bigRateNumber: {
        fontSize: 22,
        fontWeight: '900',
    },
    progressTrack: {
        height: 7,
        borderRadius: 999,
        overflow: 'hidden',
        marginBottom: 10,
    },
    progressBar: {
        height: '100%',
        borderRadius: 999,
    },
    progressFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    totalTasksText: {
        fontWeight: '600',
    },
    statsCountersRow: {
        flexDirection: 'row',
        gap: 12,
    },
    counterItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    counterDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    counterText: {
        fontWeight: '700',
    },
    chartBarsRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: 120,
        paddingTop: 8,
    },
    chartCol: {
        flex: 1,
        alignItems: 'center',
        height: '100%',
        justifyContent: 'flex-end',
        gap: 4,
    },
    chartCount: {
        fontSize: 10,
        fontWeight: '700',
    },
    barTrack: {
        width: 14,
        height: 70,
        borderRadius: 4,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    barFill: {
        width: '100%',
        borderRadius: 4,
    },
    chartDayLabel: {
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    levelsGrid: {
        gap: 8,
    },
    levelCard: {
        padding: 12,
        gap: 4,
    },
    levelHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    levelRateText: {
        fontSize: 16,
        fontWeight: '900',
    },
    levelCountSubtitle: {
        fontWeight: '500',
    },
    insightCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        gap: 10,
    },
    insightText: {
        flex: 1,
        lineHeight: 18,
        fontWeight: '500',
    },
    behaviorRow: {
        flexDirection: 'row',
        gap: 10,
    },
    behaviorCard: {
        flex: 1,
        padding: 14,
        gap: 6,
    },
    behaviorValue: {
        fontSize: 20,
        fontWeight: '900',
    },
    behaviorLabel: {
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
});
