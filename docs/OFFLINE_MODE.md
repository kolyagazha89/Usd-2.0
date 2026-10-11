# USD 2.0 — Offline operation and synchronization

Status: architecture requirement. This document describes intended behavior; offline synchronization is not yet implemented.

## Goal

An event must continue operating when public internet or mobile networks are unavailable. Registration check-in, participant lookup, technical inspection, queue management and result entry must not depend on a live connection to the public website.

Offline mode is a first-class operating mode, not merely a service-worker cache.

## Recommended architecture: three levels

### Level A — venue local hub (preferred for a full event)

Before the event, an authorized ADMIN downloads a signed, versioned event package to a venue hub device (laptop or mini-PC). The hub runs a local USD event service and database. Judges' phones connect to a dedicated local Wi-Fi network using a router/access point, then open the event workspace at a local address even without an internet uplink.

The hub is the local authority for the event while disconnected:
- one shared event dataset for all connected judge devices;
- immediate sharing of check-ins and inspection status across devices;
- a local operation log and audit trail;
- no dependency on public DNS, a CDN, Cloudflare, Railway, or mobile data during the event;
- clear local-network health indicator and explicit offline-event banner.

A local hub is the best option when multiple judges must work simultaneously without internet. It must be prepared, tested, secured and powered before the event. It must not expose its local admin API to the public internet.

**Mobile camera / HTTPS constraint:** browser camera access generally requires a secure context. Do not assume that opening an HTTP page at a private LAN IP will allow QR scanning on every phone. The implementation must test target iOS/Android browsers and choose a secure-context strategy before the event (for example, a pre-installed PWA served from its valid HTTPS origin with a deliberately designed local sync channel, or a venue hostname with a valid certificate and local DNS). Provide a non-camera fallback such as manual registration-number search and, where supported, scanning an uploaded QR image. Avoid mixed-content requests and never make a certificate/DNS setup a last-minute event-day dependency.

### Level B — device offline mode (fallback)

A judge's phone or laptop can hold a controlled local event package in IndexedDB and a durable queue of pending operations. A PWA service worker caches the app shell and essential assets, but event data and writes live in IndexedDB, not only in browser cache storage.

This mode is useful for a single device or as a fallback if the hub fails. Independent offline devices cannot instantly share changes. If several devices are offline independently, their edits can conflict; reconciliation must preserve every submitted operation.

### Level C — connected online mode

When the public service is reachable, clients use the normal API. The local hub or device queue syncs to the central PostgreSQL-backed service and receives explicit per-operation acknowledgements.

## Event package preparation

Before an event, ADMIN explicitly creates and downloads an offline package containing only the minimum data needed:
- stage ID, stage version and current status;
- participant and registration identifiers, participant number, display name and team if needed;
- car and configuration snapshots needed for class inspection;
- selected classes and class rules needed at the venue;
- inspection checklist version and permitted values;
- necessary schedule and venue notes;
- opaque QR credential mappings for registrations in the package;
- permission-policy version and package creation timestamp.

Do not bundle unnecessary contact details, birth dates, private profiles, consent evidence, unrelated historical data, credentials, API secrets, or other private data. Package creation and export are audited. Package data has configurable expiry and can be revoked when a device/hub reconnects; remote revocation cannot reach a permanently offline device, so packages must be time-limited and protected.

The package is versioned and integrity-checked. The UI shows which stage and version are loaded, when downloaded, expected event date, and whether data is stale. Never silently replace a package while it has unsynchronized operations.

## QR in offline mode

- QR contains an opaque random credential or short opaque registration reference; never encode a participant's name, phone, email, car details or other personal data.
- The offline package has a mapping from QR credential hash/reference to the local registration record. A scan resolves locally without the public API.
- The local hub validates the credential against its package and event state. Device-only fallback uses the same package mapping.
- QR is not authentication for privileged actions. A signed-in judge/admin session and local authorization are still required.
- The scanner shows stage, participant number, participant, car, classes, and inspection state. It warns for invalid/unknown QR, wrong stage, cancelled registration, expired package, and already-inspected registrations.
- Manual search by participant number, name or car remains available.
- If a QR token is rotated or revoked centrally while offline, the local copy cannot learn this until sync. Keep tokens opaque, scoped to registration/event, time-bound where practical, and never treat QR possession as proof of identity for high-risk actions.

## Durable operations and data model

Every offline write is an immutable operation envelope with:
- globally unique client-generated operation ID (UUID);
- event/stage ID, entity type and entity ID;
- operation type and payload limited to fields the actor may change;
- actor ID and cached role/permission version used when recorded;
- device/hub ID and monotonically increasing local sequence number;
- client timestamp for display only, never the sole source of ordering or trust;
- base entity version/revision read before editing;
- schema version and integrity metadata;
- sync state: pending, sending, acknowledged, conflict, rejected, or needs-review.

The server enforces unique operation IDs and idempotent replay. Retrying the same operation must not create duplicate inspections, registrations, results or payment events. Server acknowledgements are stored locally. Do not clear an operation from the queue until the central service or local hub has durably acknowledged it.

Offline timestamps can be wrong or manipulated; authoritative audit timestamps are assigned by the server on receipt. Preserve client event time as informational metadata only.

## Synchronization protocol

1. Establish an authenticated connection to the central API.
2. Exchange protocol/schema version and device/hub identity.
3. Upload queued operations in stable sequence order, using bounded batches.
4. Server validates authentication, current authorization, stage status, payload schema, referenced entities, uniqueness and business rules.
5. Server transactionally records accepted operations with idempotency keys and returns per-operation acknowledgements.
6. Rejected or conflicting operations remain visible locally with a reason; never silently discard them.
7. Download server changes since the last acknowledged cursor/revision.
8. Reconcile local projections, preserve audit history, and mark only acknowledged operations as synced.
9. Resume after network loss from the last acknowledged cursor; use exponential backoff with jitter and a manual “Sync now” control.
10. Display last successful sync, pending count, conflicts and failures. “Saved locally” means durable local save; “Synced” means central acknowledgement. Never conflate these states.

## Conflict and business rules

Do not apply generic last-write-wins to business-critical records.

- **Inspections:** preserve the existing one-inspection-per-registration rule. Duplicate attempts resolve to the existing inspection or a visible conflict, never silently overwrite it.
- **Results:** offline result entry may be captured as a draft if explicitly allowed, but official publication requires central approval/publication. Preserve ADMIN-only result editing/deletion.
- **Registrations:** enforce participant/stage/class uniqueness and one-car-per-registration locally and again on the server.
- **Payments:** an offline payment marker is a recorded claim/receipt event, not a full accounting ledger or fiscal receipt. Preserve actor, amount, currency, method and local time; reconcile and audit on reconnect.
- **Participant/car changes:** use base revision checks and field-level reconciliation where safe. For conflicting identity or class/configuration fields, require an authorized human to choose; preserve both values and audit the resolution.
- **Stage/rules changes:** package includes a rules/version snapshot. If the central stage is closed or rules changed while offline, flag affected operations for review rather than blindly accepting them.
- **Deletion/cancellation:** use tombstones/revocation events. Never infer deletion from a missing row in a downloaded snapshot.

## Connectivity and white-list restrictions

Critical event workflows must not rely on a public allowlist, external fonts, third-party scripts, external QR services, CDN images, or a remote identity provider after the event package/hub is prepared. Bundle essential UI assets locally. Test that the event app works with DNS and internet blocked while local Wi-Fi remains enabled.

Do not promise that a public domain will always be allowlisted. A local network with a venue hub is the robust option when mobile data and public-site access are unavailable. The hub must be reachable by local IP or local network name and must not require public DNS.

When public connectivity is partially available, sync should use the configured central API only when reachable. Local work must continue if the API, DNS, or public CDN fails. Avoid automatic reloads that could discard local state.

## Security controls

- Use encrypted transport on local networks where feasible and protect hub access with authenticated judge/admin sessions.
- Use short-lived event-specific access and the minimum necessary dataset.
- Encrypt sensitive local storage where feasible; protect the hub with disk encryption and OS access controls.
- Do not cache access tokens or private API responses in shared caches/service-worker CacheStorage.
- Separate event package data from general participant profile data.
- Record package creation/export, device assignment, sync, conflict resolution and administrative override.
- Apply server authorization again during sync. A cached permission snapshot enables local work but does not guarantee an operation remains centrally authorized after revocation; privileged or disputed operations may require review.
- Provide a secure end-of-event procedure: sync, verify zero pending/conflicts or document them, then erase/revoke local package data according to retention policy.
- Define an incident procedure for a lost device/hub. A permanently offline device cannot receive remote wipe or revocation.

## UI requirements

Always show one of these states:
- Online — central server connected;
- Local event network — connected to venue hub, public internet unavailable;
- Offline — working from this device's local package;
- Syncing — pending operations being transmitted;
- Attention required — conflicts/rejected operations exist;
- Stale package — event/rules data may be outdated.

Each relevant record shows local-save status and central-sync status. Pending/conflict counts are visible without opening settings. A diagnostics screen lists failed operations and retry controls without exposing secrets.

## Acceptance tests

1. Open the event workspace once, disconnect mobile data and public internet, restart browser/device, and confirm the prepared event still opens.
2. Scan participant QR codes with no public internet; correct registration opens locally.
3. Complete an inspection offline, reload the app, and verify it remains in local storage.
4. Two judge devices connected to the venue hub see one another's updates without internet uplink.
5. Two independent offline devices making conflicting edits do not silently overwrite one another on sync.
6. Interrupt sync after the server commits but before the client receives the response; retry does not duplicate the operation.
7. Duplicate inspection submissions remain one inspection and produce a clear outcome.
8. Invalid/expired/wrong-event QR codes fail safely without revealing participant data.
9. Unauthorized operations are rejected server-side even if stale local UI showed the action.
10. The offline client cannot publish official results; central approval/publication rules remain in force.
11. The app distinguishes locally saved, pending, acknowledged, rejected and conflicting data.
12. End-of-event checklist confirms all accepted operations synced and outstanding issues reviewed before local data cleanup.

## Rollout plan

### Offline P0
- Define operation envelope, idempotency and per-operation acknowledgement.
- Implement event package export/import and integrity/version checks.
- Add IndexedDB persistence and offline queue to the PWA.
- Implement local QR lookup, offline inspection capture and explicit sync status.
- Add diagnostics and recovery tests.

### Offline P1 — multi-judge resilience
- Build the local event hub service and local Wi-Fi runbook.
- Add shared local event state, local authentication and durable hub database.
- Test complete event workflow with public internet physically unavailable.
- Add conflict review UI and controlled reconciliation.

### Offline P2
- Extend offline support to more workflows only after validating consistency and privacy requirements.
- Optional signed export/import recovery package for devices unable to connect to the local hub.

Do not claim offline readiness until acceptance tests run on target phones/laptops and local network hardware at a simulated disconnected venue.
