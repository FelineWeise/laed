# Secure Project Space — Day 1: Server Setup (Scaleway)

## Infrastructure Overview

| Server | Type | Specs | Cost | Purpose |
|--------|------|-------|------|---------|
| Base (always-on) | Scaleway GP1-XS | 4 vCPU, 16GB RAM | ~€66/month | App, DB, files, vectors, reverse proxy |
| GPU (on-demand) | Scaleway L4-1-24G | NVIDIA L4, 24GB VRAM | ~€0.75/hour | LLM inference, STT, embeddings |

Both servers on the same Scaleway Private Network (VPC) — internal communication never touches the public internet. GPU server billed only when powered on.

---

## Step 1: Create a Scaleway Account

1. Go to https://console.scaleway.com/register
2. Sign up with email. Scaleway requires a credit card for verification (you won't be charged until you provision resources)
3. Once in the console, go to **Account** → **SSH Keys** and add your public SSH key
   - If you don't have one yet, generate it on your local machine first:
     ```bash
     ssh-keygen -t ed25519 -C "feline@projectspace"
     cat ~/.ssh/id_ed25519.pub
     ```
   - Copy the output and paste it into Scaleway's SSH key field
   - Scaleway automatically injects this key into every instance you create — no manual key setup needed later

**Important**: Scaleway uses your SSH key from the console, not a root password. When you SSH in, you'll connect as `root` using your key. No temporary password, no email with credentials — it just works if your key is registered.

---

## Step 2: Create a Private Network (VPC)

This goes first because both instances will attach to it.

1. In the Scaleway Console, go to **Network** → **VPC**
2. You'll see a default VPC for each region. Click on the **Paris** VPC (or Amsterdam/Warsaw — pick one region and stick with it)
3. Click **Create Private Network**
   - Name: `projectspace-internal`
   - Leave CIDR block as default (e.g., `172.16.0.0/22`)
   - Click **Create Private Network**

This private network is where your base server and GPU server will talk to each other. Internal traffic is free, fast (~sub-millisecond latency), and never leaves Scaleway's infrastructure.

---

## Step 3: Create the Base Server (GP1-XS)

1. Go to **Compute** → **CPU & GPU Instances**
2. Click **Create Instance** → **Create CPU Instance**
3. Configure:
   - **Availability Zone**: `PAR-1` (or whichever matches your VPC region)
   - **Instance type**: Browse to **General Purpose** → select **GP1-XS** (4 vCPU, 16 GB RAM)
   - **Image**: **Ubuntu 24.04 LTS (Jammy)**
   - **Storage**: Add a **Block Storage** volume of **100 GB** (this is where your data lives — PostgreSQL, MinIO files, ChromaDB vectors). Block Storage persists independently of the instance
   - **Network**:
     - ✅ Public IPv4 (you need this for SSH and for Caddy to serve HTTPS)
     - ✅ Public IPv6
   - **Name**: `projectspace-base`
   - **Tags**: `projectspace`, `base`
4. Click **Create Instance**

The instance provisions in about 30-60 seconds. Note the **public IP address** — you'll need it for DNS and SSH.

5. **Attach to Private Network**:
   - Click on your new instance → **Private Networks** tab
   - Click **Attach to a Private Network** → select `projectspace-internal`
   - Leave IPv4 as auto-allocated
   - Click **Attach**
   - Note the **private IP** assigned (e.g., `172.16.0.2`) — this is how the GPU server will reach it later

---

## Step 4: Register a Domain & Point DNS

You need a domain so Caddy can generate HTTPS certificates.

**Option A: Use a subdomain you already own**
- Go to your DNS provider (Cloudflare, Namecheap, etc.)
- Add an A record: `projectspace.yourdomain.com` → `<base-server-public-IP>`
- If using Cloudflare, set proxy status to "DNS only" (grey cloud)

**Option B: Register a new domain**
- Namecheap, Porkbun, or Scaleway's own Domains product all work
- Point the A record to your base server's public IP

Check propagation:
```bash
dig +short projectspace.yourdomain.com
# Should return your base server's public IP
```

---

## Step 5: SSH In & Harden the Base Server

```bash
# From your local machine — Scaleway uses root + your SSH key
ssh root@<BASE_SERVER_PUBLIC_IP>
```

This should connect immediately using the SSH key you registered in Step 1. No password needed.

### 5a. Update the system
```bash
apt update && apt upgrade -y
```

### 5b. Create your user account
```bash
adduser feline
# Set a strong password, press Enter through the rest

usermod -aG sudo feline

# Copy SSH key to new user
mkdir -p /home/feline/.ssh
cp /root/.ssh/authorized_keys /home/feline/.ssh/
chmod 700 /home/feline/.ssh
chmod 600 /home/feline/.ssh/authorized_keys
chown -R feline:feline /home/feline/.ssh
```

### 5c. Test new user login (in a NEW terminal)
```bash
ssh feline@<BASE_SERVER_PUBLIC_IP>
sudo whoami
# Should output: root
```

### 5d. Disable root login
```bash
sudo nano /etc/ssh/sshd_config
```

Find and change:
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Save and restart SSH:
```bash
sudo systemctl restart sshd
```

### 5e. Configure firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
# Type 'y' when prompted

sudo ufw status
```

### 5f. Automatic security updates
```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure --priority=low unattended-upgrades
# Select 'Yes'
```

### 5g. Set hostname
```bash
sudo hostnamectl set-hostname projectspace
```

---

## Step 6: Mount Block Storage

Scaleway's Block Storage needs to be formatted and mounted after first creation.

```bash
# List available volumes
lsblk
# You should see your block volume (e.g., sda or vdb) — usually /dev/sdb for the extra block volume

# Format it (ONLY do this once — this erases the volume)
sudo mkfs.ext4 /dev/sdb

# Create mount point
sudo mkdir -p /opt/projectspace-data

# Mount it
sudo mount /dev/sdb /opt/projectspace-data

# Make it persist across reboots
echo '/dev/sdb /opt/projectspace-data ext4 defaults 0 2' | sudo tee -a /etc/fstab

# Set ownership
sudo chown feline:feline /opt/projectspace-data

# Verify
df -h /opt/projectspace-data
# Should show ~100GB available
```

---

## Step 7: Install Docker Engine + Docker Compose

```bash
# Remove old packages
sudo apt remove docker docker-engine docker.io containerd runc 2>/dev/null

# Install prerequisites
sudo apt update
sudo apt install -y ca-certificates curl gnupg

# Add Docker's GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to docker group
sudo usermod -aG docker feline

# Log out and back in
exit
```

```bash
ssh feline@<BASE_SERVER_PUBLIC_IP>

# Verify
docker run --rm hello-world
docker compose version
```

---

## Step 8: Create Project Structure

```bash
cd /opt/projectspace-data

# Create directory tree
mkdir -p app/app/{auth,models,routes,services}
mkdir -p app/alembic
mkdir -p whisper-service
mkdir -p backups

# Create core files
touch docker-compose.yml .env Caddyfile
touch app/Dockerfile app/requirements.txt
touch app/app/{main.py,config.py,worker.py,__init__.py}
touch app/app/auth/__init__.py
touch app/app/models/__init__.py
touch app/app/routes/__init__.py
touch app/app/services/__init__.py
touch whisper-service/{Dockerfile,server.py}

# Symlink for convenience
sudo ln -s /opt/projectspace-data /opt/projectspace
```

---

## Step 9: Generate Secrets & Create .env

```bash
cd /opt/projectspace

DB_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
MINIO_ACCESS_KEY=$(openssl rand -hex 20)
MINIO_SECRET_KEY=$(openssl rand -hex 32)

cat > .env << EOF
# Database
DB_PASSWORD=${DB_PASSWORD}

# Auth
JWT_SECRET=${JWT_SECRET}
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=24

# MinIO (File Storage)
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY}

# AI Models
LLM_MODEL=qwen2.5:14b-instruct-q4_K_M
EMBEDDING_MODEL=nomic-embed-text
WHISPER_MODEL=large-v3

# Service URLs — LLM and STT point to GPU server via private network
# Update GPU_PRIVATE_IP when you create the GPU instance
OLLAMA_URL=http://\${GPU_PRIVATE_IP}:11434
CHROMA_URL=http://chromadb:8000
STT_URL=http://\${GPU_PRIVATE_IP}:8080
MINIO_URL=minio:9000
REDIS_URL=redis://redis:6379/0
DATABASE_URL=postgresql+asyncpg://app:${DB_PASSWORD}@postgres:5432/projectspace

# GPU server private IP (fill in after creating GPU instance)
GPU_PRIVATE_IP=172.16.0.X

# Domain
DOMAIN=projectspace.yourdomain.com
EOF

chmod 600 .env
```

---

## Step 10: Write the Caddyfile

```bash
cd /opt/projectspace

cat > Caddyfile << 'EOF'
{$DOMAIN} {
    handle /api/* {
        reverse_proxy app:8000
    }
    handle /ws/* {
        reverse_proxy app:8000
    }
    handle /sse/* {
        reverse_proxy app:8000
    }
    handle {
        reverse_proxy app:8000
    }
}
EOF
```

---

## Step 11: Write docker-compose for Base Services

This docker-compose runs on the base server only. No GPU services here — those run on the GPU instance.

```bash
cd /opt/projectspace

cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    environment:
      - DOMAIN=${DOMAIN}
    restart: always

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=projectspace
      - POSTGRES_USER=app
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: always

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    restart: always

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=${MINIO_ACCESS_KEY}
      - MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}
    volumes:
      - filedata:/data
    restart: always

  chromadb:
    image: chromadb/chroma:latest
    volumes:
      - vectordata:/chroma/chroma
    environment:
      - ANONYMIZED_TELEMETRY=FALSE
      - PERSIST_DIRECTORY=/chroma/chroma
    restart: always

volumes:
  caddy_data:
  caddy_config:
  pgdata:
  redisdata:
  filedata:
  vectordata:
EOF
```

Start it:
```bash
docker compose pull
docker compose up -d
docker compose ps
# All 5 services should show "running"
```

---

## Step 12: Verify Base Services

```bash
# PostgreSQL
docker compose exec postgres psql -U app -d projectspace -c "SELECT 1;"

# Redis
docker compose exec redis redis-cli ping

# MinIO
curl -s http://localhost:9000/minio/health/live && echo "MinIO OK"

# ChromaDB
curl -s http://localhost:8000/api/v1/heartbeat

# Caddy (check if domain + TLS is working)
curl -I https://projectspace.yourdomain.com
# Should return 502 (no app yet) but with valid HTTPS — that means Caddy + TLS works
```

---

## Step 13: Create the GPU Instance (On-Demand)

This is the instance you power on when you need AI, and power off when you don't.

1. In Scaleway Console → **Compute** → **CPU & GPU Instances**
2. Click **Create Instance** → **Create GPU Instance**
3. Configure:
   - **Availability Zone**: Same region as your base server (e.g., `PAR-2` — GPU instances may be in a different AZ within the same region, that's fine for Private Networks)
   - **Instance type**: **L4-1-24G** (1× NVIDIA L4, 24GB VRAM)
   - **Image**: Choose the **GPU Ubuntu** image (comes with NVIDIA drivers + CUDA pre-installed)
   - **Storage**: Default scratch storage is fine (GPU instance data is ephemeral — your persistent data lives on the base server)
   - **Network**: ✅ Public IPv4 (for SSH during setup; you can remove it later)
   - **Name**: `projectspace-gpu`
4. Click **Create Instance**

5. **Attach to Private Network**:
   - Click on the GPU instance → **Private Networks** tab
   - Attach to `projectspace-internal`
   - Note the **private IP** (e.g., `172.16.0.3`)

6. **Update your .env on the base server**:
   ```bash
   ssh feline@<BASE_SERVER_PUBLIC_IP>
   cd /opt/projectspace
   # Edit .env and replace GPU_PRIVATE_IP with the actual private IP
   sed -i 's/GPU_PRIVATE_IP=172.16.0.X/GPU_PRIVATE_IP=172.16.0.3/' .env
   ```

---

## Step 14: Set Up Ollama on the GPU Instance

```bash
# SSH into the GPU instance
ssh root@<GPU_PUBLIC_IP>
```

The Scaleway GPU Ubuntu image comes with NVIDIA drivers pre-installed. Verify:
```bash
nvidia-smi
# Should show the NVIDIA L4 with 24GB VRAM
```

Install Docker:
```bash
apt update && apt install -y docker.io docker-compose-plugin nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

# Verify GPU in Docker
docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
```

Start Ollama:
```bash
# Run Ollama with GPU, listening on all interfaces (so base server can reach it)
docker run -d \
  --name ollama \
  --gpus all \
  --restart always \
  -p 0.0.0.0:11434:11434 \
  -v ollama_models:/root/.ollama \
  ollama/ollama

# Pull models
docker exec ollama ollama pull qwen2.5:14b-instruct-q4_K_M
docker exec ollama ollama pull nomic-embed-text
```

Test from the GPU instance itself:
```bash
curl http://localhost:11434/api/chat -d '{
  "model": "qwen2.5:14b-instruct-q4_K_M",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false
}'
```

Now test from the **base server** over the private network:
```bash
# SSH into base server
ssh feline@<BASE_SERVER_PUBLIC_IP>

# This should work — base server reaching GPU server over private network
curl http://172.16.0.3:11434/api/chat -d '{
  "model": "qwen2.5:14b-instruct-q4_K_M",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false
}'
```

If that works, your closed loop is complete — the base server talks to the GPU over a private network, no public internet involved.

---

## Step 15: Secure the GPU Instance

Once Ollama is confirmed working over the private network, you can lock down the GPU instance:

```bash
# On the GPU instance
ufw allow OpenSSH
ufw allow from 172.16.0.0/22 to any port 11434  # Ollama only from private network
ufw allow from 172.16.0.0/22 to any port 8080   # Whisper (later) only from private network
ufw enable
```

Optionally, remove the public IPv4 from the GPU instance entirely (SSH via the base server as a jump host):
```bash
# From your local machine, SSH to GPU via base server
ssh -J feline@<BASE_SERVER_PUBLIC_IP> root@172.16.0.3
```

---

## Step 16: Power Management for the GPU Instance

The whole point of this setup is that you don't pay for GPU when idle.

**To stop the GPU (stop billing):**
- Scaleway Console → Instance → `projectspace-gpu` → **Power off**
- Or via CLI: `scw instance server stop <GPU_INSTANCE_ID>`

**To start the GPU (resume billing):**
- Scaleway Console → Instance → `projectspace-gpu` → **Power on**
- Or via CLI: `scw instance server start <GPU_INSTANCE_ID>`

**Important**: When you power off, the instance stops billing. When you power back on, Ollama auto-starts (because we set `--restart always`), but models need to be loaded into VRAM on first request (takes 10-15 seconds). The private IP stays the same.

Later you can automate this from your FastAPI app — call the Scaleway API to start/stop the GPU instance based on whether anyone is using AI features.

---

## Day 1 Checklist

- [ ] Scaleway account created, SSH key registered
- [ ] Private Network `projectspace-internal` created
- [ ] Base server (GP1-XS) running, attached to Private Network
- [ ] Domain pointing to base server's public IP
- [ ] SSH hardened (root disabled, key-only, UFW configured)
- [ ] Block Storage mounted at `/opt/projectspace-data`
- [ ] Docker installed and working on base server
- [ ] Base infrastructure running (Caddy, PostgreSQL, Redis, MinIO, ChromaDB)
- [ ] All base services pass health checks
- [ ] GPU instance (L4-1-24G) created, attached to same Private Network
- [ ] Ollama running on GPU instance with models pulled
- [ ] Base server can reach Ollama on GPU via private network
- [ ] GPU instance firewall configured (Ollama only accessible from private network)
- [ ] `.env` updated with GPU private IP
- [ ] GPU instance powered off when not in use (you know how to start/stop it)

---

## Quick Reference — Commands

```bash
# SSH into base server
ssh feline@<BASE_SERVER_PUBLIC_IP>

# SSH into GPU (via base server as jump host)
ssh -J feline@<BASE_SERVER_PUBLIC_IP> root@172.16.0.3

# Start/stop base services
cd /opt/projectspace && docker compose up -d
cd /opt/projectspace && docker compose down

# View logs
docker compose logs -f

# Start GPU instance (Scaleway CLI)
scw instance server start <GPU_INSTANCE_ID>

# Stop GPU instance (stop billing)
scw instance server stop <GPU_INSTANCE_ID>

# Check GPU status
ssh -J feline@<BASE_SERVER_PUBLIC_IP> root@172.16.0.3 nvidia-smi

# Test LLM from base server
curl http://172.16.0.3:11434/api/chat -d '{"model":"qwen2.5:14b-instruct-q4_K_M","messages":[{"role":"user","content":"Hello"}],"stream":false}'

# Check all base services
docker compose exec postgres psql -U app -d projectspace -c "SELECT 1;"
docker compose exec redis redis-cli ping
curl -s http://localhost:8000/api/v1/heartbeat
```
