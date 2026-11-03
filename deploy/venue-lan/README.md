# USD venue LAN hub — laptop + Wi-Fi router (foundation, NOT event-ready)

**Agreed primary architecture:** the laptop is a local USD server; a dedicated
router/AP connects every judge's phone to **the same local API, PostgreSQL and
RustFS bucket**, with no upstream Internet required during the event. The shared
LAN hub is the source of on-site state. A phone's isolated encrypted browser
package is an emergency *fallback*, never the primary judge workflow.

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
4. Run `python3 test-preflight.py` and `python3 preflight.py` from
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
