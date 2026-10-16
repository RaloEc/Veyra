-- ==============================================================================
-- VEYRA - DESPLIEGUE CONTROLADO: PARTE 1 (ESQUEMA Y RPCs DE PERSISTENCIA YJS)
-- ==============================================================================
-- Este script instala exclusivamente las tablas y funciones de persistencia de Yjs.
-- NO MODIFICA realtime.messages NI TABLAS PREEXISTENTES DE PRODUCCIÓN.
--
-- GARANTÍAS DE SEGURIDAD PARA PRODUCCIÓN:
-- 1. SET LOCAL lock_timeout = '4s': Si no puede obtener un bloqueo en 4 segundos, aborta.
-- 2. Transaccional: Todo el despliegue se ejecuta dentro de un bloque BEGIN ... COMMIT.
-- 3. Idempotente con validación estructural estricta: Si existe una estructura
--    incompatible, ABORTA con mensaje explícito sin destruir restricciones ajenas.
-- 4. Anti-Bypass REST: REVOKE ALL en tablas para PUBLIC, anon y authenticated.
--    Solo se concede SELECT directo a authenticated bajo RLS.
-- 5. Contrato criptográfico unificado: SHA-256 sobre los bytes originales decodificados
--    desde Base64 (pg_catalog.decode(p_update_data, 'base64')).
-- 6. Escrituras exclusivas por RPC: append_note_yjs_update con advisory lock y SHA-256.
-- 7. Compactación deshabilitada: compact_note_yjs_snapshot arroja excepción 0A000.
-- ==============================================================================

BEGIN;

-- Límites de espera estrictamente locales a esta transacción
SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '30s';

-- ------------------------------------------------------------------------------
-- PASO 1: VALIDACIÓN PREVIA DE PRERREQUISITOS Y ESTRUCTURA EN ESQUEMA EXISTENTE
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- Validar estructura exacta de public.notes
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'id' AND data_type = 'text'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'user_id' AND data_type = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'folder_id' AND data_type = 'text'
    ) THEN
        RAISE EXCEPTION 'Prerrequisito faltante o incompatible: public.notes debe existir con columnas (id text, user_id uuid, folder_id text).' 
            USING ERRCODE = '42P01';
    END IF;

    -- Validar estructura exacta de public.collaborations
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'collaborations' AND column_name = 'target_type' AND data_type = 'text'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'collaborations' AND column_name = 'target_id' AND data_type = 'text'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'collaborations' AND column_name = 'owner_id' AND data_type = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'collaborations' AND column_name = 'member_id' AND data_type = 'uuid'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'collaborations' AND column_name = 'role' AND data_type = 'text'
    ) THEN
        RAISE EXCEPTION 'Prerrequisito faltante o incompatible: public.collaborations debe existir con columnas (target_type text, target_id text, owner_id uuid, member_id uuid, role text).' 
            USING ERRCODE = '42P01';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 2: COMPROBACIÓN DE FIRMAS Y CREACIÓN DE FUNCIONES DE ROL (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_proc_args text;
BEGIN
    -- Comprobar si is_note_editor existe con una firma incompatible
    SELECT pg_get_function_identity_arguments(oid) INTO v_proc_args
    FROM pg_proc 
    WHERE proname = 'is_note_editor' AND pronamespace = 'public'::regnamespace;

    IF v_proc_args IS NOT NULL AND v_proc_args != 'p_note_id text' AND v_proc_args != 'text' THEN
        RAISE EXCEPTION 'Conflicto de firma preexistente: public.is_note_editor ya existe con argumentos (%), firma esperada: (p_note_id text)'
            , v_proc_args USING ERRCODE = '42883';
    END IF;

    -- Comprobar si is_note_reader existe con una firma incompatible
    SELECT pg_get_function_identity_arguments(oid) INTO v_proc_args
    FROM pg_proc 
    WHERE proname = 'is_note_reader' AND pronamespace = 'public'::regnamespace;

    IF v_proc_args IS NOT NULL AND v_proc_args != 'p_note_id text' AND v_proc_args != 'text' THEN
        RAISE EXCEPTION 'Conflicto de firma preexistente: public.is_note_reader ya existe con argumentos (%), firma esperada: (p_note_id text)'
            , v_proc_args USING ERRCODE = '42883';
    END IF;

    -- Comprobar si append_note_yjs_update existe con firma incompatible
    SELECT pg_get_function_identity_arguments(oid) INTO v_proc_args
    FROM pg_proc 
    WHERE proname = 'append_note_yjs_update' AND pronamespace = 'public'::regnamespace;

    IF v_proc_args IS NOT NULL AND v_proc_args != 'p_note_id text, p_client_id text, p_update_data text, p_update_hash text' AND v_proc_args != 'text, text, text, text' THEN
        RAISE EXCEPTION 'Conflicto de firma preexistente: public.append_note_yjs_update ya existe con argumentos distintos a (text, text, text, text): %'
            , v_proc_args USING ERRCODE = '42883';
    END IF;

    -- Comprobar si compact_note_yjs_snapshot existe con firma incompatible
    SELECT pg_get_function_identity_arguments(oid) INTO v_proc_args
    FROM pg_proc 
    WHERE proname = 'compact_note_yjs_snapshot' AND pronamespace = 'public'::regnamespace;

    IF v_proc_args IS NOT NULL AND v_proc_args NOT LIKE '%text, text, text, bigint%' THEN
        RAISE EXCEPTION 'Conflicto de firma preexistente: public.compact_note_yjs_snapshot ya existe con argumentos incompatibles: %'
            , v_proc_args USING ERRCODE = '42883';
    END IF;
END $$;

-- Función: is_note_editor
CREATE OR REPLACE FUNCTION public.is_note_editor(p_note_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT (auth.uid() IS NOT NULL) AND (
        -- 1. Propietario directo de la nota en public.notes
        EXISTS (
            SELECT 1 FROM public.notes n
            WHERE n.id = p_note_id AND n.user_id = auth.uid()
        )
        OR
        -- 2. Colaborador directo de la nota con rol 'editor'
        EXISTS (
            SELECT 1 FROM public.collaborations c
            WHERE c.target_type = 'note'
              AND c.target_id = p_note_id
              AND (c.owner_id = auth.uid() OR (c.member_id = auth.uid() AND c.role = 'editor'))
        )
        OR
        -- 3. Colaborador de la carpeta contenedora con rol 'editor'
        EXISTS (
            SELECT 1 FROM public.notes n
            JOIN public.collaborations c ON c.target_type = 'folder' AND c.target_id = n.folder_id
            WHERE n.id = p_note_id
              AND n.folder_id IS NOT NULL
              AND (c.owner_id = auth.uid() OR (c.member_id = auth.uid() AND c.role = 'editor'))
        )
    );
$$;

-- Función: is_note_reader
CREATE OR REPLACE FUNCTION public.is_note_reader(p_note_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT (auth.uid() IS NOT NULL) AND (
        -- Es editor o propietario
        public.is_note_editor(p_note_id)
        OR
        -- Colaborador directo con rol 'viewer'
        EXISTS (
            SELECT 1 FROM public.collaborations c
            WHERE c.target_type = 'note'
              AND c.target_id = p_note_id
              AND (c.owner_id = auth.uid() OR c.member_id = auth.uid())
        )
        OR
        -- Colaborador de carpeta con rol 'viewer'
        EXISTS (
            SELECT 1 FROM public.notes n
            JOIN public.collaborations c ON c.target_type = 'folder' AND c.target_id = n.folder_id
            WHERE n.id = p_note_id
              AND n.folder_id IS NOT NULL
              AND (c.owner_id = auth.uid() OR c.member_id = auth.uid())
        )
    );
$$;

REVOKE ALL ON FUNCTION public.is_note_editor(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_note_editor(text) TO authenticated;

REVOKE ALL ON FUNCTION public.is_note_reader(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_note_reader(text) TO authenticated;

-- ------------------------------------------------------------------------------
-- PASO 3: TABLA DE SNAPSHOTS (CACHÉ NO AUTORITATIVA DE ACELERACIÓN)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.note_yjs_snapshots (
    note_id TEXT PRIMARY KEY REFERENCES public.notes(id) ON DELETE CASCADE,
    snapshot TEXT NOT NULL,
    state_vector TEXT NOT NULL,
    server_clock BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Validación estructural estricta si note_yjs_snapshots ya existía
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'note_yjs_snapshots' AND column_name = 'note_id' AND data_type = 'text'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'note_yjs_snapshots' AND column_name = 'snapshot' AND data_type = 'text'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'note_yjs_snapshots' AND column_name = 'server_clock' AND data_type = 'bigint'
    ) THEN
        RAISE EXCEPTION 'Incompatibilidad de esquema: note_yjs_snapshots existe pero su estructura de columnas difiere de la esperada (note_id text, snapshot text, server_clock bigint).' 
            USING ERRCODE = '42804';
    END IF;
END $$;

ALTER TABLE public.note_yjs_snapshots ENABLE ROW LEVEL SECURITY;

-- Blindaje Anti-Bypass REST: Revocar mutaciones directas
REVOKE ALL ON TABLE public.note_yjs_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.note_yjs_snapshots TO authenticated;

DROP POLICY IF EXISTS "note_yjs_snapshots_select" ON public.note_yjs_snapshots;
CREATE POLICY "note_yjs_snapshots_select" ON public.note_yjs_snapshots
    FOR SELECT TO authenticated
    USING (public.is_note_reader(note_id));

-- ------------------------------------------------------------------------------
-- PASO 4: TABLA DE DELTAS (FUENTE DE VERDAD AUTORITATIVA E INMUTABLE)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.note_yjs_updates (
    id BIGSERIAL PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    update_data TEXT NOT NULL,
    update_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT idx_note_yjs_updates_idempotency UNIQUE(note_id, update_hash)
);

CREATE INDEX IF NOT EXISTS idx_note_yjs_updates_note_clock 
    ON public.note_yjs_updates(note_id, id);

-- Comprobación estructural real e idempotente de note_yjs_updates
DO $$
DECLARE
    v_fk_exists boolean;
    v_fk_confdeltype "char";
    v_uniq_keys text;
BEGIN
    -- Validar tipos de columnas
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'note_yjs_updates' AND column_name = 'note_id' AND data_type = 'text'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'note_yjs_updates' AND column_name = 'update_hash' AND data_type = 'text'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'note_yjs_updates' AND column_name = 'user_id' AND data_type = 'uuid'
    ) THEN
        RAISE EXCEPTION 'Incompatibilidad de esquema: note_yjs_updates existe pero sus columnas difieren de lo esperado (note_id text, update_hash text, user_id uuid).' 
            USING ERRCODE = '42804';
    END IF;

    -- 1. Verificar si user_id permite valores nulos
    IF (SELECT is_nullable FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'note_yjs_updates' AND column_name = 'user_id') = 'NO' THEN
        ALTER TABLE public.note_yjs_updates ALTER COLUMN user_id DROP NOT NULL;
    END IF;

    -- 2. Inspeccionar la clave foránea específica note_yjs_updates_user_id_fkey sin alterar claves foráneas ajenas
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint con
        WHERE con.conrelid = 'public.note_yjs_updates'::regclass
          AND con.conname = 'note_yjs_updates_user_id_fkey'
    ), confdeltype INTO v_fk_exists, v_fk_confdeltype
    FROM pg_constraint con
    WHERE con.conrelid = 'public.note_yjs_updates'::regclass
      AND con.conname = 'note_yjs_updates_user_id_fkey';

    IF NOT v_fk_exists THEN
        ALTER TABLE public.note_yjs_updates 
            ADD CONSTRAINT note_yjs_updates_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    ELSIF v_fk_confdeltype != 'n' THEN
        -- Solo si existe con regla distinta a SET NULL ('n') se modifica de forma explícita
        ALTER TABLE public.note_yjs_updates DROP CONSTRAINT note_yjs_updates_user_id_fkey;
        ALTER TABLE public.note_yjs_updates 
            ADD CONSTRAINT note_yjs_updates_user_id_fkey 
            FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;

    -- 3. Comprobar que idx_note_yjs_updates_idempotency existe y cubre exactamente (note_id, update_hash)
    SELECT string_agg(att.attname, ', ' ORDER BY array_position(con.conkey, att.attnum))
    INTO v_uniq_keys
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'public.note_yjs_updates'::regclass
      AND con.conname = 'idx_note_yjs_updates_idempotency'
    GROUP BY con.conname;

    IF v_uniq_keys IS NOT NULL AND v_uniq_keys != 'note_id, update_hash' THEN
        RAISE EXCEPTION 'Incompatibilidad de restricción: idx_note_yjs_updates_idempotency existe pero cubre columnas incompatibles: % (esperado: note_id, update_hash)',
            v_uniq_keys USING ERRCODE = '42804';
    ELSIF v_uniq_keys IS NULL THEN
        ALTER TABLE public.note_yjs_updates 
            ADD CONSTRAINT idx_note_yjs_updates_idempotency UNIQUE(note_id, update_hash);
    END IF;
END $$;

ALTER TABLE public.note_yjs_updates ENABLE ROW LEVEL SECURITY;

-- Blindaje Anti-Bypass REST: Ningún usuario puede insertar/modificar por REST
REVOKE ALL ON TABLE public.note_yjs_updates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.note_yjs_updates TO authenticated;

DROP POLICY IF EXISTS "note_yjs_updates_select" ON public.note_yjs_updates;
CREATE POLICY "note_yjs_updates_select" ON public.note_yjs_updates
    FOR SELECT TO authenticated
    USING (public.is_note_reader(note_id));

-- ------------------------------------------------------------------------------
-- PASO 5: RPC TRANSACCIONAL append_note_yjs_update (ÚNICA VÍA DE ESCRITURA)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.append_note_yjs_update(
    p_note_id TEXT,
    p_client_id TEXT,
    p_update_data TEXT,
    p_update_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_canonical_hash TEXT;
    v_existing_id BIGINT;
    v_existing_data TEXT;
    v_new_id BIGINT;
BEGIN
    -- 1. Autenticación obligatoria
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- 2. Validación estricta de parámetros
    IF p_note_id IS NULL OR length(trim(p_note_id)) = 0 THEN
        RAISE EXCEPTION 'p_note_id no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF p_client_id IS NULL OR length(trim(p_client_id)) = 0 THEN
        RAISE EXCEPTION 'p_client_id no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF p_update_data IS NULL OR length(p_update_data) = 0 THEN
        RAISE EXCEPTION 'p_update_data no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF p_update_hash IS NULL OR length(trim(p_update_hash)) != 64 THEN
        RAISE EXCEPTION 'p_update_hash debe ser un hash SHA-256 de 64 caracteres' USING ERRCODE = '22023';
    END IF;

    -- 3. Autorización de escritura por roles
    IF NOT public.is_note_editor(p_note_id) THEN
        RAISE EXCEPTION 'Permiso denegado: solo editores y propietarios pueden insertar deltas' USING ERRCODE = '42501';
    END IF;

    -- 4. Cálculo y normalización canónica de SHA-256 sobre los bytes originales del update Yjs
    BEGIN
        v_canonical_hash := lower(pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(p_update_data, 'base64')), 'hex'));
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'p_update_data no es una cadena Base64 válida' USING ERRCODE = '22023';
    END;

    IF lower(trim(p_update_hash)) != v_canonical_hash THEN
        RAISE EXCEPTION 'Hash de actualización inválido: no coincide con el SHA-256 del contenido' USING ERRCODE = '22000';
    END IF;

    -- 5. BLOQUEO TRANSACCIONAL ADVISORY POR NOTA (Serializa escrituras concurrentes)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('note_yjs_' || p_note_id));

    -- 6. Idempotencia y deduplicación exacta
    SELECT id, update_data INTO v_existing_id, v_existing_data
    FROM public.note_yjs_updates
    WHERE note_id = p_note_id AND update_hash = v_canonical_hash;

    IF v_existing_id IS NOT NULL THEN
        IF v_existing_data != p_update_data THEN
            RAISE EXCEPTION 'Conflicto de integridad: el hash coincide pero el contenido difiere' USING ERRCODE = '23505';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'update_id', v_existing_id,
            'duplicate', true
        );
    END IF;

    -- 7. Inserción duradera con hash verificado y user_id
    INSERT INTO public.note_yjs_updates (
        note_id, client_id, user_id, update_data, update_hash, created_at
    ) VALUES (
        p_note_id, p_client_id, v_user_id, p_update_data, v_canonical_hash, NOW()
    ) RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'update_id', v_new_id,
        'duplicate', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.append_note_yjs_update(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_note_yjs_update(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- PASO 6: RPC compact_note_yjs_snapshot (FORMALMENTE DESHABILITADA EN FASE B.4)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compact_note_yjs_snapshot(
    p_note_id TEXT,
    p_new_snapshot TEXT,
    p_new_state_vector TEXT,
    p_up_to_update_id BIGINT,
    p_delete_consolidated BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Compactación remota deshabilitada en Fase B.4: el log de deltas es la única fuente de verdad autoritativa'
        USING ERRCODE = '0A000';
END;
$$;

REVOKE ALL ON FUNCTION public.compact_note_yjs_snapshot(TEXT, TEXT, TEXT, BIGINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compact_note_yjs_snapshot(TEXT, TEXT, TEXT, BIGINT, BOOLEAN) TO authenticated;

COMMIT;
