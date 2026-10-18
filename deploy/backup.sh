#!/usr/bin/env sh
# Back up a hosted ledgr project: `ledgr backup` through compose, then (optionally) push the
# backups folder off the server with rclone. Run from cron on the server, e.g.
#   15 3 * * * cd /srv/my-business && ./deploy/backup.sh >> .ledgr/backup.log 2>&1
# Reads .env for LEDGR_BACKUP_REMOTE (an rclone path such as r2:ledgr-backups/my-business)
# and LEDGR_BACKUP_KEEP (local copies to keep, default 14).
set -eu
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi

echo "[$(date -u +%FT%TZ)] backup start"
docker compose run --rm --no-deps -T ledgr backup --keep "${LEDGR_BACKUP_KEEP:-14}"

if [ -n "${LEDGR_BACKUP_REMOTE:-}" ]; then
  cp .ledgr/config.json .ledgr/backups/config.json
  rclone copy .ledgr/backups "$LEDGR_BACKUP_REMOTE" --include '*.db' --include 'config.json'
  echo "[$(date -u +%FT%TZ)] pushed to $LEDGR_BACKUP_REMOTE"
fi
echo "[$(date -u +%FT%TZ)] backup done"
