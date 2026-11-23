-- =============================================================================
-- Veyra Phase 5 — Migration 04: RPC de borrado lógico de adjuntos
-- Permite a clientes autenticados autorizados marcar `deleted_at` / `pending_delete`
-- y encolar la eliminación física en `storage_deletion_queue` sin otorgar UPDATE/INSERT
-- directo sobre `public.attachments` ni `public.storage_deletion_queue`.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_soft_delete_attachment(
  p_attachment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.attachments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_attachment_id IS NULL THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'invalid_id');
  END IF;

  SELECT *
  INTO v_att
  FROM public.attachments
  WHERE id = p_attachment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'not_found');
  END IF;

  IF v_att.storage_owner_id <> v_uid
     AND NOT public.can_edit_attachment_target(v_att.target_type, v_att.target_id, v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF v_att.deleted_at IS NULL THEN
    UPDATE public.attachments
    SET deleted_at = now(),
        availability = CASE
          WHEN provider = 'supabase' THEN 'pending_delete'
          ELSE 'unavailable'
        END,
        unavailable_reason = CASE
          WHEN provider = 'supabase' THEN NULL
          ELSE 'file_deleted'
        END,
        unavailable_since = CASE
          WHEN provider = 'supabase' THEN unavailable_since
          ELSE COALESCE(unavailable_since, now())
        END,
        updated_at = now()
    WHERE id = p_attachment_id;
  END IF;

  IF v_att.provider = 'supabase'
     AND v_att.storage_bucket IS NOT NULL
     AND v_att.storage_path IS NOT NULL THEN
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
    VALUES (
      v_att.id,
      v_att.storage_bucket,
      v_att.storage_path,
      COALESCE(v_att.size_bytes, 0),
      v_att.storage_owner_id,
      'user_deleted',
      'pending',
      'user_deleted:' || v_att.id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'already_deleted', (v_att.deleted_at IS NOT NULL),
    'attachment_id', p_attachment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_soft_delete_attachment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_soft_delete_attachment(uuid) TO authenticated, service_role;
