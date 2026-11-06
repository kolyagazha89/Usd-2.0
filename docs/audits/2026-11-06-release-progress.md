# USD release checkpoint — 2026-11-06

## Accepted code
- [x] PR #431 merged: main SHA `7125e696856bea5abb368b9d7b2ed87bfeb97952`.
- [x] All eight PR workflows passed on `c2d42ff2d94d8b4b0f847b27560667564c0aacc9`.
- [x] Contacts: own profile keeps email/phone; others' contacts require persisted ADMIN role. PostgreSQL18 regression 3/3, including custom role list/create.
- [x] Public record stage projection omits repeated rules snapshots; isolated PG18 regression passes; stored snapshots preserved.
- [x] Homepage intro waits for visible hero; browser checks 4/4 on 390/1440 normal/reduced motion. Desktop WebGL confirmed. Mobile <=740px retains light CSS intro.
- [x] Confirmed CSS contrast and carousel ARIA fixes, preserving #432 podium.
- [x] Independent patch review completed with no actionable findings.
- [x] Server Tailscale watchdog leading newline repaired; syntax and systemd success verified.
- [x] Current source archive created, SHA256 `461cb67529592dd8998dd4ec4d5c85ba3cc6123abde8e8c7671f1a3ded2b7fc8`; no Git history or private backup material.

## Operational acceptance
- [x] Main images published for 7125e696.
- [x] All eight main CI checks and image publication passed on 7125e696. Deployment request [42178634554](https://github.com/kolyagazha89/Usd-2.0/actions/runs/42178634554) succeeded.
- [x] Live frontend/API exact revision accepted at 07:14 UTC. Independent [API smoke 42179583049](https://github.com/kolyagazha89/Usd-2.0/actions/runs/42179583049) passed: protected publication route 401, DB settings query, 18 published stages, 14 records, no forbidden private fields in checked public data. Exact post-deploy record response byte size was not separately measured.
- [ ] Full live role journey/catalog acceptance #409; fixtures do not establish all production behavior.
- [ ] Historical intermittent API/media failure #424 root cause and long-term stability. Compact sample was 24/24 HTTP200, not proof of permanent resolution.

## Historical privacy #427
- [x] Original files encrypted, restoration/checksums verified; server copy on dedicated second disk, immutable and root-only, separate key. Same server is not an off-host backup.
- [x] Complete original Git graph preserved and verified privately. Local-only cleanup preview prepared, current main tree unchanged.
- [ ] Public history/cache cleanup: owner explicitly answered **“Историю пока не трогать”** on 2026-11-06. No force-push, ref deletion or Support request performed. Old historical contact exposure remains unresolved.

## Detector follow-up
Impeccable changed-target scan: 9 warnings (8 incumbent style advisories, one pre-existing width transition on admin car progress indicator). Runtime axe checks passed; no broad redesign performed.

No production database reset, replay, schema migration or apex/DNS change was made by this patch. CI success alone is not a final public-launch GO. The patch is deployed and accepted on app/api prerelease. A blanket public-launch GO is withheld while the deferred historical exposure and remaining #424/#409 acceptance are open.
