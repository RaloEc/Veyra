import React, { useState, useEffect } from 'react';
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
import { Mail, Lock, ChevronLeft, Eye, EyeOff, KeyRound, CheckCircle2 } from '@tamagui/lucide-icons';

import { supabase } from '../src/lib/supabase';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { VeyraButton } from '../src/components/ui/VeyraButton';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';

export default function ForgotPasswordScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ initialEmail?: string }>();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { colors, typography, accent, isDark } = useVeyraTheme();

    const [step, setStep] = useState<'request' | 'verify'>('request');
    const [email, setEmail] = useState(params.initialEmail || '');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [resendCooldown, setResendCooldown] = useState(0);

    // Temporizador de enfriamiento para reenviar código
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => {
            setResendCooldown(prev => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    // Paso 1: Enviar correo con el código OTP
    async function handleSendOtp() {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setError(t('auth.fill_all_fields'));
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
            if (resetError) {
                setError(resetError.message);
            } else {
                setStep('verify');
                setSuccessMessage(t('auth.code_sent_notice'));
                setResendCooldown(45);
            }
        } catch (e: any) {
            setError(e?.message || 'Error al enviar código');
        } finally {
            setLoading(false);
        }
    }

    // Paso 2: Verificar OTP y cambiar contraseña
    async function handleVerifyAndUpdatePassword() {
        const trimmedOtp = otp.trim();
        if (!trimmedOtp || !newPassword.trim() || !confirmPassword.trim()) {
            setError(t('auth.fill_all_fields'));
            return;
        }

        if (newPassword.length < 6) {
            setError(t('auth.password_too_short'));
            return;
        }

        if (newPassword !== confirmPassword) {
            setError(t('auth.passwords_dont_match'));
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // 1. Validar el OTP de tipo 'recovery'
            const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
                email: email.trim(),
                token: trimmedOtp,
                type: 'recovery',
            });

            if (verifyError) {
                setError(t('auth.otp_invalid'));
                setLoading(false);
                return;
            }

            // 2. Actualizar la contraseña del usuario autenticado en la sesión temporal
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (updateError) {
                setError(updateError.message);
                setLoading(false);
                return;
            }

            // 3. Éxito: notificar y redirigir
            setSuccessMessage(t('auth.password_updated_success'));
            setTimeout(() => {
                router.replace('/login');
            }, 1500);
        } catch (e: any) {
            setError(e?.message || 'Error al actualizar contraseña');
            setLoading(false);
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
                    onPress={() => {
                        if (step === 'verify') {
                            setStep('request');
                            setError(null);
                        } else {
                            router.back();
                        }
                    }}
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
                                {step === 'request' ? t('auth.forgot_password_title') : t('auth.otp_step_title')}
                            </Text>
                            <Text style={[styles.subheading, { color: colors.textSecondary, fontSize: typography.body.fontSize }]}>
                                {step === 'request'
                                    ? t('auth.forgot_password_desc')
                                    : t('auth.otp_step_desc')}
                            </Text>
                        </View>

                        {/* Fields */}
                        <View style={styles.fieldsStack}>
                            {step === 'request' ? (
                                /* Paso 1: Email */
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
                            ) : (
                                /* Paso 2: OTP y Nueva Contraseña */
                                <>
                                    {/* Email indicator badge */}
                                    <View style={[styles.emailBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
                                        <Mail size={14} color={accent.primary as any} />
                                        <Text style={[styles.emailBadgeText, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                            {email}
                                        </Text>
                                    </View>

                                    {/* OTP Code */}
                                    <View style={styles.inputGroup}>
                                        <View style={styles.inputLabelRow}>
                                            <KeyRound size={14} color={colors.textMuted} />
                                            <Text style={[styles.inputLabelText, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                                {t('auth.otp_code')}
                                            </Text>
                                        </View>
                                        <TextInput
                                            placeholder={t('auth.otp_placeholder')}
                                            placeholderTextColor={colors.textMuted}
                                            value={otp}
                                            onChangeText={setOtp}
                                            keyboardType="number-pad"
                                            maxLength={8}
                                            style={[
                                                styles.otpInput,
                                                {
                                                    backgroundColor: colors.surfaceElevated,
                                                    borderColor: colors.borderSubtle,
                                                    color: colors.textPrimary,
                                                },
                                            ]}
                                            selectionColor={accent.primary}
                                        />
                                    </View>

                                    {/* New Password */}
                                    <View style={styles.inputGroup}>
                                        <View style={styles.inputLabelRow}>
                                            <Lock size={14} color={colors.textMuted} />
                                            <Text style={[styles.inputLabelText, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                                {t('auth.new_password')}
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
                                                placeholder={t('auth.new_password_placeholder')}
                                                placeholderTextColor={colors.textMuted}
                                                value={newPassword}
                                                onChangeText={setNewPassword}
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
                                                    <EyeOff size={18} color={colors.textMuted} />
                                                ) : (
                                                    <Eye size={18} color={colors.textMuted} />
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    {/* Confirm New Password */}
                                    <View style={styles.inputGroup}>
                                        <View style={styles.inputLabelRow}>
                                            <Lock size={14} color={colors.textMuted} />
                                            <Text style={[styles.inputLabelText, { color: colors.textMuted, fontSize: typography.micro.fontSize }]}>
                                                {t('auth.confirm_password')}
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
                                                placeholder={t('auth.confirm_password_placeholder')}
                                                placeholderTextColor={colors.textMuted}
                                                value={confirmPassword}
                                                onChangeText={setConfirmPassword}
                                                secureTextEntry={!showConfirmPassword}
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
                                                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                                activeOpacity={0.7}
                                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                            >
                                                {showConfirmPassword ? (
                                                    <EyeOff size={18} color={colors.textMuted} />
                                                ) : (
                                                    <Eye size={18} color={colors.textMuted} />
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </>
                            )}

                            {/* Success Notification */}
                            {successMessage && (
                                <VeyraSurface
                                    level={1}
                                    radius="md"
                                    style={[
                                        styles.successCard,
                                        {
                                            backgroundColor: isDark ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)',
                                            borderColor: 'rgba(34, 197, 94, 0.3)',
                                        },
                                    ]}
                                >
                                    <CheckCircle2 size={16} color="#22C55E" />
                                    <Text style={[styles.successText, { color: isDark ? '#4ADE80' : '#16A34A', fontSize: typography.caption.fontSize }]}>
                                        {successMessage}
                                    </Text>
                                </VeyraSurface>
                            )}

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
                        {step === 'request' ? (
                            <VeyraButton
                                variant="primary"
                                size="lg"
                                label={t('auth.send_code')}
                                disabled={loading}
                                onPress={handleSendOtp}
                            />
                        ) : (
                            <>
                                <VeyraButton
                                    variant="primary"
                                    size="lg"
                                    label={t('auth.verify_and_update')}
                                    disabled={loading}
                                    onPress={handleVerifyAndUpdatePassword}
                                />
                                <TouchableOpacity
                                    onPress={handleSendOtp}
                                    disabled={resendCooldown > 0 || loading}
                                    style={styles.resendButton}
                                    activeOpacity={0.7}
                                >
                                    <Text
                                        style={[
                                            styles.resendText,
                                            {
                                                color: resendCooldown > 0 ? colors.textMuted : accent.primary,
                                                fontSize: typography.caption.fontSize,
                                            },
                                        ]}
                                    >
                                        {resendCooldown > 0
                                            ? t('auth.resend_in', { seconds: resendCooldown })
                                            : t('auth.resend_code')}
                                    </Text>
                                </TouchableOpacity>
                            </>
                        )}

                        {/* Regresar al Login */}
                        <View style={styles.footerRow}>
                            <TouchableOpacity
                                onPress={() => router.replace('/login')}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.footerLink, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
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
        borderBottomWidth: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 24,
    },
    formContainer: {
        gap: 24,
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
        gap: 16,
    },
    emailBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
    },
    emailBadgeText: {
        fontWeight: '600',
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
    otpInput: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontWeight: '800',
        fontSize: 22,
        textAlign: 'center',
        letterSpacing: 8,
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
    successCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        borderWidth: 1,
    },
    successText: {
        fontWeight: '600',
        flex: 1,
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
        gap: 14,
        paddingTop: 24,
    },
    resendButton: {
        alignItems: 'center',
        paddingVertical: 4,
    },
    resendText: {
        fontWeight: '700',
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 8,
    },
    footerLink: {
        fontWeight: '600',
    },
});
