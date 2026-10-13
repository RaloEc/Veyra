import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Share,
    ScrollView,
    ActivityIndicator,
    Alert,
    Clipboard,
    Vibration,
} from 'react-native';
import {
    Share2,
    Copy,
    Check,
    X,
    CopyPlus,
    RefreshCw,
    Calendar,
    Sparkles,
    CheckSquare,
    Bell,
} from '@tamagui/lucide-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { CalendarEvent, Reminder, BatchCollabItem } from '../../types/db';
import { CollaborationService } from '../../services/collaborationService';
import { useStore } from '../../store/useStore';
import { useShareEventsStore } from '../../store/useShareEventsStore';
import { APP_CONFIG } from '../../constants/appConfig';
import { extractPlainTextFromPages } from '../../utils/pageUtils';
import { encodeBase64 } from '../../utils/base64Utils';

export type ShareSyncMode = 'independent' | 'synced';

interface ShareEventsMorphCardProps {
    events?: CalendarEvent[];
    reminders?: Reminder[];
    onClose: () => void;
    onSuccess?: () => void;
}

export function ShareEventsMorphCard({
    events = [],
    reminders = [],
    onClose,
    onSuccess,
}: ShareEventsMorphCardProps) {
    const { colors, accent, isDark } = useVeyraTheme();
    const language = useStore(state => state.language);
    const session = useStore(state => state.session);
    const isEs = language === 'es';

    const [syncMode, setSyncMode] = useState<ShareSyncMode>(session?.user?.id ? 'synced' : 'independent');
    const [isSharing, setIsSharing] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const eventsList = events || [];
    const remindersList = reminders || [];
    const totalCount = eventsList.length + remindersList.length;

    if (totalCount === 0) return null;

    const isOnlyReminders = remindersList.length > 0 && eventsList.length === 0;
    const isOnlyEvents = eventsList.length > 0 && remindersList.length === 0;

    const headerTitle = isOnlyReminders
        ? (isEs ? 'Compartir Recordatorios' : 'Share Reminders')
        : isOnlyEvents
        ? (isEs ? 'Compartir Eventos' : 'Share Events')
        : (isEs ? 'Compartir Elementos' : 'Share Items');

    const summaryText = isOnlyReminders
        ? (remindersList.length === 1
            ? (isEs ? '1 recordatorio seleccionado' : '1 reminder selected')
            : `${remindersList.length} ${isEs ? 'recordatorios seleccionados' : 'reminders selected'}`)
        : isOnlyEvents
        ? (eventsList.length === 1
            ? (isEs ? '1 evento seleccionado' : '1 event selected')
            : `${eventsList.length} ${isEs ? 'eventos seleccionados' : 'events selected'}`)
        : `${totalCount} ${isEs ? 'elementos seleccionados' : 'items selected'}`;

    // Generar texto formateado y legible para compartir
    const buildFormattedText = (link?: string, inviteCode?: string): string => {
        let text = `${headerTitle}\n`;
        text += '────────────────────────\n';

        if (eventsList.length > 0) {
            eventsList.forEach((ev) => {
                const start = new Date(ev.start_time_ms);
                const timeStr = `${format(start, 'HH:mm')}${ev.end_time_ms ? ` - ${format(new Date(ev.end_time_ms), 'HH:mm')}` : ''}`;
                const dateStr = format(start, 'EEEE d MMM', { locale: es });

                text += `📅 ${ev.title}\n`;
                text += `  🕒 ${dateStr} · ${timeStr}\n`;
                if (ev.location) {
                    text += `  📍 ${ev.location}\n`;
                }
                if (ev.description) {
                    text += `  📝 ${ev.description.trim()}\n`;
                }
                text += '\n';
            });
        }

        if (remindersList.length > 0) {
            remindersList.forEach((r) => {
                const due = new Date(r.due_date_ms);
                const dateStr = format(due, 'EEEE d MMM · HH:mm', { locale: es });

                text += `📌 ${r.title}\n`;
                text += `  ⏰ ${dateStr}\n`;
                if (r.control_level) {
                    text += `  🛡️ ${r.control_level.toUpperCase()}\n`;
                }
                if (r.description) {
                    const plain = extractPlainTextFromPages(r.description);
                    if (plain) text += `  📝 ${plain.trim()}\n`;
                }
                if (r.subtasks) {
                    try {
                        const parsed = JSON.parse(r.subtasks);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            text += `  ☑️ Subtareas:\n`;
                            parsed.forEach((st: any) => {
                                text += `    ${st.completed ? '[x]' : '[ ]'} ${st.title}\n`;
                            });
                        }
                    } catch {}
                }
                text += '\n';
            });
        }

        text += '────────────────────────\n';
        if (inviteCode) {
            text += isEs
                ? `🔑 Código de invitación: ${inviteCode}\n(Pégalo en Veyra > Unirse con código)\n\n`
                : `🔑 Invitation code: ${inviteCode}\n(Paste it in Veyra > Join with code)\n\n`;
        }
        if (link) {
            text += isEs
                ? `👉 Abrir en la app Veyra:\n${link}\n\n`
                : `👉 Open in Veyra app:\n${link}\n\n`;
        }
        text += 'Organizado con Veyra ✨';

        return text;
    };

    // Codifica los datos para importación como copia independiente
    const buildImportDeepLink = (): string => {
        try {
            const exportPayload = [
                ...eventsList.map(e => ({
                    kind: 'event',
                    t: e.title,
                    d: e.description || '',
                    s: e.start_time_ms,
                    e: e.end_time_ms || e.start_time_ms,
                    l: e.location || '',
                    c: e.color || '',
                    r: e.repeat_rule || '',
                    tags: e.tags || '',
                })),
                ...remindersList.map(r => ({
                    kind: 'reminder',
                    t: r.title,
                    d: r.description || '',
                    due: r.due_date_ms,
                    ctrl: r.control_level || 'normal',
                    subtasks: r.subtasks || '',
                })),
            ];
            const jsonStr = JSON.stringify(exportPayload);
            const base64 = encodeBase64(jsonStr);
            return `${APP_CONFIG.baseUrl}/join?import=${encodeURIComponent(base64)}`;
        } catch (err) {
            console.warn('[ShareEventsMorphCard] Error generating import link:', err);
            return '';
        }
    };

    const handleShare = async () => {
        setIsSharing(true);
        try {
            Vibration.vibrate(20);
        } catch {}

        try {
            let shareLink = '';
            let rawInviteCode: string | undefined;

            if (!session?.user?.id) {
                Alert.alert(
                    isEs ? 'Inicio de sesión requerido' : 'Login required',
                    isEs
                        ? 'Para compartir elementos con un enlace corto necesitas iniciar sesión en tu cuenta de Veyra.'
                        : 'To share items with a short link, please sign in to your Veyra account.'
                );
                setIsSharing(false);
                return;
            }

            // Pre-sincronizar los elementos a Supabase para asegurar que existan cuando el invitado los descargue
            const { supabase } = await import('../../lib/supabase');
            const { SyncService } = await import('../../services/syncService');

            if (eventsList.length > 0) {
                try {
                    const remoteEvents = eventsList.map(ev => SyncService.localEventToRemote(ev, session.user.id));
                    await supabase.from('events').upsert(remoteEvents, { onConflict: 'id' });
                } catch (preSyncErr) {
                    console.warn('[ShareEventsMorphCard] Error al pre-sincronizar eventos:', preSyncErr);
                }
            }

            if (remindersList.length > 0) {
                try {
                    for (const rem of remindersList) {
                        const remoteReminder = SyncService.localReminderToRemote(rem, session.user.id);
                        await supabase.from('reminders').upsert(remoteReminder, { onConflict: 'id' });
                    }
                } catch (preSyncRemErr) {
                    console.warn('[ShareEventsMorphCard] Error al pre-sincronizar recordatorios:', preSyncRemErr);
                }
            }

            const isIndependent = syncMode === 'independent';

            if (totalCount > 1) {
                const batchItems: any[] = [
                    ...eventsList.map(e => ({
                        target_type: 'event' as const,
                        target_id: e.id,
                        target_name: e.title,
                        role: isIndependent ? ('viewer' as const) : ('editor' as const),
                        is_copy: isIndependent,
                    })),
                    ...remindersList.map(r => ({
                        target_type: 'reminder' as const,
                        target_id: r.id,
                        target_name: r.title,
                        role: 'viewer' as const,
                        is_copy: isIndependent,
                    })),
                ];

                const res = await CollaborationService.createBatchInvitation(
                    batchItems,
                    summaryText
                );
                rawInviteCode = res.invitation.invite_code;
                shareLink = res.inviteUrl || `${APP_CONFIG.baseUrl}/join?code=${res.invitation.invite_code}`;
            } else if (isOnlyReminders) {
                const primaryReminder = remindersList[0];
                const res = await CollaborationService.createInvitation(
                    'reminder',
                    primaryReminder.id,
                    primaryReminder.title,
                    'viewer'
                );
                rawInviteCode = res.invitation.invite_code;
                shareLink = res.inviteUrl || `${APP_CONFIG.baseUrl}/join?code=${res.invitation.invite_code}`;
            } else {
                const primaryEvent = eventsList[0];
                const res = await CollaborationService.createInvitation(
                    'event',
                    primaryEvent.id,
                    primaryEvent.title,
                    isIndependent ? 'viewer' : 'editor'
                );
                rawInviteCode = res.invitation.invite_code;
                shareLink = res.inviteUrl || `${APP_CONFIG.baseUrl}/join?code=${res.invitation.invite_code}`;
            }

            const message = buildFormattedText(shareLink, rawInviteCode);

            await Share.share({
                title: isEs
                    ? (isOnlyReminders ? 'Compartir recordatorios de Veyra' : 'Compartir eventos de Veyra')
                    : (isOnlyReminders ? 'Share Veyra Reminders' : 'Share Veyra Events'),
                message,
            });

            if (onSuccess) {
                onSuccess();
            } else {
                useShareEventsStore.getState().notifySuccess();
            }
        } catch (err: any) {
            if (err?.message && !err.message.includes('dismissed')) {
                Alert.alert('Error', err.message);
            }
        } finally {
            setIsSharing(false);
        }
    };

    const handleCopyText = async () => {
        try {
            Vibration.vibrate(15);
        } catch {}
        const text = buildFormattedText();
        Clipboard.setString(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleClose = () => {
        try {
            Vibration.vibrate(10);
        } catch {}
        onClose();
    };

    const cardBorderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

    return (
        <View style={styles.container}>
            {/* Cabecera compacta: Título e ícono + botón cerrar */}
            <View style={styles.header}>
                <View style={styles.headerTitleWrap}>
                    <View
                        style={[
                            styles.headerIconCircle,
                            { backgroundColor: `${accent.primary}18` },
                        ]}
                    >
                        <Share2 size={16} color={accent.primary as any} strokeWidth={2.4} />
                    </View>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                        {headerTitle}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={handleClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={[
                        styles.closeBtn,
                        { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' },
                    ]}
                    activeOpacity={0.7}
                >
                    <X size={15} color={colors.textSecondary as any} strokeWidth={2.4} />
                </TouchableOpacity>
            </View>

            {/* Scroll de contenido */}
            <ScrollView
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Badge resumen de elementos seleccionados */}
                <View
                    style={[
                        styles.summaryBar,
                        {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                            borderColor: cardBorderColor,
                        },
                    ]}
                >
                    {isOnlyReminders ? (
                        <CheckSquare size={14} color={accent.primary as any} strokeWidth={2.4} />
                    ) : (
                        <Calendar size={14} color={accent.primary as any} strokeWidth={2.4} />
                    )}
                    <Text style={[styles.summaryText, { color: colors.textPrimary }]}>
                        {summaryText}
                    </Text>
                </View>

                {/* Título de sección de modo */}
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                    {isEs ? 'MODO DE COMPARTIR' : 'SHARING MODE'}
                </Text>

                {/* Opción 1: Copia independiente */}
                <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => {
                        try { Vibration.vibrate(10); } catch {}
                        setSyncMode('independent');
                    }}
                    style={[
                        styles.optionCard,
                        {
                            backgroundColor: syncMode === 'independent'
                                ? `${accent.primary}0D`
                                : (isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.02)'),
                            borderColor: syncMode === 'independent' ? accent.primary : cardBorderColor,
                            borderWidth: syncMode === 'independent' ? 1.5 : 1,
                        },
                    ]}
                >
                    <View style={styles.optionTopRow}>
                        <View style={styles.optionTitleRow}>
                            <CopyPlus
                                size={17}
                                color={(syncMode === 'independent' ? accent.primary : colors.textMuted) as any}
                                strokeWidth={2.4}
                            />
                            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                                {isEs ? 'Copia independiente' : 'Independent copy'}
                            </Text>
                        </View>
                        <View
                            style={[
                                styles.recommendedBadge,
                                { backgroundColor: `${accent.primary}20` },
                            ]}
                        >
                            <Sparkles size={10} color={accent.primary as any} strokeWidth={2.4} />
                            <Text style={[styles.recommendedBadgeText, { color: accent.primary }]}>
                                {totalCount > 1
                                    ? (isEs ? 'Recomendado para varios' : 'Recommended for multiple')
                                    : (isEs ? 'Recomendado' : 'Recommended')}
                            </Text>
                        </View>
                    </View>
                    <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                        {isEs
                            ? (totalCount > 1
                                ? 'Empaqueta todos los eventos y recordatorios seleccionados en un único enlace para importarlos juntos.'
                                : 'La otra persona podrá editar libremente sin alterar tu elemento original.')
                            : (totalCount > 1
                                ? 'Packages all selected events and reminders into a single link to import together.'
                                : 'The other person can edit freely without altering your original item.')}
                    </Text>
                </TouchableOpacity>

                {/* Opción 2: Sincronizado en tiempo real */}
                <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => {
                        try { Vibration.vibrate(10); } catch {}
                        setSyncMode('synced');
                    }}
                    style={[
                        styles.optionCard,
                        {
                            backgroundColor: syncMode === 'synced'
                                ? `${accent.primary}0D`
                                : (isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.02)'),
                            borderColor: syncMode === 'synced' ? accent.primary : cardBorderColor,
                            borderWidth: syncMode === 'synced' ? 1.5 : 1,
                            marginTop: 8,
                        },
                    ]}
                >
                    <View style={styles.optionTopRow}>
                        <View style={styles.optionTitleRow}>
                            <RefreshCw
                                size={16}
                                color={(syncMode === 'synced' ? accent.primary : colors.textMuted) as any}
                                strokeWidth={2.4}
                            />
                            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                                {isEs ? 'Sincronizado en vivo' : 'Live synced'}
                            </Text>
                        </View>
                        {totalCount > 1 ? (
                            <View
                                style={[
                                    styles.recommendedBadge,
                                    { backgroundColor: `${accent.primary}18` },
                                ]}
                            >
                                <Sparkles size={10} color={accent.primary as any} strokeWidth={2.4} />
                                <Text style={[styles.recommendedBadgeText, { color: accent.primary }]}>
                                    {isEs ? 'Lote colaborativo' : 'Collab batch'}
                                </Text>
                            </View>
                        ) : (
                            <View
                                style={[
                                    styles.recommendedBadge,
                                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                                ]}
                            >
                                <Text style={[styles.recommendedBadgeText, { color: colors.textMuted }]}>
                                    {isEs ? 'Tiempo real' : 'Real time'}
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                        {totalCount > 1
                            ? (isEs
                                ? 'Los invitados verán todos los elementos en tiempo real (los recordatorios en modo solo lectura y los eventos en modo edición).'
                                : 'Guests will see all items in real time (reminders in read-only mode and events in edit mode).')
                            : isEs
                            ? (isOnlyReminders
                                ? 'El invitado podrá ver el progreso y actualizaciones del recordatorio en tiempo real (solo lectura).'
                                : 'Cualquier cambio de horario, detalle o edición se sincroniza para todos en tiempo real.')
                            : (isOnlyReminders
                                ? 'Guest can view progress and updates in real time (read-only).'
                                : 'Any schedule, detail or edit changes sync for everyone in real time.')}
                    </Text>
                </TouchableOpacity>
            </ScrollView>

            {/* Botones inferiores de acción */}
            <View style={styles.footerRow}>
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={handleCopyText}
                    style={[
                        styles.copyBtn,
                        {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)',
                            borderColor: cardBorderColor,
                        },
                    ]}
                >
                    {isCopied ? (
                        <Check size={16} color="#10B981" strokeWidth={2.5} />
                    ) : (
                        <Copy size={16} color={colors.textSecondary as any} strokeWidth={2.4} />
                    )}
                    <Text
                        style={[
                            styles.copyBtnText,
                            { color: isCopied ? '#10B981' : colors.textPrimary },
                        ]}
                    >
                        {isCopied
                            ? (isEs ? '¡Copiado!' : 'Copied!')
                            : (isEs ? 'Copiar texto' : 'Copy text')}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleShare}
                    disabled={isSharing}
                    style={[
                        styles.shareActionBtn,
                        { backgroundColor: accent.primary },
                    ]}
                >
                    {isSharing ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <>
                            <Share2 size={16} color="#FFFFFF" strokeWidth={2.4} />
                            <Text style={styles.shareActionBtnText}>
                                {isEs ? 'Compartir' : 'Share'}
                            </Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 14,
        justifyContent: 'space-between',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    headerTitleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerIconCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 15.5,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    closeBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        paddingVertical: 2,
    },
    summaryBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        gap: 8,
        marginBottom: 10,
    },
    summaryText: {
        fontSize: 12.5,
        fontWeight: '600',
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.8,
        marginBottom: 6,
        marginLeft: 2,
    },
    optionCard: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
    },
    optionTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    optionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    optionTitle: {
        fontSize: 13.5,
        fontWeight: '700',
    },
    recommendedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
    },
    recommendedBadgeText: {
        fontSize: 10,
        fontWeight: '700',
    },
    optionDesc: {
        fontSize: 11.5,
        lineHeight: 15.5,
        marginLeft: 24,
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
    },
    copyBtn: {
        flex: 1,
        height: 42,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 14,
        borderWidth: 1,
    },
    copyBtnText: {
        fontSize: 13,
        fontWeight: '600',
    },
    shareActionBtn: {
        flex: 1.25,
        height: 42,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        borderRadius: 14,
    },
    shareActionBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#FFFFFF',
    },
});
