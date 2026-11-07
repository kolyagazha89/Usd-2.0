# Partner Image Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let admins frame partner logos/photos with manual proportions and preview.
**Architecture:** Optional layout metadata in existing partners JSON; strict API
validation and public projection; one shared public/admin image renderer.
**Tech Stack:** React/TypeScript/CSS, NestJS, Prisma JSON, existing Node/Jest/browser tooling.
**Spec:** docs/superpowers/specs/2026-11-07-partner-image-layout-design.md

## Global Constraints
No migration, destructive image edit, new dependency or live content rewrite.
Preserve legacy rendering, tier hierarchy, draft filtering and admin permissions.
Frame ratio 1:2–5:1; dimensions 0.1–100; scale50–300; X/Y0–100.

## Review Focus
Missing/malformed legacy layouts must not crash public pages or unrelated saves.
Nested metadata must not leak; strings, NaN, infinities and one-sided ratios fail.
Preview and public fit/scale/position must agree at mobile and desktop widths.
Invalid/changed uploads must not leave a stale preview or leak Blob URLs.
Saving/reopening/reset must preserve the image and unrelated partner fields.

### Task 1: Persist and normalize the optional layout contract
Files: backend/src/site-settings/partner-image-layout.ts, site-settings.service.ts,
site-settings.service.spec.ts; frontend/src/public/partner-image-layout.ts,
partner-model.ts; frontend/test/partner-image-layout.test.mjs.
Interfaces: readPartnerImageLayout(unknown) validates server payload;
normalizePartnerImageLayout(unknown) returns bounded client defaults.
- [ ] Add failing roundtrip/rejection/legacy and normalization tests; run RED.
- [ ] Implement optional contract/projection and client normalization; run GREEN.

### Task 2: Shared image renderer and admin controls
Files: frontend/src/public/PartnerImage.tsx, PartnerShowcase.tsx,
partner-image.css; frontend/src/admin/PartnerImageEditor.tsx, PartnersPage.tsx,
admin-shell-layout.css; frontend/test/partner-image-editor.test.mjs and fixture.
Consumes optional imageLayout; produces canonical layout edits and validity.
- [ ] Add real form tests for custom ratio, save/reopen, reset and local uploads.
- [ ] Build shared renderer and labeled controls/live preview; preserve legacy path.
- [ ] Run targeted/full frontend tests, backend tests/build/lint, frontend build.

### Task 3: Browser verification and release
Files: scripts/partner-image-browser-qa.mjs, .github/workflows/public-browser-qa.yml.
- [ ] Exercise admin save/reload and public geometry at320/390/768/1440; keyboard,
  missing/broken image, logo/banner, custom ratio, zoom and position.
- [ ] Inspect one batched screenshot set; fix together; confirm once if needed.
- [ ] Independent model review, exact-SHA CI, PR and verified merge/deploy;
  update issue114 with separate code/CI/deploy/public-acceptance states.
