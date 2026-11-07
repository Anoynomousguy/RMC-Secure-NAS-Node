#!/usr/bin/env bash
# Regenerates /root/NAS_EMERGENCY_RECOVERY.txt from /srv/fortress/.env.
# The script contains no secrets itself. Run as root:
#   sudo /srv/fortress/scripts/create_emergency_kit.sh
set -euo pipefail
ENV_FILE=/srv/fortress/.env
OUT=/root/NAS_EMERGENCY_RECOVERY.txt
get() { sed -n "s/^$1=//p" "$ENV_FILE" | tr -d "'"; }

vaultwarden_plain=""
if [ -f /root/.vaultwarden-admin-token ]; then
  vaultwarden_plain="$(cat /root/.vaultwarden-admin-token)"
fi

{
  echo "# NAS EMERGENCY RECOVERY KIT"
  echo "# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Keep this file offline: it contains plaintext master credentials."
  echo
  echo "## Master passwords"
  echo "Authelia admin:        $(get AUTHELIA_ADMIN_PASSWORD)"
  echo "Authelia user1:        $(get AUTHELIA_USER1_PASSWORD)"
  echo "Authelia user2:        $(get AUTHELIA_USER2_PASSWORD)"
  echo "Dufs / WebDAV admin:   $(get DUFS_ADMIN_PASSWORD)"
  echo "Uptime Kuma admin:     $(get KUMA_ADMIN_PASSWORD)"
  if [ -n "$vaultwarden_plain" ]; then
    echo "Vaultwarden admin:     ${vaultwarden_plain}"
  else
    echo "Vaultwarden admin:     (plaintext not stored on this host; use the token in your password manager)"
  fi
  echo
  echo "## Linux accounts (change these if they are still the installer defaults)"
  echo "root:   root"
  echo "YOUR_USERNAME:  YOUR_USERNAME"
  echo
  echo "## Restore instructions"
  cat <<'EOT'
1. Power on the NAS and connect it to the LAN (Ethernet enp0s25).
2. SSH:  ssh YOUR_USERNAME@<nas-address>
3. Start the stack:
      cd /srv/fortress
      sudo python3 scripts/render_authelia_config.py
      sudo docker compose up -d
4. Re-apply service ports on the tailnet:
      sudo tailscale serve --bg --https=443  http://127.0.0.1:8081
      sudo tailscale serve --bg --https=8443 http://127.0.0.1:8083
      sudo tailscale serve --bg --https=9091 http://127.0.0.1:9091
      sudo tailscale serve --bg --https=3000 http://127.0.0.1:8090
      sudo tailscale serve --bg --https=3001 http://127.0.0.1:3001
5. Restore data:
      /srv/fortress/data             user files
      fortress_vaultwarden_data      Vaultwarden database
      fortress_kuma_data             Uptime Kuma history
      /srv/fortress/authelia/db.sqlite3 and users_database.yml
6. Re-enable quotas if needed:
      sudo quotaon -u / && sudo systemctl restart fortress-quota
7. Reinstall CrowdSec if the host was rebuilt:
      curl -s https://install.crowdsec.net | sudo sh
      sudo apt-get update && sudo apt-get install -y crowdsec crowdsec-firewall-bouncer-iptables
      sudo cp /srv/fortress/crowdsec/acquis.d/*.yaml /etc/crowdsec/acquis.d/
      sudo cscli collections install crowdsecurity/caddy
8. Re-join Tailscale (interactive):  sudo tailscale up
9. Update this kit after any password rotation.
EOT
} > "$OUT"

chmod 600 "$OUT"
chown root:root "$OUT"
echo "wrote $OUT"
