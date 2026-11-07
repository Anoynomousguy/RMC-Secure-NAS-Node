# Security Architecture — RMC Secure NAS Node

## 1. Scope and threat model

This node is a private tactical data store. It exposes no service directly to
the public Internet. Remote access is expected to arrive through a Tailscale
tailnet, with SSH key authentication as the only interactive host login path.

The primary threats considered are:

- Unauthenticated network scanning and opportunistic exploitation.
- Credential leakage through source control or container metadata.
- Lateral movement between the two data tenants.
- Accidental public exposure of a Docker-published port.
- Supply-chain risk from an unmaintained application image.

## 2. Host hardening

- The OMV web stack (`openmediavault-engined`, `nginx`, `php8.2-fpm`) is
  stopped, disabled, and systemd-masked. OMV is retained on disk for recovery
  but is not part of the running attack surface.
- OpenSSH is configured key-only:
  - `PermitRootLogin no`
  - `PasswordAuthentication no`
  - `KbdInteractiveAuthentication no`
  - `PubkeyAuthentication yes`
- `YOUR_USERNAME` is the only administrative login. Root access is via `sudo` from
  that account. Root SSH login is denied.
- UFW is enabled with `default deny incoming` and `default allow outgoing`.
  The only inbound allowances are:
  - TCP/22 for SSH.
  - All traffic on the `tailscale0` interface.
  - UDP/41641 for Tailscale direct-path establishment.
- Container services bind exclusively to `127.0.0.1`; no application port is
  published on the physical LAN or on `0.0.0.0`.
- OMV/NFS/RPC listeners were stopped; remaining resolver listeners are covered
  by the UFW default-deny policy.

## 3. Zero-trust network model

Tailscale provides a WireGuard-encrypted private overlay. Each device is
individually authenticated to the tailnet. The node does not rely on the
physical LAN for trust: the direct Ethernet link and any future LAN connection
are untrusted transport.

- Services are reached through Tailscale Serve over HTTPS at the node's
  MagicDNS name. Serve proxies only to loopback-bound containers.
- Tailscale Serve is enabled for the tailnet and provisions a publicly trusted
  TLS certificate for `your-nas.your-tailnet.ts.net`.
- No inbound port forwarding is required on the upstream router.
- Tailscale ACLs should restrict which tailnet identities can reach this node
  and which ports they can use. Tailscale auth keys are never written to this
  repository; enrollment is interactive with `tailscale up`.
- SSH remains available on TCP/22 for break-glass host administration; it is
  key-only and should be restricted by the tailnet ACL and/or a LAN firewall
  rule once the node is on the home router.

## 4. Application stack and ORM mitigation

**FileBrowser replaced with Dufs due to upstream archival. Vaultwarden token
now secured via Argon2 hashing.**

- FileBrowser was retired because its upstream project is archived and receives
  no further security fixes.
- The replacement is **Dufs v0.47.0** (Rust, actively maintained; release
  v0.47.0 was published 2026-10-17). The image is pinned in
  `docker-compose.yml`.
- Dufs is configured with:
  - `DUFS_AUTH=admin:<sha512-crypt-hash>@/:rw`
  - `DUFS_ALLOW_ALL=true`
  - `DUFS_SERVE_PATH=/data`
  - A loopback-only host port `127.0.0.1:8443`.
- The Dufs container receives only the SHA-512 hash of the operator password,
  not the plaintext. The plaintext `DUFS_ADMIN_PASSWORD` stays in the 0600
  `.env` for the human operator. Dufs runs as root inside the container so it
  can administer both tenant directories; this is an administrative capability,
  not tenant RBAC.
- Vaultwarden is pinned to `vaultwarden/server:1.37.5`.
- `ADMIN_TOKEN` is an **Argon2id PHC hash**. The plaintext token is not in
  `.env` and is not in the repository. A root-only recovery copy was created
  during migration; it must be moved to a password manager and destroyed.
- Both applications are bound to loopback and published only through
  Tailscale Serve:
  - Vaultwarden: `https://your-nas.your-tailnet.ts.net/` → `127.0.0.1:8081`
  - Dufs: `https://your-nas.your-tailnet.ts.net:8443/` → `127.0.0.1:8443`

## 5. RBAC and tenant isolation

### Operating system

- `YOUR_USERNAME` — operator account; member of `sudo`, `docker`, and `_ssh`.
  Possesses passwordless sudo and Docker access. Treat as root-equivalent.
- `user1`, `user2` — data tenants. No login shell, no sudo, no Docker group.
  Home directories are mode `0700`.
- `/srv/fortress/data/user1` and `/srv/fortress/data/user2` are owned by the
  respective tenant and mode `0700`; neither tenant can traverse the other's
  directory. The parent data directory is mode `0711` to permit traversal
  without allowing tenant listing.
- Ext4 user quotas are enabled on `/` and each tenant has a 50 GiB block
  quota (`setquota`). Quota state is re-enabled at boot by
  `fortress-quota.service`.

### Applications

- Dufs has one initial administrative account (`admin`). The password is
  supplied to the container as a SHA-512 crypt hash. Before granting
  application-level tenant access, add scoped Dufs auth rules such as
  `user1:<hash>@/user1:rw`; do not share the admin account.
- Dufs runs as root, so files it writes are root-owned and are not charged to
  `user1`/`user2` quotas. The OS quotas enforce UID-owned data, not
  administrator uploads. For strict per-tenant quota enforcement, run separate
  Dufs instances under each tenant UID or use UID-mapped container users.
- Vaultwarden has a single administrative token (Argon2id hash). Public signups
  are disabled; accounts are created by invitation from the admin panel. Each
  Vaultwarden user has an isolated encrypted vault; the server cannot read
  vault contents.

## 6. Secrets management

- Runtime secrets live in `/srv/fortress/.env`, mode `0600`, owned by the
  operator. It is excluded by `.gitignore`.
- `.env.example` documents variable names with placeholders only and is safe
  to commit.
- `docker-compose.yml` contains no literal secrets; values are resolved from
  the environment at deploy time.
- The following are never committed: `.env`, private keys (`*.key`, `*.pem`),
  and the `data/` tree.
- Vaultwarden: `.env` contains only the Argon2id hash. The plaintext token is
  kept in a password manager; a temporary root-only recovery copy was created
  during migration and should be destroyed after transfer.
- Dufs: `.env` contains the operator plaintext and its SHA-512 crypt hash. The
  container receives only the hash, so `docker inspect` does not reveal the
  login password.
- Rotate the Vaultwarden admin token by generating a new Argon2id hash and
  replacing `VAULTWARDEN_ADMIN_TOKEN`; rotate the Dufs password by generating a
  new plaintext/hash pair and replacing both variables. Re-run
  `docker compose up -d`.
- Tailscale enrollment is interactive; no Tailscale auth key is stored in the
  repository or in `.env`.

## 7. Verification checklist

Run these after any change:

```sh
sudo ufw status verbose
sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication|pubkeyauthentication'
sudo ss -tlnp
cd /srv/fortress && sudo docker compose ps
sudo docker compose logs vaultwarden | grep -i 'plain text' || true
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8443/__dufs__/health
tailscale serve status
git check-ignore -v .env
sudo repquota -u /
```

Expected: UFW active with only 22/tcp, `tailscale0`, and 41641/udp; SSH
password and root login disabled; Dufs and Vaultwarden healthy; Dufs health
200; Vaultwarden log contains no plaintext-token warning; `.env` ignored; both
tenants at their quota; Tailscale Serve maps 443 to Vaultwarden and 8443 to
Dufs.

Unauthenticated Dufs must return `401`; authenticated Dufs must return `200`.

## 8. Known limitations and residual risk

- Dufs runs as root to administer both tenant directories. This is convenient
  but means Dufs uploads bypass the tenant UID quotas. Use scoped Dufs rules
  and separate instances/UID mappings for strict quota enforcement.
- The Vaultwarden plaintext admin token is not in `.env`, but a root-only
  recovery file exists after migration. Move it to a password manager and
  shred the file.
- Docker environment variables (the Dufs SHA-512 hash and Vaultwarden Argon2id
  hash) are visible to a privileged local operator through `docker inspect`.
  These are hashes, not reusable plaintext credentials.
- SSH on TCP/22 remains reachable from the physical LAN for break-glass
  administration. Tighten the tailnet ACL and upstream firewall once the node
  is on the home router.
- The tailnet ACL is the final authorization boundary. A compromised tailnet
  identity with access to this node can reach the services; enforce least
  privilege in the Tailscale admin console.