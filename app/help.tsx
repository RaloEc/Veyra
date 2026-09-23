import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Linking,
    Platform,
    LayoutAnimation,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    HelpCircle,
    Mail,
    MessageCircle,
    Book,
    ChevronDown,
    ChevronLeft,
} from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';

import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraButton } from '../src/components/ui/VeyraButton';
import { VeyraSectionHeader } from '../src/components/ui/VeyraSectionHeader';
import { VeyraDivider } from '../src/components/ui/VeyraDivider';

export default function HelpScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { colors, typography, accent, isDark } = useVeyraTheme();
    const insets = useSafeAreaInsets();
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const faqs = [
        {
            question: t('help.faqs.q1'),
            answer: t('help.faqs.a1'),
        },
        {
            question: t('help.faqs.q2'),
            answer: t('help.faqs.a2'),
        },
        {
            question: t('help.faqs.q3'),
            answer: t('help.faqs.a3'),
        },
        {
            question: t('help.faqs.q4'),
            answer: t('help.faqs.a4'),
        },
        {
            question: t('help.faqs.q5'),
            answer: t('help.faqs.a5'),
        },
    ];

    const toggleFaq = (index: number) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOpenIndex(prev => (prev === index ? null : index));
    };

    const handleContactSupport = () => {
        const email = 'soporte@veyra.app';
        const subject = encodeURIComponent('Soporte Veyra - Consulta');
        const body = encodeURIComponent('Hola equipo de Veyra,\n\n[Escribe tu consulta aquí]');
        Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
    };

    const handleReportBug = () => {
        const email = 'soporte@veyra.app';
        const subject = encodeURIComponent(`Reporte de Error - Veyra (${Platform.OS})`);
        const body = encodeURIComponent(
            `Detalles del dispositivo:\n- Plataforma: ${Platform.OS}\n- Versión de App: 1.0.0\n\nDescripción del problema:\n[Describe el error aquí]`
        );
        Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
    };

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
                    {t('help.title')}
                </Text>
                <View style={{ width: 34 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            >
                {/* Intro Card */}
                <VeyraSurface level={1} radius="lg" style={styles.introCard}>
                    <View style={styles.introHeaderRow}>
                        <View style={[styles.introIconCircle, { backgroundColor: `${accent.primary}20` }]}>
                            <HelpCircle size={20} color={accent.primary} />
                        </View>
                        <Text style={[styles.introTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                            {t('help.title')}
                        </Text>
                    </View>
                    <Text style={[styles.introDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                        {t('help.description')}
                    </Text>
                </VeyraSurface>

                {/* FAQs Section */}
                <VeyraSectionHeader title={t('help.faqs_title')} />

                <View style={styles.faqsStack}>
                    {faqs.map((faq, index) => {
                        const isOpen = openIndex === index;
                        return (
                            <VeyraSurface
                                key={index}
                                level={1}
                                radius="md"
                                style={styles.faqItemCard}
                            >
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => toggleFaq(index)}
                                    style={styles.faqTrigger}
                                >
                                    <Text
                                        style={[
                                            styles.faqQuestion,
                                            { color: colors.textPrimary, fontSize: typography.body.fontSize },
                                        ]}
                                    >
                                        {faq.question}
                                    </Text>
                                    <ChevronDown
                                        size={18}
                                        color={colors.textMuted}
                                        style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
                                    />
                                </TouchableOpacity>

                                {isOpen && (
                                    <View style={styles.faqAnswerWrapper}>
                                        <VeyraDivider style={{ marginBottom: 10 }} />
                                        <Text
                                            style={[
                                                styles.faqAnswer,
                                                { color: colors.textSecondary, fontSize: typography.caption.fontSize },
                                            ]}
                                        >
                                            {faq.answer}
                                        </Text>
                                    </View>
                                )}
                            </VeyraSurface>
                        );
                    })}
                </View>

                {/* Support Actions */}
                <VeyraSectionHeader title={t('help.contact_support')} style={{ marginTop: 8 }} />

                <VeyraSurface level={1} radius="lg" style={styles.actionCard}>
                    <View style={styles.actionHeaderRow}>
                        <MessageCircle size={18} color="#10B981" />
                        <Text style={[styles.actionTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                            {t('help.contact_support')}
                        </Text>
                    </View>
                    <Text style={[styles.actionDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                        {t('help.contact_desc')}
                    </Text>
                    <VeyraButton
                        variant="primary"
                        size="md"
                        label={t('help.send_email')}
                        iconLeft={<Mail size={16} color={isDark ? '#1B1B1B' : '#FFFFFF'} />}
                        onPress={handleContactSupport}
                    />
                </VeyraSurface>

                <VeyraSurface level={1} radius="lg" style={styles.actionCard}>
                    <View style={styles.actionHeaderRow}>
                        <Book size={18} color="#E11D48" />
                        <Text style={[styles.actionTitle, { color: colors.textPrimary, fontSize: typography.bodyMedium.fontSize }]}>
                            {t('help.report_problem')}
                        </Text>
                    </View>
                    <Text style={[styles.actionDesc, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                        {t('help.report_desc')}
                    </Text>
                    <VeyraButton
                        variant="danger"
                        size="md"
                        label={t('help.report_bug')}
                        onPress={handleReportBug}
                    />
                </VeyraSurface>

                {/* Version Card */}
                <VeyraSurface level={1} radius="md" style={styles.versionCard}>
                    <Text style={[styles.versionLabel, { color: colors.textMuted, fontSize: typography.caption.fontSize }]}>
                        {t('help.app_version')}
                    </Text>
                    <Text style={[styles.versionNumber, { color: colors.textPrimary, fontSize: typography.body.fontSize }]}>
                        {Constants.expoConfig?.version || '1.0.0'}
                    </Text>
                </VeyraSurface>
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
        gap: 14,
    },
    introCard: {
        padding: 16,
        gap: 8,
    },
    introHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    introIconCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    introTitle: {
        fontWeight: '800',
    },
    introDesc: {
        lineHeight: 20,
    },
    faqsStack: {
        gap: 8,
    },
    faqItemCard: {
        overflow: 'hidden',
    },
    faqTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        gap: 12,
    },
    faqQuestion: {
        flex: 1,
        fontWeight: '700',
    },
    faqAnswerWrapper: {
        paddingHorizontal: 14,
        paddingBottom: 14,
    },
    faqAnswer: {
        lineHeight: 20,
    },
    actionCard: {
        padding: 16,
        gap: 10,
    },
    actionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionTitle: {
        fontWeight: '800',
    },
    actionDesc: {
        lineHeight: 20,
    },
    versionCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 14,
    },
    versionLabel: {
        fontWeight: '600',
    },
    versionNumber: {
        fontWeight: '800',
    },
});
