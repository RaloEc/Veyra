-- T4.3: Tabla y RPC de rate limiting persistente para Edge Function ai (V-20)
-- Fecha: 2026-11-25

CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_user_created
  ON public.ai_rate_limits (user_id, created_at DESC);

ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_check_ai_rate_limit(
  p_user_id UUID,
  p_window_seconds INTEGER DEFAULT 300,
  p_max_requests INTEGER DEFAULT 30
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Limpiar registros fuera de la ventana
  DELETE FROM public.ai_rate_limits
  WHERE user_id = p_user_id
    AND created_at < now() - make_interval(secs => GREATEST(1, p_window_seconds));

  SELECT count(*) INTO v_count
  FROM public.ai_rate_limits
  WHERE user_id = p_user_id
    AND created_at >= now() - make_interval(secs => GREATEST(1, p_window_seconds));

  IF v_count >= GREATEST(1, p_max_requests) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.ai_rate_limits (user_id) VALUES (p_user_id);
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_check_ai_rate_limit(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_check_ai_rate_limit(UUID, INTEGER, INTEGER) TO service_role;
