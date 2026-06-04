#!/usr/bin/env bash
# LAED MVP smoke test — run against a live stack (default https://DOMAIN or BASE_URL).
set -euo pipefail

BASE_URL="${BASE_URL:-https://laed.eu}"
EMAIL="${LAED_TEST_EMAIL:-}"
PASSWORD="${LAED_TEST_PASSWORD:-}"

echo "==> Health"
curl -sf "${BASE_URL}/api/health" | grep -q '"status":"ok"'

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "Skip auth tests (set LAED_TEST_EMAIL / LAED_TEST_PASSWORD)"
  echo "Tip: match LAED_DEMO_EMAIL / LAED_DEMO_PASSWORD from laed/.env for demo user"
  exit 0
fi

echo "==> Login"
TOKEN=$(curl -sf "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

AUTH=(-H "Authorization: Bearer ${TOKEN}")

echo "==> Global topology"
curl -sf "${BASE_URL}/api/topology/global" "${AUTH[@]}" | grep -q '"nodes"'

echo "==> Projects"
curl -sf "${BASE_URL}/api/projects" "${AUTH[@]}" | grep -q '\['

echo "verify-laed-mvp: core checks passed"
