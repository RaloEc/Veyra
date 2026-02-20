import { getDB } from '../db';
import * as Crypto from 'expo-crypto';

export type ComplianceEventType = 'completed' | 'failed' | 'snoozed' | 'mass_snooze';

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

    async getComplianceStats(userId: string = 'local_user'): Promise<{
        totalCompleted: number;
        totalFailed: number;
        totalSnoozed: number;
        completionRate: number;
        currentStreak: number;
        bestStreak: number;
        productiveHours: { [key: number]: number };
    }> {
        const db = await getDB();

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

        // --- Streak Calculation ---
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

            // Best Streak
            for (let i = 0; i < sortedDays.length; i++) {
                if (i === 0) {
                    tempStreak = 1;
                } else {
                    const prev = new Date(sortedDays[i - 1]);
                    const curr = new Date(sortedDays[i]);
                    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

                    if (diff === 1) {
                        tempStreak++;
                    } else {
                        tempStreak = 1;
                    }
                }
                bestStreak = Math.max(bestStreak, tempStreak);
            }

            // Current Streak
            const lastDay = sortedDays[sortedDays.length - 1];
            if (lastDay === today || lastDay === yesterday) {
                let checkDay = lastDay;
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

                // If the last activity was yesterday, it still counts as a streak until today ends
                // but if they haven't done anything today, it's their streak so far.
            }
        }

        // --- Productive Hours ---
        const productiveHours: { [key: number]: number } = {};
        for (let i = 0; i < 24; i++) productiveHours[i] = 0;

        const allCompletions = await db.getAllAsync<{ timestamp_ms: number }>(
            `SELECT timestamp_ms FROM compliance_events WHERE event_type = 'completed'`
        );

        allCompletions.forEach(e => {
            const hour = new Date(e.timestamp_ms).getHours();
            productiveHours[hour] = (productiveHours[hour] || 0) + 1;
        });

        return {
            totalCompleted,
            totalFailed,
            totalSnoozed,
            completionRate,
            currentStreak,
            bestStreak,
            productiveHours
        };
    }
};
