#!/usr/bin/env bash
# Build/push LAED frontend image to Scaleway CR and print exact deploy commands.
# Usage:
#   ./scripts/push_frontend_to_scaleway_registry.sh [tag] [--validate-only]
# Credentials:
#   SCW_SECRET_KEY in laed/.env (API secret UUID, not SCW access key prefix).
# Shared standard:
#   /Users/feline/Desktop/Repositories/scaleway-push-template.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_ENV="${REPO_ROOT}/.env"
TERRAFORM_DIR="${REPO_ROOT}/infra/laed-gpu"

PUSH_SERVICE_LABEL="frontend"
DEFAULT_SCW_REGION="fr-par"
DEFAULT_SCW_NAMESPACE="laed"
DEFAULT_IMAGE_NAME="frontend"
LOCAL_BUILD_TAG="laed-frontend:build"
BUILD_CONTEXT="${REPO_ROOT}/frontend"
DEPLOY_DIR_DEFAULT="/opt/laed"
DEPLOY_REMOTE_DEFAULT="${DEPLOY_REMOTE_DEFAULT:-scw-base}"
DEPLOY_IMAGE_ENV_VAR="LAED_FRONTEND_IMAGE"
DEPLOY_COMPOSE_SERVICES="frontend caddy"
PUSH_LATEST="${PUSH_LATEST:-true}"
TAG_STRATEGY="${TAG_STRATEGY:-git_sha}"
CURRENT_STEP="bootstrap"
USAGE="Usage: ./scripts/push_frontend_to_scaleway_registry.sh [tag] [--validate-only]"

# shellcheck source=scaleway_push_common.sh
source "${SCRIPT_DIR}/scaleway_push_common.sh"
trap 'on_error "${LINENO}"' ERR

build_image() {
  CURRENT_STEP="docker-build"
  local demo_email="${LAED_DEMO_EMAIL:-${NEXT_PUBLIC_DEMO_EMAIL:-}}"
  echo "Building ${LOCAL_BUILD_TAG} for linux/amd64 (context: ${BUILD_CONTEXT})..."
  if [[ -n "${demo_email}" ]]; then
    echo "Build arg NEXT_PUBLIC_DEMO_EMAIL=${demo_email}"
    docker build --platform linux/amd64 \
      --build-arg "NEXT_PUBLIC_DEMO_EMAIL=${demo_email}" \
      -t "${LOCAL_BUILD_TAG}" "${BUILD_CONTEXT}"
  else
    docker build --platform linux/amd64 -t "${LOCAL_BUILD_TAG}" "${BUILD_CONTEXT}"
  fi
}

print_deploy_commands() {
  local remote="${DEPLOY_REMOTE:-${DEPLOY_REMOTE_DEFAULT}}"
  cat <<EOF
1) Sync runtime files from Mac (ssh-add first if needed):

  cd ${REPO_ROOT}
  scp docker-compose.yml Caddyfile "caddy/admin-basicauth.caddy" "${remote}:${DATA_DIR}/"

2) Pin frontend image on server — add or edit in ${DATA_DIR}/.env:

  ${DEPLOY_IMAGE_ENV_VAR}=${FULL_IMAGE}
  Recommended immutable pin:
  ${DEPLOY_IMAGE_ENV_VAR}=${IMAGE_DIGEST}

  ssh ${remote} "grep -E '^${DEPLOY_IMAGE_ENV_VAR}=' ${DATA_DIR}/.env || echo 'MISSING — add to .env'"

3) On laed-base (llm-gateway must be up on llm-backbone first):

  ssh ${remote} 'cd ${DATA_DIR} && \\
    docker compose pull ${DEPLOY_COMPOSE_SERVICES} && \\
    docker compose up -d --force-recreate ${DEPLOY_COMPOSE_SERVICES}'

4) Verify UI: https://\${DOMAIN:-laed.eu}/login

Also push backend when API changed:
  ./scripts/push_to_scaleway_registry.sh [tag]
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

  image_name="${SCW_IMAGE_FRONTEND:-${DEFAULT_IMAGE_NAME}}"
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
