# 02 — Password & Secret Management

Every runtime secret lives in `/srv/fortress/.env` (mode 0600, root-owned) and
a human-readable copy lives in `/root/NAS_EMERGENCY_RECOVERY.txt` (mode 0600).
No password is hardcoded in the Compose file, in the portal, or in Git.

## 1. What is stored where

| Secret | Stored in `.env` as | Used by |
| --- | --- | --- |
| Vaultwarden admin token | `VAULTWARDEN_ADMIN_TOKEN` (Argon2id hash) | Vaultwarden `/admin` |
| Dufs operator password | `DUFS_ADMIN_PASSWORD` | humans, mobile app |
| Dufs container hash | `DUFS_ADMIN_PASSWORD_HASH` (SHA-512 crypt) | Dufs container |
| Dufs proxy Basic credential | `DUFS_ADMIN_BASIC` (base64 of `admin:<password>`) | Caddy → Dufs after SSO |
| Authelia session/encryption/JWT | `AUTHELIA_SESSION_SECRET`, `AUTHELIA_STORAGE_ENCRYPTION_KEY`, `AUTHELIA_JWT_SECRET` | Authelia |
| Authelia account passwords | `AUTHELIA_<USER>_PASSWORD` + `_HASH` | Authelia sign-in |
| Tailscale | none | interactive `tailscale up` only |
| CrowdSec bouncer key | `/etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml` (root, 0600) | host bouncer |

Generate random values with `openssl rand -hex 32` (secrets) or
`openssl rand -hex 12` (passwords).

## 2. Change an Authelia password (portal / Dufs UI sign-in)

```sh
cd /srv/fortress

# 1. New password and hash
sudo docker run --rm -it authelia/authelia:4.39.28 \
  authelia crypto hash generate argon2
#   -> note the Digest value ($argon2id$...)

# 2. Edit .env: update AUTHELIA_<USER>_PASSWORD and AUTHELIA_<USER>_PASSWORD_HASH
sudoedit /srv/fortress/.env

# 3. Re-render and restart
sudo python3 scripts/render_authelia_config.py
sudo docker compose up -d authelia      # recreates with fresh env

# 4. Update the emergency kit
sudoedit /root/NAS_EMERGENCY_RECOVERY.txt
```

Existing sessions remain valid until they expire (1 hour idle, 1 month with
"remember me"); restarting Authelia invalidates nothing because sessions live
in its SQLite database. Use the Authelia portal "Sign out" to end a session.

## 3. Change the Dufs / WebDAV password

```sh
cd /srv/fortress

NEW_PASSWORD="$(openssl rand -hex 16)"          # or choose your own
HASH="$(openssl passwd -6 "$NEW_PASSWORD")"     # SHA-512 crypt
BASIC="$(printf 'admin:%s' "$NEW_PASSWORD" | base64 -w0)"

sudo python3 - <<'PY'
import os, re
new = dict(
    DUFS_ADMIN_PASSWORD=os.environ['NEW_PASSWORD'],
    DUFS_ADMIN_PASSWORD_HASH="'" + os.environ['HASH'] + "'",
    DUFS_ADMIN_BASIC="'" + os.environ['BASIC'] + "'",
)
path = '/srv/fortress/.env'
lines = []
for line in open(path):
    key = line.split('=', 1)[0] if '=' in line else None
    if key in new:
        lines.append(f"{key}={new[key]}\n")
    else:
        lines.append(line)
open(path, 'w').writelines(lines)
PY

sudo docker compose up -d dufs caddy   # recreate both consumers
```

Enter `NEW_PASSWORD` in the mobile app's Settings screen and update the
emergency kit. The old password stops working immediately.

## 4. Change the Linux account password

Linux accounts are used for SSH administration and for quota ownership, not
for web sign-in.

```sh
sudo passwd YOUR_USERNAME     # SSH admin account
```

`user1`/`user2` have no login shell; their password is irrelevant and can stay
locked. To lock it explicitly: `sudo passwd -l user1`.

## 5. Vaultwarden admin token

The admin token is stored as an Argon2id hash, so `.env` cannot reveal the
plaintext. The plaintext lives in the emergency kit.

- To rotate it, generate a new hash and replace `VAULTWARDEN_ADMIN_TOKEN`:

  ```sh
  cd /srv/fortress
  sudo docker run --rm -it vaultwarden/server:v1.37.5 /vaultwarden hash
  # paste the ADMIN_TOKEN='...' line into .env
  sudo docker compose up -d vaultwarden
  ```

- To reset the token when it is lost: stop Vaultwarden, set
  `ADMIN_TOKEN` to a new hash, start it again. Vaultwarden itself is unchanged;
  user vaults are encrypted with user master passwords and are not affected.

## 6. Emergency recovery kit

`/root/NAS_EMERGENCY_RECOVERY.txt` contains the master passwords and step-by-step
restore instructions. It is readable only by root.

```sh
sudo cat /root/NAS_EMERGENCY_RECOVERY.txt
```

Move a copy into your password manager, then consider keeping the server copy
offline (for example on an encrypted USB stick). To re-create it after a
password change, follow the "Emergency Kit" section in
`04_SECURITY_AUDIT.md`.

## 7. Rules

1. Never commit `.env`, the emergency kit, or any `*.key`/`*.pem` file.
   `.gitignore` already covers them, but check with `git status` before every
   commit.
2. Never paste a password into a chat, an issue, or a screenshot.
3. Rotate the Authelia session secret and storage encryption key only when
   compromised: changing the storage key makes the existing Authelia database
   unreadable, and all users must set new passwords after clearing the DB.
4. Keep the Tailscale admin account protected with 2FA; it is the outer gate
   to every service.
