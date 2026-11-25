-- T2.1: Reparar las 8 FKs bloqueantes para eliminación de cuenta (V-10)
-- Fecha: 2026-11-25

-- 1. attachments.created_by -> ON DELETE CASCADE
ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_created_by_fkey;
ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. attachments.storage_owner_id -> ON DELETE CASCADE
ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_storage_owner_id_fkey;
ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_storage_owner_id_fkey
  FOREIGN KEY (storage_owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. attachments.integration_id -> ON DELETE SET NULL (integration_id es nullable)
ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS fk_attachments_integration;
ALTER TABLE public.attachments
  ADD CONSTRAINT fk_attachments_integration
  FOREIGN KEY (integration_id) REFERENCES public.user_integrations(id) ON DELETE SET NULL;

-- 4. storage_deletion_queue.owner_id -> nullable + ON DELETE SET NULL
-- CRÍTICO: debe ser SET NULL (no CASCADE) para que los archivos encolados por delete_user_account()
-- sobrevivan al DELETE FROM auth.users y sean borrados físicamente por el worker.
ALTER TABLE public.storage_deletion_queue ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.storage_deletion_queue DROP CONSTRAINT IF EXISTS storage_deletion_queue_owner_id_fkey;
ALTER TABLE public.storage_deletion_queue
  ADD CONSTRAINT storage_deletion_queue_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. storage_usage.storage_owner_id -> ON DELETE CASCADE
ALTER TABLE public.storage_usage DROP CONSTRAINT IF EXISTS storage_usage_storage_owner_id_fkey;
ALTER TABLE public.storage_usage
  ADD CONSTRAINT storage_usage_storage_owner_id_fkey
  FOREIGN KEY (storage_owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 6. upload_reservations.owner_id -> ON DELETE CASCADE
ALTER TABLE public.upload_reservations DROP CONSTRAINT IF EXISTS upload_reservations_owner_id_fkey;
ALTER TABLE public.upload_reservations
  ADD CONSTRAINT upload_reservations_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 7. note_yjs_snapshots.note_id -> ON DELETE CASCADE (el borrado de notes dispara borrado de snapshots Yjs)
ALTER TABLE public.note_yjs_snapshots DROP CONSTRAINT IF EXISTS note_yjs_snapshots_note_id_fkey;
ALTER TABLE public.note_yjs_snapshots
  ADD CONSTRAINT note_yjs_snapshots_note_id_fkey
  FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;

-- 8. note_yjs_updates.note_id -> ON DELETE CASCADE (el borrado de notes dispara borrado de updates Yjs)
ALTER TABLE public.note_yjs_updates DROP CONSTRAINT IF EXISTS note_yjs_updates_note_id_fkey;
ALTER TABLE public.note_yjs_updates
  ADD CONSTRAINT note_yjs_updates_note_id_fkey
  FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;
