#!/usr/bin/env bash
set -euo pipefail
source /etc/default/laed-gpu-cost-control || true
LAST_ACTIVITY_FILE="/var/run/gpu-last-activity"
IDLE_TIMEOUT="${IDLE_TIMEOUT_SECONDS:-900}"
# Ollama pulls do not POST /heartbeat; model blobs change on disk for a long time.
# If anything under models was written recently, treat as active (avoid shutdown mid-pull).
MODELDIR=/var/lib/ollama/models
if [[ -d "$MODELDIR" ]] && find "$MODELDIR" -type f -mmin -20 -print -quit 2>/dev/null | grep -q .; then
  date +%s > "$LAST_ACTIVITY_FILE"
  exit 0
fi
if [[ ! -f "$LAST_ACTIVITY_FILE" ]]; then
  date +%s > "$LAST_ACTIVITY_FILE"
  exit 0
fi
last=$(cat "$LAST_ACTIVITY_FILE")
now=$(date +%s)
idle=$((now - last))
if (( idle > IDLE_TIMEOUT )); then
  logger "GPU idle for ${idle}s, shutting down"
  /sbin/shutdown -h now
fi
