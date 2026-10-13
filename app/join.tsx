import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    TextInput,
    Clipboard,
    Keyboard,
    TouchableWithoutFeedback,
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
    KeyRound,
    Copy,
    Search,
    Layers,
} from '@tamagui/lucide-icons';

import { useVeyraTheme } from '../src/theme/useVeyraTheme';
import { VeyraButton } from '../src/components/ui/VeyraButton';
import { VeyraSurface } from '../src/components/ui/VeyraSurface';
import { VeyraIconButton } from '../src/components/ui/VeyraIconButton';
import { useStore } from '../src/store/useStore';
import { CollaborationService } from '../src/services/collaborationService';
import { ShareInvitation, CollabTargetType } from '../src/types/db';
import { decodeBase64 } from '../src/utils/base64Utils';
import * as Crypto from 'expo-crypto';

const decodeSafeBase64Json = (input: string): any => {
    let clean = input.trim();
    // Desempaquetar posibles niveles de codificación URI
    for (let i = 0; i < 3; i++) {
        try {
            const decoded = decodeURIComponent(clean);
            if (decoded === clean) break;
            clean = decoded;
        } catch {
            break;
        }
    }
    // Corregir espacios generados por decodificadores de query params
    clean = clean.replace(/ /g, '+');

    try {
        const raw = decodeBase64(clean);
        return JSON.parse(raw);
    } catch {
        try {
            const raw = decodeURIComponent(escape(atob(clean)));
            return JSON.parse(raw);
        } catch {
            const rawDirect = atob(clean);
            return JSON.parse(rawDirect);
        }
    }
};

interface ImportItemPayload {
    kind?: 'event' | 'reminder';
    t: string;
    d?: string;
    s?: number;
    e?: number;
    l?: string;
    c?: string;
    r?: string;
    tags?: string;
    due?: number;
    ctrl?: any;
    subtasks?: string;
}

export default function JoinScreen() {
    const router = useRouter();
    const { code, import: importData } = useLocalSearchParams<{ code?: string; import?: string }>();
    const { colors, accent, semantics, isDark } = useVeyraTheme();

    const session = useStore((state) => state.session);
    const triggerSync = useStore((state) => state.triggerSync);

    const [loading, setLoading] = useState(Boolean(code || importData));
    const [submitting, setSubmitting] = useState(false);
    const [syncingContent, setSyncingContent] = useState(false);
    const [invitation, setInvitation] = useState<ShareInvitation | null>(null);
    const [importEvents, setImportEvents] = useState<ImportItemPayload[] | null>(null);
    const [ownerEmail, setOwnerEmail] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [inputCode, setInputCode] = useState(typeof code === 'string' ? code : '');

    const lastProcessedRef = useRef<string | null>(null);
    const isExecutingRef = useRef<boolean>(false);

    const dangerColor = semantics.critical.primary;
    const successColor = semantics.success.primary;

    const extractCleanCode = (raw: string): string => {
        let clean = raw.trim();
        if (clean.includes('code=')) {
            const m = clean.match(/code=([a-zA-Z0-9_-]+)/);
            if (m && m[1]) clean = m[1];
        } else if (clean.includes('/join/')) {
            const m = clean.match(/\/join\/([a-zA-Z0-9_-]+)/);
            if (m && m[1]) clean = m[1];
        }
        return clean.trim().toLowerCase();
    };

    const loadInvitation = useCallback(async (targetCode?: string, targetImport?: string) => {
        if (isExecutingRef.current) return;
        isExecutingRef.current = true;

        if (targetImport) {
            try {
                setLoading(true);
                setError(null);
                setInvitation(null);
                const parsed = decodeSafeBase64Json(targetImport);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setImportEvents(parsed);
                } else {
                    setError('El enlace de importación no contiene eventos válidos.');
                }
            } catch (e: any) {
                console.warn('[JoinScreen] Error decodificando importación:', e);
                setError('No se pudo leer el contenido de la importación.');
            } finally {
                setLoading(false);
                isExecutingRef.current = false;
            }
            return;
        }

        const activeCode = targetCode ? extractCleanCode(targetCode) : '';
        if (!activeCode) {
            setLoading(false);
            isExecutingRef.current = false;
            return;
        }

        try {
            setLoading(true);
            setError(null);
            setImportEvents(null);

            const res = await CollaborationService.getInvitationByCode(activeCode);

            if (!res) {
                setError('No encontramos ninguna invitación activa con este código o ha expirado.');
                setInvitation(null);
            } else {
                setInvitation(res.invitation);
                setOwnerEmail(res.ownerEmail);
            }
        } catch (e: any) {
            console.warn('[JoinScreen] Error cargando invitación:', e);
            setError(e.message || 'Error al cargar la invitación');
            setInvitation(null);
        } finally {
            setLoading(false);
            isExecutingRef.current = false;
        }
    }, []);

    useEffect(() => {
        const rawCode = typeof code === 'string' && code.trim() ? code.trim() : undefined;
        const rawImport = typeof importData === 'string' && importData.trim() ? importData.trim() : undefined;
        const targetKey = rawImport ? `import:${rawImport}` : rawCode ? `code:${extractCleanCode(rawCode)}` : null;

        if (!targetKey) {
            setLoading(false);
            return;
        }

        if (rawCode) {
            setInputCode(extractCleanCode(rawCode));
        }

        // Si ya cargamos o estamos cargando este target exacto, no reiniciar estado ni spinner
        if (lastProcessedRef.current === targetKey) {
            return;
        }

        lastProcessedRef.current = targetKey;
        loadInvitation(rawCode, rawImport);
    }, [code, importData, loadInvitation]);

    const handlePaste = async () => {
        try {
            const clipboardText = await Clipboard.getString();
            if (clipboardText && clipboardText.trim()) {
                const trimmed = clipboardText.trim();
                if (trimmed.includes('import=')) {
                    const m = trimmed.match(/import=([^&]+)/);
                    if (m && m[1]) {
                        setInputCode(trimmed);
                        lastProcessedRef.current = `import:${m[1]}`;
                        loadInvitation(undefined, m[1]);
                        return;
                    }
                }
                const cleaned = extractCleanCode(trimmed);
                setInputCode(cleaned);
                lastProcessedRef.current = `code:${cleaned}`;
                loadInvitation(cleaned, undefined);
            }
        } catch (e) {
            // no crítico
        }
    };

    const handleManualSearch = () => {
        Keyboard.dismiss();
        const trimmed = inputCode.trim();
        if (!trimmed) {
            setError('Por favor ingresa un código de invitación');
            return;
        }

        if (trimmed.includes('import=')) {
            const m = trimmed.match(/import=([^&]+)/);
            if (m && m[1]) {
                lastProcessedRef.current = `import:${m[1]}`;
                loadInvitation(undefined, m[1]);
                return;
            }
        }

        const cleaned = extractCleanCode(trimmed);
        if (!cleaned) {
            setError('Por favor ingresa un código de invitación válido');
            return;
        }
        lastProcessedRef.current = `code:${cleaned}`;
        loadInvitation(cleaned, undefined);
    };

    const handleAccept = async () => {
        if (importEvents && importEvents.length > 0) {
            setSubmitting(true);
            setError(null);
            try {
                let hasEvents = false;
                let hasReminders = false;

                for (const item of importEvents) {
                    if (item.kind === 'reminder' || item.due) {
                        hasReminders = true;
                        await useStore.getState().addReminder(
                            item.t,
                            item.due || item.s || Date.now(),
                            item.ctrl || 'normal',
                            item.d || undefined,
                            undefined,
                            undefined,
                            undefined,
                            item.subtasks || undefined
                        );
                    } else {
                        hasEvents = true;
                        const { EventService } = await import('../src/services/eventService');
                        await EventService.createEvent({
                            title: item.t,
                            description: item.d || undefined,
                            startTimeMs: item.s || Date.now(),
                            endTimeMs: item.e || (item.s ? item.s + 3600000 : Date.now() + 3600000),
                            location: item.l || undefined,
                            color: item.c || undefined,
                            repeatRule: item.r || undefined,
                            tags: item.tags || '["clase"]',
                        });
                    }
                }

                if (hasEvents) {
                    const { WidgetService } = await import('../src/services/widgetService');
                    await WidgetService.syncSchedule();
                }

                setSuccessMessage(
                    hasReminders && !hasEvents
                        ? (importEvents.length === 1 ? '¡Recordatorio guardado!' : `¡${importEvents.length} recordatorios guardados!`)
                        : (importEvents.length === 1 ? '¡Evento guardado en tu agenda!' : `¡${importEvents.length} eventos guardados en tu agenda!`)
                );

                setTimeout(() => {
                    if (hasReminders && !hasEvents) {
                        router.replace('/');
                    } else {
                        router.replace('/schedule');
                    }
                }, 1200);
            } catch (e: any) {
                setError(e.message || 'Error al importar los elementos');
                setSubmitting(false);
            }
            return;
        }

        if (!invitation?.invite_code) return;
        setSubmitting(true);
        setError(null);

        try {
            const res = await CollaborationService.acceptInvitation(invitation.invite_code);
            const isBatch = res.isBatch || Boolean(invitation.batch_items && invitation.batch_items.length > 0);
            const batchItems = res.batchItems && res.batchItems.length > 0 ? res.batchItems : (invitation.batch_items || []);

            setSuccessMessage(
                isBatch && batchItems.length > 0
                    ? `¡${batchItems.length} elementos añadidos a tu agenda y tareas con éxito!`
                    : res.targetType === 'event'
                    ? '¡Evento añadido a tu calendario con éxito!'
                    : `¡Te has unido con éxito a "${res.targetName || 'recurso'}"!`
            );

            // Descargar inmediatamente el o los elementos compartidos de la nube a SQLite
            setSyncingContent(true);
            try {
                const userId = session?.user?.id;
                if (userId) {
                    const { supabase } = await import('../src/lib/supabase');
                    const { SyncService } = await import('../src/services/syncService');
                    const { getDB } = await import('../src/db');
                    const db = await getDB();

                    const itemsToDownload = isBatch && batchItems.length > 0
                        ? batchItems
                        : [{ target_type: res.targetType, target_id: res.targetId, target_name: res.targetName || '' }];

                    let hasEventsDownloaded = false;
                    let hasRemindersDownloaded = false;
                    let hasNotesDownloaded = false;

                    for (const item of itemsToDownload) {
                        if (item.target_type === 'note') {
                            const { data: remoteNote } = await supabase
                                .from('notes')
                                .select('*')
                                .eq('id', item.target_id)
                                .maybeSingle();
                            if (remoteNote) {
                                await SyncService.upsertLocalNote(db, remoteNote, userId);
                            } else {
                                const now = Date.now();
                                await db.runAsync(
                                    `INSERT OR REPLACE INTO notes (id, user_id, title, content, created_at_ms, updated_at_ms, last_modified_ms, deleted, is_shared, shared_owner_id)
                                     VALUES (?, ?, ?, '', ?, ?, ?, 0, 1, ?)`,
                                    [item.target_id, invitation.owner_id, item.target_name || 'Nota compartida', now, now, now, invitation.owner_id]
                                );
                            }
                            await db.runAsync('UPDATE notes SET is_revoked = 0 WHERE id = ?', [item.target_id]);
                            hasNotesDownloaded = true;
                        } else if (item.target_type === 'reminder') {
                            const { data: remoteReminder } = await supabase
                                .from('reminders')
                                .select('*')
                                .eq('id', item.target_id)
                                .maybeSingle();
                            if (remoteReminder) {
                                const isCopy = Boolean((item as any).is_copy);
                                if (isCopy) {
                                    const newId = Crypto.randomUUID();
                                    const now = Date.now();
                                    await db.runAsync(
                                        `INSERT INTO reminders (id, user_id, title, description, due_date_ms, snooze_until_ms, repeat_rule, control_level, priority, status, next_attempt_ms, retry_count, max_retries, created_at_ms, last_modified_ms, deleted, notification_ids, attachments, links, subtasks, is_shared, shared_owner_id)
                                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 3, ?, ?, 0, null, ?, ?, ?, 0, null)`,
                                        [
                                            newId,
                                            userId,
                                            remoteReminder.title,
                                            remoteReminder.description || null,
                                            remoteReminder.due_date_ms,
                                            remoteReminder.snooze_until_ms || null,
                                            remoteReminder.repeat_rule || null,
                                            remoteReminder.control_level || 'NORMAL',
                                            remoteReminder.priority || 1,
                                            'pending',
                                            remoteReminder.next_attempt_ms || remoteReminder.due_date_ms,
                                            now,
                                            now,
                                            remoteReminder.attachments || null,
                                            remoteReminder.links || null,
                                            remoteReminder.subtasks || null,
                                        ]
                                    );
                                } else {
                                    await SyncService.upsertLocalReminder(db, remoteReminder, userId);
                                }
                            } else {
                                const now = Date.now();
                                await db.runAsync(
                                    `INSERT OR REPLACE INTO reminders (id, user_id, title, due_date_ms, control_level, priority, status, next_attempt_ms, retry_count, max_retries, created_at_ms, last_modified_ms, deleted, is_shared, shared_owner_id)
                                     VALUES (?, ?, ?, ?, 'NORMAL', 1, 'pending', ?, 0, 3, ?, ?, 0, 1, ?)`,
                                    [item.target_id, invitation.owner_id, item.target_name || 'Recordatorio compartido', now + 3600000, now + 3600000, now, now, invitation.owner_id]
                                );
                            }
                            hasRemindersDownloaded = true;
                        } else if (item.target_type === 'event') {
                            const { data: remoteEvent } = await supabase
                                .from('events')
                                .select('*')
                                .eq('id', item.target_id)
                                .maybeSingle();
                            if (remoteEvent) {
                                const isCopy = Boolean((item as any).is_copy);
                                if (isCopy) {
                                    const newId = Crypto.randomUUID();
                                    const now = Date.now();
                                    await db.runAsync(
                                        `INSERT INTO events (id, user_id, title, description, start_time_ms, end_time_ms, location, color, repeat_rule, tags, created_at_ms, updated_at_ms, last_modified_ms, deleted, is_shared, shared_owner_id)
                                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, null)`,
                                        [
                                            newId,
                                            userId,
                                            remoteEvent.title,
                                            remoteEvent.description || null,
                                            remoteEvent.start_time_ms,
                                            remoteEvent.end_time_ms || (remoteEvent.start_time_ms ? remoteEvent.start_time_ms + 3600000 : now + 3600000),
                                            remoteEvent.location || null,
                                            remoteEvent.color || null,
                                            remoteEvent.repeat_rule || null,
                                            remoteEvent.tags || '["clase"]',
                                            now,
                                            now,
                                            now,
                                        ]
                                    );
                                } else {
                                    await SyncService.upsertLocalEvent(db, remoteEvent, userId);
                                }
                            } else {
                                const now = Date.now();
                                await db.runAsync(
                                    `INSERT OR REPLACE INTO events (id, user_id, title, start_time_ms, end_time_ms, created_at_ms, updated_at_ms, last_modified_ms, deleted, is_shared, shared_owner_id)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`,
                                    [item.target_id, invitation.owner_id, item.target_name || 'Evento compartido', now, now + 3600000, now, now, now, invitation.owner_id]
                                );
                            }
                            hasEventsDownloaded = true;
                        } else if (item.target_type === 'folder') {
                            const { data: remoteFolder } = await supabase
                                .from('folders')
                                .select('*')
                                .eq('id', item.target_id)
                                .maybeSingle();
                            if (remoteFolder) {
                                await SyncService.upsertLocalFolder(db, remoteFolder, userId);
                                const { useFoldersStore } = await import('../src/store/useFoldersStore');
                                await useFoldersStore.getState().loadFolders();
                            }
                            const { data: remoteFolderNotes } = await supabase
                                .from('notes')
                                .select('*')
                                .eq('folder_id', item.target_id);
                            if (remoteFolderNotes && remoteFolderNotes.length > 0) {
                                for (const n of remoteFolderNotes) {
                                    await SyncService.upsertLocalNote(db, n, userId);
                                }
                            }
                            hasNotesDownloaded = true;
                        }
                    }

                    if (hasRemindersDownloaded) {
                        await useStore.getState().loadReminders();
                    }
                    if (hasEventsDownloaded) {
                        const { useEventsStore } = await import('../src/store/useEventsStore');
                        await useEventsStore.getState().loadAllEvents();
                    }
                    if (hasNotesDownloaded) {
                        const { useNotesStore } = await import('../src/store/useNotesStore');
                        await useNotesStore.getState().loadNotes();
                    }
                }

                // Disparar sincronización global para descargar adjuntos y actualizar relaciones
                await Promise.race([
                    triggerSync(false, false),
                    new Promise((resolve) => setTimeout(resolve, 3000)),
                ]);
            } catch (syncErr) {
                console.warn('[Join] Advertencia durante la sincronización inicial:', syncErr);
            } finally {
                setSyncingContent(false);
            }

            // Redirigir según el tipo de recurso con los datos ya disponibles en memoria y SQLite
            if (isBatch) {
                router.replace('/schedule');
            } else if (res.targetType === 'note') {
                router.replace(`/notes/${res.targetId}`);
            } else if (res.targetType === 'reminder') {
                router.replace(`/reminder/${res.targetId}`);
            } else if (res.targetType === 'event') {
                router.replace({ pathname: '/schedule', params: { id: res.targetId } });
            } else {
                router.replace('/');
            }
        } catch (e: any) {
            setError(e.message || 'No se pudo aceptar la invitación');
            setSubmitting(false);
            setSyncingContent(false);
        }
    };

    const renderTargetIcon = (type: CollabTargetType) => {
        const iconSize = 36;
        const iconColor = accent.primary as any;

        switch (type) {
            case 'batch':
                return <Layers size={iconSize} color={iconColor} />;
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
            case 'batch':
                return 'Lote colaborativo';
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
                        <TouchableOpacity
                            style={styles.cancelWaitBtn}
                            onPress={() => {
                                setLoading(false);
                            }}
                        >
                            <Text style={[styles.cancelWaitText, { color: accent.primary }]}>
                                Ingresar código manualmente
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : importEvents ? (
                    <View style={styles.cardContainer}>
                        {(() => {
                            const reminderCount = importEvents.filter(it => it.kind === 'reminder' || it.due).length;
                            const eventCount = importEvents.length - reminderCount;

                            let targetTitle = '';
                            let ownerText = '';
                            let buttonLabel = submitting ? 'Guardando...' : 'Añadir a mi cuenta';
                            let icon = <Calendar size={36} color={accent.primary as any} />;

                            if (reminderCount > 0 && eventCount === 0) {
                                targetTitle = reminderCount === 1 ? importEvents[0].t : `${reminderCount} recordatorios`;
                                ownerText = reminderCount === 1
                                    ? 'Se añadirá este recordatorio como una copia personal a tus tareas.'
                                    : `Se añadirán estos ${reminderCount} recordatorios como copias personales a tus tareas.`;
                                buttonLabel = submitting ? 'Guardando...' : 'Añadir a mis recordatorios';
                                icon = <CheckSquare size={36} color={accent.primary as any} />;
                            } else if (eventCount > 0 && reminderCount === 0) {
                                targetTitle = eventCount === 1 ? importEvents[0].t : `${eventCount} eventos de horario`;
                                ownerText = eventCount === 1
                                    ? 'Se añadirá este evento como una copia personal a tu calendario.'
                                    : `Se añadirán estas ${eventCount} clases como copias personales a tu calendario.`;
                                buttonLabel = submitting ? 'Guardando...' : 'Añadir a mi calendario';
                                icon = <Calendar size={36} color={accent.primary as any} />;
                            } else {
                                targetTitle = `${eventCount} ${eventCount === 1 ? 'evento' : 'eventos'} y ${reminderCount} ${reminderCount === 1 ? 'recordatorio' : 'recordatorios'}`;
                                ownerText = `Se añadirán ${eventCount} ${eventCount === 1 ? 'evento a tu calendario' : 'eventos a tu calendario'} y ${reminderCount} ${reminderCount === 1 ? 'recordatorio a tus tareas' : 'recordatorios a tus tareas'}.`;
                                buttonLabel = submitting ? 'Guardando...' : 'Añadir elementos a mi cuenta';
                                icon = <CheckSquare size={36} color={accent.primary as any} />;
                            }

                            return (
                                <>
                                    <VeyraSurface style={styles.invitationCard}>
                                        <View style={[styles.iconBadge, { backgroundColor: accent.primary + '18' }]}>
                                            {icon}
                                        </View>

                                        <Text style={[styles.typeBadge, { color: accent.primary }]}>
                                            COPIA INDEPENDIENTE
                                        </Text>

                                        <Text style={[styles.targetTitle, { color: colors.textPrimary }]}>
                                            {targetTitle}
                                        </Text>

                                        <Text style={[styles.ownerText, { color: colors.textSecondary }]}>
                                            {ownerText}
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
                                            label={buttonLabel}
                                            variant="primary"
                                            loading={submitting}
                                            iconRight={<ArrowRight size={18} color="#FFFFFF" />}
                                            onPress={handleAccept}
                                        />
                                        <View style={{ height: 12 }} />
                                        <TouchableOpacity
                                            style={styles.cancelButton}
                                            onPress={() => {
                                                setImportEvents(null);
                                                setError(null);
                                            }}
                                            disabled={submitting}
                                        >
                                            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                                                Cancelar o ingresar otro código
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            );
                        })()}
                    </View>
                ) : !session && invitation ? (
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
                                {Boolean(invitation.batch_items?.some((it: any) => it.is_copy))
                                    ? 'COPIA INDEPENDIENTE'
                                    : getTargetTypeName(invitation.target_type).toUpperCase()}
                            </Text>

                            <Text style={[styles.targetTitle, { color: colors.textPrimary }]}>
                                {invitation.target_name || 'Sin título'}
                            </Text>

                            <Text style={[styles.ownerText, { color: colors.textSecondary }]}>
                                {ownerEmail ? `Compartido por ${ownerEmail}` : 'Compartido contigo'}
                            </Text>

                            {invitation.batch_items && invitation.batch_items.length > 0 ? (
                                <View style={{ width: '100%', marginTop: 14, gap: 6 }}>
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        Elementos incluidos ({invitation.batch_items.length}):
                                    </Text>
                                    {invitation.batch_items.map((item, idx) => (
                                        <View
                                            key={`${item.target_id}_${idx}`}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                paddingVertical: 8,
                                                paddingHorizontal: 10,
                                                borderRadius: 10,
                                                backgroundColor: colors.surfaceElevated,
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                                                {item.target_type === 'reminder' ? (
                                                    <CheckSquare size={16} color={accent.primary as any} />
                                                ) : (
                                                    <Calendar size={16} color={accent.primary as any} />
                                                )}
                                                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary, flex: 1 }}>
                                                    {item.target_name}
                                                </Text>
                                            </View>
                                            <View
                                                style={{
                                                    paddingHorizontal: 8,
                                                    paddingVertical: 3,
                                                    borderRadius: 6,
                                                    backgroundColor: item.role === 'editor' ? `${accent.primary}20` : (isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.1)'),
                                                }}
                                            >
                                                <Text
                                                    style={{
                                                        fontSize: 11,
                                                        fontWeight: '600',
                                                        color: (item as any).is_copy ? accent.primary : item.role === 'editor' ? accent.primary : (isDark ? '#38BDF8' : '#0284C7'),
                                                    }}
                                                >
                                                    {(item as any).is_copy ? 'Copia personal' : item.role === 'editor' ? 'Editor' : 'Solo lectura'}
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <View style={[styles.roleBox, { backgroundColor: colors.surfaceElevated }]}>
                                    <ShieldCheck size={18} color={accent.primary as any} />
                                    <Text style={[styles.roleText, { color: colors.textSecondary }]}>
                                        Permisos: <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                                            {invitation.role === 'editor' ? 'Editor (Ver y modificar)' : 'Solo lectura'}
                                        </Text>
                                    </Text>
                                </View>
                            )}
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
                                    submitting || syncingContent
                                        ? (syncingContent ? 'Descargando contenido...' : (invitation.target_type === 'event' ? 'Añadiendo...' : 'Uniéndose...'))
                                        : (invitation.batch_items && invitation.batch_items.length > 0
                                            ? (invitation.batch_items.some((it: any) => it.is_copy)
                                                ? `Añadir copia de ${invitation.batch_items.length} elementos`
                                                : `Aceptar y añadir ${invitation.batch_items.length} elementos`)
                                            : (invitation.target_type === 'event' ? 'Añadir a mi calendario' : 'Aceptar y unirme'))
                                }
                                variant="primary"
                                loading={submitting || syncingContent}
                                iconRight={<ArrowRight size={18} color="#FFFFFF" />}
                                onPress={handleAccept}
                            />
                            <View style={{ height: 12 }} />
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => {
                                    setInvitation(null);
                                    setError(null);
                                }}
                                disabled={submitting || syncingContent}
                            >
                                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                                    Ingresar otro código
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    /* Tarjeta de Entrada Manual / Fallback */
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <View style={styles.cardContainer}>
                            <VeyraSurface style={styles.invitationCard}>
                                <View style={[styles.iconBadge, { backgroundColor: accent.primary + '18' }]}>
                                    <KeyRound size={36} color={accent.primary as any} />
                                </View>

                                <Text style={[styles.title, { color: colors.textPrimary }]}>
                                    Unirse con código
                                </Text>
                                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                                    Ingresa el código de invitación o pega el enlace completo que compartieron contigo.
                                </Text>

                                {error ? (
                                    <View style={[styles.errorBox, { backgroundColor: dangerColor + '18', borderColor: dangerColor + '40' }]}>
                                        <AlertCircle size={18} color={dangerColor as any} />
                                        <Text style={[styles.errorBoxText, { color: dangerColor }]}>
                                            {error}
                                        </Text>
                                    </View>
                                ) : null}

                                <View style={[styles.inputRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderMedium }]}>
                                    <TextInput
                                        style={[styles.codeInput, { color: colors.textPrimary }]}
                                        placeholder="Ej: B201FF7C o enlace..."
                                        placeholderTextColor={colors.textMuted}
                                        value={inputCode}
                                        onChangeText={(text) => {
                                            setInputCode(text);
                                            if (error) setError(null);
                                        }}
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                        returnKeyType="search"
                                        onSubmitEditing={handleManualSearch}
                                    />
                                    {inputCode.length > 0 && (
                                        <TouchableOpacity
                                            style={styles.clearBtn}
                                            onPress={() => {
                                                setInputCode('');
                                                setError(null);
                                            }}
                                        >
                                            <X size={16} color={colors.textMuted as any} />
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        style={[styles.pasteBtn, { backgroundColor: `${accent.primary}18` }]}
                                        onPress={handlePaste}
                                    >
                                        <Copy size={14} color={accent.primary as any} />
                                        <Text style={[styles.pasteBtnText, { color: accent.primary }]}>
                                            Pegar
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={{ width: '100%', marginTop: 20 }}>
                                    <VeyraButton
                                        label="Buscar invitación"
                                        variant="primary"
                                        iconRight={<ArrowRight size={18} color="#FFFFFF" />}
                                        onPress={handleManualSearch}
                                        disabled={!inputCode.trim()}
                                    />
                                </View>
                            </VeyraSurface>

                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => router.replace('/')}
                            >
                                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                                    Volver al inicio
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableWithoutFeedback>
                )}
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
        textAlign: 'center',
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
        marginTop: 4,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        marginTop: 8,
        marginBottom: 20,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 15,
        fontWeight: '500',
    },
    cancelWaitBtn: {
        marginTop: 18,
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    cancelWaitText: {
        fontSize: 14,
        fontWeight: '600',
    },
    errorBox: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
    },
    errorBoxText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '500',
    },
    inputRow: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    codeInput: {
        flex: 1,
        height: 48,
        fontSize: 15,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    clearBtn: {
        padding: 6,
        marginRight: 4,
    },
    pasteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
    },
    pasteBtnText: {
        fontSize: 13,
        fontWeight: '700',
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
        paddingVertical: 14,
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
