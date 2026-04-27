#!/usr/bin/env bash
# Run on the host where docker compose is used (e.g. server: /home/feline/laed-data).
# Verifies LiteLLM accepts LITELLM_MASTER_KEY and lists expected model IDs.
set -euo pipefail

COMPOSE_DIR="${1:-${COMPOSE_DIR:-$(pwd)}}"
cd "$COMPOSE_DIR"

if [ ! -f .env ] || [ ! -f docker-compose.yml ]; then
  echo "Usage: $0 [path-to-compose-dir]" >&2
  exit 1
fi

# shellcheck disable=SC2046
set -a
# shellcheck source=/dev/null
source .env
set +a

if [ -z "${LITELLM_MASTER_KEY:-}" ] || [[ "${LITELLM_MASTER_KEY}" != sk-* ]]; then
  echo "ERROR: LITELLM_MASTER_KEY must be set in .env and start with sk-" >&2
  exit 1
fi

echo "=== GET /v1/models ==="
code=$(curl -sS -o /tmp/laed-models-out.json -w "%{http_code}" "http://127.0.0.1:4000/v1/models" \
  -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" || true)
echo "HTTP $code"
head -c 2000 /tmp/laed-models-out.json
echo ""
if [ "$code" != "200" ]; then
  echo "ERROR: expected HTTP 200 from /v1/models" >&2
  exit 1
fi
echo ""

echo "=== POST /v1/chat/completions (minimal) ==="
code=$(curl -sS -o /tmp/laed-chat-out.json -w "%{http_code}" "http://127.0.0.1:4000/v1/chat/completions" \
  -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"laed-chat","messages":[{"role":"user","content":"Reply with exactly: OK"}]}' || true)
echo "HTTP $code"
head -c 2000 /tmp/laed-chat-out.json
echo ""
if [ "$code" != "200" ]; then
  echo "ERROR: expected HTTP 200 from /v1/chat/completions" >&2
  exit 1
fi
