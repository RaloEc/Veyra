-- ============================================================================
-- BASELINE RECOVERY — RECONSTRUIDO DESDE CATÁLOGO VÍA MCP (SOLO REFERENCIA)
-- Proyecto: rrwoompvuggcczggfgiq | Fecha extracción: 2026-11-25
-- Fuente: information_schema.columns, pg_constraint, pg_indexes, pg_proc,
--         pg_trigger, pg_policies, pg_class, storage.buckets
-- Nota: JWTs redactados (<REDACTED_ANON_JWT>) y emails enmascarados.
-- ============================================================================

-- 1. TABLAS PUBLIC Y RLS
CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id text,
  created_by uuid NOT NULL,
  storage_owner_id uuid NOT NULL,
  provider text NOT NULL,
  storage_bucket text,
  storage_path text,
  drive_file_id text,
  integration_id uuid,
  drive_account_sub text,
  name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint,
  checksum_sha256 text,
  drive_md5 text,
  drive_modified_time timestamp with time zone,
  thumbnail_path text,
  thumbnail_meta jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  availability text NOT NULL DEFAULT 'pending_upload'::text,
  unavailable_reason text,
  unavailable_since timestamp with time zone,
  last_verified_at timestamp with time zone,
  source_attachment_id uuid,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.collaboration_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id text NOT NULL,
  actor_id uuid NOT NULL,
  actor_name text,
  action text NOT NULL,
  item_title text,
  details text,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.collaboration_activity ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.collaborations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id text NOT NULL,
  owner_id uuid NOT NULL,
  member_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'editor'::text,
  is_public_members boolean DEFAULT true,
  joined_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.collaborations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.compliance_events (
  id text NOT NULL,
  user_id uuid,
  reminder_id text NOT NULL,
  event_type text NOT NULL,
  timestamp_ms bigint NOT NULL,
  synced integer DEFAULT 1
);
ALTER TABLE public.compliance_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_notification_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  user_id uuid NOT NULL,
  attempt_key text NOT NULL,
  delivered_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.event_notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.events (
  id text NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  start_time_ms bigint NOT NULL,
  end_time_ms bigint NOT NULL,
  repeat_rule text,
  location text,
  color text,
  notification_offset_min integer DEFAULT 15,
  notification_offsets text,
  notification_ids text,
  note_id text,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL,
  last_modified_ms bigint NOT NULL,
  deleted integer DEFAULT 0,
  tags jsonb DEFAULT '[]'::jsonb,
  is_all_day boolean DEFAULT false,
  all_day_date text,
  timezone text,
  recurrence_rule text,
  recurrence_parent_id text,
  is_birthday_like boolean DEFAULT false,
  category_id text,
  attachments text
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.folders (
  id text NOT NULL,
  user_id uuid NOT NULL,
  parent_id text,
  name text NOT NULL,
  icon text DEFAULT 'folder'::text,
  color text DEFAULT '#8B5CF6'::text,
  is_pinned integer DEFAULT 0,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL,
  last_modified_ms bigint NOT NULL,
  deleted integer DEFAULT 0
);
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.item_tags (
  user_id uuid,
  item_type text NOT NULL,
  item_id text NOT NULL,
  tag_id text NOT NULL
);
ALTER TABLE public.item_tags ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.note_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text DEFAULT ''::text,
  category text NOT NULL DEFAULT 'personal'::text,
  type text NOT NULL DEFAULT 'block'::text,
  content text NOT NULL,
  icon_name text DEFAULT 'file-text'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_modified_ms bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  deleted integer DEFAULT 0
);
ALTER TABLE public.note_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.note_yjs_activity (
  id bigint NOT NULL DEFAULT nextval('note_yjs_activity_id_seq'::regclass),
  note_id text NOT NULL,
  user_id uuid NOT NULL,
  session_bucket_ms bigint NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone NOT NULL DEFAULT now(),
  edit_count integer NOT NULL DEFAULT 1,
  last_snippet text,
  snippets jsonb DEFAULT '[]'::jsonb
);
ALTER TABLE public.note_yjs_activity ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.note_yjs_snapshots (
  note_id text NOT NULL,
  snapshot text NOT NULL,
  state_vector text NOT NULL,
  server_clock bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.note_yjs_snapshots ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.note_yjs_updates (
  id bigint NOT NULL DEFAULT nextval('note_yjs_updates_id_seq'::regclass),
  note_id text NOT NULL,
  client_id text NOT NULL,
  user_id uuid,
  update_data text NOT NULL,
  update_hash text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.note_yjs_updates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notes (
  id text NOT NULL,
  user_id uuid NOT NULL,
  folder_id text,
  event_id text,
  title text,
  content text,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL,
  is_pinned integer DEFAULT 0,
  attachments text,
  links text,
  deleted integer DEFAULT 0,
  last_modified_ms bigint NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  sync_mode text NOT NULL DEFAULT 'rest'::text,
  preview_text text
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reminder_id text NOT NULL,
  user_id uuid NOT NULL,
  attempt_type text NOT NULL,
  delivered_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text,
  user_profile text DEFAULT 'equilibrado'::text,
  default_control_level text DEFAULT 'normal'::text,
  is_premium boolean DEFAULT false,
  onboarding_completed boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL,
  device_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.reminders (
  id text NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  due_date_ms bigint NOT NULL,
  snooze_until_ms bigint,
  repeat_rule text,
  control_level text DEFAULT 'normal'::text,
  priority integer DEFAULT 1,
  status text DEFAULT 'pending'::text,
  next_attempt_ms bigint,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  last_modified_ms bigint NOT NULL,
  deleted integer DEFAULT 0,
  deleted_at_ms bigint,
  notification_ids text,
  attachments text,
  links text,
  subtasks text,
  event_id text,
  offset_minutes integer
);
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.share_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_code text NOT NULL DEFAULT substr(md5(((random())::text || (clock_timestamp())::text)), 1, 12),
  owner_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  target_name text,
  role text NOT NULL DEFAULT 'editor'::text,
  is_public_members boolean DEFAULT true,
  batch_items jsonb,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval)
);
ALTER TABLE public.share_invitations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.storage_deletion_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  attachment_id uuid,
  bucket_id text NOT NULL,
  path text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  owner_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  confirmed_at timestamp with time zone
);
ALTER TABLE public.storage_deletion_queue ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.storage_plans (
  plan_code text NOT NULL,
  quota_bytes bigint NOT NULL,
  max_file_bytes bigint NOT NULL,
  max_open_reservations integer NOT NULL DEFAULT 5,
  reservation_ttl_seconds integer NOT NULL DEFAULT 1800,
  allowed_mime_types text[] NOT NULL,
  drive_attach_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.storage_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.storage_usage (
  storage_owner_id uuid NOT NULL,
  used_bytes bigint NOT NULL DEFAULT 0,
  reserved_bytes bigint NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_reconciled_at timestamp with time zone
);
ALTER TABLE public.storage_usage ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.tags (
  id text NOT NULL,
  user_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  color text,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.upload_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  attachment_id uuid NOT NULL,
  bucket_id text NOT NULL,
  path text NOT NULL,
  reserved_bytes bigint NOT NULL,
  max_bytes bigint NOT NULL,
  actual_bytes bigint,
  status text NOT NULL DEFAULT 'active'::text,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.upload_reservations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'google_drive'::text,
  google_sub text NOT NULL,
  google_email text,
  oauth_client_kind text NOT NULL,
  oauth_client_id text NOT NULL,
  refresh_token_secret_id uuid,
  scopes text[] NOT NULL DEFAULT ARRAY['https://www.googleapis.com/auth/drive.file'::text],
  status text NOT NULL DEFAULT 'active'::text,
  disconnect_requested boolean NOT NULL DEFAULT false,
  last_error_code text,
  last_error_at timestamp with time zone,
  connected_at timestamp with time zone NOT NULL DEFAULT now(),
  last_refreshed_at timestamp with time zone,
  disconnected_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.yjs_diagnostics (
  id bigint NOT NULL DEFAULT nextval('yjs_diagnostics_id_seq'::regclass),
  device_id text,
  event text,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.yjs_diagnostics ENABLE ROW LEVEL SECURITY;

-- 2. CONSTRAINTS
ALTER TABLE public.attachments ADD CONSTRAINT attachments_availability_check CHECK ((availability = ANY (ARRAY['pending_upload'::text, 'available'::text, 'unavailable'::text, 'failed'::text, 'pending_delete'::text])));
ALTER TABLE public.attachments ADD CONSTRAINT attachments_provider_check CHECK ((provider = ANY (ARRAY['supabase'::text, 'google_drive'::text])));
ALTER TABLE public.attachments ADD CONSTRAINT attachments_size_bytes_check CHECK (((size_bytes IS NULL) OR (size_bytes >= 0)));
ALTER TABLE public.attachments ADD CONSTRAINT attachments_target_type_check CHECK ((target_type = ANY (ARRAY['note'::text, 'reminder'::text, 'event'::text, 'legacy_unlinked'::text])));
ALTER TABLE public.attachments ADD CONSTRAINT attachments_unavailable_reason_check CHECK (((unavailable_reason IS NULL) OR (unavailable_reason = ANY (ARRAY['drive_disconnected'::text, 'permission_revoked'::text, 'needs_reauth'::text, 'file_deleted'::text, 'file_inaccessible'::text, 'account_changed'::text, 'owner_deleted'::text, 'provider_error'::text]))));
ALTER TABLE public.attachments ADD CONSTRAINT chk_attachments_provider_fields CHECK ((((provider = 'supabase'::text) AND (storage_bucket IS NOT NULL) AND (storage_path IS NOT NULL) AND (drive_file_id IS NULL) AND (integration_id IS NULL) AND (drive_account_sub IS NULL)) OR ((provider = 'google_drive'::text) AND (drive_file_id IS NOT NULL) AND (integration_id IS NOT NULL) AND (drive_account_sub IS NOT NULL) AND (storage_bucket IS NULL) AND (storage_path IS NULL))));
ALTER TABLE public.attachments ADD CONSTRAINT chk_attachments_supabase_available CHECK (((provider <> 'supabase'::text) OR (availability <> 'available'::text) OR ((size_bytes IS NOT NULL) AND (checksum_sha256 IS NOT NULL))));
ALTER TABLE public.attachments ADD CONSTRAINT chk_attachments_target CHECK (((target_type = 'legacy_unlinked'::text) OR ((target_id IS NOT NULL) AND (length(btrim(target_id)) > 0))));
ALTER TABLE public.attachments ADD CONSTRAINT chk_attachments_unavailable_reason CHECK ((((availability = 'unavailable'::text) AND (unavailable_reason IS NOT NULL)) OR ((availability <> 'unavailable'::text) AND (unavailable_reason IS NULL))));
ALTER TABLE public.attachments ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.collaboration_activity ADD CONSTRAINT collaboration_activity_action_check CHECK ((action = ANY (ARRAY['completed'::text, 'uncompleted'::text, 'edited'::text, 'added'::text, 'deleted'::text])));
ALTER TABLE public.collaboration_activity ADD CONSTRAINT collaboration_activity_target_type_check CHECK ((target_type = ANY (ARRAY['folder'::text, 'reminder'::text, 'note'::text, 'event'::text])));
ALTER TABLE public.collaboration_activity ADD CONSTRAINT collaboration_activity_pkey PRIMARY KEY (id);
ALTER TABLE public.collaborations ADD CONSTRAINT collaborations_role_check CHECK ((role = ANY (ARRAY['viewer'::text, 'editor'::text])));
ALTER TABLE public.collaborations ADD CONSTRAINT collaborations_target_type_check CHECK ((target_type = ANY (ARRAY['folder'::text, 'reminder'::text, 'note'::text, 'event'::text])));
ALTER TABLE public.collaborations ADD CONSTRAINT collaborations_pkey PRIMARY KEY (id);
ALTER TABLE public.collaborations ADD CONSTRAINT collaborations_target_type_target_id_member_id_key UNIQUE (target_type, target_id, member_id);
ALTER TABLE public.compliance_events ADD CONSTRAINT compliance_events_pkey PRIMARY KEY (id);
ALTER TABLE public.event_notification_deliveries ADD CONSTRAINT event_notification_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE public.event_notification_deliveries ADD CONSTRAINT event_notification_deliveries_event_id_attempt_key_key UNIQUE (event_id, attempt_key);
ALTER TABLE public.events ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE public.folders ADD CONSTRAINT folders_pkey PRIMARY KEY (id);
ALTER TABLE public.item_tags ADD CONSTRAINT item_tags_pkey PRIMARY KEY (item_type, item_id, tag_id);
ALTER TABLE public.note_templates ADD CONSTRAINT note_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.note_yjs_activity ADD CONSTRAINT note_yjs_activity_pkey PRIMARY KEY (id);
ALTER TABLE public.note_yjs_activity ADD CONSTRAINT unique_note_user_session UNIQUE (note_id, user_id, session_bucket_ms);
ALTER TABLE public.note_yjs_snapshots ADD CONSTRAINT note_yjs_snapshots_pkey PRIMARY KEY (note_id);
ALTER TABLE public.note_yjs_updates ADD CONSTRAINT note_yjs_updates_pkey PRIMARY KEY (id);
ALTER TABLE public.note_yjs_updates ADD CONSTRAINT idx_note_yjs_updates_idempotency UNIQUE (note_id, update_hash);
ALTER TABLE public.notes ADD CONSTRAINT chk_notes_sync_mode CHECK ((sync_mode = ANY (ARRAY['rest'::text, 'yjs'::text])));
ALTER TABLE public.notes ADD CONSTRAINT notes_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_deliveries ADD CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_deliveries ADD CONSTRAINT notification_deliveries_reminder_id_attempt_type_key UNIQUE (reminder_id, attempt_type);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_user_id_token_key UNIQUE (user_id, token);
ALTER TABLE public.reminders ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);
ALTER TABLE public.share_invitations ADD CONSTRAINT share_invitations_role_check CHECK ((role = ANY (ARRAY['viewer'::text, 'editor'::text])));
ALTER TABLE public.share_invitations ADD CONSTRAINT share_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])));
ALTER TABLE public.share_invitations ADD CONSTRAINT share_invitations_target_type_check CHECK ((target_type = ANY (ARRAY['folder'::text, 'reminder'::text, 'note'::text, 'event'::text, 'batch'::text])));
ALTER TABLE public.share_invitations ADD CONSTRAINT share_invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.share_invitations ADD CONSTRAINT share_invitations_invite_code_key UNIQUE (invite_code);
ALTER TABLE public.storage_deletion_queue ADD CONSTRAINT storage_deletion_queue_reason_check CHECK ((reason = ANY (ARRAY['user_deleted'::text, 'quota_violation'::text, 'reservation_expired'::text, 'orphan_cleanup'::text, 'account_deleted'::text])));
ALTER TABLE public.storage_deletion_queue ADD CONSTRAINT storage_deletion_queue_size_bytes_check CHECK ((size_bytes >= 0));
ALTER TABLE public.storage_deletion_queue ADD CONSTRAINT storage_deletion_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'deleting'::text, 'confirmed'::text, 'failed'::text])));
ALTER TABLE public.storage_deletion_queue ADD CONSTRAINT storage_deletion_queue_pkey PRIMARY KEY (id);
ALTER TABLE public.storage_deletion_queue ADD CONSTRAINT storage_deletion_queue_idempotency_key_key UNIQUE (idempotency_key);
ALTER TABLE public.storage_plans ADD CONSTRAINT storage_plans_max_file_bytes_check CHECK (((max_file_bytes > 0) AND (max_file_bytes <= 52428800)));
ALTER TABLE public.storage_plans ADD CONSTRAINT storage_plans_max_open_reservations_check CHECK ((max_open_reservations > 0));
ALTER TABLE public.storage_plans ADD CONSTRAINT storage_plans_plan_code_check CHECK ((plan_code = ANY (ARRAY['free'::text, 'premium'::text])));
ALTER TABLE public.storage_plans ADD CONSTRAINT storage_plans_quota_bytes_check CHECK ((quota_bytes > 0));
ALTER TABLE public.storage_plans ADD CONSTRAINT storage_plans_reservation_ttl_seconds_check CHECK ((reservation_ttl_seconds >= 60));
ALTER TABLE public.storage_plans ADD CONSTRAINT storage_plans_pkey PRIMARY KEY (plan_code);
ALTER TABLE public.storage_usage ADD CONSTRAINT storage_usage_reserved_bytes_check CHECK ((reserved_bytes >= 0));
ALTER TABLE public.storage_usage ADD CONSTRAINT storage_usage_used_bytes_check CHECK ((used_bytes >= 0));
ALTER TABLE public.storage_usage ADD CONSTRAINT storage_usage_pkey PRIMARY KEY (storage_owner_id);
ALTER TABLE public.tags ADD CONSTRAINT tags_pkey PRIMARY KEY (id);
ALTER TABLE public.tags ADD CONSTRAINT tags_user_id_slug_key UNIQUE (user_id, slug);
ALTER TABLE public.upload_reservations ADD CONSTRAINT upload_reservations_actual_bytes_check CHECK (((actual_bytes IS NULL) OR (actual_bytes >= 0)));
ALTER TABLE public.upload_reservations ADD CONSTRAINT upload_reservations_check CHECK ((max_bytes >= reserved_bytes));
ALTER TABLE public.upload_reservations ADD CONSTRAINT upload_reservations_reserved_bytes_check CHECK ((reserved_bytes > 0));
ALTER TABLE public.upload_reservations ADD CONSTRAINT upload_reservations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'consumed'::text, 'expired'::text, 'released'::text, 'violated'::text])));
ALTER TABLE public.upload_reservations ADD CONSTRAINT upload_reservations_pkey PRIMARY KEY (id);
ALTER TABLE public.upload_reservations ADD CONSTRAINT upload_reservations_attachment_id_key UNIQUE (attachment_id);
ALTER TABLE public.upload_reservations ADD CONSTRAINT uq_upload_reservations_bucket_path UNIQUE (bucket_id, path);
ALTER TABLE public.user_integrations ADD CONSTRAINT chk_user_integrations_client_id_nonempty CHECK ((length(btrim(oauth_client_id)) > 0));
ALTER TABLE public.user_integrations ADD CONSTRAINT chk_user_integrations_secret_when_active CHECK (((status <> 'active'::text) OR (refresh_token_secret_id IS NOT NULL)));
ALTER TABLE public.user_integrations ADD CONSTRAINT chk_user_integrations_sub_nonempty CHECK ((length(btrim(google_sub)) > 0));
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_oauth_client_kind_check CHECK ((oauth_client_kind = ANY (ARRAY['web'::text, 'android_server_auth'::text, 'ios_public'::text])));
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_provider_check CHECK ((provider = 'google_drive'::text));
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'needs_reauth'::text, 'revoked'::text, 'disconnected'::text])));
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_pkey PRIMARY KEY (id);
ALTER TABLE public.user_integrations ADD CONSTRAINT uq_user_integrations_user_provider UNIQUE (user_id, provider);
ALTER TABLE public.web_push_subscriptions ADD CONSTRAINT web_push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.web_push_subscriptions ADD CONSTRAINT web_push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE public.yjs_diagnostics ADD CONSTRAINT yjs_diagnostics_pkey PRIMARY KEY (id);
ALTER TABLE public.attachments ADD CONSTRAINT attachments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.attachments ADD CONSTRAINT attachments_source_attachment_id_fkey FOREIGN KEY (source_attachment_id) REFERENCES attachments(id) ON DELETE SET NULL;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_storage_owner_id_fkey FOREIGN KEY (storage_owner_id) REFERENCES auth.users(id);
ALTER TABLE public.attachments ADD CONSTRAINT fk_attachments_integration FOREIGN KEY (integration_id) REFERENCES user_integrations(id) ON DELETE RESTRICT;
ALTER TABLE public.collaboration_activity ADD CONSTRAINT collaboration_activity_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.collaborations ADD CONSTRAINT collaborations_member_id_fkey FOREIGN KEY (member_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.collaborations ADD CONSTRAINT collaborations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.compliance_events ADD CONSTRAINT compliance_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.event_notification_deliveries ADD CONSTRAINT event_notification_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.events ADD CONSTRAINT events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.folders ADD CONSTRAINT folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE public.folders ADD CONSTRAINT folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.item_tags ADD CONSTRAINT item_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
ALTER TABLE public.item_tags ADD CONSTRAINT item_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.note_templates ADD CONSTRAINT note_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.note_yjs_activity ADD CONSTRAINT note_yjs_activity_note_id_fkey FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE;
ALTER TABLE public.note_yjs_snapshots ADD CONSTRAINT note_yjs_snapshots_note_id_fkey FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE RESTRICT;
ALTER TABLE public.note_yjs_updates ADD CONSTRAINT note_yjs_updates_note_id_fkey FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE RESTRICT;
ALTER TABLE public.note_yjs_updates ADD CONSTRAINT note_yjs_updates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.notes ADD CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notification_deliveries ADD CONSTRAINT notification_deliveries_reminder_id_fkey FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE;
ALTER TABLE public.notification_deliveries ADD CONSTRAINT notification_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.reminders ADD CONSTRAINT reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.share_invitations ADD CONSTRAINT share_invitations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.storage_deletion_queue ADD CONSTRAINT storage_deletion_queue_attachment_id_fkey FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE SET NULL;
ALTER TABLE public.storage_deletion_queue ADD CONSTRAINT storage_deletion_queue_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);
ALTER TABLE public.storage_usage ADD CONSTRAINT storage_usage_storage_owner_id_fkey FOREIGN KEY (storage_owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.tags ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.upload_reservations ADD CONSTRAINT upload_reservations_attachment_id_fkey FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE;
ALTER TABLE public.upload_reservations ADD CONSTRAINT upload_reservations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.web_push_subscriptions ADD CONSTRAINT web_push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_attachments_integration_active ON public.attachments USING btree (integration_id, availability) WHERE ((deleted_at IS NULL) AND (integration_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_attachments_legacy_path ON public.attachments USING btree (((metadata ->> 'legacy_path'::text))) WHERE (metadata ? 'legacy_path'::text);
CREATE INDEX IF NOT EXISTS idx_attachments_owner_state ON public.attachments USING btree (storage_owner_id, provider, availability);
CREATE INDEX IF NOT EXISTS idx_attachments_target ON public.attachments USING btree (target_type, target_id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_attachments_drive_target ON public.attachments USING btree (target_type, target_id, drive_file_id, integration_id) WHERE ((deleted_at IS NULL) AND (drive_file_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS uq_attachments_storage_object ON public.attachments USING btree (storage_bucket, storage_path) WHERE ((storage_bucket IS NOT NULL) AND (storage_path IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_collab_act_target ON public.collaboration_activity USING btree (target_type, target_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS collaborations_target_type_target_id_member_id_key ON public.collaborations USING btree (target_type, target_id, member_id);
CREATE INDEX IF NOT EXISTS idx_collab_member ON public.collaborations USING btree (member_id, target_type);
CREATE INDEX IF NOT EXISTS idx_collab_target ON public.collaborations USING btree (target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS event_notification_deliveries_event_id_attempt_key_key ON public.event_notification_deliveries USING btree (event_id, attempt_key);
CREATE INDEX IF NOT EXISTS idx_events_tags ON public.events USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_events_user_sync ON public.events USING btree (user_id, last_modified_ms);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON public.folders USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_sync ON public.folders USING btree (user_id, last_modified_ms);
CREATE INDEX IF NOT EXISTS idx_item_tags_item ON public.item_tags USING btree (item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON public.item_tags USING btree (tag_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_user ON public.item_tags USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_note_started ON public.note_yjs_activity USING btree (note_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS unique_note_user_session ON public.note_yjs_activity USING btree (note_id, user_id, session_bucket_ms);
CREATE UNIQUE INDEX IF NOT EXISTS idx_note_yjs_updates_idempotency ON public.note_yjs_updates USING btree (note_id, update_hash);
CREATE INDEX IF NOT EXISTS idx_note_yjs_updates_note_clock ON public.note_yjs_updates USING btree (note_id, id);
CREATE INDEX IF NOT EXISTS idx_notes_user_sync ON public.notes USING btree (user_id, last_modified_ms);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_lookup ON public.notification_deliveries USING btree (reminder_id, attempt_type);
CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_reminder_id_attempt_type_key ON public.notification_deliveries USING btree (reminder_id, attempt_type);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_user_id_token_key ON public.push_tokens USING btree (user_id, token);
CREATE INDEX IF NOT EXISTS idx_reminders_user_sync ON public.reminders USING btree (user_id, last_modified_ms);
CREATE INDEX IF NOT EXISTS idx_share_invitations_code ON public.share_invitations USING btree (invite_code);
CREATE INDEX IF NOT EXISTS idx_share_invitations_target ON public.share_invitations USING btree (target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS share_invitations_invite_code_key ON public.share_invitations USING btree (invite_code);
CREATE INDEX IF NOT EXISTS idx_storage_deletion_queue_pending ON public.storage_deletion_queue USING btree (next_attempt_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS storage_deletion_queue_idempotency_key_key ON public.storage_deletion_queue USING btree (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_tags_user_slug ON public.tags USING btree (user_id, slug);
CREATE INDEX IF NOT EXISTS idx_tags_user_updated ON public.tags USING btree (user_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS tags_user_id_slug_key ON public.tags USING btree (user_id, slug);
CREATE INDEX IF NOT EXISTS idx_upload_reservations_expiring ON public.upload_reservations USING btree (expires_at) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS idx_upload_reservations_owner_active ON public.upload_reservations USING btree (owner_id, status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS upload_reservations_attachment_id_key ON public.upload_reservations USING btree (attachment_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_upload_reservations_bucket_path ON public.upload_reservations USING btree (bucket_id, path);
CREATE INDEX IF NOT EXISTS idx_user_integrations_status ON public.user_integrations USING btree (provider, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_integrations_user_provider ON public.user_integrations USING btree (user_id, provider);
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_id ON public.web_push_subscriptions USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS web_push_subscriptions_endpoint_key ON public.web_push_subscriptions USING btree (endpoint);

-- 4. FUNCTIONS (public)
CREATE OR REPLACE FUNCTION public.accept_share_invitation(p_invite_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID;
    v_inv RECORD;
    v_collab_id UUID;
    v_user_profile RECORD;
    v_item JSONB;
    v_item_type TEXT;
    v_item_id TEXT;
    v_item_name TEXT;
    v_item_role TEXT;
    v_first_collab_id UUID := NULL;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    -- 1. Buscar invitacion valida
    SELECT * INTO v_inv
    FROM public.share_invitations
    WHERE invite_code = TRIM(p_invite_code)
      AND status = 'pending'
      AND expires_at > NOW();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La invitacion no es valida o ha expirado';
    END IF;

    -- 2. Evitar unirse a su propio recurso
    IF v_inv.owner_id::text = v_user_id::text THEN
        RAISE EXCEPTION 'Eres el propietario de este recurso';
    END IF;

    -- 3. Obtener nombre para el historial de actividad
    SELECT 
        COALESCE(
            raw_user_meta_data->>'full_name',
            raw_user_meta_data->>'name',
            raw_user_meta_data->'settings'->>'userName',
            SPLIT_PART(email, '@', 1),
            'Usuario'
        ) AS display_name
    INTO v_user_profile 
    FROM auth.users 
    WHERE id = v_user_id;

    -- 4. Si la invitación contiene un lote de múltiples elementos (batch_items)
    IF v_inv.batch_items IS NOT NULL AND jsonb_array_length(v_inv.batch_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_inv.batch_items)
        LOOP
            v_item_type := v_item->>'target_type';
            v_item_id := v_item->>'target_id';
            v_item_name := v_item->>'target_name';
            v_item_role := COALESCE(v_item->>'role', v_inv.role, 'editor');

            IF v_item_type IS NOT NULL AND v_item_id IS NOT NULL THEN
                INSERT INTO public.collaborations (target_type, target_id, owner_id, member_id, role, is_public_members)
                VALUES (v_item_type, v_item_id, v_inv.owner_id, v_user_id, v_item_role, COALESCE(v_inv.is_public_members, true))
                ON CONFLICT (target_type, target_id, member_id)
                DO UPDATE SET role = EXCLUDED.role, is_public_members = EXCLUDED.is_public_members
                RETURNING id INTO v_collab_id;

                IF v_first_collab_id IS NULL THEN
                    v_first_collab_id := v_collab_id;
                END IF;

                INSERT INTO public.collaboration_activity (target_type, target_id, actor_id, actor_name, action, item_title)
                VALUES (
                    v_item_type,
                    v_item_id,
                    v_user_id,
                    COALESCE(v_user_profile.display_name, 'Usuario'),
                    'added',
                    v_item_name
                );
            END IF;
        END LOOP;

        RETURN jsonb_build_object(
            'success', true,
            'is_batch', true,
            'collaboration_id', v_first_collab_id,
            'target_type', v_inv.target_type,
            'target_id', v_inv.target_id,
            'target_name', v_inv.target_name,
            'role', v_inv.role,
            'batch_items', v_inv.batch_items
        );
    ELSE
        -- 5. Caso individual
        INSERT INTO public.collaborations (target_type, target_id, owner_id, member_id, role, is_public_members)
        VALUES (v_inv.target_type, v_inv.target_id, v_inv.owner_id, v_user_id, v_inv.role, COALESCE(v_inv.is_public_members, true))
        ON CONFLICT (target_type, target_id, member_id)
        DO UPDATE SET role = EXCLUDED.role, is_public_members = EXCLUDED.is_public_members
        RETURNING id INTO v_collab_id;

        INSERT INTO public.collaboration_activity (target_type, target_id, actor_id, actor_name, action, item_title)
        VALUES (
            v_inv.target_type,
            v_inv.target_id,
            v_user_id,
            COALESCE(v_user_profile.display_name, 'Usuario'),
            'added',
            v_inv.target_name
        );

        RETURN jsonb_build_object(
            'success', true,
            'is_batch', false,
            'collaboration_id', v_collab_id,
            'target_type', v_inv.target_type,
            'target_id', v_inv.target_id,
            'target_name', v_inv.target_name,
            'role', v_inv.role
        );
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.activate_note_yjs_mode(p_note_id text, p_initial_update_data text, p_initial_update_hash text, p_client_id text, p_expected_content_hash text, p_expected_updated_at_ms bigint, p_initial_state_vector text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_note RECORD;
    v_db_content_hash TEXT;
    v_canonical_update_hash TEXT;
    v_initial_update_id BIGINT;
    v_now_ms BIGINT;
    v_decoded_bytes BYTEA;
BEGIN
    -- 1. Autenticación obligatoria
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- 2. Validación estricta de parámetros obligatorios (SIN valores nulos permitidos)
    IF p_note_id IS NULL OR length(trim(p_note_id)) = 0 THEN
        RAISE EXCEPTION 'p_note_id no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF p_initial_update_data IS NULL OR length(p_initial_update_data) = 0 THEN
        RAISE EXCEPTION 'p_initial_update_data no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF length(p_initial_update_data) > 10485760 THEN
        RAISE EXCEPTION 'El tamaño del documento inicial excede el límite de 10 MB' USING ERRCODE = '22023';
    END IF;
    IF p_initial_update_hash IS NULL OR length(trim(p_initial_update_hash)) != 64 THEN
        RAISE EXCEPTION 'p_initial_update_hash debe ser un hash SHA-256 de 64 caracteres' USING ERRCODE = '22023';
    END IF;
    IF p_client_id IS NULL OR length(trim(p_client_id)) = 0 THEN
        RAISE EXCEPTION 'p_client_id no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;

    -- REQUISITO ESTRICTO: p_expected_content_hash y p_expected_updated_at_ms NO pueden ser NULL
    IF p_expected_content_hash IS NULL OR length(trim(p_expected_content_hash)) != 64 THEN
        RAISE EXCEPTION 'p_expected_content_hash es obligatorio y debe ser un hash SHA-256 de 64 caracteres' USING ERRCODE = '22023';
    END IF;
    IF p_expected_updated_at_ms IS NULL OR p_expected_updated_at_ms <= 0 THEN
        RAISE EXCEPTION 'p_expected_updated_at_ms es obligatorio y debe ser un timestamp positivo válido' USING ERRCODE = '22023';
    END IF;

    -- 3. Bloqueo consultivo por nota para serializar intentos concurrentes de activación
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('note_yjs_activate_' || p_note_id));

    -- 4. BLOQUEO DE FILA EN BASE DE DATOS (FOR UPDATE)
    SELECT id, user_id, content, sync_mode, deleted, updated_at_ms, last_modified_ms
    INTO v_note
    FROM public.notes
    WHERE id = p_note_id
    FOR UPDATE;

    IF v_note.id IS NULL THEN
        RAISE EXCEPTION 'La nota % no existe en public.notes', p_note_id USING ERRCODE = '02000';
    END IF;

    -- 5. COMPROBACIÓN ESTRICTA DE PROPIEDAD: Solo el legítimo propietario puede activar Yjs
    IF v_note.user_id::text IS DISTINCT FROM v_user_id::text THEN
        RAISE EXCEPTION 'Permiso denegado: solo el propietario legítimo de la nota puede activar el modo colaborativo Yjs'
            USING ERRCODE = '42501';
    END IF;

    -- 6. Comprobar que no esté eliminada
    IF COALESCE(v_note.deleted, 0) = 1 THEN
        RAISE EXCEPTION 'No se puede activar el modo Yjs en una nota marcada como eliminada' USING ERRCODE = '55000';
    END IF;

    -- 7. Comprobar modo actual: Solo notas en 'rest' pueden ser activadas
    IF v_note.sync_mode = 'yjs' THEN
        RAISE EXCEPTION 'La nota % ya se encuentra en modo ''yjs''. No se permite reinicializar un documento colaborativo activo.',
            p_note_id USING ERRCODE = '55000';
    END IF;

    IF v_note.sync_mode != 'rest' THEN
        RAISE EXCEPTION 'La nota % tiene un sync_mode inválido (''%''). Solo se admite transición desde ''rest''.',
            p_note_id, v_note.sync_mode USING ERRCODE = '55000';
    END IF;

    -- 8. COMPROBACIÓN DE INEXISTENCIA DE DELTAS O SNAPSHOTS PREVIOS INCOMPATIBLES
    IF EXISTS (SELECT 1 FROM public.note_yjs_updates WHERE note_id = p_note_id) 
       OR EXISTS (SELECT 1 FROM public.note_yjs_snapshots WHERE note_id = p_note_id) THEN
        RAISE EXCEPTION 'Integridad comprometida: ya existen registros previos de Yjs para la nota %. Se rechaza la activación.',
            p_note_id USING ERRCODE = '55000';
    END IF;

    -- 9. COMPROBACIÓN ESTRICTA DE CONCURRENCIA DE CONTENIDO (Sin excepciones permitidas)
    IF v_note.updated_at_ms IS DISTINCT FROM p_expected_updated_at_ms THEN
        RAISE EXCEPTION 'Conflicto de concurrencia: la nota fue modificada (updated_at_ms=% vs esperado=%) mientras se preparaba la conversión Yjs.',
            v_note.updated_at_ms, p_expected_updated_at_ms USING ERRCODE = '40001';
    END IF;

    v_db_content_hash := pg_catalog.lower(pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(COALESCE(v_note.content, ''), 'UTF8')), 
        'hex'
    ));

    IF pg_catalog.lower(pg_catalog.btrim(p_expected_content_hash)) IS DISTINCT FROM v_db_content_hash THEN
        RAISE EXCEPTION 'Conflicto de concurrencia: el contenido actual de la nota difiere de la versión convertida a Yjs (hash detectado: %, esperado: %).',
            v_db_content_hash, p_expected_content_hash USING ERRCODE = '40001';
    END IF;

    -- 10. Validación criptográfica en el servidor del update inicial Yjs
    BEGIN
        v_decoded_bytes := pg_catalog.decode(p_initial_update_data, 'base64');
        v_canonical_update_hash := pg_catalog.lower(pg_catalog.encode(pg_catalog.sha256(v_decoded_bytes), 'hex'));
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'p_initial_update_data no es una cadena Base64 válida' USING ERRCODE = '22023';
    END;

    IF pg_catalog.lower(pg_catalog.btrim(p_initial_update_hash)) != v_canonical_update_hash THEN
        RAISE EXCEPTION 'Hash de actualización inicial inválido: no coincide con el SHA-256 del contenido binario' 
            USING ERRCODE = '22000';
    END IF;

    -- 11. PERSISTENCIA DURADERA DEL ESTADO INICIAL YJS (Sembrado atómico)
    INSERT INTO public.note_yjs_updates (
        note_id, client_id, user_id, update_data, update_hash, created_at
    ) VALUES (
        p_note_id, p_client_id, v_user_id, p_initial_update_data, v_canonical_update_hash, NOW()
    ) RETURNING id INTO v_initial_update_id;

    -- Snapshot acelerador inicial opcional
    IF p_initial_state_vector IS NOT NULL AND length(p_initial_state_vector) > 0 THEN
        INSERT INTO public.note_yjs_snapshots (
            note_id, snapshot, state_vector, server_clock, created_at, updated_at
        ) VALUES (
            p_note_id, p_initial_update_data, p_initial_state_vector, v_initial_update_id, NOW(), NOW()
        );
    END IF;

    -- 12. ACTIVACIÓN CONTROLADA DEL MODO EN public.notes
    PERFORM pg_catalog.set_config('veyra.allow_sync_mode_transition', 'on', true);

    v_now_ms := (pg_catalog.date_part('epoch', pg_catalog.now()) * 1000)::bigint;

    UPDATE public.notes
    SET sync_mode = 'yjs',
        updated_at_ms = v_now_ms,
        last_modified_ms = v_now_ms
    WHERE id = p_note_id;

    -- 13. Confirmación estructurada
    RETURN jsonb_build_object(
        'success', true,
        'note_id', p_note_id,
        'sync_mode', 'yjs',
        'initial_update_id', v_initial_update_id,
        'updated_at_ms', v_now_ms
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_note_yjs_update(p_note_id text, p_client_id text, p_update_data text, p_update_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_canonical_hash TEXT;
    v_note_sync_mode TEXT;
    v_note_deleted INT;
    v_existing_id BIGINT;
    v_existing_data TEXT;
    v_new_id BIGINT;
    v_decoded_bytes BYTEA;
BEGIN
    -- 1. Autenticación obligatoria
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- 2. Validación estricta de parámetros y límite de tamaño (máx. 10 MB en Base64)
    IF p_note_id IS NULL OR length(pg_catalog.btrim(p_note_id)) = 0 THEN
        RAISE EXCEPTION 'p_note_id no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF p_client_id IS NULL OR length(pg_catalog.btrim(p_client_id)) = 0 THEN
        RAISE EXCEPTION 'p_client_id no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF p_update_data IS NULL OR length(p_update_data) = 0 THEN
        RAISE EXCEPTION 'p_update_data no puede ser nulo o vacío' USING ERRCODE = '22023';
    END IF;
    IF length(p_update_data) > 10485760 THEN
        RAISE EXCEPTION 'El tamaño de la actualización excede el límite permitido de 10 MB' USING ERRCODE = '22023';
    END IF;
    IF p_update_hash IS NULL OR length(pg_catalog.btrim(p_update_hash)) != 64 THEN
        RAISE EXCEPTION 'p_update_hash debe ser un hash SHA-256 de 64 caracteres' USING ERRCODE = '22023';
    END IF;

    -- 3. Autorización de escritura por roles (propietario o colaboradores con rol 'editor')
    IF NOT public.is_note_editor(p_note_id) THEN
        RAISE EXCEPTION 'Permiso denegado: solo editores y propietarios pueden insertar deltas Yjs' USING ERRCODE = '42501';
    END IF;

    -- 4. Comprobar que la nota esté en modo 'yjs' y activa
    SELECT sync_mode, deleted INTO v_note_sync_mode, v_note_deleted
    FROM public.notes
    WHERE id = p_note_id;

    IF v_note_sync_mode IS NULL THEN
        RAISE EXCEPTION 'La nota % no existe', p_note_id USING ERRCODE = '02000';
    END IF;

    IF COALESCE(v_note_deleted, 0) = 1 THEN
        RAISE EXCEPTION 'No se pueden insertar deltas en una nota eliminada' USING ERRCODE = '55000';
    END IF;

    IF v_note_sync_mode != 'yjs' THEN
        RAISE EXCEPTION 'La nota % está en modo ''%''. Solo se admiten deltas colaborativos en notas con sync_mode = ''yjs''.',
            p_note_id, v_note_sync_mode USING ERRCODE = '55000';
    END IF;

    -- 5. Cálculo y normalización canónica de SHA-256 sobre los bytes decodificados
    BEGIN
        v_decoded_bytes := pg_catalog.decode(p_update_data, 'base64');
        v_canonical_hash := pg_catalog.lower(pg_catalog.encode(pg_catalog.sha256(v_decoded_bytes), 'hex'));
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'p_update_data no es una cadena Base64 válida' USING ERRCODE = '22023';
    END;

    IF pg_catalog.lower(pg_catalog.btrim(p_update_hash)) != v_canonical_hash THEN
        RAISE EXCEPTION 'Hash de actualización inválido: no coincide con el SHA-256 del contenido' USING ERRCODE = '22000';
    END IF;

    -- 6. Bloqueo consultivo transaccional por nota (serializa escrituras concurrentes de esta nota)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('note_yjs_' || p_note_id));

    -- 7. Idempotencia exacta y comparación binaria estricta frente a reintentos
    SELECT id, update_data INTO v_existing_id, v_existing_data
    FROM public.note_yjs_updates
    WHERE note_id = p_note_id AND update_hash = v_canonical_hash;

    IF v_existing_id IS NOT NULL THEN
        -- Comprobación binaria estricta de coherencia
        IF pg_catalog.decode(v_existing_data, 'base64') != v_decoded_bytes THEN
            RAISE EXCEPTION 'Conflicto de integridad: el hash coincide pero el contenido binario difiere' USING ERRCODE = '23505';
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'update_id', v_existing_id,
            'duplicate', true
        );
    END IF;

    -- 8. Inserción duradera en el log autoritativo
    INSERT INTO public.note_yjs_updates (
        note_id, client_id, user_id, update_data, update_hash, created_at
    ) VALUES (
        p_note_id, p_client_id, v_user_id, p_update_data, v_canonical_hash, NOW()
    ) RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'update_id', v_new_id,
        'duplicate', false
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_edit_attachment_target(p_target_type text, p_target_id text, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT (p_user_id IS NOT NULL) AND CASE p_target_type
    WHEN 'note' THEN (
      EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = p_target_id
          AND COALESCE(n.deleted, 0) = 0
          AND (
            n.user_id = p_user_id
            OR EXISTS (
              SELECT 1 FROM public.collaborations c
              WHERE c.target_type = 'note' AND c.target_id = n.id
                AND (c.owner_id = p_user_id OR (c.member_id = p_user_id AND c.role = 'editor'))
            )
            OR (
              n.folder_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.collaborations c
                WHERE c.target_type = 'folder' AND c.target_id = n.folder_id
                  AND (c.owner_id = p_user_id OR (c.member_id = p_user_id AND c.role = 'editor'))
              )
            )
          )
      )
    )
    WHEN 'reminder' THEN (
      EXISTS (
        SELECT 1 FROM public.reminders r
        WHERE r.id = p_target_id
          AND COALESCE(r.deleted, 0) = 0
          AND (
            r.user_id = p_user_id
            OR EXISTS (
              SELECT 1 FROM public.collaborations c
              WHERE c.target_type = 'reminder' AND c.target_id = r.id
                AND (c.owner_id = p_user_id OR (c.member_id = p_user_id AND c.role = 'editor'))
            )
          )
      )
    )
    WHEN 'event' THEN (
      EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_target_id
          AND COALESCE(e.deleted, 0) = 0
          AND (
            e.user_id = p_user_id
            OR EXISTS (
              SELECT 1 FROM public.collaborations c
              WHERE c.target_type = 'event' AND c.target_id = e.id
                AND (c.owner_id = p_user_id OR (c.member_id = p_user_id AND c.role = 'editor'))
            )
          )
      )
    )
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.can_read_attachment_target(p_target_type text, p_target_id text, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT (p_user_id IS NOT NULL) AND CASE p_target_type
    WHEN 'note' THEN (
      EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.id = p_target_id
          AND (
            n.user_id = p_user_id
            OR (
              COALESCE(n.deleted, 0) = 0 AND (
                EXISTS (
                  SELECT 1 FROM public.collaborations c
                  WHERE c.target_type = 'note' AND c.target_id = n.id
                    AND (c.owner_id = p_user_id OR (c.member_id = p_user_id AND c.role IN ('viewer', 'editor')))
                )
                OR (
                  n.folder_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.collaborations c
                    WHERE c.target_type = 'folder' AND c.target_id = n.folder_id
                      AND (c.owner_id = p_user_id OR (c.member_id = p_user_id AND c.role IN ('viewer', 'editor')))
                  )
                )
              )
            )
          )
      )
    )
    WHEN 'reminder' THEN (
      EXISTS (
        SELECT 1 FROM public.reminders r
        WHERE r.id = p_target_id
          AND (
            r.user_id = p_user_id
            OR (
              COALESCE(r.deleted, 0) = 0 AND EXISTS (
                SELECT 1 FROM public.collaborations c
                WHERE c.target_type = 'reminder' AND c.target_id = r.id
                  AND (c.owner_id = p_user_id OR c.member_id = p_user_id)
              )
            )
          )
      )
    )
    WHEN 'event' THEN (
      EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_target_id
          AND (
            e.user_id = p_user_id
            OR (
              COALESCE(e.deleted, 0) = 0 AND EXISTS (
                SELECT 1 FROM public.collaborations c
                WHERE c.target_type = 'event' AND c.target_id = e.id
                  AND (c.owner_id = p_user_id OR c.member_id = p_user_id)
              )
            )
          )
      )
    )
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.compact_note_yjs_snapshot(p_note_id text, p_snapshot_data text, p_state_vector text, p_up_to_update_id bigint, p_snapshot_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_canonical_hash TEXT;
    v_decoded_bytes BYTEA;
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
    IF length(p_snapshot_data) > 10485760 THEN
        RAISE EXCEPTION 'El tamaño del snapshot excede el límite permitido de 10 MB' USING ERRCODE = '22023';
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

    IF pg_catalog.lower(pg_catalog.btrim(p_snapshot_hash)) != v_canonical_hash THEN
        RAISE EXCEPTION 'Hash de snapshot inválido: no coincide con el SHA-256 del contenido' USING ERRCODE = '22000';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('note_yjs_' || p_note_id));

    SELECT max(id) INTO v_max_existing_id
    FROM public.note_yjs_updates
    WHERE note_id = p_note_id AND id <= p_up_to_update_id;

    IF v_max_existing_id IS NULL THEN
        RAISE EXCEPTION 'El cursor p_up_to_update_id (%) no corresponde a ningún delta registrado para la nota %',
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
$function$;

CREATE OR REPLACE FUNCTION public.delete_user_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No authenticated user';
    END IF;

    -- Eliminar registro del usuario en auth.users (dispara ON DELETE CASCADE en profiles, reminders, notes, folders, events)
    DELETE FROM auth.users WHERE id = v_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_notify_reminder_state_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url TEXT := 'https://rrwoompvuggcczggfgiq.supabase.co/functions/v1/notify-state-change';
  v_anon_jwt TEXT := '<REDACTED_ANON_JWT>';
BEGIN
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_jwt,
      'apikey', v_anon_jwt
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'reminders',
      'schema', 'public',
      'record', to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block reminder updates if pg_net fails
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, user_profile, default_control_level, is_premium, onboarding_completed, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    'equilibrado',
    CASE
      WHEN LOWER(COALESCE(NEW.raw_user_meta_data->'settings'->>'defaultControlLevel', 'normal')) = 'critical' THEN 'critical'
      ELSE 'normal'
    END,
    CASE WHEN LOWER(TRIM(COALESCE(NEW.email, ''))) = 'r***@gmail.com' THEN TRUE ELSE FALSE END,
    FALSE,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_owner_premium_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF LOWER(TRIM(COALESCE(NEW.email, ''))) = 'r***@gmail.com' THEN
        NEW.is_premium := TRUE;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_active_upload_reservation(p_bucket_id text, p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.upload_reservations r
    WHERE r.owner_id = (SELECT auth.uid())
      AND r.bucket_id = p_bucket_id
      AND r.path = p_path
      AND r.status = 'active'
      AND r.expires_at > pg_catalog.now()
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_note_editor(p_note_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT (auth.uid() IS NOT NULL) AND (
        -- 1. Propietario directo de la nota (la nota no debe estar eliminada para editarla)
        EXISTS (
            SELECT 1 FROM public.notes n
            WHERE n.id = p_note_id 
              AND n.user_id::text = auth.uid()::text
              AND COALESCE(n.deleted, 0) = 0
        )
        OR
        -- 2. Colaborador directo de la nota con rol 'editor' sobre nota activa
        EXISTS (
            SELECT 1 FROM public.notes n
            JOIN public.collaborations c ON c.target_type = 'note' AND c.target_id = n.id
            WHERE n.id = p_note_id
              AND COALESCE(n.deleted, 0) = 0
              AND (c.owner_id::text = auth.uid()::text OR (c.member_id::text = auth.uid()::text AND c.role = 'editor'))
        )
        OR
        -- 3. Colaborador de la carpeta contenedora con rol 'editor' sobre nota activa
        EXISTS (
            SELECT 1 FROM public.notes n
            JOIN public.collaborations c ON c.target_type = 'folder' AND c.target_id = n.folder_id
            WHERE n.id = p_note_id
              AND n.folder_id IS NOT NULL
              AND COALESCE(n.deleted, 0) = 0
              AND (c.owner_id::text = auth.uid()::text OR (c.member_id::text = auth.uid()::text AND c.role = 'editor'))
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_note_reader(p_note_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT (auth.uid() IS NOT NULL) AND (
        -- A) Es editor o propietario de nota activa
        public.is_note_editor(p_note_id)
        OR
        -- B) Propietario accediendo a su propia nota incluso si está en papelera (para verla/restaurarla)
        EXISTS (
            SELECT 1 FROM public.notes n
            WHERE n.id = p_note_id AND n.user_id::text = auth.uid()::text
        )
        OR
        -- C) Colaborador directo con rol explícito 'viewer' o 'editor' sobre nota no eliminada
        EXISTS (
            SELECT 1 FROM public.notes n
            JOIN public.collaborations c ON c.target_type = 'note' AND c.target_id = n.id
            WHERE n.id = p_note_id
              AND COALESCE(n.deleted, 0) = 0
              AND (c.owner_id::text = auth.uid()::text OR (c.member_id::text = auth.uid()::text AND c.role IN ('viewer', 'editor')))
        )
        OR
        -- D) Colaborador de carpeta contenedora con rol explícito 'viewer' o 'editor' sobre nota no eliminada
        EXISTS (
            SELECT 1 FROM public.notes n
            JOIN public.collaborations c ON c.target_type = 'folder' AND c.target_id = n.folder_id
            WHERE n.id = p_note_id
              AND n.folder_id IS NOT NULL
              AND COALESCE(n.deleted, 0) = 0
              AND (c.owner_id::text = auth.uid()::text OR (c.member_id::text = auth.uid()::text AND c.role IN ('viewer', 'editor')))
        )
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_target_collaborator(p_target_type text, p_target_id text, p_user_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.collaborations
        WHERE target_type = p_target_type
          AND target_id::text = p_target_id
          AND (owner_id::text = p_user_id OR member_id::text = p_user_id)
    );
$function$;

CREATE OR REPLACE FUNCTION public.protect_note_yjs_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    -- 6.1 CONTROL EN INSERCIÓN (INSERT)
    IF TG_OP = 'INSERT' THEN
        -- Todas las notas nuevas comienzan obligatoriamente en 'rest'
        NEW.sync_mode := 'rest';
        RETURN NEW;
    END IF;

    -- 6.2 CONTROL EN ACTUALIZACIÓN (UPDATE)
    IF TG_OP = 'UPDATE' THEN
        -- A) CONTROL DE TRANSICIÓN DE sync_mode (DEFENSA EN PROFUNDIDAD):
        IF NEW.sync_mode IS DISTINCT FROM OLD.sync_mode THEN
            -- Se permite la transición ÚNICAMENTE si cumple TODAS las siguientes condiciones:
            -- 1. Contexto transaccional 'veyra.allow_sync_mode_transition' en 'on'.
            -- 2. Transición estrictamente unidireccional de 'rest' a 'yjs'.
            -- 3. La nota previa no está marcada como eliminada.
            -- 4. El invocador autenticado es el legítimo propietario de la nota.
            -- 5. Ya se ha registrado el estado inicial Yjs en note_yjs_updates dentro de la transacción.
            IF pg_catalog.current_setting('veyra.allow_sync_mode_transition', true) = 'on'
               AND OLD.sync_mode = 'rest' 
               AND NEW.sync_mode = 'yjs'
               AND COALESCE(OLD.deleted, 0) = 0
               AND OLD.user_id::text = auth.uid()::text
               AND EXISTS (SELECT 1 FROM public.note_yjs_updates WHERE note_id = NEW.id) THEN
                -- Transición autorizada
                NEW.sync_mode := 'yjs';
            ELSE
                -- Petición ordinaria REST, regresión a 'rest' o violación de invariantes:
                -- Se neutraliza incondicionalmente preservando el modo anterior.
                NEW.sync_mode := OLD.sync_mode;
            END IF;
        END IF;

        -- B) BLINDAJE DE CONTENIDO Y MONOTONÍA PARA NOTAS YJS:
        IF OLD.sync_mode = 'yjs' THEN
            -- B.1: Blindaje del contenido editable contra sobreescrituras REST
            IF NEW.content IS DISTINCT FROM OLD.content THEN
                NEW.content := OLD.content;
            END IF;

            -- B.2: Monotonía temporal de updated_at_ms: rechaza valores nulos o regresivos
            IF OLD.updated_at_ms IS NOT NULL AND (NEW.updated_at_ms IS NULL OR NEW.updated_at_ms < OLD.updated_at_ms) THEN
                NEW.updated_at_ms := OLD.updated_at_ms;
            END IF;

            -- B.3: Monotonía temporal de last_modified_ms: rechaza valores nulos o regresivos
            IF OLD.last_modified_ms IS NOT NULL AND (NEW.last_modified_ms IS NULL OR NEW.last_modified_ms < OLD.last_modified_ms) THEN
                NEW.last_modified_ms := OLD.last_modified_ms;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_disconnect_google_integration(p_user_id uuid)
 RETURNS TABLE(integration_id uuid, old_refresh_token text, affected_attachments integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_existing  public.user_integrations%ROWTYPE;
  v_old_token text;
  v_affected  integer := 0;
BEGIN
  SELECT *
    INTO v_existing
    FROM public.user_integrations ui
   WHERE ui.user_id = p_user_id
     AND ui.provider = 'google_drive'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_existing.refresh_token_secret_id IS NOT NULL THEN
    SELECT ds.decrypted_secret
      INTO v_old_token
      FROM vault.decrypted_secrets ds
     WHERE ds.id = v_existing.refresh_token_secret_id;

    UPDATE public.user_integrations ui
       SET status                  = 'disconnected',
           refresh_token_secret_id = NULL,
           disconnect_requested    = false,
           disconnected_at         = now(),
           updated_at              = now()
     WHERE ui.id = v_existing.id;

    DELETE FROM vault.secrets WHERE id = v_existing.refresh_token_secret_id;
  ELSE
    UPDATE public.user_integrations ui
       SET status               = 'disconnected',
           disconnect_requested = false,
           disconnected_at      = COALESCE(ui.disconnected_at, now()),
           updated_at           = now()
     WHERE ui.id = v_existing.id;
  END IF;

  UPDATE public.attachments a
     SET availability       = 'unavailable',
         unavailable_reason = 'drive_disconnected',
         unavailable_since  = COALESCE(a.unavailable_since, now()),
         updated_at         = now()
   WHERE a.integration_id = v_existing.id
     AND a.provider = 'google_drive'
     AND a.deleted_at IS NULL
     AND a.availability <> 'unavailable';
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  RETURN QUERY SELECT v_existing.id, v_old_token, v_affected;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_finalize_upload(p_reservation_id uuid, p_owner_id uuid, p_actual_bytes bigint, p_detected_mime text, p_sha256 text)
 RETURNS TABLE(outcome text, attachment_id uuid, availability text, size_bytes bigint, mime_type text, checksum_sha256 text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_res        public.upload_reservations%ROWTYPE;
  v_usage      public.storage_usage%ROWTYPE;
  v_plan       public.storage_plans%ROWTYPE;
  v_att        public.attachments%ROWTYPE;
  v_is_premium boolean := false;
  v_new_res    bigint;
BEGIN
  SELECT *
    INTO v_res
  FROM public.upload_reservations r
  WHERE r.id = p_reservation_id
    AND r.owner_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotencia si el cliente reintenta un finalize ya completado
  IF v_res.status = 'consumed' THEN
    SELECT * INTO v_att FROM public.attachments a WHERE a.id = v_res.attachment_id;
    RETURN QUERY SELECT 'already_consumed'::text, v_att.id, v_att.availability, v_att.size_bytes, v_att.mime_type, v_att.checksum_sha256;
    RETURN;
  END IF;

  IF v_res.status <> 'active' THEN
    RAISE EXCEPTION 'RESERVATION_NOT_ACTIVE:%', v_res.status USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(p.is_premium, false) INTO v_is_premium
  FROM public.profiles p WHERE p.id = p_owner_id;

  SELECT * INTO v_plan
  FROM public.storage_plans sp
  WHERE sp.plan_code = CASE WHEN v_is_premium THEN 'premium' ELSE 'free' END;

  SELECT * INTO v_usage
  FROM public.storage_usage su
  WHERE su.storage_owner_id = p_owner_id
  FOR UPDATE;

  v_new_res := GREATEST(0, v_usage.reserved_bytes - v_res.reserved_bytes);

  -- Caso A: MIME real prohibido o tamaño real excede cuota/techo del plan -> violación y cola de borrado
  IF NOT (p_detected_mime = ANY(v_plan.allowed_mime_types))
     OR p_actual_bytes > v_plan.max_file_bytes
     OR (p_actual_bytes > v_res.max_bytes AND (v_usage.used_bytes + v_new_res + p_actual_bytes) > v_plan.quota_bytes)
  THEN
    UPDATE public.upload_reservations
    SET status = 'violated', actual_bytes = p_actual_bytes, consumed_at = pg_catalog.now()
    WHERE id = v_res.id;

    -- El objeto físico aún existe: computa en used_bytes hasta que deletion-worker confirme borrado (§10.5)
    UPDATE public.storage_usage
    SET reserved_bytes = v_new_res,
        used_bytes     = used_bytes + p_actual_bytes,
        updated_at     = pg_catalog.now()
    WHERE storage_owner_id = p_owner_id;

    UPDATE public.attachments
    SET availability = 'failed',
        size_bytes   = p_actual_bytes,
        mime_type    = p_detected_mime,
        checksum_sha256 = p_sha256,
        deleted_at   = pg_catalog.now(),
        metadata     = metadata || jsonb_build_object(
          'quota_or_mime_violation', true,
          'reserved_bytes', v_res.reserved_bytes,
          'actual_bytes', p_actual_bytes,
          'detected_mime', p_detected_mime
        ),
        updated_at   = pg_catalog.now()
    WHERE id = v_res.attachment_id;

    INSERT INTO public.storage_deletion_queue (
      attachment_id, bucket_id, path, size_bytes, owner_id, reason, idempotency_key
    ) VALUES (
      v_res.attachment_id, v_res.bucket_id, v_res.path, p_actual_bytes, p_owner_id,
      'quota_violation', v_res.bucket_id || ':' || v_res.path || ':' || v_res.attachment_id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN QUERY SELECT 'violated_queued_delete'::text, v_res.attachment_id, 'failed'::text, p_actual_bytes, p_detected_mime, p_sha256;
    RETURN;
  END IF;

  -- Caso B: Tamaño real excedió la reserva pero cabe en el plan -> marcar violated, cobrar tamaño real y aceptar
  IF p_actual_bytes > v_res.max_bytes THEN
    UPDATE public.upload_reservations
    SET status = 'violated', actual_bytes = p_actual_bytes, consumed_at = pg_catalog.now()
    WHERE id = v_res.id;

    UPDATE public.storage_usage
    SET reserved_bytes = v_new_res,
        used_bytes     = used_bytes + p_actual_bytes,
        updated_at     = pg_catalog.now()
    WHERE storage_owner_id = p_owner_id;

    UPDATE public.attachments
    SET availability    = 'available',
        size_bytes      = p_actual_bytes,
        mime_type       = p_detected_mime,
        checksum_sha256 = p_sha256,
        metadata        = metadata || jsonb_build_object(
          'size_overage_charged', true,
          'reserved_bytes', v_res.reserved_bytes,
          'actual_bytes', p_actual_bytes
        ),
        updated_at      = pg_catalog.now()
    WHERE id = v_res.attachment_id;

    RETURN QUERY SELECT 'violated_charged'::text, v_res.attachment_id, 'available'::text, p_actual_bytes, p_detected_mime, p_sha256;
    RETURN;
  END IF;

  -- Caso C (normal): actual_bytes <= max_bytes -> consumir reserva y activar adjunto
  UPDATE public.upload_reservations
  SET status = 'consumed', actual_bytes = p_actual_bytes, consumed_at = pg_catalog.now()
  WHERE id = v_res.id;

  UPDATE public.storage_usage
  SET reserved_bytes = v_new_res,
      used_bytes     = used_bytes + p_actual_bytes,
      updated_at     = pg_catalog.now()
  WHERE storage_owner_id = p_owner_id;

  UPDATE public.attachments
  SET availability    = 'available',
      size_bytes      = p_actual_bytes,
      mime_type       = p_detected_mime,
      checksum_sha256 = p_sha256,
      updated_at      = pg_catalog.now()
  WHERE id = v_res.attachment_id;

  RETURN QUERY SELECT 'ok'::text, v_res.attachment_id, 'available'::text, p_actual_bytes, p_detected_mime, p_sha256;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_google_refresh_token(p_integration_id uuid)
 RETURNS TABLE(integration_id uuid, user_id uuid, google_sub text, oauth_client_kind text, oauth_client_id text, status text, refresh_token text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    ui.id AS integration_id,
    ui.user_id,
    ui.google_sub,
    ui.oauth_client_kind,
    ui.oauth_client_id,
    ui.status,
    ds.decrypted_secret AS refresh_token
  FROM public.user_integrations ui
  LEFT JOIN vault.decrypted_secrets ds
    ON ds.id = ui.refresh_token_secret_id
  WHERE ui.id = p_integration_id;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_my_google_integration()
 RETURNS TABLE(id uuid, provider text, google_sub text, google_email text, oauth_client_kind text, scopes text[], status text, disconnect_requested boolean, connected_at timestamp with time zone, last_refreshed_at timestamp with time zone, last_error_code text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    ui.id,
    ui.provider,
    ui.google_sub,
    ui.google_email,
    ui.oauth_client_kind,
    ui.scopes,
    ui.status,
    ui.disconnect_requested,
    ui.connected_at,
    ui.last_refreshed_at,
    ui.last_error_code,
    ui.updated_at
  FROM public.user_integrations ui
  WHERE ui.user_id = (SELECT auth.uid())
    AND ui.provider = 'google_drive';
$function$;

CREATE OR REPLACE FUNCTION public.rpc_mark_google_integration_status(p_integration_id uuid, p_status text, p_error_code text DEFAULT NULL::text, p_unavailable_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_status NOT IN ('active', 'needs_reauth', 'revoked') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  UPDATE public.user_integrations ui
     SET status            = p_status,
         last_error_code   = CASE WHEN p_status = 'active' THEN NULL ELSE p_error_code END,
         last_error_at     = CASE WHEN p_status = 'active' THEN NULL ELSE now() END,
         last_refreshed_at = CASE WHEN p_status = 'active' THEN now() ELSE ui.last_refreshed_at END,
         updated_at        = now()
   WHERE ui.id = p_integration_id;

  IF p_status IN ('needs_reauth', 'revoked') AND p_unavailable_reason IS NOT NULL THEN
    UPDATE public.attachments a
       SET availability       = 'unavailable',
           unavailable_reason = p_unavailable_reason,
           unavailable_since  = COALESCE(a.unavailable_since, now()),
           updated_at         = now()
     WHERE a.integration_id = p_integration_id
       AND a.provider = 'google_drive'
       AND a.deleted_at IS NULL
       AND a.availability = 'available';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reconcile_storage_usage()
 RETURNS TABLE(out_owner_id uuid, out_used_bytes bigint, out_reserved_bytes bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  WITH calc_used AS (
    SELECT a.storage_owner_id AS uid, COALESCE(SUM(a.size_bytes), 0)::bigint AS bytes
    FROM public.attachments a
    WHERE a.provider = 'supabase'
      AND (
        a.availability IN ('available', 'pending_delete')
        OR (a.availability = 'unavailable' AND a.storage_path IS NOT NULL)
        OR EXISTS (
          SELECT 1 FROM public.storage_deletion_queue q
          WHERE q.attachment_id = a.id AND q.status <> 'confirmed'
        )
      )
    GROUP BY a.storage_owner_id
  ),
  calc_res AS (
    SELECT r.owner_id AS uid, COALESCE(SUM(r.reserved_bytes), 0)::bigint AS bytes
    FROM public.upload_reservations r
    WHERE r.status = 'active' AND r.expires_at > pg_catalog.now()
    GROUP BY r.owner_id
  ),
  owners AS (
    SELECT uid FROM calc_used
    UNION SELECT uid FROM calc_res
    UNION SELECT su.storage_owner_id FROM public.storage_usage su
  )
  INSERT INTO public.storage_usage (storage_owner_id, used_bytes, reserved_bytes, updated_at, last_reconciled_at)
  SELECT
    o.uid,
    COALESCE(cu.bytes, 0),
    COALESCE(cr.bytes, 0),
    pg_catalog.now(),
    pg_catalog.now()
  FROM owners o
  LEFT JOIN calc_used cu ON cu.uid = o.uid
  LEFT JOIN calc_res  cr ON cr.uid = o.uid
  ON CONFLICT (storage_owner_id) DO UPDATE SET
    used_bytes         = EXCLUDED.used_bytes,
    reserved_bytes     = EXCLUDED.reserved_bytes,
    updated_at         = pg_catalog.now(),
    last_reconciled_at = pg_catalog.now()
  RETURNING public.storage_usage.storage_owner_id, public.storage_usage.used_bytes, public.storage_usage.reserved_bytes;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reserve_upload_quota(p_owner_id uuid, p_target_type text, p_target_id text, p_bucket_id text, p_original_name text, p_sanitized_name text, p_mime_type text, p_size_bytes bigint)
 RETURNS TABLE(reservation_id uuid, attachment_id uuid, bucket_id text, storage_path text, max_bytes bigint, expires_at timestamp with time zone, remaining_bytes bigint, plan_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_is_premium    boolean := false;
  v_plan          public.storage_plans%ROWTYPE;
  v_usage         public.storage_usage%ROWTYPE;
  v_open_count    integer;
  v_attachment_id uuid := gen_random_uuid();
  v_res_id        uuid := gen_random_uuid();
  v_path          text;
  v_expires_at    timestamptz;
BEGIN
  IF p_target_type NOT IN ('note', 'reminder', 'event') THEN
    RAISE EXCEPTION 'INVALID_TARGET_TYPE' USING ERRCODE = '22023';
  END IF;

  IF p_size_bytes IS NULL OR p_size_bytes <= 0 THEN
    RAISE EXCEPTION 'INVALID_SIZE_BYTES' USING ERRCODE = '22023';
  END IF;

  -- Determinar plan desde public.profiles
  SELECT COALESCE(p.is_premium, false)
    INTO v_is_premium
  FROM public.profiles p
  WHERE p.id = p_owner_id;

  SELECT *
    INTO v_plan
  FROM public.storage_plans sp
  WHERE sp.plan_code = CASE WHEN v_is_premium THEN 'premium' ELSE 'free' END;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  IF p_size_bytes > v_plan.max_file_bytes THEN
    RAISE EXCEPTION 'FILE_TOO_LARGE:%', v_plan.max_file_bytes USING ERRCODE = 'P0001';
  END IF;

  IF NOT (p_mime_type = ANY(v_plan.allowed_mime_types)) THEN
    RAISE EXCEPTION 'UNSUPPORTED_MIME:%', p_mime_type USING ERRCODE = 'P0001';
  END IF;

  -- Garantizar fila en storage_usage y serializar concurrencia por usuario
  INSERT INTO public.storage_usage (storage_owner_id, used_bytes, reserved_bytes)
  VALUES (p_owner_id, 0, 0)
  ON CONFLICT (storage_owner_id) DO NOTHING;

  SELECT *
    INTO v_usage
  FROM public.storage_usage su
  WHERE su.storage_owner_id = p_owner_id
  FOR UPDATE;

  -- Contar reservas activas no expiradas
  SELECT count(*)
    INTO v_open_count
  FROM public.upload_reservations r
  WHERE r.owner_id = p_owner_id
    AND r.status = 'active'
    AND r.expires_at > pg_catalog.now();

  IF v_open_count >= v_plan.max_open_reservations THEN
    RAISE EXCEPTION 'TOO_MANY_RESERVATIONS:%', v_plan.max_open_reservations USING ERRCODE = 'P0001';
  END IF;

  -- Verificar cuota disponible (used + reserved + nueva reserva <= quota)
  IF (v_usage.used_bytes + v_usage.reserved_bytes + p_size_bytes) > v_plan.quota_bytes THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED:%:%',
      GREATEST(0, v_plan.quota_bytes - v_usage.used_bytes - v_usage.reserved_bytes),
      v_plan.quota_bytes
      USING ERRCODE = 'P0001';
  END IF;

  v_path := p_owner_id::text || '/' || v_attachment_id::text || '/' || p_sanitized_name;
  v_expires_at := pg_catalog.now() + make_interval(secs => v_plan.reservation_ttl_seconds);

  INSERT INTO public.attachments (
    id, target_type, target_id, created_by, storage_owner_id,
    provider, storage_bucket, storage_path,
    name, mime_type, size_bytes, availability
  ) VALUES (
    v_attachment_id, p_target_type, p_target_id, p_owner_id, p_owner_id,
    'supabase', p_bucket_id, v_path,
    p_original_name, p_mime_type, p_size_bytes, 'pending_upload'
  );

  INSERT INTO public.upload_reservations (
    id, owner_id, attachment_id, bucket_id, path,
    reserved_bytes, max_bytes, status, expires_at
  ) VALUES (
    v_res_id, p_owner_id, v_attachment_id, p_bucket_id, v_path,
    p_size_bytes, p_size_bytes, 'active', v_expires_at
  );

  UPDATE public.storage_usage
  SET reserved_bytes = reserved_bytes + p_size_bytes,
      updated_at     = pg_catalog.now()
  WHERE storage_owner_id = p_owner_id;

  RETURN QUERY SELECT
    v_res_id,
    v_attachment_id,
    p_bucket_id,
    v_path,
    p_size_bytes,
    v_expires_at,
    GREATEST(0, v_plan.quota_bytes - (v_usage.used_bytes + v_usage.reserved_bytes + p_size_bytes)),
    v_plan.plan_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_soft_delete_attachment(p_attachment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.attachments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_attachment_id IS NULL THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'invalid_id');
  END IF;

  SELECT *
  INTO v_att
  FROM public.attachments
  WHERE id = p_attachment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'not_found');
  END IF;

  IF v_att.storage_owner_id <> v_uid
     AND NOT public.can_edit_attachment_target(v_att.target_type, v_att.target_id, v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF v_att.deleted_at IS NULL THEN
    UPDATE public.attachments
    SET deleted_at = now(),
        availability = CASE
          WHEN provider = 'supabase' THEN 'pending_delete'
          ELSE 'unavailable'
        END,
        unavailable_reason = CASE
          WHEN provider = 'supabase' THEN NULL
          ELSE 'file_deleted'
        END,
        unavailable_since = CASE
          WHEN provider = 'supabase' THEN unavailable_since
          ELSE COALESCE(unavailable_since, now())
        END,
        updated_at = now()
    WHERE id = p_attachment_id;
  END IF;

  IF v_att.provider = 'supabase'
     AND v_att.storage_bucket IS NOT NULL
     AND v_att.storage_path IS NOT NULL THEN
    INSERT INTO public.storage_deletion_queue (
      attachment_id,
      bucket_id,
      path,
      size_bytes,
      owner_id,
      reason,
      status,
      idempotency_key
    )
    VALUES (
      v_att.id,
      v_att.storage_bucket,
      v_att.storage_path,
      COALESCE(v_att.size_bytes, 0),
      v_att.storage_owner_id,
      'user_deleted',
      'pending',
      'user_deleted:' || v_att.id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'already_deleted', (v_att.deleted_at IS NOT NULL),
    'attachment_id', p_attachment_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_google_integration(p_user_id uuid, p_google_sub text, p_google_email text, p_oauth_client_kind text, p_oauth_client_id text, p_refresh_token text, p_scopes text[], p_mark_account_changed boolean DEFAULT false)
 RETURNS TABLE(integration_id uuid, status text, account_switched boolean, recovered_attachments integer, affected_attachments integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_existing      public.user_integrations%ROWTYPE;
  v_secret_id     uuid;
  v_int_id        uuid;
  v_switched      boolean := false;
  v_recovered     integer := 0;
  v_affected      integer := 0;
  v_secret_name   text;
BEGIN
  IF p_user_id IS NULL OR p_google_sub IS NULL OR length(btrim(p_google_sub)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INTEGRATION_INPUT';
  END IF;

  SELECT *
    INTO v_existing
    FROM public.user_integrations ui
   WHERE ui.user_id = p_user_id
     AND ui.provider = 'google_drive'
   FOR UPDATE;

  IF FOUND THEN
    v_switched := (v_existing.google_sub <> p_google_sub);

    -- Si cambió la cuenta de Google, exige confirmación y nuevo refresh_token
    IF v_switched THEN
      IF p_refresh_token IS NULL OR length(btrim(p_refresh_token)) = 0 THEN
        RAISE EXCEPTION 'REFRESH_TOKEN_REQUIRED_ON_ACCOUNT_SWITCH';
      END IF;

      IF p_mark_account_changed THEN
        UPDATE public.attachments a
           SET availability       = 'unavailable',
               unavailable_reason = 'account_changed',
               unavailable_since  = COALESCE(a.unavailable_since, now()),
               updated_at         = now()
         WHERE a.integration_id = v_existing.id
           AND a.provider = 'google_drive'
           AND a.deleted_at IS NULL
           AND a.drive_account_sub <> p_google_sub
           AND a.availability <> 'unavailable';
        GET DIAGNOSTICS v_affected = ROW_COUNT;
      END IF;
    END IF;

    -- Gestión del secreto en Supabase Vault
    IF p_refresh_token IS NOT NULL AND length(btrim(p_refresh_token)) > 0 THEN
      IF v_existing.refresh_token_secret_id IS NOT NULL THEN
        PERFORM vault.update_secret(
          secret_id       := v_existing.refresh_token_secret_id,
          new_secret      := p_refresh_token,
          new_description := 'Google Drive refresh_token for user ' || p_user_id::text
        );
        v_secret_id := v_existing.refresh_token_secret_id;
      ELSE
        v_secret_name := 'gdrive_rt_' || p_user_id::text || '_' || replace(gen_random_uuid()::text, '-', '');
        v_secret_id := vault.create_secret(
          new_secret      := p_refresh_token,
          new_name        := v_secret_name,
          new_description := 'Google Drive refresh_token for user ' || p_user_id::text
        );
      END IF;
    ELSE
      -- Google omitió refresh_token: solo válido si conserva la misma cuenta y ya hay secreto guardado
      IF v_existing.refresh_token_secret_id IS NULL THEN
        RAISE EXCEPTION 'REFRESH_TOKEN_REQUIRED';
      END IF;
      v_secret_id := v_existing.refresh_token_secret_id;
    END IF;

    UPDATE public.user_integrations ui
       SET google_sub              = p_google_sub,
           google_email            = p_google_email,
           oauth_client_kind       = p_oauth_client_kind,
           oauth_client_id         = p_oauth_client_id,
           refresh_token_secret_id = v_secret_id,
           scopes                  = COALESCE(p_scopes, ARRAY['https://www.googleapis.com/auth/drive.file']),
           status                  = 'active',
           disconnect_requested    = false,
           last_error_code         = NULL,
           last_error_at           = NULL,
           connected_at            = CASE WHEN ui.status = 'disconnected' OR v_switched THEN now() ELSE ui.connected_at END,
           disconnected_at         = NULL,
           updated_at              = now()
     WHERE ui.id = v_existing.id
     RETURNING ui.id INTO v_int_id;

    -- Reconexión con la misma cuenta (§9.5 #3): rehabilita adjuntos marcados por desconexión/reauth
    IF NOT v_switched THEN
      UPDATE public.attachments a
         SET availability       = 'available',
             unavailable_reason = NULL,
             unavailable_since  = NULL,
             updated_at         = now()
       WHERE a.integration_id = v_int_id
         AND a.provider = 'google_drive'
         AND a.deleted_at IS NULL
         AND a.drive_account_sub = p_google_sub
         AND a.availability = 'unavailable'
         AND a.unavailable_reason IN ('drive_disconnected', 'needs_reauth', 'permission_revoked');
      GET DIAGNOSTICS v_recovered = ROW_COUNT;
    END IF;
  ELSE
    IF p_refresh_token IS NULL OR length(btrim(p_refresh_token)) = 0 THEN
      RAISE EXCEPTION 'REFRESH_TOKEN_REQUIRED';
    END IF;

    v_secret_name := 'gdrive_rt_' || p_user_id::text || '_' || replace(gen_random_uuid()::text, '-', '');
    v_secret_id := vault.create_secret(
      new_secret      := p_refresh_token,
      new_name        := v_secret_name,
      new_description := 'Google Drive refresh_token for user ' || p_user_id::text
    );

    INSERT INTO public.user_integrations (
      user_id, provider, google_sub, google_email,
      oauth_client_kind, oauth_client_id, refresh_token_secret_id,
      scopes, status
    ) VALUES (
      p_user_id, 'google_drive', p_google_sub, p_google_email,
      p_oauth_client_kind, p_oauth_client_id, v_secret_id,
      COALESCE(p_scopes, ARRAY['https://www.googleapis.com/auth/drive.file']), 'active'
    )
    RETURNING id INTO v_int_id;
  END IF;

  RETURN QUERY SELECT v_int_id, 'active'::text, v_switched, v_recovered, v_affected;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_guest_permission(p_target_type text, p_target_id text, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF p_role NOT IN ('editor', 'viewer') THEN
        RAISE EXCEPTION 'Rol no valido';
    END IF;

    -- Actualizar invitaciones de este recurso
    UPDATE public.share_invitations
    SET role = p_role
    WHERE target_type = p_target_type
      AND target_id = p_target_id
      AND owner_id = v_user_id;

    -- Actualizar a todos los colaboradores miembros del recurso
    UPDATE public.collaborations
    SET role = p_role
    WHERE target_type = p_target_type
      AND target_id = p_target_id
      AND member_id <> v_user_id
      AND (
          owner_id = v_user_id
          OR EXISTS (
              SELECT 1 FROM public.notes n
              WHERE n.id::text = p_target_id
                AND n.user_id::text = v_user_id::text
          )
          OR EXISTS (
              SELECT 1 FROM public.reminders r
              WHERE r.id::text = p_target_id
                AND r.user_id::text = v_user_id::text
          )
          OR EXISTS (
              SELECT 1 FROM public.folders f
              WHERE f.id::text = p_target_id
                AND f.user_id::text = v_user_id::text
          )
          OR EXISTS (
              SELECT 1 FROM public.events e
              WHERE e.id::text = p_target_id
                AND e.user_id::text = v_user_id::text
          )
      );

    RETURN jsonb_build_object('success', true, 'role', p_role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_collaboration_role(p_collaboration_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID;
    v_updated RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF p_role NOT IN ('editor', 'viewer') THEN
        RAISE EXCEPTION 'Rol no valido';
    END IF;

    UPDATE public.collaborations
    SET role = p_role
    WHERE id = p_collaboration_id
      AND (
          owner_id = v_user_id
          OR EXISTS (
              SELECT 1 FROM public.notes n
              WHERE collaborations.target_type = 'note'
                AND n.id::text = collaborations.target_id::text
                AND n.user_id::text = v_user_id::text
          )
          OR EXISTS (
              SELECT 1 FROM public.reminders r
              WHERE collaborations.target_type = 'reminder'
                AND r.id::text = collaborations.target_id::text
                AND r.user_id::text = v_user_id::text
          )
          OR EXISTS (
              SELECT 1 FROM public.folders f
              WHERE collaborations.target_type = 'folder'
                AND f.id::text = collaborations.target_id::text
                AND f.user_id::text = v_user_id::text
          )
          OR EXISTS (
              SELECT 1 FROM public.events e
              WHERE collaborations.target_type = 'event'
                AND e.id::text = collaborations.target_id::text
                AND e.user_id::text = v_user_id::text
          )
      )
    RETURNING id, target_type, target_id, member_id, role INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Colaboracion no encontrada o no tienes permisos de propietario';
    END IF;

    RETURN jsonb_build_object(
        'id', v_updated.id,
        'target_type', v_updated.target_type,
        'target_id', v_updated.target_id,
        'member_id', v_updated.member_id,
        'role', v_updated.role
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_collaboration_role_by_member(p_target_type text, p_target_id text, p_member_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID;
    v_updated RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF p_role NOT IN ('editor', 'viewer') THEN
        RAISE EXCEPTION 'Rol no valido';
    END IF;

    UPDATE public.collaborations
    SET role = p_role
    WHERE target_type = p_target_type
      AND target_id = p_target_id
      AND member_id = p_member_id
      AND (
          owner_id = v_user_id
          OR EXISTS (
              SELECT 1 FROM public.notes n
              WHERE n.id::text = p_target_id
                AND n.user_id::text = v_user_id::text
          )
          OR EXISTS (
              SELECT 1 FROM public.reminders r
              WHERE r.id::text = p_target_id
                AND r.user_id::text = v_user_id::text
          )
          OR EXISTS (
              SELECT 1 FROM public.folders f
              WHERE f.id::text = p_target_id
                AND f.user_id::text = v_user_id::text
          )
          OR EXISTS (
              SELECT 1 FROM public.events e
              WHERE e.id::text = p_target_id
                AND e.user_id::text = v_user_id::text
          )
      )
    RETURNING id, target_type, target_id, member_id, role INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Colaboracion no encontrada o no tienes permisos de propietario';
    END IF;

    RETURN jsonb_build_object(
        'id', v_updated.id,
        'target_type', v_updated.target_type,
        'target_id', v_updated.target_id,
        'member_id', v_updated.member_id,
        'role', v_updated.role
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_web_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.upsert_yjs_activity(p_note_id text, p_session_bucket_ms bigint, p_increment integer, p_last_snippet text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
    IF NOT public.is_note_editor(p_note_id) THEN RAISE EXCEPTION 'not editor'; END IF;
    
    INSERT INTO public.note_yjs_activity (note_id, user_id, session_bucket_ms, started_at, ended_at, edit_count, last_snippet)
    VALUES (p_note_id, v_uid, p_session_bucket_ms, now(), now(), p_increment, p_last_snippet)
    ON CONFLICT (note_id, user_id, session_bucket_ms) DO UPDATE SET
        ended_at = now(),
        edit_count = public.note_yjs_activity.edit_count + EXCLUDED.edit_count,
        last_snippet = EXCLUDED.last_snippet;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_yjs_activity(p_note_id text, p_session_bucket_ms bigint, p_increment integer, p_snippets jsonb DEFAULT '[]'::jsonb, p_last_snippet text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
    IF NOT public.is_note_editor(p_note_id) THEN RAISE EXCEPTION 'not editor'; END IF;
    
    INSERT INTO public.note_yjs_activity (note_id, user_id, session_bucket_ms, started_at, ended_at, edit_count, snippets, last_snippet)
    VALUES (p_note_id, v_uid, p_session_bucket_ms, now(), now(), p_increment, p_snippets, p_last_snippet)
    ON CONFLICT (note_id, user_id, session_bucket_ms) DO UPDATE SET
        ended_at = now(),
        edit_count = public.note_yjs_activity.edit_count + EXCLUDED.edit_count,
        snippets = EXCLUDED.snippets,
        last_snippet = COALESCE(EXCLUDED.last_snippet, public.note_yjs_activity.last_snippet);
END;
$function$;

-- 5. CUSTOM TRIGGERS
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
DROP TRIGGER IF EXISTS trg_protect_note_yjs_content ON public.notes;
CREATE TRIGGER trg_protect_note_yjs_content BEFORE INSERT OR UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION protect_note_yjs_content();
DROP TRIGGER IF EXISTS trg_owner_premium ON public.profiles;
CREATE TRIGGER trg_owner_premium BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_owner_premium_status();
DROP TRIGGER IF EXISTS trg_notify_reminder_state_change ON public.reminders;
CREATE TRIGGER trg_notify_reminder_state_change AFTER UPDATE ON public.reminders FOR EACH ROW WHEN (((new.status IS DISTINCT FROM old.status) OR (new.deleted IS DISTINCT FROM old.deleted) OR (new.snooze_until_ms IS DISTINCT FROM old.snooze_until_ms))) EXECUTE FUNCTION fn_notify_reminder_state_change();

-- 6. RLS POLICIES (public, storage, realtime, auth, vault)
DROP POLICY IF EXISTS "attachments_select_authorized" ON public.attachments;
CREATE POLICY "attachments_select_authorized" ON public.attachments AS PERMISSIVE FOR SELECT TO authenticated USING (((deleted_at IS NULL) AND (availability <> 'pending_upload'::text) AND ((storage_owner_id = ( SELECT auth.uid() AS uid)) OR can_read_attachment_target(target_type, target_id, ( SELECT auth.uid() AS uid)))));
DROP POLICY IF EXISTS "Actors can insert activity" ON public.collaboration_activity;
CREATE POLICY "Actors can insert activity" ON public.collaboration_activity AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((auth.uid())::text = (actor_id)::text));
DROP POLICY IF EXISTS "Collaborators can read activity" ON public.collaboration_activity;
CREATE POLICY "Collaborators can read activity" ON public.collaboration_activity AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((auth.uid())::text = (actor_id)::text) OR is_target_collaborator(target_type, target_id, (auth.uid())::text)));
DROP POLICY IF EXISTS "Members and owners can view collaborations" ON public.collaborations;
CREATE POLICY "Members and owners can view collaborations" ON public.collaborations AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((auth.uid())::text = (owner_id)::text) OR ((auth.uid())::text = (member_id)::text) OR ((COALESCE(is_public_members, true) = true) AND is_target_collaborator(target_type, target_id, (auth.uid())::text))));
DROP POLICY IF EXISTS "Owner can insert collaborations" ON public.collaborations;
CREATE POLICY "Owner can insert collaborations" ON public.collaborations AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((auth.uid())::text = (owner_id)::text));
DROP POLICY IF EXISTS "Owner can update collaborations" ON public.collaborations;
CREATE POLICY "Owner can update collaborations" ON public.collaborations AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((auth.uid())::text = (owner_id)::text) OR (EXISTS ( SELECT 1
   FROM notes n
  WHERE ((collaborations.target_type = 'note'::text) AND (n.id = collaborations.target_id) AND ((n.user_id)::text = (auth.uid())::text)))))) WITH CHECK ((((auth.uid())::text = (owner_id)::text) OR (EXISTS ( SELECT 1
   FROM notes n
  WHERE ((collaborations.target_type = 'note'::text) AND (n.id = collaborations.target_id) AND ((n.user_id)::text = (auth.uid())::text))))));
DROP POLICY IF EXISTS "Owner or member can delete collaboration" ON public.collaborations;
CREATE POLICY "Owner or member can delete collaboration" ON public.collaborations AS PERMISSIVE FOR DELETE TO PUBLIC USING ((((auth.uid())::text = (owner_id)::text) OR ((auth.uid())::text = (member_id)::text)));
DROP POLICY IF EXISTS "Users can insert own compliance" ON public.compliance_events;
CREATE POLICY "Users can insert own compliance" ON public.compliance_events AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can select own compliance" ON public.compliance_events;
CREATE POLICY "Users can select own compliance" ON public.compliance_events AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can read own event deliveries" ON public.event_notification_deliveries;
CREATE POLICY "Users can read own event deliveries" ON public.event_notification_deliveries AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can delete own events" ON public.events;
CREATE POLICY "Users can delete own events" ON public.events AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert own events" ON public.events;
CREATE POLICY "Users can insert own events" ON public.events AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can select own or shared events" ON public.events;
CREATE POLICY "Users can select own or shared events" ON public.events AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((auth.uid())::text = (user_id)::text) OR (EXISTS ( SELECT 1
   FROM collaborations c
  WHERE ((c.target_type = 'event'::text) AND (c.target_id = events.id) AND ((c.member_id)::text = (auth.uid())::text))))));
DROP POLICY IF EXISTS "Users can update own or shared events" ON public.events;
CREATE POLICY "Users can update own or shared events" ON public.events AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((auth.uid())::text = (user_id)::text) OR (EXISTS ( SELECT 1
   FROM collaborations c
  WHERE ((c.target_type = 'event'::text) AND (c.target_id = events.id) AND ((c.member_id)::text = (auth.uid())::text) AND (c.role = 'editor'::text))))));
DROP POLICY IF EXISTS "Users can delete own folders" ON public.folders;
CREATE POLICY "Users can delete own folders" ON public.folders AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert own folders" ON public.folders;
CREATE POLICY "Users can insert own folders" ON public.folders AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can select own or shared folders" ON public.folders;
CREATE POLICY "Users can select own or shared folders" ON public.folders AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((auth.uid())::text = (user_id)::text) OR (EXISTS ( SELECT 1
   FROM collaborations c
  WHERE ((c.target_type = 'folder'::text) AND (c.target_id = folders.id) AND ((c.member_id)::text = (auth.uid())::text))))));
DROP POLICY IF EXISTS "Users can update own or shared folders" ON public.folders;
CREATE POLICY "Users can update own or shared folders" ON public.folders AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((auth.uid())::text = (user_id)::text) OR (EXISTS ( SELECT 1
   FROM collaborations c
  WHERE ((c.target_type = 'folder'::text) AND (c.target_id = folders.id) AND ((c.member_id)::text = (auth.uid())::text) AND (c.role = 'editor'::text))))));
DROP POLICY IF EXISTS "Users manage own item_tags" ON public.item_tags;
CREATE POLICY "Users manage own item_tags" ON public.item_tags AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can manage their own templates" ON public.note_templates;
CREATE POLICY "Users can manage their own templates" ON public.note_templates AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "activity_insert" ON public.note_yjs_activity;
CREATE POLICY "activity_insert" ON public.note_yjs_activity AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_note_editor(note_id) AND (user_id = auth.uid())));
DROP POLICY IF EXISTS "activity_select" ON public.note_yjs_activity;
CREATE POLICY "activity_select" ON public.note_yjs_activity AS PERMISSIVE FOR SELECT TO authenticated USING (is_note_reader(note_id));
DROP POLICY IF EXISTS "activity_update" ON public.note_yjs_activity;
CREATE POLICY "activity_update" ON public.note_yjs_activity AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "note_yjs_snapshots_select" ON public.note_yjs_snapshots;
CREATE POLICY "note_yjs_snapshots_select" ON public.note_yjs_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING (is_note_reader(note_id));
DROP POLICY IF EXISTS "note_yjs_updates_select" ON public.note_yjs_updates;
CREATE POLICY "note_yjs_updates_select" ON public.note_yjs_updates AS PERMISSIVE FOR SELECT TO authenticated USING (is_note_reader(note_id));
DROP POLICY IF EXISTS "Users can delete own notes" ON public.notes;
CREATE POLICY "Users can delete own notes" ON public.notes AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert own notes" ON public.notes;
CREATE POLICY "Users can insert own notes" ON public.notes AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can select own or shared notes" ON public.notes;
CREATE POLICY "Users can select own or shared notes" ON public.notes AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((auth.uid())::text = (user_id)::text) OR (EXISTS ( SELECT 1
   FROM collaborations c
  WHERE ((((c.target_type = 'note'::text) AND (c.target_id = notes.id)) OR ((c.target_type = 'folder'::text) AND (notes.folder_id IS NOT NULL) AND (c.target_id = notes.folder_id))) AND ((c.member_id)::text = (auth.uid())::text))))));
DROP POLICY IF EXISTS "Users can update own or shared notes" ON public.notes;
CREATE POLICY "Users can update own or shared notes" ON public.notes AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((auth.uid())::text = (user_id)::text) OR (EXISTS ( SELECT 1
   FROM collaborations c
  WHERE ((((c.target_type = 'note'::text) AND (c.target_id = notes.id)) OR ((c.target_type = 'folder'::text) AND (notes.folder_id IS NOT NULL) AND (c.target_id = notes.folder_id))) AND ((c.member_id)::text = (auth.uid())::text) AND (c.role = 'editor'::text))))));
DROP POLICY IF EXISTS "Service and users can read deliveries" ON public.notification_deliveries;
CREATE POLICY "Service and users can read deliveries" ON public.notification_deliveries AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = id));
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = id));
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = id));
DROP POLICY IF EXISTS "Users can manage own push tokens" ON public.push_tokens;
CREATE POLICY "Users can manage own push tokens" ON public.push_tokens AS PERMISSIVE FOR ALL TO PUBLIC USING (((auth.uid())::text = (user_id)::text)) WITH CHECK (((auth.uid())::text = (user_id)::text));
DROP POLICY IF EXISTS "Users can delete own reminders" ON public.reminders;
CREATE POLICY "Users can delete own reminders" ON public.reminders AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert own reminders" ON public.reminders;
CREATE POLICY "Users can insert own reminders" ON public.reminders AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can select own or shared reminders" ON public.reminders;
CREATE POLICY "Users can select own or shared reminders" ON public.reminders AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((auth.uid())::text = (user_id)::text) OR (EXISTS ( SELECT 1
   FROM collaborations c
  WHERE ((c.target_type = 'reminder'::text) AND (c.target_id = reminders.id) AND ((c.member_id)::text = (auth.uid())::text))))));
DROP POLICY IF EXISTS "Users can update own or shared reminders" ON public.reminders;
CREATE POLICY "Users can update own or shared reminders" ON public.reminders AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((auth.uid())::text = (user_id)::text) OR (EXISTS ( SELECT 1
   FROM collaborations c
  WHERE ((c.target_type = 'reminder'::text) AND (c.target_id = reminders.id) AND ((c.member_id)::text = (auth.uid())::text) AND (c.role = 'editor'::text))))));
DROP POLICY IF EXISTS "Anyone can view valid invitations" ON public.share_invitations;
CREATE POLICY "Anyone can view valid invitations" ON public.share_invitations AS PERMISSIVE FOR SELECT TO PUBLIC USING (((status = 'pending'::text) AND (expires_at > now())));
DROP POLICY IF EXISTS "Owner can manage own invitations" ON public.share_invitations;
CREATE POLICY "Owner can manage own invitations" ON public.share_invitations AS PERMISSIVE FOR ALL TO PUBLIC USING (((auth.uid())::text = (owner_id)::text)) WITH CHECK (((auth.uid())::text = (owner_id)::text));
DROP POLICY IF EXISTS "storage_plans_select_authenticated" ON public.storage_plans;
CREATE POLICY "storage_plans_select_authenticated" ON public.storage_plans AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "storage_usage_select_own" ON public.storage_usage;
CREATE POLICY "storage_usage_select_own" ON public.storage_usage AS PERMISSIVE FOR SELECT TO authenticated USING ((storage_owner_id = ( SELECT auth.uid() AS uid)));
DROP POLICY IF EXISTS "Users manage own tags" ON public.tags;
CREATE POLICY "Users manage own tags" ON public.tags AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "upload_reservations_select_own" ON public.upload_reservations;
CREATE POLICY "upload_reservations_select_own" ON public.upload_reservations AS PERMISSIVE FOR SELECT TO authenticated USING ((owner_id = ( SELECT auth.uid() AS uid)));
DROP POLICY IF EXISTS "Users can delete their own web push subscriptions" ON public.web_push_subscriptions;
CREATE POLICY "Users can delete their own web push subscriptions" ON public.web_push_subscriptions AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert their own web push subscriptions" ON public.web_push_subscriptions;
CREATE POLICY "Users can insert their own web push subscriptions" ON public.web_push_subscriptions AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can update their own web push subscriptions" ON public.web_push_subscriptions;
CREATE POLICY "Users can update their own web push subscriptions" ON public.web_push_subscriptions AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can view their own web push subscriptions" ON public.web_push_subscriptions;
CREATE POLICY "Users can view their own web push subscriptions" ON public.web_push_subscriptions AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Allow all insert to yjs_diagnostics" ON public.yjs_diagnostics;
CREATE POLICY "Allow all insert to yjs_diagnostics" ON public.yjs_diagnostics AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all select to yjs_diagnostics" ON public.yjs_diagnostics;
CREATE POLICY "Allow all select to yjs_diagnostics" ON public.yjs_diagnostics AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "realtime_broadcast_note_live_cursor" ON realtime.messages;
CREATE POLICY "realtime_broadcast_note_live_cursor" ON realtime.messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((extension = 'broadcast'::text) AND (( SELECT realtime.topic() AS topic) ~ '^note_live_cursor_[A-Za-z0-9_-]+$'::text) AND is_note_reader("substring"(( SELECT realtime.topic() AS topic), '^note_live_cursor_(.+)$'::text))));
DROP POLICY IF EXISTS "realtime_broadcast_note_live_edit" ON realtime.messages;
CREATE POLICY "realtime_broadcast_note_live_edit" ON realtime.messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((extension = 'broadcast'::text) AND (( SELECT realtime.topic() AS topic) ~ '^note_live_edit_[A-Za-z0-9_-]+$'::text) AND is_note_editor("substring"(( SELECT realtime.topic() AS topic), '^note_live_edit_(.+)$'::text))));
DROP POLICY IF EXISTS "realtime_broadcast_note_yjs" ON realtime.messages;
CREATE POLICY "realtime_broadcast_note_yjs" ON realtime.messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((extension = 'broadcast'::text) AND (( SELECT realtime.topic() AS topic) ~ '^note_yjs_[A-Za-z0-9_-]+$'::text) AND is_note_editor("substring"(( SELECT realtime.topic() AS topic), '^note_yjs_(.+)$'::text))));
DROP POLICY IF EXISTS "realtime_listen_note_live_cursor" ON realtime.messages;
CREATE POLICY "realtime_listen_note_live_cursor" ON realtime.messages AS PERMISSIVE FOR SELECT TO authenticated USING (((extension = ANY (ARRAY['broadcast'::text, 'presence'::text])) AND (( SELECT realtime.topic() AS topic) ~ '^note_live_cursor_[A-Za-z0-9_-]+$'::text) AND is_note_reader("substring"(( SELECT realtime.topic() AS topic), '^note_live_cursor_(.+)$'::text))));
DROP POLICY IF EXISTS "realtime_listen_note_live_edit" ON realtime.messages;
CREATE POLICY "realtime_listen_note_live_edit" ON realtime.messages AS PERMISSIVE FOR SELECT TO authenticated USING (((extension = ANY (ARRAY['broadcast'::text, 'presence'::text])) AND (( SELECT realtime.topic() AS topic) ~ '^note_live_edit_[A-Za-z0-9_-]+$'::text) AND is_note_reader("substring"(( SELECT realtime.topic() AS topic), '^note_live_edit_(.+)$'::text))));
DROP POLICY IF EXISTS "realtime_listen_note_yjs" ON realtime.messages;
CREATE POLICY "realtime_listen_note_yjs" ON realtime.messages AS PERMISSIVE FOR SELECT TO authenticated USING (((extension = ANY (ARRAY['broadcast'::text, 'presence'::text])) AND (( SELECT realtime.topic() AS topic) ~ '^note_yjs_[A-Za-z0-9_-]+$'::text) AND is_note_reader("substring"(( SELECT realtime.topic() AS topic), '^note_yjs_(.+)$'::text))));
DROP POLICY IF EXISTS "realtime_presence_note_yjs" ON realtime.messages;
CREATE POLICY "realtime_presence_note_yjs" ON realtime.messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((extension = 'presence'::text) AND (( SELECT realtime.topic() AS topic) ~ '^note_yjs_[A-Za-z0-9_-]+$'::text) AND is_note_reader("substring"(( SELECT realtime.topic() AS topic), '^note_yjs_(.+)$'::text))));
DROP POLICY IF EXISTS "Users can delete own attachments" ON storage.objects;
CREATE POLICY "Users can delete own attachments" ON storage.objects AS PERMISSIVE FOR DELETE TO PUBLIC USING (((bucket_id = 'attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Users can read own attachments" ON storage.objects;
CREATE POLICY "Users can read own attachments" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING (((bucket_id = 'attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Users can update own attachments" ON storage.objects;
CREATE POLICY "Users can update own attachments" ON storage.objects AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((bucket_id = 'attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))) WITH CHECK (((bucket_id = 'attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "Users can upload own attachments" ON storage.objects;
CREATE POLICY "Users can upload own attachments" ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = 'attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
DROP POLICY IF EXISTS "veyra_attachments_insert_with_reservation" ON storage.objects;
CREATE POLICY "veyra_attachments_insert_with_reservation" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'veyra-attachments'::text) AND has_active_upload_reservation(bucket_id, name)));

-- 7. STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('attachments', 'attachments', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('veyra-attachments', 'veyra-attachments', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'video/mp4', 'video/webm', 'application/zip']::text[]) ON CONFLICT (id) DO NOTHING;
