#!/usr/bin/env bash
# Build/push LAED backend + frontend images (same tag) and print deploy hints.
# Usage:
#   ./scripts/push_laed_images.sh [tag] [--validate-only]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USAGE="Usage: ./scripts/push_laed_images.sh [tag] [--validate-only]"

main() {
  local arg1="${1:-}"
  local arg2="${2:-}"

  if [[ "${arg1}" == "--help" ]]; then
    echo "${USAGE}"
    echo "Runs push_to_scaleway_registry.sh then push_frontend_to_scaleway_registry.sh."
    exit 0
  fi

  echo "=== LAED backend ==="
  "${SCRIPT_DIR}/push_to_scaleway_registry.sh" "$@"
  echo
  echo "=== LAED frontend ==="
  "${SCRIPT_DIR}/push_frontend_to_scaleway_registry.sh" "$@"
}

main "$@"
