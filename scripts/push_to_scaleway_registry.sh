#!/usr/bin/env bash
# Build/push LAED backend image to Scaleway CR and print exact deploy commands.
# Usage:
#   ./scripts/push_to_scaleway_registry.sh [tag] [--validate-only]
# Credentials:
#   set SCW_SECRET_KEY in repository .env (or export in your shell).
# Shared standard:
#   /Users/feline/Desktop/Repositories/scaleway-push-template.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_ENV="${REPO_ROOT}/.env"
TERRAFORM_DIR="${REPO_ROOT}/infra/laed-gpu"

PUSH_SERVICE_LABEL="backend"
DEFAULT_SCW_REGION="fr-par"
DEFAULT_SCW_NAMESPACE="laed"
DEFAULT_IMAGE_NAME="backend"
LOCAL_BUILD_TAG="laed-backend:build"
BUILD_CONTEXT="${REPO_ROOT}/backend"
DEPLOY_DIR_DEFAULT="/opt/laed"
DEPLOY_REMOTE_DEFAULT="${DEPLOY_REMOTE_DEFAULT:-scw-base}"
DEPLOY_IMAGE_ENV_VAR="LAED_BACKEND_IMAGE"
DEPLOY_COMPOSE_SERVICES="app worker"
PUSH_LATEST="${PUSH_LATEST:-true}"
TAG_STRATEGY="${TAG_STRATEGY:-git_sha}"
CURRENT_STEP="bootstrap"
USAGE="Usage: ./scripts/push_to_scaleway_registry.sh [tag] [--validate-only]"

# shellcheck source=scaleway_push_common.sh
source "${SCRIPT_DIR}/scaleway_push_common.sh"
trap 'on_error "${LINENO}"' ERR

build_image() {
  CURRENT_STEP="docker-build"
  echo "Building ${LOCAL_BUILD_TAG} for linux/amd64 (context: ${BUILD_CONTEXT})..."
  docker build --platform linux/amd64 -t "${LOCAL_BUILD_TAG}" "${BUILD_CONTEXT}"
}

print_deploy_commands() {
  local remote="${DEPLOY_REMOTE:-${DEPLOY_REMOTE_DEFAULT}}"
  cat <<EOF
1) Sync runtime files from Mac (ssh-add first if needed):

  cd ${REPO_ROOT}
  scp docker-compose.yml Caddyfile "caddy/admin-basicauth.caddy" "${remote}:${DATA_DIR}/"

LiteLLM gateway lives in sibling repo llm-gateway (${DATA_DIR%/laed}/llm-gateway or /opt/llm-gateway). See laed/SHARED_LITELLM.md.

2) Pin backend image on server — add or edit in ${DATA_DIR}/.env:

  ${DEPLOY_IMAGE_ENV_VAR}=${FULL_IMAGE}
  Recommended immutable pin:
  ${DEPLOY_IMAGE_ENV_VAR}=${IMAGE_DIGEST}

  ssh ${remote} "grep -E '^${DEPLOY_IMAGE_ENV_VAR}=' ${DATA_DIR}/.env || echo 'MISSING — add to .env'"

  Also set Scaleway model ids if not already:
  LLM_MODEL=scaleway/qwen3.6-35b
  EMBEDDING_MODEL=scaleway/qwen3-embedding-8b
  EMBEDDING_DIM=4096

3) On laed-base:

  ssh ${remote} 'cd ${DATA_DIR} && \\
    docker compose pull ${DEPLOY_COMPOSE_SERVICES} && \\
    docker compose up -d --force-recreate ${DEPLOY_COMPOSE_SERVICES} && \\
    docker compose exec -T app alembic upgrade head && \\
    docker compose exec -T app python /app/scripts/backfill_rag_projects.py && \\
    docker compose exec -T app python /app/scripts/backfill_reembed_files.py'

4) Verify: ./scripts/verify-litellm-gateway.sh (on server or Mac with compose up)

Push frontend after UI changes:
  ./scripts/push_frontend_to_scaleway_registry.sh [tag]
Or both:
  ./scripts/push_laed_images.sh [tag]
EOF
}

print_usage() {
  cat <<EOF
${USAGE}

Options:
  --help           Show this message
  --validate-only  Resolve config and print targets without building/pushing
EOF
}

main() {
  local requested_tag image_name image_repo image_tag validate_only
  requested_tag="${1:-}"
  validate_only="false"

  if [[ "${requested_tag}" == "--help" ]]; then
    print_usage
    exit 0
  fi
  if [[ "${requested_tag}" == "--validate-only" ]]; then
    validate_only="true"
    requested_tag="${2:-}"
  fi

  load_local_env
  validate_env
  resolve_registry_endpoint
  resolve_data_dir

  image_name="${SCW_IMAGE_BACKEND:-${SCW_IMAGE_NAME:-${DEFAULT_IMAGE_NAME}}}"
  image_repo="${REGISTRY_ENDPOINT}/${image_name}"
  image_tag="$(resolve_tag "${requested_tag}")"

  if is_true "${validate_only}"; then
    echo "Validation successful (${PUSH_SERVICE_LABEL})."
    echo "Registry endpoint: ${REGISTRY_ENDPOINT}"
    echo "Image repo:        ${image_repo}"
    echo "Tag:               ${image_tag}"
    echo "Deploy data dir:   ${DATA_DIR}"
    echo "Deploy remote:     ${DEPLOY_REMOTE:-${DEPLOY_REMOTE_DEFAULT}}"
    exit 0
  fi

  ensure_docker_ready
  build_image
  check_registry_reachable
  ensure_scaleway_registry_preflight
  docker_login
  tag_and_push "${image_repo}" "${image_tag}"
  resolve_digest
  print_standard_summary
  print_deploy_commands
}

main "$@"
