import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    StyleSheet,
    ScrollView,
    BackHandler,
    Alert,
    useWindowDimensions,
    Keyboard,
    Platform,
} from 'react-native';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    interpolate,
    Extrapolation,
    Easing as ReanimatedEasing,
    runOnJS,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
    ChevronLeft,
    ChevronDown,
    Sliders,
    Trash2,
    Check,
    Paperclip,
    Camera,
    Bell,
    Calendar as CalendarIcon,
    Repeat,
    CheckSquare,
} from '@tamagui/lucide-icons';
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
    const { id, initialDate, fromMorph, cardHeight } = useLocalSearchParams<{
        id?: string;
        initialDate?: string;
        fromMorph?: string;
        cardHeight?: string;
    }>();
    const { colors, typography, accent, isDark, isAmoled } = useVeyraTheme();
    const { insets } = useScreenInsets();
    const notesInputRef = useRef<TextInput>(null);

    // Contraste óptimo y consistente para temas Light, Dark y AMOLED
    const screenBgColor = isAmoled ? '#000000' : (isDark ? '#121212' : '#F8FAFC');
    const cardBgColor = isAmoled ? '#161616' : (isDark ? '#22242B' : '#FFFFFF');
    const controlBgColor = isAmoled ? '#222222' : (isDark ? '#2D3039' : '#F1F5F9');
    const cardBorderColor = isAmoled ? 'rgba(255, 255, 255, 0.14)' : (isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)');
    const controlBorderColor = isAmoled ? 'rgba(255, 255, 255, 0.18)' : (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)');

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
        isReadOnly,
    } = useCreateReminder(id, initialDate);

    const language = useStore(state => state.language);

    // Estado para controlar el acordeón de opciones avanzadas
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    // Color y etiqueta dinámicos basados en la prioridad seleccionada
    const priorityColor = useMemo(() => {
        switch (controlLevel) {
            case 'critical':
                return isDark ? '#FB7185' : '#EF4444';
            case 'strict':
                return isDark ? '#FBBF24' : '#F59E0B';
            case 'normal':
            default:
                return isDark ? '#94A3B8' : '#64748B';
        }
    }, [controlLevel, isDark]);

    const priorityLabel = useMemo(() => {
        switch (controlLevel) {
            case 'critical':
                return t('create.priority.critical.label', { defaultValue: 'Crítico' });
            case 'strict':
                return t('create.priority.strict.label', { defaultValue: 'Estricto' });
            case 'normal':
            default:
                return t('create.priority.normal.label', { defaultValue: 'Normal' });
        }
    }, [controlLevel, t]);

    const activeAdvancedCount = useMemo(() => {
        let count = 0;
        if (recurrenceType && recurrenceType !== 'none') count++;
        if (subtasks && subtasks.length > 0) count++;
        if (attachments && attachments.length > 0) count++;
        return count;
    }, [recurrenceType, subtasks, attachments]);

    // Autoexpandir opciones avanzadas si el recordatorio a editar ya tiene opciones activas
    useEffect(() => {
        if (isEditing && (recurrenceType !== 'none' || subtasks.length > 0 || attachments.length > 0)) {
            setIsAdvancedOpen(true);
        }
    }, [isEditing]);

    useEffect(() => {
        if (isReadOnly) {
            Alert.alert(
                language === 'es' ? 'Solo lectura' : 'View only',
                language === 'es'
                    ? 'Este recordatorio es compartido en modo solo lectura y no puede modificarse.'
                    : 'This reminder is shared in read-only mode and cannot be edited.'
            );
            navigateBack();
        }
    }, [isReadOnly]);

    // Limpiar etiquetas HTML de descripciones existentes para edición en texto plano elegante
    useEffect(() => {
        if (description && description.includes('<') && description.includes('>')) {
            const plain = extractPlainTextFromPages(description);
            if (plain !== description) {
                setDescription(plain);
            }
        }
    }, []);

    const { height: screenHeight, width: screenWidth } = useWindowDimensions();
    const layoutHeight = useSharedValue(screenHeight);
    const bottomOffset = insets.bottom > 0 ? insets.bottom + 6 : 14;
    const isFromMorph = fromMorph === 'true';
    const initialCardH = isFromMorph && cardHeight ? Math.max(120, Number(cardHeight)) : (58 + bottomOffset);
    const morphedDockWidth = Math.min(screenWidth - 20, 440);
    const dockMarginHorizontal = Math.max(10, Math.round((screenWidth - morphedDockWidth) / 2));

    const isExiting = useRef(false);
    const hasNavigated = useRef(false);
    const morphProgress = useSharedValue(0);

    useEffect(() => {
        morphProgress.value = withTiming(1, {
            duration: 280,
            easing: ReanimatedEasing.bezier(0.16, 1, 0.3, 1),
        });
    }, []);

    const backdropAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(morphProgress.value, [0, 0.8], [0, isDark ? 0.35 : 0.18], Extrapolation.CLAMP),
    }));

    const containerAnimatedStyle = useAnimatedStyle(() => {
        const totalHeight = layoutHeight.value > 0 ? layoutHeight.value : screenHeight;
        const initialH = initialCardH;

        // Comienza exactamente en la coordenada Y de la tarjeta "Crear con Veyra"
        const translateY = interpolate(
            morphProgress.value,
            [0, 1],
            [totalHeight - (initialH + bottomOffset), 0],
            Extrapolation.CLAMP
        );

        // Se expande desde la altura de la tarjeta dock hasta la pantalla completa
        const height = interpolate(
            morphProgress.value,
            [0, 1],
            [initialH, totalHeight],
            Extrapolation.CLAMP
        );

        // Se expande horizontalmente hasta cubrir los bordes de la pantalla
        const marginHorizontal = interpolate(
            morphProgress.value,
            [0, 0.75, 1],
            [dockMarginHorizontal, 4, 0],
            Extrapolation.CLAMP
        );

        // Las 4 esquinas redondeadas pasan de 28px (dock flotante) a 0px (pantalla completa)
        const borderRadius = interpolate(
            morphProgress.value,
            [0, 0.75, 1],
            [28, 14, 0],
            Extrapolation.CLAMP
        );

        return {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height,
            transform: [{ translateY }],
            marginHorizontal,
            borderRadius,
            overflow: 'hidden',
        };
    });

    const safePaddingTopStyle = useAnimatedStyle(() => {
        const pad = interpolate(
            morphProgress.value,
            [0.35, 1],
            [Platform.OS === 'ios' ? 8 : 10, insets.top],
            Extrapolation.CLAMP
        );
        return {
            paddingTop: pad,
        };
    });

    const formAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(morphProgress.value, [0.15, 0.7], [0, 1], Extrapolation.CLAMP),
        transform: [
            {
                translateY: interpolate(morphProgress.value, [0.15, 1], [28, 0], Extrapolation.CLAMP),
            },
        ],
    }));

    const navigateBack = () => {
        if (hasNavigated.current) return;
        hasNavigated.current = true;
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/');
        }
    };

    const handleBack = () => {
        if (isExiting.current) return;
        isExiting.current = true;
        Keyboard.dismiss();
        morphProgress.value = withTiming(
            0,
            {
                duration: 220,
                easing: ReanimatedEasing.bezier(0.4, 0, 0.2, 1),
            },
            (finished) => {
                if (finished) {
                    runOnJS(navigateBack)();
                }
            }
        );
        setTimeout(() => {
            navigateBack();
        }, 240);
    };

    useFocusEffect(
        React.useCallback(() => {
            isExiting.current = false;
            hasNavigated.current = false;
            morphProgress.value = withTiming(1, {
                duration: 280,
                easing: ReanimatedEasing.bezier(0.16, 1, 0.3, 1),
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
                Keyboard.dismiss();
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
            {/* Backdrop oscuro sutil que acompaña la expansión */}
            <TouchableWithoutFeedback onPress={handleBack}>
                <Reanimated.View
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: '#000000' },
                        backdropAnimatedStyle,
                    ]}
                />
            </TouchableWithoutFeedback>

            {/* Contenedor principal que hace morphing desde la tarjeta "Crear con Veyra" */}
            <Reanimated.View
                style={[
                    {
                        backgroundColor: screenBgColor,
                    },
                    containerAnimatedStyle,
                ]}
            >
                <Reanimated.View style={[{ flex: 1 }, safePaddingTopStyle]}>
                    <View style={styles.container}>
                        {/* Header */}
                    <View
                        style={[
                            styles.header,
                            {
                                borderBottomColor: colors.borderSubtle,
                                backgroundColor: cardBgColor,
                            },
                        ]}
                    >
                        <VeyraIconButton
                            variant="ghost"
                            size="sm"
                            icon={<ChevronLeft size={24} color={colors.textPrimary as any} />}
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
                                onPress={() => handleSave()}
                                style={[
                                    styles.headerSaveBtn,
                                    {
                                        backgroundColor: title.trim() ? accent.primary : controlBgColor,
                                        opacity: title.trim() ? 1 : 0.5,
                                    },
                                ]}
                            >
                                <Check size={15} color={(title.trim() ? (isDark ? '#1B1B1B' : '#FFFFFF') : colors.textMuted) as any} strokeWidth={3} />
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

                    {/* Formulario Principal (Básico + Avanzado) con animación */}
                    <Reanimated.View style={[{ flex: 1 }, formAnimatedStyle]}>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={[
                                styles.scrollContent,
                                { paddingBottom: insets.bottom + 48 },
                            ]}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* ─── 1. SECCIÓN BÁSICA: TÍTULO Y NOTAS (HERO CARD) ─── */}
                            <View
                                style={[
                                    styles.sectionCard,
                                    {
                                        backgroundColor: cardBgColor,
                                        borderColor: cardBorderColor,
                                        borderTopColor: priorityColor,
                                        borderTopWidth: 3,
                                    },
                                ]}
                            >
                                <View style={styles.heroTopMeta}>
                                    <View
                                        style={[
                                            styles.typePill,
                                            {
                                                backgroundColor: `${priorityColor}18`,
                                            },
                                        ]}
                                    >
                                        <View style={[styles.statusDot, { backgroundColor: priorityColor }]} />
                                        <Text style={[styles.typePillText, { color: priorityColor }]}>
                                            {t('home.filter_reminders', { defaultValue: 'RECORDATORIO' }).toUpperCase()} • {priorityLabel.toUpperCase()}
                                        </Text>
                                    </View>
                                </View>

                                <TitleInput
                                    title={title}
                                    setTitle={setTitle}
                                    isEditing={isEditing}
                                    isDark={isDark}
                                    flat={true}
                                    placeholder={t('create.placeholder_title')}
                                    onSubmit={() => notesInputRef.current?.focus()}
                                />

                                <View style={[styles.cardInternalDivider, { backgroundColor: colors.borderSubtle }]} />

                                <View style={styles.notesFieldWrapper}>
                                    <TextInput
                                        ref={notesInputRef}
                                        value={description}
                                        onChangeText={setDescription}
                                        placeholder={t('create.notes_placeholder', { defaultValue: 'Añadir notas o detalles adicionales...' })}
                                        placeholderTextColor={colors.textMuted}
                                        multiline
                                        scrollEnabled={false}
                                        style={[
                                            styles.notesInput,
                                            {
                                                color: colors.textPrimary,
                                                fontSize: 14.5,
                                                lineHeight: 21,
                                            },
                                        ]}
                                    />
                                </View>
                            </View>

                            {/* ─── 2. SECCIÓN BÁSICA: FECHA Y HORA ─── */}
                            <View style={styles.sectionWrapper}>
                                <View style={styles.sectionHeader}>
                                    <View style={styles.sectionHeaderLeft}>
                                        <View style={[styles.sectionIconBadge, { backgroundColor: `${accent.primary}18` }]}>
                                            <CalendarIcon size={15} color={accent.primary as any} strokeWidth={2.3} />
                                        </View>
                                        <View>
                                            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                {t('create.sections.date_time', { defaultValue: 'Fecha y Hora' })}
                                            </Text>
                                            <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                {t('create.sections.date_time_sub', { defaultValue: 'Define cuándo debe sonar tu recordatorio' })}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                <View
                                    style={[
                                        styles.sectionCard,
                                        {
                                            backgroundColor: cardBgColor,
                                            borderColor: cardBorderColor,
                                        },
                                    ]}
                                >
                                    <DateTimeSelector
                                        date={date}
                                        setDate={setDate}
                                        flat={true}
                                    />
                                </View>
                            </View>

                            {/* ─── 3. SECCIÓN BÁSICA: NIVEL DE ALERTA / CONTROL ─── */}
                            <View style={styles.sectionWrapper}>
                                <View style={styles.sectionHeader}>
                                    <View style={styles.sectionHeaderLeft}>
                                        <View style={[styles.sectionIconBadge, { backgroundColor: `${accent.primary}18` }]}>
                                            <Bell size={15} color={accent.primary as any} strokeWidth={2.3} />
                                        </View>
                                        <View>
                                            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                {t('create.sections.priority', { defaultValue: 'Nivel de Control' })}
                                            </Text>
                                            <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                {t('create.sections.priority_sub', { defaultValue: 'Configura la insistencia de la alarma' })}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                <View
                                    style={[
                                        styles.sectionCard,
                                        {
                                            backgroundColor: cardBgColor,
                                            borderColor: cardBorderColor,
                                        },
                                    ]}
                                >
                                    <PrioritySelector
                                        controlLevel={controlLevel}
                                        setControlLevel={setControlLevel}
                                        flat={true}
                                    />
                                </View>
                            </View>

                            {/* ─── BOTÓN / HEADER ACORDEÓN: OPCIONES AVANZADAS ─── */}
                            <TouchableOpacity
                                activeOpacity={0.75}
                                onPress={() => setIsAdvancedOpen(prev => !prev)}
                                style={[
                                    styles.advancedAccordionHeader,
                                    {
                                        backgroundColor: cardBgColor,
                                        borderColor: isAdvancedOpen ? accent.primary : cardBorderColor,
                                    },
                                ]}
                            >
                                <View style={styles.advancedAccordionLeft}>
                                    <View style={[styles.advancedIconBadge, { backgroundColor: isAdvancedOpen ? `${accent.primary}25` : `${accent.primary}15` }]}>
                                        <Sliders size={16} color={accent.primary as any} strokeWidth={2.3} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                                            <Text style={[styles.advancedTitle, { color: colors.textPrimary }]}>
                                                {t('create.advanced_options', { defaultValue: 'Opciones avanzadas' })}
                                            </Text>
                                            {activeAdvancedCount > 0 && (
                                                <View style={[styles.advancedCountBadge, { backgroundColor: `${accent.primary}20`, borderColor: `${accent.primary}40` }]}>
                                                    <Text style={[styles.advancedCountText, { color: accent.primary }]}>
                                                        {activeAdvancedCount} {activeAdvancedCount === 1 ? 'activa' : 'activas'}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={[styles.advancedSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                                            {isAdvancedOpen ? 'Toca para contraer' : 'Repetición, subtareas, archivos adjuntos...'}
                                        </Text>
                                    </View>
                                </View>
                                <View style={[styles.advancedChevronCircle, { backgroundColor: controlBgColor }]}>
                                    <ChevronDown
                                        size={16}
                                        color={colors.textSecondary as any}
                                        style={{
                                            transform: [{ rotate: isAdvancedOpen ? '180deg' : '0deg' }],
                                        }}
                                    />
                                </View>
                            </TouchableOpacity>

                            {/* ─── CONTENIDO AVANZADO (COLAPSABLE) ─── */}
                            {isAdvancedOpen && (
                                <View style={styles.advancedContentBlock}>
                                    {/* REPETICIÓN */}
                                    <View style={styles.sectionWrapper}>
                                        <View style={styles.sectionHeader}>
                                            <View style={styles.sectionHeaderLeft}>
                                                <View style={[styles.sectionIconBadge, { backgroundColor: `${accent.primary}18` }]}>
                                                    <Repeat size={15} color={accent.primary as any} strokeWidth={2.3} />
                                                </View>
                                                <View>
                                                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                        {t('create.sections.recurrence', { defaultValue: 'Repetir recordatorio' })}
                                                    </Text>
                                                    <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                        {t('create.sections.recurrence_sub', { defaultValue: 'Frecuencia con la que se repite' })}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>

                                        <View
                                            style={[
                                                styles.sectionCard,
                                                {
                                                    backgroundColor: cardBgColor,
                                                    borderColor: cardBorderColor,
                                                },
                                            ]}
                                        >
                                            <RecurrenceSelector
                                                value={recurrenceType}
                                                onChange={setRecurrenceType}
                                                flat={true}
                                            />
                                        </View>
                                    </View>

                                    {/* SUBTAREAS */}
                                    <View style={styles.sectionWrapper}>
                                        <View style={styles.sectionHeader}>
                                            <View style={styles.sectionHeaderLeft}>
                                                <View style={[styles.sectionIconBadge, { backgroundColor: `${accent.primary}18` }]}>
                                                    <CheckSquare size={15} color={accent.primary as any} strokeWidth={2.3} />
                                                </View>
                                                <View>
                                                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                        {t('create.sections.subtasks', { defaultValue: 'Subtareas' })}
                                                    </Text>
                                                    <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                        {t('create.sections.subtasks_sub', { defaultValue: 'Desglosa tu recordatorio en pasos' })}
                                                    </Text>
                                                </View>
                                            </View>
                                            {subtasks.length > 0 && (
                                                <View style={[styles.counterPill, { backgroundColor: `${accent.primary}18` }]}>
                                                    <Text style={[styles.counterPillText, { color: accent.primary }]}>
                                                        {subtasks.filter(s => s.completed).length}/{subtasks.length}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>

                                        <View
                                            style={[
                                                styles.sectionCard,
                                                {
                                                    backgroundColor: cardBgColor,
                                                    borderColor: cardBorderColor,
                                                },
                                            ]}
                                        >
                                            <SubtasksSection
                                                subtasks={subtasks}
                                                setSubtasks={setSubtasks}
                                                flat={true}
                                            />
                                        </View>
                                    </View>

                                    {/* ADJUNTOS */}
                                    <View style={styles.sectionWrapper}>
                                        <View style={styles.sectionHeader}>
                                            <View style={styles.sectionHeaderLeft}>
                                                <View style={[styles.sectionIconBadge, { backgroundColor: `${accent.primary}18` }]}>
                                                    <Paperclip size={15} color={accent.primary as any} strokeWidth={2.3} />
                                                </View>
                                                <View>
                                                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                        {t('create.sections.multimedia', { defaultValue: 'Adjuntos' })}
                                                    </Text>
                                                    <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                        {t('create.sections.multimedia_sub', { defaultValue: 'Fotos y documentos' })}
                                                    </Text>
                                                </View>
                                            </View>

                                            <View style={styles.attachActionsRow}>
                                                <TouchableOpacity
                                                    activeOpacity={0.7}
                                                    onPress={() => pickImage(false)}
                                                    style={[
                                                        styles.attachQuickBtn,
                                                        {
                                                            backgroundColor: controlBgColor,
                                                            borderColor: controlBorderColor,
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
                                                            backgroundColor: controlBgColor,
                                                            borderColor: controlBorderColor,
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

                                        <View
                                            style={[
                                                styles.sectionCard,
                                                {
                                                    backgroundColor: cardBgColor,
                                                    borderColor: cardBorderColor,
                                                },
                                            ]}
                                        >
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
                                    </View>
                                </View>
                            )}
                        </ScrollView>

                        {/* Alerta de Límite Premium */}
                        <PremiumAlert
                            isVisible={alertVisible}
                            onClose={() => setAlertVisible(false)}
                            title={alertConfig.title}
                            description={alertConfig.description}
                            isDark={isDark}
                        />
                    </Reanimated.View>
                </View>
            </Reanimated.View>
        </Reanimated.View>
    </View>
);
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
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
        paddingHorizontal: 16,
        paddingTop: 16,
        gap: 16,
    },
    sectionCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        gap: 12,
    },
    heroTopMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    typePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    typePillText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.6,
    },
    notesFieldWrapper: {
        minHeight: 40,
    },
    notesInput: {
        paddingVertical: 4,
        paddingHorizontal: 0,
        minHeight: 44,
        textAlignVertical: 'top',
    },
    cardInternalDivider: {
        height: 1,
        width: '100%',
        marginVertical: 2,
    },
    sectionWrapper: {
        gap: 8,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    sectionHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    sectionIconBadge: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    sectionSubtitle: {
        fontSize: 12,
        marginTop: 1,
    },
    counterPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    counterPillText: {
        fontSize: 11,
        fontWeight: '700',
    },
    attachActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    attachQuickBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 12,
        borderWidth: 1,
    },
    attachQuickBtnText: {
        fontSize: 11.5,
        fontWeight: '600',
    },
    advancedAccordionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 16,
        borderWidth: 1,
        marginTop: 4,
    },
    advancedAccordionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    advancedIconBadge: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    advancedTitle: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    advancedSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    advancedCountBadge: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
        borderWidth: 1,
    },
    advancedCountText: {
        fontSize: 11,
        fontWeight: '700',
    },
    advancedChevronCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
    advancedContentBlock: {
        gap: 16,
        marginTop: 4,
    },
});
