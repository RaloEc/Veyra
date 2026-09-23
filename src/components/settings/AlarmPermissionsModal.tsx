import React, { useState, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    ScrollView,
    Platform,
    Alert,
    Linking,
    TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import {
    ShieldAlert,
    Maximize2,
    Battery,
    Clock,
    Smartphone,
    X,
    ExternalLink,
    Play,
    CheckCircle2,
    AlertTriangle,
    Info,
    ChevronDown,
    ChevronUp,
} from '@tamagui/lucide-icons';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';
import { VeyraButton } from '../ui/VeyraButton';
import { VeyraIconButton } from '../ui/VeyraIconButton';
import { NotificationService } from '../../services/notificationService';
import { Reminder } from '../../types/db';

interface AlarmPermissionsModalProps {
    visible: boolean;
    onClose: () => void;
}

export const AlarmPermissionsModal: React.FC<AlarmPermissionsModalProps> = ({
    visible,
    onClose,
}) => {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { isDark, colors, accent, typography, radii } = useVeyraTheme();
    const [testTriggered, setTestTriggered] = useState(false);
    const [diagnostics, setDiagnostics] = useState<any>(null);
    const [showManufacturerHelp, setShowManufacturerHelp] = useState(false);

    useEffect(() => {
        if (visible) {
            NotificationService.getDiagnosticInfo().then(data => {
                setDiagnostics(data);
                console.log('[AlarmPermissionsModal] Diagnóstico:', data);
            });
        }
    }, [visible]);

    const manufacturer = (Device.manufacturer || Device.brand || '').toLowerCase();
    const isXiaomi = manufacturer.includes('xiaomi') || manufacturer.includes('redmi') || manufacturer.includes('poco');
    const isSamsung = manufacturer.includes('samsung');

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

    const openFullScreenSettings = async () => {
        if (Platform.OS === 'android') {
            try {
                await IntentLauncher.startActivityAsync('android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT', {
                    data: `package:${Application.applicationId}`,
                });
            } catch (e) {
                openAppSettings();
            }
        }
    };

    const openBatteryOptimizationSettings = async () => {
        if (Platform.OS === 'android') {
            try {
                await IntentLauncher.startActivityAsync('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', {
                    data: `package:${Application.applicationId}`,
                });
            } catch (e) {
                try {
                    await IntentLauncher.startActivityAsync('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
                } catch (err) {
                    openAppSettings();
                }
            }
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

    const handleTestAlarm = async () => {
        try {
            const testReminder: Reminder = {
                id: `test_${Date.now()}`,
                title: '⚡ Alarma Crítica de Prueba',
                description: '¡Éxito! Veyra encendió la pantalla y sonó con máxima prioridad.',
                due_date_ms: Date.now() + 5000,
                control_level: 'critical',
                status: 'pending',
                created_at_ms: Date.now(),
                updated_at_ms: Date.now(),
            };

            await NotificationService.scheduleReminderNotification(testReminder);
            setTestTriggered(true);

            Alert.alert(
                '🧪 ' + t('settings.alarm_permissions_modal.test_title'),
                t('settings.alarm_permissions_modal.test_scheduled'),
                [{ text: 'OK', style: 'default' }]
            );

            setTimeout(() => setTestTriggered(false), 8000);
        } catch (error) {
            console.error('[AlarmPermissionsModal] Test alarm failed:', error);
            Alert.alert('Error', 'No se pudo programar la alarma de prueba.');
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View style={[styles.backdrop, { backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.55)' }]}>
                <View
                    style={[
                        styles.container,
                        {
                            backgroundColor: colors.bg,
                            paddingBottom: Math.max(insets.bottom, 20),
                            borderTopLeftRadius: radii.xl,
                            borderTopRightRadius: radii.xl,
                        },
                    ]}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View
                                style={[
                                    styles.iconBadge,
                                    { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)' },
                                ]}
                            >
                                <ShieldAlert size={24} color="#EF4444" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.modalTitle, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                                    {t('settings.alarm_permissions_modal.title')}
                                </Text>
                                <Text style={[styles.modalSubtitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                    {t('settings.alarm_permissions_modal.subtitle')}
                                </Text>
                            </View>
                        </View>
                        <VeyraIconButton
                            variant="ghost"
                            size="sm"
                            icon={<X size={20} color={colors.textSecondary} />}
                            onPress={onClose}
                        />
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                    >
                        {/* Diagnóstico en tiempo real */}
                        {diagnostics && (
                            <VeyraSurface
                                level={2}
                                radius="md"
                                style={[
                                    styles.diagCard,
                                    { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                                ]}
                            >
                                <View style={styles.diagHeader}>
                                    <Clock size={16} color={accent.primary} />
                                    <Text style={[styles.diagTitle, { color: colors.textPrimary, fontSize: 11 }]}>
                                        {t('settings.alarm_permissions_modal.diagnostic_title')}
                                    </Text>
                                </View>
                                <View style={{ gap: 6, marginTop: 6 }}>
                                    <View style={styles.diagRow}>
                                        {diagnostics.permissionsGranted ? (
                                            <CheckCircle2 size={15} color="#10B981" />
                                        ) : (
                                            <AlertTriangle size={15} color="#EF4444" />
                                        )}
                                        <Text style={[styles.diagText, { color: colors.textSecondary }]}>
                                            {diagnostics.permissionsGranted
                                                ? t('settings.alarm_permissions_modal.diagnostic_perm_granted')
                                                : t('settings.alarm_permissions_modal.diagnostic_perm_denied')}
                                        </Text>
                                    </View>
                                    <View style={styles.diagRow}>
                                        <CheckCircle2 size={15} color="#10B981" />
                                        <Text style={[styles.diagText, { color: colors.textSecondary }]}>
                                            {t('settings.alarm_permissions_modal.diagnostic_channels_active')}
                                        </Text>
                                    </View>
                                    <View style={styles.diagRow}>
                                        <Clock size={15} color={accent.primary} />
                                        <Text style={[styles.diagText, { color: colors.textSecondary }]}>
                                            {t('settings.alarm_permissions_modal.diagnostic_alarms_count', {
                                                count: diagnostics.scheduledCount,
                                            })}
                                        </Text>
                                    </View>
                                </View>
                            </VeyraSurface>
                        )}

                        {/* PASO 1: Pantalla completa y bloqueo */}
                        <VeyraSurface level={1} radius="md" style={styles.card}>
                            <View style={styles.cardTopRow}>
                                <View style={[styles.stepBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)' }]}>
                                    <Text style={[styles.stepBadgeText, { color: '#3B82F6' }]}>
                                        {t('settings.alarm_permissions_modal.step1_badge')}
                                    </Text>
                                </View>
                                <Maximize2 size={18} color="#3B82F6" />
                            </View>

                            <Text style={[styles.cardTitle, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                                {t('settings.alarm_permissions_modal.fullscreen_title')}
                            </Text>
                            <Text style={[styles.cardDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                {t('settings.alarm_permissions_modal.fullscreen_desc')}
                            </Text>

                            {/* Información detallada de la acción */}
                            <View style={[styles.actionInfoBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }]}>
                                <Info size={14} color={accent.primary} style={{ marginTop: 2 }} />
                                <Text style={[styles.actionInfoText, { color: colors.textSecondary }]}>
                                    {t('settings.alarm_permissions_modal.fullscreen_action_info')}
                                </Text>
                            </View>

                            <VeyraButton
                                title={t('settings.alarm_permissions_modal.fullscreen_btn')}
                                variant="secondary"
                                size="md"
                                rightIcon={<ExternalLink size={14} color={colors.textPrimary} />}
                                onPress={openFullScreenSettings}
                                style={styles.cardBtn}
                            />
                            <Text style={[styles.destinationHint, { color: colors.textMuted }]}>
                                ↗ {t('settings.alarm_permissions_modal.fullscreen_destination')}
                            </Text>
                        </VeyraSurface>

                        {/* PASO 2: Batería sin restricciones */}
                        <VeyraSurface level={1} radius="md" style={styles.card}>
                            <View style={styles.cardTopRow}>
                                <View style={[styles.stepBadge, { backgroundColor: isDark ? 'rgba(249, 115, 22, 0.2)' : 'rgba(249, 115, 22, 0.1)' }]}>
                                    <Text style={[styles.stepBadgeText, { color: '#F97316' }]}>
                                        {t('settings.alarm_permissions_modal.step2_badge')}
                                    </Text>
                                </View>
                                <Battery size={18} color="#F97316" />
                            </View>

                            <Text style={[styles.cardTitle, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                                {t('settings.alarm_permissions_modal.battery_title')}
                            </Text>
                            <Text style={[styles.cardDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                {t('settings.alarm_permissions_modal.battery_desc')}
                            </Text>

                            {/* Información detallada de la acción */}
                            <View style={[styles.actionInfoBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }]}>
                                <Info size={14} color="#F97316" style={{ marginTop: 2 }} />
                                <Text style={[styles.actionInfoText, { color: colors.textSecondary }]}>
                                    {t('settings.alarm_permissions_modal.battery_action_info')}
                                </Text>
                            </View>

                            <VeyraButton
                                title={t('settings.alarm_permissions_modal.battery_btn')}
                                variant="secondary"
                                size="md"
                                rightIcon={<ExternalLink size={14} color={colors.textPrimary} />}
                                onPress={openBatteryOptimizationSettings}
                                style={styles.cardBtn}
                            />
                            <Text style={[styles.destinationHint, { color: colors.textMuted }]}>
                                ↗ {t('settings.alarm_permissions_modal.battery_destination')}
                            </Text>
                        </VeyraSurface>

                        {/* PASO 3: Alarmas exactas */}
                        <VeyraSurface level={1} radius="md" style={styles.card}>
                            <View style={styles.cardTopRow}>
                                <View style={[styles.stepBadge, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)' }]}>
                                    <Text style={[styles.stepBadgeText, { color: '#8B5CF6' }]}>
                                        {t('settings.alarm_permissions_modal.step3_badge')}
                                    </Text>
                                </View>
                                <Clock size={18} color="#8B5CF6" />
                            </View>

                            <Text style={[styles.cardTitle, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                                {t('settings.alarm_permissions_modal.exact_title')}
                            </Text>
                            <Text style={[styles.cardDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                {t('settings.alarm_permissions_modal.exact_desc')}
                            </Text>

                            {/* Información detallada de la acción */}
                            <View style={[styles.actionInfoBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }]}>
                                <Info size={14} color="#8B5CF6" style={{ marginTop: 2 }} />
                                <Text style={[styles.actionInfoText, { color: colors.textSecondary }]}>
                                    {t('settings.alarm_permissions_modal.exact_action_info')}
                                </Text>
                            </View>

                            <VeyraButton
                                title={t('settings.alarm_permissions_modal.exact_btn')}
                                variant="secondary"
                                size="md"
                                rightIcon={<ExternalLink size={14} color={colors.textPrimary} />}
                                onPress={openExactAlarmSettings}
                                style={styles.cardBtn}
                            />
                            <Text style={[styles.destinationHint, { color: colors.textMuted }]}>
                                ↗ {t('settings.alarm_permissions_modal.exact_destination')}
                            </Text>
                        </VeyraSurface>

                        {/* PASO 4: Fabricante específico o General */}
                        {isXiaomi ? (
                            <VeyraSurface
                                level={1}
                                radius="md"
                                style={[
                                    styles.card,
                                    {
                                        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.06)' : 'rgba(239, 68, 68, 0.03)',
                                        borderColor: 'rgba(239, 68, 68, 0.3)',
                                    },
                                ]}
                            >
                                <View style={styles.cardTopRow}>
                                    <View style={[styles.stepBadge, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                                        <Text style={[styles.stepBadgeText, { color: '#EF4444' }]}>
                                            {t('settings.alarm_permissions_modal.step4_badge')} (XIAOMI)
                                        </Text>
                                    </View>
                                    <Smartphone size={18} color="#EF4444" />
                                </View>

                                <Text style={[styles.cardTitle, { color: '#EF4444', fontSize: typography.body.fontSize, fontWeight: '700' }]}>
                                    {t('settings.alarm_permissions_modal.manufacturer_xiaomi_title')}
                                </Text>
                                <Text style={[styles.cardDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                    {t('settings.alarm_permissions_modal.manufacturer_xiaomi_desc')}
                                </Text>

                                <View style={[styles.stepsBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)' }]}>
                                    <Text style={[styles.stepItem, { color: colors.textPrimary }]}>
                                        {t('settings.alarm_permissions_modal.manufacturer_xiaomi_step1')}
                                    </Text>
                                    <Text style={[styles.stepItem, { color: colors.textPrimary }]}>
                                        {t('settings.alarm_permissions_modal.manufacturer_xiaomi_step2')}
                                    </Text>
                                    <Text style={[styles.stepItem, { color: colors.textPrimary }]}>
                                        {t('settings.alarm_permissions_modal.manufacturer_xiaomi_step3')}
                                    </Text>
                                </View>

                                <VeyraButton
                                    title={t('settings.alarm_permissions_modal.manufacturer_xiaomi_btn')}
                                    variant="secondary"
                                    size="md"
                                    rightIcon={<ExternalLink size={14} color={colors.textPrimary} />}
                                    onPress={openAppSettings}
                                    style={styles.cardBtn}
                                />
                                <Text style={[styles.destinationHint, { color: colors.textMuted }]}>
                                    ↗ {t('settings.alarm_permissions_modal.open_app_settings_destination')}
                                </Text>
                            </VeyraSurface>
                        ) : isSamsung ? (
                            <VeyraSurface
                                level={1}
                                radius="md"
                                style={[
                                    styles.card,
                                    {
                                        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.06)' : 'rgba(59, 130, 246, 0.03)',
                                        borderColor: 'rgba(59, 130, 246, 0.3)',
                                    },
                                ]}
                            >
                                <View style={styles.cardTopRow}>
                                    <View style={[styles.stepBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                                        <Text style={[styles.stepBadgeText, { color: '#3B82F6' }]}>
                                            {t('settings.alarm_permissions_modal.step4_badge')} (SAMSUNG)
                                        </Text>
                                    </View>
                                    <Smartphone size={18} color="#3B82F6" />
                                </View>

                                <Text style={[styles.cardTitle, { color: '#3B82F6', fontSize: typography.body.fontSize, fontWeight: '700' }]}>
                                    {t('settings.alarm_permissions_modal.manufacturer_samsung_title')}
                                </Text>
                                <Text style={[styles.cardDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                    {t('settings.alarm_permissions_modal.manufacturer_samsung_desc')}
                                </Text>

                                <View style={[styles.stepsBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)' }]}>
                                    <Text style={[styles.stepItem, { color: colors.textPrimary }]}>
                                        {t('settings.alarm_permissions_modal.manufacturer_samsung_step1')}
                                    </Text>
                                    <Text style={[styles.stepItem, { color: colors.textPrimary }]}>
                                        {t('settings.alarm_permissions_modal.manufacturer_samsung_step2')}
                                    </Text>
                                    <Text style={[styles.stepItem, { color: colors.textPrimary }]}>
                                        {t('settings.alarm_permissions_modal.manufacturer_samsung_step3')}
                                    </Text>
                                </View>

                                <VeyraButton
                                    title={t('settings.alarm_permissions_modal.manufacturer_samsung_btn')}
                                    variant="secondary"
                                    size="md"
                                    rightIcon={<ExternalLink size={14} color={colors.textPrimary} />}
                                    onPress={openAppSettings}
                                    style={styles.cardBtn}
                                />
                                <Text style={[styles.destinationHint, { color: colors.textMuted }]}>
                                    ↗ {t('settings.alarm_permissions_modal.open_app_settings_destination')}
                                </Text>
                            </VeyraSurface>
                        ) : (
                            <VeyraSurface level={1} radius="md" style={styles.card}>
                                <View style={styles.cardTopRow}>
                                    <View style={[styles.stepBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}>
                                        <Text style={[styles.stepBadgeText, { color: colors.textSecondary }]}>
                                            {t('settings.alarm_permissions_modal.step4_badge')} (AJUSTES GENERALES)
                                        </Text>
                                    </View>
                                    <Smartphone size={18} color={colors.textSecondary} />
                                </View>

                                <Text style={[styles.cardTitle, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                                    {t('settings.alarm_permissions_modal.manufacturer_general_title')}
                                </Text>
                                <Text style={[styles.cardDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                    {t('settings.alarm_permissions_modal.manufacturer_general_desc')}
                                </Text>

                                <VeyraButton
                                    title={t('settings.alarm_permissions_modal.open_app_settings')}
                                    variant="secondary"
                                    size="md"
                                    rightIcon={<ExternalLink size={14} color={colors.textPrimary} />}
                                    onPress={openAppSettings}
                                    style={styles.cardBtn}
                                />
                                <Text style={[styles.destinationHint, { color: colors.textMuted }]}>
                                    ↗ {t('settings.alarm_permissions_modal.open_app_settings_destination')}
                                </Text>
                            </VeyraSurface>
                        )}

                        {/* PASO 5: Prueba Rápida en 5 segundos */}
                        <VeyraSurface
                            level={1}
                            radius="md"
                            style={[
                                styles.card,
                                {
                                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.04)',
                                    borderColor: 'rgba(16, 185, 129, 0.35)',
                                    borderWidth: 1.5,
                                },
                            ]}
                        >
                            <View style={styles.cardTopRow}>
                                <View style={[styles.stepBadge, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                                    <Text style={[styles.stepBadgeText, { color: '#10B981' }]}>
                                        {t('settings.alarm_permissions_modal.step5_badge')}
                                    </Text>
                                </View>
                                <Play size={18} color="#10B981" />
                            </View>

                            <Text style={[styles.cardTitle, { color: isDark ? '#34D399' : '#059669', fontSize: typography.body.fontSize, fontWeight: '700' }]}>
                                {t('settings.alarm_permissions_modal.test_title')}
                            </Text>
                            <Text style={[styles.cardDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                {t('settings.alarm_permissions_modal.test_desc')}
                            </Text>

                            <View style={[styles.instructionsBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.8)' }]}>
                                <Text style={[styles.instructionText, { color: colors.textPrimary }]}>
                                    {t('settings.alarm_permissions_modal.test_instructions')}
                                </Text>
                            </View>

                            <VeyraButton
                                title={testTriggered ? 'Esperando 5s... ¡Bloquea tu pantalla!' : t('settings.alarm_permissions_modal.test_btn')}
                                variant="primary"
                                size="md"
                                leftIcon={<Play size={16} color="#FFFFFF" />}
                                onPress={handleTestAlarm}
                                disabled={testTriggered}
                                style={styles.cardBtn}
                            />
                        </VeyraSurface>

                        {/* Botón de Cierre */}
                        <VeyraButton
                            title={t('settings.alarm_permissions_modal.close')}
                            variant="secondary"
                            size="md"
                            onPress={onClose}
                            style={{ marginTop: 8 }}
                        />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    container: {
        maxHeight: '92%',
        paddingTop: 18,
        paddingHorizontal: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(150, 150, 150, 0.2)',
    },
    iconBadge: {
        width: 42,
        height: 42,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    modalSubtitle: {
        marginTop: 2,
        lineHeight: 16,
    },
    scrollContent: {
        paddingTop: 16,
        paddingBottom: 24,
        gap: 14,
    },
    diagCard: {
        padding: 14,
        borderWidth: 1,
    },
    diagHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    diagTitle: {
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    diagRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    diagText: {
        fontSize: 13,
        fontWeight: '500',
    },
    card: {
        padding: 16,
        gap: 8,
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    stepBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    stepBadgeText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    cardTitle: {
        fontWeight: '700',
        letterSpacing: -0.3,
        marginTop: 2,
    },
    cardDesc: {
        lineHeight: 18,
    },
    actionInfoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        padding: 10,
        borderRadius: 10,
        marginVertical: 4,
    },
    actionInfoText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 17,
        fontWeight: '500',
    },
    stepsBox: {
        padding: 10,
        borderRadius: 10,
        gap: 6,
        marginVertical: 4,
    },
    stepItem: {
        fontSize: 12,
        lineHeight: 17,
        fontWeight: '600',
    },
    instructionsBox: {
        padding: 12,
        borderRadius: 10,
        marginVertical: 4,
    },
    instructionText: {
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '600',
    },
    cardBtn: {
        marginTop: 6,
    },
    destinationHint: {
        fontSize: 11,
        marginTop: 2,
        fontWeight: '500',
    },
});
