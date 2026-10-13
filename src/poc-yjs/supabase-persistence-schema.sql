-- ==============================================================================
-- VEYRA - Persistencia Remota Duradera para Yjs + Tiptap (Fase 3 Propuesta)
-- ==============================================================================
-- Este esquema desacopla el transporte efímero (Realtime Broadcast)
-- de la persistencia duradera en base de datos.
-- 
-- EVITA el problema de "Last Write Wins": en lugar de sobrescribir el snapshot
-- completo de la nota, las modificaciones se registran como deltas incrementales
-- idempotentes en una tabla append-only (note_yjs_updates).
-- ==============================================================================

-- 1. TABLA: note_yjs_snapshots
-- Almacena el snapshot base compactado del documento Yjs por cada nota.
CREATE TABLE IF NOT EXISTS public.note_yjs_snapshots (
    note_id TEXT PRIMARY KEY,
    snapshot TEXT NOT NULL,          -- Delta binario completo codificado en Base64 (o BYTEA)
    state_vector TEXT NOT NULL,      -- StateVector de Yjs en Base64 para comprobación diferencial
    server_clock BIGINT DEFAULT 0,  -- ID máximo de note_yjs_updates consolidado en este snapshot
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA: note_yjs_updates
-- Registro secuencial (append-only) de deltas incrementales emitidos por los colaboradores.
CREATE TABLE IF NOT EXISTS public.note_yjs_updates (
    id BIGSERIAL PRIMARY KEY,
    note_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    update_data TEXT NOT NULL,       -- Delta incremental en Base64
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_note_yjs_updates_note_clock 
    ON public.note_yjs_updates(note_id, id);

-- 3. HABILITACIÓN DE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.note_yjs_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_yjs_updates ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS DE SEGURIDAD BASADAS EN COLABORACIÓN EXISTENTE

-- 4.1 Lectura de snapshots: Propietario o colaborador autorizado
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'note_yjs_snapshots' AND policyname = 'Collaborators can read note snapshots') THEN
        CREATE POLICY "Collaborators can read note snapshots" ON public.note_yjs_snapshots
            FOR SELECT USING (
                auth.role() = 'authenticated' AND (
                    -- Es propietario en la tabla notes
                    EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.user_id = auth.uid()::text)
                    OR
                    -- Es colaborador en la tabla collaborations
                    public.is_target_collaborator('note', note_id, auth.uid()::text)
                )
            );
    END IF;

    -- 4.2 Escritura de snapshots (Compactación): Solo propietarios o editores autorizados
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'note_yjs_snapshots' AND policyname = 'Editors can update note snapshots') THEN
        CREATE POLICY "Editors can update note snapshots" ON public.note_yjs_snapshots
            FOR ALL USING (
                auth.role() = 'authenticated' AND (
                    EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.user_id = auth.uid()::text)
                    OR
                    public.is_target_collaborator('note', note_id, auth.uid()::text)
                )
            ) WITH CHECK (
                auth.role() = 'authenticated' AND (
                    EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.user_id = auth.uid()::text)
                    OR
                    public.is_target_collaborator('note', note_id, auth.uid()::text)
                )
            );
    END IF;

    -- 4.3 Lectura de updates incrementales
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'note_yjs_updates' AND policyname = 'Collaborators can read note updates') THEN
        CREATE POLICY "Collaborators can read note updates" ON public.note_yjs_updates
            FOR SELECT USING (
                auth.role() = 'authenticated' AND (
                    EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.user_id = auth.uid()::text)
                    OR
                    public.is_target_collaborator('note', note_id, auth.uid()::text)
                )
            );
    END IF;

    -- 4.4 Inserción de deltas incrementales: Propietarios y editores con permiso de edición
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'note_yjs_updates' AND policyname = 'Editors can insert note updates') THEN
        CREATE POLICY "Editors can insert note updates" ON public.note_yjs_updates
            FOR INSERT WITH CHECK (
                auth.role() = 'authenticated' AND (
                    EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.user_id = auth.uid()::text)
                    OR
                    public.is_target_collaborator('note', note_id, auth.uid()::text)
                )
            );
    END IF;
END $$;
