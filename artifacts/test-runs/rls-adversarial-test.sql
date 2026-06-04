-- Run against dedicated RAG database after migration.
-- Tenant A context:
BEGIN;
SET LOCAL app.current_tenant_id = '11111111-1111-1111-1111-111111111111';
SELECT COUNT(*) AS visible_rows_to_tenant_a
FROM rag.chunks_qwen3
WHERE tenant_id = '22222222-2222-2222-2222-222222222222';
ROLLBACK;

-- Expected result: 0 rows visible.
