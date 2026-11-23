-- Migration: Auto-create public.profiles row on auth.users signup & normalize default_control_level
-- Also prepares background push cron/triggers (applied in Step 1.2)

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, user_profile, default_control_level, is_premium, onboarding_completed, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    'equilibrado',
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->'settings'->>'defaultControlLevel', 'normal') = 'gentle' THEN 'normal'
      ELSE COALESCE(NEW.raw_user_meta_data->'settings'->>'defaultControlLevel', 'normal')
    END,
    CASE WHEN LOWER(TRIM(COALESCE(NEW.email, ''))) = 'ricardo.lopez.18.ralo@gmail.com' THEN TRUE ELSE FALSE END,
    FALSE,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill any existing auth.users missing a profile row
INSERT INTO public.profiles (id, email, user_profile, default_control_level, is_premium, onboarding_completed, updated_at)
SELECT
  u.id,
  u.email,
  'equilibrado',
  CASE
    WHEN COALESCE(u.raw_user_meta_data->'settings'->>'defaultControlLevel', 'normal') = 'gentle' THEN 'normal'
    ELSE COALESCE(u.raw_user_meta_data->'settings'->>'defaultControlLevel', 'normal')
  END,
  CASE WHEN LOWER(TRIM(COALESCE(u.email, ''))) = 'ricardo.lopez.18.ralo@gmail.com' THEN TRUE ELSE FALSE END,
  TRUE,
  NOW()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Normalize any legacy 'gentle' default_control_level in profiles to 'normal'
UPDATE public.profiles SET default_control_level = 'normal' WHERE default_control_level = 'gentle';

-- ──────────────────────────────────────────────────────────────────────────────
-- Step 1.2: Background Web Push Delivery Tracking, pg_cron & notify-state-change
-- ──────────────────────────────────────────────────────────────────────────────

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

CREATE OR REPLACE FUNCTION public.fn_notify_reminder_state_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT := 'https://rrwoompvuggcczggfgiq.supabase.co/functions/v1/notify-state-change';
  v_anon_jwt TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyd29vbXB2dWdnY2N6Z2dmZ2lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MzQ0MTQsImV4cCI6MjEwNzUxMDQxNH0.aRpjMpXflAOfh-hWIG6XBGW0FPoN91IoYR9FIQsE4fo';
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
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyd29vbXB2dWdnY2N6Z2dmZ2lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MzQ0MTQsImV4cCI6MjEwNzUxMDQxNH0.aRpjMpXflAOfh-hWIG6XBGW0FPoN91IoYR9FIQsE4fo", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyd29vbXB2dWdnY2N6Z2dmZ2lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MzQ0MTQsImV4cCI6MjEwNzUxMDQxNH0.aRpjMpXflAOfh-hWIG6XBGW0FPoN91IoYR9FIQsE4fo"}'::jsonb,
      body := '{}'::jsonb
    );
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule pg_cron job: %', SQLERRM;
END $$;
