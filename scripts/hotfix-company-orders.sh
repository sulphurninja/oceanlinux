#!/usr/bin/env bash
# Emergency hotfix ON SERVER if git pull did not update orders route.
set -euo pipefail
cd "${1:-/home/ec2-user/oceanlinux}"

FILE="src/app/api/company/orders/route.js"
if [ ! -f "$FILE" ]; then
  echo "ERROR: $FILE missing"
  exit 1
fi

if grep -q "nin: \['pending'\]" "$FILE"; then
  echo "Found OLD filter (nin pending). Patching to confirmed-only..."
  cp "$FILE" "${FILE}.bak.$(date +%s)"
  sed -i "s/status: { \$nin: \['pending'\] }/status: 'confirmed'/" "$FILE"
  echo "Patched. Rebuilding..."
  rm -rf .next
  if command -v bun >/dev/null 2>&1; then bun run build; else npm run build; fi
  pm2 delete oceanlinux 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save
  echo "Done. Check: curl -s http://127.0.0.1:3000/api/company/version"
elif grep -q "confirmed-only-v5" "$FILE"; then
  echo "Source already has confirmed-only-v5. Problem is build or PM2 cwd."
  echo "Run: bash scripts/server-diagnose.sh"
else
  echo "Unknown orders route format. Show first 40 lines:"
  head -40 "$FILE"
fi
