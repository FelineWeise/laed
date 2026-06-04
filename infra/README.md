# LAED `infra/` layout

- **`laed-gpu/`** — Canonical Terraform root for the on-demand GPU inference rollout (`terraform init/plan/apply` here only).
- **`laed-base/`** — Host snippets copied onto **`laed-base`** (netplan, GPU power-on script, SSH fragment, manual GPU bootstrap helpers). See `laed-base/README.md`.

## Rule

Do not maintain a second duplicate Terraform tree for the same Scaleway resources; a single state root avoids drift and conflicting ownership.
