# LAED Deployment Guide

## Prerequisites

- Scaleway account with a GP1-XS instance (base server) running Ubuntu 24.04
- Docker 29+ and Compose v5+ installed on the server
- Scaleway CLI (`scw`) installed locally: `brew install scw`
- Scaleway Container Registry namespace created
- Domain `laed.eu` pointing to the server's public IP
- Tailscale installed on both server and local machine

## Architecture

```
Local Mac                    Scaleway Registry              Base Server (GP1-XS)
┌──────────┐   docker push   ┌──────────────┐  docker pull  ┌─────────────────────┐
│ Build    │ ───────────────► │ rg.fr-par.   │ ◄──────────── │ docker compose up   │
│ backend  │                  │ scw.cloud/   │               │                     │
│ image    │                  │ laed/backend │               │ caddy, app, worker  │
└──────────┘                  └──────────────┘               │ postgres, redis     │
                                                             │ minio, litellm      │
                                                             │ parakeet            │
                                                             └─────────────────────┘
```

## Initial Setup (one-time)

### 1. Scaleway CLI

```bash
brew install scw
scw init
# Enter your Access Key, Secret Key, Organization ID, Project ID
# Default zone: fr-par-1, Default region: fr-par
```

### 2. Container Registry

```bash
# Create the namespace
scw registry namespace create name=laed region=fr-par

# Log Docker in
scw registry login
```

### 3. Server File Layout

On the server at `/opt/projectspace-data/`:

```
/opt/projectspace-data/
├── .env                    ← secrets (not in git)
├── litellm-config.yaml     ← LLM gateway config (not in git)
├── docker-compose.yml      ← symlink or copy from repo
└── Caddyfile               ← symlink or copy from repo
```

Create the compose and Caddy files on the server:

```bash
ssh scw
cd /opt/projectspace-data

# Copy compose and Caddyfile (or symlink from a cloned repo)
# Option A: download directly from the registry-compatible compose
scp your-mac:~/Desktop/Repositories/laed/docker-compose.yml .
scp your-mac:~/Desktop/Repositories/laed/Caddyfile .
```

### 4. Authenticate Docker on the Server

The server needs to pull from the private Scaleway registry:

```bash
ssh scw

# Install Scaleway CLI on server
curl -s https://raw.githubusercontent.com/scaleway/scaleway-cli/master/scripts/get.sh | sh

# Configure with same credentials
scw init

# Log Docker into the registry
scw registry login
```

## Build and Deploy

### Standard Deploy Workflow

From your local machine:

```bash
cd ~/Desktop/Repositories/laed

# 1. Build for linux/amd64 (server architecture)
docker build --platform linux/amd64 \
  -t rg.fr-par.scw.cloud/laed/backend:latest \
  ./backend

# 2. Push to Scaleway registry
docker push rg.fr-par.scw.cloud/laed/backend:latest

# 3. Deploy on server
ssh scw "cd /opt/projectspace-data && docker compose pull app worker && docker compose up -d"
```

### Tagged Releases

For traceability, tag images with the git commit hash:

```bash
TAG=$(git rev-parse --short HEAD)

docker build --platform linux/amd64 \
  -t rg.fr-par.scw.cloud/laed/backend:${TAG} \
  -t rg.fr-par.scw.cloud/laed/backend:latest \
  ./backend

docker push rg.fr-par.scw.cloud/laed/backend:${TAG}
docker push rg.fr-par.scw.cloud/laed/backend:latest
```

### Run Database Migrations

After deploying a version with schema changes:

```bash
ssh scw "cd /opt/projectspace-data && docker compose exec app alembic upgrade head"
```

## Verification

After deployment, verify all services are healthy:

```bash
ssh scw

cd /opt/projectspace-data

# All containers running
docker compose ps

# API health
curl https://laed.eu/api/health

# PostgreSQL + pgvector
docker compose exec postgres psql -U app -d projectspace \
  -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"

# Tables
docker compose exec postgres psql -U app -d projectspace -c "\dt"

# LiteLLM (localhost only, via Tailscale or on server)
curl -s http://localhost:4000/health

# Parakeet STT
curl -s http://localhost:5092/health
```

## Rollback

To roll back to a previous image:

```bash
# On server
ssh scw
cd /opt/projectspace-data

# Pull and run a specific tagged version
docker compose pull app worker
# Or specify a tag explicitly:
# docker pull rg.fr-par.scw.cloud/laed/backend:<previous-tag>
# docker tag rg.fr-par.scw.cloud/laed/backend:<previous-tag> rg.fr-par.scw.cloud/laed/backend:latest

docker compose up -d app worker
```

## Logs

```bash
ssh scw
cd /opt/projectspace-data

docker compose logs -f app         # API server
docker compose logs -f worker      # Celery worker
docker compose logs -f litellm     # LLM gateway
docker compose logs -f parakeet    # STT service
docker compose logs -f postgres    # Database
docker compose logs -f caddy       # Reverse proxy
```

## Quick Reference

```bash
# ── Full deploy from local ───────────────────────────────
docker build --platform linux/amd64 -t rg.fr-par.scw.cloud/laed/backend:latest ./backend
docker push rg.fr-par.scw.cloud/laed/backend:latest
ssh scw "cd /opt/projectspace-data && docker compose pull app worker && docker compose up -d"

# ── Migrations ───────────────────────────────────────────
ssh scw "cd /opt/projectspace-data && docker compose exec app alembic upgrade head"

# ── Restart a single service ─────────────────────────────
ssh scw "cd /opt/projectspace-data && docker compose restart app"

# ── View live logs ───────────────────────────────────────
ssh scw "cd /opt/projectspace-data && docker compose logs -f app worker"

# ── SSH via Tailscale ────────────────────────────────────
ssh feline@100.73.121.31
```
