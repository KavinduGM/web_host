#!/usr/bin/env bash
# ============================================================================
# web-host-tool uninstaller
# Removes the container, Caddy sidecar (if present), and OPTIONALLY the data
# volumes. Asks before destroying anything destructive.
#
# Run with: sudo bash /opt/web-host-tool/uninstall.sh
# ============================================================================
set -euo pipefail

APP_DIR="/opt/web-host-tool"
CONTAINER_NAME="web-host-tool"
CADDY_CONTAINER="web-host-tool-caddy"

if [ "$EUID" -ne 0 ]; then
  echo "Run with sudo (or as root)."
  exit 1
fi

echo "==> Removing containers"
docker rm -f "$CONTAINER_NAME" 2>/dev/null && echo "  ✓ removed $CONTAINER_NAME" || echo "  - $CONTAINER_NAME not running"
docker rm -f "$CADDY_CONTAINER" 2>/dev/null && echo "  ✓ removed $CADDY_CONTAINER" || echo "  - $CADDY_CONTAINER not running"

read -rp "Delete data volumes (demos, db, tenant uploads)? This is irreversible. [y/N] " yn
if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
  for v in web_host_demos web_host_state web_host_tenants web_host_caddy_data web_host_caddy_config; do
    docker volume rm "$v" 2>/dev/null && echo "  ✓ removed volume $v" || echo "  - $v not present"
  done
else
  echo "  ⓘ volumes kept (run docker volume ls to see them)"
fi

read -rp "Delete source dir $APP_DIR? [y/N] " yn
if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
  rm -rf "$APP_DIR"
  echo "  ✓ removed $APP_DIR"
fi

read -rp "Delete docker network web-host-net? [y/N] " yn
if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
  docker network rm web-host-net 2>/dev/null && echo "  ✓ removed network" || echo "  - network not present"
fi

echo "Done."
