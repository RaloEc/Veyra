import React from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    Crown,
    Check,
    Zap,
    Cloud,
    BarChart,
    Image as ImageIcon,
    Flame,
    Minus,
    ChevronLeft,
} from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraButton } from '../src/components/ui/VeyraButton';
import { VeyraDivider } from '../src/components/ui/VeyraDivider';

export default function UpgradeScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { colors, typography, accent, isDark } = useVeyraTheme();
    const insets = useSafeAreaInsets();

    const features = [
        {
            icon: Cloud,
            title: t('upgrade.features.sync.title'),
            description: t('upgrade.features.sync.desc'),
            free: t('upgrade.features.sync.free'),
            pro: t('upgrade.features.sync.pro'),
            iconColor: '#3B82F6',
        },
        {
            icon: ImageIcon,
            title: t('upgrade.features.media.title'),
            description: t('upgrade.features.media.desc'),
            free: t('upgrade.features.media.free'),
            pro: t('upgrade.features.media.pro'),
            iconColor: '#8B5CF6',
        },
        {
            icon: Zap,
            title: t('upgrade.features.levels.title'),
            description: t('upgrade.features.levels.desc'),
            free: t('upgrade.features.levels.free'),
            pro: t('upgrade.features.levels.pro'),
            iconColor: '#F59E0B',
        },
        {
            icon: BarChart,
            title: t('upgrade.features.stats.title'),
            description: t('upgrade.features.stats.desc'),
            free: t('upgrade.features.stats.free'),
            pro: t('upgrade.features.stats.pro'),
            iconColor: '#10B981',
        },
    ];

    const plans = [
        {
            name: t('upgrade.plans.monthly'),
            price: '$4.99',
            period: t('upgrade.plans.period_month'),
            color: '#3B82F6',
            popular: false,
        },
        {
            name: t('upgrade.plans.yearly'),
            price: '$39.99',
            period: t('upgrade.plans.period_year'),
            color: '#8B5CF6',
            popular: true,
            savings: t('upgrade.plans.savings', { percent: 33 }),
        },
        {
            name: t('upgrade.plans.lifetime'),
            price: '$149.99',
            period: t('upgrade.plans.period_lifetime'),
            color: '#F59E0B',
            popular: false,
            badge: t('upgrade.coming_soon_lifetime'),
            isLifetime: true,
        },
    ];

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
                    Veyra PRO
                </Text>
                <View style={{ width: 34 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            >
                {/* Hero section */}
                <View style={styles.heroSection}>
                    <View style={[styles.proBadgePill, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                        <Crown size={15} color="#F59E0B" />
                        <Text style={styles.proBadgeText}>VEYRA PRO</Text>
                    </View>

                    <Text style={[styles.heroHeading, { color: colors.textPrimary, fontSize: typography.h1.fontSize }]}>
                        {t('upgrade.title')}
                    </Text>

                    <Text style={[styles.heroSub, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                        {t('upgrade.description')}
                    </Text>
                </View>

                {/* Plans List */}
                <View style={styles.plansSection}>
                    <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                        {t('upgrade.plans.title')}
                    </Text>

                    {plans.map((plan, index) => (
                        <VeyraSurface
                            key={index}
                            level={plan.popular ? 2 : 1}
                            radius="lg"
                            style={[
                                styles.planCard,
                                {
                                    borderColor: plan.popular ? plan.color : colors.borderSubtle,
                                    borderWidth: plan.popular ? 2 : 1,
                                },
                            ]}
                        >
                            {plan.popular && (
                                <View style={[styles.popularTag, { backgroundColor: plan.color }]}>
                                    <Flame size={12} color="#FFFFFF" />
                                    <Text style={styles.popularTagText}>{t('upgrade.popular')}</Text>
                                </View>
                            )}

                            {plan.badge && !plan.popular && (
                                <View style={[styles.popularTag, { backgroundColor: plan.color }]}>
                                    <Text style={styles.popularTagText}>{plan.badge}</Text>
                                </View>
                            )}

                            <View style={styles.planHeaderRow}>
                                <View style={{ gap: 2 }}>
                                    <Text style={[styles.planName, { color: plan.color, fontSize: typography.bodyMedium.fontSize }]}>
                                        {plan.name}
                                    </Text>
                                    {plan.savings && (
                                        <View style={[styles.savingsChip, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                                            <Text style={styles.savingsText}>{plan.savings}</Text>
                                        </View>
                                    )}
                                </View>

                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[styles.planPrice, { color: colors.textPrimary, fontSize: typography.h1.fontSize }]}>
                                        {plan.price}
                                    </Text>
                                    <Text style={[styles.planPeriod, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                        {plan.period}
                                    </Text>
                                </View>
                            </View>

                            <VeyraButton
                                variant="secondary"
                                size="md"
                                label={t('upgrade.coming_soon_btn')}
                                disabled={true}
                            />
                        </VeyraSurface>
                    ))}
                </View>

                <VeyraDivider style={{ marginVertical: 8 }} />

                {/* Features Comparison Matrix */}
                <View style={styles.featuresSection}>
                    <Text style={[styles.sectionHeading, { color: colors.textPrimary, fontSize: typography.h3.fontSize }]}>
                        {t('upgrade.features_title')}
                    </Text>

                    <VeyraSurface level={1} radius="lg" style={styles.matrixCard}>
                        {/* Table Header */}
                        <View style={[styles.matrixHeaderRow, { borderBottomColor: colors.borderSubtle, backgroundColor: colors.surfaceElevated }]}>
                            <Text style={[styles.matrixHeaderCol1, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                BENEFICIO
                            </Text>
                            <Text style={[styles.matrixHeaderCol2, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                {t('upgrade.free_label')}
                            </Text>
                            <View style={styles.matrixHeaderCol3}>
                                <Crown size={12} color="#F59E0B" />
                                <Text style={[styles.matrixHeaderPro, { fontSize: typography.micro.fontSize }]}>
                                    {t('upgrade.pro_label')}
                                </Text>
                            </View>
                        </View>

                        {/* Rows */}
                        {features.map((feature, idx) => {
                            const Icon = feature.icon;
                            const isLast = idx === features.length - 1;
                            return (
                                <View
                                    key={idx}
                                    style={[
                                        styles.matrixRow,
                                        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
                                    ]}
                                >
                                    <View style={styles.matrixCol1}>
                                        <View style={styles.featureTitleGroup}>
                                            <Icon size={15} color={feature.iconColor} />
                                            <Text style={[styles.featureTitle, { color: colors.textPrimary, fontSize: typography.caption.fontSize }]}>
                                                {feature.title}
                                            </Text>
                                        </View>
                                        <Text style={[styles.featureDesc, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                                            {feature.description}
                                        </Text>
                                    </View>

                                    <View style={styles.matrixCol2}>
                                        {typeof feature.free === 'boolean' ? (
                                            feature.free ? (
                                                <Check size={16} color={colors.textSecondary} />
                                            ) : (
                                                <Minus size={16} color={colors.textMuted} />
                                            )
                                        ) : (
                                            <Text style={[styles.matrixValText, { color: colors.textSecondary, fontSize: typography.micro.fontSize }]}>
                                                {feature.free}
                                            </Text>
                                        )}
                                    </View>

                                    <View style={[styles.matrixCol3, { backgroundColor: 'rgba(245, 158, 11, 0.06)' }]}>
                                        {typeof feature.pro === 'boolean' ? (
                                            feature.pro ? (
                                                <Check size={16} color="#F59E0B" strokeWidth={3} />
                                            ) : (
                                                <Minus size={16} color={colors.textMuted} />
                                            )
                                        ) : (
                                            <Text style={[styles.matrixValTextPro, { fontSize: typography.micro.fontSize }]}>
                                                {feature.pro}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                            );
                        })}
                    </VeyraSurface>
                </View>

                <Text style={[styles.footerMsg, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                    {t('upgrade.footer_msg')}
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
        gap: 16,
    },
    heroSection: {
        alignItems: 'center',
        paddingVertical: 14,
        gap: 8,
    },
    proBadgePill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 999,
        gap: 6,
    },
    proBadgeText: {
        color: '#F59E0B',
        fontWeight: '900',
        fontSize: 11,
        letterSpacing: 0.8,
    },
    heroHeading: {
        fontWeight: '900',
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    heroSub: {
        textAlign: 'center',
        lineHeight: 22,
        maxWidth: 320,
    },
    plansSection: {
        gap: 12,
    },
    sectionHeading: {
        fontWeight: '800',
    },
    planCard: {
        padding: 16,
        gap: 14,
        position: 'relative',
    },
    popularTag: {
        position: 'absolute',
        top: -10,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        gap: 4,
    },
    popularTagText: {
        color: '#FFFFFF',
        fontWeight: '900',
        fontSize: 10,
        textTransform: 'uppercase',
    },
    planHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    planName: {
        fontWeight: '800',
    },
    savingsChip: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginTop: 4,
    },
    savingsText: {
        color: '#10B981',
        fontWeight: '800',
        fontSize: 11,
    },
    planPrice: {
        fontWeight: '900',
    },
    planPeriod: {
        fontWeight: '600',
    },
    featuresSection: {
        gap: 12,
    },
    matrixCard: {
        overflow: 'hidden',
    },
    matrixHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
    },
    matrixHeaderCol1: {
        flex: 1.5,
        fontWeight: '800',
    },
    matrixHeaderCol2: {
        flex: 1,
        textAlign: 'center',
        fontWeight: '800',
    },
    matrixHeaderCol3: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    matrixHeaderPro: {
        color: '#F59E0B',
        fontWeight: '900',
    },
    matrixRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    matrixCol1: {
        flex: 1.5,
        gap: 2,
        paddingRight: 6,
    },
    featureTitleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    featureTitle: {
        fontWeight: '700',
    },
    featureDesc: {
        lineHeight: 14,
    },
    matrixCol2: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    matrixValText: {
        fontWeight: '600',
        textAlign: 'center',
    },
    matrixCol3: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 6,
    },
    matrixValTextPro: {
        color: '#F59E0B',
        fontWeight: '800',
        textAlign: 'center',
    },
    footerMsg: {
        textAlign: 'center',
        opacity: 0.6,
        marginTop: 8,
    },
});
