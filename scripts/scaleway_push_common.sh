# Shared helpers for LAED Scaleway registry push scripts.
# Source from push_to_scaleway_registry.sh / push_frontend_to_scaleway_registry.sh — do not execute directly.
set -euo pipefail

: "${PUSH_SERVICE_LABEL:?PUSH_SERVICE_LABEL must be set before sourcing scaleway_push_common.sh}"

on_error() {
  local line="$1"
  echo "ERROR: [${PUSH_SERVICE_LABEL}] Step '${CURRENT_STEP}' failed at line ${line}." >&2
}

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
}

is_true() {
  case "$1" in
    1|true|TRUE|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

ensure_docker_ready() {
  CURRENT_STEP="docker-ready-check"
  require_command docker
  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not reachable. Start Docker and retry." >&2
    exit 1
  fi
}

load_local_env() {
  CURRENT_STEP="load-local-env"
  if [[ -f "${LOCAL_ENV}" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "${LOCAL_ENV}"
    set +a
  fi
}

read_terraform_output() {
  local output_name="$1"
  if [[ ! -d "${TERRAFORM_DIR}" || ! -f "${TERRAFORM_DIR}/.terraform.lock.hcl" ]]; then
    return
  fi
  if ! command -v terraform >/dev/null 2>&1; then
    return
  fi
  (
    cd "${TERRAFORM_DIR}" && terraform output -raw "${output_name}" 2>/dev/null
  ) || true
}

resolve_registry_endpoint() {
  local tf_endpoint env_region env_namespace expected_endpoint endpoint_host endpoint_namespace
  env_region="${SCW_REGION:-${SCW_DEFAULT_REGION:-${DEFAULT_SCW_REGION}}}"
  env_namespace="${SCW_REGISTRY_NAMESPACE:-${DEFAULT_SCW_NAMESPACE}}"
  tf_endpoint="$(read_terraform_output registry_endpoint)"

  if [[ -n "${tf_endpoint}" ]]; then
    REGISTRY_ENDPOINT="${tf_endpoint}"
  else
    REGISTRY_ENDPOINT="rg.${env_region}.scw.cloud/${env_namespace}"
  fi

  endpoint_host="${REGISTRY_ENDPOINT%%/*}"
  endpoint_namespace="${REGISTRY_ENDPOINT#*/}"
  if [[ "${endpoint_host}" != rg.*.scw.cloud || -z "${endpoint_namespace}" ]]; then
    echo "Invalid registry endpoint: ${REGISTRY_ENDPOINT}" >&2
    exit 1
  fi

  if [[ -n "${tf_endpoint}" ]]; then
    expected_endpoint="rg.${env_region}.scw.cloud/${env_namespace}"
    if [[ "${expected_endpoint}" != "${tf_endpoint}" ]]; then
      echo "Mismatch between env/default endpoint and Terraform output." >&2
      echo "Expected from env/defaults: ${expected_endpoint}" >&2
      echo "Terraform output:          ${tf_endpoint}" >&2
      exit 1
    fi
  fi
}

resolve_data_dir() {
  local tf_data_dir
  tf_data_dir="$(read_terraform_output data_dir)"
  DATA_DIR="${DEPLOY_DATA_DIR:-${tf_data_dir:-${DEPLOY_DIR_DEFAULT}}}"
}

validate_env() {
  CURRENT_STEP="validate-env"
  if [[ -z "${SCW_SECRET_KEY:-}" ]]; then
    echo "Set SCW_SECRET_KEY in ${LOCAL_ENV} (or export it in your shell)." >&2
    echo "Use the Scaleway API secret key (UUID), not the access key (SCW... prefix)." >&2
    exit 1
  fi
}

resolve_tag() {
  local arg_tag="${1:-}"
  if [[ -n "${arg_tag}" ]]; then
    printf '%s' "${arg_tag}"
    return
  fi
  if [[ -n "${IMAGE_TAG:-}" ]]; then
    printf '%s' "${IMAGE_TAG}"
    return
  fi
  if [[ "${TAG_STRATEGY}" == "git_sha" ]] && command -v git >/dev/null 2>&1; then
    CURRENT_STEP="resolve-tag-git"
    (
      cd "${REPO_ROOT}" && git rev-parse --short HEAD
    )
    return
  fi
  date -u +%Y%m%d-%H%M%S
}

check_registry_reachable() {
  CURRENT_STEP="registry-reachability"
  local registry_host="${REGISTRY_ENDPOINT%%/*}"
  local url="https://${registry_host}/v2/"
  local http_code
  echo "Checking registry reachability (${url})..."
  # Registry /v2/ returns 401 without credentials — that still means the host is reachable.
  http_code="$(
    curl -sI --connect-timeout 15 --max-time 30 -o /dev/null -w '%{http_code}' "${url}" 2>/dev/null || echo "000"
  )"
  case "${http_code}" in
    200|401)
      echo "Registry reachable (HTTP ${http_code})."
      ;;
    *)
      echo "Cannot reach Scaleway registry at ${registry_host} (HTTP ${http_code})." >&2
      echo "Typical causes: VPN/firewall, offline network, corporate proxy, or Docker Desktop proxy misconfiguration." >&2
      echo "Retry when online: curl -I ${url}  # expect HTTP 401" >&2
      exit 1
      ;;
  esac
}

docker_login() {
  CURRENT_STEP="docker-login"
  local registry_host="${REGISTRY_ENDPOINT%%/*}"
  local registry_namespace="${REGISTRY_ENDPOINT#*/}"
  local login_target="${registry_host}/${registry_namespace}"
  local attempt max_attempts=3
  max_attempts="${DOCKER_LOGIN_RETRIES:-3}"

  echo "Logging in to ${login_target}..."
  for attempt in $(seq 1 "${max_attempts}"); do
    if printf '%s' "${SCW_SECRET_KEY}" | docker login "${login_target}" -u nologin --password-stdin >/dev/null 2>&1; then
      return 0
    fi
    if [[ "${attempt}" -lt "${max_attempts}" ]]; then
      echo "Login attempt ${attempt}/${max_attempts} failed; retrying in 5s..." >&2
      sleep 5
    fi
  done

  echo "Docker registry login failed after ${max_attempts} attempts." >&2
  echo "If you saw 'Client.Timeout exceeded while awaiting headers', the registry was unreachable from this machine (not bad credentials)." >&2
  echo "Verify: curl -I https://${registry_host}/v2/ && SCW_SECRET_KEY is the API secret (UUID)." >&2
  exit 1
}

docker_push_with_retry() {
  local image_ref="$1"
  local attempt max_attempts delay
  max_attempts="${DOCKER_PUSH_RETRIES:-5}"
  for attempt in $(seq 1 "${max_attempts}"); do
    if docker push "${image_ref}"; then
      return 0
    fi
    if [[ "${attempt}" -lt "${max_attempts}" ]]; then
      delay=$((attempt * 15))
      echo "Push ${image_ref} failed (attempt ${attempt}/${max_attempts}); retrying in ${delay}s..." >&2
      echo "Scaleway 502/503 errors are often transient — retrying." >&2
      sleep "${delay}"
    fi
  done
  echo "Push failed after ${max_attempts} attempts: ${image_ref}" >&2
  return 1
}

ensure_scaleway_registry_preflight() {
  CURRENT_STEP="ensure-registry"
  local ensure_script="${REPO_ROOT}/scripts/ensure_scaleway_registry.sh"
  if [[ ! -x "${ensure_script}" ]]; then
    echo "Missing ${ensure_script}" >&2
    exit 1
  fi
  "${ensure_script}" --quiet
}

tag_and_push() {
  CURRENT_STEP="docker-push"
  local image_repo="$1"
  local image_tag="$2"
  FULL_IMAGE="${image_repo}:${image_tag}"
  echo "Pushing ${FULL_IMAGE}..."
  docker tag "${LOCAL_BUILD_TAG}" "${FULL_IMAGE}"
  docker_push_with_retry "${FULL_IMAGE}"

  if is_true "${PUSH_LATEST}" && [[ "${image_tag}" != "latest" ]]; then
    LATEST_IMAGE="${image_repo}:latest"
    echo "Also pushing ${LATEST_IMAGE}..."
    docker tag "${LOCAL_BUILD_TAG}" "${LATEST_IMAGE}"
    docker_push_with_retry "${LATEST_IMAGE}"
  else
    LATEST_IMAGE=""
  fi
}

resolve_digest() {
  CURRENT_STEP="resolve-digest"
  IMAGE_DIGEST="$(docker image inspect "${FULL_IMAGE}" --format '{{index .RepoDigests 0}}' 2>/dev/null || true)"
  if [[ -z "${IMAGE_DIGEST}" ]]; then
    IMAGE_DIGEST="${FULL_IMAGE}"
  fi
}

print_standard_summary() {
  echo
  echo "Push complete (${PUSH_SERVICE_LABEL})."
  echo "Image tag:    ${FULL_IMAGE}"
  if [[ -n "${LATEST_IMAGE:-}" ]]; then
    echo "Latest tag:   ${LATEST_IMAGE}"
  fi
  echo "Digest:       ${IMAGE_DIGEST}"
  echo
}
