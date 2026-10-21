# LAED CI runbook (CI only — no Deploy)

Build/push/pin for `backend` + `frontend`. **No Deploy workflow** — `/opt/laed` app stack is not rolled by Actions while LAED stays inactive.

Keep **Caddy** up on the server if Mac clients need `https://litellm.laed.eu`.

Tracked pin file: [`image.env`](./image.env).

## Branches

CI runs on:

- `main`
- `LAED-v1.1-refactoring` (current work branch)

Pin commits are pushed back to the branch that triggered the release job.

## Ship images (registry only)

1. PR → **CI → Build images**
2. Merge/push → **CI → Build, push, and pin** → updates `image.env`

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
