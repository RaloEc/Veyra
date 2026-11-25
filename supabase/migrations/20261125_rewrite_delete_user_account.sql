-- T2.2: Reescribir RPC public.delete_user_account() con encolado Storage + transacción atómica (V-10)
-- Fecha: 2026-11-25

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authenticated user';
  END IF;

  -- 1. Encolar adjuntos físicos registrados en public.attachments
  INSERT INTO public.storage_deletion_queue (
    attachment_id,
    bucket_id,
    path,
    size_bytes,
    owner_id,
    reason,
    status,
    idempotency_key
  )
  SELECT
    a.id,
    a.storage_bucket,
    a.storage_path,
    COALESCE(a.size_bytes, 0),
    v_user_id,
    'account_deleted',
    'pending',
    'acct-del:' || v_user_id::text || ':' || a.storage_bucket || ':' || a.storage_path
  FROM public.attachments a
  WHERE a.storage_owner_id = v_user_id
    AND a.storage_bucket IS NOT NULL
    AND a.storage_path IS NOT NULL
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- 2. Encolar cualquier objeto remanente del usuario en storage.objects
  INSERT INTO public.storage_deletion_queue (
    attachment_id,
    bucket_id,
    path,
    size_bytes,
    owner_id,
    reason,
    status,
    idempotency_key
  )
  SELECT
    NULL,
    o.bucket_id,
    o.name,
    COALESCE((o.metadata->>'size')::bigint, 0),
    v_user_id,
    'account_deleted',
    'pending',
    'acct-del:' || v_user_id::text || ':' || o.bucket_id || ':' || o.name
  FROM storage.objects o
  WHERE o.owner = v_user_id
    AND o.bucket_id IS NOT NULL
    AND o.name IS NOT NULL
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- 3. Eliminar usuario en auth.users (dispara ON DELETE CASCADE en datos y SET NULL en storage_deletion_queue)
  -- Si cualquier sentencia falla, PostgreSQL revierte toda la transacción automáticamente.
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
