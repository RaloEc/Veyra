-- RECONSTRUIDO DESDE CATÁLOGO — NO ES EL SQL ORIGINAL
-- Version: 20261118235933 | Slug: enable_push_cron_and_triggers
-- Fuente: supabase_migrations.schema_migrations / pg_policies / pg_proc / pg_trigger / pg_constraint el 2026-11-25
-- Para referencia futura. No re-aplicar a proyecto nuevo sin validar.

-- 1. Additive table for tracking event Web Push deliveries (without modifying notification_deliveries FK)
CREATE TABLE IF NOT EXISTS public.event_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_key TEXT NOT NULL,
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, attempt_key)
);

ALTER TABLE public.event_notification_deliveries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'event_notification_deliveries' AND policyname = 'Users can read own event deliveries'
  ) THEN
    CREATE POLICY "Users can read own event deliveries"
      ON public.event_notification_deliveries
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- 2. Enable pg_net and pg_cron safely
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create extension pg_net: %', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create extension pg_cron: %', SQLERRM;
END $$;

-- 3. Trigger function to invoke notify-state-change on reminder completion/snooze/delete
CREATE OR REPLACE FUNCTION public.fn_notify_reminder_state_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT := 'https://rrwoompvuggcczggfgiq.supabase.co/functions/v1/notify-state-change';
  v_anon_jwt TEXT := '<REDACTED_ANON_JWT>';
BEGIN
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_jwt,
      'apikey', v_anon_jwt
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'reminders',
      'schema', 'public',
      'record', to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block reminder updates if pg_net fails
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_reminder_state_change ON public.reminders;
CREATE TRIGGER trg_notify_reminder_state_change
  AFTER UPDATE ON public.reminders
  FOR EACH ROW
  WHEN (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.deleted IS DISTINCT FROM OLD.deleted
    OR NEW.snooze_until_ms IS DISTINCT FROM OLD.snooze_until_ms
  )
  EXECUTE FUNCTION public.fn_notify_reminder_state_change();

-- 4. Schedule dispatch-reminders every minute via pg_cron
DO $$
DECLARE
  v_existing_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_existing_job_id FROM cron.job WHERE jobname = 'veyra-dispatch-reminders';
  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'veyra-dispatch-reminders',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://rrwoompvuggcczggfgiq.supabase.co/functions/v1/dispatch-reminders',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer <REDACTED_ANON_JWT>", "apikey": "<REDACTED_ANON_JWT>"}'::jsonb,
      body := '{}'::jsonb
    );
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule pg_cron job: %', SQLERRM;
END $$;
