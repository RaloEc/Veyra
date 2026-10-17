import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Vibration,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    AlertOctagon,
    Zap,
    Bell,
    ChevronLeft,
    Play,
    StopCircle,
    Check,
} from '@tamagui/lucide-icons';
import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Asset } from 'expo-asset';

import { useStore } from '../src/store/useStore';
import { AVAILABLE_SOUNDS } from '../src/constants/sounds';
import { NotificationService } from '../src/services/notificationService';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraBadge } from '../src/components/ui/VeyraBadge';
import { VeyraButton } from '../src/components/ui/VeyraButton';

export default function SoundSelectorScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const params = useLocalSearchParams();
    const level = (params.level as 'normal' | 'strict' | 'critical') || 'normal';

    const { soundSettings, setSoundSetting } = useStore();
    const { colors, typography, accent, isDark } = useVeyraTheme();
    const insets = useSafeAreaInsets();

    const playerRef = useRef<AudioPlayer | null>(null);
    const [playingId, setPlayingId] = useState<string | null>(null);

    function stopSound() {
        try {
            Vibration.cancel();
        } catch (_) {}
        if (playerRef.current) {
            try {
                playerRef.current.pause();
                playerRef.current.remove();
            } catch (e) {}
            playerRef.current = null;
        }
        setPlayingId(null);
    }

    async function playSound(soundId: string) {
        if (playingId === soundId) {
            stopSound();
            return;
        }

        stopSound();
        setPlayingId(soundId);

        try {
            const previewVibrationPattern = level === 'critical'
                ? [0, 600, 250, 600]
                : level === 'strict'
                ? [0, 450, 200, 450]
                : [0, 250, 150, 250];
            try {
                Vibration.vibrate(previewVibrationPattern, false);
            } catch (_) {}

            await setAudioModeAsync({
                playsInSilentMode: true,
                interruptionMode: 'mixWithOthers',
            });

            const audioMap: Record<string, any> = {
                'ping_brillante.wav': require('../assets/sounds/ping_brillante.wav'),
                'campana_electro.mp3': require('../assets/sounds/campana_electro.mp3'),
                'clicks_tech.wav': require('../assets/sounds/clicks_tech.wav'),
                'buzzer_fabrica.wav': require('../assets/sounds/buzzer_fabrica.wav'),
                'alarma_fuego.mp3': require('../assets/sounds/alarma_fuego.mp3'),
                'bucle_alarma.wav': require('../assets/sounds/bucle_alarma.wav'),
                'alarma_incendio.mp3': require('../assets/sounds/alarma_incendio.mp3'),
            };

            const source = audioMap[soundId];
            if (!source) throw new Error('Sound not found: ' + soundId);

            // Load and cache locally via expo-asset for instant playback
            const [asset] = await Asset.loadAsync(source);
            const playUri = asset?.localUri || asset?.uri;

            const player = createAudioPlayer(playUri ? { uri: playUri } : source);
            playerRef.current = player;
            player.volume = 1.0;
            player.play();

            player.addListener('playbackStatusUpdate', (status: any) => {
                if (status.didJustFinish || status.error) {
                    setPlayingId(null);
                }
            });
        } catch (error) {
            console.warn('[SoundSelectorScreen] Error playing sound:', error);
            setPlayingId(null);
        }
    }

    useEffect(() => {
        return () => {
            if (playerRef.current) {
                try {
                    playerRef.current.pause();
                    playerRef.current.remove();
                } catch (e) {}
                playerRef.current = null;
            }
        };
    }, []);

    const getLevelConfig = () => {
        switch (level) {
            case 'critical':
                return {
                    icon: AlertOctagon,
                    color: isDark ? '#FB7185' : '#E11D48',
                    label: t('sounds.levels.critical.label'),
                    desc: t('sounds.levels.critical.desc'),
                };
            case 'strict':
                return {
                    icon: Zap,
                    color: isDark ? '#FBBF24' : '#F59E0B',
                    label: t('sounds.levels.strict.label'),
                    desc: t('sounds.levels.strict.desc'),
                };
            default:
                return {
                    icon: Bell,
                    color: accent.primary,
                    label: t('sounds.levels.normal.label'),
                    desc: t('sounds.levels.normal.desc'),
                };
        }
    };

    const config = getLevelConfig();
    const LevelIcon = config.icon;

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
                    {t('sounds.title')}
                </Text>
                <View style={{ width: 34 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            >
                {/* Level Hero Description */}
                <VeyraSurface
                    level={1}
                    radius="lg"
                    style={styles.heroCard}
                >
                    <View style={styles.heroHeaderRow}>
                        <View style={[styles.heroIconBadge, { backgroundColor: `${config.color}20` }]}>
                            <LevelIcon size={20} color={config.color} />
                        </View>
                        <Text style={[styles.heroHeading, { color: colors.textPrimary, fontSize: typography.h2.fontSize }]}>
                            {t('sounds.level_title', { label: config.label })}
                        </Text>
                    </View>
                    <Text style={[styles.heroDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                        {config.desc}
                    </Text>
                </VeyraSurface>

                {/* Sounds List */}
                <View style={styles.soundsList}>
                    {AVAILABLE_SOUNDS.map(s => {
                        const isSelected = soundSettings[level] === s.id;
                        const isPlaying = playingId === s.id;

                        return (
                            <VeyraSurface
                                key={s.id}
                                level={isSelected ? 2 : 1}
                                radius="md"
                                style={[
                                    styles.soundCard,
                                    {
                                        borderColor: isSelected ? config.color : colors.borderSubtle,
                                        borderWidth: isSelected ? 1.5 : 1,
                                        backgroundColor: isSelected
                                            ? (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)')
                                            : colors.surface,
                                    },
                                ]}
                            >
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => playSound(s.id)}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    style={[
                                        styles.playBtn,
                                        {
                                            backgroundColor: isPlaying
                                                ? config.color
                                                : isDark
                                                ? colors.surfaceElevated
                                                : colors.surfaceElevated,
                                        },
                                    ]}
                                >
                                    {isPlaying ? (
                                        <StopCircle size={20} color="#FFFFFF" />
                                    ) : (
                                        <Play size={20} color={config.color} style={{ marginLeft: 2 }} />
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    style={styles.soundSelectArea}
                                    onPress={() => {
                                        setSoundSetting(level, s.id);
                                        NotificationService.ensureChannel(level, s.id);
                                    }}
                                >
                                    <View style={{ flex: 1, gap: 2 }}>
                                        <Text
                                            style={[
                                                styles.soundName,
                                                { color: colors.textPrimary, fontSize: typography.body.fontSize },
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {s.name}
                                        </Text>
                                        <Text style={[styles.soundType, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                            {s.type}
                                        </Text>
                                    </View>

                                    {isSelected && (
                                        <View style={[styles.checkCircle, { backgroundColor: config.color }]}>
                                            <Check size={12} color="#FFFFFF" strokeWidth={3} />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </VeyraSurface>
                        );
                    })}
                </View>

                {level === 'critical' && (
                    <View style={{ marginTop: 12, marginBottom: 28 }}>
                        <VeyraButton
                            variant="secondary"
                            size="md"
                            label="Ver diseño de alarma (Pantalla Completa)"
                            iconLeft={<AlertOctagon size={18} color="#E11D48" />}
                            onPress={() => router.push('/confirm/preview')}
                        />
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
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
        gap: 16,
    },
    heroCard: {
        padding: 16,
        gap: 8,
    },
    heroHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    heroIconBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroHeading: {
        fontWeight: '800',
    },
    heroDesc: {
        lineHeight: 20,
        opacity: 0.85,
    },
    soundsList: {
        gap: 10,
    },
    soundCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        gap: 12,
    },
    soundSelectArea: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    playBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    soundName: {
        fontWeight: '700',
    },
    soundType: {
        fontWeight: '500',
    },
    checkCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 10,
    },
});
