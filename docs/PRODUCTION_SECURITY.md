# USD 2.0 production security

## Required architecture

Internet
-> Cloudflare DNS proxy / WAF / DDoS protection
-> HTTPS reverse proxy
-> NestJS API
-> PostgreSQL on a private network

The PostgreSQL port must never be exposed to the public Internet.

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

## Edge protection

Cloudflare should proxy the API hostname.

Recommended controls:

- WAF managed rules enabled
- DDoS protection enabled
- rate limiting rules for /auth/*
- bot protection where appropriate
- only HTTPS exposed
- origin firewall rules allow traffic only from the reverse proxy/Cloudflare path
- PostgreSQL is not publicly routable

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

NestJS application controls cannot stop a large volumetric DDoS before traffic reaches the origin. Cloudflare/WAF and network-level controls are therefore mandatory for production.


## Final release gate

Production release is blocked until CI passes build, lint, unit tests, E2E tests, and the high-severity dependency audit. The API origin must remain behind Cloudflare/WAF and the PostgreSQL origin must not be publicly reachable.

- Security regression tests cover registration configuration binding and duplicate-registration protections.

- Legacy imports now receive an explicit immutable placeholder configuration version instead of creating registrations without configuration history.
