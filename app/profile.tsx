import { YStack, XStack, Text, H2, Avatar, Button, Input, ScrollView, AnimatePresence, Separator, View } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';
import { User, Mail, Calendar, Award, TrendingUp, Target, Flame, CheckCircle2, AlertCircle, XCircle, ChevronRight } from '@tamagui/lucide-icons';
import { useState, useEffect, useMemo } from 'react';
import { ComplianceService } from '../src/services/complianceService';
import { useTranslation } from 'react-i18next';
import { useAccentColor } from '../src/theme/accentColors';

export default function ProfileScreen() {
    const { t } = useTranslation();
    const { theme, userProfile, userName, userEmail, setUserName, setUserEmail } = useStore();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [stats, setStats] = useState({
        totalCompleted: 0,
        totalFailed: 0,
        completionRate: 0,
        currentStreak: 0,
        bestStreak: 0,
    });

    const isDark = theme === 'dark';
    const { accent } = useAccentColor();

    const colors = {
        bg: isDark ? '#0a0a0a' : '#F8FAFC',
        textPrimary: isDark ? '#EDEDED' : '#0c0a09',
        textSecondary: isDark ? '#A1A1A1' : '#64748B',
        textMuted: isDark ? '#525252' : '#94A3B8',
        border: isDark ? '#262626' : '#E2E8F0',
        surface: isDark ? '#171717' : '#FFFFFF',
        inputBg: isDark ? '#1f1f1f' : '#f1f5f9',
        accent: accent,
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
    };

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
        const nameChanged = name.trim() !== (userName || '');
        const emailChanged = email.trim() !== (userEmail || '');
        return nameChanged || emailChanged;
    }, [name, email, userName, userEmail]);

    useEffect(() => {
        async function loadStats() {
            const data = await ComplianceService.getComplianceStats();
            setStats(data);
        }
        loadStats();
        if (userName) setName(userName);
        if (userEmail) setEmail(userEmail);
    }, [userName, userEmail]);

    const showToast = (type: 'success' | 'info' | 'error', title: string, message: string) => {
        setToast({ show: true, type, title, message });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 4000);
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

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>

            <ScrollView
                contentContainerStyle={{ paddingTop: 20, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
            >
                <YStack gap="$10">
                    {/* HEADER AREA - More Airy & Premium */}
                    <YStack
                        backgroundColor={colors.surface}
                        pt="$8"
                        pb="$10"
                        alignItems="center"
                        borderBottomWidth={1}
                        borderBottomColor={colors.border}
                        gap="$5"
                    >
                        <YStack position="relative">
                            <View
                                position="absolute"
                                top={-10}
                                left={-10}
                                right={-10}
                                bottom={-10}
                                borderRadius={100}
                                borderWidth={2}
                                borderColor={colors.accent}
                                opacity={0.3}
                            />
                            <Avatar circular size="$11" borderWidth={4} borderColor={colors.surface}>
                                <Avatar.Fallback
                                    backgroundColor={colors.accent}
                                    alignItems="center"
                                    justifyContent="center"
                                >
                                    {userName ? (
                                        <Text fontSize="$10" fontWeight="900" color="white" textTransform="uppercase">
                                            {userName.charAt(0)}
                                        </Text>
                                    ) : (
                                        <User size={48} color="white" />
                                    )}
                                </Avatar.Fallback>
                            </Avatar>
                        </YStack>

                        <YStack alignItems="center" space="$1">
                            <Text fontSize="$8" fontWeight="900" color={colors.textPrimary} letterSpacing={-0.5}>
                                {userName || t('profile.new_user')}
                            </Text>
                            <XStack space="$2" alignItems="center" backgroundColor={isDark ? '#222' : '#F1F5F9'} px="$3" py="$1" borderRadius="$10">
                                <Award size={14} color={colors.accent} />
                                <Text color={colors.textSecondary} fontSize="$2" fontWeight="700" textTransform="uppercase">
                                    {userProfile ? t(`menu.profiles.${userProfile}`) : t('profile.standard_profile')}
                                </Text>
                            </XStack>
                        </YStack>
                    </YStack>

                    <YStack px="$5" gap="$10">
                        {/* PERFORMANCE GRID - Modern Cards */}
                        <YStack gap="$5">
                            <XStack justifyContent="space-between" alignItems="center">
                                <Text fontSize="$4" fontWeight="900" color={colors.textPrimary} letterSpacing={0.5}>
                                    {t('profile.performance')}
                                </Text>
                                <XStack space="$1" alignItems="center">
                                    <Text fontSize="$2" fontWeight="700" color={colors.accent}>{t('profile.view_all')}</Text>
                                    <ChevronRight size={14} color={colors.accent} />
                                </XStack>
                            </XStack>

                            <XStack gap="$4">
                                <YStack flex={1} backgroundColor={colors.surface} p="$5" borderRadius="$6" gap="$4" borderWidth={1} borderColor={colors.border}>
                                    <YStack backgroundColor="#22C55E15" alignSelf="flex-start" p="$2" borderRadius="$4">
                                        <Target size={20} color="#22C55E" />
                                    </YStack>
                                    <YStack>
                                        <Text fontSize="$8" fontWeight="900" color="#22C55E">{stats.totalCompleted}</Text>
                                        <Text fontSize="$1" fontWeight="700" color={colors.textMuted} textTransform="uppercase">{t('profile.successes')}</Text>
                                    </YStack>
                                </YStack>

                                <YStack flex={1} backgroundColor={colors.surface} p="$5" borderRadius="$6" gap="$4" borderWidth={1} borderColor={colors.border}>
                                    <YStack backgroundColor="#F59E0B15" alignSelf="flex-start" p="$2" borderRadius="$4">
                                        <Flame size={20} color="#F59E0B" />
                                    </YStack>
                                    <YStack>
                                        <Text fontSize="$8" fontWeight="900" color="#F59E0B">{stats.currentStreak}</Text>
                                        <Text fontSize="$1" fontWeight="700" color={colors.textMuted} textTransform="uppercase">{t('profile.streak')}</Text>
                                    </YStack>
                                </YStack>
                            </XStack>

                            <XStack gap="$4">
                                <YStack flex={1} backgroundColor={colors.surface} p="$5" borderRadius="$6" gap="$4" borderWidth={1} borderColor={colors.border}>
                                    <YStack backgroundColor={colors.accent + '15'} alignSelf="flex-start" p="$2" borderRadius="$4">
                                        <Award size={20} color={colors.accent} />
                                    </YStack>
                                    <YStack>
                                        <Text fontSize="$8" fontWeight="900" color={colors.accent}>{stats.completionRate.toFixed(0)}%</Text>
                                        <Text fontSize="$1" fontWeight="700" color={colors.textMuted} textTransform="uppercase">{t('profile.compliance')}</Text>
                                    </YStack>
                                </YStack>

                                <YStack flex={1} backgroundColor={colors.surface} p="$5" borderRadius="$6" gap="$4" borderWidth={1} borderColor={colors.border}>
                                    <YStack backgroundColor="#EF444415" alignSelf="flex-start" p="$2" borderRadius="$4">
                                        <TrendingUp size={20} color="#EF4444" />
                                    </YStack>
                                    <YStack>
                                        <Text fontSize="$8" fontWeight="900" color="#EF4444">{stats.totalFailed}</Text>
                                        <Text fontSize="$1" fontWeight="700" color={colors.textMuted} textTransform="uppercase">{t('profile.failures')}</Text>
                                    </YStack>
                                </YStack>
                            </XStack>
                        </YStack>

                        {/* ACCOUNT INFORMATION - Clean Inputs */}
                        <YStack gap="$5">
                            <Text fontSize="$4" fontWeight="900" color={colors.textPrimary} letterSpacing={0.5}>
                                {t('profile.account_info')}
                            </Text>

                            <YStack gap="$6">
                                <YStack space="$2">
                                    <XStack space="$2" alignItems="center" px="$1">
                                        <User size={14} color={colors.textMuted} />
                                        <Text fontSize="$2" fontWeight="800" color={colors.textMuted} textTransform="uppercase">{t('profile.full_name')}</Text>
                                    </XStack>
                                    <Input
                                        size="$5"
                                        placeholder={t('profile.full_name_placeholder')}
                                        value={name}
                                        onChangeText={setName}
                                        backgroundColor={colors.inputBg}
                                        borderColor={colors.border}
                                        focusStyle={{ borderColor: colors.accent, backgroundColor: colors.surface }}
                                        borderWidth={1.5}
                                        borderRadius="$5"
                                        fontWeight="600"
                                        color={colors.textPrimary}
                                    />
                                </YStack>

                                <YStack space="$2">
                                    <XStack space="$2" alignItems="center" px="$1">
                                        <Mail size={14} color={colors.textMuted} />
                                        <Text fontSize="$2" fontWeight="800" color={colors.textMuted} textTransform="uppercase">{t('profile.email')}</Text>
                                    </XStack>
                                    <Input
                                        size="$5"
                                        placeholder={t('profile.email_placeholder')}
                                        value={email}
                                        onChangeText={setEmail}
                                        backgroundColor={colors.inputBg}
                                        borderColor={colors.border}
                                        focusStyle={{ borderColor: colors.accent, backgroundColor: colors.surface }}
                                        borderWidth={1.5}
                                        borderRadius="$5"
                                        fontWeight="600"
                                        color={colors.textPrimary}
                                        keyboardType="email-address"
                                    />
                                </YStack>
                            </YStack>
                        </YStack>

                        <XStack
                            backgroundColor={isDark ? '#1A1A1A' : '#F1F5F9'}
                            p="$5"
                            borderRadius="$6"
                            alignItems="center"
                            justifyContent="space-between"
                            marginTop="$2"
                        >
                            <XStack space="$3" alignItems="center">
                                <YStack backgroundColor={isDark ? '#333' : '#FFF'} p="$2" borderRadius="$4">
                                    <Calendar size={18} color={colors.textPrimary} />
                                </YStack>
                                <YStack>
                                    <Text fontSize="$2" fontWeight="700" color={colors.textMuted}>{t('profile.member_since')}</Text>
                                    <Text fontSize="$4" fontWeight="800" color={colors.textPrimary}>{t('profile.member_date')}</Text>
                                </YStack>
                            </XStack>
                        </XStack>

                        <Button
                            size="$6"
                            backgroundColor={hasChanges ? colors.textPrimary : (isDark ? '#222' : '#E2E8F0')}
                            borderRadius="$6"
                            pressStyle={{ scale: 0.98, opacity: 0.9 }}
                            onPress={handleSave}
                            disabled={!hasChanges}
                            elevation={hasChanges ? 8 : 0}
                            shadowColor={colors.textPrimary}
                            marginTop="$6"
                        >
                            <Text
                                color={hasChanges ? colors.bg : colors.textMuted}
                                fontWeight="900"
                                fontSize="$5"
                                textTransform="uppercase"
                                letterSpacing={1}
                            >
                                {t('profile.update_button')}
                            </Text>
                        </Button>
                    </YStack>
                </YStack>
            </ScrollView>

            <AnimatePresence>
                {toast.show && (
                    <YStack
                        key="toast"
                        position="absolute"
                        bottom={40}
                        left={20}
                        right={20}
                        backgroundColor={isDark ? '#1A1A1A' : '#FFFFFF'}
                        borderRadius="$8"
                        padding="$4"
                        borderWidth={1}
                        borderColor={
                            toast.type === 'success' ? colors.success + '40' :
                                toast.type === 'error' ? colors.error + '40' :
                                    colors.accent + '40'
                        }
                        shadowColor="#000"
                        shadowOffset={{ width: 0, height: 10 }}
                        shadowOpacity={0.2}
                        shadowRadius={20}
                        elevation={20}
                        enterStyle={{ opacity: 0, y: 50, scale: 0.9 }}
                        exitStyle={{ opacity: 0, scale: 0.95 }}
                        animation="bouncy"
                        zIndex={10000}
                    >
                        <XStack space="$4" alignItems="center">
                            <YStack
                                backgroundColor={
                                    toast.type === 'success' ? colors.success + '20' :
                                        toast.type === 'error' ? colors.error + '20' :
                                            colors.accent + '20'
                                }
                                p="$3"
                                borderRadius="$5"
                            >
                                {toast.type === 'success' && <CheckCircle2 size={24} color={colors.success} />}
                                {toast.type === 'error' && <XCircle size={24} color={colors.error} />}
                                {toast.type === 'info' && <AlertCircle size={24} color={colors.accent} />}
                            </YStack>
                            <YStack flex={1}>
                                <Text color={colors.textPrimary} fontWeight="900" fontSize="$4">{toast.title}</Text>
                                <Text color={colors.textSecondary} fontSize="$3" fontWeight="500">{toast.message}</Text>
                            </YStack>
                        </XStack>
                    </YStack>
                )}
            </AnimatePresence>
        </View>
    );
}
