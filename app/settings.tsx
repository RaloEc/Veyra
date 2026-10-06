import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Switch,
    Platform,
    Linking,
    Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    Bell,
    Moon,
    Sun,
    Globe,
    Volume2,
    Zap,
    Clock,
    Battery,
    AlertOctagon,
    ChevronRight,
    Cloud,
    RefreshCw,
    Check,
    ChevronLeft,
    Database,
    Sparkles,
    ShieldAlert,
    Shield,
    Smartphone,
    FileText,
    Layers,
    GraduationCap,
    Eye,
} from '@tamagui/lucide-icons';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

import { useStore } from '../src/store/useStore';
import { seedTestData } from '../src/utils/seedTestData';
import { getSoundName } from '../src/constants/sounds';
import { ACCENT_OPTIONS } from '../src/theme/accentColors';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraSectionHeader } from '../src/components/ui/VeyraSectionHeader';
import { VeyraDivider } from '../src/components/ui/VeyraDivider';
import { AlarmPermissionsModal } from '../src/components/settings/AlarmPermissionsModal';
import { WidgetService } from '../src/services/widgetService';

export default function SettingsScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [showAlarmPermissionsModal, setShowAlarmPermissionsModal] = useState(false);
    const {
        theme,
        toggleTheme,
        setTheme,
        defaultControlLevel,
        setDefaultControlLevel,
        soundSettings,
        language,
        setLanguage,
        cloudSyncEnabled,
        setCloudSyncEnabled,
        isSyncing,
        lastSyncTime,
        syncError,
        triggerSync,
        session,
        accentTheme,
        setAccentTheme,
        widgetTextScale,
        setWidgetTextScale,
        widgetHighContrast,
        setWidgetHighContrast,
    } = useStore();

    const TEXT_SCALE_OPTIONS = [
        { scale: 0.85, key: 'compact', pct: '85%' },
        { scale: 1.0, key: 'normal', pct: '100%' },
        { scale: 1.15, key: 'large', pct: '115%' },
        { scale: 1.30, key: 'extra', pct: '130%' },
    ] as const;

    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [soundEnabled, setSoundEnabled] = useState(true);

    const { colors, typography, accent, isDark } = useVeyraTheme();
    const insets = useSafeAreaInsets();

    const controlLevels = [
        { value: 'normal', label: t('settings.normal'), color: isDark ? '#34D399' : '#059669' },
        { value: 'strict', label: t('settings.strict'), color: isDark ? '#FBBF24' : '#F59E0B' },
        { value: 'critical', label: t('settings.critical'), color: isDark ? '#FB7185' : '#E11D48' },
    ];

    const openAppSettings = async () => {
        if (Platform.OS === 'android') {
            try {
                await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, {
                    data: `package:${Application.applicationId}`,
                });
            } catch (e) {
                Linking.openSettings();
            }
        } else {
            Linking.openSettings();
        }
    };

    const openExactAlarmSettings = async () => {
        if (Platform.OS === 'android') {
            try {
                await IntentLauncher.startActivityAsync('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', {
                    data: `package:${Application.applicationId}`,
                });
            } catch (e) {
                openAppSettings();
            }
        }
    };

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'right', 'left']}>
            {/* Header */}
            <View style={styles.header}>
                <VeyraIconButton
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                    onPress={() => router.back()}
                />
                <View style={{ flex: 1 }} />
            </View>

            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* One UI Visual Viewing Zone: Large Title */}
                <View style={styles.titleContainer}>
                    <Text style={[styles.largeTitle, { color: colors.textPrimary }]}>
                        {t('settings.title')}
                    </Text>
                </View>
                {/* Alarm & Lockscreen Guarantee (Android) */}
                {Platform.OS === 'android' && (
                    <TouchableOpacity onPress={() => setShowAlarmPermissionsModal(true)} activeOpacity={0.8}>
                        <VeyraSurface
                            level={1}
                            radius="md"
                            style={[
                                styles.permissionBanner,
                                {
                                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.04)',
                                    borderColor: 'rgba(239, 68, 68, 0.25)',
                                },
                            ]}
                        >
                            <ShieldAlert size={22} color="#EF4444" />
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text style={[styles.bannerTitle, { color: isDark ? '#F87171' : '#DC2626', fontSize: typography.body.fontSize, fontWeight: '700' }]}>
                                    {t('settings.alarm_warranty')}
                                </Text>
                                <Text style={[styles.bannerDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                    {t('settings.alarm_warranty_desc')}
                                </Text>
                            </View>
                            <ChevronRight size={18} color={colors.textMuted} />
                        </VeyraSurface>
                    </TouchableOpacity>
                )}

                {/* General Section */}
                <VeyraSectionHeader title={t('settings.general')} />
                <VeyraSurface level={1} radius="lg" style={styles.groupCard}>
                    {/* Selector de Tema: Sistema / Claro / Oscuro */}
                    <View style={{ paddingVertical: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                {theme === 'system' ? (
                                    <Smartphone size={18} color="#3B82F6" />
                                ) : isDark ? (
                                    <Moon size={18} color="#A78BFA" />
                                ) : (
                                    <Sun size={18} color="#F59E0B" />
                                )}
                                <Text style={[styles.rowLabel, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                                    {t('settings.theme', 'Tema de la App')}
                                </Text>
                            </View>
                            <Text style={[styles.rowValue, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                {theme === 'system'
                                    ? `${t('settings.theme_system', 'Sistema')} (${isDark ? t('settings.theme_dark', 'Oscuro') : t('settings.theme_light', 'Claro')})`
                                    : theme === 'dark'
                                    ? t('settings.theme_dark', 'Oscuro')
                                    : t('settings.theme_light', 'Claro')}
                            </Text>
                        </View>

                        {/* Segmented Control */}
                        <View style={{
                            flexDirection: 'row',
                            backgroundColor: colors.surfaceElevated,
                            borderRadius: 10,
                            padding: 3,
                            gap: 4
                        }}>
                            {[
                                { key: 'system' as const, label: t('settings.theme_system', 'Sistema'), icon: Smartphone },
                                { key: 'light' as const, label: t('settings.theme_light', 'Claro'), icon: Sun },
                                { key: 'dark' as const, label: t('settings.theme_dark', 'Oscuro'), icon: Moon },
                            ].map(item => {
                                const isSelected = theme === item.key;
                                const ItemIcon = item.icon;
                                return (
                                    <TouchableOpacity
                                        key={item.key}
                                        onPress={() => setTheme(item.key)}
                                        activeOpacity={0.7}
                                        style={{
                                            flex: 1,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            paddingVertical: 8,
                                            borderRadius: 8,
                                            backgroundColor: isSelected ? (isDark ? colors.surfaceCard : '#FFFFFF') : 'transparent',
                                            shadowColor: isSelected ? '#000000' : 'transparent',
                                            shadowOpacity: isSelected ? 0.08 : 0,
                                            shadowRadius: 3,
                                            elevation: isSelected ? 2 : 0,
                                            gap: 6
                                        }}
                                    >
                                        <ItemIcon size={14} color={isSelected ? accent.primary : colors.textMuted} />
                                        <Text style={{
                                            fontSize: 12,
                                            fontWeight: isSelected ? '700' : '500',
                                            color: isSelected ? colors.textPrimary : colors.textMuted
                                        }}>
                                            {item.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                    <VeyraDivider />
                    <SettingsRow
                        icon={Globe}
                        iconColor="#10B981"
                        label={t('settings.language')}
                        value={language === 'es' ? t('settings.spanish') : t('settings.english')}
                        onPress={() => setLanguage(language === 'es' ? 'en' : 'es')}
                    />
                    <VeyraDivider />
                    <SettingsRow
                        icon={Clock}
                        iconColor="#3B82F6"
                        label={t('settings.time_format_label')}
                        value={t('settings.hours_format')}
                    />
                </VeyraSurface>

                {/* Accent Theme Section */}
                <VeyraSectionHeader title={t('settings.accent_theme')} style={{ marginTop: 8 }} />
                <VeyraSurface level={1} radius="lg" style={[styles.groupCard, { paddingVertical: 14 }]}>
                    <View style={styles.accentsRow}>
                        {ACCENT_OPTIONS.map(option => {
                            const isActive = accentTheme === option.key;
                            const displayColor = isDark ? option.darkColor : option.lightColor;
                            return (
                                <TouchableOpacity
                                    key={option.key}
                                    onPress={() => setAccentTheme(option.key)}
                                    activeOpacity={0.7}
                                    style={styles.accentItem}
                                >
                                    <View
                                        style={[
                                            styles.accentCircle,
                                            {
                                                backgroundColor: displayColor,
                                                borderColor: isDark ? '#FFFFFF' : '#0F172A',
                                                borderWidth: isActive ? 2.5 : 0,
                                                transform: isActive ? [{ scale: 1.1 }] : [{ scale: 1 }],
                                            },
                                        ]}
                                    >
                                        {isActive && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                                    </View>
                                    <Text
                                        style={[
                                            styles.accentLabel,
                                            {
                                                color: isActive ? displayColor : colors.textMuted,
                                                fontWeight: isActive ? '800' : '600',
                                                fontSize: typography.micro.fontSize,
                                            },
                                        ]}
                                    >
                                        {t(`settings.accent_${option.key}`)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </VeyraSurface>

                {/* Notifications Section */}
                <VeyraSectionHeader title={t('settings.notifications')} style={{ marginTop: 8 }} />
                <VeyraSurface level={1} radius="lg" style={styles.groupCard}>
                    <SettingsRow
                        icon={Bell}
                        iconColor="#3B82F6"
                        label={t('settings.notifications_label')}
                        rightElement={
                            <Switch
                                value={notificationsEnabled}
                                onValueChange={setNotificationsEnabled}
                                trackColor={{ false: colors.surfaceElevated, true: accent.primary }}
                                thumbColor="#FFFFFF"
                            />
                        }
                    />
                    {notificationsEnabled && (
                        <>
                            <VeyraDivider />
                            <SettingsRow
                                icon={Volume2}
                                iconColor="#A78BFA"
                                label={t('settings.sound')}
                                rightElement={
                                    <Switch
                                        value={soundEnabled}
                                        onValueChange={setSoundEnabled}
                                        trackColor={{ false: colors.surfaceElevated, true: accent.primary }}
                                        thumbColor="#FFFFFF"
                                    />
                                }
                            />
                        </>
                    )}
                </VeyraSurface>

                {/* Cloud Sync (if logged in) */}
                {session && (
                    <>
                        <VeyraSectionHeader title={t('settings.cloud_sync')} style={{ marginTop: 8 }} />
                        <VeyraSurface level={1} radius="lg" style={styles.groupCard}>
                            <SettingsRow
                                icon={Cloud}
                                iconColor="#0EA5E9"
                                label={t('settings.cloud_sync_toggle')}
                                rightElement={
                                    <Switch
                                        value={cloudSyncEnabled}
                                        onValueChange={setCloudSyncEnabled}
                                        trackColor={{ false: colors.surfaceElevated, true: accent.primary }}
                                        thumbColor="#FFFFFF"
                                    />
                                }
                            />
                            {cloudSyncEnabled && (
                                <>
                                    <VeyraDivider />
                                    <SettingsRow
                                        icon={RefreshCw}
                                        iconColor={isSyncing ? colors.textMuted : '#10B981'}
                                        label={t('settings.sync_now')}
                                        value={
                                            isSyncing
                                                ? t('settings.syncing')
                                                : lastSyncTime
                                                ? new Date(lastSyncTime).toLocaleTimeString()
                                                : t('settings.never')
                                        }
                                        onPress={isSyncing ? undefined : triggerSync}
                                    />
                                </>
                            )}
                        </VeyraSurface>
                    </>
                )}

                {/* Tones Section */}
                {notificationsEnabled && soundEnabled && (
                    <>
                        <VeyraSectionHeader title={t('settings.tones')} style={{ marginTop: 8 }} />
                        <VeyraSurface level={1} radius="lg" style={styles.groupCard}>
                            <SettingsRow
                                icon={Bell}
                                iconColor="#10B981"
                                label={t('settings.normal')}
                                value={getSoundName(soundSettings.normal)}
                                isLink
                                onPress={() => router.push({ pathname: '/sounds', params: { level: 'normal' } })}
                            />
                            <VeyraDivider />
                            <SettingsRow
                                icon={Zap}
                                iconColor="#F59E0B"
                                label={t('settings.strict')}
                                value={getSoundName(soundSettings.strict)}
                                isLink
                                onPress={() => router.push({ pathname: '/sounds', params: { level: 'strict' } })}
                            />
                            <VeyraDivider />
                            <SettingsRow
                                icon={AlertOctagon}
                                iconColor="#E11D48"
                                label={t('settings.critical')}
                                value={getSoundName(soundSettings.critical)}
                                isLink
                                onPress={() => router.push({ pathname: '/sounds', params: { level: 'critical' } })}
                            />
                        </VeyraSurface>
                    </>
                )}

                {/* Default Control Level */}
                <VeyraSectionHeader title={t('settings.control_level')} style={{ marginTop: 8 }} />
                <VeyraSurface level={1} radius="lg" style={styles.groupCard}>
                    {controlLevels.map((level, idx) => {
                        const isActive = defaultControlLevel === level.value;
                        return (
                            <React.Fragment key={level.value}>
                                {idx > 0 && <VeyraDivider />}
                                <TouchableOpacity
                                    onPress={() => setDefaultControlLevel(level.value as any)}
                                    activeOpacity={0.7}
                                    style={styles.controlLevelRow}
                                >
                                    <View style={styles.controlLevelLeft}>
                                        <View
                                            style={[
                                                styles.controlDot,
                                                { backgroundColor: level.color, opacity: isActive ? 1 : 0.4 },
                                            ]}
                                        />
                                        <Text
                                            style={[
                                                styles.controlLevelLabel,
                                                {
                                                    color: isActive ? colors.textPrimary : colors.textSecondary,
                                                    fontWeight: isActive ? '700' : '500',
                                                    fontSize: typography.body.fontSize,
                                                },
                                            ]}
                                        >
                                            {level.label}
                                        </Text>
                                    </View>

                                    {isActive && (
                                        <View style={[styles.controlActiveBadge, { backgroundColor: level.color }]}>
                                            <View style={styles.controlActiveInnerDot} />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </React.Fragment>
                        );
                    })}
                </VeyraSurface>

                {/* Widgets de Android */}
                {Platform.OS === 'android' && (
                    <>
                        <VeyraSectionHeader title={language === 'es' ? 'Widgets de Inicio' : 'Home Widgets'} />
                        <VeyraSurface level={1} radius="lg" style={styles.groupCard}>
                            <SettingsRow
                                icon={Sparkles}
                                iconColor={accent.primary}
                                label={language === 'es' ? 'Añadir widget "Hoy"' : 'Add "Today" widget'}
                                value={language === 'es' ? 'Agenda & Eventos' : 'Agenda & Events'}
                                onPress={async () => {
                                    const success = await WidgetService.requestPin();
                                    if (success) {
                                        Alert.alert(
                                            language === 'es' ? 'Widget Hoy de Veyra' : 'Veyra Today Widget',
                                            language === 'es'
                                                ? 'Sigue las instrucciones del sistema para colocar el widget en tu pantalla.'
                                                : 'Follow the system prompt to place the widget on your home screen.'
                                        );
                                    } else {
                                        Alert.alert(
                                            language === 'es' ? 'Widget' : 'Widget',
                                            language === 'es'
                                                ? 'Puedes añadir el widget manteniendo presionada tu pantalla de inicio y seleccionando Veyra > Hoy.'
                                                : 'You can add the widget by long-pressing your home screen and selecting Veyra > Today.'
                                        );
                                    }
                                }}
                            />
                            <VeyraDivider />
                            <SettingsRow
                                icon={FileText}
                                iconColor="#8B5CF6"
                                label={language === 'es' ? 'Añadir widget "Notas"' : 'Add "Notes" widget'}
                                value={language === 'es' ? 'Notas rápidas' : 'Quick notes'}
                                onPress={async () => {
                                    const success = await WidgetService.requestPinNotes();
                                    if (success) {
                                        Alert.alert(
                                            language === 'es' ? 'Widget de Notas' : 'Notes Widget',
                                            language === 'es'
                                                ? 'Sigue las instrucciones del sistema para colocar el widget en tu pantalla.'
                                                : 'Follow the system prompt to place the widget on your home screen.'
                                        );
                                    } else {
                                        Alert.alert(
                                            language === 'es' ? 'Widget' : 'Widget',
                                            language === 'es'
                                                ? 'Puedes añadir el widget manteniendo presionada tu pantalla de inicio y seleccionando Veyra > Notas.'
                                                : 'You can add the widget by long-pressing your home screen and selecting Veyra > Notes.'
                                        );
                                    }
                                }}
                            />
                            <VeyraDivider />
                            <SettingsRow
                                icon={Layers}
                                iconColor="#EC4899"
                                label={language === 'es' ? 'Añadir widget "Agenda & Notas"' : 'Add "Agenda & Notes" widget'}
                                value={language === 'es' ? 'Dúo con pestañas' : 'Tabbed Duo'}
                                onPress={async () => {
                                    const success = await WidgetService.requestPinCombo();
                                    if (success) {
                                        Alert.alert(
                                            language === 'es' ? 'Widget Agenda y Notas' : 'Agenda & Notes Widget',
                                            language === 'es'
                                                ? 'Sigue las instrucciones del sistema para colocar el widget en tu pantalla.'
                                                : 'Follow the system prompt to place the widget on your home screen.'
                                        );
                                    } else {
                                        Alert.alert(
                                            language === 'es' ? 'Widget' : 'Widget',
                                            language === 'es'
                                                ? 'Puedes añadir el widget manteniendo presionada tu pantalla de inicio y seleccionando Veyra > Agenda y Notas.'
                                                : 'You can add the widget by long-pressing your home screen and selecting Veyra > Agenda and Notes.'
                                        );
                                    }
                                }}
                            />
                            <VeyraDivider />
                            <SettingsRow
                                icon={Zap}
                                iconColor="#F59E0B"
                                label={language === 'es' ? 'Añadir widget "Acciones Rápidas"' : 'Add "Quick Actions" widget'}
                                value={language === 'es' ? 'Accesos directos' : 'Shortcuts'}
                                onPress={async () => {
                                    const success = await WidgetService.requestPinQuick();
                                    if (success) {
                                        Alert.alert(
                                            language === 'es' ? 'Widget Acciones Rápidas' : 'Quick Actions Widget',
                                            language === 'es'
                                                ? 'Sigue las instrucciones del sistema para colocar el widget en tu pantalla.'
                                                : 'Follow the system prompt to place the widget on your home screen.'
                                        );
                                    } else {
                                        Alert.alert(
                                            language === 'es' ? 'Widget' : 'Widget',
                                            language === 'es'
                                                ? 'Puedes añadir el widget manteniendo presionada tu pantalla de inicio y seleccionando Veyra > Acciones Rápidas.'
                                                : 'You can add the widget by long-pressing your home screen and selecting Veyra > Quick Actions.'
                                        );
                                    }
                                }}
                            />
                            <VeyraDivider />
                            <SettingsRow
                                icon={GraduationCap}
                                iconColor="#3B82F6"
                                label={language === 'es' ? 'Añadir widget "Horario de Clases"' : 'Add "Class Schedule" widget'}
                                value={language === 'es' ? 'Clases de hoy' : "Today's classes"}
                                onPress={async () => {
                                    const success = await WidgetService.requestPinSchedule();
                                    if (success) {
                                        Alert.alert(
                                            language === 'es' ? 'Widget Horario de Clases' : 'Class Schedule Widget',
                                            language === 'es'
                                                ? 'Sigue las instrucciones del sistema para colocar el widget en tu pantalla.'
                                                : 'Follow the system prompt to place the widget on your home screen.'
                                        );
                                    } else {
                                        Alert.alert(
                                            language === 'es' ? 'Widget' : 'Widget',
                                            language === 'es'
                                                ? 'Puedes añadir el widget manteniendo presionada tu pantalla de inicio y seleccionando Veyra > Horario de Clases.'
                                                : 'You can add the widget by long-pressing your home screen and selecting Veyra > Class Schedule.'
                                        );
                                    }
                                }}
                            />
                            <VeyraDivider />
                            <SettingsRow
                                icon={RefreshCw}
                                iconColor="#10B981"
                                label={language === 'es' ? 'Sincronizar widgets ahora' : 'Sync widgets now'}
                                onPress={async () => {
                                    const success = await WidgetService.syncAll();
                                    if (success) {
                                        Alert.alert(
                                            language === 'es' ? 'Widgets actualizados' : 'Widgets updated',
                                            language === 'es'
                                                ? 'La agenda y las notas de los widgets se han sincronizado con éxito.'
                                                : 'Widget agenda and notes have been synced successfully.'
                                        );
                                    }
                                }}
                            />
                        </VeyraSurface>

                        {/* Accesibilidad y Apariencia de Widgets */}
                        <VeyraSectionHeader
                            title={t('settings.widgets_accessibility_title', 'Accesibilidad de Widgets')}
                            style={{ marginTop: 8 }}
                        />
                        <VeyraSurface level={1} radius="lg" style={[styles.groupCard, { paddingVertical: 14 }]}>
                            {/* Selector de escala de texto */}
                            <View style={{ marginBottom: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                    <Eye size={18} color={accent.primary} strokeWidth={2.2} />
                                    <Text style={[typography.body, { color: colors.textPrimary, fontWeight: '700' }]}>
                                        {t('settings.widgets_text_size', 'Tamaño del texto')}
                                    </Text>
                                </View>
                                <Text style={[typography.caption, { color: colors.textMuted, marginBottom: 12 }]}>
                                    {t('settings.widgets_text_size_desc', 'Ajusta la escala del texto para todos los widgets del launcher')}
                                </Text>

                                <View style={styles.scaleChipsRow}>
                                    {TEXT_SCALE_OPTIONS.map((opt) => {
                                        const isSelected = Math.abs((widgetTextScale ?? 1.0) - opt.scale) < 0.05;
                                        return (
                                            <TouchableOpacity
                                                key={opt.key}
                                                activeOpacity={0.7}
                                                onPress={() => setWidgetTextScale(opt.scale)}
                                                style={[
                                                    styles.scaleChip,
                                                    {
                                                        backgroundColor: isSelected ? accent.primary : colors.surfaceElevated,
                                                        borderColor: isSelected ? accent.primary : colors.borderSubtle,
                                                    }
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        typography.caption,
                                                        {
                                                            color: isSelected ? '#FFFFFF' : colors.textPrimary,
                                                            fontWeight: isSelected ? '700' : '500',
                                                        }
                                                    ]}
                                                >
                                                    {t(`settings.widgets_scale_${opt.key}`, opt.key)}
                                                </Text>
                                                <Text
                                                    style={{
                                                        fontSize: 10,
                                                        color: isSelected ? 'rgba(255, 255, 255, 0.85)' : colors.textMuted,
                                                        fontWeight: '600',
                                                        marginTop: 1,
                                                    }}
                                                >
                                                    {opt.pct}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <VeyraDivider />

                            {/* Switch de Alto Contraste */}
                            <View style={[styles.accessibilityRow, { marginVertical: 12 }]}>
                                <View style={{ flex: 1, paddingRight: 12 }}>
                                    <Text style={[typography.body, { color: colors.textPrimary, fontWeight: '700' }]}>
                                        {t('settings.widgets_high_contrast', 'Modo Alto Contraste')}
                                    </Text>
                                    <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                                        {t('settings.widgets_high_contrast_desc', 'Fondos puros y contornos reforzados para máxima legibilidad')}
                                    </Text>
                                </View>
                                <Switch
                                    value={widgetHighContrast ?? false}
                                    onValueChange={setWidgetHighContrast}
                                    trackColor={{ false: colors.surfaceElevated, true: accent.primary }}
                                    thumbColor="#FFFFFF"
                                />
                            </View>

                            <VeyraDivider />

                            {/* Previsualización en vivo */}
                            <View style={{ marginTop: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }]}>
                                        {t('settings.widgets_preview_title', 'Vista previa del widget')}
                                    </Text>
                                    <Text style={{ fontSize: 11, color: accent.primary, fontWeight: '700' }}>
                                        {Math.round((widgetTextScale ?? 1.0) * 100)}% {widgetHighContrast ? '• Alto Contraste' : ''}
                                    </Text>
                                </View>

                                <View
                                    style={[
                                        styles.previewWidgetContainer,
                                        {
                                            backgroundColor: widgetHighContrast ? (isDark ? '#000000' : '#FFFFFF') : (isDark ? '#111215' : '#FFFFFF'),
                                            borderColor: widgetHighContrast ? (isDark ? '#64748B' : '#000000') : colors.borderSubtle,
                                            borderWidth: widgetHighContrast ? 1.5 : 1,
                                        }
                                    ]}
                                >
                                    <View style={styles.previewWidgetHeader}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Sparkles size={13} color={widgetHighContrast ? (isDark ? '#FFFFFF' : '#000000') : accent.primary} />
                                            <Text
                                                style={{
                                                    fontSize: Math.round(11 * (widgetTextScale ?? 1.0)),
                                                    fontWeight: '700',
                                                    color: widgetHighContrast ? (isDark ? '#FFFFFF' : '#000000') : colors.textPrimary,
                                                }}
                                            >
                                                Veyra · Hoy
                                            </Text>
                                        </View>
                                        <View
                                            style={[
                                                styles.previewBadge,
                                                {
                                                    backgroundColor: widgetHighContrast
                                                        ? (isDark ? '#1E293B' : '#E2E8F0')
                                                        : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)')
                                                }
                                            ]}
                                        >
                                            <Text
                                                style={{
                                                    fontSize: Math.round(9 * (widgetTextScale ?? 1.0)),
                                                    fontWeight: '700',
                                                    color: widgetHighContrast ? (isDark ? '#FFFFFF' : '#000000') : accent.primary,
                                                }}
                                            >
                                                10:30 AM
                                            </Text>
                                        </View>
                                    </View>

                                    <View
                                        style={[
                                            styles.previewWidgetItem,
                                            {
                                                backgroundColor: widgetHighContrast ? (isDark ? '#121212' : '#F1F5F9') : (isDark ? '#1C1E22' : '#F8FAFC'),
                                                borderColor: widgetHighContrast ? (isDark ? '#334155' : '#CBD5E1') : 'transparent',
                                                borderWidth: widgetHighContrast ? 1 : 0,
                                            }
                                        ]}
                                    >
                                        <View
                                            style={[
                                                styles.previewItemBar,
                                                {
                                                    backgroundColor: widgetHighContrast ? (isDark ? '#FFFFFF' : '#000000') : accent.primary,
                                                }
                                            ]}
                                        />
                                        <View style={{ flex: 1, paddingLeft: 8 }}>
                                            <Text
                                                numberOfLines={1}
                                                style={{
                                                    fontSize: Math.round(13 * (widgetTextScale ?? 1.0)),
                                                    fontWeight: '700',
                                                    color: widgetHighContrast ? (isDark ? '#FFFFFF' : '#000000') : colors.textPrimary,
                                                }}
                                            >
                                                {t('settings.widgets_preview_sample_title', 'Revisar avance del proyecto')}
                                            </Text>
                                            <Text
                                                numberOfLines={1}
                                                style={{
                                                    fontSize: Math.round(10 * (widgetTextScale ?? 1.0)),
                                                    fontWeight: '500',
                                                    color: widgetHighContrast ? (isDark ? '#CBD5E1' : '#334155') : colors.textMuted,
                                                    marginTop: 1,
                                                }}
                                            >
                                                {t('settings.widgets_preview_sample_sub', 'Hoy 10:30 AM · Prioridad Alta')}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </VeyraSurface>
                    </>
                )}

                {/* Datos de Demostración y Pruebas */}
                <VeyraSectionHeader title={language === 'es' ? 'Datos de Demostración' : 'Demo & Test Data'} />
                <VeyraSurface level={1} radius="lg" style={styles.groupCard}>
                    <SettingsRow
                        icon={Database}
                        iconColor={accent.primary}
                        label={language === 'es' ? 'Generar datos de prueba' : 'Generate sample data'}
                        value={language === 'es' ? 'Carpetas, Notas y Recordatorios' : 'Folders, Notes & Reminders'}
                        onPress={async () => {
                            try {
                                await seedTestData();
                                Alert.alert(
                                    language === 'es' ? 'Datos de Demostración Creados' : 'Sample Data Created',
                                    language === 'es'
                                        ? 'Se han creado carpetas personalizadas (Universidad, Trabajo, Ideas), notas con formato enriquecido y recordatorios con subtareas para hoy y todo el mes.'
                                        : 'Custom folders, rich notes, and reminders with subtasks for today and the whole month have been created.'
                                );
                            } catch (error) {
                                console.error('Error generating sample data:', error);
                            }
                        }}
                    />
                </VeyraSurface>

                {/* Legal & Privacidad */}
                <VeyraSectionHeader title={language === 'es' ? 'Legal & Privacidad' : 'Legal & Privacy'} style={{ marginTop: 8 }} />
                <VeyraSurface level={1} radius="lg" style={styles.groupCard}>
                    <SettingsRow
                        icon={Shield}
                        iconColor="#10B981"
                        label={language === 'es' ? 'Política de Privacidad' : 'Privacy Policy'}
                        value={language === 'es' ? 'Protección de datos' : 'Data protection'}
                        isLink
                        onPress={() => router.push({ pathname: '/legal', params: { tab: 'privacy' } })}
                    />
                    <VeyraDivider />
                    <SettingsRow
                        icon={FileText}
                        iconColor="#3B82F6"
                        label={language === 'es' ? 'Términos y Condiciones' : 'Terms & Conditions'}
                        value={language === 'es' ? 'Condiciones de uso (EULA)' : 'Terms of use'}
                        isLink
                        onPress={() => router.push({ pathname: '/legal', params: { tab: 'terms' } })}
                    />
                </VeyraSurface>

                <Text style={[styles.versionText, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                    {t('settings.version')} {Constants.expoConfig?.version || '1.0.0'} ({Platform.OS})
                </Text>
            </ScrollView>

            {Platform.OS === 'android' && (
                <AlarmPermissionsModal
                    visible={showAlarmPermissionsModal}
                    onClose={() => setShowAlarmPermissionsModal(false)}
                />
            )}
        </SafeAreaView>
    );
}

interface SettingsRowProps {
    icon: any;
    iconColor: string;
    label: string;
    value?: string;
    rightElement?: React.ReactNode;
    isLink?: boolean;
    onPress?: () => void;
}

function SettingsRow({
    icon: Icon,
    iconColor,
    label,
    value,
    rightElement,
    isLink,
    onPress,
}: SettingsRowProps) {
    const { colors, typography } = useVeyraTheme();

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={!onPress}
            activeOpacity={0.7}
            style={styles.settingsRow}
        >
            <View style={styles.rowLeftGroup}>
                <Icon size={18} color={iconColor} />
                <Text style={[styles.rowLabel, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                    {label}
                </Text>
            </View>

            <View style={styles.rowRightGroup}>
                {value && (
                    <Text
                        style={[styles.rowValue, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}
                        numberOfLines={1}
                    >
                        {value}
                    </Text>
                )}
                {rightElement}
                {isLink && <ChevronRight size={16} color={colors.textMuted} />}
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    titleContainer: {
        paddingTop: 4,
        paddingBottom: 14,
    },
    largeTitle: {
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: -0.6,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 8,
        gap: 10,
    },
    permissionBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        gap: 12,
        marginBottom: 6,
    },
    bannerTitle: {
        fontWeight: '700',
    },
    bannerDesc: {
        lineHeight: 18,
    },
    groupCard: {
        paddingHorizontal: 14,
    },
    settingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 13,
        minHeight: 48,
    },
    rowLeftGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    rowLabel: {
        fontWeight: '600',
    },
    rowRightGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    rowValue: {
        fontWeight: '500',
        maxWidth: 140,
    },
    accentsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    accentItem: {
        alignItems: 'center',
        gap: 6,
    },
    accentCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    accentLabel: {
        textTransform: 'capitalize',
    },
    controlLevelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 13,
        minHeight: 48,
    },
    controlLevelLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    controlDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    controlLevelLabel: {},
    controlActiveBadge: {
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    controlActiveInnerDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#FFFFFF',
    },
    scaleChipsRow: {
        flexDirection: 'row',
        gap: 8,
        justifyContent: 'space-between',
    },
    scaleChip: {
        flex: 1,
        paddingVertical: 9,
        paddingHorizontal: 4,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    accessibilityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    previewWidgetContainer: {
        padding: 12,
        borderRadius: 16,
        marginTop: 4,
    },
    previewWidgetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    previewBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    previewWidgetItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        borderRadius: 10,
    },
    previewItemBar: {
        width: 3.5,
        height: 26,
        borderRadius: 2,
    },
    versionText: {
        textAlign: 'center',
        opacity: 0.5,
        marginTop: 16,
    },
});
