-- RECONSTRUIDO DESDE CATÁLOGO — NO ES EL SQL ORIGINAL
-- Version: 20261030201409 | Slug: fix_tags_rls_and_indexes
-- Fuente: supabase_migrations.schema_migrations / pg_policies / pg_proc / pg_trigger / pg_constraint el 2026-11-25
-- Para referencia futura. No re-aplicar a proyecto nuevo sin validar.

ALTER POLICY "Users manage own tags" ON tags
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER POLICY "Users manage own item_tags" ON item_tags
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tags_user_updated ON tags(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_item_tags_user ON item_tags(user_id);
