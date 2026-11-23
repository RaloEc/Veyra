-- ============================================================================
-- Fase 6 (01): Integraciones Google Drive, cifrado en Supabase Vault y RPCs
-- Proyecto: Veyra (rrwoompvuggcczggfgiq)
-- ============================================================================

-- 1. Tabla de integraciones (acceso 0 desde cliente; solo backend/service_role)
CREATE TABLE IF NOT EXISTS public.user_integrations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider                text NOT NULL DEFAULT 'google_drive'
                          CHECK (provider IN ('google_drive')),
  google_sub              text NOT NULL, -- Drive user.permissionId (inmutable, funciona con scope drive.file)
  google_email            text,          -- Solo informativo para UI, nunca clave de identidad
  oauth_client_kind       text NOT NULL
                          CHECK (oauth_client_kind IN ('web', 'android_server_auth', 'ios_public')),
  oauth_client_id         text NOT NULL, -- Client ID exacto usado al emitir/refrescar el token (§4.2)
  refresh_token_secret_id uuid,          -- Referencia al secreto cifrado en vault.secrets
  scopes                  text[] NOT NULL DEFAULT ARRAY['https://www.googleapis.com/auth/drive.file'],
  status                  text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'needs_reauth', 'revoked', 'disconnected')),
  disconnect_requested    boolean NOT NULL DEFAULT false,
  last_error_code         text,
  last_error_at           timestamptz,
  connected_at            timestamptz NOT NULL DEFAULT now(),
  last_refreshed_at       timestamptz,
  disconnected_at         timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_user_integrations_user_provider UNIQUE (user_id, provider),
  CONSTRAINT chk_user_integrations_secret_when_active CHECK (
    status <> 'active' OR refresh_token_secret_id IS NOT NULL
  ),
  CONSTRAINT chk_user_integrations_sub_nonempty CHECK (length(btrim(google_sub)) > 0),
  CONSTRAINT chk_user_integrations_client_id_nonempty CHECK (length(btrim(oauth_client_id)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_status
  ON public.user_integrations (provider, status);

-- Seguridad máxima (§10.1): RLS activa, 0 políticas para anon/authenticated y REVOKE total
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_integrations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_integrations TO service_role;

-- 2. Integridad referencial con public.attachments (ya creada en Fase 4)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_attachments_integration'
      AND conrelid = 'public.attachments'::regclass
  ) THEN
    ALTER TABLE public.attachments
      ADD CONSTRAINT fk_attachments_integration
      FOREIGN KEY (integration_id)
      REFERENCES public.user_integrations(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attachments_integration_active
  ON public.attachments (integration_id, availability)
  WHERE deleted_at IS NULL AND integration_id IS NOT NULL;

-- 3. RPC segura para la UI: devuelve únicamente metadatos no sensibles del usuario autenticado
CREATE OR REPLACE FUNCTION public.rpc_get_my_google_integration()
RETURNS TABLE (
  id                   uuid,
  provider             text,
  google_sub           text,
  google_email         text,
  oauth_client_kind    text,
  scopes               text[],
  status               text,
  disconnect_requested boolean,
  connected_at         timestamptz,
  last_refreshed_at    timestamptz,
  last_error_code      text,
  updated_at           timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    ui.id,
    ui.provider,
    ui.google_sub,
    ui.google_email,
    ui.oauth_client_kind,
    ui.scopes,
    ui.status,
    ui.disconnect_requested,
    ui.connected_at,
    ui.last_refreshed_at,
    ui.last_error_code,
    ui.updated_at
  FROM public.user_integrations ui
  WHERE ui.user_id = (SELECT auth.uid())
    AND ui.provider = 'google_drive';
$$;

REVOKE ALL ON FUNCTION public.rpc_get_my_google_integration() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_my_google_integration() TO authenticated;

-- 4. RPC backend (service_role): guarda/rota refresh_token en Vault y hace upsert atómico
CREATE OR REPLACE FUNCTION public.rpc_upsert_google_integration(
  p_user_id              uuid,
  p_google_sub           text,
  p_google_email         text,
  p_oauth_client_kind    text,
  p_oauth_client_id      text,
  p_refresh_token        text,    -- Puede ser NULL solo si reconecta la MISMA cuenta y ya existe secreto en Vault
  p_scopes               text[],
  p_mark_account_changed boolean DEFAULT false
)
RETURNS TABLE (
  integration_id         uuid,
  status                 text,
  account_switched       boolean,
  recovered_attachments  integer,
  affected_attachments   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing      public.user_integrations%ROWTYPE;
  v_secret_id     uuid;
  v_int_id        uuid;
  v_switched      boolean := false;
  v_recovered     integer := 0;
  v_affected      integer := 0;
  v_secret_name   text;
BEGIN
  IF p_user_id IS NULL OR p_google_sub IS NULL OR length(btrim(p_google_sub)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INTEGRATION_INPUT';
  END IF;

  SELECT *
    INTO v_existing
    FROM public.user_integrations ui
   WHERE ui.user_id = p_user_id
     AND ui.provider = 'google_drive'
   FOR UPDATE;

  IF FOUND THEN
    v_switched := (v_existing.google_sub <> p_google_sub);

    -- Si cambió la cuenta de Google, exige confirmación y nuevo refresh_token
    IF v_switched THEN
      IF p_refresh_token IS NULL OR length(btrim(p_refresh_token)) = 0 THEN
        RAISE EXCEPTION 'REFRESH_TOKEN_REQUIRED_ON_ACCOUNT_SWITCH';
      END IF;

      IF p_mark_account_changed THEN
        UPDATE public.attachments a
           SET availability       = 'unavailable',
               unavailable_reason = 'account_changed',
               unavailable_since  = COALESCE(a.unavailable_since, now()),
               updated_at         = now()
         WHERE a.integration_id = v_existing.id
           AND a.provider = 'google_drive'
           AND a.deleted_at IS NULL
           AND a.drive_account_sub <> p_google_sub
           AND a.availability <> 'unavailable';
        GET DIAGNOSTICS v_affected = ROW_COUNT;
      END IF;
    END IF;

    -- Gestión del secreto en Supabase Vault
    IF p_refresh_token IS NOT NULL AND length(btrim(p_refresh_token)) > 0 THEN
      IF v_existing.refresh_token_secret_id IS NOT NULL THEN
        PERFORM vault.update_secret(
          secret_id       := v_existing.refresh_token_secret_id,
          new_secret      := p_refresh_token,
          new_description := 'Google Drive refresh_token for user ' || p_user_id::text
        );
        v_secret_id := v_existing.refresh_token_secret_id;
      ELSE
        v_secret_name := 'gdrive_rt_' || p_user_id::text || '_' || replace(gen_random_uuid()::text, '-', '');
        v_secret_id := vault.create_secret(
          new_secret      := p_refresh_token,
          new_name        := v_secret_name,
          new_description := 'Google Drive refresh_token for user ' || p_user_id::text
        );
      END IF;
    ELSE
      -- Google omitió refresh_token: solo válido si conserva la misma cuenta y ya hay secreto guardado
      IF v_existing.refresh_token_secret_id IS NULL THEN
        RAISE EXCEPTION 'REFRESH_TOKEN_REQUIRED';
      END IF;
      v_secret_id := v_existing.refresh_token_secret_id;
    END IF;

    UPDATE public.user_integrations ui
       SET google_sub              = p_google_sub,
           google_email            = p_google_email,
           oauth_client_kind       = p_oauth_client_kind,
           oauth_client_id         = p_oauth_client_id,
           refresh_token_secret_id = v_secret_id,
           scopes                  = COALESCE(p_scopes, ARRAY['https://www.googleapis.com/auth/drive.file']),
           status                  = 'active',
           disconnect_requested    = false,
           last_error_code         = NULL,
           last_error_at           = NULL,
           connected_at            = CASE WHEN ui.status = 'disconnected' OR v_switched THEN now() ELSE ui.connected_at END,
           disconnected_at         = NULL,
           updated_at              = now()
     WHERE ui.id = v_existing.id
     RETURNING ui.id INTO v_int_id;

    -- Reconexión con la misma cuenta (§9.5 #3): rehabilita adjuntos marcados por desconexión/reauth
    IF NOT v_switched THEN
      UPDATE public.attachments a
         SET availability       = 'available',
             unavailable_reason = NULL,
             unavailable_since  = NULL,
             updated_at         = now()
       WHERE a.integration_id = v_int_id
         AND a.provider = 'google_drive'
         AND a.deleted_at IS NULL
         AND a.drive_account_sub = p_google_sub
         AND a.availability = 'unavailable'
         AND a.unavailable_reason IN ('drive_disconnected', 'needs_reauth', 'permission_revoked');
      GET DIAGNOSTICS v_recovered = ROW_COUNT;
    END IF;
  ELSE
    IF p_refresh_token IS NULL OR length(btrim(p_refresh_token)) = 0 THEN
      RAISE EXCEPTION 'REFRESH_TOKEN_REQUIRED';
    END IF;

    v_secret_name := 'gdrive_rt_' || p_user_id::text || '_' || replace(gen_random_uuid()::text, '-', '');
    v_secret_id := vault.create_secret(
      new_secret      := p_refresh_token,
      new_name        := v_secret_name,
      new_description := 'Google Drive refresh_token for user ' || p_user_id::text
    );

    INSERT INTO public.user_integrations (
      user_id, provider, google_sub, google_email,
      oauth_client_kind, oauth_client_id, refresh_token_secret_id,
      scopes, status
    ) VALUES (
      p_user_id, 'google_drive', p_google_sub, p_google_email,
      p_oauth_client_kind, p_oauth_client_id, v_secret_id,
      COALESCE(p_scopes, ARRAY['https://www.googleapis.com/auth/drive.file']), 'active'
    )
    RETURNING id INTO v_int_id;
  END IF;

  RETURN QUERY SELECT v_int_id, 'active'::text, v_switched, v_recovered, v_affected;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_upsert_google_integration(uuid, text, text, text, text, text, text[], boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_google_integration(uuid, text, text, text, text, text, text[], boolean)
  TO service_role;

-- 5. RPC backend (service_role): obtiene refresh_token descifrado desde Vault para drive-proxy / picker-token
CREATE OR REPLACE FUNCTION public.rpc_get_google_refresh_token(p_integration_id uuid)
RETURNS TABLE (
  integration_id    uuid,
  user_id           uuid,
  google_sub        text,
  oauth_client_kind text,
  oauth_client_id   text,
  status            text,
  refresh_token     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    ui.id AS integration_id,
    ui.user_id,
    ui.google_sub,
    ui.oauth_client_kind,
    ui.oauth_client_id,
    ui.status,
    ds.decrypted_secret AS refresh_token
  FROM public.user_integrations ui
  LEFT JOIN vault.decrypted_secrets ds
    ON ds.id = ui.refresh_token_secret_id
  WHERE ui.id = p_integration_id;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_google_refresh_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_google_refresh_token(uuid) TO service_role;

-- 6. RPC backend (service_role): marca needs_reauth / revoked y propaga estado a adjuntos Drive
CREATE OR REPLACE FUNCTION public.rpc_mark_google_integration_status(
  p_integration_id     uuid,
  p_status             text,
  p_error_code         text DEFAULT NULL,
  p_unavailable_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('active', 'needs_reauth', 'revoked') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  UPDATE public.user_integrations ui
     SET status            = p_status,
         last_error_code   = CASE WHEN p_status = 'active' THEN NULL ELSE p_error_code END,
         last_error_at     = CASE WHEN p_status = 'active' THEN NULL ELSE now() END,
         last_refreshed_at = CASE WHEN p_status = 'active' THEN now() ELSE ui.last_refreshed_at END,
         updated_at        = now()
   WHERE ui.id = p_integration_id;

  IF p_status IN ('needs_reauth', 'revoked') AND p_unavailable_reason IS NOT NULL THEN
    UPDATE public.attachments a
       SET availability       = 'unavailable',
           unavailable_reason = p_unavailable_reason,
           unavailable_since  = COALESCE(a.unavailable_since, now()),
           updated_at         = now()
     WHERE a.integration_id = p_integration_id
       AND a.provider = 'google_drive'
       AND a.deleted_at IS NULL
       AND a.availability = 'available';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_google_integration_status(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_mark_google_integration_status(uuid, text, text, text)
  TO service_role;

-- 7. RPC backend (service_role): desconexión limpia (borra secreto de Vault y marca adjuntos)
CREATE OR REPLACE FUNCTION public.rpc_disconnect_google_integration(p_user_id uuid)
RETURNS TABLE (
  integration_id       uuid,
  old_refresh_token    text,
  affected_attachments integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing  public.user_integrations%ROWTYPE;
  v_old_token text;
  v_affected  integer := 0;
BEGIN
  SELECT *
    INTO v_existing
    FROM public.user_integrations ui
   WHERE ui.user_id = p_user_id
     AND ui.provider = 'google_drive'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_existing.refresh_token_secret_id IS NOT NULL THEN
    SELECT ds.decrypted_secret
      INTO v_old_token
      FROM vault.decrypted_secrets ds
     WHERE ds.id = v_existing.refresh_token_secret_id;

    UPDATE public.user_integrations ui
       SET status                  = 'disconnected',
           refresh_token_secret_id = NULL,
           disconnect_requested    = false,
           disconnected_at         = now(),
           updated_at              = now()
     WHERE ui.id = v_existing.id;

    DELETE FROM vault.secrets WHERE id = v_existing.refresh_token_secret_id;
  ELSE
    UPDATE public.user_integrations ui
       SET status               = 'disconnected',
           disconnect_requested = false,
           disconnected_at      = COALESCE(ui.disconnected_at, now()),
           updated_at           = now()
     WHERE ui.id = v_existing.id;
  END IF;

  UPDATE public.attachments a
     SET availability       = 'unavailable',
         unavailable_reason = 'drive_disconnected',
         unavailable_since  = COALESCE(a.unavailable_since, now()),
         updated_at         = now()
   WHERE a.integration_id = v_existing.id
     AND a.provider = 'google_drive'
     AND a.deleted_at IS NULL
     AND a.availability <> 'unavailable';
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  RETURN QUERY SELECT v_existing.id, v_old_token, v_affected;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_disconnect_google_integration(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_disconnect_google_integration(uuid) TO service_role;
