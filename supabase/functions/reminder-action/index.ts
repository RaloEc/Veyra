// Supabase Edge Function: reminder-action
// Recibe acciones de los botones interactivos del Service Worker (Completar / Posponer)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { reminderId, action, minutes } = body;

    if (!reminderId || !action) {
      return new Response(JSON.stringify({ error: 'Missing reminderId or action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nowMs = Date.now();

    if (action === 'complete') {
      const { error } = await supabase
        .from('reminders')
        .update({
          status: 'completed',
          last_modified_ms: nowMs,
        })
        .eq('id', reminderId);

      if (error) throw error;
    } else if (action === 'snooze') {
      const snoozeMinutes = typeof minutes === 'number' && minutes > 0 ? minutes : 10;
      const snoozeUntilMs = nowMs + snoozeMinutes * 60 * 1000;

      const { error } = await supabase
        .from('reminders')
        .update({
          snooze_until_ms: snoozeUntilMs,
          last_modified_ms: nowMs,
        })
        .eq('id', reminderId);

      if (error) throw error;
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

