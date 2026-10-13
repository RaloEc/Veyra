import { supabase } from '../lib/supabase';
import { APP_CONFIG } from '../constants/appConfig';
import {
    CollabTargetType,
    CollabRole,
    ShareInvitation,
    Collaboration,
    CollaboratorMember,
    CollaborationActivity,
    BatchCollabItem,
} from '../types/db';

export const CollaborationService = {
    /**
     * Genera una nueva invitación para compartir un recurso (carpeta, recordatorio, nota o evento).
     * Devuelve el objeto de la invitación y los enlaces para compartir.
     */
    async createInvitation(
        targetType: CollabTargetType,
        targetId: string,
        targetName: string,
        role: CollabRole = targetType === 'reminder' ? 'viewer' : 'editor',
        isPublicMembers: boolean = true
    ): Promise<{ invitation: ShareInvitation; inviteUrl: string; deepLink: string }> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            throw new Error('Debes iniciar sesión para compartir recursos');
        }

        const payload: any = {
            owner_id: user.id,
            target_type: targetType,
            target_id: targetId,
            target_name: targetName,
            role,
            is_public_members: isPublicMembers,
            status: 'pending',
        };

        let { data, error } = await supabase
            .from('share_invitations')
            .insert(payload)
            .select()
            .single();

        if (error && (error.code === 'PGRST204' || error.message?.includes('is_public_members'))) {
            delete payload.is_public_members;
            const retry = await supabase
                .from('share_invitations')
                .insert(payload)
                .select()
                .single();
            data = retry.data;
            error = retry.error;
        }

        if (error || !data) {
            throw new Error(error?.message || 'No se pudo crear la invitación');
        }

        const inviteCode = data.invite_code;
        const deepLink = `veyra://join?code=${inviteCode}`;
        const inviteUrl = `${APP_CONFIG.baseUrl}/join?code=${inviteCode}`;

        // Registrar inmediatamente en el historial de actividad con el nombre de usuario real del propietario
        try {
            const { useStore } = await import('../store/useStore');
            const storeUserName = useStore.getState().userName;
            const actorName = storeUserName || user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.settings?.userName || (user.email ? user.email.split('@')[0] : 'Propietario');

            await this.logActivity(
                targetType,
                targetId,
                'added',
                targetName,
                `${actorName} compartió este elemento`
            );
        } catch (actErr) {
            console.warn('[CollaborationService] Error registrando actividad del creador:', actErr);
        }

        return {
            invitation: data as ShareInvitation,
            inviteUrl,
            deepLink,
        };
    },

    /**
     * Genera una invitación de colaboración en lote para múltiples elementos (eventos y recordatorios).
     * Permite a los invitados unirse a todos los recursos seleccionados con un solo código.
     */
    async createBatchInvitation(
        items: BatchCollabItem[],
        title?: string,
        isPublicMembers: boolean = true
    ): Promise<{ invitation: ShareInvitation; inviteUrl: string; deepLink: string }> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            throw new Error('Debes iniciar sesión para compartir recursos');
        }
        if (!items || items.length === 0) {
            throw new Error('No hay elementos seleccionados para compartir');
        }

        const first = items[0];
        const defaultTitle = title || (items.length === 1 ? first.target_name : `${items.length} elementos`);

        const payload: any = {
            owner_id: user.id,
            target_type: items.length === 1 ? first.target_type : 'batch',
            target_id: first.target_id,
            target_name: defaultTitle,
            role: first.role || (first.target_type === 'reminder' ? 'viewer' : 'editor'),
            batch_items: items,
            is_public_members: isPublicMembers,
            status: 'pending',
        };

        let { data, error } = await supabase
            .from('share_invitations')
            .insert(payload)
            .select()
            .single();

        if (error && (error.code === 'PGRST204' || error.message?.includes('batch_items') || error.message?.includes('target_type'))) {
            // Fallback elegante si la columna batch_items o el enum batch no están en Supabase aún
            delete payload.batch_items;
            payload.target_type = first.target_type;
            const retry = await supabase
                .from('share_invitations')
                .insert(payload)
                .select()
                .single();
            data = retry.data;
            error = retry.error;
        }

        if (error || !data) {
            throw new Error(error?.message || 'No se pudo crear la invitación en lote');
        }

        const inviteCode = data.invite_code;
        const deepLink = `veyra://join?code=${inviteCode}`;
        const inviteUrl = `${APP_CONFIG.baseUrl}/join?code=${inviteCode}`;

        try {
            const { useStore } = await import('../store/useStore');
            const storeUserName = useStore.getState().userName;
            const actorName = storeUserName || user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.settings?.userName || (user.email ? user.email.split('@')[0] : 'Propietario');

            for (const it of items) {
                await this.logActivity(
                    it.target_type,
                    it.target_id,
                    'added',
                    it.target_name,
                    `${actorName} compartió este elemento en lote`
                ).catch(() => {});
            }
        } catch (actErr) {
            console.warn('[CollaborationService] Error registrando actividad del lote:', actErr);
        }

        return {
            invitation: {
                ...(data as ShareInvitation),
                batch_items: data.batch_items || items,
            },
            inviteUrl,
            deepLink,
        };
    },

    /**
     * Obtiene la información de una invitación a partir de su código.
     * Útil para mostrar la vista previa antes de que el usuario decida unirse.
     */
    async getInvitationByCode(code: string): Promise<{
        invitation: ShareInvitation;
        ownerEmail?: string;
    } | null> {
        let cleanCode = code.trim();
        if (!cleanCode) return null;

        // Limpiar si el usuario pasó la URL completa (ej: https://.../join?code=XYZ o veyra://join?code=XYZ)
        if (cleanCode.includes('code=')) {
            const match = cleanCode.match(/code=([a-zA-Z0-9_-]+)/);
            if (match && match[1]) cleanCode = match[1];
        } else if (cleanCode.includes('/join/')) {
            const match = cleanCode.match(/\/join\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) cleanCode = match[1];
        }

        cleanCode = cleanCode.trim().toLowerCase();

        const fetchPromise = (async () => {
            const { data, error } = await supabase
                .from('share_invitations')
                .select('*')
                .ilike('invite_code', cleanCode)
                .eq('status', 'pending')
                .gt('expires_at', new Date().toISOString())
                .maybeSingle();

            let targetData = data;
            if (error || !targetData) {
                // Intento fallback sin filtro de fecha por si el reloj del dispositivo móvil está desfasado
                const { data: fallbackData } = await supabase
                    .from('share_invitations')
                    .select('*')
                    .ilike('invite_code', cleanCode)
                    .eq('status', 'pending')
                    .maybeSingle();

                if (!fallbackData) return null;
                targetData = fallbackData;
            }

            // Obtener email del creador si existe perfil público
            let ownerEmail: string | undefined;
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('email')
                    .eq('id', targetData.owner_id)
                    .maybeSingle();
                ownerEmail = profile?.email;
            } catch {
                // No crítico
            }

            return {
                invitation: targetData as ShareInvitation,
                ownerEmail,
            };
        })();

        // Timeout de seguridad de 7 segundos para evitar que la UI quede congelada
        const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => {
                console.warn('[CollaborationService] Timeout de 7s superado al consultar código:', cleanCode);
                resolve(null);
            }, 7000);
        });

        return Promise.race([fetchPromise, timeoutPromise]);
    },

    /**
     * Acepta una invitación y registra al usuario actual como colaborador.
     * Utiliza la función RPC atómica de Supabase.
     */
    async acceptInvitation(code: string): Promise<{
        success: boolean;
        collaborationId: string;
        targetType: CollabTargetType;
        targetId: string;
        targetName?: string;
        role: CollabRole;
        isBatch?: boolean;
        batchItems?: BatchCollabItem[];
    }> {
        let cleanCode = code.trim();
        if (cleanCode.includes('code=')) {
            const match = cleanCode.match(/code=([a-zA-Z0-9_-]+)/);
            if (match && match[1]) cleanCode = match[1];
        } else if (cleanCode.includes('/join/')) {
            const match = cleanCode.match(/\/join\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) cleanCode = match[1];
        }
        cleanCode = cleanCode.trim().toLowerCase();

        if (!cleanCode) {
            throw new Error('Código de invitación no válido');
        }

        const { data, error } = await supabase.rpc('accept_share_invitation', {
            p_invite_code: cleanCode,
        });

        if (error) {
            throw new Error(error.message || 'Error al aceptar la invitación');
        }

        // Registrar inmediatamente en el historial de actividad con el nombre de usuario real
        try {
            const { useStore } = await import('../store/useStore');
            const { data: userData } = await supabase.auth.getUser();
            const storeUserName = useStore.getState().userName;
            const actorName = storeUserName || userData?.user?.user_metadata?.full_name || userData?.user?.user_metadata?.name || userData?.user?.email?.split('@')[0] || 'Un colaborador';

            await this.logActivity(
                data.target_type,
                data.target_id,
                'added',
                data.target_name,
                `${actorName} se unió como colaborador`
            );
        } catch {}

        return {
            success: true,
            collaborationId: data.collaboration_id,
            targetType: data.target_type,
            targetId: data.target_id,
            targetName: data.target_name,
            role: data.role,
            isBatch: Boolean(data.is_batch),
            batchItems: data.batch_items || [],
        };
    },

    /**
     * Obtiene la lista de colaboradores activos para un elemento,
     * resolviendo sus nombres de usuario reales en vez de identificadores genéricos.
     */
    async getCollaborators(
        targetType: CollabTargetType,
        targetId: string
    ): Promise<CollaboratorMember[]> {
        const { data: collabs, error } = await supabase
            .from('collaborations')
            .select('id, target_type, target_id, owner_id, member_id, role, joined_at')
            .eq('target_type', targetType)
            .eq('target_id', targetId);

        if (error || !collabs) {
            console.warn('[CollaborationService] Error obteniendo colaboradores:', error);
            return [];
        }

        if (collabs.length === 0) return [];

        const memberIds = collabs.map((c) => c.member_id);

        // 1. Consultar historial de actividades para obtener nombres reales registrados
        const nameMap = new Map<string, string>();
        const emailMap = new Map<string, string>();

        try {
            const { data: activities } = await supabase
                .from('collaboration_activity')
                .select('actor_id, actor_name')
                .in('actor_id', memberIds)
                .not('actor_name', 'is', null)
                .order('created_at', { ascending: false });

            if (activities) {
                for (const act of activities) {
                    if (act.actor_name && !nameMap.has(act.actor_id)) {
                        nameMap.set(act.actor_id, act.actor_name);
                        if (act.actor_name.includes('@') && !emailMap.has(act.actor_id)) {
                            emailMap.set(act.actor_id, act.actor_name);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[CollaborationService] Error consultando nombres en actividad:', e);
        }

        // 2. Consultar perfiles (si están accesibles en Supabase)
        try {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, email')
                .in('id', memberIds);

            if (profiles) {
                for (const p of profiles) {
                    if (p.email) emailMap.set(p.id, p.email);
                }
            }
        } catch (e) {
            // Silencioso
        }

        // 3. Si el usuario actual está en la lista de colaboradores, enriquecer con sus datos de sesión locales
        try {
            const { useStore } = await import('../store/useStore');
            const currentUser = useStore.getState().session?.user;
            if (currentUser && memberIds.includes(currentUser.id)) {
                const myName = useStore.getState().userName || currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0];
                if (myName) nameMap.set(currentUser.id, myName);
                if (currentUser.email) emailMap.set(currentUser.id, currentUser.email);
            }
        } catch (e) {
            // Silencioso
        }

        return collabs.map((c) => {
            const rawName = nameMap.get(c.member_id);
            const email = emailMap.get(c.member_id) || (rawName && rawName.includes('@') ? rawName : undefined);

            let displayName = rawName;
            if (displayName && displayName.includes('@')) {
                const prefix = displayName.split('@')[0];
                displayName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
            }
            if (!displayName && email && email.includes('@')) {
                const prefix = email.split('@')[0];
                displayName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
            }
            if (!displayName) {
                displayName = 'Usuario';
            }

            return {
                collaboration_id: c.id,
                member_id: c.member_id,
                email: email || undefined,
                name: displayName,
                full_name: displayName,
                role: c.role as CollabRole,
                joined_at: c.joined_at,
                is_owner: false,
            };
        });
    },

    /**
     * Envía una notificación broadcast confiable por Supabase Realtime asegurando que el canal esté suscrito.
     */
    async broadcastToChannel(channelName: string, event: string, payload: any): Promise<void> {
        try {
            const existingChannels = supabase.getChannels();
            const matching = existingChannels.find(ch => ch.topic === `realtime:${channelName}` || ch.topic === channelName);
            if (matching && (matching.state === 'joined' || matching.state === 'joining')) {
                await matching.send({
                    type: 'broadcast',
                    event,
                    payload,
                });
                return;
            }

            const tempChannel = supabase.channel(channelName);
            await new Promise<void>((resolve) => {
                const timer = setTimeout(() => {
                    supabase.removeChannel(tempChannel).catch(() => {});
                    resolve();
                }, 3500);

                tempChannel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        tempChannel.send({
                            type: 'broadcast',
                            event,
                            payload,
                        }).finally(() => {
                            clearTimeout(timer);
                            setTimeout(() => {
                                supabase.removeChannel(tempChannel).catch(() => {});
                            }, 400);
                            resolve();
                        });
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        clearTimeout(timer);
                        supabase.removeChannel(tempChannel).catch(() => {});
                        resolve();
                    }
                });
            });
        } catch (e) {
            console.warn('[CollaborationService] Error en broadcastToChannel:', e);
        }
    },

    /**
     * Revoca el acceso a un miembro (solo el propietario puede hacerlo).
     */
    async revokeAccess(collaborationId: string): Promise<boolean> {
        const { data: collab } = await supabase
            .from('collaborations')
            .select('target_type, target_id, member_id')
            .eq('id', collaborationId)
            .single();

        const { error } = await supabase
            .from('collaborations')
            .delete()
            .eq('id', collaborationId);

        if (error) {
            throw new Error(error.message || 'No se pudo revocar el acceso');
        }

        if (collab) {
            await CollaborationService.broadcastToChannel(`note_live_${collab.target_id}`, 'LIVE_NOTE_CHANGE', {
                changeType: 'PERMISSIONS_UPDATE',
                targetId: collab.target_id,
                collaborationId,
                memberId: collab.member_id,
                revoked: true,
            });
            await CollaborationService.broadcastToChannel(`user_collab_${collab.member_id}`, 'LIVE_NOTE_CHANGE', {
                changeType: 'PERMISSIONS_UPDATE',
                targetId: collab.target_id,
                collaborationId,
                memberId: collab.member_id,
                revoked: true,
            });
        }

        return true;
    },

    /**
     * Actualiza el rol de un miembro (editor o viewer). Solo el propietario puede hacerlo.
     * Modifica el registro en Supabase y notifica de inmediato mediante WebSockets al canal general
     * y al canal individual del colaborador para que su UI se ajuste al instante.
     */
    async updateRole(
        collaborationId: string,
        role: CollabRole,
        options?: {
            targetType?: CollabTargetType;
            targetId?: string;
            memberId?: string;
        }
    ): Promise<boolean> {
        let existingCollab: { id?: string; target_type?: string; target_id?: string; member_id?: string; role?: string } | null = null;

        // 1. Obtener la fila actual antes de actualizar para garantizar target_id y member_id
        if (collaborationId) {
            const { data: existing } = await supabase
                .from('collaborations')
                .select('id, target_type, target_id, member_id, role')
                .eq('id', collaborationId)
                .maybeSingle();
            if (existing) existingCollab = existing;
        }

        if (!existingCollab && options?.targetType && options?.targetId && options?.memberId) {
            const { data: existing } = await supabase
                .from('collaborations')
                .select('id, target_type, target_id, member_id, role')
                .eq('target_type', options.targetType)
                .eq('target_id', options.targetId)
                .eq('member_id', options.memberId)
                .maybeSingle();
            if (existing) existingCollab = existing;
        }

        // 2. Intentar actualizar directamente por 'id' en Supabase sin usar .single() (que causa PGRST116)
        let updatedList: any[] | null = null;
        let updateError: any = null;

        if (collaborationId) {
            const res = await supabase
                .from('collaborations')
                .update({ role })
                .eq('id', collaborationId)
                .select('id, target_type, target_id, member_id, role');

            if (!res.error && res.data && res.data.length > 0) {
                updatedList = res.data;
            } else {
                updateError = res.error;
            }
        }

        // 3. Si no actualizó por 'id' pero tenemos datos compuestos, intentar por (target_type, target_id, member_id)
        const tType = options?.targetType || existingCollab?.target_type;
        const tId = options?.targetId || existingCollab?.target_id;
        const mId = options?.memberId || existingCollab?.member_id;

        if ((!updatedList || updatedList.length === 0) && tType && tId && mId) {
            const res2 = await supabase
                .from('collaborations')
                .update({ role })
                .eq('target_type', tType)
                .eq('target_id', tId)
                .eq('member_id', mId)
                .select('id, target_type, target_id, member_id, role');

            if (!res2.error && res2.data && res2.data.length > 0) {
                updatedList = res2.data;
                updateError = null;
            } else if (res2.error) {
                updateError = res2.error;
            }
        }

        // 4. Si la tabla tiene políticas restrictivas o falló la mutación directa, intentar RPCs seguros
        if ((!updatedList || updatedList.length === 0) && collaborationId) {
            try {
                const { data: rpcData, error: rpcErr } = await supabase.rpc('update_collaboration_role', {
                    p_collaboration_id: collaborationId,
                    p_role: role,
                });
                if (!rpcErr && rpcData) {
                    updatedList = Array.isArray(rpcData) ? rpcData : [rpcData];
                    updateError = null;
                }
            } catch {
                // Silencioso si la función RPC aún no está creada en la base de datos
            }
        }

        if ((!updatedList || updatedList.length === 0) && tType && tId && mId) {
            try {
                const { data: rpcData2, error: rpcErr2 } = await supabase.rpc('update_collaboration_role_by_member', {
                    p_target_type: tType,
                    p_target_id: tId,
                    p_member_id: mId,
                    p_role: role,
                });
                if (!rpcErr2 && rpcData2) {
                    updatedList = Array.isArray(rpcData2) ? rpcData2 : [rpcData2];
                    updateError = null;
                }
            } catch {
                // Silencioso si la función RPC aún no está creada en la base de datos
            }
        }

        if (!updatedList || updatedList.length === 0) {
            if (updateError) {
                console.warn('[CollaborationService] Error al actualizar rol en Supabase:', updateError);
                throw new Error(updateError.message || 'No se pudo actualizar el rol');
            }
        }

        const targetId = updatedList?.[0]?.target_id || tId;
        const memberId = updatedList?.[0]?.member_id || mId;
        const resolvedCollabId = updatedList?.[0]?.id || collaborationId;

        // 5. Notificar en tiempo real por WebSockets a los dispositivos conectados
        if (targetId) {
            await CollaborationService.broadcastToChannel(`note_live_${targetId}`, 'LIVE_NOTE_CHANGE', {
                changeType: 'PERMISSIONS_UPDATE',
                targetId,
                collaborationId: resolvedCollabId,
                memberId,
                role,
            });
        }

        if (memberId && targetId) {
            await CollaborationService.broadcastToChannel(`user_collab_${memberId}`, 'LIVE_NOTE_CHANGE', {
                changeType: 'PERMISSIONS_UPDATE',
                targetId,
                collaborationId: resolvedCollabId,
                memberId,
                role,
            });
        }

        return true;
    },

    /**
     * Notifica a los demás colaboradores mediante la Edge Function 'collab-notify'.
     * Despacha push notifications a todos los miembros o dueño (excluyendo al autor).
     */
    async notifyChange(params: {
        targetType: CollabTargetType;
        targetId: string;
        action: 'completed' | 'uncompleted' | 'edited' | 'added' | 'deleted';
        itemTitle: string;
        details?: string;
    }): Promise<void> {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { useStore } = await import('../store/useStore');
            const storeUserName = useStore.getState().userName;
            const actorName = storeUserName || user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.settings?.userName || (user.email ? user.email.split('@')[0] : 'Un colaborador');

            // Guardar en el historial de actividad de colaboración
            this.logActivity(
                params.targetType,
                params.targetId,
                params.action,
                params.itemTitle,
                params.details
            ).catch(err => {
                console.warn('[CollaborationService] Error guardando log de actividad:', err);
            });

            // Invocación asíncrona a la Edge Function
            supabase.functions.invoke('collab-notify', {
                body: {
                    targetType: params.targetType,
                    targetId: params.targetId,
                    actorId: user.id,
                    actorName,
                    action: params.action,
                    itemTitle: params.itemTitle,
                    details: params.details,
                },
            }).catch(err => {
                console.warn('[CollaborationService] Error invocando collab-notify:', err);
            });
        } catch (err) {
            console.warn('[CollaborationService] Error en notifyChange:', err);
        }
    },

    /**
     * El usuario actual abandona la colaboración de un recurso compartido.
     */
    async leaveCollaboration(targetType: CollabTargetType, targetId: string): Promise<boolean> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No autenticado');

        const { error } = await supabase
            .from('collaborations')
            .delete()
            .match({ target_type: targetType, target_id: targetId, member_id: user.id });

        if (error) {
            throw new Error(error.message || 'No se pudo abandonar el recurso compartido');
        }
        return true;
    },

    /**
     * Registra un evento de actividad en el historial de colaboración.
     */
    async logActivity(
        targetType: CollabTargetType,
        targetId: string,
        action: CollaborationActivity['action'],
        itemTitle?: string,
        details?: string
    ): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        try {
            const { useStore } = await import('../store/useStore');
            const storeUserName = useStore.getState().userName;
            const actorName = storeUserName || user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.settings?.userName || (user.email ? user.email.split('@')[0] : 'Usuario');

            const payload: any = {
                target_type: targetType,
                target_id: targetId,
                actor_id: user.id,
                actor_name: actorName,
                action,
                item_title: itemTitle || undefined,
                details: details || undefined,
            };

            // Si el mismo usuario realizó ediciones consecutivas en los últimos 45 segundos,
            // actualizar el registro más reciente para consolidar el cambio y evitar saturar el historial
            if (action === 'edited') {
                try {
                    const recentWindow = new Date(Date.now() - 45 * 1000).toISOString();
                    const { data: recent } = await supabase
                        .from('collaboration_activity')
                        .select('id')
                        .eq('target_type', targetType)
                        .eq('target_id', targetId)
                        .eq('actor_id', user.id)
                        .eq('action', 'edited')
                        .gte('created_at', recentWindow)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (recent?.id) {
                        await supabase
                            .from('collaboration_activity')
                            .update({
                                actor_name: actorName,
                                item_title: itemTitle || undefined,
                                details: details || undefined,
                            })
                            .eq('id', recent.id);
                        return;
                    }
                } catch {}
            }

            const { error } = await supabase.from('collaboration_activity').insert(payload);
            if (error && (error.code === 'PGRST204' || error.message?.includes('details'))) {
                delete payload.details;
                await supabase.from('collaboration_activity').insert(payload);
            }
        } catch (e) {
            console.warn('[CollaborationService] Error registrando actividad:', e);
        }
    },

    /**
     * Asegura que la identidad del usuario actual (nombre real configurado en su perfil)
     * esté registrada y actualizada en collaboration_activity para este recurso compartido.
     */
    async ensureActorIdentity(
        targetType: CollabTargetType,
        targetId: string,
        itemTitle?: string,
        isOwnerHint?: boolean
    ): Promise<void> {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { useStore } = await import('../store/useStore');
            const storeUserName = useStore.getState().userName;
            const actorName = storeUserName || user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.settings?.userName || (user.email ? user.email.split('@')[0] : 'Usuario');

            // 1. Si el nombre es un nombre real (no un correo puro), actualizar cualquier registro previo con nombre incompleto
            if (actorName && !actorName.includes('@')) {
                await supabase
                    .from('collaboration_activity')
                    .update({ actor_name: actorName })
                    .eq('target_type', targetType)
                    .eq('target_id', targetId)
                    .eq('actor_id', user.id);
            }

            // 2. Verificar si ya existe al menos una actividad registrada para este actor en este recurso
            const { data: existing } = await supabase
                .from('collaboration_activity')
                .select('id')
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .eq('actor_id', user.id)
                .limit(1)
                .maybeSingle();

            if (!existing) {
                await this.logActivity(
                    targetType,
                    targetId,
                    'added',
                    itemTitle || 'Elemento',
                    isOwnerHint ? `${actorName} es el propietario del recurso` : `${actorName} está colaborando`
                );
            }
        } catch (e) {
            console.warn('[CollaborationService] Error en ensureActorIdentity:', e);
        }
    },

    /**
     * Obtiene el historial reciente de actividad de un elemento compartido.
     */
    async getActivity(
        targetType: CollabTargetType,
        targetId: string,
        limit: number = 30
    ): Promise<CollaborationActivity[]> {
        const { data, error } = await supabase
            .from('collaboration_activity')
            .select('*')
            .eq('target_type', targetType)
            .eq('target_id', targetId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error || !data) return [];
        return data as CollaborationActivity[];
    },

    /**
     * Obtiene la visibilidad de los integrantes para un recurso (público vs privado).
     */
    async getMembersVisibility(
        targetType: CollabTargetType,
        targetId: string
    ): Promise<boolean> {
        try {
            const { data, error } = await supabase
                .from('collaborations')
                .select('is_public_members')
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .limit(1)
                .maybeSingle();

            if (error || !data) return true;
            return data.is_public_members !== false;
        } catch {
            return true;
        }
    },

    /**
     * Configura si la lista de integrantes es visible para todos o solo para el dueño.
     */
    async setMembersVisibility(
        targetType: CollabTargetType,
        targetId: string,
        isPublic: boolean
    ): Promise<boolean> {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return false;

            await supabase
                .from('collaborations')
                .update({ is_public_members: isPublic })
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .eq('owner_id', user.id);

            await supabase
                .from('share_invitations')
                .update({ is_public_members: isPublic })
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .eq('owner_id', user.id);

            // Notificar en tiempo real a los teléfonos conectados sobre el cambio de visibilidad
            await CollaborationService.broadcastToChannel(`note_live_${targetId}`, 'LIVE_NOTE_CHANGE', {
                changeType: 'PERMISSIONS_UPDATE',
                targetId,
                isPublicMembers: isPublic,
            });

            return true;
        } catch (e) {
            console.warn('[CollaborationService] Error actualizando visibilidad de miembros:', e);
            return false;
        }
    },

    /**
     * Actualiza el permiso general para invitados en un recurso (carpeta, recordatorio, nota o evento).
     * Modifica el rol de todas las invitaciones pendientes y de todos los colaboradores actuales (excepto el dueño),
     * notificando en tiempo real por WebSockets a los dispositivos conectados para que su interfaz se bloquee o habilite al instante.
     */
    async setGuestPermission(
        targetType: CollabTargetType,
        targetId: string,
        role: CollabRole
    ): Promise<boolean> {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return false;

            // 1. Obtener miembros existentes primero para garantizar notificación individual
            const { data: existingMembers } = await supabase
                .from('collaborations')
                .select('id, member_id, target_id')
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .neq('member_id', user.id);

            // 2. Actualizar todas las invitaciones de este recurso
            await supabase
                .from('share_invitations')
                .update({ role })
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .eq('owner_id', user.id);

            // 3. Actualizar a todos los colaboradores miembros (que no sean el dueño)
            const { data: updatedMembers } = await supabase
                .from('collaborations')
                .update({ role })
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .neq('member_id', user.id)
                .select('id, member_id, target_id, role');

            // 4. Intentar también vía RPC set_guest_permission para soporte atómico y seguro
            try {
                await supabase.rpc('set_guest_permission', {
                    p_target_type: targetType,
                    p_target_id: targetId,
                    p_role: role,
                });
            } catch {
                // Silencioso si la función RPC aún no está creada en la base de datos
            }

            // 5. Notificar al canal en vivo general del recurso
            await CollaborationService.broadcastToChannel(`note_live_${targetId}`, 'LIVE_NOTE_CHANGE', {
                changeType: 'PERMISSIONS_UPDATE',
                targetId,
                role,
            });

            // 6. Notificar a cada miembro directamente por su canal individual
            const targetMembers = (updatedMembers && updatedMembers.length > 0) ? updatedMembers : (existingMembers || []);
            for (const m of targetMembers) {
                await CollaborationService.broadcastToChannel(`user_collab_${m.member_id}`, 'LIVE_NOTE_CHANGE', {
                    changeType: 'PERMISSIONS_UPDATE',
                    targetId: m.target_id || targetId,
                    collaborationId: m.id,
                    memberId: m.member_id,
                    role,
                });
            }

            return true;
        } catch (e) {
            console.warn('[CollaborationService] Error actualizando permiso para invitados:', e);
            return false;
        }
    },

    /**
     * Obtiene el rol actual configurado para invitados de este recurso.
     */
    async getGuestPermission(
        targetType: CollabTargetType,
        targetId: string
    ): Promise<CollabRole> {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return 'editor';

            // Revisar invitaciones existentes del recurso
            const { data: inv } = await supabase
                .from('share_invitations')
                .select('role')
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .eq('owner_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (inv?.role) return inv.role as CollabRole;

            // O colaboradores existentes
            const { data: collab } = await supabase
                .from('collaborations')
                .select('role')
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .neq('member_id', user.id)
                .limit(1)
                .maybeSingle();

            if (collab?.role) return collab.role as CollabRole;
        } catch (e) {}
        return 'editor';
    },

    /**
     * Obtiene el rol y permisos del usuario actual sobre un recurso compartido.
     * Retorna { isOwner: boolean, role: CollabRole, canEdit: boolean, hasAccess: boolean, isRevoked: boolean }
     */
    async getUserPermission(
        targetType: CollabTargetType,
        targetId: string
    ): Promise<{ isOwner: boolean; role: CollabRole; canEdit: boolean; hasAccess: boolean; isRevoked: boolean }> {
        let currentUserId: string | undefined;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                return { isOwner: false, role: 'viewer', canEdit: false, hasAccess: false, isRevoked: true };
            }
            currentUserId = user.id;

            // 1. Verificar primero si el usuario es miembro en 'collaborations' (invitado)
            const { data: collab, error } = await supabase
                .from('collaborations')
                .select('owner_id, member_id, role')
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .eq('member_id', user.id)
                .maybeSingle();

            if (!error && collab) {
                const isOwner = collab.owner_id === user.id;
                const role: CollabRole = (collab.role as CollabRole) || 'editor';
                return {
                    isOwner,
                    role,
                    canEdit: isOwner || role === 'editor',
                    hasAccess: true,
                    isRevoked: false,
                };
            }

            // 2. Verificar si el usuario es el dueño en 'collaborations' (como creador con colaboradores)
            const { data: asOwner } = await supabase
                .from('collaborations')
                .select('owner_id')
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .eq('owner_id', user.id)
                .limit(1)
                .maybeSingle();

            if (asOwner) {
                return { isOwner: true, role: 'editor', canEdit: true, hasAccess: true, isRevoked: false };
            }

            // 3. Verificar si el recurso tiene colaboradores registrados pero el usuario NO está entre ellos:
            // ¡Significa que era un colaborador pero su acceso fue revocado por el dueño!
            const { data: anyCollab } = await supabase
                .from('collaborations')
                .select('owner_id')
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .limit(1)
                .maybeSingle();

            if (anyCollab) {
                if (anyCollab.owner_id === user.id) {
                    return { isOwner: true, role: 'editor', canEdit: true, hasAccess: true, isRevoked: false };
                }
                return { isOwner: false, role: 'viewer', canEdit: false, hasAccess: false, isRevoked: true };
            }

            // 3b. Si es una nota, verificar si hereda colaboración de su carpeta contenedora
            if (targetType === 'note') {
                let folderId: string | null = null;
                try {
                    const { useNotesStore } = await import('../store/useNotesStore');
                    const localNote = useNotesStore.getState().notes.find(n => n.id === targetId);
                    folderId = localNote?.folder_id || null;
                } catch {}

                if (!folderId) {
                    const { data: noteRow } = await supabase
                        .from('notes')
                        .select('folder_id')
                        .eq('id', targetId)
                        .maybeSingle();
                    if (noteRow?.folder_id) folderId = noteRow.folder_id;
                }

                if (folderId) {
                    // Verificar si el usuario es miembro de la carpeta compartida
                    const { data: folderCollab } = await supabase
                        .from('collaborations')
                        .select('owner_id, member_id, role')
                        .eq('target_type', 'folder')
                        .eq('target_id', folderId)
                        .eq('member_id', user.id)
                        .maybeSingle();

                    if (folderCollab) {
                        const isOwner = folderCollab.owner_id === user.id;
                        const role: CollabRole = (folderCollab.role as CollabRole) || 'editor';
                        return {
                            isOwner,
                            role,
                            canEdit: isOwner || role === 'editor',
                            hasAccess: true,
                            isRevoked: false,
                        };
                    }

                    // Verificar si el usuario es el dueño de la carpeta en 'collaborations'
                    const { data: asFolderOwner } = await supabase
                        .from('collaborations')
                        .select('owner_id')
                        .eq('target_type', 'folder')
                        .eq('target_id', folderId)
                        .eq('owner_id', user.id)
                        .limit(1)
                        .maybeSingle();

                    if (asFolderOwner) {
                        return { isOwner: true, role: 'editor', canEdit: true, hasAccess: true, isRevoked: false };
                    }

                    // Si la carpeta tiene colaboraciones pero el usuario no está entre ellas (fue revocado de la carpeta)
                    const { data: anyFolderCollab } = await supabase
                        .from('collaborations')
                        .select('owner_id')
                        .eq('target_type', 'folder')
                        .eq('target_id', folderId)
                        .limit(1)
                        .maybeSingle();

                    if (anyFolderCollab) {
                        if (anyFolderCollab.owner_id === user.id) {
                            return { isOwner: true, role: 'editor', canEdit: true, hasAccess: true, isRevoked: false };
                        }
                        return { isOwner: false, role: 'viewer', canEdit: false, hasAccess: false, isRevoked: true };
                    }
                }
            }

            // 4. Si no hay filas en 'collaborations', verificar si en la tabla remota pertenece a otro usuario
            const table = targetType === 'note' ? 'notes' : targetType === 'folder' ? 'folders' : targetType === 'reminder' ? 'reminders' : 'events';
            const { data: remoteItem } = await supabase
                .from(table)
                .select('user_id')
                .eq('id', targetId)
                .maybeSingle();

            if (remoteItem && remoteItem.user_id && remoteItem.user_id !== user.id) {
                return { isOwner: false, role: 'viewer', canEdit: false, hasAccess: false, isRevoked: true };
            }
            if (remoteItem && remoteItem.user_id && remoteItem.user_id === user.id) {
                return { isOwner: true, role: 'editor', canEdit: true, hasAccess: true, isRevoked: false };
            }

            // 5. Verificar caché local: si está marcado localmente como de otro dueño o revocado
            if (targetType === 'note') {
                const { useNotesStore } = await import('../store/useNotesStore');
                const localNote = useNotesStore.getState().notes.find(n => n.id === targetId);
                if (localNote) {
                    const isLocalOwner = !localNote.shared_owner_id || localNote.shared_owner_id === user.id || localNote.user_id === user.id || localNote.user_id === 'local_user';
                    if (isLocalOwner) {
                        return { isOwner: true, role: 'editor', canEdit: true, hasAccess: true, isRevoked: false };
                    }
                    if (localNote.is_revoked === 1) {
                        return { isOwner: false, role: 'viewer', canEdit: false, hasAccess: false, isRevoked: true };
                    }
                    if (localNote.shared_owner_id && localNote.shared_owner_id !== user.id) {
                        const role = (localNote.collab_role as CollabRole) || 'viewer';
                        return { isOwner: false, role, canEdit: role === 'editor', hasAccess: true, isRevoked: false };
                    }
                }
            }

            // 6. Si no es de nadie más, es un recurso local y propio del usuario
            return { isOwner: true, role: 'editor', canEdit: true, hasAccess: true, isRevoked: false };
        } catch (e) {
            console.warn('[CollaborationService] Error obteniendo permisos de usuario:', e);
            try {
                if (targetType === 'note') {
                    const { useNotesStore } = await import('../store/useNotesStore');
                    const localNote = useNotesStore.getState().notes.find(n => n.id === targetId);
                    if (localNote) {
                        const isLocalOwner = !localNote.shared_owner_id || (currentUserId && localNote.shared_owner_id === currentUserId) || (currentUserId && localNote.user_id === currentUserId) || localNote.user_id === 'local_user';
                        if (isLocalOwner) {
                            return { isOwner: true, role: 'editor', canEdit: true, hasAccess: true, isRevoked: false };
                        }
                        if (localNote.shared_owner_id && (!currentUserId || localNote.shared_owner_id !== currentUserId)) {
                            const isRev = localNote.is_revoked === 1;
                            const role = (localNote.collab_role as CollabRole) || 'viewer';
                            return { isOwner: false, role, canEdit: !isRev && role === 'editor', hasAccess: !isRev, isRevoked: isRev };
                        }
                    }
                }
            } catch {}
            return { isOwner: true, role: 'editor', canEdit: true, hasAccess: true, isRevoked: false };
        }
    },

    /**
     * Obtiene la información del propietario de un recurso compartido (nombre, email, id).
     */
    async getResourceOwner(
        targetType: CollabTargetType,
        targetId: string
    ): Promise<{ id: string; name: string; email?: string } | null> {
        try {
            const { useStore } = await import('../store/useStore');
            const session = useStore.getState().session;
            const currentUserId = session?.user?.id;

            // 1. Consultar primero en la tabla de colaboraciones el owner_id oficial
            const { data: collab } = await supabase
                .from('collaborations')
                .select('owner_id')
                .eq('target_type', targetType)
                .eq('target_id', targetId)
                .limit(1)
                .maybeSingle();

            if (collab?.owner_id) {
                const ownerId = collab.owner_id;

                // Si el owner_id coincide con el usuario actual:
                if (currentUserId && ownerId === currentUserId) {
                    const myName = useStore.getState().userName || session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Tú';
                    return {
                        id: ownerId,
                        name: myName,
                        email: session?.user?.email,
                    };
                }

                // Buscar nombre del propietario en collaboration_activity
                let ownerName: string | undefined;
                const { data: act } = await supabase
                    .from('collaboration_activity')
                    .select('actor_name')
                    .eq('target_type', targetType)
                    .eq('target_id', targetId)
                    .eq('actor_id', ownerId)
                    .not('actor_name', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (act?.actor_name) {
                    ownerName = act.actor_name;
                } else {
                    const { data: anyAct } = await supabase
                        .from('collaboration_activity')
                        .select('actor_name')
                        .eq('actor_id', ownerId)
                        .not('actor_name', 'is', null)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (anyAct?.actor_name) ownerName = anyAct.actor_name;
                }

                return {
                    id: ownerId,
                    name: ownerName || 'Propietario',
                };
            }

            // 1b. Si es una nota sin colaboración directa, verificar si su carpeta contenedora tiene colaboración
            if (targetType === 'note') {
                let folderId: string | null = null;
                try {
                    const { useNotesStore } = await import('../store/useNotesStore');
                    const localNote = useNotesStore.getState().notes.find(n => n.id === targetId);
                    folderId = localNote?.folder_id || null;
                } catch {}

                if (!folderId) {
                    const { data: noteRow } = await supabase.from('notes').select('folder_id').eq('id', targetId).maybeSingle();
                    if (noteRow?.folder_id) folderId = noteRow.folder_id;
                }

                if (folderId) {
                    const folderOwner = await this.getResourceOwner('folder', folderId);
                    if (folderOwner) return folderOwner;
                }
            }

            // 2. Si no está en colaboraciones, verificar en tablas locales si es recurso privado
            if (targetType === 'note') {
                const { useNotesStore } = await import('../store/useNotesStore');
                const note = useNotesStore.getState().notes.find((n) => n.id === targetId);
                if (note && (!note.shared_owner_id || note.shared_owner_id === currentUserId) && note.is_shared !== 1) {
                    const myName = useStore.getState().userName || session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Tú';
                    return {
                        id: currentUserId || '',
                        name: myName,
                        email: session?.user?.email,
                    };
                }
            } else if (targetType === 'folder') {
                const { useFoldersStore } = await import('../store/useFoldersStore');
                const folder = useFoldersStore.getState().folders.find((f) => f.id === targetId);
                if (folder && (!folder.shared_owner_id || folder.shared_owner_id === currentUserId) && folder.is_shared !== 1) {
                    const myName = useStore.getState().userName || session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Tú';
                    return {
                        id: currentUserId || '',
                        name: myName,
                        email: session?.user?.email,
                    };
                }
            } else if (targetType === 'event') {
                const { useEventsStore } = await import('../store/useEventsStore');
                const ev = useEventsStore.getState().events.find((e) => e.id === targetId);
                if (ev && (!ev.shared_owner_id || ev.shared_owner_id === currentUserId) && ev.is_shared !== 1) {
                    const myName = useStore.getState().userName || session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Tú';
                    return {
                        id: currentUserId || '',
                        name: myName,
                        email: session?.user?.email,
                    };
                }
            } else if (targetType === 'reminder') {
                const rem = useStore.getState().reminders.find((r) => r.id === targetId);
                if (rem && (!rem.shared_owner_id || rem.shared_owner_id === currentUserId) && rem.is_shared !== 1) {
                    const myName = useStore.getState().userName || session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Tú';
                    return {
                        id: currentUserId || '',
                        name: myName,
                        email: session?.user?.email,
                    };
                }
            }

            return null;
        } catch (e) {
            console.warn('[CollaborationService] Error obteniendo dueño del recurso:', e);
            return null;
        }
    },
};

/**
 * Paleta de colores vivos y contrastantes para identificar colaboradores concurrentes (estilo Google Docs)
 */
export const COLLAB_COLORS = [
    '#8B5CF6', // Violeta Veyra
    '#10B981', // Esmeralda
    '#F59E0B', // Ámbar cálido
    '#EC4899', // Rosa vibrante
    '#3B82F6', // Azul eléctrico
    '#06B6D4', // Cian brillante
    '#F97316', // Naranja vivo
    '#14B8A6', // Turquesa
    '#E11D48', // Rubí
    '#6366F1', // Índigo profundo
];

/**
 * Obtiene un color consistente para un colaborador a partir de su ID o semilla
 */
export function getCollabColor(idOrSeed?: string): string {
    if (!idOrSeed) return COLLAB_COLORS[0];
    let hash = 0;
    for (let i = 0; i < idOrSeed.length; i++) {
        hash = idOrSeed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

