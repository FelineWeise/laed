#!/usr/bin/env bash
# MANUAL FALLBACK — model pulling is handled by infra/laed-gpu/cloud-init.yaml.tftpl when using Terraform.
# Kept for manual model management.
set -euo pipefail

OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"

MODELS=(
    "qwen2.5:14b-instruct-q4_K_M"
    "nomic-embed-text"
)

echo "=== Pulling Models ==="
echo "Ollama host: $OLLAMA_HOST"

for model in "${MODELS[@]}"; do
    echo "Pulling $model..."
    curl -sf "$OLLAMA_HOST/api/pull" -d "{\"name\": \"$model\"}" | while read -r line; do
        status=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || true)
        [ -n "$status" ] && echo "  $model: $status"
    done
    echo "  $model: done"
done

echo ""
echo "=== Installed Models ==="
curl -sf "$OLLAMA_HOST/api/tags" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data.get('models', []):
    size_gb = m.get('size', 0) / 1e9
    print(f\"  {m['name']:40s} {size_gb:.1f} GB\")
"
