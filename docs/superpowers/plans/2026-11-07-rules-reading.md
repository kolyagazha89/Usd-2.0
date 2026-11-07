# Rules reading implementation

Spec: `docs/superpowers/specs/2026-11-07-rules-reading-design.md`. Existing owner authorization covers this bounded UX work.

1. RED→GREEN source outline helper tests for bold classes/section headings vs numbered clauses and decimal dB rows; stable source indexes.
2. RED→GREEN reader runtime tests: mobile contents, anchor focus, date/download, full-context search and match navigation, existing list/table/unsafe-link rendering preserved.
3. Implement scoped responsive reader CSS and verify browser at320/390/768/1440 using approved public document only as a local read fixture. Preserve all201 blocks; no source content edits.
4. Full frontend tests/build, one independent cross-model review, fix Required regressions, PR/CI/merge/Ubuntu exact SHA and public read acceptance. Track #114 separately by code/CI/deployed/accepted states.

Global constraints: no historical snapshot/consent or source publication changes, no production writes, no dependencies/migration; admin light and public Dark Velocity retained.
