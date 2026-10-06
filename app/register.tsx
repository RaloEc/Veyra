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
    Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Linking from 'expo-linking';
import { Mail, Lock, ChevronLeft, Eye, EyeOff, User, Shield, AlertCircle } from '@tamagui/lucide-icons';

import { supabase } from '../src/lib/supabase';
import { useStore } from '../src/store/useStore';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraButton } from '../src/components/ui/VeyraButton';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';

export default function RegisterScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { colors, typography, accent, isDark } = useVeyraTheme();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [focusedField, setFocusedField] = useState<'name' | 'email' | 'password' | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    async function signUpWithEmail() {
        const trimmedName = name.trim();
        const trimmedEmail = email.trim();

        if (!trimmedName || !trimmedEmail || !password.trim()) {
            setError(t('auth.fill_all_fields'));
            return;
        }
        if (password.length < 6) {
            setError(t('auth.password_too_short'));
            return;
        }

        setLoading(true);
        setError(null);

        const emailRedirectTo = Linking.createURL('/onboarding');
        const { data, error: authError } = await supabase.auth.signUp({
            email: trimmedEmail,
            password,
            options: {
                emailRedirectTo,
                data: {
                    name: trimmedName,
                    full_name: trimmedName,
                    settings: {
                        userName: trimmedName,
                        accentTheme: useStore.getState().accentTheme || 'blue',
                    },
                },
            },
        });

        setLoading(false);

        if (authError) {
            setError(authError.message);
        } else if (data?.user) {
            useStore.getState().setUserName(trimmedName);
            useStore.getState().setCloudSyncEnabled(true);
            if (data?.session) {
                useStore.getState().setSession(data.session);
                router.replace('/onboarding');
            } else {
                Alert.alert(
                    t('auth.verify_email_title', 'Verifica tu correo'),
                    t('auth.verify_email_desc', 'Te hemos enviado un enlace de confirmación a tu correo. Por favor verifícalo para activar tu cuenta e iniciar sesión.'),
                    [
                        {
                            text: 'OK',
                            onPress: () => router.replace('/login'),
                        },
                    ]
                );
            }
        }
    }

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'right', 'left']}>
            {/* Header minimalista sin borde divisorio */}
            <View style={styles.header}>
                <VeyraIconButton
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                    onPress={() => router.back()}
                />
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
                        {/* Title group con branding de Veyra */}
                        <View style={styles.titleGroup}>
                            <View style={styles.brandRow}>
                                <View style={[styles.brandBadge, { backgroundColor: `${accent.primary}18`, borderColor: `${accent.primary}35` }]}>
                                    <Shield size={12} color={accent.primary} />
                                    <Text style={[styles.brandBadgeText, { color: accent.primary }]}>
                                        VEYRA
                                    </Text>
                                </View>
                            </View>

                            <Text style={[styles.heading, { color: colors.textPrimary, fontSize: typography.h1.fontSize }]}>
                                {t('auth.register_title')}
                            </Text>
                            <Text style={[styles.subheading, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                {t('auth.register_desc')}
                            </Text>
                        </View>

                        {/* Fields */}
                        <View style={styles.fieldsStack}>
                            {/* Nombre */}
                            <View style={styles.inputGroup}>
                                <View style={styles.inputLabelRow}>
                                    <User size={14} color={focusedField === 'name' ? accent.primary : colors.textMuted} />
                                    <Text style={[styles.inputLabelText, { color: focusedField === 'name' ? accent.primary : colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                        {t('auth.name', { defaultValue: 'Nombre' })}
                                    </Text>
                                </View>
                                <TextInput
                                    placeholder={t('auth.name_placeholder', { defaultValue: 'Tu nombre' })}
                                    placeholderTextColor={colors.textMuted}
                                    value={name}
                                    onChangeText={setName}
                                    onFocus={() => setFocusedField('name')}
                                    onBlur={() => setFocusedField(null)}
                                    autoCapitalize="words"
                                    autoComplete="name"
                                    style={[
                                        styles.inputField,
                                        {
                                            backgroundColor: colors.surfaceElevated,
                                            borderColor: focusedField === 'name' ? accent.primary : colors.borderSubtle,
                                            color: colors.textPrimary,
                                            fontSize: typography.body.fontSize,
                                        },
                                    ]}
                                    selectionColor={accent.primary}
                                />
                            </View>

                            {/* Email */}
                            <View style={styles.inputGroup}>
                                <View style={styles.inputLabelRow}>
                                    <Mail size={14} color={focusedField === 'email' ? accent.primary : colors.textMuted} />
                                    <Text style={[styles.inputLabelText, { color: focusedField === 'email' ? accent.primary : colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                        {t('auth.email')}
                                    </Text>
                                </View>
                                <TextInput
                                    placeholder={t('auth.email_placeholder')}
                                    placeholderTextColor={colors.textMuted}
                                    value={email}
                                    onChangeText={setEmail}
                                    onFocus={() => setFocusedField('email')}
                                    onBlur={() => setFocusedField(null)}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    autoComplete="email"
                                    style={[
                                        styles.inputField,
                                        {
                                            backgroundColor: colors.surfaceElevated,
                                            borderColor: focusedField === 'email' ? accent.primary : colors.borderSubtle,
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
                                    <Lock size={14} color={focusedField === 'password' ? accent.primary : colors.textMuted} />
                                    <Text style={[styles.inputLabelText, { color: focusedField === 'password' ? accent.primary : colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                        {t('auth.password')}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.passwordFieldRow,
                                        {
                                            backgroundColor: colors.surfaceElevated,
                                            borderColor: focusedField === 'password' ? accent.primary : colors.borderSubtle,
                                        },
                                    ]}
                                >
                                    <TextInput
                                        placeholder={t('auth.password_placeholder')}
                                        placeholderTextColor={colors.textMuted}
                                        value={password}
                                        onChangeText={setPassword}
                                        onFocus={() => setFocusedField('password')}
                                        onBlur={() => setFocusedField(null)}
                                        secureTextEntry={!showPassword}
                                        autoComplete="new-password"
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
                                            <EyeOff size={18} color={focusedField === 'password' ? accent.primary : colors.textMuted} />
                                        ) : (
                                            <Eye size={18} color={focusedField === 'password' ? accent.primary : colors.textMuted} />
                                        )}
                                    </TouchableOpacity>
                                </View>
                                <Text style={[styles.passwordHintText, { color: colors.textMuted, fontSize: typography.caption.fontSize }]}>
                                    {t('auth.password_hint')}
                                </Text>
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
                                            borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
                                        },
                                    ]}
                                >
                                    <AlertCircle size={16} color={isDark ? '#FB7185' : '#E11D48'} />
                                    <Text style={[styles.errorText, { color: isDark ? '#FB7185' : '#E11D48', fontSize: typography.caption.fontSize }]}>
                                        {error}
                                    </Text>
                                </VeyraSurface>
                            )}
                        </View>
                    </View>

                    {/* Zona inferior de interacción ergonómica */}
                    <View style={styles.interactionZone}>
                        {/* Register Button */}
                        <VeyraButton
                            variant="primary"
                            size="lg"
                            label={t('auth.register_btn')}
                            loading={loading}
                            disabled={loading}
                            onPress={signUpWithEmail}
                        />

                        {/* Footer */}
                        <View style={styles.footerRow}>
                            <Text style={[styles.footerText, { color: colors.textMuted, fontSize: typography.caption.fontSize }]}>
                                {t('auth.already_have_account')}
                            </Text>
                            <TouchableOpacity
                                onPress={() => router.push('/login')}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.footerLink, { color: accent.primary, fontSize: typography.caption.fontSize }]}>
                                    {t('auth.go_to_login')}
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
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 12,
    },
    formContainer: {
        gap: 28,
    },
    titleGroup: {
        gap: 8,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    brandBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
    },
    brandBadgeText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.2,
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
    passwordHintText: {
        fontWeight: '500',
        paddingHorizontal: 2,
    },
    errorCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        borderWidth: 1,
    },
    errorText: {
        flex: 1,
        fontWeight: '600',
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
        paddingTop: 16,
    },
    footerText: {
        fontWeight: '500',
    },
    footerLink: {
        fontWeight: '800',
    },
});
