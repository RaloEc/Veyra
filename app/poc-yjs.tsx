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
} from 'react-native';
import { Stack, router } from 'expo-router';
import { ArrowLeft, Users, RefreshCw, CheckCircle2, Wifi, WifiOff, Globe, Radio } from '@tamagui/lucide-icons';
import { supabase } from '../src/lib/supabase';
import { useStore } from '../src/store/useStore';
import { VeyraTiptapYjsEditor, VeyraTiptapEditorRef, EditorToolbarState } from '../src/poc-yjs/VeyraTiptapYjsEditor';
import { VeyraYjsToolbar } from '../src/poc-yjs/VeyraYjsToolbar';
import { SupabaseYjsProvider, SupabaseYjsStatus } from '../src/poc-yjs/supabaseYjsProvider';
import { YjsRemotePersistence } from '../src/poc-yjs/yjsRemotePersistence';

const USER_PROFILES = [
    { id: '1', name: 'Dispositivo Android A', color: '#8B5CF6' },
    { id: '2', name: 'Dispositivo Android B', color: '#10B981' },
    { id: '3', name: 'Tablet / Tercer Par', color: '#F59E0B' },
];

export default function PocYjsScreen() {
    const isDark = true;
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
                    />

                    <VeyraTiptapYjsEditor
                        key={roomId}
                        ref={editorARef}
                        isDark={isDark}
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
                        onReady={() => {
                            if (providerRef.current) {
                                providerRef.current.catchUpRemoteUpdates().catch(() => {});
                                const status = providerRef.current.getStatus();
                                if (status === 'CONNECTED' || status === 'SYNCED') {
                                    editorARef.current?.requestSyncStep1();
                                    editorARef.current?.broadcastAwareness();
                                }
                            }
                        }}
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
                        />

                        <VeyraTiptapYjsEditor
                            ref={editorBRef}
                            isDark={isDark}
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
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
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
