-- RECONSTRUIDO DESDE CATÁLOGO — NO ES EL SQL ORIGINAL
-- Version: 20261118235832 | Slug: auto_create_profile_on_signup
-- Fuente: supabase_migrations.schema_migrations / pg_policies / pg_proc / pg_trigger / pg_constraint el 2026-11-25
-- Para referencia futura. No re-aplicar a proyecto nuevo sin validar.

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
    CASE WHEN LOWER(TRIM(COALESCE(NEW.email, ''))) = 'r***@gmail.com' THEN TRUE ELSE FALSE END,
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

INSERT INTO public.profiles (id, email, user_profile, default_control_level, is_premium, onboarding_completed, updated_at)
SELECT
  u.id,
  u.email,
  'equilibrado',
  CASE
    WHEN COALESCE(u.raw_user_meta_data->'settings'->>'defaultControlLevel', 'normal') = 'gentle' THEN 'normal'
    ELSE COALESCE(u.raw_user_meta_data->'settings'->>'defaultControlLevel', 'normal')
  END,
  CASE WHEN LOWER(TRIM(COALESCE(u.email, ''))) = 'r***@gmail.com' THEN TRUE ELSE FALSE END,
  TRUE,
  NOW()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles SET default_control_level = 'normal' WHERE default_control_level = 'gentle';
