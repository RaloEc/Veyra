import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, ChevronLeft, Eye, EyeOff } from '@tamagui/lucide-icons';

import { supabase } from '../src/lib/supabase';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraButton } from '../src/components/ui/VeyraButton';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';

export default function LoginScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { colors, typography, accent, isDark } = useVeyraTheme();

    const params = useLocalSearchParams<{ initialEmail?: string }>();
    const [email, setEmail] = useState(params.initialEmail || '');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    async function signInWithEmail() {
        if (!email.trim() || !password.trim()) {
            setError(t('auth.fill_all_fields'));
            return;
        }
        setLoading(true);
        setError(null);
        const { error: authError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
        });

        if (authError) {
            setError(authError.message);
            setLoading(false);
        } else {
            router.replace('/');
        }
    }

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
                <View style={{ flex: 1 }} />
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.formContainer}>
                        {/* Title group */}
                        <View style={styles.titleGroup}>
                            <Text style={[styles.heading, { color: colors.textPrimary, fontSize: typography.h1.fontSize }]}>
                                {t('auth.login_title')}
                            </Text>
                            <Text style={[styles.subheading, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                {t('auth.login_desc')}
                            </Text>
                        </View>

                        {/* Fields */}
                        <View style={styles.fieldsStack}>
                            {/* Email */}
                            <View style={styles.inputGroup}>
                                <View style={styles.inputLabelRow}>
                                    <Mail size={14} color={colors.textMuted} />
                                    <Text style={[styles.inputLabelText, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                        {t('auth.email')}
                                    </Text>
                                </View>
                                <TextInput
                                    placeholder={t('auth.email_placeholder')}
                                    placeholderTextColor={colors.textMuted}
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    autoComplete="email"
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

                            {/* Password */}
                            <View style={styles.inputGroup}>
                                <View style={styles.inputLabelRow}>
                                    <Lock size={14} color={colors.textMuted} />
                                    <Text style={[styles.inputLabelText, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                        {t('auth.password')}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.passwordFieldRow,
                                        {
                                            backgroundColor: colors.surfaceElevated,
                                            borderColor: colors.borderSubtle,
                                        },
                                    ]}
                                >
                                    <TextInput
                                        placeholder={t('auth.password_placeholder')}
                                        placeholderTextColor={colors.textMuted}
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry={!showPassword}
                                        autoComplete="password"
                                        style={[
                                            styles.passwordInput,
                                            {
                                                color: colors.textPrimary,
                                                fontSize: typography.body.fontSize,
                                            },
                                        ]}
                                        selectionColor={accent.primary}
                                    />
                                    <TouchableOpacity
                                        onPress={() => setShowPassword(!showPassword)}
                                        activeOpacity={0.7}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        {showPassword ? (
                                            <EyeOff size={18} color={colors.textMuted} />
                                        ) : (
                                            <Eye size={18} color={colors.textMuted} />
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Forgot Password link */}
                            <View style={styles.forgotPasswordRow}>
                                <TouchableOpacity
                                    onPress={() => router.push({ pathname: '/forgot-password', params: { initialEmail: email.trim() } })}
                                    activeOpacity={0.7}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Text style={[styles.forgotPasswordText, { color: accent.primary, fontSize: typography.caption.fontSize }]}>
                                        {t('auth.forgot_password')}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* Error Alert */}
                            {error && (
                                <VeyraSurface
                                    level={1}
                                    radius="md"
                                    style={[
                                        styles.errorCard,
                                        {
                                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                                            borderColor: 'rgba(239, 68, 68, 0.25)',
                                        },
                                    ]}
                                >
                                    <Text style={[styles.errorText, { color: isDark ? '#FB7185' : '#E11D48', fontSize: typography.caption.fontSize }]}>
                                        {error}
                                    </Text>
                                </VeyraSurface>
                            )}
                        </View>
                    </View>

                    {/* Zona inferior de interacción ergonómica One UI */}
                    <View style={styles.interactionZone}>
                        {/* Login Button */}
                        <VeyraButton
                            variant="primary"
                            size="lg"
                            label={t('auth.login_btn')}
                            disabled={loading}
                            onPress={signInWithEmail}
                        />

                        {/* Footer */}
                        <View style={styles.footerRow}>
                            <Text style={[styles.footerText, { color: colors.textMuted, fontSize: typography.caption.fontSize }]}>
                                {t('auth.no_account')}
                            </Text>
                            <TouchableOpacity
                                onPress={() => router.push('/register')}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.footerLink, { color: accent.primary, fontSize: typography.caption.fontSize }]}>
                                    {t('auth.go_to_register')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 24,
    },
    formContainer: {
        gap: 28,
    },
    titleGroup: {
        gap: 8,
    },
    heading: {
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    subheading: {
        lineHeight: 22,
    },
    fieldsStack: {
        gap: 18,
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
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 14,
        fontWeight: '600',
    },
    passwordFieldRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    passwordInput: {
        flex: 1,
        fontWeight: '600',
        padding: 0,
    },
    errorCard: {
        padding: 12,
        borderWidth: 1,
    },
    errorText: {
        fontWeight: '600',
        textAlign: 'center',
    },
    interactionZone: {
        gap: 16,
        paddingTop: 24,
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        paddingTop: 20,
    },
    footerText: {
        fontWeight: '500',
    },
    footerLink: {
        fontWeight: '800',
    },
    forgotPasswordRow: {
        alignItems: 'flex-end',
        paddingTop: 2,
    },
    forgotPasswordText: {
        fontWeight: '700',
    },
});
