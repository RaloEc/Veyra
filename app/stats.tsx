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
    AlertOctagon,
    Award,
    Calendar,
    BarChart3,
} from '@tamagui/lucide-icons';

import { ComplianceService, FullStats, SmartInsight } from '../src/services/complianceService';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';

export default function StatsScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { colors, typography, accent, isDark } = useVeyraTheme();
    const insets = useSafeAreaInsets();

    const [stats, setStats] = useState<FullStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [showScoreInfo, setShowScoreInfo] = useState(false);

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
                    {t('stats.title', 'Estadísticas')}...
                </Text>
            </SafeAreaView>
        );
    }

    if (!stats) return null;

    const totalCompleted = stats.totalCompleted || 0;
    const totalFailed = stats.totalFailed || 0;
    const totalTasks = totalCompleted + totalFailed;
    const completionRate = Math.round(stats.completionRate || 0);

    // Productivity score (0-100)
    const snoozeRate = stats.behavior?.snoozeRate ?? 0;
    const score = Math.min(
        100,
        Math.round(
            (stats.completionRate || 0) * 0.5 +
                (Math.min(stats.currentStreak || 0, 30) / 30) * 25 +
                (snoozeRate < 20 ? 25 : snoozeRate < 50 ? 15 : 5)
        )
    );

    const scoreColor = score >= 80 ? '#10B981' : score >= 50 ? '#F59E0B' : '#E11D48';
    const scoreRating = score >= 80
        ? (t('stats.score_excellent', 'Excelente'))
        : score >= 50
        ? (t('stats.score_good', 'Buen ritmo'))
        : (t('stats.score_needs_focus', 'Requiere atención'));

    const weeklyActivity = stats.weeklyActivity || [];
    const weeklyMax = Math.max(...weeklyActivity.map(d => d?.completed || 0), 1);
    const orderedWeek = [1, 2, 3, 4, 5, 6, 0].map(
        d => weeklyActivity[d] || { day: d, completed: 0, failed: 0, total: 0 }
    );

    const dayNames: Record<number, string> = {
        0: 'D',
        1: 'L',
        2: 'M',
        3: 'X',
        4: 'J',
        5: 'V',
        6: 'S',
    };

    const getInsightText = (insight: SmartInsight): string => {
        switch (insight.key) {
            case 'best_hour':
                return t('stats.insight_best_hour', { hour: insight.params?.hour });
            case 'best_day':
                return t('stats.insight_best_day', { day: dayNames[insight.params?.day ?? 0] });
            case 'level_comparison':
                return t('stats.insight_level_comparison', {
                    best_rate: Math.round(insight.params?.best_rate || 0),
                    best_level: t(`stats.levels.${insight.params?.best_level}`),
                    worst_rate: Math.round(insight.params?.worst_rate || 0),
                    worst_level: t(`stats.levels.${insight.params?.worst_level}`),
                });
            case 'no_snooze':
                return t('stats.insight_no_snooze', '¡Excelente! No sueles posponer tus recordatorios.');
            case 'high_snooze':
                return t('stats.insight_high_snooze', { rate: Math.round(insight.params?.rate || 0) });
            case 'improving':
                return t('stats.insight_improving', { percent: Math.round(insight.params?.percent || 0) });
            case 'declining':
                return t('stats.insight_declining', { percent: Math.round(insight.params?.percent || 0) });
            case 'great_streak':
                return t('stats.insight_great_streak', { days: insight.params?.days });
            default:
                return '';
        }
    };

    const getInsightIcon = (insight: SmartInsight) => {
        if (insight.type === 'positive') return <CheckCircle2 size={18} color="#10B981" strokeWidth={2.2} />;
        if (insight.type === 'warning') return <AlertTriangle size={18} color="#F59E0B" strokeWidth={2.2} />;
        return <Lightbulb size={18} color="#3B82F6" strokeWidth={2.2} />;
    };

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'right', 'left']}>
            {/* Top Navigation */}
            <View style={styles.navHeader}>
                <VeyraIconButton
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                    onPress={() => router.back()}
                />
                <Text style={[styles.navTitle, { color: colors.textPrimary }]}>
                    {t('stats.title', 'Estadísticas')}
                </Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 48 }]}
            >
                {/* ══════════ HERO DASHBOARD UNIFICADO ══════════ */}
                <View style={[styles.dashboardCard, {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                }]}>
                    {/* Fila Superior: Eficacia Global */}
                    <View style={styles.heroScoreRow}>
                        <View style={{ flex: 1 }}>
                            <View style={styles.scoreTitleGroup}>
                                <Text style={[styles.heroHeading, { color: colors.textSecondary }]}>
                                    PUNTUACIÓN DE EFICACIA
                                </Text>
                                <TouchableOpacity
                                    onPress={() => setShowScoreInfo(!showScoreInfo)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    activeOpacity={0.7}
                                >
                                    <Info size={15} color={colors.textMuted} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.scoreMainRow}>
                                <Text style={[styles.scoreNumberLarge, { color: scoreColor }]}>
                                    {score}
                                </Text>
                                <Text style={[styles.scoreTotalSuffix, { color: colors.textMuted }]}>
                                    / 100
                                </Text>
                                <View style={[styles.scoreBadge, { backgroundColor: `${scoreColor}1A`, borderColor: `${scoreColor}40` }]}>
                                    <Text style={[styles.scoreBadgeText, { color: scoreColor }]}>
                                        {scoreRating}
                                    </Text>
                                </View>
                            </View>

                            <Text style={[styles.scoreDescription, { color: colors.textSecondary }]}>
                                {score >= 80
                                    ? 'Mantienes una constancia sobresaliente con alta tasa de éxito.'
                                    : score >= 50
                                    ? 'Buen avance general. Reducir las posposiciones mejorará tu ritmo.'
                                    : 'Completa tus tareas a tiempo hoy para reactivar tu puntuación.'}
                            </Text>
                        </View>
                    </View>

                    {/* Explicación desplegable de la puntuación */}
                    {showScoreInfo && (
                        <View style={[styles.scoreExplanationBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                            <Text style={[styles.scoreExplanationText, { color: colors.textSecondary }]}>
                                {t('stats.tooltip_score', 'Calculada combinando tu tasa de cumplimiento (50%), racha activa de días (25%) y menor frecuencia de posposiciones (25%).')}
                            </Text>
                        </View>
                    )}

                    {/* Divisor interno sutil */}
                    <View style={[styles.cardDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }]} />

                    {/* Métricas clave en 3 columnas amplias y legibles */}
                    <View style={styles.metricsTripletRow}>
                        {/* 1. Racha */}
                        <View style={styles.metricItem}>
                            <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                                <Flame size={20} color="#F59E0B" strokeWidth={2.4} />
                            </View>
                            <Text style={[styles.metricBigNumber, { color: colors.textPrimary }]}>
                                {stats.currentStreak ?? 0}
                            </Text>
                            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                                Días de racha
                            </Text>
                        </View>

                        <View style={[styles.verticalDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }]} />

                        {/* 2. Completadas Hoy */}
                        <View style={styles.metricItem}>
                            <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                                <Target size={20} color="#10B981" strokeWidth={2.4} />
                            </View>
                            <Text style={[styles.metricBigNumber, { color: colors.textPrimary }]}>
                                {stats.daily?.completedToday ?? 0}
                            </Text>
                            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                                Hechas hoy
                            </Text>
                        </View>

                        <View style={[styles.verticalDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }]} />

                        {/* 3. Tasa de Cumplimiento */}
                        <View style={styles.metricItem}>
                            <View style={[styles.metricIconWrap, { backgroundColor: `${accent.primary}18` }]}>
                                <TrendingUp size={20} color={accent.primary} strokeWidth={2.4} />
                            </View>
                            <Text style={[styles.metricBigNumber, { color: accent.primary }]}>
                                {completionRate}%
                            </Text>
                            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                                Cumplimiento
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ══════════ TASA DE CUMPLIMIENTO GLOBAL ══════════ */}
                <View style={styles.sectionHeaderWrap}>
                    <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                        BALANCE GLOBAL DE TAREAS
                    </Text>
                </View>

                <View style={[styles.dashboardCard, {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                }]}>
                    <View style={styles.progressHeaderRow}>
                        <View>
                            <Text style={[styles.progressTitleText, { color: colors.textPrimary }]}>
                                Tasa de Cumplimiento
                            </Text>
                            <Text style={[styles.progressSubtitleText, { color: colors.textMuted }]}>
                                {totalTasks > 0
                                    ? `${totalTasks} tareas programadas en total`
                                    : 'Aún no hay suficientes tareas registradas'}
                            </Text>
                        </View>
                        <Text style={[styles.progressPercentageText, { color: accent.primary }]}>
                            {completionRate}%
                        </Text>
                    </View>

                    {/* Barra de progreso amplia y legible */}
                    <View style={[styles.mainProgressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                        <View
                            style={[
                                styles.mainProgressFill,
                                {
                                    backgroundColor: accent.primary,
                                    width: `${Math.min(completionRate, 100)}%`,
                                },
                            ]}
                        />
                    </View>

                    {/* Contadores con buen contraste */}
                    <View style={styles.progressCountersRow}>
                        <View style={styles.counterGroup}>
                            <View style={[styles.counterIndicatorDot, { backgroundColor: '#10B981' }]} />
                            <Text style={[styles.counterValueText, { color: colors.textPrimary }]}>
                                {totalCompleted}
                            </Text>
                            <Text style={[styles.counterNameText, { color: colors.textSecondary }]}>
                                completadas
                            </Text>
                        </View>

                        <View style={styles.counterGroup}>
                            <View style={[styles.counterIndicatorDot, { backgroundColor: '#E11D48' }]} />
                            <Text style={[styles.counterValueText, { color: colors.textPrimary }]}>
                                {totalFailed}
                            </Text>
                            <Text style={[styles.counterNameText, { color: colors.textSecondary }]}>
                                no completadas
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ══════════ ACTIVIDAD SEMANAL (GRÁFICA ACCESIBLE) ══════════ */}
                <View style={styles.sectionHeaderWrap}>
                    <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                        ACTIVIDAD DE LOS ÚLTIMOS 7 DÍAS
                    </Text>
                </View>

                <View style={[styles.dashboardCard, {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                }]}>
                    <View style={styles.chartBarsContainer}>
                        {orderedWeek.map((day, idx) => {
                            const dayIndex = [1, 2, 3, 4, 5, 6, 0][idx];
                            const completedCount = day?.completed || 0;
                            const heightPercent = completedCount > 0
                                ? Math.max((completedCount / weeklyMax) * 100, 18)
                                : 8;
                            const isHighest = completedCount === weeklyMax && completedCount > 0;

                            return (
                                <View key={idx} style={styles.chartCol}>
                                    {/* Número sobre la barra */}
                                    <Text
                                        style={[
                                            styles.chartValueLabel,
                                            {
                                                color: completedCount > 0 ? colors.textPrimary : 'transparent',
                                                fontWeight: isHighest ? '800' : '600',
                                            },
                                        ]}
                                    >
                                        {completedCount}
                                    </Text>

                                    {/* Barra vertical amplia */}
                                    <View style={[styles.barTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                                        <View
                                            style={[
                                                styles.barFill,
                                                {
                                                    height: `${heightPercent}%`,
                                                    backgroundColor: isHighest
                                                        ? accent.primary
                                                        : completedCount > 0
                                                        ? (isDark ? 'rgba(255,255,255,0.40)' : '#94A3B8')
                                                        : 'transparent',
                                                },
                                            ]}
                                        />
                                    </View>

                                    {/* Nombre del día */}
                                    <Text
                                        style={[
                                            styles.chartDayText,
                                            {
                                                color: isHighest ? accent.primary : colors.textSecondary,
                                                fontWeight: isHighest ? '800' : '600',
                                            },
                                        ]}
                                    >
                                        {dayNames[dayIndex]}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                </View>

                {/* ══════════ DESGLOSE POR NIVEL DE CONTROL ══════════ */}
                <View style={styles.sectionHeaderWrap}>
                    <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                        RENDIMIENTO POR NIVEL DE CONTROL
                    </Text>
                </View>

                <View style={[styles.dashboardCard, {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                }]}>
                    {(['normal', 'strict', 'critical'] as const).map((levelKey, index) => {
                        const levelData = stats.levelDistribution?.[levelKey] || { completed: 0, failed: 0, total: 0, rate: 0 };
                        const totalLevel = (levelData.completed || 0) + (levelData.failed || 0);
                        const levelRate = totalLevel > 0 ? Math.round(((levelData.completed || 0) / totalLevel) * 100) : 0;
                        const levelColor = levelKey === 'critical' ? '#E11D48' : levelKey === 'strict' ? '#F59E0B' : '#10B981';
                        const levelName = levelKey === 'critical' ? 'Crítico' : levelKey === 'strict' ? 'Estricto' : 'Normal';
                        const LevelIcon = levelKey === 'critical' ? AlertOctagon : levelKey === 'strict' ? Zap : CheckCircle2;

                        return (
                            <React.Fragment key={levelKey}>
                                {index > 0 && <View style={[styles.cardDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }]} />}
                                <View style={styles.levelRowContainer}>
                                    <View style={styles.levelRowHeader}>
                                        <View style={styles.levelTitleGroup}>
                                            <View style={[styles.levelIconBadge, { backgroundColor: `${levelColor}1A` }]}>
                                                <LevelIcon size={16} color={levelColor} strokeWidth={2.4} />
                                            </View>
                                            <Text style={[styles.levelNameText, { color: colors.textPrimary }]}>
                                                {levelName}
                                            </Text>
                                        </View>
                                        <View style={styles.levelRateGroup}>
                                            <Text style={[styles.levelRatioText, { color: colors.textMuted }]}>
                                                {levelData.completed || 0} de {totalLevel}
                                            </Text>
                                            <Text style={[styles.levelRateValue, { color: levelColor }]}>
                                                {levelRate}%
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Barra de progreso integrada */}
                                    <View style={[styles.levelProgressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                                        <View
                                            style={[
                                                styles.levelProgressFill,
                                                {
                                                    backgroundColor: levelColor,
                                                    width: `${Math.min(levelRate, 100)}%`,
                                                },
                                            ]}
                                        />
                                    </View>
                                </View>
                            </React.Fragment>
                        );
                    })}
                </View>

                {/* ══════════ HÁBITOS Y COMPORTAMIENTO ══════════ */}
                <View style={styles.sectionHeaderWrap}>
                    <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                        HÁBITOS DE RESPUESTA
                    </Text>
                </View>

                <View style={[styles.dashboardCard, {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                }]}>
                    {/* Fila 1: Tendencia a Posponer */}
                    <View style={styles.behaviorRowContainer}>
                        <View style={[styles.behaviorIconBadge, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                            <Zap size={18} color="#F59E0B" strokeWidth={2.2} />
                        </View>
                        <View style={styles.behaviorTextCol}>
                            <Text style={[styles.behaviorTitleText, { color: colors.textPrimary }]}>
                                Tendencia a Posponer
                            </Text>
                            <Text style={[styles.behaviorDescText, { color: colors.textSecondary }]}>
                                Frecuencia con la que pospones alertas en lugar de completarlas al instante
                            </Text>
                        </View>
                        <View style={styles.behaviorValueCol}>
                            <Text style={[styles.behaviorMetricText, { color: colors.textPrimary }]}>
                                {Math.round(stats.behavior?.snoozeRate ?? 0)}%
                            </Text>
                            <Text style={[styles.behaviorTagText, { color: (stats.behavior?.snoozeRate ?? 0) > 30 ? '#EF4444' : '#10B981' }]}>
                                {(stats.behavior?.snoozeRate ?? 0) <= 15
                                    ? 'Puntual'
                                    : (stats.behavior?.snoozeRate ?? 0) <= 35
                                    ? 'Moderada'
                                    : 'Frecuente'}
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.cardDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }]} />

                    {/* Fila 2: Tiempo de Reacción */}
                    <View style={styles.behaviorRowContainer}>
                        <View style={[styles.behaviorIconBadge, { backgroundColor: `${accent.primary}18` }]}>
                            <Clock size={18} color={accent.primary} strokeWidth={2.2} />
                        </View>
                        <View style={styles.behaviorTextCol}>
                            <Text style={[styles.behaviorTitleText, { color: colors.textPrimary }]}>
                                Tiempo de Reacción
                            </Text>
                            <Text style={[styles.behaviorDescText, { color: colors.textSecondary }]}>
                                Tiempo promedio en confirmar y atender un recordatorio tras sonar
                            </Text>
                        </View>
                        <View style={styles.behaviorValueCol}>
                            <Text style={[styles.behaviorMetricText, { color: colors.textPrimary }]}>
                                {Math.round(stats.behavior?.avgResponseMinutes ?? 0) < 60
                                    ? `${Math.round(stats.behavior?.avgResponseMinutes ?? 0)} min`
                                    : `${Math.floor((stats.behavior?.avgResponseMinutes ?? 0) / 60)}h ${Math.round((stats.behavior?.avgResponseMinutes ?? 0) % 60)}m`}
                            </Text>
                            <Text style={[styles.behaviorTagText, { color: colors.textMuted }]}>
                                Promedio
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ══════════ OBSERVACIONES INTELIGENTES (INSIGHTS) ══════════ */}
                {stats.insights && stats.insights.length > 0 && (
                    <>
                        <View style={styles.sectionHeaderWrap}>
                            <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                                OBSERVACIONES INTELIGENTES
                            </Text>
                        </View>

                        <View style={[styles.dashboardCard, {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
                        }]}>
                            {stats.insights.map((insight, idx) => (
                                <React.Fragment key={idx}>
                                    {idx > 0 && <View style={[styles.cardDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }]} />}
                                    <View style={styles.insightRow}>
                                        <View style={styles.insightIconWrap}>
                                            {getInsightIcon(insight)}
                                        </View>
                                        <Text style={[styles.insightRowText, { color: colors.textPrimary }]}>
                                            {getInsightText(insight)}
                                        </Text>
                                    </View>
                                </React.Fragment>
                            ))}
                        </View>
                    </>
                )}
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
        fontSize: 15,
        fontWeight: '600',
    },
    navHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    navTitle: {
        fontSize: 17,
        fontWeight: '800',
    },
    scrollContent: {
        paddingHorizontal: 18,
        paddingTop: 8,
        gap: 14,
    },
    sectionHeaderWrap: {
        paddingHorizontal: 4,
        paddingTop: 8,
    },
    sectionHeaderText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    dashboardCard: {
        borderRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
        padding: 18,
    },
    heroScoreRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    scoreTitleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    heroHeading: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    scoreMainRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        marginBottom: 8,
    },
    scoreNumberLarge: {
        fontSize: 42,
        fontWeight: '900',
        letterSpacing: -1,
        lineHeight: 48,
    },
    scoreTotalSuffix: {
        fontSize: 18,
        fontWeight: '600',
    },
    scoreBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        marginLeft: 6,
    },
    scoreBadgeText: {
        fontSize: 12,
        fontWeight: '800',
    },
    scoreDescription: {
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '500',
    },
    scoreExplanationBox: {
        padding: 12,
        borderRadius: 12,
        marginTop: 12,
    },
    scoreExplanationText: {
        fontSize: 12,
        lineHeight: 17,
        fontWeight: '500',
    },
    cardDivider: {
        height: StyleSheet.hairlineWidth,
        marginVertical: 14,
    },
    metricsTripletRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 4,
    },
    verticalDivider: {
        width: StyleSheet.hairlineWidth,
        height: 48,
    },
    metricItem: {
        flex: 1,
        alignItems: 'center',
        gap: 4,
    },
    metricIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    metricBigNumber: {
        fontSize: 20,
        fontWeight: '800',
    },
    metricLabel: {
        fontSize: 11.5,
        fontWeight: '600',
    },
    progressHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 12,
    },
    progressTitleText: {
        fontSize: 16,
        fontWeight: '700',
    },
    progressSubtitleText: {
        fontSize: 12,
        fontWeight: '500',
        marginTop: 2,
    },
    progressPercentageText: {
        fontSize: 22,
        fontWeight: '900',
    },
    mainProgressTrack: {
        height: 10,
        borderRadius: 5,
        overflow: 'hidden',
        marginBottom: 14,
    },
    mainProgressFill: {
        height: '100%',
        borderRadius: 5,
    },
    progressCountersRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
    },
    counterGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    counterIndicatorDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    counterValueText: {
        fontSize: 15,
        fontWeight: '800',
    },
    counterNameText: {
        fontSize: 13,
        fontWeight: '500',
    },
    chartBarsContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: 140,
        paddingTop: 10,
    },
    chartCol: {
        flex: 1,
        alignItems: 'center',
        height: '100%',
        justifyContent: 'flex-end',
        gap: 6,
    },
    chartValueLabel: {
        fontSize: 12,
    },
    barTrack: {
        width: 22,
        height: 82,
        borderRadius: 6,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    barFill: {
        width: '100%',
        borderRadius: 6,
    },
    chartDayText: {
        fontSize: 12,
    },
    levelRowContainer: {
        gap: 10,
        paddingVertical: 2,
    },
    levelRowHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    levelTitleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    levelIconBadge: {
        width: 32,
        height: 32,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    levelNameText: {
        fontSize: 15,
        fontWeight: '700',
    },
    levelRateGroup: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
    },
    levelRatioText: {
        fontSize: 13,
        fontWeight: '500',
    },
    levelRateValue: {
        fontSize: 16,
        fontWeight: '800',
    },
    levelProgressTrack: {
        height: 7,
        borderRadius: 3.5,
        overflow: 'hidden',
    },
    levelProgressFill: {
        height: '100%',
        borderRadius: 3.5,
    },
    behaviorRowContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 4,
    },
    behaviorIconBadge: {
        width: 38,
        height: 38,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    behaviorTextCol: {
        flex: 1,
        gap: 2,
    },
    behaviorTitleText: {
        fontSize: 15,
        fontWeight: '700',
    },
    behaviorDescText: {
        fontSize: 12,
        fontWeight: '400',
        lineHeight: 16,
    },
    behaviorValueCol: {
        alignItems: 'flex-end',
        gap: 2,
        minWidth: 64,
    },
    behaviorMetricText: {
        fontSize: 18,
        fontWeight: '800',
    },
    behaviorTagText: {
        fontSize: 11,
        fontWeight: '600',
    },
    insightRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 4,
    },
    insightIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    insightRowText: {
        flex: 1,
        fontSize: 13.5,
        lineHeight: 19,
        fontWeight: '500',
    },
});
