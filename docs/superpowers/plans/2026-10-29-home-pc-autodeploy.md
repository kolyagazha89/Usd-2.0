# USD home-PC automatic deployment implementation plan

> **For agentic workers:** Execute in this session using superpowers:executing-plans. Host acceptance remains incomplete until a real release and a subsequent automatic release are verified.

**Goal:** A successful main push updates app.usd-russia.ru using tested images, independent backups, schema compatibility and verified rollback.

**Architecture:** GitHub-hosted workers build and publish both SHA-tagged images on each main push. A dedicated unprivileged home runner requests the root-owned service; the timer also retries. Ubuntu pulls images and retains the existing CI, schema, data identity, backup, restore and rollback gates.

**Tech stack:** GitHub Actions, Docker Compose, systemd, Bash, PostgreSQL 18, Prisma 7.10.1, rclone.

**Spec:** User request of 2026-10-29 in this session; deployment contracts in deploy/home-pc/README.md.

## Global constraints

- Change only app.usd-russia.ru and api.usd-russia.ru; never the primary usd-russia.ru domain.
- Preserve the existing PostgreSQL container and volume, participant data, results and media.
- Never run historical imports or implicit schema migrations during API startup.
- Keep production credentials on the host and the public repository's runner unprivileged.
- Do not report host acceptance from mocked tests or GitHub image publication.

## Review focus

- One image failing to download must not authorize either image's deployment.
- Pending/failed CI and changed Prisma trees must leave live containers untouched.
- A missing backup policy must not produce a successful deployment result.
- A queued/offline runner must remain visible; timer operation is not proof of runner connectivity.
- A Docker install failure must preserve its exit code and show the npm debug context.

### Task 1: Publish and acquire images automatically

**Files:** .github/workflows/publish-home-pc-images.yml, .github/workflows/request-home-pc-deploy.yml, deploy/home-pc/auto-deploy.sh, deploy/home-pc/test-auto-deploy.sh.

- [ ] Extend the temporary-repository builder rehearsal to require registry pulls, zero local builds and refusal of partial downloads or wrong image revisions; run and observe failure.
- [ ] Publish both images for main pushes with revision labels. Request the host after publication succeeds.
- [ ] Replace home image builds with SHA-tagged pulls and revision validation. Retain release gates and cached-image validation.
- [ ] Run the builder rehearsal and existing CI verifier tests; commit the coherent change.

### Task 2: Diagnose container installs and retain Docker state

**Files:** backend/Dockerfile, frontend/Dockerfile, deploy/home-pc/usd-auto-deploy.service, deploy/home-pc/README.md.

- [ ] Print the npm debug-log tail inside failed Docker build layers and retain the install exit status.
- [ ] Put Buildx state in the existing writable root-owned deployer directory.
- [ ] Document the GitHub-to-host pipeline, diagnostic evidence and first host activation steps.
- [ ] Validate shell/workflow syntax and run GitHub's real image/PG18 checks.

### Task 3: Supervise actual host activation

**Interfaces:** Existing root-owned helpers, exact live Compose labels and images, independently configured rclone destinations, protected host credentials.

- [ ] Obtain a working authorized host connection; identify/fix the original ETIMEDOUT from in-container debug logs.
- [ ] Verify runner registration, labels, service account and narrow sudo policy.
- [ ] Configure independent DB/media remotes, verify full restores and a disposable rollback rehearsal.
- [ ] Review pending Prisma migrations on an isolated restore; supervise the first compatible release without replacing live PostgreSQL.
- [ ] Enable the verified schema policy; check the real Dark Velocity UI and API.
- [ ] Make a subsequent main change and verify its new SHA is deployed automatically.

## Evidence and blockers

- Main baseline: 5c3347c4e463da77d6ed47773627aa9c074998cf. GitHub publication and main safety CI succeeded for it.
- User's host log: npm ci fails with read ETIMEDOUT at 16–17 seconds; debug logs were hidden in failed build layers.
- User's host output: no loaded actions.runner services. Exact runner installation remains unverified.
- No SSH route from the primary workspace. Temporary Tailscale startup fails on prohibited netlink operations. An alternate remote client did not authenticate; subsequent remote access returned HTTP 403.
- Independent backup destinations and credentials are not available in this session. Host activation is blocked, not approved by the existence of this plan.
