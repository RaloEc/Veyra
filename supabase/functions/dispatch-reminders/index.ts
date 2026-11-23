// Supabase Edge Function: dispatch-reminders
// Ejecutado periódicamente (pg_cron cada minuto o webhook)
// Consulta recordatorios y eventos debidos y envía Web Push a las suscripciones activas

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

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

interface UserPushSettings {
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  defaultLeadMinutes: number;
  timezone: string;
}

async function signActionToken(reminderId: string, expMs: number, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${reminderId}:${expMs}`)
  );
  const sigHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${expMs}.${sigHex}`;
}

function parseMinutes(hhmm: string): number {
  const [hStr, mStr] = (hhmm || '').split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function isWithinQuietHours(nowMs: number, startStr: string, endStr: string, timeZone: string): boolean {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date(nowMs));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const curMin = hour * 60 + minute;
    const startMin = parseMinutes(startStr);
    const endMin = parseMinutes(endStr);

    if (startMin === endMin) return false;
    if (startMin > endMin) {
      return curMin >= startMin || curMin < endMin;
    }
    return curMin >= startMin && curMin < endMin;
  } catch {
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const nowMs = Date.now();
    const lowerBoundMs = nowMs - 30 * 60 * 1000;
    const maxLeadLookaheadMs = nowMs + 60 * 60 * 1000;

    // Cache user settings & subscriptions per user_id during this invocation
    const userSettingsCache = new Map<string, UserPushSettings>();
    const userSubsCache = new Map<string, Array<{ id: string; endpoint: string; p256dh: string; auth: string }>>();

    const getUserSettings = async (userId: string): Promise<UserPushSettings> => {
      const cached = userSettingsCache.get(userId);
      if (cached) return cached;

      const defaults: UserPushSettings = {
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        defaultLeadMinutes: 0,
        timezone: 'UTC',
      };

      try {
        const { data } = await supabase.auth.admin.getUserById(userId);
        const raw = data?.user?.user_metadata?.settings || {};
        const resolved: UserPushSettings = {
          quietHoursEnabled: Boolean(raw.quietHoursEnabled),
          quietHoursStart: typeof raw.quietHoursStart === 'string' ? raw.quietHoursStart : '22:00',
          quietHoursEnd: typeof raw.quietHoursEnd === 'string' ? raw.quietHoursEnd : '07:00',
          defaultLeadMinutes: typeof raw.defaultLeadMinutes === 'number' ? raw.defaultLeadMinutes : 0,
          timezone: typeof raw.timezone === 'string' && raw.timezone ? raw.timezone : 'UTC',
        };
        userSettingsCache.set(userId, resolved);
        return resolved;
      } catch {
        userSettingsCache.set(userId, defaults);
        return defaults;
      }
    };

    const getUserSubs = async (userId: string) => {
      if (userSubsCache.has(userId)) return userSubsCache.get(userId)!;
      const { data: subs } = await supabase
        .from('web_push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', userId);
      const list = subs || [];
      userSubsCache.set(userId, list);
      return list;
    };

    const sendPushToSubs = async (
      subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
      payloadStr: string
    ): Promise<number> => {
      let sent = 0;
      for (const sub of subs) {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payloadStr
          );
          sent++;
        } catch (pushErr: unknown) {
          const errorStatus = (pushErr as { statusCode?: number })?.statusCode;
          console.warn('[dispatch-reminders] Error sending to endpoint:', errorStatus);
          if (errorStatus === 404 || errorStatus === 410) {
            await supabase.from('web_push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }
      return sent;
    };

    let dispatchedCount = 0;

    // 1. Process pending, non-deleted reminders (including lookahead for lead minutes)
    const { data: reminders, error: remError } = await supabase
      .from('reminders')
      .select('id, user_id, title, description, due_date_ms, snooze_until_ms, control_level, offset_minutes')
      .eq('status', 'pending')
      .eq('deleted', 0)
      .or(`due_date_ms.lte.${maxLeadLookaheadMs},snooze_until_ms.lte.${nowMs}`);

    if (remError) {
      console.error('[dispatch-reminders] Error fetching reminders:', remError);
    }

    for (const rem of reminders || []) {
      const settings = await getUserSettings(rem.user_id);
      const isSnoozed = Boolean(rem.snooze_until_ms && rem.snooze_until_ms > 0);
      const effectiveDueMs = isSnoozed ? rem.snooze_until_ms! : rem.due_date_ms;
      const leadMinutes = isSnoozed
        ? 0
        : (typeof rem.offset_minutes === 'number' ? rem.offset_minutes : settings.defaultLeadMinutes);
      const leadTriggerMs = rem.due_date_ms - Math.max(0, leadMinutes) * 60 * 1000;

      const level = rem.control_level || 'normal';
      let attemptType: string | null = null;

      if (effectiveDueMs >= lowerBoundMs && effectiveDueMs <= nowMs) {
        const elapsedMs = nowMs - effectiveDueMs;
        attemptType = 'base';
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
      } else if (!isSnoozed && leadMinutes > 0 && nowMs >= leadTriggerMs && nowMs < rem.due_date_ms && leadTriggerMs >= lowerBoundMs) {
        attemptType = 'lead';
      }

      if (!attemptType) continue;

      const { data: existingDelivery } = await supabase
        .from('notification_deliveries')
        .select('id')
        .eq('reminder_id', rem.id)
        .eq('attempt_type', attemptType)
        .maybeSingle();

      if (existingDelivery) continue;

      const subs = await getUserSubs(rem.user_id);
      if (subs.length === 0) continue;

      const isQuiet =
        settings.quietHoursEnabled &&
        level !== 'critical' &&
        isWithinQuietHours(nowMs, settings.quietHoursStart, settings.quietHoursEnd, settings.timezone);

      const actionToken = await signActionToken(rem.id, nowMs + 24 * 60 * 60 * 1000, VAPID_PRIVATE_KEY);
      const titlePrefix = attemptType === 'lead'
        ? `⏰ En ${leadMinutes} min: `
        : level === 'critical'
          ? '🚨 Urgente: '
          : '';

      const pushPayload = JSON.stringify({
        title: `${titlePrefix}${rem.title}`,
        body: rem.description || 'Recordatorio de Veyra',
        reminderId: rem.id,
        level,
        silent: isQuiet,
        actionToken,
      });

      const sent = await sendPushToSubs(subs, pushPayload);
      dispatchedCount += sent;

      await supabase.from('notification_deliveries').insert({
        reminder_id: rem.id,
        user_id: rem.user_id,
        attempt_type: attemptType,
      });
    }

    // 2. Process upcoming non-deleted calendar events within max offset (7 days)
    const maxEventLookaheadMs = nowMs + 7 * 24 * 60 * 60 * 1000;
    const { data: events, error: evError } = await supabase
      .from('events')
      .select('id, user_id, title, description, location, start_time_ms, timezone, notification_offset_min, notification_offsets')
      .eq('deleted', 0)
      .gte('start_time_ms', nowMs - 15 * 60 * 1000)
      .lte('start_time_ms', maxEventLookaheadMs);

    if (evError) {
      console.error('[dispatch-reminders] Error fetching events:', evError);
    }

    for (const ev of events || []) {
      const settings = await getUserSettings(ev.user_id);

      let offsets: number[] = [];
      if (ev.notification_offsets) {
        try {
          const parsed = JSON.parse(ev.notification_offsets);
          if (Array.isArray(parsed)) {
            offsets = parsed.map(Number).filter((n) => Number.isFinite(n) && n >= 0);
          }
        } catch {
          // ignore malformed JSON
        }
      }
      if (offsets.length === 0) {
        const fallbackOffset =
          typeof ev.notification_offset_min === 'number'
            ? ev.notification_offset_min
            : (settings.defaultLeadMinutes || 15);
        offsets = [fallbackOffset];
      }

      const subs = await getUserSubs(ev.user_id);
      if (subs.length === 0) continue;

      const tz = ev.timezone || settings.timezone || 'UTC';
      const isQuiet =
        settings.quietHoursEnabled &&
        isWithinQuietHours(nowMs, settings.quietHoursStart, settings.quietHoursEnd, tz);

      for (const offsetMin of offsets) {
        const triggerMs = Number(ev.start_time_ms) - offsetMin * 60 * 1000;
        if (triggerMs > nowMs || triggerMs < lowerBoundMs) continue;

        const attemptKey = `offset_${offsetMin}_${ev.start_time_ms}`;
        const { data: existingEvDelivery } = await supabase
          .from('event_notification_deliveries')
          .select('id')
          .eq('event_id', ev.id)
          .eq('attempt_key', attemptKey)
          .maybeSingle();

        if (existingEvDelivery) continue;

        const eventTitle = offsetMin === 0 ? ev.title : `📅 En ${offsetMin} min: ${ev.title}`;
        const eventBody = ev.description || (ev.location ? `Ubicación: ${ev.location}` : 'Evento agendado en Veyra');

        const pushPayload = JSON.stringify({
          title: eventTitle,
          body: eventBody,
          url: `/events/${ev.id}`,
          tag: `event-${ev.id}-${offsetMin}`,
          level: 'normal',
          silent: isQuiet,
        });

        const sent = await sendPushToSubs(subs, pushPayload);
        dispatchedCount += sent;

        await supabase.from('event_notification_deliveries').insert({
          event_id: ev.id,
          user_id: ev.user_id,
          attempt_key: attemptKey,
        });
      }
    }

    return new Response(
      JSON.stringify({
        dispatched: dispatchedCount,
        processedReminders: (reminders || []).length,
        processedEvents: (events || []).length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    console.error('[dispatch-reminders] Fatal:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
