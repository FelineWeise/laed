#!/usr/bin/env bash
# Print embedding vector lengths from the shared LiteLLM gateway (GPU controller applies).
# Run from the LAED compose directory with stacks up: llm-gateway on llm-backbone, then laed.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env" >&2
  exit 1
fi
set -a
# shellcheck source=/dev/null
source .env
set +a

KEY="${LLM_GATEWAY_KEY:-${OPENAI_API_KEY:-}}"
if [ -z "$KEY" ]; then
  echo "Set LLM_GATEWAY_KEY or OPENAI_API_KEY in .env" >&2
  exit 1
fi

for model in "ollama/nomic-embed-text" "ollama/qwen3-embedding:8b"; do
  echo "=== $model ==="
  docker compose exec -T app python - <<PY
import json, os, urllib.request
base = os.environ["LLM_GATEWAY_URL"].rstrip("/")
key = os.environ.get("LLM_GATEWAY_KEY") or os.environ.get("OPENAI_API_KEY")
model = "${model}"
body = json.dumps({"model": model, "input": "dimension probe"}).encode()
req = urllib.request.Request(
    f"{base}/embeddings",
    data=body,
    method="POST",
    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=120) as resp:
    data = json.loads(resp.read().decode())
    emb = data["data"][0]["embedding"]
    print("dim", len(emb))
PY
done
