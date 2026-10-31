-- ==============================================================================
-- VEYRA - ROLLBACK SELECTIVO Y SEGURO DE FASE 2 (VERSIÓN FINAL)
-- Archivo: src/poc-yjs/deploy-04-rollback.sql
-- ==============================================================================
-- PROPÓSITO:
-- Revertir única y exclusivamente los objetos instalados por la migración deploy_04.
-- Si una columna, restricción, función o trigger preexistía, se preserva intacto.
--
-- GARANTÍAS Y LIMITACIONES EXPRESAS DEL ROLLBACK:
-- 1. Este script abortará inmediatamente si detecta que existe al menos una nota
--    con sync_mode = 'yjs'.
-- 2. No se puede ejecutar este rollback si existen notas en modo Yjs, pues retirar
--    la protección expondría esas notas a que clientes REST sobreescriban su contenido.
-- 3. Si en el futuro existiesen notas Yjs y se requiriese desinstalar este componente,
--    será obligatoria una migración explícita de datos de negocio que consolide dichas notas.
-- 4. No oculta errores generales: cada comprobación inspecciona metadatos y cualquier
--    error no previsto abortará limpiamente la transacción en lugar de suprimirse.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '30s';

-- ------------------------------------------------------------------------------
-- PRECONDICIÓN ESTRICTA: ABORTAR SI EXISTEN NOTAS EN MODO YJS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_yjs_count INTEGER := 0;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'sync_mode'
    ) THEN
        SELECT count(*) INTO v_yjs_count 
        FROM public.notes 
        WHERE sync_mode = 'yjs';

        IF v_yjs_count > 0 THEN
            RAISE EXCEPTION 'Rollback abortado por seguridad: se encontraron % nota(s) con sync_mode = ''yjs''. Eliminar la protección provocaría inconsistencias y desprotección de datos.', v_yjs_count
                USING ERRCODE = '55000';
        END IF;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- RETIRADA SELECTIVA DE OBJETOS GESTIONADOS
-- ------------------------------------------------------------------------------

-- 1. Eliminar el trigger ÚNICAMENTE si fue administrado por deploy_04
DO $$
DECLARE
    v_trg_comment TEXT;
BEGIN
    SELECT d.description INTO v_trg_comment
    FROM pg_trigger t
    JOIN pg_description d ON d.objoid = t.oid AND d.classoid = 'pg_trigger'::regclass
    WHERE t.tgrelid = 'public.notes'::regclass 
      AND t.tgname = 'trg_protect_note_yjs_content'
      AND NOT t.tgisinternal;

    IF v_trg_comment = 'veyra_managed:deploy_04' THEN
        DROP TRIGGER trg_protect_note_yjs_content ON public.notes;
    END IF;
END $$;

-- 2. Eliminar la función ÚNICAMENTE si fue administrada por deploy_04
DO $$
DECLARE
    v_fn_oid OID;
    v_fn_comment TEXT;
BEGIN
    v_fn_oid := to_regprocedure('public.protect_note_yjs_content()');
    IF v_fn_oid IS NOT NULL THEN
        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment = 'veyra_managed:deploy_04' THEN
            DROP FUNCTION public.protect_note_yjs_content();
        END IF;
    END IF;
END $$;

-- 3. Retirar la restricción CHECK ÚNICAMENTE si fue instalada por deploy_04
DO $$
DECLARE
    v_con_comment TEXT;
BEGIN
    SELECT d.description INTO v_con_comment
    FROM pg_constraint c
    JOIN pg_description d ON d.objoid = c.oid AND d.classoid = 'pg_constraint'::regclass
    WHERE c.conrelid = 'public.notes'::regclass AND c.conname = 'chk_notes_sync_mode';

    IF v_con_comment = 'veyra_managed:deploy_04' THEN
        ALTER TABLE public.notes DROP CONSTRAINT chk_notes_sync_mode;
    END IF;
END $$;

-- 4. Retirar la columna sync_mode ÚNICAMENTE si fue instalada por deploy_04
DO $$
DECLARE
    v_col_comment TEXT;
BEGIN
    SELECT col_description('public.notes'::regclass, attnum) INTO v_col_comment
    FROM pg_attribute
    WHERE attrelid = 'public.notes'::regclass AND attname = 'sync_mode';

    IF v_col_comment = 'veyra_managed:deploy_04' THEN
        ALTER TABLE public.notes DROP COLUMN sync_mode;
    END IF;
END $$;

COMMIT;
