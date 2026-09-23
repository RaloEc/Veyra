import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    User,
    Mail,
    Calendar,
    Award,
    TrendingUp,
    Target,
    Flame,
    CheckCircle2,
    AlertCircle,
    XCircle,
    ChevronLeft,
} from '@tamagui/lucide-icons';

import { useStore } from '../src/store/useStore';
import { ComplianceService } from '../src/services/complianceService';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraButton } from '../src/components/ui/VeyraButton';
import { VeyraSectionHeader } from '../src/components/ui/VeyraSectionHeader';
import { VeyraBadge } from '../src/components/ui/VeyraBadge';

export default function ProfileScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { userProfile, userName, userEmail, setUserName, setUserEmail, session } = useStore();
    const insets = useSafeAreaInsets();
    const { colors, typography, accent, isDark } = useVeyraTheme();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [stats, setStats] = useState({
        totalCompleted: 0,
        totalFailed: 0,
        completionRate: 0,
        currentStreak: 0,
        bestStreak: 0,
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

    const hasChanges = useMemo(() => {
        const effectiveName = userName || session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || '';
        const effectiveEmail = userEmail || session?.user?.email || '';
        const nameChanged = name.trim() !== effectiveName;
        const emailChanged = email.trim() !== effectiveEmail;
        return nameChanged || emailChanged;
    }, [name, email, userName, userEmail, session]);

    useEffect(() => {
        let isMounted = true;
        async function loadStats() {
            try {
                const data = await ComplianceService.getComplianceStats();
                if (isMounted) setStats(data);
            } catch (e) {
                console.error('Error loading compliance stats in ProfileScreen:', e);
            }
        }
        loadStats();

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

    const handleSave = () => {
        if (!name.trim()) {
            showToast('error', t('profile.toasts.name_required_title'), t('profile.toasts.name_required_msg'));
            return;
        }
        if (email && !email.includes('@')) {
            showToast('error', t('profile.toasts.email_invalid_title'), t('profile.toasts.email_invalid_msg'));
            return;
        }
        setUserName(name.trim());
        if (email) setUserEmail(email.trim());
        showToast('success', t('profile.toasts.profile_updated_title'), t('profile.toasts.profile_updated_msg'));
    };

    const displayName = name || userName || t('profile.new_user');

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
                    {t('menu.profile')}
                </Text>
                <View style={{ width: 34 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
            >
                {/* Profile Hero Avatar */}
                <VeyraSurface
                    level={1}
                    radius="lg"
                    style={styles.avatarHeroCard}
                >
                    <View style={[styles.avatarCircle, { backgroundColor: accent.primary }]}>
                        <Text style={styles.avatarInitial}>
                            {displayName.charAt(0).toUpperCase()}
                        </Text>
                    </View>

                    <Text
                        style={[
                            styles.profileName,
                            { color: colors.textPrimary, fontSize: typography.h2.fontSize },
                        ]}
                    >
                        {displayName}
                    </Text>

                    <VeyraBadge
                        label={userProfile ? (t(`menu.profiles.${userProfile}`) || userProfile) : t('profile.standard_profile')}
                        size="md"
                    />
                </VeyraSurface>

                {/* Performance Metrics */}
                <VeyraSectionHeader title={t('profile.performance')} />

                <View style={styles.metricsGrid}>
                    <VeyraSurface level={1} radius="md" style={styles.metricCard}>
                        <View style={[styles.metricIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                            <Target size={18} color="#10B981" />
                        </View>
                        <Text style={[styles.metricNumber, { color: '#10B981' }]}>
                            {stats.totalCompleted}
                        </Text>
                        <Text style={[styles.metricLabel, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                            {t('profile.successes')}
                        </Text>
                    </VeyraSurface>

                    <VeyraSurface level={1} radius="md" style={styles.metricCard}>
                        <View style={[styles.metricIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                            <Flame size={18} color="#F59E0B" />
                        </View>
                        <Text style={[styles.metricNumber, { color: '#F59E0B' }]}>
                            {stats.currentStreak}
                        </Text>
                        <Text style={[styles.metricLabel, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                            {t('profile.streak')}
                        </Text>
                    </VeyraSurface>

                    <VeyraSurface level={1} radius="md" style={styles.metricCard}>
                        <View style={[styles.metricIconBox, { backgroundColor: `${accent.primary}20` }]}>
                            <Award size={18} color={accent.primary} />
                        </View>
                        <Text style={[styles.metricNumber, { color: accent.primary }]}>
                            {stats.completionRate.toFixed(0)}%
                        </Text>
                        <Text style={[styles.metricLabel, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                            {t('profile.compliance')}
                        </Text>
                    </VeyraSurface>

                    <VeyraSurface level={1} radius="md" style={styles.metricCard}>
                        <View style={[styles.metricIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                            <TrendingUp size={18} color="#EF4444" />
                        </View>
                        <Text style={[styles.metricNumber, { color: '#EF4444' }]}>
                            {stats.totalFailed}
                        </Text>
                        <Text style={[styles.metricLabel, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                            {t('profile.failures')}
                        </Text>
                    </VeyraSurface>
                </View>

                {/* Account Form */}
                <VeyraSectionHeader title={t('profile.account_info')} style={{ marginTop: 8 }} />

                <VeyraSurface level={1} radius="lg" style={styles.formCard}>
                    {/* Name */}
                    <View style={styles.inputGroup}>
                        <View style={styles.inputLabelRow}>
                            <User size={14} color={colors.textMuted} />
                            <Text style={[styles.inputLabelText, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                {t('profile.full_name')}
                            </Text>
                        </View>
                        <TextInput
                            value={name}
                            onChangeText={setName}
                            placeholder={t('profile.full_name_placeholder')}
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

                    {/* Email */}
                    <View style={styles.inputGroup}>
                        <View style={styles.inputLabelRow}>
                            <Mail size={14} color={colors.textMuted} />
                            <Text style={[styles.inputLabelText, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                {t('profile.email')}
                            </Text>
                        </View>
                        <TextInput
                            value={email}
                            onChangeText={setEmail}
                            placeholder={t('profile.email_placeholder')}
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

                {/* Membership metadata */}
                <VeyraSurface level={1} radius="md" style={styles.metaRow}>
                    <View style={styles.metaLeftGroup}>
                        <Calendar size={18} color={accent.primary} />
                        <View style={{ gap: 2 }}>
                            <Text style={[styles.metaLabel, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                {t('profile.member_since')}
                            </Text>
                            <Text style={[styles.metaValue, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                                {t('profile.member_date')}
                            </Text>
                        </View>
                    </View>
                </VeyraSurface>
            </ScrollView>

            {/* Sticky Action Footer — Zona del pulgar One UI */}
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
                    label={t('profile.update_button')}
                    disabled={!hasChanges}
                    onPress={handleSave}
                />
            </View>

            {/* Toast feedback */}
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
                    {toast.type === 'info' && <AlertCircle size={20} color={accent.primary} />}
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
        gap: 14,
    },
    avatarHeroCard: {
        alignItems: 'center',
        paddingVertical: 20,
        gap: 10,
    },
    avatarCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    avatarInitial: {
        color: '#FFFFFF',
        fontSize: 28,
        fontWeight: '900',
    },
    profileName: {
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    metricCard: {
        flex: 1,
        minWidth: '45%',
        padding: 14,
        gap: 6,
    },
    metricIconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    metricNumber: {
        fontSize: 22,
        fontWeight: '900',
    },
    metricLabel: {
        fontWeight: '700',
        textTransform: 'uppercase',
    },
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
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
    },
    metaLeftGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    metaLabel: {
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    metaValue: {
        fontWeight: '700',
    },
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
    stickyFooter: {
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: 1,
    },
});
