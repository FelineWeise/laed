#!/usr/bin/env bash
# Ensure Scaleway Container Registry namespace (and report image repos) before LAED pushes.
# Usage:
#   ./scripts/ensure_scaleway_registry.sh [--quiet]
# Requires: scw CLI (recommended) or fails with install hint.
# Env (from laed/.env): SCW_SECRET_KEY, SCW_PROJECT_ID, SCW_DEFAULT_REGION, SCW_REGISTRY_NAMESPACE
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_ENV="${REPO_ROOT}/.env"
QUIET="false"

if [[ "${1:-}" == "--quiet" ]]; then
  QUIET="true"
fi

log() {
  if [[ "${QUIET}" != "true" ]]; then
    echo "$@"
  fi
}

load_local_env() {
  if [[ -f "${LOCAL_ENV}" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "${LOCAL_ENV}"
    set +a
  fi
}

configure_scw() {
  if [[ -z "${SCW_SECRET_KEY:-}" ]]; then
    echo "Set SCW_SECRET_KEY in ${LOCAL_ENV}." >&2
    exit 1
  fi
  export SCW_SECRET_KEY
  export SCW_DEFAULT_PROJECT_ID="${SCW_PROJECT_ID:-${SCW_DEFAULT_PROJECT_ID:-}}"
  export SCW_DEFAULT_REGION="${SCW_DEFAULT_REGION:-${SCW_REGION:-fr-par}}"
  if [[ -z "${SCW_DEFAULT_PROJECT_ID}" ]]; then
    echo "Set SCW_PROJECT_ID in ${LOCAL_ENV} (Scaleway project UUID)." >&2
    exit 1
  fi
}

ensure_namespace() {
  local region="$1"
  local name="$2"
  local project_id="$3"
  local ns_id

  ns_id="$(
    scw registry namespace list "region=${region}" -o json 2>/dev/null \
      | python3 -c "
import json, sys
name = sys.argv[1]
data = json.load(sys.stdin)
for row in data:
    if row.get('name') == name:
        print(row.get('id', ''))
        break
" "${name}" 2>/dev/null || true
  )"

  if [[ -n "${ns_id}" ]]; then
    log "Registry namespace '${name}' exists (${region}, id=${ns_id})."
    REGISTRY_NAMESPACE_ID="${ns_id}"
    return 0
  fi

  log "Creating registry namespace '${name}' in ${region}..."
  ns_id="$(
    scw registry namespace create \
      "name=${name}" \
      "region=${region}" \
      "project-id=${project_id}" \
      is-public=false \
      -o json | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))"
  )"
  if [[ -z "${ns_id}" ]]; then
    echo "Failed to create namespace '${name}'." >&2
    exit 1
  fi
  log "Created namespace '${name}' (id=${ns_id})."
  REGISTRY_NAMESPACE_ID="${ns_id}"
}

report_images() {
  local region="$1"
  local required="${LAED_REGISTRY_IMAGES:-backend frontend parakeet}"
  local existing="" name

  if [[ -z "${REGISTRY_NAMESPACE_ID:-}" ]]; then
    return 0
  fi

  existing="$(
    scw registry image list "namespace-id=${REGISTRY_NAMESPACE_ID}" -o json 2>/dev/null \
      | python3 -c "
import json, sys
data = json.load(sys.stdin)
names = set()
for row in data:
    full = row.get('name') or row.get('full_name') or ''
    if '/' in full:
        names.add(full.rsplit('/', 1)[-1])
    elif full:
        names.add(full)
print(' '.join(sorted(names)))
" 2>/dev/null || true
  )"

  log "Existing image repositories in namespace: ${existing:-<none>}"

  for name in ${required}; do
    if [[ " ${existing} " != *" ${name} "* ]]; then
      log "Note: '${name}' not in registry yet — first successful push will create it."
    fi
  done
}

main() {
  local region namespace project_id

  load_local_env
  configure_scw

  if ! command -v scw >/dev/null 2>&1; then
    echo "Install Scaleway CLI: https://www.scaleway.com/en/cli/" >&2
    echo "Then: scw init  (or set SCW_SECRET_KEY + SCW_PROJECT_ID in .env)" >&2
    exit 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required for registry JSON parsing." >&2
    exit 1
  fi

  region="${SCW_DEFAULT_REGION}"
  namespace="${SCW_REGISTRY_NAMESPACE:-laed}"
  project_id="${SCW_DEFAULT_PROJECT_ID}"

  ensure_namespace "${region}" "${namespace}" "${project_id}"
  report_images "${region}"

  log "Registry endpoint: rg.${region}.scw.cloud/${namespace}"
}

main "$@"
