# Reference stack guide

This repository is a **reference implementation**, published so the shape of the stack can be read
and adapted. It is not a service, it is not hosted, and it is not a deployment you can point at
someone else's host.

> **Do not point this at a machine you do not own.** Every hostname, address and credential below
> is a placeholder. Standing it up means substituting your own values on your own hardware.

## What is in the stack

| Component | Role | Why it is here |
| --- | --- | --- |
| `caddy` | HTTP front door | terminates the local hop, applies forward-auth, copies identity headers |
| `authelia` | Identity provider | SSO, forward-auth subrequests, per-user roles |
| `dufs` | File service | WebDAV and a browser file UI over the same tree |
| `vaultwarden` | Password vault | self-hosted Bitwarden-compatible server |
| `portal` | Web portal | file browser and upload surface for non-technical users |
| `uptime-kuma` | Monitoring | per-service uptime and response-time history |

Three networks keep the blast radius small: an edge network for user-facing services, an internal
network for the model backend, and no outbound route for anything that does not need one.

## Standing it up, generically

1. **Get the tree onto your host.**

   ```bash
   git clone <your-fork-url> nas-node
   cd nas-node
   ```

2. **Create the environment file.** Copy the template and replace every placeholder:

   ```bash
   cp .env.example .env
   chmod 600 .env
   ```

   Placeholders you must supply: `AUTHELIA_HOSTNAME`, `VAULTWARDEN_DOMAIN`, the three
   `DUFS_*_PASSWORD_HASH` values, the three `DUFS_*_BASIC` values, `AUTHELIA_SESSION_SECRET`,
   `AUTHELIA_STORAGE_ENCRYPTION_KEY`, `AUTHELIA_JWT_SECRET`, `VAULTWARDEN_ADMIN_TOKEN`,
   `WEBUI_SECRET_KEY`, `KUMA_ADMIN_PASSWORD`. Generate secrets locally; never reuse the examples.

3. **Render the generated configuration** from the templates:

   ```bash
   python3 scripts/render_authelia_config.py
   ```

4. **Build and start:**

   ```bash
   docker compose build
   docker compose up -d
   docker compose ps
   ```

5. **Verify the front door**, substituting your own hostname:

   ```bash
   curl -fsS http://127.0.0.1:<authelia-port>/api/health
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<portal-port>/api/health
   ```

   A `302` from a gated route is the auth redirect, not a failure.

6. **Publish it over your own private network.** This stack assumes a private overlay network
   terminates TLS and forwards to loopback; it does not configure that for you, and it must not
   be exposed directly to the internet.

## What to change before you trust it

- Replace every placeholder in `.env.example` and in the Authelia templates.
- Replace `example.invalid` email addresses in the user database template.
- Set your own Caddy hostnames; the shipped file assumes a single private hostname.
- Review `docker-compose.yml` port bindings. Anything bound to `0.0.0.0` is reachable from your
  LAN whether you meant it or not.
- Rotate anything you generated while testing. A stack that has only ever run on a laptop still has
  credentials in it.

## What this guide deliberately does not contain

No real hostnames, no private addresses, no tailnet names, no operator paths and no credentials.
The operational documentation for the deployment this was extracted from is kept in a private
repository and is not published here.
