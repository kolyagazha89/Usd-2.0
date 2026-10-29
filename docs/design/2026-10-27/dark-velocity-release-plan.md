# USD — Dark Velocity pre-release delivery ledger

Updated: 2026-10-28. Work branch: `design/dark-velocity-sitewide-20261027`, draft PR #305.

## Non-negotiable release contract

- `app.usd-russia.ru` is the **only** approved pre-release destination. Do not change the apex `usd-russia.ru`, nameservers, existing root site, or production database.
- Public and participant surfaces: black / graphite / trademark red / white, cinematic but accessible. Administration: light workspace with graphite sidebar.
- Original first-party trademark logo `/usd/usd-original.png` remains unchanged. The public brand is USD, never “USD 2.0”.
- Preserve API routes, CMS, stage registration, BassRace multi-class numbers, historical results, configuration snapshots, permissions, security and data. Visual refactors must not change business rules.
- Responsive checks at 1440 / 1024 / 390 / 320 CSS px, including iPhone Safari safe-area, bottom dock, input zoom and 9:16 posters at natural image height.
- Motion must be optional with `prefers-reduced-motion`, must not conceal content when JavaScript fails, and should pause when the 3D hero is offscreen.

## Implementation in PR #305

- `frontend/src/public/dark-velocity.css`: first-pass hero lighting and transitions.
- `frontend/src/dark-velocity-sitewide.css`: final cascade layer for public pages, results, records, stage cards, news, member, registration, configuration, auth, and light admin.
- `frontend/src/public/VelocityEffects.tsx`: native IntersectionObserver / Web Animations scroll reveals and scroll progress, no additional dependency.
- `frontend/src/main.tsx`: imports the final visual layer and mounts motion enhancement.
- `frontend/src/public/PremiumHome.tsx`: cinematic editorial kicker, equalizer and 3D interaction hint. The existing `LogoShowcase.tsx` is already a real Three.js mechanical 3D USD mark with smoke, dynamic woofer and touch-triggered pulse; do not replace it with a static mockup.
- Mobile cookie banner fix: the dock is rendered through a React portal into `body`, **not inside** `.usd-live`. Reserve 66px plus safe-area via `body:has(.usd-live):has(> .u-mobile-dock)` so the banner sits above it.
- `scripts/public-browser-qa.mjs`: checks app.usd-russia.ru without modifying deployed styles; candidate CSS preview is explicit opt-in.
- `frontend/test/premium-member.test.mjs`: asserts the new final CSS import follows the existing member styles.

## Verification

GitHub Actions for this branch: Frontend CI, Public browser QA, Backend CI, Archive replay. Run the latest HEAD, not an earlier cancelled run.

- Frontend CI executes 91 tests, dependency audit, TypeScript/Vite build, Wrangler dry run.
- Candidate browser QA exercises ~264 synthetic public, participant and admin routes at desktop/mobile widths and checks no overflow, accessibility of controls, and flows without live mutations.
- Live public browser QA targets app.usd-russia.ru with its actual deployed styles. A passing public check does not identify the running image SHA.
- Initial PR #305 browser QA at commit `0b1329d` found 72 mobile cookie/dock overlap cases; addressed by the portal-aware dock variable above. Verify latest run before marking resolved.
- Initial frontend CI failure after adding sitewide CSS was a stale test expecting `member-experience.css` to be the last import. Updated the test to check both member ordering and the new final layer.
- Backend dependencies are patched, including Prisma 7.10.1. Full production audit includes optional peers and reports zero vulnerabilities; backend CI passes 716 unit tests and 5 active E2E tests (13 skipped).

## PC deployment discovery — do not guess

There are at least two unmerged infrastructure PRs:
- #232 `infra/github-container-auto-update`: Windows laptop `deploy/laptop`, PowerShell polling `main`.
- #302 `infra/self-hosted-hyperv-usd-20261025`: Ubuntu VM `deploy/home-pc/compose.yaml`, GHCR immutable images, Cloudflare Tunnel override, and a workflow that publishes only on `main` or the infra branch.

The owner has said the PC is running and may use a non-main branch. **Repository contents alone do not prove the live PC's checkout, running image tag, compose files or update mechanism.** Before deploy, read `git branch --show-current`, `git rev-parse HEAD`, `docker compose ps`, current frontend image digest, `USD_IMAGE_TAG` (without printing secrets), and the effective compose configuration from the actual host. This PR now includes API-side catalog-ID enforcement and Prisma migration `20261028172000_configuration_catalog_entry_ids`; **frontend-only deployment is unsafe**. Verify a restorable PostgreSQL backup, media backup, migration on a restored staging copy, immutable API/frontend image tags, and coordinated rollback before any Ubuntu rollout. Never migrate the live database just to preview CSS.

If no authenticated PC access exists, leave PR and build artifacts ready and record deployment as blocked. Never claim the app is updated until a fresh public smoke test proves it.

## Continuation checkpoint — 2026-10-28

- Confirmed PR #305 remains the design workstream and the host deployment is unverified.
- Do not infer current CI status from earlier passing runs; inspect the latest head checks before release.
- Priority implementation order: member garage and configuration usability, strict normalized catalog IDs and moderation, registration, light admin CMS and partner tiers, then live/offline features.
- Offline judging is not release-ready without authenticated end-to-end conflict and reconnect testing.
- No server changes without verified host state, rollback tag, and backup readiness.

## Next actions

1. Resolve latest frontend CI errors and browser QA regressions, inspect screenshot artifacts, and polish typography/spacing on 320–1440 widths.
2. Verify 3D fallback, reduced motion, mobile Safari safe areas, and all participant/admin interactive routes.
3. Address backend dependency audit as a separate security hardening change with full backend tests.
4. Coordinate with PR #306 to inspect the actual Ubuntu runner/Compose stack, validate restored backups and the additive migration, and publish immutable, matching API/frontend artifacts.
5. Deploy **only** to `app.usd-russia.ru`, verify from outside the host, record the SHA and rollback tag, then notify the owner.

## Visual correctness fixes — 2026-10-28

- Hide the CMS values panel and its hero shortcut together when all value cards are hidden or missing. A real React render regression test covers missing, empty, disabled and visible card sets.
- Explicitly retain a vertical flex layout for the generated stage poster. The legacy image display rule was placing the text fallback labels on one line. Uploaded poster images retain their intrinsic dimensions. Candidate browser QA checks fallback labels for overlaps.
- Preserve the established hero behavior: original trademark logo, WebGL fallback, system reduced-motion preference and offscreen rendering suspension. The previously removed manual pause control is not reintroduced.
- Administration remains light; public/member surfaces remain dark. No API contracts, historical results, CMS data or deployed resources are changed by these visual fixes.
- Actual authenticated role acceptance and deployment/image verification still require the owner's host and test-account access. Do not represent candidate screenshots or synthetic fixtures as live authenticated acceptance.

## Partner directory consistency — 2026-10-29

- Homepage, public partner directory and partner showcase now share `visiblePartners` filtering and deterministic ordering. Hidden or unpublished partners do not leave an empty, misleading showcase; the directory displays its collaboration empty state instead.
- Partner logos without a valid external website are non-interactive on the full directory rather than linking back to the same page; the homepage still links to the directory.
- Regression coverage includes legacy published records, drafts, inactive records, invalid ordering and non-mutating sort.
- This is a **code-only** checkpoint. Passing synthetic CI cannot replace an authenticated browser audit on the deployed `app.usd-russia.ru` image. The apex domain remains out of scope.
