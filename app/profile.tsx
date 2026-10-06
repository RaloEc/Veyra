import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Alert,
    Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    User,
    Mail,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Edit3,
    Check,
    CheckCircle2,
    AlertCircle,
    XCircle,
    Cloud,
    RefreshCw,
    LogOut,
    Lock,
    Crown,
    TrendingUp,
    Sparkles,
    Settings,
    Shield,
    Trash2,
    AlertTriangle,
} from '@tamagui/lucide-icons';

import { useStore } from '../src/store/useStore';
import { ComplianceService } from '../src/services/complianceService';
import { AccountDeletionService } from '../src/services/accountDeletionService';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraButton } from '../src/components/ui/VeyraButton';
import { VeyraSectionHeader } from '../src/components/ui/VeyraSectionHeader';
import { VeyraBadge } from '../src/components/ui/VeyraBadge';
import { supabase } from '../src/lib/supabase';

const AVATAR_PRESETS = [
    { id: 'rocket', emoji: '🚀', label: 'Impulso' },
    { id: 'zap', emoji: '⚡', label: 'Enfoque' },
    { id: 'target', emoji: '🎯', label: 'Objetivo' },
    { id: 'zen', emoji: '🧘', label: 'Calma' },
    { id: 'coffee', emoji: '☕', label: 'Productivo' },
    { id: 'art', emoji: '🎨', label: 'Creativo' },
    { id: 'star', emoji: '🌟', label: 'Estrella' },
    { id: 'shield', emoji: '🛡️', label: 'Disciplina' },
    { id: 'fire', emoji: '🔥', label: 'Energía' },
    { id: 'light', emoji: '💡', label: 'Ideas' },
    { id: 'lion', emoji: '🦁', label: 'Fuerza' },
    { id: 'book', emoji: '📚', label: 'Constante' },
];

export default function ProfileScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, typography, accent, isDark } = useVeyraTheme();

    const {
        userName,
        userEmail,
        userAvatar,
        setUserName,
        setUserEmail,
        setUserAvatar,
        session,
        isPremium,
        signOut,
        cloudSyncEnabled,
        isSyncing,
        lastSyncTime,
        triggerSync,
    } = useStore();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [showAvatarModal, setShowAvatarModal] = useState(false);
    const [miniOverview, setMiniOverview] = useState({
        totalCompleted: 0,
        totalNotes: 0,
        completionRate: 0,
    });

    const [toast, setToast] = useState<{
        show: boolean;
        type: 'success' | 'info' | 'error';
        title: string;
        message: string;
    }>({
        show: false,
        type: 'success',
        title: '',
        message: '',
    });

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);

    const handleDeleteAccount = async () => {
        if (deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR') {
            showToast('error', t('profile.delete_match_error_title', 'Confirmación requerida'), t('profile.delete_match_error_msg', 'Escribe ELIMINAR en mayúsculas para confirmar'));
            return;
        }

        try {
            setIsDeletingAccount(true);
            const result = await AccountDeletionService.deleteAccountAndData();
            if (result.success) {
                setShowDeleteModal(false);
                setDeleteConfirmText('');
                Alert.alert(
                    t('profile.account_deleted_title', 'Cuenta eliminada'),
                    t('profile.account_deleted_msg', 'Tu cuenta, recordatorios, notas y eventos han sido eliminados de forma definitiva.'),
                    [
                        {
                            text: 'OK',
                            onPress: () => router.replace('/login'),
                        },
                    ]
                );
            } else {
                showToast('error', t('profile.delete_error_title', 'Error al eliminar'), result.error || t('profile.delete_error_msg', 'No se pudieron eliminar todos los datos'));
            }
        } catch (err: any) {
            showToast('error', t('profile.delete_error_title', 'Error al eliminar'), err?.message || 'Error inesperado');
        } finally {
            setIsDeletingAccount(false);
        }
    };

    const hasChanges = useMemo(() => {
        const effectiveName = userName || session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || '';
        const effectiveEmail = userEmail || session?.user?.email || '';
        const nameChanged = name.trim() !== effectiveName;
        const emailChanged = email.trim() !== effectiveEmail;
        return nameChanged || emailChanged;
    }, [name, email, userName, userEmail, session]);

    useEffect(() => {
        let isMounted = true;
        async function loadQuickData() {
            try {
                const fullStats = await ComplianceService.getFullStats();
                if (isMounted && fullStats) {
                    setMiniOverview({
                        totalCompleted: fullStats.totalCompleted || 0,
                        totalNotes: fullStats.notesStats?.totalNotes || 0,
                        completionRate: Math.round(fullStats.completionRate || 0),
                    });
                }
            } catch (e) {
                // Silenciar error no crítico
            }
        }
        loadQuickData();

        const defaultName = userName || session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || '';
        const defaultEmail = userEmail || session?.user?.email || '';
        setName(defaultName);
        setEmail(defaultEmail);

        return () => {
            isMounted = false;
        };
    }, [userName, userEmail, session]);

    const showToast = (type: 'success' | 'info' | 'error', title: string, message: string) => {
        setToast({ show: true, type, title, message });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3500);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            showToast('error', t('profile.toasts.name_required_title', 'Nombre requerido'), t('profile.toasts.name_required_msg', 'Ingresa tu nombre para guardar'));
            return;
        }
        if (email && !email.includes('@')) {
            showToast('error', t('profile.toasts.email_invalid_title', 'Correo inválido'), t('profile.toasts.email_invalid_msg', 'Ingresa un correo electrónico válido'));
            return;
        }

        setUserName(name.trim());
        if (email) setUserEmail(email.trim());

        if (session?.user?.id) {
            try {
                await supabase.auth.updateUser({
                    data: { full_name: name.trim() }
                });
            } catch (err) {
                console.warn('[Profile] Supabase metadata update note:', err);
            }
        }

        showToast('success', t('profile.toasts.profile_updated_title', 'Perfil guardado'), t('profile.toasts.profile_updated_msg', 'Tu información se ha actualizado'));
    };

    const handleLogout = () => {
        Alert.alert(
            t('profile.logout_confirm_title', 'Cerrar sesión'),
            t('profile.logout_confirm_desc', '¿Deseas cerrar tu sesión? Tus datos locales se conservarán en este dispositivo.'),
            [
                { text: t('common.cancel', 'Cancelar'), style: 'cancel' },
                {
                    text: t('profile.logout_button', 'Cerrar sesión'),
                    style: 'destructive',
                    onPress: async () => {
                        await signOut();
                        showToast('info', t('profile.logged_out_title', 'Sesión cerrada'), t('profile.logged_out_msg', 'Has salido de tu cuenta de Veyra'));
                    },
                },
            ]
        );
    };

    const displayName = name || userName || (session?.user?.email?.split('@')[0]) || t('profile.new_user', 'Usuario');
    const isLogged = Boolean(session?.user);

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
                <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: 18 }]}>
                    {t('menu.profile', 'Mi Perfil')}
                </Text>
                <VeyraIconButton
                    variant="ghost"
                    size="sm"
                    icon={<Settings size={20} color={colors.textSecondary} />}
                    onPress={() => router.push('/settings')}
                />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
            >
                {/* ─── Hero Avatar & Identity Card ────────────────────── */}
                <VeyraSurface level={1} radius="xl" style={styles.heroCard}>
                    {/* Avatar with Customizer Button */}
                    <View style={styles.avatarWrapper}>
                        <TouchableOpacity
                            onPress={() => setShowAvatarModal(true)}
                            activeOpacity={0.8}
                            style={[
                                styles.avatarCircle,
                                {
                                    backgroundColor: userAvatar ? colors.surfaceElevated : accent.primary,
                                    borderColor: `${accent.primary}50`,
                                }
                            ]}
                        >
                            {userAvatar ? (
                                <Text style={styles.avatarEmoji}>{userAvatar}</Text>
                            ) : (
                                <Text style={styles.avatarInitial}>
                                    {displayName.charAt(0).toUpperCase()}
                                </Text>
                            )}

                            {/* Badge flotante para editar avatar */}
                            <View style={[styles.avatarEditBadge, { backgroundColor: accent.primary }]}>
                                <Edit3 size={12} color="#FFFFFF" />
                            </View>
                        </TouchableOpacity>
                    </View>

                    {/* Nombre y Correo Principal */}
                    <View style={styles.heroInfo}>
                        <Text style={[styles.heroName, { color: colors.textPrimary, fontSize: typography.h2.fontSize }]}>
                            {displayName}
                        </Text>
                        <Text style={[styles.heroEmail, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                            {session?.user?.email || userEmail || t('profile.local_account', 'Cuenta Local')}
                        </Text>
                    </View>

                    {/* Membresía: Pro vs Gratuito */}
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => router.push('/upgrade')}
                        style={[
                            styles.membershipPill,
                            {
                                backgroundColor: isPremium ? 'rgba(245, 158, 11, 0.12)' : colors.surfaceElevated,
                                borderColor: isPremium ? '#F59E0B' : colors.borderSubtle,
                            }
                        ]}
                    >
                        <Crown size={14} color={isPremium ? '#F59E0B' : colors.textMuted} />
                        <Text
                            style={[
                                styles.membershipText,
                                {
                                    color: isPremium ? '#F59E0B' : colors.textSecondary,
                                    fontSize: typography.caption.fontSize,
                                }
                            ]}
                        >
                            {isPremium ? t('profile.plan_pro', 'Veyra Pro Activo') : t('profile.plan_free', 'Plan Básico')}
                        </Text>
                        {!isPremium && (
                            <View style={[styles.upgradeChip, { backgroundColor: accent.primary }]}>
                                <Text style={styles.upgradeChipText}>{t('profile.upgrade_cta', 'Mejorar')}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </VeyraSurface>

                {/* ─── Estado de la Cuenta & Sincronización en la Nube ── */}
                <VeyraSectionHeader title={t('profile.account_cloud', 'Cuenta & Nube')} />

                {isLogged ? (
                    <VeyraSurface level={1} radius="lg" style={styles.cloudCard}>
                        {/* Indicador de conexión */}
                        <View style={styles.cloudStatusRow}>
                            <View style={styles.cloudStatusLeft}>
                                <View style={styles.onlineDot} />
                                <View style={{ gap: 2 }}>
                                    <Text style={[styles.cloudStatusTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                                        {t('profile.connected_cloud', 'Veyra Cloud Conectado')}
                                    </Text>
                                    <Text style={[styles.cloudStatusSub, { color: colors.textMuted, fontSize: typography.caption.fontSize }]}>
                                        {isSyncing
                                            ? t('settings.syncing', 'Sincronizando datos...')
                                            : lastSyncTime
                                            ? `${t('profile.last_sync', 'Última sincr.')} ${new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                            : t('profile.auto_sync_active', 'Sincronización automática')}
                                    </Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                onPress={() => triggerSync()}
                                disabled={isSyncing}
                                activeOpacity={0.7}
                                style={[styles.syncButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}
                            >
                                <RefreshCw size={14} color={(isSyncing ? colors.textMuted : accent.primary) as any} />
                                <Text style={[styles.syncButtonText, { color: isSyncing ? colors.textMuted : accent.primary, fontSize: typography.caption.fontSize }]}>
                                    {isSyncing ? t('settings.syncing', 'Sincronizando') : t('settings.sync_now', 'Sincronizar')}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

                        {/* Opciones de la cuenta logueada */}
                        <View style={styles.accountActionsRow}>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => router.push('/forgot-password')}
                                style={styles.accountActionBtn}
                            >
                                <Lock size={15} color={colors.textSecondary as any} />
                                <Text style={[styles.accountActionText, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                    {t('profile.change_password', 'Cambiar contraseña')}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={handleLogout}
                                style={styles.accountActionBtn}
                            >
                                <LogOut size={15} color="#EF4444" />
                                <Text style={[styles.accountActionText, { color: '#EF4444', fontSize: typography.caption.fontSize }]}>
                                    {t('profile.logout_button', 'Cerrar sesión')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </VeyraSurface>
                ) : (
                    <VeyraSurface level={1} radius="lg" style={styles.cloudGuestCard}>
                        <View style={styles.cloudGuestHeader}>
                            <View style={[styles.cloudGuestIconCircle, { backgroundColor: `${accent.primary}18` }]}>
                                <Cloud size={24} color={accent.primary as any} />
                            </View>
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text style={[styles.cloudGuestTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                                    {t('profile.guest_mode_title', 'Modo Local (Sin cuenta)')}
                                </Text>
                                <Text style={[styles.cloudGuestDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                    {t('profile.guest_mode_desc', 'Tus notas, recordatorios y eventos están guardados solo en este teléfono. Conecta tu cuenta para respaldarlos en la nube.')}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.guestButtonsRow}>
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => router.push('/login')}
                                style={[styles.guestBtnPrimary, { backgroundColor: accent.primary }]}
                            >
                                <Text style={styles.guestBtnPrimaryText}>{t('auth.login', 'Iniciar Sesión')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => router.push('/register')}
                                style={[styles.guestBtnSecondary, { borderColor: colors.borderSubtle, backgroundColor: colors.surfaceElevated }]}
                            >
                                <Text style={[styles.guestBtnSecondaryText, { color: colors.textPrimary }]}>{t('auth.register', 'Registrarse')}</Text>
                            </TouchableOpacity>
                        </View>
                    </VeyraSurface>
                )}

                {/* ─── Resumen Personal (Sin duplicar Estadísticas) ────── */}
                <VeyraSectionHeader title={t('profile.activity_summary', 'Resumen')} />

                <VeyraSurface level={1} radius="lg" style={styles.summaryCard}>
                    {/* Métricas clave en una sola fila compacta */}
                    <View style={styles.summaryMetricsRow}>
                        <View style={styles.summaryMetricItem}>
                            <Text style={[styles.summaryMetricValue, { color: '#10B981' }]}>
                                {miniOverview.totalCompleted}
                            </Text>
                            <Text style={[styles.summaryMetricLabel, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                {t('profile.completed_tasks', 'Cumplidos')}
                            </Text>
                        </View>

                        <View style={[styles.verticalDivider, { backgroundColor: colors.borderSubtle }]} />

                        <View style={styles.summaryMetricItem}>
                            <Text style={[styles.summaryMetricValue, { color: accent.primary }]}>
                                {miniOverview.totalNotes}
                            </Text>
                            <Text style={[styles.summaryMetricLabel, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                {t('notes.title', 'Notas')}
                            </Text>
                        </View>

                        <View style={[styles.verticalDivider, { backgroundColor: colors.borderSubtle }]} />

                        <View style={styles.summaryMetricItem}>
                            <Text style={[styles.summaryMetricValue, { color: '#F59E0B' }]}>
                                {miniOverview.completionRate}%
                            </Text>
                            <Text style={[styles.summaryMetricLabel, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                {t('profile.rate', 'Efectividad')}
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: colors.borderSubtle, marginVertical: 10 }]} />

                    {/* Atajo directo a la pantalla completa de Estadísticas */}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => router.push('/stats')}
                        style={styles.statsLinkRow}
                    >
                        <View style={[styles.statsLinkIcon, { backgroundColor: `${accent.primary}18` }]}>
                            <TrendingUp size={16} color={accent.primary as any} />
                        </View>
                        <View style={{ flex: 1, gap: 1 }}>
                            <Text style={[styles.statsLinkTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                                {t('profile.view_full_stats', 'Ver Estadísticas Completas')}
                            </Text>
                            <Text style={[styles.statsLinkSub, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                {t('profile.view_full_stats_desc', 'Gráficos de cumplimiento, horas productivas y hábitos')}
                            </Text>
                        </View>
                        <ChevronRight size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                </VeyraSurface>

                {/* ─── Formulario de Datos Personales ─────────────────── */}
                <VeyraSectionHeader title={t('profile.edit_details', 'Datos de Contacto')} />

                <VeyraSurface level={1} radius="lg" style={styles.formCard}>
                    {/* Nombre */}
                    <View style={styles.inputGroup}>
                        <View style={styles.inputLabelRow}>
                            <User size={14} color={colors.textMuted} />
                            <Text style={[styles.inputLabelText, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                {t('profile.full_name', 'Nombre Completo')}
                            </Text>
                        </View>
                        <TextInput
                            value={name}
                            onChangeText={setName}
                            placeholder={t('profile.full_name_placeholder', 'Tu nombre')}
                            placeholderTextColor={colors.textMuted}
                            style={[
                                styles.inputField,
                                {
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: colors.borderSubtle,
                                    color: colors.textPrimary,
                                    fontSize: typography.body.fontSize,
                                },
                            ]}
                            selectionColor={accent.primary}
                        />
                    </View>

                    {/* Correo */}
                    <View style={styles.inputGroup}>
                        <View style={styles.inputLabelRow}>
                            <Mail size={14} color={colors.textMuted} />
                            <Text style={[styles.inputLabelText, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                {t('profile.email', 'Correo Electrónico')}
                            </Text>
                        </View>
                        <TextInput
                            value={email}
                            onChangeText={setEmail}
                            placeholder={t('profile.email_placeholder', 'tu@email.com')}
                            placeholderTextColor={colors.textMuted}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            style={[
                                styles.inputField,
                                {
                                    backgroundColor: colors.surfaceElevated,
                                    borderColor: colors.borderSubtle,
                                    color: colors.textPrimary,
                                    fontSize: typography.body.fontSize,
                                },
                            ]}
                            selectionColor={accent.primary}
                        />
                    </View>
                </VeyraSurface>

                {/* ─── Zona de Riesgo / Eliminación de Cuenta ─────────── */}
                <VeyraSectionHeader title={t('profile.danger_zone', 'Zona de Riesgo')} />

                <VeyraSurface
                    level={1}
                    radius="lg"
                    style={[
                        styles.dangerCard,
                        {
                            borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.25)',
                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.06)' : 'rgba(239, 68, 68, 0.03)',
                        },
                    ]}
                >
                    <View style={styles.dangerHeaderRow}>
                        <View style={styles.dangerIconCircle}>
                            <Trash2 size={18} color="#EF4444" />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                            <Text style={[styles.dangerTitle, { color: isDark ? '#F87171' : '#DC2626', fontSize: typography.bodyMedium.fontSize }]}>
                                {t('profile.delete_account_title', 'Eliminar cuenta y todos los datos')}
                            </Text>
                            <Text style={[styles.dangerDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                {t('profile.delete_account_desc', 'Borra de forma irreversible tu cuenta en la nube, notas, eventos, recordatorios y alarmas. Esta acción no se puede deshacer.')}
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                            setDeleteConfirmText('');
                            setShowDeleteModal(true);
                        }}
                        style={[styles.deleteAccountButton, { borderColor: isDark ? '#EF444455' : '#EF444433', backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)' }]}
                    >
                        <Trash2 size={16} color="#EF4444" />
                        <Text style={[styles.deleteAccountButtonText, { fontSize: typography.bodyMedium.fontSize }]}>
                            {t('profile.delete_account_btn', 'Eliminar mi cuenta definitivamente')}
                        </Text>
                    </TouchableOpacity>
                </VeyraSurface>
            </ScrollView>

            {/* ─── Sticky Footer (Guardar Cambios) ───────────────────── */}
            {hasChanges && (
                <View
                    style={[
                        styles.stickyFooter,
                        {
                            backgroundColor: colors.surface,
                            borderTopColor: colors.borderSubtle,
                            paddingBottom: Math.max(insets.bottom, 16),
                        },
                    ]}
                >
                    <VeyraButton
                        variant="primary"
                        size="lg"
                        label={t('profile.save_changes', 'Guardar Cambios')}
                        onPress={handleSave}
                    />
                </View>
            )}

            {/* ─── Modal de Selección de Avatar ───────────────────────── */}
            <Modal
                visible={showAvatarModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowAvatarModal(false)}
            >
                <TouchableOpacity
                    style={styles.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => setShowAvatarModal(false)}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        style={[
                            styles.modalSheet,
                            {
                                backgroundColor: colors.surfaceCard,
                                borderColor: colors.borderSubtle,
                            }
                        ]}
                    >
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                                {t('profile.choose_avatar', 'Personaliza tu Avatar')}
                            </Text>
                            <Text style={[styles.modalSubtitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                {t('profile.choose_avatar_desc', 'Elige un icono que te represente o usa tus iniciales')}
                            </Text>
                        </View>

                        {/* Opción Iniciales */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => {
                                setUserAvatar(null);
                                setShowAvatarModal(false);
                            }}
                            style={[
                                styles.initialsOptionBtn,
                                {
                                    backgroundColor: !userAvatar ? `${accent.primary}20` : colors.surfaceElevated,
                                    borderColor: !userAvatar ? accent.primary : colors.borderSubtle,
                                }
                            ]}
                        >
                            <View style={[styles.initialsSmallCircle, { backgroundColor: accent.primary }]}>
                                <Text style={styles.initialsSmallText}>{displayName.charAt(0).toUpperCase()}</Text>
                            </View>
                            <Text style={[styles.initialsOptionLabel, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                                {t('profile.use_initials', 'Usar mis iniciales')}
                            </Text>
                            {!userAvatar && <Check size={18} color={accent.primary as any} style={{ marginLeft: 'auto' }} />}
                        </TouchableOpacity>

                        {/* Grid de Emojis */}
                        <View style={styles.avatarGrid}>
                            {AVATAR_PRESETS.map(preset => {
                                const isSelected = userAvatar === preset.emoji;
                                return (
                                    <TouchableOpacity
                                        key={preset.id}
                                        onPress={() => {
                                            setUserAvatar(preset.emoji);
                                            setShowAvatarModal(false);
                                        }}
                                        activeOpacity={0.7}
                                        style={[
                                            styles.avatarGridItem,
                                            {
                                                backgroundColor: isSelected ? `${accent.primary}20` : colors.surfaceElevated,
                                                borderColor: isSelected ? accent.primary : colors.borderSubtle,
                                            }
                                        ]}
                                    >
                                        <Text style={styles.avatarGridEmoji}>{preset.emoji}</Text>
                                        <Text style={[styles.avatarGridLabel, { color: colors.textMuted, fontSize: 10 }]}>
                                            {preset.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* ─── Modal de Confirmación de Eliminación de Cuenta ─────── */}
            <Modal
                visible={showDeleteModal}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    if (!isDeletingAccount) setShowDeleteModal(false);
                }}
            >
                <TouchableOpacity
                    style={styles.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => {
                        if (!isDeletingAccount) setShowDeleteModal(false);
                    }}
                >
                    <TouchableOpacity
                        activeOpacity={1}
                        style={[
                            styles.modalSheet,
                            {
                                backgroundColor: colors.surfaceCard,
                                borderColor: colors.borderSubtle,
                            }
                        ]}
                    >
                        <View style={styles.modalHeader}>
                            <View style={[styles.dangerIconCircle, { alignSelf: 'flex-start', marginBottom: 6 }]}>
                                <AlertTriangle size={22} color="#EF4444" />
                            </View>
                            <Text style={[styles.modalTitle, { color: isDark ? '#F87171' : '#DC2626', fontSize: typography.h3.fontSize }]}>
                                {t('profile.confirm_delete_title', '¿Eliminar cuenta definitivamente?')}
                            </Text>
                            <Text style={[styles.modalSubtitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize, lineHeight: 20 }]}>
                                {t('profile.confirm_delete_warning', 'Esta acción es permanente y no se puede deshacer. Se borrarán tus datos en la nube (Supabase), todas tus notas, eventos, recordatorios locales y alarmas programadas.')}
                            </Text>
                        </View>

                        <View style={{ gap: 8, marginTop: 4 }}>
                            <Text style={[styles.confirmInputLabel, { color: colors.textPrimary, fontSize: typography.caption.fontSize }]}>
                                {t('profile.type_confirm_label', 'Escribe "ELIMINAR" para confirmar:')}
                            </Text>
                            <TextInput
                                value={deleteConfirmText}
                                onChangeText={setDeleteConfirmText}
                                placeholder="ELIMINAR"
                                placeholderTextColor={colors.textMuted}
                                autoCapitalize="characters"
                                editable={!isDeletingAccount}
                                style={[
                                    styles.inputField,
                                    {
                                        backgroundColor: colors.surfaceElevated,
                                        borderColor: deleteConfirmText.trim().toUpperCase() === 'ELIMINAR' ? '#EF4444' : colors.borderSubtle,
                                        color: colors.textPrimary,
                                        fontSize: typography.body.fontSize,
                                        letterSpacing: 2,
                                        fontWeight: '800',
                                        textAlign: 'center',
                                    },
                                ]}
                            />
                        </View>

                        <View style={styles.modalActionsRow}>
                            <TouchableOpacity
                                activeOpacity={0.8}
                                disabled={isDeletingAccount}
                                onPress={() => setShowDeleteModal(false)}
                                style={[styles.cancelModalBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surfaceElevated }]}
                            >
                                <Text style={[styles.cancelModalBtnText, { color: colors.textPrimary }]}>
                                    {t('common.cancel', 'Cancelar')}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                activeOpacity={0.8}
                                disabled={deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR' || isDeletingAccount}
                                onPress={handleDeleteAccount}
                                style={[
                                    styles.confirmDeleteModalBtn,
                                    {
                                        backgroundColor: deleteConfirmText.trim().toUpperCase() === 'ELIMINAR' && !isDeletingAccount ? '#EF4444' : 'rgba(239, 68, 68, 0.35)',
                                    },
                                ]}
                            >
                                <Text style={styles.confirmDeleteModalBtnText}>
                                    {isDeletingAccount ? t('profile.deleting', 'Eliminando...') : t('profile.confirm_delete_button', 'Borrar todo')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* ─── Feedback Toast ────────────────────────────────────── */}
            {toast.show && (
                <View
                    style={[
                        styles.toastContainer,
                        {
                            backgroundColor: colors.surfaceElevated,
                            borderColor:
                                toast.type === 'success'
                                    ? '#10B981'
                                    : toast.type === 'error'
                                    ? '#EF4444'
                                    : accent.primary,
                        },
                    ]}
                >
                    {toast.type === 'success' && <CheckCircle2 size={20} color="#10B981" />}
                    {toast.type === 'error' && <XCircle size={20} color="#EF4444" />}
                    {toast.type === 'info' && <AlertCircle size={20} color={accent.primary as any} />}
                    <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.toastTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                            {toast.title}
                        </Text>
                        <Text style={[styles.toastMsg, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                            {toast.message}
                        </Text>
                    </View>
                </View>
            )}
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
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
        gap: 14,
    },

    // Hero
    heroCard: {
        alignItems: 'center',
        paddingVertical: 22,
        paddingHorizontal: 16,
        gap: 12,
    },
    avatarWrapper: {
        position: 'relative',
    },
    avatarCircle: {
        width: 86,
        height: 86,
        borderRadius: 43,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
    },
    avatarInitial: {
        color: '#FFFFFF',
        fontSize: 34,
        fontWeight: '900',
    },
    avatarEmoji: {
        fontSize: 42,
    },
    avatarEditBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    heroInfo: {
        alignItems: 'center',
        gap: 4,
    },
    heroName: {
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    heroEmail: {
        fontWeight: '500',
    },
    membershipPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1,
    },
    membershipText: {
        fontWeight: '700',
    },
    upgradeChip: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        marginLeft: 2,
    },
    upgradeChipText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },

    // Cloud Card (Logged)
    cloudCard: {
        padding: 16,
        gap: 12,
    },
    cloudStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cloudStatusLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    onlineDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#10B981',
    },
    cloudStatusTitle: {
        fontWeight: '700',
    },
    cloudStatusSub: {
        fontWeight: '500',
    },
    syncButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1,
    },
    syncButtonText: {
        fontWeight: '700',
    },
    accountActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 2,
    },
    accountActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 4,
    },
    accountActionText: {
        fontWeight: '600',
    },

    // Cloud Guest Card
    cloudGuestCard: {
        padding: 16,
        gap: 14,
    },
    cloudGuestHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    cloudGuestIconCircle: {
        width: 42,
        height: 42,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cloudGuestTitle: {
        fontWeight: '700',
    },
    cloudGuestDesc: {
        fontWeight: '500',
        lineHeight: 18,
    },
    guestButtonsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    guestBtnPrimary: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    guestBtnPrimaryText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 14,
    },
    guestBtnSecondary: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    guestBtnSecondaryText: {
        fontWeight: '700',
        fontSize: 14,
    },

    // Summary Card
    summaryCard: {
        padding: 16,
    },
    summaryMetricsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    summaryMetricItem: {
        alignItems: 'center',
        gap: 4,
        flex: 1,
    },
    summaryMetricValue: {
        fontSize: 22,
        fontWeight: '900',
    },
    summaryMetricLabel: {
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    verticalDivider: {
        width: 1,
        height: 28,
    },
    statsLinkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 4,
    },
    statsLinkIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statsLinkTitle: {
        fontWeight: '700',
    },
    statsLinkSub: {
        fontWeight: '500',
    },

    // Form
    formCard: {
        padding: 16,
        gap: 14,
    },
    inputGroup: {
        gap: 6,
    },
    inputLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    inputLabelText: {
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    inputField: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontWeight: '600',
    },
    divider: {
        height: 1,
        width: '100%',
    },

    // Sticky Footer
    stickyFooter: {
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: 1,
    },

    // Avatar Modal
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderBottomWidth: 0,
        padding: 24,
        gap: 16,
    },
    modalHeader: {
        gap: 4,
    },
    modalTitle: {
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    modalSubtitle: {
        fontWeight: '500',
    },
    initialsOptionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
    },
    initialsSmallCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    initialsSmallText: {
        color: '#FFFFFF',
        fontWeight: '800',
        fontSize: 16,
    },
    initialsOptionLabel: {
        fontWeight: '700',
    },
    avatarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'space-between',
        paddingTop: 4,
    },
    avatarGridItem: {
        width: '22%',
        aspectRatio: 1,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
    },
    avatarGridEmoji: {
        fontSize: 24,
    },
    avatarGridLabel: {
        fontWeight: '700',
    },

    // Toast
    toastContainer: {
        position: 'absolute',
        bottom: 30,
        left: 20,
        right: 20,
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        elevation: 10,
        zIndex: 10000,
    },
    toastTitle: {
        fontWeight: '800',
    },
    toastMsg: {
        fontWeight: '500',
    },

    // Danger Zone & Delete Modal
    dangerCard: {
        padding: 16,
        borderWidth: 1,
        gap: 14,
    },
    dangerHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    dangerIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dangerTitle: {
        fontWeight: '800',
    },
    dangerDesc: {
        lineHeight: 18,
    },
    deleteAccountButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    deleteAccountButtonText: {
        color: '#EF4444',
        fontWeight: '700',
    },
    confirmInputLabel: {
        fontWeight: '700',
    },
    modalActionsRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 10,
    },
    cancelModalBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelModalBtnText: {
        fontWeight: '700',
    },
    confirmDeleteModalBtn: {
        flex: 1.2,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmDeleteModalBtnText: {
        color: '#FFFFFF',
        fontWeight: '800',
    },
});
