import { supabase } from '../lib/supabase';
import { APP_CONFIG } from '../constants/appConfig';
import {
    CollabTargetType,
    CollabRole,
    ShareInvitation,
    Collaboration,
    CollaboratorMember,
    CollaborationActivity,
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
        role: CollabRole = 'editor',
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

        return {
            invitation: data as ShareInvitation,
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
        const cleanCode = code.trim();
        if (!cleanCode) return null;

        const { data, error } = await supabase
            .from('share_invitations')
            .select('*')
            .eq('invite_code', cleanCode)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();

        if (error || !data) {
            return null;
        }

        // Obtener email del creador si existe perfil público
        let ownerEmail: string | undefined;
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', data.owner_id)
                .maybeSingle();
            ownerEmail = profile?.email;
        } catch {
            // No crítico
        }

        return {
            invitation: data as ShareInvitation,
            ownerEmail,
        };
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
    }> {
        const cleanCode = code.trim();
        if (!cleanCode) {
            throw new Error('Código de invitación no válido');
        }

        const { data, error } = await supabase.rpc('accept_share_invitation', {
            p_invite_code: cleanCode,
        });

        if (error) {
            throw new Error(error.message || 'Error al aceptar la invitación');
        }

        return {
            success: true,
            collaborationId: data.collaboration_id,
            targetType: data.target_type,
            targetId: data.target_id,
            targetName: data.target_name,
            role: data.role,
        };
    },

    /**
     * Obtiene la lista de colaboradores activos para un elemento.
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

        // Obtener perfiles de los miembros
        const memberIds = collabs.map((c) => c.member_id);
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', memberIds);

        const emailMap = new Map<string, string>();
        if (profiles) {
            for (const p of profiles) {
                emailMap.set(p.id, p.email);
            }
        }

        return collabs.map((c) => ({
            collaboration_id: c.id,
            member_id: c.member_id,
            email: emailMap.get(c.member_id) || 'Usuario',
            role: c.role as CollabRole,
            joined_at: c.joined_at,
            is_owner: false,
        }));
    },

    /**
     * Revoca el acceso a un miembro (solo el propietario puede hacerlo).
     */
    async revokeAccess(collaborationId: string): Promise<boolean> {
        const { error } = await supabase
            .from('collaborations')
            .delete()
            .eq('id', collaborationId);

        if (error) {
            throw new Error(error.message || 'No se pudo revocar el acceso');
        }
        return true;
    },

    /**
     * Actualiza el rol de un miembro (editor o viewer). Solo el propietario puede hacerlo.
     */
    async updateRole(collaborationId: string, role: CollabRole): Promise<boolean> {
        const { error } = await supabase
            .from('collaborations')
            .update({ role })
            .eq('id', collaborationId);

        if (error) {
            throw new Error(error.message || 'No se pudo actualizar el rol');
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

            const actorName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Un colaborador';

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
            const payload: any = {
                target_type: targetType,
                target_id: targetId,
                actor_id: user.id,
                actor_name: user.email || 'Usuario',
                action,
                item_title: itemTitle || undefined,
                details: details || undefined,
            };

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

            return true;
        } catch (e) {
            console.warn('[CollaborationService] Error actualizando visibilidad de miembros:', e);
            return false;
        }
    },
};
