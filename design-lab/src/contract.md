# USD concept implementation contract

This folder is a disposable design exploration, separate from the working frontend. The user explicitly requested three running React homepage concepts before choosing a production direction. Do not modify anything in `frontend/`, `backend/`, `deploy/` or workflow files. Public branding is USD, never USD 2.0. Russian UI copy. No paid generations.

The root integrator supplies `src/core/ui.tsx`, `src/core/content.ts`, `src/core/base.css`, and lazy `src/core/Stage.tsx`.

## Concept modules

Each concept exports a default React component with no required props and imports its own CSS. Its root class is `.concept-a`, `.concept-b` or `.concept-c`, plus `.experience`. Styles must be scoped to that root except globally unique class names. All concepts use the shared sections, then can radically change their layout through scoped CSS and wrapper layouts.

Available from `../core/ui`:
- `Header({variant}: {variant: 'velocity'|'obsidian'|'sonic'})`: brand logo, navigation anchors, live account link, responsive menu.
- `Footer()`
- `ButtonLink({href, children, quiet?, className?})`
- `Eyebrow({children, className?})`
- `SectionHeading({index, label, title, href?, linkLabel?})`
- `Events({variant})`: section id `events`, filterable event cards.
- `Results({variant})`: section id `results`, six filterable winning results.
- `Records({variant})`: section id `records`, selectable featured record.
- `News({variant})`: section id `news`, editorial cards.
- `Partners({variant})`: section id `partners`, honest editorial text row without invented sponsor logos.
- `Live({variant})`: section id `live`, interactive replay demo, clearly marked recorded demonstration.
- `Join({variant})`: account CTA to the real USD site.

Available from `../core/content`:
- `official = 'https://app.usd-russia.ru'`
- `registrationUrl`: real existing `/login?next=...` route for the upcoming Krasnodar stage.
- `assets = {logo:'/assets/usd-original.png',car:'/assets/higgsfield-car.webp',speaker:'/assets/higgsfield-speaker.webp',arena:'/assets/usd-arena.webp'}`

Available default export `Stage` from `../core/Stage` (wrap in React lazy + Suspense or import normally; Stage internally lazy-loads Three):
`Stage({variant, className?, intensity?, onPulse?})`. Variant as above; intensity defaults to 0.5. It renders the original USD mark in a genuine interactive 3D scene with static fallback. Scene shifts with pointer and scroll, pauses offscreen, respects reduced motion. A wrapper must provide height, normally 480–650px on desktop and 300–400px on phones. Do not apply CSS filters to the logo.

Available `useReveal(ref)` from `../core/motion`: GSAP intro and ScrollTrigger reveals for `[data-reveal]`, scoped and reverted on unmount. Add `data-hero-copy` to hero copy and `data-reveal` to lower sections. Reduced motion shows everything without motion.

Global base CSS provides typography (self-hosted fonts), resets, `.shell` (max width 1440px, 6vw side gutters), buttons `.button`, `.button--quiet`, `.eyebrow`, `.section-heading`, semantic shared section classes. Lucide React icons installed.

No need to install packages, use Git, start a server, use browser, or edit shared files. The integrator will do testing and browser QA. No generated static concept images; this is an actual responsive web interface. Use real provided photos only as supporting media. Keep forms >=16px, hit targets >=44px, no horizontal body overflow, safe-area mobile bottom padding. Avoid unrequested English slogans other than concept name and short editorial metadata. Do not build production routes beyond the homepage. You may add an interactive hero control if it has real local behavior.

Common shared markup classes are `.events-section`, `.event-filters`, `.event-grid`, `.event-card`, `.event-art`, `.event-meta`, `.event-date`, `.event-content`, `.event-link`; `.results-section`, `.result-filters`, `.result-grid`, `.result-card`, `.result-top`, `.result-value`, `.result-person`; `.records-section`, `.record-layout`, `.record-tabs`, `.record-tab`, `.record-feature`, `.record-number`; `.news-section`, `.news-grid`, `.news-card`, `.news-image`; `.partners-section`, `.partner-rail`; `.live-section`, `.live-layout`, `.live-visual`, `.live-scores`; `.join-section`.
