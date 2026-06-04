#!/usr/bin/env bash
# Power on Scaleway GPU instance from laed-base (no Terraform required).
# Idempotent: if the instance is already running or starting, exits 0 without calling poweron.
#
# Install (paths relative to laed repo root on laed-base):
#   sudo cp infra/laed-base/laed-base-gpu-poweron.sh /usr/local/bin/laed-base-gpu-poweron.sh
#   sudo chmod 755 /usr/local/bin/laed-base-gpu-poweron.sh
# Config:
#   sudo cp infra/laed-base/laed-base-gpu-control.env.example /etc/default/laed-gpu-control
#   sudo chmod 600 /etc/default/laed-gpu-control
# See infra/laed-base/README.md (macOS has no /etc/default — run on laed-base).

set -euo pipefail

CONFIG=/etc/default/laed-gpu-control
if [[ -f "$CONFIG" ]] && ! [[ -r "$CONFIG" ]]; then
  echo "Config ${CONFIG} exists but is not readable as this user (often root-only chmod 600)." >&2
  echo "Run: sudo laed-base-gpu-poweron.sh" >&2
  echo "Or install secrets in ${CONFIG} and keep it readable only by root, then always use sudo." >&2
  exit 1
fi
if [[ -r "$CONFIG" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$CONFIG"
  set +a
fi

: "${SCW_SECRET_KEY:?Missing SCW_SECRET_KEY (set env or add to $CONFIG)}"
: "${GPU_ZONE:?Missing GPU_ZONE}"
: "${GPU_SERVER_ID:?Missing GPU_SERVER_ID}"

API_BASE="https://api.scaleway.com/instance/v1/zones/${GPU_ZONE}/servers/${GPU_SERVER_ID}"

fetch_state() {
  curl -sS "${API_BASE}" \
    -H "X-Auth-Token: ${SCW_SECRET_KEY}" \
    -H "Content-Type: application/json" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["server"]["state"].strip().lower())'
}

STATE="$(fetch_state)"
echo "GPU instance state: ${STATE}" >&2

case "${STATE}" in
  running|starting)
    echo "Already running or booting — no poweron needed." >&2
    exit 0
    ;;
  stopping)
    echo "Instance is stopping; wait until state is stopped, then retry." >&2
    exit 1
    ;;
  stopped|"stopped in place")
    echo "Requesting poweron…" >&2
    ;;
  *)
    echo "Unexpected state '${STATE}'; not sending poweron (avoid API error)." >&2
    echo "Check: https://console.scaleway.com/instance/servers" >&2
    exit 1
    ;;
esac

# scw CLI requires SCW_DEFAULT_ORGANIZATION_ID. If unset, use Instance HTTP API.
if command -v scw >/dev/null 2>&1 && [[ -n "${SCW_DEFAULT_ORGANIZATION_ID:-}" ]]; then
  : "${SCW_ACCESS_KEY:?Missing SCW_ACCESS_KEY for scw CLI}"
  export SCW_SECRET_KEY SCW_ACCESS_KEY
  [[ -n "${SCW_DEFAULT_PROJECT_ID:-}" ]] && export SCW_DEFAULT_PROJECT_ID
  export SCW_DEFAULT_ORGANIZATION_ID
  scw instance server start zone="${GPU_ZONE}" server-id="${GPU_SERVER_ID}"
else
  if command -v scw >/dev/null 2>&1 && [[ -z "${SCW_DEFAULT_ORGANIZATION_ID:-}" ]]; then
    echo "Note: SCW_DEFAULT_ORGANIZATION_ID not set — using curl for poweron." >&2
  elif ! command -v scw >/dev/null 2>&1; then
    echo "scw not installed; using curl for poweron." >&2
  fi
  curl -sS -X POST "${API_BASE}/action" \
    -H "X-Auth-Token: ${SCW_SECRET_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"action":"poweron"}'
  echo
fi

echo "Done. Recheck with: curl -sS -H \"X-Auth-Token: …\" \"${API_BASE}\" | python3 -m json.tool | head" >&2
