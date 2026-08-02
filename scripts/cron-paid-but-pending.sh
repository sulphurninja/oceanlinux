#!/usr/bin/env bash
# EC2 / PM2: run paid-but-pending scan every 15 min via crontab:
#   */15 * * * * /path/to/oceanlinux/scripts/cron-paid-but-pending.sh >> /var/log/oceanlinux-paid-scan.log 2>&1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
: "${CRON_SECRET:?CRON_SECRET not set}"
PORT="${PORT:-3000}"
curl -fsS -m 280 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  "http://127.0.0.1:${PORT}/api/admin/paid-but-pending-cron?hours=72&limit=40" \
  || echo "[cron-paid-but-pending] failed $(date -Iseconds)"
