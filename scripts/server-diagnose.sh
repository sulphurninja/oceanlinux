#!/usr/bin/env bash
# Run ON THE EC2 SERVER to find why /company still shows cancelled orders.
set -euo pipefail

APP_DIR="${1:-/home/ec2-user/oceanlinux}"

echo "========== 1. APP DIRECTORY =========="
if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: $APP_DIR does not exist"
  ls -la /home/ec2-user/ 2>/dev/null || true
  exit 1
fi
cd "$APP_DIR"
pwd
echo "Git commit: $(git rev-parse --short HEAD 2>/dev/null || echo MISSING)"
echo "Git remote: $(git remote get-url origin 2>/dev/null || echo MISSING)"

echo ""
echo "========== 2. SOURCE FILE (orders API) =========="
if grep -n "confirmed-only-v5\|nin: \['pending'\]" src/app/api/company/orders/route.js 2>/dev/null; then
  echo "(see lines above)"
else
  echo "ERROR: src/app/api/company/orders/route.js not found or unexpected content"
fi

echo ""
echo "========== 3. BUILT FILE (.next) =========="
if [ -d .next ]; then
  if grep -R "confirmed-only-v5" .next/server/app/api/company/orders 2>/dev/null | head -1; then
    echo "OK: new filter is in .next build"
  else
    echo "ERROR: .next build does NOT contain confirmed-only-v5 — run: rm -rf .next && bun run build"
  fi
else
  echo "ERROR: no .next folder — run: bun run build"
fi

echo ""
echo "========== 4. PM2 =========="
pm2 show oceanlinux 2>/dev/null | grep -E "status|exec cwd|script path|node.js version" || echo "ERROR: pm2 app 'oceanlinux' not found"

echo ""
echo "========== 5. LIVE LOCAL API (port 3000) =========="
curl -s "http://127.0.0.1:3000/api/company/version" 2>/dev/null | head -c 300 || echo "version endpoint failed"
echo ""
curl -sI "http://127.0.0.1:3000/api/company/orders" 2>/dev/null | grep -i "x-company-orders-filter\|x-deploy" || echo "no filter headers on local API"

echo ""
echo "========== 6. PUBLIC SITE =========="
curl -s "https://oceanlinux.com/api/company/version" 2>/dev/null | head -c 200
echo ""
curl -sI "https://oceanlinux.com/api/company/orders" 2>/dev/null | grep -i "x-company-orders-filter\|x-deploy" || echo "no filter headers on public site"

echo ""
echo "========== DONE =========="
echo "If step 2 shows nin: ['pending'] -> run: git pull origin main"
echo "If step 3 fails -> run: rm -rf .next && bun run build"
echo "If step 4 cwd is wrong -> run: pm2 delete oceanlinux && pm2 start $APP_DIR/ecosystem.config.cjs"
