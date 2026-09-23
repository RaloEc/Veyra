import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Share,
    Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { format, isToday } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import {
    Sun,
    Moon,
    Share2,
    CheckCircle2,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    ListChecks,
} from '@tamagui/lucide-icons';

import { useStore } from '../../store/useStore';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';
import { VeyraButton } from '../ui/VeyraButton';
import { VeyraBadge } from '../ui/VeyraBadge';

export function DailyBriefingCard() {
    const { t } = useTranslation();
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();
    const { reminders, history, userName, session, language } = useStore();

    const [isCollapsed, setIsCollapsed] = useState(false);

    const locale = language === 'es' ? es : enUS;
    const now = new Date();
    const currentHour = now.getHours();

    // Saludo según la hora (sin emoticones)
    const greetingKey = currentHour < 12 ? 'briefing.greeting_morning' : currentHour < 19 ? 'briefing.greeting_afternoon' : 'briefing.greeting_evening';
    const displayName = userName || session?.user?.email?.split('@')[0] || '';

    // Recordatorios de hoy
    const todayReminders = useMemo(() => {
        return reminders.filter(r => isToday(r.due_date_ms) && r.status === 'pending');
    }, [reminders]);

    const todayCompleted = useMemo(() => {
        return history.filter(h => isToday(h.last_modified_ms) && h.status === 'completed');
    }, [history]);

    const totalToday = todayReminders.length + todayCompleted.length;
    const criticalCount = todayReminders.filter(r => r.control_level === 'critical').length;
    const strictCount = todayReminders.filter(r => r.control_level === 'strict').length;
    const normalCount = todayReminders.filter(r => r.control_level === 'normal').length;

    const progressPercent = totalToday > 0 ? Math.round((todayCompleted.length / totalToday) * 100) : 100;

    // Compartir agenda formateada sin emoticones
    const handleShareAgenda = async () => {
        try {
            const dateStr = format(now, language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale });
            const allSorted = [...todayReminders].sort((a, b) => a.due_date_ms - b.due_date_ms);

            let message = `${t('briefing.share_title', { defaultValue: 'Agenda del día' })} - ${dateStr}\n`;
            message += `----------------------------------------\n`;

            if (allSorted.length === 0) {
                message += `${t('briefing.no_pending_tasks', { defaultValue: 'No hay tareas pendientes para hoy.' })}\n`;
            } else {
                allSorted.forEach(r => {
                    const timeStr = format(new Date(r.due_date_ms), 'HH:mm');
                    const levelTag = r.control_level.toUpperCase();
                    message += `• ${timeStr} - ${r.title} [${levelTag}]\n`;

                    if (r.subtasks) {
                        try {
                            const subtasksList = JSON.parse(r.subtasks);
                            if (Array.isArray(subtasksList)) {
                                subtasksList.forEach((st: any) => {
                                    const check = st.completed ? '[x]' : '[ ]';
                                    message += `    ${check} ${st.title}\n`;
                                });
                            }
                        } catch {}
                    }
                });
            }

            message += `----------------------------------------\n`;
            message += `${t('briefing.share_summary', { count: allSorted.length, completed: todayCompleted.length })}\n`;
            message += `Veyra`;

            await Share.share({
                title: `${t('briefing.share_title', { defaultValue: 'Agenda del día' })} - ${dateStr}`,
                message,
            });
        } catch (error) {
            console.error('Error sharing agenda:', error);
        }
    };

    if (totalToday === 0 && !isCollapsed) {
        return null;
    }

    return (
        <VeyraSurface level={2} radius="lg" style={styles.card}>
            {/* Header: Saludo y controles */}
            <View style={styles.headerRow}>
                <View style={styles.greetingLeft}>
                    {currentHour < 19 ? (
                        <Sun size={18} color={accent.primary as any} />
                    ) : (
                        <Moon size={18} color={accent.primary as any} />
                    )}
                    <Text style={[styles.greetingText, { color: colors.textPrimary }]}>
                        {t(greetingKey, { defaultValue: currentHour < 12 ? 'Buenos días' : currentHour < 19 ? 'Buenas tardes' : 'Buenas noches' })}
                        {displayName ? `, ${displayName}` : ''}
                    </Text>
                </View>

                <View style={styles.headerRight}>
                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => setIsCollapsed(!isCollapsed)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        {isCollapsed ? (
                            <ChevronDown size={18} color={colors.textSecondary as any} />
                        ) : (
                            <ChevronUp size={18} color={colors.textSecondary as any} />
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Contenido expandido */}
            {!isCollapsed && (
                <View style={styles.body}>
                    <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
                        {todayReminders.length === 0
                            ? t('briefing.all_done', { defaultValue: 'Has completado todas tus tareas de hoy.' })
                            : t('briefing.overview', {
                                  count: todayReminders.length,
                                  critical: criticalCount,
                                  defaultValue: `Tienes ${todayReminders.length} tareas pendientes para hoy${criticalCount > 0 ? ` (${criticalCount} críticas)` : ''}.`,
                              })}
                    </Text>

                    {/* Barra de progreso */}
                    <View style={styles.progressSection}>
                        <View style={styles.progressLabels}>
                            <Text style={[styles.progressLabelText, { color: colors.textMuted }]}>
                                {todayCompleted.length} / {totalToday} {t('home.completed', { defaultValue: 'completadas' })}
                            </Text>
                            <Text style={[styles.progressPercentText, { color: accent.primary }]}>
                                {progressPercent}%
                            </Text>
                        </View>
                        <View style={[styles.progressBarTrack, { backgroundColor: isDark ? '#262626' : '#E2E8F0' }]}>
                            <View
                                style={[
                                    styles.progressBarFill,
                                    {
                                        backgroundColor: accent.primary,
                                        width: `${progressPercent}%`,
                                    },
                                ]}
                            />
                        </View>
                    </View>

                    {/* Acciones */}
                    <View style={styles.actionsRow}>
                        <VeyraButton
                            variant="secondary"
                            size="sm"
                            radius="pill"
                            label={t('briefing.share_agenda', { defaultValue: 'Compartir agenda' })}
                            iconLeft={<Share2 size={13} color={accent.primary as any} />}
                            onPress={handleShareAgenda}
                        />
                    </View>
                </View>
            )}
        </VeyraSurface>
    );
}

const styles = StyleSheet.create({
    card: {
        padding: 14,
        marginBottom: 14,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    greetingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    greetingText: {
        fontSize: 15,
        fontWeight: '700',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconBtn: {
        padding: 4,
    },
    body: {
        marginTop: 10,
    },
    summaryText: {
        fontSize: 13.5,
        lineHeight: 18,
        marginBottom: 10,
    },
    progressSection: {
        marginBottom: 12,
    },
    progressLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    progressLabelText: {
        fontSize: 12,
        fontWeight: '500',
    },
    progressPercentText: {
        fontSize: 12,
        fontWeight: '700',
    },
    progressBarTrack: {
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
    },
});
