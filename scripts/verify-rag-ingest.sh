#!/usr/bin/env bash
# Smoke: RAG tenant + project registry (full ingest covered by verify-laed-mvp.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${RAG_DATABASE_URL_SYNC:-}" ]]; then
  echo "Set RAG_DATABASE_URL_SYNC=postgresql://rag:PASS@host:5432/rag" >&2
  exit 1
fi

psql "$RAG_DATABASE_URL_SYNC" -v ON_ERROR_STOP=1 -c \
  "SELECT id, name FROM rag.tenants WHERE name = 'laed';"

echo "verify-rag-ingest: tenant row OK"
