-- Migration: Remove 'strict' control level, migrating existing 'strict' and 'gentle' records to 'normal'
-- Also updates public.handle_new_auth_user() to only allow 'normal' or 'critical'.

-- 1. Normalize existing reminders (bump last_modified_ms so offline mobile clients pull the change)
UPDATE public.reminders
SET
  control_level = 'normal',
  priority = 0,
  last_modified_ms = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
WHERE LOWER(COALESCE(control_level, '')) IN ('strict', 'gentle');

-- 2. Normalize existing profiles
UPDATE public.profiles
SET
  default_control_level = 'normal',
  updated_at = NOW()
WHERE LOWER(COALESCE(default_control_level, '')) IN ('strict', 'gentle');

-- 3. Normalize auth.users metadata settings.defaultControlLevel
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  raw_user_meta_data,
  '{settings,defaultControlLevel}',
  '"normal"'::jsonb,
  false
)
WHERE LOWER(COALESCE(raw_user_meta_data->'settings'->>'defaultControlLevel', '')) IN ('strict', 'gentle');

-- 4. Update handle_new_auth_user trigger function so new signups only get 'normal' or 'critical'
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
      WHEN LOWER(COALESCE(NEW.raw_user_meta_data->'settings'->>'defaultControlLevel', 'normal')) = 'critical' THEN 'critical'
      ELSE 'normal'
    END,
    CASE WHEN LOWER(TRIM(COALESCE(NEW.email, ''))) = 'ricardo.lopez.18.ralo@gmail.com' THEN TRUE ELSE FALSE END,
    FALSE,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
