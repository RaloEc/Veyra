import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
    Folder,
    CheckSquare,
    FileText,
    Calendar,
    Users,
    ShieldCheck,
    AlertCircle,
    X,
    LogIn,
    ArrowRight,
} from '@tamagui/lucide-icons';

import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraButton } from '../src/components/ui/VeyraButton';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { useStore } from '../src/store/useStore';
import { CollaborationService } from '../src/services/collaborationService';
import { ShareInvitation, CollabTargetType } from '../src/types/db';

export default function JoinScreen() {
    const router = useRouter();
    const { code, import: importData } = useLocalSearchParams<{ code?: string; import?: string }>();
    const { colors, accent, semantics } = useVeyraTheme();

    const session = useStore((state) => state.session);
    const triggerSync = useStore((state) => state.triggerSync);

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [invitation, setInvitation] = useState<ShareInvitation | null>(null);
    const [importEvents, setImportEvents] = useState<Array<{ t: string; d?: string; s: number; e: number; l?: string; c?: string; r?: string; tags?: string }> | null>(null);
    const [ownerEmail, setOwnerEmail] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const dangerColor = semantics.critical.primary;
    const successColor = semantics.success.primary;

    const loadInvitation = useCallback(async () => {
        if (importData && typeof importData === 'string') {
            try {
                setLoading(true);
                setError(null);
                const raw = decodeURIComponent(escape(atob(importData)));
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setImportEvents(parsed);
                } else {
                    setError('El enlace de importación no contiene eventos válidos.');
                }
            } catch (e: any) {
                setError('No se pudo leer el contenido de la importación.');
            } finally {
                setLoading(false);
            }
            return;
        }

        if (!code || typeof code !== 'string') {
            setError('Código de invitación no proporcionado');
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const res = await CollaborationService.getInvitationByCode(code);
            if (!res) {
                setError('Esta invitación no existe o ya ha expirado (validez de 7 días).');
            } else {
                setInvitation(res.invitation);
                setOwnerEmail(res.ownerEmail);
            }
        } catch (e: any) {
            setError(e.message || 'Error al cargar la invitación');
        } finally {
            setLoading(false);
        }
    }, [code, importData]);

    useEffect(() => {
        loadInvitation();
    }, [loadInvitation]);

    const handleAccept = async () => {
        if (importEvents && importEvents.length > 0) {
            setSubmitting(true);
            setError(null);
            try {
                const { EventService } = await import('../src/services/eventService');
                const { WidgetService } = await import('../src/services/widgetService');

                for (const ev of importEvents) {
                    await EventService.createEvent({
                        title: ev.t,
                        description: ev.d || undefined,
                        startTimeMs: ev.s,
                        endTimeMs: ev.e,
                        location: ev.l || undefined,
                        color: ev.c || undefined,
                        repeatRule: ev.r || undefined,
                        tags: ev.tags || '["clase"]',
                    });
                }

                await WidgetService.syncSchedule();
                setSuccessMessage(
                    importEvents.length === 1
                        ? '¡Evento guardado en tu agenda!'
                        : `¡${importEvents.length} eventos guardados en tu agenda!`
                );

                setTimeout(() => {
                    router.replace('/schedule');
                }, 1200);
            } catch (e: any) {
                setError(e.message || 'Error al importar los eventos');
                setSubmitting(false);
            }
            return;
        }

        if (!code) return;
        setSubmitting(true);
        setError(null);

        try {
            const res = await CollaborationService.acceptInvitation(code);
            setSuccessMessage(
                res.targetType === 'event'
                    ? '¡Evento añadido a tu calendario con éxito!'
                    : `¡Te has unido con éxito a "${res.targetName || 'recurso'}"!`
            );

            // Disparar sincronización inmediata de la nube para descargar el elemento en SQLite
            triggerSync(false, false).catch(() => {});

            // Redirigir según el tipo de recurso
            setTimeout(() => {
                if (res.targetType === 'note') {
                    router.replace(`/notes/${res.targetId}`);
                } else if (res.targetType === 'reminder') {
                    router.replace(`/reminder/${res.targetId}`);
                } else if (res.targetType === 'event') {
                    router.replace({ pathname: '/events/create', params: { id: res.targetId } });
                } else {
                    router.replace('/');
                }
            }, 1200);
        } catch (e: any) {
            setError(e.message || 'No se pudo aceptar la invitación');
            setSubmitting(false);
        }
    };

    const renderTargetIcon = (type: CollabTargetType) => {
        const iconSize = 36;
        const iconColor = accent.primary as any;

        switch (type) {
            case 'folder':
                return <Folder size={iconSize} color={iconColor} />;
            case 'reminder':
                return <CheckSquare size={iconSize} color={iconColor} />;
            case 'note':
                return <FileText size={iconSize} color={iconColor} />;
            case 'event':
                return <Calendar size={iconSize} color={iconColor} />;
            default:
                return <Users size={iconSize} color={iconColor} />;
        }
    };

    const getTargetTypeName = (type: CollabTargetType) => {
        switch (type) {
            case 'folder':
                return 'Carpeta / Lista compartida';
            case 'reminder':
                return 'Recordatorio compartido';
            case 'note':
                return 'Nota compartida';
            case 'event':
                return 'Evento compartido';
            default:
                return 'Elemento compartido';
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* Header con botón cerrar */}
            <View style={styles.header}>
                <VeyraIconButton
                    icon={<X size={22} color={colors.textSecondary as any} />}
                    onPress={() => router.replace('/')}
                    accessibilityLabel="Cerrar"
                />
            </View>

            <View style={styles.content}>
                {loading ? (
                    <View style={styles.centerBox}>
                        <ActivityIndicator size="large" color={accent.primary} />
                        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                            Consultando invitación...
                        </Text>
                    </View>
                ) : error ? (
                    <View style={styles.centerBox}>
                        <View style={[styles.iconBadge, { backgroundColor: dangerColor + '20' }]}>
                            <AlertCircle size={40} color={dangerColor as any} />
                        </View>
                        <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
                            Invitación no disponible
                        </Text>
                        <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>
                            {error}
                        </Text>
                        <View style={styles.buttonWrapper}>
                            <VeyraButton
                                label="Volver al inicio"
                                variant="secondary"
                                onPress={() => router.replace('/')}
                            />
                        </View>
                    </View>
                ) : importEvents ? (
                    <View style={styles.cardContainer}>
                        <VeyraSurface style={styles.invitationCard}>
                            <View style={[styles.iconBadge, { backgroundColor: accent.primary + '18' }]}>
                                <Calendar size={36} color={accent.primary as any} />
                            </View>

                            <Text style={[styles.typeBadge, { color: accent.primary }]}>
                                COPIA INDEPENDIENTE
                            </Text>

                            <Text style={[styles.targetTitle, { color: colors.textPrimary }]}>
                                {importEvents.length === 1 ? importEvents[0].t : `${importEvents.length} eventos de horario`}
                            </Text>

                            <Text style={[styles.ownerText, { color: colors.textSecondary }]}>
                                {importEvents.length === 1
                                    ? 'Se añadirá este evento como una copia personal a tu calendario.'
                                    : `Se añadirán estas ${importEvents.length} clases como copias personales a tu calendario.`}
                            </Text>

                            <View style={[styles.roleBox, { backgroundColor: colors.surfaceElevated }]}>
                                <ShieldCheck size={18} color={accent.primary as any} />
                                <Text style={[styles.roleText, { color: colors.textSecondary }]}>
                                    Modo: <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                                        Independiente (puedes editarlo libremente)
                                    </Text>
                                </Text>
                            </View>
                        </VeyraSurface>

                        {successMessage ? (
                            <View style={[styles.successBanner, { backgroundColor: successColor + '20' }]}>
                                <Text style={[styles.successText, { color: successColor }]}>
                                    {successMessage}
                                </Text>
                            </View>
                        ) : null}

                        <View style={styles.actions}>
                            <VeyraButton
                                label={submitting ? 'Guardando...' : 'Añadir a mi calendario'}
                                variant="primary"
                                loading={submitting}
                                iconRight={<ArrowRight size={18} color="#FFFFFF" />}
                                onPress={handleAccept}
                            />
                            <View style={{ height: 12 }} />
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => router.replace('/')}
                                disabled={submitting}
                            >
                                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                                    Cancelar
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : !session ? (
                    <View style={styles.centerBox}>
                        <View style={[styles.iconBadge, { backgroundColor: accent.primary + '20' }]}>
                            <Users size={40} color={accent.primary as any} />
                        </View>
                        <Text style={[styles.title, { color: colors.textPrimary }]}>
                            Invitación colaborativa
                        </Text>
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                            {ownerEmail ? `${ownerEmail} te ha invitado a colaborar.` : 'Has recibido una invitación.'}
                            {'\n\n'}Inicia sesión o crea una cuenta en Veyra para unirte a este recurso compartido.
                        </Text>

                        <View style={styles.buttonWrapper}>
                            <VeyraButton
                                label="Iniciar Sesión"
                                variant="primary"
                                iconLeft={<LogIn size={18} color="#FFFFFF" />}
                                onPress={() => router.push('/login')}
                            />
                        </View>
                    </View>
                ) : invitation ? (
                    <View style={styles.cardContainer}>
                        <VeyraSurface style={styles.invitationCard}>
                            <View style={[styles.iconBadge, { backgroundColor: accent.primary + '18' }]}>
                                {renderTargetIcon(invitation.target_type)}
                            </View>

                            <Text style={[styles.typeBadge, { color: accent.primary }]}>
                                {getTargetTypeName(invitation.target_type).toUpperCase()}
                            </Text>

                            <Text style={[styles.targetTitle, { color: colors.textPrimary }]}>
                                {invitation.target_name || 'Sin título'}
                            </Text>

                            {ownerEmail ? (
                                <Text style={[styles.ownerText, { color: colors.textSecondary }]}>
                                    {invitation.target_type === 'event' ? 'Organizado por ' : 'Creado por '}
                                    <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{ownerEmail}</Text>
                                </Text>
                            ) : null}

                            <View style={[styles.roleBox, { backgroundColor: colors.surfaceElevated }]}>
                                {invitation.target_type === 'event' ? (
                                    <>
                                        <Calendar size={18} color={accent.primary as any} />
                                        <Text style={[styles.roleText, { color: colors.textSecondary }]}>
                                            Sincronización: <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                                                Solo lectura (Se añade a tu calendario)
                                            </Text>
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck size={18} color={accent.primary as any} />
                                        <Text style={[styles.roleText, { color: colors.textSecondary }]}>
                                            Permisos: <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                                                {invitation.role === 'editor' ? 'Editor (Ver y modificar)' : 'Solo lectura'}
                                            </Text>
                                        </Text>
                                    </>
                                )}
                            </View>
                        </VeyraSurface>

                        {successMessage ? (
                            <View style={[styles.successBanner, { backgroundColor: successColor + '20' }]}>
                                <Text style={[styles.successText, { color: successColor }]}>
                                    {successMessage}
                                </Text>
                            </View>
                        ) : null}

                        <View style={styles.actions}>
                            <VeyraButton
                                label={
                                    submitting
                                        ? (invitation.target_type === 'event' ? 'Añadiendo...' : 'Uniéndose...')
                                        : (invitation.target_type === 'event' ? 'Añadir a mi calendario' : 'Aceptar y unirme')
                                }
                                variant="primary"
                                loading={submitting}
                                iconRight={<ArrowRight size={18} color="#FFFFFF" />}
                                onPress={handleAccept}
                            />
                            <View style={{ height: 12 }} />
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => router.replace('/')}
                                disabled={submitting}
                            >
                                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                                    Rechazar o decidir más tarde
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : null}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    centerBox: {
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    cardContainer: {
        width: '100%',
        maxWidth: 420,
        alignItems: 'center',
    },
    invitationCard: {
        width: '100%',
        alignItems: 'center',
        paddingVertical: 32,
        paddingHorizontal: 24,
        borderRadius: 24,
    },
    iconBadge: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    typeBadge: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1.2,
        marginBottom: 8,
    },
    targetTitle: {
        fontSize: 24,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 8,
    },
    ownerText: {
        fontSize: 14,
        marginBottom: 20,
    },
    roleBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        marginTop: 4,
    },
    roleText: {
        fontSize: 13,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        marginTop: 16,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        marginTop: 8,
        marginBottom: 24,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 15,
    },
    errorTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginTop: 16,
        textAlign: 'center',
    },
    errorSubtitle: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        marginTop: 8,
        marginBottom: 24,
    },
    buttonWrapper: {
        width: '100%',
        maxWidth: 260,
    },
    actions: {
        width: '100%',
        marginTop: 28,
    },
    cancelButton: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    cancelText: {
        fontSize: 14,
        fontWeight: '500',
    },
    successBanner: {
        width: '100%',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginTop: 16,
        alignItems: 'center',
    },
    successText: {
        fontSize: 14,
        fontWeight: '600',
    },
});
