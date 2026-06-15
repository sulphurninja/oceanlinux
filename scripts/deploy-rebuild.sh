#!/usr/bin/env bash
# Rebuild and restart oceanlinux on the production server (EC2 + PM2).
# Run ON THE SERVER after git pull — not locally on Windows.
set -euo pipefail

APP_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"

echo "==> App dir: $APP_DIR"
echo "==> Git commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "==> Installing dependencies..."
if command -v bun >/dev/null 2>&1; then
  bun install
  BUILD_CMD="bun run build"
  START_CMD="bun run start"
else
  npm install
  BUILD_CMD="npm run build"
  START_CMD="npm run start"
fi

echo "==> Removing old Next.js build cache..."
rm -rf .next

echo "==> Building fresh production bundle..."
$BUILD_CMD

echo "==> Restarting PM2 process..."
if pm2 describe oceanlinux >/dev/null 2>&1; then
  pm2 restart oceanlinux
else
  echo "PM2 app 'oceanlinux' not found. Start manually with:"
  echo "  pm2 start $START_CMD --name oceanlinux"
fi

echo "==> Verify deploy — should show confirmed-active-only-v3:"
sleep 2
curl -s "https://oceanlinux.com/api/company/version" || curl -s "http://127.0.0.1:3000/api/company/version" || true

echo ""
echo "Done. Hard-refresh /company/rockybhai in the browser (Ctrl+Shift+R)."
