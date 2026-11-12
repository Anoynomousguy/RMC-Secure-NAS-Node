# Hardening findings — live probe vs. declared compose

Recorded 2026-11-12 from an external TCP/HTTP probe over the tailnet. These are
**observed** facts, not guesses. Fixes require root on the NAS.

## Scope note

Every service below is reachable **only from inside the Tailscale tailnet**, not
from the public internet. The tailnet is the security boundary. Findings are
ranked by what an attacker who already has a tailnet device could do.

## F-01 HIGH — Ollama runs outside this compose file and has no authentication

`docker-compose.yml` declares no `ollama` service, yet `:11434` is reachable and
answers without credentials:

```
$ curl http://t410:11434/            -> "Ollama is running"
$ curl http://t410:11434/api/tags    -> {"models":[{"name":"qwen3-vl:2b-instruct", ...}]}
```

Ollama is installed as a systemd unit, is bound beyond loopback, and has no auth
layer of its own. Any tailnet member can enumerate, run, pull and delete models.

```bash
sudo systemctl edit ollama
# [Service]
# Environment="OLLAMA_HOST=127.0.0.1:11434"
sudo systemctl daemon-reload && sudo systemctl restart ollama
ss -ltnp | grep 11434     # expect 127.0.0.1 only
```

Open WebUI reaches Ollama over loopback and is unaffected.

## F-02 MEDIUM — ports declared loopback-only are published on the tailnet

`docker-compose.yml` binds dufs and Authelia to `127.0.0.1`:

```yaml
dufs:     ports: ["127.0.0.1:8443:5000"]
authelia: ports: ["127.0.0.1:9091:9091"]
```

Yet both answer from another tailnet host. Compose is therefore not the only
thing publishing them — `tailscale serve` is. That is a legitimate design, but
it means **the compose file is not the source of truth for exposure**.

```bash
sudo tailscale serve status      # the real front door inventory
```

## F-03 MEDIUM — stale Syncthing serve mapping on :2342

`:2342` (Syncthing BEP) is reachable. The audit trail flags this as a leftover
`tailscale serve` entry.

```bash
sudo tailscale serve --https=2342 off
```

## F-04 LOW — portal and dufs run as root inside their containers

Both set `user: "0:0"`. They do have `no-new-privileges`, `mem_limit` and
`restart: unless-stopped`, and only loopback port bindings, which is good. But a
write primitive in the portal becomes root in that container's namespace.

Consider a non-root UID with a matching host UID for `./data`.

## Controls that passed

- No service sets `privileged: true`.
- Every long-running service has `restart: unless-stopped` and `mem_limit`.
- No service publishes on `0.0.0.0`; all bindings are `127.0.0.1`.
- Secrets come from `.env` and are required with `:?set ... in .env` guards, so a
  missing secret fails fast instead of defaulting to something weak.
- `no-new-privileges:true` on every service.
