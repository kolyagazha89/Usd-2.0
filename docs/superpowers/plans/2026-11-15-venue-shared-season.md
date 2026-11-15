# USD retained season release

Goal: one laptop, one existing Compose project and PostgreSQL database, multiple retained stages. A new signed stage adds registrations without clearing old results. Exports select exactly one stage. No central acknowledgement is required to start another prepared event.

Implementation decisions: preserve the existing project/credentials/CA; keep one workspace per stage for its package and return receipts. Use an additive root-owned active-stage pointer and independent journal hash chains per stage. A privileged, network-internal one-shot importer suppresses logging only for its own transaction; the running API remains unprivileged. Shared participants/configurations are reused without overwriting local changes. An identical retry is read-only; a changed package for an existing stage is rejected. Physical Windows/router/two-phone and Ubuntu acceptance remains required.

Tasks:
- [x] Test and implement retained imports, identity/config reuse and exact retry behavior.
- [x] Test and implement per-stage journal, export and API startup validation.
- [x] Replace multi-project switching with shared-state installation, resume and cached-image support; refresh staff explicitly for the new stage.
- [ ] Rebuild downloadable kit and instructions, run unit/integration/Windows checks and inspect Actions at the exact head.
- [ ] Record merged, CI, deployed and physical acceptance separately in #114.

Review focus: power loss after database commit; second-stage shared configuration UUID; no WAN at switching time; old signing/token expiry; old workspace must not silently start a different active stage. No production database migrations or resets are authorized by this change.


Final review: independent Superpowers reviewer found workspace `.env` precedence, native PowerShell JS quoting, historical DB recreation, partial-stack rollback, expired committed-package recovery, wrong staff-key recovery, prior-stage intake policy inheritance and unnecessary registry pulls. One correction pass addresses each, with native PS5.1/Compose regressions and actual PostgreSQL 18 tests. The initial failing tests were committed separately. Production database/root access and physical acceptance are still not performed.
