# LAED — agent baseline

Principle-based Cursor rules: `.cursor/rules/*.mdc` (core always-on; domain rules by glob). Sovereignty USP (EU closed-loop, UI trust cues): `security-sovereignty.mdc`. Mobile PWA usability & responsive layout: `mobile-pwa-ux.mdc`. Facts live here and in `docs/`—rules teach how to work, not copy-paste runbooks.

Secure collaboration platform (laed.eu). Backend at `/opt/laed` on `laed-base`,
on external network `llm-backbone` alongside llm-gateway and OpenClaw.

## Architecture

- Backend: FastAPI (Python), Poetry, async SQLAlchemy 2.0 + Alembic
- Database: PostgreSQL 16 + pgvector
- File storage: MinIO (S3-compatible)
- Task queue: Celery + Redis
- LLM: via shared LiteLLM gateway (not in this compose stack)
- STT: Parakeet (in-stack CPU service)
- Reverse proxy: Caddy with auto-TLS
- Registry: Scaleway CR (`rg.fr-par.scw.cloud/laed`)
- IaC: Terraform (`infra/laed-gpu/`)

## LLM gateway integration

LAED does **not** run LiteLLM. See `SHARED_LITELLM.md` for the full contract.

- `LLM_GATEWAY_URL=http://litellm:4000/v1`
- `LLM_GATEWAY_KEY` must match `LITELLM_MASTER_KEY` in `/opt/llm-gateway/.env`
- `LLM_MODEL` / `EMBEDDING_MODEL` — gateway canonical ids (`ollama/...`)
- Gateway-internal vars stay in llm-gateway only

Start order: llm-gateway up first, then LAED.

## Deploy

- Build/push off-server:
  - Backend: `scripts/push_to_scaleway_registry.sh`
  - Frontend: `scripts/push_frontend_to_scaleway_registry.sh`
  - Both: `scripts/push_laed_images.sh`
- Server path: `/opt/laed`. Pin images in `.env`: `LAED_BACKEND_IMAGE`, `LAED_FRONTEND_IMAGE`.
- Post-deploy: `docker compose pull` + `up -d --force-recreate` for changed services; `alembic upgrade head` after backend changes.
- Consumer verify: `scripts/verify-litellm-gateway.sh` from app container.
- No builds on server.

Full cross-repo deploy contract: `scaleway-push-template.md` in Repositories root.

## Code conventions

- Python: Poetry for dependencies, type hints everywhere
- Always use async/await for database operations
- JWT auth with project-scoped claims
- API endpoints follow REST conventions at `/api/...`
- Config via `pydantic-settings`, never raw `os.environ`

## Sibling service: OpenClaw

OpenClaw runs at `/opt/openclaw`, standalone (NOT in LAED's compose), on the
same `llm-backbone` network. It uses the same gateway secret under a different
variable name (`LLM_GATEWAY_KEY` ⇔ `LITELLM_MASTER_KEY`). If you change LAED's
gateway integration, the operator-facing env names (`LLM_GATEWAY_URL`,
`LLM_GATEWAY_KEY`, `LLM_MODEL`) should stay in parity with OpenClaw's `.env`.
LAED uses gateway model ids directly; OpenClaw qualifies them as
`litellm/<gateway_id>`.
