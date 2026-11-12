# USD venue LAN hub — laptop + Wi-Fi router (foundation, NOT event-ready)

**Agreed primary architecture:** the laptop is a local USD server; a dedicated
router/AP connects every judge's phone to **the same local API, PostgreSQL and
RustFS bucket**, with no upstream Internet required during the event. The shared
LAN hub is the source of on-site state. A phone's isolated encrypted browser
package is an emergency *fallback*, never the primary judge workflow.

## LIVE results on the isolated Wi-Fi — first vertical slice

Once the server has a **properly provisioned local stage and results**, open
`https://<laptop-LAN-IP>/venue/live` from phones, tablets or a screen on
the same router Wi-Fi. No public Internet, DNS, or public API is required.
The board refreshes every 4 seconds; on connection loss it keeps the last
successful snapshot and marks it stale. It shows directions, classes,
start numbers, places and scores, and hides non-public participant/car names.
The event-day workspace links to it when venue mode is enabled.

`GET /venue-api/results/venue-live` is **404 on the normal Ubuntu API**:
only `USD_VENUE_LAN_MODE=true` plus a valid pinned `VENUE_STAGE_ID` on
the isolated laptop can enable it. The `VENUE_STAGE_ID` in the venue
`.env` must equal the signed stage UUID, and preflight rejects placeholders.
This is not official publication on `app.usd-russia.ru`.

**Blocker:** The signed package now has a guarded local import procedure (below), but
the hub lacks local staff login/roles, complete equipment/media transfer,
a durable offline write journal and central result reconciliation. The board
will display imported measurements and local edits when those workflows are
available; the venue hub cannot yet operate a real competition. Do not use it with real
participant data until the following milestones and field acceptance pass.

## Stage-only handoff (signed export; NO automated import yet)

The primary Ubuntu server can now create a **read-only, 72-hour, stage-only**
JSON snapshot for the venue laptop. The Admin-only endpoint is
`GET /stages/venue/<stage UUID>/export`, accessible in
**Админка → День соревнований → Скачать пакет для ноутбука (LAN)**.
Every export records a central audit event; it does not write the venue database.

The file includes only the selected stage, selected classes, active entrants,
their names, plate numbers, cars, configuration snapshots, assigned sticker
numbers, inspections and already-entered scores. It excludes passwords,
session tokens, emails, phone numbers, birth dates, and all unrelated stages.

**Prepare signing keys independently of the laptop.** On trusted Ubuntu only:

```bash
sudo install -d -m 0700 /etc/usd-venue-export
sudo openssl genpkey -algorithm ED25519 -out /etc/usd-venue-export/signing-private.pem
sudo chmod 0600 /etc/usd-venue-export/signing-private.pem
sudo openssl pkey -in /etc/usd-venue-export/signing-private.pem -pubout -out /etc/usd-venue-export/signing-public.pem
# Store the base64 PEM as VENUE_STAGE_SIGNING_KEY_B64 in the protected Ubuntu
# API environment with root-only permission (do not put it in git or logs).
# The laptop gets ONLY signing-public.pem; never the private key.
```

This opt-in backend variable is deliberately **unset by default**: without a
private key the endpoint returns HTTP 503. Configure and redeploy the API using
the normal CI/backup/schema gates. Never copy any USD production JWT/S3/DB
credentials to the venue laptop.

After the ADMIN downloads a JSON package through HTTPS, transfer it to the
laptop over an encrypted/trusted medium. In `deploy/venue-lan` run:

```bash
node verify-stage-package.mjs ./stage-file.json ./signing-public.pem
```

The verifier checks Ed25519 signature, payload SHA-256, public-key fingerprint,
short validity window, origin stage consistency, numbers/class references and
absence of account-secret fields. **Verification prints only a short stage
summary and NEVER imports or modifies database records.** The operator must
retain both file and public key securely and should not distribute the JSON
through a public web link or messaging group.

**Implementation checkpoint:** a controlled stage-only PostgreSQL importer
is available with a default no-write dry run and explicit single-stage apply.
It reconstructs minimal relational dependencies, preserves the signed
registration configuration snapshot and public-visibility flags, imports
inspections, classes, numbers and existing results in one transaction, and
refuses any nonempty local competition database. Equipment configurations
are only FK placeholders, **not** copies of the complete equipment history.
There are still **NO** local staff account/role setup, actual media transfer,
bidirectional central sync, conflict review or two-phone acceptance. Do not
use this build for official on-site judging.

## What this commit sets up

- Separate `usd-venue` Docker Compose project with isolated PostgreSQL 18
  volume, RustFS object store, the pinned normal USD API/frontend images, and
  Caddy local HTTPS. **Postgres now has distinct bootstrap superuser and
  restricted `usd_venue` app accounts**; only the database service receives
  the bootstrap password, while the API/migrations use the non-superuser
  app principal. This is checked by the real PG18 acceptance suite. **Nothing** reuses `usd-home` production DB or volumes.
- The gateway publishes port 443 on **one RFC1918 laptop LAN IPv4 address**.
  PostgreSQL never publishes a port. RustFS bucket/console provisioning binds
  to `127.0.0.1` only, not to Wi-Fi clients.
- The frontend loads `/usd-venue-config.js` before its application; the
  public release's script is disabled by default. In venue mode, requests
  use `/venue-api` on the current origin, reverse proxied to the local API.
  An invalid venue-mode API path fails closed instead of sending event data to
  `api.usd-russia.ru`. No public DNS or domain changes are needed.
- Separate secret variables and preflight checks refuse public listener
  addresses, floating Docker tags, production DB hostnames, root S3
  credentials in the API and common sample defaults.

**The hub is NOT operational for an actual competition yet.** In particular,
the first empty local DB cannot become an event stage automatically. A signed
stage-scoped import, reviewed Prisma schema migration, required local media
copy, proper local event journal, user/role seed and reconciliation protocol for
*all* registration/inspection/result writes are not implemented. Do not use
this scaffold with real participant data or as the active judging authority.

## Safe preparation on the laptop, before an event

1. Set up Docker Compose on the **venue laptop**, not the Ubuntu production VM.
   Plug the laptop into a dedicated Wi-Fi router/AP. Disable guest/client
   isolation, reserve a stable private IPv4 address for it, disable router
   WAN management and UPnP, and restrict laptop firewall ingress to
   the expected Wi-Fi subnet. Phones and laptop must stay on this LAN.
2. Install the source for the **approved** USD commit and pull both immutable
   GHCR images, plus pinned PostgreSQL 18, RustFS 1.0.4 and Caddy 2 images
   **before** disconnecting the router WAN.
3. Copy `.env.example` to the untracked `.env`. Generate **venue-only**
   `VENUE_DB_ROOT_PASSWORD` (30+ chars) for `usd_venue_root`, a completely
   different `VENUE_DB_PASSWORD` (20+ chars) for `usd_venue`, and JWT secrets; create a RustFS root admin credential only for
   provisioning, then a separate IAM service account restricted to the venue
   bucket for the USD API. Never reuse Ubuntu production keys, snapshots,
   participant exports, SMTP configuration or Tailscale access tokens.
4. Run `python3 -m unittest discover -s . -p 'test_*.py' -v` and `python3 preflight.py` from
   `deploy/venue-lan/`; inspect `docker compose config` and ensure only
   the laptop LAN IPv4 appears on 443.
5. For a disposable environment only, `docker compose up -d db rustfs`
   starts storage. Root S3 provisioning is available only on the **laptop**
   at `http://127.0.0.1:19000` and the local RustFS Console on
   `http://127.0.0.1:19001`. Create `usd-venue-media` and its scoped IAM
   credentials before starting the API. Do not expose these ports to the AP.
   **Important upgrade:** do NOT reuse a `venue_db` volume created by the
   original scaffold in which `POSTGRES_USER=usd_venue` was superuser.
   The new gateway and import CLI refuse that unsafe role; on a genuine
   historical volume, preserve a separate backup and plan a controlled
   migration. Never run `down -v` on a volume containing event results.
6. Before any writes, download the signed stage snapshot and trusted Ed25519
   **public** key onto the laptop from separate trusted sources. Inspect the
   selected stage UUID, approved Docker image SHA and RFC1918 IP in `.env`.
   Authenticate the public signing key over a **separate trusted channel**,
   then pin its DER/SPKI SHA-256 in `VENUE_SIGNING_KEY_FINGERPRINT`:
   ```bash
   openssl pkey -pubin -in signing-public.pem -outform DER | sha256sum
   ```
   Never trust the fingerprint provided **inside** the downloaded JSON by
   itself. The dry run and importer refuse a mismatch with the pinned key.
   From `deploy/venue-lan`, run the **read-only** command:
   ```bash
   bash ./bootstrap-local-stage.sh ./stage-file.json ./signing-public.pem --dry-run
   ```
   To migrate the **isolated empty venue DB** and import the stage exactly
   once, use the same script with `--apply`. It requires a real terminal
   and exact stage UUID confirmation, runs `prisma migrate deploy` only
   inside `usd-venue`, checks the signed packet and refuses any existing
   venue competition data. Keep an encrypted backup of the package and
   verify the stage result counts. Never run database reset/resolve commands
   or copy secrets/volumes from production Ubuntu. Applying is a DEV
   demonstration until local role and sync acceptance is complete.
7. Local gateway uses Caddy `tls internal`: clients must explicitly trust
   the **venue's own CA** to access `https://<laptop-LAN-ip>`, use secure
   refresh cookies and enable camera-based QR scanning. Export its certificate
   from the *venue* CA volume once started and install/trust it on each judge
   phone before the competition. Do not disable browser TLS verification or
   rely on HTTP or public ACME during the event. Revoke trust when no longer
   needed. Test iOS and Android separately.
8. Exercise the local gateway with WAN unplugged. No background sync or email
   delivery is implicitly enabled; a future audited, explicitly approved
   sync run must reconcile the local operation log with the central Ubuntu API.

## Creating separate, on-site staff accounts (no online user transfer)

**After the signed stage is imported** into an empty `usd-venue` database,
the laptop operator uses a terminal **on the laptop**, not Ubuntu, to
provision independent staff identities:

```bash
bash deploy/venue-lan/provision-venue-staff.sh admin operator1
bash deploy/venue-lan/provision-venue-staff.sh judge judge-01
bash deploy/venue-lan/provision-venue-staff.sh judge judge-02
```

Each command requires a local interactive terminal and a unique strong
password twice. No password is sent to public API, copied into `.env`,
included in shell arguments or exported to a cloud service. Accounts
have synthetic login identifiers like `judge-01@venue.invalid`,
which are **not real mailboxes**; they only exist in the laptop DB.
Passwords are salted with bcrypt and checked by the usual USD login/refresh
guards. The local admin has normal `ADMIN` permissions on this **isolated
one-stage laptop**. Local judges are `PARTICIPANT` accounts with an
immutable `venue-judge` custom role allowing venue check-in, inspection
and **creation** of measurements, but not correction/deletion of results,
user administration, global settings, imports or integrations.

Open `https://<laptop-private-LAN-IP>/login` to sign in, and
`/admin/event-day` to judge after the local data is loaded. On-site
spectator LIVE at `/venue/live` is read-only and needs no login.

**Guardrails:** the CLI refuses any unrelated existing users, any
database containing multiple stages, altered judge permissions, duplicate
login handles or a production database URL. `venue-judge` is a system
role and cannot be edited in the USD administration UI.
This is first-stage development: staff account provisioning is covered
by regression tests, but full local acceptance and central reconciliation
are not yet complete.

## Durable offline operation journal — prerequisite for safe return sync

The signed-stage installer now executes `install-journal.sql` **after**
the one-time signed stage import and **before** the local API is usable.
Only the bootstrap `usd_venue_root` account installs its own
`venue_private.operation_journal` table and append-only trigger functions.
The API's `usd_venue` DB account can only **SELECT** it; attempts to
UPDATE/DELETE the log are rejected by PostgreSQL permissions. On startup
the Nest API verifies that exactly the pinned stage is present, its
DB user is **not** superuser, and all **18** trusted journal triggers are
enabled, otherwise the local API refuses to start.

Mutations of stage, participants, cars, equipment FK rows,
registrations, primary/extra numbers (including BassRace), inspections,
results and disqualifications are recorded with before/after JSONB.
Every entry stores a predecessor SHA-256 hash and its own digest;
the global PostgreSQL transaction advisory lock serializes appends and
the log rolls back when a judging transaction fails. The real PG18
acceptance verifies that a judge's new result **and** an admin correction
produce contiguous, cryptographically matching entries, while the
independent API account cannot erase the journal.

**Privacy warning:** this journal contains participant/vehicle details
from the venue data. Encrypt the laptop disk and offline backups, never
publish this table or send it to unrelated users. It deliberately omits
local password, refresh-session and role tables.

**IMPORTANT:** the journal is a durable *source* for future reconciliation,
**NOT a working return-sync implementation**. A venue-signed export,
central authorization and dry-run, replay-safe stage/ID/number conflict
resolution, local photo transfer and Ubuntu import are STILL MISSING.
Do not erase the venue volume after competition until every accepted result
is independently verified on the central server.

## Secure USB return-package export (read-only, does NOT apply to central)

After the venue day, use a **separate local Ed25519 keypair**, created
once on the laptop and kept outside Git and the running Nest API:

```bash
mkdir -p ~/usd-venue-private
chmod 700 ~/usd-venue-private
openssl genpkey -algorithm ED25519 -out ~/usd-venue-private/venue-return-private.pem
chmod 600 ~/usd-venue-private/venue-return-private.pem
openssl pkey -in ~/usd-venue-private/venue-return-private.pem -pubout \
  -out ~/usd-venue-private/venue-return-public.pem
openssl pkey -pubin -in ~/usd-venue-private/venue-return-public.pem \
  -outform DER | sha256sum
```

Deliver the **public key and verified DER-SPKI SHA-256 fingerprint** to
the USD central administrator over a separately authenticated channel
**before** the competition. Never put the private key on the USB stick.
On the laptop (Linux, with Docker, same private Wi-Fi), after judges
finish and stop making changes:

```bash
bash deploy/venue-lan/export-venue-return.sh \
  ~/usd-venue-private/venue-return-private.pem ~/usd-venue-private/return-output
```

The interactive command takes a separate strong passphrase twice. It
reads one transactionally consistent journal snapshot (REPEATABLE READ),
checks the complete PostgreSQL SHA-256 chain and the original signed
stage import's `sha256`, signs the snapshot using Ed25519 and encrypts
the entire payload with **scrypt + AES-256-GCM**. It writes a new
`usd-venue-return-*.json` at mode `0600`, refusing overwrites. All
participant names, vehicle details and measurements remain hidden
inside the ciphertext. Only a short non-personal summary is printed.
Use encrypted media; send the encryption passphrase separately.

The central administrator can check the file **without a database**.
Use Node 22+ and the trusted public key, stage UUID, central signed
baseline SHA-256 and separately verified public-key fingerprint:

```bash
node deploy/venue-lan/verify-venue-return.mjs \
  ENCRYPTED_RETURN.json TRUSTED_VENUE_PUBLIC.pem \
  ORIGINAL_STAGE_UUID ORIGINAL_IMPORT_SHA256 TRUSTED_PUBLIC_KEY_FINGERPRINT
```

The verifier reads the passphrase from standard input. Do not type it
on the command line or put it in a script or Git repository. Successful
verification reports `READ ONLY, NOT APPLIED`.

**A return export is NOT a sync.** The central USD server does not yet
apply any return event or acknowledge central conflicts, additional
registrations, changed numbers or media attachments. This workflow
provides an encrypted, authenticated and integrity-checked transport
for the future ADMIN-supervised sync. Never delete or reinitialize the
venue database after creating the package, and never declare official
public results imported until the central acceptance is verified.

## Mandatory release blockers

- Validate the new signed-stage import with a **real** isolated PostgreSQL
  on the laptop; complete equipment/media integrity transfer and package
  revocation policy. Imported stage, RBAC and rules must agree on both sides.
- Single-site multi-judge workflow (check-in, registration, inspection,
  configuration exceptions, result entry) with a durable venue operation log.
- Safe, idempotent central sync with per-operation acknowledgments, RBAC,
  server-authoritative numbering and conflict resolution; tests for retry
  after central commit, interrupted network and clocks drifting.
- Explicit venue network-health screen, audit and failed-sync queue, end-of-day
  backup/transfer/cleanup procedure, on-site UPS/power-loss recovery.
- **Real** 2-phone + router + laptop drill: unplug WAN; simultaneous judges
  see each other's changes; restart laptop; finish inspections/results; reconnect
  and verify all eligible operations acknowledged centrally with zero loss.
- Central `app.usd-russia.ru` release and Ubuntu acceptance remain separate.

Do not call USD offline-ready before the above acceptance.
