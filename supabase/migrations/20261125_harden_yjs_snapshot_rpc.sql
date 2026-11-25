-- T5.4: Endurecer validación de clock, state_vector Base64 y tamaño en compact_note_yjs_snapshot (V-33)
-- Fecha: 2026-11-25

CREATE OR REPLACE FUNCTION public.compact_note_yjs_snapshot(
  p_note_id text,
  p_snapshot_data text,
  p_state_vector text,
  p_up_to_update_id bigint,
  p_snapshot_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_canonical_hash TEXT;
  v_decoded_bytes BYTEA;
  v_decoded_sv BYTEA;
  v_max_existing_id BIGINT;
  v_prev_clock BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_note_editor(p_note_id) THEN
    RAISE EXCEPTION 'Permiso denegado: solo editores y propietarios pueden compactar snapshots' USING ERRCODE = '42501';
  END IF;

  IF p_note_id IS NULL OR length(pg_catalog.btrim(p_note_id)) = 0 THEN
    RAISE EXCEPTION 'p_note_id no puede ser nulo o vacío' USING ERRCODE = '22023';
  END IF;
  IF p_snapshot_data IS NULL OR length(p_snapshot_data) = 0 THEN
    RAISE EXCEPTION 'p_snapshot_data no puede ser nulo o vacío' USING ERRCODE = '22023';
  END IF;
  IF length(p_snapshot_data) > 5242880 THEN
    RAISE EXCEPTION 'El tamaño del snapshot excede el límite permitido de 5 MB' USING ERRCODE = '22023';
  END IF;
  IF p_state_vector IS NULL OR length(p_state_vector) = 0 THEN
    RAISE EXCEPTION 'p_state_vector no puede ser nulo o vacío' USING ERRCODE = '22023';
  END IF;
  IF p_up_to_update_id IS NULL OR p_up_to_update_id <= 0 THEN
    RAISE EXCEPTION 'p_up_to_update_id debe ser un ID válido mayor a 0' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_decoded_bytes := pg_catalog.decode(p_snapshot_data, 'base64');
    v_canonical_hash := pg_catalog.lower(pg_catalog.encode(pg_catalog.sha256(v_decoded_bytes), 'hex'));
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'p_snapshot_data no es una cadena Base64 válida' USING ERRCODE = '22023';
  END;

  BEGIN
    v_decoded_sv := pg_catalog.decode(p_state_vector, 'base64');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'p_state_vector no es una cadena Base64 válida' USING ERRCODE = '22023';
  END;
  IF v_decoded_sv IS NULL OR pg_catalog.octet_length(v_decoded_sv) = 0 THEN
    RAISE EXCEPTION 'p_state_vector decodificado no puede estar vacío' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.lower(pg_catalog.btrim(p_snapshot_hash)) != v_canonical_hash THEN
    RAISE EXCEPTION 'Hash de snapshot inválido: no coincide con el SHA-256 del contenido' USING ERRCODE = '22000';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('note_yjs_' || p_note_id));

  -- Verificar coincidencia exacta del delta y cota máxima real en note_yjs_updates
  SELECT max(id) INTO v_max_existing_id
  FROM public.note_yjs_updates
  WHERE note_id = p_note_id;

  IF v_max_existing_id IS NULL OR p_up_to_update_id > v_max_existing_id THEN
    RAISE EXCEPTION 'p_up_to_update_id (%) excede el máximo delta real (%) para la nota %',
      p_up_to_update_id, v_max_existing_id, p_note_id USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.note_yjs_updates
    WHERE note_id = p_note_id AND id = p_up_to_update_id
  ) THEN
    RAISE EXCEPTION 'El cursor p_up_to_update_id (%) no existe en note_yjs_updates para la nota %',
      p_up_to_update_id, p_note_id USING ERRCODE = '22023';
  END IF;

  SELECT server_clock INTO v_prev_clock
  FROM public.note_yjs_snapshots
  WHERE note_id = p_note_id;

  IF v_prev_clock IS NOT NULL AND p_up_to_update_id < v_prev_clock THEN
    RAISE EXCEPTION 'Regresión de snapshot rechazada: el snapshot actual ya cubre hasta el clock % (recibido: %)',
      v_prev_clock, p_up_to_update_id USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.note_yjs_snapshots (
    note_id, snapshot, state_vector, server_clock, created_at, updated_at
  ) VALUES (
    p_note_id, p_snapshot_data, p_state_vector, p_up_to_update_id, NOW(), NOW()
  )
  ON CONFLICT (note_id) DO UPDATE SET
    snapshot = EXCLUDED.snapshot,
    state_vector = EXCLUDED.state_vector,
    server_clock = EXCLUDED.server_clock,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'note_id', p_note_id,
    'server_clock', p_up_to_update_id
  );
END;
$$;
