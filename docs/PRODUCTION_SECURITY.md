# USD 2.0 production security

## Actual online prerelease architecture (verified 10.11.2026)

Internet
-> **CloudPub public tunnel**, with public DNS CNAMEs for both `app.usd-russia.ru` and `api.usd-russia.ru` under `*.cname.cloudpub.ru`
-> host HTTPS reverse proxy / Docker Compose services, subject to actual host inspection
-> NestJS API
-> private PostgreSQL 18 and RustFS services on the local Ubuntu/Hyper-V installation

This supersedes the old aspirational Cloudflare path below: **the current prerelease does not require or claim Cloudflare**. CloudPub's own marketing says its servers are in Russia, but location/logging/processing and deployment security require operator/provider confirmation. See [live flow audit](legal/2026-11-10-cloudpub-data-flows-audit.md).

Never expose PostgreSQL or RustFS private management ports to the public Internet. Keep the original `usd-russia.ru` domain untouched until release authorization.

## Required production environment

- NODE_ENV=production
- JWT_SECRET: random value, at least 32 bytes
- JWT_ISSUER: stable API issuer
- JWT_AUDIENCE: stable client audience
- AUTH_COOKIE_SECURE=true
- AUTH_COOKIE_NAME: explicit non-default name
- CORS_ORIGINS: only the real frontend origin(s)
- CSRF_TRUSTED_ORIGINS: only the real frontend origin(s)
- TRUST_PROXY_HOPS: exact number of trusted reverse proxies
- REQUEST_BODY_LIMIT: keep at 5mb or lower unless an import endpoint receives a justified larger payload

## Edge protection: actual CloudPub tunnel

CloudPub publishes the application/API through a tunnel. **Do not claim that CloudPub includes a configured Cloudflare-style WAF, active DDoS mitigations, managed rules or a specific logging location without checking the live account and supplier contract.**

Recommended verified controls:

- Require TLS/HTTPS for both public subdomains; check certificate renewal, HSTS and real client-IP trust boundaries.
- Determine whether CloudPub terminates external TLS and which request headers, IP addresses and cookies appear in its logs; confirm storage location and data-processing terms.
- Configure only the necessary ingress publications; check authentication, rate limiting, IP/filter policies where CloudPub actually supports them.
- Re-test `/auth/*` throttling, API body limits and upstream rate protection on the live route without disruptive load tests.
- Firewall local management ports, PostgreSQL, RustFS administration and SSH from public access.
- Monitor upstream outage/latency and the maximum traffic quota; perform a safe DDoS resilience review before mass-public use.

## Application protection

The API implements:

- authentication and role guards
- object-level ownership checks
- strict DTO validation
- unknown-property rejection
- request body limits
- request rate limiting
- authentication-specific rate limiting
- security headers
- HTTP timeout protection
- refresh-session rotation and family invalidation on replay
- explicit RBAC for administrative and operational endpoints
- import endpoint isolation
- production dependency audit in CI

## Operational rules

- Never commit production secrets.
- Never log access tokens, refresh tokens, passwords or reset/verification tokens.
- Rotate JWT and infrastructure secrets after suspected compromise.
- Keep PostgreSQL backups encrypted and test restoration.
- Monitor 401/403/429/5xx rates.
- Alert on unusual authentication failures and refresh-session replay.
- Keep Node.js and npm dependencies patched.
- Run external load and DDoS tests against staging before the first public competition.

## Important limitation

NestJS application controls cannot stop a large volumetric DDoS before traffic reaches the origin. Confirm actual CloudPub/tunnel-provider protection and network-level mitigation; **passing application tests is not proof of upstream DDoS protection**.


## Final release gate

Production release is blocked until CI passes build, lint, unit tests, E2E tests, and the high-severity dependency audit. The API must remain behind the reviewed **CloudPub or equally approved secure ingress**, and PostgreSQL/private S3 must not be publicly routable. Confirm real backup/restore, operator-approved legal texts and actual external recipients of user data (WebPush, Google Fonts, optional Google OAuth and backups).

- Security regression tests cover registration configuration binding and duplicate-registration protections.

- Legacy imports now receive an explicit immutable placeholder configuration version instead of creating registrations without configuration history.

- CI failures are treated as release blockers and are fixed before merge.
