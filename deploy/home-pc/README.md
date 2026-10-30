# USD — migration to Windows/Hyper-V/Ubuntu (staged)

## Разовый запуск на существующем домашнем сервере

После слияния и успешных проверок этой версии выполните в существующем SSH-сеансе:

```bash
cd /home/usd/usd-deploy && git switch main && git pull --ff-only && sudo bash deploy/home-pc/setup-home-pc.sh
```

Скрипт использует существующие `.env`, контейнеры и PostgreSQL. В первый раз потребуется настроить в диалоге rclone **внешнее** хранилище и источник медиа, а затем войти в GitHub по коду через свой браузер. Пароли и ключи вводятся только на сервере/странице провайдера. Временная административная сессия GitHub удаляется после выхода; runner работает отдельным пользователем без Docker и широких прав sudo.

Установка проверяет точный main CI, загружает оба образа, согласует только известные исходные Compose-файлы и отказывает в переходе при неподдерживаемом старом входящем маршруте, не перезапуская БД или веб-шлюз. Перед первым переходом с `e8b5b0f` проверяются внешние копии, скачивание архива и настоящее восстановление PostgreSQL 18. Допускаются только две конкретные проверенные миграции: nullable USD ID и nullable ссылки на каталог оборудования. Их SHA256 и состояние истории сверяются до запуска; неизвестные/изменённые миграции и потеря строк блокируют переход.

После первого релиза проверяются **обе** публичные версии: `app.usd-russia.ru/usd-release.json` и `api.usd-russia.ru/release`. Затем установка создаёт безопасный контрольный коммит `deploy/home-pc/deployment-probe.json` в main и ждёт нового релиза и успешной работы именно установленного runner. Отдельного ручного запуска второго деплоя нет. Ожидание включает CI, публикацию, проверку резервных копий и восстановление; при больших медиа оно может занять значительное время.

Только после этих проверок сообщение установщика подтверждает автодеплой. Будущие обычные изменения с совместимой закреплённой Prisma-схемой обновляются через runner и резервный таймер. Изменение схемы за пределами проверенного перехода, красный CI или неисправное хранилище останавливают обновление, сохраняя работающую версию. Это не обещание применять любые будущие миграции без проверки. Основной `usd-russia.ru` не является целью установщика.

This is a deployment scaffold, **not evidence that the live site or database has been migrated**. Do not expose an empty USD database to public traffic. Do not switch production DNS until the restored database, S3 objects, WAN routing, HTTPS and all role flows have been verified.

## Historical host notes — current host inspection still required

Host: Windows 10 Pro 1903, Hyper-V, Ubuntu 24.04 LTS VM named USD-SERVER, Docker Engine + Compose. Host currently has Core i5-8400, 8 GB total RAM and Toshiba HDD. The unsupported Windows host OS and HDD/limited RAM are blockers to secure, resilient long-term production with participant personal data. Upgrade OS security, SSD and RAM before final cutover.

Use the existing Hyper-V Default Switch **only for initial staging**. Its internal guest IP (previously 172.17.251.201) may change after reboot. Guest Docker published ports are NOT automatically reachable on the public internet. Do not create an External VMSwitch remotely without a verified fallback, because it can interrupt RDP and AnyDesk.

## Optional self-hosted GitHub runner (no iPhone commands after supervised setup)

The `.github/workflows/request-home-pc-deploy.yml` workflow is a **request**, not a
release authorization. It runs only after a successful **main push** of
`Publish self-hosted USD images`, on a dedicated runner with labels
`self-hosted, linux, x64, usd-home-pc`. It does not check out repository
code, receive application secrets or access the Docker socket. The runner
only invokes `sudo -n /usr/bin/systemctl start usd-auto-deploy.service`.
The root-owned systemd unit independently fetches current main, verifies
the exact SHA's required main-push CI and enforces the approved Prisma
tree, existing image/Compose identity, DB backup and readiness checks.
A workflow success is **not** evidence of a production deployment.

**One-time supervised host setup is unavoidable**: inspect the live VM,
Docker Compose overlays, current images, database/media backups and off-host
restore; register a dedicated unprivileged runner account with the
`usd-home-pc` label, and review/install the root-owned deployment helpers.
The runner must not be root, in `docker`/`sudo`/`wheel` groups, or have
Docker socket access. After inspecting the installed service and runner
account, an operator may run `install-runner-trigger.sh <runner-user>` as
root. It installs only one exact sudoers command, with no wildcard and
without granting shell, Docker or arbitrary systemctl privileges.
**Do not use the existing `usd` administrator account as the runner.**
Do not grant a public repository's self-hosted runner broad Docker or
host administrator access. The runner installer also audits the effective
sudoers policy: it refuses any account with **existing** sudo grants, including
direct per-user entries and custom groups outside `sudo`/`wheel`. Use a
new dedicated unprivileged account rather than reusing a general admin user.

**Additional default-off GitHub gate:** the runner job requires the repository
Actions variable `USD_HOME_PC_HOST_APPROVED=true`. Leave it unset until the
actual Ubuntu VM, Compose overlays, running images, off-host database/media
recovery, schema migration on a real-data copy, and rollback have been
supervised and accepted. An absent variable skips the job even when main CI
passes. This repository variable is an explicit operator acknowledgement,
**not** a substitute for the root-owned local release gates. Old queued
workflow runs created before this guard was merged must be reviewed/cancelled
before a runner is registered; a new workflow file does not retroactively
change already queued jobs.

The runner trigger does **not** enable the systemd timer, create
`/etc/usd-deploy-enabled`, set `/etc/usd-auto-release-schema`, approve
a schema change, or alter production. Without these separately reviewed
root-owned gates the system stays disabled/build-only. PR #305 adds
Prisma migrations; it must go through a supervised real-data restore
and migration rehearsal, not frontend-only deployment and not an
automatic schema-changing release. Until the VM is inspected, the
workflow may remain queued because no trusted runner is registered.

## Pre-release environment and database identity gate

The release helper now **refuses to switch either image** unless the private
Compose `.env` targets exactly `app.usd-russia.ru` and
`api.usd-russia.ru`. The main `usd-russia.ru` domain is not an allowed
application target. It also checks that `DATABASE_URL` points to the local
Compose PostgreSQL service `db:5432` and that its decoded username,
password and database name match `POSTGRES_USER`, `POSTGRES_PASSWORD`
and `POSTGRES_DB`. This is essential: a backup of the local DB cannot
protect an API accidentally connected to a different database.

Duplicate or missing critical variables, unresolved interpolation and
malformed URLs are rejected **before any image replacement or backup**.
The PostgreSQL URL accepts no connection-query overrides: only the optional
single `?schema=public` Prisma parameter is permitted. A URL with an
apparently valid `db:5432` authority but `?host=`, `?hostaddr=`,
`?database=`, duplicate `schema` or other query parameters is refused,
because database clients can reinterpret those options and connect to a
different, unprotected database.
In addition to checking the on-disk settings, the helper inspects the
**already running** API and PostgreSQL container environments through Docker:
the live API `DATABASE_URL` must match the approved local DB URL; the live
PostgreSQL user, database and password must match the dump target; and the
running API's CORS, CSRF, public URLs and cookie security must still target
the prerelease site. An edited `.env` is **not** evidence that the running
containers were recreated with those values. Any drift fails closed **before
taking a backup**, without printing credentials. The mock release rehearsal
includes mismatched live DB credentials, external API DB and primary-domain
regression cases.
Values are parsed as data, never executed as shell, and credentials are
not printed. The helper also refuses inherited `APP_DOMAIN`, `DATABASE_URL`,
`USD_IMAGE_TAG`, PostgreSQL variables, Compose project/file/profile overrides,
and remote Docker host/context overrides. Docker Compose normally prioritizes
exported process variables over `--env-file`; without this check a valid
on-disk backup/domain policy could be bypassed by the operator's shell. For special characters in the password, percent-encode them
in `DATABASE_URL` and keep the literal password in `POSTGRES_PASSWORD`.
If the live host uses a different PostgreSQL topology, **do not bypass
the gate**: review its actual DB topology, Compose files and backup
target under a supervised migration plan. The CI fixture checks wrong
domains, wrong database hosts, mismatched passwords and duplicates.

## Image builds and data boundaries

- Before an automatic release, the builder checks the live GitHub main tip after CI and again after the full media backup. The release helper makes one **final main-tip check after the independent PostgreSQL backup, disposable restore/migration rehearsal and Compose validation, immediately before replacing `.env`**. A newer, malformed or unreachable main ref defers the stale candidate with retry status 75; it must not replace live containers or quarantine a healthy SHA. Direct supervised releases remain explicitly operator-approved.
- GitHub-hosted workers automatically build and publish API/frontend for every main push, with full Git SHA tags and matching OCI revision labels. Manual main publication remains available. The home service pulls these images and checks both revision labels before recording the candidate; it never silently falls back to npm installation or another SHA. A failed or partial pull cannot authorize a release. The cache is valid only while both images exist, and their revision labels are checked on every poll. Keep at least 1536 MiB available RAM and 8 GiB free Docker storage; disposable PostgreSQL and Prisma processes are each limited to 512 MiB. The dedicated root-owned checkout is cleaned before preparing a new candidate.
- Private GHCR images require host authentication using a suitable token with read:packages; do not commit tokens or place them in .env. Public images can be pulled anonymously. An existing installation must reinstall the reviewed root-owned helpers to adopt this pipeline; merely pulling the writable checkout does not update the installed service.
- Database remains private on the Compose bridge (no published PostgreSQL port).
- Backend Dockerfile and Compose start the API with `node dist/main.js`. The obsolete historical-import startup script has been removed; schema migrations remain a separate reviewed operation.
- Production secrets, media objects and actual DB data are NOT present in this repository.

## Mandatory independent PostgreSQL backup before every release

An archive kept only in `/var/lib/usd-deployer/backups` cannot survive a
physical disk or VM loss. **All releases, including manual invocations of
`usd-release-approved`, now require an independently retrievable database
archive.** The installer installs the root-owned
`/usr/local/libexec/usd-verify-db-offsite-backup` helper. Configure the
single-line root-owned, mode `0600` policy file
`/etc/usd-deployer/db-backup.conf`, for example:

```text
usd-db-offsite:backups/usd/postgres
```

The remote name and path are examples, not an existing backup service.
The operator must configure rclone credentials readable only by root, confirm
the destination is genuinely independent of the home PC, set retention and
encryption, and verify recovery from another machine. The remote prefix must
not contain spaces, traversal, shell interpolation or a trailing slash.

Before replacing either application container, the release helper creates a
fresh PostgreSQL 18 custom-format dump, verifies the archive list, uploads it
to a unique remote object, downloads it to a private temporary file and
compares **every byte** with the original. It then restores the local archive
into disposable PostgreSQL 18 and checks candidate Prisma migrations. A
missing policy, inaccessible remote, changed bytes or failed cleanup blocks
the release. The automatic builder remains build-only when the policy is
missing. The off-host object is retained for recovery; the temporary downloaded
copy is removed before release proceeds.

This does **not** enable unattended Prisma schema migrations, prove that
the off-host service has independent failure domains, or replace a supervised
restore of the actual production backup. Keep `usd-russia.ru` untouched.

## Automatic off-host media gate (opt-in, fail closed)

The local builder now stays **build-only** until an operator installs **both** the reviewed Prisma tree policy and a private, root-owned `/etc/usd-deployer/media-backup.conf` containing exactly two lines: an rclone **source** remote path and an independent **off-host backup prefix**. Example policy values (illustrative, not live credentials):

```text
usd-media:current-bucket
usd-offsite:backups/usd/media
```

The operator must verify that these are genuinely independent storage systems, with protected rclone credentials available only to root; distinct remote names alone cannot prove off-host independence. The policy file must be mode `0600`, owned by root and not a symlink. Do **not** commit it or its credentials. A missing policy prevents automatic release; an unsafe or malformed policy fails closed. No policy or rclone remotes are installed or enabled by this repository.

For every eligible, CI-approved same-schema `main` SHA, the builder creates a **new unique backup prefix**, calls the installed root-owned `usd-verify-media-backup`, compares every object by downloaded content, restores the full media backup into a private temporary directory, verifies it again and deletes the temporary copy before requesting a live application swap. An inaccessible source, empty source, insufficient local restore space, failed checksum, failed restore or failed cleanup leaves the existing application untouched. A remote failure is retryable; it does not quarantine an unattempted application release. This media preflight is **in addition to** the release helper's fresh PostgreSQL dump and mandatory disposable PostgreSQL 18 restore/migration rehearsal. Budget up to two hours for the bounded host service; the GitHub runner trigger can wait up to 150 minutes. Capacity and remote throughput must be checked on the actual Ubuntu host before enabling anything.

Direct supervised calls to `usd-release-approved` also require this policy and
a successful full media backup/restore **before** taking the database dump or
switching containers. Previously only the automatic builder enforced the media
gate, so a manual release could bypass it. Automatic releases reuse their
already-verified media preflight under the continuously held deployment lock;
they do not run a second full media backup. Mock and real-Docker rehearsals
exercise the manual refusal path.

## Supervised off-host media backup and restore check

The installer also provides `/usr/local/libexec/usd-verify-media-backup`.
It requires `rclone` and operator-configured, separately authenticated
source and **off-host** backup remotes. Neither media credentials nor rclone
configuration belong in the repository. Choose a fresh, empty destination
prefix for every snapshot; the verifier deliberately refuses to overwrite
an existing snapshot. Example (replace both paths with real verified remotes):

```bash
sudo /usr/local/libexec/usd-verify-media-backup \
  usd-media:current-bucket \
  usd-offsite:backups/usd/media-<SNAPSHOT_DATE>
```

The helper copies without deleting source objects, downloads and compares
every object against the backup, then restores the **entire** backup into a
new private temporary local directory and verifies content and object counts
again. It requires enough free local disk for the full restored dataset;
failure leaves the off-host backup in place for investigation. A successful
backup is reported only after the private local restore directory is deleted;
failure to delete that copy is a hard error with its path printed for secure
cleanup. CI deliberately injects a deletion failure to exercise this gate. Do not assume
the backup is off-host merely because the destination has a different name:
verify its physical provider, account, access controls, retention and
independent recovery credentials. Do not use a prefix nested inside the
source. A successful fixture test in CI does **not** verify production S3,
media credentials, actual objects, or retention.

Media verification and PostgreSQL restoration are **separate gates**.
Neither helper modifies the live USD database, deploys a candidate, changes
public ingress routes, or enables the timer. Both must be exercised with actual
host data before any supervised release that depends on them.

## Supervised Prisma migration rehearsal (no production writes)

The installer provides `/usr/local/libexec/usd-rehearse-schema-on-backup`. Before
any release that changes `backend/prisma`, use a **private, verified PostgreSQL
18 custom-format archive** and the locally built API image for the proposed
commit. This is a rehearsal only, **not** an authorization to apply migrations
to the live database or deploy an unapproved PR.

```bash
# Example: replace the archive name and SHA with values verified on Ubuntu.
sudo /usr/local/libexec/usd-rehearse-schema-on-backup \
  /var/lib/usd-deployer/backups/verified-production.dump \
  ghcr.io/kolyagazha89/usd-2.0-api:<FULL_APPROVED_SHA>
```

The helper creates a fresh Docker-internal network, PostgreSQL 18 container
and disposable volume; it restores the **entire** archive with
`pg_restore --exit-on-error`, records row counts for every pre-existing
application table, runs `prisma migrate deploy` and `prisma migrate status`
from the candidate image, and checks that those tables and row counts are
still present before destroying temporary resources. A destructive or
row-moving migration is deliberately blocked for separate manual review. It publishes no ports, receives no production
environment file, and cannot reach the public internet through its internal
network. A failed restore or migration blocks approval. PostgreSQL 18 data
volumes on the live Compose project are never mounted.

The disposable restore volume contains a complete copy of the production
database, including personal data. The rehearsal reports success **only after**
its temporary container, network and data volume have been removed. Failure
to remove any resource is a hard error, and the remaining resource name is
printed for immediate supervised cleanup. The real-Docker CI suite injects
a volume-deletion failure to verify that this condition cannot pass silently.

A successful rehearsal **does not** prove that a live migration is safe:
compare data counts and application invariants, review migration SQL for
destructive operations, take a second off-host DB backup, and verify that
all media/S3 objects can be restored independently. Do not enable automatic
schema changes: `auto-deploy.sh` deliberately refuses Prisma tree changes.
The real migration remains a separately approved, supervised operation with
a recovery window. GitHub Actions tests this helper with a disposable
PostgreSQL 18 fixture, **not** with the actual home-server database.

## Historical initial migration procedure (not an update procedure for a running host)

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

## Existing USD PostgreSQL is the source of truth

On the already-running home server, retain the existing PostgreSQL 18 container, volume and all participant/competition records. Never initialize a second empty production database in place of existing data. The below cold-start restore instructions are historical and are NOT an update procedure for a running host.

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

Caddy remains in the opt-in `direct-edge` profile; publishing 80/443 requires a separately tested inbound route. The former ingress overlay was removed from the source tree. If the *running* API was started with a now-unsupported Compose overlay, the one-time installer refuses to switch it: replace and verify the public HTTPS route first, without stopping the existing website. Do not erase credentials or active containers as a shortcut.

For the local SSD-backed S3 service see [RustFS installation](s3/README.md). A private S3 API on the Ubuntu host is not browser-reachable until a separately approved HTTPS subdomain has been configured.

Set up a stable public route from WAN to Caddy first. With Windows Hyper-V Default Switch one possible path is router TCP 80/443 -> Windows LAN IP -> controlled Windows TCP portproxy to Ubuntu guest 80/443. This needs a public ISP IPv4 (no CGNAT), tested Windows firewall rules, nonconflicting ports and reconfiguration when VM IP changes. No network forwarding is included automatically because topology is unknown and remotely modifying the NIC risks loss of access. Only open public web ports, NEVER port 3389, 5432 or Docker API. UDP443 is optional.

After an approved cutover, change DNS ONLY for `app.usd-russia.ru` and `api.usd-russia.ru`; leave apex `usd-russia.ru`, Tilda and nameservers untouched. Caddy ACME HTTPS needs correct DNS and externally reachable ports. Check from an independent mobile data connection. Google OAuth must allow callback `https://api.usd-russia.ru/google/callback`.

## Data and rollback rules

- Never execute `prisma migrate reset`, `docker compose down -v` or overwrite original production data.
- A container volume is not a backup. Encrypt backups to a different physical device/location, back up S3, and test recovery.
- New images are immutable Git SHA tags. Updating images does not revert DB migrations.
- Keep the current working service until the replacement has passed real acceptance checks.
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

## Published-image timer and optional automatic release (host validation pending)

`auto-deploy.sh` polls trusted `main`, downloads both GitHub-published images with full Git SHA tags, verifies their OCI revision labels, and caches the prepared SHA in the existing `built-sha` state file. It requires the root-owned `/etc/usd-deploy-enabled` switch. With no automatic release policy it remains build-only (image preparation only), preserving existing installations. GitHub publication can finish before the remaining main CI checks; the host still waits for its independent exact-SHA CI gate, and the ten-minute timer retries deferred releases.

The service sets `BUILDX_CONFIG=/var/lib/usd-deployer/buildx`, under its private writable state directory. This avoids the old `/root/.docker/buildx` write failure under `ProtectHome=read-only`, without making root's home writable. Normal deployment no longer invokes Buildx on Ubuntu.

Both production Dockerfiles print the npm debug-log tail from a failed `npm ci` layer and retain its exit code. `--foreground-scripts` also makes lifecycle-script failures visible. These are in-container options; host `NPM_CONFIG_*` settings alone are not passed into Docker build. The observed 16–17 second `read ETIMEDOUT` remains a host-network incident until the debug stack and failing request are captured; moving normal builds to GitHub removes it from the home release path, but does not establish its root cause.

**Main CI gate:** automatic release also checks GitHub Actions for the exact new commit SHA on the `main` push. Both `Backend CI` and `Home PC deployment safety checks` must complete successfully on **every** release; the latter builds both production Dockerfiles, applies the production Prisma migrations to a disposable PostgreSQL 18 database, boots the actual API with fixture-only credentials and checks HTTP plus database connectivity, and rehearses a real PostgreSQL 18 backup/restore plus failed-image rollback in an isolated GitHub-hosted stack. When the deployed and new commits differ under `frontend/`, the path-filtered `Frontend CI` must also succeed. A green pull-request run does not substitute for a successful `main` push run. PR checks, runs for other branches or SHAs, pending/failed/cancelled runs and unverifiable API responses cannot authorize a release. The gate also binds each required workflow name to its reviewed `.github/workflows/` file path; a second green workflow with the same display name cannot impersonate Backend CI, Frontend CI or the real Docker/PostgreSQL safety rehearsal. When a workflow has multiple runs for the same SHA, the newest run ID takes precedence; only within that run does the latest attempt take precedence. An older successful rerun cannot mask a newer failed or pending run. A pending or unavailable check leaves the current containers untouched and retries on the next poll. The verifier is installed at `/usr/local/libexec/usd-verify-main-ci`; Ubuntu requires Python 3 and outbound HTTPS to the public GitHub Actions API. This gate is **in addition to** schema compatibility, local image validation, database backup, readiness and rollback; it does not prove the live site's functional correctness. Do not enable automatic release until the main branch's push workflows are verified operational and the host's first supervised release succeeds.

Automatic switching additionally requires `/etc/usd-auto-release-schema` (and the private off-host media policy described above): a root-owned, non-symlinked file, not writable by group or others, containing the exact Git tree SHA of `backend/prisma` verified against the actual deployed database. Both the running version and the new main commit must have that identical tree. Any schema, migration or Prisma seed change stops automatic release for supervised review. **No schema or historical migrations run automatically.** A failed release SHA is quarantined in `/var/lib/usd-deployer/failed-release-sha`; the timer will not repeatedly retry it. The builder retains its exclusive deployment lock continuously through the release helper; the helper verifies the inherited descriptor. This prevents a second builder from changing approval/build state between the CI gate and the release. Direct supervised releases acquire the same lock independently. Unexpected lock contention is treated as transient (exit 75), not as a failed SHA; the next poll can retry. Review the failure and restore health before explicitly clearing that marker.

**Root-owned Compose trust boundary:** the installer copies the reviewed `compose.yaml` and `compose.local.yaml` to `/etc/usd-deployer/compose/` as root-owned, non-writable-by-other snapshots. The release helper **never executes Compose YAML from the writable `usd` checkout**: it checks that the running configuration matches the reviewed snapshot, then invokes Docker Compose using the root-owned copies and the original project directory. If the running host has customized or older Compose files, automatic release refuses to run until an operator compares and deliberately reconciles them with the reviewed snapshots. The first supervised release may change the application containers' Compose file labels to the trusted paths; PostgreSQL is never included in the `up --no-deps api frontend` operation. Changes to Compose infrastructure require a reviewed reinstall of these snapshots; do not update the trusted files automatically from `main`.

`release-approved.sh SHA` checks exact SHA approvals, local old/new images, running image tags and active Compose overlays. It rejects a production `.env` readable by group/other users, and cleans up any staged `.env` copy when Compose validation fails. Before changing the environment or application containers, it creates a private custom-format dump under `/var/lib/usd-deployer/backups` (root-owned and inaccessible to the unprivileged `usd` account) and verifies its archive table of contents with PostgreSQL's `pg_restore --list`. Empty, failed or unreadable backups prevent release. **Before replacing the live API/frontend**, the release helper now requires the installed root-owned `/usr/local/libexec/usd-rehearse-schema-on-backup` to restore that exact fresh archive into a disposable PostgreSQL 18 container/volume, verify existing table row counts, apply and check the candidate API image's Prisma migrations, and remove the disposable data. Any failure, including cleanup failure, blocks the release while the old containers continue running. This does **not** modify or restore the live database, nor does it establish an independent off-host backup; retained private on-host archives must still be copied to protected off-host storage and tested there. On hosts with limited RAM/disk, this full preflight can block release until capacity is increased.

Only API/frontend are recreated with `--no-deps`. The existing PostgreSQL container must report Docker health `healthy` before the backup, remain the same healthy container immediately after the dump, and still be healthy after the new services pass readiness. The existing API and frontend must also pass a short in-container readiness preflight before backup; a broken baseline cannot be trusted as a rollback target. An unhealthy or replaced database blocks or rolls back the release. Both application services must pass bounded HTTP readiness checks, **and the API container must successfully execute a read-only PostgreSQL `SELECT 1` using its actual `DATABASE_URL`**. An HTTP 200 from the static API root cannot conceal invalid DB credentials or a broken API-to-DB network path. The same database connectivity probe is mandatory for baseline acceptance, candidate release and rollback verification. The release additionally verifies the running API/frontend containers use the exact approved immutable image tag, both after deployment and after a rollback; HTTP 200 from a stale container does not count as success. SIGTERM/SIGINT also trigger rollback; systemd allows ten minutes for shutdown recovery. On failure, the previous images are restored and checked again; a broken rollback emits a CRITICAL error and returns failure to systemd. **If restoring the original `.env` fails, the release helper retains its private root-only original snapshot at the exact `/var/lib/usd-deployer/release-env.*` path printed in the CRITICAL log. Do not retry automatic deployment or delete that file: stop the timer, inspect the live `.env`, and have the operator restore the saved configuration with correct ownership/mode before manually recovering the previous application images. Never paste the snapshot contents into an issue or chat.** An unchanged DB container ID is checked after a successful release. No Docker socket is exposed to a GitHub runner.

The installer takes the same exclusive deployment lock as the builder and release helper, so a reinstall cannot replace reviewed Compose snapshots or scripts during an active release. A busy lock makes installation exit 75 without changing files; retry after the running operation finishes. The installer remains inert: it neither enables the timer nor creates a release policy. The systemd service permits writes only to the existing deployment and backup directories within the otherwise read-only home tree. The release helper creates its own root-owned private backup directory under `/var/lib/usd-deployer`; existing operator backups in `/home/usd/backups` are not moved, read, overwritten or removed. Keep an independent encrypted off-host backup as well.

### Supervised host activation — only after acceptance

1. Inspect the live host's Compose labels, image tags, data volumes, environment ownership and available RAM/disk. Confirm the fixed deployment path `/home/usd/usd-deploy/deploy/home-pc` matches the actual host; do not copy an empty environment over an existing one.
2. Verify an independent encrypted off-host backup, restore into a disposable PostgreSQL 18 database, compare application counts/history, and preserve media backups. The archive listing check alone does not establish recoverability.
3. Run both rehearsal scripts **only on a disposable runner**: they contain isolated Docker mocks and test-only host fixtures. Then rehearse real Docker update and rollback on a disposable stack, never the live DB.
4. Install the helpers from the reviewed commit using `sudo bash deploy/home-pc/install-local-deployer.sh`. It does not start any service.
5. Verify the actual deployed commit exists in the trusted source checkout, compare its Prisma schema/migration state to the live DB, then obtain its schema tree with `git -C /opt/usd-release-source rev-parse '<verified-deployed-sha>:backend/prisma'`. Store exactly that output in `/etc/usd-auto-release-schema` as root, mode 0600. Do not approve a tree from an unverified candidate.
6. After a supervised build, backup, release and rollback rehearsal, create the root-owned build switch and enable the timer. Future reviewed main changes with the same approved Prisma tree can then release automatically. Changed schema requires a separately reviewed migration, successful backup/restore checks and renewed policy.
7. Verify externally at `app.usd-russia.ru` and `api.usd-russia.ru`; inspect `journalctl -u usd-auto-deploy.service`. Leave `usd-russia.ru` unchanged.

**Current evidence:** shell tests cover build-only default, cached-image release, schema refusal, untrusted policy rejection, failed-SHA quarantine, failed/invalid backup refusal, running-image mismatch refusal, successful release, interrupted release, healthy rollback and unhealthy rollback. The mocks additionally cover a failed baseline readiness check and a database that becomes unhealthy during the backup; both must refuse a release before replacing containers. They also assert that the builder retains its exclusive lock through the release call and that a forged inherited-lock flag is rejected. The CI gate tests verify that a newer failed/pending workflow run cannot be masked by an older successful rerun. These mocks do not prove the real Ubuntu host, Docker images, public ingress, database restore or live deployment. Do not enable production automation until those host gates pass.

`test-release-docker.sh` is restricted to a disposable GitHub Actions runner. It creates fixture-only API/frontend images and a uniquely named labeled PostgreSQL 18 volume, tests an unhealthy release and rollback, verifies retained marker data/DB identity, and restores the generated dump into a separate disposable database. It refuses an existing stack or volume. Its CI result must be checked; never run it on the live host.

### Public acceptance remains inside rollback (2026-10-29)

`release-approved.sh` now keeps its application rollback trap active until the
root-owned `/usr/local/libexec/usd-verify-prerelease NEW_SHA` succeeds. It checks
both exact public revisions, settings/stages/records response shapes, anonymous
access denial for personal API routes, and HTML plus the actual built JS/CSS
assets for home, login, participant and inspection routes. These are read-only
requests without credentials; they do not prove a successful login or a full
participant/judge workflow. Requests and redirects stay on the two prerelease
origins; the primary domain is excluded.

A missing, writable or symlinked verifier refuses a release before replacing
images. A failed public check after replacement rolls the application back using
the existing same-schema policy. It does not restore or mutate the live database.
The success marker is written only after public acceptance. Existing installations
must receive the reviewed helper update through `install-local-deployer.sh`
(or the supervised setup) before this behavior exists on Ubuntu.

Runner admission is checked on **every** supervised setup, including an already
registered runner with an existing trigger. `verify-runner-policy.py` accepts
only an explicitly unprivileged fresh account, or the exact trusted narrow
trigger as its only effective sudo grant. Direct/custom-group extra grants,
Docker socket access, privileged groups, symlinked or writable policies stop
setup before registration or service activation. CI covers narrow-plus-extra
sudoers, valid reuse, and a writable existing trigger on a disposable account.

### Authenticated image digests (2026-10-30)

The publishing workflow signs each image digest using GitHub Actions OIDC with
checksum-pinned Cosign3.1.3 and a `git_sha` annotation. The host verifier requires
that digest, the exact `publish-home-pc-images.yml@refs/heads/main` identity, the
GitHub Actions issuer and valid certificate/transparency evidence. SHA-shaped
tags and source labels alone do not authorize releases. After replacement, the
running container image ID must match the authenticated local image ID.

`install-local-deployer.sh` installs the checksum-pinned root-owned verifier
through `install-cosign.sh`. This needs outbound HTTPS to the official GitHub
release; normal image verification also requires GHCR/Sigstore services. Network
or signature failures keep current services untouched; the timer retries later.
Existing running images remain the supervised rollback baseline during the
transition from old unsigned releases. No new unsigned candidate is admitted.
There is no option to skip signatures, certificate checks or transparency checks.
This code must be installed on Ubuntu before its protections exist there.
