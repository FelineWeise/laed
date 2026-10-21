# LAED CI runbook (CI only — no Deploy)

Build/push/pin for `backend` + `frontend`. **No Deploy workflow** — `/opt/laed` app/worker/frontend are not rolled by Actions while LAED stays inactive.

Keep **Caddy** up if Mac clients need `https://litellm.laed.eu` (see llm-gateway `docs/mac-client.md`).

Tracked pins: [`../infrastructure/deploy/image.env`](../infrastructure/deploy/image.env).

## Branches

CI runs on:

- `main`
- `LAED-v1.1-refactoring` (current work branch)

Pin commits are pushed back to the branch that triggered the release job.

## Ship images (registry only)

1. PR → **CI → Build images**
2. Merge/push → **CI → Build, push, and pin** → updates `image.env`

Manual server apply later (when you want LAED live again):

```bash
ssh scw-base 'cd /opt/laed && /* copy image.env, then */ docker compose --env-file .env --env-file image.env pull app worker frontend && docker compose --env-file .env --env-file image.env up -d --force-recreate app worker frontend'
```

## GitHub Environment `production`

### Variables

| Name | Example |
|------|---------|
| `REGISTRY_HOST` | `rg.fr-par.scw.cloud` |
| `REGISTRY_NAMESPACE` | `laed` |
| `REGISTRY_IMAGE_BACKEND` | `backend` |
| `REGISTRY_IMAGE_FRONTEND` | `frontend` |

### Secrets

| Name | Value |
|------|--------|
| `REGISTRY_USERNAME` | `nologin` |
| `REGISTRY_PASSWORD` | Scaleway secret key |

No `DEPLOY_*` until you deliberately add Deploy later.
