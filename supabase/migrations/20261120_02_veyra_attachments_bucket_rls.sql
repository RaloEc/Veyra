-- ============================================================================
-- Fase 4 (02): Bucket privado 'veyra-attachments' + RLS INSERT-only con reserva
-- ============================================================================

-- 1. Crear bucket privado con techo 50 MiB y allowlist MIME (sin HTML/SVG)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'veyra-attachments',
  'veyra-attachments',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm',
    'video/mp4', 'video/webm',
    'application/zip'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Función SECURITY DEFINER validada en P11 (search_path vacío)
CREATE OR REPLACE FUNCTION public.has_active_upload_reservation(
  p_bucket_id text,
  p_path      text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.upload_reservations r
    WHERE r.owner_id = (SELECT auth.uid())
      AND r.bucket_id = p_bucket_id
      AND r.path = p_path
      AND r.status = 'active'
      AND r.expires_at > pg_catalog.now()
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_upload_reservation(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_upload_reservation(text, text) TO authenticated;

-- 3. Política INSERT-only en storage.objects para 'veyra-attachments'
--    SIN políticas SELECT, UPDATE ni DELETE para clientes:
--    - Lectura: URLs firmadas (TTL 5 min) desde Edge Function autorizada.
--    - Sobrescritura/borrado: prohibidos desde cliente (inmutable + deletion-worker).
DROP POLICY IF EXISTS "veyra_attachments_insert_with_reservation" ON storage.objects;

CREATE POLICY "veyra_attachments_insert_with_reservation"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'veyra-attachments'
    AND public.has_active_upload_reservation(bucket_id, name)
  );
