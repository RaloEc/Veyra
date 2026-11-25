-- RECONSTRUIDO DESDE CATÁLOGO — NO ES EL SQL ORIGINAL
-- Version: 20261120010948 | Slug: poc_phase_0b_cleanup_schema
-- Fuente: supabase_migrations.schema_migrations / pg_policies / pg_proc / pg_trigger / pg_constraint el 2026-11-25
-- Para referencia futura. No re-aplicar a proyecto nuevo sin validar.

DROP POLICY IF EXISTS "poc_drive_v31_insert_with_reservation" ON storage.objects;
DROP POLICY IF EXISTS "poc_users_select_own_reservations" ON public.poc_upload_reservations;
DROP POLICY IF EXISTS "poc_users_insert_own_reservations" ON public.poc_upload_reservations;
DROP TABLE IF EXISTS public.poc_upload_reservations CASCADE;
DROP FUNCTION IF EXISTS public.poc_has_active_reservation(text, text);
