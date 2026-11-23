-- ============================================================================
-- Fase 4 (01): Tablas núcleo de Almacenamiento Propio, Cuotas y RPCs Atómicas
-- Proyecto: Veyra (Supabase Free: 1 GB total / 50 MB máx. por archivo)
-- ============================================================================

-- 1. Planes configurables de almacenamiento
CREATE TABLE IF NOT EXISTS public.storage_plans (
  plan_code               text PRIMARY KEY CHECK (plan_code IN ('free', 'premium')),
  quota_bytes             bigint NOT NULL CHECK (quota_bytes > 0),
  max_file_bytes          bigint NOT NULL CHECK (max_file_bytes > 0 AND max_file_bytes <= 52428800),
  max_open_reservations   integer NOT NULL DEFAULT 5 CHECK (max_open_reservations > 0),
  reservation_ttl_seconds integer NOT NULL DEFAULT 1800 CHECK (reservation_ttl_seconds >= 60),
  allowed_mime_types      text[] NOT NULL,
  drive_attach_enabled    boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Semilla inicial ajustada al Plan Free de Supabase
INSERT INTO public.storage_plans (
  plan_code,
  quota_bytes,
  max_file_bytes,
  max_open_reservations,
  reservation_ttl_seconds,
  allowed_mime_types,
  drive_attach_enabled
) VALUES
(
  'free',
  52428800,  -- 50 MiB totales
  10485760,  -- 10 MiB por archivo
  5,
  1800,      -- 30 min TTL para subidas TUS
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
  ],
  true
),
(
  'premium',
  314572800, -- 300 MiB totales
  52428800,  -- 50 MiB por archivo (techo global Supabase Free)
  15,
  3600,      -- 60 min TTL
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
  ],
  true
)
ON CONFLICT (plan_code) DO UPDATE SET
  quota_bytes             = EXCLUDED.quota_bytes,
  max_file_bytes          = EXCLUDED.max_file_bytes,
  max_open_reservations   = EXCLUDED.max_open_reservations,
  reservation_ttl_seconds = EXCLUDED.reservation_ttl_seconds,
  allowed_mime_types      = EXCLUDED.allowed_mime_types,
  updated_at              = now();

ALTER TABLE public.storage_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_plans FROM anon, authenticated;
GRANT SELECT ON public.storage_plans TO authenticated;

CREATE POLICY "storage_plans_select_authenticated"
  ON public.storage_plans FOR SELECT TO authenticated
  USING (true);

-- 2. Tabla polimórfica de adjuntos (unifica notes, reminders y events)
--    'legacy_unlinked' solo se usa en backfill para objetos históricos de Yjs/huérfanos.
CREATE TABLE IF NOT EXISTS public.attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type         text NOT NULL CHECK (target_type IN ('note', 'reminder', 'event', 'legacy_unlinked')),
  target_id           text,
  created_by          uuid NOT NULL REFERENCES auth.users(id),
  storage_owner_id    uuid NOT NULL REFERENCES auth.users(id),
  provider            text NOT NULL CHECK (provider IN ('supabase', 'google_drive')),
  storage_bucket      text,
  storage_path        text,
  drive_file_id       text,
  integration_id      uuid,
  drive_account_sub   text,
  name                text NOT NULL,
  mime_type           text NOT NULL,
  size_bytes          bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  checksum_sha256     text,
  drive_md5           text,
  drive_modified_time timestamptz,
  thumbnail_path      text,
  thumbnail_meta      jsonb,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  availability        text NOT NULL DEFAULT 'pending_upload'
                      CHECK (availability IN ('pending_upload', 'available', 'unavailable', 'failed', 'pending_delete')),
  unavailable_reason  text
                      CHECK (unavailable_reason IS NULL OR unavailable_reason IN (
                        'drive_disconnected', 'permission_revoked', 'needs_reauth',
                        'file_deleted', 'file_inaccessible', 'account_changed',
                        'owner_deleted', 'provider_error'
                      )),
  unavailable_since   timestamptz,
  last_verified_at    timestamptz,
  source_attachment_id uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Invariantes conceptuales (§7.2)
  CONSTRAINT chk_attachments_target CHECK (
    target_type = 'legacy_unlinked'
    OR (target_id IS NOT NULL AND length(btrim(target_id)) > 0)
  ),
  CONSTRAINT chk_attachments_provider_fields CHECK (
    (provider = 'supabase'
      AND storage_bucket IS NOT NULL AND storage_path IS NOT NULL
      AND drive_file_id IS NULL AND integration_id IS NULL AND drive_account_sub IS NULL)
    OR
    (provider = 'google_drive'
      AND drive_file_id IS NOT NULL AND integration_id IS NOT NULL AND drive_account_sub IS NOT NULL
      AND storage_bucket IS NULL AND storage_path IS NULL)
  ),
  CONSTRAINT chk_attachments_unavailable_reason CHECK (
    (availability = 'unavailable' AND unavailable_reason IS NOT NULL)
    OR (availability <> 'unavailable' AND unavailable_reason IS NULL)
  ),
  CONSTRAINT chk_attachments_supabase_available CHECK (
    provider <> 'supabase'
    OR availability <> 'available'
    OR (size_bytes IS NOT NULL AND checksum_sha256 IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attachments_storage_object
  ON public.attachments (storage_bucket, storage_path)
  WHERE storage_bucket IS NOT NULL AND storage_path IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attachments_drive_target
  ON public.attachments (target_type, target_id, drive_file_id, integration_id)
  WHERE deleted_at IS NULL AND drive_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_target
  ON public.attachments (target_type, target_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_owner_state
  ON public.attachments (storage_owner_id, provider, availability);

CREATE INDEX IF NOT EXISTS idx_attachments_legacy_path
  ON public.attachments ((metadata->>'legacy_path'))
  WHERE metadata ? 'legacy_path';

-- 3. Contabilidad de consumo por propietario
CREATE TABLE IF NOT EXISTS public.storage_usage (
  storage_owner_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  used_bytes         bigint NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  reserved_bytes     bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  last_reconciled_at timestamptz
);

ALTER TABLE public.storage_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_usage FROM anon, authenticated;
GRANT SELECT ON public.storage_usage TO authenticated;

CREATE POLICY "storage_usage_select_own"
  ON public.storage_usage FOR SELECT TO authenticated
  USING (storage_owner_id = (SELECT auth.uid()));

-- 4. Reservas efímeras de subida (1 reserva = 1 ruta determinista)
CREATE TABLE IF NOT EXISTS public.upload_reservations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES auth.users(id),
  attachment_id  uuid NOT NULL UNIQUE REFERENCES public.attachments(id) ON DELETE CASCADE,
  bucket_id      text NOT NULL,
  path           text NOT NULL,
  reserved_bytes bigint NOT NULL CHECK (reserved_bytes > 0),
  max_bytes      bigint NOT NULL CHECK (max_bytes >= reserved_bytes),
  actual_bytes   bigint CHECK (actual_bytes IS NULL OR actual_bytes >= 0),
  status         text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'consumed', 'expired', 'released', 'violated')),
  expires_at     timestamptz NOT NULL,
  consumed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_upload_reservations_bucket_path UNIQUE (bucket_id, path)
);

CREATE INDEX IF NOT EXISTS idx_upload_reservations_owner_active
  ON public.upload_reservations (owner_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_upload_reservations_expiring
  ON public.upload_reservations (expires_at)
  WHERE status = 'active';

ALTER TABLE public.upload_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_reservations FROM anon, authenticated;
GRANT SELECT ON public.upload_reservations TO authenticated;

CREATE POLICY "upload_reservations_select_own"
  ON public.upload_reservations FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- 5. Cola idempotente de borrado físico (evita storage.protect_delete() y libera cuota solo al confirmar)
CREATE TABLE IF NOT EXISTS public.storage_deletion_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id   uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  bucket_id       text NOT NULL,
  path            text NOT NULL,
  size_bytes      bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  owner_id        uuid NOT NULL REFERENCES auth.users(id),
  reason          text NOT NULL CHECK (reason IN (
                    'user_deleted', 'quota_violation', 'reservation_expired',
                    'orphan_cleanup', 'account_deleted'
                  )),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'deleting', 'confirmed', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_storage_deletion_queue_pending
  ON public.storage_deletion_queue (next_attempt_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.storage_deletion_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_deletion_queue FROM anon, authenticated;

-- 6. Funciones polimórficas de autorización (alineadas a notes/folders/reminders/events/collaborations)
CREATE OR REPLACE FUNCTION public.can_edit_attachment_target(
  p_target_type text,
  p_target_id   text,
  p_user_id     uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (p_user_id IS NOT NULL) AND CASE p_target_type
    WHEN 'note' THEN (
      EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = p_target_id
          AND COALESCE(n.deleted, 0) = 0
          AND (
            n.user_id = p_user_id
            OR EXISTS (
              SELECT 1 FROM public.collaborations c
              WHERE c.target_type = 'note' AND c.target_id = n.id
                AND (c.owner_id = p_user_id OR (c.member_id = p_user_id AND c.role = 'editor'))
            )
            OR (
              n.folder_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.collaborations c
                WHERE c.target_type = 'folder' AND c.target_id = n.folder_id
                  AND (c.owner_id = p_user_id OR (c.member_id = p_user_id AND c.role = 'editor'))
              )
            )
          )
      )
    )
    WHEN 'reminder' THEN (
      EXISTS (
        SELECT 1 FROM public.reminders r
        WHERE r.id = p_target_id
          AND COALESCE(r.deleted, 0) = 0
          AND (
            r.user_id = p_user_id
            OR EXISTS (
              SELECT 1 FROM public.collaborations c
              WHERE c.target_type = 'reminder' AND c.target_id = r.id
                AND (c.owner_id = p_user_id OR (c.member_id = p_user_id AND c.role = 'editor'))
            )
          )
      )
    )
    WHEN 'event' THEN (
      EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_target_id
          AND COALESCE(e.deleted, 0) = 0
          AND (
            e.user_id = p_user_id
            OR EXISTS (
              SELECT 1 FROM public.collaborations c
              WHERE c.target_type = 'event' AND c.target_id = e.id
                AND (c.owner_id = p_user_id OR (c.member_id = p_user_id AND c.role = 'editor'))
            )
          )
      )
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_attachment_target(
  p_target_type text,
  p_target_id   text,
  p_user_id     uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (p_user_id IS NOT NULL) AND CASE p_target_type
    WHEN 'note' THEN (
      EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = p_target_id
          AND (
            n.user_id = p_user_id
            OR (
              COALESCE(n.deleted, 0) = 0 AND (
                EXISTS (
                  SELECT 1 FROM public.collaborations c
                  WHERE c.target_type = 'note' AND c.target_id = n.id
                    AND (c.owner_id = p_user_id OR (c.member_id = p_user_id AND c.role IN ('viewer', 'editor')))
                )
                OR (
                  n.folder_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.collaborations c
                    WHERE c.target_type = 'folder' AND c.target_id = n.folder_id
                      AND (c.owner_id = p_user_id OR (c.member_id = p_user_id AND c.role IN ('viewer', 'editor')))
                  )
                )
              )
            )
          )
      )
    )
    WHEN 'reminder' THEN (
      EXISTS (
        SELECT 1 FROM public.reminders r
        WHERE r.id = p_target_id
          AND (
            r.user_id = p_user_id
            OR (
              COALESCE(r.deleted, 0) = 0 AND EXISTS (
                SELECT 1 FROM public.collaborations c
                WHERE c.target_type = 'reminder' AND c.target_id = r.id
                  AND (c.owner_id = p_user_id OR c.member_id = p_user_id)
              )
            )
          )
      )
    )
    WHEN 'event' THEN (
      EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_target_id
          AND (
            e.user_id = p_user_id
            OR (
              COALESCE(e.deleted, 0) = 0 AND EXISTS (
                SELECT 1 FROM public.collaborations c
                WHERE c.target_type = 'event' AND c.target_id = e.id
                  AND (c.owner_id = p_user_id OR c.member_id = p_user_id)
              )
            )
          )
      )
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.can_edit_attachment_target(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_attachment_target(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_attachment_target(text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_attachment_target(text, text, uuid) TO authenticated, service_role;

-- RLS en public.attachments: solo SELECT de adjuntos finalizados visibles (mutaciones solo vía Edge Functions)
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attachments FROM anon, authenticated;
GRANT SELECT ON public.attachments TO authenticated;

CREATE POLICY "attachments_select_authorized"
  ON public.attachments FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND availability <> 'pending_upload'
    AND (
      storage_owner_id = (SELECT auth.uid())
      OR public.can_read_attachment_target(target_type, target_id, (SELECT auth.uid()))
    )
  );

-- 7. RPC ATÓMICA: Reservar cuota (bloqueo FOR UPDATE por usuario, sin condiciones de carrera)
CREATE OR REPLACE FUNCTION public.rpc_reserve_upload_quota(
  p_owner_id       uuid,
  p_target_type    text,
  p_target_id      text,
  p_bucket_id      text,
  p_original_name  text,
  p_sanitized_name text,
  p_mime_type      text,
  p_size_bytes     bigint
)
RETURNS TABLE (
  reservation_id  uuid,
  attachment_id   uuid,
  bucket_id       text,
  storage_path    text,
  max_bytes       bigint,
  expires_at      timestamptz,
  remaining_bytes bigint,
  plan_code       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_premium    boolean := false;
  v_plan          public.storage_plans%ROWTYPE;
  v_usage         public.storage_usage%ROWTYPE;
  v_open_count    integer;
  v_attachment_id uuid := gen_random_uuid();
  v_res_id        uuid := gen_random_uuid();
  v_path          text;
  v_expires_at    timestamptz;
BEGIN
  IF p_target_type NOT IN ('note', 'reminder', 'event') THEN
    RAISE EXCEPTION 'INVALID_TARGET_TYPE' USING ERRCODE = '22023';
  END IF;

  IF p_size_bytes IS NULL OR p_size_bytes <= 0 THEN
    RAISE EXCEPTION 'INVALID_SIZE_BYTES' USING ERRCODE = '22023';
  END IF;

  -- Determinar plan desde public.profiles
  SELECT COALESCE(p.is_premium, false)
    INTO v_is_premium
  FROM public.profiles p
  WHERE p.id = p_owner_id;

  SELECT *
    INTO v_plan
  FROM public.storage_plans sp
  WHERE sp.plan_code = CASE WHEN v_is_premium THEN 'premium' ELSE 'free' END;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  IF p_size_bytes > v_plan.max_file_bytes THEN
    RAISE EXCEPTION 'FILE_TOO_LARGE:%', v_plan.max_file_bytes USING ERRCODE = 'P0001';
  END IF;

  IF NOT (p_mime_type = ANY(v_plan.allowed_mime_types)) THEN
    RAISE EXCEPTION 'UNSUPPORTED_MIME:%', p_mime_type USING ERRCODE = 'P0001';
  END IF;

  -- Garantizar fila en storage_usage y serializar concurrencia por usuario
  INSERT INTO public.storage_usage (storage_owner_id, used_bytes, reserved_bytes)
  VALUES (p_owner_id, 0, 0)
  ON CONFLICT (storage_owner_id) DO NOTHING;

  SELECT *
    INTO v_usage
  FROM public.storage_usage su
  WHERE su.storage_owner_id = p_owner_id
  FOR UPDATE;

  -- Contar reservas activas no expiradas
  SELECT count(*)
    INTO v_open_count
  FROM public.upload_reservations r
  WHERE r.owner_id = p_owner_id
    AND r.status = 'active'
    AND r.expires_at > pg_catalog.now();

  IF v_open_count >= v_plan.max_open_reservations THEN
    RAISE EXCEPTION 'TOO_MANY_RESERVATIONS:%', v_plan.max_open_reservations USING ERRCODE = 'P0001';
  END IF;

  -- Verificar cuota disponible (used + reserved + nueva reserva <= quota)
  IF (v_usage.used_bytes + v_usage.reserved_bytes + p_size_bytes) > v_plan.quota_bytes THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED:%:%',
      GREATEST(0, v_plan.quota_bytes - v_usage.used_bytes - v_usage.reserved_bytes),
      v_plan.quota_bytes
      USING ERRCODE = 'P0001';
  END IF;

  v_path := p_owner_id::text || '/' || v_attachment_id::text || '/' || p_sanitized_name;
  v_expires_at := pg_catalog.now() + make_interval(secs => v_plan.reservation_ttl_seconds);

  INSERT INTO public.attachments (
    id, target_type, target_id, created_by, storage_owner_id,
    provider, storage_bucket, storage_path,
    name, mime_type, size_bytes, availability
  ) VALUES (
    v_attachment_id, p_target_type, p_target_id, p_owner_id, p_owner_id,
    'supabase', p_bucket_id, v_path,
    p_original_name, p_mime_type, p_size_bytes, 'pending_upload'
  );

  INSERT INTO public.upload_reservations (
    id, owner_id, attachment_id, bucket_id, path,
    reserved_bytes, max_bytes, status, expires_at
  ) VALUES (
    v_res_id, p_owner_id, v_attachment_id, p_bucket_id, v_path,
    p_size_bytes, p_size_bytes, 'active', v_expires_at
  );

  UPDATE public.storage_usage
  SET reserved_bytes = reserved_bytes + p_size_bytes,
      updated_at     = pg_catalog.now()
  WHERE storage_owner_id = p_owner_id;

  RETURN QUERY SELECT
    v_res_id,
    v_attachment_id,
    p_bucket_id,
    v_path,
    p_size_bytes,
    v_expires_at,
    GREATEST(0, v_plan.quota_bytes - (v_usage.used_bytes + v_usage.reserved_bytes + p_size_bytes)),
    v_plan.plan_code;
END;
$$;

-- 8. RPC ATÓMICA: Finalizar subida verificada (contempla §10.3.5: sobre-subida y cola de borrado)
CREATE OR REPLACE FUNCTION public.rpc_finalize_upload(
  p_reservation_id uuid,
  p_owner_id       uuid,
  p_actual_bytes   bigint,
  p_detected_mime  text,
  p_sha256         text
)
RETURNS TABLE (
  outcome         text,
  attachment_id   uuid,
  availability    text,
  size_bytes      bigint,
  mime_type       text,
  checksum_sha256 text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_res        public.upload_reservations%ROWTYPE;
  v_usage      public.storage_usage%ROWTYPE;
  v_plan       public.storage_plans%ROWTYPE;
  v_att        public.attachments%ROWTYPE;
  v_is_premium boolean := false;
  v_new_res    bigint;
BEGIN
  SELECT *
    INTO v_res
  FROM public.upload_reservations r
  WHERE r.id = p_reservation_id
    AND r.owner_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotencia si el cliente reintenta un finalize ya completado
  IF v_res.status = 'consumed' THEN
    SELECT * INTO v_att FROM public.attachments a WHERE a.id = v_res.attachment_id;
    RETURN QUERY SELECT 'already_consumed'::text, v_att.id, v_att.availability, v_att.size_bytes, v_att.mime_type, v_att.checksum_sha256;
    RETURN;
  END IF;

  IF v_res.status <> 'active' THEN
    RAISE EXCEPTION 'RESERVATION_NOT_ACTIVE:%', v_res.status USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(p.is_premium, false) INTO v_is_premium
  FROM public.profiles p WHERE p.id = p_owner_id;

  SELECT * INTO v_plan
  FROM public.storage_plans sp
  WHERE sp.plan_code = CASE WHEN v_is_premium THEN 'premium' ELSE 'free' END;

  SELECT * INTO v_usage
  FROM public.storage_usage su
  WHERE su.storage_owner_id = p_owner_id
  FOR UPDATE;

  v_new_res := GREATEST(0, v_usage.reserved_bytes - v_res.reserved_bytes);

  -- Caso A: MIME real prohibido o tamaño real excede cuota/techo del plan -> violación y cola de borrado
  IF NOT (p_detected_mime = ANY(v_plan.allowed_mime_types))
     OR p_actual_bytes > v_plan.max_file_bytes
     OR (p_actual_bytes > v_res.max_bytes AND (v_usage.used_bytes + v_new_res + p_actual_bytes) > v_plan.quota_bytes)
  THEN
    UPDATE public.upload_reservations
    SET status = 'violated', actual_bytes = p_actual_bytes, consumed_at = pg_catalog.now()
    WHERE id = v_res.id;

    -- El objeto físico aún existe: computa en used_bytes hasta que deletion-worker confirme borrado (§10.5)
    UPDATE public.storage_usage
    SET reserved_bytes = v_new_res,
        used_bytes     = used_bytes + p_actual_bytes,
        updated_at     = pg_catalog.now()
    WHERE storage_owner_id = p_owner_id;

    UPDATE public.attachments
    SET availability = 'failed',
        size_bytes   = p_actual_bytes,
        mime_type    = p_detected_mime,
        checksum_sha256 = p_sha256,
        deleted_at   = pg_catalog.now(),
        metadata     = metadata || jsonb_build_object(
          'quota_or_mime_violation', true,
          'reserved_bytes', v_res.reserved_bytes,
          'actual_bytes', p_actual_bytes,
          'detected_mime', p_detected_mime
        ),
        updated_at   = pg_catalog.now()
    WHERE id = v_res.attachment_id;

    INSERT INTO public.storage_deletion_queue (
      attachment_id, bucket_id, path, size_bytes, owner_id, reason, idempotency_key
    ) VALUES (
      v_res.attachment_id, v_res.bucket_id, v_res.path, p_actual_bytes, p_owner_id,
      'quota_violation', v_res.bucket_id || ':' || v_res.path || ':' || v_res.attachment_id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN QUERY SELECT 'violated_queued_delete'::text, v_res.attachment_id, 'failed'::text, p_actual_bytes, p_detected_mime, p_sha256;
    RETURN;
  END IF;

  -- Caso B: Tamaño real excedió la reserva pero cabe en el plan -> marcar violated, cobrar tamaño real y aceptar
  IF p_actual_bytes > v_res.max_bytes THEN
    UPDATE public.upload_reservations
    SET status = 'violated', actual_bytes = p_actual_bytes, consumed_at = pg_catalog.now()
    WHERE id = v_res.id;

    UPDATE public.storage_usage
    SET reserved_bytes = v_new_res,
        used_bytes     = used_bytes + p_actual_bytes,
        updated_at     = pg_catalog.now()
    WHERE storage_owner_id = p_owner_id;

    UPDATE public.attachments
    SET availability    = 'available',
        size_bytes      = p_actual_bytes,
        mime_type       = p_detected_mime,
        checksum_sha256 = p_sha256,
        metadata        = metadata || jsonb_build_object(
          'size_overage_charged', true,
          'reserved_bytes', v_res.reserved_bytes,
          'actual_bytes', p_actual_bytes
        ),
        updated_at      = pg_catalog.now()
    WHERE id = v_res.attachment_id;

    RETURN QUERY SELECT 'violated_charged'::text, v_res.attachment_id, 'available'::text, p_actual_bytes, p_detected_mime, p_sha256;
    RETURN;
  END IF;

  -- Caso C (normal): actual_bytes <= max_bytes -> consumir reserva y activar adjunto
  UPDATE public.upload_reservations
  SET status = 'consumed', actual_bytes = p_actual_bytes, consumed_at = pg_catalog.now()
  WHERE id = v_res.id;

  UPDATE public.storage_usage
  SET reserved_bytes = v_new_res,
      used_bytes     = used_bytes + p_actual_bytes,
      updated_at     = pg_catalog.now()
  WHERE storage_owner_id = p_owner_id;

  UPDATE public.attachments
  SET availability    = 'available',
      size_bytes      = p_actual_bytes,
      mime_type       = p_detected_mime,
      checksum_sha256 = p_sha256,
      updated_at      = pg_catalog.now()
  WHERE id = v_res.attachment_id;

  RETURN QUERY SELECT 'ok'::text, v_res.attachment_id, 'available'::text, p_actual_bytes, p_detected_mime, p_sha256;
END;
$$;

-- 9. RPC auxiliar para reconciliar storage_usage (usada por backfill y reconciler cron)
CREATE OR REPLACE FUNCTION public.rpc_reconcile_storage_usage()
RETURNS TABLE (storage_owner_id uuid, used_bytes bigint, reserved_bytes bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH calc_used AS (
    SELECT a.storage_owner_id AS uid, COALESCE(SUM(a.size_bytes), 0)::bigint AS bytes
    FROM public.attachments a
    WHERE a.provider = 'supabase'
      AND (
        a.availability IN ('available', 'pending_delete')
        OR (a.availability = 'unavailable' AND a.storage_path IS NOT NULL)
        OR EXISTS (
          SELECT 1 FROM public.storage_deletion_queue q
          WHERE q.attachment_id = a.id AND q.status <> 'confirmed'
        )
      )
    GROUP BY a.storage_owner_id
  ),
  calc_res AS (
    SELECT r.owner_id AS uid, COALESCE(SUM(r.reserved_bytes), 0)::bigint AS bytes
    FROM public.upload_reservations r
    WHERE r.status = 'active' AND r.expires_at > pg_catalog.now()
    GROUP BY r.owner_id
  ),
  owners AS (
    SELECT uid FROM calc_used
    UNION SELECT uid FROM calc_res
    UNION SELECT su.storage_owner_id FROM public.storage_usage su
  )
  INSERT INTO public.storage_usage (storage_owner_id, used_bytes, reserved_bytes, updated_at, last_reconciled_at)
  SELECT
    o.uid,
    COALESCE(cu.bytes, 0),
    COALESCE(cr.bytes, 0),
    pg_catalog.now(),
    pg_catalog.now()
  FROM owners o
  LEFT JOIN calc_used cu ON cu.uid = o.uid
  LEFT JOIN calc_res  cr ON cr.uid = o.uid
  ON CONFLICT (storage_owner_id) DO UPDATE SET
    used_bytes         = EXCLUDED.used_bytes,
    reserved_bytes     = EXCLUDED.reserved_bytes,
    updated_at         = pg_catalog.now(),
    last_reconciled_at = pg_catalog.now()
  RETURNING public.storage_usage.storage_owner_id, public.storage_usage.used_bytes, public.storage_usage.reserved_bytes;
END;
$$;

-- Permisos estrictos: solo service_role invoca las RPCs mutadoras
REVOKE ALL ON FUNCTION public.rpc_reserve_upload_quota(uuid, text, text, text, text, text, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_finalize_upload(uuid, uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_reconcile_storage_usage() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_reserve_upload_quota(uuid, text, text, text, text, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_upload(uuid, uuid, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_storage_usage() TO service_role;
