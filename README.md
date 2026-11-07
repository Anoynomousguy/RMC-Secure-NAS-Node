# RMC Secure NAS Node

A Debian 12 host running a private, Tailscale-only file and password service
stack. OMV's web stack is stopped and masked; the running services are
FileBrowser and Vaultwarden, both bound to loopback and exposed only through
Tailscale Serve.

## Access

### SSH (break-glass host administration)

SSH is key-only. Password authentication and direct root login are disabled.

```sh
ssh -i ~/.ssh/id_ed25519 YOUR_USERNAME@YOUR_LAN_IP
```

- Direct Ethernet address: `YOUR_LAN_IP`
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

Tailscale Serve must be enabled for the tailnet (HTTPS certificates). On the
node, publish the loopback services:

```sh
sudo tailscale serve --bg --https=443 http://127.0.0.1:8081
sudo tailscale serve --bg --https=8443 http://127.0.0.1:8080
sudo tailscale serve status
```

All application traffic is expected to use the tailnet; do not expose these
ports on the public Internet.

### FileBrowser

- URL: `https://your-nas.your-tailnet.ts.net:8443`
- Username: `admin`
- Password: value of `FILEBROWSER_ADMIN_PASSWORD` in `/srv/fortress/.env`

FileBrowser's root is `/srv/fortress/data`. The administrative account can see
both tenant directories. For tenant access, create a scoped FileBrowser user
limited to `user1` or `user2`; do not hand out the admin account.

### Vaultwarden

- URL: `https://your-nas.your-tailnet.ts.net/`
- Admin panel: `https://your-nas.your-tailnet.ts.net/admin`
- Admin token: value of `VAULTWARDEN_ADMIN_TOKEN` in `/srv/fortress/.env`

Public signups are disabled. Create accounts by invitation from the admin
panel. Vault contents are end-to-end encrypted; the server stores ciphertext.

### SSH tunnel fallback

If Tailscale Serve is unavailable, forward the loopback ports over SSH:

```sh
ssh -L 8080:127.0.0.1:8080 -L 8081:127.0.0.1:8081 \
  -i ~/.ssh/id_ed25519 YOUR_USERNAME@YOUR_LAN_IP
```

Then open `http://127.0.0.1:8080` for FileBrowser and
`http://127.0.0.1:8081` for Vaultwarden. Vaultwarden's web vault requires a
secure context; use the Tailscale HTTPS URL for normal use.

## Secrets

Create `.env` from the template and generate strong values:

```sh
cd /srv/fortress
umask 077
cp .env.example .env
# Replace the placeholders, or generate them:
openssl rand -hex 16   # VAULTWARDEN_ADMIN_TOKEN
openssl rand -hex 16   # FILEBROWSER_ADMIN_PASSWORD
chmod 600 .env
```

`.env` is git-ignored and must never be committed. `.env.example` contains
placeholders only. The compose file reads secrets from the environment.

## Deploy and operate

```sh
cd /srv/fortress
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100
```

The FileBrowser init container seeds or updates the admin password from
`.env`, then the FileBrowser and Vaultwarden services start. Re-running
`up -d` after a secret change rotates the FileBrowser admin password.

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

## Security controls

- OMV web stack stopped, disabled, and masked.
- SSH: `PermitRootLogin no`, `PasswordAuthentication no`, key-only.
- UFW: default deny inbound; only TCP/22, `tailscale0`, and UDP/41641 allowed.
- Docker services published only on `127.0.0.1`.
- Tailscale Serve provides HTTPS over the private tailnet.
- `.env`, keys, and data are excluded from Git.

> **Known limitation:** upstream FileBrowser was archived on 2026-09-01 and
> receives no security fixes. It is reachable only over Tailscale here, but
> treat it as residual risk and plan migration to a maintained file server.

See [SECURITY.md](SECURITY.md) for the full architecture and verification
checklist.

## Troubleshooting

```sh
sudo ufw status verbose
tailscale status
sudo systemctl status tailscaled --no-pager
sudo docker compose ps
sudo docker compose logs --tail=100 filebrowser vaultwarden
sudo ss -tlnp
```

If the node is unreachable over Tailscale, use the direct Ethernet address
`YOUR_LAN_IP` and the operator SSH key. Root SSH is intentionally disabled.