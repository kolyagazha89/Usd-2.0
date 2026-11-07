# USD rules reading experience

Owner request: after partner image controls, make the rules page convenient to read. Existing approved publication and historical stage snapshots are authoritative.

Observed live 2026-11-07: published document contains 201 blocks, 200 paragraphs + one table, no semantic heading blocks. Bold class headings in English are absent from contents; the dB limit row is incorrectly treated as a heading. Mobile contents is a horizontal strip and original download/version appears after the entire document. Read-only screenshots: `/workspace/scratch/rules-reading-before`.

Decision: improve the existing structured reader rather than replace the approved text or embed an opaque document viewer. A new source-based outline identifies actual short bold/section headings, never decimal limits or ordinary numbered clauses. Desktop contents remains sticky; mobile uses an accessible expandable list. Compact header puts publication date/original download first. Reading text is at least16px on mobile, line-height1.8, limited to70ch. Tables remain keyboard-scrollable within the article. Search navigates highlighted matches while preserving all clauses and surrounding context; clear empty/error states. Text fallback stays supported.

Preserve source blocks/runs/links, numbering, tables, document/version IDs, CMS data, historical stage snapshots and consent logic. Do not mutate published content or production settings. No new dependencies, API or migrations. Standard React/TypeScript and existing Dark Velocity tokens.

Acceptance: actual bold class headings appear in contents, dB rows/clauses do not; stable anchors focus visibly and clear mobile contents; original download/date is above text; all source content remains while searching, matches and next/previous work; keyboard-accessible table/controls; no horizontal page overflow at320/390/768/1440. Unit/runtime tests, full frontend suite/build and browser screenshots, cross-model review, exact CI and Ubuntu public SHA proof before completion.
