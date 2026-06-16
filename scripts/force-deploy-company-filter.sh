#!/usr/bin/env bash
# Force-deploy company orders filter on EC2 when git pull / rebuild did not update production.
# Usage: bash scripts/force-deploy-company-filter.sh [/home/ec2-user/oceanlinux]
set -euo pipefail

APP_DIR="${1:-/home/ec2-user/oceanlinux}"
REPO="https://raw.githubusercontent.com/sulphurninja/oceanlinux/main"

if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: $APP_DIR not found"
  exit 1
fi
cd "$APP_DIR"

echo "========== 1. Git force sync =========="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Before: $(git rev-parse --short HEAD 2>/dev/null) $(git remote get-url origin 2>/dev/null || true)"
  git fetch origin main 2>/dev/null && git reset --hard origin/main 2>/dev/null || echo "git reset skipped (auth/network)"
else
  echo "Not a git repo — will download files from GitHub raw"
fi

echo ""
echo "========== 2. Download confirmed-only-v5 files from GitHub =========="
mkdir -p src/app/api/company/orders src/app/api/company/version "src/app/company/[slug]" src/lib

curl -fsSL "$REPO/src/app/api/company/orders/route.js" -o src/app/api/company/orders/route.js
curl -fsSL "$REPO/src/app/api/company/version/route.js" -o src/app/api/company/version/route.js
curl -fsSL "$REPO/src/app/company/%5Bslug%5D/page.tsx" -o "src/app/company/[slug]/page.tsx"
curl -fsSL "$REPO/src/lib/companyOrders.js" -o src/lib/companyOrders.js 2>/dev/null || true

echo ""
echo "========== 3. Verify source =========="
if ! grep -q "confirmed-only-v5" src/app/api/company/orders/route.js; then
  echo "ERROR: orders route missing confirmed-only-v5"
  exit 1
fi
if grep -q "nin: \['pending'\]" src/app/api/company/orders/route.js; then
  echo "ERROR: orders route still has OLD nin pending filter"
  exit 1
fi
if ! grep -q "status: 'confirmed'" src/app/api/company/orders/route.js; then
  echo "ERROR: orders route missing status: 'confirmed'"
  exit 1
fi
echo "OK: source has confirmed-only-v5"

echo ""
echo "========== 4. Clean rebuild =========="
rm -rf .next
if command -v bun >/dev/null 2>&1; then
  bun run build
else
  npm run build
fi

if ! grep -Rq "confirmed-only-v5" .next/server/app/api/company/orders 2>/dev/null; then
  echo "ERROR: build output missing confirmed-only-v5 — build may have failed silently"
  exit 1
fi
echo "OK: .next build contains confirmed-only-v5"

echo ""
echo "========== 5. Restart PM2 =========="
pm2 delete oceanlinux 2>/dev/null || true
if [ -f ecosystem.config.cjs ]; then
  pm2 start ecosystem.config.cjs
else
  pm2 start node_modules/next/dist/bin/next --name oceanlinux --cwd "$APP_DIR" -- start -p 3000
fi
pm2 save

echo ""
echo "========== 6. Verify live (wait 3s) =========="
sleep 3
echo -n "version endpoint: "
curl -sf "http://127.0.0.1:3000/api/company/version" || echo "FAILED"
echo ""
echo -n "orders header: "
curl -sfI "http://127.0.0.1:3000/api/company/orders" | grep -i x-company-orders-filter || echo "MISSING"
echo ""
echo "========== DONE =========="
echo "Open https://oceanlinux.com/company/rockybhai in incognito."
echo "You should see: Only confirmed (paid) orders are shown..."
