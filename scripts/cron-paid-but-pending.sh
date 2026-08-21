#!/usr/bin/env bash
# EC2 / PM2: run paid-but-pending scan every 15 min via crontab:
#   */15 * * * * /path/to/oceanlinux/scripts/cron-paid-but-pending.sh >> /home/ec2-user/paid-scan.log 2>&1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Do NOT `source .env` — values like TOKEN_SECRET contain &, %, * which break bash.
read_env_var() {
  local key="$1"
  local file="$2"
  local line
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | head -1 || true)"
  if [ -z "$line" ]; then
    return 1
  fi
  local val="${line#*=}"
  # Strip optional surrounding quotes
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  printf '%s' "$val"
}

ENV_FILE="$ROOT/.env"
if [ -f "$ENV_FILE" ]; then
  CRON_SECRET="$(read_env_var CRON_SECRET "$ENV_FILE" || true)"
  PORT="$(read_env_var PORT "$ENV_FILE" || true)"
fi
: "${CRON_SECRET:?CRON_SECRET not set in $ENV_FILE}"
PORT="${PORT:-3000}"

curl -fsS -m 280 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  "http://127.0.0.1:${PORT}/api/admin/paid-but-pending-cron?hours=72&limit=40" \
  || echo "[cron-paid-but-pending] failed $(date -Iseconds)"
