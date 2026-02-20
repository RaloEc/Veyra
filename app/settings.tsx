import { View, YStack, XStack, Text, H2, Button, ScrollView, Switch } from 'tamagui';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';
import { Bell, Moon, Sun, Globe, Volume2, Zap, Clock, Battery, AlertOctagon, ChevronRight } from '@tamagui/lucide-icons';
import { useState } from 'react';
import { Platform, Linking, TouchableOpacity } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import { getSoundName } from '../src/constants/sounds';
import Constants from 'expo-constants';

export default function SettingsScreen() {
    const router = useRouter();
    const { theme, toggleTheme, defaultControlLevel, setDefaultControlLevel, soundSettings } = useStore();
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(true);

    const isDark = theme === 'dark';

    // Colores optimizados para mejor contraste
    const colors = {
        bg: isDark ? '#0a0a0a' : '#F8FAFC',
        textPrimary: isDark ? '#EDEDED' : '#0c0a09',
        textSecondary: isDark ? '#A1A1A1' : '#64748B',
        textMuted: isDark ? '#737373' : '#94A3B8',
        border: isDark ? '#262626' : '#E2E8F0',
        surface: isDark ? '#171717' : '#FFFFFF',
    };

    const controlLevels = [
        { value: 'normal', label: 'Normal', color: isDark ? '#22c55e' : '#10B981' },
        { value: 'strict', label: 'Estricto', color: isDark ? '#eab308' : '#F59E0B' },
        { value: 'critical', label: 'Crítico', color: isDark ? '#ef4444' : '#E11D48' },
    ];

    const openAppSettings = async () => {
        if (Platform.OS === 'android') {
            try {
                await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, {
                    data: `package:${Application.applicationId}`
                });
            } catch (e) {
                Linking.openSettings();
            }
        } else {
            Linking.openSettings();
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 10 }}
                showsVerticalScrollIndicator={false}
            >
                <YStack gap="$6" pb="$8">
                    {/* Título Principal */}
                    <H2
                        fontSize="$8"
                        fontWeight="900"
                        color={colors.textPrimary}
                        letterSpacing={-0.5}
                    >
                        Ajustes
                    </H2>

                    {/* Advertencia de Batería Android */}
                    {Platform.OS === 'android' && (
                        <TouchableOpacity onPress={openAppSettings} activeOpacity={0.8}>
                            <XStack
                                backgroundColor={isDark ? 'rgba(249, 115, 22, 0.08)' : 'rgba(249, 115, 22, 0.05)'}
                                padding="$4"
                                borderRadius="$5"
                                borderWidth={1}
                                borderColor={isDark ? 'rgba(249, 115, 22, 0.3)' : 'rgba(249, 115, 22, 0.2)'}
                                alignItems="center"
                                gap="$3"
                            >
                                <Battery size={22} color={isDark ? '#fb923c' : '#f97316'} />
                                <YStack flex={1}>
                                    <Text
                                        fontWeight="700"
                                        color={isDark ? '#fb923c' : '#f97316'}
                                        fontSize="$4"
                                        mb="$1"
                                    >
                                        Optimización de Batería
                                    </Text>
                                    <Text
                                        color={isDark ? '#d4d4d4' : '#64748B'}
                                        fontSize="$3"
                                        lineHeight={18}
                                    >
                                        Desactiva las restricciones para garantizar que las alarmas suenen.
                                    </Text>
                                </YStack>
                                <ChevronRight size={18} color={isDark ? '#a1a1a1' : '#94A3B8'} />
                            </XStack>
                        </TouchableOpacity>
                    )}

                    {/* Sección: General */}
                    <YStack gap="$3">
                        <Text
                            fontSize="$2"
                            color={colors.textMuted}
                            textTransform="uppercase"
                            fontWeight="800"
                            letterSpacing={1.2}
                            mb="$1"
                        >
                            GENERAL
                        </Text>

                        <SettingsItem
                            icon={theme === 'dark' ? Moon : Sun}
                            label="Modo Oscuro"
                            iconColor={theme === 'dark' ? '#a78bfa' : '#eab308'}
                            rightElement={
                                <Switch
                                    checked={theme === 'dark'}
                                    onCheckedChange={toggleTheme}
                                    size="$3"
                                    backgroundColor={theme === 'dark' ? '$purple8' : '$gray5'}
                                >
                                    <Switch.Thumb animation="quicker" />
                                </Switch>
                            }
                            isDark={isDark}
                            colors={colors}
                        />

                        <SettingsItem
                            icon={Globe}
                            label="Idioma"
                            value="Español"
                            iconColor="#10b981"
                            isDark={isDark}
                            colors={colors}
                        />

                        <SettingsItem
                            icon={Clock}
                            label="Formato de Hora"
                            value="24 horas"
                            iconColor="#3b82f6"
                            isDark={isDark}
                            colors={colors}
                        />
                    </YStack>

                    {/* Sección: Notificaciones */}
                    <YStack gap="$3">
                        <Text
                            fontSize="$2"
                            color={colors.textMuted}
                            textTransform="uppercase"
                            fontWeight="800"
                            letterSpacing={1.2}
                            mb="$1"
                        >
                            NOTIFICACIONES
                        </Text>

                        <SettingsItem
                            icon={Bell}
                            label="Notificaciones"
                            iconColor="#3b82f6"
                            rightElement={
                                <Switch
                                    checked={notificationsEnabled}
                                    onCheckedChange={setNotificationsEnabled}
                                    size="$3"
                                    backgroundColor={notificationsEnabled ? '$blue8' : '$gray5'}
                                >
                                    <Switch.Thumb animation="quicker" />
                                </Switch>
                            }
                            isDark={isDark}
                            colors={colors}
                        />

                        {notificationsEnabled && (
                            <SettingsItem
                                icon={Volume2}
                                label="Sonido"
                                iconColor="#a78bfa"
                                rightElement={
                                    <Switch
                                        checked={soundEnabled}
                                        onCheckedChange={setSoundEnabled}
                                        size="$3"
                                        backgroundColor={soundEnabled ? '$purple8' : '$gray5'}
                                    >
                                        <Switch.Thumb animation="quicker" />
                                    </Switch>
                                }
                                isDark={isDark}
                                colors={colors}
                            />
                        )}
                    </YStack>

                    {/* Sección: Tonos de Recordatorio */}
                    {notificationsEnabled && soundEnabled && (
                        <YStack gap="$3">
                            <Text
                                fontSize="$2"
                                color={colors.textMuted}
                                textTransform="uppercase"
                                fontWeight="800"
                                letterSpacing={1.2}
                                mb="$1"
                            >
                                TONOS
                            </Text>

                            <SettingsItem
                                icon={Bell}
                                label="Normal"
                                value={getSoundName(soundSettings.normal)}
                                iconColor="#22c55e"
                                onPress={() => router.push({ pathname: '/sounds', params: { level: 'normal' } })}
                                isLink
                                isDark={isDark}
                                colors={colors}
                            />

                            <SettingsItem
                                icon={Zap}
                                label="Estricto"
                                value={getSoundName(soundSettings.strict)}
                                iconColor="#f59e0b"
                                onPress={() => router.push({ pathname: '/sounds', params: { level: 'strict' } })}
                                isLink
                                isDark={isDark}
                                colors={colors}
                            />

                            <SettingsItem
                                icon={AlertOctagon}
                                label="Crítico"
                                value={getSoundName(soundSettings.critical)}
                                iconColor="#ef4444"
                                onPress={() => router.push({ pathname: '/sounds', params: { level: 'critical' } })}
                                isLink
                                isDark={isDark}
                                colors={colors}
                            />
                        </YStack>
                    )}

                    {/* Sección: Nivel de Control por Defecto */}
                    <YStack gap="$3">
                        <Text
                            fontSize="$2"
                            color={colors.textMuted}
                            textTransform="uppercase"
                            fontWeight="800"
                            letterSpacing={1.2}
                            mb="$1"
                        >
                            NIVEL DE CONTROL
                        </Text>

                        <YStack
                            backgroundColor={colors.surface}
                            borderRadius="$5"
                            borderWidth={1}
                            borderColor={colors.border}
                            overflow="hidden"
                        >
                            {controlLevels.map((level, index) => {
                                const isActive = defaultControlLevel === level.value;
                                return (
                                    <TouchableOpacity
                                        key={level.value}
                                        onPress={() => setDefaultControlLevel(level.value as any)}
                                        activeOpacity={0.7}
                                    >
                                        <XStack
                                            paddingHorizontal="$4"
                                            paddingVertical="$3.5"
                                            alignItems="center"
                                            justifyContent="space-between"
                                            backgroundColor={isActive
                                                ? (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')
                                                : 'transparent'
                                            }
                                            borderTopWidth={index > 0 ? 1 : 0}
                                            borderTopColor={colors.border}
                                        >
                                            <XStack alignItems="center" gap="$3">
                                                <View
                                                    width={8}
                                                    height={8}
                                                    borderRadius={4}
                                                    backgroundColor={level.color}
                                                    opacity={isActive ? 1 : 0.4}
                                                />
                                                <Text
                                                    fontSize="$4"
                                                    fontWeight={isActive ? "700" : "500"}
                                                    color={isActive ? colors.textPrimary : colors.textSecondary}
                                                >
                                                    {level.label}
                                                </Text>
                                            </XStack>

                                            {isActive && (
                                                <View
                                                    width={18}
                                                    height={18}
                                                    borderRadius={9}
                                                    backgroundColor={level.color}
                                                    alignItems="center"
                                                    justifyContent="center"
                                                >
                                                    <View
                                                        width={6}
                                                        height={6}
                                                        borderRadius={3}
                                                        backgroundColor="white"
                                                    />
                                                </View>
                                            )}
                                        </XStack>
                                    </TouchableOpacity>
                                );
                            })}
                        </YStack>

                    </YStack>

                    <Text
                        textAlign="center"
                        fontSize="$2"
                        color={colors.textMuted}
                        opacity={0.5}
                        mt="$4"
                    >
                        Versión {Constants.expoConfig?.version || '1.0.0'} ({Platform.OS})
                    </Text>
                </YStack>
            </ScrollView>
        </View>
    );
}

// Componente de ítem individual optimizado
function SettingsItem({
    icon: Icon,
    label,
    value,
    iconColor,
    onPress,
    rightElement,
    isLink = false,
    isDark,
    colors
}: any) {
    return (
        <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
            <XStack
                paddingHorizontal="$4"
                paddingVertical="$3.5"
                alignItems="center"
                justifyContent="space-between"
                backgroundColor={colors.surface}
                borderRadius="$5"
                borderWidth={1}
                borderColor={colors.border}
            >
                <XStack gap="$3" alignItems="center" flex={1}>
                    <Icon size={20} color={iconColor} />
                    <Text
                        fontSize="$4"
                        fontWeight="600"
                        color={colors.textPrimary}
                    >
                        {label}
                    </Text>
                </XStack>

                <XStack alignItems="center" gap="$2.5">
                    {value && (
                        <Text
                            fontSize="$3"
                            color={colors.textSecondary}
                            numberOfLines={1}
                            maxWidth={150}
                            fontWeight="500"
                        >
                            {value}
                        </Text>
                    )}
                    {rightElement}
                    {isLink && <ChevronRight size={18} color={colors.textMuted} />}
                </XStack>
            </XStack>
        </TouchableOpacity>
    );
}
