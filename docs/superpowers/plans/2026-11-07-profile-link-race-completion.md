# Profile linking completion plan

1. Reproduce stale createMe overwrite in focused unit, implement conditional write inside transaction, GREEN.
2. Add guarded PG18 integration scenarios for quota, competing claimants/flows, rollback and duplicate creation; run on isolated fixture and CI.
3. Full backend tests/build/lint, independent scoped review. Exclude generated Prisma and local dependencies.
4. Update existing PR459 with concrete corrected code and narrow scope, run exact CI; merge only once gates pass. Verify deployed exact main and public protection, keep duplicate merge/device checks open.
