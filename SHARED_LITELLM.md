# LAED Shared LiteLLM Wiring

LAED no longer runs LiteLLM in this compose stack. `app` and `worker` consume a shared LiteLLM gateway on external Docker network `llm-backbone`.

## Schema X model ids (gateway canonical)

Public ids on the gateway (`GET /v1/models`):

| Tier | Pattern | Example |
|------|---------|---------|
| scaleway | `scaleway/<slug>` | `scaleway/qwen3.6-35b` (EU-primary, Scaleway Generative APIs) |
| thirdparty | `thirdparty/<slug>` | `thirdparty/claude-opus-4-7` (fallback, Eraneos) |
| stt | `stt/<name>` | `stt/parakeet` |

**LAED** uses gateway ids directly in `.env` (`LLM_MODEL=scaleway/qwen3.6-35b`).

**OpenClaw** uses a qualified id: `litellm/<gateway_id>` (e.g. `litellm/scaleway/qwen3.6-35b`).

Use **`GET /v1/model/info`** for metadata (`routing_tier`, `upstream_id`, `litellm_provider`). `/v1/models` `owned_by: "openai"` is a LiteLLM quirk. Do not use `model_info.tier` — LiteLLM reserves that for `free`/`paid` pricing.

Config SSOT: `llm-gateway/scaleway.catalog.yaml` + `models.manifest.yaml` →
`scripts/build_litellm_config.sh` (syncs Scaleway + thirdparty) → `litellm-config.yaml`.

## Required gateway stack

Start the sibling gateway repo first:

```bash
cd /path/to/llm-gateway
docker network create llm-backbone || true
./scripts/build_litellm_config.sh
docker compose up -d
```

## LAED client env contract

Keep these in `laed/.env`:

- `LLM_GATEWAY_URL=http://litellm:4000/v1` (or `OPENAI_BASE_URL` — same value)
- `LLM_GATEWAY_KEY` / `OPENAI_API_KEY` — budgeted virtual key from `llm-gateway/scripts/provision_consumer_keys.sh` (not `LITELLM_MASTER_KEY`)
- `LLM_MODEL` / `EMBEDDING_MODEL` — gateway canonical ids (`scaleway/qwen3.6-35b`, `scaleway/qwen3-embedding-8b`)
- `RAG_DATABASE_URL` — optional until the dedicated RAG database exists; apply `llm-gateway/alembic/versions/20260507_02_rag_schema.sql` there (see `llm-gateway/README.md`)

`THIRDPARTY_LITELLM_*`, `SCALEWAY_GENAI_*`, `SCW_*`, and LiteLLM’s own DB URLs are **only** in `llm-gateway/.env`.

Legacy `laed/litellm-config.yaml` is deprecated — use `llm-gateway` only.

## Start order

1. `llm-gateway` up first
2. `laed` stack up second

```bash
cd /path/to/laed
docker compose up -d
```

## Validation

**Both stacks must attach to external network `llm-backbone`** (`llm-gateway` creates it; `laed/docker-compose.yml` already references it as `external: true`).

List models (from LAED `app` container — uses the same env as the backend):

```bash
cd /path/to/laed
docker compose exec -T app python - <<'PY'
import os, httpx
base = os.environ["LLM_GATEWAY_URL"].rstrip("/")
key = os.environ["LLM_GATEWAY_KEY"]
r = httpx.get(f"{base}/models", headers={"Authorization": f"Bearer {key}"}, timeout=30.0)
r.raise_for_status()
for m in r.json().get("data", [])[:20]:
    print(m.get("id"))
PY
```

Consumer-style chat (same URL/key as `app/services/llm.py`):

```bash
docker compose exec -T app python - <<'PY'
import os, httpx
b = os.environ["LLM_GATEWAY_URL"].rstrip("/")
k = os.environ["LLM_GATEWAY_KEY"]
model = os.environ.get("LLM_MODEL", "ollama/qwen3:4b-instruct")
r = httpx.post(
    f"{b}/chat/completions",
    headers={"Authorization": f"Bearer {k}"},
    json={
        "model": model,
        "messages": [{"role": "user", "content": "Reply with one word: pong"}],
        "stream": False,
    },
    timeout=300.0,
)
r.raise_for_status()
print("model:", model)
print(r.json()["choices"][0]["message"]["content"][:200])
PY
```

Gateway-side smoke: in `llm-gateway` repo, `./scripts/verify-phase6.sh`.

Embedding dimensions (confirm before relying on `qwen3-embedding:8b` with `vector(4096)`):

```bash
./scripts/check-embedding-dims.sh
```

## Rollback

If cross-stack DNS/network wiring fails:

1. Revert `laed/docker-compose.yml` to in-stack LiteLLM service version.
2. Run `docker compose up -d` in `laed`.
3. Optionally keep `llm-gateway` running for diagnostics, or stop it.
