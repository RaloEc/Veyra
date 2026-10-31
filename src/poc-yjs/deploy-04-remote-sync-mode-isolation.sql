-- ==============================================================================
-- VEYRA - FASE 2: AISLAMIENTO REMOTO Y PROTECCIÓN DE CONTENIDO YJS (VERSIÓN FINAL)
-- Archivo: src/poc-yjs/deploy-04-remote-sync-mode-isolation.sql
-- ==============================================================================
-- PROPÓSITO:
-- 1. Añadir y validar con estricta idempotencia la columna 'sync_mode' en public.notes.
--    Si ya preexiste, se comprueba su definición sin modificar silenciosamente esquemas ajenos.
-- 2. Validar que la restricción CHECK admita exactamente los literales 'rest' y 'yjs'
--    en minúsculas mediante una lista blanca de formas canónicas exactas del compilador de PostgreSQL.
-- 3. Comprobar la propiedad de funciones y triggers preexistentes antes de tocarlos.
--    Si existen sin la marca 'veyra_managed:deploy_04', la migración aborta con error explícito.
-- 4. Marcar mediante comentarios de catálogo (COMMENT ON) todos los objetos creados para
--    garantizar que el rollback preserve cualquier objeto preexistente.
-- 5. Garantizar que todos los INSERT comiencen en 'rest'.
-- 6. En cualquier UPDATE, si el sync_mode entrante difiere del anterior (incluido NULL),
--    se preserva incondicionalmente OLD.sync_mode mediante comparación 'IS DISTINCT FROM'.
-- 7. Para notas en 'yjs', blindar 'content' contra sobreescrituras REST y asegurar la
--    monotonía de 'updated_at_ms' y 'last_modified_ms' frente a valores nulos o regresivos.
--
-- GARANTÍAS DE SEGURIDAD PARA PRODUCCIÓN:
-- - SET LOCAL lock_timeout = '4s': Si la adquisición de bloqueos exclusivos (AccessExclusiveLock)
--   se demora más de 4 segundos por contención con el tráfico de usuarios, aborta la transacción (55P03).
-- - SET LOCAL statement_timeout = '30s': Límite máximo de ejecución para toda la transacción.
-- - Transaccional: Ejecución atómica en bloque BEGIN ... COMMIT.
-- - Sin índices innecesarios: Omitido para evitar bloqueos y contención innecesaria de DDL.
-- - Sin RPC de activación: No se incluye procedimiento de activación Yjs en esta fase.
-- ==============================================================================

BEGIN;

-- Límites de espera estrictamente locales a esta transacción
SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '30s';

-- ------------------------------------------------------------------------------
-- PASO 1: VALIDACIÓN ESTRICTA DE PRECONDICIONES Y TIPOS EN public.notes
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_user_id_type TEXT;
    v_content_type TEXT;
    v_updated_at_type TEXT;
    v_last_modified_type TEXT;
    v_updated_at_nullable TEXT;
    v_last_modified_nullable TEXT;
BEGIN
    -- 1.1 Comprobar existencia de la tabla public.notes
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'notes'
    ) THEN
        RAISE EXCEPTION 'Precondición fallida: la tabla public.notes no existe en el esquema public.' 
            USING ERRCODE = '42P01';
    END IF;

    -- 1.2 Comprobar columna id (debe ser text)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notes' 
          AND column_name = 'id' AND data_type = 'text'
    ) THEN
        RAISE EXCEPTION 'Precondición fallida: la columna public.notes.id no existe o su tipo no es text.' 
            USING ERRCODE = '42804';
    END IF;

    -- 1.3 Comprobar columna user_id (soporta uuid o text para comparaciones seguras)
    SELECT data_type INTO v_user_id_type
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'user_id';

    IF v_user_id_type IS NULL OR v_user_id_type NOT IN ('uuid', 'text') THEN
        RAISE EXCEPTION 'Precondición fallida: public.notes.user_id debe ser de tipo uuid o text (detectado: %)',
            COALESCE(v_user_id_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    -- 1.4 Comprobar columna content (debe ser text)
    SELECT data_type INTO v_content_type
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'content';

    IF v_content_type IS NULL OR v_content_type != 'text' THEN
        RAISE EXCEPTION 'Precondición fallida: public.notes.content debe ser de tipo text (detectado: %)',
            COALESCE(v_content_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    -- 1.5 Comprobar tipos y registrar nulabilidad de marcas de tiempo
    SELECT data_type, is_nullable INTO v_updated_at_type, v_updated_at_nullable
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'updated_at_ms';

    IF v_updated_at_type IS NULL OR v_updated_at_type NOT IN ('bigint', 'integer') THEN
        RAISE EXCEPTION 'Precondición fallida: public.notes.updated_at_ms debe ser bigint o integer (detectado: %)',
            COALESCE(v_updated_at_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    SELECT data_type, is_nullable INTO v_last_modified_type, v_last_modified_nullable
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'last_modified_ms';

    IF v_last_modified_type IS NULL OR v_last_modified_type NOT IN ('bigint', 'integer') THEN
        RAISE EXCEPTION 'Precondición fallida: public.notes.last_modified_ms debe ser bigint o integer (detectado: %)',
            COALESCE(v_last_modified_type, 'INEXISTENTE') USING ERRCODE = '42804';
    END IF;

    -- Documentar para auditoría de transacción el estado de nulabilidad detectado
    RAISE NOTICE 'Precondiciones superadas: updated_at_ms (nullable=%), last_modified_ms (nullable=%)',
        v_updated_at_nullable, v_last_modified_nullable;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 2: GESTIÓN IDEMPOTENTE Y VALIDACIÓN DE LA COLUMNA sync_mode
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_col_exists BOOLEAN := FALSE;
    v_data_type TEXT;
    v_is_nullable TEXT;
    v_default TEXT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'sync_mode'
    ) INTO v_col_exists;

    IF NOT v_col_exists THEN
        -- ESCENARIO A: La columna no existe -> se crea y se marca como gestionada por deploy_04
        ALTER TABLE public.notes 
            ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'rest';
        
        COMMENT ON COLUMN public.notes.sync_mode IS 'veyra_managed:deploy_04';
    ELSE
        -- ESCENARIO B: La columna ya existe -> validar estrictamente su definición
        SELECT data_type, is_nullable, column_default
        INTO v_data_type, v_is_nullable, v_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'sync_mode';

        IF v_data_type != 'text' 
           OR v_is_nullable != 'NO' 
           OR trim(COALESCE(v_default, '')) != '''rest''::text' THEN
            RAISE EXCEPTION 'Incompatibilidad en columna preexistente: public.notes.sync_mode ya existe pero su definición no coincide exactamente con el estado requerido (tipo text, NOT NULL, DEFAULT ''rest''::text). Detectado: data_type=%, is_nullable=%, column_default=%. La migración no modificará silenciosamente una columna preexistente.',
                v_data_type, v_is_nullable, COALESCE(v_default, '<null>')
                USING ERRCODE = '42804';
        END IF;
        -- Si la columna ya existe con la definición exacta, se preserva sin sobreescribir su comentario
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 3: VALIDACIÓN RIGUROSA DE EQUIVALENCIA EXACTA EN chk_notes_sync_mode
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_con_oid OID;
    v_convalidated BOOLEAN;
    v_condef TEXT;
    v_norm_condef TEXT;
BEGIN
    SELECT oid, convalidated, pg_get_constraintdef(oid)
    INTO v_con_oid, v_convalidated, v_condef
    FROM pg_constraint
    WHERE conrelid = 'public.notes'::regclass AND conname = 'chk_notes_sync_mode';

    IF v_con_oid IS NOT NULL THEN
        -- 3.1 Comprobar que la restricción existente esté formalmente validada
        IF NOT v_convalidated THEN
            RAISE EXCEPTION 'La restricción chk_notes_sync_mode existe pero no está validada (convalidated = false).'
                USING ERRCODE = '55000';
        END IF;

        -- 3.2 Validación contra lista blanca de formas canónicas generadas por el compilador de PostgreSQL
        -- Normaliza únicamente espacios interiores repetidos para tolerar formato de salida del motor
        v_norm_condef := regexp_replace(trim(v_condef), '\s+', ' ', 'g');

        IF v_norm_condef NOT IN (
            'CHECK ((sync_mode = ANY (ARRAY[''rest''::text, ''yjs''::text])))',
            'CHECK ((sync_mode = ANY (ARRAY[''yjs''::text, ''rest''::text])))',
            'CHECK ((sync_mode = ANY (ARRAY[''rest''::character varying, ''yjs''::character varying])))',
            'CHECK ((sync_mode = ANY (ARRAY[''yjs''::character varying, ''rest''::character varying])))',
            'CHECK (((sync_mode = ''rest''::text) OR (sync_mode = ''yjs''::text)))',
            'CHECK (((sync_mode = ''yjs''::text) OR (sync_mode = ''rest''::text)))',
            'CHECK ((sync_mode = ''rest''::text OR sync_mode = ''yjs''::text))',
            'CHECK ((sync_mode = ''yjs''::text OR sync_mode = ''rest''::text))'
        ) THEN
            RAISE EXCEPTION 'Restricción incompatible: chk_notes_sync_mode existe con definición no equivalente (%). Se exige exactamente CHECK (sync_mode IN (''rest'', ''yjs'')) sin valores alternativos ni diferencias de capitalización.',
                v_condef USING ERRCODE = '42804';
        END IF;
    ELSE
        -- Crear la restricción y marcarla como gestionada por deploy_04
        ALTER TABLE public.notes 
            ADD CONSTRAINT chk_notes_sync_mode CHECK (sync_mode IN ('rest', 'yjs'));
            
        COMMENT ON CONSTRAINT chk_notes_sync_mode ON public.notes IS 'veyra_managed:deploy_04';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- PASO 4: FUNCIÓN TRIGGER DE PROTECCIÓN DE CONTENIDO Y CONTROL DE MODO
-- ------------------------------------------------------------------------------
-- 4.1 Comprobar propiedad de la función si ya existía antes de reemplazarla
DO $$
DECLARE
    v_fn_oid OID;
    v_fn_comment TEXT;
BEGIN
    v_fn_oid := to_regprocedure('public.protect_note_yjs_content()');
    IF v_fn_oid IS NOT NULL THEN
        SELECT obj_description(v_fn_oid, 'pg_proc') INTO v_fn_comment;
        IF v_fn_comment IS NULL OR v_fn_comment != 'veyra_managed:deploy_04' THEN
            RAISE EXCEPTION 'Conflicto de propiedad: la función public.protect_note_yjs_content() ya existe y no está administrada por deploy_04 (comentario: %).',
                COALESCE(v_fn_comment, '<sin comentario>') USING ERRCODE = '55000';
        END IF;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.protect_note_yjs_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
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
$$;

-- Blindaje Anti-RPC: Evita la invocación directa desde la API REST (PostgREST)
REVOKE ALL ON FUNCTION public.protect_note_yjs_content() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.protect_note_yjs_content() IS 'veyra_managed:deploy_04';

-- ------------------------------------------------------------------------------
-- PASO 5: GESTIÓN IDEMPOTENTE DEL TRIGGER EN public.notes
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_trg_oid OID;
    v_trg_comment TEXT;
BEGIN
    SELECT t.oid, d.description
    INTO v_trg_oid, v_trg_comment
    FROM pg_trigger t
    LEFT JOIN pg_description d ON d.objoid = t.oid AND d.classoid = 'pg_trigger'::regclass
    WHERE t.tgrelid = 'public.notes'::regclass 
      AND t.tgname = 'trg_protect_note_yjs_content'
      AND NOT t.tgisinternal;

    IF v_trg_oid IS NOT NULL THEN
        -- Comprobar propiedad antes de sustituirlo
        IF v_trg_comment IS NULL OR v_trg_comment != 'veyra_managed:deploy_04' THEN
            RAISE EXCEPTION 'Conflicto de propiedad: el trigger trg_protect_note_yjs_content ya existe en public.notes y no está administrado por deploy_04 (comentario: %).',
                COALESCE(v_trg_comment, '<sin comentario>') USING ERRCODE = '55000';
        END IF;
        
        -- Si está administrado por deploy_04, se puede reemplazar limpiamente
        DROP TRIGGER trg_protect_note_yjs_content ON public.notes;
    END IF;
END $$;

CREATE TRIGGER trg_protect_note_yjs_content
    BEFORE INSERT OR UPDATE ON public.notes
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_note_yjs_content();

COMMENT ON TRIGGER trg_protect_note_yjs_content ON public.notes IS 'veyra_managed:deploy_04';

COMMIT;
