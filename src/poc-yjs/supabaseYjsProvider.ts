import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export type SupabaseYjsStatus = 
    | 'DISCONNECTED' 
    | 'CONNECTING' 
    | 'CONNECTED' 
    | 'SYNCING' 
    | 'SYNCED' 
    | 'RECONNECTING' 
    | 'ERROR';

export interface SupabaseYjsProviderOptions {
    supabase: SupabaseClient;
    documentId: string;
    clientId?: string;
    user?: {
        id?: string;
        name?: string;
        color?: string;
    };
    onStatusChange?: (status: SupabaseYjsStatus) => void;
    onRemoteUpdate?: (base64Update: string) => void;
    onRemoteAwareness?: (base64Awareness: string) => void;
    onSyncStep1Received?: (remoteSv: string, correlationId: string, isReturnHandshake?: boolean) => void;
    onPeerLeft?: (remoteClientId: string | number) => void;
    onHeartbeat?: (remoteClientId: string | number) => void;
    onError?: (err: Error) => void;
    onMetrics?: (metrics: { sent: number; received: number; lastSync: string }) => void;
}

/**
 * Proveedor de sincronización Supabase Realtime para Yjs y Tiptap.
 * 
 * Gestiona:
 * - Ciclo de vida del canal (`note_yjs_${documentId}`)
 * - Handshake bidireccional de recuperación de estado (SYNC_STEP_1 y SYNC_STEP_2)
 * - Retransmisión de deltas binarios en Base64
 * - Protocolo Awareness para presencia de cursores y expiración TTL rápida
 * - Reconexión automática resiliente con auto-recuperación de socket
 * - Presencia y detección de desconexiones abruptas por eventos del servidor
 * - Prevención de bucles de eco mediante `senderClientId`
 * - Limpieza integral de canales y timers en `destroy()`
 */
export class SupabaseYjsProvider {
    private supabase: SupabaseClient;
    private documentId: string;
    private clientId: string;
    private user: { id?: string; name?: string; color?: string };

    private channel: RealtimeChannel | null = null;
    private status: SupabaseYjsStatus = 'DISCONNECTED';
    private isDestroyed = false;
    private connectionAttemptId = 0;

    private sentCount = 0;
    private receivedCount = 0;
    private lastSyncTime = 'Nunca';

    private awarenessHeartbeatTimer: any = null;
    private connectionWatchdogTimer: any = null;
    private reconnectTimeout: any = null;
    private subscriptionTimeout: any = null;
    private autoSyncedTimer: any = null;
    private connectingStartedAt = 0;

    private onStatusChange?: (status: SupabaseYjsStatus) => void;
    private onRemoteUpdate?: (base64Update: string) => void;
    private onRemoteAwareness?: (base64Awareness: string) => void;
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
        };

        this.onStatusChange = options.onStatusChange;
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

    public getClientId(): string {
        return this.clientId;
    }

    public setSynced() {
        if (this.status === 'SYNCING' || this.status === 'CONNECTED') {
            this.updateStatus('SYNCED');
        }
    }

    public async reconnect() {
        if (this.isDestroyed) return;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        this.updateStatus('RECONNECTING');
        await this.connect();
    }

    private updateStatus(newStatus: SupabaseYjsStatus) {
        if (this.status !== newStatus) {
            this.status = newStatus;
            this.onStatusChange?.(newStatus);
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
        if (this.autoSyncedTimer) {
            clearTimeout(this.autoSyncedTimer);
            this.autoSyncedTimer = null;
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
     * Inicia la conexión y suscripción al canal privado de Supabase Realtime.
     */
    public async connect(): Promise<void> {
        if (this.isDestroyed) return;
        if (!this.documentId || this.documentId.trim() === '') {
            this.updateStatus('DISCONNECTED');
            return;
        }

        const currentAttempt = ++this.connectionAttemptId;

        if (this.subscriptionTimeout) {
            clearTimeout(this.subscriptionTimeout);
            this.subscriptionTimeout = null;
        }
        if (this.autoSyncedTimer) {
            clearTimeout(this.autoSyncedTimer);
            this.autoSyncedTimer = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        this.connectingStartedAt = Date.now();
        this.updateStatus('CONNECTING');

        const channelName = `note_yjs_${this.documentId.trim()}`;

        // Limpiar cualquier canal previo de manera limpia
        await this.teardownChannelAsync();
        if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;

        // Asegurar que el socket Realtime de Supabase esté activo y no en transición de cierre
        try {
            const realtime = (this.supabase as any).realtime;
            if (realtime) {
                if (realtime.isDisconnecting?.()) {
                    await new Promise((resolve) => setTimeout(resolve, 150));
                }
                if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;

                this.purgeLingeringChannel(channelName);

                if (!realtime.isConnected?.() && !realtime.isConnecting?.()) {
                    realtime.connect?.();
                }
            }
        } catch (e) {
            console.warn('[PoC Yjs] Error al preparar socket Realtime:', e);
        }

        if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;

        this.channel = this.supabase.channel(channelName, {
            config: {
                broadcast: {
                    self: false, // El emisor no recibe eco de sus propios mensajes
                    ack: false,  // Envío rápido sin bloquear en el websocket
                },
                presence: {
                    key: this.clientId,
                },
            },
        });

        // 1. Escuchar actualizaciones Yjs en vivo
        this.channel.on('broadcast', { event: 'YJS_UPDATE' }, ({ payload }) => {
            if (!payload || payload.senderClientId === this.clientId) return;
            if (typeof payload.update === 'string') {
                this.receivedCount++;
                this.updateMetrics('Delta');
                this.onRemoteUpdate?.(payload.update);
            }
        });

        // 2. Escuchar Awareness (cursores y selecciones en vivo)
        this.channel.on('broadcast', { event: 'AWARENESS_UPDATE' }, ({ payload }) => {
            if (!payload || payload.senderClientId === this.clientId) return;
            if (typeof payload.update === 'string') {
                this.onRemoteAwareness?.(payload.update);
            }
        });

        // 3. Handshake Paso 1: Vector de Estado de un par
        this.channel.on('broadcast', { event: 'SYNC_STEP_1' }, ({ payload }) => {
            if (!payload || payload.senderClientId === this.clientId) return;
            if (typeof payload.sv === 'string') {
                this.receivedCount++;
                this.updateMetrics('Handshake 1');
                if (this.status !== 'SYNCED') {
                    this.updateStatus('SYNCING');
                }
                // Responder siempre al emisor real de la solicitud (payload.senderClientId)
                this.onSyncStep1Received?.(
                    payload.sv,
                    payload.senderClientId,
                    Boolean(payload.isReturnHandshake)
                );
            }
        });

        // 4. Handshake Paso 2: Diferencia exacta para converger
        this.channel.on('broadcast', { event: 'SYNC_STEP_2' }, ({ payload }) => {
            if (!payload || payload.senderClientId === this.clientId) return;
            if (payload.targetClientId && payload.targetClientId !== this.clientId) return;

            if (typeof payload.update === 'string') {
                this.receivedCount++;
                this.updateMetrics('Handshake 2');
                this.onRemoteUpdate?.(payload.update);
                // Al recibir y aplicar la diferencia, el documento alcanza convergencia total
                this.updateStatus('SYNCED');
            }
        });

        // 5. Salida explícita de un par (PEER_LEFT broadcast)
        this.channel.on('broadcast', { event: 'PEER_LEFT' }, ({ payload }) => {
            if (!payload || payload.senderClientId === this.clientId) return;
            this.onPeerLeft?.(payload.senderClientId);
        });

        // 6. Heartbeat para renovar TTL de presencia activa
        this.channel.on('broadcast', { event: 'HEARTBEAT' }, ({ payload }) => {
            if (!payload || payload.senderClientId === this.clientId) return;
            this.onHeartbeat?.(payload.senderClientId);
        });

        // Timeout de seguridad en suscripción (9s)
        this.subscriptionTimeout = setTimeout(() => {
            if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;
            if (this.status === 'CONNECTING' || this.status === 'RECONNECTING') {
                console.warn('[PoC Yjs] Timeout de suscripción a Supabase Realtime');
                this.updateStatus('ERROR');
                this.scheduleReconnect(2000);
            }
        }, 9000);

        // Suscribirse al canal
        this.channel.subscribe((status, err) => {
            if (this.isDestroyed || currentAttempt !== this.connectionAttemptId) return;
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

                // Si en 2.5s no hay intercambios pendientes, marcar como SYNCED
                if (this.autoSyncedTimer) clearTimeout(this.autoSyncedTimer);
                this.autoSyncedTimer = setTimeout(() => {
                    if (this.status === 'CONNECTED' || this.status === 'SYNCING') {
                        this.updateStatus('SYNCED');
                    }
                }, 2500);
            } else if (status === 'CLOSED') {
                this.updateStatus('DISCONNECTED');
                this.scheduleReconnect(1500);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                this.updateStatus('ERROR');
                this.onError?.(new Error(`Error en canal Supabase Realtime: ${status}`));
                this.scheduleReconnect(2500);
            }
        });
    }

    /**
     * Envía una actualización delta de Yjs por el canal.
     */
    public async sendUpdate(base64Update: string): Promise<boolean> {
        if (!this.channel || (this.status !== 'CONNECTED' && this.status !== 'SYNCING' && this.status !== 'SYNCED')) {
            return false;
        }

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
                this.sentCount++;
                this.updateMetrics('Envío Delta');
                return true;
            } else {
                return false;
            }
        } catch (err: any) {
            this.onError?.(err);
            return false;
        }
    }

    /**
     * Envía una actualización de Awareness (cursor, selección o perfil).
     */
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
        } catch (err: any) {
            return false;
        }
    }

    /**
     * Envía el StateVector local para solicitar a los demás pares los deltas faltantes.
     */
    public async sendSyncStep1(base64Sv: string, isReturnHandshake = false, correlationId?: string | null): Promise<boolean> {
        if (!this.channel || (this.status !== 'CONNECTED' && this.status !== 'SYNCING' && this.status !== 'SYNCED')) return false;

        this.updateStatus('SYNCING');
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
        } catch (err: any) {
            return false;
        }
    }

    /**
     * Envía la diferencia calculada a un par que solicitó sincronización.
     */
    public async sendSyncStep2(base64Update: string, targetClientId?: string | null): Promise<boolean> {
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
                // Al responder el handshake al par remoto, este cliente también queda sincronizado
                this.updateStatus('SYNCED');
                return true;
            }
            return false;
        } catch (err: any) {
            return false;
        }
    }

    /**
     * Emite aviso explícito de abandono de sesión para purga inmediata de presencia.
     */
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
        } catch (err: any) {
            return false;
        }
    }

    /**
     * Heartbeat para mantener vivos los estados de presencia en los colaboradores (cada 1.5 segundos).
     */
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

    /**
     * Watchdog de conexión para auto-recuperar canales caídos sin intervención manual
     */
    private startConnectionWatchdog() {
        this.stopConnectionWatchdog();
        this.connectionWatchdogTimer = setInterval(() => {
            if (this.isDestroyed) return;
            const now = Date.now();
            const isStuckConnecting = (this.status === 'CONNECTING' || this.status === 'RECONNECTING') && (now - this.connectingStartedAt > 12000);
            if (this.status === 'DISCONNECTED' || this.status === 'ERROR' || isStuckConnecting) {
                console.log(`[PoC Yjs] Watchdog reactivando conexión (estado: ${this.status})`);
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

    /**
     * Destruye el canal, remueve listeners y limpia temporizadores.
     */
    public destroy() {
        this.isDestroyed = true;
        this.connectionAttemptId++;
        this.stopAwarenessHeartbeat();
        this.stopConnectionWatchdog();

        if (this.subscriptionTimeout) {
            clearTimeout(this.subscriptionTimeout);
            this.subscriptionTimeout = null;
        }

        if (this.autoSyncedTimer) {
            clearTimeout(this.autoSyncedTimer);
            this.autoSyncedTimer = null;
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.channel) {
            try {
                this.channel.send({
                    type: 'broadcast',
                    event: 'PEER_LEFT',
                    payload: {
                        senderClientId: this.clientId,
                        timestamp: Date.now(),
                    },
                }).catch?.(() => {});
            } catch (e) {}

            const oldChannel = this.channel;
            this.channel = null;
            try {
                oldChannel.untrack?.().catch?.(() => {});
                this.supabase.removeChannel(oldChannel).catch?.(() => {});
            } catch (e) {}
        }

        if (this.documentId) {
            this.purgeLingeringChannel(`note_yjs_${this.documentId}`);
        }

        this.updateStatus('DISCONNECTED');
    }
}
