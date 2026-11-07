# Historical profile linking safety completion

PR459 implements serialized requests, verified self-linking and conditional ADMIN decisions plus QR navigation QA. Review found reverse interleaving: createMe reads an unlinked account, a historical claim commits, then new profile creation overwrites that account with an unconditional update.

Guard the creation write by account ID, active state and participantId=null. On no match reject with409 inside the existing transaction, rolling back the new participant. Preserve the winning historical link and audit. No schema change, automatic duplicate merge, history/result/car edits or production data mutation.

Verify actual PostgreSQL18 races: four parallel different-profile requests enforce3/24h; competing verified claims on one account have one winner/audit; ADMIN vs self-claim on one profile has one winner; creation with stale preflight cannot overwrite committed self-link or leave orphan; concurrent creation attaches exactly one new profile. Dedicated opt-in e2e guard requires disposable loopback database, PG18 and empty users/participants. Extend existing isolated identity CI.

Release scope reconciliation: ship the coherent linking/QR safety slice after corrected CI/review and Ubuntu acceptance. Full two-profile duplicate merge/redirects and real-device QR acquisition remain separate open owner/master-plan requirements (#438/#442), not falsely completed or silently removed. Draft metadata must reflect this narrow final scope before merge.
