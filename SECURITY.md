# Security Architecture — RMC Secure NAS Node

## 1. Scope and threat model

This node is a private tactical data store. It is not intended to expose any
service directly to the public Internet. All remote access is expected to
arrive through a Tailscale tailnet, with SSH key authentication as the only
interactive host login path.

The primary threats considered are:

- Unauthenticated network scanning and opportunistic exploitation.
- Credential leakage through source control.
- Lateral movement between the two data tenants.
- Accidental public exposure of a Docker-published port.

## 2. Host hardening

- OpenMediaVault web services (`openmediavault-engined`, `nginx`,
  `php8.2-fpm`) are stopped, disabled, and systemd-masked. OMV is retained on
  disk for recovery but is not part of the running attack surface.
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
- Docker services bind exclusively to `127.0.0.1`; no container port is
  published on the physical LAN or on `0.0.0.0`.
- The OMV/NFS/RPC listeners were stopped; any remaining resolver listeners are
  covered by the UFW default-deny policy.

## 3. Zero-trust network model

Tailscale provides a WireGuard-encrypted private overlay. Each device is
individually authenticated to the tailnet. The node does not rely on the
physical LAN for trust: the direct Ethernet link and any future LAN connection
are untrusted transport.

- Services are reached through Tailscale Serve over HTTPS at the node's
  MagicDNS name. Serve proxies only to loopback-bound containers.
- Tailscale Serve/HTTPS certificates must be enabled for the tailnet before
  the web services become reachable at that MagicDNS name.
- No inbound port forwarding is required on the upstream router.
- Tailscale ACLs should be used to restrict which tailnet identities can reach
  this node and which ports they can use. The default tailnet policy should be
  tightened so only the operator's devices can reach `t410`.
- Tailscale auth keys are never written to this repository. Node enrollment is
  completed interactively with `tailscale up`.
- SSH remains available on TCP/22 for break-glass host administration; it is
  key-only and should be restricted by the tailnet ACL and/or a LAN firewall
  rule once the node is moved onto a normal network.

## 4. RBAC and tenant isolation

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

- FileBrowser has one initial administrative account (`admin`). The password
  is supplied at container start from `FILEBROWSER_ADMIN_PASSWORD`. The
  container runs as root so it can administer both tenant directories; this
  is an intentional administrative capability, not tenant RBAC. Before
  granting FileBrowser access to a tenant, create a scoped FileBrowser user
  whose scope is that tenant's directory and do not share the admin account.
- Vaultwarden has a single administrative token
  (`VAULTWARDEN_ADMIN_TOKEN`). Public signups are disabled; accounts are
  created by invitation from the admin panel. Each Vaultwarden user has an
  isolated encrypted vault; the server cannot read vault contents.

## 5. Secrets management

- All runtime secrets live in `/srv/fortress/.env`, mode `0600`, owned by the
  operator. It is excluded by `.gitignore`.
- `.env.example` documents the variable names with placeholders only. It is
  safe to commit.
- `docker-compose.yml` contains no literal secrets; values are resolved from
  the environment at deploy time.
- The following are never committed: `.env`, private keys (`*.key`, `*.pem`),
  and the `data/` tree.
- Rotate the Vaultwarden admin token and FileBrowser admin password by editing
  `.env` and re-running `docker compose up -d`. Re-running the FileBrowser init
  container updates the admin password from the new value.
- Environment variables are visible to a privileged local operator through
  `docker inspect`. For a higher assurance deployment, migrate the two
  secrets to Docker secrets or an external secret manager; the application
  variable names remain the same.
- Tailscale enrollment is interactive; no Tailscale auth key is stored in the
  repository or in `.env`.

## 6. Verification checklist

Run these after any change:

```sh
sudo ufw status verbose
sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication|pubkeyauthentication'
sudo ss -tlnp
cd /srv/fortress && sudo docker compose ps
git check-ignore -v .env
sudo repquota -u /
tailscale status
```

Expected: UFW active with only 22/tcp, `tailscale0`, and 41641/udp; SSH
password and root login disabled; Docker ports bound to `127.0.0.1`; `.env`
ignored; both tenants at their quota; Tailscale node online.

## 7. Known limitations and residual risk

- **FileBrowser upstream is archived (2026-09-01).** It will receive no
  further releases or security fixes, and public advisories identify known
  unfixed issues. This deployment restricts it to the tailnet and loopback,
  but that does not eliminate the risk. Treat it as a transitional tool and
  migrate to a maintained file server before storing high-value data.
- Vaultwarden is configured with a plain `ADMIN_TOKEN`, which it warns about
  at startup. The token is 32 random hex characters in a 0600 `.env`; for
  higher assurance, store an Argon2 PHC hash as `ADMIN_TOKEN` and keep the
  plaintext only in a password manager.
- Docker environment variables are visible to a privileged local operator via
  `docker inspect`. Use Docker secrets or an external secret manager if the
  host has untrusted local administrators.