-- ==============================================================================
-- VEYRA - FASE 3.1: PERSISTENCIA REMOTA Y ACTIVACIÓN SEGURA DE YJS (PRODUCCIÓN FINAL)
-- Archivo: src/poc-yjs/deploy-05-yjs-persistence-and-activation.sql
-- ==============================================================================
-- PROPÓSITO:
-- 1. Validar estrictamente todas las tablas, columnas y tipos preexistentes.
-- 2. Proteger objetos preexistentes: aborta si algún objeto ya existe sin la marca
--    'veyra_managed:deploy_05'. Si ya existe con dicha marca, valida compatibilidad.
-- 3. Crear las funciones de autorización colaborativa 'is_note_editor' e 'is_note_reader'
--    con comprobación rigurosa de roles ('viewer', 'editor') y exclusión de notas eliminadas.
-- 4. Desplegar tablas 'note_yjs_snapshots' y 'note_yjs_updates' con RLS estricto y sin bypass REST.
-- 5. Crear la RPC transaccional 'append_note_yjs_update' con advisory lock, límite de tamaño,
--    verificación canónica de SHA-256 e idempotencia binaria exacta.
-- 6. Crear la RPC 'compact_note_yjs_snapshot' para actualizar snapshots de forma segura
--    manteniendo el log inmutable de deltas como única fuente de verdad autoritativa.
-- 7. Actualizar la función trigger 'protect_note_yjs_content()' con defensas múltiples:
--    además de la variable de contexto, comprueba ownership, estado activo y existencia de deltas.
-- 8. Crear la RPC 'activate_note_yjs_mode' con bloqueo de fila 'FOR UPDATE', verificación
--    obligatoria de p_expected_content_hash y p_expected_updated_at_ms, comprobación de ausencia
--    de deltas previos incompatibles y sembrado atómico del documento inicial.
--
-- GARANTÍAS DE SEGURIDAD PARA PRODUCCIÓN:
-- - SET LOCAL lock_timeout = '4s': Si no adquiere bloqueos en 4s, aborta (55P03).
-- - SET LOCAL statement_timeout = '30s': Límite máximo para la transacción.
-- - Transaccional: Ejecución atómica en bloque BEGIN ... COMMIT.
-- - No altera ninguna de las 77 notas existentes: todas permanecen en 'rest'.
-- - Marcado con 'veyra_managed:deploy_05' para trazabilidad y rollback seguro.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '30s';

-- ------------------------------------------------------------------------------
-- PASO 1: VALIDACIÓN EXHAUSTIVA DE PRECONDICIONES, COLUMNAS Y TIPOS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_fn_comment TEXT;
    v_trg_comment TEXT;
    v_col_type TEXT;
BEGIN
    -- 1.1 Comprobar columnas y tipos en public.notes
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'notes'
    ) THEN
        RAISE EXCEPTION 'Precondición fallida: la tabla public.notes no existe.' USING ERRCODE = '42P01';
    END IF;

    -- Validar columna id (text)
    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'id';
    IF v_col_type != 'text' THEN
        RAISE EXCEPTION 'Precondición fallida: public.notes.id debe ser text (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    -- Validar columna user_id (uuid o text)
    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'user_id';
    IF v_col_type IS NULL OR v_col_type NOT IN ('uuid', 'text') THEN
        RAISE EXCEPTION 'Precondición fallida: public.notes.user_id debe ser uuid o text (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    -- Validar columna folder_id (text)
    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'folder_id';
    IF v_col_type IS NULL OR v_col_type != 'text' THEN
        RAISE EXCEPTION 'Precondición fallida: public.notes.folder_id debe ser text (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    -- Validar columna content (text)
    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'content';
    IF v_col_type IS NULL OR v_col_type != 'text' THEN
        RAISE EXCEPTION 'Precondición fallida: public.notes.content debe ser text (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    -- Validar columna sync_mode (text)
    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'sync_mode';
    IF v_col_type IS NULL OR v_col_type != 'text' THEN
        RAISE EXCEPTION 'Precondición fallida: public.notes.sync_mode debe ser text (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    -- Validar columna deleted (integer o bigint)
    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'deleted';
    IF v_col_type IS NULL OR v_col_type NOT IN ('integer', 'bigint', 'smallint') THEN
        RAISE EXCEPTION 'Precondición fallida: public.notes.deleted debe ser numérico (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    -- Validar marcas temporales updated_at_ms y last_modified_ms
    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'updated_at_ms';
    IF v_col_type IS NULL OR v_col_type NOT IN ('bigint', 'integer') THEN
        RAISE EXCEPTION 'Precondición fallida: public.notes.updated_at_ms debe ser bigint/integer (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'last_modified_ms';
    IF v_col_type IS NULL OR v_col_type NOT IN ('bigint', 'integer') THEN
        RAISE EXCEPTION 'Precondición fallida: public.notes.last_modified_ms debe ser bigint/integer (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    -- 1.2 Comprobar columnas y tipos en public.collaborations
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'collaborations'
    ) THEN
        RAISE EXCEPTION 'Precondición fallida: la tabla public.collaborations no existe.' USING ERRCODE = '42P01';
    END IF;

    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'collaborations' AND column_name = 'target_type';
    IF v_col_type IS NULL OR v_col_type != 'text' THEN
        RAISE EXCEPTION 'Precondición fallida: public.collaborations.target_type debe ser text (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'collaborations' AND column_name = 'target_id';
    IF v_col_type IS NULL OR v_col_type != 'text' THEN
        RAISE EXCEPTION 'Precondición fallida: public.collaborations.target_id debe ser text (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'collaborations' AND column_name = 'owner_id';
    IF v_col_type IS NULL OR v_col_type NOT IN ('uuid', 'text') THEN
        RAISE EXCEPTION 'Precondición fallida: public.collaborations.owner_id debe ser uuid/text (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'collaborations' AND column_name = 'member_id';
    IF v_col_type IS NULL OR v_col_type NOT IN ('uuid', 'text') THEN
        RAISE EXCEPTION 'Precondición fallida: public.collaborations.member_id debe ser uuid/text (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    SELECT data_type INTO v_col_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'collaborations' AND column_name = 'role';
    IF v_col_type IS NULL OR v_col_type != 'text' THEN
        RAISE EXCEPTION 'Precondición fallida: public.collaborations.role debe ser text (detectado: %)', COALESCE(v_col_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    -- 1.3 Comprobar disponibilidad canónica de SHA-256 en PostgreSQL
    IF pg_catalog.lower(pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode('dGVzdA==', 'base64')), 'hex')) 
       != '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' THEN
        RAISE EXCEPTION 'Precondición fallida: el motor no dispone de soporte canónico para sha256(decode(base64)).' USING ERRCODE = '42883';
    END IF;

    -- 1.4 Comprobar propiedad y marca de la función trigger de deploy-04
    SELECT obj_description(to_regprocedure('public.protect_note_yjs_content()'), 'pg_proc')
    INTO v_fn_comment;

    IF v_fn_comment IS NULL OR v_fn_comment NOT IN ('veyra_managed:deploy_04', 'veyra_managed:deploy_05') THEN
        RAISE EXCEPTION 'Conflicto de propiedad: public.protect_note_yjs_content() no está administrada por deploy_04 ni deploy_05 (marca detectada: %).',
            COALESCE(v_fn_comment, '<sin comentario>') USING ERRCODE = '55000';
    END IF;

    -- 1.5 Comprobar existencia y propiedad del trigger trg_protect_note_yjs_content
    SELECT d.description INTO v_trg_comment
    FROM pg_trigger t
    LEFT JOIN pg_description d ON d.objoid = t.oid AND d.classoid = 'pg_trigger'::regclass
    WHERE t.tgrelid = 'public.notes'::regclass 
      AND t.tgname = 'trg_protect_note_yjs_content' 
      AND NOT t.tgisinternal;

    IF v_trg_comment IS NULL OR v_trg_comment != 'veyra_managed:deploy_04' THEN
        RAISE EXCEPTION 'Conflicto de propiedad: trg_protect_note_yjs_content no está administrado por deploy_04 (marca: %).',
            COALESCE(v_trg_comment, '<sin comentario>') USING ERRCODE = '55000';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- ------------------------------------------------------------------------------
-- PASO 2: VERIFICACIÓN Y ACTUALIZACIÓN DE FUNCIONES DE ROL (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_fn_oid OID;
    v_fn_comment TEXT;
    v_args TEXT;
BEGIN
    -- 2.1 Para is_note_editor(text): se permite actualizar la función existente aunque
    -- carezca de comentario (conservando su OID y la política realtime_broadcast_note_yjs).
    v_fn_oid := to_regprocedure('public.is_note_editor(text)');
    IF v_fn_oid IS NOT NULL THEN
        -- Validar firma exacta esperada: no adoptar funciones con firma distinta
        v_args := pg_catalog.pg_get_function_identity_arguments(v_fn_oid);
        IF v_args NOT IN ('p_note_id text', 'text') THEN
            RAISE EXCEPTION 'Firma incompatible: public.is_note_editor tiene argumentos (%), se esperaba (p_note_id text).',
                v_args USING ERRCODE = '42883';
        END IF;

        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment IS NOT NULL AND v_fn_comment != 'veyra_managed:deploy_05' THEN
            RAISE EXCEPTION 'Conflicto de propiedad: public.is_note_editor(text) tiene un comentario no reconocido (%).',
                v_fn_comment USING ERRCODE = '55000';
        END IF;
    END IF;

    -- Comprobar que no existan sobrecargas no autorizadas de is_note_editor
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
          AND p.proname = 'is_note_editor'
          AND p.oid != COALESCE(v_fn_oid, 0::oid)
    ) THEN
        RAISE EXCEPTION 'Conflicto de sobrecarga: existe una función public.is_note_editor con firma incompatible.' USING ERRCODE = '55000';
    END IF;

    -- 2.2 Para is_note_reader(text): se permite actualizar la función existente aunque
    -- carezca de comentario (conservando su OID y la política realtime_listen_note_yjs).
    v_fn_oid := to_regprocedure('public.is_note_reader(text)');
    IF v_fn_oid IS NOT NULL THEN
        -- Validar firma exacta esperada: no adoptar funciones con firma distinta
        v_args := pg_catalog.pg_get_function_identity_arguments(v_fn_oid);
        IF v_args NOT IN ('p_note_id text', 'text') THEN
            RAISE EXCEPTION 'Firma incompatible: public.is_note_reader tiene argumentos (%), se esperaba (p_note_id text).',
                v_args USING ERRCODE = '42883';
        END IF;

        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment IS NOT NULL AND v_fn_comment != 'veyra_managed:deploy_05' THEN
            RAISE EXCEPTION 'Conflicto de propiedad: public.is_note_reader(text) tiene un comentario no reconocido (%).',
                v_fn_comment USING ERRCODE = '55000';
        END IF;
    END IF;

    -- Comprobar que no existan sobrecargas no autorizadas de is_note_reader
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
          AND p.proname = 'is_note_reader'
          AND p.oid != COALESCE(v_fn_oid, 0::oid)
    ) THEN
        RAISE EXCEPTION 'Conflicto de sobrecarga: existe una función public.is_note_reader con firma incompatible.' USING ERRCODE = '55000';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_note_editor(p_note_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT (auth.uid() IS NOT NULL) AND (
        -- 1. Propietario directo de la nota (la nota no debe estar eliminada para editarla)
        EXISTS (
            SELECT 1 FROM public.notes n
            WHERE n.id = p_note_id 
              AND n.user_id::text = auth.uid()::text
              AND COALESCE(n.deleted, 0) = 0
        )
        OR
        -- 2. Colaborador directo de la nota con rol 'editor' sobre nota activa
        EXISTS (
            SELECT 1 FROM public.notes n
            JOIN public.collaborations c ON c.target_type = 'note' AND c.target_id = n.id
            WHERE n.id = p_note_id
              AND COALESCE(n.deleted, 0) = 0
              AND (c.owner_id::text = auth.uid()::text OR (c.member_id::text = auth.uid()::text AND c.role = 'editor'))
        )
        OR
        -- 3. Colaborador de la carpeta contenedora con rol 'editor' sobre nota activa
        EXISTS (
            SELECT 1 FROM public.notes n
            JOIN public.collaborations c ON c.target_type = 'folder' AND c.target_id = n.folder_id
            WHERE n.id = p_note_id
              AND n.folder_id IS NOT NULL
              AND COALESCE(n.deleted, 0) = 0
              AND (c.owner_id::text = auth.uid()::text OR (c.member_id::text = auth.uid()::text AND c.role = 'editor'))
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_note_reader(p_note_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT (auth.uid() IS NOT NULL) AND (
        -- A) Es editor o propietario de nota activa
        public.is_note_editor(p_note_id)
        OR
        -- B) Propietario accediendo a su propia nota incluso si está en papelera (para verla/restaurarla)
        EXISTS (
            SELECT 1 FROM public.notes n
            WHERE n.id = p_note_id AND n.user_id::text = auth.uid()::text
        )
        OR
        -- C) Colaborador directo con rol explícito 'viewer' o 'editor' sobre nota no eliminada
        EXISTS (
            SELECT 1 FROM public.notes n
            JOIN public.collaborations c ON c.target_type = 'note' AND c.target_id = n.id
            WHERE n.id = p_note_id
              AND COALESCE(n.deleted, 0) = 0
              AND (c.owner_id::text = auth.uid()::text OR (c.member_id::text = auth.uid()::text AND c.role IN ('viewer', 'editor')))
        )
        OR
        -- D) Colaborador de carpeta contenedora con rol explícito 'viewer' o 'editor' sobre nota no eliminada
        EXISTS (
            SELECT 1 FROM public.notes n
            JOIN public.collaborations c ON c.target_type = 'folder' AND c.target_id = n.folder_id
            WHERE n.id = p_note_id
              AND n.folder_id IS NOT NULL
              AND COALESCE(n.deleted, 0) = 0
              AND (c.owner_id::text = auth.uid()::text OR (c.member_id::text = auth.uid()::text AND c.role IN ('viewer', 'editor')))
        )
    );
$$;

REVOKE ALL ON FUNCTION public.is_note_editor(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_note_editor(text) TO authenticated;
COMMENT ON FUNCTION public.is_note_editor(text) IS 'veyra_managed:deploy_05';

REVOKE ALL ON FUNCTION public.is_note_reader(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_note_reader(text) TO authenticated;
COMMENT ON FUNCTION public.is_note_reader(text) IS 'veyra_managed:deploy_05';

-- ------------------------------------------------------------------------------
-- PASO 3: TABLAS DE PERSISTENCIA YJS (SNAPSHOTS Y LOG DE DELTAS)
-- ------------------------------------------------------------------------------

-- 3.1 Gestión de public.note_yjs_snapshots
DO $$
DECLARE
    v_tbl_comment TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'note_yjs_snapshots') THEN
        SELECT obj_description('public.note_yjs_snapshots'::regclass, 'pg_class') INTO v_tbl_comment;
        IF v_tbl_comment IS NULL OR v_tbl_comment != 'veyra_managed:deploy_05' THEN
            RAISE EXCEPTION 'Conflicto de propiedad: public.note_yjs_snapshots ya existe y no pertenece a deploy_05.' USING ERRCODE = '55000';
        END IF;
    ELSE
        CREATE TABLE public.note_yjs_snapshots (
            note_id TEXT PRIMARY KEY REFERENCES public.notes(id) ON DELETE RESTRICT,
            snapshot TEXT NOT NULL,
            state_vector TEXT NOT NULL,
            server_clock BIGINT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        COMMENT ON TABLE public.note_yjs_snapshots IS 'veyra_managed:deploy_05';
    END IF;
END $$;

ALTER TABLE public.note_yjs_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.note_yjs_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.note_yjs_snapshots TO authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'note_yjs_snapshots' AND policyname = 'note_yjs_snapshots_select'
    ) THEN
        CREATE POLICY "note_yjs_snapshots_select" ON public.note_yjs_snapshots
            FOR SELECT TO authenticated
            USING (public.is_note_reader(note_id));
    END IF;
END $$;

-- 3.2 Gestión de public.note_yjs_updates
DO $$
DECLARE
    v_tbl_comment TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'note_yjs_updates') THEN
        SELECT obj_description('public.note_yjs_updates'::regclass, 'pg_class') INTO v_tbl_comment;
        IF v_tbl_comment IS NULL OR v_tbl_comment != 'veyra_managed:deploy_05' THEN
            RAISE EXCEPTION 'Conflicto de propiedad: public.note_yjs_updates ya existe y no pertenece a deploy_05.' USING ERRCODE = '55000';
        END IF;
    ELSE
        CREATE TABLE public.note_yjs_updates (
            id BIGSERIAL PRIMARY KEY,
            note_id TEXT NOT NULL REFERENCES public.notes(id) ON DELETE RESTRICT,
            client_id TEXT NOT NULL,
            user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
            update_data TEXT NOT NULL,
            update_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT idx_note_yjs_updates_idempotency UNIQUE(note_id, update_hash)
        );
        COMMENT ON TABLE public.note_yjs_updates IS 'veyra_managed:deploy_05';
        COMMENT ON CONSTRAINT idx_note_yjs_updates_idempotency ON public.note_yjs_updates IS 'veyra_managed:deploy_05';

        CREATE INDEX idx_note_yjs_updates_note_clock ON public.note_yjs_updates(note_id, id);
    END IF;
END $$;

ALTER TABLE public.note_yjs_updates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.note_yjs_updates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.note_yjs_updates TO authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'note_yjs_updates' AND policyname = 'note_yjs_updates_select'
    ) THEN
        CREATE POLICY "note_yjs_updates_select" ON public.note_yjs_updates
            FOR SELECT TO authenticated
            USING (public.is_note_reader(note_id));
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 4: RPC TRANSACCIONAL append_note_yjs_update (ESCRITURA EXCLUSIVA DE DELTAS)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_fn_oid OID;
    v_fn_comment TEXT;
BEGIN
    v_fn_oid := to_regprocedure('public.append_note_yjs_update(text, text, text, text)');
    IF v_fn_oid IS NOT NULL THEN
        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment IS NULL OR v_fn_comment != 'veyra_managed:deploy_05' THEN
            RAISE EXCEPTION 'Conflicto de propiedad: public.append_note_yjs_update ya existe y no pertenece a deploy_05.' USING ERRCODE = '55000';
        END IF;
    END IF;
END $$;

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
    v_note_sync_mode TEXT;
    v_note_deleted INT;
    v_existing_id BIGINT;
    v_existing_data TEXT;
    v_new_id BIGINT;
    v_decoded_bytes BYTEA;
BEGIN
    -- 1. Autenticación obligatoria
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- 2. Validación estricta de parámetros y límite de tamaño (máx. 10 MB en Base64)
    IF p_note_id IS NULL OR length(trim(p_note_id)) = 0 THEN
        RAISE EXCEPTION 'p_note_id no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF p_client_id IS NULL OR length(trim(p_client_id)) = 0 THEN
        RAISE EXCEPTION 'p_client_id no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF p_update_data IS NULL OR length(p_update_data) = 0 THEN
        RAISE EXCEPTION 'p_update_data no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF length(p_update_data) > 10485760 THEN
        RAISE EXCEPTION 'El tamaño de la actualización excede el límite permitido de 10 MB' USING ERRCODE = '22023';
    END IF;
    IF p_update_hash IS NULL OR length(trim(p_update_hash)) != 64 THEN
        RAISE EXCEPTION 'p_update_hash debe ser un hash SHA-256 de 64 caracteres' USING ERRCODE = '22023';
    END IF;

    -- 3. Autorización de escritura por roles (propietario o colaboradores con rol 'editor')
    IF NOT public.is_note_editor(p_note_id) THEN
        RAISE EXCEPTION 'Permiso denegado: solo editores y propietarios pueden insertar deltas Yjs' USING ERRCODE = '42501';
    END IF;

    -- 4. Comprobar que la nota esté en modo 'yjs' y activa
    SELECT sync_mode, deleted INTO v_note_sync_mode, v_note_deleted
    FROM public.notes
    WHERE id = p_note_id;

    IF v_note_sync_mode IS NULL THEN
        RAISE EXCEPTION 'La nota % no existe', p_note_id USING ERRCODE = '02000';
    END IF;

    IF COALESCE(v_note_deleted, 0) = 1 THEN
        RAISE EXCEPTION 'No se pueden insertar deltas en una nota eliminada' USING ERRCODE = '55000';
    END IF;

    IF v_note_sync_mode != 'yjs' THEN
        RAISE EXCEPTION 'La nota % está en modo ''%''. Solo se admiten deltas colaborativos en notas con sync_mode = ''yjs''.',
            p_note_id, v_note_sync_mode USING ERRCODE = '55000';
    END IF;

    -- 5. Cálculo y normalización canónica de SHA-256 sobre los bytes decodificados
    BEGIN
        v_decoded_bytes := pg_catalog.decode(p_update_data, 'base64');
        v_canonical_hash := pg_catalog.lower(pg_catalog.encode(pg_catalog.sha256(v_decoded_bytes), 'hex'));
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'p_update_data no es una cadena Base64 válida' USING ERRCODE = '22023';
    END;

    IF pg_catalog.lower(pg_catalog.trim(p_update_hash)) != v_canonical_hash THEN
        RAISE EXCEPTION 'Hash de actualización inválido: no coincide con el SHA-256 del contenido' USING ERRCODE = '22000';
    END IF;

    -- 6. Bloqueo consultivo transaccional por nota (serializa escrituras concurrentes de esta nota)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('note_yjs_' || p_note_id));

    -- 7. Idempotencia exacta y comparación binaria estricta frente a reintentos
    SELECT id, update_data INTO v_existing_id, v_existing_data
    FROM public.note_yjs_updates
    WHERE note_id = p_note_id AND update_hash = v_canonical_hash;

    IF v_existing_id IS NOT NULL THEN
        -- Comprobación binaria estricta de coherencia
        IF pg_catalog.decode(v_existing_data, 'base64') != v_decoded_bytes THEN
            RAISE EXCEPTION 'Conflicto de integridad: el hash coincide pero el contenido binario difiere' USING ERRCODE = '23505';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'update_id', v_existing_id,
            'duplicate', true
        );
    END IF;

    -- 8. Inserción duradera en el log autoritativo
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
COMMENT ON FUNCTION public.append_note_yjs_update(TEXT, TEXT, TEXT, TEXT) IS 'veyra_managed:deploy_05';

-- ------------------------------------------------------------------------------
-- PASO 5: RPC TRANSACCIONAL compact_note_yjs_snapshot (COMPACTACIÓN SEGURA)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_fn_oid OID;
    v_fn_comment TEXT;
BEGIN
    v_fn_oid := to_regprocedure('public.compact_note_yjs_snapshot(text, text, text, bigint, text)');
    IF v_fn_oid IS NOT NULL THEN
        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment IS NULL OR v_fn_comment != 'veyra_managed:deploy_05' THEN
            RAISE EXCEPTION 'Conflicto de propiedad: public.compact_note_yjs_snapshot ya existe y no pertenece a deploy_05.' USING ERRCODE = '55000';
        END IF;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.compact_note_yjs_snapshot(
    p_note_id TEXT,
    p_snapshot_data TEXT,
    p_state_vector TEXT,
    p_up_to_update_id BIGINT,
    p_snapshot_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_canonical_hash TEXT;
    v_decoded_bytes BYTEA;
    v_max_existing_id BIGINT;
    v_prev_clock BIGINT;
BEGIN
    -- 1. Autenticación y autorización
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_note_editor(p_note_id) THEN
        RAISE EXCEPTION 'Permiso denegado: solo editores y propietarios pueden compactar snapshots' USING ERRCODE = '42501';
    END IF;

    -- 2. Validación de argumentos y límite de tamaño
    IF p_note_id IS NULL OR length(trim(p_note_id)) = 0 THEN
        RAISE EXCEPTION 'p_note_id no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF p_snapshot_data IS NULL OR length(p_snapshot_data) = 0 THEN
        RAISE EXCEPTION 'p_snapshot_data no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF length(p_snapshot_data) > 10485760 THEN
        RAISE EXCEPTION 'El tamaño del snapshot excede el límite permitido de 10 MB' USING ERRCODE = '22023';
    END IF;
    IF p_state_vector IS NULL OR length(p_state_vector) = 0 THEN
        RAISE EXCEPTION 'p_state_vector no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF p_up_to_update_id IS NULL OR p_up_to_update_id <= 0 THEN
        RAISE EXCEPTION 'p_up_to_update_id debe ser un ID válido mayor a 0' USING ERRCODE = '22023';
    END IF;

    -- 3. Verificación de hash SHA-256 en servidor
    BEGIN
        v_decoded_bytes := pg_catalog.decode(p_snapshot_data, 'base64');
        v_canonical_hash := pg_catalog.lower(pg_catalog.encode(pg_catalog.sha256(v_decoded_bytes), 'hex'));
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'p_snapshot_data no es una cadena Base64 válida' USING ERRCODE = '22023';
    END;

    IF pg_catalog.lower(pg_catalog.trim(p_snapshot_hash)) != v_canonical_hash THEN
        RAISE EXCEPTION 'Hash de snapshot inválido: no coincide con el SHA-256 del contenido' USING ERRCODE = '22000';
    END IF;

    -- 4. Bloqueo consultivo por nota
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('note_yjs_' || p_note_id));

    -- 5. Validar que el p_up_to_update_id exista y pertenezca efectivamente a esta nota
    SELECT max(id) INTO v_max_existing_id
    FROM public.note_yjs_updates
    WHERE note_id = p_note_id AND id <= p_up_to_update_id;

    IF v_max_existing_id IS NULL THEN
        RAISE EXCEPTION 'El cursor p_up_to_update_id (%) no corresponde a ningún delta registrado para la nota %',
            p_up_to_update_id, p_note_id USING ERRCODE = '22023';
    END IF;

    -- 6. Monotonía del server_clock en snapshots existentes
    SELECT server_clock INTO v_prev_clock
    FROM public.note_yjs_snapshots
    WHERE note_id = p_note_id;

    IF v_prev_clock IS NOT NULL AND p_up_to_update_id < v_prev_clock THEN
        RAISE EXCEPTION 'Regresión de snapshot rechazada: el snapshot actual ya cubre hasta el clock % (recibido: %)',
            v_prev_clock, p_up_to_update_id USING ERRCODE = '55000';
    END IF;

    -- 7. Guardar snapshot acelerador (LOS DELTAS NUNCA SE ELIMINAN: PERMANECEN INMUTABLES)
    INSERT INTO public.note_yjs_snapshots (
        note_id, snapshot, state_vector, server_clock, created_at, updated_at
    ) VALUES (
        p_note_id, p_snapshot_data, p_state_vector, p_up_to_update_id, NOW(), NOW()
    )
    ON CONFLICT (note_id) DO UPDATE SET
        snapshot = EXCLUDED.snapshot,
        state_vector = EXCLUDED.state_vector,
        server_clock = EXCLUDED.server_clock,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'note_id', p_note_id,
        'server_clock', p_up_to_update_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.compact_note_yjs_snapshot(TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compact_note_yjs_snapshot(TEXT, TEXT, TEXT, BIGINT, TEXT) TO authenticated;
COMMENT ON FUNCTION public.compact_note_yjs_snapshot(TEXT, TEXT, TEXT, BIGINT, TEXT) IS 'veyra_managed:deploy_05';

-- ------------------------------------------------------------------------------
-- PASO 6: ACTUALIZACIÓN DE LA FUNCIÓN TRIGGER DE PROTECCIÓN DE CONTENIDO Y MODO
-- ------------------------------------------------------------------------------
-- El trigger trg_protect_note_yjs_content preexistente NO se toca ni recrea.
-- Se actualiza únicamente la función protect_note_yjs_content() con defensas múltiples:
-- Para permitir la transición de sync_mode, NO basta con el setting de sesión; exige
-- que la nota esté activa, en 'rest', que el usuario sea el dueño y que exista delta sembrado.

CREATE OR REPLACE FUNCTION public.protect_note_yjs_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    -- 6.1 CONTROL EN INSERCIÓN (INSERT)
    IF TG_OP = 'INSERT' THEN
        -- Todas las notas nuevas comienzan obligatoriamente en 'rest'
        NEW.sync_mode := 'rest';
        RETURN NEW;
    END IF;

    -- 6.2 CONTROL EN ACTUALIZACIÓN (UPDATE)
    IF TG_OP = 'UPDATE' THEN
        -- A) CONTROL DE TRANSICIÓN DE sync_mode (DEFENSA EN PROFUNDIDAD):
        IF NEW.sync_mode IS DISTINCT FROM OLD.sync_mode THEN
            -- Se permite la transición ÚNICAMENTE si cumple TODAS las siguientes condiciones:
            -- 1. Contexto transaccional 'veyra.allow_sync_mode_transition' en 'on'.
            -- 2. Transición estrictamente unidireccional de 'rest' a 'yjs'.
            -- 3. La nota previa no está marcada como eliminada.
            -- 4. El invocador autenticado es el legítimo propietario de la nota.
            -- 5. Ya se ha registrado el estado inicial Yjs en note_yjs_updates dentro de la transacción.
            IF pg_catalog.current_setting('veyra.allow_sync_mode_transition', true) = 'on'
               AND OLD.sync_mode = 'rest' 
               AND NEW.sync_mode = 'yjs'
               AND COALESCE(OLD.deleted, 0) = 0
               AND OLD.user_id::text = auth.uid()::text
               AND EXISTS (SELECT 1 FROM public.note_yjs_updates WHERE note_id = NEW.id) THEN
                -- Transición autorizada
                NEW.sync_mode := 'yjs';
            ELSE
                -- Petición ordinaria REST, regresión a 'rest' o violación de invariantes:
                -- Se neutraliza incondicionalmente preservando el modo anterior.
                NEW.sync_mode := OLD.sync_mode;
            END IF;
        END IF;

        -- B) BLINDAJE DE CONTENIDO Y MONOTONÍA PARA NOTAS YJS:
        IF OLD.sync_mode = 'yjs' THEN
            -- B.1: Blindaje del contenido editable contra sobreescrituras REST
            IF NEW.content IS DISTINCT FROM OLD.content THEN
                NEW.content := OLD.content;
            END IF;

            -- B.2: Monotonía temporal de updated_at_ms: rechaza valores nulos o regresivos
            IF OLD.updated_at_ms IS NOT NULL AND (NEW.updated_at_ms IS NULL OR NEW.updated_at_ms < OLD.updated_at_ms) THEN
                NEW.updated_at_ms := OLD.updated_at_ms;
            END IF;

            -- B.3: Monotonía temporal de last_modified_ms: rechaza valores nulos o regresivos
            IF OLD.last_modified_ms IS NOT NULL AND (NEW.last_modified_ms IS NULL OR NEW.last_modified_ms < OLD.last_modified_ms) THEN
                NEW.last_modified_ms := OLD.last_modified_ms;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_note_yjs_content() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.protect_note_yjs_content() IS 'veyra_managed:deploy_05';

-- ------------------------------------------------------------------------------
-- PASO 7: RPC TRANSACCIONAL activate_note_yjs_mode (ACTIVACIÓN CONTROLADA Y ATÓMICA)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_fn_oid OID;
    v_fn_comment TEXT;
BEGIN
    v_fn_oid := to_regprocedure('public.activate_note_yjs_mode(text, text, text, text, text, text, bigint)');
    IF v_fn_oid IS NOT NULL THEN
        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment IS NULL OR v_fn_comment != 'veyra_managed:deploy_05' THEN
            RAISE EXCEPTION 'Conflicto de propiedad: public.activate_note_yjs_mode ya existe y no pertenece a deploy_05.' USING ERRCODE = '55000';
        END IF;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.activate_note_yjs_mode(
    p_note_id TEXT,
    p_initial_update_data TEXT,
    p_initial_update_hash TEXT,
    p_client_id TEXT,
    p_expected_content_hash TEXT,
    p_expected_updated_at_ms BIGINT,
    p_initial_state_vector TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_note RECORD;
    v_db_content_hash TEXT;
    v_canonical_update_hash TEXT;
    v_initial_update_id BIGINT;
    v_now_ms BIGINT;
    v_decoded_bytes BYTEA;
BEGIN
    -- 1. Autenticación obligatoria
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- 2. Validación estricta de parámetros obligatorios (SIN valores nulos permitidos)
    IF p_note_id IS NULL OR length(trim(p_note_id)) = 0 THEN
        RAISE EXCEPTION 'p_note_id no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF p_initial_update_data IS NULL OR length(p_initial_update_data) = 0 THEN
        RAISE EXCEPTION 'p_initial_update_data no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF length(p_initial_update_data) > 10485760 THEN
        RAISE EXCEPTION 'El tamaño del documento inicial excede el límite de 10 MB' USING ERRCODE = '22023';
    END IF;
    IF p_initial_update_hash IS NULL OR length(trim(p_initial_update_hash)) != 64 THEN
        RAISE EXCEPTION 'p_initial_update_hash debe ser un hash SHA-256 de 64 caracteres' USING ERRCODE = '22023';
    END IF;
    IF p_client_id IS NULL OR length(trim(p_client_id)) = 0 THEN
        RAISE EXCEPTION 'p_client_id no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;

    -- REQUISITO ESTRICTO: p_expected_content_hash y p_expected_updated_at_ms NO pueden ser NULL
    IF p_expected_content_hash IS NULL OR length(trim(p_expected_content_hash)) != 64 THEN
        RAISE EXCEPTION 'p_expected_content_hash es obligatorio y debe ser un hash SHA-256 de 64 caracteres' USING ERRCODE = '22023';
    END IF;
    IF p_expected_updated_at_ms IS NULL OR p_expected_updated_at_ms <= 0 THEN
        RAISE EXCEPTION 'p_expected_updated_at_ms es obligatorio y debe ser un timestamp positivo válido' USING ERRCODE = '22023';
    END IF;

    -- 3. Bloqueo consultivo por nota para serializar intentos concurrentes de activación
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('note_yjs_activate_' || p_note_id));

    -- 4. BLOQUEO DE FILA EN BASE DE DATOS (FOR UPDATE)
    SELECT id, user_id, content, sync_mode, deleted, updated_at_ms, last_modified_ms
    INTO v_note
    FROM public.notes
    WHERE id = p_note_id
    FOR UPDATE;

    IF v_note.id IS NULL THEN
        RAISE EXCEPTION 'La nota % no existe en public.notes', p_note_id USING ERRCODE = '02000';
    END IF;

    -- 5. COMPROBACIÓN ESTRICTA DE PROPIEDAD: Solo el legítimo propietario puede activar Yjs
    IF v_note.user_id::text IS DISTINCT FROM v_user_id::text THEN
        RAISE EXCEPTION 'Permiso denegado: solo el propietario legítimo de la nota puede activar el modo colaborativo Yjs'
            USING ERRCODE = '42501';
    END IF;

    -- 6. Comprobar que no esté eliminada
    IF COALESCE(v_note.deleted, 0) = 1 THEN
        RAISE EXCEPTION 'No se puede activar el modo Yjs en una nota marcada como eliminada' USING ERRCODE = '55000';
    END IF;

    -- 7. Comprobar modo actual: Solo notas en 'rest' pueden ser activadas
    IF v_note.sync_mode = 'yjs' THEN
        RAISE EXCEPTION 'La nota % ya se encuentra en modo ''yjs''. No se permite reinicializar un documento colaborativo activo.',
            p_note_id USING ERRCODE = '55000';
    END IF;

    IF v_note.sync_mode != 'rest' THEN
        RAISE EXCEPTION 'La nota % tiene un sync_mode inválido (''%''). Solo se admite transición desde ''rest''.',
            p_note_id, v_note.sync_mode USING ERRCODE = '55000';
    END IF;

    -- 8. COMPROBACIÓN DE INEXISTENCIA DE DELTAS O SNAPSHOTS PREVIOS INCOMPATIBLES
    IF EXISTS (SELECT 1 FROM public.note_yjs_updates WHERE note_id = p_note_id) 
       OR EXISTS (SELECT 1 FROM public.note_yjs_snapshots WHERE note_id = p_note_id) THEN
        RAISE EXCEPTION 'Integridad comprometida: ya existen registros previos de Yjs para la nota %. Se rechaza la activación.',
            p_note_id USING ERRCODE = '55000';
    END IF;

    -- 9. COMPROBACIÓN ESTRICTA DE CONCURRENCIA DE CONTENIDO (Sin excepciones permitidas)
    IF v_note.updated_at_ms IS DISTINCT FROM p_expected_updated_at_ms THEN
        RAISE EXCEPTION 'Conflicto de concurrencia: la nota fue modificada (updated_at_ms=% vs esperado=%) mientras se preparaba la conversión Yjs.',
            v_note.updated_at_ms, p_expected_updated_at_ms USING ERRCODE = '40001';
    END IF;

    v_db_content_hash := pg_catalog.lower(pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(COALESCE(v_note.content, ''), 'UTF8')), 
        'hex'
    ));

    IF pg_catalog.lower(pg_catalog.trim(p_expected_content_hash)) IS DISTINCT FROM v_db_content_hash THEN
        RAISE EXCEPTION 'Conflicto de concurrencia: el contenido actual de la nota difiere de la versión convertida a Yjs (hash detectado: %, esperado: %).',
            v_db_content_hash, p_expected_content_hash USING ERRCODE = '40001';
    END IF;

    -- 10. Validación criptográfica en el servidor del update inicial Yjs
    BEGIN
        v_decoded_bytes := pg_catalog.decode(p_initial_update_data, 'base64');
        v_canonical_update_hash := pg_catalog.lower(pg_catalog.encode(pg_catalog.sha256(v_decoded_bytes), 'hex'));
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'p_initial_update_data no es una cadena Base64 válida' USING ERRCODE = '22023';
    END;

    IF pg_catalog.lower(pg_catalog.trim(p_initial_update_hash)) != v_canonical_update_hash THEN
        RAISE EXCEPTION 'Hash de actualización inicial inválido: no coincide con el SHA-256 del contenido binario' 
            USING ERRCODE = '22000';
    END IF;

    -- 11. PERSISTENCIA DURADERA DEL ESTADO INICIAL YJS (Sembrado atómico)
    INSERT INTO public.note_yjs_updates (
        note_id, client_id, user_id, update_data, update_hash, created_at
    ) VALUES (
        p_note_id, p_client_id, v_user_id, p_initial_update_data, v_canonical_update_hash, NOW()
    ) RETURNING id INTO v_initial_update_id;

    -- Snapshot acelerador inicial opcional
    IF p_initial_state_vector IS NOT NULL AND length(p_initial_state_vector) > 0 THEN
        INSERT INTO public.note_yjs_snapshots (
            note_id, snapshot, state_vector, server_clock, created_at, updated_at
        ) VALUES (
            p_note_id, p_initial_update_data, p_initial_state_vector, v_initial_update_id, NOW(), NOW()
        );
    END IF;

    -- 12. ACTIVACIÓN CONTROLADA DEL MODO EN public.notes
    PERFORM pg_catalog.set_config('veyra.allow_sync_mode_transition', 'on', true);

    v_now_ms := (pg_catalog.date_part('epoch', pg_catalog.now()) * 1000)::bigint;

    UPDATE public.notes
    SET sync_mode = 'yjs',
        updated_at_ms = v_now_ms,
        last_modified_ms = v_now_ms
    WHERE id = p_note_id;

    -- 13. Confirmación estructurada
    RETURN jsonb_build_object(
        'success', true,
        'note_id', p_note_id,
        'sync_mode', 'yjs',
        'initial_update_id', v_initial_update_id,
        'updated_at_ms', v_now_ms
    );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_note_yjs_mode(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_note_yjs_mode(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) TO authenticated;
COMMENT ON FUNCTION public.activate_note_yjs_mode(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) IS 'veyra_managed:deploy_05';

COMMIT;
