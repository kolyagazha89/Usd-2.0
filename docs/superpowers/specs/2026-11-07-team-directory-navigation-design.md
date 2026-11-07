# Team directory and applications UX

Owner requests convenient team management in admin/public. Base40e1f708 already includes separate workspace sections, publication review, gallery drafts, statistics and mobile navigation (#455–458); preserve those accepted changes.

This follow-up adds active/archive/pending filters and counts to admin directory, active/archive filters to the public directory, roster search/status filters with pending-first ordering, commander search retaining the current selection, and a public-team application link. The link preselects the team in the existing participant Team section and never auto-submits; missing/archived IDs cannot submit. Existing membership/backend authorization governs application decisions. Keep all later publication/media/draft/history behavior, no schema/API/dependency/production data changes.

Verify complete existing team workflows plus new filters/deep links, draft retention and role controls. Frontend full suite/build, strict form-label audit, responsive synthetic browser320/390/1440, independent review, exact PR/main CI and Ubuntu/public read proof. Do not claim real-device acceptance or full team subsystem acceptance from synthetic fixtures.
