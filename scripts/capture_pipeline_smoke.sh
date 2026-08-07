#!/usr/bin/env bash
# Capture pipeline smoke checklist (run against a logged-in env).
# Usage:
#   export LAED_API=https://…   # or http://localhost:8000
#   export LAED_TOKEN=…         # Bearer JWT
#   ./scripts/capture_pipeline_smoke.sh
set -euo pipefail

API="${LAED_API:?set LAED_API}"
TOKEN="${LAED_TOKEN:?set LAED_TOKEN}"
AUTH="Authorization: Bearer ${TOKEN}"

echo "== create camera session =="
CAM=$(curl -sf -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"kind":"camera","is_private":true,"capture_mode":"photo"}' \
  "$API/api/capture/sessions")
CAM_ID=$(echo "$CAM" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "camera session=$CAM_ID"

echo "== upload tiny JPEG =="
# 1x1 jpeg
python3 - <<'PY' > /tmp/laed_smoke.jpg
import base64
open("/tmp/laed_smoke.jpg","wb").write(base64.b64decode(
"/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z"
))
PY
ASSET=$(curl -sf -H "$AUTH" \
  -F "image=@/tmp/laed_smoke.jpg;type=image/jpeg" \
  -F "media_role=image" \
  -F "capture_mode=photo" \
  "$API/api/capture/sessions/$CAM_ID/assets")
ASSET_ID=$(echo "$ASSET" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
DL=$(echo "$ASSET" | python3 -c "import sys,json; print(json.load(sys.stdin).get('download_url') or '')")
echo "asset=$ASSET_ID download=$DL"
test -n "$DL"
echo "== download via API (not minio host) =="
curl -sf -H "$AUTH" -o /tmp/laed_smoke_dl.jpg "$API$DL"
file /tmp/laed_smoke_dl.jpg

echo "== create spoken session =="
SP=$(curl -sf -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"kind":"spoken","is_private":true,"capture_mode":"audio"}' \
  "$API/api/capture/sessions")
SP_ID=$(echo "$SP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "spoken session=$SP_ID"
echo "NOTE: STT chunk upload needs a real audio blob; exercise mic from the Capture UI."
echo "Done (photo upload + auth download OK)."
