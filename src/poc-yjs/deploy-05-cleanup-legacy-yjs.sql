-- ==============================================================================
-- VEYRA - LIMPIEZA CONTROLADA DE OBJETOS YJS LEGACY EN SUPABASE
-- Archivo: src/poc-yjs/deploy-05-cleanup-legacy-yjs.sql
-- ==============================================================================
-- PROPÓSITO:
-- Eliminar exclusivamente los objetos antiguos de persistencia Yjs procedentes de una
-- implementación o prueba previa no gestionada:
-- 1. Tablas 'public.note_yjs_updates' y 'public.note_yjs_snapshots' (incluyendo datos de prueba).
-- 2. Todas las políticas RLS asociadas a dichas tablas.
-- 3. Funciones legacy eliminables: 'append_note_yjs_update' y 'compact_note_yjs_snapshot'
--    (cubriendo la firma con p_delete_consolidated boolean).
--    NOTA: 'is_note_editor(text)' e 'is_note_reader(text)' SE CONSERVAN intactas para
--    preservar las políticas de Realtime (realtime_broadcast_note_yjs y realtime_listen_note_yjs).
--
-- GARANTÍAS DE SEGURIDAD Y PRESERVACIÓN:
-- 1. Transaccional (BEGIN ... COMMIT) con lock_timeout = '4s' y statement_timeout = '30s'.
-- 2. NO elimina ni modifica 'public.notes', sus 78 notas, la columna 'sync_mode',
--    el trigger 'trg_protect_note_yjs_content' ni la función 'protect_note_yjs_content()' (deploy-04).
-- 3. NO modifica carpetas, recordatorios, colaboraciones ni ningún otro objeto de la app.
-- 4. Valida previamente que ninguna nota se encuentre en sync_mode = 'yjs' (todas en 'rest').
-- 5. Inspecciona el catálogo de dependencias (pg_depend, pg_constraint, pg_rewrite); si detecta
--    dependencias externas ajenas a los objetos Yjs legacy enumerados, aborta inmediatamente.
-- 6. No utiliza CASCADE en ninguna sentencia DROP.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '30s';

-- ------------------------------------------------------------------------------
-- PASO 1: SALVAGUARDAS INICIALES Y PROTECCIÓN DE OBJETOS PREEXISTENTES
-- ------------------------------------------------------------------------------
-- Bloqueo sobre public.notes para prevenir concurrencia durante la comprobación
LOCK TABLE public.notes IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
    v_yjs_notes_count INTEGER := 0;
    v_fn_comment TEXT;
    v_trg_comment TEXT;
BEGIN
    -- 1.1 Verificar existencia de la tabla public.notes
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'notes'
    ) THEN
        RAISE EXCEPTION 'Salvaguarda fallida: la tabla public.notes no existe.' USING ERRCODE = '42P01';
    END IF;

    -- 1.2 Verificar que ninguna nota esté en modo 'yjs' (todas deben estar en 'rest')
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'sync_mode'
    ) THEN
        SELECT count(*) INTO v_yjs_notes_count 
        FROM public.notes 
        WHERE sync_mode = 'yjs';

        IF v_yjs_notes_count > 0 THEN
            RAISE EXCEPTION 'Limpieza abortada: existen % nota(s) con sync_mode = ''yjs''. No se pueden retirar las tablas de persistencia mientras existan notas en modo Yjs.',
                v_yjs_notes_count USING ERRCODE = '55000';
        END IF;
    ELSE
        RAISE EXCEPTION 'Salvaguarda fallida: la columna sync_mode no existe en public.notes.' USING ERRCODE = '42703';
    END IF;

    -- 1.3 Verificar que protect_note_yjs_content() de deploy-04 esté intacta
    SELECT obj_description(to_regprocedure('public.protect_note_yjs_content()'), 'pg_proc')
    INTO v_fn_comment;

    IF v_fn_comment IS NULL OR v_fn_comment != 'veyra_managed:deploy_04' THEN
        RAISE EXCEPTION 'Salvaguarda fallida: public.protect_note_yjs_content() no tiene la marca esperada de deploy-04 (marca: %).',
            COALESCE(v_fn_comment, '<sin comentario>') USING ERRCODE = '55000';
    END IF;

    -- 1.4 Verificar que el trigger trg_protect_note_yjs_content de deploy-04 esté intacto
    SELECT d.description INTO v_trg_comment
    FROM pg_trigger t
    LEFT JOIN pg_description d ON d.objoid = t.oid AND d.classoid = 'pg_trigger'::regclass
    WHERE t.tgrelid = 'public.notes'::regclass 
      AND t.tgname = 'trg_protect_note_yjs_content' 
      AND NOT t.tgisinternal;

    IF v_trg_comment IS NULL OR v_trg_comment != 'veyra_managed:deploy_04' THEN
        RAISE EXCEPTION 'Salvaguarda fallida: trg_protect_note_yjs_content no tiene la marca esperada de deploy-04 (marca: %).',
            COALESCE(v_trg_comment, '<sin comentario>') USING ERRCODE = '55000';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 2: COMPROBACIÓN DE DEPENDENCIAS EXTERNAS HACIA LAS TABLAS YJS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_fk_conflict RECORD;
    v_view_conflict RECORD;
BEGIN
    -- 2.1 Comprobar si tablas ajenas tienen Foreign Keys que apunten a note_yjs_updates o note_yjs_snapshots
    FOR v_fk_conflict IN
        SELECT c.conname, src.relname AS source_table, tgt.relname AS target_table
        FROM pg_constraint c
        JOIN pg_class src ON c.conrelid = src.oid
        JOIN pg_class tgt ON c.confrelid = tgt.oid
        JOIN pg_namespace n ON src.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND tgt.relname IN ('note_yjs_updates', 'note_yjs_snapshots')
          AND src.relname NOT IN ('note_yjs_updates', 'note_yjs_snapshots')
    LOOP
        RAISE EXCEPTION 'Limpieza abortada: la tabla ajena % depende de % mediante la restricción FK %.',
            v_fk_conflict.source_table, v_fk_conflict.target_table, v_fk_conflict.conname USING ERRCODE = '2BP01';
    END LOOP;

    -- 2.2 Comprobar si existen vistas o vistas materializadas que dependan de estas tablas
    FOR v_view_conflict IN
        SELECT DISTINCT c.relname AS view_name, tgt.relname AS table_name
        FROM pg_depend d
        JOIN pg_rewrite r ON d.objid = r.oid
        JOIN pg_class c ON r.ev_class = c.oid
        JOIN pg_class tgt ON d.refobjid = tgt.oid
        JOIN pg_namespace n ON tgt.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND tgt.relname IN ('note_yjs_updates', 'note_yjs_snapshots')
          AND c.relkind IN ('v', 'm')
    LOOP
        RAISE EXCEPTION 'Limpieza abortada: la vista % depende de la tabla %.',
            v_view_conflict.view_name, v_view_conflict.table_name USING ERRCODE = '2BP01';
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 3: RETIRADA CONTROLADA DE TABLAS YJS Y SUS POLÍTICAS (SIN CASCADE)
-- ------------------------------------------------------------------------------

-- 3.1 Retirar tabla public.note_yjs_updates y sus políticas RLS
DO $$
DECLARE
    v_pol RECORD;
    v_tbl_comment TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'note_yjs_updates'
    ) THEN
        -- Comprobar comentario de catálogo antes de tocar el objeto
        SELECT obj_description('public.note_yjs_updates'::regclass, 'pg_class') INTO v_tbl_comment;
        IF v_tbl_comment = 'veyra_managed:deploy_05' THEN
            RAISE EXCEPTION 'Limpieza abortada: public.note_yjs_updates pertenece a deploy_05 y no debe ser eliminada.' USING ERRCODE = '55000';
        ELSIF v_tbl_comment IS NOT NULL THEN
            RAISE EXCEPTION 'Limpieza abortada: public.note_yjs_updates tiene un comentario no reconocido (%). Se aborta para proteger objetos ajenos.',
                v_tbl_comment USING ERRCODE = '55000';
        END IF;

        EXECUTE 'LOCK TABLE public.note_yjs_updates IN ACCESS EXCLUSIVE MODE;';

        -- Eliminar cada política RLS asociada a la tabla
        FOR v_pol IN
            SELECT policyname 
            FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = 'note_yjs_updates'
        LOOP
            EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(v_pol.policyname) || ' ON public.note_yjs_updates;';
        END LOOP;

        -- Eliminar tabla sin CASCADE (elimina datos de prueba contenidos en ella)
        DROP TABLE public.note_yjs_updates;
    END IF;
END $$;

-- 3.2 Retirar tabla public.note_yjs_snapshots y sus políticas RLS
DO $$
DECLARE
    v_pol RECORD;
    v_tbl_comment TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'note_yjs_snapshots'
    ) THEN
        -- Comprobar comentario de catálogo antes de tocar el objeto
        SELECT obj_description('public.note_yjs_snapshots'::regclass, 'pg_class') INTO v_tbl_comment;
        IF v_tbl_comment = 'veyra_managed:deploy_05' THEN
            RAISE EXCEPTION 'Limpieza abortada: public.note_yjs_snapshots pertenece a deploy_05 y no debe ser eliminada.' USING ERRCODE = '55000';
        ELSIF v_tbl_comment IS NOT NULL THEN
            RAISE EXCEPTION 'Limpieza abortada: public.note_yjs_snapshots tiene un comentario no reconocido (%). Se aborta para proteger objetos ajenos.',
                v_tbl_comment USING ERRCODE = '55000';
        END IF;

        EXECUTE 'LOCK TABLE public.note_yjs_snapshots IN ACCESS EXCLUSIVE MODE;';

        -- Eliminar cada política RLS asociada a la tabla
        FOR v_pol IN
            SELECT policyname 
            FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = 'note_yjs_snapshots'
        LOOP
            EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(v_pol.policyname) || ' ON public.note_yjs_snapshots;';
        END LOOP;

        -- Eliminar tabla sin CASCADE (elimina datos de prueba contenidos en ella)
        DROP TABLE public.note_yjs_snapshots;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 4: COMPROBACIÓN DE DEPENDENCIAS EXTERNAS HACIA LAS FUNCIONES A ELIMINAR
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_dep RECORD;
BEGIN
    -- 4.1 Comprobar si tablas preexistentes tienen políticas RLS que dependan
    -- de las funciones legacy que se van a eliminar (append_note_yjs_update, compact_note_yjs_snapshot).
    -- NOTA: is_note_editor e is_note_reader se conservan intactas en la base de datos
    -- precisamente para mantener operativas las políticas de Realtime (note_yjs, note_live_edit, etc.).
    FOR v_dep IN
        SELECT c.relname AS table_name, pol.polname AS policy_name, p.proname AS func_name
        FROM pg_policy pol
        JOIN pg_class c ON pol.polrelid = c.oid
        JOIN pg_depend d ON d.objid = pol.oid
        JOIN pg_proc p ON d.refobjid = p.oid
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN ('append_note_yjs_update', 'compact_note_yjs_snapshot')
    LOOP
        RAISE EXCEPTION 'Limpieza abortada: la política % en la tabla % depende de la función legacy %.',
            v_dep.policy_name, v_dep.table_name, v_dep.func_name USING ERRCODE = '2BP01';
    END LOOP;

    -- 4.2 Comprobar si vistas dependen de las funciones legacy que se van a eliminar
    FOR v_dep IN
        SELECT DISTINCT c.relname AS view_name, p.proname AS func_name
        FROM pg_depend d
        JOIN pg_rewrite r ON d.objid = r.oid
        JOIN pg_class c ON r.ev_class = c.oid
        JOIN pg_proc p ON d.refobjid = p.oid
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN ('append_note_yjs_update', 'compact_note_yjs_snapshot')
          AND c.relkind IN ('v', 'm')
    LOOP
        RAISE EXCEPTION 'Limpieza abortada: la vista % depende de la función legacy %.',
            v_dep.view_name, v_dep.func_name USING ERRCODE = '2BP01';
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 5: RETIRADA CONTROLADA DE LAS FUNCIONES LEGACY YJS A ELIMINAR
-- ------------------------------------------------------------------------------
-- public.is_note_editor(text) e is_note_reader(text) SE CONSERVAN para mantener intactas
-- las políticas de Realtime (realtime_broadcast_note_yjs y realtime_listen_note_yjs);
-- ambas serán actualizadas in-situ en deploy-05 conservando su identidad.
DO $$
DECLARE
    v_func RECORD;
    v_fn_comment TEXT;
    v_args TEXT;
    v_is_allowed BOOLEAN;
BEGIN
    FOR v_func IN
        SELECT p.oid, p.oid::regprocedure::text AS proc_sig, p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN ('append_note_yjs_update', 'compact_note_yjs_snapshot')
    LOOP
        v_args := pg_catalog.pg_get_function_identity_arguments(v_func.oid);

        -- Validar si la firma corresponde exactamente a las funciones legacy a retirar
        v_is_allowed := (
            (
                v_func.proname = 'append_note_yjs_update'
                AND v_args = 'p_note_id text, p_client_id text, p_update_data text, p_update_hash text'
            ) OR
            (
                v_func.proname = 'compact_note_yjs_snapshot'
                AND v_args = 'p_note_id text, p_new_snapshot text, p_new_state_vector text, p_up_to_update_id bigint, p_delete_consolidated boolean'
            )
        );

        IF NOT v_is_allowed THEN
            RAISE EXCEPTION 'Limpieza abortada: se detectó una sobrecarga no autorizada de la función % (firma: %). Se requiere revisión manual.',
                v_func.proname, v_func.proc_sig USING ERRCODE = '55000';
        END IF;

        -- Comprobar comentario de catálogo antes de eliminar
        SELECT obj_description(v_func.oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment = 'veyra_managed:deploy_05' THEN
            RAISE EXCEPTION 'Limpieza abortada: la función % pertenece a deploy_05 y no debe ser eliminada.',
                v_func.proc_sig USING ERRCODE = '55000';
        ELSIF v_fn_comment IS NOT NULL THEN
            RAISE EXCEPTION 'Limpieza abortada: la función % tiene un comentario no reconocido (%). Se aborta para proteger objetos ajenos.',
                v_func.proc_sig, v_fn_comment USING ERRCODE = '55000';
        END IF;

        -- Eliminar firma autorizada sin CASCADE
        EXECUTE 'DROP FUNCTION ' || v_func.proc_sig || ';';
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 6: VERIFICACIÓN POST-LIMPIEZA DE ENTORNO LIMPIO
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_remaining_tbls INTEGER := 0;
    v_remaining_funcs INTEGER := 0;
    v_notes_count INTEGER := 0;
    v_fn_comment TEXT;
    v_trg_comment TEXT;
BEGIN
    -- 6.1 Asegurar que no quedan tablas Yjs
    SELECT count(*) INTO v_remaining_tbls
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('note_yjs_updates', 'note_yjs_snapshots');

    IF v_remaining_tbls > 0 THEN
        RAISE EXCEPTION 'Verificación post-limpieza fallida: aún existen % tabla(s) Yjs.', v_remaining_tbls USING ERRCODE = '55000';
    END IF;

    -- 6.2 Asegurar que no quedan funciones Yjs legacy eliminables
    SELECT count(*) INTO v_remaining_funcs
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN ('append_note_yjs_update', 'compact_note_yjs_snapshot');

    IF v_remaining_funcs > 0 THEN
        RAISE EXCEPTION 'Verificación post-limpieza fallida: aún existen % función(es) Yjs eliminables.', v_remaining_funcs USING ERRCODE = '55000';
    END IF;

    -- 6.2.1 Asegurar que public.is_note_editor(text) e is_note_reader(text) permanecen intactas
    IF to_regprocedure('public.is_note_editor(text)') IS NULL THEN
        RAISE EXCEPTION 'Verificación post-limpieza fallida: public.is_note_editor(text) debía conservarse pero no existe.' USING ERRCODE = '55000';
    END IF;

    IF to_regprocedure('public.is_note_reader(text)') IS NULL THEN
        RAISE EXCEPTION 'Verificación post-limpieza fallida: public.is_note_reader(text) debía conservarse pero no existe.' USING ERRCODE = '55000';
    END IF;

    -- 6.3 Asegurar que public.notes y sus notas se mantienen intactas en 'rest'
    SELECT count(*) INTO v_notes_count FROM public.notes;
    IF v_notes_count < 78 THEN
        RAISE EXCEPTION 'Verificación post-limpieza fallida: el recuento de notas es inferior a 78 (detectadas: %).',
            v_notes_count USING ERRCODE = '55000';
    END IF;

    IF EXISTS (SELECT 1 FROM public.notes WHERE sync_mode != 'rest') THEN
        RAISE EXCEPTION 'Verificación post-limpieza fallida: se detectaron notas fuera del modo ''rest''.' USING ERRCODE = '55000';
    END IF;

    -- 6.4 Asegurar que la protección de deploy-04 permanece activa
    SELECT obj_description(to_regprocedure('public.protect_note_yjs_content()'), 'pg_proc') INTO v_fn_comment;
    IF v_fn_comment IS NULL OR v_fn_comment != 'veyra_managed:deploy_04' THEN
        RAISE EXCEPTION 'Verificación post-limpieza fallida: protect_note_yjs_content() perdió su marca de deploy-04.' USING ERRCODE = '55000';
    END IF;

    SELECT d.description INTO v_trg_comment
    FROM pg_trigger t
    LEFT JOIN pg_description d ON d.objoid = t.oid AND d.classoid = 'pg_trigger'::regclass
    WHERE t.tgrelid = 'public.notes'::regclass 
      AND t.tgname = 'trg_protect_note_yjs_content' 
      AND NOT t.tgisinternal;

    IF v_trg_comment IS NULL OR v_trg_comment != 'veyra_managed:deploy_04' THEN
        RAISE EXCEPTION 'Verificación post-limpieza fallida: trg_protect_note_yjs_content perdió su marca de deploy-04.' USING ERRCODE = '55000';
    END IF;
END $$;

COMMIT;
