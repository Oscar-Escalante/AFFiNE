#!/bin/bash
# Run this ONCE on the VPS to prepare the environment.
# Usage: bash setup.sh
set -e

SYNC_DIR="/home/sshadmin/apps/affine/google-sync"
VENV="$SYNC_DIR/venv"
ENV_FILE="$SYNC_DIR/.env"

echo "=== Creating sync directory ==="
mkdir -p "$SYNC_DIR"

echo "=== Installing Python deps ==="
python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet gspread google-auth psycopg2-binary pycrdt

echo "=== Creating PostgreSQL write user ==="
# Needs to run as 'affine' DB superuser via docker exec
SYNC_DB_PASS=$(openssl rand -hex 16)
docker exec affine_postgres psql -U affine -d affine -c "
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'affine_sync') THEN
      CREATE ROLE affine_sync LOGIN PASSWORD '$SYNC_DB_PASS';
    END IF;
  END
  \$\$;
  GRANT SELECT, INSERT, UPDATE, DELETE ON snapshots TO affine_sync;
  GRANT DELETE ON updates TO affine_sync;
  GRANT SELECT ON workspace_pages TO affine_sync;
"
echo ""
echo "=== DB user 'affine_sync' created with password: $SYNC_DB_PASS ==="
echo "    Add to .env: AFFINE_DB_URL=postgresql://affine_sync:$SYNC_DB_PASS@127.0.0.1:5432/affine"
echo ""

echo "=== Copy your .env and service-account.json to $SYNC_DIR ==="
echo "    cp .env.example $ENV_FILE  (then edit values)"
echo "    cp service-account.json $SYNC_DIR/"

echo ""
echo "=== Setting up cron job (every 30 min) ==="
CRON_LINE="*/30 * * * * source $ENV_FILE && $VENV/bin/python $SYNC_DIR/sync_sheet.py >> $SYNC_DIR/sync.log 2>&1"
(crontab -l 2>/dev/null | grep -v sync_sheet; echo "$CRON_LINE") | crontab -
echo "Cron registered:"
crontab -l | grep sync_sheet

echo ""
echo "=== Done. Test with: ==="
echo "    source $ENV_FILE && $VENV/bin/python $SYNC_DIR/sync_sheet.py"
