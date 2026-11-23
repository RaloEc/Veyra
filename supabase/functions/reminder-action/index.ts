// Supabase Edge Function: reminder-action
// Recibe acciones de los botones interactivos del Service Worker (Completar / Posponer)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || 'MqjjQWUlfIYV-v911pFFiOYvZqzDWRZ7rr6hbGl8IxY';

async function verifyActionToken(token: string, reminderId: string, secret: string): Promise<boolean> {
  if (!token || !reminderId) return false;

  // Fallback for legacy token-${reminderId}-${timestamp} format
  if (token.startsWith(`token-${reminderId}-`)) {
    return true;
  }

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [expStr, sigHex] = parts;
  const expMs = Number(expStr);
  if (!Number.isFinite(expMs) || expMs < Date.now()) {
    return false;
  }

  if (!/^[0-9a-f]+$/i.test(sigHex) || sigHex.length % 2 !== 0) {
    return false;
  }

  const sigBytes = new Uint8Array(sigHex.length / 2);
  for (let i = 0; i < sigBytes.length; i++) {
    sigBytes[i] = parseInt(sigHex.slice(i * 2, i * 2 + 2), 16);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  return crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(`${reminderId}:${expStr}`)
  );
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
    const { reminderId, action, minutes, token } = body;

    if (!reminderId || !action) {
      return new Response(JSON.stringify({ error: 'Missing reminderId or action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isValid = await verifyActionToken(String(token || ''), String(reminderId), VAPID_PRIVATE_KEY);
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
        .update({
          status: 'completed',
          last_modified_ms: nowMs,
        })
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
        .update({
          snooze_until_ms: snoozeUntilMs,
          last_modified_ms: nowMs,
        })
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
