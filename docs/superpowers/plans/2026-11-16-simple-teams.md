# Simple teams implementation plan

Goal: default to direct selection and retain full management behind an ADMIN switch.
Spec: ../specs/2026-11-16-simple-teams-design.md

- [x] Add `TeamManagementService`, validated mode/selection DTOs and controller routes. Default false; current DB role check; update registration JSON under the existing settings lock; select an existing canonical name and atomically update profile/membership. Never change registrations/results.
- [x] Gate existing commander, application and post endpoints; hide public posts and private commander workspace; block photo reads/uploads while disabled.
- [x] Add `SimpleTeamPage`; switch existing page by mode; retain the old full interface. Add ADMIN checkbox and basic name/archive/results editor; public team page keeps results and selection link.
- [x] Add unit, PostgreSQL HTTP and three-viewport browser coverage; retain full-mode regression fixtures and wire browser check into existing CI.
- [ ] Verify CI, merge compatible code, confirm Ubuntu exact revision separately. Record evidence in PR linked to #114.
