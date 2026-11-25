-- RECONSTRUIDO DESDE CATÁLOGO — NO ES EL SQL ORIGINAL
-- Version: 20261123121717 | Slug: fix_web_push_subscription_upsert_rpc
-- Fuente: supabase_migrations.schema_migrations / pg_policies / pg_proc / pg_trigger / pg_constraint el 2026-11-25
-- Para referencia futura. No re-aplicar a proyecto nuevo sin validar.

DROP POLICY IF EXISTS "Users can update their own web push subscriptions" ON public.web_push_subscriptions;

CREATE POLICY "Users can update their own web push subscriptions"
  ON public.web_push_subscriptions
  FOR UPDATE
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.upsert_web_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to register web push subscription';
  END IF;

  INSERT INTO public.web_push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    last_seen_at
  )
  VALUES (
    v_user_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    p_user_agent,
    now()
  )
  ON CONFLICT (endpoint) DO UPDATE
  SET
    user_id = v_user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    user_agent = COALESCE(EXCLUDED.user_agent, public.web_push_subscriptions.user_agent),
    last_seen_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_web_push_subscription(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_web_push_subscription(text, text, text, text) TO authenticated;
