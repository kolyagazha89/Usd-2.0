# Compact admin workspaces — 2026-11-20

Acceptance scope: [master plan](../USD_MASTER_PLAN.md), sections 7 (participant
profiles), 8 (both catalogs), 9 (event operations), and admin UX under [#114](https://github.com/kolyagazha89/Usd-2.0/issues/114).

## Changes ready for review

- Participant detail: Profile / Cars / Performances sections; full name and private
  participant photo; car photos; separate loading/error/absent-image states and retry.
  Authenticated blob URLs are released when replaced or unmounted. Public media
  permissions are unchanged. History is searched across all registrations, paged
  five at a time, with event and configuration details collapsed initially.
- Shared detail template: supplemental content has its own full-width container,
  rather than being a flex child of the action buttons. This fixes the layout
  visible in the owner's screenshot and applies to other entity cards.
- Component and vehicle catalogs: aligned desktop panes with bounded lists;
  mobile Brands / Models navigation. Choosing a brand opens models immediately,
  including when choosing the same brand again. Model pagination resets list
  scroll. Component brand dropdown supports text search; category has one compact
  control. Models are paged by 20 rather than 60.
- Resource, car, user, registration, inspection, result, record and media lists:
  compact pages, normally 10 records. Existing saved size preferences are retained.
  Filters still search the complete loaded collection. Inspection bulk operations
  and counters still use every registration, not just the visible page. Protocol
  ordering is computed before paging; recorded places are never renumbered.
- Audit: real API pagination replaces the inaccessible first-100-only view.
  Filter changes reset the page; older responses cannot overwrite newer results.
- Media: full-collection search, type filter, pages, collapsible upload area.
  Replace opens the upload area. Existing delete confirmation and permission
  checks remain in place.
- Secondary content: collapsed record-visibility settings, individual legal
  document cards, email preview; bounded team and email-template lists.

## Verification

- Production TypeScript/Vite build: passed on Linux in this workspace.
- Full frontend test suite and strict form-control inventory: run with this change;
  exact results are recorded in the PR and GitHub Actions.
- New rendered-component regression exercises private photo cleanup/retry,
  section switching, history pages, same-brand selection, category reset,
  media paging/search/replace, audit server paging and filter reset.
- Protocol pagination regression verifies retained direction order and recorded
  places across page boundaries. Existing saved-car-pagination regression explicitly
  sets its 25-row preference, independently of the new compact default.
- Existing browser navigation script now explicitly opens participant sections
  and selects its required 25-row car-page preference.

## Not accepted live

The local headless Chromium attempt was blocked by the runtime's socket policy.
The separate cloud browser could not reach the local preview. No browser visual
acceptance is claimed. Repeat the navigation script and manual viewport checks
at 320/390/768/1024/1440 px on a browser-capable runner, then verify the deployed
revision on Ubuntu with real authorized media. No deployment, real-data mutation,
DB migration, DNS change or full-project completion is claimed by this PR.
