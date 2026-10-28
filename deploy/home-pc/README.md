# USD — migration to Windows/Hyper-V/Ubuntu (staged)

This is a deployment scaffold, **not evidence that the live site or database has been migrated**. Do not expose an empty USD database to public traffic. Do not switch production DNS until the restored database, S3 objects, WAN routing, HTTPS and all role flows have been verified.

## Current host and limitations

Host: Windows 10 Pro 1903, Hyper-V, Ubuntu 24.04 LTS VM named USD-SERVER, Docker Engine + Compose. Host currently has Core i5-8400, 8 GB total RAM and Toshiba HDD. The unsupported Windows host OS and HDD/limited RAM are blockers to secure, resilient long-term production with participant personal data. Upgrade OS security, SSD and RAM before final cutover.

Use the existing Hyper-V Default Switch **only for initial staging**. Its internal guest IP (previously 172.17.251.201) may change after reboot. Guest Docker published ports are NOT automatically reachable on the public internet. Do not create an External VMSwitch remotely without a verified fallback, because it can interrupt RDP and AnyDesk.

## Why new compose and GitHub-built images

- Backend and frontend images built by GitHub Actions and published to GHCR with an immutable full Git SHA as tag. This avoids compiling the project on a 2–3 GB RAM/HDD VM.
- Private GHCR images require host authentication using a suitable token with read:packages; do not commit tokens or place them in .env.
- Database remains private on the Compose bridge (no published PostgreSQL port).
- Backend Dockerfile and Compose start the API with `node dist/main.js`. The obsolete historical-import startup script has been removed; schema migrations remain a separate reviewed operation.
- Production secrets, media objects and actual DB data are NOT present in this repository.

## Initial Ubuntu staging

Wait until the PR lands in main and the GitHub Actions image publication run succeeds. Make sure both images have the SAME successful commit tag.

```bash
cd ~/usd-src
git pull --ff-only origin main
cd deploy/home-pc
cp .env.example .env
chmod 600 .env
nano .env
```

Edit actual settings: image SHA tag; POSTGRES_PASSWORD; matching DATABASE_URL password; JWT and original auth variables; S3 endpoint/bucket/credentials; email and Google OAuth integration. Never send .env or tokens into chat. For a real DB restore, preserve Google token encryption key or reconnect the account after migration. Keep CORS and API URLs on app.usd-russia.ru/api.usd-russia.ru.

First verify config and only start PostgreSQL:

```bash
sudo docker compose config --quiet
sudo docker compose pull db
sudo docker compose up -d db
sudo docker compose ps
```

Do **not** run `sudo docker compose up -d` until the production DB is restored, the S3 bucket is available, and the API startup/migration procedure has been approved.

## Railway export — mandatory before live cutover

Railway app outage or deployment pause does **not prove** PostgreSQL data is gone. Obtain the real database backup from Railway PostgreSQL through its still-authorized private or external connection; if unavailable request recovery/export from the provider. Do not invent participant identities and results from archive import files.

Use a compatible pg_dump version and make a custom-format dump (`pg_dump -Fc --no-owner --no-acl`) from the actual live DB. Store an encrypted independent backup off the target Windows machine. Test restoration in a separate isolated DB first, compare counts of User/Participant/Car/Stage/Registration/Result and configuration history. When ready for final switch, freeze all writes on the old API and take a FINAL fresh dump, because new registrations might have been created after the test dump.

All referenced media files from the current S3 storage must be copied/retained too. A PostgreSQL dump does not include photos, posters or document blobs. Validate permissions, URLs, signed read/upload paths, Word documents, and backups.

### Example restore only into a NEW EMPTY target DB

Assumes `db` is running, an independently verified archive exists at `/secure/path/usd-production.dump` on the Ubuntu VM, credentials are set as in the template, and the destination has no app tables:

```bash
cd ~/usd-src/deploy/home-pc
sudo docker compose cp /secure/path/usd-production.dump db:/tmp/production.dump
sudo docker compose exec -T db pg_restore \
  -U usd_app -d usd --no-owner --no-acl --exit-on-error \
  --single-transaction /tmp/production.dump
```

Before schema migrations, inspect the restored `_prisma_migrations` and current repository Prisma migration versions. Migrations modify schema and require backups. After explicit review, and only if actually required, the backend image can run the guarded migration WITHOUT the history bootstrap:

```bash
sudo docker compose pull api frontend
sudo docker compose run --rm --no-deps api node src/scripts/migrate-safe.js
```

Only after schema, S3 and credentials are proven, start the remaining services:

```bash
sudo docker compose up -d api frontend caddy
sudo docker compose ps
sudo docker compose logs --tail=150 api
```

Run public smoke tests of login/refresh/logout, historical-profile search, admin and judge RBAC, photos, all results/records and registrations, QR scanning on a real phone, Gmail delivery and Google OAuth.

## Connecting app and API domains

Set up a stable public route from WAN to Caddy first. With Windows Hyper-V Default Switch one possible path is router TCP 80/443 -> Windows LAN IP -> controlled Windows TCP portproxy to Ubuntu guest 80/443. This needs a public ISP IPv4 (no CGNAT), tested Windows firewall rules, nonconflicting ports and reconfiguration when VM IP changes. No network forwarding is included automatically because topology is unknown and remotely modifying the NIC risks loss of access. Only open public web ports, NEVER port 3389, 5432 or Docker API. UDP443 is optional.

After an approved cutover, change DNS ONLY for `app.usd-russia.ru` and `api.usd-russia.ru`; leave apex `usd-russia.ru`, Tilda and nameservers untouched. Caddy ACME HTTPS needs correct DNS and externally reachable ports. Check from an independent mobile data connection. Google OAuth must allow callback `https://api.usd-russia.ru/google/callback`.

## Data and rollback rules

- Never execute `prisma migrate reset`, `docker compose down -v` or overwrite original Railway data.
- A container volume is not a backup. Encrypt backups to a different physical device/location, back up S3, and test recovery.
- New images are immutable Git SHA tags. Updating images does not revert DB migrations.
- Keep Railway and existing public service until the target site and source-to-destination checks have been signed off.
- Production DNS cutover is a separate action; preparing this PR does not imply publication.

## Self-hosted GitHub Actions runner — security boundary

The `usd-ubuntu-deploy` runner is registered on the same Ubuntu host as the USD PostgreSQL database. **Registration or an Idle status is not permission to deploy.** A repository-scoped self-hosted runner on a public repository is not an appropriate trust boundary for production secrets or Docker access: labels and a workflow-level `if` condition alone do not provide isolation against untrusted workflow code.

Before enabling deployment jobs:

1. Keep the runner account unprivileged: no `sudo`, no `docker` group, no read access to `deploy/home-pc/.env`, database volumes, or backup directories.
2. Prefer moving deployment execution to a **private, access-controlled repository** with a dedicated runner and protected environment; public PR workflows must never target it. A private repo must also restrict who can modify deployment workflows and approve releases.
3. Build and test images on GitHub-hosted runners. Publish only SHA-pinned API and frontend images from a trusted release commit. Verify that both images exist before deployment.
4. Make the deployment job require an explicitly approved release; use a narrowly scoped root-owned deployment helper rather than giving the runner unrestricted Docker socket access. Validate the requested image SHA and keep the existing Compose project, env file and database volume unchanged.
5. Back up and verify the database before schema migrations. Migration approval, compatibility checks, health checks and rollback are separate gates. Image rollback does not undo database migrations.

**Until these controls are in place, do not add `runs-on: self-hosted` jobs in this public repository or grant the runner privileged access.**

## Local build timer and release safety (not yet validated on the live VM)

`auto-deploy.sh` is a build-only job: it fetches the latest `main` commit and builds two local Docker images tagged by the full commit SHA. It requires an operator-created `/etc/usd-deploy-enabled` switch. It does not deploy, migrate or restart containers.

`release-approved.sh SHA` is a separate manual release. Before running it, the operator must review DB schema compatibility and create two root-owned files containing that exact SHA: `/var/lib/usd-deployer/schema-approved-sha` and `/etc/usd-release-approved`. The SHA must also match `/var/lib/usd-deployer/built-sha`. The release checks that both old and new API/frontend images are present, discovers the exact Compose files used by the running containers, updates only API/frontend, checks both services from inside their containers, and attempts to restore the previous images if a step fails. PostgreSQL is never targeted for recreation. The release does not apply Prisma migrations or undo a DB migration.

**Do not enable the timer or run a release yet.** The code needs shell and integration tests, verification of the actual Compose labels on Ubuntu, a proven database backup/restore, and a supervised rollback rehearsal. This PR does not change the live server, and the public domain `usd-russia.ru` is outside its scope.
