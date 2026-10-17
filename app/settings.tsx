import React, { useState, useEffect } from 'react';
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
    Modal,
    Vibration,
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
    AlertOctagon,
    ChevronRight,
    Cloud,
    RefreshCw,
    Check,
    ChevronLeft,
    Sparkles,
    ShieldAlert,
    Shield,
    Smartphone,
    FileText,
    Layers,
    GraduationCap,
    Eye,
    Folder,
    Vibrate,
    Plus,
    X,
    SlidersHorizontal,
} from '@tamagui/lucide-icons';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

import { useStore } from '../src/store/useStore';
import { getSoundName } from '../src/constants/sounds';
import { ACCENT_OPTIONS } from '../src/theme/accentColors';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { AlarmPermissionsModal } from '../src/components/settings/AlarmPermissionsModal';
import { WidgetService } from '../src/services/widgetService';
import { useNotesStore } from '../src/store/useNotesStore';
import { useFoldersStore } from '../src/store/useFoldersStore';

export default function SettingsScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [showAlarmPermissionsModal, setShowAlarmPermissionsModal] = useState(false);
    const [showAddWidgetModal, setShowAddWidgetModal] = useState(false);
    const notes = useNotesStore(state => state.notes);
    const folders = useFoldersStore(state => state.folders);
    const [notesWidgetFilter, setNotesWidgetFilterState] = useState<{ mode: string; folderId?: string; noteId?: string }>({ mode: 'all' });

    useEffect(() => {
        if (Platform.OS === 'android') {
            WidgetService.getNotesWidgetFilter().then(f => {
                if (f) setNotesWidgetFilterState(f);
            }).catch(() => {});
        }
    }, []);

    const {
        theme,
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
        triggerSync,
        session,
        accentTheme,
        setAccentTheme,
        widgetTextScale,
        setWidgetTextScale,
        widgetHighContrast,
        setWidgetHighContrast,
        vibrationEnabled,
        setVibrationEnabled,
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
        { value: 'normal', label: t('settings.normal', 'Normal'), color: isDark ? '#34D399' : '#059669', badgeBg: isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(5, 150, 105, 0.10)' },
        { value: 'strict', label: t('settings.strict', 'Estricto'), color: isDark ? '#FBBF24' : '#F59E0B', badgeBg: isDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(245, 158, 11, 0.10)' },
        { value: 'critical', label: t('settings.critical', 'Crítico'), color: isDark ? '#FB7185' : '#E11D48', badgeBg: isDark ? 'rgba(251, 113, 133, 0.15)' : 'rgba(225, 29, 72, 0.10)' },
    ];

    const WIDGET_OPTIONS = [
        {
            key: 'today',
            title: language === 'es' ? 'Widget "Hoy"' : '"Today" Widget',
            subtitle: language === 'es' ? 'Agenda, tareas urgentes y eventos próximos' : 'Agenda, urgent tasks & next events',
            icon: Sparkles,
            color: accent.primary,
            action: WidgetService.requestPin,
        },
        {
            key: 'notes',
            title: language === 'es' ? 'Widget "Notas"' : '"Notes" Widget',
            subtitle: language === 'es' ? 'Acceso rápido y notas fijadas' : 'Quick access & pinned notes',
            icon: FileText,
            color: '#8B5CF6',
            action: WidgetService.requestPinNotes,
        },
        {
            key: 'combo',
            title: language === 'es' ? 'Widget "Agenda & Notas"' : '"Agenda & Notes" Widget',
            subtitle: language === 'es' ? 'Dúo interactivo con pestañas' : 'Tabbed interactive duo',
            icon: Layers,
            color: '#EC4899',
            action: WidgetService.requestPinCombo,
        },
        {
            key: 'quick',
            title: language === 'es' ? 'Widget "Acciones Rápidas"' : '"Quick Actions" Widget',
            subtitle: language === 'es' ? 'Crear tarea, nota o evento en 1 toque' : 'Create task, note or event in 1 tap',
            icon: Zap,
            color: '#F59E0B',
            action: WidgetService.requestPinQuick,
        },
        {
            key: 'schedule',
            title: language === 'es' ? 'Widget "Horario de Clases"' : '"Class Schedule" Widget',
            subtitle: language === 'es' ? 'Clases y materias programadas del día' : "Today's scheduled classes",
            icon: GraduationCap,
            color: '#3B82F6',
            action: WidgetService.requestPinSchedule,
        },
    ];

    const handleAddWidget = async (widget: typeof WIDGET_OPTIONS[0]) => {
        setShowAddWidgetModal(false);
        const success = await widget.action();
        if (success) {
            Alert.alert(
                widget.title,
                language === 'es'
                    ? 'Sigue las instrucciones del sistema en tu pantalla para anclar el widget.'
                    : 'Follow the system prompt to place the widget on your home screen.'
            );
        } else {
            Alert.alert(
                widget.title,
                language === 'es'
                    ? 'Puedes añadirlo manteniendo pulsada la pantalla de inicio y buscando Veyra.'
                    : 'You can add it by long-pressing your home screen and searching for Veyra.'
            );
        }
    };

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'right', 'left']}>
            {/* Header de navegación */}
            <View style={styles.navHeader}>
                <VeyraIconButton
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={22} color={colors.textPrimary} />}
                    onPress={() => router.back()}
                />
                <Text style={[styles.navHeaderTitle, { color: colors.textPrimary }]}>
                    {t('settings.title', 'Ajustes')}
                </Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 48 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Visual Hero Title */}
                <View style={styles.heroSection}>
                    <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                        {t('settings.title', 'Ajustes')}
                    </Text>
                    <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                        {language === 'es'
                            ? 'Personaliza tus alertas, vibración, tema y widgets'
                            : 'Customize alerts, vibration, theme & widgets'}
                    </Text>
                </View>

                {/* Garantía de Alarma y Pantalla de Bloqueo (Android) */}
                {Platform.OS === 'android' && (
                    <TouchableOpacity
                        onPress={() => setShowAlarmPermissionsModal(true)}
                        activeOpacity={0.8}
                        style={[
                            styles.warrantyBanner,
                            {
                                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)',
                                borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.20)',
                            },
                        ]}
                    >
                        <View style={[styles.warrantyIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                            <ShieldAlert size={20} color="#EF4444" strokeWidth={2.4} />
                        </View>
                        <View style={styles.warrantyTextCol}>
                            <View style={styles.warrantyTitleRow}>
                                <Text style={[styles.warrantyTitle, { color: isDark ? '#F87171' : '#DC2626' }]}>
                                    {t('settings.alarm_warranty', 'Garantía de Alarma')}
                                </Text>
                                <View style={styles.warrantyLiveBadge}>
                                    <Text style={styles.warrantyLiveText}>
                                        {language === 'es' ? 'IMPORTANTE' : 'IMPORTANT'}
                                    </Text>
                                </View>
                            </View>
                            <Text style={[styles.warrantyDesc, { color: colors.textSecondary }]}>
                                {t('settings.alarm_warranty_desc', 'Verifica permisos para que ninguna alarma se detenga sobre la pantalla de bloqueo')}
                            </Text>
                        </View>
                        <ChevronRight size={18} color={isDark ? '#F87171' : '#DC2626'} />
                    </TouchableOpacity>
                )}

                {/* ══════════ SECCIÓN 1: NOTIFICACIONES Y ALERTAS ══════════ */}
                <View style={styles.sectionHeaderWrap}>
                    <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                        {t('settings.notifications', 'Notificaciones y Alertas').toUpperCase()}
                    </Text>
                </View>

                <View style={[styles.groupCard, {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                }]}>
                    {/* Switch Notificaciones del Sistema */}
                    <ModernSettingsRow
                        icon={Bell}
                        iconColor="#3B82F6"
                        iconBg={isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.10)'}
                        title={t('settings.notifications_label', 'Notificaciones')}
                        description={language === 'es' ? 'Avisos en la barra de estado y pantalla' : 'Status bar & lock screen alerts'}
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
                            <RowDivider />
                            {/* Switch Sonido de Alerta */}
                            <ModernSettingsRow
                                icon={Volume2}
                                iconColor="#8B5CF6"
                                iconBg={isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.10)'}
                                title={t('settings.sound', 'Sonidos de alerta')}
                                description={language === 'es' ? 'Reproducir tonos audibles' : 'Play audio ringtones'}
                                rightElement={
                                    <Switch
                                        value={soundEnabled}
                                        onValueChange={setSoundEnabled}
                                        trackColor={{ false: colors.surfaceElevated, true: accent.primary }}
                                        thumbColor="#FFFFFF"
                                    />
                                }
                            />

                            <RowDivider />
                            {/* Switch Vibración Táctil (Hardware) */}
                            <ModernSettingsRow
                                icon={Vibrate}
                                iconColor="#10B981"
                                iconBg={isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.10)'}
                                title={language === 'es' ? 'Vibración del teléfono' : 'Device vibration'}
                                description={language === 'es' ? 'Vibración física en recordatorios y pantalla completa' : 'Hardware haptic vibration on alerts'}
                                rightElement={
                                    <Switch
                                        value={vibrationEnabled ?? true}
                                        onValueChange={(val) => {
                                            setVibrationEnabled(val);
                                            if (val) {
                                                try { Vibration.vibrate(25); } catch (_) {}
                                            }
                                        }}
                                        trackColor={{ false: colors.surfaceElevated, true: accent.primary }}
                                        thumbColor="#FFFFFF"
                                    />
                                }
                            />
                        </>
                    )}

                    {/* Nivel de Control Predeterminado */}
                    <RowDivider />
                    <View style={styles.inlineSelectorRow}>
                        <View style={styles.inlineSelectorHeader}>
                            <View style={[styles.rowIconBadge, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.10)' }]}>
                                <SlidersHorizontal size={17} color="#F59E0B" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTitleText, { color: colors.textPrimary }]}>
                                    {t('settings.control_level', 'Nivel de control predeterminado')}
                                </Text>
                                <Text style={[styles.rowDescText, { color: colors.textMuted }]}>
                                    {language === 'es' ? 'Intensidad al crear nuevos recordatorios' : 'Default urgency for new tasks'}
                                </Text>
                            </View>
                        </View>

                        {/* Segmentos limpios de nivel */}
                        <View style={[styles.levelSegmentsWrap, { backgroundColor: colors.surfaceElevated }]}>
                            {controlLevels.map((lvl) => {
                                const isSelected = defaultControlLevel === lvl.value;
                                return (
                                    <TouchableOpacity
                                        key={lvl.value}
                                        onPress={() => setDefaultControlLevel(lvl.value as any)}
                                        activeOpacity={0.7}
                                        style={[
                                            styles.levelSegmentBtn,
                                            isSelected && {
                                                backgroundColor: isDark ? colors.surfaceCard : '#FFFFFF',
                                                borderColor: lvl.color,
                                                shadowColor: '#000000',
                                                shadowOpacity: 0.08,
                                                shadowRadius: 3,
                                                elevation: 2,
                                            },
                                        ]}
                                    >
                                        <View style={[styles.levelDot, { backgroundColor: lvl.color }]} />
                                        <Text
                                            style={[
                                                styles.levelSegmentLabel,
                                                {
                                                    color: isSelected ? colors.textPrimary : colors.textMuted,
                                                    fontWeight: isSelected ? '700' : '500',
                                                },
                                            ]}
                                        >
                                            {lvl.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* Tonos por Nivel */}
                    {notificationsEnabled && soundEnabled && (
                        <>
                            <RowDivider />
                            <ModernSettingsRow
                                icon={Bell}
                                iconColor="#10B981"
                                iconBg={isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.10)'}
                                title={language === 'es' ? 'Tono: Normal' : 'Ringtone: Normal'}
                                value={getSoundName(soundSettings.normal)}
                                isLink
                                onPress={() => router.push({ pathname: '/sounds', params: { level: 'normal' } })}
                            />
                            <RowDivider />
                            <ModernSettingsRow
                                icon={Zap}
                                iconColor="#F59E0B"
                                iconBg={isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.10)'}
                                title={language === 'es' ? 'Tono: Estricto' : 'Ringtone: Strict'}
                                value={getSoundName(soundSettings.strict)}
                                isLink
                                onPress={() => router.push({ pathname: '/sounds', params: { level: 'strict' } })}
                            />
                            <RowDivider />
                            <ModernSettingsRow
                                icon={AlertOctagon}
                                iconColor="#E11D48"
                                iconBg={isDark ? 'rgba(225, 29, 72, 0.15)' : 'rgba(225, 29, 72, 0.10)'}
                                title={language === 'es' ? 'Tono: Crítico' : 'Ringtone: Critical'}
                                value={getSoundName(soundSettings.critical)}
                                isLink
                                onPress={() => router.push({ pathname: '/sounds', params: { level: 'critical' } })}
                            />
                        </>
                    )}
                </View>

                {/* ══════════ SECCIÓN 2: APARIENCIA Y PERSONALIZACIÓN ══════════ */}
                <View style={styles.sectionHeaderWrap}>
                    <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                        {t('settings.general', 'Apariencia').toUpperCase()}
                    </Text>
                </View>

                <View style={[styles.groupCard, {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                }]}>
                    {/* Selector de Tema */}
                    <View style={styles.themeRowWrap}>
                        <View style={styles.themeRowHeader}>
                            <View style={[styles.rowIconBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.10)' }]}>
                                {theme === 'system' ? (
                                    <Smartphone size={17} color="#3B82F6" />
                                ) : isDark ? (
                                    <Moon size={17} color="#A78BFA" />
                                ) : (
                                    <Sun size={17} color="#F59E0B" />
                                )}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTitleText, { color: colors.textPrimary }]}>
                                    {t('settings.theme', 'Tema de la App')}
                                </Text>
                                <Text style={[styles.rowDescText, { color: colors.textMuted }]}>
                                    {theme === 'system'
                                        ? `${t('settings.theme_system', 'Sistema')} (${isDark ? t('settings.theme_dark', 'Oscuro') : t('settings.theme_light', 'Claro')})`
                                        : theme === 'dark'
                                        ? t('settings.theme_dark', 'Oscuro')
                                        : t('settings.theme_light', 'Claro')}
                                </Text>
                            </View>
                        </View>

                        {/* Segmented Control */}
                        <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceElevated }]}>
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
                                        style={[
                                            styles.segmentButton,
                                            isSelected && {
                                                backgroundColor: isDark ? colors.surfaceCard : '#FFFFFF',
                                                shadowColor: '#000000',
                                                shadowOpacity: 0.08,
                                                shadowRadius: 3,
                                                elevation: 2,
                                            },
                                        ]}
                                    >
                                        <ItemIcon size={14} color={isSelected ? accent.primary : colors.textMuted} />
                                        <Text style={[
                                            styles.segmentText,
                                            {
                                                fontWeight: isSelected ? '700' : '500',
                                                color: isSelected ? colors.textPrimary : colors.textMuted,
                                            },
                                        ]}>
                                            {item.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    <RowDivider />
                    {/* Selector de Acento */}
                    <View style={styles.accentRowWrap}>
                        <View style={styles.accentRowHeader}>
                            <View style={[styles.rowIconBadge, { backgroundColor: isDark ? 'rgba(236, 72, 153, 0.15)' : 'rgba(236, 72, 153, 0.10)' }]}>
                                <Sparkles size={17} color="#EC4899" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTitleText, { color: colors.textPrimary }]}>
                                    {t('settings.accent_theme', 'Paleta de Acento')}
                                </Text>
                                <Text style={[styles.rowDescText, { color: colors.textMuted }]}>
                                    {t(`settings.accent_${accentTheme}`, accentTheme)}
                                </Text>
                            </View>
                        </View>

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
                                                    fontSize: 10,
                                                },
                                            ]}
                                        >
                                            {t(`settings.accent_${option.key}`)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    <RowDivider />
                    {/* Idioma */}
                    <ModernSettingsRow
                        icon={Globe}
                        iconColor="#10B981"
                        iconBg={isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.10)'}
                        title={t('settings.language', 'Idioma')}
                        value={language === 'es' ? t('settings.spanish', 'Español') : t('settings.english', 'Inglés')}
                        isLink
                        onPress={() => setLanguage(language === 'es' ? 'en' : 'es')}
                    />

                    <RowDivider />
                    {/* Formato de Hora */}
                    <ModernSettingsRow
                        icon={Clock}
                        iconColor="#3B82F6"
                        iconBg={isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.10)'}
                        title={t('settings.time_format_label', 'Formato de hora')}
                        value={t('settings.hours_format', '24 horas')}
                    />
                </View>

                {/* ══════════ SECCIÓN 3: WIDGETS DE INICIO (ANDROID) ══════════ */}
                {Platform.OS === 'android' && (
                    <>
                        <View style={styles.sectionHeaderWrap}>
                            <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                                {language === 'es' ? 'WIDGETS DE INICIO' : 'HOME WIDGETS'}
                            </Text>
                        </View>

                        <View style={[styles.groupCard, {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                        }]}>
                            {/* Fila Única: Añadir Widget al Launcher */}
                            <ModernSettingsRow
                                icon={Plus}
                                iconColor={accent.primary}
                                iconBg={isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.10)'}
                                title={language === 'es' ? 'Añadir widget a la pantalla' : 'Add widget to home screen'}
                                description={language === 'es' ? 'Elige entre Hoy, Notas, Dúo, Acciones o Clases' : 'Choose from Today, Notes, Duo, Quick or Classes'}
                                isLink
                                onPress={() => setShowAddWidgetModal(true)}
                            />

                            <RowDivider />
                            {/* Filtro del widget de Notas */}
                            <ModernSettingsRow
                                icon={Folder}
                                iconColor="#8B5CF6"
                                iconBg={isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.10)'}
                                title={language === 'es' ? 'Filtro del widget de Notas' : 'Notes widget filter'}
                                value={
                                    notesWidgetFilter.mode === 'pinned'
                                        ? (language === 'es' ? 'Solo fijadas' : 'Pinned only')
                                        : notesWidgetFilter.mode === 'folder'
                                        ? (folders.find(f => f.id === notesWidgetFilter.folderId)?.name || (language === 'es' ? 'Carpeta' : 'Folder'))
                                        : notesWidgetFilter.mode === 'note'
                                        ? (notes.find(n => n.id === notesWidgetFilter.noteId)?.title || (language === 'es' ? 'Nota' : 'Note'))
                                        : (language === 'es' ? 'Todas' : 'All')
                                }
                                isLink
                                onPress={() => {
                                    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'default' | 'destructive' }[] = [
                                        {
                                            text: language === 'es' ? 'Todas las notas' : 'All notes',
                                            onPress: async () => {
                                                await WidgetService.setNotesWidgetFilter({ mode: 'all' });
                                                setNotesWidgetFilterState({ mode: 'all' });
                                            }
                                        },
                                        {
                                            text: language === 'es' ? 'Solo notas fijadas' : 'Pinned notes only',
                                            onPress: async () => {
                                                await WidgetService.setNotesWidgetFilter({ mode: 'pinned' });
                                                setNotesWidgetFilterState({ mode: 'pinned' });
                                            }
                                        }
                                    ];

                                    if (folders.length > 0) {
                                        folders.forEach(f => {
                                            options.push({
                                                text: `${language === 'es' ? 'Carpeta:' : 'Folder:'} ${f.name}`,
                                                onPress: async () => {
                                                    await WidgetService.setNotesWidgetFilter({ mode: 'folder', folderId: f.id });
                                                    setNotesWidgetFilterState({ mode: 'folder', folderId: f.id });
                                                }
                                            });
                                        });
                                    }

                                    const topNotes = notes.filter(n => n.is_pinned).slice(0, 5);
                                    if (topNotes.length > 0) {
                                        topNotes.forEach(n => {
                                            options.push({
                                                text: `${language === 'es' ? 'Nota única:' : 'Single note:'} ${n.title || (language === 'es' ? 'Sin título' : 'Untitled')}`,
                                                onPress: async () => {
                                                    await WidgetService.setNotesWidgetFilter({ mode: 'note', noteId: n.id });
                                                    setNotesWidgetFilterState({ mode: 'note', noteId: n.id });
                                                }
                                            });
                                        });
                                    }

                                    options.push({
                                        text: language === 'es' ? 'Cancelar' : 'Cancel',
                                        style: 'cancel'
                                    });

                                    Alert.alert(
                                        language === 'es' ? 'Filtro para el Widget de Notas' : 'Notes Widget Filter',
                                        language === 'es'
                                            ? 'Selecciona qué notas deseas visualizar en el widget del launcher:'
                                            : 'Select which notes to display on your launcher widget:',
                                        options
                                    );
                                }}
                            />

                            <RowDivider />
                            {/* Selector de escala de texto en widgets */}
                            <View style={styles.inlineSelectorRow}>
                                <View style={styles.inlineSelectorHeader}>
                                    <View style={[styles.rowIconBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.10)' }]}>
                                        <Eye size={17} color={accent.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.rowTitleText, { color: colors.textPrimary }]}>
                                            {t('settings.widgets_text_size', 'Escala de texto en widgets')}
                                        </Text>
                                        <Text style={[styles.rowDescText, { color: colors.textMuted }]}>
                                            {t('settings.widgets_text_size_desc', 'Ajusta el tamaño en todos los widgets del launcher')}
                                        </Text>
                                    </View>
                                </View>

                                <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceElevated, marginTop: 8 }]}>
                                    {TEXT_SCALE_OPTIONS.map((opt) => {
                                        const isSelected = Math.abs((widgetTextScale ?? 1.0) - opt.scale) < 0.05;
                                        return (
                                            <TouchableOpacity
                                                key={opt.key}
                                                activeOpacity={0.7}
                                                onPress={() => setWidgetTextScale(opt.scale)}
                                                style={[
                                                    styles.segmentButton,
                                                    isSelected && {
                                                        backgroundColor: isDark ? colors.surfaceCard : '#FFFFFF',
                                                        shadowColor: '#000000',
                                                        shadowOpacity: 0.08,
                                                        shadowRadius: 3,
                                                        elevation: 2,
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.segmentText,
                                                        {
                                                            color: isSelected ? colors.textPrimary : colors.textMuted,
                                                            fontWeight: isSelected ? '700' : '500',
                                                        },
                                                    ]}
                                                >
                                                    {opt.pct}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <RowDivider />
                            {/* Switch Alto Contraste en Widgets */}
                            <ModernSettingsRow
                                icon={SlidersHorizontal}
                                iconColor="#F59E0B"
                                iconBg={isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.10)'}
                                title={t('settings.widgets_high_contrast', 'Modo Alto Contraste')}
                                description={t('settings.widgets_high_contrast_desc', 'Fondos puros y contornos reforzados para máxima legibilidad')}
                                rightElement={
                                    <Switch
                                        value={widgetHighContrast ?? false}
                                        onValueChange={setWidgetHighContrast}
                                        trackColor={{ false: colors.surfaceElevated, true: accent.primary }}
                                        thumbColor="#FFFFFF"
                                    />
                                }
                            />

                            <RowDivider />
                            {/* Sincronizar Widgets Ahora */}
                            <ModernSettingsRow
                                icon={RefreshCw}
                                iconColor="#10B981"
                                iconBg={isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.10)'}
                                title={language === 'es' ? 'Sincronizar widgets ahora' : 'Sync widgets now'}
                                description={language === 'es' ? 'Fuerza la actualización de datos en el sistema' : 'Force launcher widget cache refresh'}
                                onPress={async () => {
                                    const success = await WidgetService.syncAll();
                                    if (success) {
                                        Alert.alert(
                                            language === 'es' ? 'Widgets actualizados' : 'Widgets updated',
                                            language === 'es'
                                                ? 'La agenda, las notas y las carpetas de los widgets se han sincronizado con éxito.'
                                                : 'Widget agenda, notes, and folders have been synced successfully.'
                                        );
                                    }
                                }}
                            />
                        </View>
                    </>
                )}

                {/* ══════════ SECCIÓN 4: SINCRONIZACIÓN EN LA NUBE ══════════ */}
                {session && (
                    <>
                        <View style={styles.sectionHeaderWrap}>
                            <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                                {t('settings.cloud_sync', 'NUBE Y CUENTA').toUpperCase()}
                            </Text>
                        </View>

                        <View style={[styles.groupCard, {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                        }]}>
                            <ModernSettingsRow
                                icon={Cloud}
                                iconColor="#0EA5E9"
                                iconBg={isDark ? 'rgba(14, 165, 233, 0.15)' : 'rgba(14, 165, 233, 0.10)'}
                                title={t('settings.cloud_sync_toggle', 'Sincronización automática')}
                                description={language === 'es' ? 'Copia de seguridad en tiempo real' : 'Real-time cloud backup'}
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
                                    <RowDivider />
                                    <ModernSettingsRow
                                        icon={RefreshCw}
                                        iconColor={isSyncing ? colors.textMuted : '#10B981'}
                                        iconBg={isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.10)'}
                                        title={t('settings.sync_now', 'Sincronizar ahora')}
                                        value={
                                            isSyncing
                                                ? t('settings.syncing', 'Sincronizando...')
                                                : lastSyncTime
                                                ? new Date(lastSyncTime).toLocaleTimeString()
                                                : t('settings.never', 'Nunca')
                                        }
                                        onPress={isSyncing ? undefined : triggerSync}
                                    />
                                </>
                            )}
                        </View>
                    </>
                )}

                {/* ══════════ SECCIÓN 5: INFORMACIÓN Y LEGAL ══════════ */}
                <View style={styles.sectionHeaderWrap}>
                    <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                        {language === 'es' ? 'INFORMACIÓN Y LEGAL' : 'LEGAL & INFO'}
                    </Text>
                </View>

                <View style={[styles.groupCard, {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                }]}>
                    <ModernSettingsRow
                        icon={Shield}
                        iconColor="#10B981"
                        iconBg={isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.10)'}
                        title={language === 'es' ? 'Política de Privacidad' : 'Privacy Policy'}
                        value={language === 'es' ? 'Protección de datos' : 'Data protection'}
                        isLink
                        onPress={() => router.push({ pathname: '/legal', params: { tab: 'privacy' } })}
                    />
                    <RowDivider />
                    <ModernSettingsRow
                        icon={FileText}
                        iconColor="#3B82F6"
                        iconBg={isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.10)'}
                        title={language === 'es' ? 'Términos y Condiciones' : 'Terms & Conditions'}
                        value={language === 'es' ? 'Condiciones de uso' : 'Terms of use'}
                        isLink
                        onPress={() => router.push({ pathname: '/legal', params: { tab: 'terms' } })}
                    />
                </View>

                {/* Pie de página con versión */}
                <View style={styles.footerWrap}>
                    <Text style={[styles.footerVersion, { color: colors.textMuted }]}>
                        Veyra v{Constants.expoConfig?.version || '1.0.0'} ({Platform.OS})
                    </Text>
                </View>
            </ScrollView>

            {/* Modal para Añadir Widgets (Limpio y Moderno) */}
            <Modal
                visible={showAddWidgetModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowAddWidgetModal(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={[styles.modalCard, {
                        backgroundColor: isDark ? '#16181D' : '#FFFFFF',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                    }]}>
                        <View style={styles.modalHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                                    {language === 'es' ? 'Añadir Widget al Launcher' : 'Add Widget to Launcher'}
                                </Text>
                                <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
                                    {language === 'es' ? 'Selecciona el widget que deseas anclar' : 'Select the widget you want to pin'}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setShowAddWidgetModal(false)}
                                style={[styles.modalCloseBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' }]}
                            >
                                <X size={18} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.widgetOptionsList}>
                            {WIDGET_OPTIONS.map((item, index) => {
                                const ItemIcon = item.icon;
                                return (
                                    <React.Fragment key={item.key}>
                                        {index > 0 && <View style={[styles.modalRowDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }]} />}
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            onPress={() => handleAddWidget(item)}
                                            style={styles.widgetOptionRow}
                                        >
                                            <View style={[styles.widgetOptionIconBox, { backgroundColor: `${item.color}1E` }]}>
                                                <ItemIcon size={20} color={item.color} strokeWidth={2.2} />
                                            </View>
                                            <View style={styles.widgetOptionTextCol}>
                                                <Text style={[styles.widgetOptionTitle, { color: colors.textPrimary }]}>
                                                    {item.title}
                                                </Text>
                                                <Text style={[styles.widgetOptionSub, { color: colors.textMuted }]}>
                                                    {item.subtitle}
                                                </Text>
                                            </View>
                                            <ChevronRight size={16} color={colors.textMuted} />
                                        </TouchableOpacity>
                                    </React.Fragment>
                                );
                            })}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal de Garantía de Alarmas */}
            {Platform.OS === 'android' && (
                <AlarmPermissionsModal
                    visible={showAlarmPermissionsModal}
                    onClose={() => setShowAlarmPermissionsModal(false)}
                />
            )}
        </SafeAreaView>
    );
}

/**
 * Fila de ajuste moderna y estilizada
 */
interface ModernSettingsRowProps {
    icon: any;
    iconColor: string;
    iconBg: string;
    title: string;
    description?: string;
    value?: string;
    rightElement?: React.ReactNode;
    isLink?: boolean;
    onPress?: () => void;
}

function ModernSettingsRow({
    icon: Icon,
    iconColor,
    iconBg,
    title,
    description,
    value,
    rightElement,
    isLink,
    onPress,
}: ModernSettingsRowProps) {
    const { colors } = useVeyraTheme();

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={!onPress}
            activeOpacity={onPress ? 0.7 : 1}
            style={styles.modernRowContainer}
        >
            <View style={[styles.rowIconBadge, { backgroundColor: iconBg }]}>
                <Icon size={17} color={iconColor} strokeWidth={2.2} />
            </View>

            <View style={styles.rowLabelCol}>
                <Text style={[styles.rowTitleText, { color: colors.textPrimary }]}>
                    {title}
                </Text>
                {description && (
                    <Text style={[styles.rowDescText, { color: colors.textMuted }]}>
                        {description}
                    </Text>
                )}
            </View>

            <View style={styles.rowRightCol}>
                {value && (
                    <Text style={[styles.rowValueBadgeText, { color: colors.textSecondary }]} numberOfLines={1}>
                        {value}
                    </Text>
                )}
                {rightElement}
                {isLink && <ChevronRight size={16} color={colors.textMuted} />}
            </View>
        </TouchableOpacity>
    );
}

function RowDivider() {
    const { isDark } = useVeyraTheme();
    return (
        <View style={[styles.rowDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }]} />
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    navHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    navHeaderTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    scrollContent: {
        paddingHorizontal: 18,
        paddingTop: 4,
        gap: 14,
    },
    heroSection: {
        paddingTop: 4,
        paddingBottom: 6,
    },
    heroTitle: {
        fontSize: 30,
        fontWeight: '900',
        letterSpacing: -0.6,
    },
    heroSubtitle: {
        fontSize: 13,
        fontWeight: '500',
        marginTop: 3,
    },
    warrantyBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        gap: 12,
    },
    warrantyIconCircle: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    warrantyTextCol: {
        flex: 1,
        gap: 2,
    },
    warrantyTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    warrantyTitle: {
        fontSize: 14,
        fontWeight: '800',
    },
    warrantyLiveBadge: {
        backgroundColor: '#DC2626',
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 4,
    },
    warrantyLiveText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    warrantyDesc: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '500',
    },
    sectionHeaderWrap: {
        paddingHorizontal: 4,
        paddingTop: 6,
    },
    sectionHeaderText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    groupCard: {
        borderRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
    },
    modernRowContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 13,
        minHeight: 52,
        gap: 12,
    },
    rowIconBadge: {
        width: 32,
        height: 32,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowLabelCol: {
        flex: 1,
        gap: 2,
    },
    rowTitleText: {
        fontSize: 14,
        fontWeight: '600',
    },
    rowDescText: {
        fontSize: 11.5,
        fontWeight: '400',
        lineHeight: 15,
    },
    rowRightCol: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    rowValueBadgeText: {
        fontSize: 13,
        fontWeight: '500',
        maxWidth: 130,
    },
    rowDivider: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 60,
    },
    inlineSelectorRow: {
        paddingHorizontal: 16,
        paddingVertical: 13,
        gap: 10,
    },
    inlineSelectorHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    levelSegmentsWrap: {
        flexDirection: 'row',
        borderRadius: 12,
        padding: 3,
        gap: 4,
        marginTop: 2,
    },
    levelSegmentBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 10,
        gap: 6,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    levelDot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    levelSegmentLabel: {
        fontSize: 12,
    },
    themeRowWrap: {
        paddingHorizontal: 16,
        paddingVertical: 13,
        gap: 10,
    },
    themeRowHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    segmentedControl: {
        flexDirection: 'row',
        borderRadius: 12,
        padding: 3,
        gap: 4,
    },
    segmentButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 10,
        gap: 6,
    },
    segmentText: {
        fontSize: 12,
    },
    accentRowWrap: {
        paddingHorizontal: 16,
        paddingVertical: 13,
        gap: 12,
    },
    accentRowHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    accentsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 4,
        paddingTop: 2,
    },
    accentItem: {
        alignItems: 'center',
        gap: 5,
    },
    accentCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    accentLabel: {
        textTransform: 'capitalize',
    },
    footerWrap: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    footerVersion: {
        fontSize: 12,
        fontWeight: '500',
        letterSpacing: 0.2,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    modalCard: {
        width: '100%',
        maxWidth: 380,
        borderRadius: 24,
        borderWidth: 1,
        padding: 20,
        shadowColor: '#000000',
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 8,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: '800',
    },
    modalSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        marginTop: 2,
    },
    modalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    widgetOptionsList: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    widgetOptionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 4,
        gap: 12,
    },
    widgetOptionIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    widgetOptionTextCol: {
        flex: 1,
        gap: 2,
    },
    widgetOptionTitle: {
        fontSize: 14,
        fontWeight: '700',
    },
    widgetOptionSub: {
        fontSize: 11.5,
        fontWeight: '400',
    },
    modalRowDivider: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 52,
    },
});
