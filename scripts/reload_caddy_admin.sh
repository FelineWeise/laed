#!/usr/bin/env bash
# Reload Caddy after Caddyfile changes (admin.* / litellm.* vhosts).
set -euo pipefail

cd "$(dirname "$0")/.."
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
echo "Caddy reloaded. Ensure DNS: admin.\$DOMAIN and litellm.\$DOMAIN point to this host."
echo "Connect caddy to llm-backbone if needed: bash /opt/llm-gateway/scripts/connect_llm_backbone.sh"
