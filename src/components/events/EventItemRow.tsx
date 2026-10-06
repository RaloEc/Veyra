import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { format, isToday, differenceInMinutes, isSameDay } from 'date-fns';
import { CalendarEvent } from '../../types/db';
import { isEventOccurringOnDate } from '../../services/eventService';
import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraCard } from '../ui/VeyraCard';
import {
    Clock,
    MapPin,
    Repeat,
    FileText,
    Edit3,
    Calendar as CalendarIcon,
} from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';

interface EventItemRowProps {
    event: CalendarEvent;
    itemTime?: number;
    occurrenceDate?: Date;
    onPress?: () => void;
    onPressNote?: (noteId?: string | null) => void;
    onCreateNoteForEvent?: (event: CalendarEvent) => void;
}

export function EventItemRow({
    event,
    itemTime,
    occurrenceDate,
    onPress,
    onPressNote,
    onCreateNoteForEvent,
}: EventItemRowProps) {
    const router = useRouter();
    const { colors, accent, isDark } = useVeyraTheme();

    const startDate = new Date(event.start_time_ms);
    const endDate = new Date(event.end_time_ms);

    const startTimeFormatted = format(startDate, 'HH:mm');
    const endTimeFormatted = format(endDate, 'HH:mm');

    // Comprobar si el evento está "En curso ahora"
    const nowMs = Date.now();
    const today = new Date(nowMs);
    const targetDate = itemTime ? new Date(itemTime) : (occurrenceDate || startDate);
    const isTargetToday = isSameDay(targetDate, today);
    const occursToday = isTargetToday && isEventOccurringOnDate(event, today);
    let isHappeningNow = false;
    if (occursToday) {
        const startToday = new Date(today);
        startToday.setHours(startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), startDate.getMilliseconds());
        const endToday = new Date(today);
        endToday.setHours(endDate.getHours(), endDate.getMinutes(), endDate.getSeconds(), endDate.getMilliseconds());
        isHappeningNow = nowMs >= startToday.getTime() && nowMs <= endToday.getTime();
    }

    // Duración en minutos / horas
    const durationMin = Math.max(0, differenceInMinutes(endDate, startDate));
    let durationStr = '';
    if (durationMin > 0) {
        if (durationMin < 60) {
            durationStr = `${durationMin}m`;
        } else {
            const h = Math.floor(durationMin / 60);
            const m = durationMin % 60;
            durationStr = m > 0 ? `${h}h ${m}m` : `${h}h`;
        }
    }

    const eventColor = event.color || accent.primary || '#3B82F6';
    const isRecurring = Boolean(event.repeat_rule && event.repeat_rule !== 'null');

    const handleNotePress = (e: any) => {
        if (e && e.stopPropagation) e.stopPropagation();
        if (event.note_id) {
            if (onPressNote) {
                onPressNote(event.note_id);
            } else {
                router.push({
                    pathname: '/notes/[id]',
                    params: { id: event.note_id },
                });
            }
        } else {
            if (onCreateNoteForEvent) {
                onCreateNoteForEvent(event);
            } else {
                router.push({
                    pathname: '/notes/create',
                    params: {
                        eventId: event.id,
                        initialTitle: `${event.title} - ${format(startDate, 'dd/MM/yyyy')}`,
                    },
                });
            }
        }
    };

    const handleEditPress = (e: any) => {
        if (e && e.stopPropagation) e.stopPropagation();
        router.push({ pathname: '/events/create', params: { id: event.id } });
    };

    const eventTintBg = isDark
        ? (isHappeningNow ? `${eventColor}24` : `${eventColor}14`)
        : (isHappeningNow ? `${eventColor}18` : `${eventColor}0C`);

    const eventBorderColor = isDark
        ? (isHappeningNow ? eventColor : `${eventColor}40`)
        : (isHappeningNow ? eventColor : `${eventColor}2E`);

    return (
        <View style={styles.itemContainer}>
            <VeyraCard
                level={1}
                radius="lg"
                bordered={true}
                borderLevel={isHappeningNow ? 'medium' : 'subtle'}
                onPress={onPress || (() => router.push({ pathname: '/events/create', params: { id: event.id } }))}
                contentContainerStyle={[
                    styles.itemContent,
                    {
                        backgroundColor: eventTintBg,
                        borderColor: eventBorderColor,
                        borderWidth: isHappeningNow ? 1.5 : 1,
                    },
                ]}
            >
                {/* ─── Fila Superior: Icono Evento + Título + Badge 'EVENTO'/'EN CURSO' + Botón Editar ─── */}
                <View style={styles.cardHeaderRow}>
                    <View style={styles.cardHeaderLeft}>
                        {/* Icono temático de calendario */}
                        <View style={[styles.eventIconBox, { backgroundColor: isDark ? `${eventColor}28` : `${eventColor}18` }]}>
                            <CalendarIcon size={12} color={eventColor as any} />
                        </View>

                        <Text
                            style={[
                                styles.itemTitle,
                                { color: colors.textPrimary },
                            ]}
                            numberOfLines={1}
                        >
                            {event.title}
                        </Text>

                        {isHappeningNow ? (
                            <View style={[styles.liveBadge, { backgroundColor: isDark ? `${eventColor}35` : `${eventColor}20` }]}>
                                <View style={[styles.liveDot, { backgroundColor: eventColor }]} />
                                <Text style={[styles.liveBadgeText, { color: eventColor }]}>
                                    EN CURSO
                                </Text>
                            </View>
                        ) : (
                            <View style={[styles.eventBadge, { backgroundColor: isDark ? `${eventColor}20` : `${eventColor}14` }]}>
                                <Text style={[styles.eventBadgeText, { color: eventColor }]}>
                                    EVENTO
                                </Text>
                            </View>
                        )}
                    </View>

                    <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={handleEditPress}
                        style={styles.itemEditBtn}
                        activeOpacity={0.7}
                    >
                        <Edit3 size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                </View>

                {/* ─── Fila Inferior: Horario, Ubicación y Chips de Notas ─── */}
                <View style={styles.cardFooterRow}>
                    {/* Caja de tiempo */}
                    <View style={styles.cardDateBox}>
                        <Clock size={12} color={(isHappeningNow ? eventColor : colors.textSecondary) as any} />
                        <Text style={[styles.itemExactDateText, { color: isHappeningNow ? eventColor : colors.textPrimary }]}>
                            {startTimeFormatted} – {endTimeFormatted}
                        </Text>
                        {durationStr ? (
                            <Text style={[styles.itemDurationText, { color: colors.textMuted }]}>
                                • {durationStr}
                            </Text>
                        ) : null}
                    </View>

                    {/* Chips de metadatos (Ubicación, Notas, Recurrencia) */}
                    <View style={styles.cardChipsRow}>
                        {Boolean(event.location) && (
                            <View style={[styles.metaChip, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}>
                                <MapPin size={10.5} color={colors.textSecondary} />
                                <Text style={[styles.metaChipText, { color: colors.textSecondary }]} numberOfLines={1}>
                                    {event.location}
                                </Text>
                            </View>
                        )}

                        {isRecurring && (
                            <View style={[styles.metaChip, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' }]}>
                                <Repeat size={10.5} color={colors.textMuted} />
                            </View>
                        )}

                        {/* Botón / Chip interactivo de notas vinculadas */}
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={handleNotePress}
                            style={[
                                styles.metaChip,
                                event.note_id
                                    ? {
                                          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.16)' : 'rgba(37, 99, 235, 0.1)',
                                          borderWidth: StyleSheet.hairlineWidth,
                                          borderColor: '#3B82F6',
                                      }
                                    : { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' },
                            ]}
                        >
                            <FileText
                                size={10.5}
                                color={event.note_id ? '#3B82F6' : colors.textMuted}
                            />
                            <Text
                                style={[
                                    styles.metaChipText,
                                    {
                                        color: event.note_id ? '#3B82F6' : colors.textSecondary,
                                        fontWeight: event.note_id ? '700' : '500',
                                    },
                                ]}
                            >
                                {event.note_id ? 'Nota' : '+ Nota'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </VeyraCard>
        </View>
    );
}

const styles = StyleSheet.create({
    itemContainer: {
        marginBottom: 8,
    },
    itemContent: {
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        flex: 1,
    },
    eventIconBox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    eventBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    eventBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    itemTitle: {
        fontSize: 14.5,
        fontWeight: '700',
        letterSpacing: -0.2,
        flexShrink: 1,
    },
    liveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        gap: 4,
    },
    liveDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
    },
    liveBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    itemEditBtn: {
        padding: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingTop: 6,
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
        fontWeight: '600',
        letterSpacing: -0.1,
    },
    itemDurationText: {
        fontSize: 11,
        fontWeight: '400',
    },
    cardChipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    metaChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3.5,
        paddingHorizontal: 6,
        paddingVertical: 2.5,
        borderRadius: 5,
    },
    metaChipText: {
        fontSize: 10.5,
        fontWeight: '500',
    },
});
