# USD 2.0 — product and architecture direction

## Product definition

USD 2.0 is the single-company operating platform for Ultimate Sound Destruction (USD): public championship website, participant self-service, event operations, staff workspaces, and company management in one product and one source of truth. It is not a multi-tenant product.

The current small team must be able to work without organizational bureaucracy. The architecture should support a larger staff later without rewriting authorization or splitting the product into separate systems.

## Product principles

1. One account per person; permissions follow the account, not separate logins for separate jobs.
2. ADMIN is a system-level full-access role: every module, every record, every supported action, including modules added in the future. New modules must not require manual permission grants to ADMIN.
3. JUDGE can work across stages and enter inspection/results data according to existing USD rules. Result editing/deletion remains ADMIN-only.
4. Custom roles and permissions are managed by ADMIN and enforced server-side. Hiding a button is not authorization.
5. Keep existing business data and working modules. Extend incrementally; do not rewrite the application without evidence it is necessary.
6. Public content is stored and managed in the admin CMS. Routine copy, media, navigation, legal pages, SEO, and homepage layout changes must not require a deploy.
7. Design for desktop and mobile as first-class experiences, not desktop screens shrunk to fit a phone.
8. Critical actions are audited; important operations are idempotent; destructive changes require explicit confirmation.
9. Legal consent, marketing consent, and consent to personal-data dissemination are distinct records where applicable. Never pre-check optional marketing consent.
10. Build convenience around real event workflows: fast QR check-in, clear statuses, few taps, and safe recovery from errors.

## Main product areas

### Public platform
- Homepage and CMS-managed blocks/banners.
- Seasons, stages, schedules, venue details, announcements, livestream.
- Registration and participant cabinet.
- Participant profiles, teams, garage, configuration history, achievements.
- Public results, records, standings, news, rules, legal center.
- Global search across relevant public entities.

### Event operations
- Stage setup and registration controls.
- Registrations, participant and car records, classes, on-site registration.
- QR check-in and inspection workflow.
- Inspection checklist and audit trail.
- Results entry, approval/publication, disqualification and record recalculation.
- Payment status tracking at the event; do not confuse a cash/payment marker with full accounting.
- Operational notices, queue and schedule changes.

### Company operations (incremental modules)
- CRM and participant/support interaction history.
- Tasks, owners, deadlines, recurring workflows and approvals.
- Partners, sponsorship packages, deliverables and contracts.
- Finance: income/expense ledger, budgets and reports, with appropriate permissions and reconciliation.
- Equipment/inventory: issue, return, maintenance and write-off.
- Staff, custom roles and access reviews.
- Content, mailing campaigns, documents, analytics and integrations.
- Health monitoring, audit, backups and tested restoration.

## Offline operation is a core requirement

Events must continue when mobile data, public internet, DNS, CDN or the public site is unavailable. Use a prepared event package and PWA local persistence for single-device fallback, plus a venue local hub and Wi-Fi for shared multi-judge work. Offline operations must be durable, idempotent, auditable, versioned and explicitly synchronized; conflicts must never silently overwrite critical data. See [OFFLINE_MODE.md](./OFFLINE_MODE.md) for the detailed architecture, security model, synchronization protocol and acceptance tests.

## Measurement device integration

Term-LAB / SPL-Lab readings are stored as raw, auditable `MeasurementSession` evidence and are not official results until explicitly reviewed. The API reuses the existing `ResultsService` for acceptance so ranking, records, inspection, disqualification and authorization rules stay centralized. Device-specific protocol parsing remains behind an adapter; see [MEASUREMENT_INTEGRATION.md](./MEASUREMENT_INTEGRATION.md). Production migrations require a separate reviewed plan.

## QR registration / inspection workflow

1. After a registration is confirmed, issue an opaque, cryptographically random QR credential. Store only a hash of the credential in PostgreSQL; do not encode personal data or a predictable registration ID in the QR.
2. The participant cabinet shows the QR for the selected stage/registration, with a printable/saveable registration card.
3. An authenticated judge/admin scans it using the phone camera or a USB camera. The scanner sends the opaque credential to the authenticated backend; it must not grant access by itself.
4. The server validates the credential, registration status, stage state, and current inspection state, then returns only the fields needed for the judge workflow.
5. The registration card shows participant number, participant name, team, car, classes, configuration snapshot, payment marker if tracked, and inspection status.
6. The judge completes the inspection from the card. Existing one-inspection-per-registration rules and server-side authorization remain authoritative.
7. Re-scanning an inspected registration displays the existing inspection and warns about a duplicate; it must not silently create a second inspection.
8. Include manual fallback search by participant number, name, or car. A QR credential can be revoked/rotated. Do not mark an operation saved until the server confirms it.
9. Scanner permissions are requested only when the judge opens the scanner. Provide clear camera-denied, unreadable-code, invalid-code, wrong-stage, cancelled-registration, already-inspected, offline, and server-error states.
10. Do not place personal data in QR URLs or analytics. Use rate limiting, audit successful/failed privileged lookups, and avoid exposing whether arbitrary guessed tokens belong to real people.

## Authorization model

- Preserve ADMIN and JUDGE behavior while introducing permission-based custom roles.
- ADMIN bypasses ordinary permission checks by explicit policy, not by a manually maintained list of module grants.
- Custom roles use module/action permissions such as view, create, edit, delete, publish, approve, send, export, and manage-access where relevant.
- Dangerous permissions (role management, results changes, finance exports, bulk actions, mailing send, deletion) are independently granted and audited.
- Protect the last active ADMIN against accidental deactivation or demotion.
- Do not assume that knowing the architecture or being a developer automatically grants business-data access. Assign access explicitly.
- UI navigation is derived from effective permissions, but every API route/service must also enforce them.

## CMS and content governance

- CMS records live in the existing application database.
- Versioned drafts and published versions; scheduled publishing; preview; restore/rollback; author and timestamp.
- Manage homepage blocks, text, media, navigation/footer, rules, legal documents, news, SEO, live stream, public settings and email templates.
- Media library supports metadata, alt text, validation, references, and prevents deletion of assets still in use.
- Existing historical documents/consents remain tied to the exact version shown when consent was recorded.

## Notifications

- Separate transactional/service messages from optional marketing.
- Events include verification, registration confirmation/change, reminders, schedule changes, results publication, and news where consent permits.
- Queue, retries, idempotency keys, delivery/error logs, bounce/complaint tracking, unsubscribe handling, test send, audience preview and optional approval workflow.
- Start with email and in-site notifications; add Telegram/SMS only through explicit configuration.

## Reliability and privacy

- Database migrations must be reviewed and backward-compatible where practical.
- Backups must have a tested restore procedure.
- Audit sensitive changes and admin actions.
- Protect file uploads, endpoints and authentication from abuse; rate-limit public flows.
- Minimize personal data in logs and analytics; define retention and access policy.
- Cache public pages carefully, but never serve another user's private cabinet data from a shared cache.
- Offline support must show stale/offline status and never imply an unsynced write succeeded.

## Delivery approach

### P0 — safe core
1. Audit current modules and data model; document constraints before schema changes.
2. Harden and complete existing auth/authorization while preserving ADMIN/JUDGE semantics.
3. Implement QR credentials, judge scanning and fast inspection card.
4. Finish participant registration and mobile-first cabinet.
5. Complete public stages/results/records pages and core CMS.
6. Legal document/version/consent evidence, essential email, audit, monitoring and backups.
7. Test build, migration, permissions, duplicate requests, and existing production flows before deployment.

### P1 — operations and management
- Custom role editor, staff workspaces, global search, media library, task workflows, partner CRM, live scoreboard, profile/garage/stats.

### P2 — advanced convenience
- PWA, optional push, advanced analytics, additional integrations, reusable automation templates and richer CMS block builder.

## Implementation discipline

- Work on a feature branch, not directly on production main.
- Inspect current code before modifying it.
- Add tests for permission boundaries and data integrity.
- Never run a production migration or deployment without an explicit reviewed plan and confirmation.
- Report exactly what changed and what was actually verified; do not claim a feature is deployed just because code was committed.
