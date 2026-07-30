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

echo "==> stop PM2 (free RAM for build)..."
pm2 stop all 2>/dev/null || true

echo "==> remove old nested folder (legacy duplicate app, not PM2 process)..."
rm -rf oceanlinux-orders

echo "==> wipe old build..."
rm -rf .next

echo "==> build (typecheck/eslint skipped in next.config.mjs)..."
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2560}"
$BUILD_CMD

echo "==> verify build output exists..."
if [ ! -d .next/server ]; then
  echo "ERROR: Build failed — .next/server missing."
  exit 1
fi

echo "==> restart PM2 from THIS directory..."
pm2 delete oceanlinux oceanlinux-orders 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

sleep 3
echo "==> verify live endpoints..."
curl -s "http://127.0.0.1:3000/api/company/version" || true
echo ""
curl -sI "http://127.0.0.1:3000/api/company/orders" | grep -i "x-company-orders-filter" || true
echo ""
curl -sI "http://127.0.0.1:5655/orders" | head -5 || echo "WARN: port 5655 not responding — open AWS Security Group TCP 5655"

echo ""
echo "Done."
echo "  Main site:  https://oceanlinux.com"
echo "  Orders port: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo YOUR_EC2_IP):5655/orders"
echo "Hard-refresh browser (Ctrl+Shift+R)"
