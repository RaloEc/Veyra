// Supabase Edge Function: notify-state-change
// Disparada por Database Webhook / Trigger en la tabla 'reminders'
// Notifica a los demás dispositivos para que cierren/descarguen la notificación al instante ("Completar en un lado cierra todos")

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import * as webPush from 'https://esm.sh/web-push@3.6.7?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || 'BN6CaKHTF5yD1p3DhLk7Wg9bcChY4OrYA7t8SSfsZ8Ca5BGU6qVRmzcb7kGU9QNkHLMyJ2exCnGMOMOpEIvKqQg';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || 'MqjjQWUlfIYV-v911pFFiOYvZqzDWRZ7rr6hbGl8IxY';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@veyra.app';

try {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.warn('[notify-state-change] WebPush VAPID config warning:', e);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const record = body.record;
    const oldRecord = body.old_record;

    if (!record) {
      return new Response(JSON.stringify({ error: 'No record provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reminderId = record.id;
    const userId = record.user_id;
    const status = record.status;
    const isCompleted = status === 'completed';
    const isDeleted = record.deleted === 1;

    // Solo nos interesa descartar si se completó, pospuso o eliminó
    const isSnoozed = record.snooze_until_ms && oldRecord && record.snooze_until_ms !== oldRecord.snooze_until_ms;

    if (!isCompleted && !isDeleted && !isSnoozed) {
      return new Response(JSON.stringify({ message: 'No dismiss needed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Silent dismiss push a suscripciones Web Push del usuario
    const { data: webSubs } = await supabase
      .from('web_push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId);

    let webDismissed = 0;
    if (webSubs && webSubs.length > 0) {
      const dismissPayload = JSON.stringify({
        type: 'dismiss',
        reminderId,
      });

      for (const sub of webSubs) {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            dismissPayload
          );
          webDismissed++;
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await supabase.from('web_push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }
    }

    // 2. Silent push a Expo (móvil) con data payload { type: 'dismiss', reminderId }
    const { data: pushTokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId);

    let mobileDismissed = 0;
    const validTokens = (pushTokens || []).map((t) => t.token).filter(Boolean);

    if (validTokens.length > 0) {
      const expoMessages = validTokens.map((token) => ({
        to: token,
        _contentAvailable: true, // Silent background notification on iOS & Android
        data: {
          type: 'dismiss',
          reminderId,
        },
      }));

      try {
        const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(expoMessages),
        });
        if (expoRes.ok) {
          mobileDismissed = expoMessages.length;
        }
      } catch (expoErr) {
        console.error('[notify-state-change] Expo dismiss error:', expoErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        reminderId,
        webDismissed,
        mobileDismissed,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    console.error('[notify-state-change] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

