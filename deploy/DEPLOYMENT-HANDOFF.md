# USD deployment handoff — resume later on the permanent PC

Last updated: 2026-10-17

## User's explicit decision

**Do not set up or run the Docker stack on the current laptop now.** Do not ask the user to perform laptop setup steps. Pause hands-on deployment until the user is ready to continue on the permanent USD PC.

The laptop is only a possible test machine; the agreed plan is to move directly to preparing and validating deployment on the permanent PC later.

## Target host and network

- Permanent host: Windows 10/11 PC.
- Internet: public IP is available, but before DNS cutover verify whether it is truly reachable for inbound connections, whether the ISP uses CGNAT, whether inbound ports are allowed, and whether the IP is static or dynamic.
- Primary ingress plan: direct public IP, DNS A records for `app.usd-russia.ru` and `api.usd-russia.ru`, plus an HTTPS reverse proxy with automated certificate renewal.
- Cloudflare Tunnel is an alternative if direct inbound access is unavailable (for example, CGNAT or ISP/router restrictions), not a required part of the primary plan.
- Only expose required web ports 80/443 to the reverse proxy. Never expose PostgreSQL (5432), MinIO (9000/9001), Docker management, or the API's internal port directly to the public internet.
- Public site name is **ЮСД**. “USD 2.0” is an internal technical name only.

## Repository and current Git state

- Repository: `kolyagazha89/Usd-2.0`
- Working branch: `infra/github-container-auto-update`
- Draft PR #232: https://github.com/kolyagazha89/Usd-2.0/pull/232
- **Pre-migration data-quality gate:** PR #233 (https://github.com/kolyagazha89/Usd-2.0/pull/233) remains unmerged and must be reviewed before deployment. Backend CI passed on the current import branch head `f4156367ae5d1e1e63a2bee960e50cf9d8c1498c` (run #1208), including build, lint, unit tests and E2E tests. Tests read `backend/data/historical-xlsx.json`, the repository snapshot of `USD _ Регистрация.xlsx` and `USD _ Результаты.xlsx`, validate the mapped sheets and row counts, and dry-run the full configured stage mapping with Prisma mocked.
- **Registration/import numbering gate:** keep numbering rules aligned with registration: newly issued primary numbers begin at `001` (never `000`); missing historical numbers are allocated sequentially while avoiding stage/source collisions; Results is the source of truth and Registration is auxiliary; conflicts must be visible. Historical BassRace duplicate numbers for different participants receive the next number after the stage maximum, while a number can be shared between BassRace and a normal class for the same registration. A historical BassRace result number `0` is preserved as a class number separately from the positive primary registration number; zero in non-BassRace results is not treated as a new issued number. The snapshot currently contains 666 meaningful registration helper rows and 1,080 result rows across mapped stages; 334 result rows have source number `0`, so this edge case must remain covered. CI passed for the current import branch head above. Do not merge PR #233 without the user's explicit approval.
- PR must remain unmerged until reviewed, tested, and explicitly approved by the user.
- Deployment instructions:
  - `deploy/laptop/README.md`
  - `deploy/laptop/REG-RU-DNS.md`
- The DNS guide has been updated to make direct public IP the primary path and Tunnel an alternative. These are documentation changes only; no DNS records have been changed.
- Latest previously verified CI commit: `8e9c80c23ca4b56a9000cf172985792dfe441329` — Backend CI and Docker images workflow both passed.
- Documentation commits followed that CI-tested commit, including `8a5369c2646f88119c1f417f0a3fe22bd8eb3734` and `0d551dc6c816dee27b1d24ac14fd187c6b1a066f`. Verify CI for the newest branch head before considering the branch ready; do not assume those later commits have been tested.
- No merge to `main`, production changes, public routing, DNS changes, or production database migration have been performed as part of this deployment plan.

## Existing deployment work

- Docker Desktop works on the current Windows 11 laptop, but the user has explicitly chosen not to do laptop setup now.
- Branch contains Dockerfiles, Compose for an **isolated local test stack**, GHCR image workflow, PowerShell updater/rollback script, and DNS/deployment docs.
- Local Compose binds frontend/API/MinIO to loopback and uses a frontend image built with `VITE_API_URL=http://localhost:3000`; API/CSRF and MinIO CORS are local-only. **This configuration must not be exposed publicly or treated as the production PC configuration.**
- The local test stack uses an empty test PostgreSQL database and dedicated MinIO test bucket. Do not use production credentials or import production data without an explicit, verified backup/restore and migration plan.
- Scheduled automatic updater task has not been approved for installation; manual update and rollback checks must precede scheduled updates.

## Resume plan — start on the permanent PC when the user is ready

1. Recheck GitHub branch head and CI status; inspect PR #232 and keep it unmerged until the user approves.
2. Gather the permanent PC's actual network facts: public IPv4 reachability, static/dynamic IP, CGNAT possibility, router control, and Windows version. Do not change DNS during discovery.
3. Design a **separate production Compose** for the permanent PC, with HTTPS reverse proxy (direct public IP primary) and internal-only API/database/object storage. Keep local laptop Compose as a local-only test configuration.
4. Prepare public frontend/API configuration for `https://app.usd-russia.ru` and `https://api.usd-russia.ru`, including CORS/CSRF allowlists, secure cookies, proxy trust, and public media/upload URLs and CORS. Validate authentication, registration, admin flows, email, media uploads and downloads.
5. Set up persistent storage, backups of PostgreSQL and media, and actually test restoration before any production data migration.
6. Configure Windows/Docker startup after reboot, health monitoring, logs, manual image update and rollback. Only then consider scheduled updates.
7. Inspect current REG.RU DNS records and preserve root domain `usd-russia.ru`, `www`, MX, SPF, DKIM, DMARC, and other services. Do not modify these records or NS servers.
8. Only after acceptance tests and explicit user approval, configure DNS for `app` and `api` and perform a controlled cutover. Keep the existing Railway API, Cloudflare Worker, production database and current live site untouched until that approval.

## Hard safety rules

- No work on the laptop deployment stack until the user asks to resume; no instructions telling the user to run laptop setup now.
- No production secrets in chat, Git, or sample files.
- No production data imports, destructive database operations, or `docker compose down -v`.
- No public tunnel, DNS edits, port exposure, merge, or production cutover without explicit approval at the relevant milestone.
- Keep a verified backup and rollback path before changes that could affect data or public availability.
