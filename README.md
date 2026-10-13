# USD 2.0 — Ultimate Sound Destruction

USD 2.0 is the official USD championship platform: public website, participant cabinet, event operations, results, records, rules and administration in one application.

## Technology

- Frontend: React 19, TypeScript and Vite
- API: NestJS, Prisma and PostgreSQL
- Roles: ADMIN (full system access), JUDGE (event operations and result entry), PARTICIPANT (self-service cabinet)

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

- [Development status and release checklist](docs/DEVELOPMENT_STATUS.md)
- [Product architecture and business rules](docs/PRODUCT_ARCHITECTURE.md)
- [Phase 1 release checklist](docs/PHASE_1_STATUS.md)
- [Timeweb VPS deployment guide](deploy/timeweb/README.md)

The planned final hosting target is a Timeweb VPS. Deployment files are being validated separately; no live cutover is implied by a successful build. Keep the existing `usd-russia.ru` Tilda site and root DNS records untouched until the new site is accepted and the owner explicitly approves the cutover. Before the first API start on a new server, verify the production database backup/restore and media-storage migration plan.

## Important operating rules

- ADMIN has full access to every module and supported action, including future modules.
- JUDGE can work across stages and enter results; editing/deleting results remains ADMIN-only.
- Historical imports must preserve the source-of-truth Results data and must not create no-show participants.
- Stage rules should preserve the exact published revision applicable to the stage.
- A merged commit or green CI is not proof of a live deployment or production acceptance.
