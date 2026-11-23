-- ============================================================================
-- Fase 4 (03): Pasar bucket legacy 'attachments' a solo lectura (sin INSERT/UPDATE)
-- ============================================================================
DROP POLICY IF EXISTS "Users can upload own attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own attachments" ON storage.objects;
-- Opcional: descomentar la siguiente línea para impedir también borrados directos durante el backfill:
-- DROP POLICY IF EXISTS "Users can delete own attachments" ON storage.objects;
