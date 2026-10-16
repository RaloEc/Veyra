-- ==============================================================================
-- VEYRA - DESPLIEGUE CONTROLADO: PARTE 2 (POLÍTICAS REALTIME PRIVADAS)
-- ==============================================================================
-- ATENCIÓN CRÍTICA:
-- Este script es INDEPENDIENTE de la Parte 1 y SOLO debe ejecutarse tras revisar
-- las políticas existentes en realtime.messages.
--
-- REGLA DE COMBINACIÓN "OR" DE POLÍTICAS EN POSTGRESQL:
-- En PostgreSQL, todas las políticas PERMISSIVE aplicables a un comando (SELECT/INSERT)
-- y rol se evalúan con un operador lógico "OR".
-- Si en tu proyecto existe una política previa en realtime.messages como:
--   "Authenticated users can access realtime" USING (true)
-- o sin filtro de tópico, añadir la política "realtime_listen_note_yjs" NO impedirá
-- que usuarios no autorizados escuchen los mensajes de Yjs, porque (TRUE OR ...) = TRUE.
--
-- Si preflight reportó políticas globales sin restricción de topic, primero debes
-- restringir las políticas existentes antes de aplicar este script.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '4s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
    v_table_exists BOOLEAN;
    v_rls_enabled BOOLEAN;
    v_broad_policies_count INTEGER;
    v_broad_policy_names TEXT;
BEGIN
    -- 1. Verificar existencia de realtime.messages
    SELECT EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'realtime' AND tablename = 'messages'
    ) INTO v_table_exists;

    IF NOT v_table_exists THEN
        RAISE EXCEPTION 'La tabla realtime.messages no existe. Habilite Supabase Realtime en su proyecto antes de instalar esta migración.' 
            USING ERRCODE = '42P01';
    END IF;

    -- 2. Verificar que RLS esté activado
    SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages';

    IF v_rls_enabled IS NOT TRUE THEN
        RAISE EXCEPTION 'RLS no está activo en realtime.messages. Active "Enable Private Channels" en Project Settings -> Realtime en el Dashboard de Supabase.' 
            USING ERRCODE = '55000';
    END IF;

    -- 3. Auditoría estricta de políticas permisivas preexistentes en realtime.messages
    -- REGLA POSTGRESQL: Todas las políticas PERMISSIVE aplicables a un rol y comando se combinan con OR.
    -- Si existe alguna política para 'authenticated' o 'public' en SELECT, INSERT o ALL que no restrinja
    -- el tópico (o cuyo USING/WITH CHECK sea NULL / true / sin filtro de topic), otorgaría acceso
    -- automático a los canales privados 'note_yjs_*', anulando la autorización de Veyra.
    SELECT 
        count(*),
        string_agg(
            format('%I (cmd=%s, roles=%s, using=%s, check=%s)', 
                   policyname, cmd, roles::text, coalesce(qual, '<sin using>'), coalesce(with_check, '<sin with check>')),
            E'\n    - '
        )
    INTO 
        v_broad_policies_count,
        v_broad_policy_names
    FROM pg_policies
    WHERE schemaname = 'realtime' 
      AND tablename = 'messages'
      AND policyname NOT IN ('realtime_listen_note_yjs', 'realtime_broadcast_note_yjs')
      AND (permissive IS NULL OR permissive = 'PERMISSIVE')
      AND (roles && ARRAY['authenticated'::name, 'public'::name] OR 'public' = ANY(roles))
      AND cmd IN ('SELECT', 'INSERT', 'ALL')
      AND (
          -- Condición 1: Comandos que leen (SELECT / ALL) con USING ausente o no acotado por topic
          (cmd IN ('SELECT', 'ALL') AND (
              qual IS NULL 
              OR qual ~* '^\s*true\s*$' 
              OR (qual NOT LIKE '%topic%' AND qual NOT LIKE '%realtime.topic%')
              OR qual LIKE '%note_yjs%'
          ))
          OR
          -- Condición 2: Comandos que escriben (INSERT / ALL) con WITH CHECK ausente o no acotado por topic
          (cmd IN ('INSERT', 'ALL') AND (
              (with_check IS NULL AND (qual IS NULL OR qual ~* '^\s*true\s*$' OR (qual NOT LIKE '%topic%' AND qual NOT LIKE '%realtime.topic%') OR qual LIKE '%note_yjs%'))
              OR (with_check IS NOT NULL AND (with_check ~* '^\s*true\s*$' OR (with_check NOT LIKE '%topic%' AND with_check NOT LIKE '%realtime.topic%') OR with_check LIKE '%note_yjs%'))
          ))
      );

    IF v_broad_policies_count > 0 THEN
        RAISE EXCEPTION E'DESPLIEGUE ABORTADO POR RIESGO DE SEGURIDAD REALTIME:\nSe detectaron % política(s) preexistente(s) en realtime.messages que permiten acceso amplio o no filtrado a los canales:\n    - %\n\nEn PostgreSQL, las políticas PERMISSIVE se combinan con operador lógico OR.\nCualquier política amplia para authenticated/public anulará las políticas de seguridad de note_yjs_.\n\nACCIÓN REQUERIDA:\n1. Restrinja o elimine las políticas señaladas en realtime.messages para que no apliquen a canales note_yjs_.\n2. Vuelva a ejecutar este script de despliegue.',
            v_broad_policies_count, v_broad_policy_names
            USING ERRCODE = '55000';
    END IF;

    -- 4. Instalar políticas específicas para canales privados note_yjs_
    -- Supabase Realtime Authorization evalúa realtime.topic() durante el handshake de canal.
    -- Se utiliza coalesce(realtime.topic(), topic) para soportar tanto la función auxiliar de Supabase
    -- como la columna de tabla en consultas SQL directas y validaciones.
    DROP POLICY IF EXISTS "realtime_listen_note_yjs" ON realtime.messages;
    CREATE POLICY "realtime_listen_note_yjs" ON realtime.messages
        FOR SELECT TO authenticated
        USING (
            coalesce(realtime.topic(), topic) ~ '^note_yjs_[a-zA-Z0-9_\-]+$'
            AND public.is_note_reader(substring(coalesce(realtime.topic(), topic) from '^note_yjs_(.+)$'))
        );

    DROP POLICY IF EXISTS "realtime_broadcast_note_yjs" ON realtime.messages;
    CREATE POLICY "realtime_broadcast_note_yjs" ON realtime.messages
        FOR INSERT TO authenticated
        WITH CHECK (
            coalesce(realtime.topic(), topic) ~ '^note_yjs_[a-zA-Z0-9_\-]+$'
            AND (
                (extension = 'broadcast' AND public.is_note_editor(substring(coalesce(realtime.topic(), topic) from '^note_yjs_(.+)$')))
                OR (extension = 'presence' AND public.is_note_reader(substring(coalesce(realtime.topic(), topic) from '^note_yjs_(.+)$')))
            )
        );
END $$;

COMMIT;
