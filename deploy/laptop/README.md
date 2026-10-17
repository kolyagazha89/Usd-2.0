# USD laptop deployment (isolated)

This directory is for a temporary Windows/Docker Desktop host. It does not replace the existing Railway API or Cloudflare Worker, and it must not be used to change production DNS without a separate owner-approved cutover.

For the domain/DNS stage, see [REG.RU DNS guide](./REG-RU-DNS.md). The primary plan for the permanent Windows PC is direct public IP with `A` records and a separately tested HTTPS reverse proxy; Cloudflare Tunnel is an alternative if inbound access is unavailable. The guide explicitly marks the steps that must wait until local acceptance.

## Architecture

- GHCR images are built only after backend checks and frontend build pass on `main`.
- PostgreSQL and MinIO use separate named persistent volumes and are not exposed beyond localhost; MinIO is a dedicated local test object store.
- The API and frontend bind to loopback only for local smoke tests.
- This Compose file is local-only. For the permanent PC, prepare a separate production Compose with HTTPS reverse proxy; direct public-IP access requires only TCP 80/443 to reach that proxy. Never expose Docker, PostgreSQL/5432, or MinIO ports publicly. Cloudflare Tunnel is an alternative, not a requirement.
- The updater polls GitHub's public `main` commit API, pulls immutable `sha-<commit>` images and only then replaces containers. If local smoke checks fail, it attempts to restore the prior image tag.

## Important caveats

1. The laptop frontend image is deliberately built with `VITE_API_URL=http://localhost:3000` and the API allows only `http://localhost:8080` during local smoke testing. This prevents accidental requests to the production API. This image is for local validation only: before using the Cloudflare Tunnel or assigning public hostnames, we must implement a safe runtime API-base configuration or a separately built domain-specific frontend image, then explicitly approve the routing change.
2. Backend production startup requires S3-compatible media storage. Configure a dedicated test bucket and least-privilege test credentials, not the existing production bucket unless an explicit migration plan has been approved.
3. First start runs the repository's guarded Prisma migrations and historical bootstrap. Use an empty local test database for initial validation; do not import production data until a verified backup and restore plan is approved.
4. The updater checks API and frontend HTTP responses and container health, but this is a basic smoke check, not full browser/business-flow acceptance.
5. The GitHub workflow publishes images only after its backend and frontend checks pass. A failed or not-yet-published latest commit will not be deployed by the updater.

## Initial setup (Windows PowerShell)

1. Install/update Docker Desktop and verify `docker run --rm hello-world` works.
2. In this directory, copy `.env.example` to `.env`. Generate unique values locally for `POSTGRES_PASSWORD`, `JWT_SECRET`, and `S3_SECRET_ACCESS_KEY`; use a long random hex value for each. Keep `DATABASE_URL`'s password identical to `POSTGRES_PASSWORD`. Never paste secrets into GitHub issues, commits, or chat.
3. The Compose stack starts a local MinIO server and creates the private `usd-test` bucket with browser CORS for `http://localhost:8080`. `S3_ENDPOINT` is internal (`http://minio:9000`) and `S3_PUBLIC_ENDPOINT` is browser-facing (`http://localhost:9000`). Do not replace these with production storage settings.
4. Do not create or route a public tunnel during initial local validation. The `cloudflared` service is disabled unless Compose is started with the `public-tunnel` profile. After local acceptance, choose the permanent-PC ingress method (direct public IP + HTTPS reverse proxy, or Cloudflare Tunnel if needed). Do not expose this local-only Compose publicly; build and test a separate production configuration first. Do not route `app.usd-russia.ru` or `api.usd-russia.ru` yet.
5. Log into GHCR from PowerShell using a GitHub token with `read:packages` only:
   `$env:GH_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin`
   Keep the token in a local secret manager/environment only; do not put it in `.env`. If the packages are public, this login may not be required.
6. Wait for the `Docker images (GHCR)` workflow to pass on `main`. Then run `./update.ps1` once from PowerShell to pull a tested commit and start the local stack.
7. Verify `docker compose --project-directory . --env-file .env -f docker-compose.yml ps`, then review logs with `docker compose --project-directory . --env-file .env -f docker-compose.yml logs --tail=100 api frontend db minio minio-init`. MinIO console is local-only at `http://localhost:9001`; do not expose it publicly.
8. Only after isolated frontend/API tests, data backup/restore validation, authentication/media tests, a separate production ingress configuration, and explicit approval should any public hostname be routed to the permanent PC.

## Automatic polling

After a successful manual update and smoke test, open PowerShell in this directory and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\\install-updater-task.ps1
```

This registers a current-user Scheduled Task that checks for updates every 5 minutes and ignores overlapping runs. Review the task in Windows Task Scheduler as **USD Laptop Auto Update**. Logs are written to `deploy/laptop/logs`. The task cannot run while the laptop is powered off; configure Windows power settings to prevent sleep when continuous availability is required. Do not install the scheduled task until manual update and rollback have been tested.

## Recovery

- Check `docker compose ... ps` and service logs.
- The updater records the previous `USD_IMAGE_TAG` in `.env` before updating and restores it if smoke checks fail.
- Database migrations are not automatically reversed by image rollback. Always back up the local test database before updates that include schema changes.
- Do not run `docker compose down -v`; that deletes persistent data.
