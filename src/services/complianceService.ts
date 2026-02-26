import { getDB } from '../db';
import * as Crypto from 'expo-crypto';

export type ComplianceEventType = 'completed' | 'failed' | 'snoozed' | 'mass_snooze';

export interface WeeklyActivity {
    day: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
    completed: number;
    failed: number;
    total: number;
}

export interface LevelDistribution {
    normal: { total: number; completed: number; failed: number; rate: number };
    strict: { total: number; completed: number; failed: number; rate: number };
    critical: { total: number; completed: number; failed: number; rate: number };
}

export interface BehaviorStats {
    avgResponseMinutes: number;
    snoozeRate: number;
    avgSnoozesPerReminder: number;
    massSnoozeCount: number;
}

export interface DailyOverview {
    completedToday: number;
    dailyAverage: number;
    totalCreated: number;
    activeNow: number;
    overdueNow: number;
}

export interface NotesStats {
    totalNotes: number;
    notesWithAttachments: number;
    pinnedNotes: number;
}

export interface SmartInsight {
    type: 'positive' | 'neutral' | 'warning';
    key: string;
    params?: Record<string, any>;
}

export interface FullStats {
    // Basic (existing)
    totalCompleted: number;
    totalFailed: number;
    totalSnoozed: number;
    completionRate: number;
    currentStreak: number;
    bestStreak: number;
    productiveHours: { [key: number]: number };
    // New
    weeklyActivity: WeeklyActivity[];
    levelDistribution: LevelDistribution;
    behavior: BehaviorStats;
    daily: DailyOverview;
    notesStats: NotesStats;
    insights: SmartInsight[];
    monthlyComparison: { current: number; previous: number; trend: number };
}

export const ComplianceService = {
    async logEvent(reminderId: string, eventType: ComplianceEventType): Promise<void> {
        const db = await getDB();
        const id = Crypto.randomUUID();
        const now = Date.now();

        await db.runAsync(
            `INSERT INTO compliance_events (id, reminder_id, event_type, timestamp_ms, synced)
             VALUES (?, ?, ?, ?, ?)`,
            [id, reminderId, eventType, now, 0]
        );
    },

    async logNotificationAttempt(reminderId: string, status: 'sent' | 'failed'): Promise<void> {
        const db = await getDB();
        const id = Crypto.randomUUID();
        const now = Date.now();

        await db.runAsync(
            `INSERT INTO notification_attempts (id, reminder_id, attempt_time_ms, status)
             VALUES (?, ?, ?, ?)`,
            [id, reminderId, now, status]
        );
    },

    async getFullStats(): Promise<FullStats> {
        const db = await getDB();

        // ─── BASIC COUNTS ───
        const completed = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM compliance_events WHERE event_type = 'completed'`
        );
        const failed = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM compliance_events WHERE event_type = 'failed'`
        );
        const snoozed = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM compliance_events WHERE event_type = 'snoozed'`
        );

        const totalCompleted = completed?.count || 0;
        const totalFailed = failed?.count || 0;
        const totalSnoozed = snoozed?.count || 0;
        const total = totalCompleted + totalFailed;
        const completionRate = total > 0 ? (totalCompleted / total) * 100 : 0;

        // ─── STREAK CALCULATION ───
        const completionEvents = await db.getAllAsync<{ timestamp_ms: number }>(
            `SELECT DISTINCT timestamp_ms FROM compliance_events WHERE event_type = 'completed' ORDER BY timestamp_ms ASC`
        );

        const uniqueDays = new Set<string>();
        completionEvents.forEach(e => {
            const date = new Date(e.timestamp_ms);
            uniqueDays.add(date.toISOString().split('T')[0]);
        });

        const sortedDays = Array.from(uniqueDays).sort();
        let currentStreak = 0;
        let bestStreak = 0;
        let tempStreak = 0;

        if (sortedDays.length > 0) {
            const today = new Date().toISOString().split('T')[0];
            const yesterdayDate = new Date();
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterday = yesterdayDate.toISOString().split('T')[0];

            for (let i = 0; i < sortedDays.length; i++) {
                if (i === 0) {
                    tempStreak = 1;
                } else {
                    const prev = new Date(sortedDays[i - 1]);
                    const curr = new Date(sortedDays[i]);
                    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
                    tempStreak = diff === 1 ? tempStreak + 1 : 1;
                }
                bestStreak = Math.max(bestStreak, tempStreak);
            }

            const lastDay = sortedDays[sortedDays.length - 1];
            if (lastDay === today || lastDay === yesterday) {
                let idx = sortedDays.length - 1;
                currentStreak = 1;
                while (idx > 0) {
                    const curr = new Date(sortedDays[idx]);
                    const prev = new Date(sortedDays[idx - 1]);
                    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
                    if (diff === 1) {
                        currentStreak++;
                        idx--;
                    } else {
                        break;
                    }
                }
            }
        }

        // ─── PRODUCTIVE HOURS ───
        const productiveHours: { [key: number]: number } = {};
        for (let i = 0; i < 24; i++) productiveHours[i] = 0;

        const allCompletions = await db.getAllAsync<{ timestamp_ms: number }>(
            `SELECT timestamp_ms FROM compliance_events WHERE event_type = 'completed'`
        );

        allCompletions.forEach(e => {
            const hour = new Date(e.timestamp_ms).getHours();
            productiveHours[hour] = (productiveHours[hour] || 0) + 1;
        });

        // ─── WEEKLY ACTIVITY (last 4 weeks) ───
        const fourWeeksAgo = Date.now() - (28 * 24 * 60 * 60 * 1000);
        const weeklyEvents = await db.getAllAsync<{ event_type: string; timestamp_ms: number }>(
            `SELECT event_type, timestamp_ms FROM compliance_events 
             WHERE timestamp_ms >= ? AND event_type IN ('completed', 'failed')`,
            [fourWeeksAgo]
        );

        const weeklyActivity: WeeklyActivity[] = Array.from({ length: 7 }, (_, i) => ({
            day: i,
            completed: 0,
            failed: 0,
            total: 0,
        }));

        weeklyEvents.forEach(e => {
            const dayOfWeek = new Date(e.timestamp_ms).getDay();
            if (e.event_type === 'completed') {
                weeklyActivity[dayOfWeek].completed++;
            } else if (e.event_type === 'failed') {
                weeklyActivity[dayOfWeek].failed++;
            }
            weeklyActivity[dayOfWeek].total++;
        });

        // ─── LEVEL DISTRIBUTION ───
        const levelData = await db.getAllAsync<{ control_level: string; status: string }>(
            `SELECT control_level, status FROM reminders WHERE deleted = 0 OR status = 'completed' OR status = 'failed'`
        );

        const levelDistribution: LevelDistribution = {
            normal: { total: 0, completed: 0, failed: 0, rate: 0 },
            strict: { total: 0, completed: 0, failed: 0, rate: 0 },
            critical: { total: 0, completed: 0, failed: 0, rate: 0 },
        };

        levelData.forEach(r => {
            const level = r.control_level as keyof LevelDistribution;
            if (levelDistribution[level]) {
                levelDistribution[level].total++;
                if (r.status === 'completed') levelDistribution[level].completed++;
                if (r.status === 'failed') levelDistribution[level].failed++;
            }
        });

        // Calculate rates
        (['normal', 'strict', 'critical'] as const).forEach(level => {
            const l = levelDistribution[level];
            const decidedTotal = l.completed + l.failed;
            l.rate = decidedTotal > 0 ? (l.completed / decidedTotal) * 100 : 0;
        });

        // ─── BEHAVIOR STATS ───
        // Average response time: diff between reminder due_date and completion time
        const responseData = await db.getAllAsync<{ due_date_ms: number; completed_at: number }>(
            `SELECT r.due_date_ms, ce.timestamp_ms as completed_at
             FROM compliance_events ce
             JOIN reminders r ON ce.reminder_id = r.id
             WHERE ce.event_type = 'completed'`
        );

        let totalResponseMinutes = 0;
        let responseCount = 0;
        responseData.forEach(r => {
            const diff = Math.abs(r.completed_at - r.due_date_ms) / (1000 * 60);
            if (diff < 1440) { // Only count responses within 24h to avoid outliers
                totalResponseMinutes += diff;
                responseCount++;
            }
        });

        const avgResponseMinutes = responseCount > 0 ? totalResponseMinutes / responseCount : 0;
        const snoozeRate = total > 0 ? (totalSnoozed / (total + totalSnoozed)) * 100 : 0;

        // Average snoozes per reminder
        const snoozePerReminder = await db.getFirstAsync<{ avg_snoozes: number }>(
            `SELECT AVG(snooze_count) as avg_snoozes FROM (
                SELECT reminder_id, COUNT(*) as snooze_count 
                FROM compliance_events 
                WHERE event_type = 'snoozed' 
                GROUP BY reminder_id
            )`
        );

        const massSnoozeResult = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM compliance_events WHERE event_type = 'mass_snooze'`
        );

        const behavior: BehaviorStats = {
            avgResponseMinutes,
            snoozeRate,
            avgSnoozesPerReminder: snoozePerReminder?.avg_snoozes || 0,
            massSnoozeCount: massSnoozeResult?.count || 0,
        };

        // ─── DAILY OVERVIEW ───
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const completedTodayResult = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM compliance_events 
             WHERE event_type = 'completed' AND timestamp_ms >= ?`,
            [todayStart.getTime()]
        );

        const totalCreatedResult = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM reminders`
        );

        const activeNowResult = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM reminders 
             WHERE (status = 'pending' OR status = 'snoozed') AND deleted = 0`
        );

        const overdueNowResult = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM reminders 
             WHERE status = 'pending' AND due_date_ms < ? AND deleted = 0`,
            [Date.now()]
        );

        // Daily average: total completed / number of unique active days
        const activeDays = sortedDays.length || 1;
        const dailyAverage = totalCompleted / activeDays;

        const daily: DailyOverview = {
            completedToday: completedTodayResult?.count || 0,
            dailyAverage: Math.round(dailyAverage * 10) / 10,
            totalCreated: totalCreatedResult?.count || 0,
            activeNow: activeNowResult?.count || 0,
            overdueNow: overdueNowResult?.count || 0,
        };

        // ─── NOTES STATS ───
        const totalNotesResult = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM notes WHERE deleted = 0`
        );
        const notesWithAttResult = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM notes WHERE deleted = 0 AND attachments IS NOT NULL AND attachments != '[]'`
        );
        const pinnedNotesResult = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM notes WHERE deleted = 0 AND is_pinned = 1`
        );

        const notesStats: NotesStats = {
            totalNotes: totalNotesResult?.count || 0,
            notesWithAttachments: notesWithAttResult?.count || 0,
            pinnedNotes: pinnedNotesResult?.count || 0,
        };

        // ─── MONTHLY COMPARISON ───
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

        const currentMonthCompleted = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM compliance_events 
             WHERE event_type = 'completed' AND timestamp_ms >= ?`,
            [currentMonthStart]
        );
        const previousMonthCompleted = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) as count FROM compliance_events 
             WHERE event_type = 'completed' AND timestamp_ms >= ? AND timestamp_ms < ?`,
            [previousMonthStart, currentMonthStart]
        );

        const currentCount = currentMonthCompleted?.count || 0;
        const previousCount = previousMonthCompleted?.count || 0;
        const trend = previousCount > 0
            ? Math.round(((currentCount - previousCount) / previousCount) * 100)
            : (currentCount > 0 ? 100 : 0);

        // ─── SMART INSIGHTS ───
        const insights: SmartInsight[] = [];

        // Best productive hour
        const topHour = Object.entries(productiveHours)
            .sort(([, a], [, b]) => b - a)
            .find(([, count]) => count > 0);

        if (topHour) {
            insights.push({
                type: 'positive',
                key: 'best_hour',
                params: { hour: parseInt(topHour[0]) },
            });
        }

        // Best day of the week
        const bestDay = [...weeklyActivity].sort((a, b) => b.completed - a.completed)[0];
        if (bestDay && bestDay.completed > 0) {
            insights.push({
                type: 'positive',
                key: 'best_day',
                params: { day: bestDay.day },
            });
        }

        // Level compliance comparison
        const levels = ['normal', 'strict', 'critical'] as const;
        const ratedLevels = levels
            .filter(l => (levelDistribution[l].completed + levelDistribution[l].failed) >= 2)
            .sort((a, b) => levelDistribution[b].rate - levelDistribution[a].rate);

        if (ratedLevels.length >= 2) {
            const best = ratedLevels[0];
            const worst = ratedLevels[ratedLevels.length - 1];
            if (levelDistribution[best].rate - levelDistribution[worst].rate > 15) {
                insights.push({
                    type: 'neutral',
                    key: 'level_comparison',
                    params: {
                        best_level: best,
                        best_rate: Math.round(levelDistribution[best].rate),
                        worst_level: worst,
                        worst_rate: Math.round(levelDistribution[worst].rate),
                    },
                });
            }
        }

        // Snooze habit
        if (totalSnoozed === 0 && totalCompleted >= 3) {
            insights.push({
                type: 'positive',
                key: 'no_snooze',
            });
        } else if (snoozeRate > 40) {
            insights.push({
                type: 'warning',
                key: 'high_snooze',
                params: { rate: Math.round(snoozeRate) },
            });
        }

        // Monthly trend
        if (trend > 0 && previousCount > 0) {
            insights.push({
                type: 'positive',
                key: 'improving',
                params: { percent: trend },
            });
        } else if (trend < -20 && previousCount > 3) {
            insights.push({
                type: 'warning',
                key: 'declining',
                params: { percent: Math.abs(trend) },
            });
        }

        // Streak celebration
        if (currentStreak >= 7) {
            insights.push({
                type: 'positive',
                key: 'great_streak',
                params: { days: currentStreak },
            });
        }

        return {
            totalCompleted,
            totalFailed,
            totalSnoozed,
            completionRate,
            currentStreak,
            bestStreak,
            productiveHours,
            weeklyActivity,
            levelDistribution,
            behavior,
            daily,
            notesStats,
            insights,
            monthlyComparison: { current: currentCount, previous: previousCount, trend },
        };
    },

    // Keep backward compatibility
    async getComplianceStats(userId: string = 'local_user') {
        const full = await this.getFullStats();
        return {
            totalCompleted: full.totalCompleted,
            totalFailed: full.totalFailed,
            totalSnoozed: full.totalSnoozed,
            completionRate: full.completionRate,
            currentStreak: full.currentStreak,
            bestStreak: full.bestStreak,
            productiveHours: full.productiveHours,
        };
    }
};
