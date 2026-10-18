#!/bin/bash
# Deploy eqosy.com on the VPS.   Usage:  bash ~/eqosy/deploy/deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/eqosy}"
WEB_ROOT="/var/www/eqosy"
UPLOADS_DIR="/var/www/uploads"

echo "Deploying..."
cd "$APP_DIR"
git pull origin main

# Backend
cd "$APP_DIR/Backend"
npm install

# Frontend (build first, swap only if the build succeeded)
cd "$APP_DIR/Frontend"
npm install
npm run build
sudo mkdir -p "$WEB_ROOT"
sudo rm -rf "${WEB_ROOT:?}"/*
sudo cp -r dist/* "$WEB_ROOT"/

# Uploads folder (never deleted by deploys)
sudo mkdir -p "$UPLOADS_DIR"
sudo chown -R root:www-data "$UPLOADS_DIR"
sudo chmod -R 775 "$UPLOADS_DIR"

# Processes: api, socket and the BullMQ workers
cd "$APP_DIR"
if pm2 describe eqosy-api > /dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

# Nginx
if [ -f "$APP_DIR/deploy/nginx/eqosy.conf" ] && ! cmp -s "$APP_DIR/deploy/nginx/eqosy.conf" /etc/nginx/sites-available/eqosy.conf; then
  sudo cp "$APP_DIR/deploy/nginx/eqosy.conf" /etc/nginx/sites-available/eqosy.conf
  sudo ln -sf /etc/nginx/sites-available/eqosy.conf /etc/nginx/sites-enabled/eqosy.conf
fi
sudo nginx -t && sudo systemctl reload nginx

echo "Deploy finished"
pm2 list
curl -s https://eqosy.com/health || true
echo
