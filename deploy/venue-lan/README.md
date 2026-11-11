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

**Blocker:** The signed package is not yet imported into the local DB, and
there is no local judge login, official write journal or central sync.
Therefore the board can display already-available local results but the
venue hub cannot yet operate a real competition. Do not use it with real
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

**Hard blocker:** this release does NOT yet implement a supervised
stage-scoped venue PostgreSQL importer, local staff account setup,
full bidirectional registration/inspection/result sync, conflict review
or final physical two-judge acceptance. Do not use it to judge a live event.

## What this commit sets up

- Separate `usd-venue` Docker Compose project with isolated PostgreSQL 18
  volume, RustFS object store, the pinned normal USD API/frontend images, and
  Caddy local HTTPS. **Nothing** reuses `usd-home` production DB or volumes.
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
   database and JWT secrets; create a RustFS root admin credential only for
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
6. Local schema migration/import is **not automated**. Never run database
   reset/resolve commands against Ubuntu production. A supervised venue-only
   migration and signed stage import are blocking tasks before any real use.
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

## Mandatory release blockers

- Reviewed stage-only signed export from central Ubuntu, validation and import
  into isolated venue DB, media integrity verification and expiry/revocation
  policy. Imported stage, role permissions and rules must agree on both sides.
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
