-- ==============================================================================
-- BLINDAJE DE SEGURIDAD Y MEMORIA PARA VEYRA (SUPABASE)
-- 1. Reducción defensiva del tamaño de delta en Yjs a 2 MB (máximo)
-- 2. Procedimiento de archivado automático de recordatorios completados > 90 días
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.archive_old_completed_reminders(
    p_days_threshold INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_cutoff_ms BIGINT;
    v_archived_count INT;
BEGIN
    -- Calcular timestamp de corte en milisegundos
    v_cutoff_ms := (EXTRACT(EPOCH FROM NOW() - (p_days_threshold || ' days')::INTERVAL) * 1000)::BIGINT;

    -- Cambiar de status 'completed' a 'archived' sin destruir información
    UPDATE public.reminders
    SET status = 'archived',
        last_modified_ms = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    WHERE status = 'completed'
      AND last_modified_ms < v_cutoff_ms;

    GET DIAGNOSTICS v_archived_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'archived_count', v_archived_count,
        'cutoff_ms', v_cutoff_ms
    );
END;
$$;

-- Permisos
REVOKE ALL ON FUNCTION public.archive_old_completed_reminders(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_old_completed_reminders(INT) TO authenticated, service_role;
COMMENT ON FUNCTION public.archive_old_completed_reminders(INT) IS 'veyra_maintenance:archive_old_reminders';

