import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Modal,
    KeyboardAvoidingView,
    Platform,
    Keyboard,
    TouchableWithoutFeedback,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Check, Sparkles, ChevronRight, Hash, Clock, X } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import { useVeyraTheme } from '../theme/useVeyraTheme';
import { useCreateReminder } from '../hooks/useCreateReminder';
import { looksLikeBirthday } from '../utils/birthdayDetector';
import { extractHashtags } from '../utils/hashtagParser';
import { format, addHours, addDays, setHours, setMinutes, startOfTomorrow } from 'date-fns';
import { es } from 'date-fns/locale';

interface QuickAddSheetProps {
    visible: boolean;
    onClose: () => void;
}

export function QuickAddSheet({ visible, onClose }: QuickAddSheetProps) {
    const router = useRouter();
    const { colors, typography, radii, accent, isDark } = useVeyraTheme();
    const inputRef = useRef<TextInput | null>(null);

    const {
        title,
        setTitle,
        date,
        setDate,
        handleSave,
        tags,
        setTags,
        handleTitleBlur,
    } = useCreateReminder();

    const [selectedPreset, setSelectedPreset] = useState<'tonight' | 'tomorrow' | 'plus_1h' | 'plus_30m'>('tonight');

    // Auto-focus y limpieza al abrir
    useEffect(() => {
        if (visible) {
            setTitle('');
            setTags([]);
            setSelectedPreset('tonight');
            applyPreset('tonight');
            const timeout = setTimeout(() => {
                inputRef.current?.focus();
            }, 150);
            return () => clearTimeout(timeout);
        }
    }, [visible]);

    const applyPreset = (preset: 'tonight' | 'tomorrow' | 'plus_1h' | 'plus_30m') => {
        setSelectedPreset(preset);
        const now = new Date();
        let target = new Date();

        if (preset === 'tonight') {
            target = setHours(setMinutes(now, 0), 20);
            if (target < now) {
                target = addDays(target, 1);
            }
        } else if (preset === 'tomorrow') {
            target = setHours(setMinutes(startOfTomorrow(), 0), 9);
        } else if (preset === 'plus_1h') {
            target = addHours(now, 1);
        } else if (preset === 'plus_30m') {
            target = new Date(now.getTime() + 30 * 60 * 1000);
        }
        setDate(target);
    };

    const isBirthday = looksLikeBirthday(title);

    const handleQuickSave = async () => {
        if (!title.trim()) return;
        await handleSave({ skipNavigateBack: true });
        setTitle('');
        setTags([]);
        onClose();
    };

    const handleMoreOptions = () => {
        onClose();
        router.push({
            pathname: '/create',
            params: {
                initialDate: date.toISOString(),
            },
        });
    };

    const handleSwitchToEvent = () => {
        onClose();
        router.push({
            pathname: '/events/create',
            params: {
                title,
                isBirthday: 'true',
            },
        });
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback onPress={() => {}}>
                        <KeyboardAvoidingView
                            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                            style={styles.keyboardContainer}
                        >
                            <View
                                style={[
                                    styles.sheet,
                                    {
                                        backgroundColor: colors.surface,
                                        borderColor: colors.borderSubtle,
                                    },
                                ]}
                            >
                                {/* Header */}
                                <View style={styles.headerRow}>
                                    <View style={styles.headerTitleRow}>
                                        <Sparkles size={16} color={accent.primary} />
                                        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                                            Creación Rápida
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={onClose}
                                        style={styles.closeBtn}
                                    >
                                        <X size={18} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                </View>

                                {/* Banner si parece cumpleaños */}
                                {isBirthday && (
                                    <View
                                        style={[
                                            styles.birthdayBanner,
                                            {
                                                backgroundColor: isDark
                                                    ? 'rgba(236, 72, 153, 0.15)'
                                                    : 'rgba(236, 72, 153, 0.08)',
                                                borderColor: isDark
                                                    ? 'rgba(236, 72, 153, 0.35)'
                                                    : 'rgba(236, 72, 153, 0.25)',
                                            },
                                        ]}
                                    >
                                        <Text style={{ fontSize: 18 }}>🎂</Text>
                                        <View style={{ flex: 1, marginLeft: 8 }}>
                                            <Text style={[styles.birthdayBannerTitle, { color: colors.textPrimary }]}>
                                                ¿Crear como evento anual?
                                            </Text>
                                            <Text style={[styles.birthdayBannerSub, { color: colors.textSecondary }]}>
                                                Se repetirá automáticamente cada año.
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            onPress={handleSwitchToEvent}
                                            style={styles.birthdaySwitchBtn}
                                        >
                                            <Text style={styles.birthdaySwitchBtnText}>Crear evento</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {/* Input de título con detector en vivo de hashtags */}
                                <View style={styles.inputBox}>
                                    <TextInput
                                        ref={inputRef}
                                        value={title}
                                        onChangeText={setTitle}
                                        onBlur={handleTitleBlur}
                                        placeholder="¿Qué deseas recordar? (ej: #trabajo comprar agua)"
                                        placeholderTextColor={colors.textMuted}
                                        style={[styles.mainInput, { color: colors.textPrimary }]}
                                        returnKeyType="done"
                                        onSubmitEditing={handleQuickSave}
                                    />
                                </View>

                                {/* Chips de fecha rápida */}
                                <View style={styles.presetsRow}>
                                    {[
                                        { key: 'tonight', label: 'Hoy 20:00' },
                                        { key: 'tomorrow', label: 'Mañana 9:00' },
                                        { key: 'plus_1h', label: '+1 hora' },
                                        { key: 'plus_30m', label: '+30 min' },
                                    ].map((preset) => {
                                        const isSelected = selectedPreset === preset.key;
                                        return (
                                            <TouchableOpacity
                                                key={preset.key}
                                                activeOpacity={0.7}
                                                onPress={() => applyPreset(preset.key as any)}
                                                style={[
                                                    styles.presetChip,
                                                    {
                                                        backgroundColor: isSelected
                                                            ? (isDark ? 'rgba(139, 92, 246, 0.25)' : 'rgba(139, 92, 246, 0.12)')
                                                            : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'),
                                                        borderColor: isSelected ? accent.primary : colors.borderSubtle,
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.presetChipText,
                                                        {
                                                            color: isSelected ? accent.primary : colors.textSecondary,
                                                            fontWeight: isSelected ? '700' : '500',
                                                        },
                                                    ]}
                                                >
                                                    {preset.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {/* Footer con Más Opciones y Guardar */}
                                <View style={styles.footerRow}>
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={handleMoreOptions}
                                        style={styles.moreOptionsBtn}
                                    >
                                        <Text style={[styles.moreOptionsText, { color: colors.textSecondary }]}>
                                            Más opciones
                                        </Text>
                                        <ChevronRight size={14} color={colors.textMuted} />
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        disabled={!title.trim()}
                                        onPress={handleQuickSave}
                                        style={[
                                            styles.saveBtn,
                                            {
                                                backgroundColor: title.trim() ? accent.primary : colors.borderSubtle,
                                                opacity: title.trim() ? 1 : 0.5,
                                            },
                                        ]}
                                    >
                                        <Check size={16} color={isDark ? '#121212' : '#FFFFFF'} strokeWidth={3} />
                                        <Text style={[styles.saveBtnText, { color: isDark ? '#121212' : '#FFFFFF' }]}>
                                            Guardar
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </KeyboardAvoidingView>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    keyboardContainer: {
        width: '100%',
    },
    sheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        padding: 20,
        paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    sheetTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    closeBtn: {
        padding: 4,
    },
    birthdayBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    birthdayBannerTitle: {
        fontSize: 12,
        fontWeight: '700',
    },
    birthdayBannerSub: {
        fontSize: 11,
        marginTop: 2,
    },
    birthdaySwitchBtn: {
        backgroundColor: '#EC4899',
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 8,
    },
    birthdaySwitchBtnText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
    },
    inputBox: {
        marginBottom: 14,
    },
    mainInput: {
        fontSize: 17,
        fontWeight: '500',
        paddingVertical: 8,
    },
    presetsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 16,
    },
    presetChip: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
    },
    presetChipText: {
        fontSize: 12,
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    moreOptionsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 6,
    },
    moreOptionsText: {
        fontSize: 13,
        fontWeight: '500',
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        paddingHorizontal: 18,
        borderRadius: 10,
        gap: 6,
    },
    saveBtnText: {
        fontSize: 14,
        fontWeight: '700',
    },
});

