# USD participant experience — design QA

Visual source: the three user-supplied Figma PNG exports from 21 October 2026, named `USD — Premium Vehicle Configuration · UI concept(1).png`, `(1)(1).png`, `(2)(1).png`. They cover desktop/mobile configuration and its interaction states. They establish the graphite surfaces, compact equipment cards, clear type hierarchy and red primary actions used here. Separate cabinet/registration frames were not available; those layouts are adaptations of this system, not claimed pixel-identical copies.

## Reviewed implementation

- Overview: one primary upcoming-stage card, participant card, garage/system and latest results; repeated statistics and repeated stage summaries removed.
- Registration: one task per screen, three visible steps, preserved values on back, a final review and required consent before submission.
- Configuration: contextual title, compact vehicle summary, visible direction/settings tabs, expandable equipment cards and catalogue actions.
- Profile, garage, application list/detail: the same card, type and control system. Mobile application actions use the full content width, with cancellation secondary.
- Original USD logo and dynamic user/car imagery remain first-party/API assets. The source sheet itself is not used as a page asset. Administrator pages keep their light theme and expanded editor rows.

## Evidence and fixes

Local built frontend inspected with Chromium at 320, 390, 1024 and 1440 px. Thirty participant route/interaction cases pass. Both 320×568 and 390×568 catalogue dialogs retain their add/close controls. Extra clean screenshots reviewed at desktop/mobile for overview, profile, garage, three registration steps and configuration. Browser data is synthetic; all production requests are blocked.

Fixed during visual review: squeezed application content, repeated overview blocks, duplicate configuration headings, mobile header text protruding from icon buttons, and overly large permanently expanded equipment forms. Neutral card backgrounds, typography and flat red actions were checked in the rendered build. Parameters remain editable after expanding cards, and edited quantity remains visible after collapsing.

Functional checks: 35 frontend tests pass, including a full three-step mocked submission with the expected vehicle/version/classes payload, back navigation, mandatory rule consent, delayed equipment responses for a previous car, and multiple-car registration availability. Production build and whitespace checks pass. Code review found no remaining important regressions after fixes.

Limits: native iPhone Safari and saving through a real production account were not exercised. Figma's API limit blocks a live frame comparison; the supplied exports are the source. Cloud browser verification remains blocked by the previously observed timeout; the visual/interaction evidence above comes from local Chromium.

Final result: passed for the implemented responsive experience and supplied visual system; exact fidelity to unavailable cabinet/registration frames is not asserted.
