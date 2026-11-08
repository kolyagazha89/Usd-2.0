# Backend tooling dependency audit patch

The 2026-11-07 backend lockfile audit found high-severity advisories in development tooling: `@nestjs/mau` → `inquirer` → `external-editor` → `tmp`, and `@nestjs/mau` → `undici`. The production-only audit found no vulnerabilities. The backend image builds with development tools and prunes them from the runtime image, retaining the pinned Prisma CLI for migrations.

Scope: override `external-editor`'s `tmp` to 0.2.7 and `@nestjs/mau`'s `undici` to 6.29.1. The former crosses the upstream `tmp` range and the latter replaces an exact upstream pin, so exercise the installed Nest tooling as well as the backend checks. These versions are outside the reported affected ranges ([tmp](https://github.com/advisories/GHSA-7c78-jf6q-g5cm), [undici](https://github.com/advisories/GHSA-2m5v-pch6-74hx)); reassess the overrides when upstream dependencies are updated.

Acceptance: `npm ci --ignore-scripts` accepts the manifest and lockfile, `npm audit` reports zero high or critical vulnerabilities, and the installed patched tooling and backend build, lint and tests are checked where feasible. Record any remaining audit findings and verification limits; this change is not a complete security review. No application behavior, database schema, or runtime dependency targets change.
