#!/usr/bin/env bash
# Production deploy for EC2 + PM2 + nginx.
# SSH into your server and run: bash scripts/deploy-rebuild.sh
set -euo pipefail

APP_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"

echo "========================================"
echo " OceanLinux production deploy"
echo " App dir: $APP_DIR"
echo " Git: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "========================================"

echo "==> git pull..."
git pull origin main

echo "==> install deps..."
if command -v bun >/dev/null 2>&1; then
  bun install
  BUILD_CMD="bun run build"
else
  npm install
  BUILD_CMD="npm run build"
fi

echo "==> wipe old build..."
rm -rf .next

echo "==> build..."
$BUILD_CMD

echo "==> verify new company orders filter is in build..."
if ! grep -R "confirmed-only-v5" .next/server/app/api/company/orders 2>/dev/null | head -1; then
  echo "ERROR: Build does NOT contain confirmed-only-v5."
  echo "       Wrong directory or build failed. Fix before restarting PM2."
  exit 1
fi

echo "==> restart PM2 from THIS directory..."
pm2 delete oceanlinux 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

sleep 3
echo "==> verify live endpoint..."
curl -s "http://127.0.0.1:3000/api/company/version" || true
echo ""
curl -sI "http://127.0.0.1:3000/api/company/orders" | grep -i "x-company-orders-filter" || true

echo ""
echo "Done. Open https://oceanlinux.com/api/company/version"
echo "You must see: confirmed-only-v5"
echo "Then hard-refresh /company/rockybhai"
