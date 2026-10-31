-- ==============================================================================
-- VEYRA - ROLLBACK SELECTIVO Y SEGURO DE FASE 3.1 (PRODUCCIÓN FINAL)
-- Archivo: src/poc-yjs/deploy-05-rollback.sql
-- ==============================================================================
-- PROPÓSITO:
-- Revertir única y exclusivamente los objetos instalados por la migración deploy_05,
-- restaurando la función 'protect_note_yjs_content()' a la versión exacta de deploy_04.
--
-- GARANTÍAS DE SEGURIDAD PARA PRODUCCIÓN:
-- 1. Bloqueo exclusivo inicial sobre las tablas para evitar condiciones de carrera.
-- 2. Aborta inmediatamente si detecta al menos una nota en modo 'yjs'.
-- 3. Aborta inmediatamente si detecta deltas existentes en 'note_yjs_updates'
--    o snapshots en 'note_yjs_snapshots'.
-- 4. No utiliza CASCADE en ninguna sentencia DROP.
-- 5. Restaura la función 'protect_note_yjs_content()' con la lógica y marca 'veyra_managed:deploy_04'.
-- 6. No elimina ni altera el trigger 'trg_protect_note_yjs_content' preexistente.
-- 7. Elimina únicamente objetos que porten la marca de catálogo 'veyra_managed:deploy_05'.
-- 8. Transaccional: Ejecución atómica en bloque BEGIN ... COMMIT.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '30s';

-- ------------------------------------------------------------------------------
-- PASO 1: BLOQUEO PREVENTIVO Y COMPROBACIÓN DE AUSENCIA DE DATOS YJS
-- ------------------------------------------------------------------------------
-- Adquirir bloqueo exclusivo para serializar la transacción e impedir que
-- transacciones concurrentes inserten datos mientras se verifica el estado.
LOCK TABLE public.notes IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
    v_yjs_notes_count INTEGER := 0;
    v_updates_count INTEGER := 0;
    v_snapshots_count INTEGER := 0;
BEGIN
    -- 1.1 Comprobar si existen notas en modo 'yjs' en public.notes
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'sync_mode'
    ) THEN
        SELECT count(*) INTO v_yjs_notes_count 
        FROM public.notes 
        WHERE sync_mode = 'yjs';

        IF v_yjs_notes_count > 0 THEN
            RAISE EXCEPTION 'Rollback abortado por seguridad: existen % nota(s) con sync_mode = ''yjs''. Revertir deploy_05 desprotegería esas notas frente a escrituras REST.',
                v_yjs_notes_count USING ERRCODE = '55000';
        END IF;
    END IF;

    -- 1.2 Comprobar si existen deltas registrados en public.note_yjs_updates
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'note_yjs_updates'
    ) THEN
        EXECUTE 'LOCK TABLE public.note_yjs_updates IN ACCESS EXCLUSIVE MODE;';
        SELECT count(*) INTO v_updates_count 
        FROM public.note_yjs_updates;

        IF v_updates_count > 0 THEN
            RAISE EXCEPTION 'Rollback abortado por seguridad: existen % actualización(es) registradas en public.note_yjs_updates. Eliminar la tabla causaría pérdida irrecuperable de datos.',
                v_updates_count USING ERRCODE = '55000';
        END IF;
    END IF;

    -- 1.3 Comprobar si existen snapshots registrados en public.note_yjs_snapshots
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'note_yjs_snapshots'
    ) THEN
        EXECUTE 'LOCK TABLE public.note_yjs_snapshots IN ACCESS EXCLUSIVE MODE;';
        SELECT count(*) INTO v_snapshots_count 
        FROM public.note_yjs_snapshots;

        IF v_snapshots_count > 0 THEN
            RAISE EXCEPTION 'Rollback abortado por seguridad: existen % snapshot(s) registrados en public.note_yjs_snapshots. Eliminar la tabla causaría pérdida de datos.',
                v_snapshots_count USING ERRCODE = '55000';
        END IF;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 2: RESTAURAR FUNCIÓN TRIGGER A SU ESTADO EXACTO DE DEPLOY_04
-- ------------------------------------------------------------------------------
-- Restaura la función original de deploy-04 y su marca de catálogo.
-- El trigger trg_protect_note_yjs_content no se elimina ni recrea.
DO $$
DECLARE
    v_fn_oid OID;
    v_fn_comment TEXT;
BEGIN
    v_fn_oid := to_regprocedure('public.protect_note_yjs_content()');
    IF v_fn_oid IS NOT NULL THEN
        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment = 'veyra_managed:deploy_05' THEN
            -- Reinstalar versión exacta de deploy_04
            CREATE OR REPLACE FUNCTION public.protect_note_yjs_content()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SECURITY INVOKER
            SET search_path = ''
            AS $fn$
            BEGIN
                -- 4.2 CONTROL EN INSERCIÓN (INSERT)
                IF TG_OP = 'INSERT' THEN
                    -- Todas las notas nuevas comienzan obligatoriamente en 'rest'
                    NEW.sync_mode := 'rest';
                    RETURN NEW;
                END IF;

                -- 4.3 CONTROL EN ACTUALIZACIÓN (UPDATE)
                IF TG_OP = 'UPDATE' THEN
                    -- A) CONSERVACIÓN ABSOLUTA DE MODO EN CUALQUIER ACTUALIZACIÓN:
                    -- Si el valor entrante difiere del anterior (incluido NULL), se conserva OLD.sync_mode.
                    -- Esto impide cualquier cambio de modo por REST: ni de 'rest' a 'yjs', ni de 'yjs' a 'rest'.
                    IF NEW.sync_mode IS DISTINCT FROM OLD.sync_mode THEN
                        NEW.sync_mode := OLD.sync_mode;
                    END IF;

                    -- B) BLINDAJE DE CONTENIDO Y MONOTONÍA PARA NOTAS YJS:
                    IF OLD.sync_mode = 'yjs' THEN
                        -- B.1: Blindaje del contenido editable:
                        -- Se neutraliza cualquier intento de sobreescribir 'content' vía REST.
                        IF NEW.content IS DISTINCT FROM OLD.content THEN
                            NEW.content := OLD.content;
                        END IF;

                        -- B.2: Monotonía temporal de updated_at_ms:
                        -- Si el valor previo no es nulo, se rechazan valores nuevos nulos o inferiores.
                        -- Si tanto el previo como el nuevo son nulos, NEW permanece nulo sin provocar errores.
                        IF OLD.updated_at_ms IS NOT NULL AND (NEW.updated_at_ms IS NULL OR NEW.updated_at_ms < OLD.updated_at_ms) THEN
                            NEW.updated_at_ms := OLD.updated_at_ms;
                        END IF;

                        -- B.3: Monotonía temporal de last_modified_ms:
                        -- Si el valor previo no es nulo, se rechazan valores nuevos nulos o inferiores.
                        -- Si tanto el previo como el nuevo son nulos, NEW permanece nulo sin provocar errores.
                        IF OLD.last_modified_ms IS NOT NULL AND (NEW.last_modified_ms IS NULL OR NEW.last_modified_ms < OLD.last_modified_ms) THEN
                            NEW.last_modified_ms := OLD.last_modified_ms;
                        END IF;

                        -- Metadatos legítimos (title, folder_id, deleted, attachments, links) siguen actualizándose.
                    END IF;

                    RETURN NEW;
                END IF;

                RETURN NEW;
            END;
            $fn$;

            REVOKE ALL ON FUNCTION public.protect_note_yjs_content() FROM PUBLIC, anon, authenticated;
            COMMENT ON FUNCTION public.protect_note_yjs_content() IS 'veyra_managed:deploy_04';
        ELSE
            RAISE EXCEPTION 'Rollback abortado: public.protect_note_yjs_content() no está administrada por deploy_05 (marca: %).',
                COALESCE(v_fn_comment, '<sin comentario>') USING ERRCODE = '55000';
        END IF;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 3: RETIRADA CONTROLADA DE RPCs INSTALADAS POR DEPLOY_05
-- ------------------------------------------------------------------------------

-- 3.1 Retirar RPC activate_note_yjs_mode
DO $$
DECLARE
    v_fn_oid OID;
    v_fn_comment TEXT;
BEGIN
    v_fn_oid := to_regprocedure('public.activate_note_yjs_mode(text, text, text, text, text, bigint, text)');
    IF v_fn_oid IS NOT NULL THEN
        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment = 'veyra_managed:deploy_05' THEN
            DROP FUNCTION public.activate_note_yjs_mode(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT);
        ELSE
            RAISE EXCEPTION 'Rollback abortado: public.activate_note_yjs_mode no pertenece a deploy_05 (marca: %)',
                COALESCE(v_fn_comment, '<sin comentario>') USING ERRCODE = '55000';
        END IF;
    END IF;
END $$;

-- 3.2 Retirar RPC compact_note_yjs_snapshot
DO $$
DECLARE
    v_fn_oid OID;
    v_fn_comment TEXT;
BEGIN
    v_fn_oid := to_regprocedure('public.compact_note_yjs_snapshot(text, text, text, bigint, text)');
    IF v_fn_oid IS NOT NULL THEN
        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment = 'veyra_managed:deploy_05' THEN
            DROP FUNCTION public.compact_note_yjs_snapshot(TEXT, TEXT, TEXT, BIGINT, TEXT);
        ELSE
            RAISE EXCEPTION 'Rollback abortado: public.compact_note_yjs_snapshot no pertenece a deploy_05 (marca: %)',
                COALESCE(v_fn_comment, '<sin comentario>') USING ERRCODE = '55000';
        END IF;
    END IF;
END $$;

-- 3.3 Retirar RPC append_note_yjs_update
DO $$
DECLARE
    v_fn_oid OID;
    v_fn_comment TEXT;
BEGIN
    v_fn_oid := to_regprocedure('public.append_note_yjs_update(text, text, text, text)');
    IF v_fn_oid IS NOT NULL THEN
        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment = 'veyra_managed:deploy_05' THEN
            DROP FUNCTION public.append_note_yjs_update(TEXT, TEXT, TEXT, TEXT);
        ELSE
            RAISE EXCEPTION 'Rollback abortado: public.append_note_yjs_update no pertenece a deploy_05 (marca: %)',
                COALESCE(v_fn_comment, '<sin comentario>') USING ERRCODE = '55000';
        END IF;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 4: RETIRADA CONTROLADA DE TABLAS DE PERSISTENCIA YJS (SIN CASCADE)
-- ------------------------------------------------------------------------------

-- 4.1 Retirar tabla public.note_yjs_updates
DO $$
DECLARE
    v_tbl_comment TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'note_yjs_updates') THEN
        SELECT obj_description('public.note_yjs_updates'::regclass, 'pg_class') INTO v_tbl_comment;
        IF v_tbl_comment = 'veyra_managed:deploy_05' THEN
            DROP POLICY IF EXISTS "note_yjs_updates_select" ON public.note_yjs_updates;
            DROP TABLE public.note_yjs_updates;
        ELSE
            RAISE EXCEPTION 'Rollback abortado: public.note_yjs_updates no pertenece a deploy_05 (marca: %)',
                COALESCE(v_tbl_comment, '<sin comentario>') USING ERRCODE = '55000';
        END IF;
    END IF;
END $$;

-- 4.2 Retirar tabla public.note_yjs_snapshots
DO $$
DECLARE
    v_tbl_comment TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'note_yjs_snapshots') THEN
        SELECT obj_description('public.note_yjs_snapshots'::regclass, 'pg_class') INTO v_tbl_comment;
        IF v_tbl_comment = 'veyra_managed:deploy_05' THEN
            DROP POLICY IF EXISTS "note_yjs_snapshots_select" ON public.note_yjs_snapshots;
            DROP TABLE public.note_yjs_snapshots;
        ELSE
            RAISE EXCEPTION 'Rollback abortado: public.note_yjs_snapshots no pertenece a deploy_05 (marca: %)',
                COALESCE(v_tbl_comment, '<sin comentario>') USING ERRCODE = '55000';
        END IF;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 5: RESTAURACIÓN DE FUNCIONES DE AUTORIZACIÓN A SU VERSIÓN LEGACY
-- ------------------------------------------------------------------------------
-- No se eliminan con DROP para conservar la identidad de las funciones y mantener
-- intactas las políticas de Realtime (realtime_broadcast_note_yjs y realtime_listen_note_yjs).
-- Si portan la marca 'veyra_managed:deploy_05', se restauran a sus definiciones
-- legacy originales y se devuelven sus comentarios a NULL.

-- 5.1 Restaurar public.is_note_editor(text)
DO $$
DECLARE
    v_fn_oid OID;
    v_fn_comment TEXT;
BEGIN
    v_fn_oid := to_regprocedure('public.is_note_editor(text)');
    IF v_fn_oid IS NOT NULL THEN
        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment = 'veyra_managed:deploy_05' THEN
            CREATE OR REPLACE FUNCTION public.is_note_editor(p_note_id text)
            RETURNS boolean
            LANGUAGE sql
            SECURITY DEFINER
            SET search_path = ''
            STABLE
            AS $fn$
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
            $fn$;

            REVOKE ALL ON FUNCTION public.is_note_editor(text) FROM PUBLIC, anon;
            GRANT EXECUTE ON FUNCTION public.is_note_editor(text) TO authenticated;
            COMMENT ON FUNCTION public.is_note_editor(text) IS NULL;
        END IF;
    END IF;
END $$;

-- 5.2 Restaurar public.is_note_reader(text)
DO $$
DECLARE
    v_fn_oid OID;
    v_fn_comment TEXT;
BEGIN
    v_fn_oid := to_regprocedure('public.is_note_reader(text)');
    IF v_fn_oid IS NOT NULL THEN
        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment = 'veyra_managed:deploy_05' THEN
            CREATE OR REPLACE FUNCTION public.is_note_reader(p_note_id text)
            RETURNS boolean
            LANGUAGE sql
            SECURITY DEFINER
            SET search_path = ''
            STABLE
            AS $fn$
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
            $fn$;

            REVOKE ALL ON FUNCTION public.is_note_reader(text) FROM PUBLIC, anon;
            GRANT EXECUTE ON FUNCTION public.is_note_reader(text) TO authenticated;
            COMMENT ON FUNCTION public.is_note_reader(text) IS NULL;
        END IF;
    END IF;
END $$;

COMMIT;
