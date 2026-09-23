import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Asset } from 'expo-asset';
import { Check, Clock, AlertOctagon, Zap, Bell } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { useStore } from '../../src/store/useStore';
import { useVeyraTheme } from '../../src/theme/useVeyraTheme';
import { extractPlainTextFromPages } from '../../src/utils/pageUtils';
import { VeyraSurface } from '../../src/components/ui/VeyraSurface';
import { VeyraButton } from '../../src/components/ui/VeyraButton';
import { AVAILABLE_SOUNDS } from '../../src/constants/sounds';
import { ReminderService } from '../../src/services/reminderService';
import { Reminder } from '../../src/types/db';

const MOCK_PREVIEW_REMINDER: Reminder = {
    id: 'preview',
    user_id: 'preview_user',
    title: 'Tomar Medicación / Reunión Urgente',
    description: 'Este es un ejemplo de cómo salta la alarma interactiva a pantalla completa cuando vence un recordatorio crítico.',
    due_date_ms: 1773700000000,
    control_level: 'critical',
    priority: 2,
    status: 'pending',
    next_attempt_ms: 1773700000000,
    retry_count: 0,
    max_retries: 10,
    last_modified_ms: 1773700000000,
    deleted: 0,
};

export default function ConfirmScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { t } = useTranslation();
    const { reminders, markAsCompleted, snoozeReminder, soundSettings } = useStore();
    const { colors, typography, isDark } = useVeyraTheme();

    const isPreview = id === 'preview' || id === 'demo';

    const playerRef = React.useRef<AudioPlayer | null>(null);
    const reminderFromStore = isPreview ? MOCK_PREVIEW_REMINDER : reminders.find(r => r.id === id);
    const lastReminderRef = React.useRef(reminderFromStore);
    if (reminderFromStore) {
        lastReminderRef.current = reminderFromStore;
    }
    const [dbReminder, setDbReminder] = useState<Reminder | null>(null);
    const [isLoadingDb, setIsLoadingDb] = useState(!reminderFromStore && !isPreview);

    useEffect(() => {
        console.log(`[ConfirmScreen] 🚨 Pantalla de confirmación abierta para ID: "${id}" (preview: ${isPreview})`);
        if (!reminderFromStore && !isPreview && id) {
            setIsLoadingDb(true);
            ReminderService.getReminderById(id)
                .then(r => {
                    if (r) setDbReminder(r);
                })
                .catch(err => {
                    console.warn('[ConfirmScreen] Error fetching reminder from DB:', err);
                })
                .finally(() => {
                    setIsLoadingDb(false);
                });
        }
    }, [reminderFromStore, id, isPreview]);

    const reminder = reminderFromStore || dbReminder || lastReminderRef.current;

    const isCritical = reminder?.control_level === 'critical';
    const isStrict = reminder?.control_level === 'strict';

    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (isCritical || isStrict) {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.12,
                        duration: 650,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1.0,
                        duration: 650,
                        useNativeDriver: true,
                    }),
                ])
            );
            loop.start();
            return () => loop.stop();
        }
    }, [isCritical, isStrict]);

    useEffect(() => {
        if (!reminder) return;
        const soundId = soundSettings[reminder.control_level] || 'alarma_fuego.mp3';

        const audioMap: Record<string, any> = {
            'ping_brillante.wav': require('../../assets/sounds/ping_brillante.wav'),
            'campana_electro.mp3': require('../../assets/sounds/campana_electro.mp3'),
            'clicks_tech.wav': require('../../assets/sounds/clicks_tech.wav'),
            'buzzer_fabrica.wav': require('../../assets/sounds/buzzer_fabrica.wav'),
            'alarma_fuego.mp3': require('../../assets/sounds/alarma_fuego.mp3'),
            'bucle_alarma.wav': require('../../assets/sounds/bucle_alarma.wav'),
            'alarma_incendio.mp3': require('../../assets/sounds/alarma_incendio.mp3'),
            'alarm_normal.wav': require('../../assets/sounds/alarm_normal.wav'),
            'alarm_strict.wav': require('../../assets/sounds/alarm_strict.wav'),
            'alarm_critical.wav': require('../../assets/sounds/alarm_critical.wav'),
        };

        const source = audioMap[soundId];
        if (!source) return;

        let activePlayer: AudioPlayer | null = null;
        let isCancelled = false;

        async function startSound() {
            try {
                console.log(`[ConfirmScreen] 🔊 Iniciando reproducción de alarma (${soundId}) | loop: ${isCritical || isStrict}`);
                await setAudioModeAsync({
                    playsInSilentMode: true,
                    interruptionMode: 'mixWithOthers',
                });
                const [asset] = await Asset.loadAsync(source);
                if (isCancelled) return;
                const playUri = asset?.localUri || asset?.uri;

                const newPlayer = createAudioPlayer(playUri ? { uri: playUri } : source);
                newPlayer.loop = isCritical || isStrict;
                newPlayer.volume = 1.0;
                newPlayer.play();
                activePlayer = newPlayer;
                playerRef.current = newPlayer;
            } catch (err) {
                console.warn('[ConfirmScreen] Error starting in-app alarm audio:', err);
            }
        }

        startSound();

        return () => {
            isCancelled = true;
            if (activePlayer) {
                try {
                    activePlayer.pause();
                    activePlayer.remove();
                } catch (e) {}
            }
            playerRef.current = null;
        };
    }, [reminder?.id, reminder?.control_level]);

    const stopAlarmSound = async () => {
        console.log('[ConfirmScreen] ⏹️ Deteniendo sonido de alarma.');
        if (playerRef.current) {
            try {
                playerRef.current.pause();
                playerRef.current.remove();
            } catch (e) {}
            playerRef.current = null;
        }
    };

    if (!reminder) {
        return (
            <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
                <View style={styles.notFoundContainer}>
                    <Text style={[styles.notFoundText, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                        Recordatorio no encontrado o ya procesado.
                    </Text>
                    <VeyraButton
                        variant="secondary"
                        size="md"
                        label="Volver al inicio"
                        onPress={() => router.replace('/')}
                    />
                </View>
            </SafeAreaView>
        );
    }

    const handleDone = async () => {
        await stopAlarmSound();
        await markAsCompleted(id);
        router.replace('/');
    };

    const handleSnooze = async () => {
        await stopAlarmSound();
        await snoozeReminder(String(id), 10);
        router.replace('/');
    };

    const handleDismiss = async () => {
        await stopAlarmSound();
        router.replace('/');
    };

    const themeColor = isCritical ? '#E11D48' : isStrict ? '#F59E0B' : '#3B82F6';

    return (
        <SafeAreaView
            style={[
                styles.screen,
                {
                    backgroundColor: colors.bg,
                },
            ]}
        >
            <View style={styles.content}>
                {/* Hero Header */}
                <View style={styles.heroSection}>
                    <Animated.View
                        style={[
                            styles.heroIconCircle,
                            {
                                backgroundColor: `${themeColor}20`,
                                transform: [{ scale: pulseAnim }],
                            },
                        ]}
                    >
                        {isCritical ? (
                            <AlertOctagon size={48} color={themeColor} />
                        ) : isStrict ? (
                            <Zap size={48} color={themeColor} />
                        ) : (
                            <Bell size={48} color={themeColor} />
                        )}
                    </Animated.View>

                    <Text style={[styles.levelBadge, { color: themeColor, fontSize: typography.caption.fontSize }]}>
                        {isCritical ? 'RECORDATORIO CRÍTICO' : isStrict ? 'RECORDATORIO ESTRICTO' : 'RECORDATORIO'}
                    </Text>

                    <Text style={[styles.title, { color: colors.textPrimary, fontSize: typography.h1.fontSize }]}>
                        {reminder.title}
                    </Text>

                    {reminder.description ? (
                        <Text style={[styles.desc, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                            {extractPlainTextFromPages(reminder.description)}
                        </Text>
                    ) : null}
                </View>

                {/* Actions */}
                <View style={styles.actionsStack}>
                    <VeyraButton
                        variant="primary"
                        size="lg"
                        label="Sí, ya lo hice"
                        iconLeft={<Check size={20} color={isDark ? '#1B1B1B' : '#FFFFFF'} />}
                        onPress={handleDone}
                        style={{ backgroundColor: '#10B981' }}
                    />

                    <VeyraButton
                        variant="secondary"
                        size="md"
                        label="Posponer 10 min"
                        iconLeft={<Clock size={18} color={colors.textPrimary} />}
                        onPress={handleSnooze}
                    />

                    {!isCritical && (
                        <VeyraButton
                            variant="ghost"
                            size="sm"
                            label="Ignorar por ahora"
                            onPress={handleDismiss}
                        />
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 20,
    },
    heroSection: {
        alignItems: 'center',
        gap: 14,
    },
    heroIconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    levelBadge: {
        fontWeight: '900',
        letterSpacing: 1.2,
    },
    title: {
        fontWeight: '900',
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    desc: {
        textAlign: 'center',
        lineHeight: 22,
        opacity: 0.85,
    },
    actionsStack: {
        gap: 12,
    },
    notFoundContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        paddingHorizontal: 24,
    },
    notFoundText: {
        textAlign: 'center',
    },
});
