# LAED GPU Decisions Log

## 2026-05-10

- **laed-base routing:** With flexible IP + `laed-private` DHCP default, the private default route’s **lower metric** (50) can win over the public default (100), breaking SSH to the public IP (replies egress on the wrong NIC). Fix by raising the private default metric (e.g. 200) via `ip route replace` and persisting with **netplan `dhcp4-overrides.route-metric`**; see `infra/laed-base/laed-base-netplan-metrics.yaml.example` and `infra/laed-gpu/README.md`.
- **GPU security group source IP:** `base_server_private_ip_cidr` must be laed-base on **laed-private** (e.g. `172.16.20.3/32`), not **laed-internal** (`172.16.16.2/32`), because packets to the GPU use `ens7` and that source address. Wrong CIDR causes allow rules to never match → timeouts or connection refused at the edge.
- **Ollama data dir ownership:** `ollama.service` runs as **`ollama`**; `/var/lib/ollama` must be **`ollama:ollama`**, not `feline`, or the daemon exits with `mkdir .../models/blobs: permission denied`. Cloud-init now `chown`s after `install.sh` and uses `sudo -u ollama ollama pull` for model pulls.
- **Idle shutdown vs `ollama pull`:** Heartbeat-only idle detection can power off during long pulls. `idle-watcher.sh` now bumps activity when files under `/var/lib/ollama/models` were modified in the last 20 minutes.

## 2026-05-07

- Adopted split-database pattern on `laed-base` Postgres service:
  - LiteLLM DB stores control-plane/runtime metrics (`gpu_uptime_intervals`, `daily_metrics`).
  - RAG DB stores tenant content (`rag.tenants`, `rag.projects`, `rag.documents`, `rag.chunks_*`).
- `BudgetExceeded` behavior keeps third-party fallback enabled.
- Any Terraform diff touching `laed-base` is review-required; no apply without explicit approval.
- Billing alert automation fallback selected:
  - No dedicated `scaleway_billing_alert` Terraform resource currently available.
  - Billing alerts are configured manually in Scaleway console at EUR 30 (warning) and EUR 60 (alarm).
