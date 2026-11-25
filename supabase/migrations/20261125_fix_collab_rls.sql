-- T1: Cierre de RLS y Seguridad de Base de Datos (V-01, V-02, V-03, V-56a/b/c/d)
-- Fecha: 2026-11-25

-- ============================================================================
-- T1.1 — Cerrar bypass de propiedad en public.collaborations (V-01)
-- ============================================================================
REVOKE ALL ON TABLE public.collaborations FROM anon;

DROP POLICY IF EXISTS "Owner can insert collaborations" ON public.collaborations;
CREATE POLICY "Owner can insert collaborations"
  ON public.collaborations
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = owner_id
    AND (
      (target_type = 'folder'   AND EXISTS (SELECT 1 FROM public.folders   f WHERE f.id = target_id AND f.user_id = auth.uid()))
      OR
      (target_type = 'note'     AND EXISTS (SELECT 1 FROM public.notes     n WHERE n.id = target_id AND n.user_id = auth.uid()))
      OR
      (target_type = 'reminder' AND EXISTS (SELECT 1 FROM public.reminders r WHERE r.id = target_id AND r.user_id = auth.uid()))
      OR
      (target_type = 'event'    AND EXISTS (SELECT 1 FROM public.events    e WHERE e.id = target_id AND e.user_id = auth.uid()))
    )
  );

ALTER POLICY "Members and owners can view collaborations" ON public.collaborations TO authenticated;
ALTER POLICY "Owner can update collaborations" ON public.collaborations TO authenticated;
ALTER POLICY "Owner or member can delete collaboration" ON public.collaborations TO authenticated;

-- ============================================================================
-- T1.2 — Cerrar exposición anon en public.share_invitations (V-02)
-- ============================================================================
REVOKE ALL ON TABLE public.share_invitations FROM anon;

ALTER POLICY "Anyone can view valid invitations" ON public.share_invitations TO authenticated;
ALTER POLICY "Owner can manage own invitations" ON public.share_invitations TO authenticated;

-- ============================================================================
-- T1.3 — Blindar public.profiles.is_premium (V-03)
-- ============================================================================
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (email, user_profile, default_control_level, onboarding_completed, updated_at)
  ON TABLE public.profiles TO authenticated;

ALTER POLICY "Users can view own profile" ON public.profiles TO authenticated;
ALTER POLICY "Users can insert own profile" ON public.profiles TO authenticated;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- T1.4 — Reparar las 4 tablas huérfanas (V-56a, V-56b, V-56c, V-56d)
-- ============================================================================

-- V-56a: public.web_push_subscriptions
REVOKE ALL ON TABLE public.web_push_subscriptions FROM anon;
ALTER POLICY "Users can view their own web push subscriptions" ON public.web_push_subscriptions TO authenticated;
ALTER POLICY "Users can insert their own web push subscriptions" ON public.web_push_subscriptions TO authenticated;
ALTER POLICY "Users can update their own web push subscriptions" ON public.web_push_subscriptions TO authenticated;
ALTER POLICY "Users can delete their own web push subscriptions" ON public.web_push_subscriptions TO authenticated;

-- V-56b: public.notification_deliveries
REVOKE ALL ON TABLE public.notification_deliveries FROM anon;
ALTER POLICY "Service and users can read deliveries" ON public.notification_deliveries TO authenticated;

-- V-56c: public.note_yjs_activity
REVOKE ALL ON TABLE public.note_yjs_activity FROM anon;
DROP POLICY IF EXISTS "activity_update" ON public.note_yjs_activity;
CREATE POLICY "activity_update"
  ON public.note_yjs_activity
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_note_editor(note_id) AND (user_id = auth.uid()))
  WITH CHECK (is_note_editor(note_id) AND (user_id = auth.uid()));

-- V-56d: public.note_templates
REVOKE ALL ON TABLE public.note_templates FROM anon;
ALTER POLICY "Users can manage their own templates" ON public.note_templates TO authenticated;
