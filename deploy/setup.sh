#!/usr/bin/env bash
# One-shot VPS setup for Hostinger KVM 2 (Ubuntu/Debian). Run as root.
set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "Run as root: sudo bash setup.sh"
  exit 1
fi

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo bash setup.sh demos.yourdomain.com"
  exit 1
fi

echo "==> Installing packages"
apt-get update
apt-get install -y curl git nginx ufw

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 20.x"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Creating webhost user"
id -u webhost >/dev/null 2>&1 || useradd -r -m -d /home/webhost -s /bin/bash webhost

echo "==> Creating directories"
mkdir -p /opt/web-host-tool
mkdir -p /var/www/demos/.disabled
mkdir -p /var/lib/web-host-tool/work
chown -R webhost:webhost /var/www/demos /var/lib/web-host-tool /opt/web-host-tool

echo "==> Installing nginx config"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
sed "s/demos.yourdomain.com/$DOMAIN/g" "$SCRIPT_DIR/nginx.conf.example" > /etc/nginx/sites-available/"$DOMAIN"
ln -sf /etc/nginx/sites-available/"$DOMAIN" /etc/nginx/sites-enabled/"$DOMAIN"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Allowing HTTP/HTTPS through firewall"
ufw allow 'Nginx Full' || true
ufw allow OpenSSH || true

cat <<EOF

==> Base setup done.

Next steps:
  1. Copy the project to /opt/web-host-tool:
       sudo -u webhost git clone <your-repo> /opt/web-host-tool
       (or scp/rsync the contents of this folder there)

  2. Build the admin client and install server deps:
       cd /opt/web-host-tool/client && sudo -u webhost npm ci && sudo -u webhost npm run build
       cd /opt/web-host-tool/server && sudo -u webhost npm ci

  3. Create the .env file from .env.example:
       cd /opt/web-host-tool/server
       sudo -u webhost cp .env.example .env
       # Generate JWT_SECRET:
       openssl rand -hex 32
       # Generate ADMIN_PASSWORD_HASH:
       sudo -u webhost node -e "console.log(require('bcryptjs').hashSync('YOUR-PASSWORD', 10))"
       # Edit .env and paste the values:
       sudo -u webhost nano .env

  4. Install the systemd service:
       sudo cp $SCRIPT_DIR/web-host-tool.service /etc/systemd/system/
       sudo systemctl daemon-reload
       sudo systemctl enable --now web-host-tool
       sudo systemctl status web-host-tool

  5. Get HTTPS via Let's Encrypt:
       sudo apt-get install -y certbot python3-certbot-nginx
       sudo certbot --nginx -d $DOMAIN

  Open: https://$DOMAIN/admin
EOF
