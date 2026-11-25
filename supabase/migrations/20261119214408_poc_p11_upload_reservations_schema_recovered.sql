-- RECONSTRUIDO DESDE CATÁLOGO — NO ES EL SQL ORIGINAL
-- Version: 20261119214408 | Slug: poc_p11_upload_reservations_schema
-- Fuente: supabase_migrations.schema_migrations / pg_policies / pg_proc / pg_trigger / pg_constraint el 2026-11-25
-- Para referencia futura. No re-aplicar a proyecto nuevo sin validar.

-- 1. Ensure private bucket poc-drive-v31 exists and is private
INSERT INTO storage.buckets (id, name, public)
VALUES ('poc-drive-v31', 'poc-drive-v31', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Create ephemeral reservation table
CREATE TABLE IF NOT EXISTS public.poc_upload_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  bucket_id text NOT NULL,
  path text NOT NULL,
  reserved_bytes bigint NOT NULL,
  max_bytes bigint NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS and create policies for poc_upload_reservations
ALTER TABLE public.poc_upload_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "poc_users_select_own_reservations" ON public.poc_upload_reservations;
CREATE POLICY "poc_users_select_own_reservations"
  ON public.poc_upload_reservations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "poc_users_insert_own_reservations" ON public.poc_upload_reservations;
CREATE POLICY "poc_users_insert_own_reservations"
  ON public.poc_upload_reservations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. Create SECURITY DEFINER validation function with empty search_path
CREATE OR REPLACE FUNCTION public.poc_has_active_reservation(p_bucket_id text, p_path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.poc_upload_reservations AS r
    WHERE r.user_id = (SELECT auth.uid())
      AND r.bucket_id = p_bucket_id
      AND r.path = p_path
      AND r.status = 'active'
      AND r.expires_at > pg_catalog.now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.poc_has_active_reservation(text, text) TO authenticated, anon;

-- 5. Create INSERT-only policy on storage.objects for bucket poc-drive-v31 (no UPDATE or DELETE policies)
DROP POLICY IF EXISTS "poc_drive_v31_insert_with_reservation" ON storage.objects;
CREATE POLICY "poc_drive_v31_insert_with_reservation"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'poc-drive-v31'
    AND public.poc_has_active_reservation(bucket_id, name)
  );
