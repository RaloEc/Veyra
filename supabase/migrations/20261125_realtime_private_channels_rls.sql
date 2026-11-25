-- T5.2: Políticas RLS en realtime.messages para canales privados (authenticated)
-- Fecha: 2026-11-25

-- Canales por usuario autenticado: solo el propietario de auth.uid() puede leer/enviar
DROP POLICY IF EXISTS "realtime_user_scoped_select" ON realtime.messages;
CREATE POLICY "realtime_user_scoped_select"
  ON realtime.messages
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    extension = ANY (ARRAY['broadcast'::text, 'presence'::text])
    AND (
      realtime.topic() = ('collab_sync_' || (auth.uid())::text)
      OR realtime.topic() = ('user_collab_monitor_' || (auth.uid())::text)
      OR realtime.topic() = ('collab_perms_' || (auth.uid())::text)
      OR realtime.topic() ~ '^(avatars_live_|share_modal_|realtime_ping_)[A-Za-z0-9_-]+$'
    )
  );

DROP POLICY IF EXISTS "realtime_user_scoped_insert" ON realtime.messages;
CREATE POLICY "realtime_user_scoped_insert"
  ON realtime.messages
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    extension = ANY (ARRAY['broadcast'::text, 'presence'::text])
    AND (
      realtime.topic() = ('collab_sync_' || (auth.uid())::text)
      OR realtime.topic() = ('user_collab_monitor_' || (auth.uid())::text)
      OR realtime.topic() = ('collab_perms_' || (auth.uid())::text)
      OR realtime.topic() ~ '^(avatars_live_|share_modal_|realtime_ping_)[A-Za-z0-9_-]+$'
    )
  );
