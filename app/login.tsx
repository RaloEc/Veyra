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
import { Mail, Lock, ChevronLeft, Eye, EyeOff, Shield, AlertCircle } from '@tamagui/lucide-icons';

import { supabase } from '../src/lib/supabase';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraButton } from '../src/components/ui/VeyraButton';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';

import { useStore } from '../src/store/useStore';

export default function LoginScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { colors, typography, accent, isDark } = useVeyraTheme();

    const params = useLocalSearchParams<{ initialEmail?: string }>();
    const [email, setEmail] = useState(params.initialEmail || '');
    const [password, setPassword] = useState('');
    const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    async function signInWithEmail() {
        if (!email.trim() || !password.trim()) {
            setError(t('auth.fill_all_fields'));
            return;
        }
        setLoading(true);
        setLoadingMessage(null);
        setError(null);
        const { data, error: authError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
        });

        if (authError) {
            setError(authError.message);
            setLoading(false);
            setLoadingMessage(null);
        } else {
            if (data?.session) {
                const store = useStore.getState();
                store.setSession(data.session);
                store.setCloudSyncEnabled(true);

                const metaName = data.session.user?.user_metadata?.full_name || data.session.user?.user_metadata?.name || data.session.user?.user_metadata?.settings?.userName;
                if (metaName && !store.userName) {
                    store.setUserName(metaName);
                }

                // Recuperar color de acento personalizado del usuario desde la nube
                const metaAccent = data.session.user?.user_metadata?.settings?.accentTheme || data.session.user?.user_metadata?.accentTheme;
                if (metaAccent) {
                    store.setAccentTheme(metaAccent);
                }

                // Feedback al usuario mientras se recuperan sus datos de la nube
                setLoadingMessage(t('auth.recovering_cloud_data', 'Recuperando datos de la nube...'));

                try {
                    // Sincronización completa inicial con timeout de seguridad (10s)
                    await Promise.race([
                        store.triggerSync(true),
                        new Promise((resolve) => setTimeout(resolve, 10000)),
                    ]);
                } catch (syncErr) {
                    console.warn('[Login] Initial sync warning:', syncErr);
                }
            }
            router.replace('/');
        }
    }

    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'right', 'left']}>
            {/* Header minimalista y sin borde invasivo */}
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
                                            <EyeOff size={18} color={focusedField === 'password' ? accent.primary : colors.textMuted} />
                                        ) : (
                                            <Eye size={18} color={focusedField === 'password' ? accent.primary : colors.textMuted} />
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
                        {/* Login Button */}
                        <VeyraButton
                            variant="primary"
                            size="lg"
                            label={t('auth.login_btn')}
                            loading={loading}
                            disabled={loading}
                            onPress={signInWithEmail}
                        />

                        {loadingMessage && (
                            <View style={styles.loadingFeedbackRow}>
                                <ActivityIndicator size="small" color={accent.primary} />
                                <Text style={[styles.loadingFeedbackText, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                    {loadingMessage}
                                </Text>
                            </View>
                        )}

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
    forgotPasswordRow: {
        alignItems: 'flex-end',
        paddingTop: 2,
    },
    forgotPasswordText: {
        fontWeight: '700',
    },
    loadingFeedbackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingTop: 8,
    },
    loadingFeedbackText: {
        fontWeight: '600',
    },
});
