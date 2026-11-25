-- T0.1.5.f: DROP yjs_diagnostics (V-18b, M-07b autorizado)
-- Tabla de debug huérfana con 35.272 filas expuestas a anon
-- Contenía docXml real, nombres de perfil y channelName de notas vivas
-- NOTA: Preparada en T0.1.5; NO aplicar a producción hasta completar fase controlada correspondiente.
DROP POLICY IF EXISTS "Allow all insert to yjs_diagnostics" ON public.yjs_diagnostics;
DROP POLICY IF EXISTS "Allow all select to yjs_diagnostics" ON public.yjs_diagnostics;
DROP POLICY IF EXISTS "Allow all insert on yjs_diagnostics" ON public.yjs_diagnostics;
DROP POLICY IF EXISTS "Allow all select on yjs_diagnostics" ON public.yjs_diagnostics;
REVOKE ALL ON TABLE public.yjs_diagnostics FROM PUBLIC, anon, authenticated;
DROP TABLE IF EXISTS public.yjs_diagnostics;
DROP SEQUENCE IF EXISTS public.yjs_diagnostics_id_seq;
