#!/usr/bin/env bash
# Verifies LiteLLM on docker network `llm-backbone` from the LAED app container.
# Run from the LAED compose directory (requires `docker compose up` and llm-gateway running).
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

KEY="${LLM_GATEWAY_KEY:-${OPENAI_API_KEY:-}}"
if [ -z "$KEY" ]; then
  echo "ERROR: set LLM_GATEWAY_KEY or OPENAI_API_KEY in .env (same value as llm-gateway LITELLM_MASTER_KEY)" >&2
  exit 1
fi

MODEL="${LLM_MODEL:-ollama/qwen3:4b-instruct}"

echo "=== GET /v1/models (via app container → litellm) ==="
docker compose exec -T app sh -lc "wget -qO- \"http://litellm:4000/v1/models\" -H \"Authorization: Bearer ${KEY}\" | head -c 2000"
echo ""
echo ""

echo "=== POST /v1/chat/completions (${MODEL}) ==="
docker compose exec -T app python - <<PY
import json, os, urllib.request

base = os.environ["LLM_GATEWAY_URL"].rstrip("/")
key = os.environ.get("LLM_GATEWAY_KEY") or os.environ.get("OPENAI_API_KEY")
model = os.environ.get("LLM_MODEL", "ollama/qwen3:4b-instruct")
body = json.dumps(
    {"model": model, "messages": [{"role": "user", "content": "Reply with exactly: OK"}], "stream": False}
).encode()
req = urllib.request.Request(
    f"{base}/chat/completions",
    data=body,
    method="POST",
    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=600) as resp:
    data = json.loads(resp.read().decode())
    print(data["choices"][0]["message"]["content"][:500])
PY

EMBED_MODEL="${EMBEDDING_MODEL:-ollama/nomic-embed-text}"
echo "=== POST /v1/embeddings (${EMBED_MODEL}) ==="
docker compose exec -T app python - <<PY
import json, os, urllib.error, urllib.request

base = os.environ["LLM_GATEWAY_URL"].rstrip("/")
key = os.environ.get("LLM_GATEWAY_KEY") or os.environ.get("OPENAI_API_KEY")
model = os.environ.get("EMBEDDING_MODEL", "ollama/nomic-embed-text")
body = json.dumps({"model": model, "input": "embedding probe"}).encode()
req = urllib.request.Request(
    f"{base}/embeddings",
    data=body,
    method="POST",
    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
)
try:
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode())
        dim = len(data["data"][0]["embedding"])
        print(f"OK embedding_dim={dim}")
except urllib.error.HTTPError as e:
    print(f"FAIL HTTP {e.code}: {e.read().decode()[:500]}")
    raise SystemExit(1)
PY

echo ""
echo "verify-litellm-gateway.sh OK"
