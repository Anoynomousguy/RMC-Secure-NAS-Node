# 01 — Administrator Manual

Day-to-day administration of users, folders, and quotas.

## 1. Accounts at a glance

| Account | Type | Login paths |
| --- | --- | --- |
| administrator (`YOUR_USERNAME`) | Linux + sudo + Docker | SSH, `sudo docker compose ...` |
| `admin` | Authelia group `admins` | Web portal (admin view), Dufs UI |
| `user1`, `user2` | Authelia group `users` | Web portal (own folder only), Dufs UI (shared admin view) |
| `user1`, `user2` (Linux) | Data tenants | No shell, no sudo, 50 GiB quota each |

Authelia is the single sign-on gateway for the Dufs web UI and the web portal.
The mobile app uses Dufs WebDAV with its own Basic credentials at `/dav`.

## 2. Adding a family user

Pick a name (lowercase, no spaces), for example `alice`.

```sh
# 1. Linux tenant with a private home and data folder
sudo useradd --no-create-home --shell /usr/sbin/nologin alice
sudo mkdir -p /srv/fortress/data/alice
sudo chown alice:alice /srv/fortress/data/alice
sudo chmod 700 /srv/fortress/data/alice

# 2. 50 GiB quota on the data filesystem
sudo setquota -u alice 0 52428800 0 0 /

# 3. Authelia account
#    Generate a password hash (you will be prompted for the password):
sudo docker run --rm -it authelia/authelia:4.39.28 \
  authelia crypto hash generate argon2
```

Then edit `/srv/fortress/.env`:

```sh
AUTHELIA_ALICE_PASSWORD=<the plaintext you chose>
AUTHELIA_ALICE_PASSWORD_HASH='$argon2id$...'   # paste the Digest from above
```

Add the user to `authelia/users_database.template.yml`:

```yaml
  alice:
    displayname: Alice
    password: '${AUTHELIA_ALICE_PASSWORD_HASH}'
    email: alice@example.invalid
    groups:
      - users
```

Re-render and apply:

```sh
cd /srv/fortress
sudo python3 scripts/render_authelia_config.py
sudo docker compose restart authelia
```

The portal resolves `alice` to `/srv/fortress/data/alice` automatically; no
portal restart is required. The quota applies as soon as the quota command
succeeds.

## 3. Removing a user

```sh
# Portal/Authelia access
#   remove the user block from authelia/users_database.template.yml,
#   remove AUTHELIA_ALICE_* from .env
sudo python3 /srv/fortress/scripts/render_authelia_config.py
sudo docker compose -f /srv/fortress/docker-compose.yml restart authelia

# Quota and Linux account
sudo setquota -u alice 0 0 0 0 /
sudo userdel alice

# Data (only when you are sure)
sudo mv /srv/fortress/data/alice /srv/fortress/data/alice.removed-$(date +%F)
```

Review and delete `alice.removed-*` later. Removing the Linux user does not
delete files; removing the directory does.

## 4. Quotas

The filesystem has user quotas enabled. Each tenant has a 50 GiB block quota
(52428800 KiB).

```sh
sudo repquota -u /            # all users, human readable
sudo quota -u user1           # one user
sudo setquota -u user1 0 52428800 0 0 /   # set 50 GiB again
```

`fortress-quota.service` re-enables quota accounting every boot
(`quotaon -u /`). If `repquota` reports no quotas, run:

```sh
sudo quotaon -u /
sudo systemctl restart fortress-quota
```

The web portal shows each user's used size and the 50 GiB limit in the admin
view. The portal computes sizes by walking the user's directory, so it stays
correct even when the files were uploaded through WebDAV.

## 5. The web portal

- URL: `https://YOUR_NAS_HOST:3000`
- Sign-in: Authelia (same password as your Authelia account).
- Users see only their own folder. Admins (`admins` group) see an extra
  "Users" section with every tenant, quota usage, and file counts, and can
  browse a user's files read/write.
- Upload, rename, delete, download, folder creation, list/tiles view, sort and
  search are all available.
- The portal runs as root inside its container so it can manage every tenant
  directory; it is protected by Authelia and constrained by a 512 MB memory
  limit. Keep it on the tailnet.

## 6. Dufs and WebDAV

- Dufs web UI: `https://YOUR_NAS_HOST:8443` (Authelia SSO).
- WebDAV (mobile app and clients): `https://YOUR_NAS_HOST:8443/dav`
  (Dufs Basic auth; username `admin`, password `DUFS_ADMIN_PASSWORD` in
  `/srv/fortress/.env`).
- To change the Dufs password, follow `02_PASSWORD_MANAGEMENT.md`.

## 7. Routine maintenance

```sh
cd /srv/fortress
sudo docker compose ps                     # service health
sudo docker compose logs --tail=100        # recent logs
sudo docker stats --no-stream              # live memory usage vs limits
sudo cscli decisions list                  # CrowdSec bans
sudo cscli alerts list                     # CrowdSec detections
sudo tailscale status                      # tailnet peers
sudo tailscale serve status                # published ports
```

Update images periodically:

```sh
cd /srv/fortress
sudo docker compose pull
sudo docker compose up -d
```

Read the release notes before major-version upgrades (especially Authelia and
Vaultwarden) and take a copy of `.env` first.
