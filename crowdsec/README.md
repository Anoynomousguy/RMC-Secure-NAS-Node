# CrowdSec (host installation)

CrowdSec runs on the Debian host (not in Docker) and bans malicious source IPs
with the iptables firewall bouncer.

## Install

```sh
curl -s https://install.crowdsec.net | sudo sh
sudo apt-get update
sudo apt-get install -y crowdsec crowdsec-firewall-bouncer-iptables
sudo cscli collections install crowdsecurity/caddy
```

The stock Debian package enables the `crowdsecurity/linux` and
`crowdsecurity/sshd` collections. `crowdsecurity/caddy` adds the Caddy JSON
access-log parser and the generic HTTP scenarios.

## Acquisition

Copies of the host acquisition files live in `acquis.d/`:

- `*-sshd.yaml` - reads the systemd journal for `ssh.service` (sshd login
  failures, brute force).
- `*-caddy.yaml` - reads the Caddy access log written by the `fortress-caddy`
  container into `/srv/fortress/caddy/logs/access.log`.

Install them with:

```sh
sudo cp crowdsec/acquis.d/*.yaml /etc/crowdsec/acquis.d/
sudo systemctl reload crowdsec
```

## Firewall bouncer

The bouncer registers itself with the local LAPI at install time. Verify with:

```sh
sudo cscli bouncers list
sudo systemctl status crowdsec-firewall-bouncer
```

## Operations

```sh
sudo cscli decisions list
sudo cscli alerts list
sudo cscli metrics
sudo cscli decisions add --ip 192.0.2.10 --duration 1m --reason test
sudo cscli decisions delete --ip 192.0.2.10
```

Note: application traffic reaches the containers through Tailscale Serve, which
proxies to loopback. CrowdSec sees the real client IP for SSH (journal) but not
for HTTP traffic proxied through the tailnet, so SSH detections are the primary
enforcement path. Tailscale ACLs remain the authorization boundary for web
access.
