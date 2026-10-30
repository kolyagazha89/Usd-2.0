# Signed immutable release images

Owner-authorized inline implementation under docs/USD_MASTER_PLAN.md sections2–3.

The existing SHA tags/OCI labels describe source, but do not authenticate it.
Sign each GHCR digest in the main publishing workflow using GitHub Actions OIDC
and Cosign3.1.3; bind the signed payload to git_sha. Host verification must use
that exact digest, the exact main workflow identity and GitHub Actions issuer,
with normal transparency/certificate checks enabled. Reject alternate trust roots.
Only then may a candidate be used by auto-deploy, supervised setup or direct release.
After the switch, compare the running image ID with the verified local image ID,
so a retag during backup/rehearsal cannot pass by retaining the same tag string.
The existing supervised running version remains the rollback baseline, including
the transition from old unsigned releases; no new unsigned candidate is accepted.

- Tests: wrong SHA/registry/digest/claims/signature/trust override refuse admission;
  regression with an image-ID substitution must roll back. Cached images are verified.
- Tool trust: root-owned executable, no writable/symlink destination, fixed official
  v3.1.3 SHA256; atomic installer from an HTTPS release, not a floating package.
- Verify all offline policy tests, root-isolated full mocked release/auto suites,
  real Docker/PG18 inCI, then verify actual main-published keyless signatures.
- No live database/schema/DNS change or server enablement is part of this change.
- The change is not live accepted until the installed Ubuntu helper uses it.

Sources: https://docs.sigstore.dev/cosign/signing/signing_with_containers/ and
https://docs.sigstore.dev/cosign/verifying/verify/; official installer v4.1.0 and
cosign v3.1.3 release checksum. Local cosign verify --help confirms the exact issuer
and identity flags for this version. Main publishes are the live signing proof;
o local mocked response establishes cryptographic verification.
