-- Migración Supabase: Organización transversal por hashtags y Eventos All-Day

-- 1. Nuevas columnas en tabla events
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_all_day BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS all_day_date TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_parent_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_birthday_like BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS category_id TEXT;

-- 2. Nuevas columnas en tabla reminders
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS offset_minutes INTEGER;

-- 3. Tabla tags
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, slug)
);

-- 4. Tabla item_tags
CREATE TABLE IF NOT EXISTS item_tags (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL, -- 'event' | 'reminder'
  item_id TEXT NOT NULL,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_type, item_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_item_tags_item ON item_tags(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_user ON item_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_slug ON tags(user_id, slug);
CREATE INDEX IF NOT EXISTS idx_tags_user_updated ON tags(user_id, updated_at);

-- 5. Habilitar RLS y políticas por usuario
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_tags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'Users manage own tags'
  ) THEN
    CREATE POLICY "Users manage own tags" ON tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  ELSE
    ALTER POLICY "Users manage own tags" ON tags USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'item_tags' AND policyname = 'Users manage own item_tags'
  ) THEN
    CREATE POLICY "Users manage own item_tags" ON item_tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  ELSE
    ALTER POLICY "Users manage own item_tags" ON item_tags USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

