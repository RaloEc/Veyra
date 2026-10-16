-- ==============================================================================
-- VEYRA - ROLLBACK QUIRÚRGICO DE PERSISTENCIA YJS (SIN TOCAR DATOS REALES)
-- ==============================================================================
-- Este script elimina EXCLUSIVAMENTE los objetos creados por la PoC de Yjs.
-- NO TOCA public.notes, public.collaborations, public.folders NI NINGÚN DATO REAL.
--
-- GARANTÍAS:
-- 1. lock_timeout = '4s': No bloquea conexiones de producción.
-- 2. Transaccional: BEGIN ... COMMIT.
-- 3. Uso estricto de RESTRICT (sin CASCADE indiscriminado).
-- ==============================================================================

SET lock_timeout = '4s';
SET statement_timeout = '30s';

BEGIN;

-- 1. Retirar políticas específicas de Realtime
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'realtime' AND tablename = 'messages') THEN
        DROP POLICY IF EXISTS "realtime_broadcast_note_yjs" ON realtime.messages;
        DROP POLICY IF EXISTS "realtime_listen_note_yjs" ON realtime.messages;
    END IF;
END $$;

-- 2. Retirar políticas RLS de las tablas Yjs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'note_yjs_updates') THEN
        DROP POLICY IF EXISTS "note_yjs_updates_select" ON public.note_yjs_updates;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'note_yjs_snapshots') THEN
        DROP POLICY IF EXISTS "note_yjs_snapshots_select" ON public.note_yjs_snapshots;
    END IF;
END $$;

-- 3. Retirar funciones RPC de Yjs
DROP FUNCTION IF EXISTS public.compact_note_yjs_snapshot(TEXT, TEXT, TEXT, BIGINT, BOOLEAN);
DROP FUNCTION IF EXISTS public.append_note_yjs_update(TEXT, TEXT, TEXT, TEXT);

-- 4. Eliminar tablas de persistencia de Yjs (RESTRICT: nunca cascada a public.notes)
DROP TABLE IF EXISTS public.note_yjs_updates RESTRICT;
DROP TABLE IF EXISTS public.note_yjs_snapshots RESTRICT;

-- 5. Retirar funciones auxiliares de roles de Yjs
DROP FUNCTION IF EXISTS public.is_note_reader(TEXT);
DROP FUNCTION IF EXISTS public.is_note_editor(TEXT);

COMMIT;
