-- ==============================================================================
-- VEYRA - Modulo de Colaboracion y Recursos Compartidos (Fase 0)
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de tu proyecto de Supabase.
-- Crea las tablas de invitaciones, membresías colaborativas, tokens push,
-- historial de actividad, y actualiza las políticas RLS con type-casts explícitos
-- (::text) para total compatibilidad sin importar si tus columnas son TEXT o UUID.
-- ==============================================================================

-- 1. TABLA: push_tokens (Registro seguro de tokens para notificaciones push)
CREATE TABLE IF NOT EXISTS public.push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL, -- 'android' | 'ios' | 'web'
    device_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_tokens' AND policyname = 'Users can manage own push tokens') THEN
        CREATE POLICY "Users can manage own push tokens" ON public.push_tokens
            FOR ALL USING (auth.uid()::text = user_id::text) WITH CHECK (auth.uid()::text = user_id::text);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id);


-- 2. TABLA: share_invitations (Enlaces e invitaciones temporales)
CREATE TABLE IF NOT EXISTS public.share_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code TEXT UNIQUE NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 12),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('folder', 'reminder', 'note', 'event')),
    target_id TEXT NOT NULL,
    target_name TEXT,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor')),
    is_public_members BOOLEAN DEFAULT true,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

ALTER TABLE public.share_invitations ADD COLUMN IF NOT EXISTS is_public_members BOOLEAN DEFAULT true;

ALTER TABLE public.share_invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'share_invitations' AND policyname = 'Owner can manage own invitations') THEN
        CREATE POLICY "Owner can manage own invitations" ON public.share_invitations
            FOR ALL USING (auth.uid()::text = owner_id::text) WITH CHECK (auth.uid()::text = owner_id::text);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'share_invitations' AND policyname = 'Authenticated users can view valid invitations') THEN
        CREATE POLICY "Authenticated users can view valid invitations" ON public.share_invitations
            FOR SELECT USING (
                auth.role() = 'authenticated' 
                AND status = 'pending' 
                AND expires_at > NOW()
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_share_invitations_code ON public.share_invitations(invite_code);
CREATE INDEX IF NOT EXISTS idx_share_invitations_target ON public.share_invitations(target_type, target_id);


-- 2.1 FUNCIÓN AUXILIAR DE SEGURIDAD (Evita recursión infinita en políticas RLS)
CREATE OR REPLACE FUNCTION public.is_target_collaborator(
    p_target_type text,
    p_target_id text,
    p_user_id text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.collaborations
        WHERE target_type = p_target_type
          AND target_id::text = p_target_id
          AND (owner_id::text = p_user_id OR member_id::text = p_user_id)
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_target_collaborator(text, text, text) TO authenticated;


-- 3. TABLA: collaborations (Membresías activas de colaboración)
CREATE TABLE IF NOT EXISTS public.collaborations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('folder', 'reminder', 'note', 'event')),
    target_id TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor')),
    is_public_members BOOLEAN DEFAULT true,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(target_type, target_id, member_id)
);

ALTER TABLE public.collaborations ADD COLUMN IF NOT EXISTS is_public_members BOOLEAN DEFAULT true;

ALTER TABLE public.collaborations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Members and owners can view collaborations" ON public.collaborations;
    CREATE POLICY "Members and owners can view collaborations" ON public.collaborations
        FOR SELECT USING (
            auth.uid()::text = owner_id::text 
            OR auth.uid()::text = member_id::text
            OR (
                COALESCE(is_public_members, true) = true
                AND public.is_target_collaborator(target_type, target_id, auth.uid()::text)
            )
        );

    DROP POLICY IF EXISTS "Owner can insert or update collaborations" ON public.collaborations;
    DROP POLICY IF EXISTS "Owner can insert collaborations" ON public.collaborations;
    CREATE POLICY "Owner can insert collaborations" ON public.collaborations
        FOR INSERT WITH CHECK (auth.uid()::text = owner_id::text);

    DROP POLICY IF EXISTS "Owner can update collaborations" ON public.collaborations;
    CREATE POLICY "Owner can update collaborations" ON public.collaborations
        FOR UPDATE USING (auth.uid()::text = owner_id::text);

    DROP POLICY IF EXISTS "Owner or member can delete collaboration" ON public.collaborations;
    CREATE POLICY "Owner or member can delete collaboration" ON public.collaborations
        FOR DELETE USING (auth.uid()::text = owner_id::text OR auth.uid()::text = member_id::text);
END $$;

CREATE INDEX IF NOT EXISTS idx_collab_member ON public.collaborations(member_id, target_type);
CREATE INDEX IF NOT EXISTS idx_collab_target ON public.collaborations(target_type, target_id);


-- 4. TABLA: collaboration_activity (Historial de cambios y auditoría en tiempo real)
CREATE TABLE IF NOT EXISTS public.collaboration_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('folder', 'reminder', 'note', 'event')),
    target_id TEXT NOT NULL,
    actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    actor_name TEXT,
    action TEXT NOT NULL CHECK (action IN ('completed', 'uncompleted', 'edited', 'added', 'deleted')),
    item_title TEXT,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.collaboration_activity ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE public.collaboration_activity ADD COLUMN IF NOT EXISTS item_title TEXT;

ALTER TABLE public.collaboration_activity ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'collaboration_activity' AND policyname = 'Actors can insert activity') THEN
        CREATE POLICY "Actors can insert activity" ON public.collaboration_activity
            FOR INSERT WITH CHECK (auth.uid()::text = actor_id::text);
    END IF;

    DROP POLICY IF EXISTS "Collaborators can read activity" ON public.collaboration_activity;
    CREATE POLICY "Collaborators can read activity" ON public.collaboration_activity
        FOR SELECT USING (
            auth.uid()::text = actor_id::text
            OR public.is_target_collaborator(target_type, target_id, auth.uid()::text)
        );
END $$;

CREATE INDEX IF NOT EXISTS idx_collab_act_target ON public.collaboration_activity(target_type, target_id, created_at DESC);


-- 5. ACTUALIZACION DE POLÍTICAS RLS EN TABLAS EXISTENTES
-- Con type-casts explícitos (::text) para evitar error 42883 entre text y uuid

-- 5.1 FOLDERS
DROP POLICY IF EXISTS "Users can select own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can select own or shared folders" ON public.folders;
CREATE POLICY "Users can select own or shared folders" ON public.folders
    FOR SELECT USING (
        auth.uid()::text = user_id::text
        OR EXISTS (
            SELECT 1 FROM public.collaborations c
            WHERE c.target_type = 'folder'
              AND c.target_id::text = folders.id::text
              AND c.member_id::text = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Users can update own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can update own or shared folders" ON public.folders;
CREATE POLICY "Users can update own or shared folders" ON public.folders
    FOR UPDATE USING (
        auth.uid()::text = user_id::text
        OR EXISTS (
            SELECT 1 FROM public.collaborations c
            WHERE c.target_type = 'folder'
              AND c.target_id::text = folders.id::text
              AND c.member_id::text = auth.uid()::text
              AND c.role = 'editor'
        )
    );

-- 5.2 REMINDERS
DROP POLICY IF EXISTS "Users can select own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can select own or shared reminders" ON public.reminders;
CREATE POLICY "Users can select own or shared reminders" ON public.reminders
    FOR SELECT USING (
        auth.uid()::text = user_id::text
        OR EXISTS (
            SELECT 1 FROM public.collaborations c
            WHERE c.target_type = 'reminder'
              AND c.target_id::text = reminders.id::text
              AND c.member_id::text = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Users can update own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can update own or shared reminders" ON public.reminders;
CREATE POLICY "Users can update own or shared reminders" ON public.reminders
    FOR UPDATE USING (
        auth.uid()::text = user_id::text
        OR EXISTS (
            SELECT 1 FROM public.collaborations c
            WHERE c.target_type = 'reminder'
              AND c.target_id::text = reminders.id::text
              AND c.member_id::text = auth.uid()::text
              AND c.role = 'editor'
        )
    );

-- 5.3 NOTES
DROP POLICY IF EXISTS "Users can select own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can select own or shared notes" ON public.notes;
CREATE POLICY "Users can select own or shared notes" ON public.notes
    FOR SELECT USING (
        auth.uid()::text = user_id::text
        OR EXISTS (
            SELECT 1 FROM public.collaborations c
            WHERE (
                (c.target_type = 'note' AND c.target_id::text = notes.id::text)
                OR (c.target_type = 'folder' AND notes.folder_id IS NOT NULL AND c.target_id::text = notes.folder_id::text)
            )
            AND c.member_id::text = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Users can update own notes" ON public.notes;
DROP POLICY IF EXISTS "Users can update own shared notes" ON public.notes;
DROP POLICY IF EXISTS "Users can update own or shared notes" ON public.notes;
CREATE POLICY "Users can update own or shared notes" ON public.notes
    FOR UPDATE USING (
        auth.uid()::text = user_id::text
        OR EXISTS (
            SELECT 1 FROM public.collaborations c
            WHERE (
                (c.target_type = 'note' AND c.target_id::text = notes.id::text)
                OR (c.target_type = 'folder' AND notes.folder_id IS NOT NULL AND c.target_id::text = notes.folder_id::text)
            )
            AND c.member_id::text = auth.uid()::text
            AND c.role = 'editor'
        )
    );

-- 5.4 EVENTS
DROP POLICY IF EXISTS "Users can select own events" ON public.events;
DROP POLICY IF EXISTS "Users can select own or shared events" ON public.events;
CREATE POLICY "Users can select own or shared events" ON public.events
    FOR SELECT USING (
        auth.uid()::text = user_id::text
        OR EXISTS (
            SELECT 1 FROM public.collaborations c
            WHERE c.target_type = 'event'
              AND c.target_id::text = events.id::text
              AND c.member_id::text = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "Users can update own events" ON public.events;
DROP POLICY IF EXISTS "Users can update own or shared events" ON public.events;
CREATE POLICY "Users can update own or shared events" ON public.events
    FOR UPDATE USING (
        auth.uid()::text = user_id::text
        OR EXISTS (
            SELECT 1 FROM public.collaborations c
            WHERE c.target_type = 'event'
              AND c.target_id::text = events.id::text
              AND c.member_id::text = auth.uid()::text
              AND c.role = 'editor'
        )
    );


-- 6. RPC: accept_share_invitation
-- Permite a un usuario autenticado canjear un código de invitación de manera atómica
CREATE OR REPLACE FUNCTION public.accept_share_invitation(p_invite_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_inv RECORD;
    v_collab_id UUID;
    v_user_profile RECORD;
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

    -- 3. Crear o actualizar colaboracion
    INSERT INTO public.collaborations (target_type, target_id, owner_id, member_id, role, is_public_members)
    VALUES (v_inv.target_type, v_inv.target_id, v_inv.owner_id, v_user_id, v_inv.role, COALESCE(v_inv.is_public_members, true))
    ON CONFLICT (target_type, target_id, member_id)
    DO UPDATE SET role = EXCLUDED.role, is_public_members = EXCLUDED.is_public_members
    RETURNING id INTO v_collab_id;

    -- 4. Registrar en actividad
    SELECT email INTO v_user_profile FROM auth.users WHERE id = v_user_id;

    INSERT INTO public.collaboration_activity (target_type, target_id, actor_id, actor_name, action, item_title)
    VALUES (
        v_inv.target_type,
        v_inv.target_id,
        v_user_id,
        COALESCE(v_user_profile.email, 'Usuario'),
        'added',
        v_inv.target_name
    );

    RETURN jsonb_build_object(
        'success', true,
        'collaboration_id', v_collab_id,
        'target_type', v_inv.target_type,
        'target_id', v_inv.target_id,
        'target_name', v_inv.target_name,
        'role', v_inv.role
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_share_invitation(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_share_invitation(TEXT) TO authenticated;

-- 7. Habilitar Supabase Realtime para sincronizacion instantanea en vivo
DO $$ 
DECLARE
    tbl text;
    tables text[] := ARRAY['reminders', 'notes', 'folders', 'events', 'collaborations', 'collaboration_activity'];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = tbl
        ) THEN
            BEGIN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
            EXCEPTION WHEN duplicate_object THEN
                -- Ya estaba registrada en la publicación
            END;
        END IF;
    END LOOP;
END $$;

-- 8. Migración para tags en eventos (soporte de categorías y widgets, ej: "clase")
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_events_tags ON public.events USING gin(tags);


