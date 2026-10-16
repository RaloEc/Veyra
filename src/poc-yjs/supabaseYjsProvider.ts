import * as Y from 'yjs';
import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { YjsLocalPersistence, base64ToBytes, bytesToBase64 } from './yjsLocalPersistence';
import { YjsRemotePersistence } from './yjsRemotePersistence';

export type SupabaseYjsStatus = 
    | 'DISCONNECTED' 
    | 'CONNECTING' 
    | 'CONNECTED' 
    | 'SYNCING' 
    | 'SYNCED' 
    | 'RECONNECTING' 
    | 'ERROR';

export type ConnectionStatus = SupabaseYjsStatus;
export type LocalPersistenceStatus = 'IDLE' | 'SAVING_LOCAL' | 'SAVED_LOCAL' | 'FAILED_LOCAL';
export type RemotePersistenceStatus = 'IDLE' | 'PENDING_REMOTE' | 'CONFIRMED_REMOTE' | 'ERROR';
export type PeerConvergenceStatus = 'INITIALIZING' | 'HANDSHAKE' | 'CONVERGED';

export interface DetailedSyncStatus {
    connection: ConnectionStatus;
    localPersistence: LocalPersistenceStatus;
    remotePersistence: RemotePersistenceStatus;
    peerConvergence: PeerConvergenceStatus;
    lastConfirmedWriteId: number;
    lastProcessedReadId: number;
    lastConfirmedServerClock: number; // Retrocompatibilidad: alias de lastProcessedReadId
    pendingLocalCount: number;
}

export interface SendUpdateResult {
    localSaved: boolean;
    remotePersisted: boolean;
    realtimeSent: boolean;
    updateId?: number;
    duplicate?: boolean;
    error?: string;
}

export interface CatchUpResult {
    success: boolean;
    appliedCount: number;
    error?: string;
}

export interface SupabaseYjsProviderOptions {
    supabase: SupabaseClient;
    documentId: string;
    clientId?: string;
    user?: {
        id?: string;
        name?: string;
        color?: string;
        role?: 'owner' | 'editor' | 'viewer';
    };
    localPersistence?: YjsLocalPersistence;
    remotePersistence?: YjsRemotePersistence;
    onStatusChange?: (status: SupabaseYjsStatus) => void;
    onDetailedStatusChange?: (status: DetailedSyncStatus) => void;
    onRemoteUpdate?: (base64Update: string) => void;
    onRemoteAwareness?: (base64Awareness: string, senderClientId?: string) => void;
    onSyncStep1Received?: (remoteSv: string, correlationId: string, isReturnHandshake?: boolean) => void;
    onPeerLeft?: (remoteClientId: string | number) => void;
    onHeartbeat?: (remoteClientId: string | number) => void;
    onError?: (err: Error) => void;
    onMetrics?: (metrics: { sent: number; received: number; lastSync: string }) => void;
}

/**
 * Proveedor de sincronización Supabase Realtime + PostgreSQL para Yjs y Tiptap (Fase B.4).
 * 
 * GARANTÍAS DE INTEGRIDAD Y SINCRONIZACIÓN:
 * 1. Separación estricta de cursores:
 *    - `lastConfirmedWriteId`: registra confirmaciones de escrituras locales.
 *    - `lastProcessedReadId`: registra la secuencia de historial efectivamente recuperada y procesada.
 *    - Escribir en PostgreSQL nunca adelanta el cursor de lectura.
 * 2. Recuperación inicial exhaustiva:
 *    - Si `lastProcessedReadId === 0`, entrega el estado si contiene snapshot O deltas aplicados.
 * 3. Protección de mensajes de pares:
 *    - Ni `YJS_UPDATE` ni `SYNC_STEP_2` declaran persistencia duradera sin confirmación de PostgreSQL.
 * 4. Bloqueo de Broadcast sin copia duradera:
 *    - Si SQLite falla o no está disponible, persiste en PostgreSQL antes de difundir.
 */
export class SupabaseYjsProvider {
    private supabase: SupabaseClient;
    private documentId: string;
    private clientId: string;
    private user: { id?: string; name?: string; color?: string; role?: 'owner' | 'editor' | 'viewer' };
    private localPersistence?: YjsLocalPersistence;
    private remotePersistence?: YjsRemotePersistence;

    private channel: RealtimeChannel | null = null;
    private status: SupabaseYjsStatus = 'DISCONNECTED';
    private localStatus: LocalPersistenceStatus = 'IDLE';
    private remoteStatus: RemotePersistenceStatus = 'IDLE';
    private peerStatus: PeerConvergenceStatus = 'INITIALIZING';

    // Separación de cursores (Fase B.4)
    private lastConfirmedWriteId = 0;
    private lastProcessedReadId = 0;

    private lastCatchUpSuccess = false;
    private isDestroyed = false;
    private connectionAttemptId = 0;

    private sentCount = 0;
    private receivedCount = 0;
    private lastSyncTime = 'Nunca';

    private awarenessHeartbeatTimer: any = null;
    private connectionWatchdogTimer: any = null;
    private reconnectTimeout: any = null;
    private subscriptionTimeout: any = null;
    private connectingStartedAt = 0;
    private isConnecting = false;
    private pendingWritesCount = 0;

    private onStatusChange?: (status: SupabaseYjsStatus) => void;
    private onDetailedStatusChange?: (status: DetailedSyncStatus) => void;
    private onRemoteUpdate?: (base64Update: string) => void;
    private onRemoteAwareness?: (base64Awareness: string, senderClientId?: string) => void;
    private onSyncStep1Received?: (remoteSv: string, correlationId: string, isReturnHandshake?: boolean) => void;
    private onPeerLeft?: (remoteClientId: string | number) => void;
    private onHeartbeat?: (remoteClientId: string | number) => void;
    private onError?: (err: Error) => void;
    private onMetrics?: (metrics: { sent: number; received: number; lastSync: string }) => void;

    constructor(options: SupabaseYjsProviderOptions) {
        this.supabase = options.supabase;
        this.documentId = options.documentId;
        this.clientId = options.clientId || `client-${Math.random().toString(36).substring(2, 9)}`;
        this.user = options.user || {
            name: `Usuario-${this.clientId.slice(-4)}`,
            color: '#8B5CF6',
            role: 'editor',
        };
        this.localPersistence = options.localPersistence;
        this.remotePersistence = options.remotePersistence;

        this.onStatusChange = options.onStatusChange;
        this.onDetailedStatusChange = options.onDetailedStatusChange;
        this.onRemoteUpdate = options.onRemoteUpdate;
        this.onRemoteAwareness = options.onRemoteAwareness;
        this.onSyncStep1Received = options.onSyncStep1Received;
        this.onPeerLeft = options.onPeerLeft;
        this.onHeartbeat = options.onHeartbeat;
        this.onError = options.onError;
        this.onMetrics = options.onMetrics;

        this.startConnectionWatchdog();
    }

    public getStatus(): SupabaseYjsStatus {
        return this.status;
    }

    public isViewer(): boolean {
        return this.user.role === 'viewer';
    }

    public getLastConfirmedWriteId(): number {
        return this.lastConfirmedWriteId;
    }

    public getLastProcessedReadId(): number {
        return this.lastProcessedReadId;
    }

    /**
     * Consulta el número de deltas locales pendientes de sincronizar.
    /**
     * Consulta el número de deltas locales pendientes de sincronizar.
     * Si no hay persistencia local SQLite, devuelve las escrituras en vuelo en memoria.
     */
    public async getPendingLocalCount(): Promise<number> {
        let count = this.pendingWritesCount;
        if (this.localPersistence) {
            try {
                const pending = await this.localPersistence.getPendingLocalUpdates(this.documentId);
                count += pending.length;
            } catch (err) {
                console.warn('[PoC Yjs] Error consultando deltas locales pendientes en SQLite:', err);
            }
        }
        return count;
    }

    public setSynced(): void {
        console.log('[PoC Yjs State] [SET_SYNCED] Invocado explícitamente desde confirmación de editor');
        this.checkAndSetSynced();
    }

    public async getDetailedStatus(): Promise<DetailedSyncStatus> {
        let pendingCount = 0;
        try {
            pendingCount = await this.getPendingLocalCount();
        } catch {
            pendingCount = this.pendingWritesCount;
        }

        return {
            connection: this.status,
            localPersistence: this.localStatus,
            remotePersistence: this.remoteStatus,
            peerConvergence: this.peerStatus,
            lastConfirmedWriteId: this.lastConfirmedWriteId,
            lastProcessedReadId: this.lastProcessedReadId,
            lastConfirmedServerClock: this.lastProcessedReadId, // alias
            pendingLocalCount: pendingCount,
        };
    }

    public getClientId(): string {
        return this.clientId;
    }

    public async reconnect() {
        if (this.isDestroyed) return;
        if (this.isConnecting) {
            console.log('[PoC Yjs] Omitiendo llamada a reconnect(): conexión ya en proceso');
            return;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        // Restablecer de inmediato el estado de recuperación para no heredar SYNCED prematuramente
        this.lastCatchUpSuccess = false;
        this.updateStatus('RECONNECTING');
        await this.connect();
    }

    private updateStatus(newStatus: SupabaseYjsStatus) {
        if (this.status !== newStatus) {
            this.status = newStatus;
            this.onStatusChange?.(newStatus);
            this.notifyDetailedStatus();
        }
    }

    private updatePersistenceStatus(local: LocalPersistenceStatus, remote?: RemotePersistenceStatus) {
        this.localStatus = local;
        if (remote) this.remoteStatus = remote;
        this.notifyDetailedStatus();
    }

    private notifyDetailedStatus() {
        if (this.onDetailedStatusChange) {
            this.getDetailedStatus().then((s) => this.onDetailedStatusChange?.(s)).catch(() => {});
        }
    }

    private updateMetrics(lastEvent: string) {
        this.lastSyncTime = new Date().toLocaleTimeString();
        this.onMetrics?.({
            sent: this.sentCount,
            received: this.receivedCount,
            lastSync: `${this.lastSyncTime} (${lastEvent})`,
        });
    }

    private purgeLingeringChannel(channelName: string) {
        const topic = `realtime:${channelName}`;
        try {
            const realtime = (this.supabase as any).realtime;
            if (realtime && Array.isArray(realtime.channels)) {
                realtime.channels = realtime.channels.filter((c: any) => c.topic !== topic);
            }
        } catch (e) {}
    }

    private async teardownChannelAsync(): Promise<void> {
        this.stopAwarenessHeartbeat();
        if (this.subscriptionTimeout) {
            clearTimeout(this.subscriptionTimeout);
            this.subscriptionTimeout = null;
        }

        const oldChannel = this.channel;
        this.channel = null;

        if (oldChannel) {
            try {
                await oldChannel.untrack?.();
            } catch (e) {}
            try {
                await this.supabase.removeChannel(oldChannel);
            } catch (e) {}
        }

        if (this.documentId) {
            this.purgeLingeringChannel(`note_yjs_${this.documentId}`);
        }
    }

    /**
     * Inicia la suscripción al canal privado con autorización RLS.
     * Restablece el estado de recuperación para evitar reutilizar éxitos anteriores.
     */
    public async connect(): Promise<void> {
        if (this.isDestroyed) return;
        if (this.isConnecting) {
            console.log('[PoC Yjs] connect() ya en ejecución, omitiendo llamada redundante');
            return;
        }
        if (!this.documentId || this.documentId.trim() === '') {
            this.updateStatus('DISCONNECTED');
            return;
        }

        this.isConnecting = true;
        const currentAttempt = ++this.connectionAttemptId;

        // REGLA FASE B.4: Restablecer estado de catch-up al comenzar cualquier nueva conexión
        this.lastCatchUpSuccess = false;

        if (this.subscriptionTimeout) {
            clearTimeout(this.subscriptionTimeout);
            this.subscriptionTimeout = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        this.connectingStartedAt = Date.now();
        this.updateStatus('CONNECTING');

        const channelName = `note_yjs_${this.documentId.trim()}`;

        // Diagnóstico previo: sesión autenticada y preparación del canal
        try {
            const { data: sessionData, error: sessionErr } = await this.supabase.auth.getSession();
            const hasSession = Boolean(sessionData?.session);
            const userId = sessionData?.session?.user?.id || null;
            const expiresAt = sessionData?.session?.expires_at;
            const isExpired = expiresAt ? (Date.now() / 1000 > expiresAt) : false;
            const realtimeHasToken = Boolean((this.supabase as any).realtime?.accessTokenValue || (this.supabase as any).realtime?.accessToken);

            console.log('[PoC Yjs Auth Diagnostic]', {
                hasSession,
                userId: userId || 'NO_AUTH_USER',
                isExpired,
                authError: sessionErr ? sessionErr.message : null,
                realtimeHasToken,
                channelName,
                isPrivate: true,
                clientId: this.clientId,
            });
        } catch (diagErr: any) {
            console.warn('[PoC Yjs Auth Diagnostic] Error comprobando sesión:', diagErr.message);
        }

        await this.teardownChannelAsync();
        if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) {
            this.isConnecting = false;
            return;
        }

        try {
            const realtime = (this.supabase as any).realtime;
            if (realtime) {
                if (realtime.isDisconnecting?.()) {
                    await new Promise((resolve) => setTimeout(resolve, 150));
                }
                if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) {
                    this.isConnecting = false;
                    return;
                }

                this.purgeLingeringChannel(channelName);

                if (!realtime.isConnected?.() && !realtime.isConnecting?.()) {
                    realtime.connect?.();
                }
            }
        } catch (e) {
            console.warn('[PoC Yjs] Error preparando socket Realtime:', e);
        }

        if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) {
            this.isConnecting = false;
            return;
        }

        // Canal estrictamente privado (valida RLS en realtime.messages)
        this.channel = this.supabase.channel(channelName, {
            config: {
                private: true,
                broadcast: {
                    self: false,
                    ack: false,
                },
                presence: {
                    key: this.clientId,
                },
            },
        });

        // 1. Recepción de deltas por Realtime
        this.channel.on('broadcast', { event: 'YJS_UPDATE' }, async ({ payload }) => {
            if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;
            if (!payload || payload.senderClientId === this.clientId) return;

            if (typeof payload.update === 'string') {
                this.receivedCount++;
                this.updateMetrics('Delta');

                // Si el usuario es viewer, solo aplica a memoria; no intenta escribir a PostgreSQL
                if (this.isViewer()) {
                    this.onRemoteUpdate?.(payload.update);
                    return;
                }

                // Si el usuario es editor/owner, rescata en SQLite con synced = 0
                if (this.localPersistence) {
                    try {
                        const localId = await this.localPersistence.storeUpdate(
                            this.documentId,
                            base64ToBytes(payload.update),
                            false // synced = 0 (provisional)
                        );
                        this.updatePersistenceStatus('SAVED_LOCAL', 'PENDING_REMOTE');

                        // Intentar confirmar en PostgreSQL de fondo
                        if (this.remotePersistence && localId) {
                            this.remotePersistence.saveRemoteUpdate(
                                this.documentId,
                                payload.update,
                                this.clientId
                            ).then((res) => {
                                if (res.success && this.localPersistence) {
                                    this.localPersistence.markUpdatesAsSynced([localId]).catch(() => {});
                                    this.updatePersistenceStatus('SAVED_LOCAL', 'CONFIRMED_REMOTE');
                                } else if (!res.success) {
                                    console.warn('[PoC Yjs] Rescate remoto rechazado:', res.error);
                                    this.updatePersistenceStatus('SAVED_LOCAL', 'ERROR');
                                }
                            }).catch((err) => {
                                console.warn('[PoC Yjs] Excepción en rescate remoto:', err);
                                this.updatePersistenceStatus('SAVED_LOCAL', 'ERROR');
                            });
                        }
                    } catch (e) {
                        console.warn('[PoC Yjs] Error registrando delta recibido en SQLite:', e);
                        if (this.remotePersistence) {
                            this.remotePersistence.saveRemoteUpdate(
                                this.documentId,
                                payload.update,
                                this.clientId
                            ).catch(() => {});
                        }
                    }
                } else if (this.remotePersistence) {
                    this.remotePersistence.saveRemoteUpdate(
                        this.documentId,
                        payload.update,
                        this.clientId
                    ).catch(() => {});
                }

                this.onRemoteUpdate?.(payload.update);
            }
        });

        // 2. Awareness (cursores)
        this.channel.on('broadcast', { event: 'AWARENESS_UPDATE' }, ({ payload }) => {
            if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;
            if (!payload || payload.senderClientId === this.clientId) return;
            if (typeof payload.update === 'string') {
                this.onRemoteAwareness?.(payload.update, payload.senderClientId);
            }
        });

        // 3. Handshake Paso 1
        this.channel.on('broadcast', { event: 'SYNC_STEP_1' }, ({ payload }) => {
            if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;
            if (!payload || payload.senderClientId === this.clientId) return;
            if (typeof payload.sv === 'string') {
                this.receivedCount++;
                this.updateMetrics('Handshake 1');
                this.peerStatus = 'HANDSHAKE';
                if (this.status !== 'SYNCED') {
                    this.updateStatus('SYNCING');
                }
                this.onSyncStep1Received?.(
                    payload.sv,
                    payload.senderClientId,
                    Boolean(payload.isReturnHandshake)
                );
            }
        });

        // 4. Handshake Paso 2
        this.channel.on('broadcast', { event: 'SYNC_STEP_2' }, async ({ payload }) => {
            if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;
            if (!payload || payload.senderClientId === this.clientId) return;
            if (payload.targetClientId && payload.targetClientId !== this.clientId) return;

            if (typeof payload.update === 'string') {
                this.receivedCount++;
                this.updateMetrics('Handshake 2');

                // Si es viewer, solo aplica a memoria
                if (this.isViewer()) {
                    this.onRemoteUpdate?.(payload.update);
                    this.peerStatus = 'CONVERGED';
                    return;
                }

                // Si es editor, rescata el delta localmente (synced = 0) e intenta persistencia remota
                if (this.localPersistence) {
                    try {
                        const localId = await this.localPersistence.storeUpdate(
                            this.documentId,
                            base64ToBytes(payload.update),
                            false
                        );
                        this.updatePersistenceStatus('SAVED_LOCAL', 'PENDING_REMOTE');

                        if (this.remotePersistence && localId) {
                            this.remotePersistence.saveRemoteUpdate(
                                this.documentId,
                                payload.update,
                                this.clientId
                            ).then((res) => {
                                if (res.success && this.localPersistence) {
                                    this.localPersistence.markUpdatesAsSynced([localId]).catch(() => {});
                                    this.updatePersistenceStatus('SAVED_LOCAL', 'CONFIRMED_REMOTE');
                                }
                            }).catch(() => {});
                        }
                    } catch (e) {
                        console.warn('[PoC Yjs] Error en rescate de SYNC_STEP_2:', e);
                    }
                }

                this.onRemoteUpdate?.(payload.update);
                this.peerStatus = 'CONVERGED';
                // NO llamar checkAndSetSynced() automáticamente: la persistencia duradera aún está pendiente
            }
        });

        // 5. Salida de par
        this.channel.on('broadcast', { event: 'PEER_LEFT' }, ({ payload }) => {
            if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;
            if (!payload || payload.senderClientId === this.clientId) return;
            this.onPeerLeft?.(payload.senderClientId);
        });

        // 6. Heartbeat
        this.channel.on('broadcast', { event: 'HEARTBEAT' }, ({ payload }) => {
            if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;
            if (!payload || payload.senderClientId === this.clientId) return;
            this.onHeartbeat?.(payload.senderClientId);
        });

        // Timeout de seguridad en suscripción (20s)
        this.subscriptionTimeout = setTimeout(() => {
            if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;
            this.isConnecting = false;
            if (this.status === 'CONNECTING' || this.status === 'RECONNECTING') {
                console.warn('[PoC Yjs] Timeout de suscripción a canal privado');
                this.updateStatus('ERROR');
                this.scheduleReconnect(3000);
            }
        }, 20000);

        // Suscripción al canal con captura detallada de estado y errores
        this.channel.subscribe(async (status, err) => {
            if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;
            this.isConnecting = false;
            if (this.subscriptionTimeout) {
                clearTimeout(this.subscriptionTimeout);
                this.subscriptionTimeout = null;
            }

            if (status === 'SUBSCRIBED') {
                this.updateStatus('CONNECTED');
                this.startAwarenessHeartbeat();
                this.channel?.track({
                    clientId: this.clientId,
                    user: this.user,
                    onlineAt: Date.now(),
                }).catch?.(() => {});

                // REGLA FASE B.4: Coordinación estricta en reconexión
                try {
                    const catchUpRes = await this.catchUpRemoteUpdates();
                    if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;

                    if (!catchUpRes.success) {
                        console.warn('[PoC Yjs] Catch-up falló durante suscripción:', catchUpRes.error);
                        return;
                    }

                    let flushed = 0;
                    if (!this.isViewer()) {
                        flushed = await this.flushPendingLocalUpdates();
                    }

                    console.log(`[PoC Yjs] Conectado: ${catchUpRes.appliedCount} remotos aplicados, ${flushed} locales confirmados.`);
                    await this.checkAndSetSynced();
                } catch (e) {
                    console.warn('[PoC Yjs] Error durante reconciliación coordinada:', e);
                }
            } else if (status === 'CLOSED') {
                this.updateStatus('DISCONNECTED');
                this.scheduleReconnect(2000);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                this.updateStatus('ERROR');
                const errObj = err as any;
                console.warn(`[PoC Yjs Channel] Evento de suscripción con error (${status}):`, {
                    channelName,
                    status,
                    error: err,
                    message: errObj?.message || (typeof err === 'string' ? err : 'Sin mensaje'),
                    code: errObj?.code,
                    statusProp: errObj?.status,
                    name: errObj?.name,
                    reason: errObj?.reason,
                    rawError: err ? (typeof err === 'object' ? JSON.stringify(err) : String(err)) : null,
                });
                const detailedError = err instanceof Error
                    ? err
                    : new Error(`Error en canal Supabase Realtime: ${status}${err ? ' - ' + (errObj?.message || JSON.stringify(err)) : ''}`);
                this.onError?.(detailedError);
                this.scheduleReconnect(3000);
            }
        });
    }

    /**
     * Envía una actualización delta de Yjs garantizando durabilidad.
     * 
     * REGLAS DE CURSOR Y DIFUSIÓN (FASE B.4):
     * 1. Las escrituras confirmadas actualizan `lastConfirmedWriteId`, NUNCA `lastProcessedReadId`.
     * 2. Si SQLite local falla o no está configurado, persiste en PostgreSQL ANTES de cualquier Broadcast.
     * 3. Si no hay copia duradera garantizada (local o remota), aborta con error y no difunde.
     */
    public async sendUpdate(base64Update: string): Promise<SendUpdateResult> {
        if (this.isViewer()) {
            return {
                localSaved: false,
                remotePersisted: false,
                realtimeSent: false,
                error: 'Permiso denegado: el usuario viewer no puede realizar modificaciones',
            };
        }

        let localRowId: number | undefined;
        let localSaved = false;
        let remotePersisted = false;
        let realtimeSent = false;
        let updateId: number | undefined;
        let isDuplicate = false;
        let errorMsg: string | undefined;

        this.pendingWritesCount++;
        this.updateStatus('SYNCING');
        console.log(`[PoC Yjs Diagnostic] [UPDATE_GENERATED] Delta local generado (${base64Update.length} chars base64). Pendientes en vuelo: ${this.pendingWritesCount}`);

        // 1. Intentar persistencia local duradera en SQLite si está disponible
        if (this.localPersistence) {
            try {
                localRowId = await this.localPersistence.storeUpdate(
                    this.documentId,
                    base64ToBytes(base64Update),
                    false // synced = 0
                );
                localSaved = true;
                this.updatePersistenceStatus('SAVED_LOCAL', 'PENDING_REMOTE');
            } catch (err: any) {
                localSaved = false;
                errorMsg = `Error persistencia local SQLite: ${err.message}`;
                this.updatePersistenceStatus('FAILED_LOCAL');
                console.warn('[PoC Yjs]', errorMsg);
            }
        }

        // 2. Si no se obtuvo guardado local (por error o porque localPersistence no está configurado)
        // se intenta persistencia remota de inmediato antes de cualquier difusión por Realtime.
        if (!localSaved) {
            if (this.remotePersistence) {
                try {
                    console.log(`[PoC Yjs Diagnostic] [UPDATE_SENDING] Enviando delta a PostgreSQL (append_note_yjs_update)...`);
                    const res = await this.remotePersistence.saveRemoteUpdate(
                        this.documentId,
                        base64Update,
                        this.clientId
                    );
                    if (res.success) {
                        remotePersisted = true;
                        updateId = res.updateId;
                        isDuplicate = Boolean(res.duplicate);
                        if (updateId && updateId > this.lastConfirmedWriteId) {
                            this.lastConfirmedWriteId = updateId;
                        }
                        this.updatePersistenceStatus('IDLE', 'CONFIRMED_REMOTE');
                        console.log(`[PoC Yjs Diagnostic] [UPDATE_CONFIRMED] Delta confirmado en PostgreSQL (id=${res.updateId}, duplicate=${Boolean(res.duplicate)})`);
                    } else {
                        this.pendingWritesCount = Math.max(0, this.pendingWritesCount - 1);
                        this.updateStatus('ERROR');
                        console.warn(`[PoC Yjs Diagnostic] [UPDATE_FAILED] Persistencia rechazada: ${res.error}`);
                        this.onError?.(new Error(res.error || 'Rechazo de persistencia remota'));
                        return {
                            localSaved: false,
                            remotePersisted: false,
                            realtimeSent: false,
                            error: `Fallo de durabilidad: sin almacenamiento local y persistencia remota rechazada (${res.error || 'error desconocido'})`,
                        };
                    }
                } catch (rErr: any) {
                    this.pendingWritesCount = Math.max(0, this.pendingWritesCount - 1);
                    this.updateStatus('ERROR');
                    console.warn(`[PoC Yjs Diagnostic] [UPDATE_FAILED] Excepción persistiendo en PostgreSQL: ${rErr.message}`);
                    this.onError?.(rErr);
                    return {
                        localSaved: false,
                        remotePersisted: false,
                        realtimeSent: false,
                        error: `Fallo de durabilidad: sin almacenamiento local y persistencia remota falló: ${rErr.message}`,
                    };
                }
            } else {
                this.pendingWritesCount = Math.max(0, this.pendingWritesCount - 1);
                this.updateStatus('ERROR');
                return {
                    localSaved: false,
                    remotePersisted: false,
                    realtimeSent: false,
                    error: errorMsg || 'No hay ninguna capa de persistencia duradera configurada',
                };
            }
        }

        // 3. Difundir vía Realtime: garantizado que existe al menos una copia duradera (local o remota)
        if (this.channel && (this.status === 'CONNECTED' || this.status === 'SYNCING' || this.status === 'SYNCED')) {
            try {
                const resp = await this.channel.send({
                    type: 'broadcast',
                    event: 'YJS_UPDATE',
                    payload: {
                        senderClientId: this.clientId,
                        senderUserId: this.user.id,
                        update: base64Update,
                        timestamp: Date.now(),
                    },
                });

                if (resp === 'ok') {
                    realtimeSent = true;
                    this.sentCount++;
                    this.updateMetrics('Envío Delta');
                }
            } catch (err: any) {
                this.onError?.(err);
            }
        }

        // 4. Si el delta se guardó localmente pero aún no se persistió remotamente, guardar en PostgreSQL
        if (localSaved && this.remotePersistence && !remotePersisted) {
            try {
                const res = await this.remotePersistence.saveRemoteUpdate(
                    this.documentId,
                    base64Update,
                    this.clientId
                );

                if (res.success) {
                    remotePersisted = true;
                    updateId = res.updateId;
                    isDuplicate = Boolean(res.duplicate);

                    // Actualizar cursor de ESCRITURA (NUNCA el cursor de LECTURA)
                    if (updateId && updateId > this.lastConfirmedWriteId) {
                        this.lastConfirmedWriteId = updateId;
                    }

                    // Confirmado por Postgres: marcar synced=1 en SQLite
                    if (localRowId !== undefined && this.localPersistence) {
                        await this.localPersistence.markUpdatesAsSynced([localRowId]);
                    }
                    this.updatePersistenceStatus('SAVED_LOCAL', 'CONFIRMED_REMOTE');
                    console.log(`[PoC Yjs Diagnostic] [UPDATE_CONFIRMED] Delta confirmado en PostgreSQL (id=${res.updateId})`);
                } else {
                    errorMsg = res.error || 'Servidor rechazó persistencia remota';
                    this.updatePersistenceStatus('SAVED_LOCAL', 'ERROR');
                    this.updateStatus('ERROR');
                    console.warn(`[PoC Yjs Diagnostic] [UPDATE_FAILED] Servidor rechazó persistencia: ${errorMsg}`);
                }
            } catch (err: any) {
                errorMsg = err.message || 'Excepción persistiendo en PostgreSQL';
                this.updatePersistenceStatus('SAVED_LOCAL', 'ERROR');
                this.updateStatus('ERROR');
                console.warn(`[PoC Yjs Diagnostic] [UPDATE_FAILED] Excepción persistiendo: ${errorMsg}`);
            }
        }

        // Decrementar escrituras en vuelo y evaluar convergencia si no hay trabajo pendiente
        if (remotePersisted || localSaved) {
            this.pendingWritesCount = Math.max(0, this.pendingWritesCount - 1);
            console.log(`[PoC Yjs Diagnostic] [UPDATE_PENDING_REDUCED] Operación completada. Pendientes restantes: ${this.pendingWritesCount}`);
            if (this.pendingWritesCount === 0) {
                await this.checkAndSetSynced();
            }
        }

        return {
            localSaved,
            remotePersisted,
            realtimeSent,
            updateId,
            duplicate: isDuplicate,
            error: errorMsg,
        };
    }

    /**
     * Vacía a PostgreSQL remoto los deltas locales registrados en SQLite con synced = 0.
     * Actualiza lastConfirmedWriteId, NUNCA lastProcessedReadId.
     */
    public async flushPendingLocalUpdates(): Promise<number> {
        if (!this.localPersistence || !this.remotePersistence || this.isViewer()) return 0;
        let syncedCount = 0;

        try {
            const pending = await this.localPersistence.getPendingLocalUpdates(this.documentId);
            for (const item of pending) {
                const res = await this.remotePersistence.saveRemoteUpdate(
                    this.documentId,
                    item.updateData,
                    this.clientId
                );

                if (res.success) {
                    await this.localPersistence.markUpdatesAsSynced([item.id]);
                    syncedCount++;
                    if (res.updateId && res.updateId > this.lastConfirmedWriteId) {
                        this.lastConfirmedWriteId = res.updateId;
                    }
                } else {
                    console.warn(`[PoC Yjs] Falló subida de delta local ${item.id}:`, res.error);
                    break;
                }
            }
        } catch (err) {
            console.warn('[PoC Yjs] Error en flushPendingLocalUpdates:', err);
        }

        return syncedCount;
    }

    /**
     * Recupera deltas de PostgreSQL acumulados.
     * 
     * GARANTÍAS DE RECUPERACIÓN (FASE B.4):
     * 1. Si `lastProcessedReadId === 0` (arranque inicial o pérdida de estado local),
     *    realiza fetchDocument y entrega el estado al editor si contiene snapshot O deltas.
     * 2. Si el puente con el editor lanza error, NO se declara éxito y NO se avanza el cursor.
     * 3. Avanza `lastProcessedReadId` únicamente hasta el último ID efectivamente recuperado y procesado.
     */
    public async catchUpRemoteUpdates(): Promise<CatchUpResult> {
        if (!this.remotePersistence) {
            this.lastCatchUpSuccess = false;
            return {
                success: false,
                appliedCount: 0,
                error: 'Persistencia remota no configurada',
            };
        }

        let applied = 0;
        this.updateStatus('SYNCING');
        console.log('[PoC Yjs State] [CATCHUP_START] Iniciando recuperación de actualizaciones remotas desde cursor', this.lastProcessedReadId);

        try {
            // Caso 1: Recuperación inicial o cliente sin cursor previo de lectura (lastProcessedReadId === 0)
            if (this.lastProcessedReadId === 0) {
                const fetchRes = await this.remotePersistence.fetchDocument(this.documentId);
                applied = fetchRes.appliedUpdatesCount;

                // REGLA FASE B.4: Entregar el estado completo si hay snapshot O si hay deltas aplicados
                if (fetchRes.hasSnapshot || applied > 0) {
                    const fullState = Y.encodeStateAsUpdate(fetchRes.doc);
                    // Comprobación de puente seguro: si el callback lanza error, se aborta la recuperación
                    this.onRemoteUpdate?.(bytesToBase64(fullState));
                }

                if (this.localPersistence && (fetchRes.hasSnapshot || applied > 0)) {
                    await this.localPersistence.compact(this.documentId, fetchRes.doc);
                }

                // Avanza el cursor de LECTURA solo al ID efectivamente recuperado y procesado
                if (fetchRes.maxUpdateId > this.lastProcessedReadId) {
                    this.lastProcessedReadId = fetchRes.maxUpdateId;
                }

                this.lastCatchUpSuccess = true;
                console.log(`[PoC Yjs State] [CATCHUP_SUCCESS] Inicial completado (${applied} deltas aplicados, maxId=${fetchRes.maxUpdateId})`);
                await this.checkAndSetSynced();
                return {
                    success: true,
                    appliedCount: applied,
                };
            }

            // Caso 2: Cliente con cursor previo de lectura (lastProcessedReadId > 0)
            const { updates, maxUpdateId } = await this.remotePersistence.fetchUpdatesSince(
                this.documentId,
                this.lastProcessedReadId
            );

            for (const upd of updates) {
                this.receivedCount++;
                this.onRemoteUpdate?.(upd.update_data);
                applied++;

                if (this.localPersistence) {
                    await this.localPersistence.storeUpdate(
                        this.documentId,
                        base64ToBytes(upd.update_data),
                        true // ya confirmado en PostgreSQL
                    );
                }
            }

            if (maxUpdateId > this.lastProcessedReadId) {
                this.lastProcessedReadId = maxUpdateId;
            }

            this.lastCatchUpSuccess = true;
            console.log(`[PoC Yjs State] [CATCHUP_SUCCESS] Incremental completado (${applied} deltas aplicados, maxId=${maxUpdateId})`);
            await this.checkAndSetSynced();
            return {
                success: true,
                appliedCount: applied,
            };
        } catch (err: any) {
            this.lastCatchUpSuccess = false;
            console.warn('[PoC Yjs State] [CATCHUP_FAILED] Error en catchUpRemoteUpdates:', err);
            this.updateStatus('ERROR');
            this.onError?.(err instanceof Error ? err : new Error(String(err)));
            return {
                success: false,
                appliedCount: applied,
                error: err.message || 'Error en recuperación remota',
            };
        }
    }

    /**
     * Comprueba todas las precondiciones necesarias antes de declarar SYNCED:
     * 1. Conexión activa (CONNECTED o SYNCING).
     * 2. Al menos una capa de persistencia duradera configurada.
     * 3. Última recuperación remota (`catchUpRemoteUpdates`) ejecutada exitosamente.
     * 4. Sin operaciones de escritura en vuelo en memoria (pendingWritesCount === 0).
     * 5. Sin deltas locales pendientes de sincronizar en SQLite (si está disponible).
     */
    public async checkAndSetSynced(): Promise<boolean> {
        if (this.status !== 'CONNECTED' && this.status !== 'SYNCING') return false;

        // Debe existir al menos una capa de persistencia duradera
        if (!this.remotePersistence && !this.localPersistence) {
            return false;
        }

        // El catch-up remoto debe haber culminado exitosamente
        if (!this.lastCatchUpSuccess) {
            return false;
        }

        // Sin escrituras en vuelo en memoria
        if (this.pendingWritesCount > 0) {
            console.log(`[PoC Yjs State] checkAndSetSynced: aún hay ${this.pendingWritesCount} escrituras pendientes en vuelo`);
            return false;
        }

        // Sin estados pendientes de persistencia
        if (this.localStatus === 'SAVING_LOCAL' || this.remoteStatus === 'PENDING_REMOTE') {
            return false;
        }

        // Si hay persistencia local SQLite, verificar que no queden deltas con synced = 0
        if (this.localPersistence) {
            try {
                const pending = await this.localPersistence.getPendingLocalUpdates(this.documentId);
                if (pending.length > 0) {
                    console.log(`[PoC Yjs State] checkAndSetSynced: SQLite tiene ${pending.length} deltas pendientes`);
                    return false;
                }
            } catch {
                return false;
            }
        }

        console.log('[PoC Yjs State] [STATE_TRANSITION] -> SYNCED (Todas las actualizaciones persistidas, sin deltas pendientes)');
        this.updateStatus('SYNCED');
        return true;
    }

    /**
     * Restaura el documento remotamente cargando el snapshot y los deltas posteriores.
     */
    public async restoreFromRemote(targetDoc?: Y.Doc): Promise<Y.Doc | null> {
        if (!this.remotePersistence) return null;
        try {
            const fetchRes = await this.remotePersistence.fetchDocument(this.documentId, targetDoc);

            if (fetchRes.maxUpdateId > this.lastProcessedReadId) {
                this.lastProcessedReadId = fetchRes.maxUpdateId;
            }

            if (this.localPersistence && (fetchRes.hasSnapshot || fetchRes.appliedUpdatesCount > 0)) {
                await this.localPersistence.compact(this.documentId, fetchRes.doc);
            }

            this.lastCatchUpSuccess = true;
            return fetchRes.doc;
        } catch (err) {
            this.lastCatchUpSuccess = false;
            console.error('[PoC Yjs] Error restaurando desde remoto:', err);
            return null;
        }
    }

    /**
     * En Fase B.4, la compactación remota no verificable está deshabilitada.
     */
    public async compactRemote(_doc: Y.Doc): Promise<{ success: boolean; error?: string }> {
        return {
            success: false,
            error: 'Compactación remota deshabilitada en Fase B.4: el log de deltas es la fuente de verdad autoritativa',
        };
    }

    public async sendAwareness(base64Awareness: string): Promise<boolean> {
        if (!this.channel || (this.status !== 'CONNECTED' && this.status !== 'SYNCING' && this.status !== 'SYNCED')) return false;

        try {
            await this.channel.send({
                type: 'broadcast',
                event: 'AWARENESS_UPDATE',
                payload: {
                    senderClientId: this.clientId,
                    senderUserId: this.user.id,
                    update: base64Awareness,
                    timestamp: Date.now(),
                },
            });
            return true;
        } catch {
            return false;
        }
    }

    public async sendSyncStep1(base64Sv: string, isReturnHandshake = false, correlationId?: string | null): Promise<boolean> {
        if (!this.channel || (this.status !== 'CONNECTED' && this.status !== 'SYNCING' && this.status !== 'SYNCED')) return false;

        this.peerStatus = 'HANDSHAKE';
        if (this.pendingWritesCount > 0) {
            this.updateStatus('SYNCING');
        }
        try {
            const resp = await this.channel.send({
                type: 'broadcast',
                event: 'SYNC_STEP_1',
                payload: {
                    senderClientId: this.clientId,
                    sv: base64Sv,
                    isReturnHandshake,
                    correlationId: correlationId || null,
                    timestamp: Date.now(),
                },
            });
            if (resp === 'ok') {
                this.sentCount++;
                this.updateMetrics(isReturnHandshake ? 'Retorno Handshake 1' : 'Envío Handshake 1');
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    public async sendSyncStep2(base64Update: string, targetClientId?: string | null): Promise<boolean> {
        if (this.isViewer()) return false;
        if (!this.channel || (this.status !== 'CONNECTED' && this.status !== 'SYNCING' && this.status !== 'SYNCED')) return false;

        try {
            const resp = await this.channel.send({
                type: 'broadcast',
                event: 'SYNC_STEP_2',
                payload: {
                    senderClientId: this.clientId,
                    targetClientId: targetClientId || null,
                    update: base64Update,
                    timestamp: Date.now(),
                },
            });
            if (resp === 'ok') {
                this.sentCount++;
                this.updateMetrics('Envío Handshake 2');
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    public async sendPeerLeft(): Promise<boolean> {
        if (!this.channel) return false;
        try {
            this.channel.untrack?.().catch?.(() => {});
            this.channel.send({
                type: 'broadcast',
                event: 'PEER_LEFT',
                payload: {
                    senderClientId: this.clientId,
                    timestamp: Date.now(),
                },
            }).catch?.(() => {});
            return true;
        } catch {
            return false;
        }
    }

    private startAwarenessHeartbeat() {
        this.stopAwarenessHeartbeat();
        this.awarenessHeartbeatTimer = setInterval(() => {
            if ((this.status === 'CONNECTED' || this.status === 'SYNCED') && this.channel) {
                this.channel.send({
                    type: 'broadcast',
                    event: 'HEARTBEAT',
                    payload: {
                        senderClientId: this.clientId,
                        timestamp: Date.now(),
                    },
                }).catch?.(() => {});
            }
        }, 1500);
    }

    private stopAwarenessHeartbeat() {
        if (this.awarenessHeartbeatTimer) {
            clearInterval(this.awarenessHeartbeatTimer);
            this.awarenessHeartbeatTimer = null;
        }
    }

    private startConnectionWatchdog() {
        this.stopConnectionWatchdog();
        this.connectionWatchdogTimer = setInterval(() => {
            if (this.isDestroyed) return;
            const now = Date.now();
            const isStuckConnecting = (this.status === 'CONNECTING' || this.status === 'RECONNECTING') && (now - this.connectingStartedAt > 12000);

            // Evitar reconexiones duplicadas si ya hay una conexión o reconexión en curso o programada
            if (this.isConnecting) {
                console.log('[PoC Yjs Watchdog] Omitiendo verificación: conexión actualmente en proceso');
                return;
            }
            if (this.reconnectTimeout) {
                console.log('[PoC Yjs Watchdog] Omitiendo verificación: reconexión diferida ya programada');
                return;
            }

            if (this.status === 'DISCONNECTED' || this.status === 'ERROR' || isStuckConnecting) {
                console.log(`[PoC Yjs Watchdog] Reactivando conexión (estado: ${this.status}, stuck: ${isStuckConnecting})`);
                this.reconnect();
            }
        }, 5000);
    }

    private stopConnectionWatchdog() {
        if (this.connectionWatchdogTimer) {
            clearInterval(this.connectionWatchdogTimer);
            this.connectionWatchdogTimer = null;
        }
    }

    private scheduleReconnect(delayMs = 2000) {
        if (this.reconnectTimeout || this.isDestroyed) return;
        this.updateStatus('RECONNECTING');
        this.reconnectTimeout = setTimeout(async () => {
            this.reconnectTimeout = null;
            if (!this.isDestroyed && this.status !== 'CONNECTED' && this.status !== 'SYNCED') {
                await this.reconnect();
            }
        }, delayMs);
    }

    public destroy() {
        this.isDestroyed = true;
        this.isConnecting = false;
        this.connectionAttemptId++;
        this.stopAwarenessHeartbeat();
        this.stopConnectionWatchdog();

        if (this.subscriptionTimeout) {
            clearTimeout(this.subscriptionTimeout);
            this.subscriptionTimeout = null;
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.channel) {
            const oldChannel = this.channel;
            this.channel = null;
            oldChannel.send({
                type: 'broadcast',
                event: 'PEER_LEFT',
                payload: {
                    senderClientId: this.clientId,
                    timestamp: Date.now(),
                },
            }).catch(() => {}).finally(() => {
                oldChannel.untrack?.().catch(() => {});
                this.supabase.removeChannel(oldChannel).catch(() => {});
            });
        }

        if (this.documentId) {
            this.purgeLingeringChannel(`note_yjs_${this.documentId}`);
        }

        this.updateStatus('DISCONNECTED');
    }
}
