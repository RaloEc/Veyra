import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    BackHandler,
    Alert,
    useWindowDimensions,
} from 'react-native';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    interpolate,
    interpolateColor,
    Extrapolation,
    Easing as ReanimatedEasing,
    runOnJS,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Trash2, Check, Paperclip, Camera, Bell, Notebook, Plus } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { useScreenInsets } from '../src/hooks/useScreenInsets';
import { useStore } from '../src/store/useStore';
import { useCreateReminder } from '../src/hooks/useCreateReminder';
import { TitleInput } from '../src/components/create/TitleInput';
import { PrioritySelector } from '../src/components/create/PrioritySelector';
import { DateTimeSelector } from '../src/components/create/DateTimeSelector';
import { AttachmentsSection } from '../src/components/create/AttachmentsSection';
import { RecurrenceSelector } from '../src/components/create/RecurrenceSelector';
import { SubtasksSection } from '../src/components/create/SubtasksSection';
import { PremiumAlert } from '../src/components/ui/PremiumAlert';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraIconButton } from '../src/components/ui';
import { extractPlainTextFromPages } from '../src/utils/pageUtils';

export default function CreateScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { id, initialDate } = useLocalSearchParams<{ id?: string; initialDate?: string }>();
    const { colors, typography, accent, isDark } = useVeyraTheme();
    const { insets, bottom: bottomInset } = useScreenInsets();
    const { height: screenHeight } = useWindowDimensions();
    const layoutHeight = useSharedValue(screenHeight);
    const notesInputRef = useRef<TextInput>(null);

    const {
        title,
        setTitle,
        description,
        setDescription,
        attachments,
        subtasks,
        setSubtasks,
        date,
        setDate,
        controlLevel,
        setControlLevel,
        showPicker,
        setShowPicker,
        isEditing,
        pickImage,
        pickDocument,
        openAttachment,
        removeAttachment,
        handleSave,
        handleDelete,
        recurrenceType,
        setRecurrenceType,
        MAX_ATTACHMENTS,
        alertVisible,
        setAlertVisible,
        alertConfig,
    } = useCreateReminder(id, initialDate);

    // Limpiar etiquetas HTML de descripciones existentes para edición en texto plano elegante
    useEffect(() => {
        if (description && description.includes('<') && description.includes('>')) {
            const plain = extractPlainTextFromPages(description);
            if (plain !== description) {
                setDescription(plain);
            }
        }
    }, []);

    const language = useStore(state => state.language);
    const bottomPadding = Math.max(bottomInset, 10);
    const barHeight = 58 + bottomPadding;
    const barBgColor = colors.navBar || (isDark ? '#1B1B1B' : '#FFFFFF');

    const morphProgress = useSharedValue(0);
    const isExiting = useRef(false);

    useEffect(() => {
        morphProgress.value = withTiming(1, {
            duration: 210,
            easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
        });
    }, []);

    const containerAnimatedStyle = useAnimatedStyle(() => {
        const totalHeight = layoutHeight.value > 0 ? layoutHeight.value : screenHeight;
        return {
            transform: [
                {
                    translateY: interpolate(
                        morphProgress.value,
                        [0, 1],
                        [totalHeight - barHeight, 0],
                        Extrapolation.CLAMP
                    ),
                },
            ],
        };
    });

    const formAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            morphProgress.value,
            [0.2, 0.9],
            [0, 1],
            Extrapolation.CLAMP
        ),
    }));

    const morphPreviewAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(
            morphProgress.value,
            [0, 0.18],
            [1, 0],
            Extrapolation.CLAMP
        ),
    }));

    const navigateBack = () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/');
        }
    };

    const handleBack = () => {
        if (isExiting.current) return;
        isExiting.current = true;
        morphProgress.value = withTiming(
            0,
            {
                duration: 180,
                easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
            },
            (finished) => {
                if (finished) {
                    runOnJS(navigateBack)();
                }
            }
        );
        setTimeout(() => {
            navigateBack();
        }, 150);
    };

    useFocusEffect(
        React.useCallback(() => {
            isExiting.current = false;
            morphProgress.value = withTiming(1, {
                duration: 210,
                easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
            });

            const onHardwareBack = () => {
                if (showPicker) {
                    setShowPicker(false);
                    return true;
                }
                if (alertVisible) {
                    setAlertVisible(false);
                    return true;
                }
                handleBack();
                return true;
            };
            const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
            return () => subscription.remove();
        }, [showPicker, alertVisible])
    );

    return (
        <View
            style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
            onLayout={(e) => {
                const h = Math.round(e.nativeEvent.layout.height);
                if (h > 0) {
                    layoutHeight.value = h;
                }
            }}
        >
            <Reanimated.View
                style={[
                    styles.screen,
                    {
                        backgroundColor: colors.bg,
                        borderTopColor: colors.borderSubtle,
                    },
                    containerAnimatedStyle,
                ]}
            >
                {/* Formulario de Creación (se desvanece suavemente en el morph) */}
                <Reanimated.View style={[{ flex: 1 }, formAnimatedStyle]}>
                <SafeAreaView style={styles.screen} edges={['top', 'right', 'left']}>
                    <View style={styles.container}>
                        {/* Header */}
                        <View
                            style={[
                                styles.header,
                                {
                                    borderBottomColor: colors.borderSubtle,
                                },
                            ]}
                        >
                    <VeyraIconButton
                        variant="ghost"
                        size="sm"
                        icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                        onPress={handleBack}
                    />
                    <Text style={[styles.headerTitle, { color: colors.textPrimary, fontSize: typography.h2.fontSize }]}>
                        {isEditing ? t('create.title_edit') : t('create.title_new')}
                    </Text>

                    <View style={styles.headerActions}>
                        {isEditing && (
                            <VeyraIconButton
                                variant="danger"
                                size="sm"
                                icon={<Trash2 size={17} color={isDark ? '#FB7185' : '#E11D48'} />}
                                onPress={() => {
                                    Alert.alert(
                                        t('home.delete_reminder_q', { defaultValue: '¿Eliminar recordatorio?' }),
                                        t('home.action_irreversible', { defaultValue: 'Esta acción no se puede deshacer.' }),
                                        [
                                            { text: t('common.cancel', { defaultValue: 'Cancelar' }), style: 'cancel' },
                                            {
                                                text: t('common.delete', { defaultValue: 'Eliminar' }),
                                                style: 'destructive',
                                                onPress: handleDelete,
                                            },
                                        ]
                                    );
                                }}
                            />
                        )}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            disabled={!title.trim()}
                            onPress={handleSave}
                            style={[
                                styles.headerSaveBtn,
                                {
                                    backgroundColor: title.trim() ? accent.primary : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'),
                                    opacity: title.trim() ? 1 : 0.45,
                                },
                            ]}
                        >
                            <Check size={15} color={title.trim() ? (isDark ? '#1B1B1B' : '#FFFFFF') : colors.textMuted} strokeWidth={3} />
                            <Text
                                style={[
                                    styles.headerSaveText,
                                    {
                                        color: title.trim() ? (isDark ? '#1B1B1B' : '#FFFFFF') : colors.textMuted,
                                    },
                                ]}
                            >
                                {t('common.save', { defaultValue: 'Guardar' })}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Formulario Principal */}
                <View style={{ flex: 1 }}>
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[
                            styles.scrollContent,
                            { paddingBottom: insets.bottom + 48 },
                        ]}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* Bloque Título y Notas (Compacto, directo en el lienzo) */}
                        <View style={styles.textFieldsBlock}>
                            <TitleInput
                                title={title}
                                setTitle={setTitle}
                                isEditing={isEditing}
                                isDark={isDark}
                                flat={true}
                                placeholder={t('create.placeholder_title')}
                                onSubmit={() => notesInputRef.current?.focus()}
                            />

                            <TextInput
                                ref={notesInputRef}
                                value={description}
                                onChangeText={setDescription}
                                placeholder={t('create.notes_placeholder', { defaultValue: 'Añadir notas o detalles...' })}
                                placeholderTextColor={colors.textMuted}
                                multiline
                                scrollEnabled={false}
                                style={[
                                    styles.notesInput,
                                    {
                                        color: colors.textPrimary,
                                        fontSize: 15,
                                        lineHeight: 22,
                                    },
                                ]}
                            />
                        </View>

                        {/* Línea divisoria sutil */}
                        <View style={[styles.subtleDivider, { backgroundColor: colors.borderSubtle }]} />

                        {/* ─── SECCIÓN: CUÁNDO (FECHA, HORA, REPETICIÓN) ─── */}
                        <View style={styles.sectionBlock}>
                            <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                {t('create.sections.date_time', { defaultValue: 'FECHA Y HORA' }).toUpperCase()}
                            </Text>

                            <DateTimeSelector
                                date={date}
                                setDate={setDate}
                                flat={true}
                            />

                            <View style={styles.recurrenceRow}>
                                <RecurrenceSelector
                                    value={recurrenceType}
                                    onChange={setRecurrenceType}
                                    flat={true}
                                />
                            </View>
                        </View>

                        {/* ─── SECCIÓN: NIVEL DE CONTROL ─── */}
                        <View style={styles.sectionBlock}>
                            <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                {t('create.sections.priority', { defaultValue: 'NIVEL DE CONTROL' }).toUpperCase()}
                            </Text>

                            <PrioritySelector
                                controlLevel={controlLevel}
                                setControlLevel={setControlLevel}
                                flat={true}
                            />
                        </View>

                        {/* ─── SECCIÓN: SUBTAREAS ─── */}
                        <View style={styles.sectionBlock}>
                            <SubtasksSection
                                subtasks={subtasks}
                                setSubtasks={setSubtasks}
                                flat={true}
                            />
                        </View>

                        {/* ─── SECCIÓN: ADJUNTOS ─── */}
                        <View style={styles.sectionBlock}>
                            <View style={styles.attachmentsHeaderRow}>
                                <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.caption.fontSize }]}>
                                    {t('create.sections.multimedia', { defaultValue: 'ADJUNTOS' }).toUpperCase()}
                                </Text>

                                <View style={styles.attachActionsRow}>
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={() => pickImage(false)}
                                        style={[
                                            styles.attachQuickBtn,
                                            {
                                                backgroundColor: colors.surfaceElevated,
                                                borderColor: colors.borderSubtle,
                                            },
                                        ]}
                                    >
                                        <Camera size={13} color={colors.textSecondary as any} />
                                        <Text style={[styles.attachQuickBtnText, { color: colors.textSecondary }]}>
                                            {t('create.attachments.photo', { defaultValue: 'Foto' })}
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        onPress={pickDocument}
                                        style={[
                                            styles.attachQuickBtn,
                                            {
                                                backgroundColor: colors.surfaceElevated,
                                                borderColor: colors.borderSubtle,
                                            },
                                        ]}
                                    >
                                        <Paperclip size={13} color={colors.textSecondary as any} />
                                        <Text style={[styles.attachQuickBtnText, { color: colors.textSecondary }]}>
                                            {t('create.attachments.file', { defaultValue: 'Archivo' })}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <AttachmentsSection
                                attachments={attachments}
                                MAX_ATTACHMENTS={MAX_ATTACHMENTS}
                                pickImage={pickImage}
                                pickDocument={pickDocument}
                                openAttachment={openAttachment}
                                removeAttachment={removeAttachment}
                                isDark={isDark}
                                flat={true}
                            />
                        </View>
                    </ScrollView>

                    {/* Alerta de Límite Premium */}
                    <PremiumAlert
                        isVisible={alertVisible}
                        onClose={() => setAlertVisible(false)}
                        title={alertConfig.title}
                        description={alertConfig.description}
                        isDark={isDark}
                    />
                    </View>
                </View>
            </SafeAreaView>
        </Reanimated.View>

            {/* Vista previa de la barra inferior (se fusiona hacia la barra inferior al colapsar) */}
            <Reanimated.View
                pointerEvents="none"
                style={[
                    styles.morphBottomBar,
                    {
                        height: barHeight,
                        paddingBottom: bottomPadding,
                        backgroundColor: barBgColor,
                    },
                    morphPreviewAnimatedStyle,
                ]}
            >
                <View style={styles.morphBarContent}>
                    {/* 1. Tab Recordatorios */}
                    <View style={styles.morphTabButton}>
                        <View style={styles.morphIconContainer}>
                            <Bell size={22} color={accent.primary as any} strokeWidth={2.5} />
                        </View>
                        <Text style={[styles.morphTabLabel, { color: accent.primary }]}>
                            {language === 'es' ? 'Recordatorios' : 'Reminders'}
                        </Text>
                    </View>

                    {/* 2. FAB Central (+) */}
                    <View style={styles.morphFabSlot}>
                        <View style={[styles.morphFabButton, { backgroundColor: accent.primary }]}>
                            <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
                        </View>
                    </View>

                    {/* 3. Tab Notas */}
                    <View style={styles.morphTabButton}>
                        <View style={styles.morphIconContainer}>
                            <Notebook size={22} color={colors.textMuted as any} strokeWidth={2} />
                        </View>
                        <Text style={[styles.morphTabLabel, { color: colors.textMuted }]}>
                            {language === 'es' ? 'Notas' : 'Notes'}
                        </Text>
                    </View>
                </View>
            </Reanimated.View>
        </Reanimated.View>
    </View>
);
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: 1,
    },
    morphBottomBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    morphBarContent: {
        height: 58,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: 24,
    },
    morphTabButton: {
        minWidth: 80,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingVertical: 4,
    },
    morphIconContainer: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        height: 24,
    },
    morphTabLabel: {
        fontSize: 11,
        letterSpacing: 0.1,
        fontWeight: '500',
    },
    morphFabSlot: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -16,
    },
    morphFabButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 6,
    },
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        zIndex: 100,
    },
    headerTitle: {
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerSaveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
    },
    headerSaveText: {
        fontSize: 13.5,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 16,
        gap: 20,
    },
    textFieldsBlock: {
        gap: 8,
    },
    notesInput: {
        paddingVertical: 4,
        paddingHorizontal: 0,
        minHeight: 44,
        textAlignVertical: 'top',
    },
    subtleDivider: {
        height: 1,
        width: '100%',
        marginVertical: 2,
    },
    sectionBlock: {
        gap: 10,
    },
    sectionTitle: {
        fontWeight: '700',
        letterSpacing: 0.8,
    },
    recurrenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    attachmentsHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    attachActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    attachQuickBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        borderWidth: 1,
    },
    attachQuickBtnText: {
        fontSize: 12,
        fontWeight: '600',
    },
});
