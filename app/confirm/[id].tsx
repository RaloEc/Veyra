import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    ActivityIndicator,
    ScrollView,
    TouchableOpacity,
    Image,
    Modal,
    Linking,
    LayoutAnimation,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Asset } from 'expo-asset';
import {
    Check,
    Clock,
    AlertOctagon,
    Zap,
    Bell,
    Volume2,
    VolumeX,
    Flame,
    ExternalLink,
    Paperclip,
    X,
    ChevronRight,
} from '@tamagui/lucide-icons';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

import { useStore } from '../../src/store/useStore';
import { useVeyraTheme } from '../../src/theme/useVeyraTheme';
import { extractPlainTextFromPages } from '../../src/utils/pageUtils';
import { VeyraSurface } from '../../src/components/ui/VeyraSurface';
import { SlideToConfirm } from '../../src/components/ui/SlideToConfirm';
import { ReminderService } from '../../src/services/reminderService';
import { NotificationService } from '../../src/services/notificationService';
import { VeyraAlarm } from '../../src/services/veyraAlarm';
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
    subtasks: JSON.stringify([
        { id: 'st1', title: 'Tomar 1 cápsula con abundante agua', completed: false },
        { id: 'st2', title: 'Comprobar presión arterial', completed: false },
    ]),
    links: JSON.stringify(['https://meet.google.com/xyz-veyra']),
};

const MOCK_TEST_REMINDER: Reminder = {
    id: 'test',
    user_id: 'preview_user',
    title: '⚡ Alarma Crítica de Prueba',
    description: '¡Éxito! Veyra encendió la pantalla y sonó con máxima prioridad.',
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

const SNOOZE_OPTIONS = [5, 10, 15, 30];

export default function ConfirmScreen() {
    const rawParams = useLocalSearchParams<{ id?: string | string[] }>();
    const rawId = rawParams?.id;
    const id = Array.isArray(rawId) ? rawId[0] : (typeof rawId === 'string' ? rawId.trim() : '');
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const {
        reminders,
        markAsCompleted,
        snoozeReminder,
        soundSettings,
        loadReminders,
        toggleSubtask,
        streak,
        language,
    } = useStore();
    const { colors, typography, isDark } = useVeyraTheme();
    const locale = language === 'es' ? es : enUS;

    const isTest = Boolean(id && (id.startsWith('test_') || id === 'test'));
    const isPreview = id === 'preview' || id === 'demo' || isTest;

    const playerRef = useRef<AudioPlayer | null>(null);
    const [isMuted, setIsMuted] = useState(false);

    // Live clock timer
    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const reminderFromStore = isTest
        ? (reminders.find(r => r.id === id) || { ...MOCK_TEST_REMINDER, id: id || 'test' })
        : (id === 'preview' || id === 'demo' ? MOCK_PREVIEW_REMINDER : reminders.find(r => r.id === id));
    const lastReminderRef = useRef(reminderFromStore);
    if (reminderFromStore) {
        lastReminderRef.current = reminderFromStore;
    }
    const [dbReminder, setDbReminder] = useState<Reminder | null>(null);
    const [isLoadingDb, setIsLoadingDb] = useState(!reminderFromStore && !isPreview && Boolean(id));

    // Image preview modal state
    const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

    useEffect(() => {
        if (reminders.length === 0) {
            loadReminders().catch(() => {});
        }
    }, []);

    useEffect(() => {
        VeyraAlarm.setLockScreenFlags().catch(() => {});

        if (id) {
            NotificationService.cancelNotificationsForReminder(id).catch(() => {});
        }
        return () => {
            VeyraAlarm.clearLockScreenFlags().catch(() => {});
        };
    }, [id]);

    useEffect(() => {
        if (!reminderFromStore && !isPreview && id) {
            setIsLoadingDb(true);
            ReminderService.getReminderById(id)
                .then(r => {
                    if (r) {
                        setDbReminder(r);
                    } else {
                        VeyraAlarm.getActiveAlarms().then(activeAlarms => {
                            const found = activeAlarms.find(a => a.id === id);
                            if (found) {
                                setDbReminder({
                                    id: found.id,
                                    user_id: 'local_user',
                                    title: found.title,
                                    description: found.description,
                                    due_date_ms: found.triggerAt,
                                    control_level: (found.controlLevel as any) || 'critical',
                                    priority: 2,
                                    status: 'pending',
                                    next_attempt_ms: found.triggerAt,
                                    retry_count: 0,
                                    max_retries: 10,
                                    last_modified_ms: found.triggerAt,
                                    deleted: 0,
                                });
                            }
                        }).catch(() => {});
                    }
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

    const pulseAnim = useRef(new Animated.Value(1)).current;

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
                setIsMuted(false);
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
        if (playerRef.current) {
            try {
                playerRef.current.pause();
                playerRef.current.remove();
            } catch (e) {}
            playerRef.current = null;
        }
        setIsMuted(true);
    };

    // Subtasks handling
    const parsedSubtasks = useMemo(() => {
        if (!reminder?.subtasks) return [];
        try {
            const list = JSON.parse(reminder.subtasks);
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }, [reminder?.subtasks]);

    const [localSubtasks, setLocalSubtasks] = useState(parsedSubtasks);
    useEffect(() => {
        setLocalSubtasks(parsedSubtasks);
    }, [parsedSubtasks]);

    const completedSubtasksCount = localSubtasks.filter((st: any) => st.completed).length;

    const handleToggleLocalSubtask = async (subtaskId: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setLocalSubtasks(prev =>
            prev.map((st: any) => (st.id === subtaskId ? { ...st, completed: !st.completed } : st))
        );
        if (reminder?.id && !isPreview) {
            await toggleSubtask(reminder.id, subtaskId);
        }
    };

    // Attachments handling
    const parsedAttachments = useMemo(() => {
        if (!reminder?.attachments) return [];
        try {
            const arr = JSON.parse(reminder.attachments);
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }, [reminder?.attachments]);

    const imageAttachments = useMemo(() => {
        return parsedAttachments
            .filter((att: any) => {
                const uri = typeof att === 'string' ? att : att?.uri;
                if (!uri) return false;
                return uri.match(/\.(jpg|jpeg|png|webp|gif|heic)$/i) || uri.startsWith('data:image/');
            })
            .map((att: any) => (typeof att === 'string' ? { uri: att, name: 'Imagen' } : att));
    }, [parsedAttachments]);

    const fileAttachments = useMemo(() => {
        return parsedAttachments
            .filter((att: any) => {
                const uri = typeof att === 'string' ? att : att?.uri;
                if (!uri) return false;
                return !(uri.match(/\.(jpg|jpeg|png|webp|gif|heic)$/i) || uri.startsWith('data:image/'));
            })
            .map((att: any) => (typeof att === 'string' ? { uri: att, name: att.split('/').pop() || 'Archivo' } : att));
    }, [parsedAttachments]);

    // Links handling
    const parsedLinks = useMemo(() => {
        if (!reminder?.links) return [];
        try {
            const arr = JSON.parse(reminder.links);
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }, [reminder?.links]);

    // Overdue calculations
    const timeDiffMs = reminder ? currentTime.getTime() - reminder.due_date_ms : 0;
    const overdueMinutes = Math.floor(timeDiffMs / 60000);
    const overdueLabel = useMemo(() => {
        if (!reminder) return '';
        if (overdueMinutes <= 0) {
            return language === 'es' ? 'En hora' : 'On time';
        }
        if (overdueMinutes === 1) {
            return language === 'es' ? 'Venció hace 1 min' : 'Overdue 1 min';
        }
        return language === 'es' ? `Venció hace ${overdueMinutes} min` : `Overdue ${overdueMinutes} min`;
    }, [overdueMinutes, reminder, language]);

    if (!reminder) {
        if (isLoadingDb) {
            return (
                <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
                    <ActivityIndicator size="large" color={isCritical ? '#E11D48' : '#3B82F6'} />
                    <Text style={{ marginTop: 16, color: colors.textSecondary, fontSize: typography.body.fontSize }}>
                        {t('common.loading', 'Cargando recordatorio...')}
                    </Text>
                </SafeAreaView>
            );
        }

        return (
            <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
                <View style={styles.notFoundContainer}>
                    <Text style={[styles.notFoundText, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                        Recordatorio no encontrado o ya procesado.
                    </Text>
                    <TouchableOpacity
                        style={[styles.backHomeBtn, { backgroundColor: colors.borderSubtle }]}
                        onPress={async () => {
                            if (id) {
                                await NotificationService.cancelNotificationsForReminder(id).catch(() => {});
                            }
                            await VeyraAlarm.clearLockScreenFlags().catch(() => {});
                            router.replace('/');
                        }}
                    >
                        <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>
                            {language === 'es' ? 'Volver al inicio' : 'Back to home'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const themeColor = isCritical ? '#E11D48' : isStrict ? '#F59E0B' : '#3B82F6';

    const handleDone = async () => {
        await stopAlarmSound();
        if (id) {
            await NotificationService.cancelNotificationsForReminder(id);
            await markAsCompleted(id);
        }
        await VeyraAlarm.clearLockScreenFlags().catch(() => {});
        router.replace('/');
    };

    const handleSnoozeMinutes = async (minutes: number) => {
        await stopAlarmSound();
        if (id) {
            await NotificationService.cancelNotificationsForReminder(id);
            if (!isTest || reminders.some(r => r.id === id)) {
                await snoozeReminder(String(id), minutes);
            }
        }
        await VeyraAlarm.clearLockScreenFlags().catch(() => {});
        router.replace('/');
    };

    const handleDismiss = async () => {
        await stopAlarmSound();
        if (id) {
            await NotificationService.cancelNotificationsForReminder(id);
        }
        await VeyraAlarm.clearLockScreenFlags().catch(() => {});
        router.replace('/');
    };

    const plainDescription = reminder.description ? extractPlainTextFromPages(reminder.description) : '';

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
            {/* Ambient Background Glow Effect */}
            <View
                pointerEvents="none"
                style={[
                    styles.ambientGlow,
                    {
                        backgroundColor: `${themeColor}12`,
                    },
                ]}
            />

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ─── 1. RELOJ DIGITAL EN VIVO Y FECHA ─── */}
                <View style={styles.clockHeader}>
                    <Text style={[styles.clockTimeText, { color: colors.textPrimary }]}>
                        {format(currentTime, 'HH:mm')}
                    </Text>
                    <Text style={[styles.clockDateText, { color: colors.textSecondary }]}>
                        {format(currentTime, language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale })}
                    </Text>
                </View>

                {/* ─── 2. HERO BADGE CON RESPLANDOR Y PULSO ─── */}
                <View style={styles.heroSection}>
                    <Animated.View
                        style={[
                            styles.heroIconCircle,
                            {
                                backgroundColor: `${themeColor}1E`,
                                borderColor: `${themeColor}40`,
                                transform: [{ scale: pulseAnim }],
                            },
                        ]}
                    >
                        {isCritical ? (
                            <AlertOctagon size={42} color={themeColor} strokeWidth={2.4} />
                        ) : isStrict ? (
                            <Zap size={42} color={themeColor} strokeWidth={2.4} />
                        ) : (
                            <Bell size={42} color={themeColor} strokeWidth={2.4} />
                        )}
                    </Animated.View>

                    <View style={styles.badgeRow}>
                        <View style={[styles.levelBadgeWrap, { backgroundColor: `${themeColor}18`, borderColor: `${themeColor}40` }]}>
                            <Text style={[styles.levelBadgeText, { color: themeColor }]}>
                                {isCritical
                                    ? (language === 'es' ? 'RECORDATORIO CRÍTICO' : 'CRITICAL REMINDER')
                                    : isStrict
                                    ? (language === 'es' ? 'RECORDATORIO ESTRICTO' : 'STRICT REMINDER')
                                    : (language === 'es' ? 'RECORDATORIO' : 'REMINDER')}
                            </Text>
                        </View>

                        <View style={[styles.overdueBadgeWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                            <Clock size={12} color={colors.textSecondary} />
                            <Text style={[styles.overdueBadgeText, { color: colors.textSecondary }]}>
                                {overdueLabel}
                            </Text>
                        </View>
                    </View>

                    {streak > 0 && (
                        <View style={styles.streakBadgeWrap}>
                            <Flame size={14} color="#F59E0B" />
                            <Text style={styles.streakBadgeText}>
                                {language === 'es'
                                    ? `Racha activa de ${streak} día${streak > 1 ? 's' : ''}`
                                    : `${streak}-day streak active`}
                            </Text>
                        </View>
                    )}

                    {/* Botón Silenciar Alarma acústica */}
                    <TouchableOpacity
                        onPress={isMuted ? undefined : stopAlarmSound}
                        activeOpacity={0.7}
                        style={[
                            styles.muteBtn,
                            {
                                backgroundColor: isMuted
                                    ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)')
                                    : `${themeColor}1E`,
                                borderColor: isMuted ? colors.borderSubtle : `${themeColor}60`,
                            },
                        ]}
                    >
                        {isMuted ? (
                            <>
                                <VolumeX size={15} color={colors.textMuted} />
                                <Text style={[styles.muteBtnText, { color: colors.textMuted }]}>
                                    {language === 'es' ? 'Alarma silenciada' : 'Alarm silenced'}
                                </Text>
                            </>
                        ) : (
                            <>
                                <Volume2 size={16} color={themeColor} />
                                <Text style={[styles.muteBtnText, { color: themeColor, fontWeight: '700' }]}>
                                    {language === 'es' ? 'Silenciar sonido' : 'Silence sound'}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                {/* ─── 3. TÍTULO Y DESCRIPCIÓN ─── */}
                <View style={styles.titleSection}>
                    <Text style={[styles.title, { color: colors.textPrimary }]}>
                        {reminder.title}
                    </Text>

                    {plainDescription ? (
                        <VeyraSurface level={1} radius="md" style={styles.descriptionCard}>
                            <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
                                {plainDescription}
                            </Text>
                        </VeyraSurface>
                    ) : null}
                </View>

                {/* ─── 4. SUBTAREAS / CHECKLIST INTERACTIVO ─── */}
                {localSubtasks.length > 0 && (
                    <VeyraSurface level={1} radius="md" style={styles.subtasksCard}>
                        <View style={styles.subtasksHeader}>
                            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                                {language === 'es' ? 'Subtareas' : 'Subtasks'}
                            </Text>
                            <Text style={[styles.subtasksProgressText, { color: colors.textSecondary }]}>
                                {completedSubtasksCount}/{localSubtasks.length}
                            </Text>
                        </View>

                        <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                            <View
                                style={[
                                    styles.progressFill,
                                    {
                                        width: `${(completedSubtasksCount / localSubtasks.length) * 100}%`,
                                        backgroundColor: completedSubtasksCount === localSubtasks.length ? '#10B981' : themeColor,
                                    },
                                ]}
                            />
                        </View>

                        <View style={styles.subtasksList}>
                            {localSubtasks.map((st: any) => (
                                <TouchableOpacity
                                    key={st.id}
                                    activeOpacity={0.7}
                                    onPress={() => handleToggleLocalSubtask(st.id)}
                                    style={[
                                        styles.subtaskRow,
                                        { borderBottomColor: colors.borderSubtle },
                                    ]}
                                >
                                    <View
                                        style={[
                                            styles.subtaskCheckbox,
                                            st.completed
                                                ? { backgroundColor: '#10B981', borderColor: '#10B981' }
                                                : { borderColor: colors.borderMedium },
                                        ]}
                                    >
                                        {st.completed && <Check size={11} color="#FFFFFF" strokeWidth={3.5} />}
                                    </View>
                                    <Text
                                        style={[
                                            styles.subtaskTitle,
                                            {
                                                color: st.completed ? colors.textMuted : colors.textPrimary,
                                                textDecorationLine: st.completed ? 'line-through' : 'none',
                                            },
                                        ]}
                                    >
                                        {st.title}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </VeyraSurface>
                )}

                {/* ─── 5. ADJUNTOS / IMÁGENES / ARCHIVOS ─── */}
                {parsedAttachments.length > 0 && (
                    <VeyraSurface level={1} radius="md" style={styles.attachmentsCard}>
                        <View style={styles.cardHeaderRow}>
                            <Paperclip size={15} color={colors.textSecondary} />
                            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                                {language === 'es' ? 'Adjuntos' : 'Attachments'} ({parsedAttachments.length})
                            </Text>
                        </View>

                        {imageAttachments.length > 0 && (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.imageScroll}
                            >
                                {imageAttachments.map((img: any, idx: number) => (
                                    <TouchableOpacity
                                        key={idx}
                                        activeOpacity={0.85}
                                        onPress={() => setPreviewImageUri(img.uri)}
                                        style={[styles.imageWrapper, { borderColor: colors.borderSubtle }]}
                                    >
                                        <Image source={{ uri: img.uri }} style={styles.imageThumb} />
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}

                        {fileAttachments.length > 0 && (
                            <View style={styles.filesList}>
                                {fileAttachments.map((file: any, idx: number) => (
                                    <TouchableOpacity
                                        key={idx}
                                        activeOpacity={0.7}
                                        onPress={() => Linking.openURL(file.uri).catch(() => {})}
                                        style={[
                                            styles.fileRow,
                                            {
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                                borderColor: colors.borderSubtle,
                                            },
                                        ]}
                                    >
                                        <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>
                                            {file.name}
                                        </Text>
                                        <ChevronRight size={14} color={colors.textMuted} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </VeyraSurface>
                )}

                {/* ─── 6. ENLACES RÁPIDOS ─── */}
                {parsedLinks.length > 0 && (
                    <VeyraSurface level={1} radius="md" style={styles.linksCard}>
                        <View style={styles.cardHeaderRow}>
                            <ExternalLink size={15} color={colors.textSecondary} />
                            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                                {language === 'es' ? 'Enlaces de acceso' : 'Quick links'}
                            </Text>
                        </View>
                        <View style={styles.linksList}>
                            {parsedLinks.map((url: string, idx: number) => (
                                <TouchableOpacity
                                    key={idx}
                                    activeOpacity={0.7}
                                    onPress={() => Linking.openURL(url).catch(() => {})}
                                    style={[
                                        styles.linkBtn,
                                        {
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                            borderColor: colors.borderSubtle,
                                        },
                                    ]}
                                >
                                    <Text style={[styles.linkUrlText, { color: themeColor }]} numberOfLines={1}>
                                        {url.replace(/^https?:\/\//i, '')}
                                    </Text>
                                    <ExternalLink size={13} color={themeColor} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </VeyraSurface>
                )}
            </ScrollView>

            {/* ─── 7. FOOTER FIJO: SNOOZE PILLS + SLIDE TO CONFIRM ─── */}
            <View
                style={[
                    styles.fixedFooter,
                    {
                        backgroundColor: colors.bg,
                        borderTopColor: colors.borderSubtle,
                        paddingBottom: Math.max(insets.bottom, 12),
                    },
                ]}
            >
                {/* Snooze Options Bar */}
                <View style={styles.snoozeBar}>
                    <Text style={[styles.snoozeLabel, { color: colors.textMuted }]}>
                        {language === 'es' ? 'Posponer:' : 'Snooze:'}
                    </Text>
                    <View style={styles.snoozePillsRow}>
                        {SNOOZE_OPTIONS.map(mins => (
                            <TouchableOpacity
                                key={mins}
                                activeOpacity={0.7}
                                onPress={() => handleSnoozeMinutes(mins)}
                                style={[
                                    styles.snoozeChip,
                                    {
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                                        borderColor: colors.borderSubtle,
                                    },
                                ]}
                            >
                                <Clock size={11} color={colors.textSecondary} />
                                <Text style={[styles.snoozeChipText, { color: colors.textPrimary }]}>
                                    +{mins}m
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Slider de Confirmación Antierror */}
                <SlideToConfirm
                    onConfirm={handleDone}
                    label={language === 'es' ? 'Desliza para completar' : 'Slide to complete'}
                    themeColor="#10B981"
                    isDark={isDark}
                />

                {/* Botón Ignorar secundario (solo si no es crítico) */}
                {!isCritical && (
                    <TouchableOpacity
                        onPress={handleDismiss}
                        activeOpacity={0.6}
                        style={styles.dismissBtn}
                    >
                        <Text style={[styles.dismissText, { color: colors.textMuted }]}>
                            {language === 'es' ? 'Ignorar por ahora' : 'Dismiss for now'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* ─── MODAL DE PREVISUALIZACIÓN DE IMÁGENES ─── */}
            <Modal
                visible={Boolean(previewImageUri)}
                transparent
                animationType="fade"
                onRequestClose={() => setPreviewImageUri(null)}
            >
                <View style={styles.imageModalBackdrop}>
                    <TouchableOpacity
                        style={styles.imageModalCloseBtn}
                        onPress={() => setPreviewImageUri(null)}
                    >
                        <X size={22} color="#FFFFFF" />
                    </TouchableOpacity>
                    {previewImageUri && (
                        <Image
                            source={{ uri: previewImageUri }}
                            style={styles.imageModalImg}
                            resizeMode="contain"
                        />
                    )}
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    ambientGlow: {
        position: 'absolute',
        top: -60,
        left: -60,
        right: -60,
        height: 320,
        borderRadius: 160,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 24,
        gap: 16,
    },
    clockHeader: {
        alignItems: 'center',
        paddingVertical: 6,
    },
    clockTimeText: {
        fontSize: 54,
        fontWeight: '900',
        letterSpacing: -1.5,
        lineHeight: 60,
    },
    clockDateText: {
        fontSize: 13.5,
        fontWeight: '600',
        textTransform: 'capitalize',
        marginTop: 2,
    },
    heroSection: {
        alignItems: 'center',
        gap: 12,
    },
    heroIconCircle: {
        width: 82,
        height: 82,
        borderRadius: 41,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        justifyContent: 'center',
    },
    levelBadgeWrap: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 14,
        borderWidth: 1,
    },
    levelBadgeText: {
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1.1,
    },
    overdueBadgeWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
    },
    overdueBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    streakBadgeWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
    },
    streakBadgeText: {
        color: '#F59E0B',
        fontSize: 11,
        fontWeight: '700',
    },
    muteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        marginTop: 4,
    },
    muteBtnText: {
        fontSize: 12.5,
    },
    titleSection: {
        gap: 10,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        textAlign: 'center',
        letterSpacing: -0.4,
        lineHeight: 30,
    },
    descriptionCard: {
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    descriptionText: {
        fontSize: 14,
        lineHeight: 22,
    },
    subtasksCard: {
        padding: 14,
        gap: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    subtasksHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    subtasksProgressText: {
        fontSize: 12,
        fontWeight: '600',
    },
    progressTrack: {
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    subtasksList: {
        gap: 4,
    },
    subtaskRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    subtaskCheckbox: {
        width: 18,
        height: 18,
        borderRadius: 5,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    subtaskTitle: {
        fontSize: 13.5,
        flex: 1,
        lineHeight: 18,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    attachmentsCard: {
        padding: 14,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    imageScroll: {
        flexDirection: 'row',
        gap: 10,
    },
    imageWrapper: {
        width: 76,
        height: 76,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
    },
    imageThumb: {
        width: '100%',
        height: '100%',
    },
    filesList: {
        gap: 6,
    },
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
    },
    fileName: {
        fontSize: 13,
        fontWeight: '600',
        flex: 1,
        marginRight: 8,
    },
    linksCard: {
        padding: 14,
        gap: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    linksList: {
        gap: 6,
    },
    linkBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
    },
    linkUrlText: {
        fontSize: 13,
        fontWeight: '600',
        flex: 1,
        marginRight: 8,
    },
    fixedFooter: {
        paddingHorizontal: 20,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: 12,
    },
    snoozeBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    snoozeLabel: {
        fontSize: 12,
        fontWeight: '600',
    },
    snoozePillsRow: {
        flexDirection: 'row',
        gap: 6,
    },
    snoozeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        borderWidth: 1,
    },
    snoozeChipText: {
        fontSize: 11.5,
        fontWeight: '700',
    },
    dismissBtn: {
        alignItems: 'center',
        paddingVertical: 4,
    },
    dismissText: {
        fontSize: 12,
        fontWeight: '600',
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
    backHomeBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
    },
    imageModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.92)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageModalCloseBtn: {
        position: 'absolute',
        top: 48,
        right: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    imageModalImg: {
        width: '92%',
        height: '75%',
    },
});
