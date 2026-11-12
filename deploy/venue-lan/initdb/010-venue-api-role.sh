#!/usr/bin/env bash
# Executed by the official postgres:18 entrypoint once on EMPTY venue_db volume.
# Fail closed: the API receives only the non-superuser credential.
set -euo pipefail
if [[ "${POSTGRES_DB:-}" != "usd_venue" || "${POSTGRES_USER:-}" != "usd_venue_root"
  || "${VENUE_DB_USER:-}" != "usd_venue"
  || "${VENUE_DB_PASSWORD:-}" == "${POSTGRES_PASSWORD:-}"
  || ${#VENUE_DB_PASSWORD} -lt 20 ]]; then
 echo 'USD venue PostgreSQL initialization refused: role separation invalid' >&2
 exit 1
fi
# psql's named variables quote identifier and literal independently and avoid
# interpolating secret values into SQL, preventing arbitrary SQL from .env.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=APP_USER="$VENUE_DB_USER" \
  --set=APP_PASSWORD="$VENUE_DB_PASSWORD" \
  --set=APP_DATABASE="$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE :"APP_USER" LOGIN PASSWORD :'APP_PASSWORD'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE :"APP_DATABASE" TO :"APP_USER";
GRANT USAGE, CREATE ON SCHEMA public TO :"APP_USER";
SQL
echo 'USD VENUE DB: independent non-superuser API role created'
