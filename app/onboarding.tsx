import React from 'react';
import { YStack, XStack, H2, Paragraph, Button, Theme, Card, Text } from 'tamagui';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store/useStore';
import * as Notifications from 'expo-notifications';
import { ControlLevel } from '../src/types/db';
import { ArrowLeft } from '@tamagui/lucide-icons';
import { ScrollView } from 'react-native';

// --- SUB-COMPONENTES PARA LOS PASOS ---

const Step0_Theme = ({ selectedTheme, onSelect, onLogin }: any) => (
    <YStack f={1} ai="center" jc="center" p="$4" gap="$6">
        <YStack gap="$2" ai="center">
            <H2 ta="center" size="$9" color="$color">Elige tu estilo</H2>
            <Paragraph ta="center" size="$5" opacity={0.6}>Selecciona el tema de la app</Paragraph>
        </YStack>

        <XStack gap="$4" w="100%" maxWidth={500} jc="center" flexWrap="wrap">
            {/* Tema Claro */}
            <Card
                elevation={5}
                w={160}
                h={200}
                borderWidth={selectedTheme === 'light' ? 4 : 1}
                borderColor={selectedTheme === 'light' ? '$blue10' : '$gray5'}
                backgroundColor="#FFFFFF"
                pressStyle={{ scale: 0.95 }}
                onPress={() => onSelect('light')}
            >
                <YStack f={1} p="$3" gap="$2">
                    <XStack jc="space-between" ai="center">
                        <YStack w={8} h={8} borderRadius={10} backgroundColor="#E0E0E0" />
                        <XStack gap="$1">
                            <YStack w={4} h={4} borderRadius={10} backgroundColor="#F0F0F0" />
                            <YStack w={4} h={4} borderRadius={10} backgroundColor="#F0F0F0" />
                        </XStack>
                    </XStack>

                    <YStack gap="$1.5" mt="$2">
                        <YStack h={12} borderRadius={4} backgroundColor="#E0E0E0" w="60%" />
                        <YStack h={6} borderRadius={4} backgroundColor="#F0F0F0" w="80%" />
                        <YStack h={6} borderRadius={4} backgroundColor="#F0F0F0" w="70%" />
                    </YStack>

                    <YStack mt="auto" gap="$1.5">
                        <YStack h={8} borderRadius={4} backgroundColor="#F5F5F5" />
                        <YStack h={8} borderRadius={4} backgroundColor="#F5F5F5" />
                    </YStack>
                </YStack>
                <YStack backgroundColor="#EEEEEE" p="$2" ai="center">
                    <Text fontWeight="800" color="#111111">CLARO</Text>
                </YStack>
            </Card>

            {/* Tema Oscuro */}
            <Card
                elevation={5}
                w={160}
                h={200}
                borderWidth={selectedTheme === 'dark' ? 4 : 1}
                borderColor={selectedTheme === 'dark' ? '$blue10' : '$gray5'}
                backgroundColor="#1A1A1A"
                pressStyle={{ scale: 0.95 }}
                onPress={() => onSelect('dark')}
            >
                <YStack f={1} p="$3" gap="$2">
                    <XStack jc="space-between" ai="center">
                        <YStack w={8} h={8} borderRadius={10} backgroundColor="#333333" />
                        <XStack gap="$1">
                            <YStack w={4} h={4} borderRadius={10} backgroundColor="#444444" />
                            <YStack w={4} h={4} borderRadius={10} backgroundColor="#444444" />
                        </XStack>
                    </XStack>

                    <YStack gap="$1.5" mt="$2">
                        <YStack h={12} borderRadius={4} backgroundColor="#333333" w="60%" />
                        <YStack h={6} borderRadius={4} backgroundColor="#444444" w="80%" />
                        <YStack h={6} borderRadius={4} backgroundColor="#444444" w="70%" />
                    </YStack>

                    <YStack mt="auto" gap="$1.5">
                        <YStack h={8} borderRadius={4} backgroundColor="#222222" />
                        <YStack h={8} borderRadius={4} backgroundColor="#222222" />
                    </YStack>
                </YStack>
                <YStack backgroundColor="#333333" p="$2" ai="center">
                    <Text fontWeight="800" color="#FFFFFF">OSCURO</Text>
                </YStack>
            </Card>
        </XStack>

        <XStack jc="center" ai="center" gap="$2" mt="$4">
            <Text color="$gray10">¿Ya tienes una cuenta?</Text>
            <Button chromeless p={0} onPress={onLogin}>
                <Text color="$blue10" fontWeight="700">Inicia sesión</Text>
            </Button>
        </XStack>
    </YStack>
);

const Step1_Profile = ({ onSelect, onSkip }: any) => (
    <YStack f={1} ai="center" jc="center" p="$4" gap="$5">
        <YStack gap="$2" ai="center">
            <H2 ta="center" size="$9" color="$color">¿Para qué la vas a usar?</H2>
            <Paragraph ta="center" size="$5" opacity={0.6}>Selecciona tu perfil principal</Paragraph>
        </YStack>

        <YStack gap="$3" w="100%" maxWidth={350}>
            <Button size="$6" onPress={() => onSelect('student')} theme="active" icon={<Paragraph size="$6">🎓</Paragraph>}>Estudio</Button>
            <Button size="$6" onPress={() => onSelect('work')} icon={<Paragraph size="$6">💼</Paragraph>}>Trabajo</Button>
            <Button size="$6" onPress={() => onSelect('personal')} icon={<Paragraph size="$6">🏠</Paragraph>}>Uso personal</Button>
            <Button size="$6" onPress={() => onSelect('custom')} icon={<Paragraph size="$6">⚙️</Paragraph>}>Personalizado</Button>
        </YStack>

        <Button chromeless size="$3" onPress={onSkip}>
            Saltar
        </Button>
    </YStack>
);

const Step2_Control = ({ onSelect }: any) => (
    <YStack f={1} ai="center" jc="center" p="$4" gap="$5">
        <YStack gap="$2" ai="center">
            <H2 ta="center" size="$8">¿Cómo quieres que te trate?</H2>
            <Paragraph ta="center" size="$5" opacity={0.6}>Define la presión de los recordatorios</Paragraph>
        </YStack>

        <YStack gap="$3" w="100%" maxWidth={350}>
            <Button size="$6" onPress={() => onSelect('normal')} theme="green" icon={<Paragraph size="$6">😌</Paragraph>}>Suave (Normal)</Button>
            <Button size="$6" onPress={() => onSelect('strict')} theme="orange" icon={<Paragraph size="$6">😐</Paragraph>}>Firme (Estricto)</Button>
            <Button size="$6" onPress={() => onSelect('critical')} theme="red" icon={<Paragraph size="$6">🔴</Paragraph>}>Implacable (Crítico)</Button>
        </YStack>
    </YStack>
);

const Step3_Permissions = ({ onAction, onSkip }: any) => (
    <YStack f={1} ai="center" jc="center" p="$4" gap="$6">
        <YStack gap="$2" ai="center">
            <H2 ta="center" size="$8">Permisos</H2>
            <Paragraph ta="center" size="$5" opacity={0.7} px="$4">
                Para que no olvides nada, necesitamos enviarte notificaciones.
            </Paragraph>
        </YStack>

        <Button size="$6" theme="active" onPress={onAction} w="100%" maxWidth={350}>
            Activar notificaciones
        </Button>
        <Button chromeless onPress={onSkip}>
            Continuar sin activar
        </Button>
    </YStack>
);

const Step4_CloudSync = ({ onRegister, onLogin, onSkip }: any) => (
    <YStack f={1} ai="center" jc="center" p="$4" gap="$6">
        <YStack gap="$2" ai="center">
            <Text fontSize="$9">☁️</Text>
            <H2 ta="center" size="$8">Sincronización en la nube</H2>
            <Paragraph ta="center" size="$5" opacity={0.7} px="$4">
                Crea una cuenta para guardar tus recordatorios y acceder a ellos desde cualquier dispositivo.
            </Paragraph>
        </YStack>

        <YStack gap="$3" w="100%" maxWidth={350}>
            <Button size="$5" theme="active" onPress={onRegister}>
                Crear cuenta gratis
            </Button>
            <Button size="$5" chromeless onPress={onLogin}>
                Ya tengo cuenta (Entrar)
            </Button>
            <Button size="$5" chromeless onPress={onSkip} opacity={0.6}>
                Continuar sin cuenta (Solo local)
            </Button>
        </YStack>
    </YStack>
);

const Step5_Finish = ({ onFinish }: any) => (
    <YStack f={1} ai="center" jc="center" p="$4" gap="$6">
        <H2 ta="center" size="$10">¡Todo listo!</H2>
        <Paragraph ta="center" size="$6">Empieza a organizar tu vida.</Paragraph>
        <Button size="$6" theme="active" onPress={onFinish} w="100%" maxWidth={350}>
            ➕ Crear primer recordatorio
        </Button>
    </YStack>
);

// --- COMPONENTE PRINCIPAL ---

export default function OnboardingScreen() {
    const router = useRouter();
    const {
        theme,
        onboardingStep,
        setOnboardingStep,
        completeOnboarding,
        setUserProfile,
        setDefaultControlLevel,
        toggleTheme
    } = useStore();

    const handleThemeSelect = (selected: 'light' | 'dark') => {
        console.log('[Onboarding] Selección de tema:', selected);
        console.log('[Onboarding] Tema actual:', theme);

        // Obligamos al cambio de tema en el store primero
        if (theme !== selected) {
            console.log('[Onboarding] Cambiando tema (toggleTheme)...');
            toggleTheme();
        } else {
            console.log('[Onboarding] El tema ya coincide, no se cambia.');
        }
        // Agregamos un pequeño delay mental para asegurar que el usuario vea el cambio antes de avanzar
        setTimeout(() => {
            console.log('[Onboarding] Avanzando al paso 1...');
            setOnboardingStep(1);
        }, 500); // Aumenté un poco el delay para depuración visual
    };

    const handleProfileSelect = (profile: 'student' | 'work' | 'personal' | 'custom') => {
        setUserProfile(profile);
        if (profile === 'student' || profile === 'work') setDefaultControlLevel('strict');
        else setDefaultControlLevel('normal');
        setOnboardingStep(2);
    };

    const handleControlSelect = (level: ControlLevel) => {
        setDefaultControlLevel(level);
        setOnboardingStep(3);
    };

    const handlePermissions = async () => {
        await Notifications.requestPermissionsAsync();
        setOnboardingStep(4);
    };

    const handleFinish = () => {
        completeOnboarding();
        setOnboardingStep(0);
        router.replace('/');
    };

    return (
        <Theme name={theme}>
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} scrollEnabled={false}>
                <YStack f={1} bg="$background">
                    {onboardingStep > 0 && (
                        <XStack position="absolute" top="$4" left="$4" zIndex={10}>
                            <Button
                                icon={ArrowLeft}
                                circular
                                size="$4"
                                backgroundColor="$gray5"
                                pressStyle={{ scale: 0.9 }}
                                onPress={() => setOnboardingStep(onboardingStep - 1)}
                            />
                        </XStack>
                    )}
                    {onboardingStep === 0 && (
                        <Step0_Theme
                            selectedTheme={theme}
                            onSelect={handleThemeSelect}
                            onLogin={() => router.push('/login')}
                        />
                    )}
                    {onboardingStep === 1 && (
                        <Step1_Profile
                            onSelect={handleProfileSelect}
                            onSkip={() => { setUserProfile('personal'); setOnboardingStep(3); }}
                        />
                    )}
                    {onboardingStep === 2 && (
                        <Step2_Control onSelect={handleControlSelect} />
                    )}
                    {onboardingStep === 3 && (
                        <Step3_Permissions
                            onAction={handlePermissions}
                            onSkip={() => setOnboardingStep(4)}
                        />
                    )}
                    {onboardingStep === 4 && (
                        <Step4_CloudSync
                            onRegister={() => router.push('/register')}
                            onLogin={() => router.push('/login')}
                            onSkip={() => setOnboardingStep(5)}
                        />
                    )}
                    {onboardingStep === 5 && (
                        <Step5_Finish onFinish={handleFinish} />
                    )}
                </YStack>
            </ScrollView>
        </Theme>
    );
}
