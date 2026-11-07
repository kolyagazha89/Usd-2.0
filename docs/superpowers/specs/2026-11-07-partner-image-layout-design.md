# Partner image framing

Approved direction: the owner chose per-partner logo/banner settings and manual
aspect ratios after reviewing the existing mobile cards. Preserve Dark Velocity
public cards and the light admin interface.

- Admin controls: logo (contain) or banner (cover), Auto / 1:1 / 2:3 / 4:3 /
  3:2 / 16:9 / 2:1 / 3:1 / Custom frame proportions; custom dimensions 0.1–100
  with resulting aspect ratio 1:2–5:1. Uniform scale 50–300%, position X/Y 0–100%.
  Preserve image proportions; manual proportions describe the frame.
- Live image preview uses the same rendering component as public cards. New
  local uploads preview before saving, have existing upload validation and
  revoke Blob URLs. Reset clears image formatting while keeping the image.
- Optional `imageLayout` in existing partners JSON: `mode` LOGO/BANNER,
  optional numeric `aspectWidth`+`aspectHeight`, `scale`, `positionX`, `positionY`.
  Missing settings retain the existing public rendering; new partners default
  to a 16:9 logo frame. Saving and reloading preserve settings.
- Server validates bounds/types/pairs before persistence and projects only
  known layout keys publicly. Malformed legacy layout falls back safely;
  unrelated unchanged historical partner rows remain editable as before.
- No database migrations, destructive image edits, automatic updates of
  existing partners, new dependencies, changes to brand assets or apex/DNS.

Alternatives considered: contain-only leaves the framing inflexible; cover-only
can crop logos. The owner selected per-partner modes with manual proportions.
Proof: API roundtrip/rejection tests, public normalization and real form tests,
shared preview/public rendering, responsive browser checks and visual inspection.
