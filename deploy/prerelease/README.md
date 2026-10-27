# Dark Velocity frontend-only pre-release delivery

This file documents a **manual, reversible** frontend update for the USD home-PC
Ubuntu/Hyper-V stack. It does not imply that the running PC has been changed.

## Why frontend-only

The home-PC stack from PR #302 (`infra/self-hosted-hyperv-usd-20261025`)
uses one `USD_IMAGE_TAG` for both frontend and API. Replacing that variable
would also update the API, with avoidable data and migration risk.

The workflow `.github/workflows/prerelease-frontend-image.yml` instead builds
and publishes **only** the React/Nginx frontend under immutable
`ghcr.io/kolyagazha89/usd-2.0-frontend:dv-<40-character-commit-sha>`.
It runs frontend tests, production dependency audit and build before publishing.

## Host verification — required before any update

The last known host path was `~/usd-src/deploy/home-pc` on Ubuntu inside
Windows Hyper-V. Prior conversation identified the infrastructure branch
`infra/self-hosted-hyperv-usd-20261025`, possibly checked out detached, and
an earlier image tag `e8b5b0f22780a61e79765b8fd92167e241df82a2`.
**These are historical facts, not a verified current server state.**

On the actual PC, inspect the current Git commit, effective Compose files,
running frontend image ID, and external backup status. Do not expose .env,
tokens or database credentials in chat or logs.

## Candidate deploy procedure (run only after CI and browser QA pass)

From the existing checkout on Ubuntu:

```bash
cd ~/usd-src
git fetch origin design/dark-velocity-sitewide-20261027
git show FETCH_HEAD:deploy/prerelease/compose.frontend-only.yaml > deploy/home-pc/compose.design-frontend.yaml
cd deploy/home-pc
# Set the exact SHA from the successful image-publish run:
export USD_DESIGN_IMAGE_TAG=dv-REPLACE_WITH_VALIDATED_40_CHARACTER_SHA
docker compose -f compose.yaml -f compose.local.yaml -f compose.design-frontend.yaml config --quiet
docker compose -f compose.yaml -f compose.local.yaml -f compose.design-frontend.yaml pull frontend
docker compose -f compose.yaml -f compose.local.yaml -f compose.design-frontend.yaml up -d --no-deps frontend
docker compose -f compose.yaml -f compose.local.yaml -f compose.design-frontend.yaml ps frontend
curl -fsSI http://127.0.0.1:18080/
```

If the actual host uses different Compose files, image tags, or port mappings,
adapt the commands to **the inspected running stack**, not the historical plan.
Never run `docker compose down -v`, reset the database, or recreate API/DB.

Verify `https://app.usd-russia.ru` from an independent browser and check
public routes, account login, mobile navigation and images. Keep the original
API running. The root `usd-russia.ru` must not be changed.

## Rollback

Keep the previous image ID/tag before updating. Remove the design override
and recreate **frontend only** with the original Compose configuration:

```bash
cd ~/usd-src/deploy/home-pc
docker compose -f compose.yaml -f compose.local.yaml up -d --no-deps frontend
```

Do not attempt database rollback for a CSS/React-only deployment.
