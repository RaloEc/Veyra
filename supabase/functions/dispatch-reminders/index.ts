// Supabase Edge Function: dispatch-reminders
// Ejecutado periódicamente (pg_cron cada minuto o webhook)
// Consulta recordatorios debidos y envía Web Push a las suscripciones activas

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
// Web Push encryption in standard Web Crypto / Deno
import * as webPush from 'https://esm.sh/web-push@3.6.7?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || 'BN6CaKHTF5yD1p3DhLk7Wg9bcChY4OrYA7t8SSfsZ8Ca5BGU6qVRmzcb7kGU9QNkHLMyJ2exCnGMOMOpEIvKqQg';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || 'MqjjQWUlfIYV-v911pFFiOYvZqzDWRZ7rr6hbGl8IxY';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@veyra.app';

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const nowMs = Date.now();
    // Consider reminders within the last 30 minutes up to now
    const lowerBoundMs = nowMs - 30 * 60 * 1000;

    // 1. Fetch pending, non-deleted reminders around due date
    const { data: reminders, error: remError } = await supabase
      .from('reminders')
      .select('id, user_id, title, description, due_date_ms, snooze_until_ms, control_level')
      .eq('status', 'pending')
      .eq('deleted', 0)
      .or(`due_date_ms.lte.${nowMs},snooze_until_ms.lte.${nowMs}`);

    if (remError) {
      console.error('[dispatch-reminders] Error fetching reminders:', remError);
      return new Response(JSON.stringify({ error: remError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ dispatched: 0, message: 'No reminders due' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let dispatchedCount = 0;

    for (const rem of reminders) {
      const effectiveDueMs = (rem.snooze_until_ms && rem.snooze_until_ms > 0) ? rem.snooze_until_ms : rem.due_date_ms;
      if (effectiveDueMs < lowerBoundMs || effectiveDueMs > nowMs) {
        continue;
      }

      const level = rem.control_level || 'normal';
      const elapsedMs = nowMs - effectiveDueMs;

      // Determine attempt type based on elapsed and control level
      let attemptType = 'base';
      if (level === 'strict') {
        if (elapsedMs >= 30 * 60 * 1000) attemptType = 'strict_2';
        else if (elapsedMs >= 15 * 60 * 1000) attemptType = 'strict_1';
      } else if (level === 'critical') {
        if (elapsedMs >= 25 * 60 * 1000) attemptType = 'critical_5';
        else if (elapsedMs >= 20 * 60 * 1000) attemptType = 'critical_4';
        else if (elapsedMs >= 15 * 60 * 1000) attemptType = 'critical_3';
        else if (elapsedMs >= 10 * 60 * 1000) attemptType = 'critical_2';
        else if (elapsedMs >= 5 * 60 * 1000) attemptType = 'critical_1';
      }

      // Check if delivery was already registered
      const { data: existingDelivery } = await supabase
        .from('notification_deliveries')
        .select('id')
        .eq('reminder_id', rem.id)
        .eq('attempt_type', attemptType)
        .maybeSingle();

      if (existingDelivery) {
        continue; // Already dispatched for this phase
      }

      // Get user's web push subscriptions
      const { data: subs } = await supabase
        .from('web_push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', rem.user_id);

      if (!subs || subs.length === 0) {
        continue;
      }

      // Prepare payload
      const pushPayload = JSON.stringify({
        title: level === 'critical' ? `🚨 Urgente: ${rem.title}` : rem.title,
        body: rem.description || 'Recordatorio de Veyra',
        reminderId: rem.id,
        level: level,
        actionToken: `token-${rem.id}-${nowMs}`,
      });

      for (const sub of subs) {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          };

          await webPush.sendNotification(pushSubscription, pushPayload);
          dispatchedCount++;
        } catch (pushErr: unknown) {
          const errorStatus = (pushErr as { statusCode?: number })?.statusCode;
          console.warn('[dispatch-reminders] Error sending to endpoint:', errorStatus);
          // If 404 or 410 Gone, prune stale subscription
          if (errorStatus === 404 || errorStatus === 410) {
            await supabase.from('web_push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }

      // Record successful delivery attempt
      await supabase.from('notification_deliveries').insert({
        reminder_id: rem.id,
        user_id: rem.user_id,
        attempt_type: attemptType,
      });
    }

    return new Response(JSON.stringify({ dispatched: dispatchedCount, processed: reminders.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    console.error('[dispatch-reminders] Fatal:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

