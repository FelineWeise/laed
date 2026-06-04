# LAED GPU Terraform Stack

This stack provisions the on-demand GPU inference layer with defense-in-depth cost control.

## Canonical stack notice

For this rollout, this directory is the canonical Terraform root.
Do not run a second duplicate Terraform stack against the same Scaleway resources in parallel (conflicting state / ownership).

## Pre-flight

### Remote state (S3 backend)

The `backend "s3"` block targets **Scaleway Object Storage** (`s3.fr-par.scw.cloud`). Terraform uses **AWS-compatible env vars** for that backend, not `terraform.tfvars`. Before `terraform init` / `plan` / `apply` on your laptop:

```bash
export AWS_ACCESS_KEY_ID="<same as Scaleway access key>"
export AWS_SECRET_ACCESS_KEY="<same as Scaleway secret key>"
```

Use the same values as `scw_access_key` / `scw_secret_key` in `terraform.tfvars`. Optional: put them in a small wrapper script or a **direnv** `.envrc` that is **not** committed.

If you omit these, Terraform tries the EC2 metadata service (`169.254.169.254`) and fails with *No valid credential sources found*.

### Variables

1. Copy `terraform.tfvars.example` to `terraform.tfvars`.
2. Fill real values for:
  - `scw_access_key`, `scw_secret_key`, `scw_project_id`
  - `base_zone` (zone of existing `laed-base`, typically `fr-par-1`)
  - `laed_base_instance_id`
  - `base_server_private_ip_cidr`
  - `feline_ssh_pubkey`
3. Ensure `laed-tfstate-prod` bucket exists with versioning enabled.

## Workflow

```bash
terraform init -reconfigure
terraform plan
terraform apply
```

## Notes

- GPU has no public IP configured.
- Models volume has `prevent_destroy = true`.
- `cloud-init.yaml.tftpl` uses `$${...}` for bash-time interpolation and `${...}` for Terraform template interpolation.
- Billing alerts currently require manual Scaleway console setup.

### laed-base: SSH to flexible IP times out (multi-NIC)

If `laed-base` has a **flexible IP** plus **laed-private** (public gateway / DHCP default), the **private** default route often gets **metric 50** and wins over the **public** default (**metric 100**). SYNs arrive on the public NIC, but **SYN-ACKs leave via the private NIC**, so clients see TCP timeouts (`tcpdump` shows `In` on `ens2` and `Out` on `ens7`).

1. **Immediate** (console): `sudo ip route del default via 172.16.20.4 dev ens7 metric 50` when DHCP has re-added the bad route; then `sudo ip route replace default via 172.16.20.4 dev ens7 metric 200` if the private default is missing. This is **not** permanent — DHCP will recreate metric **50** until netplan overrides it.
2. **Persistent (required)**: set DHCP route metrics in netplan so **private NIC default is 200** and **public NIC default is lower** (e.g. 50). If `50-cloud-init.yaml` only defines `ens2`, use the drop-in **`infra/laed-base/laed-base-netplan-99-route-metrics.yaml`** (copy to `/etc/netplan/99-laed-route-metrics.yaml`). Otherwise adapt **`infra/laed-base/laed-base-netplan-metrics.yaml.example`**, then:
   - `sudo netplan generate`
   - `sudo netplan try` (confirm within 120s or it reverts)
   - `sudo netplan apply`
   If netplan reports duplicate `ens2`/`ens7` keys, edit the **existing** `/etc/netplan/*.yaml` and add only the `dhcp4-overrides.route-metric` blocks under each interface (see the example file’s section 3b).
3. **Verify**: `ip route show | grep '^default'` must **not** list two different metrics for the same private gateway; `ip route get 8.8.8.8 from 51.15.207.5` must show **`dev ens2`** (public).
4. **If metric 50 returns** after apply: `sudo systemctl restart systemd-networkd`, then re-check routes; ensure no second DHCP client is running (`ps aux | grep -E 'dhclient|dhcpcd'`).

**Terraform note:** Netplan / route metrics are **not** managed by this stack (they live on `laed-base` in `/etc/netplan/`). Terraform only needs the correct `base_server_private_ip_cidr` for **GPU security group** rules (must be laed-base’s IP on **laed-private**, typically `172.16.20.3/32`).

### SSH from laed-base to GPU (like `ssh gpu`)

On **laed-base** there is no `ProxyJump` — the GPU is on **`laed-private`**. Copy **`infra/laed-base/ssh-config-laed-base-gpu.fragment`** into `~/.ssh/config` (or `~/.ssh/config.d/` + `Include`). Then:

```bash
ssh gpu
```

Ensure **`~/.ssh/id_ed25519-scaleway`** (or whatever you set in `IdentityFile`) exists on the base host.

### Power on the GPU from laed-base (script)

Copy **`infra/laed-base/laed-base-gpu-poweron.sh`** to **`/usr/local/bin/`** on **`laed-base`**, **`chmod +x`**, and install config from **`infra/laed-base/laed-base-gpu-control.env.example`** as **`/etc/default/laed-gpu-control`** (fill **`SCW_*`**, **`SCW_DEFAULT_ORGANIZATION_ID`** if you use **`scw`**, and confirm **`GPU_ZONE`** / **`GPU_SERVER_ID`**). Run these steps **on laed-base** (Ubuntu has `/etc/default/`; macOS does not). If **`SCW_DEFAULT_ORGANIZATION_ID`** is empty, the script uses **`curl`** instead of **`scw`** (still works). Then:

```bash
sudo laed-base-gpu-poweron.sh
```

The script **GETs instance state first**: if state is **`running`** or **`starting`**, it exits successfully without calling **`poweron`** (Scaleway returns *“server should be stopped”* if you **`poweron`** while already on). If **`scw`** is installed **and** **`SCW_DEFAULT_ORGANIZATION_ID`** is set, it uses **`scw`**; otherwise **`curl`**. Requires IAM permission to read and start the GPU instance.

### GPU: Ollama and heartbeat debugging

From **laed-base**, the GPU is usually `172.16.20.2` (verify in console / `terraform output`). **Connection refused** on `11434` / `11435` means the service is down or not listening, not routing — after fixing base routing and SG, check on the GPU:

1. `sudo systemctl status ollama heartbeat` and `journalctl -u ollama -u heartbeat -n 80 --no-pager`
2. `ss -ltnp | grep -E '11434|11435'` — expect listeners on `0.0.0.0` (Ollama override sets `OLLAMA_HOST=0.0.0.0:11434`).
3. `curl -sS http://127.0.0.1:11434/api/tags` and `curl -sS http://127.0.0.1:11435/healthz` on the GPU.
4. From base: `curl -sS http://172.16.20.2:11434/api/tags` and same for `:11435/healthz`.
5. If SG still blocks: ensure `terraform.tfvars` has `base_server_private_ip_cidr = "172.16.20.3/32"` (or your actual laed-private /32), then `terraform apply` so **laed-gpu-sg** allows that source for TCP 22 / 11434 / 11435.

### GPU idle shutdown (cost control)

Cron runs **`/usr/local/bin/idle-watcher.sh`** every **5** minutes. If **`/var/run/gpu-last-activity`** is older than **`IDLE_TIMEOUT_SECONDS`** (default **900**), the instance **powers off**. That file is updated by **`POST http://<gpu>:11435/heartbeat`** (your controller) and, in current cloud-init, by **recent writes under `/var/lib/ollama/models`** so **`ollama pull` is not interrupted** mid-download.

On an **already provisioned** GPU, copy the updated `idle-watcher.sh` logic from `cloud-init.yaml.tftpl` onto `/usr/local/bin/idle-watcher.sh`, or temporarily raise **`IDLE_TIMEOUT_SECONDS`** in `/etc/default/laed-gpu-cost-control` during bulk pulls.

