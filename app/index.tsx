import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
    Animated,
    BackHandler,
    Platform,
    ScrollView,
    Share,
    Easing,
    LayoutAnimation,
    TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withDelay,
    runOnJS,
    interpolate,
    Extrapolation,
    Easing as ReanimatedEasing,
    LinearTransition,
    FadeIn,
    SharedTransition,
} from 'react-native-reanimated';

const reminderSharedTransition = SharedTransition.duration(320);

import ImageViewing from 'react-native-image-viewing';
import RenderHTML from 'react-native-render-html';
import { isToday, isPast, isTomorrow, differenceInMinutes, format, isSameDay, addDays } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import {
    Clock,
    Zap,
    History,
    Search,
    Check,
    Edit3,
    Trash2,
    X,
    Repeat,
    FileText,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    ShieldAlert,
    Calendar as CalendarIcon,
    List as ListIcon,
    CheckSquare,
    Square,
    Share2,
    Image as ImageIcon,
    Paperclip,
    ChevronDown,
    Plus,
    MapPin,
    Layers,
    Users,
} from '@tamagui/lucide-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

import { useStore } from '../src/store/useStore';
import { useEventsStore } from '../src/store/useEventsStore';
import { useSelectionStore } from '../src/store/useSelectionStore';
import { Reminder, CalendarEvent } from '../src/types/db';
import { isEventOccurringOnDate } from '../src/services/eventService';
import { extractPlainTextFromPages } from '../src/utils/pageUtils';
import { useCardTransitionStore, CardRect } from '../src/store/cardTransitionStore';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { CollapsibleCalendarHeader } from '../src/components/calendar/CollapsibleCalendarHeader';
import {
    VeyraSurface,
    VeyraCard,
    VeyraGlass,
    VeyraButton,
    VeyraIconButton,
    VeyraBadge,
    VeyraIndicator,
    VeyraSectionHeader,
    VeyraDivider,
} from '../src/components/ui';
import NotesScreen from './notes/index';
import { TopBar } from '../src/components/TopBar';
import { RecurringDeleteModal } from '../src/components/events/RecurringDeleteModal';
import { ShareEventsModal } from '../src/components/events/ShareEventsModal';

export type TimelineItem =
    | { type: 'event'; event: CalendarEvent; time_ms: number }
    | { type: 'reminder'; item: Reminder; time_ms: number };

export interface AgendaSection {
    key: string;
    title: string;
    count: number;
    isOverdue?: boolean;
    data: TimelineItem[];
}

function calculateRiskInfo(dueDate: number, now: number, isDark: boolean, textSecondaryColor: string, overdueText?: string, inTimeText?: string) {
    const diff = differenceInMinutes(dueDate, now);
    const absDiff = Math.abs(diff);

    let shortText = '';
    if (absDiff < 60) {
        shortText = `${absDiff}m`;
    } else if (absDiff < 1440) {
        const h = Math.floor(absDiff / 60);
        const m = absDiff % 60;
        shortText = m > 0 ? `${h}h ${m}m` : `${h}h`;
    } else {
        const d = Math.floor(absDiff / 1440);
        shortText = `${d}d`;
    }

    if (diff < 0) {
        return {
            text: shortText,
            color: isDark ? '#FB7185' : '#E11D48',
            full: overdueText ? overdueText.replace('{time}', shortText) : shortText,
            isOverdue: true,
        };
    }

    const color = diff <= 60 ? (isDark ? '#FBBF24' : '#F59E0B') : textSecondaryColor;
    return {
        text: shortText,
        color,
        full: inTimeText ? inTimeText.replace('{time}', shortText) : shortText,
        isOverdue: false,
    };
}

interface AgendaEventRowProps {
    event: CalendarEvent;
    itemTime?: number;
    isLast: boolean;
    isSelected?: boolean;
    isSelectionMode?: boolean;
    now: number;
    language: string;
    isDark: boolean;
    colors: any;
    accent: any;
    onPress: (id: string, itemTime?: number) => void;
    onLongPress?: (id: string) => void;
    onPressNote: (noteId: string) => void;
    onEdit: (id: string, itemTime?: number) => void;
    onDeleteDismiss: (id: string) => void;
    onRequestRecurringDelete?: (event: CalendarEvent, itemTime?: number) => void;
}

const AgendaEventRow = React.memo(function AgendaEventRow({
    event,
    itemTime,
    isLast,
    isSelected = false,
    isSelectionMode = false,
    now,
    language,
    isDark,
    colors,
    accent,
    onPress,
    onLongPress,
    onPressNote,
    onEdit,
    onDeleteDismiss,
    onRequestRecurringDelete,
}: AgendaEventRowProps) {
    const isRecurring = Boolean(event.repeat_rule && event.repeat_rule !== 'null');
    const evColor = event.color || '#3B82F6';
    const startStr = format(new Date(event.start_time_ms), 'HH:mm');
    const endStr = format(new Date(event.end_time_ms), 'HH:mm');
    const isOngoing = useMemo(() => {
        const today = new Date(now);
        const targetDate = itemTime ? new Date(itemTime) : new Date(event.start_time_ms);
        if (!isSameDay(targetDate, today)) {
            return false;
        }
        if (!isEventOccurringOnDate(event, today)) return false;
        const s = new Date(today);
        const origS = new Date(event.start_time_ms);
        s.setHours(origS.getHours(), origS.getMinutes(), origS.getSeconds(), origS.getMilliseconds());
        const e = new Date(today);
        const origE = new Date(event.end_time_ms);
        e.setHours(origE.getHours(), origE.getMinutes(), origE.getSeconds(), origE.getMilliseconds());
        return now >= s.getTime() && now <= e.getTime();
    }, [event, now, itemTime]);

    const measuredHeight = useRef(0);
    const translateX = useSharedValue(0);
    const rowOpacity = useSharedValue(1);
    const rowHeight = useSharedValue<number | null>(null);
    const isDismissingSV = useSharedValue(false);
    const isDismissing = useRef(false);
    const dismissTimer = useRef<any>(null);

    useEffect(() => {
        return () => {
            if (dismissTimer.current) {
                clearTimeout(dismissTimer.current);
            }
        };
    }, []);

    const triggerDismiss = useCallback(() => {
        if (isDismissing.current) return;
        isDismissing.current = true;
        isDismissingSV.value = true;
        const initialH = measuredHeight.current > 0 ? measuredHeight.current : 64;
        rowHeight.value = initialH;

        translateX.value = withTiming(
            -380,
            { duration: 200, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) }
        );
        rowOpacity.value = withDelay(
            25,
            withTiming(0, { duration: 180, easing: ReanimatedEasing.out(ReanimatedEasing.quad) })
        );
        rowHeight.value = withDelay(
            35,
            withTiming(0, { duration: 240, easing: ReanimatedEasing.bezier(0.25, 1, 0.5, 1) })
        );

        dismissTimer.current = setTimeout(() => {
            onDeleteDismiss(event.id);
        }, 285);
    }, [event.id, onDeleteDismiss]);

    const triggerEdit = useCallback(() => {
        translateX.value = withTiming(0, {
            duration: 220,
            easing: ReanimatedEasing.bezier(0.25, 1, 0.5, 1),
        });
        onEdit(event.id, itemTime);
    }, [event.id, itemTime, onEdit]);

    const panGesture = Gesture.Pan()
        .activeOffsetX([-15, 15])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
            'worklet';
            if (isDismissingSV.value) return;
            translateX.value = e.translationX;
        })
        .onFinalize((e) => {
            'worklet';
            if (isDismissingSV.value) return;
            if (e.translationX < -105) {
                if (isRecurring && onRequestRecurringDelete) {
                    translateX.value = withTiming(0, {
                        duration: 220,
                        easing: ReanimatedEasing.bezier(0.25, 1, 0.5, 1),
                    });
                    runOnJS(onRequestRecurringDelete)(event, itemTime);
                } else {
                    isDismissingSV.value = true;
                    runOnJS(triggerDismiss)();
                }
            } else if (e.translationX > 105) {
                runOnJS(triggerEdit)();
            } else {
                translateX.value = withTiming(0, {
                    duration: 220,
                    easing: ReanimatedEasing.bezier(0.25, 1, 0.5, 1),
                });
            }
        });

    const collapseAnimatedStyle = useAnimatedStyle(() => {
        'worklet';
        if (rowHeight.value === null) {
            return {};
        }
        return {
            height: rowHeight.value,
            opacity: rowOpacity.value,
        };
    });

    const rowAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const bgAnimatedStyle = useAnimatedStyle(() => {
        'worklet';
        const tx = translateX.value;
        if (tx > 5) {
            const opacity = interpolate(tx, [5, 25, 75], [0, 0.6, 1], Extrapolation.CLAMP);
            return {
                backgroundColor: isDark ? '#1D4ED8' : '#2563EB',
                opacity,
            };
        } else if (tx < -5) {
            const opacity = interpolate(tx, [-75, -25, -5], [1, 0.6, 0], Extrapolation.CLAMP);
            return {
                backgroundColor: isDark ? '#DC2626' : '#EF4444',
                opacity,
            };
        }
        return { opacity: 0 };
    });

    const leftActionStyle = useAnimatedStyle(() => {
        'worklet';
        const tx = translateX.value;
        const isVisible = tx > 5;
        const opacity = interpolate(tx, [5, 25, 70], [0, 0.45, 1], Extrapolation.CLAMP);
        const scale = interpolate(tx, [5, 30, 85], [0.85, 0.94, 1], Extrapolation.CLAMP);
        return {
            opacity: isVisible ? opacity : 0,
            transform: [{ scale }],
        };
    });

    const rightActionStyle = useAnimatedStyle(() => {
        'worklet';
        const tx = translateX.value;
        const isVisible = tx < -5;
        const opacity = interpolate(tx, [-70, -25, -5], [1, 0.45, 0], Extrapolation.CLAMP);
        const scale = interpolate(tx, [-85, -30, -5], [1, 0.94, 0.85], Extrapolation.CLAMP);
        return {
            opacity: isVisible ? opacity : 0,
            transform: [{ scale }],
        };
    });

    return (
        <Reanimated.View
            pointerEvents={isDismissing.current ? 'none' : 'auto'}
            style={[styles.collapsibleWrapper, collapseAnimatedStyle]}
            onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0 && !isDismissing.current) {
                    measuredHeight.current = h;
                }
            }}
        >
            <View collapsable={false} style={styles.agendaRowWrapper}>
                <Reanimated.View style={[styles.swipeActionBg, bgAnimatedStyle]}>
                    <Reanimated.View style={[styles.swipeActionContentLeft, leftActionStyle]}>
                        <Edit3 size={18} color="#FFFFFF" strokeWidth={2.5} />
                        <Text style={styles.swipeActionLabel}>
                            {language === 'es' ? 'Editar' : 'Edit'}
                        </Text>
                    </Reanimated.View>
                    <Reanimated.View style={[styles.swipeActionContentRight, rightActionStyle]}>
                        <Text style={styles.swipeActionLabel}>
                            {language === 'es' ? 'Eliminar' : 'Delete'}
                        </Text>
                        <Trash2 size={18} color="#FFFFFF" strokeWidth={2.5} />
                    </Reanimated.View>
                </Reanimated.View>

                <GestureDetector gesture={panGesture}>
                    <Reanimated.View
                        style={[
                            styles.swipeFrontRow,
                            {
                                backgroundColor: isSelected
                                    ? (isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)')
                                    : isOngoing
                                    ? (isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.06)')
                                    : (isDark ? '#1C1F26' : '#FFFFFF'),
                            },
                            rowAnimatedStyle,
                        ]}
                    >
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => {
                                if (!isDismissing.current) {
                                    onPress(event.id, itemTime);
                                }
                            }}
                            onLongPress={() => {
                                if (onLongPress) {
                                    onLongPress(event.id);
                                }
                            }}
                            style={[
                                styles.agendaItemRow,
                                isOngoing && {
                                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.06)',
                                },
                            ]}
                        >
                            {isSelectionMode ? (
                                <View
                                    style={[
                                        styles.selectionCheck,
                                        {
                                            backgroundColor: isSelected ? accent.primary : 'transparent',
                                            borderColor: isSelected ? accent.primary : colors.borderMedium,
                                        },
                                    ]}
                                >
                                    {isSelected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                                </View>
                            ) : null}
                            <View style={styles.agendaRowContent}>
                                <View style={styles.agendaRowTitleLine}>
                                    <Text
                                        style={[styles.agendaRowTitle, { color: colors.textPrimary }]}
                                        numberOfLines={1}
                                    >
                                        {event.title}
                                    </Text>
                                    {isOngoing && (
                                        <View style={[styles.liveBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE' }]}>
                                            <View style={[styles.liveDot, { backgroundColor: '#3B82F6' }]} />
                                            <Text style={[styles.liveBadgeText, { color: '#3B82F6' }]}>
                                                {language === 'es' ? 'En curso' : 'Now'}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.agendaRowMetaLine}>
                                    <View style={styles.agendaRowTimeWrap}>
                                        <CalendarIcon size={11} color={evColor} />
                                        <Text style={[styles.agendaRowTimeText, { color: evColor }]}>
                                            {startStr} - {endStr}
                                        </Text>
                                    </View>

                                    {event.location ? (
                                        <View style={styles.agendaRowLocationWrap}>
                                            <MapPin size={10.5} color={colors.textMuted} />
                                            <Text style={[styles.agendaRowLocationText, { color: colors.textSecondary }]} numberOfLines={1}>
                                                {event.location}
                                            </Text>
                                        </View>
                                    ) : null}

                                    {event.note_id ? (
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            onPress={(e) => {
                                                if (e && e.stopPropagation) e.stopPropagation();
                                                onPressNote(event.note_id!);
                                            }}
                                            style={[
                                                styles.agendaRowMiniChip,
                                                { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)' },
                                            ]}
                                        >
                                            <FileText size={9.5} color="#3B82F6" />
                                            <Text style={[styles.agendaRowMiniChipText, { color: '#3B82F6' }]}>
                                                {language === 'es' ? 'Nota' : 'Note'}
                                            </Text>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            </View>

                            <TouchableOpacity
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                onPress={() => onEdit(event.id, itemTime)}
                                style={styles.agendaRowActionBtn}
                            >
                                <Edit3 size={13} color={colors.textMuted} />
                            </TouchableOpacity>
                        </TouchableOpacity>
                    </Reanimated.View>
                </GestureDetector>
            </View>
            {!isLast && <VeyraDivider style={styles.rowDivider} />}
        </Reanimated.View>
    );
});

interface AgendaReminderRowProps {
    item: Reminder;
    isLast: boolean;
    isSelected: boolean;
    isSelectionMode: boolean;
    isSubtasksExpanded: boolean;
    language: string;
    isDark: boolean;
    colors: any;
    accent: any;
    now: number;
    onPressRow: (id: string) => void;
    onLongPressRow: (id: string) => void;
    onToggleCardSubtasks: (id: string, e?: any) => void;
    onToggleSubtask: (reminderId: string, subtaskId: string) => void;
    onCompleteDismiss: (id: string) => void;
    onDeleteDismiss: (id: string) => void;
}

const AgendaReminderRow = React.memo(function AgendaReminderRow({
    item,
    isLast,
    isSelected,
    isSelectionMode,
    isSubtasksExpanded,
    language,
    isDark,
    colors,
    accent,
    now,
    onPressRow,
    onLongPressRow,
    onToggleCardSubtasks,
    onToggleSubtask,
    onCompleteDismiss,
    onDeleteDismiss,
}: AgendaReminderRowProps) {
    const risk = calculateRiskInfo(item.due_date_ms, now, isDark, colors.textSecondary);
    const isCritical = item.control_level === 'critical';
    const isStrict = item.control_level === 'strict';

    let subtasksList: any[] = [];
    if (item.subtasks) {
        try {
            const parsed = JSON.parse(item.subtasks);
            if (Array.isArray(parsed)) subtasksList = parsed;
        } catch { }
    }
    const completedSubtasks = subtasksList.filter((s: any) => s.completed).length;

    let parsedAttachments: any[] = [];
    if (item.attachments) {
        try {
            const parsed = JSON.parse(item.attachments);
            if (Array.isArray(parsed)) parsedAttachments = parsed;
        } catch { }
    }

    const imageAttachments = parsedAttachments.filter((att: any) => {
        const uri = typeof att === 'string' ? att : att.uri;
        return (
            uri &&
            (uri.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|heic)$/i) ||
                uri.startsWith('data:image') ||
                uri.startsWith('file://'))
        );
    });
    const docAttachments = parsedAttachments.filter((att: any) => {
        const uri = typeof att === 'string' ? att : att.uri;
        return !imageAttachments.includes(att);
    });

    const dueDate = new Date(item.due_date_ms);
    const timeStr = format(dueDate, 'HH:mm');

    const measuredHeight = useRef(0);
    const translateX = useSharedValue(0);
    const rowOpacity = useSharedValue(1);
    const rowHeight = useSharedValue<number | null>(null);
    const isDismissingSV = useSharedValue(false);
    const isDismissing = useRef(false);
    const dismissTimer = useRef<any>(null);

    useEffect(() => {
        return () => {
            if (dismissTimer.current) {
                clearTimeout(dismissTimer.current);
            }
        };
    }, []);

    const triggerDismiss = useCallback((action: 'complete' | 'delete') => {
        if (isDismissing.current) return;
        isDismissing.current = true;
        isDismissingSV.value = true;
        const initialH = measuredHeight.current > 0 ? measuredHeight.current : 64;
        rowHeight.value = initialH;
        const targetX = action === 'complete' ? 380 : -380;

        translateX.value = withTiming(
            targetX,
            { duration: 200, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) }
        );
        rowOpacity.value = withDelay(
            25,
            withTiming(0, { duration: 180, easing: ReanimatedEasing.out(ReanimatedEasing.quad) })
        );
        rowHeight.value = withDelay(
            35,
            withTiming(0, { duration: 240, easing: ReanimatedEasing.bezier(0.25, 1, 0.5, 1) })
        );

        dismissTimer.current = setTimeout(() => {
            if (action === 'complete') {
                onCompleteDismiss(item.id);
            } else {
                onDeleteDismiss(item.id);
            }
        }, 285);
    }, [item.id, onCompleteDismiss, onDeleteDismiss]);

    const panGesture = Gesture.Pan()
        .enabled(!isSelectionMode)
        .activeOffsetX([-15, 15])
        .failOffsetY([-12, 12])
        .onUpdate((event) => {
            'worklet';
            if (isDismissingSV.value) return;
            translateX.value = event.translationX;
        })
        .onFinalize((event) => {
            'worklet';
            if (isDismissingSV.value) return;
            if (event.translationX > 105) {
                isDismissingSV.value = true;
                runOnJS(triggerDismiss)('complete');
            } else if (event.translationX < -105) {
                isDismissingSV.value = true;
                runOnJS(triggerDismiss)('delete');
            } else {
                translateX.value = withTiming(0, {
                    duration: 220,
                    easing: ReanimatedEasing.bezier(0.25, 1, 0.5, 1),
                });
            }
        });

    const collapseAnimatedStyle = useAnimatedStyle(() => {
        'worklet';
        if (rowHeight.value === null) {
            return {};
        }
        return {
            height: rowHeight.value,
            opacity: rowOpacity.value,
        };
    });

    const rowAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const bgAnimatedStyle = useAnimatedStyle(() => {
        'worklet';
        const tx = translateX.value;
        if (tx > 5) {
            const opacity = interpolate(tx, [5, 25, 75], [0, 0.6, 1], Extrapolation.CLAMP);
            return {
                backgroundColor: isDark ? '#059669' : '#10B981',
                opacity,
            };
        } else if (tx < -5) {
            const opacity = interpolate(tx, [-75, -25, -5], [1, 0.6, 0], Extrapolation.CLAMP);
            return {
                backgroundColor: isDark ? '#DC2626' : '#EF4444',
                opacity,
            };
        }
        return {
            opacity: 0,
        };
    });

    const leftActionStyle = useAnimatedStyle(() => {
        'worklet';
        const tx = translateX.value;
        const isVisible = tx > 5;
        const opacity = interpolate(tx, [5, 25, 70], [0, 0.45, 1], Extrapolation.CLAMP);
        const scale = interpolate(tx, [5, 30, 85], [0.85, 0.94, 1], Extrapolation.CLAMP);
        return {
            opacity: isVisible ? opacity : 0,
            transform: [{ scale }],
        };
    });

    const rightActionStyle = useAnimatedStyle(() => {
        'worklet';
        const tx = translateX.value;
        const isVisible = tx < -5;
        const opacity = interpolate(tx, [-70, -25, -5], [1, 0.45, 0], Extrapolation.CLAMP);
        const scale = interpolate(tx, [-85, -30, -5], [1, 0.94, 0.85], Extrapolation.CLAMP);
        return {
            opacity: isVisible ? opacity : 0,
            transform: [{ scale }],
        };
    });

    const priorityColor = isCritical
        ? (isDark ? '#FB7185' : '#E11D48')
        : isStrict
        ? '#FB923C'
        : (isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)');

    return (
        <Reanimated.View
            pointerEvents={isDismissing.current ? 'none' : 'auto'}
            style={[styles.collapsibleWrapper, collapseAnimatedStyle]}
            onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0 && !isDismissing.current) {
                    measuredHeight.current = h;
                }
            }}
        >
            <View
                collapsable={false}
                style={[
                    styles.agendaRowWrapper,
                    isSelected && {
                        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)',
                    },
                ]}
            >
                <Reanimated.View style={[styles.swipeActionBg, bgAnimatedStyle]}>
                    <Reanimated.View style={[styles.swipeActionContentLeft, leftActionStyle]}>
                        <Check size={18} color="#FFFFFF" strokeWidth={3} />
                        <Text style={styles.swipeActionLabel}>
                            {language === 'es' ? 'Completar' : 'Complete'}
                        </Text>
                    </Reanimated.View>
                    <Reanimated.View style={[styles.swipeActionContentRight, rightActionStyle]}>
                        <Text style={styles.swipeActionLabel}>
                            {language === 'es' ? 'Eliminar' : 'Delete'}
                        </Text>
                        <Trash2 size={18} color="#FFFFFF" strokeWidth={2.5} />
                    </Reanimated.View>
                </Reanimated.View>

                <GestureDetector gesture={panGesture}>
                    <Reanimated.View
                        sharedTransitionTag={`reminder-card-${item.id}`}
                        sharedTransitionStyle={reminderSharedTransition}
                        style={[
                            styles.swipeFrontRow,
                            {
                                backgroundColor: isSelected
                                    ? (isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)')
                                    : (isDark ? '#1C1F26' : '#FFFFFF'),
                            },
                            rowAnimatedStyle,
                        ]}
                    >
                        <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => {
                                if (!isDismissing.current) {
                                    onPressRow(item.id);
                                }
                            }}
                            onLongPress={() => onLongPressRow(item.id)}
                            style={styles.agendaItemRow}
                        >
                            {isSelectionMode ? (
                                <View
                                    style={[
                                        styles.selectionCheck,
                                        {
                                            backgroundColor: isSelected ? accent.primary : 'transparent',
                                            borderColor: isSelected ? accent.primary : colors.borderMedium,
                                        },
                                    ]}
                                >
                                    {isSelected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                                </View>
                            ) : (
                                <View style={[styles.reminderSidePill, { backgroundColor: priorityColor }]} />
                            )}

                            <View style={styles.agendaRowContent}>
                                <View style={styles.agendaRowTitleLine}>
                                    <Text
                                        style={[
                                            styles.agendaRowTitle,
                                            { color: colors.textPrimary },
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {item.title}
                                    </Text>
                                    {(item.is_shared === 1 || item.shared_owner_id) && (
                                        <View style={{ marginLeft: 6, opacity: 0.85 }}>
                                            <Users size={12} color={accent.primary as any} strokeWidth={2.4} />
                                        </View>
                                    )}
                                </View>

                                <View style={styles.agendaRowMetaLine}>
                                    <View style={styles.agendaRowTimeWrap}>
                                        <Clock size={11} color={risk.color} />
                                        <Text style={[styles.agendaRowTimeText, { color: risk.color }]}>
                                            {timeStr}
                                        </Text>
                                        <Text style={[styles.agendaRowRiskText, { color: colors.textMuted }]}>
                                            • {risk.text}
                                        </Text>
                                    </View>

                                    {subtasksList.length > 0 && (
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            onPress={(e) => onToggleCardSubtasks(item.id, e)}
                                            style={[
                                                styles.agendaRowMiniChip,
                                                {
                                                    backgroundColor: isSubtasksExpanded
                                                        ? (isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.12)')
                                                        : (isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'),
                                                },
                                            ]}
                                        >
                                            <CheckSquare size={9.5} color={completedSubtasks === subtasksList.length ? (isDark ? '#34D399' : '#10B981') : accent.primary} />
                                            <Text style={[styles.agendaRowMiniChipText, { color: colors.textSecondary }]}>
                                                {completedSubtasks}/{subtasksList.length}
                                            </Text>
                                            <ChevronDown
                                                size={9.5}
                                                color={colors.textMuted}
                                                style={{ transform: [{ rotate: isSubtasksExpanded ? '180deg' : '0deg' }] }}
                                            />
                                        </TouchableOpacity>
                                    )}

                                    {item.repeat_rule && (() => {
                                        try {
                                            const rule = JSON.parse(item.repeat_rule!);
                                            return rule.type && rule.type !== 'none' ? (
                                                <View style={[styles.agendaRowMiniChip, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}>
                                                    <Repeat size={9.5} color={colors.textMuted} />
                                                </View>
                                            ) : null;
                                        } catch {
                                            return null;
                                        }
                                    })()}

                                    {imageAttachments.length > 0 && (
                                        <View style={[styles.agendaRowMiniChip, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.06)' }]}>
                                            <ImageIcon size={9.5} color={accent.primary} />
                                            <Text style={[styles.agendaRowMiniChipText, { color: accent.primary }]}>
                                                {imageAttachments.length}
                                            </Text>
                                        </View>
                                    )}
                                    {docAttachments.length > 0 && (
                                        <View style={[styles.agendaRowMiniChip, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}>
                                            <Paperclip size={9.5} color={colors.textMuted} />
                                        </View>
                                    )}
                                </View>
                            </View>
                        </TouchableOpacity>

                        {isSubtasksExpanded && subtasksList.length > 0 && (
                            <View style={[styles.agendaRowSubtasksBox, { borderTopColor: colors.borderSubtle }]}>
                                {subtasksList.map((st: any) => (
                                    <TouchableOpacity
                                        key={st.id}
                                        activeOpacity={0.7}
                                        style={styles.agendaRowSubtaskItem}
                                        onPress={(e) => {
                                            if (e && e.stopPropagation) e.stopPropagation();
                                            onToggleSubtask(item.id, st.id);
                                        }}
                                    >
                                        <View
                                            style={[
                                                styles.cardSubtaskCheckbox,
                                                st.completed
                                                    ? { backgroundColor: isDark ? '#34D399' : '#10B981', borderColor: isDark ? '#34D399' : '#10B981' }
                                                    : { borderColor: colors.borderMedium },
                                            ]}
                                        >
                                            {st.completed && <Check size={9} color="#FFFFFF" strokeWidth={3} />}
                                        </View>
                                        <Text
                                            style={[
                                                styles.agendaRowSubtaskText,
                                                {
                                                    color: st.completed ? colors.textMuted : colors.textPrimary,
                                                    textDecorationLine: st.completed ? 'line-through' : 'none',
                                                },
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {st.title}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </Reanimated.View>
                </GestureDetector>
            </View>
            {!isLast && <VeyraDivider style={styles.rowDivider} />}
        </Reanimated.View>
    );
});

export default function HomeScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const {
        reminders,
        loadReminders,
        markAsCompleted,
        markRemindersAsCompleted,
        snoozeReminder,
        snoozeRemindersBatch,
        deleteReminder,
        deleteReminders,
        history,
        loadHistory,
        onboardingCompleted,
        isHydrated,
        detailReminder,
        setDetailReminder,
        language,
        toggleSubtask,
        loadStreak,
        triggerSync,
    } = useStore();

    const {
        events,
        eventsForSelectedDate,
        loadAllEvents,
        loadEventsForDate,
        deleteEvent,
        deleteEventOccurrence,
    } = useEventsStore();

    const { colors, typography, radii, spacing, accent, isDark, getControlLevelColor } = useVeyraTheme();

    const [agendaFilter, setAgendaFilter] = useState<'all' | 'reminders' | 'events'>('all');
    const [now, setNow] = useState(Date.now());
    const [galleryImages, setGalleryImages] = useState<{ uri: string }[]>([]);
    const [galleryVisible, setGalleryVisible] = useState(false);
    const [galleryIndex, setGalleryIndex] = useState(0);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);
    const [selectedReminders, setSelectedReminders] = useState<string[]>([]);
    const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
    const totalSelectedCount = selectedReminders.length + selectedEvents.length;
    const isSelectionMode = totalSelectedCount > 0;
    const [isBulkDeleteConfirmVisible, setIsBulkDeleteConfirmVisible] = useState(false);
    const [isShareEventsModalVisible, setIsShareEventsModalVisible] = useState(false);
    const [recurringDeleteTarget, setRecurringDeleteTarget] = useState<{ event: CalendarEvent; itemTime?: number } | null>(null);
    const [isSnoozeModalVisible, setIsSnoozeModalVisible] = useState(false);
    const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(null);
    const [expandedSubtaskCardIds, setExpandedSubtaskCardIds] = useState<Record<string, boolean>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    const selectionAnim = useRef(new Animated.Value(0)).current;
    const completeButtonAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        LayoutAnimation.configureNext({
            duration: 180,
            create: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
            },
            update: {
                type: LayoutAnimation.Types.easeInEaseOut,
            },
            delete: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
            },
        });
        Animated.timing(selectionAnim, {
            toValue: isSelectionMode ? 1 : 0,
            duration: isSelectionMode ? 200 : 150,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [isSelectionMode]);

    const pillOpacity = selectionAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
    const pillTranslateY = selectionAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0], extrapolate: 'clamp' });
    const pillScale = selectionAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1], extrapolate: 'clamp' });

    const toggleCardSubtasks = (id: string, e?: any) => {
        if (e && e.stopPropagation) {
            e.stopPropagation();
        }
        setExpandedSubtaskCardIds(prev => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const listAnimOpacity = useRef(new Animated.Value(1)).current;

    const mainActiveTab = useStore(state => state.mainActiveTab);
    const tabCrossfadeProgress = useSharedValue(mainActiveTab === 'notes' ? 1 : 0);

    useEffect(() => {
        tabCrossfadeProgress.value = withTiming(mainActiveTab === 'notes' ? 1 : 0, {
            duration: 220,
            easing: ReanimatedEasing.bezier(0.25, 0.1, 0.25, 1),
        });
    }, [mainActiveTab]);

    const remindersCrossfadeStyle = useAnimatedStyle(() => ({
        opacity: 1 - tabCrossfadeProgress.value,
    }));

    const notesCrossfadeStyle = useAnimatedStyle(() => ({
        opacity: tabCrossfadeProgress.value,
    }));

    useEffect(() => {
        // Transición suave de contenido sin destello brusco a negro/blanco
        listAnimOpacity.setValue(0.4);
        Animated.timing(listAnimOpacity, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [selectedCalendarDate]);

    useEffect(() => {
        if (isHydrated && !onboardingCompleted) {
            router.replace('/onboarding');
        }
    }, [isHydrated, onboardingCompleted]);

    useEffect(() => {
        if (!isHydrated) return;
        loadHistory();
        loadReminders();
        loadAllEvents();
        loadEventsForDate(selectedCalendarDate || new Date());
        const interval = setInterval(() => {
            loadReminders();
            loadAllEvents();
            setNow(Date.now());
        }, 1000 * 30);
        return () => clearInterval(interval);
    }, [isHydrated]);

    useFocusEffect(
        useCallback(() => {
            if (!isHydrated) return;
            const { isRemindersDirty, reminders: currentReminders, loadReminders } = useStore.getState();
            const { isEventsDirty, events: currentEvents, loadAllEvents, loadEventsForDate } = useEventsStore.getState();

            // Caché inteligente: solo consultar SQLite si los datos están marcados como sucios o en la primera carga
            if (isRemindersDirty || currentReminders.length === 0) {
                loadReminders();
            }
            if (isEventsDirty || currentEvents.length === 0) {
                loadAllEvents();
                loadEventsForDate(selectedCalendarDate || new Date());
            }
        }, [selectedCalendarDate, isHydrated])
    );

    const sortedReminders = useMemo(() => {
        return [...reminders].sort((a, b) => a.due_date_ms - b.due_date_ms);
    }, [reminders]);

    const nextNowReminder = useMemo(() => {
        return sortedReminders.find(r => r.status === 'pending') || null;
    }, [sortedReminders]);

    const nowMs = now;

    // One UI Integrated Daily Briefing Context
    const locale = language === 'es' ? es : enUS;

    const listData = useMemo(() => {
        const sections: AgendaSection[] = [];

        // ─── Búsqueda en tiempo real ───
        if (searchQuery.trim().length > 0) {
            const query = searchQuery.trim().toLowerCase();
            const matchingReminders = sortedReminders.filter(r => {
                const titleMatch = r.title?.toLowerCase().includes(query);
                const descMatch = r.description?.toLowerCase().includes(query);
                return (titleMatch || descMatch) && r.status === 'pending';
            });
            const matchingEvents = events.filter(e => {
                const titleMatch = e.title?.toLowerCase().includes(query);
                const descMatch = e.description?.toLowerCase().includes(query);
                const locMatch = e.location?.toLowerCase().includes(query);
                return titleMatch || descMatch || locMatch;
            });

            const combined: TimelineItem[] = [
                ...matchingEvents.map(ev => ({ type: 'event' as const, event: ev, time_ms: ev.start_time_ms })),
                ...matchingReminders.map(r => ({ type: 'reminder' as const, item: r, time_ms: r.due_date_ms })),
            ].sort((a, b) => a.time_ms - b.time_ms);

            if (combined.length > 0) {
                sections.push({
                    key: 'search_results',
                    title: language === 'es' ? 'Resultados de búsqueda' : 'Search results',
                    count: combined.length,
                    data: combined,
                });
            }

            return {
                sections,
                stats: { completedToday: 0, overdueCount: 0 },
                overdueCount: 0,
                isFilteredByDate: false,
            };
        }

        if (selectedCalendarDate) {
            const targetDate = selectedCalendarDate;
            const dateTitle = format(targetDate, language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale });

            const dayEvents: CalendarEvent[] = (agendaFilter !== 'reminders')
                ? events.filter(e => isEventOccurringOnDate(e, targetDate))
                : [];

            const dayReminders: Reminder[] = (agendaFilter !== 'events')
                ? sortedReminders.filter(r => isSameDay(new Date(r.due_date_ms), targetDate) && r.status === 'pending')
                : [];

            const combined: TimelineItem[] = [
                ...dayEvents.map(ev => {
                    const d = new Date(targetDate);
                    const orig = new Date(ev.start_time_ms);
                    d.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), orig.getMilliseconds());
                    return { type: 'event' as const, event: ev, time_ms: d.getTime() };
                }),
                ...dayReminders.map(r => ({ type: 'reminder' as const, item: r, time_ms: r.due_date_ms })),
            ].sort((a, b) => a.time_ms - b.time_ms);

            sections.push({
                key: 'selected_date',
                title: dateTitle,
                count: combined.length,
                data: combined,
            });

            return {
                sections,
                stats: { completedToday: 0, overdueCount: 0 },
                overdueCount: 0,
                isFilteredByDate: true,
            };
        }

        // ─── Vista general (selectedCalendarDate === null) ───

        // 1. Tareas Vencidas ("Urgente")
        const overdue = (agendaFilter !== 'events')
            ? sortedReminders.filter(r => isPast(r.due_date_ms) && r.status === 'pending')
            : [];

        if (overdue.length > 0) {
            sections.push({
                key: 'overdue',
                title: t('home.urgent'),
                count: overdue.length,
                isOverdue: true,
                data: overdue.map(r => ({ type: 'reminder' as const, item: r, time_ms: r.due_date_ms })),
            });
        }

        // 2. Hoy: Eventos y Tareas intercalados cronológicamente
        const todayDate = new Date();
        const todayEvents: CalendarEvent[] = (agendaFilter !== 'reminders')
            ? events.filter(e => isEventOccurringOnDate(e, todayDate))
            : [];

        const todayReminders: Reminder[] = (agendaFilter !== 'events')
            ? sortedReminders.filter(r => isToday(r.due_date_ms) && !isPast(r.due_date_ms) && r.status === 'pending')
            : [];

        const todayTimeline: TimelineItem[] = [
            ...todayEvents.map(ev => {
                const d = new Date(todayDate);
                const orig = new Date(ev.start_time_ms);
                d.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), orig.getMilliseconds());
                return { type: 'event' as const, event: ev, time_ms: d.getTime() };
            }),
            ...todayReminders.map(r => ({ type: 'reminder' as const, item: r, time_ms: r.due_date_ms })),
        ].sort((a, b) => a.time_ms - b.time_ms);

        sections.push({
            key: 'today',
            title: t('home.today'),
            count: todayTimeline.length,
            data: todayTimeline,
        });

        // 3. Días futuros agrupados cronológicamente
        const groupsByDay = new Map<string, { date: Date; items: TimelineItem[] }>();

        if (agendaFilter !== 'reminders') {
            // Eventos únicos futuros (que no sean hoy)
            const futureSingleEvents = events.filter(e => (!e.repeat_rule || e.repeat_rule === 'null') && !isToday(new Date(e.start_time_ms)) && !isPast(e.start_time_ms));
            futureSingleEvents.forEach(ev => {
                const dateObj = new Date(ev.start_time_ms);
                const key = format(dateObj, 'yyyy-MM-dd');
                const group = groupsByDay.get(key) || { date: dateObj, items: [] };
                group.items.push({ type: 'event', event: ev, time_ms: ev.start_time_ms });
                groupsByDay.set(key, group);
            });

            // Eventos recurrentes: proyectar para los próximos 14 días (del día 1 al 14)
            const recurringEvents = events.filter(e => e.repeat_rule && e.repeat_rule !== 'null');
            if (recurringEvents.length > 0) {
                for (let i = 1; i <= 14; i++) {
                    const futureDay = addDays(todayDate, i);
                    const key = format(futureDay, 'yyyy-MM-dd');
                    recurringEvents.forEach(ev => {
                        if (isEventOccurringOnDate(ev, futureDay)) {
                            const d = new Date(futureDay);
                            const orig = new Date(ev.start_time_ms);
                            d.setHours(orig.getHours(), orig.getMinutes(), orig.getSeconds(), orig.getMilliseconds());
                            const group = groupsByDay.get(key) || { date: futureDay, items: [] };
                            group.items.push({ type: 'event', event: ev, time_ms: d.getTime() });
                            groupsByDay.set(key, group);
                        }
                    });
                }
            }
        }

        const futureReminders: Reminder[] = (agendaFilter !== 'events')
            ? sortedReminders.filter(r => !isToday(r.due_date_ms) && !isPast(r.due_date_ms) && r.status === 'pending')
            : [];

        futureReminders.forEach(r => {
            const dateObj = new Date(r.due_date_ms);
            const key = format(dateObj, 'yyyy-MM-dd');
            const group = groupsByDay.get(key) || { date: dateObj, items: [] };
            group.items.push({ type: 'reminder', item: r, time_ms: r.due_date_ms });
            groupsByDay.set(key, group);
        });

        const sortedDayKeys = Array.from(groupsByDay.keys()).sort();

        sortedDayKeys.forEach(key => {
            const group = groupsByDay.get(key)!;
            const dayDate = group.date;
            const sortedDayItems = group.items.sort((a, b) => a.time_ms - b.time_ms);

            let sectionTitle = '';
            if (isTomorrow(dayDate)) {
                sectionTitle = language === 'es' ? 'Mañana' : 'Tomorrow';
            } else {
                sectionTitle = format(dayDate, language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale });
            }

            sections.push({
                key,
                title: sectionTitle,
                count: sortedDayItems.length,
                data: sortedDayItems,
            });
        });

        const completedToday = history.filter(h => isToday(h.last_modified_ms) && h.status === 'completed').length;
        const overdueCount = overdue.length;

        return { sections, stats: { completedToday, overdueCount }, overdueCount, isFilteredByDate: false };
    }, [sortedReminders, events, agendaFilter, now, history, t, selectedCalendarDate, locale, language, searchQuery]);

    const todayPendingReminders = useMemo(() => {
        return reminders.filter(r => isToday(r.due_date_ms) && r.status === 'pending');
    }, [reminders]);

    const todayCompletedList = useMemo(() => {
        return history.filter(h => isToday(h.last_modified_ms) && h.status === 'completed');
    }, [history]);

    const totalTodayTasks = todayPendingReminders.length + todayCompletedList.length;
    const criticalTodayCount = todayPendingReminders.filter(r => r.control_level === 'critical').length;
    const progressTodayPercent = totalTodayTasks > 0 ? Math.round((todayCompletedList.length / totalTodayTasks) * 100) : 100;

    const tasksFilterCount = useMemo(() => {
        if (selectedCalendarDate) {
            return sortedReminders.filter(r => isSameDay(new Date(r.due_date_ms), selectedCalendarDate) && r.status === 'pending').length;
        }
        return sortedReminders.filter(r => r.status === 'pending').length;
    }, [selectedCalendarDate, sortedReminders]);

    const eventsFilterCount = useMemo(() => {
        if (selectedCalendarDate) {
            return events.filter(e => isEventOccurringOnDate(e, selectedCalendarDate)).length;
        }
        const todayDate = new Date();
        return events.filter(e => {
            if (isEventOccurringOnDate(e, todayDate)) return true;
            if (e.repeat_rule && e.repeat_rule !== 'null') return true;
            return !isPast(e.start_time_ms);
        }).length;
    }, [selectedCalendarDate, events]);

    const allFilterCount = tasksFilterCount + eventsFilterCount;

    const handleShareAgenda = async () => {
        try {
            const dateStr = format(now, language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale });
            const allSorted = [...todayPendingReminders].sort((a, b) => a.due_date_ms - b.due_date_ms);

            let message = `${t('briefing.share_title', { defaultValue: 'Agenda del día' })} - ${dateStr}\n`;
            message += `----------------------------------------\n`;

            if (allSorted.length === 0) {
                message += `${t('briefing.no_pending_tasks', { defaultValue: 'No hay tareas pendientes para hoy.' })}\n`;
            } else {
                allSorted.forEach(r => {
                    const timeStr = format(new Date(r.due_date_ms), 'HH:mm');
                    const levelTag = (r.control_level || 'normal').toUpperCase();
                    message += `• ${timeStr} - ${r.title} [${levelTag}]\n`;

                    if (r.subtasks) {
                        try {
                            const subtasksList = JSON.parse(r.subtasks);
                            if (Array.isArray(subtasksList)) {
                                subtasksList.forEach((st: any) => {
                                    const check = st.completed ? '[x]' : '[ ]';
                                    message += `    ${check} ${st.title}\n`;
                                });
                            }
                        } catch {}
                    }
                });
            }

            message += `----------------------------------------\n`;
            message += `${t('briefing.share_summary', { count: allSorted.length, completed: todayCompletedList.length })}\n`;
            message += `Veyra`;

            await Share.share({
                title: `${t('briefing.share_title', { defaultValue: 'Agenda del día' })} - ${dateStr}`,
                message,
            });
        } catch (error) {
            console.error('Error sharing agenda:', error);
        }
    };

    const toggleSelection = (id: string) => {
        setSelectedReminders(prev => (prev.includes(id) ? prev.filter(rId => rId !== id) : [...prev, id]));
    };

    const toggleEventSelection = (id: string) => {
        setSelectedEvents(prev => (prev.includes(id) ? prev.filter(eId => eId !== id) : [...prev, id]));
    };

    const setCardOrigin = useCardTransitionStore(state => state.setOrigin);

    const handlePress = (id: string, rect?: CardRect) => {
        if (isSelectionMode) {
            toggleSelection(id);
        } else {
            if (rect && rect.width > 0 && rect.height > 0) {
                setCardOrigin(rect, 'reminder', id);
            }
            router.push({ pathname: '/reminder/[id]', params: { id } });
        }
    };

    const handleLongPress = (id: string) => {
        if (!isSelectionMode) {
            LayoutAnimation.configureNext({
                duration: 180,
                create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
                update: { type: LayoutAnimation.Types.easeInEaseOut },
                delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            });
            setSelectedReminders([id]);
        } else {
            toggleSelection(id);
        }
    };

    const pendingReminders = useMemo(() => reminders.filter(r => r.status === 'pending'), [reminders]);
    const isAllSelected = (pendingReminders.length > 0 || events.length > 0) &&
        selectedReminders.length === pendingReminders.length &&
        selectedEvents.length === events.length;

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedReminders([]);
            setSelectedEvents([]);
        } else {
            setSelectedReminders(pendingReminders.map(r => r.id));
            setSelectedEvents(events.map(e => e.id));
        }
    };

    const handleCompleteSelected = async () => {
        Animated.sequence([
            Animated.timing(completeButtonAnim, { toValue: 0.72, duration: 90, useNativeDriver: true }),
            Animated.spring(completeButtonAnim, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        ]).start();

        const toComplete = [...selectedReminders];
        setSelectedReminders([]);
        LayoutAnimation.configureNext({
            duration: 350,
            create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            update: { type: LayoutAnimation.Types.spring, springDamping: 0.82 },
            delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        });
        await markRemindersAsCompleted(toComplete);
    };

    const handleSnoozeSelected = async (minutes: number) => {
        setIsSnoozeModalVisible(false);
        const toSnooze = [...selectedReminders];
        setSelectedReminders([]);
        LayoutAnimation.configureNext({
            duration: 350,
            create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            update: { type: LayoutAnimation.Types.spring, springDamping: 0.82 },
            delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        });
        await snoozeRemindersBatch(toSnooze, minutes);
    };

    const handleShareSelected = async () => {
        const selectedList = reminders.filter(r => selectedReminders.includes(r.id));
        if (selectedList.length === 0) return;

        let message = `${language === 'es' ? 'Recordatorios de Veyra' : 'Veyra Reminders'} (${selectedList.length})\n`;
        message += `----------------------------------------\n`;
        selectedList.forEach((r, idx) => {
            const timeStr = format(new Date(r.due_date_ms), 'dd/MM HH:mm');
            const levelTag = (r.control_level || 'normal').toUpperCase();
            message += `${idx + 1}. ${r.title} [${levelTag}] - ${timeStr}\n`;
            if (r.description) {
                const plain = extractPlainTextFromPages(r.description);
                if (plain) message += `   ${plain}\n`;
            }
            if (r.subtasks) {
                try {
                    const subtasksList = JSON.parse(r.subtasks);
                    if (Array.isArray(subtasksList)) {
                        subtasksList.forEach((st: any) => {
                            const check = st.completed ? '[x]' : '[ ]';
                            message += `   ${check} ${st.title}\n`;
                        });
                    }
                } catch {}
            }
        });
        message += `----------------------------------------\nVeyra`;

        try {
            await Share.share({
                title: language === 'es' ? 'Recordatorios de Veyra' : 'Veyra Reminders',
                message,
            });
        } catch (e) {}
    };

    // Sincronizar selección de recordatorios y eventos con el dock morpheado
    useEffect(() => {
        if (totalSelectedCount > 0 && mainActiveTab === 'reminders') {
            useSelectionStore.getState().setSelection({
                title: `${totalSelectedCount} ${language === 'es' ? (totalSelectedCount === 1 ? 'seleccionado' : 'seleccionados') : 'selected'}`,
                isAllSelected,
                selectAllText: isAllSelected
                    ? (language === 'es' ? 'Deseleccionar' : 'Deselect')
                    : (language === 'es' ? 'Todos' : 'All'),
                onToggleSelectAll: toggleSelectAll,
                onClose: () => {
                    setSelectedReminders([]);
                    setSelectedEvents([]);
                },
                actions: [
                    ...(selectedReminders.length > 0 ? [
                        {
                            id: 'complete',
                            label: language === 'es' ? 'Completar' : 'Complete',
                            icon: (color: string) => <Check size={16} color={color} strokeWidth={2.5} />,
                            onPress: handleCompleteSelected,
                            color: isDark ? '#34D399' : '#059669',
                            bg: isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(5, 150, 105, 0.12)',
                        },
                        {
                            id: 'snooze',
                            label: language === 'es' ? 'Posponer' : 'Snooze',
                            icon: (color: string) => <Clock size={16} color={color} strokeWidth={2.4} />,
                            onPress: () => setIsSnoozeModalVisible(true),
                            color: isDark ? '#FBBF24' : '#F59E0B',
                            bg: isDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(245, 158, 11, 0.12)',
                        },
                    ] : []),
                    {
                        id: 'share',
                        label: language === 'es' ? 'Compartir' : 'Share',
                        icon: (color: string) => <Share2 size={16} color={accent.primary} strokeWidth={2.4} />,
                        onPress: () => {
                            if (selectedEvents.length > 0) {
                                setIsShareEventsModalVisible(true);
                            } else {
                                handleShareSelected();
                            }
                        },
                        color: accent.primary,
                        bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    },
                    {
                        id: 'delete',
                        label: language === 'es' ? 'Eliminar' : 'Delete',
                        icon: (color: string) => <Trash2 size={16} color={color} strokeWidth={2.4} />,
                        onPress: () => setIsBulkDeleteConfirmVisible(true),
                        color: isDark ? '#FB7185' : '#E11D48',
                        bg: isDark ? 'rgba(251, 113, 133, 0.15)' : 'rgba(225, 29, 72, 0.12)',
                    },
                ],
            });
        } else if (mainActiveTab === 'reminders') {
            useSelectionStore.getState().clearSelection();
        }
    }, [totalSelectedCount, selectedReminders.length, selectedEvents.length, isAllSelected, language, isDark, accent.primary, mainActiveTab, toggleSelectAll]);

    useEffect(() => {
        const backAction = () => {
            if (isSearching) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setIsSearching(false);
                setSearchQuery('');
                return true;
            }
            if (isSelectionMode) {
                setSelectedReminders([]);
                return true;
            }
            return false;
        };
        const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
        return () => backHandler.remove();
    }, [isSearching, isSelectionMode]);

    const getRiskInfo = (dueDate: number) => {
        const diff = differenceInMinutes(dueDate, now);
        const absDiff = Math.abs(diff);

        let shortText = '';
        if (absDiff < 60) {
            shortText = `${absDiff}m`;
        } else if (absDiff < 1440) {
            const h = Math.floor(absDiff / 60);
            const m = absDiff % 60;
            shortText = m > 0 ? `${h}h ${m}m` : `${h}h`;
        } else {
            const d = Math.floor(absDiff / 1440);
            shortText = `${d}d`;
        }

        if (diff < 0) {
            return {
                text: shortText,
                color: isDark ? '#FB7185' : '#E11D48',
                full: t('home.overdue_ago', { time: shortText }),
                isOverdue: true,
            };
        }

        const color = diff <= 60 ? (isDark ? '#FBBF24' : '#F59E0B') : colors.textSecondary;
        return {
            text: shortText,
            color,
            full: t('home.in_time', { time: shortText }),
            isOverdue: false,
        };
    };

    const getTimeRemainingParts = (dueDate: number) => {
        const diff = differenceInMinutes(dueDate, now);
        const absDiff = Math.abs(diff);
        const isEs = language === 'es';

        if (absDiff < 1) {
            if (diff < 0) {
                return {
                    number: isEs ? 'Recién' : 'Just',
                    suffix: isEs ? 'vencido' : 'overdue',
                    isOverdue: true,
                };
            }
            return {
                number: isEs ? 'Ahora' : 'Now',
                suffix: isEs ? 'vence' : 'due',
                isOverdue: false,
            };
        }

        let number = '';
        if (absDiff < 60) {
            number = `${absDiff}m`;
        } else if (absDiff < 1440) {
            const h = Math.floor(absDiff / 60);
            const m = absDiff % 60;
            number = m > 0 ? `${h}h ${m}m` : `${h}h`;
        } else {
            const d = Math.floor(absDiff / 1440);
            const h = Math.floor((absDiff % 1440) / 60);
            number = h > 0 ? `${d}d ${h}h` : `${d}d`;
        }

        if (diff < 0) {
            return {
                number,
                suffix: isEs ? 'vencido' : 'overdue',
                isOverdue: true,
            };
        }

        return {
            number,
            suffix: isEs ? 'restante' : 'remaining',
            isOverdue: false,
        };
    };

    const getSeverityConfig = (level?: string) => {
        switch (level?.toLowerCase()) {
            case 'strict':
                return {
                    label: language === 'es' ? 'Strict' : 'Strict',
                    color: '#FB923C',
                    bg: isDark ? '#432316' : '#FFEDD5',
                    border: isDark ? 'rgba(251, 146, 60, 0.25)' : 'rgba(251, 146, 60, 0.4)',
                };
            case 'critical':
                return {
                    label: language === 'es' ? 'Critical' : 'Critical',
                    color: '#FB7185',
                    bg: isDark ? '#4A1D24' : '#FFE4E6',
                    border: isDark ? 'rgba(251, 113, 133, 0.25)' : 'rgba(225, 29, 72, 0.4)',
                };
            case 'low':
                return {
                    label: language === 'es' ? 'Low' : 'Low',
                    color: '#34D399',
                    bg: isDark ? '#14382B' : '#D1FAE5',
                    border: isDark ? 'rgba(52, 211, 153, 0.25)' : 'rgba(5, 150, 105, 0.4)',
                };
            default: // normal
                return {
                    label: language === 'es' ? 'Normal' : 'Normal',
                    color: isDark ? '#A1A1AA' : '#64748B',
                    bg: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                    border: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                };
        }
    };

    const handlePressRow = useCallback((id: string) => {
        if (isSelectionMode) {
            toggleSelection(id);
        } else {
            router.push({ pathname: '/reminder/[id]', params: { id } });
        }
    }, [isSelectionMode, toggleSelection, router]);

    const handleLongPressRow = useCallback((id: string) => {
        handleLongPress(id);
    }, [handleLongPress]);

    const handleToggleCardSubtasks = useCallback((id: string, e?: any) => {
        toggleCardSubtasks(id, e);
    }, [toggleCardSubtasks]);

    const handleToggleSubtask = useCallback((reminderId: string, subtaskId: string) => {
        toggleSubtask(reminderId, subtaskId);
    }, [toggleSubtask]);

    const handleCompleteDismiss = useCallback((id: string) => {
        markAsCompleted(id);
    }, [markAsCompleted]);

    const handleDeleteDismiss = useCallback((id: string) => {
        deleteReminder(id);
    }, [deleteReminder]);

    const handlePressEvent = useCallback((id: string, itemTime?: number) => {
        if (totalSelectedCount > 0) {
            toggleEventSelection(id);
            return;
        }
        router.push({
            pathname: '/events/create',
            params: {
                id,
                occurrenceDate: itemTime ? new Date(itemTime).toISOString() : undefined,
            },
        });
    }, [router, totalSelectedCount]);

    const handleLongPressEvent = useCallback((id: string) => {
        toggleEventSelection(id);
    }, []);

    const handlePressNote = useCallback((noteId: string) => {
        useStore.getState().setMainActiveTab('notes');
        router.push({ pathname: '/notes', params: { openNoteId: noteId } });
    }, [router]);

    const handleEditEvent = useCallback((id: string, itemTime?: number) => {
        router.push({
            pathname: '/events/create',
            params: {
                id,
                occurrenceDate: itemTime ? new Date(itemTime).toISOString() : undefined,
            },
        });
    }, [router]);

    const handleDeleteEventDismiss = useCallback((id: string) => {
        deleteEvent(id);
    }, [deleteEvent]);

    const handleRequestRecurringDelete = useCallback((event: CalendarEvent, itemTime?: number) => {
        setRecurringDeleteTarget({ event, itemTime });
    }, []);

    const handleConfirmRecurringDelete = useCallback(async (mode: 'this' | 'following' | 'all') => {
        if (!recurringDeleteTarget) return;
        const { event, itemTime } = recurringDeleteTarget;
        const occurrenceDate = itemTime ? new Date(itemTime) : new Date(event.start_time_ms);
        setRecurringDeleteTarget(null);
        await deleteEventOccurrence(event.id, occurrenceDate, mode);
    }, [recurringDeleteTarget, deleteEventOccurrence]);


    // ─── Empty Calm State ───────────────────────────────────────────────────────
    const listEmptyElement = useMemo(() => {
        if (searchQuery.trim().length > 0) {
            return (
                <View style={styles.emptyDateCleanContainer}>
                    <View
                        style={[
                            styles.emptyIconCircle,
                            {
                                backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.07)',
                            },
                        ]}
                    >
                        <Search size={20} color={colors.textMuted} />
                    </View>
                    <Text style={[styles.emptyDateCleanTitle, { color: colors.textPrimary }]}>
                        {language === 'es' ? 'No se encontraron resultados' : 'No results found'}
                    </Text>
                    <Text style={[styles.emptyDateCleanSubtitle, { color: colors.textMuted }]}>
                        {language === 'es' ? 'Prueba con otros términos de búsqueda' : 'Try searching with different keywords'}
                    </Text>
                </View>
            );
        }
        return (
            <View style={styles.emptyDateCleanContainer}>
                <View
                    style={[
                        styles.emptyIconCircle,
                        {
                            backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.07)',
                        },
                    ]}
                >
                    <Sparkles size={20} color={accent.primary} />
                </View>
                <Text style={[styles.emptyDateCleanTitle, { color: colors.textPrimary }]}>
                    {t('home.in_calm')}
                </Text>
                <Text style={[styles.emptyDateCleanSubtitle, { color: colors.textMuted }]}>
                    {t('home.no_attention')}
                </Text>
            </View>
        );
    }, [colors, t, accent.primary, isDark, searchQuery, language]);

    // ─── Render Section Block (Grouped Surface card with rows) ─────────────────
    const renderSectionBlock = ({ item: section }: { item: AgendaSection }) => {
        return (
            <Reanimated.View
                key={section.key}
                layout={LinearTransition.duration(260).easing(ReanimatedEasing.bezier(0.25, 1, 0.5, 1))}
                style={styles.agendaSectionBlock}
            >
                {/* Section Header Row */}
                <View style={styles.agendaSectionHeaderRow}>
                    <Text
                        style={[
                            styles.agendaSectionTitle,
                            {
                                color: section.isOverdue
                                    ? (isDark ? '#FB7185' : '#E11D48')
                                    : colors.textSecondary,
                            },
                        ]}
                    >
                        {section.title}
                    </Text>
                    <View
                        style={[
                            styles.agendaSectionBadge,
                            {
                                backgroundColor: section.isOverdue
                                    ? (isDark ? 'rgba(251, 113, 133, 0.16)' : 'rgba(225, 29, 72, 0.1)')
                                    : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.agendaSectionBadgeText,
                                {
                                    color: section.isOverdue
                                        ? (isDark ? '#FB7185' : '#E11D48')
                                        : colors.textMuted,
                                },
                            ]}
                        >
                            {section.count}
                        </Text>
                    </View>
                </View>

                {/* Unified Surface Card holding all items or clean cardless free-day view */}
                {section.data.length === 0 ? (
                    <View style={styles.emptyDateCleanContainer}>
                        <View
                            style={[
                                styles.emptyIconCircle,
                                {
                                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.07)',
                                },
                            ]}
                        >
                            <Sparkles size={18} color={accent.primary} />
                        </View>
                        <Text style={[styles.emptyDateCleanTitle, { color: colors.textPrimary }]}>
                            {section.key === 'today'
                                ? (language === 'es' ? 'Todo despejado por hoy' : 'All clear for today')
                                : (language === 'es' ? 'Sin actividades programadas' : 'No activities scheduled')}
                        </Text>
                        <Text style={[styles.emptyDateCleanSubtitle, { color: colors.textMuted }]}>
                            {section.key === 'today'
                                ? (language === 'es' ? 'No tienes eventos ni recordatorios pendientes' : 'No pending events or reminders')
                                : (language === 'es' ? 'No hay eventos ni recordatorios para este día' : 'No events or reminders for this day')}
                        </Text>
                        <View style={styles.emptyDateCleanActionsRow}>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => router.push({ pathname: '/create', params: { initialDate: (selectedCalendarDate || new Date()).toISOString() } })}
                                style={[
                                    styles.emptyCleanPill,
                                    {
                                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.035)',
                                        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                                    },
                                ]}
                            >
                                <Plus size={12} color={accent.primary} strokeWidth={2.5} />
                                <Text style={[styles.emptyCleanPillText, { color: colors.textPrimary }]}>
                                    {language === 'es' ? 'Recordatorio' : 'Reminder'}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => router.push({ pathname: '/events/create', params: { initialDate: (selectedCalendarDate || new Date()).toISOString() } })}
                                style={[
                                    styles.emptyCleanPill,
                                    {
                                        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)',
                                        borderColor: isDark ? 'rgba(59, 130, 246, 0.22)' : 'rgba(59, 130, 246, 0.15)',
                                    },
                                ]}
                            >
                                <Plus size={12} color="#3B82F6" strokeWidth={2.5} />
                                <Text style={[styles.emptyCleanPillText, { color: '#3B82F6' }]}>
                                    {language === 'es' ? 'Evento' : 'Event'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <VeyraSurface
                        level={1}
                        radius="lg"
                        style={[
                            styles.agendaGroupedCard,
                            {
                                borderColor: section.isOverdue
                                    ? (isDark ? 'rgba(251, 113, 133, 0.35)' : 'rgba(225, 29, 72, 0.25)')
                                    : colors.borderSubtle,
                            },
                        ]}
                    >
                        {section.data.map((timelineItem, idx) => {
                            if (timelineItem.type === 'event') {
                                return (
                                    <AgendaEventRow
                                        key={`event-${timelineItem.event.id}-${timelineItem.time_ms}`}
                                        event={timelineItem.event}
                                        itemTime={timelineItem.time_ms}
                                        isLast={idx === section.data.length - 1}
                                        isSelected={selectedEvents.includes(timelineItem.event.id)}
                                        isSelectionMode={isSelectionMode}
                                        now={now}
                                        language={language}
                                        isDark={isDark}
                                        colors={colors}
                                        accent={accent}
                                        onPress={handlePressEvent}
                                        onLongPress={handleLongPressEvent}
                                        onPressNote={handlePressNote}
                                        onEdit={handleEditEvent}
                                        onDeleteDismiss={handleDeleteEventDismiss}
                                        onRequestRecurringDelete={handleRequestRecurringDelete}
                                    />
                                );
                            } else {
                                return (
                                    <AgendaReminderRow
                                        key={`reminder-${timelineItem.item.id}`}
                                        item={timelineItem.item}
                                        isLast={idx === section.data.length - 1}
                                        isSelected={selectedReminders.includes(timelineItem.item.id)}
                                        isSelectionMode={isSelectionMode}
                                        isSubtasksExpanded={!!expandedSubtaskCardIds[timelineItem.item.id]}
                                        language={language}
                                        isDark={isDark}
                                        colors={colors}
                                        accent={accent}
                                        now={now}
                                        onPressRow={handlePressRow}
                                        onLongPressRow={handleLongPressRow}
                                        onToggleCardSubtasks={handleToggleCardSubtasks}
                                        onToggleSubtask={handleToggleSubtask}
                                        onCompleteDismiss={handleCompleteDismiss}
                                        onDeleteDismiss={handleDeleteDismiss}
                                    />
                                );
                            }
                        })}
                    </VeyraSurface>
                )}
            </Reanimated.View>
        );
    };

    return (
        <View style={[styles.screen, { backgroundColor: colors.bg }]}>
            <View style={{ paddingTop: insets.top, backgroundColor: colors.bg, zIndex: 1000 }}>
                <TopBar />
            </View>
            {/* Contenedor central persistente con Crossfade puro */}
            <View style={{ flex: 1, position: 'relative' }}>
                <Reanimated.View
                    style={[StyleSheet.absoluteFill, remindersCrossfadeStyle]}
                    pointerEvents={mainActiveTab === 'reminders' ? 'auto' : 'none'}
                >
                {/* ─── HEADER / BUSCADOR / CALENDARIO DESPLEGABLE ─── */}
            {isSearching ? (
                <View style={[styles.searchBarWrapper, { borderBottomColor: colors.borderSubtle, backgroundColor: colors.bg }]}>
                    <VeyraSurface level={1} radius="md" style={styles.searchExpandedBar}>
                        <Search size={16} color={accent.primary as any} />
                        <TextInput
                            autoFocus
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder={language === 'es' ? 'Buscar recordatorios o eventos...' : 'Search reminders or events...'}
                            placeholderTextColor={colors.textMuted}
                            style={[
                                styles.searchExpandedInput,
                                { color: colors.textPrimary, fontSize: typography.body.fontSize },
                            ]}
                            selectionColor={accent.primary}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity
                                onPress={() => setSearchQuery('')}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={styles.searchIconBtn}
                            >
                                <X size={15} color={colors.textMuted as any} />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                setIsSearching(false);
                                setSearchQuery('');
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={[
                                styles.searchCloseBtn,
                                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)' },
                            ]}
                            activeOpacity={0.7}
                        >
                            <X size={14} color={colors.textSecondary as any} />
                        </TouchableOpacity>
                    </VeyraSurface>
                </View>
            ) : isSelectionMode ? (
                <View style={[styles.viewingAreaContainer, { borderBottomColor: colors.borderSubtle }]}>
                    <View style={styles.viewingAreaSelectionRow}>
                        <View>
                            <Text style={[styles.compactTitle, { color: colors.textPrimary }]}>
                                {selectedReminders.length} {t('home.selected', { defaultValue: 'seleccionados' })}
                            </Text>
                            <Text style={[styles.viewingAreaSubtitle, { color: colors.textSecondary }]}>
                                {selectedReminders.length === reminders.filter(r => r.status === 'pending').length
                                    ? (language === 'es' ? 'Todos los recordatorios seleccionados' : 'All reminders selected')
                                    : (language === 'es' ? 'Toca para seleccionar o desmarcar' : 'Tap to select or deselect')}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setSelectedReminders([])}
                            style={[
                                styles.clearSelectionBtn,
                                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <X size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                <CollapsibleCalendarHeader
                    selectedDate={selectedCalendarDate}
                    onSelectDate={setSelectedCalendarDate}
                    reminders={reminders}
                    events={events}
                    language={language}
                    onPressSearch={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setIsSearching(true);
                    }}
                    onPressHistory={() => router.push('/history')}
                    onPressShare={handleShareAgenda}
                    hasTodayTasks={totalTodayTasks > 0}
                />
            )}

            {/* ─── Agenda Filter Pills (Matching Notes screen chips) ─── */}
            {!isSelectionMode && !isSearching && (
                <View style={styles.filterPillsContainer}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterPillsScrollContent}
                    >
                        {/* 1. TODO */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                setAgendaFilter('all');
                            }}
                            style={[
                                styles.agendaChip,
                                {
                                    backgroundColor: agendaFilter === 'all'
                                        ? (isDark ? '#262933' : '#E2E8F0')
                                        : (isDark ? '#1C1F26' : '#FFFFFF'),
                                    borderColor: agendaFilter === 'all' ? accent.primary : colors.borderSubtle,
                                },
                            ]}
                        >
                            <Layers
                                size={13}
                                color={(agendaFilter === 'all' ? accent.primary : colors.textMuted) as any}
                            />
                            <Text
                                style={[
                                    styles.agendaChipText,
                                    {
                                        color: agendaFilter === 'all' ? colors.textPrimary : colors.textSecondary,
                                        fontWeight: agendaFilter === 'all' ? '700' : '500',
                                    },
                                ]}
                            >
                                {language === 'es' ? 'Todo' : 'All'}
                            </Text>
                            <Text
                                style={[
                                    styles.agendaChipBadge,
                                    {
                                        backgroundColor: agendaFilter === 'all'
                                            ? (isDark ? '#1C1F26' : '#FFFFFF')
                                            : (isDark ? '#262933' : '#F1F5F9'),
                                        color: agendaFilter === 'all' ? accent.primary : colors.textMuted,
                                    },
                                ]}
                            >
                                {allFilterCount}
                            </Text>
                        </TouchableOpacity>

                        {/* 2. TAREAS */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                setAgendaFilter('reminders');
                            }}
                            style={[
                                styles.agendaChip,
                                {
                                    backgroundColor: agendaFilter === 'reminders'
                                        ? (isDark ? '#262933' : '#E2E8F0')
                                        : (isDark ? '#1C1F26' : '#FFFFFF'),
                                    borderColor: agendaFilter === 'reminders' ? accent.primary : colors.borderSubtle,
                                },
                            ]}
                        >
                            <CheckSquare
                                size={13}
                                color={(agendaFilter === 'reminders' ? accent.primary : colors.textMuted) as any}
                            />
                            <Text
                                style={[
                                    styles.agendaChipText,
                                    {
                                        color: agendaFilter === 'reminders' ? colors.textPrimary : colors.textSecondary,
                                        fontWeight: agendaFilter === 'reminders' ? '700' : '500',
                                    },
                                ]}
                            >
                                {language === 'es' ? 'Tareas' : 'Tasks'}
                            </Text>
                            <Text
                                style={[
                                    styles.agendaChipBadge,
                                    {
                                        backgroundColor: agendaFilter === 'reminders'
                                            ? (isDark ? '#1C1F26' : '#FFFFFF')
                                            : (isDark ? '#262933' : '#F1F5F9'),
                                        color: agendaFilter === 'reminders' ? accent.primary : colors.textMuted,
                                    },
                                ]}
                            >
                                {tasksFilterCount}
                            </Text>
                        </TouchableOpacity>

                        {/* 3. EVENTOS */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                setAgendaFilter('events');
                            }}
                            style={[
                                styles.agendaChip,
                                {
                                    backgroundColor: agendaFilter === 'events'
                                        ? (isDark ? '#1E293B' : '#DBEAFE')
                                        : (isDark ? '#1C1F26' : '#FFFFFF'),
                                    borderColor: agendaFilter === 'events' ? '#3B82F6' : colors.borderSubtle,
                                },
                            ]}
                        >
                            <CalendarIcon
                                size={13}
                                color={(agendaFilter === 'events' ? '#3B82F6' : colors.textMuted) as any}
                            />
                            <Text
                                style={[
                                    styles.agendaChipText,
                                    {
                                        color: agendaFilter === 'events' ? colors.textPrimary : colors.textSecondary,
                                        fontWeight: agendaFilter === 'events' ? '700' : '500',
                                    },
                                ]}
                            >
                                {language === 'es' ? 'Eventos' : 'Events'}
                            </Text>
                            <Text
                                style={[
                                    styles.agendaChipBadge,
                                    {
                                        backgroundColor: agendaFilter === 'events'
                                            ? (isDark ? '#0F172A' : '#FFFFFF')
                                            : (isDark ? '#262933' : '#F1F5F9'),
                                        color: agendaFilter === 'events' ? '#3B82F6' : colors.textMuted,
                                    },
                                ]}
                            >
                                {eventsFilterCount}
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            )}

            <Animated.View
                style={[
                    styles.listWrapper,
                    { opacity: listAnimOpacity },
                ]}
            >
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingBottom: insets.bottom + (isSelectionMode ? 130 : 90),
                        paddingTop: 8,
                        paddingHorizontal: 20,
                    }}
                >
                    {listData.sections.length === 0
                        ? listEmptyElement
                        : listData.sections.map((section) => renderSectionBlock({ item: section }))}
                </ScrollView>
            </Animated.View>
        </Reanimated.View>

            {/* 2. VISTA DE NOTAS */}
                <Reanimated.View
                    style={[StyleSheet.absoluteFill, notesCrossfadeStyle]}
                    pointerEvents={mainActiveTab === 'notes' ? 'auto' : 'none'}
                >
                    <NotesScreen hideBars />
                </Reanimated.View>
            </View>
            <BottomTabBar />

            {/* Modal para Posponer Recordatorios Seleccionados */}
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
                        style={styles.bulkDeleteCard}
                    >
                        <Text style={[styles.bulkDeleteTitle, { color: colors.textPrimary }]}>
                            {language === 'es' ? 'Posponer seleccionados' : 'Snooze selected'}
                        </Text>
                        <Text style={[styles.bulkDeleteSubtitle, { color: colors.textSecondary }]}>
                            {language === 'es'
                                ? `Elige cuánto tiempo deseas posponer ${selectedReminders.length} recordatorio${selectedReminders.length > 1 ? 's' : ''}`
                                : `Choose how long to snooze ${selectedReminders.length} reminder${selectedReminders.length > 1 ? 's' : ''}`}
                        </Text>
                        <View style={{ gap: 8, width: '100%', marginBottom: 12 }}>
                            <VeyraButton
                                variant="secondary"
                                size="md"
                                label={language === 'es' ? '+10 Minutos' : '+10 Minutes'}
                                iconLeft={<Clock size={16} color={accent.primary} />}
                                onPress={() => handleSnoozeSelected(10)}
                            />
                            <VeyraButton
                                variant="secondary"
                                size="md"
                                label={language === 'es' ? '+1 Hora' : '+1 Hour'}
                                iconLeft={<Clock size={16} color={accent.primary} />}
                                onPress={() => handleSnoozeSelected(60)}
                            />
                            <VeyraButton
                                variant="secondary"
                                size="md"
                                label={language === 'es' ? '+1 Día (Mañana)' : '+1 Day (Tomorrow)'}
                                iconLeft={<Clock size={16} color={accent.primary} />}
                                onPress={() => handleSnoozeSelected(1440)}
                            />
                        </View>
                        <VeyraButton
                            variant="ghost"
                            size="md"
                            label={t('common.cancel', { defaultValue: 'Cancelar' })}
                            onPress={() => setIsSnoozeModalVisible(false)}
                        />
                    </VeyraSurface>
                </View>
            )}

            {/* Bulk Delete Confirm Modal */}
            {isBulkDeleteConfirmVisible && (
                <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
                    <TouchableOpacity
                        style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassBackdrop }]}
                        activeOpacity={1}
                        onPress={() => setIsBulkDeleteConfirmVisible(false)}
                    />
                    <VeyraSurface
                        level={2}
                        radius="lg"
                        style={styles.bulkDeleteCard}
                    >
                        <Text style={[styles.bulkDeleteTitle, { color: colors.textPrimary }]}>
                            {selectedReminders.length === 1
                                ? t('home.delete_confirm', { count: 1 })
                                : t('home.delete_confirm_plural', { count: selectedReminders.length })}
                        </Text>
                        <Text style={[styles.bulkDeleteSubtitle, { color: colors.textSecondary }]}>
                            {t('home.delete_desc')}
                        </Text>
                        <View style={styles.bulkDeleteButtonsRow}>
                            <VeyraButton
                                variant="secondary"
                                size="md"
                                style={{ flex: 1 }}
                                label={t('home.cancel')}
                                onPress={() => setIsBulkDeleteConfirmVisible(false)}
                            />
                            <VeyraButton
                                variant="danger"
                                size="md"
                                style={{ flex: 1 }}
                                label={t('home.delete')}
                                onPress={async () => {
                                    setIsBulkDeleteConfirmVisible(false);
                                    if (selectedReminders.length > 0) {
                                        await deleteReminders(selectedReminders);
                                    }
                                    if (selectedEvents.length > 0) {
                                        for (const evId of selectedEvents) {
                                            await deleteEvent(evId);
                                        }
                                    }
                                    setSelectedReminders([]);
                                    setSelectedEvents([]);
                                    useSelectionStore.getState().clearSelection();
                                }}
                            />
                        </View>
                    </VeyraSurface>
                </View>
            )}

            {/* Modal para Compartir Eventos Múltiples */}
            <ShareEventsModal
                visible={isShareEventsModalVisible}
                onClose={() => {
                    setIsShareEventsModalVisible(false);
                    setSelectedEvents([]);
                    setSelectedReminders([]);
                    useSelectionStore.getState().clearSelection();
                }}
                events={events.filter(e => selectedEvents.includes(e.id))}
            />

            {/* Recurring Event Delete Confirm Modal */}
            <RecurringDeleteModal
                visible={Boolean(recurringDeleteTarget)}
                eventTitle={recurringDeleteTarget?.event.title}
                occurrenceDate={recurringDeleteTarget?.itemTime ? new Date(recurringDeleteTarget.itemTime) : undefined}
                onClose={() => setRecurringDeleteTarget(null)}
                onConfirm={handleConfirmRecurringDelete}
            />

            <ImageViewing
                images={galleryImages}
                imageIndex={galleryIndex}
                visible={galleryVisible}
                onRequestClose={() => setGalleryVisible(false)}
                swipeToCloseEnabled={true}
                doubleTapToZoomEnabled={true}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    viewingAreaContainer: {
        paddingHorizontal: 24,
        paddingTop: 2,
        paddingBottom: 0,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    viewingAreaSelectionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
    },
    clearSelectionBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    compactTitle: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    viewingAreaSubtitle: {
        fontSize: 12.5,
        fontWeight: '500',
    },
    compactTabsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    tabsLeftGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18,
    },
    compactTabItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        position: 'relative',
    },
    compactTabItemActive: {},
    compactTabText: {
        fontSize: 14.5,
        letterSpacing: -0.1,
    },
    countBadge: {
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    countBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    compactTabIndicator: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2.5,
        borderTopLeftRadius: 2,
        borderTopRightRadius: 2,
    },
    headerActionsRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerActionBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    calendarViewWrapper: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 12,
    },
    listWrapper: {
        flex: 1,
    },
    listHeaderContainer: {
        marginBottom: 6,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
        paddingHorizontal: 2,
    },
    statsLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statBadge: {
        fontSize: 12,
        fontWeight: '600',
    },
    historyBtn: {
        padding: 4,
    },
    selectionBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 14,
    },
    selectionBarLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    selectionBarIconBtn: {
        padding: 4,
    },
    selectionCount: {
        fontSize: 13,
        fontWeight: '700',
    },
    selectionBarRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    selectionTopIndicator: {
        paddingVertical: 6,
        paddingHorizontal: 4,
        marginBottom: 8,
    },
    selectionTopText: {
        fontSize: 13,
        fontWeight: '600',
    },
    floatingSelectionPill: {
        position: 'absolute',
        left: 20,
        right: 20,
        borderRadius: 22,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
        elevation: 20,
        zIndex: 1000,
    },
    pillHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        paddingHorizontal: 2,
    },
    pillCounterContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    pillCloseBtn: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pillTitle: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    pillSelectAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 4,
        paddingHorizontal: 9,
        borderRadius: 12,
        borderWidth: 1,
    },
    pillSelectAllText: {
        fontSize: 11,
        fontWeight: '600',
    },
    pillDivider: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 4,
        marginBottom: 8,
    },
    pillActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    pillActionBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingVertical: 2,
        paddingHorizontal: 8,
        minWidth: 56,
    },
    pillActionIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pillActionLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.1,
    },
    heroWrapper: {
        marginBottom: 10,
    },
    minimalHeroCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 2,
    },
    heroSelectionBadge: {
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 2,
    },
    heroTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    heroTimeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    heroTimeNumber: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    heroTimeSuffix: {
        fontSize: 12,
        fontWeight: '500',
    },
    heroCleanTitle: {
        fontSize: 15.5,
        fontWeight: '700',
        lineHeight: 21,
        marginBottom: 4,
    },
    heroSeverityPill: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
    },
    heroSeverityValue: {
        fontSize: 11,
        fontWeight: '700',
    },
    heroCleanDesc: {
        fontSize: 12.5,
        lineHeight: 17,
        marginBottom: 6,
    },
    heroFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    heroSubtasksBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 2,
    },
    heroSubtasksText: {
        fontSize: 11.5,
        fontWeight: '600',
    },
    heroAttachmentsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    excelThumbnailBox: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
        overflow: 'hidden',
    },
    excelSheetGrid: {
        position: 'absolute',
        right: 4,
        top: 8,
        width: 16,
        height: 22,
        borderWidth: 1,
        borderColor: '#107C41',
        backgroundColor: '#F3FAF6',
        borderRadius: 2,
        justifyContent: 'space-evenly',
        paddingHorizontal: 1,
    },
    excelGridRow: {
        height: 1,
        backgroundColor: '#107C41',
        opacity: 0.6,
    },
    excelXBadge: {
        position: 'absolute',
        left: 4,
        width: 17,
        height: 18,
        backgroundColor: '#107C41',
        borderRadius: 3,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 1,
    },
    excelXText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '900',
    },
    pdfThumbnailBox: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
    },
    pdfDocSheet: {
        width: 23,
        height: 26,
        backgroundColor: '#F1F5F9',
        borderRadius: 3,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 2,
        borderWidth: 0.5,
        borderColor: '#CBD5E1',
        overflow: 'hidden',
    },
    pdfDocFold: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 6,
        height: 6,
        backgroundColor: '#CBD5E1',
        borderBottomLeftRadius: 3,
    },
    pdfRedTag: {
        backgroundColor: '#DC2626',
        borderRadius: 2,
        paddingHorizontal: 2.5,
        paddingVertical: 0.5,
        marginBottom: 2,
    },
    pdfTagText: {
        color: '#FFFFFF',
        fontSize: 7.5,
        fontWeight: '900',
        letterSpacing: 0.2,
    },
    imageThumbnailBox: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
    },
    imageThumbnailImg: {
        width: '100%',
        height: '100%',
    },
    calmStateContainer: {
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    calmTitle: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    calmSubtitle: {
        fontSize: 12,
        fontWeight: '400',
    },
    itemContainer: {
        marginBottom: 10,
    },
    itemContent: {
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 10,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        flex: 1,
    },
    selectionCheck: {
        width: 18,
        height: 18,
        borderRadius: 999,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },
    itemTitle: {
        fontWeight: '600',
        fontSize: 15,
        lineHeight: 20,
        letterSpacing: -0.2,
        flex: 1,
    },
    itemEditBtn: {
        padding: 4,
        marginTop: -2,
    },
    cardFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 18,
        gap: 8,
    },
    cardDateBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        flexShrink: 1,
    },
    itemExactDateText: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: -0.1,
    },
    itemRiskRelativeText: {
        fontSize: 11.5,
        fontWeight: '500',
    },
    cardChipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        flexShrink: 0,
    },
    metaChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3.5,
        paddingHorizontal: 6,
        paddingVertical: 2.5,
        borderRadius: 6,
    },
    metaChipText: {
        fontSize: 10.5,
        fontWeight: '700',
    },
    cardSubtasksExpandedBox: {
        marginTop: 6,
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(150, 150, 150, 0.18)',
        gap: 6,
    },
    cardSubtaskItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 3,
        paddingHorizontal: 2,
    },
    cardSubtaskCheckbox: {
        width: 17,
        height: 17,
        borderRadius: 4,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 9,
    },
    cardSubtaskItemText: {
        fontSize: 13,
        flex: 1,
        lineHeight: 18,
    },

    modalOverlay: {
        zIndex: 1000,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalCardContainer: {
        width: '100%',
        maxWidth: 360,
    },
    modalGlass: {
        width: '100%',
    },
    modalContent: {
        padding: 20,
    },
    modalHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    modalHeaderActions: {
        flexDirection: 'row',
        gap: 6,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 8,
    },
    modalThumbnail: {
        width: 80,
        height: 80,
        borderWidth: 1,
    },
    modalTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    modalTimeText: {
        fontSize: 13,
        fontWeight: '700',
    },
    modalActionButtonsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    deleteConfirmContainer: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        borderRadius: 14,
    },
    deleteConfirmIconWrapper: {
        padding: 12,
        borderRadius: 999,
        marginBottom: 12,
    },
    deleteConfirmTitle: {
        fontSize: 16,
        fontWeight: '800',
        marginBottom: 4,
        textAlign: 'center',
    },
    deleteConfirmSubtitle: {
        fontSize: 13,
        textAlign: 'center',
        marginBottom: 16,
    },
    deleteConfirmButtonsRow: {
        flexDirection: 'row',
        gap: 10,
        width: '100%',
    },
    bulkDeleteCard: {
        width: '100%',
        maxWidth: 340,
        padding: 20,
        zIndex: 1001,
    },
    bulkDeleteTitle: {
        fontSize: 17,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 6,
    },
    bulkDeleteSubtitle: {
        fontSize: 13,
        textAlign: 'center',
        marginBottom: 18,
    },
    bulkDeleteButtonsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    eventsHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 14,
        marginBottom: 8,
    },
    quickAddEventBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        gap: 4,
    },
    quickAddEventBtnText: {
        fontSize: 12,
        fontWeight: '700',
    },
    // ─── Search Bar (Matching Notes Screen) ───
    searchBarWrapper: {
        paddingHorizontal: 20,
        paddingVertical: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        minHeight: 52,
        justifyContent: 'center',
    },
    searchExpandedBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        height: 42,
    },
    searchExpandedInput: {
        flex: 1,
        height: 38,
        padding: 0,
        fontWeight: '500',
    },
    searchIconBtn: {
        padding: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchCloseBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // ─── Agenda Filter Pills (Matching Notes Screen Aesthetics) ───
    filterPillsContainer: {
        marginBottom: 8,
        marginTop: 2,
    },
    filterPillsScrollContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 24,
        paddingVertical: 2,
    },
    agendaChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingLeft: 10,
        paddingRight: 8,
        borderRadius: 14,
        borderWidth: 1,
    },
    agendaChipText: {
        fontSize: 12,
    },
    agendaChipBadge: {
        fontSize: 10.5,
        fontWeight: '700',
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 8,
        overflow: 'hidden',
    },

    // ─── Hero Event Card Styles ───
    heroEventTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    heroLiveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 3.5,
        borderRadius: 8,
    },
    heroLiveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#3B82F6',
    },
    heroLiveText: {
        color: '#3B82F6',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.6,
    },
    heroUpcomingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4.5,
        paddingHorizontal: 8,
        paddingVertical: 3.5,
        borderRadius: 8,
    },
    heroUpcomingText: {
        fontSize: 11,
        fontWeight: '600',
    },
    heroEventTimeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    heroEventTimeText: {
        fontSize: 11.5,
        fontWeight: '700',
        color: '#3B82F6',
    },
    heroEventTitle: {
        fontSize: 16,
        fontWeight: '700',
        lineHeight: 22,
        letterSpacing: -0.2,
        marginBottom: 6,
    },
    heroEventMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginBottom: 10,
    },
    heroEventMetaText: {
        fontSize: 12,
        flex: 1,
    },
    heroEventFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 6,
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(150, 150, 150, 0.15)',
    },
    heroEventNoteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 4.5,
        borderRadius: 8,
    },
    heroEventNoteBtnText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#3B82F6',
    },
    heroEventDetailsBtn: {
        paddingHorizontal: 10,
        paddingVertical: 4.5,
        borderRadius: 8,
    },
    heroEventDetailsBtnText: {
        fontSize: 11,
        fontWeight: '600',
    },

    // ─── Grouped Section Architecture (Calm, Unified UI) ───
    agendaSectionBlock: {
        marginBottom: 20,
    },
    agendaSectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        paddingHorizontal: 4,
    },
    agendaSectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.2,
        textTransform: 'capitalize',
    },
    agendaSectionBadge: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    agendaSectionBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    agendaGroupedCard: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
    },
    agendaItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 12,
    },
    rowDivider: {
        marginHorizontal: 14,
        opacity: 0.45,
    },
    collapsibleWrapper: {
        width: '100%',
        overflow: 'hidden',
    },
    agendaRowWrapper: {
        position: 'relative',
        overflow: 'hidden',
    },
    swipeActionBg: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
    },
    swipeActionContentLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    swipeActionContentRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    swipeActionLabel: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    swipeFrontRow: {
        width: '100%',
    },
    reminderSidePill: {
        width: 4,
        height: 28,
        borderRadius: 2,
    },
    agendaRowContent: {
        flex: 1,
        justifyContent: 'center',
        gap: 3,
        minWidth: 0,
    },
    agendaRowTitleLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    agendaRowTitle: {
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: -0.1,
        flexShrink: 1,
    },
    criticalDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    agendaRowMetaLine: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
    },
    agendaRowTimeWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    agendaRowTimeText: {
        fontSize: 11.5,
        fontWeight: '600',
    },
    agendaRowRiskText: {
        fontSize: 11,
        fontWeight: '500',
    },
    agendaRowLocationWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        maxWidth: 130,
    },
    agendaRowLocationText: {
        fontSize: 11,
    },
    agendaRowMiniChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3.5,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    agendaRowMiniChipText: {
        fontSize: 10,
        fontWeight: '600',
    },
    agendaRowActionBtn: {
        padding: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    agendaRowSubtasksBox: {
        paddingLeft: 46,
        paddingRight: 14,
        paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: 6,
    },
    agendaRowSubtaskItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 2,
    },
    agendaRowSubtaskText: {
        fontSize: 12,
        flex: 1,
    },
    liveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 1.5,
        borderRadius: 6,
    },
    liveDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    liveBadgeText: {
        fontSize: 10,
        fontWeight: '700',
    },
    liveEventBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 14,
        gap: 8,
    },
    liveEventPulseDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#3B82F6',
    },
    liveEventLabel: {
        fontSize: 10.5,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    liveEventTitle: {
        fontSize: 13,
        fontWeight: '600',
        flex: 1,
    },
    liveEventTime: {
        fontSize: 11.5,
        fontWeight: '600',
    },
    emptyDateCleanContainer: {
        paddingVertical: 32,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    emptyDateCleanTitle: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.2,
        textAlign: 'center',
    },
    emptyDateCleanSubtitle: {
        fontSize: 12.5,
        marginTop: 4,
        textAlign: 'center',
        letterSpacing: 0.1,
    },
    emptyDateCleanActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 18,
    },
    emptyCleanPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
    },
    emptyCleanPillText: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.1,
    },
});
