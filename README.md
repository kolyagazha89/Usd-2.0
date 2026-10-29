# USD — Ultimate Sound Destruction

> **USD canonical roadmap & release criteria (2026-10-29):** [docs/USD_MASTER_PLAN.md](docs/USD_MASTER_PLAN.md) · [live release tracker #114](https://github.com/kolyagazha89/Usd-2.0/issues/114). The first Ubuntu prerelease at `09d936fb` passed deployment/public revision checks. Full acceptance and unattended second release remain OPEN. The previous Timeweb/Railway notes below are historical; **current prerelease runs on the home Ubuntu/Hyper-V server**. Do not change `usd-russia.ru` without separate authorization.

USD 2.0 is the official USD championship platform: public website, participant cabinet, event operations, results, records, rules and administration in one application.

## Technology

- Frontend: React 19, TypeScript and Vite
- API: NestJS, Prisma and PostgreSQL
- Roles: ADMIN (permanent full access), PARTICIPANT (self-service cabinet), and editable custom roles (including «Судья»)

## Development

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
npm ci
npm run start:dev
```

Set backend environment variables for PostgreSQL, JWT, CORS/CSRF, and any configured email or S3-compatible media provider. See the CI workflow for the backend test commands.

## Release and deployment

- [Authoritative USD final acceptance plan (owner-provided)](docs/USD_MASTER_PLAN.md)
- [Active GitHub release tracker #114](https://github.com/kolyagazha89/Usd-2.0/issues/114)
- [Home Ubuntu / Hyper-V deployment](deploy/home-pc/README.md)

- [Development status and release checklist](docs/DEVELOPMENT_STATUS.md)
- [Product architecture and business rules](docs/PRODUCT_ARCHITECTURE.md)
- [Phase 1 release checklist](docs/PHASE_1_STATUS.md)
- [Timeweb VPS deployment guide](deploy/timeweb/README.md)

The current prerelease deployment target is the owner-managed Ubuntu 24.04 VM on Hyper-V. The original Timeweb plan is historical. A verified first prerelease at SHA 09d936fb is NOT proof of unattended update capability, off-host backups, or full acceptance. Keep the existing `usd-russia.ru` Tilda site and root DNS records untouched until the new site is accepted and the owner explicitly approves the cutover. Before the first API start on a new server, verify the production database backup/restore and media-storage migration plan.

## Important operating rules

- ADMIN has full access to every module and supported action, including future modules.
- Custom roles receive only the module/action permissions granted by ADMIN; result editing/deletion is controlled by that permission matrix.
- Historical imports must preserve the source-of-truth Results data and must not create no-show participants.
- Stage rules should preserve the exact published revision applicable to the stage.
- A merged commit or green CI is not proof of a live deployment or production acceptance.
