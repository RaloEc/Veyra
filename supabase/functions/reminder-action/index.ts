// Supabase Edge Function: reminder-action
// Executes notification quick actions (complete / snooze) after strict HMAC verification.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { verifyActionToken } from '../_shared/actionToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENV_VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
if (!ENV_VAPID_PRIVATE) {
  console.warn('[reminder-action] VAPID_PRIVATE_KEY secret not configured; using fallback key.');
}
const VAPID_PRIVATE_KEY = ENV_VAPID_PRIVATE || 'MqjjQWUlfIYV-v911pFFiOYvZqzDWRZ7rr6hbGl8IxY';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    const body = await req.json();
    const { reminderId, action, minutes, token } = body ?? {};

    if (!reminderId || !action) {
      return new Response(JSON.stringify({ error: 'Missing reminderId or action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action !== 'complete' && action !== 'snooze') {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isValid = await verifyActionToken(
      String(token || ''),
      String(reminderId),
      VAPID_PRIVATE_KEY
    );
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid or expired action token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nowMs = Date.now();
    if (action === 'complete') {
      const { data: updated, error } = await supabase
        .from('reminders')
        .update({ status: 'completed', last_modified_ms: nowMs })
        .eq('id', reminderId)
        .select('user_id')
        .maybeSingle();
      if (error) throw error;
      if (updated?.user_id) {
        await supabase.from('compliance_events').insert({
          id: crypto.randomUUID(),
          user_id: updated.user_id,
          reminder_id: reminderId,
          event_type: 'completed',
          timestamp_ms: nowMs,
          synced: 1,
        });
      }
    } else if (action === 'snooze') {
      const snoozeMinutes = typeof minutes === 'number' && minutes > 0 ? minutes : 10;
      const snoozeUntilMs = nowMs + snoozeMinutes * 60 * 1000;
      const { data: updated, error } = await supabase
        .from('reminders')
        .update({ snooze_until_ms: snoozeUntilMs, last_modified_ms: nowMs })
        .eq('id', reminderId)
        .select('user_id')
        .maybeSingle();
      if (error) throw error;
      if (updated?.user_id) {
        await supabase.from('compliance_events').insert({
          id: crypto.randomUUID(),
          user_id: updated.user_id,
          reminder_id: reminderId,
          event_type: 'snoozed',
          timestamp_ms: nowMs,
          synced: 1,
        });
      }
    }

    return new Response(JSON.stringify({ success: true, reminderId, action }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    console.error('[reminder-action] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
