import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    StatusBar,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    TextInput,
    AppState,
    AppStateStatus,
    Modal,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { ArrowLeft, Users, RefreshCw, CheckCircle2, Wifi, WifiOff, Globe, Radio, Zap, X } from '@tamagui/lucide-icons';
import { supabase } from '../src/lib/supabase';
import { useStore } from '../src/store/useStore';
import { useNotesStore } from '../src/store/useNotesStore';
import { NoteService } from '../src/services/noteService';
import { YjsLocalPersistence } from '../src/poc-yjs/yjsLocalPersistence';
import { executePilotActivation } from '../src/poc-yjs/pilotActivationStrategy';
import { executePilotRepair, PILOT_NOTE_ID } from '../src/poc-yjs/pilotRepairStrategy';
import { Note } from '../src/types/db';
import { VeyraTiptapYjsEditor, VeyraTiptapEditorRef, EditorToolbarState } from '../src/poc-yjs/VeyraTiptapYjsEditor';
import { VeyraYjsToolbar } from '../src/poc-yjs/VeyraYjsToolbar';
import { SupabaseYjsProvider, SupabaseYjsStatus } from '../src/poc-yjs/supabaseYjsProvider';
import { YjsRemotePersistence } from '../src/poc-yjs/yjsRemotePersistence';
import { useVeyraTheme } from '../src/theme/useVeyraTheme';

const USER_PROFILES = [
    { id: '1', name: 'Dispositivo Android A', color: '#8B5CF6' },
    { id: '2', name: 'Dispositivo Android B', color: '#10B981' },
    { id: '3', name: 'Tablet / Tercer Par', color: '#F59E0B' },
];

export default function PocYjsScreen() {
    const { isDark, isAmoled } = useVeyraTheme();
    const accentColor = '#8B5CF6';

    // Sesión de autenticación de Supabase existente
    const session = useStore((state) => state.session);
    const authEmail = session?.user?.email || null;
    const authUserId = session?.user?.id || null;

    // Sala / Documento de prueba colaborativo
    const [roomId, setRoomId] = useState('poc-note-room-1');
    const [inputRoomId, setInputRoomId] = useState('poc-note-room-1');
    const [selectedUserIndex, setSelectedUserIndex] = useState(0);
    const currentUser = USER_PROFILES[selectedUserIndex];

    // Estado para selector, activación y reparación de nota piloto
    const [showPilotModal, setShowPilotModal] = useState(false);
    const [isActivatingPilot, setIsActivatingPilot] = useState(false);
    const [isRepairingPilot, setIsRepairingPilot] = useState(false);
    const [isRegeneratingSnapshot, setIsRegeneratingSnapshot] = useState(false);
    const [snapshotStatus, setSnapshotStatus] = useState<{
        serverClock?: number;
        length?: number;
        createdAt?: string;
        updatedAt?: string;
    } | null>(null);
    const notes = useNotesStore((state) => state.notes);
    const notesInRest = React.useMemo(
        () => (notes || []).filter((n) => (n.sync_mode || 'rest') === 'rest'),
        [notes]
    );

    // Diagnóstico inicial de sesión de Supabase
    useEffect(() => {
        supabase.auth.getSession().then(({ data, error }) => {
            console.log('[PoC Yjs Screen Session Check]', {
                hasSession: Boolean(data?.session),
                userId: data?.session?.user?.id || 'NO_AUTH_USER',
                email: data?.session?.user?.email || null,
                authError: error ? error.message : null,
                storeUserId: authUserId,
            });
        }).catch((err) => {
            console.warn('[PoC Yjs Screen Session Check Error]', err);
        });
    }, [authUserId]);

    const handleJoinRoom = useCallback(() => {
        const sanitized = inputRoomId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        if (!sanitized) {
            setInputRoomId(roomId);
            return;
        }
        if (sanitized !== roomId) {
            setActiveRemotePeers([]);
            setSyncMetrics({ sent: 0, received: 0, lastSync: 'Cambiando sala...' });
            setLatestTelemetry(`Cambiando a sala: ${sanitized}`);
            setRoomId(sanitized);
            setInputRoomId(sanitized);
        }
    }, [inputRoomId, roomId]);

    const PALETTE = ['#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#3B82F6', '#06B6D4'];

    const effectiveUserName = React.useMemo(() => {
        if (authEmail) {
            const shortEmail = authEmail.split('@')[0];
            return `${shortEmail} (${currentUser.name})`;
        }
        return currentUser.name;
    }, [authEmail, currentUser.name]);

    const effectiveUserColor = React.useMemo(() => {
        if (authUserId) {
            let hash = 0;
            for (let i = 0; i < authUserId.length; i++) {
                hash = (hash << 5) - hash + authUserId.charCodeAt(i);
                hash |= 0;
            }
            return PALETTE[Math.abs(hash) % PALETTE.length];
        }
        return currentUser.color;
    }, [authUserId, currentUser.color]);

    const [activeRemotePeers, setActiveRemotePeers] = useState<
        Array<{ clientId: number; name: string; color: string; hasCursor: boolean }>
    >([]);

    // Modo de prueba: 'realtime' (Supabase Realtime en red real) o 'split' (2 peers en la misma pantalla)
    const [mode, setMode] = useState<'realtime' | 'split'>('realtime');

    // Estado del proveedor de Supabase (separando CONNECTED, SYNCING y SYNCED)
    const [connectionStatus, setConnectionStatus] = useState<SupabaseYjsStatus>('DISCONNECTED');
    const [syncMetrics, setSyncMetrics] = useState({ sent: 0, received: 0, lastSync: 'En espera' });
    const [latestTelemetry, setLatestTelemetry] = useState<string>('Sin actividad');

    // Referencias de los editores
    const editorARef = useRef<VeyraTiptapEditorRef>(null);
    const editorBRef = useRef<VeyraTiptapEditorRef>(null);
    const providerRef = useRef<SupabaseYjsProvider | null>(null);

    // Estados de barras de herramientas
    const [toolbarStateA, setToolbarStateA] = useState<EditorToolbarState>({
        canUndo: false,
        canRedo: false,
        isBold: false,
        isItalic: false,
        isBulletList: false,
        isOrderedList: false,
    });

    const [toolbarStateB, setToolbarStateB] = useState<EditorToolbarState>({
        canUndo: false,
        canRedo: false,
        isBold: false,
        isItalic: false,
        isBulletList: false,
        isOrderedList: false,
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Gestión del Ciclo de Vida de Android (AppState: active vs background)
    // ─────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                // Volver de segundo plano: restaurar presencia local
                editorARef.current?.restoreAwareness();
                if (providerRef.current) {
                    const status = providerRef.current.getStatus();
                    if (status !== 'CONNECTED' && status !== 'SYNCED') {
                        // Solo reconectar si el socket realmente se cayó en segundo plano
                        providerRef.current.reconnect();
                    } else {
                        // El canal sigue vivo: sincronizar deltas y emitir presencia
                        editorARef.current?.requestSyncStep1();
                        editorARef.current?.broadcastAwareness();
                    }
                }
            } else if (nextAppState === 'background' || nextAppState === 'inactive') {
                // Pasar a segundo plano: destruir awareness y emitir PEER_LEFT
                editorARef.current?.destroyAwareness();
                providerRef.current?.sendPeerLeft();
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => {
            subscription.remove();
        };
    }, []);

    // ─────────────────────────────────────────────────────────────────────────────
    // Configuración del proveedor de Supabase Realtime para el Editor Principal
    // ─────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (mode !== 'realtime') {
            if (providerRef.current) {
                providerRef.current.destroy();
                providerRef.current = null;
                setConnectionStatus('DISCONNECTED');
            }
            return;
        }

        const remotePersistence = new YjsRemotePersistence(supabase);
        const provider = new SupabaseYjsProvider({
            supabase,
            documentId: roomId,
            clientId: `device-${Math.random().toString(36).substring(2, 7)}`,
            remotePersistence,
            user: {
                id: authUserId || undefined,
                name: effectiveUserName,
                color: effectiveUserColor,
            },
            onStatusChange: (status) => {
                setConnectionStatus(status);
                if (status === 'CONNECTED') {
                    // Al conectar/reconectar, emitir awareness y solicitar al WebView preparar estado
                    editorARef.current?.requestSyncStep1();
                    editorARef.current?.broadcastAwareness();
                }
            },
            onRemoteUpdate: (base64Update) => {
                editorARef.current?.applyRemoteUpdate(base64Update);
            },
            onRemoteAwareness: (base64Awareness, senderClientId) => {
                editorARef.current?.applyRemoteAwareness(base64Awareness, senderClientId);
            },
            onSyncStep1Received: (remoteSv, correlationId, isReturnHandshake) => {
                editorARef.current?.handleSyncStep1(remoteSv, correlationId, isReturnHandshake);
            },
            onPeerLeft: (remoteClientId) => {
                // El par remoto abandonó o minimizó la app: purgar su cursor inmediatamente
                editorARef.current?.removePeer(remoteClientId);
            },
            onHeartbeat: (remoteClientId) => {
                // Heartbeat activo recibido: renovar TTL de presencia del par
                editorARef.current?.touchPeer(remoteClientId);
            },
            onMetrics: (metrics) => {
                setSyncMetrics(metrics);
            },
            onError: (err) => {
                console.warn('[PoC Yjs] Error en Supabase Realtime:', err);
                setLatestTelemetry(`Error: ${err.message || String(err)}`);
            },
        });

        providerRef.current = provider;
        provider.connect();

        // Enviar awareness de forma periódica (cada 3s) para mantener presencia activa y cursores visibles
        const awarenessTimer = setInterval(() => {
            if (providerRef.current && (providerRef.current.getStatus() === 'CONNECTED' || providerRef.current.getStatus() === 'SYNCED')) {
                editorARef.current?.broadcastAwareness();
            }
        }, 3000);

        return () => {
            clearInterval(awarenessTimer);
            editorARef.current?.destroyAwareness();
            provider.destroy();
            if (providerRef.current === provider) {
                providerRef.current = null;
            }
        };
    }, [mode, roomId, effectiveUserName, effectiveUserColor, authUserId]);

    // Handlers para el Editor A
    const handleYjsUpdateFromA = useCallback((base64Update: string) => {
        if (mode === 'realtime') {
            providerRef.current?.sendUpdate(base64Update).then((res) => {
                if (res?.error) {
                    setLatestTelemetry(`Error persistencia: ${res.error}`);
                } else if (res?.remotePersisted) {
                    setLatestTelemetry(`Persistido en PostgreSQL (id=${res.updateId}${res.duplicate ? ' dup' : ''})`);
                }
            }).catch((err) => {
                setLatestTelemetry(`Error persistencia: ${err.message}`);
            });
        } else if (mode === 'split' && editorBRef.current) {
            editorBRef.current.applyRemoteUpdate(base64Update);
            setSyncMetrics((prev) => ({ ...prev, sent: prev.sent + 1, received: prev.received + 1 }));
        }
    }, [mode]);

    const handleAwarenessUpdateFromA = useCallback((base64Awareness: string) => {
        if (mode === 'realtime') {
            providerRef.current?.sendAwareness(base64Awareness);
        } else if (mode === 'split' && editorBRef.current) {
            editorBRef.current.applyRemoteAwareness(base64Awareness);
        }
    }, [mode]);

    const handleSyncStep1FromA = useCallback((base64Sv: string, correlationId?: string | null, isReturnHandshake?: boolean) => {
        if (mode === 'realtime') {
            providerRef.current?.sendSyncStep1(base64Sv, Boolean(isReturnHandshake), correlationId);
        }
    }, [mode]);

    const handleSyncStep2FromA = useCallback((base64Update: string, correlationId?: string | null) => {
        if (mode === 'realtime') {
            providerRef.current?.sendSyncStep2(base64Update, correlationId);
        }
    }, [mode]);

    const handleYjsLogFromA = useCallback((log: any) => {
        setLatestTelemetry(`[${log.origin}] ${log.action} (${log.sizeBytes}B frag:${log.fragment})`);
    }, []);

    const handleApplyUpdateAckFromA = useCallback((success: boolean) => {
        if (success) {
            providerRef.current?.setSynced();
        }
    }, []);

    const handleEditorReadyA = useCallback(() => {
        if (providerRef.current) {
            providerRef.current.catchUpRemoteUpdates().catch(() => {});
            const status = providerRef.current.getStatus();
            if (status === 'CONNECTED' || status === 'SYNCED') {
                editorARef.current?.requestSyncStep1();
                editorARef.current?.broadcastAwareness();
            }
        }
    }, []);

    // Handlers para el Editor B en Split Mode
    const handleYjsUpdateFromB = useCallback((base64Update: string) => {
        if (editorARef.current) {
            editorARef.current.applyRemoteUpdate(base64Update);
            setSyncMetrics((prev) => ({ ...prev, sent: prev.sent + 1, received: prev.received + 1 }));
        }
    }, []);

    const handleAwarenessUpdateFromB = useCallback((base64Awareness: string) => {
        if (editorARef.current) {
            editorARef.current.applyRemoteAwareness(base64Awareness);
        }
    }, []);

    const handleConfirmAndActivate = useCallback((note: Note) => {
        Alert.alert(
            'Confirmar activación de nota piloto Yjs',
            `¿Deseas activar esta nota como nota piloto Yjs?\n\n• Título: "${note.title || 'Sin título'}"\n• ID: ${note.id}\n• Modo actual: ${note.sync_mode || 'rest'}\n\nSe usará tu sesión autenticada para invocar la RPC 'activate_note_yjs_mode' con los hashes calculados de su contenido. Ninguna otra nota será modificada.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Activar piloto',
                    style: 'default',
                    onPress: async () => {
                        try {
                            setIsActivatingPilot(true);
                            const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
                            const currentUserId = sessionData?.session?.user?.id;
                            if (sessionErr || !currentUserId) {
                                Alert.alert('Error de sesión', 'No hay una sesión activa de Supabase. Inicia sesión con la cuenta propietaria.');
                                return;
                            }

                            const { data: remoteNote, error: remoteErr } = await supabase
                                .from('notes')
                                .select('id, user_id, title, content, updated_at_ms, last_modified_ms, sync_mode, deleted')
                                .eq('id', note.id)
                                .maybeSingle();

                            if (remoteErr || !remoteNote) {
                                Alert.alert(
                                    'Nota remota no encontrada',
                                    `La nota aún no existe en Supabase o no ha sido sincronizada. Guarda o sincroniza la nota antes de activar.\n\nDetalle: ${remoteErr?.message || 'No encontrada'}`
                                );
                                return;
                            }

                            if (remoteNote.sync_mode === 'yjs') {
                                await NoteService.setNoteSyncMode(note.id, 'yjs');
                                await useNotesStore.getState().updateNote(note.id, { sync_mode: 'yjs' });
                                Alert.alert('Nota ya activada', 'La nota ya fue activada remotamente en Supabase. El estado local ha sido actualizado a Yjs.');
                                setRoomId(note.id);
                                setInputRoomId(note.id);
                                setShowPilotModal(false);
                                return;
                            }

                            const localPersistence = new YjsLocalPersistence();
                            const noteToActivate: Note = {
                                ...note,
                                content: remoteNote.content ?? note.content,
                                updated_at_ms: remoteNote.updated_at_ms ?? note.updated_at_ms,
                                last_modified_ms: remoteNote.last_modified_ms ?? note.last_modified_ms,
                            };

                            const result = await executePilotActivation(
                                supabase,
                                localPersistence,
                                noteToActivate,
                                currentUserId,
                                async (noteId) => {
                                    await NoteService.setNoteSyncMode(noteId, 'yjs');
                                    await useNotesStore.getState().updateNote(noteId, { sync_mode: 'yjs' });
                                }
                            );

                            if (result.success) {
                                Alert.alert(
                                    'Activación piloto exitosa',
                                    `La nota piloto ha sido activada en modo Yjs correctamente.\n\n• ID: ${result.noteId}\n• Modo: ${result.syncMode}\n• Update ID: ${result.initialUpdateId}\n• Timestamp: ${result.updatedAtMs}\n\nConectando sala PoC a la nota activada...`
                                );
                                setRoomId(note.id);
                                setInputRoomId(note.id);
                                setShowPilotModal(false);
                            } else {
                                Alert.alert(
                                    'Fallo en la activación piloto',
                                    `La RPC retornó el siguiente resultado o error:\n\n${result.error || 'Error desconocido'}`
                                );
                            }
                        } catch (err: any) {
                            Alert.alert('Excepción durante la activación', err?.message || 'Error inesperado');
                        } finally {
                            setIsActivatingPilot(false);
                        }
                    },
                },
            ]
        );
    }, []);

    const handleConfirmAndRepairPilot = useCallback(() => {
        Alert.alert(
            'Confirmar reparación de la nota piloto Yjs',
            `¿Deseas aplicar la reparación definitiva de la nota piloto?\n\n• ID: ${PILOT_NOTE_ID}\n• Página esperada: 4d6fbbfc-b338-4ca9-9bf1-5c5e7da9c4b9\n\nAcciones que se realizarán:\n1. Reconstruirá el Y.Doc desde las actualizaciones existentes en Supabase sin alterarlas.\n2. Escribirá el contenido original de notes.content en el fragmento real y en 'default'.\n3. Actualizará pageOrder con el ID real de la página.\n4. Persistirá el nuevo delta aditivo mediante la RPC append_note_yjs_update de forma 100% idempotente.\n\nNinguna otra nota será alterada.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Ejecutar reparación',
                    style: 'default',
                    onPress: async () => {
                        try {
                            setIsRepairingPilot(true);
                            const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
                            const currentUserId = sessionData?.session?.user?.id;
                            if (sessionErr || !currentUserId) {
                                Alert.alert('Error de sesión', 'No hay una sesión activa de Supabase. Inicia sesión con la cuenta propietaria.');
                                return;
                            }

                            // Obtener datos remotos de la nota piloto
                            const { data: remoteNote, error: remoteErr } = await supabase
                                .from('notes')
                                .select('*')
                                .eq('id', PILOT_NOTE_ID)
                                .maybeSingle();

                            if (remoteErr || !remoteNote) {
                                Alert.alert(
                                    'Nota piloto no encontrada',
                                    `No fue posible obtener la nota piloto de Supabase: ${remoteErr?.message || 'No encontrada'}`
                                );
                                return;
                            }

                            const localPersistence = new YjsLocalPersistence();
                            const noteToRepair: Note = {
                                ...remoteNote,
                                content: remoteNote.content,
                            };

                            const repairResult = await executePilotRepair(
                                supabase,
                                localPersistence,
                                noteToRepair,
                                currentUserId
                            );

                            if (repairResult.success) {
                                if (repairResult.alreadyRepaired) {
                                    Alert.alert(
                                        'Nota ya reparada (Idempotente)',
                                        'La nota piloto ya contiene la estructura reparada y el fragmento real poblado. No se insertaron copias duplicadas.'
                                    );
                                } else {
                                    Alert.alert(
                                        'Reparación completada con éxito',
                                        `La nota piloto ha sido reparada exitosamente.\n\n• Update ID: ${repairResult.updateId}\n• Duplicado: ${Boolean(repairResult.duplicate)}\n• Mensaje: ${repairResult.message || 'Completado'}\n\nConectando sala PoC a la nota reparada...`
                                    );
                                }
                                setRoomId(PILOT_NOTE_ID);
                                setInputRoomId(PILOT_NOTE_ID);
                                setShowPilotModal(false);
                            } else {
                                Alert.alert(
                                    'Error en la reparación',
                                    `La reparación no pudo completarse:\n\n${repairResult.error || 'Error desconocido'}`
                                );
                            }
                        } catch (err: any) {
                            Alert.alert('Excepción durante la reparación', err?.message || 'Error inesperado');
                        } finally {
                            setIsRepairingPilot(false);
                        }
                    },
                },
            ]
        );
    }, []);

    const handleRegenerateSnapshot = useCallback(async () => {
        Alert.alert(
            'Regenerar Snapshot Piloto',
            'Se consolidará el estado completo actual (snapshot previo + todos los deltas aplicados) y se guardará como nuevo snapshot acelerador en note_yjs_snapshots.\n\nLos deltas históricos en note_yjs_updates NO serán eliminados.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Regenerar',
                    style: 'default',
                    onPress: async () => {
                        setIsRegeneratingSnapshot(true);
                        try {
                            const remotePersistence = new YjsRemotePersistence(supabase);
                            const res = await remotePersistence.regenerateSnapshot(PILOT_NOTE_ID);
                            if (res.success) {
                                setSnapshotStatus({
                                    serverClock: res.serverClock,
                                    length: res.length,
                                    createdAt: res.createdAt,
                                    updatedAt: res.updatedAt,
                                });
                                Alert.alert(
                                    'Snapshot regenerado con éxito',
                                    `Estado del snapshot en base de datos:\n\n• Server Clock: ${res.serverClock}\n• Longitud Base64: ${res.length} caracteres\n• Creado: ${res.createdAt || 'N/A'}\n• Actualizado: ${res.updatedAt || 'N/A'}`
                                );
                            } else {
                                Alert.alert('Error al regenerar snapshot', res.error || 'Error desconocido');
                            }
                        } catch (err: any) {
                            Alert.alert('Excepción al regenerar snapshot', err?.message || 'Error inesperado');
                        } finally {
                            setIsRegeneratingSnapshot(false);
                        }
                    },
                },
            ]
        );
    }, []);

    // Color del badge de estado
    const statusColor = {
        SYNCED: '#10B981',       // Verde (convergencia lograda)
        CONNECTED: '#3B82F6',    // Azul (conectado a Supabase)
        SYNCING: '#F59E0B',      // Ámbar (intercambiando state vectors)
        CONNECTING: '#F59E0B',   // Ámbar
        RECONNECTING: '#F59E0B', // Ámbar
        DISCONNECTED: '#71717A', // Gris
        ERROR: '#EF4444',        // Rojo
    }[connectionStatus] || '#71717A';

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0D0D0E" />
            <Stack.Screen options={{ headerShown: false }} />

            {/* Cabecera */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={20} color="#A1A1AA" />
                </TouchableOpacity>

                <View style={styles.headerTitles}>
                    <Text style={styles.title}>PoC: Colaboración Tiptap + Yjs</Text>
                    <Text style={styles.subtitle}>
                        {mode === 'realtime' ? 'Supabase Realtime (Red Real)' : 'Modo Split (2 Peers locales)'}
                    </Text>
                </View>

                {/* Botón selector de nota piloto */}
                <TouchableOpacity
                    onPress={() => setShowPilotModal(true)}
                    style={[styles.badgeBtn, { borderColor: '#8B5CF6', backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}
                >
                    <Zap size={14} color="#A78BFA" />
                    <Text style={[styles.badgeText, { color: '#A78BFA' }]}>
                        Piloto Yjs
                    </Text>
                </TouchableOpacity>

                {/* Alternar modo */}
                <TouchableOpacity
                    onPress={() => setMode(mode === 'realtime' ? 'split' : 'realtime')}
                    style={[styles.badgeBtn, mode === 'realtime' && styles.badgeBtnActive]}
                >
                    {mode === 'realtime' ? <Globe size={14} color="#8B5CF6" /> : <Users size={14} color="#71717A" />}
                    <Text style={[styles.badgeText, mode === 'realtime' && styles.badgeTextActive]}>
                        {mode === 'realtime' ? 'Supabase' : 'Split'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Barra de métricas y estado del canal */}
            <View style={styles.metricsBar}>
                <View style={styles.metricItem}>
                    {connectionStatus === 'SYNCED' ? (
                        <CheckCircle2 size={13} color={(statusColor as any)} />
                    ) : connectionStatus === 'CONNECTED' ? (
                        <Wifi size={13} color={(statusColor as any)} />
                    ) : connectionStatus === 'SYNCING' ? (
                        <RefreshCw size={13} color={(statusColor as any)} />
                    ) : (
                        <WifiOff size={13} color={(statusColor as any)} />
                    )}
                    <Text style={[styles.metricText, { color: statusColor, fontWeight: '700' }]}>
                        {connectionStatus}
                    </Text>
                </View>

                <View style={styles.metricItem}>
                    <RefreshCw size={13} color="#8B5CF6" />
                    <Text style={styles.metricText}>
                        Updates: ↑{syncMetrics.sent} ↓{syncMetrics.received}
                    </Text>
                </View>

                {/* Botón de re-sincronización / reconexión manual */}
                <TouchableOpacity
                    onPress={() => {
                        if (connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCED') {
                            providerRef.current?.reconnect();
                        } else {
                            editorARef.current?.requestSyncStep1();
                            editorARef.current?.broadcastAwareness();
                        }
                    }}
                    style={styles.syncBtn}
                >
                    <RefreshCw size={11} color="#A78BFA" />
                    <Text style={styles.syncBtnText}>
                        {connectionStatus !== 'CONNECTED' && connectionStatus !== 'SYNCED' ? 'Reconectar' : 'Sincronizar'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Fila de Telemetría estructurada (DocId, Origen, Tamaño, Fragmento) */}
            <View style={styles.telemetryBar}>
                <Radio size={11} color="#10B981" />
                <Text style={styles.telemetryText} numberOfLines={1}>
                    Doc: {roomId} | {latestTelemetry}
                </Text>
            </View>

            {/* Configuración de Sala / DocumentId */}
            <View style={styles.roomConfigRow}>
                <Text style={styles.roomLabel}>Canal:</Text>
                <TextInput
                    value={inputRoomId}
                    onChangeText={setInputRoomId}
                    onSubmitEditing={handleJoinRoom}
                    returnKeyType="go"
                    style={styles.roomInput}
                    placeholder="ID del documento"
                    placeholderTextColor="#52525B"
                    autoCapitalize="none"
                    autoCorrect={false}
                />

                {inputRoomId.trim().toLowerCase() !== roomId && (
                    <TouchableOpacity
                        onPress={handleJoinRoom}
                        style={styles.joinBtn}
                    >
                        <Text style={styles.joinBtnText}>Unirse</Text>
                    </TouchableOpacity>
                )}

                {authEmail && (
                    <Text style={styles.authBadge} numberOfLines={1}>
                        👤 {authEmail.split('@')[0]}
                    </Text>
                )}
            </View>

            {/* Selector de Perfil del Dispositivo */}
            <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Dispositivo:</Text>
                {USER_PROFILES.map((profile, idx) => (
                    <TouchableOpacity
                        key={profile.id}
                        onPress={() => {
                            setSelectedUserIndex(idx);
                            editorARef.current?.setUser(profile.name, profile.color);
                        }}
                        style={[
                            styles.profileChip,
                            selectedUserIndex === idx && {
                                borderColor: profile.color,
                                backgroundColor: `${profile.color}20`,
                            },
                        ]}
                    >
                        <View style={[styles.avatarDot, { backgroundColor: profile.color }]} />
                        <Text
                            style={[
                                styles.profileName,
                                selectedUserIndex === idx && { color: profile.color, fontWeight: '700' },
                            ]}
                        >
                            {profile.name.split(' ')[0]}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Contenedor del Editor */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.keyboardContainer}
            >
                {/* Editor A (Instancia local activa) */}
                <View style={[styles.editorCard, mode === 'split' && styles.editorCardSplit]}>
                    <View style={styles.editorHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
                            <View style={[styles.avatarDot, { backgroundColor: effectiveUserColor }]} />
                            <Text style={styles.editorTitle} numberOfLines={1}>
                                {effectiveUserName} {mode === 'split' ? '(Editor A)' : ''}
                            </Text>
                        </View>
                        {mode === 'realtime' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                {activeRemotePeers.length === 0 ? (
                                    <Text style={{ fontSize: 11, color: '#71717A' }}>Sin pares</Text>
                                ) : (
                                    activeRemotePeers.map((p) => (
                                        <View
                                            key={p.clientId}
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                backgroundColor: `${p.color}20`,
                                                paddingHorizontal: 6,
                                                paddingVertical: 2,
                                                borderRadius: 10,
                                                borderWidth: 1,
                                                borderColor: p.color,
                                                gap: 4,
                                            }}
                                        >
                                            <View
                                                style={{
                                                    width: 6,
                                                    height: 6,
                                                    borderRadius: 3,
                                                    backgroundColor: p.color,
                                                }}
                                            />
                                            <Text
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: '600',
                                                    color: p.color,
                                                }}
                                            >
                                                {p.name.split(' ')[0]} {p.hasCursor ? '✍️' : ''}
                                            </Text>
                                        </View>
                                    ))
                                )}
                            </View>
                        )}
                    </View>

                    <VeyraYjsToolbar
                        state={toolbarStateA}
                        onToggleBold={() => editorARef.current?.toggleBold()}
                        onToggleItalic={() => editorARef.current?.toggleItalic()}
                        onToggleBulletList={() => editorARef.current?.toggleBulletList()}
                        onToggleOrderedList={() => editorARef.current?.toggleOrderedList()}
                        onUndo={() => editorARef.current?.undo()}
                        onRedo={() => editorARef.current?.redo()}
                        accentColor={effectiveUserColor}
                        isDark={isDark}
                        isAmoled={isAmoled}
                    />

                    <VeyraTiptapYjsEditor
                        key={roomId}
                        ref={editorARef}
                        isDark={isDark}
                        isAmoled={isAmoled}
                        accentColor={effectiveUserColor}
                        userName={effectiveUserName}
                        userColor={effectiveUserColor}
                        onYjsUpdate={handleYjsUpdateFromA}
                        onAwarenessUpdate={handleAwarenessUpdateFromA}
                        onSyncStep1={handleSyncStep1FromA}
                        onSyncStep2={handleSyncStep2FromA}
                        onYjsLog={handleYjsLogFromA}
                        onApplyUpdateAck={handleApplyUpdateAckFromA}
                        onToolbarStateChange={setToolbarStateA}
                        onAwarenessPeersChanged={setActiveRemotePeers}
                        onReady={handleEditorReadyA}
                    />
                </View>

                {/* Editor B (Solo en Split Mode para simulación local) */}
                {mode === 'split' && (
                    <View style={[styles.editorCard, styles.editorCardSplit, styles.editorCardB]}>
                        <View style={styles.editorHeader}>
                            <View style={[styles.avatarDot, { backgroundColor: USER_PROFILES[1].color }]} />
                            <Text style={styles.editorTitle}>
                                {USER_PROFILES[1].name} (Editor B)
                            </Text>
                        </View>

                        <VeyraYjsToolbar
                            state={toolbarStateB}
                            onToggleBold={() => editorBRef.current?.toggleBold()}
                            onToggleItalic={() => editorBRef.current?.toggleItalic()}
                            onToggleBulletList={() => editorBRef.current?.toggleBulletList()}
                            onToggleOrderedList={() => editorBRef.current?.toggleOrderedList()}
                            onUndo={() => editorBRef.current?.undo()}
                            onRedo={() => editorBRef.current?.redo()}
                            accentColor={USER_PROFILES[1].color}
                            isDark={isDark}
                            isAmoled={isAmoled}
                        />

                        <VeyraTiptapYjsEditor
                            ref={editorBRef}
                            isDark={isDark}
                            isAmoled={isAmoled}
                            accentColor={USER_PROFILES[1].color}
                            userName={USER_PROFILES[1].name}
                            userColor={USER_PROFILES[1].color}
                            onYjsUpdate={handleYjsUpdateFromB}
                            onAwarenessUpdate={handleAwarenessUpdateFromB}
                            onToolbarStateChange={setToolbarStateB}
                        />
                    </View>
                )}
            </KeyboardAvoidingView>

            {/* Modal de Selección y Activación de Nota Piloto */}
            <Modal
                visible={showPilotModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowPilotModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Zap size={18} color="#8B5CF6" />
                                <Text style={styles.modalTitle}>Activar Nota Piloto Yjs</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowPilotModal(false)} style={styles.modalCloseBtn}>
                                <X size={18} color="#A1A1AA" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalDesc}>
                            Gestiona la activación o reparación de la nota piloto Yjs usando tu sesión autenticada.
                        </Text>

                        {/* Tarjeta de Reparación Exclusiva de la Nota Piloto */}
                        <View style={{
                            marginBottom: 16,
                            padding: 14,
                            borderRadius: 12,
                            backgroundColor: 'rgba(139, 92, 246, 0.1)',
                            borderWidth: 1,
                            borderColor: '#8B5CF6',
                        }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <Text style={{ color: '#F4F4F5', fontWeight: '700', fontSize: 13 }}>
                                    Nota Piloto (Modo Yjs)
                                </Text>
                                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(16, 185, 129, 0.2)' }}>
                                    <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '700' }}>Activa</Text>
                                </View>
                            </View>
                            <Text style={{ color: '#A1A1AA', fontSize: 11, marginBottom: 4 }}>
                                ID: {PILOT_NOTE_ID}
                            </Text>
                            <Text style={{ color: '#71717A', fontSize: 11, marginBottom: 12 }}>
                                Página: 4d6fbbfc-b338-4ca9-9bf1-5c5e7da9c4b9
                            </Text>
                            <TouchableOpacity
                                onPress={handleConfirmAndRepairPilot}
                                disabled={isRepairingPilot || isActivatingPilot || isRegeneratingSnapshot}
                                style={{
                                    backgroundColor: '#8B5CF6',
                                    paddingVertical: 9,
                                    paddingHorizontal: 12,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    opacity: isRepairingPilot ? 0.6 : 1,
                                }}
                            >
                                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                                    {isRepairingPilot ? 'Reparando estructura Yjs...' : '🛠️ Reparar Nota Piloto (Idempotente)'}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleRegenerateSnapshot}
                                disabled={isRegeneratingSnapshot || isRepairingPilot || isActivatingPilot}
                                style={{
                                    backgroundColor: '#10B981',
                                    paddingVertical: 9,
                                    paddingHorizontal: 12,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    marginTop: 8,
                                    opacity: isRegeneratingSnapshot ? 0.6 : 1,
                                }}
                            >
                                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                                    {isRegeneratingSnapshot ? 'Regenerando Snapshot...' : '⚡ Regenerar Snapshot Piloto'}
                                </Text>
                            </TouchableOpacity>

                            {snapshotStatus && (
                                <View style={{
                                    marginTop: 8,
                                    padding: 8,
                                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                    borderRadius: 6,
                                    borderWidth: 1,
                                    borderColor: 'rgba(16, 185, 129, 0.3)',
                                }}>
                                    <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700', marginBottom: 2 }}>
                                        Snapshot actual en Supabase:
                                    </Text>
                                    <Text style={{ color: '#E4E4E7', fontSize: 10 }}>
                                        Clock: {snapshotStatus.serverClock} | Tamaño: {snapshotStatus.length} chars
                                    </Text>
                                    <Text style={{ color: '#A1A1AA', fontSize: 9 }}>
                                        Updated: {snapshotStatus.updatedAt}
                                    </Text>
                                </View>
                            )}
                        </View>

                        <Text style={{ color: '#71717A', fontSize: 11, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' }}>
                            O activar otra nota en modo rest:
                        </Text>

                        {isActivatingPilot && (
                            <View style={{ paddingVertical: 20, alignItems: 'center', gap: 10 }}>
                                <ActivityIndicator size="small" color="#8B5CF6" />
                                <Text style={{ color: '#A1A1AA', fontSize: 13 }}>Calculando hashes e invocando RPC...</Text>
                            </View>
                        )}

                        <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                            {notesInRest.length === 0 ? (
                                <Text style={styles.emptyNotesText}>No se encontraron notas en modo rest.</Text>
                            ) : (
                                notesInRest.map((n) => (
                                    <TouchableOpacity
                                        key={n.id}
                                        activeOpacity={0.7}
                                        onPress={() => handleConfirmAndActivate(n)}
                                        style={styles.noteItem}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.noteItemTitle} numberOfLines={1}>
                                                {n.title || 'Sin título'}
                                            </Text>
                                            <Text style={styles.noteItemId} numberOfLines={1}>
                                                ID: {n.id}
                                            </Text>
                                        </View>
                                        <View style={styles.noteItemBadge}>
                                            <Text style={styles.noteItemBadgeText}>rest</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'flex-end',
    },
    modalCard: {
        backgroundColor: '#18181B',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        borderColor: '#27272A',
        padding: 20,
        maxHeight: '75%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#F4F4F5',
    },
    modalCloseBtn: {
        padding: 6,
        borderRadius: 8,
        backgroundColor: '#27272A',
    },
    modalDesc: {
        fontSize: 12,
        color: '#A1A1AA',
        lineHeight: 18,
        marginBottom: 16,
    },
    modalList: {
        maxHeight: 320,
    },
    emptyNotesText: {
        color: '#71717A',
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 20,
    },
    noteItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#202024',
        borderWidth: 1,
        borderColor: '#2E2E33',
        marginBottom: 8,
        gap: 12,
    },
    noteItemTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#F4F4F5',
    },
    noteItemId: {
        fontSize: 10.5,
        color: '#71717A',
        marginTop: 2,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    noteItemBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    noteItemBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#A78BFA',
        textTransform: 'uppercase',
    },
    container: {
        flex: 1,
        backgroundColor: '#0D0D0E',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#1F1F24',
        gap: 12,
    },
    backBtn: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: '#18181B',
    },
    headerTitles: {
        flex: 1,
    },
    title: {
        color: '#F4F4F5',
        fontSize: 15,
        fontWeight: '700',
    },
    subtitle: {
        color: '#71717A',
        fontSize: 11,
        marginTop: 2,
    },
    badgeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#27272A',
        backgroundColor: '#18181B',
    },
    badgeBtnActive: {
        borderColor: '#8B5CF6',
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
    },
    badgeText: {
        fontSize: 12,
        color: '#71717A',
        fontWeight: '600',
    },
    badgeTextActive: {
        color: '#A78BFA',
    },
    metricsBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#141417',
        borderBottomWidth: 1,
        borderBottomColor: '#1F1F24',
    },
    metricItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    metricText: {
        color: '#A1A1AA',
        fontSize: 11,
        fontWeight: '500',
    },
    metricTime: {
        color: '#71717A',
        fontSize: 11,
    },
    syncBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        borderWidth: 1,
        borderColor: '#8B5CF6',
    },
    syncBtnText: {
        color: '#A78BFA',
        fontSize: 10,
        fontWeight: '700',
    },
    telemetryBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 4,
        backgroundColor: '#0F0F12',
        borderBottomWidth: 1,
        borderBottomColor: '#1A1A1E',
    },
    telemetryText: {
        color: '#71717A',
        fontSize: 10,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    roomConfigRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#18181B',
        borderBottomWidth: 1,
        borderBottomColor: '#27272A',
        gap: 8,
    },
    roomLabel: {
        color: '#71717A',
        fontSize: 12,
        fontWeight: '600',
    },
    roomInput: {
        flex: 1,
        height: 32,
        backgroundColor: '#121214',
        borderRadius: 8,
        paddingHorizontal: 10,
        color: '#F4F4F5',
        fontSize: 12,
        borderWidth: 1,
        borderColor: '#2E2E34',
    },
    joinBtn: {
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    joinBtnText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
    },
    authBadge: {
        fontSize: 11,
        color: '#A78BFA',
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        maxWidth: 130,
    },
    profileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
    },
    profileLabel: {
        color: '#71717A',
        fontSize: 12,
        fontWeight: '600',
    },
    profileChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#27272A',
        backgroundColor: '#18181B',
    },
    avatarDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    profileName: {
        color: '#A1A1AA',
        fontSize: 11,
        fontWeight: '500',
    },
    keyboardContainer: {
        flex: 1,
    },
    editorCard: {
        flex: 1,
        backgroundColor: '#121214',
    },
    editorCardSplit: {
        flex: 0.5,
        borderBottomWidth: 2,
        borderBottomColor: '#27272A',
    },
    editorCardB: {
        borderTopWidth: 2,
        borderTopColor: '#27272A',
    },
    editorHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
    },
    editorTitle: {
        color: '#A1A1AA',
        fontSize: 12,
        fontWeight: '600',
    },
});
