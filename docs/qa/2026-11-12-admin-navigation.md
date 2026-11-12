# Connected admin navigation and scroll

Scope: participant/vehicle administration and coherent admin navigation from #114.
No database changes, imports or public-domain configuration.

| Screen | Linked references |
| --- | --- |
| Participants | Garage cars, configurations, historical cars and stages |
| Cars | Owner, configurations; exact-ID target and unavailable-target state |
| Configurations | Car and owner; back to the same car |
| Registrations | Car, participant and selected stage in details |
| Inspections / event day | Cars, participants, stage context |
| Results / historical results | Car, participant and stage in details and tables |
| Records | Participant, car, stage |
| Stage detail / report / season report | Result car and participant, report stage and podium references |
| Teams | Member profiles; achievement stages and participant profiles stay in admin |
| Profile claims / users / disqualifications | Referenced profile and applicable stage |
| Audit / data quality / import reset | Existing referenced profiles, cars and stages by ID |
| Statistics | Profile details, existing stage-report entry |
| Generic resource/detail components | Identity columns and related participant/car/stage records |

Catalogs, site settings, news, partners, mail, roles, legal documents and media
are not entity associations merely because their editable text mentions a car
or stage. Free text and immutable archived equipment snapshots are not matched
by display name. Missing IDs remain text; no guessed record is opened.

Native anchors support keyboard activation and opening in a new tab. Clicking
one inside a clickable row does not also open its parent row. A validated internal
return URL preserves the referring card. Stage route parsing excludes its query.

Scroll: admin destinations restore their saved screen position, including after
saving an edit. Public forward navigation starts at zero; browser history restores
that entry's position. Restoration follows asynchronous document height changes
and yields immediately to wheel, touch, pointer or keyboard input. Native automatic
history restoration is disabled while the coordinator is mounted.

Verification:
- Local production build and 523 frontend tests passed before the final CI run.
- News, partner, user and configuration editors also restore their list position;
  selected record/result/registration/user cards are encoded in their URL.
- `scripts/admin-navigation-browser-qa.mjs`: isolated synthetic data, mobile and
  desktop; participant/car/configuration/history links, record and registration
  links, missing and failed car targets, edit/save scroll, public navigation/history.
- CI runs the browser check with a pinned Playwright image, alongside the existing
  route/accessibility/safe-area checks. Local Chromium launch is blocked by the
  executor's Unix-socket restriction; no local browser success is claimed.
- Ubuntu deployment and live acceptance remain separate from candidate checks.
