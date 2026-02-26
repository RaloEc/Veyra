import { View, YStack, XStack, Text, H2, Button, ScrollView, Switch } from 'tamagui';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';
import { Bell, Moon, Sun, Globe, Volume2, Zap, Clock, Battery, AlertOctagon, ChevronRight, Cloud, RefreshCw, Palette, Check } from '@tamagui/lucide-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Linking, TouchableOpacity } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import { getSoundName } from '../src/constants/sounds';
import Constants from 'expo-constants';
import { ACCENT_OPTIONS, AccentTheme } from '../src/theme/accentColors';

export default function SettingsScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { theme, toggleTheme, defaultControlLevel, setDefaultControlLevel, soundSettings, language, setLanguage, cloudSyncEnabled, setCloudSyncEnabled, isSyncing, lastSyncTime, syncError, triggerSync, session, accentTheme, setAccentTheme } = useStore();
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
        { value: 'normal', label: t('settings.normal'), color: isDark ? '#22c55e' : '#10B981' },
        { value: 'strict', label: t('settings.strict'), color: isDark ? '#eab308' : '#F59E0B' },
        { value: 'critical', label: t('settings.critical'), color: isDark ? '#ef4444' : '#E11D48' },
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
                        {t('settings.title')}
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
                                        {t('settings.battery_optimization')}
                                    </Text>
                                    <Text
                                        color={isDark ? '#d4d4d4' : '#64748B'}
                                        fontSize="$3"
                                        lineHeight={18}
                                    >
                                        {t('settings.battery_desc')}
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
                            {t('settings.general')}
                        </Text>

                        <SettingsItem
                            icon={theme === 'dark' ? Moon : Sun}
                            label={t('settings.dark_mode')}
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
                            label={t('settings.language')}
                            value={language === 'es' ? t('settings.spanish') : t('settings.english')}
                            iconColor="#10b981"
                            onPress={() => setLanguage(language === 'es' ? 'en' : 'es')}
                            isDark={isDark}
                            colors={colors}
                        />

                        <SettingsItem
                            icon={Clock}
                            label={t('settings.time_format_label')}
                            value={t('settings.hours_format')}
                            iconColor="#3b82f6"
                            isDark={isDark}
                            colors={colors}
                        />
                    </YStack>

                    {/* Sección: Tema de Color */}
                    <YStack gap="$3">
                        <Text
                            fontSize="$2"
                            color={colors.textMuted}
                            textTransform="uppercase"
                            fontWeight="800"
                            letterSpacing={1.2}
                            mb="$1"
                        >
                            {t('settings.accent_theme')}
                        </Text>

                        <YStack
                            backgroundColor={colors.surface}
                            borderRadius="$5"
                            borderWidth={1}
                            borderColor={colors.border}
                            padding="$4"
                        >
                            <XStack justifyContent="space-between" alignItems="center">
                                {ACCENT_OPTIONS.map((option) => {
                                    const isActive = accentTheme === option.key;
                                    const displayColor = isDark ? option.darkColor : option.lightColor;
                                    return (
                                        <TouchableOpacity
                                            key={option.key}
                                            onPress={() => setAccentTheme(option.key)}
                                            activeOpacity={0.7}
                                            style={{ alignItems: 'center', gap: 6 }}
                                        >
                                            <View
                                                width={isActive ? 42 : 36}
                                                height={isActive ? 42 : 36}
                                                borderRadius={isActive ? 21 : 18}
                                                backgroundColor={displayColor}
                                                borderWidth={isActive ? 3 : 0}
                                                borderColor={isDark ? 'white' : '#0c0a09'}
                                                justifyContent="center"
                                                alignItems="center"
                                                style={{ opacity: isActive ? 1 : 0.7 }}
                                            >
                                                {isActive && <Check size={18} color="white" strokeWidth={3} />}
                                            </View>
                                            <Text
                                                fontSize={10}
                                                fontWeight={isActive ? "800" : "500"}
                                                color={isActive ? displayColor : colors.textMuted}
                                            >
                                                {t(`settings.accent_${option.key}`)}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </XStack>
                        </YStack>
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
                            {t('settings.notifications')}
                        </Text>

                        <SettingsItem
                            icon={Bell}
                            label={t('settings.notifications_label')}
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
                                label={t('settings.sound')}
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

                    {/* Sección: Sincronización en la Nube */}
                    {session && (
                        <YStack gap="$3">
                            <Text
                                fontSize="$2"
                                color={colors.textMuted}
                                textTransform="uppercase"
                                fontWeight="800"
                                letterSpacing={1.2}
                                mb="$1"
                            >
                                {t('settings.cloud_sync')}
                            </Text>

                            <SettingsItem
                                icon={Cloud}
                                label={t('settings.cloud_sync_toggle')}
                                iconColor="#0ea5e9"
                                rightElement={
                                    <Switch
                                        checked={cloudSyncEnabled}
                                        onCheckedChange={setCloudSyncEnabled}
                                        size="$3"
                                        backgroundColor={cloudSyncEnabled ? '$blue8' : '$gray5'}
                                    >
                                        <Switch.Thumb animation="quicker" />
                                    </Switch>
                                }
                                isDark={isDark}
                                colors={colors}
                            />

                            {cloudSyncEnabled && (
                                <>
                                    <SettingsItem
                                        icon={RefreshCw}
                                        label={t('settings.sync_now')}
                                        value={isSyncing ? t('settings.syncing') : (lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : t('settings.never'))}
                                        iconColor={isSyncing ? '#a1a1a1' : '#22c55e'}
                                        onPress={isSyncing ? undefined : triggerSync}
                                        isDark={isDark}
                                        colors={colors}
                                    />

                                    {syncError && (
                                        <XStack
                                            backgroundColor={isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)'}
                                            padding="$3"
                                            borderRadius="$4"
                                            borderWidth={1}
                                            borderColor={isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}
                                        >
                                            <Text
                                                color="#ef4444"
                                                fontSize="$2"
                                                fontWeight="600"
                                            >
                                                {syncError}
                                            </Text>
                                        </XStack>
                                    )}
                                </>
                            )}
                        </YStack>
                    )}

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
                                {t('settings.tones')}
                            </Text>

                            <SettingsItem
                                icon={Bell}
                                label={t('settings.normal')}
                                value={getSoundName(soundSettings.normal)}
                                iconColor="#22c55e"
                                onPress={() => router.push({ pathname: '/sounds', params: { level: 'normal' } })}
                                isLink
                                isDark={isDark}
                                colors={colors}
                            />

                            <SettingsItem
                                icon={Zap}
                                label={t('settings.strict')}
                                value={getSoundName(soundSettings.strict)}
                                iconColor="#f59e0b"
                                onPress={() => router.push({ pathname: '/sounds', params: { level: 'strict' } })}
                                isLink
                                isDark={isDark}
                                colors={colors}
                            />

                            <SettingsItem
                                icon={AlertOctagon}
                                label={t('settings.critical')}
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
                            {t('settings.control_level')}
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
                        {t('settings.version')} {Constants.expoConfig?.version || '1.0.0'} ({Platform.OS})
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
