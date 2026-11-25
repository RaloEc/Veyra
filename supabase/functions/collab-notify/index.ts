// Supabase Edge Function: collab-notify
// Notifica a los miembros y dueños de un recurso compartido (Móvil vía Expo + Web vía Web Push)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import * as webPush from 'https://esm.sh/web-push@3.6.7?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@veyra.app';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error('[collab-notify] VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY secret not configured');
}

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

interface NotifyPayload {
  targetType: 'folder' | 'reminder' | 'note' | 'event';
  targetId: string;
  actorId: string;
  actorName: string;
  action: 'completed' | 'uncompleted' | 'edited' | 'added' | 'deleted';
  itemTitle: string;
  details?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: NotifyPayload = await req.json();
    const { targetType, targetId, actorId, actorName, action, itemTitle, details } = payload;

    if (!targetType || !targetId || !actorId) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Obtener colaboraciones directas para este recurso
    const { data: directCollabs, error: collabsError } = await supabase
      .from('collaborations')
      .select('owner_id, member_id')
      .eq('target_type', targetType)
      .eq('target_id', targetId);

    if (collabsError) {
      console.error('[collab-notify] Error fetching collaborations:', collabsError);
    }

    const allCollabs = directCollabs ? [...directCollabs] : [];

    // Si el ítem no tiene colaboración directa pero es una nota o recordatorio, verificar si su carpeta está compartida
    if (targetType === 'note') {
      const { data: noteData } = await supabase
        .from('notes')
        .select('folder_id')
        .eq('id', targetId)
        .maybeSingle();

      if (noteData?.folder_id) {
        const { data: folderCollabs } = await supabase
          .from('collaborations')
          .select('owner_id, member_id')
          .eq('target_type', 'folder')
          .eq('target_id', noteData.folder_id);

        if (folderCollabs) {
          allCollabs.push(...folderCollabs);
        }
      }
    } else if (targetType === 'reminder') {
      const { data: remData } = await supabase
        .from('reminders')
        .select('folder_id')
        .eq('id', targetId)
        .maybeSingle();

      if (remData?.folder_id) {
        const { data: folderCollabs } = await supabase
          .from('collaborations')
          .select('owner_id, member_id')
          .eq('target_type', 'folder')
          .eq('target_id', remData.folder_id);

        if (folderCollabs) {
          allCollabs.push(...folderCollabs);
        }
      }
    }

    // 2. Extraer destinatarios únicos excluyendo al autor de la acción
    const candidateIds = new Set<string>();
    for (const c of allCollabs) {
      if (c.owner_id) candidateIds.add(c.owner_id);
      if (c.member_id) candidateIds.add(c.member_id);
    }

    candidateIds.delete(actorId);
    const recipientIds = Array.from(candidateIds);

    // 3. Registrar siempre la actividad en el log de auditoría
    await supabase.from('collaboration_activity').insert({
      target_type: targetType,
      target_id: targetId,
      actor_id: actorId,
      actor_name: actorName || 'Un colaborador',
      action,
      details: details || null,
    });

    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No recipients to notify' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Construir cuerpo del mensaje
    const name = actorName || 'Un colaborador';
    const title = itemTitle || 'un elemento';

    let bodyText = `${name} actualizó: ${title}`;
    switch (action) {
      case 'completed':
        bodyText = `${name} completó: "${title}" ✅`;
        break;
      case 'uncompleted':
        bodyText = `${name} reactivó: "${title}" 🔄`;
        break;
      case 'edited': {
        let editSummary = '';
        if (details && typeof details === 'string' && details.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(details);
            if (parsed.summary) editSummary = parsed.summary.toLowerCase();
          } catch {}
        }
        bodyText = editSummary ? `${name} ${editSummary} en "${title}" ✏️` : `${name} editó: "${title}" ✏️`;
        break;
      }
      case 'added':
        bodyText = `${name} agregó un nuevo elemento: "${title}" ➕`;
        break;
      case 'deleted':
        bodyText = `${name} eliminó: "${title}" 🗑️`;
        break;
    }

    // 5. Enviar a Móvil (Expo Push API)
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', recipientIds);

    const validTokens = (tokens || []).map((t) => t.token).filter(Boolean);
    let expoSent = 0;

    if (validTokens.length > 0) {
      const pushMessages = validTokens.map((token) => ({
        to: token,
        sound: 'default',
        title: 'Veyra Colaboración',
        body: bodyText,
        data: {
          targetType,
          targetId,
          action,
        },
      }));

      try {
        const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(pushMessages),
        });
        if (expoRes.ok) {
          expoSent = pushMessages.length;
        }
      } catch (expoErr) {
        console.error('[collab-notify] Expo send error:', expoErr);
      }
    }

    // 6. Enviar a Web (Web Push API)
    const { data: webSubs } = await supabase
      .from('web_push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', recipientIds);

    let webSent = 0;
    if (webSubs && webSubs.length > 0) {
      const webPayload = JSON.stringify({
        title: 'Veyra Colaboración',
        body: bodyText,
        url: targetType === 'reminder' ? `/reminders/${targetId}` : `/notes/${targetId}`,
        tag: `collab-${targetType}-${targetId}`,
      });

      for (const sub of webSubs) {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          };
          await webPush.sendNotification(pushSubscription, webPayload);
          webSent++;
        } catch (pushErr: unknown) {
          const errorStatus = (pushErr as { statusCode?: number })?.statusCode;
          if (errorStatus === 404 || errorStatus === 410) {
            await supabase.from('web_push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        expoSent,
        webSent,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    console.error('[collab-notify] Unexpected error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
