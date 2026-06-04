-- LAED: rag.chunks_nomic scope columns + metadata backfill.
-- Usage: psql "$RAG_DATABASE_URL" -f scripts/migrate_rag_chunk_scope_columns.sql

ALTER TABLE rag.chunks_nomic
    ADD COLUMN IF NOT EXISTS topic_node_id UUID,
    ADD COLUMN IF NOT EXISTS folder_id UUID,
    ADD COLUMN IF NOT EXISTS uploaded_by UUID,
    ADD COLUMN IF NOT EXISTS visibility_scope TEXT;

UPDATE rag.chunks_nomic
SET topic_node_id = (metadata->>'topic_node_id')::uuid
WHERE topic_node_id IS NULL
  AND metadata ? 'topic_node_id'
  AND metadata->>'topic_node_id' ~* '^[0-9a-f-]{36}$';

UPDATE rag.chunks_nomic
SET folder_id = (metadata->>'folder_id')::uuid
WHERE folder_id IS NULL
  AND metadata ? 'folder_id'
  AND metadata->>'folder_id' ~* '^[0-9a-f-]{36}$';

UPDATE rag.chunks_nomic
SET uploaded_by = (metadata->>'uploaded_by')::uuid
WHERE uploaded_by IS NULL
  AND metadata ? 'uploaded_by'
  AND metadata->>'uploaded_by' ~* '^[0-9a-f-]{36}$';

UPDATE rag.chunks_nomic
SET visibility_scope = COALESCE(NULLIF(metadata->>'visibility_scope', ''), 'project')
WHERE visibility_scope IS NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_nomic_topic_node
    ON rag.chunks_nomic (tenant_id, project_id, topic_node_id)
    WHERE topic_node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_nomic_folder
    ON rag.chunks_nomic (tenant_id, project_id, folder_id)
    WHERE folder_id IS NOT NULL;
