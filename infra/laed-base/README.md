# laed-base host snippets (Scaleway GPU companion)

Operational files you copy onto **`laed-base`** (Ubuntu on Scaleway), **not** meant to be installed from macOS paths like `/etc/default` (that directory **does not exist on macOS** — run these steps **over SSH on laed-base**).

## Layout

| File | Typical install target |
|------|-------------------------|
| `laed-base-gpu-poweron.sh` | `/usr/local/bin/laed-base-gpu-poweron.sh` |
| `laed-base-gpu-control.env.example` | `/etc/default/laed-gpu-control` (fill secrets; `chmod 600`) |
| `ssh-config-laed-base-gpu.fragment` | append to `~/.ssh/config` or `~/.ssh/config.d/` |
| `laed-base-netplan-*.yaml` | `/etc/netplan/` (see comments in each file) |
| `laed-base-fix-default-route-metric.sh` | run once on base (emergency routing) |
| `gpu-setup.sh`, `pull-models.sh`, `gpu-compose.yml` | manual GPU bootstrap only (Terraform + cloud-init is canonical) |
| `laed-gpu-idle-watcher.sh` | reference copy of idle-watcher logic (live path on GPU is `/usr/local/bin/idle-watcher.sh` from cloud-init) |

## Common mistakes

1. **`cp: /etc/default/laed-gpu-control: No such file or directory` on a Mac** — You are not on Ubuntu. **`/etc/default`** is for **Debian/Ubuntu** servers. Copy the env file **on `laed-base`** after SSH, or create the parent only if you truly have a Linux box without `/etc/default` (rare for Ubuntu): `sudo mkdir -p /etc/default`.

2. **Broken destination path** — The filename must be **`laed-gpu-control`** in one line. If the shell sees `/etc/default/laed-gpu-cont` then a newline then `rol`, the destination is wrong.

3. **Power-on script** — After installing `/etc/default/laed-gpu-control` as **root:root chmod 600**, run **`sudo laed-base-gpu-poweron.sh`** so root can read the secrets file.

## Example (run on laed-base after git pull or scp)

```bash
sudo cp infra/laed-base/laed-base-gpu-poweron.sh /usr/local/bin/laed-base-gpu-poweron.sh
sudo chmod 755 /usr/local/bin/laed-base-gpu-poweron.sh
sudo cp infra/laed-base/laed-base-gpu-control.env.example /etc/default/laed-gpu-control
sudo chmod 600 /etc/default/laed-gpu-control
sudo nano /etc/default/laed-gpu-control   # fill SCW_* and GPU_*
sudo laed-base-gpu-poweron.sh
```

(Adjust the source path if your clone is not in the current directory.)
