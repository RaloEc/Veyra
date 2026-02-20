import React, { useState } from 'react';
import { YStack, XStack, H2, Paragraph, Button, Input, Text, Theme, Spinner } from 'tamagui';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';
import { Mail, Lock, ArrowRight } from '@tamagui/lucide-icons';

export default function LoginScreen() {
    const router = useRouter();
    const { theme } = useStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function signInWithEmail() {
        setLoading(true);
        setError(null);
        const { error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            router.replace('/');
        }
    }

    return (
        <Theme name={theme}>
            <SafeAreaView style={{ flex: 1, backgroundColor: theme === 'dark' ? '#000' : '#fff' }}>
                <YStack f={1} p="$4" jc="center" gap="$6">
                    <YStack gap="$2" ai="center">
                        <H2 ta="center" size="$9" color="$color">Bienvenido</H2>
                        <Paragraph ta="center" size="$5" opacity={0.6}>Inicia sesión para sincronizar tus recordatorios</Paragraph>
                    </YStack>

                    <YStack gap="$4" w="100%" maxWidth={400} alignSelf="center">
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
                            <Text color="$red10" ta="center" fontSize="$2">
                                {error}
                            </Text>
                        )}

                        <Button
                            size="$5"
                            theme="active"
                            onPress={signInWithEmail}
                            disabled={loading}
                            icon={loading ? <Spinner color="white" /> : <ArrowRight color="white" />}
                        >
                            <Text color="white" fontWeight="700">Entrar</Text>
                        </Button>

                        <XStack jc="center" ai="center" gap="$2" mt="$2">
                            <Text color="$gray10">¿No tienes cuenta?</Text>
                            <Button chromeless p={0} onPress={() => router.push('/register')}>
                                <Text color="$blue10" fontWeight="700">Regístrate</Text>
                            </Button>
                        </XStack>

                        <Button chromeless size="$4" onPress={() => router.back()} mt="$4">
                            Volver
                        </Button>
                    </YStack>
                </YStack>
            </SafeAreaView>
        </Theme>
    );
}
