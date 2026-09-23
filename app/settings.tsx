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

export default function SettingsScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [showAlarmPermissionsModal, setShowAlarmPermissionsModal] = useState(false);
    const {
        theme,
        toggleTheme,
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
    } = useStore();

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
                    <SettingsRow
                        icon={isDark ? Moon : Sun}
                        iconColor={isDark ? '#A78BFA' : '#F59E0B'}
                        label={t('settings.dark_mode')}
                        rightElement={
                            <Switch
                                value={isDark}
                                onValueChange={toggleTheme}
                                trackColor={{ false: colors.surfaceElevated, true: accent.primary }}
                                thumbColor="#FFFFFF"
                            />
                        }
                    />
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
    versionText: {
        textAlign: 'center',
        opacity: 0.5,
        marginTop: 16,
    },
});
