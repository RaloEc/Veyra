import { useRef, useEffect, useState } from 'react';
import { View, YStack, XStack, Text, H2, Card, Button, Separator, ScrollView } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';
import { Volume2, Play, Check, AlertOctagon, Zap, Bell, ArrowLeft, StopCircle, Music } from '@tamagui/lucide-icons';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { TouchableOpacity, Animated, Easing } from 'react-native';
import { AVAILABLE_SOUNDS } from '../src/constants/sounds';

export default function SoundSelectorScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const params = useLocalSearchParams();
    const level = (params.level as 'normal' | 'strict' | 'critical') || 'normal';

    const { theme, soundSettings, setSoundSetting } = useStore();
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [playingId, setPlayingId] = useState<string | null>(null);

    const isDark = theme === 'dark';

    async function playSound(soundId: string) {
        if (playingId === soundId) {
            stopSound();
            return;
        }

        if (sound) {
            await sound.unloadAsync();
        }

        const soundConfig = AVAILABLE_SOUNDS.find(s => s.id === soundId);
        setPlayingId(soundId);

        try {
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
            if (!source) throw new Error('Sound not found');

            const { sound: newSound } = await Audio.Sound.createAsync(source);
            setSound(newSound);

            await newSound.setStatusAsync({
                shouldPlay: true,
                rate: soundConfig?.rate || 1.0,
                shouldCorrectPitch: false,
                pitchMultiplier: soundConfig?.pitch || 1.0,
            } as any);

            newSound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                    setPlayingId(null);
                }
            });
        } catch (error) {
            console.log('Error playing sound', error);
            setPlayingId(null);
        }
    }

    async function stopSound() {
        if (sound) {
            await sound.stopAsync();
            setPlayingId(null);
        }
    }

    useEffect(() => {
        return () => {
            if (sound) {
                sound.unloadAsync();
            }
        };
    }, [sound]);

    const getLevelConfig = () => {
        switch (level) {
            case 'critical': return { icon: AlertOctagon, color: '$red10', label: t('sounds.levels.critical.label'), desc: t('sounds.levels.critical.desc') };
            case 'strict': return { icon: Zap, color: '$orange10', label: t('sounds.levels.strict.label'), desc: t('sounds.levels.strict.desc') };
            default: return { icon: Bell, color: '$blue10', label: t('sounds.levels.normal.label'), desc: t('sounds.levels.normal.desc') };
        }
    };

    const config = getLevelConfig();
    const LevelIcon = config.icon;

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? '#050505' : '#f8f9fa' }}>

            {/* Header */}
            <XStack px="$4" py="$3" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 5 }}>
                    <ArrowLeft size={28} color={isDark ? 'white' : 'black'} />
                </TouchableOpacity>
                <Text fontSize="$5" fontWeight="700" color={isDark ? 'white' : 'black'}>{t('sounds.title')}</Text>
                <View style={{ width: 28 }} />
            </XStack>

            {/* Title Section */}
            <YStack px="$5" pb="$6" pt="$2">
                <XStack style={{ alignItems: 'center', marginBottom: 8 }} gap="$3">
                    <View bg={config.color as any} p="$2" style={{ borderRadius: 10, opacity: 0.2, position: 'absolute', width: 40, height: 40 }} />
                    <LevelIcon color={config.color as any} size={28} style={{ zIndex: 1 }} />
                    <H2 fontSize="$8" fontWeight="900" color={isDark ? 'white' : 'black'}>{t('sounds.level_title', { label: config.label })}</H2>
                </XStack>
                <Text fontSize="$4" color="$gray10" style={{ lineHeight: 22 }}>{config.desc}</Text>
            </YStack>

            <ScrollView pb={120} px={16} showsVerticalScrollIndicator={false}>
                <YStack gap="$3">
                    {AVAILABLE_SOUNDS.map((s) => {
                        const isSelected = soundSettings[level] === s.id;
                        const isPlaying = playingId === s.id;

                        return (
                            <SoundCard
                                key={s.id}
                                sound={s}
                                isSelected={isSelected}
                                isPlaying={isPlaying}
                                onPress={() => setSoundSetting(level, s.id)}
                                onPlay={() => playSound(s.id)}
                                isDark={isDark}
                                accentColor={config.color}
                            />
                        );
                    })}
                </YStack>
            </ScrollView>

        </View>
    );
}

function SoundCard({ sound, isSelected, isPlaying, onPress, onPlay, isDark, accentColor }: any) {
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
            <XStack
                bg={isDark ? (isSelected ? '$gray3' : '$gray2') : (isSelected ? 'white' : 'white')}
                p="$4"
                style={{
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 24,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? accentColor : (isDark ? '#333' : '#e5e5e5'),
                    elevation: isSelected ? 4 : 0,
                    shadowColor: isSelected ? accentColor : 'black',
                    shadowOpacity: isSelected ? 0.2 : 0,
                    shadowRadius: 8,
                }}
            >
                <XStack style={{ alignItems: 'center', flex: 1 }} gap="$4">
                    <TouchableOpacity onPress={onPlay} style={{ backgroundColor: isPlaying ? accentColor : (isDark ? '#333' : '#f0f0f0'), padding: 12, borderRadius: 25 }}>
                        {isPlaying ? (
                            <StopCircle size={20} color={isPlaying ? 'white' : (isDark ? 'white' : 'black')} fill={isPlaying ? 'white' : 'transparent'} />
                        ) : (
                            <Play size={20} color={isDark ? 'white' : 'black'} fill={isDark ? 'white' : 'black'} />
                        )}
                    </TouchableOpacity>

                    <YStack flex={1}>
                        <Text
                            fontSize="$4"
                            fontWeight="700"
                            color={isDark ? 'white' : 'black'}
                            numberOfLines={1}
                        >
                            {sound.name}
                        </Text>
                        <Text fontSize="$2" color="$gray10" mt="$1">{sound.type}</Text>
                    </YStack>
                </XStack>

                {isSelected && (
                    <View bg={accentColor} p="$1.5" style={{ borderRadius: 20, marginLeft: 12 }}>
                        <Check size={14} color="white" />
                    </View>
                )}
            </XStack>
        </TouchableOpacity>
    );
}
