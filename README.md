# RMC Secure NAS Node

A Debian 12 host running a private, Tailscale-only file and password service
stack. OMV's web stack is stopped and masked. The running services are **Dufs
v0.47.0** (file server) and **Vaultwarden 1.37.5**, both bound to loopback and
published only through Tailscale Serve over HTTPS.

Dufs replaced FileBrowser because the former upstream project is archived and
receives no security fixes. Dufs is actively maintained and pinned.

## Access

### SSH (break-glass host administration)

SSH is key-only. Password authentication and direct root login are disabled.

```sh
ssh -i ~/.ssh/id_ed25519 YOUR_USERNAME@YOUR_LAN_IP
```

- Direct Ethernet address (current): `YOUR_LAN_IP`
- Tailscale address: `YOUR_TAILSCALE_IP`
- MagicDNS name: `your-nas.your-tailnet.ts.net`
- `YOUR_USERNAME` has passwordless sudo and Docker access.

### Tailscale

Install Tailscale on the client, sign in to the same tailnet, then use the
node's MagicDNS name:

```sh
tailscale status
tailscale ping t410
```

Tailscale Serve must be enabled for the tailnet (HTTPS certificates). The node
publishes:

```sh
sudo tailscale serve --bg --https=443 http://127.0.0.1:8081
sudo tailscale serve --bg --https=8443 http://127.0.0.1:8443
sudo tailscale serve status
```

- Vaultwarden: `https://your-nas.your-tailnet.ts.net/` (port 443)
- Dufs: `https://your-nas.your-tailnet.ts.net:8443/`
- Admin panel: `https://your-nas.your-tailnet.ts.net/admin`

All application traffic is expected to use the tailnet; do not expose these
ports on the public Internet.

### Dufs (file server)

- URL: `https://your-nas.your-tailnet.ts.net:8443/`
- Username: `admin`
- Password: `DUFS_ADMIN_PASSWORD` in `/srv/fortress/.env`

Dufs root is `/srv/fortress/data`. The administrative account can see both
tenant directories. For tenant access, add a scoped Dufs auth rule (for
example `user1:<hash>@/user1:rw`) instead of sharing the admin account.

The container receives only the SHA-512 crypt hash
(`DUFS_ADMIN_PASSWORD_HASH`); the plaintext password stays in the 0600 `.env`
for the human operator.

Health check:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:8443/__dufs__/health
```

### Vaultwarden

- URL: `https://your-nas.your-tailnet.ts.net/`
- Admin panel: `https://your-nas.your-tailnet.ts.net/admin`
- Admin token: the plaintext token is **not** in `.env`; it is stored in your
  password manager. `.env` contains only an Argon2id hash.

Public signups are disabled. Create accounts by invitation from the admin
panel. Vault content is end-to-end encrypted; the server stores ciphertext.

### SSH tunnel fallback

If Tailscale Serve is unavailable, forward the loopback ports over SSH:

```sh
ssh -L 8443:127.0.0.1:8443 -L 8081:127.0.0.1:8081 \
  -i ~/.ssh/id_ed25519 YOUR_USERNAME@YOUR_LAN_IP
```

Then open `http://127.0.0.1:8443` for Dufs and
`http://127.0.0.1:8081` for Vaultwarden. Vaultwarden's web vault requires a
secure context; use the Tailscale HTTPS URL for normal use.

## Secrets

Create `.env` from the template and generate strong values:

```sh
cd /srv/fortress
umask 077
cp .env.example .env

# Dufs operator password and its container hash
DUFS_ADMIN_PASSWORD="$(openssl rand -hex 16)"
DUFS_ADMIN_PASSWORD_HASH="$(openssl passwd -6 "$DUFS_ADMIN_PASSWORD")"

# Vaultwarden Argon2id hash (prompts for the plaintext token)
docker run --rm -it vaultwarden/server /vaultwarden hash

chmod 600 .env
```

`.env` variables:

- `VAULTWARDEN_ADMIN_TOKEN` — Argon2id PHC hash.
- `DUFS_ADMIN_PASSWORD` — plaintext operator login password.
- `DUFS_ADMIN_PASSWORD_HASH` — SHA-512 crypt hash used by the container.
- `VAULTWARDEN_DOMAIN` — `https://your-nas.your-tailnet.ts.net`.

`.env` is git-ignored and must never be committed. `.env.example` contains
placeholders only. The compose file reads secrets from the environment.

During the ORM migration, a root-only recovery copy of the Vaultwarden
plaintext token was created at `/root/.vaultwarden-admin-token`. Move it to
your password manager, then remove it with `sudo shred -u
/root/.vaultwarden-admin-token`.

## Deploy and operate

```sh
cd /srv/fortress
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 dufs vaultwarden
```

The old FileBrowser services and volumes are removed. Re-running `up -d` after
a secret change recreates the affected container.

## Storage, tenants, and quotas

- Data root: `/srv/fortress/data`
- Tenant directories: `/srv/fortress/data/user1`, `/srv/fortress/data/user2`
- Both are owned by their respective Linux user and mode `0700`.
- `user1` and `user2` have no login shell, no sudo, and no Docker access.
- Ext4 user quotas are enabled and each tenant has a 50 GiB block quota.

Check usage:

```sh
sudo repquota -u /
sudo quota -u user1
sudo quota -u user2
```

> Dufs runs as root for administrative access, so uploads made through the Dufs
> admin account are root-owned and do not count against the tenant UID quotas.
> Use scoped Dufs accounts and per-UID instances if strict quota enforcement on
> file-server uploads is required.

## Physical network transition to the home router

The node is currently on the direct Ethernet link to the ASUS at
`YOUR_LAN_IP`. A NetworkManager profile named `Wired DHCP` is already
configured on `enp0s25` with `ipv4.method auto` and autoconnect enabled. The
original profile `Wired connection 1` is retained with autoconnect off for
direct-link recovery.

Do not reboot the node before moving the cable; the current static direct-link
profile is still active.

1. Unplug the Ethernet cable from the ASUS.
2. Plug it into a LAN port on the home router.
3. The node requests DHCP and joins the `10.0.0.x` network.
4. Verify on the node:

   ```sh
   ip -br addr show enp0s25
   ip route
   ```

5. Access the node over Tailscale (`YOUR_TAILSCALE_IP` /
   `your-nas.your-tailnet.ts.net`) or the new DHCP address. The old
   `YOUR_LAN_IP` address no longer applies.
6. If you need to return to the ASUS direct-link setup:

   ```sh
   sudo nmcli connection up "Wired connection 1"
   ```

The ASUS-side helper container `t410-link` was only needed for the direct link;
after the move it can be removed with `docker rm -f t410-link` on the ASUS.

## Documentation

- [Setup guide](docs/00_SETUP_GUIDE.md)
- [Administrator manual](docs/01_ADMIN_MANUAL.md)
- [Password and secret management](docs/02_PASSWORD_MANAGEMENT.md)
- [Family tutorial](docs/03_FAMILY_TUTORIAL.md)
- [Security audit](docs/04_SECURITY_AUDIT.md)
- [Architecture](docs/05_ARCHITECTURE.md)

## Security controls

- OMV web stack stopped, disabled, and masked.
- SSH: `PermitRootLogin no`, `PasswordAuthentication no`, key-only.
- UFW: default deny inbound; only TCP/22, `tailscale0`, and UDP/41641 allowed.
- Dufs and Vaultwarden published only on `127.0.0.1`.
- Dufs admin password is SHA-512 hashed for the container.
- Vaultwarden `ADMIN_TOKEN` is an Argon2id PHC hash.
- Tailscale Serve provides HTTPS over the private tailnet.
- `.env`, keys, and data are excluded from Git.

See [SECURITY.md](SECURITY.md) for the full architecture and verification
checklist.

## Troubleshooting

```sh
sudo ufw status verbose
tailscale status
sudo tailscale serve status
sudo systemctl status tailscaled --no-pager
cd /srv/fortress && sudo docker compose ps
sudo docker compose logs --tail=100 dufs vaultwarden
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8443/__dufs__/health
sudo docker compose logs vaultwarden | grep -i 'plain text' || true
```

If the node is unreachable over Tailscale, use the direct Ethernet address
`YOUR_LAN_IP` and the operator SSH key before the physical move. Root SSH is
intentionally disabled.

## Residual risks

- Dufs runs as root for administrative access; app-level scopes and OS quotas
  are defense-in-depth, not a hard multi-tenant boundary for the Dufs admin.
- The Vaultwarden plaintext recovery file is root-only but must be moved to a
  password manager and destroyed.
- Tailscale ACLs are the final authorization boundary; restrict which devices
  can reach `t410` and which ports they can use.