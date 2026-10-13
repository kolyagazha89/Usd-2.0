# USD 2.0 — Timeweb VPS deployment

This is the planned self-hosted deployment for the new USD 2.0 site. It is intentionally isolated on `app.usd-russia.ru` and `api.usd-russia.ru`; do not change the root domain, nameservers, or Tilda site as part of preparation.

## Included

- React/Vite frontend served by Nginx with SPA route fallback.
- NestJS API with Prisma and the repository's guarded startup migration.
- PostgreSQL 16 with a persistent Docker volume and no public database port.
- Caddy reverse proxy with automatic HTTPS for the app and API subdomains.
- S3-compatible media storage configured outside the application container.

## Before the first production start

1. Provision a Timeweb VPS that supports Docker Engine and the Compose plugin. Allow inbound TCP 80/443 (and optionally UDP 443) in the server firewall.
2. Point only the future app/API subdomains to the VPS IP after the owner explicitly approves the cutover. Leave `usd-russia.ru` and its current Tilda DNS records unchanged. Caddy cannot issue certificates until the subdomains resolve to this server and ports 80/443 are reachable.
3. Choose and provision an S3-compatible object-storage bucket. Production startup deliberately fails unless `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` are present.
4. Copy `.env.example` to `.env`, set strong unique values, and keep `.env` out of Git. Use the same generated PostgreSQL password in `POSTGRES_PASSWORD` and `DATABASE_URL`.
5. **Plan the data migration before starting the API.** The production start command applies database migrations and includes a guarded historical-import bootstrap when no historical import is detected. Do not point this deployment at an empty database if the existing USD data must be preserved. Take a verified backup of the current database and restore it into the new PostgreSQL instance before starting the API. Test restoration first; never experiment on the only production copy.
6. Confirm the existing storage objects are copied or remain accessible and that the bucket credentials have least-privilege access.

## Build and start

From the repository root on the VPS:

```bash
cp deploy/timeweb/.env.example deploy/timeweb/.env
# Edit deploy/timeweb/.env securely, then:
cd deploy/timeweb
docker compose config
docker compose build
# Restore the verified database backup before starting the API.
docker compose up -d db
# Restore your PostgreSQL dump into the db container using your approved backup procedure.
docker compose up -d
docker compose ps
docker compose logs --tail=200 api caddy frontend
```

Do not run the commands above against the live server until the database backup/restore plan, S3 storage, domains, and target server are confirmed. A fresh deployment is not a substitute for migrating the current production data.

## Smoke-test checklist after DNS/HTTPS is approved

- `https://app.usd-russia.ru` loads the public React site and direct refresh works on `/records`, `/rules`, and stage detail routes.
- `https://api.usd-russia.ru` responds over HTTPS; the API health endpoint and database connectivity are checked using the actual endpoint exposed by the current backend.
- Login, refresh, logout, email verification/reset flows and secure cookies work on the app domain.
- Public stages, imported historical results, records and rules match the source database.
- Admin and judge permissions are tested separately; registration can select multiple Bass Race classes.
- Upload/view/delete media, Word rules import/publication, stage registration, inspection, results entry and record recalculation are tested.
- Restore a backup into a separate test database to verify recoverability.
- Monitor logs and disk usage. Keep PostgreSQL private; do not publish port 5432.

## Important limits

- This repository change prepares deployment files; it does not provision the VPS, copy production data, create DNS records, issue certificates, or deploy the live site.
- Keep the old Tilda root site untouched until the new app is accepted and the owner explicitly approves any later cutover.
