import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Share,
    ScrollView,
    ActivityIndicator,
    Alert,
    Clipboard,
} from 'react-native';
import {
    Share2,
    Copy,
    Check,
    X,
    CopyPlus,
    RefreshCw,
    Calendar,
    Clock,
    MapPin,
    Sparkles,
} from '@tamagui/lucide-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { VeyraSurface } from '../ui/VeyraSurface';
import { VeyraButton } from '../ui/VeyraButton';
import { CalendarEvent } from '../../types/db';
import { CollaborationService } from '../../services/collaborationService';
import { useStore } from '../../store/useStore';
import { APP_CONFIG } from '../../constants/appConfig';
import { encodeBase64 } from '../../utils/base64Utils';

export type ShareSyncMode = 'independent' | 'synced';
export { ShareEventsMorphCard } from './ShareEventsMorphCard';

interface ShareEventsModalProps {
    visible: boolean;
    onClose: () => void;
    events: CalendarEvent[];
}

export function ShareEventsModal({
    visible,
    onClose,
    events,
}: ShareEventsModalProps) {
    const { colors, accent, isDark } = useVeyraTheme();
    const language = useStore(state => state.language);
    const session = useStore(state => state.session);
    const isEs = language === 'es';

    const [syncMode, setSyncMode] = useState<ShareSyncMode>('independent');
    const [isSharing, setIsSharing] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    if (!visible || events.length === 0) return null;

    // Generar texto formateado y legible para compartir
    const buildFormattedText = (link?: string, inviteCode?: string): string => {
        const count = events.length;
        const header = isEs
            ? `📅 ${count === 1 ? 'Evento' : `${count} Eventos`} en Veyra`
            : `📅 ${count === 1 ? 'Event' : `${count} Events`} on Veyra`;

        let text = `${header}\n`;
        text += '────────────────────────\n';

        events.forEach((ev) => {
            const start = new Date(ev.start_time_ms);
            const timeStr = `${format(start, 'HH:mm')}${ev.end_time_ms ? ` - ${format(new Date(ev.end_time_ms), 'HH:mm')}` : ''}`;
            const dateStr = format(start, 'EEEE d MMM', { locale: es });

            text += `• ${ev.title}\n`;
            text += `  🕒 ${dateStr} · ${timeStr}\n`;
            if (ev.location) {
                text += `  📍 ${ev.location}\n`;
            }
            if (ev.description) {
                text += `  📝 ${ev.description.trim()}\n`;
            }
            text += '\n';
        });

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
            const exportPayload = events.map(e => ({
                t: e.title,
                d: e.description || '',
                s: e.start_time_ms,
                e: e.end_time_ms || e.start_time_ms,
                l: e.location || '',
                c: e.color || '',
                r: e.repeat_rule || '',
                tags: e.tags || '',
            }));
            const jsonStr = JSON.stringify(exportPayload);
            // Base64 seguro para URL
            const base64 = encodeBase64(jsonStr);
            return `${APP_CONFIG.baseUrl}/join?import=${encodeURIComponent(base64)}`;
        } catch {
            return '';
        }
    };

    const handleShare = async () => {
        setIsSharing(true);
        try {
            let shareLink = '';
            let rawInviteCode: string | undefined;

            if (!session?.user?.id) {
                Alert.alert(
                    isEs ? 'Inicio de sesión requerido' : 'Login required',
                    isEs
                        ? 'Para compartir eventos con un enlace corto necesitas iniciar sesión en tu cuenta de Veyra.'
                        : 'To share events with a short link, please sign in to your Veyra account.'
                );
                setIsSharing(false);
                return;
            }

            // Pre-sincronizar los eventos a Supabase para asegurar que existan cuando el invitado los descargue
            try {
                const { supabase } = await import('../../lib/supabase');
                const { SyncService } = await import('../../services/syncService');
                const remoteEvents = events.map(ev => SyncService.localEventToRemote(ev, session.user.id));
                await supabase.from('events').upsert(remoteEvents, { onConflict: 'id' });
            } catch (preSyncErr) {
                console.warn('[ShareEventsModal] Error al pre-sincronizar eventos:', preSyncErr);
            }

            const isIndependent = syncMode === 'independent';
            if (events.length > 1) {
                const batchItems: any[] = events.map(e => ({
                    target_type: 'event' as const,
                    target_id: e.id,
                    target_name: e.title,
                    role: isIndependent ? ('viewer' as const) : ('editor' as const),
                    is_copy: isIndependent,
                }));
                const res = await CollaborationService.createBatchInvitation(
                    batchItems,
                    `${events.length} eventos de horario`
                );
                rawInviteCode = res.invitation.invite_code;
                shareLink = res.inviteUrl || `${APP_CONFIG.baseUrl}/join?code=${res.invitation.invite_code}`;
            } else {
                const primaryEvent = events[0];
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
                title: isEs ? 'Compartir eventos de Veyra' : 'Share Veyra Events',
                message,
            });

            onClose();
        } catch (err: any) {
            if (err?.message && !err.message.includes('dismissed')) {
                Alert.alert('Error', err.message);
            }
        } finally {
            setIsSharing(false);
        }
    };

    const handleCopyText = async () => {
        const importLink = syncMode === 'independent' ? buildImportDeepLink() : undefined;
        const text = buildFormattedText(importLink);
        Clipboard.setString(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity
                    style={styles.backdropTouch}
                    activeOpacity={1}
                    onPress={onClose}
                />

                <VeyraSurface level={2} radius="xl" style={styles.modalCard}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerTitleWrap}>
                            <Share2 size={20} color={accent.primary as any} />
                            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                                {isEs ? 'Compartir Eventos' : 'Share Events'}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={onClose}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={styles.closeBtn}
                        >
                            <X size={18} color={colors.textMuted as any} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                    >
                        {/* Resumen de seleccionados */}
                        <VeyraSurface level={1} radius="md" style={styles.summaryBar}>
                            <Calendar size={18} color={accent.primary as any} />
                            <Text style={[styles.summaryText, { color: colors.textPrimary }]}>
                                {events.length === 1
                                    ? (isEs ? '1 evento seleccionado' : '1 event selected')
                                    : `${events.length} ${isEs ? 'eventos seleccionados' : 'events selected'}`}
                            </Text>
                        </VeyraSurface>

                        {/* Selector de modo de sincronización */}
                        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                            {isEs ? 'MODO DE COMPARTIR' : 'SHARING MODE'}
                        </Text>

                        {/* Opción 1: Copia independiente */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setSyncMode('independent')}
                            style={[
                                styles.optionCard,
                                {
                                    backgroundColor: isDark ? '#1C1E24' : '#F8FAFC',
                                    borderColor: syncMode === 'independent' ? accent.primary : colors.borderSubtle,
                                    borderWidth: syncMode === 'independent' ? 2 : 1,
                                },
                            ]}
                        >
                            <View style={styles.optionTopRow}>
                                <View style={styles.optionTitleRow}>
                                    <CopyPlus
                                        size={20}
                                        color={(syncMode === 'independent' ? accent.primary : colors.textMuted) as any}
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
                                    <Sparkles size={11} color={accent.primary as any} />
                                    <Text style={[styles.recommendedBadgeText, { color: accent.primary }]}>
                                        {isEs ? 'Recomendado' : 'Recommended'}
                                    </Text>
                                </View>
                            </View>
                            <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                                {isEs
                                    ? 'La otra persona podrá editar o reprogramar su copia libremente. Si tú modificas o borras tu evento, no le afectará en nada.'
                                    : 'The other person can edit or reschedule their own copy freely. If you edit or delete your event, it will not affect theirs.'}
                            </Text>
                        </TouchableOpacity>

                        {/* Opción 2: Sincronizado en tiempo real */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setSyncMode('synced')}
                            style={[
                                styles.optionCard,
                                {
                                    backgroundColor: isDark ? '#1C1E24' : '#F8FAFC',
                                    borderColor: syncMode === 'synced' ? accent.primary : colors.borderSubtle,
                                    borderWidth: syncMode === 'synced' ? 2 : 1,
                                    marginTop: 10,
                                },
                            ]}
                        >
                            <View style={styles.optionTopRow}>
                                <View style={styles.optionTitleRow}>
                                    <RefreshCw
                                        size={20}
                                        color={(syncMode === 'synced' ? accent.primary : colors.textMuted) as any}
                                    />
                                    <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                                        {isEs ? 'Sincronizado en vivo' : 'Live synced'}
                                    </Text>
                                </View>
                            </View>
                            <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                                {isEs
                                    ? 'Cualquier cambio de horario, salón o eliminación que hagas se actualizará para todos en tiempo real.'
                                    : 'Any changes to schedule, room, or deletions you make will update for everyone in real time.'}
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>

                    {/* Botones de acción */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={handleCopyText}
                            style={[
                                styles.copyButton,
                                {
                                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                                    borderColor: colors.borderSubtle,
                                },
                            ]}
                        >
                            {isCopied ? (
                                <Check size={18} color="#10B981" />
                            ) : (
                                <Copy size={18} color={colors.textSecondary as any} />
                            )}
                            <Text style={[styles.copyButtonText, { color: isCopied ? '#10B981' : colors.textSecondary }]}>
                                {isCopied
                                    ? (isEs ? '¡Copiado!' : 'Copied!')
                                    : (isEs ? 'Copiar texto' : 'Copy text')}
                            </Text>
                        </TouchableOpacity>

                        <VeyraButton
                            label={isEs ? 'Compartir' : 'Share'}
                            iconLeft={<Share2 size={16} color="#FFFFFF" />}
                            loading={isSharing}
                            onPress={handleShare}
                            disabled={isSharing}
                            style={styles.shareButton}
                        />
                    </View>
                </VeyraSurface>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'flex-end',
    },
    backdropTouch: {
        flex: 1,
    },
    modalCard: {
        maxHeight: '85%',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 28,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    headerTitleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerTitle: {
        fontSize: 19,
        fontWeight: '700',
    },
    closeBtn: {
        padding: 4,
    },
    scrollContent: {
        paddingBottom: 10,
    },
    summaryBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 10,
        marginBottom: 16,
    },
    summaryText: {
        fontSize: 14,
        fontWeight: '600',
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.8,
        marginBottom: 10,
    },
    optionCard: {
        padding: 14,
        borderRadius: 16,
    },
    optionTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    optionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    optionTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    recommendedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
    },
    recommendedBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    optionDesc: {
        fontSize: 13,
        lineHeight: 18,
    },
    footer: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 18,
    },
    copyButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 14,
        borderWidth: 1,
        height: 48,
    },
    copyButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    shareButton: {
        flex: 1.4,
        height: 48,
    },
});
