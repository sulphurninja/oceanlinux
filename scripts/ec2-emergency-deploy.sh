#!/usr/bin/env bash
# One-shot EC2 deploy when site is down. Run: bash scripts/ec2-emergency-deploy.sh
set -euo pipefail

APP_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"

echo "========================================"
echo " EMERGENCY DEPLOY — OceanLinux"
echo " Dir: $APP_DIR"
echo "========================================"

# Free RAM: stop all PM2 apps during build
echo "==> stopping PM2..."
pm2 stop all 2>/dev/null || true
sleep 2
free -h

# Ensure swap exists (build needs headroom on 4GB instances)
if ! swapon --show | grep -q .; then
  echo "==> adding 2G swap (one-time)..."
  if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
  fi
  sudo swapon /swapfile 2>/dev/null || true
fi

echo "==> git pull..."
git stash push -m "keep-env-$(date +%s)" -- .env 2>/dev/null || true
git pull origin main || git pull

echo "==> clean junk..."
rm -rf oceanlinux-orders .next
pm2 flush 2>/dev/null || true

echo "==> install..."
if command -v bun >/dev/null 2>&1; then
  bun install
else
  npm install
fi

echo "==> build (typecheck skipped in next.config.mjs)..."
export NODE_OPTIONS="--max-old-space-size=2560"
if command -v bun >/dev/null 2>&1; then
  bun run build
else
  npm run build
fi

if [ ! -d .next ]; then
  echo "ERROR: .next folder missing — build failed."
  exit 1
fi

echo "==> start site..."
pm2 delete oceanlinux oceanlinux-orders 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

sleep 4
echo "==> health check..."
curl -sf "http://127.0.0.1:3000/api/company/version" && echo "" || echo "WARN: port 3000 API not responding"
curl -sfI "http://127.0.0.1:5655/orders" | head -3 || echo "WARN: port 5655 /orders not responding — open AWS SG TCP 5655"

echo ""
echo "Done. Check https://oceanlinux.com"
