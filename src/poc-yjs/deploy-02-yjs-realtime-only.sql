-- ==============================================================================
-- VEYRA - DESPLIEGUE CONTROLADO: PARTE 2 EXCLUSIVA PARA YJS REALTIME
-- Archivo: src/poc-yjs/deploy-02-yjs-realtime-only.sql
-- ==============================================================================
-- PROPOSITO:
-- Autorizar unica y exclusivamente canales privados Supabase Realtime con prefijo
-- exacto 'note_yjs_', garantizando que:
-- 1. NO se tocan ni modifican canales existentes de Veyra (chats, avatares, etc.).
-- 2. NO se ejecuta ALTER TABLE sobre realtime.messages.
-- 3. NO se desactiva la opcion global "Allow public access" en Supabase Dashboard.
-- 4. NO se modifican tablas de notas ni politicas existentes.
-- 5. Solo los usuarios autenticados con permiso de lectura (is_note_reader) pueden
--    escuchar el canal y publicar Presencia (extensiones: broadcast y presence).
-- 6. Solo los usuarios autenticados con permiso de edicion (is_note_editor) pueden
--    enviar mensajes Broadcast con deltas Yjs.
-- ==============================================================================

BEGIN;

-- Timeouts de seguridad para evitar esperas por bloqueos en produccion
SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
    v_table_exists BOOLEAN;
    v_rls_enabled BOOLEAN;
    v_reader_exists BOOLEAN;
    v_editor_exists BOOLEAN;
BEGIN
    -- --------------------------------------------------------------------------
    -- 1. COMPROBACIONES PREVIAS DE SEGURIDAD
    -- --------------------------------------------------------------------------

    -- 1.1 Verificar existencia de la tabla realtime.messages
    SELECT EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'realtime' AND tablename = 'messages'
    ) INTO v_table_exists;

    IF NOT v_table_exists THEN
        RAISE EXCEPTION 'La tabla realtime.messages no existe. Habilite Supabase Realtime en su proyecto antes de instalar esta migracion.' 
            USING ERRCODE = '42P01';
    END IF;

    -- 1.2 Verificar que RLS este activado en realtime.messages sin ejecutar ALTER TABLE
    SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages';

    IF v_rls_enabled IS NOT TRUE THEN
        RAISE EXCEPTION 'RLS no esta activo en realtime.messages. Active RLS en la tabla o habilite canales privados en el Dashboard de Supabase.' 
            USING ERRCODE = '55000';
    END IF;

    -- 1.3 Verificar existencia y firma de public.is_note_reader(text)
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' 
          AND p.proname = 'is_note_reader'
          AND pg_get_function_identity_arguments(p.oid) IN ('p_note_id text', 'text')
    ) INTO v_reader_exists;

    IF NOT v_reader_exists THEN
        RAISE EXCEPTION 'Funcion requerida public.is_note_reader(text) no encontrada. Ejecute deploy-01-schema-and-rpcs.sql antes de este script.' 
            USING ERRCODE = '42883';
    END IF;

    -- 1.4 Verificar existencia y firma de public.is_note_editor(text)
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' 
          AND p.proname = 'is_note_editor'
          AND pg_get_function_identity_arguments(p.oid) IN ('p_note_id text', 'text')
    ) INTO v_editor_exists;

    IF NOT v_editor_exists THEN
        RAISE EXCEPTION 'Funcion requerida public.is_note_editor(text) no encontrada. Ejecute deploy-01-schema-and-rpcs.sql antes de este script.' 
            USING ERRCODE = '42883';
    END IF;

    -- --------------------------------------------------------------------------
    -- 2. INSTALACION DE POLITICAS EXCLUSIVAS PARA CANALES 'note_yjs_'
    -- --------------------------------------------------------------------------

    -- POLITICA 1: LECTURA / ESCUCHA (SELECT)
    -- Permite a usuarios autenticados recibir mensajes Broadcast y eventos de Presencia
    -- de la nota, restringido a extension IN ('broadcast', 'presence') y validando
    -- permiso de lectura con public.is_note_reader.
    DROP POLICY IF EXISTS "realtime_listen_note_yjs" ON realtime.messages;
    CREATE POLICY "realtime_listen_note_yjs" ON realtime.messages
        FOR SELECT TO authenticated
        USING (
            extension IN ('broadcast', 'presence')
            AND (SELECT realtime.topic()) ~ '^note_yjs_[A-Za-z0-9_-]+$'
            AND public.is_note_reader(substring((SELECT realtime.topic()) from '^note_yjs_(.+)$'))
        );

    -- POLITICA 2: BROADCAST DE ESCRITURA (INSERT)
    -- Permite a usuarios autenticados difundir deltas Yjs, handshakes y awareness
    -- (extension = 'broadcast') UNICAMENTE si tienen permisos de edicion sobre la nota.
    DROP POLICY IF EXISTS "realtime_broadcast_note_yjs" ON realtime.messages;
    CREATE POLICY "realtime_broadcast_note_yjs" ON realtime.messages
        FOR INSERT TO authenticated
        WITH CHECK (
            extension = 'broadcast'
            AND (SELECT realtime.topic()) ~ '^note_yjs_[A-Za-z0-9_-]+$'
            AND public.is_note_editor(substring((SELECT realtime.topic()) from '^note_yjs_(.+)$'))
        );

    -- POLITICA 3: PRESENCIA DE COLABORADORES (INSERT)
    -- El proveedor SupabaseYjsProvider ejecuta channel.track() para senalizar usuario activo.
    -- Permite a cualquier usuario con permiso de lectura (is_note_reader, incluidos viewers)
    -- registrar su presencia (extension = 'presence') en la sala colaborativa.
    DROP POLICY IF EXISTS "realtime_presence_note_yjs" ON realtime.messages;
    CREATE POLICY "realtime_presence_note_yjs" ON realtime.messages
        FOR INSERT TO authenticated
        WITH CHECK (
            extension = 'presence'
            AND (SELECT realtime.topic()) ~ '^note_yjs_[A-Za-z0-9_-]+$'
            AND public.is_note_reader(substring((SELECT realtime.topic()) from '^note_yjs_(.+)$'))
        );

END $$;

COMMIT;

-- ==============================================================================
-- INSTRUCCIONES DE VERIFICACION POST-EJECUCION
-- ==============================================================================
-- Ejecute la siguiente consulta en el SQL Editor de Supabase para confirmar
-- que las 3 politicas quedaron instaladas y restringidas a note_yjs_:
--
-- SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
-- FROM pg_policies 
-- WHERE schemaname = 'realtime' AND tablename = 'messages'
--   AND policyname IN ('realtime_listen_note_yjs', 'realtime_broadcast_note_yjs', 'realtime_presence_note_yjs');
--
-- ==============================================================================
-- INSTRUCCIONES DE REVERSION (ROLLBACK)
-- ==============================================================================
-- Para eliminar exclusivamente estas 3 politicas sin afectar ninguna otra parte
-- del sistema, ejecute:
--
-- BEGIN;
-- SET LOCAL lock_timeout = '4s';
-- DROP POLICY IF EXISTS "realtime_listen_note_yjs" ON realtime.messages;
-- DROP POLICY IF EXISTS "realtime_broadcast_note_yjs" ON realtime.messages;
-- DROP POLICY IF EXISTS "realtime_presence_note_yjs" ON realtime.messages;
-- COMMIT;
-- ==============================================================================
