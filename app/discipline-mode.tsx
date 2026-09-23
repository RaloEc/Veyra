import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
    Zap,
    AlertTriangle,
    Lock,
    Clock,
    ChevronLeft,
} from '@tamagui/lucide-icons';

import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraButton } from '../src/components/ui/VeyraButton';
import { VeyraDivider } from '../src/components/ui/VeyraDivider';

export default function DisciplineModeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { colors, typography, accent, isDark } = useVeyraTheme();

    const [strictModeActive, setStrictModeActive] = useState(false);
    const [blockSnooze, setBlockSnooze] = useState(false);
    const [maxSnoozes, setMaxSnoozes] = useState(3);
    const [duration, setDuration] = useState('1_hour');

    const amberColor = isDark ? '#FBBF24' : '#F59E0B';
    const criticalColor = isDark ? '#FB7185' : '#E11D48';

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
                    {t('discipline.title')}
                </Text>
                <View style={{ width: 34 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            >
                {/* Intro Rules */}
                <View style={styles.introBlock}>
                    <Text style={[styles.introTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                        {t('discipline.rules_title')}
                    </Text>
                    <Text style={[styles.introDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                        {t('discipline.intro')}
                    </Text>
                </View>

                {/* Master Switch Card */}
                <VeyraSurface
                    level={strictModeActive ? 2 : 1}
                    radius="lg"
                    style={[
                        styles.masterCard,
                        {
                            borderColor: strictModeActive ? amberColor : colors.borderSubtle,
                            borderWidth: strictModeActive ? 1.5 : 1,
                        },
                    ]}
                >
                    <View style={styles.masterRow}>
                        <View style={styles.masterInfoCol}>
                            <View style={styles.masterTitleGroup}>
                                <Zap size={18} color={strictModeActive ? amberColor : colors.textSecondary} />
                                <Text style={[styles.masterTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                                    {t('discipline.status_card_title')}
                                </Text>
                            </View>
                            <Text style={[styles.masterStatus, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                {strictModeActive ? t('discipline.status_strict') : t('discipline.status_standard')}
                            </Text>
                        </View>

                        <Switch
                            value={strictModeActive}
                            onValueChange={setStrictModeActive}
                            trackColor={{ false: colors.surfaceElevated, true: amberColor }}
                            thumbColor="#FFFFFF"
                        />
                    </View>

                    {strictModeActive && (
                        <View
                            style={[
                                styles.reinforcedAlert,
                                {
                                    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.08)',
                                    borderColor: 'rgba(245, 158, 11, 0.25)',
                                },
                            ]}
                        >
                            <View style={styles.alertHeaderRow}>
                                <AlertTriangle size={14} color={amberColor} />
                                <Text style={[styles.alertHeaderText, { color: amberColor, fontSize: typography.caption.fontSize }]}>
                                    {t('discipline.reinforced_system')}
                                </Text>
                            </View>
                            <Text style={[styles.alertDescText, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                                {t('discipline.reinforced_desc')}
                            </Text>
                        </View>
                    )}
                </VeyraSurface>

                <VeyraDivider style={{ marginVertical: 8 }} />

                {/* Snooze Restrictions */}
                <View style={styles.sectionStack}>
                    <View style={styles.sectionTitleRow}>
                        <Lock size={16} color={criticalColor} />
                        <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.caption.fontSize }]}>
                            {t('discipline.restrictions_title').toUpperCase()}
                        </Text>
                    </View>

                    <VeyraSurface
                        level={1}
                        radius="lg"
                        style={styles.restrictionCard}
                    >
                        <View style={styles.restrictionRow}>
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text style={[styles.settingLabel, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                                    {t('discipline.block_snooze_title')}
                                </Text>
                                <Text style={[styles.settingSub, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                    {t('discipline.block_snooze_desc')}
                                </Text>
                            </View>

                            <Switch
                                value={blockSnooze}
                                onValueChange={setBlockSnooze}
                                trackColor={{ false: colors.surfaceElevated, true: criticalColor }}
                                thumbColor="#FFFFFF"
                            />
                        </View>

                        {!blockSnooze && (
                            <>
                                <VeyraDivider style={{ marginVertical: 8 }} />
                                <View style={styles.dailyLimitStack}>
                                    <Text style={[styles.limitLabel, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                                        {t('discipline.daily_limit_title')}
                                    </Text>
                                    <View style={styles.limitButtonsRow}>
                                        {[1, 3, 5].map(num => {
                                            const isSelected = maxSnoozes === num;
                                            return (
                                                <TouchableOpacity
                                                    key={num}
                                                    onPress={() => setMaxSnoozes(num)}
                                                    activeOpacity={0.8}
                                                    style={{ flex: 1 }}
                                                >
                                                    <VeyraSurface
                                                        level={isSelected ? 2 : 1}
                                                        radius="md"
                                                        style={[
                                                            styles.limitNumBtn,
                                                            {
                                                                borderColor: isSelected ? accent.primary : colors.borderSubtle,
                                                                backgroundColor: isSelected
                                                                    ? (isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)')
                                                                    : colors.surface,
                                                            },
                                                        ]}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.limitNumText,
                                                                {
                                                                    color: isSelected ? accent.primary : colors.textSecondary,
                                                                    fontSize: typography.bodyMedium.fontSize,
                                                                },
                                                            ]}
                                                        >
                                                            {num}
                                                        </Text>
                                                    </VeyraSurface>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            </>
                        )}
                    </VeyraSurface>
                </View>

                {/* Duration */}
                <View style={styles.sectionStack}>
                    <View style={styles.sectionTitleRow}>
                        <Clock size={16} color={accent.primary} />
                        <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.caption.fontSize }]}>
                            {t('discipline.mode_validity_title').toUpperCase()}
                        </Text>
                    </View>

                    <View style={styles.durationGrid}>
                        {[
                            { key: '1_hour', label: t('discipline.durations.1_hour') },
                            { key: '24_hours', label: t('discipline.durations.24_hours') },
                            { key: '1_week', label: t('discipline.durations.1_week') },
                            { key: 'indefinite', label: t('discipline.durations.indefinite') },
                        ].map(item => {
                            const isSelected = duration === item.key;
                            return (
                                <TouchableOpacity
                                    key={item.key}
                                    onPress={() => setDuration(item.key)}
                                    activeOpacity={0.8}
                                    style={styles.durationBtnWrapper}
                                >
                                    <VeyraSurface
                                        level={isSelected ? 2 : 1}
                                        radius="md"
                                        style={[
                                            styles.durationBtn,
                                            {
                                                borderColor: isSelected ? accent.primary : colors.borderSubtle,
                                                backgroundColor: isSelected
                                                    ? (isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)')
                                                    : colors.surface,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.durationBtnText,
                                                {
                                                    color: isSelected ? accent.primary : colors.textSecondary,
                                                    fontSize: typography.caption.fontSize,
                                                },
                                            ]}
                                        >
                                            {item.label}
                                        </Text>
                                    </VeyraSurface>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* Apply Button */}
                <View style={{ marginTop: 10 }}>
                    <VeyraButton
                        variant="primary"
                        size="lg"
                        label={t('discipline.apply_button')}
                        onPress={() => router.back()}
                    />
                </View>

                <Text style={[styles.footerNote, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                    {t('discipline.footer_note')}
                </Text>
            </ScrollView>
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
        gap: 20,
    },
    introBlock: {
        gap: 4,
    },
    introTitle: {
        fontWeight: '700',
    },
    introDesc: {
        lineHeight: 20,
        opacity: 0.85,
    },
    masterCard: {
        padding: 16,
        gap: 12,
    },
    masterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    masterInfoCol: {
        flex: 1,
        gap: 4,
    },
    masterTitleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    masterTitle: {
        fontWeight: '800',
    },
    masterStatus: {
        fontWeight: '500',
    },
    reinforcedAlert: {
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        gap: 4,
    },
    alertHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    alertHeaderText: {
        fontWeight: '700',
    },
    alertDescText: {
        fontWeight: '500',
        lineHeight: 16,
    },
    sectionStack: {
        gap: 10,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionHeading: {
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    restrictionCard: {
        padding: 16,
        gap: 10,
    },
    restrictionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    settingLabel: {
        fontWeight: '700',
    },
    settingSub: {
        fontWeight: '500',
    },
    dailyLimitStack: {
        gap: 10,
    },
    limitLabel: {
        fontWeight: '700',
    },
    limitButtonsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    limitNumBtn: {
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    limitNumText: {
        fontWeight: '800',
    },
    durationGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    durationBtnWrapper: {
        flex: 1,
        minWidth: '45%',
    },
    durationBtn: {
        paddingVertical: 12,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    durationBtnText: {
        fontWeight: '700',
    },
    footerNote: {
        textAlign: 'center',
        opacity: 0.7,
        marginTop: 4,
        lineHeight: 16,
    },
});
