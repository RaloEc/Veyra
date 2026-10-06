-- ==============================================================================
-- VEYRA - Supabase Complete Database Schema & Migrations
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de tu proyecto de Supabase para asegurar
-- que todas las tablas, columnas, índices y políticas de seguridad (RLS)
-- estén configuradas correctamente para la sincronización en la nube.
-- ==============================================================================

-- 1. TABLA: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    user_profile TEXT DEFAULT 'equilibrado',
    default_control_level TEXT DEFAULT 'normal',
    is_premium BOOLEAN DEFAULT FALSE,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asegurar columnas si ya existía la tabla
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_profile TEXT DEFAULT 'equilibrado';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_control_level TEXT DEFAULT 'normal';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view own profile') THEN
        CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile') THEN
        CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
        CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
    END IF;
END $$;


-- 2. TABLA: reminders
CREATE TABLE IF NOT EXISTS public.reminders (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date_ms BIGINT NOT NULL,
    snooze_until_ms BIGINT,
    repeat_rule TEXT,
    control_level TEXT DEFAULT 'normal',
    priority INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending',
    next_attempt_ms BIGINT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_modified_ms BIGINT NOT NULL,
    deleted INTEGER DEFAULT 0,
    deleted_at_ms BIGINT,
    notification_ids TEXT,
    attachments TEXT,
    links TEXT,
    subtasks TEXT
);

-- Columnas añadidas para compatibilidad total
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS subtasks TEXT;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS attachments TEXT;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS links TEXT;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS deleted INTEGER DEFAULT 0;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS deleted_at_ms BIGINT;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reminders' AND policyname = 'Users can select own reminders') THEN
        CREATE POLICY "Users can select own reminders" ON public.reminders FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reminders' AND policyname = 'Users can insert own reminders') THEN
        CREATE POLICY "Users can insert own reminders" ON public.reminders FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reminders' AND policyname = 'Users can update own reminders') THEN
        CREATE POLICY "Users can update own reminders" ON public.reminders FOR UPDATE USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reminders' AND policyname = 'Users can delete own reminders') THEN
        CREATE POLICY "Users can delete own reminders" ON public.reminders FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reminders_user_sync ON public.reminders (user_id, last_modified_ms);


-- 3. TABLA: folders
CREATE TABLE IF NOT EXISTS public.folders (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES public.folders(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'folder',
    color TEXT DEFAULT '#8B5CF6',
    is_pinned INTEGER DEFAULT 0,
    created_at_ms BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL,
    last_modified_ms BIGINT NOT NULL,
    deleted INTEGER DEFAULT 0
);

ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES public.folders(id) ON DELETE SET NULL;

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'Users can select own folders') THEN
        CREATE POLICY "Users can select own folders" ON public.folders FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'Users can insert own folders') THEN
        CREATE POLICY "Users can insert own folders" ON public.folders FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'Users can update own folders') THEN
        CREATE POLICY "Users can update own folders" ON public.folders FOR UPDATE USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'Users can delete own folders') THEN
        CREATE POLICY "Users can delete own folders" ON public.folders FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_folders_user_sync ON public.folders (user_id, last_modified_ms);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON public.folders (parent_id);


-- 4. TABLA: notes
CREATE TABLE IF NOT EXISTS public.notes (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    folder_id TEXT,
    event_id TEXT,
    title TEXT,
    content TEXT,
    created_at_ms BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL,
    is_pinned INTEGER DEFAULT 0,
    attachments TEXT,
    links TEXT,
    deleted INTEGER DEFAULT 0,
    last_modified_ms BIGINT NOT NULL
);

-- Asegurar columnas añadidas
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS created_at_ms BIGINT;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS updated_at_ms BIGINT;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS folder_id TEXT;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS attachments TEXT;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS links TEXT;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS deleted INTEGER DEFAULT 0;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS last_modified_ms BIGINT;

-- Backfill para preservar fechas originales de notas existentes en Supabase
UPDATE public.notes 
SET created_at_ms = CAST(EXTRACT(EPOCH FROM created_at) * 1000 AS BIGINT)
WHERE (created_at_ms IS NULL OR created_at_ms = 0) AND created_at IS NOT NULL;

UPDATE public.notes 
SET updated_at_ms = created_at_ms 
WHERE (updated_at_ms IS NULL OR updated_at_ms = 0) AND created_at_ms IS NOT NULL;

UPDATE public.notes 
SET last_modified_ms = COALESCE(updated_at_ms, created_at_ms) 
WHERE last_modified_ms IS NULL;

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Users can select own notes') THEN
        CREATE POLICY "Users can select own notes" ON public.notes FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Users can insert own notes') THEN
        CREATE POLICY "Users can insert own notes" ON public.notes FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Users can update own notes') THEN
        CREATE POLICY "Users can update own notes" ON public.notes FOR UPDATE USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Users can delete own notes') THEN
        CREATE POLICY "Users can delete own notes" ON public.notes FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notes_user_sync ON public.notes (user_id, last_modified_ms);


-- 5. TABLA: events
CREATE TABLE IF NOT EXISTS public.events (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_time_ms BIGINT NOT NULL,
    end_time_ms BIGINT NOT NULL,
    repeat_rule TEXT,
    location TEXT,
    color TEXT,
    notification_offset_min INTEGER DEFAULT 15,
    notification_offsets TEXT,
    notification_ids TEXT,
    note_id TEXT,
    created_at_ms BIGINT NOT NULL,
    updated_at_ms BIGINT NOT NULL,
    last_modified_ms BIGINT NOT NULL,
    deleted INTEGER DEFAULT 0
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Users can select own events') THEN
        CREATE POLICY "Users can select own events" ON public.events FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Users can insert own events') THEN
        CREATE POLICY "Users can insert own events" ON public.events FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Users can update own events') THEN
        CREATE POLICY "Users can update own events" ON public.events FOR UPDATE USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Users can delete own events') THEN
        CREATE POLICY "Users can delete own events" ON public.events FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_user_sync ON public.events (user_id, last_modified_ms);


-- 6. TABLA: compliance_events
CREATE TABLE IF NOT EXISTS public.compliance_events (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    reminder_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    timestamp_ms BIGINT NOT NULL,
    synced INTEGER DEFAULT 1
);

ALTER TABLE public.compliance_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'compliance_events' AND policyname = 'Users can select own compliance') THEN
        CREATE POLICY "Users can select own compliance" ON public.compliance_events FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'compliance_events' AND policyname = 'Users can insert own compliance') THEN
        CREATE POLICY "Users can insert own compliance" ON public.compliance_events FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;


-- 7. STORAGE BUCKET: attachments
-- Crear bucket público/privado para archivos adjuntos de notas y recordatorios
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can upload own attachments') THEN
        CREATE POLICY "Users can upload own attachments" ON storage.objects
        FOR INSERT WITH CHECK (
            bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[1]
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can read own attachments') THEN
        CREATE POLICY "Users can read own attachments" ON storage.objects
        FOR SELECT USING (
            bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[1]
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can delete own attachments') THEN
        CREATE POLICY "Users can delete own attachments" ON storage.objects
        FOR DELETE USING (
            bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[1]
        );
    END IF;
END $$;


-- 8. RPC FUNCTION: delete_user_account (Cumplimiento de borrado de cuenta en tiendas)
-- Permite a un usuario autenticado eliminar completamente su cuenta y todos sus datos en cascada.
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

