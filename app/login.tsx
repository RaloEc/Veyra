import React, { useState } from 'react';
import { YStack, XStack, Text, View, Spinner } from 'tamagui';
import { useRouter } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../src/store/useStore';
import { Mail, Lock, ArrowLeft, Eye, EyeOff } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import { TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

export default function LoginScreen() {
    const router = useRouter();
    const { theme } = useStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const { t } = useTranslation();

    const isDark = theme === 'dark';

    const colors = {
        bg: isDark ? '#0a0a0a' : '#F8FAFC',
        textPrimary: isDark ? '#EDEDED' : '#0c0a09',
        textSecondary: isDark ? '#A1A1A1' : '#64748B',
        textMuted: isDark ? '#737373' : '#94A3B8',
        border: isDark ? '#262626' : '#E2E8F0',
        surface: isDark ? '#171717' : '#FFFFFF',
        inputBg: isDark ? '#1f1f1f' : '#f1f5f9',
        accent: '#3b82f6',
        error: '#ef4444',
    };

    async function signInWithEmail() {
        if (!email.trim() || !password.trim()) {
            setError(t('auth.fill_all_fields'));
            return;
        }
        setLoading(true);
        setError(null);
        const { error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
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
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <SafeAreaView style={{ flex: 1 }}>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <ScrollView
                        contentContainerStyle={{ flexGrow: 1 }}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Header con botón de volver */}
                        <YStack px="$5" pt="$3" pb="$2">
                            <TouchableOpacity
                                onPress={() => router.back()}
                                activeOpacity={0.7}
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 12,
                                    backgroundColor: colors.surface,
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <ArrowLeft size={20} color={colors.textPrimary as any} />
                            </TouchableOpacity>
                        </YStack>

                        {/* Contenido principal */}
                        <YStack flex={1} px="$5" jc="center" gap="$8">
                            {/* Título y descripción */}
                            <YStack gap="$2">
                                <Text
                                    fontSize="$9"
                                    fontWeight="900"
                                    color={colors.textPrimary as any}
                                    letterSpacing={-0.5}
                                >
                                    {t('auth.login_title')}
                                </Text>
                                <Text
                                    fontSize="$4"
                                    fontWeight="500"
                                    color={colors.textSecondary as any}
                                    lineHeight={22}
                                >
                                    {t('auth.login_desc')}
                                </Text>
                            </YStack>

                            {/* Formulario */}
                            <YStack gap="$5">
                                {/* Campo Email */}
                                <YStack gap="$2">
                                    <XStack gap="$2" ai="center" px="$1">
                                        <Mail size={14} color={colors.textMuted as any} />
                                        <Text
                                            fontSize="$2"
                                            fontWeight="800"
                                            color={colors.textMuted as any}
                                            textTransform="uppercase"
                                            letterSpacing={0.5}
                                        >
                                            {t('auth.email')}
                                        </Text>
                                    </XStack>
                                    <View
                                        style={{
                                            backgroundColor: colors.inputBg,
                                            borderRadius: 14,
                                            borderWidth: 1.5,
                                            borderColor: colors.border,
                                            paddingHorizontal: 16,
                                            paddingVertical: Platform.OS === 'ios' ? 16 : 4,
                                        }}
                                    >
                                        <TextInput
                                            placeholder={t('auth.email_placeholder')}
                                            placeholderTextColor={colors.textMuted}
                                            value={email}
                                            onChangeText={setEmail}
                                            autoCapitalize="none"
                                            keyboardType="email-address"
                                            autoComplete="email"
                                            style={{
                                                fontSize: 16,
                                                fontWeight: '600',
                                                color: colors.textPrimary,
                                            }}
                                        />
                                    </View>
                                </YStack>

                                {/* Campo Password */}
                                <YStack gap="$2">
                                    <XStack gap="$2" ai="center" px="$1">
                                        <Lock size={14} color={colors.textMuted as any} />
                                        <Text
                                            fontSize="$2"
                                            fontWeight="800"
                                            color={colors.textMuted as any}
                                            textTransform="uppercase"
                                            letterSpacing={0.5}
                                        >
                                            {t('auth.password')}
                                        </Text>
                                    </XStack>
                                    <View
                                        style={{
                                            backgroundColor: colors.inputBg,
                                            borderRadius: 14,
                                            borderWidth: 1.5,
                                            borderColor: colors.border,
                                            paddingHorizontal: 16,
                                            paddingVertical: Platform.OS === 'ios' ? 16 : 4,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <TextInput
                                            placeholder={t('auth.password_placeholder')}
                                            placeholderTextColor={colors.textMuted}
                                            value={password}
                                            onChangeText={setPassword}
                                            secureTextEntry={!showPassword}
                                            autoComplete="password"
                                            style={{
                                                fontSize: 16,
                                                fontWeight: '600',
                                                color: colors.textPrimary,
                                                flex: 1,
                                            }}
                                        />
                                        <TouchableOpacity
                                            onPress={() => setShowPassword(!showPassword)}
                                            activeOpacity={0.7}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        >
                                            {showPassword ? (
                                                <EyeOff size={20} color={colors.textMuted as any} />
                                            ) : (
                                                <Eye size={20} color={colors.textMuted as any} />
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </YStack>

                                {/* Error */}
                                {error && (
                                    <View
                                        style={{
                                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)',
                                            borderRadius: 12,
                                            borderWidth: 1,
                                            borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
                                            padding: 14,
                                        }}
                                    >
                                        <Text
                                            color={colors.error as any}
                                            fontSize="$3"
                                            fontWeight="600"
                                            ta="center"
                                        >
                                            {error}
                                        </Text>
                                    </View>
                                )}

                                {/* Botón de Login */}
                                <TouchableOpacity
                                    onPress={signInWithEmail}
                                    disabled={loading}
                                    activeOpacity={0.85}
                                    style={{
                                        backgroundColor: colors.textPrimary,
                                        borderRadius: 14,
                                        paddingVertical: 18,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        opacity: loading ? 0.7 : 1,
                                        marginTop: 4,
                                    }}
                                >
                                    {loading ? (
                                        <Spinner color={colors.bg as any} />
                                    ) : (
                                        <Text
                                            color={colors.bg as any}
                                            fontWeight="900"
                                            fontSize="$4"
                                            textTransform="uppercase"
                                            letterSpacing={1}
                                        >
                                            {t('auth.login_btn')}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </YStack>
                        </YStack>

                        {/* Footer - Enlace a registro */}
                        <YStack px="$5" pb="$6" pt="$4" ai="center">
                            <XStack gap="$2" ai="center">
                                <Text
                                    fontSize="$3"
                                    fontWeight="500"
                                    color={colors.textMuted as any}
                                >
                                    {t('auth.no_account')}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => router.push('/register')}
                                    activeOpacity={0.7}
                                >
                                    <Text
                                        fontSize="$3"
                                        fontWeight="800"
                                        color={colors.textPrimary as any}
                                    >
                                        {t('auth.go_to_register')}
                                    </Text>
                                </TouchableOpacity>
                            </XStack>
                        </YStack>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}
