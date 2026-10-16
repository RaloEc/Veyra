-- ==============================================================================
-- VEYRA - HOTFIX DE SEGURIDAD: CANALES PRIVADOS PARA EDITOR PRINCIPAL
-- Archivo: src/poc-yjs/deploy-03-note-live-private.sql
-- ==============================================================================
-- PROPOSITO:
-- Autorizar unica y exclusivamente los canales privados Supabase Realtime para la
-- colaboracion en vivo del editor principal de notas:
--   - 'note_live_edit_<note_id>': contenido HTML, titulos, estructura y senales.
--   - 'note_live_cursor_<note_id>': cursores y presencia de colaboradores.
--
-- GARANTIAS:
-- 1. NO se modifican tablas existentes de Veyra ni la tabla notes.
-- 2. NO se ejecuta ALTER TABLE sobre realtime.messages.
-- 3. NO se desactiva la configuracion global de Realtime.
-- 4. NO se modifican ni reemplazan las politicas de note_yjs_*.
-- 5. NO se modifican canales de chats, avatares ni otras funciones de Veyra.
-- 6. En 'note_live_edit_':
--      - Lectura (SELECT): Requiere public.is_note_reader(note_id).
--      - Escritura (INSERT): Requiere public.is_note_editor(note_id).
-- 7. En 'note_live_cursor_':
--      - Lectura (SELECT): Requiere public.is_note_reader(note_id).
--      - Escritura (INSERT): Requiere public.is_note_reader(note_id) (los lectores
--        pueden transmitir su posicion de cursor, pero nunca editar contenido).
-- ==============================================================================

BEGIN;

-- Timeouts de seguridad para evitar bloqueos prolongados en produccion
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
        RAISE EXCEPTION 'La tabla realtime.messages no existe. Habilite Supabase Realtime antes de ejecutar esta migracion.' 
            USING ERRCODE = '42P01';
    END IF;

    -- 1.2 Verificar que RLS este activado en realtime.messages sin ejecutar ALTER TABLE
    SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages';

    IF v_rls_enabled IS NOT TRUE THEN
        RAISE EXCEPTION 'RLS no esta activo en realtime.messages. Active RLS o habilite canales privados en Supabase Dashboard.' 
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
        RAISE EXCEPTION 'Funcion requerida public.is_note_reader(text) no encontrada. Ejecute deploy-01-schema-and-rpcs.sql primero.' 
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
        RAISE EXCEPTION 'Funcion requerida public.is_note_editor(text) no encontrada. Ejecute deploy-01-schema-and-rpcs.sql primero.' 
            USING ERRCODE = '42883';
    END IF;

    -- --------------------------------------------------------------------------
    -- 2. POLITICAS PARA CANAL PRIVADO DE EDICION: 'note_live_edit_'
    -- --------------------------------------------------------------------------

    -- POLITICA 1: LECTURA DEL CANAL DE EDICION (SELECT)
    -- Permite escuchar cambios de texto, titulo y estructura a lectores autorizados
    DROP POLICY IF EXISTS "realtime_listen_note_live_edit" ON realtime.messages;
    CREATE POLICY "realtime_listen_note_live_edit" ON realtime.messages
        FOR SELECT TO authenticated
        USING (
            extension IN ('broadcast', 'presence')
            AND (SELECT realtime.topic()) ~ '^note_live_edit_[A-Za-z0-9_-]+$'
            AND public.is_note_reader(substring((SELECT realtime.topic()) from '^note_live_edit_(.+)$'))
        );

    -- POLITICA 2: BROADCAST DE EDICION DE CONTENIDO (INSERT)
    -- Solo editores y propietarios pueden transmitir modificaciones de texto
    DROP POLICY IF EXISTS "realtime_broadcast_note_live_edit" ON realtime.messages;
    CREATE POLICY "realtime_broadcast_note_live_edit" ON realtime.messages
        FOR INSERT TO authenticated
        WITH CHECK (
            extension = 'broadcast'
            AND (SELECT realtime.topic()) ~ '^note_live_edit_[A-Za-z0-9_-]+$'
            AND public.is_note_editor(substring((SELECT realtime.topic()) from '^note_live_edit_(.+)$'))
        );

    -- --------------------------------------------------------------------------
    -- 3. POLITICAS PARA CANAL PRIVADO DE CURSORES: 'note_live_cursor_'
    -- --------------------------------------------------------------------------

    -- POLITICA 3: LECTURA DEL CANAL DE CURSORES (SELECT)
    -- Permite a lectores autorizados ver cursores y actividad de otros miembros
    DROP POLICY IF EXISTS "realtime_listen_note_live_cursor" ON realtime.messages;
    CREATE POLICY "realtime_listen_note_live_cursor" ON realtime.messages
        FOR SELECT TO authenticated
        USING (
            extension IN ('broadcast', 'presence')
            AND (SELECT realtime.topic()) ~ '^note_live_cursor_[A-Za-z0-9_-]+$'
            AND public.is_note_reader(substring((SELECT realtime.topic()) from '^note_live_cursor_(.+)$'))
        );

    -- POLITICA 4: BROADCAST DE CURSORES Y PRESENCIA (INSERT)
    -- Tanto editores como lectores (viewers) tienen permiso para posicionar su cursor
    DROP POLICY IF EXISTS "realtime_broadcast_note_live_cursor" ON realtime.messages;
    CREATE POLICY "realtime_broadcast_note_live_cursor" ON realtime.messages
        FOR INSERT TO authenticated
        WITH CHECK (
            extension = 'broadcast'
            AND (SELECT realtime.topic()) ~ '^note_live_cursor_[A-Za-z0-9_-]+$'
            AND public.is_note_reader(substring((SELECT realtime.topic()) from '^note_live_cursor_(.+)$'))
        );

END $$;

COMMIT;

-- ==============================================================================
-- CONSULTAS DE VERIFICACION POST-EJECUCION
-- ==============================================================================
-- 1. Confirmar que las 4 politicas nuevas quedaron registradas correctamente:
--
-- SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
-- FROM pg_policies 
-- WHERE schemaname = 'realtime' AND tablename = 'messages'
--   AND policyname IN (
--       'realtime_listen_note_live_edit',
--       'realtime_broadcast_note_live_edit',
--       'realtime_listen_note_live_cursor',
--       'realtime_broadcast_note_live_cursor'
--   );
--
-- 2. Verificar que no existan politicas excesivamente amplias que permitan bypass:
--
-- SELECT policyname, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'realtime' AND tablename = 'messages'
--   AND (qual = 'true' OR with_check = 'true' OR 'anon' = ANY(roles));
--
-- ==============================================================================
-- INSTRUCCIONES DE REVERSION (ROLLBACK)
-- ==============================================================================
-- Para eliminar exclusivamente estas 4 politicas sin alterar note_yjs_* ni ninguna
-- otra configuracion de Supabase, ejecute:
--
-- BEGIN;
-- SET LOCAL lock_timeout = '4s';
-- DROP POLICY IF EXISTS "realtime_listen_note_live_edit" ON realtime.messages;
-- DROP POLICY IF EXISTS "realtime_broadcast_note_live_edit" ON realtime.messages;
-- DROP POLICY IF EXISTS "realtime_listen_note_live_cursor" ON realtime.messages;
-- DROP POLICY IF EXISTS "realtime_broadcast_note_live_cursor" ON realtime.messages;
-- COMMIT;
-- ==============================================================================
