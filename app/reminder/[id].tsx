import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    Platform,
    Alert,
    Animated,
    BackHandler,
    TextInput,
    Share,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { format, isPast, isToday, differenceInMinutes, addHours, addDays, setHours, setMinutes } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import RenderHTML from 'react-native-render-html';
import ImageViewing from 'react-native-image-viewing';
import { Image as ExpoImage } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import {
    ChevronLeft,
    Edit3,
    Trash2,
    Check,
    Clock,
    Zap,
    Repeat,
    FileText,
    AlertTriangle,
    CheckSquare,
    Square,
    MoreVertical,
    X,
    Calendar,
    Share2,
    Plus,
    RotateCcw,
    Shield,
    Copy,
    ChevronRight,
    ChevronDown,
    Paperclip,
    Users,
} from '@tamagui/lucide-icons';

import { Subtask, Reminder } from '../../src/types/db';
import { parseNotePages, extractPlainTextFromPages } from '../../src/utils/pageUtils';
import { useStore } from '../../src/store/useStore';
import { useVeyraTheme } from '../../src/theme/useVeyraTheme';
import {
    VeyraSurface,
    VeyraButton,
    VeyraIconButton,
    VeyraBadge,
    VeyraDivider,
} from '../../src/components/ui';
import { ShareModal } from '../../src/components/collaboration/ShareModal';
import { CollaboratorsAvatars } from '../../src/components/collaboration/CollaboratorsAvatars';
import Reanimated, {
    SharedTransition,
} from 'react-native-reanimated';

const reminderSharedTransition = SharedTransition.duration(320);


function HtmlImageRenderer({ tnode }: any) {
    const { src, 'data-size': dataSize, 'data-align': dataAlign, 'data-rotate': dataRotate, 'data-flip': dataFlip } = tnode.attributes || {};
    if (!src) return null;

    const { width: windowWidth } = useWindowDimensions();
    const contentWidth = windowWidth - 48;

    let targetWidth = contentWidth;
    if (dataSize) {
        if (dataSize.endsWith('%')) {
            const pct = parseFloat(dataSize) / 100;
            if (!isNaN(pct) && pct > 0) targetWidth = contentWidth * pct;
        } else if (dataSize.endsWith('px')) {
            const px = parseFloat(dataSize);
            if (!isNaN(px) && px > 0) targetWidth = Math.min(contentWidth, px);
        }
    } else {
        const inlineWidth = tnode.styles?.nativeBlockRet?.width || tnode.styles?.nativeTextFlow?.width;
        if (typeof inlineWidth === 'string' && inlineWidth.endsWith('%')) {
            const pct = parseFloat(inlineWidth) / 100;
            if (!isNaN(pct) && pct > 0) targetWidth = contentWidth * pct;
        } else if (typeof inlineWidth === 'number' && inlineWidth > 0) {
            targetWidth = Math.min(contentWidth, inlineWidth);
        }
    }

    const isLeft = dataAlign === 'left' || tnode.classes?.includes('img-align-left');
    const isRight = dataAlign === 'right' || tnode.classes?.includes('img-align-right');
    const alignContainer = isLeft ? 'flex-start' : isRight ? 'flex-end' : 'center';

    const rotate = parseInt(dataRotate || '0', 10) || 0;
    const flip = parseInt(dataFlip || '1', 10) || 1;

    const [aspectRatio, setAspectRatio] = useState<number>(4 / 3);

    useEffect(() => {
        if (src) {
            Image.getSize(
                src,
                (imgW, imgH) => {
                    if (imgW > 0 && imgH > 0) {
                        setAspectRatio(imgW / imgH);
                    }
                },
                () => {}
            );
        }
    }, [src]);

    return (
        <View style={{ width: '100%', alignItems: alignContainer, marginVertical: 12 }}>
            <ExpoImage
                source={{ uri: src }}
                style={{
                    width: targetWidth,
                    aspectRatio: aspectRatio,
                    borderRadius: 14,
                    transform: [{ scaleX: flip }, { rotate: `${rotate}deg` }],
                }}
                contentFit="contain"
            />
        </View>
    );
}

const htmlRenderers = {
    img: HtmlImageRenderer,
};

export default function ReminderDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const windowWidth = width;
    const windowHeight = height;
    const { colors, typography, radii, accent, isDark, getControlLevelColor } = useVeyraTheme();

    const reminders = useStore(state => state.reminders);
    const history = useStore(state => state.history);
    const markAsCompleted = useStore(state => state.markAsCompleted);
    const markAsPending = useStore(state => state.markAsPending);
    const snoozeReminder = useStore(state => state.snoozeReminder);
    const deleteReminder = useStore(state => state.deleteReminder);
    const toggleSubtask = useStore(state => state.toggleSubtask);
    const updateReminder = useStore(state => state.updateReminder);
    const addReminder = useStore(state => state.addReminder);
    const language = useStore(state => state.language);
    const locale = language === 'es' ? es : enUS;

    const reminderFromStore = useMemo(() => {
        return reminders.find(r => r.id === id) || history.find(h => h.id === id) || null;
    }, [id, reminders, history]);

    const lastReminderRef = useRef<Reminder | null>(null);
    if (reminderFromStore) {
        lastReminderRef.current = reminderFromStore;
    }
    const reminder = reminderFromStore || lastReminderRef.current;

    const [galleryImages, setGalleryImages] = useState<{ uri: string }[]>([]);
    const [galleryIndex, setGalleryIndex] = useState(0);
    const [galleryVisible, setGalleryVisible] = useState(false);

    // Modals
    const [isOptionsModalVisible, setIsOptionsModalVisible] = useState(false);
    const [isSnoozeModalVisible, setIsSnoozeModalVisible] = useState(false);
    const [isRescheduleModalVisible, setIsRescheduleModalVisible] = useState(false);
    const [isShareModalVisible, setIsShareModalVisible] = useState(false);

    const handleShareReminder = () => {
        setIsShareModalVisible(true);
    };

    // Quick Add Subtask State
    const [isAddingSubtask, setIsAddingSubtask] = useState(false);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

    // Collapsible Subtasks State
    const [isSubtasksExpanded, setIsSubtasksExpanded] = useState(true);
    const subtasksAnim = useRef(new Animated.Value(1)).current;

    const toggleSubtasksExpand = () => {
        const next = !isSubtasksExpanded;
        setIsSubtasksExpanded(next);
        Animated.spring(subtasksAnim, {
            toValue: next ? 1 : 0,
            tension: 70,
            friction: 8,
            useNativeDriver: true,
        }).start();
    };

    // Animaciones
    const headerAnim = useRef(new Animated.Value(0)).current;
    const contentAnim = useRef(new Animated.Value(0)).current;
    const bottomBarAnim = useRef(new Animated.Value(0)).current;

    // Animaciones de completado suave
    const [isCompleting, setIsCompleting] = useState(false);
    const completeScaleAnim = useRef(new Animated.Value(1)).current;
    const completeCheckScaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.stagger(40, [
            Animated.timing(headerAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.spring(contentAnim, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
            Animated.spring(bottomBarAnim, { toValue: 1, tension: 65, friction: 8, useNativeDriver: true }),
        ]).start();
    }, []);

    const isExiting = useRef(false);

    useFocusEffect(
        React.useCallback(() => {
            isExiting.current = false;
            headerAnim.setValue(1);
            contentAnim.setValue(1);
            bottomBarAnim.setValue(1);

            const onHardwareBack = () => {
                handleBack();
                return true;
            };
            const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
            return () => subscription.remove();
        }, [])
    );

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
        navigateBack();
    };

    const handleComplete = async () => {
        if (isCompleting || isExiting.current || !reminder) return;
        setIsCompleting(true);

        Animated.parallel([
            Animated.sequence([
                Animated.timing(completeScaleAnim, { toValue: 0.94, duration: 80, useNativeDriver: true }),
                Animated.spring(completeScaleAnim, { toValue: 1.05, friction: 3, tension: 160, useNativeDriver: true }),
                Animated.timing(completeScaleAnim, { toValue: 1, duration: 90, useNativeDriver: true }),
            ]),
            Animated.sequence([
                Animated.timing(completeCheckScaleAnim, { toValue: 0.3, duration: 60, useNativeDriver: true }),
                Animated.spring(completeCheckScaleAnim, { toValue: 1.25, friction: 4, tension: 180, useNativeDriver: true }),
                Animated.timing(completeCheckScaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
            ]),
        ]).start();

        setTimeout(async () => {
            handleBack();
            await markAsCompleted(reminder.id);
        }, 300);
    };

    // Attachments parser (Hook must be called unconditionally)
    const parsedAttachments = useMemo(() => {
        if (!reminder?.attachments) return [];
        try {
            const parsed = JSON.parse(reminder.attachments);
            return Array.isArray(parsed) ? parsed.map((att: any, idx: number) => {
                const uri = typeof att === 'string' ? att : att.uri;
                const name = typeof att === 'string' ? (att.split('/').pop() || `Archivo ${idx + 1}`) : (att.name || `Archivo ${idx + 1}`);
                return { uri, name };
            }) : [];
        } catch {
            return [];
        }
    }, [reminder?.attachments]);

    const imageAttachments = parsedAttachments.filter(item => {
        const uri = item.uri.toLowerCase();
        return (
            uri.includes('imagepicker') ||
            uri.endsWith('.jpg') ||
            uri.endsWith('.png') ||
            uri.endsWith('.jpeg') ||
            uri.endsWith('.webp') ||
            uri.startsWith('data:image') ||
            uri.startsWith('file://')
        );
    });

    const otherAttachments = parsedAttachments.filter(item => !imageAttachments.includes(item));

    // Subtasks parser (Hook must be called unconditionally)
    const parsedSubtasks: Subtask[] = useMemo(() => {
        if (!reminder?.subtasks) return [];
        try {
            const list = JSON.parse(reminder.subtasks);
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }, [reminder?.subtasks]);

    const completedSubtasksCount = parsedSubtasks.filter(s => s.completed).length;
    const progressPercent = parsedSubtasks.length > 0 ? (completedSubtasksCount / parsedSubtasks.length) * 100 : 0;

    if (!reminder) {
        return (
            <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
                <View style={styles.header}>
                    <VeyraIconButton
                        variant="ghost"
                        size="sm"
                        icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                        onPress={() => {
                            if (router.canGoBack()) {
                                router.back();
                            } else {
                                router.replace('/');
                            }
                        }}
                    />
                </View>
                <View style={styles.emptyContainer}>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                        {t('home.no_tasks')}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    const dueDate = new Date(reminder.due_date_ms);
    const isOverdue = isPast(reminder.due_date_ms) && reminder.status === 'pending';
    const isCompleted = reminder.status === 'completed';

    // Time difference / countdown
    const diffMinutes = differenceInMinutes(reminder.due_date_ms, Date.now());
    const absDiff = Math.abs(diffMinutes);

    let relativeTimeText = '';
    if (absDiff < 60) {
        relativeTimeText = `${absDiff}m`;
    } else if (absDiff < 1440) {
        const h = Math.floor(absDiff / 60);
        const m = absDiff % 60;
        relativeTimeText = m > 0 ? `${h}h ${m}m` : `${h}h`;
    } else {
        const d = Math.floor(absDiff / 1440);
        relativeTimeText = `${d}d`;
    }

    let statusCountdownLabel = '';
    if (isCompleted) {
        statusCountdownLabel = language === 'es' ? 'Completado' : 'Completed';
    } else if (diffMinutes < 0) {
        statusCountdownLabel = language === 'es' ? `vencido hace ${relativeTimeText}` : `overdue by ${relativeTimeText}`;
    } else {
        statusCountdownLabel = language === 'es' ? `en ${relativeTimeText}` : `in ${relativeTimeText}`;
    }

    // Recurrence label
    let repeatLabel = null;
    if (reminder.repeat_rule) {
        try {
            const parsed = JSON.parse(reminder.repeat_rule);
            if (parsed.type && parsed.type !== 'none') {
                repeatLabel = t(`create.recurrence_${parsed.type}`, { defaultValue: parsed.type });
            }
        } catch {}
    }

    // Quick Add Subtask Handler
    const handleAddSubtask = async () => {
        if (!newSubtaskTitle.trim() || !reminder) return;
        const newSubtask: Subtask = {
            id: 'st_' + Date.now().toString(36),
            title: newSubtaskTitle.trim(),
            completed: false,
        };
        const updatedList = [...parsedSubtasks, newSubtask];
        await updateReminder(reminder.id, { subtasks: JSON.stringify(updatedList) });
        setNewSubtaskTitle('');
        setIsAddingSubtask(false);
    };

    // Quick Reschedule Handler
    const handleReschedule = async (targetDate: Date) => {
        if (!reminder) return;
        setIsRescheduleModalVisible(false);
        await updateReminder(reminder.id, {
            due_date_ms: targetDate.getTime(),
            status: 'pending',
        });
    };

    // Share Reminder as plain text
    const handleNativeShareReminder = async () => {
        if (!reminder) return;
        try {
            const dateStr = format(dueDate, language === 'es' ? "EEEE d 'de' MMMM, yyyy • HH:mm" : "EEEE, MMMM d, yyyy • HH:mm", { locale });
            const cleanDesc = extractPlainTextFromPages(reminder.description);

            let msg = `📌 ${reminder.title}\n`;
            msg += `⏰ ${dateStr}\n`;
            msg += `🛡️ Control: ${(reminder.control_level || 'normal').toUpperCase()}\n`;

            if (cleanDesc) {
                msg += `\n📝 Notas:\n${cleanDesc}\n`;
            }

            if (parsedSubtasks.length > 0) {
                msg += `\n☑️ Subtareas (${completedSubtasksCount}/${parsedSubtasks.length}):\n`;
                parsedSubtasks.forEach(s => {
                    msg += `  ${s.completed ? '[x]' : '[ ]'} ${s.title}\n`;
                });
            }

            msg += `\n— Veyra`;

            await Share.share({
                title: reminder.title,
                message: msg,
            });
        } catch (e) {
            console.error('Error sharing reminder', e);
        }
    };

    // Duplicate Reminder
    const handleDuplicate = async () => {
        if (!reminder) return;
        setIsOptionsModalVisible(false);
        const dupTitle = language === 'es' ? `${reminder.title} (Copia)` : `${reminder.title} (Copy)`;
        await addReminder(
            dupTitle,
            reminder.due_date_ms,
            reminder.control_level || 'normal',
            reminder.description,
            reminder.repeat_rule,
            reminder.attachments,
            reminder.links,
            reminder.subtasks
        );
        handleBack();
    };

    const handleDelete = () => {
        Alert.alert(
            t('home.delete_reminder_q'),
            t('home.action_irreversible'),
            [
                { text: t('home.cancel'), style: 'cancel' },
                {
                    text: t('home.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        handleBack();
                        await deleteReminder(reminder.id);
                    },
                },
            ]
        );
    };

    const openAttachment = async (uri: string) => {
        try {
            if (Platform.OS === 'android') {
                const cUri = await FileSystem.getContentUriAsync(uri);
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                    data: cUri,
                    flags: 1,
                });
            } else if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri);
            }
        } catch {
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri);
            }
        }
    };

    const controlColor = getControlLevelColor(reminder.control_level);

    return (
        <Reanimated.View
            sharedTransitionTag={`reminder-card-${id}`}
            sharedTransitionStyle={reminderSharedTransition}
            style={[styles.screenContainer, { backgroundColor: colors.bg }]}
        >
            <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
            {/* ─── TOP BAR MINIMALISTA ─── */}
            <Animated.View
                style={[
                    styles.header,
                    {
                        borderBottomColor: colors.borderSubtle,
                        opacity: headerAnim,
                    },
                ]}
            >
                <VeyraIconButton
                    variant="ghost"
                    size="sm"
                    icon={<ChevronLeft size={24} color={colors.textPrimary} />}
                    onPress={handleBack}
                />

                <View style={styles.headerRightActions}>
                    {reminder && (
                        <CollaboratorsAvatars
                            targetType="reminder"
                            targetId={reminder.id}
                            onPress={handleShareReminder}
                        />
                    )}

                    <VeyraIconButton
                        variant="ghost"
                        size="sm"
                        icon={<Share2 size={19} color={colors.textSecondary} />}
                        onPress={handleShareReminder}
                    />

                    <VeyraIconButton
                        variant="ghost"
                        size="sm"
                        icon={<Edit3 size={19} color={colors.textSecondary} />}
                        onPress={() => router.push({ pathname: '/create', params: { id: reminder.id } })}
                    />

                    <VeyraIconButton
                        variant="ghost"
                        size="sm"
                        icon={<MoreVertical size={20} color={colors.textSecondary} />}
                        onPress={() => setIsOptionsModalVisible(true)}
                    />
                </View>
            </Animated.View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
            >
                <Animated.View style={{ opacity: contentAnim, gap: 20 }}>
                    {/* ─── HERO HEADER SIN CAJAS (EDITORIAL & LIMPIO) ─── */}
                    <View style={styles.heroSection}>
                        {/* Meta Tags Row */}
                        <View style={styles.metaRow}>
                            <View style={[styles.controlPill, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)' }]}>
                                <View style={[styles.controlDot, { backgroundColor: controlColor.main }]} />
                                <Text style={[styles.controlPillText, { color: colors.textSecondary }]}>
                                    {reminder.control_level ? (language === 'es' ? (reminder.control_level === 'critical' ? 'Crítico' : reminder.control_level === 'strict' ? 'Estricto' : 'Normal') : reminder.control_level.charAt(0).toUpperCase() + reminder.control_level.slice(1)) : 'Normal'}
                                </Text>
                            </View>

                            {(isCompleted || isCompleting) && (
                                <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(16, 185, 129, 0.12)' }]}>
                                    <Check size={11} color={isDark ? '#34D399' : '#10B981'} strokeWidth={3} />
                                    <Text style={[styles.statusBadgeText, { color: isDark ? '#34D399' : '#10B981' }]}>
                                        {language === 'es' ? 'Completado' : 'Completed'}
                                    </Text>
                                </View>
                            )}

                            {repeatLabel && (
                                <View style={[styles.repeatPill, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)' }]}>
                                    <Repeat size={11} color={colors.textMuted} />
                                    <Text style={[styles.repeatPillText, { color: colors.textSecondary }]}>
                                        {repeatLabel}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Title Large & Clean */}
                        <Text
                            style={[
                                styles.title,
                                { color: (isCompleted || isCompleting) ? (isDark ? '#34D399' : '#10B981') : colors.textPrimary },
                                (isCompleted || isCompleting) && { textDecorationLine: 'line-through', opacity: 0.75 },
                            ]}
                        >
                            {reminder.title}
                        </Text>

                        {/* Interactive Schedule Bar */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => setIsRescheduleModalVisible(true)}
                            style={[
                                styles.dateButton,
                                {
                                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                                    borderColor: isOverdue ? (isDark ? 'rgba(251, 113, 133, 0.3)' : 'rgba(225, 29, 72, 0.25)') : colors.borderSubtle,
                                },
                            ]}
                        >
                            <View style={styles.dateButtonLeft}>
                                <Clock
                                    size={15}
                                    color={isOverdue ? (isDark ? '#FB7185' : '#E11D48') : isCompleted ? (isDark ? '#34D399' : '#10B981') : accent.primary}
                                />
                                <Text style={[styles.dateButtonMainText, { color: colors.textPrimary }]}>
                                    {format(dueDate, language === 'es' ? "EEEE d 'de' MMMM, yyyy • HH:mm" : "EEEE, MMMM d, yyyy • HH:mm", { locale })}
                                </Text>
                                <Text
                                    style={[
                                        styles.dateButtonSubText,
                                        {
                                            color: isOverdue
                                                ? (isDark ? '#FB7185' : '#E11D48')
                                                : isCompleted
                                                ? (isDark ? '#34D399' : '#10B981')
                                                : colors.textMuted,
                                        },
                                    ]}
                                >
                                    • {statusCountdownLabel}
                                </Text>
                            </View>

                            <ChevronRight size={15} color={colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <VeyraDivider style={{ opacity: 0.7 }} />

                    {/* ─── DESCRIPCIÓN / NOTAS (DIRECTO EN EL LIENZO) ─── */}
                    {reminder.description ? (
                        <View style={styles.sectionBlock}>
                            <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>
                                {t('create.sections.notes', { defaultValue: 'Notas' })}
                            </Text>

                            <View style={styles.documentBody}>
                                <RenderHTML
                                    contentWidth={width - 48}
                                    source={{ html: parseNotePages(reminder.description).pages.map(p => p.content).join('<hr style="border:none;height:16px;" />') }}
                                    renderers={htmlRenderers}
                                    baseStyle={{
                                        color: colors.textPrimary,
                                        fontSize: 15.5,
                                        lineHeight: 25,
                                    }}
                                    classesStyles={{
                                        'img-align-left': { alignSelf: 'flex-start' },
                                        'img-align-center': { alignSelf: 'center' },
                                        'img-align-right': { alignSelf: 'flex-end' },
                                    }}
                                    tagsStyles={{
                                        p: { marginTop: 0, marginBottom: 12 },
                                        h1: { fontSize: 20, fontWeight: '800', marginTop: 12, marginBottom: 6, color: colors.textPrimary },
                                        h2: { fontSize: 17, fontWeight: '700', marginTop: 10, marginBottom: 4, color: colors.textPrimary },
                                        ul: { marginBottom: 12, paddingLeft: 18 },
                                        ol: { marginBottom: 12, paddingLeft: 18 },
                                        li: { marginBottom: 5 },
                                    }}
                                />
                            </View>
                        </View>
                    ) : null}

                    {/* ─── SUBTAREAS / CHECKLIST (DESPLEGABLE & RESPIRABLE) ─── */}
                    {parsedSubtasks.length > 0 && (
                        <View style={styles.sectionBlock}>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={toggleSubtasksExpand}
                                style={styles.subtasksHeaderRow}
                            >
                                <View style={styles.subtasksHeaderLeft}>
                                    <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>
                                        {t('create.sections.subtasks', { defaultValue: 'Subtareas' })}
                                    </Text>

                                    <Text style={[styles.subtasksCountText, { color: colors.textSecondary }]}>
                                        ({completedSubtasksCount}/{parsedSubtasks.length})
                                    </Text>
                                </View>

                                <Animated.View
                                    style={{
                                        transform: [
                                            {
                                                rotate: subtasksAnim.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: ['-90deg', '0deg'],
                                                }),
                                            },
                                        ],
                                    }}
                                >
                                    <ChevronDown size={16} color={colors.textMuted} />
                                </Animated.View>
                            </TouchableOpacity>

                            {isSubtasksExpanded && (
                                <View style={styles.subtasksCollapsibleContent}>
                                    {/* Progress line */}
                                    <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }]}>
                                        <View
                                            style={[
                                                styles.progressFill,
                                                {
                                                    backgroundColor: progressPercent === 100 ? (isDark ? '#34D399' : '#10B981') : accent.primary,
                                                    width: `${progressPercent}%`,
                                                },
                                            ]}
                                        />
                                    </View>

                                    {/* Subtasks Rows */}
                                    <View style={styles.subtasksList}>
                                        {parsedSubtasks.map(item => (
                                            <TouchableOpacity
                                                key={item.id}
                                                style={[
                                                    styles.subtaskRow,
                                                    {
                                                        borderBottomColor: colors.borderSubtle,
                                                    },
                                                ]}
                                                activeOpacity={0.7}
                                                onPress={() => reminder && toggleSubtask(reminder.id, item.id)}
                                            >
                                                <View
                                                    style={[
                                                        styles.subtaskCheckbox,
                                                        item.completed
                                                            ? { backgroundColor: isDark ? '#34D399' : '#10B981', borderColor: isDark ? '#34D399' : '#10B981' }
                                                            : { borderColor: colors.borderMedium },
                                                    ]}
                                                >
                                                    {item.completed && <Check size={11} color="#FFFFFF" strokeWidth={3.5} />}
                                                </View>

                                                <Text
                                                    style={[
                                                        styles.subtaskTitle,
                                                        {
                                                            color: item.completed ? colors.textMuted : colors.textPrimary,
                                                            textDecorationLine: item.completed ? 'line-through' : 'none',
                                                        },
                                                    ]}
                                                >
                                                    {item.title}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Quick Add Subtask Input */}
                                    {isAddingSubtask ? (
                                        <View style={[styles.inlineAddBox, { borderColor: accent.primary }]}>
                                            <TextInput
                                                style={[styles.inlineAddInput, { color: colors.textPrimary }]}
                                                placeholder={language === 'es' ? 'Nueva subtarea...' : 'New subtask...'}
                                                placeholderTextColor={colors.textMuted}
                                                value={newSubtaskTitle}
                                                onChangeText={setNewSubtaskTitle}
                                                autoFocus
                                                onSubmitEditing={handleAddSubtask}
                                            />
                                            <View style={styles.inlineAddActions}>
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        setIsAddingSubtask(false);
                                                        setNewSubtaskTitle('');
                                                    }}
                                                    style={styles.inlineCancelBtn}
                                                >
                                                    <X size={16} color={colors.textMuted} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={handleAddSubtask}
                                                    style={[styles.inlineSubmitBtn, { backgroundColor: accent.primary }]}
                                                >
                                                    <Check size={15} color="#FFFFFF" strokeWidth={3} />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ) : (
                                        <TouchableOpacity
                                            activeOpacity={0.6}
                                            onPress={() => setIsAddingSubtask(true)}
                                            style={styles.addSubtaskTextBtn}
                                        >
                                            <Plus size={15} color={accent.primary} />
                                            <Text style={[styles.addSubtaskText, { color: accent.primary }]}>
                                                {language === 'es' ? 'Agregar subtarea' : 'Add subtask'}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </View>
                    )}

                    {/* ─── ADJUNTOS (CARRETE & DOCUMENTOS) ─── */}
                    {parsedAttachments.length > 0 && (
                        <View style={styles.sectionBlock}>
                            <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>
                                {t('create.sections.attachments', { defaultValue: 'Adjuntos' })} ({parsedAttachments.length})
                            </Text>

                            {/* Images Carousel */}
                            {imageAttachments.length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageScroll}>
                                    {imageAttachments.map((img, idx) => (
                                        <TouchableOpacity
                                            key={idx}
                                            activeOpacity={0.85}
                                            onPress={() => {
                                                setGalleryImages(imageAttachments.map(i => ({ uri: i.uri })));
                                                setGalleryIndex(idx);
                                                setGalleryVisible(true);
                                            }}
                                            style={[styles.imageWrapper, { borderColor: colors.borderSubtle }]}
                                        >
                                            <Image
                                                source={{ uri: img.uri }}
                                                style={styles.imageItem}
                                            />
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            )}

                            {/* Documents */}
                            {otherAttachments.length > 0 && (
                                <View style={styles.docsList}>
                                    {otherAttachments.map((file, idx) => {
                                        const isExcel = file.name.match(/\.(xls|xlsx|csv)$/i) || file.name.includes('excel') || file.name.includes('sheet');
                                        const isPdf = file.name.match(/\.pdf$/i) || file.name.includes('pdf');

                                        return (
                                            <TouchableOpacity
                                                key={idx}
                                                activeOpacity={0.7}
                                                onPress={() => openAttachment(file.uri)}
                                                style={[
                                                    styles.docRow,
                                                    {
                                                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                                                        borderColor: colors.borderSubtle,
                                                    },
                                                ]}
                                            >
                                                <View
                                                    style={[
                                                        styles.docBadge,
                                                        {
                                                            backgroundColor: isExcel
                                                                ? '#107C41'
                                                                : isPdf
                                                                ? '#DC2626'
                                                                : accent.primary,
                                                        },
                                                    ]}
                                                >
                                                    <Text style={styles.docBadgeText}>
                                                        {isExcel ? 'XLS' : isPdf ? 'PDF' : 'DOC'}
                                                    </Text>
                                                </View>

                                                <View style={styles.docDetails}>
                                                    <Text style={[styles.docTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                                                        {file.name}
                                                    </Text>
                                                    <Text style={[styles.docActionText, { color: colors.textMuted }]}>
                                                        {language === 'es' ? 'Tocar para abrir' : 'Tap to open'}
                                                    </Text>
                                                </View>

                                                <ChevronRight size={14} color={colors.textMuted} />
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    )}
                </Animated.View>
            </ScrollView>

            {/* ─── BARRA FLOTANTE INFERIOR LIMPIA ─── */}
            <Animated.View
                style={[
                    styles.bottomBar,
                    {
                        backgroundColor: colors.surface,
                        borderTopColor: colors.borderSubtle,
                        paddingBottom: insets.bottom + 12,
                        opacity: bottomBarAnim,
                    },
                ]}
            >
                {isCompleted ? (
                    <>
                        <VeyraButton
                            variant="secondary"
                            size="lg"
                            style={{ flex: 1.8 }}
                            label={language === 'es' ? 'Reabrir recordatorio' : 'Reopen reminder'}
                            iconLeft={<RotateCcw size={17} color={accent.primary} />}
                            onPress={async () => {
                                handleBack();
                                await markAsPending(reminder.id);
                            }}
                        />
                        <VeyraButton
                            variant="danger"
                            size="lg"
                            style={{ flex: 1.2 }}
                            label={t('home.delete')}
                            iconLeft={<Trash2 size={16} color={isDark ? '#FB7185' : '#E11D48'} />}
                            onPress={handleDelete}
                        />
                    </>
                ) : (
                    <>
                        <Animated.View style={{ flex: isOverdue ? 2.2 : 1, transform: [{ scale: completeScaleAnim }] }}>
                            <VeyraButton
                                variant="primary"
                                size="lg"
                                style={{
                                    width: '100%',
                                    backgroundColor: isCompleting ? (isDark ? '#059669' : '#10B981') : undefined,
                                    borderColor: isCompleting ? '#34D399' : undefined,
                                }}
                                label={isCompleting ? (language === 'es' ? '¡Completado!' : 'Completed!') : t('common.done', { defaultValue: 'Completar' })}
                                iconLeft={
                                    <Animated.View style={{ transform: [{ scale: completeCheckScaleAnim }] }}>
                                        <Check size={18} color="#FFFFFF" strokeWidth={isCompleting ? 3.5 : 3} />
                                    </Animated.View>
                                }
                                onPress={handleComplete}
                            />
                        </Animated.View>
                        {isOverdue && (
                            <VeyraButton
                                variant="secondary"
                                size="lg"
                                style={{ flex: 1.2 }}
                                label={t('common.snooze', { defaultValue: 'Posponer' })}
                                iconLeft={<Zap size={16} color={accent.primary} />}
                                onPress={() => setIsSnoozeModalVisible(true)}
                            />
                        )}
                    </>
                )}
            </Animated.View>

            {/* ─── MODAL DE REAGENDADO RÁPIDO ─── */}
            {isRescheduleModalVisible && (
                <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
                    <TouchableOpacity
                        style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassBackdrop }]}
                        activeOpacity={1}
                        onPress={() => setIsRescheduleModalVisible(false)}
                    />
                    <VeyraSurface
                        level={2}
                        radius="lg"
                        style={[
                            styles.bottomSheetCard,
                            {
                                backgroundColor: colors.surface,
                                borderColor: colors.borderSubtle,
                                paddingBottom: Math.max(insets.bottom, 16),
                            },
                        ]}
                    >
                        <View style={styles.sheetHandle} />
                        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                            {language === 'es' ? 'Reagendar recordatorio' : 'Reschedule reminder'}
                        </Text>

                        {[
                            {
                                label: language === 'es' ? 'En 3 horas' : 'In 3 hours',
                                date: addHours(new Date(), 3),
                            },
                            {
                                label: language === 'es' ? 'Esta noche (20:00)' : 'Tonight (8:00 PM)',
                                date: setMinutes(setHours(new Date(), 20), 0),
                            },
                            {
                                label: language === 'es' ? 'Mañana por la mañana (09:00)' : 'Tomorrow morning (9:00 AM)',
                                date: setMinutes(setHours(addDays(new Date(), 1), 9), 0),
                            },
                            {
                                label: language === 'es' ? 'Mañana por la tarde (15:00)' : 'Tomorrow afternoon (3:00 PM)',
                                date: setMinutes(setHours(addDays(new Date(), 1), 15), 0),
                            },
                            {
                                label: language === 'es' ? 'En 2 días' : 'In 2 days',
                                date: addDays(new Date(), 2),
                            },
                        ].map((opt, idx) => (
                            <TouchableOpacity
                                key={idx}
                                style={[styles.sheetOptionRow, { borderBottomColor: colors.borderSubtle }]}
                                activeOpacity={0.7}
                                onPress={() => handleReschedule(opt.date)}
                            >
                                <Calendar size={18} color={accent.primary} />
                                <Text style={[styles.sheetOptionText, { color: colors.textPrimary }]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}

                        <TouchableOpacity
                            style={[styles.sheetOptionRow, { borderBottomColor: 'transparent' }]}
                            activeOpacity={0.7}
                            onPress={() => {
                                setIsRescheduleModalVisible(false);
                                router.push({ pathname: '/create', params: { id: reminder.id } });
                            }}
                        >
                            <Edit3 size={18} color={accent.primary} />
                            <Text style={[styles.sheetOptionText, { color: accent.primary, fontWeight: '700' }]}>
                                {language === 'es' ? 'Elegir fecha personalizada...' : 'Choose custom date...'}
                            </Text>
                        </TouchableOpacity>
                    </VeyraSurface>
                </View>
            )}

            {/* ─── MODAL DE POSPONER (SNOOZE) ─── */}
            {isSnoozeModalVisible && (
                <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
                    <TouchableOpacity
                        style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassBackdrop }]}
                        activeOpacity={1}
                        onPress={() => setIsSnoozeModalVisible(false)}
                    />
                    <VeyraSurface
                        level={2}
                        radius="lg"
                        style={[
                            styles.bottomSheetCard,
                            {
                                backgroundColor: colors.surface,
                                borderColor: colors.borderSubtle,
                                paddingBottom: Math.max(insets.bottom, 16),
                            },
                        ]}
                    >
                        <View style={styles.sheetHandle} />
                        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                            {t('reminder.snooze_for', { defaultValue: 'Posponer recordatorio' })}
                        </Text>

                        {[
                            { label: '+5 minutos', minutes: 5 },
                            { label: '+15 minutos', minutes: 15 },
                            { label: '+1 hora', minutes: 60 },
                            { label: 'Mañana (24 horas)', minutes: 1440 },
                        ].map((opt, idx) => (
                            <TouchableOpacity
                                key={idx}
                                style={[styles.sheetOptionRow, { borderBottomColor: colors.borderSubtle }]}
                                activeOpacity={0.7}
                                onPress={async () => {
                                    setIsSnoozeModalVisible(false);
                                    handleBack();
                                    await snoozeReminder(reminder.id, opt.minutes);
                                }}
                            >
                                <Clock size={18} color={accent.primary} />
                                <Text style={[styles.sheetOptionText, { color: colors.textPrimary }]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </VeyraSurface>
                </View>
            )}

            {/* ─── MODAL DE MÁS OPCIONES ─── */}
            {isOptionsModalVisible && (
                <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
                    <TouchableOpacity
                        style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassBackdrop }]}
                        activeOpacity={1}
                        onPress={() => setIsOptionsModalVisible(false)}
                    />
                    <VeyraSurface
                        level={2}
                        radius="lg"
                        style={[
                            styles.bottomSheetCard,
                            {
                                backgroundColor: colors.surface,
                                borderColor: colors.borderSubtle,
                                paddingBottom: Math.max(insets.bottom, 16),
                            },
                        ]}
                    >
                        <View style={styles.sheetHandle} />
                        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                            {t('reminder.options', { defaultValue: 'Opciones' })}
                        </Text>

                        <TouchableOpacity
                            style={[styles.sheetOptionRow, { borderBottomColor: colors.borderSubtle }]}
                            activeOpacity={0.7}
                            onPress={() => {
                                setIsOptionsModalVisible(false);
                                router.push({ pathname: '/create', params: { id: reminder.id } });
                            }}
                        >
                            <Edit3 size={18} color={accent.primary} />
                            <Text style={[styles.sheetOptionText, { color: colors.textPrimary }]}>
                                {t('common.edit', { defaultValue: 'Editar recordatorio' })}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.sheetOptionRow, { borderBottomColor: colors.borderSubtle }]}
                            activeOpacity={0.7}
                            onPress={handleDuplicate}
                        >
                            <Copy size={18} color={accent.primary} />
                            <Text style={[styles.sheetOptionText, { color: colors.textPrimary }]}>
                                {language === 'es' ? 'Duplicar recordatorio' : 'Duplicate reminder'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.sheetOptionRow, { borderBottomColor: colors.borderSubtle }]}
                            activeOpacity={0.7}
                            onPress={() => {
                                setIsOptionsModalVisible(false);
                                handleShareReminder();
                            }}
                        >
                            <Users size={18} color={accent.primary} />
                            <Text style={[styles.sheetOptionText, { color: colors.textPrimary }]}>
                                {language === 'es' ? 'Colaborar / Invitar personas' : 'Collaborate / Invite people'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.sheetOptionRow, { borderBottomColor: colors.borderSubtle }]}
                            activeOpacity={0.7}
                            onPress={() => {
                                setIsOptionsModalVisible(false);
                                handleNativeShareReminder();
                            }}
                        >
                            <Share2 size={18} color={accent.primary} />
                            <Text style={[styles.sheetOptionText, { color: colors.textPrimary }]}>
                                {language === 'es' ? 'Exportar como texto' : 'Export as text'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.sheetOptionRow, { borderBottomColor: 'transparent' }]}
                            activeOpacity={0.7}
                            onPress={() => {
                                setIsOptionsModalVisible(false);
                                setTimeout(handleDelete, 150);
                            }}
                        >
                            <Trash2 size={18} color={isDark ? '#FB7185' : '#E11D48'} />
                            <Text style={[styles.sheetOptionText, { color: isDark ? '#FB7185' : '#E11D48' }]}>
                                {t('home.delete', { defaultValue: 'Eliminar recordatorio' })}
                            </Text>
                        </TouchableOpacity>
                    </VeyraSurface>
                </View>
            )}

            {/* ─── VISOR DE IMÁGENES A PANTALLA COMPLETA ─── */}
            <ImageViewing
                images={galleryImages}
                imageIndex={galleryIndex}
                visible={galleryVisible}
                onRequestClose={() => setGalleryVisible(false)}
                swipeToCloseEnabled={true}
                doubleTapToZoomEnabled={true}
            />

            {/* ─── MODAL DE COLABORACIÓN Y RECURSOS COMPARTIDOS ─── */}
            {reminder && (
                <ShareModal
                    visible={isShareModalVisible}
                    onClose={() => setIsShareModalVisible(false)}
                    targetType="reminder"
                    targetId={reminder.id}
                    targetTitle={reminder.title}
                    isOwner={reminder.is_shared !== 1}
                />
            )}
            </SafeAreaView>
        </Reanimated.View>
    );
}

const styles = StyleSheet.create({
    screenContainer: {
        flex: 1,
    },
    screen: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerRightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    content: {
        paddingHorizontal: 24,
        paddingTop: 18,
    },
    heroSection: {
        gap: 12,
    },
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
    },
    controlPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 3.5,
        borderRadius: 6,
    },
    controlDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    controlPillText: {
        fontSize: 10.5,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3.5,
        borderRadius: 6,
    },
    statusBadgeText: {
        fontSize: 10.5,
        fontWeight: '700',
    },
    repeatPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3.5,
        borderRadius: 6,
    },
    repeatPillText: {
        fontSize: 10.5,
        fontWeight: '600',
    },
    title: {
        fontSize: 25,
        fontWeight: '800',
        letterSpacing: -0.5,
        lineHeight: 32,
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        marginTop: 2,
    },
    dateButtonLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        flex: 1,
    },
    dateButtonMainText: {
        fontSize: 13,
        fontWeight: '600',
    },
    dateButtonSubText: {
        fontSize: 12,
        fontWeight: '500',
    },
    sectionBlock: {
        gap: 10,
    },
    sectionHeading: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
    },
    documentBody: {
        paddingTop: 2,
    },
    subtasksHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    subtasksHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    subtasksCountText: {
        fontSize: 11.5,
        fontWeight: '600',
    },
    subtasksCollapsibleContent: {
        gap: 10,
    },
    progressTrack: {
        height: 3.5,
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    subtasksList: {
        marginTop: 2,
    },
    subtaskRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    subtaskCheckbox: {
        width: 18,
        height: 18,
        borderRadius: 5,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    subtaskTitle: {
        flex: 1,
        fontSize: 14.5,
        fontWeight: '500',
        lineHeight: 20,
    },
    addSubtaskTextBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        alignSelf: 'flex-start',
    },
    addSubtaskText: {
        fontSize: 13.5,
        fontWeight: '600',
    },
    inlineAddBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1.5,
        marginTop: 6,
    },
    inlineAddInput: {
        flex: 1,
        fontSize: 14,
        paddingVertical: 6,
    },
    inlineAddActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    inlineCancelBtn: {
        padding: 6,
    },
    inlineSubmitBtn: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    imageScroll: {
        gap: 10,
        paddingVertical: 4,
    },
    imageWrapper: {
        width: 95,
        height: 95,
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
    },
    imageItem: {
        width: '100%',
        height: '100%',
    },
    docsList: {
        gap: 8,
    },
    docRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1,
    },
    docBadge: {
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    docBadgeText: {
        color: '#FFFFFF',
        fontSize: 9.5,
        fontWeight: '900',
        letterSpacing: 0.3,
    },
    docDetails: {
        flex: 1,
    },
    docTitle: {
        fontSize: 13,
        fontWeight: '600',
    },
    docActionText: {
        fontSize: 10.5,
        fontWeight: '500',
        marginTop: 1,
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 15,
        fontWeight: '500',
    },
    modalOverlay: {
        zIndex: 2000,
        justifyContent: 'flex-end',
    },
    bottomSheetCard: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        borderTopWidth: 1,
        paddingHorizontal: 20,
        paddingTop: 12,
        gap: 4,
    },
    sheetHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(150, 150, 150, 0.3)',
        alignSelf: 'center',
        marginBottom: 10,
    },
    sheetTitle: {
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: -0.2,
        marginBottom: 8,
        textAlign: 'center',
    },
    sheetOptionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 13,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    sheetOptionText: {
        fontSize: 14.5,
        fontWeight: '600',
    },
});
