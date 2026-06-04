#!/usr/bin/env bash
# MANUAL FALLBACK — superseded by infra/laed-gpu/cloud-init.yaml.tftpl when using Terraform.
# Kept for manual bootstrapping of ad-hoc GPU instances.
set -euo pipefail

COMPOSE_FILE="/opt/gpu-services/docker-compose.yml"
PRIVATE_NETWORK_CIDR="172.16.0.0/22"

echo "=== GPU Instance Setup ==="

# ── Docker ──────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    echo "Installing Docker..."
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        | tee /etc/apt/sources.list.d/docker.list >/dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
    echo "Docker already installed, skipping."
fi

# ── NVIDIA Container Toolkit ────────────────────────────
if ! dpkg -l | grep -q nvidia-container-toolkit; then
    echo "Installing NVIDIA Container Toolkit..."
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
        | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
        | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
        | tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update
    apt-get install -y nvidia-container-toolkit
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
else
    echo "NVIDIA Container Toolkit already installed, skipping."
fi

# ── Verify GPU in Docker ────────────────────────────────
echo "Verifying GPU access..."
docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi

# ── Deploy Ollama ───────────────────────────────────────
mkdir -p /opt/gpu-services
cp "$( cd "$(dirname "$0")" && pwd )/gpu-compose.yml" "$COMPOSE_FILE"
cd /opt/gpu-services
docker compose -f docker-compose.yml up -d

echo "Waiting for Ollama to be ready..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
        echo "Ollama is ready."
        break
    fi
    sleep 2
done

# ── Pull Models ─────────────────────────────────────────
bash "$(cd "$(dirname "$0")" && pwd)/pull-models.sh"

# ── Firewall ────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    echo "Configuring firewall..."
    ufw allow OpenSSH
    ufw allow from "$PRIVATE_NETWORK_CIDR" to any port 11434
    ufw allow from "$PRIVATE_NETWORK_CIDR" to any port 8080
    ufw --force enable
    echo "Firewall configured: Ollama/Whisper only accessible from private network."
else
    echo "ufw not found, skipping firewall configuration."
fi

echo "=== GPU Instance Setup Complete ==="
echo "Test from base server: curl http://<THIS_PRIVATE_IP>:11434/api/tags"
