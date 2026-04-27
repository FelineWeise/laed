#!/usr/bin/env bash
# OpenClaw + LiteLLM full reset (see plan: wipe state, align with single LiteLLM gateway).
# Prerequisite: compose directory must match the repo: docker-compose.yml, litellm-config.yaml, .env (git pull or rsync from laed).
# Run ON THE SERVER in the compose directory, after git pull or copying repo files:
#   chmod +x scripts/openclaw-litellm-reset.sh
#   TELEGRAM_ALLOW_TG_IDS=123456789 ./scripts/openclaw-litellm-reset.sh
#
# Optional env:
#   TELEGRAM_ALLOW_TG_IDS  e.g. "2076651696" (comma-separated numeric IDs, no tg: prefix)
#   SKIP_LITELLM_VERIFY=1  skip curl checks to litellm:4000
#   SKIP_BACKUP=1          skip tar backup of openclaw volume
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-$(pwd)}"
cd "$COMPOSE_DIR"

if [ ! -f docker-compose.yml ] || [ ! -f .env ]; then
  echo "Run this from your laed-data directory (docker-compose.yml + .env required)." >&2
  exit 1
fi

# shellcheck disable=SC2046
set -a
# shellcheck source=/dev/null
source .env
set +a

if [ -z "${LITELLM_MASTER_KEY:-}" ] || [[ "${LITELLM_MASTER_KEY}" != sk-* ]]; then
  echo "ERROR: .env LITELLM_MASTER_KEY must be set and start with sk-" >&2
  exit 1
fi

OPENCLAW_VOL="$(docker volume ls -q --filter name=openclaw_data | head -1 || true)"
if [ -z "$OPENCLAW_VOL" ]; then
  echo "ERROR: no docker volume matching *openclaw_data*; start stack once or check project name." >&2
  exit 1
fi

echo "=== Ensuring LiteLLM is up ==="
docker compose up -d litellm
sleep 3

echo "Using OpenClaw volume: $OPENCLAW_VOL"

if [ "${SKIP_LITELLM_VERIFY:-0}" != "1" ]; then
  echo "=== Verifying LiteLLM (host -> 127.0.0.1:4000) ==="
  curl -sS -o /tmp/laed-models.json -w "HTTP %{http_code}\n" \
    "http://127.0.0.1:4000/v1/models" \
    -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" | tail -1
  if ! grep -q laed-chat /tmp/laed-models.json 2>/dev/null; then
    echo "WARN: laed-chat not seen in /v1/models; check litellm-config.yaml and litellm container logs." >&2
  fi
fi

BACKUP_DIR="${BACKUP_DIR:-$HOME/openclaw-backups}"
if [ "${SKIP_BACKUP:-0}" != "1" ]; then
  mkdir -p "$BACKUP_DIR"
  TS="$(date +%Y%m%d-%H%M%S)"
  echo "=== Backing up $OPENCLAW_VOL to $BACKUP_DIR/openclaw-data-$TS.tgz ==="
  docker run --rm -v "$OPENCLAW_VOL:/data:ro" -v "$BACKUP_DIR:/backup" alpine:3.20 \
    sh -c "tar -czf /backup/openclaw-data-${TS}.tgz -C /data ."
fi

echo "=== Stopping openclaw ==="
docker compose stop openclaw 2>/dev/null || true

echo "=== Wiping OpenClaw data volume contents ==="
docker run --rm -v "$OPENCLAW_VOL:/data" alpine:3.20 sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} +'

echo "=== Recreating openclaw container ==="
docker compose up -d --force-recreate openclaw

echo "=== Waiting for OpenClaw gateway to finish boot (60s) ==="
sleep 60

echo "=== Seeding litellm:default auth profile (agent store) ==="
docker compose exec -T openclaw python3 - <<'PY'
import json, os
from pathlib import Path

key = os.getenv("OPENAI_API_KEY") or os.getenv("LITELLM_API_KEY") or os.getenv("LITELLM_MASTER_KEY")
if not key or not key.startswith("sk-"):
    raise SystemExit("OpenClaw env missing sk- key (OPENAI_API_KEY / LITELLM_MASTER_KEY)")

p = Path("/home/node/.openclaw/agents/main/agent/auth-profiles.json")
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(
    json.dumps(
        {
            "profiles": {
                "litellm:default": {
                    "provider": "litellm",
                    "mode": "api_key",
                    "key": key,
                }
            }
        },
        indent=2,
    )
    + "\n"
)
print("Wrote", p)
PY

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_JSON=""
for cand in "$COMPOSE_DIR/config/openclaw-litellm-models.json" "$SCRIPT_DIR/../config/openclaw-litellm-models.json"; do
  if [ -f "$cand" ]; then
    MODELS_JSON="$cand"
    break
  fi
done
if [ -n "$MODELS_JSON" ]; then
  echo "=== Registering LiteLLM model catalog (fixes Unknown model: litellm/laed-chat) ==="
  docker compose exec -T openclaw node dist/index.js config set models "$(cat "$MODELS_JSON")" --strict-json
else
  echo "ERROR: config/openclaw-litellm-models.json not found. Copy it from the laed repo next to docker-compose (config/ directory)." >&2
  exit 1
fi

echo "=== OpenClaw CLI: gateway.mode + defaults + timeouts ==="
docker compose exec -T openclaw node dist/index.js config set gateway.mode '"local"' --strict-json
docker compose exec -T openclaw node dist/index.js config set agents.defaults.model '"litellm/laed-chat"' --strict-json
docker compose exec -T openclaw node dist/index.js config set agents.defaults.llm.idleTimeoutSeconds 1200 --strict-json
docker compose exec -T openclaw node dist/index.js config set agents.defaults.timeoutSeconds 1500 --strict-json

if [ -n "${TELEGRAM_ALLOW_TG_IDS:-}" ]; then
  IFS=',' read -r -a IDS <<< "$TELEGRAM_ALLOW_TG_IDS"
  JSON_IDS=""
  for id in "${IDS[@]}"; do
    id="$(echo "$id" | tr -d ' ')"
    [ -z "$id" ] && continue
    if [ -n "$JSON_IDS" ]; then JSON_IDS+=","; fi
    JSON_IDS+="\"tg:${id}\""
  done
  echo "=== Setting channels.telegram.allowFrom: [$JSON_IDS] ==="
  docker compose exec -T openclaw node dist/index.js config set "channels.telegram.allowFrom" "[${JSON_IDS}]" --json
  docker compose exec -T openclaw node dist/index.js config set channels.telegram.dmPolicy '"allowlist"' --strict-json
else
  echo "=== Skipping allowFrom (set TELEGRAM_ALLOW_TG_IDS=numeric_id to restrict DMs) ==="
fi

echo "=== Restart openclaw to load config + auth file ==="
docker compose restart openclaw

echo ""
echo "Done. Next steps (Telegram):"
echo "  1) /new"
echo "  2) /model litellm/laed-chat   (only models that exist in: curl 127.0.0.1:4000/v1/models + your LITELLM_MASTER_KEY)"
echo "  3) reply exactly: OK"
echo "Optional: TELEGRAM_ALLOW_TG_IDS=123456789 ./scripts/openclaw-litellm-reset.sh  (re-run with your numeric Telegram user ID)"
echo "Run: docker compose exec -T openclaw node dist/index.js doctor"
