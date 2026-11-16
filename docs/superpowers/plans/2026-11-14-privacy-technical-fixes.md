# Privacy audit technical fixes

Goal: fix the confirmed technical findings without changing legal documents, historical records, infrastructure or the database schema.

Use existing NestJS/React code. New self-service and admin profiles default to private; explicit visibility choices remain supported. The onboarding request must not force public visibility. Preserve the four font families through local variable WOFF2 files with their OFL licenses. Link both mail formats directly to notification preferences.

- [x] Add regression tests for omitted/explicit visibility and rendered mail links; observe failures.
- [x] Change new-profile defaults and onboarding payload, preserving historical imports and existing profile updates.
- [x] Replace remote font imports with local assets, retaining versions, sources and licenses.
- [x] Correct the mail footer destination.
- [x] Run backend/frontend tests, builds and lint; review the diff. Distinguish local verification from deployment.

No legal draft changes, schema migration, invented publication consent, blanket age restriction, production data changes, merge or deployment. Age/representative and refund policy remain dependent on the legal/business decisions under development.

Verification: frontend 137/137 test files passed; backend after `prisma generate` 1267 tests passed, 7 skipped (127 suites passed, 1 skipped). Both production builds passed. Backend lint passed with existing warnings. Built CSS has no Google Fonts references; all 16 local WOFF2 files exist. Full browser/device and live mail checks remain pending. No deploy performed.
