# USD repository working agreement

## Canonical acceptance requirements

Read **[docs/USD_MASTER_PLAN.md](docs/USD_MASTER_PLAN.md)** before making product, design, deployment, or security changes. This is the owner's **full source-of-truth acceptance scope** (2026-10-29); do not silently reduce it to the existing MVP or treat a passing CI build as completion. Use existing [issue #114](https://github.com/kolyagazha89/Usd-2.0/issues/114) as the living release tracker. Link new PRs and concrete tests to checklist entries. Update checked items only with live proof (date, environment, SHA, reproducible evidence). Partial completion is not completion.

## Critical invariants

- **Public brand USD**, not the internal name 'USD 2.0'. Single organization; do not introduce multitenancy.
- **Never touch** the primary `usd-russia.ru` site, apex DNS or nameservers without a separate explicit owner approval; test only `app.usd-russia.ru` and `api.usd-russia.ru`.
- Production **PostgreSQL 18** on Ubuntu Hyper-V and historic registrations/results are the source of truth. No DB reset, volume deletion, historic replay/import or bulk edits without explicit separate authorization. No secrets or personal data in logs/issues/commits. Only approved additive migrations with verified fresh backups and isolated restore rehearsal.
- The 2026-10-29 supervised release was verified at `09d936fb3945222d1955ff9ea73490c9b82d04b0`. This proves first release and public revision check, **not** full UX/browser QA, second unattended release, off-host backup, or stable automation. A Windows HDD on the same physical PC is *not* off-host resilience.
- Website: public **Dark Velocity** black/graphite/red/white, admin **light/white** with dark sidebar. Responsive premium UX; participant vehicle configuration is UX priority #1. All mutable public content edited in admin, not hardcoded in React.
- Functional acceptance: participant cabinet, profiles & cars, registration and reused numbers, competition day/inspection/judging, results/records (exclude BassRace from records), immutable historical configurations, RBAC including custom judges, teams, Yandex 360 transactional email, push, storage, analytics, security, backups, monitoring, and complete pre-release audit.
- Deploy mechanism must verify exact main SHA CI, signed/immutable images, schema compatibility, isolated backup restore and rollback, and safely switch only api/frontend. **Auto-deploy is not proven until a second SHA release completes unattended**; first verified deployment did not establish this.
- Do not enable privileged self-hosted runner deployment from an untrusted public GitHub repository. Prefer minimal-trust remote polling of published GHCR images with a root-owned systemd helper, protected gate and explicit policy.

## Workflow

1. Verify current repository status and issue #114; record current evidence, avoid duplicate issues.
2. Select one coherent acceptance milestone; implement with tests and PR, not a stream of unverified micro-fixes.
3. Run CI, review migration/security/rollback risks, merge only verified compatible work, deploy to prerelease only through safe approved path, then test on real devices/browser.
4. Update issue #114 after every meaningful milestone with separate states: **code merged**, **CI passed**, **deployed**, **live accepted**. Do not mark complete until all requirements in the canonical plan are actually satisfied.
