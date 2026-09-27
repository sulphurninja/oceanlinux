#!/usr/bin/env bash
# EC2 / PM2: renewal reminder (2 days before, backup at 1 day) and suspension mail.
# Server clock UTC (typical Amazon Linux):
#   0 4 * * * /home/ec2-user/oceanlinux/scripts/cron-expiry-reminders.sh >> /home/ec2-user/expiry-reminders.log 2>&1
#   30 12 * * * /home/ec2-user/oceanlinux/scripts/cron-expiry-reminders.sh >> /home/ec2-user/expiry-reminders.log 2>&1
# If `date` on the server shows IST, use 30 9 and 0 18 instead.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

read_env_var() {
  local key="$1"
  local file="$2"
  local line
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | head -1 || true)"
  if [ -z "$line" ]; then
    return 1
  fi
  local val="${line#*=}"
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

curl -fsS -m 600 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  "http://127.0.0.1:${PORT}/api/orders/expiry-reminders" \
  || echo "[cron-expiry-reminders] reminder failed $(date -Iseconds)"

curl -fsS -m 600 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  "http://127.0.0.1:${PORT}/api/orders/suspension-notices" \
  || echo "[cron-expiry-reminders] suspension failed $(date -Iseconds)"
