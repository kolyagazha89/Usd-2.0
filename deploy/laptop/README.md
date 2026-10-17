# USD laptop deployment (isolated)

This directory is for a temporary Windows/Docker Desktop host. It does not replace the existing Railway API or Cloudflare Worker, and it must not be used to change production DNS without a separate owner-approved cutover.

## Architecture

- GHCR images are built only after backend checks and frontend build pass on `main`.
- PostgreSQL uses a named persistent volume and is not published to the network.
- The API and frontend bind to loopback only for local smoke tests.
- Cloudflare Tunnel provides outbound connectivity; do not open router ports or expose Docker/5432.
- The updater polls GitHub's public `main` commit API, pulls immutable `sha-<commit>` images and only then replaces containers. If local smoke checks fail, it attempts to restore the prior image tag.

## Important caveats

1. The laptop frontend image is deliberately built with `VITE_API_URL=http://127.0.0.1:3000` and the API allows only `http://localhost:8080` during local smoke testing. This prevents accidental requests to the production API. This image is for local validation only: before using the Cloudflare Tunnel or assigning public hostnames, we must implement a safe runtime API-base configuration or a separately built domain-specific frontend image, then explicitly approve the routing change.
2. Backend production startup requires S3-compatible media storage. Configure a dedicated test bucket and least-privilege test credentials, not the existing production bucket unless an explicit migration plan has been approved.
3. First start runs the repository's guarded Prisma migrations and historical bootstrap. Use an empty local test database for initial validation; do not import production data until a verified backup and restore plan is approved.
4. The updater checks API and frontend HTTP responses and container health, but this is a basic smoke check, not full browser/business-flow acceptance.
5. The GitHub workflow publishes images only after its backend and frontend checks pass. A failed or not-yet-published latest commit will not be deployed by the updater.

## Initial setup (Windows PowerShell)

1. Install/update Docker Desktop and verify `docker run --rm hello-world` works.
2. In this directory, copy `.env.example` to `.env`. Generate unique passwords/secrets locally. Never paste secrets into GitHub issues, commits, or chat.
3. Configure a separate S3-compatible test bucket and credentials.
4. Create a dedicated Cloudflare Tunnel in the Cloudflare dashboard, but do not assign `app.usd-russia.ru` or `api.usd-russia.ru` to it yet. Copy its token into `.env`. The tunnel's eventual public hostnames should target `http://frontend:80` and `http://api:3000` on the Docker network.
5. Log into GHCR from PowerShell using a GitHub token with `read:packages` only:
   `$env:GH_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin`
   Keep the token in a local secret manager/environment only; do not put it in `.env`. If the packages are public, this login may not be required.
6. Wait for the `Docker images (GHCR)` workflow to pass on `main`. Then run `./update.ps1` once from PowerShell to pull a tested commit and start the local stack.
7. Verify `docker compose --project-directory . --env-file .env -f docker-compose.yml ps`, then review logs with `docker compose --project-directory . --env-file .env -f docker-compose.yml logs --tail=100 api frontend db cloudflared`.
8. Only after isolated frontend/API tests, data backup/restore validation, authentication/media tests, and explicit approval should any public hostname be routed to the laptop tunnel.

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
