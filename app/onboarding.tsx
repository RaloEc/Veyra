import React, { useState } from 'react';
import { YStack, XStack, H2, Paragraph, Button, Theme, Text, useTheme, AnimatePresence, View, Circle } from 'tamagui';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store/useStore';
import * as Notifications from 'expo-notifications';
import { ControlLevel } from '../src/types/db';
import { ArrowLeft, Sun, Moon, Zap, Shield, Flame, Bell, Cloud, ChevronRight, ArrowRight } from '@tamagui/lucide-icons';
import { Dimensions, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_STEPS = 3;

// ─── Animación de entrada/salida ───────────────────────────────────────────
const StepContainer = ({ children, direction }: { children: React.ReactNode; direction: number }) => (
    <YStack
        flex={1}
        width={SCREEN_WIDTH}
        animation="lazy"
        enterStyle={{ opacity: 0, x: direction > 0 ? 40 : -40 }}
        exitStyle={{ opacity: 0, x: direction > 0 ? -40 : 40 }}
        x={0}
        opacity={1}
    >
        {children}
    </YStack>
);

// ─── PASO 0: Selección de tema ─────────────────────────────────────────────
const Step0_Theme = ({ selectedTheme, onSelect, onLogin, t }: any) => {
    return (
        <YStack flex={1} paddingHorizontal="$7" justifyContent="center" gap="$10">

            {/* Gran tipografía superior */}
            <YStack gap="$3" mb="$4">
                <Text
                    color="$color"
                    fontWeight="800"
                    fontSize={48}
                    lineHeight={52}
                    letterSpacing={-2}
                >
                    {t('onboarding.step0.title')}
                </Text>
                <Text color="$gray10" fontSize={17} lineHeight={24} fontWeight="400" maxWidth={280}>
                    {t('onboarding.step0.desc')}
                </Text>
            </YStack>

            {/* Selector de tema */}
            <XStack gap="$4" width="100%">
                {/* Claro */}
                <YStack
                    flex={1}
                    height={160}
                    borderRadius={20}
                    padding={20}
                    borderWidth={2}
                    borderColor={selectedTheme === 'light' ? '$color' : '$borderColor'}
                    backgroundColor="#fcfcfc"
                    justifyContent="flex-start"
                    cur="pointer"
                    onPress={() => onSelect('light')}
                >
                    <Sun size={28} color="#111" strokeWidth={1.5} />
                    <View flex={1} />
                    <Text color="#111" fontWeight="800" fontSize={15} letterSpacing={0.5}>
                        {t('onboarding.step0.light')}
                    </Text>
                    {selectedTheme === 'light' && (
                        <View style={[styles.selectedDot, { backgroundColor: '#111' }]} />
                    )}
                </YStack>

                {/* Oscuro */}
                <YStack
                    flex={1}
                    height={160}
                    borderRadius={20}
                    padding={20}
                    borderWidth={2}
                    borderColor={selectedTheme === 'dark' ? '$color' : '$borderColor'}
                    backgroundColor="#111"
                    justifyContent="flex-start"
                    cur="pointer"
                    onPress={() => onSelect('dark')}
                >
                    <Moon size={28} color="#fff" strokeWidth={1.5} />
                    <View flex={1} />
                    <Text color="#fff" fontWeight="800" fontSize={15} letterSpacing={0.5}>
                        {t('onboarding.step0.dark')}
                    </Text>
                    {selectedTheme === 'dark' && (
                        <View style={[styles.selectedDot, { backgroundColor: '#fff' }]} />
                    )}
                </YStack>
            </XStack>

            {/* Login link */}
            <TouchableOpacity onPress={onLogin} activeOpacity={0.6}>
                <XStack alignItems="center" justifyContent="center" gap="$1">
                    <Text color="$gray9" fontSize={15} fontWeight="500">{t('onboarding.step0.already_have_account')}</Text>
                    <Text color="$color" fontWeight="700" fontSize={15}>{t('onboarding.step0.login')}</Text>
                    <ChevronRight size={16} color="$color" />
                </XStack>
            </TouchableOpacity>
        </YStack>
    );
};

// ─── PASO 1: Nivel de disciplina ───────────────────────────────────────────
const Step1_Control = ({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) => {
    const { t } = useTranslation();
    const levels = [
        {
            id: 'normal',
            label: t('onboarding.step1.levels.normal.label'),
            sub: t('onboarding.step1.levels.normal.sub'),
            Icon: Zap,
            colorToken: '$green10',
            bgToken: '$green2',
        },
        {
            id: 'strict',
            label: t('onboarding.step1.levels.strict.label'),
            sub: t('onboarding.step1.levels.strict.sub'),
            Icon: Shield,
            colorToken: '$blue10',
            bgToken: '$blue2',
        },
        {
            id: 'critical',
            label: t('onboarding.step1.levels.critical.label'),
            sub: t('onboarding.step1.levels.critical.sub'),
            Icon: Flame,
            colorToken: '$orange10',
            bgToken: '$orange2',
        },
    ] as const;

    return (
        <YStack flex={1} px="$7" justifyContent="center" pb="$8" gap="$8">
            <YStack gap="$3" mb="$4">
                <Text
                    color="$color"
                    fontWeight="800"
                    fontSize={44}
                    lineHeight={48}
                    letterSpacing={-2}
                >
                    {t('onboarding.step1.title')}
                </Text>
                <Text color="$gray10" fontSize={17} lineHeight={24} fontWeight="400">
                    {t('onboarding.step1.desc')}
                </Text>
            </YStack>

            <YStack gap="$3">
                {levels.map(({ id, label, sub, Icon, colorToken, bgToken }) => {
                    const isActive = selected === id;
                    return (
                        <TouchableOpacity
                            key={id}
                            activeOpacity={0.75}
                            onPress={() => onSelect(id)}
                            style={[
                                styles.levelRow,
                                isActive && { borderColor: colorToken as any, backgroundColor: bgToken as any },
                            ]}
                        >
                            <View width={46} height={46} borderRadius={14} justifyContent="center" alignItems="center" backgroundColor={bgToken as any}>
                                <Icon size={22} color={colorToken as any} strokeWidth={2} />
                            </View>
                            <YStack flex={1} gap={2}>
                                <Text color={(isActive ? colorToken : '$color') as any} fontWeight="700" fontSize={17}>
                                    {label}
                                </Text>
                                <Text color="$gray10" fontSize={14} fontWeight="400">
                                    {sub}
                                </Text>
                            </YStack>
                            <ArrowRight size={18} color={(isActive ? colorToken : '$gray8') as any} strokeWidth={2} />
                        </TouchableOpacity>
                    );
                })}
            </YStack>
        </YStack>
    );
};

// ─── PASO 2: Notificaciones ────────────────────────────────────────────────
const Step2_Permissions = ({ onAction, onSkip, t }: any) => {
    return (
        <YStack flex={1} px="$7" justifyContent="center" pb="$8" gap="$10">
            <YStack gap="$3" mb="$4">
                {/* Ilustración minimalista */}
                <View style={styles.bigIconWrap}>
                    <Bell size={52} color="$color" strokeWidth={1.3} />
                </View>
                <Text
                    color="$color"
                    fontWeight="800"
                    fontSize={44}
                    lineHeight={48}
                    letterSpacing={-2}
                    mt="$4"
                >
                    {t('onboarding.step2.title')}
                </Text>
                <Text color="$gray10" fontSize={17} lineHeight={26} fontWeight="400" maxWidth={300}>
                    {t('onboarding.step2.desc')}
                </Text>
            </YStack>

            <YStack gap="$4" w="100%">
                <Button
                    height={60}
                    borderRadius={18}
                    backgroundColor="$color"
                    pressStyle={{ opacity: 0.9, scale: 0.98 }}
                    onPress={onAction}
                >
                    <Text color="$background" fontWeight="800" fontSize={17}>
                        {t('onboarding.step2.enable_btn')}
                    </Text>
                </Button>
                <Button
                    chromeless
                    onPress={onSkip}
                    pressStyle={{ opacity: 0.4 }}
                    alignSelf="center"
                >
                    <Text color="$gray9" fontWeight="600" fontSize={15}>{t('onboarding.step2.now_not_btn')}</Text>
                </Button>
            </YStack>
        </YStack>
    );
};


// ─── ESTILOS NATIVOS ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
    selectedDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '$color',
        position: 'absolute',
        top: 16,
        right: 16,
    },
    levelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 18,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: '$borderColor',
        backgroundColor: '$background0',
    },
    bigIconWrap: {
        width: 80,
        height: 80,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────
export default function OnboardingScreen() {
    const router = useRouter();
    const {
        theme,
        completeOnboarding,
        setDefaultControlLevel,
        setTheme,
    } = useStore();

    const [onboardingStep, setOnboardingStep] = useState(0);
    const [direction, setDirection] = useState(1);
    const [selectedControlLevel, setSelectedControlLevel] = useState<string | null>(null);
    const tamaguiTheme = useTheme();
    const { t } = useTranslation();

    const goToStep = (step: number) => {
        setDirection(step > onboardingStep ? 1 : -1);
        setOnboardingStep(step);
    };

    const handleThemeSelect = (selected: 'light' | 'dark') => {
        setTheme(selected);
    };

    const handleControlSelect = (level: string) => {
        setSelectedControlLevel(level);
        setDefaultControlLevel(level as ControlLevel);
    };

    const handlePermissions = async () => {
        const { status } = await Notifications.requestPermissionsAsync();

        if (status === 'granted') {
            handleFinish();
        } else {
            Alert.alert(
                t('onboarding.step2.alert.title'),
                t('onboarding.step2.alert.msg'),
                [
                    {
                        text: t('onboarding.step2.alert.retry'),
                        onPress: () => handlePermissions()
                    },
                    {
                        text: t('onboarding.step2.alert.continue'),
                        onPress: handleFinish,
                        style: "destructive"
                    }
                ]
            );
        }
    };

    const handleFinish = () => {
        completeOnboarding();
        router.replace('/');
    };

    const handleLogin = () => {
        completeOnboarding();
        router.push('/login');
    };

    // ── Navegación: Siguiente ──
    const handleNext = () => {
        if (onboardingStep < TOTAL_STEPS - 1) {
            goToStep(onboardingStep + 1);
        } else {
            // Último paso → finalizar
            handleFinish();
        }
    };

    // ── Navegación: Saltar ──
    const handleSkip = () => {
        if (onboardingStep < TOTAL_STEPS - 1) {
            goToStep(onboardingStep + 1);
        } else {
            handleFinish();
        }
    };

    const isLastStep = onboardingStep === TOTAL_STEPS - 1;

    return (
        <Theme name={theme}>
            <SafeAreaView style={{ flex: 1, backgroundColor: tamaguiTheme.background.val }}>
                <YStack flex={1} backgroundColor="$background" overflow="hidden">

                    {/* ── Contenido por paso ── */}
                    <AnimatePresence exitBeforeEnter custom={{ direction }}>
                        <StepContainer key={onboardingStep} direction={direction}>
                            {onboardingStep === 0 && (
                                <Step0_Theme
                                    selectedTheme={theme}
                                    onSelect={handleThemeSelect}
                                    onLogin={handleLogin}
                                    t={t}
                                />
                            )}
                            {onboardingStep === 1 && (
                                <Step1_Control
                                    selected={selectedControlLevel}
                                    onSelect={handleControlSelect}
                                />
                            )}
                            {onboardingStep === 2 && (
                                <Step2_Permissions
                                    onAction={handlePermissions}
                                    onSkip={handleFinish}
                                    t={t}
                                />
                            )}
                        </StepContainer>
                    </AnimatePresence>

                    {/* ── Barra inferior: SALTAR · ● ● ● · SIGUIENTE ── */}
                    <XStack
                        px="$6"
                        pb="$4"
                        pt="$3"
                        alignItems="center"
                        justifyContent="space-between"
                    >
                        {/* Botón SALTAR */}
                        <Button
                            chromeless
                            onPress={handleSkip}
                            pressStyle={{ opacity: 0.5 }}
                            paddingHorizontal="$2"
                        >
                            <Text
                                color="$gray9"
                                fontSize={14}
                                fontWeight="700"
                                letterSpacing={1}
                                textTransform="uppercase"
                            >
                                {t('onboarding.footer.skip')}
                            </Text>
                        </Button>

                        {/* Indicadores de puntos */}
                        <XStack gap={8} alignItems="center">
                            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                                <View
                                    key={i}
                                    width={i === onboardingStep ? 10 : 8}
                                    height={i === onboardingStep ? 10 : 8}
                                    borderRadius={10}
                                    backgroundColor={i === onboardingStep ? '$color' : '$gray7'}
                                    opacity={i === onboardingStep ? 1 : 0.5}
                                />
                            ))}
                        </XStack>

                        {/* Botón SIGUIENTE */}
                        <Button
                            chromeless
                            onPress={handleNext}
                            pressStyle={{ opacity: 0.5 }}
                            paddingHorizontal="$2"
                        >
                            <Text
                                color="$color"
                                fontSize={14}
                                fontWeight="700"
                                letterSpacing={1}
                                textTransform="uppercase"
                            >
                                {isLastStep ? t('onboarding.footer.done') : t('onboarding.footer.next')}
                            </Text>
                        </Button>
                    </XStack>
                </YStack>
            </SafeAreaView>
        </Theme>
    );
}
