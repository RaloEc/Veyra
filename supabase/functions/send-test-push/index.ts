// Supabase Edge Function: send-test-push
// Sends an end-to-end encrypted Web Push test notification to the authenticated user's subscriptions.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { sendWebPushNotification } from '../_shared/webpush.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENV_VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
const ENV_VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');

if (!ENV_VAPID_PUBLIC || !ENV_VAPID_PRIVATE) {
  console.warn('[send-test-push] VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY secret not configured; using fallback keys.');
}

const VAPID_PUBLIC_KEY =
  ENV_VAPID_PUBLIC ||
  'BN6CaKHTF5yD1p3DhLk7Wg9bcChY4OrYA7t8SSfsZ8Ca5BGU6qVRmzcb7kGU9QNkHLMyJ2exCnGMOMOpEIvKqQg';
const VAPID_PRIVATE_KEY =
  ENV_VAPID_PRIVATE ||
  'MqjjQWUlfIYV-v911pFFiOYvZqzDWRZ7rr6hbGl8IxY';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@veyra.app';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing Authorization token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    const user = userData?.user;
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let endpointFilter: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.endpoint === 'string' && body.endpoint.trim()) {
        endpointFilter = body.endpoint.trim();
      }
    } catch {
      // Empty body is valid
    }

    let query = supabase
      .from('web_push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', user.id);

    if (endpointFilter) {
      query = query.eq('endpoint', endpointFilter);
    }

    const { data: subs, error: subsError } = await query;
    if (subsError) {
      throw subsError;
    }

    const list = subs || [];
    if (list.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          sent: 0,
          failed: 0,
          total: 0,
          expiredRemoved: 0,
          errors: ['No hay suscripciones Web Push registradas para este dispositivo/usuario.'],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const payload = JSON.stringify({
      title: 'Veyra — Prueba de notificaciones',
      body: '¡Las notificaciones Push Web están funcionando correctamente!',
      tag: 'veyra-test-push',
      url: '/',
      level: 'normal',
      silent: false,
    });

    let sent = 0;
    let failed = 0;
    let expiredRemoved = 0;
    const errors: string[] = [];

    for (const sub of list) {
      const res = await sendWebPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        {
          subject: VAPID_SUBJECT,
          publicKey: VAPID_PUBLIC_KEY,
          privateKey: VAPID_PRIVATE_KEY,
        },
        { urgency: 'high', ttl: 300 }
      );

      if (res.ok) {
        sent++;
      } else {
        failed++;
        if (res.error) errors.push(`HTTP ${res.status}: ${res.error}`);
        if (res.expired) {
          await supabase.from('web_push_subscriptions').delete().eq('id', sub.id);
          expiredRemoved++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: sent > 0,
        sent,
        failed,
        total: list.length,
        expiredRemoved,
        errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    console.error('[send-test-push] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
