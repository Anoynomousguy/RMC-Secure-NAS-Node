# 04 — Security Audit

Current security posture, controls, and residual risks. Re-run the commands
below after any change.

## 1. Host hardening

- OMV's web stack (`openmediavault-engined`, `nginx`, `php8.2-fpm`) is stopped,
  disabled, and masked. OMV remains on disk for recovery but does not listen.
- OpenSSH:
  - `PermitRootLogin no`
  - `PasswordAuthentication no`
  - `KbdInteractiveAuthentication no`
  - `PubkeyAuthentication yes`
  - Only the administrator account can log in over SSH; root is `sudo` only.
- UFW (default deny incoming, allow outgoing):

  ```
  22/tcp                     ALLOW  (break-glass SSH)
  tailscale0                 ALLOW
  41641/udp                  ALLOW  (Tailscale direct)
  ```

  All application ports are published to `127.0.0.1` only. Nothing is exposed
  to the LAN; the only way in is SSH or the tailnet.

- Unattended upgrades install Debian security patches automatically
  (`apt-daily`, `apt-daily-upgrade`, `unattended-upgrades` timers).
- `tailscaled`, `docker`, and `ufw` are enabled at boot.

```sh
sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication|kbdinteractive'
sudo ufw status verbose
systemctl is-enabled tailscaled docker ufw unattended-upgrades
systemctl list-timers 'apt*'
```

## 2. Zero-trust network

- Tailscale (WireGuard) is the transport. Each device authenticates to the
  tailnet individually; the physical LAN is not trusted.
- Tailscale Serve terminates HTTPS with a trusted certificate for the node's
  MagicDNS name and proxies to loopback services:
  443 → Vaultwarden, 8443 → Caddy (Dufs UI/WebDAV), 9091 → Authelia,
  3000 → Caddy (portal), 3001 → Uptime Kuma.
- No router port-forwarding is required or configured.
- Recommended: tighten the tailnet ACL so only family devices can reach the
  NAS, and only on the ports above. `tailscale status` / the admin console is
  the source of truth for device access.

```sh
sudo tailscale status
sudo tailscale serve status
```

## 3. Single sign-on (Authelia)

- Authelia 4.39.28 runs in Docker, listening only on `127.0.0.1:9091`, with
  SQLite storage at `/srv/fortress/authelia/db.sqlite3`.
- Forward auth is enforced by Caddy 2.11.9:
  - `:8083` protects the Dufs web UI (the `/dav` WebDAV path uses Dufs Basic
    auth for the mobile app).
  - `:8090` protects the web portal.
  - Caddy passes `Remote-User`, `Remote-Groups`, `Remote-Name`, `Remote-Email`
    to the portal after a successful check.
- Access policy: `one_factor` for every protected request; sessions are
  `SameSite=Lax`, 30 min idle / 1 hour default / 1 month remember-me.
- Regulation: 5 failed attempts within 2 minutes from one IP → 10 minute ban.
- Secrets (session, storage encryption, JWT) come from `.env`; account
  passwords are Argon2id hashes rendered into `users_database.yml`. The
  rendered files are git-ignored.

```sh
curl -s http://127.0.0.1:9091/api/health
sudo docker compose -f /srv/fortress/docker-compose.yml logs authelia | tail -20
```

## 4. Intrusion detection (CrowdSec)

- CrowdSec 1.8.2 runs on the host with:
  - `crowdsecurity/linux` and `crowdsecurity/sshd` (brute-force detection from
    the systemd journal),
  - `crowdsecurity/caddy` (JSON access-log parsing from
    `/srv/fortress/caddy/logs/access.log`),
  - the iptables firewall bouncer, which creates a `CROWDSEC_CHAIN` in the
    `INPUT` path and drops banned source IPs.
- Verify:

  ```sh
  sudo systemctl is-active crowdsec crowdsec-firewall-bouncer
  sudo cscli collections list | grep -E 'sshd|caddy'
  sudo cscli metrics
  sudo cscli decisions list
  sudo cscli decisions add --ip 192.0.2.10 --duration 1m --reason test
  sudo iptables -S | grep CROWDSEC
  sudo cscli decisions delete --ip 192.0.2.10
  ```

- **Known limitation:** the default CrowdSec whitelist ignores private and
  shared address ranges (including Tailscale's CGNAT range). Attacks that
  arrive *through the tailnet* are therefore not auto-banned at the firewall;
  SSH brute force from public/internet-facing paths and any non-whitelisted
  source is handled normally. Tailscale ACLs and key-only SSH remain the
  primary controls for tailnet traffic.

## 5. Secrets management

- `/srv/fortress/.env` is `0600`, root-owned; it holds Dufs credentials, the
  Vaultwarden admin hash, Authelia secrets and account hashes, and the Dufs
  proxy Basic credential.
- `/root/NAS_EMERGENCY_RECOVERY.txt` is `0600` and holds the plaintext master
  passwords plus restore steps. Keep a copy in a password manager.
- `.gitignore` excludes `.env`, `*.key`, `*.pem`, `data/`, the rendered
  Authelia files, and Caddy logs.
- The portal receives identity from Authelia through Caddy and never stores
  passwords. Dufs receives a SHA-512 hash, not the plaintext.

```sh
sudo stat -c '%a %U:%G %n' /srv/fortress/.env /root/NAS_EMERGENCY_RECOVERY.txt
sudo git -C /srv/fortress check-ignore -v .env
sudo grep -RIlE 'password|token|secret' /srv/fortress --exclude-dir=.git --exclude-dir=data | head
```

## 6. Container hardening

- Every service has `restart: unless-stopped`, a `mem_limit`/`memswap_limit`,
  and `no-new-privileges: true`.
- Memory caps: Dufs 128 MB, Vaultwarden 256 MB, Authelia 256 MB, Caddy 64 MB,
  portal 512 MB, Uptime Kuma 256 MB. Host total is small; the caps keep the
  machine responsive under load.
- Application ports bind to `127.0.0.1`; containers reach each other by
  service name on the Compose network.
- The portal runs as root inside its container so it can manage every tenant
  directory. This is an administrative capability, not a tenant boundary:
  use the portal only for trusted family administration, and rely on Linux
  ownership + quotas + Authelia scoping for isolation between users.

```sh
cd /srv/fortress
sudo docker compose ps
sudo docker inspect $(sudo docker compose ps -q) \
  --format '{{.Name}} mem={{.HostConfig.Memory}} restart={{.HostConfig.RestartPolicy.Name}}'
sudo docker stats --no-stream
```

## 7. Verification checklist

```sh
# Host
sudo ufw status verbose
sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication'
systemctl is-enabled tailscaled docker ufw unattended-upgrades

# SSH key login still works, root is refused
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519 YOUR_USERNAME@YOUR_LAN_IP true && echo ssh_ok

# Services
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9091/api/health   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8443/__dufs__/health  # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/            # 200/302

# SSO redirect for the Dufs UI and the portal
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -H 'Host: YOUR_NAS_HOST' http://127.0.0.1:8083/
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -H 'Host: YOUR_NAS_HOST' http://127.0.0.1:8090/

# CrowdSec
sudo cscli bouncers list
sudo cscli decisions list
```

## 8. Residual risks and guidance

1. **Tailnet ACL is the real boundary.** A compromised tailnet identity can
   reach the published ports. Enforce least privilege in the Tailscale admin
   console and keep device keys protected.
2. **CrowdSec cannot see real client IPs for HTTP** proxied by Tailscale Serve
   (it sees `127.0.0.1`), so web attack detection has limited value; SSH
   detection is the meaningful path.
3. **Portal root capability** (see 6). Keep the portal admin login for trusted
   administrators only.
4. **Emergency kit** contains plaintext secrets on disk. Move it to a password
   manager and protect the server against physical access.
5. **Dufs `/dav` Basic credential** is shared between the mobile app and the
   admin. Rotate it if a device is lost, then update the app.
6. Consider enabling full-disk encryption only when a reinstall opportunity
   arises (it was not enabled at install time on this legacy BIOS machine).
