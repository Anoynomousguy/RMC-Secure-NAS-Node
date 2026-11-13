# 00 — Setup Guide

How this NAS server was built, from bare hardware to the running stack.

## 1. Hardware

- Lenovo ThinkPad, Intel Core i5 M520, 4–8 GB RAM, one internal SSD.
- Wired NIC: `enp0s25` (Ethernet only; the Wi-Fi card firmware is not installed).
- The machine runs headless. All work is done over SSH.

## 2. Installing Debian over the network

The original Linux Mint installation was replaced remotely with a Debian
netboot installer. No USB drive was used.

1. **Boot the installer.** Two methods were tried:
   - `kexec` (load the installer kernel from the running OS and jump to it)
     hung this older ThinkPad firmware at the hand-off, so it was abandoned.
   - **GRUB one-shot entry** (the method used): the installer `linux` and
     `initrd.gz` were copied to `/boot/debian-installer/`, a custom GRUB entry
     in `/etc/grub.d/40_custom` booted them once, and the machine rebooted.
2. **Preseed.** The installer ran unattended with `auto=true priority=critical`
   and a preseed file embedded in the initrd. The preseed:
   - selected the target disk and the `atomic` partitioning recipe,
   - configured the static address, root password, and the administrator
     account with passwordless `sudo`,
   - installed `openssh-server`, `sudo`, `curl`, and `gnupg`,
   - installed GRUB for BIOS/GPT (the `atomic` recipe creates a `bios_grub`
     partition, which legacy BIOS boot on GPT requires).
3. **Network console.** The installer enabled the `network-console` module so
   the installation could be monitored over SSH as the `installer` user.
4. After the first boot, the machine was updated, hardened, and joined to a
   Tailscale tailnet.

## 3. Docker

Docker Engine and the Compose plugin are installed from Docker's official
repository. All services run from a single Compose project in
`/srv/fortress`.

```sh
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100
```

Every service declares `restart: unless-stopped` and a hard `mem_limit`, so a
single misbehaving container cannot exhaust the host.

## 4. Storage layout

| Path | Purpose |
| --- | --- |
| `/srv/fortress/docker-compose.yml` | Service definitions |
| `/srv/fortress/.env` | All secrets (mode 0600, root-owned) |
| `/srv/fortress/data` | Shared file data (`user1/`, `user2/`, `uploads/`) |
| `/srv/fortress/authelia` | Authelia templates and rendered config/SQLite |
| `/srv/fortress/caddy` | Caddyfile and access logs |
| `/srv/fortress/portal` | Web portal source (React + Express) |
| `/srv/fortress/crowdsec` | Copies of the host CrowdSec acquisition files |
| `/srv/fortress/scripts` | Rendering and maintenance helpers |
| `/srv/fortress/docs` | These manuals |

## 5. Services

| Service | Internal address | External (tailnet) |
| --- | --- | --- |
| Dufs (files + WebDAV) | `127.0.0.1:8443` | `https://YOUR_NAS_HOST:8443` (UI via SSO, WebDAV at `/dav`) |
| Vaultwarden | `127.0.0.1:8081` | `https://YOUR_NAS_HOST` (port 443) |
| Authelia (SSO) | `127.0.0.1:9091` | `https://YOUR_NAS_HOST:9091` |
| Caddy (auth proxy) | `127.0.0.1:8083`, `127.0.0.1:8090` | via Tailscale Serve |
| Web portal | `127.0.0.1:3000` | `https://YOUR_NAS_HOST:3000` |
| Uptime Kuma | `127.0.0.1:3001` | `https://YOUR_NAS_HOST:3001` |

External access is provided by Tailscale Serve, which terminates HTTPS with a
valid certificate for the node's MagicDNS name and proxies to the loopback
listeners. No inbound ports are opened on the router.

## 6. Reproducing the setup

1. Install Debian 12 (bookworm) with an SSH server and a `sudo` user.
2. Install Docker Engine and the Compose plugin.
3. Join the Tailscale tailnet and note the node's MagicDNS name; enable
   Tailscale Serve and HTTPS certificates for the tailnet.
4. Clone/copy the `/srv/fortress` project.
5. Create `.env` from `.env.example`, generate every secret (see
   `02_PASSWORD_MANAGEMENT.md`), then run
   `python3 scripts/render_authelia_config.py`.
6. Create the data tenants and quotas (see `01_ADMIN_MANUAL.md`).
7. `sudo docker compose up -d`, then publish the services:

   ```sh
   sudo tailscale serve --bg --https=443  http://127.0.0.1:8081
   sudo tailscale serve --bg --https=8443 http://127.0.0.1:8083
   sudo tailscale serve --bg --https=9091 http://127.0.0.1:9091
   sudo tailscale serve --bg --https=3000 http://127.0.0.1:8090
   sudo tailscale serve --bg --https=3001 http://127.0.0.1:3001
   ```

8. Install CrowdSec on the host (see `04_SECURITY_AUDIT.md`).
9. Verify with `sudo docker compose ps`, the health endpoints, and the
   verification checklist in `04_SECURITY_AUDIT.md`.

## 7. Backups

Back up, at minimum:

- `/srv/fortress/.env` (it contains the only copies of several secrets),
- the Docker volumes `fortress_vaultwarden_data` and `fortress_kuma_data`,
- `/srv/fortress/authelia/db.sqlite3` and `users_database.yml`,
- `/srv/fortress/data` (the user files),
- `/root/NAS_EMERGENCY_RECOVERY.txt` (store it in a password manager).

See `02_PASSWORD_MANAGEMENT.md` for recovery details.
