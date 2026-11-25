-- T7.1: Cumplimiento legal, control de edad (+18) y registro de consentimientos (V-12)

CREATE TABLE IF NOT EXISTS public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  age_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_consents_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_consents FROM anon, PUBLIC;
GRANT SELECT, INSERT ON TABLE public.user_consents TO authenticated;

DROP POLICY IF EXISTS "Users can view own consents" ON public.user_consents;
CREATE POLICY "Users can view own consents"
  ON public.user_consents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own consents" ON public.user_consents;
CREATE POLICY "Users can insert own consents"
  ON public.user_consents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_user_consent(age_verified boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_ip TEXT;
  v_terms_at TIMESTAMPTZ;
  v_age_at TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF age_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Age verification (+18) is required' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_ip := NULLIF(
      trim(
        split_part(
          COALESCE(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''),
          ',',
          1
        )
      ),
      ''
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_ip := NULL;
  END;

  INSERT INTO public.user_consents (user_id, terms_accepted_at, age_verified_at, ip_address)
  VALUES (v_uid, now(), now(), v_ip)
  ON CONFLICT (user_id) DO UPDATE
    SET terms_accepted_at = EXCLUDED.terms_accepted_at,
        age_verified_at = EXCLUDED.age_verified_at,
        ip_address = COALESCE(EXCLUDED.ip_address, public.user_consents.ip_address)
  RETURNING terms_accepted_at, age_verified_at
  INTO v_terms_at, v_age_at;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'terms_accepted_at', v_terms_at,
    'age_verified_at', v_age_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_consent(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_user_consent(boolean) TO authenticated;
