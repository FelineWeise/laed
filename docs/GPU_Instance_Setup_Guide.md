# GPU Instance Setup Guide — Scaleway L4-1-24G

## What You're Setting Up

A dedicated GPU server running two AI services over a private network, accessible only from the base server. No data leaves the closed loop.

```
┌─────────────────────────────────────────────────────┐
│  GPU Instance (L4-1-24G)                            │
│  8 vCPU, 48 GB RAM, NVIDIA L4 24 GB VRAM           │
│                                                      │
│  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │ Ollama :11434    │  │ Whisper Service :8080    │ │
│  │ • Qwen 2.5 14B   │  │ • Faster-Whisper v3     │ │
│  │ • nomic-embed     │  │ • (added Day 8)         │ │
│  └──────────────────┘  └──────────────────────────┘ │
│                                                      │
│  VRAM Budget:                                        │
│  Qwen 2.5 14B Q4_K_M .... 9.0 GB                   │
│  nomic-embed-text ........ 0.3 GB                   │
│  Faster-Whisper v3 ....... 3.0 GB (Day 8)          │
│  ─────────────────────────────────                   │
│  Total .................. 12.3 GB / 24 GB           │
└────────────────┬────────────────────────────────────┘
                 │ Private Network (172.16.0.0/22)
┌────────────────▼────────────────────────────────────┐
│  Base Server (GP1-XS) — 51.15.207.5                 │
│  FastAPI → calls GPU over private network            │
└─────────────────────────────────────────────────────┘
```

---

## Step 1: Create the GPU Instance (Scaleway Console)

1. Log in to https://console.scaleway.com
2. Go to **Compute** → **Instances**
3. Click **Create Instance**
4. Configure:

| Setting | Value |
|---------|-------|
| **Availability Zone** | PAR-1 or PAR-2 (same region as your base server) |
| **Instance type** | GPU → **L4-1-24G** |
| **Image** | **Ubuntu 24.04 GPU** (comes with NVIDIA drivers + CUDA) |
| **System volume** | Default (local SSD) |
| **Block storage** | **125 GB** minimum (for Docker images + model weights) |
| **Name** | `laed-gpu` |
| **Tags** | `laed`, `gpu` |

5. Under **Network**:
   - ✅ Public IPv4 (needed for initial SSH setup; remove later)
   - ✅ IPv6

6. Click **Create Instance** — takes ~60 seconds

7. **Note the public IP** (for SSH) — you'll see it on the instance detail page

---

## Step 2: Attach to Private Network

1. Click on your new GPU instance in the console
2. Go to the **Private Networks** tab
3. Click **Attach to a Private Network**
4. Select `projectspace-internal` (the same VPC your base server uses)
5. Leave IPv4 as **auto-allocated**
6. Click **Attach**
7. **Note the private IP** assigned (e.g., `172.16.0.3`)

This IP is how the base server will reach Ollama. Write it down.

---

## Step 3: SSH into the GPU Instance

From your local machine:

```bash
ssh -i ~/.ssh/id_ed25519-scaleway root@<GPU_PUBLIC_IP>
```

Scaleway GPU images use `root` with your SSH key. No password.

---

## Step 4: Verify the GPU

The Scaleway GPU Ubuntu image has NVIDIA drivers pre-installed:

```bash
nvidia-smi
```

Expected output should show:
- **NVIDIA L4** with **24576 MiB** VRAM
- Driver version 535.x or newer
- CUDA version 12.x

If `nvidia-smi` fails, the drivers aren't installed:
```bash
apt update && apt install -y nvidia-driver-535
reboot
```

---

## Step 5: Install Docker + NVIDIA Container Toolkit

```bash
# Install Docker
apt update
apt install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list >/dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

```bash
# Install NVIDIA Container Toolkit (lets Docker access the GPU)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    | tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

apt update
apt install -y nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker
```

Verify GPU is accessible from Docker:
```bash
docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
```

This should show the same NVIDIA L4 output as before, but from inside a container.

---

## Step 6: Deploy Ollama

### 6a. Copy files from your local machine

Open a **new terminal on your local machine**:

```bash
cd ~/Desktop/Repositories/laed

scp -i ~/.ssh/id_ed25519-scaleway \
    infrastructure/gpu-compose.yml \
    infrastructure/pull-models.sh \
    root@<GPU_PUBLIC_IP>:/opt/
```

### 6b. Start Ollama (back on the GPU instance)

```bash
cd /opt
docker compose -f gpu-compose.yml up -d
```

Wait for Ollama to be ready:
```bash
# Poll until it responds
until curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; do
    echo "Waiting for Ollama..."
    sleep 3
done
echo "Ollama is ready."
```

### 6c. Pull the models

```bash
cd /opt && bash pull-models.sh
```

This pulls:
- **Qwen 2.5 14B (Q4_K_M)** — ~8.7 GB download, primary LLM
- **nomic-embed-text** — ~274 MB download, embedding model

The Qwen download takes 5-15 minutes depending on network speed.

### 6d. Verify models are loaded

```bash
# List installed models
curl -s http://localhost:11434/api/tags | python3 -m json.tool

# Test a chat completion
curl http://localhost:11434/api/chat -d '{
  "model": "qwen2.5:14b-instruct-q4_K_M",
  "messages": [{"role": "user", "content": "Hello, respond in one sentence."}],
  "stream": false
}'

# Test embeddings
curl http://localhost:11434/api/embed -d '{
  "model": "nomic-embed-text",
  "input": "Test embedding generation"
}'
```

Both should return valid JSON responses.

---

## Step 7: Verify Private Network Connection

From the **base server** (not the GPU instance):

```bash
# SSH into the base server
ssh -i ~/.ssh/id_ed25519-scaleway feline@51.15.207.5

# Test Ollama over private network
curl http://<GPU_PRIVATE_IP>:11434/api/tags

# Test a chat completion over private network
curl http://<GPU_PRIVATE_IP>:11434/api/chat -d '{
  "model": "qwen2.5:14b-instruct-q4_K_M",
  "messages": [{"role": "user", "content": "Hello from the base server"}],
  "stream": false
}'
```

If this works, the closed loop is complete — the base server talks to the GPU over the private network, no public internet involved.

---

## Step 8: Lock Down the Firewall

Back on the **GPU instance**:

```bash
# Only allow SSH and private network access to AI ports
ufw allow OpenSSH
ufw allow from 172.16.0.0/22 to any port 11434   # Ollama
ufw allow from 172.16.0.0/22 to any port 8080     # Whisper (for later)
ufw --force enable

# Verify
ufw status
```

Expected output:
```
To                         Action      From
--                         ------      ----
OpenSSH                    ALLOW       Anywhere
11434                      ALLOW       172.16.0.0/22
8080                       ALLOW       172.16.0.0/22
```

---

## Step 9: Update Base Server Configuration

On the **base server**, update the `.env` file with the GPU's private IP:

```bash
ssh -i ~/.ssh/id_ed25519-scaleway feline@51.15.207.5

cd /opt/projectspace-data   # or wherever your project lives on the server
# Edit .env: replace the placeholder GPU_PRIVATE_IP and OLLAMA_URL
```

Set:
```
GPU_PRIVATE_IP=172.16.0.3          # ← actual private IP from Step 2
OLLAMA_URL=http://172.16.0.3:11434
STT_URL=http://172.16.0.3:8080
```

Then restart the app services:
```bash
docker compose up -d
```

---

## Step 10: (Optional) Remove Public IP from GPU

Once everything is verified over the private network, you can remove the public IPv4 from the GPU instance to save cost and reduce attack surface:

1. Scaleway Console → GPU instance → **Flexible IPs** → Detach

From then on, SSH to the GPU via the base server as a jump host:
```bash
ssh -J feline@51.15.207.5 root@172.16.0.3
```

---

## Step 11: Power Management

**Stop GPU (stop billing):**
```bash
# Scaleway Console → laed-gpu → Power off
# Or via CLI:
scw instance server stop <GPU_INSTANCE_ID>
```

**Start GPU (resume billing):**
```bash
scw instance server start <GPU_INSTANCE_ID>
```

When powered back on, Ollama auto-starts (`restart: always`) and models load into VRAM on first request (~10-15 seconds).

---

## Verification Checklist

- [ ] GPU instance created and running
- [ ] Attached to `projectspace-internal` private network
- [ ] `nvidia-smi` shows NVIDIA L4 with 24 GB VRAM
- [ ] Docker + NVIDIA Container Toolkit installed
- [ ] GPU accessible from Docker containers
- [ ] Ollama running and responding on :11434
- [ ] Qwen 2.5 14B pulled and responding to chat
- [ ] nomic-embed-text pulled and generating embeddings
- [ ] Base server can reach Ollama over private network
- [ ] Firewall configured (ports 11434/8080 only from 172.16.0.0/22)
- [ ] Base server `.env` updated with GPU private IP
- [ ] (Optional) Public IP removed, SSH via jump host works
- [ ] Know how to power off/on to control billing
