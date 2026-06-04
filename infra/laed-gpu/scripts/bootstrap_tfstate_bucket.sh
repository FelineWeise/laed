#!/usr/bin/env bash
set -euo pipefail

# Creates the Terraform backend bucket for this stack.
# Requires:
# - scw CLI installed and authenticated
# - region fr-par
#
# Usage:
#   ./scripts/bootstrap_tfstate_bucket.sh

BUCKET_NAME="${BUCKET_NAME:-laed-tfstate-prod}"
REGION="${REGION:-fr-par}"

if ! command -v scw >/dev/null 2>&1; then
  echo "scw CLI not found. Install from https://www.scaleway.com/en/cli/"
  exit 1
fi

if ! scw config get >/dev/null 2>&1; then
  echo "scw CLI is not authenticated. Run: scw init"
  exit 1
fi

if scw object bucket list region="${REGION}" | rg -q "${BUCKET_NAME}"; then
  echo "Bucket already exists: ${BUCKET_NAME}"
else
  echo "Creating bucket: ${BUCKET_NAME} (region=${REGION})"
  scw object bucket create name="${BUCKET_NAME}" region="${REGION}"
fi

echo "Enabling bucket versioning on ${BUCKET_NAME}"
scw object bucket versioning update bucket="${BUCKET_NAME}" region="${REGION}" status=Enabled

echo "Done."
