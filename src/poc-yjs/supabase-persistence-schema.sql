-- ==============================================================================
-- VEYRA - Persistencia Remota Duradera para Yjs + Tiptap (Fase B.4 - Cierre de Integridad)
-- ==============================================================================
-- Este esquema desacopla el transporte efímero (Realtime Broadcast)
-- de la persistencia duradera en base de datos PostgreSQL.
-- 
-- GARANTÍAS DE SEGURIDAD Y INTEGRIDAD (FASE B.4):
-- 1. Historial de Deltas como Fuente de Verdad: Durante esta fase, los deltas
--    históricos no se eliminan y constituyen el registro autoritativo único.
-- 2. Deshabilitación de Compactación No Verificable: Se bloquea cualquier intento
--    de avanzar el cursor autoritativo basándose únicamente en un snapshot del cliente.
-- 3. Orden Seguro de Dependencias: Eliminación previa de políticas RLS dependientes
--    antes de retirar firmas obsoletas de funciones.
-- 4. Anti-Bypass Total: REVOKE ALL para PUBLIC, anon y authenticated en tablas de
--    persistencia. Clientes authenticated solo tienen SELECT directo bajo RLS.
-- 5. Migración Explícita de Restricciones:
--    - user_id permite nulos y tiene FK con ON DELETE SET NULL.
--    - idx_note_yjs_updates_idempotency validada como UNIQUE(note_id, update_hash).
-- 6. Idempotencia Canónica en Servidor: append_note_yjs_update calcula el SHA-256 en
--    PostgreSQL, valida el input y usa exclusivamente el hash canónico en minúsculas.
-- 7. Realtime Authorization Idempotente: Inspección de catálogos sin alterar ownership
--    y verificación estricta de RLS en realtime.messages.
-- ==============================================================================
-- NOTA OPERATIVA PARA PRODUCCIÓN:
-- Para despliegues controlados en producción con datos reales, utilice los scripts
-- modulares que separan esquema y Realtime:
--   - deploy-00-preflight.sql (Auditoría previa solo lectura)
--   - deploy-01-schema-and-rpcs.sql (Tablas y RPCs)
--   - deploy-02-realtime-private.sql (Políticas Realtime condicionadas)
--   - deploy-03-rollback-poc.sql (Rollback quirúrgico seguro)
-- ==============================================================================

SET lock_timeout = '4s';
SET statement_timeout = '30s';

-- ------------------------------------------------------------------------------
-- 0. ELIMINACIÓN PREVIA DE POLÍTICAS DEPENDIENTES (RESOLUCIÓN DE DEPENDENCIAS)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- Políticas en note_yjs_snapshots
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'note_yjs_snapshots') THEN
        DROP POLICY IF EXISTS "Collaborators and owners can read note snapshots" ON public.note_yjs_snapshots;
        DROP POLICY IF EXISTS "Editors and owners can manage note snapshots" ON public.note_yjs_snapshots;
        DROP POLICY IF EXISTS "note_yjs_snapshots_select" ON public.note_yjs_snapshots;
        DROP POLICY IF EXISTS "note_yjs_snapshots_insert" ON public.note_yjs_snapshots;
        DROP POLICY IF EXISTS "note_yjs_snapshots_update" ON public.note_yjs_snapshots;
        DROP POLICY IF EXISTS "note_yjs_snapshots_delete" ON public.note_yjs_snapshots;
    END IF;

    -- Políticas en note_yjs_updates
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'note_yjs_updates') THEN
        DROP POLICY IF EXISTS "Collaborators and owners can read note updates" ON public.note_yjs_updates;
        DROP POLICY IF EXISTS "Editors and owners can insert note updates" ON public.note_yjs_updates;
        DROP POLICY IF EXISTS "note_yjs_updates_select" ON public.note_yjs_updates;
        DROP POLICY IF EXISTS "note_yjs_updates_insert" ON public.note_yjs_updates;
        DROP POLICY IF EXISTS "note_yjs_updates_update" ON public.note_yjs_updates;
        DROP POLICY IF EXISTS "note_yjs_updates_delete" ON public.note_yjs_updates;
    END IF;

    -- Políticas específicas de notas Yjs en realtime.messages (sin afectar otras áreas de la app)
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'realtime' AND tablename = 'messages') THEN
        DROP POLICY IF EXISTS "realtime_listen_note_yjs" ON realtime.messages;
        DROP POLICY IF EXISTS "realtime_broadcast_note_yjs" ON realtime.messages;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 1. RETIRO EXPLÍCITO DE FIRMAS ANTIGUAS DE FUNCIONES
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.is_note_editor(text, text);
DROP FUNCTION IF EXISTS public.is_note_reader(text, text);
DROP FUNCTION IF EXISTS public.compact_note_yjs_snapshot(text, text, text, bigint);

-- ------------------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES DE AUTORIZACIÓN POR ROL (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_note_editor(p_note_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT (auth.uid() IS NOT NULL) AND (
        -- Propietario directo de la nota
        EXISTS (
            SELECT 1 FROM public.notes n
            WHERE n.id = p_note_id AND n.user_id = auth.uid()
        )
        OR
        -- Colaborador directo con rol 'editor'
        EXISTS (
            SELECT 1 FROM public.collaborations c
            WHERE c.target_type = 'note'
              AND c.target_id = p_note_id
              AND (c.owner_id = auth.uid() OR (c.member_id = auth.uid() AND c.role = 'editor'))
        )
        OR
        -- Colaborador con rol 'editor' en la carpeta contenedora
        EXISTS (
            SELECT 1 FROM public.notes n
            JOIN public.collaborations c ON c.target_type = 'folder' AND c.target_id = n.folder_id
            WHERE n.id = p_note_id
              AND n.folder_id IS NOT NULL
              AND (c.owner_id = auth.uid() OR (c.member_id = auth.uid() AND c.role = 'editor'))
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
        -- Colaborador en carpeta contenedora con rol 'viewer'
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
-- 3. TABLAS DE PERSISTENCIA Y MIGRACIÓN IDEMPOTENTE DE RESTRICCIONES
-- ------------------------------------------------------------------------------

-- Tabla: note_yjs_snapshots (Caché no autoritativa de aceleración)
CREATE TABLE IF NOT EXISTS public.note_yjs_snapshots (
    note_id TEXT PRIMARY KEY REFERENCES public.notes(id) ON DELETE CASCADE,
    snapshot TEXT NOT NULL,                  -- Snapshot binario en Base64
    state_vector TEXT NOT NULL,              -- StateVector en Base64
    server_clock BIGINT NOT NULL DEFAULT 0,  -- ID de delta referencial (no autoritativo en Fase B.4)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: note_yjs_updates (Registro secuencial inmutable: FUENTE DE VERDAD)
CREATE TABLE IF NOT EXISTS public.note_yjs_updates (
    id BIGSERIAL PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    update_data TEXT NOT NULL,               -- Delta incremental en Base64
    update_hash TEXT NOT NULL,               -- Hash SHA-256 canónico verificado en servidor
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT idx_note_yjs_updates_idempotency UNIQUE(note_id, update_hash)
);

CREATE INDEX IF NOT EXISTS idx_note_yjs_updates_note_clock 
    ON public.note_yjs_updates(note_id, id);

-- Migración segura y modificación explícita de claves foráneas y restricciones existentes
DO $$
DECLARE
    v_fk_name text;
BEGIN
    -- 1. Asegurar que user_id sea nullable
    ALTER TABLE public.note_yjs_updates ALTER COLUMN user_id DROP NOT NULL;

    -- 2. Eliminar y recrear explícitamente cualquier FK sobre user_id para asegurar ON DELETE SET NULL
    FOR v_fk_name IN (
        SELECT tc.constraint_name 
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' 
          AND tc.table_name = 'note_yjs_updates'
          AND kcu.column_name = 'user_id'
          AND tc.constraint_type = 'FOREIGN KEY'
    ) LOOP
        EXECUTE format('ALTER TABLE public.note_yjs_updates DROP CONSTRAINT %I', v_fk_name);
    END LOOP;

    ALTER TABLE public.note_yjs_updates 
        ADD CONSTRAINT note_yjs_updates_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

    -- 3. Asegurar que la restricción UNIQUE(note_id, update_hash) exista con su nombre canónico
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public' 
          AND rel.relname = 'note_yjs_updates' 
          AND con.conname = 'idx_note_yjs_updates_idempotency'
    ) THEN
        ALTER TABLE public.note_yjs_updates 
            ADD CONSTRAINT idx_note_yjs_updates_idempotency UNIQUE(note_id, update_hash);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. REVOCACIÓN TOTAL DE PRIVILEGIOS Y POLÍTICAS RLS SELECT EXPLÍCITAS
-- ------------------------------------------------------------------------------
-- Revocar ALL en ambas tablas para PUBLIC, anon y authenticated.
-- Conceder ÚNICAMENTE SELECT directo a authenticated bajo RLS.
REVOKE ALL ON TABLE public.note_yjs_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.note_yjs_snapshots TO authenticated;

REVOKE ALL ON TABLE public.note_yjs_updates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.note_yjs_updates TO authenticated;

ALTER TABLE public.note_yjs_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_yjs_updates ENABLE ROW LEVEL SECURITY;

-- Políticas RLS SELECT explícitas usando public.is_note_reader(note_id)
CREATE POLICY "note_yjs_snapshots_select" ON public.note_yjs_snapshots
    FOR SELECT TO authenticated
    USING (public.is_note_reader(note_id));

CREATE POLICY "note_yjs_updates_select" ON public.note_yjs_updates
    FOR SELECT TO authenticated
    USING (public.is_note_reader(note_id));

-- ------------------------------------------------------------------------------
-- 5. RPC TRANSACCIONAL: append_note_yjs_update
-- ------------------------------------------------------------------------------
-- ÚNICA vía permitida para insertar deltas en PostgreSQL.
-- Valida auth.uid(), bloquea por nota, calcula el SHA-256 canónico en el servidor,
-- usa exclusivamente el hash canónico en minúsculas para deduplicar e insertar.
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
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- Validación de argumentos de entrada
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

    -- Validar permisos de editor usando auth.uid() en el servidor
    IF NOT public.is_note_editor(p_note_id) THEN
        RAISE EXCEPTION 'Permiso denegado: solo editores y propietarios pueden insertar deltas' USING ERRCODE = '42501';
    END IF;

    -- Cálculo y normalización canónica en minúsculas en el servidor
    v_canonical_hash := lower(pg_catalog.encode(pg_catalog.sha256(p_update_data::bytea), 'hex'));
    IF lower(trim(p_update_hash)) != v_canonical_hash THEN
        RAISE EXCEPTION 'Hash de actualización inválido: no coincide con el SHA-256 del contenido' USING ERRCODE = '22000';
    END IF;

    -- BLOQUEO TRANSACCIONAL POR NOTA
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('note_yjs_' || p_note_id));

    -- Idempotencia y deduplicación basada exclusivamente en el hash canónico del servidor
    SELECT id, update_data INTO v_existing_id, v_existing_data
    FROM public.note_yjs_updates
    WHERE note_id = p_note_id AND update_hash = v_canonical_hash;

    IF v_existing_id IS NOT NULL THEN
        -- Comprobar que el contenido ya almacenado equivale al contenido recibido
        IF v_existing_data != p_update_data THEN
            RAISE EXCEPTION 'Conflicto de integridad: el hash coincide pero el contenido difiere' USING ERRCODE = '23505';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'update_id', v_existing_id,
            'duplicate', true
        );
    END IF;

    -- Inserción duradera con hash canónico y user_id verificado
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
-- 6. RPC: compact_note_yjs_snapshot (DESHABILITADA EN FASE B.4)
-- ------------------------------------------------------------------------------
-- En esta fase, los deltas históricos son la única fuente de verdad autoritativa.
-- Se rechaza cualquier avance de server_clock basado únicamente en un snapshot
-- no verificable suministrado por el cliente.
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

-- ------------------------------------------------------------------------------
-- 7. POLÍTICAS DE AUTORIZACIÓN PARA CANALES PRIVADOS SUPABASE REALTIME
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_table_exists BOOLEAN;
    v_rls_enabled BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'realtime' AND tablename = 'messages'
    ) INTO v_table_exists;

    IF NOT v_table_exists THEN
        RAISE EXCEPTION 'La tabla realtime.messages no existe. Habilite Supabase Realtime en su proyecto antes de instalar esta migración.' USING ERRCODE = '42P01';
    END IF;

    SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages';

    IF v_rls_enabled IS NOT TRUE THEN
        RAISE EXCEPTION 'Row Level Security (RLS) no está activo en realtime.messages. Active la opción "Enable Private Channels" en Project Settings -> Realtime en el Dashboard de Supabase antes de continuar.' USING ERRCODE = '55000';
    END IF;

    DROP POLICY IF EXISTS "realtime_listen_note_yjs" ON realtime.messages;
    CREATE POLICY "realtime_listen_note_yjs" ON realtime.messages
        FOR SELECT TO authenticated
        USING (
            topic ~ '^note_yjs_[a-zA-Z0-9_\-]+$'
            AND public.is_note_reader(substring(topic from '^note_yjs_(.+)$'))
        );

    DROP POLICY IF EXISTS "realtime_broadcast_note_yjs" ON realtime.messages;
    CREATE POLICY "realtime_broadcast_note_yjs" ON realtime.messages
        FOR INSERT TO authenticated
        WITH CHECK (
            topic ~ '^note_yjs_[a-zA-Z0-9_\-]+$'
            AND (
                (extension = 'broadcast' AND public.is_note_editor(substring(topic from '^note_yjs_(.+)$')))
                OR (extension = 'presence' AND public.is_note_reader(substring(topic from '^note_yjs_(.+)$')))
            )
        );
END $$;

-- ==============================================================================
-- ROLLBACK REVISADO Y SEGURO (SIN CASCADE INDISCRIMINADO)
-- ==============================================================================
-- Documentación de objetos eliminados en rollback:
-- 1. Políticas RLS en realtime.messages específicas de notas Yjs.
-- 2. Políticas RLS SELECT en note_yjs_updates y note_yjs_snapshots.
-- 3. Funciones RPC transaccionales: append_note_yjs_update, compact_note_yjs_snapshot.
-- 4. Tablas: note_yjs_updates (elimina historial de deltas), note_yjs_snapshots.
-- 5. Funciones auxiliares de verificación de roles: is_note_reader, is_note_editor.
/*
    -- 1. Políticas Realtime
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'realtime' AND tablename = 'messages') THEN
            DROP POLICY IF EXISTS "realtime_broadcast_note_yjs" ON realtime.messages;
            DROP POLICY IF EXISTS "realtime_listen_note_yjs" ON realtime.messages;
        END IF;
    END $$;

    -- 2. Políticas RLS de tablas
    DROP POLICY IF EXISTS "note_yjs_updates_select" ON public.note_yjs_updates;
    DROP POLICY IF EXISTS "note_yjs_snapshots_select" ON public.note_yjs_snapshots;

    -- 3. Funciones RPC transaccionales
    DROP FUNCTION IF EXISTS public.compact_note_yjs_snapshot(TEXT, TEXT, TEXT, BIGINT, BOOLEAN);
    DROP FUNCTION IF EXISTS public.append_note_yjs_update(TEXT, TEXT, TEXT, TEXT);

    -- 4. Tablas de persistencia (RESTRICT, sin CASCADE indiscriminado)
    DROP TABLE IF EXISTS public.note_yjs_updates;
    DROP TABLE IF EXISTS public.note_yjs_snapshots;

    -- 5. Funciones auxiliares de rol
    DROP FUNCTION IF EXISTS public.is_note_reader(TEXT);
    DROP FUNCTION IF EXISTS public.is_note_editor(TEXT);
*/
