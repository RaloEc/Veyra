import React, { useState } from 'react';
import { YStack, XStack, H2, Paragraph, Button, Input, Text, Theme, Spinner } from 'tamagui';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';
import { Mail, Lock, User, ArrowRight } from '@tamagui/lucide-icons';
import { Alert } from 'react-native';

export default function RegisterScreen() {
    const router = useRouter();
    const { theme } = useStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function signUpWithEmail() {
        setLoading(true);
        setError(null);
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            if (!data.session) {
                Alert.alert('Verifica tu correo', 'Te hemos enviado un enlace de confirmación.');
                router.replace('/login');
            } else {
                router.replace('/onboarding');
            }
        }
    }

    return (
        <Theme name={theme}>
            <SafeAreaView style={{ flex: 1, backgroundColor: theme === 'dark' ? '#000' : '#fff' }}>
                <YStack f={1} p="$4" jc="center" gap="$6">
                    <YStack gap="$2" ai="center">
                        <H2 ta="center" size="$9" color="$color">Crear Cuenta</H2>
                        <Paragraph ta="center" size="$5" opacity={0.6}>Únete para no olvidar nada nunca más</Paragraph>
                    </YStack>

                    <YStack gap="$4" w="100%" maxWidth={400} self="center">
                        <YStack gap="$2">
                            <XStack ai="center" bg="$gray3" borderRadius="$4" px="$3">
                                <Mail size={20} color="$gray10" />
                                <Input
                                    f={1}
                                    placeholder="Email"
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    borderWidth={0}
                                    backgroundColor="transparent"
                                />
                            </XStack>
                        </YStack>

                        <YStack gap="$2">
                            <XStack ai="center" bg="$gray3" borderRadius="$4" px="$3">
                                <Lock size={20} color="$gray10" />
                                <Input
                                    f={1}
                                    placeholder="Contraseña"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                    borderWidth={0}
                                    backgroundColor="transparent"
                                />
                            </XStack>
                        </YStack>

                        {error && (
                            <Text color="$red10" ta="center" size="$2">
                                {error}
                            </Text>
                        )}

                        <Button
                            size="$5"
                            theme="active"
                            onPress={signUpWithEmail}
                            disabled={loading}
                            icon={loading ? <Spinner color="white" /> : <ArrowRight color="white" />}
                        >
                            <Text color="white" fontWeight="700">Registrarse</Text>
                        </Button>

                        <XStack jc="center" ai="center" gap="$2" mt="$2">
                            <Text color="$gray10">¿Ya tienes cuenta?</Text>
                            <Button chromeless p={0} onPress={() => router.push('/login')}>
                                <Text color="$blue10" fontWeight="700">Entrar</Text>
                            </Button>
                        </XStack>
                    </YStack>
                </YStack>
            </SafeAreaView>
        </Theme>
    );
}
