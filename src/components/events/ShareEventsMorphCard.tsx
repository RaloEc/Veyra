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
} from '@tamagui/lucide-icons';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { useVeyraTheme } from '../../theme/useVeyraTheme';
import { CalendarEvent } from '../../types/db';
import { CollaborationService } from '../../services/collaborationService';
import { useStore } from '../../store/useStore';
import { useShareEventsStore } from '../../store/useShareEventsStore';
import { APP_CONFIG } from '../../constants/appConfig';

export type ShareSyncMode = 'independent' | 'synced';

interface ShareEventsMorphCardProps {
    events: CalendarEvent[];
    onClose: () => void;
    onSuccess?: () => void;
}

export function ShareEventsMorphCard({
    events,
    onClose,
    onSuccess,
}: ShareEventsMorphCardProps) {
    const { colors, accent, isDark } = useVeyraTheme();
    const language = useStore(state => state.language);
    const session = useStore(state => state.session);
    const isEs = language === 'es';

    const [syncMode, setSyncMode] = useState<ShareSyncMode>('independent');
    const [isSharing, setIsSharing] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    if (events.length === 0) return null;

    // Generar texto formateado y legible para compartir
    const buildFormattedText = (link?: string): string => {
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
        if (link) {
            text += isEs
                ? `👉 Importar a tu agenda en Veyra:\n${link}\n\n`
                : `👉 Import into your Veyra schedule:\n${link}\n\n`;
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
            const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
            return `${APP_CONFIG.baseUrl}/join?import=${encodeURIComponent(base64)}`;
        } catch {
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

            if (syncMode === 'synced') {
                if (!session?.user?.id) {
                    Alert.alert(
                        isEs ? 'Inicio de sesión requerido' : 'Login required',
                        isEs
                            ? 'Para sincronizar eventos en tiempo real necesitas una cuenta iniciada en Veyra.'
                            : 'To sync events in real time, you must be signed in to your Veyra account.'
                    );
                    setIsSharing(false);
                    return;
                }

                const primaryEvent = events[0];
                const res = await CollaborationService.createInvitation(
                    'event',
                    primaryEvent.id,
                    events.length === 1 ? primaryEvent.title : `${events.length} eventos de horario`,
                    'editor'
                );
                shareLink = res.inviteUrl || `${APP_CONFIG.baseUrl}/join?code=${res.invitation.invite_code}`;
            } else {
                shareLink = buildImportDeepLink();
            }

            const message = buildFormattedText(shareLink);

            await Share.share({
                title: isEs ? 'Compartir eventos de Veyra' : 'Share Veyra Events',
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
        const importLink = syncMode === 'independent' ? buildImportDeepLink() : undefined;
        const text = buildFormattedText(importLink);
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
                        {isEs ? 'Compartir Eventos' : 'Share Events'}
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
                {/* Badge resumen de eventos seleccionados */}
                <View
                    style={[
                        styles.summaryBar,
                        {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                            borderColor: cardBorderColor,
                        },
                    ]}
                >
                    <Calendar size={14} color={accent.primary as any} strokeWidth={2.4} />
                    <Text style={[styles.summaryText, { color: colors.textPrimary }]}>
                        {events.length === 1
                            ? (isEs ? '1 evento seleccionado' : '1 event selected')
                            : `${events.length} ${isEs ? 'eventos seleccionados' : 'events selected'}`}
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
                                {isEs ? 'Recomendado' : 'Recommended'}
                            </Text>
                        </View>
                    </View>
                    <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                        {isEs
                            ? 'La otra persona podrá editar libremente sin alterar tu evento original.'
                            : 'The other person can edit freely without altering your original event.'}
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
                    </View>
                    <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                        {isEs
                            ? 'Cualquier cambio de horario o eliminación se sincroniza para todos en tiempo real.'
                            : 'Any schedule changes or deletions sync for everyone in real time.'}
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
