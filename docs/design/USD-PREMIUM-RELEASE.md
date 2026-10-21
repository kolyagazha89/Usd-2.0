# USD Premium public design — release review

The approved black/red React design is integrated into the existing USD frontend. The homepage, stages, results, records and rules use the existing public API; participant, car, team, news, partner, contact and document pages use only published public data. Login, participant operations, administration and backend remain unchanged.

The original logo asset is byte-identical (SHA-256 4c600487e53caf611928ae2d240dac30204e290290b08dfc3c9faf7b46c903ea). The 3D facade is brighter silver with black animated EQ bars, a moving speaker, smoke and a single lightning arrival per browser session. Hero title: Ultimate Sound Destruction. Vibration is requested only from trusted logo activation where navigator.vibrate is available; no automatic vibration is promised. Reduced-motion preference suppresses the arrival, continuous motion and haptics.

## Verified on 2026-10-21

- Frontend npm test: 29 passed, 0 failed. Includes delayed authentication bootstrap, navigation/history, registration deep links, mixed measurement units and haptic fallback checks.
- Frontend npm run build: passed. Main application and Three.js still produce large-chunk warnings; no claim of measured physical-device performance.
- Standalone design prototype build: passed.
- Browser desktop and mobile: home, results, public participant and published rules reviewed; 193 final-stage results and 704 public participants used. Result, profile and rules document had no horizontal page overflow at the tested mobile width.
- Arena image converted to WebP: 252870 bytes versus 2233682-byte PNG.
- Local preview uses copies of published public API responses because the production API does not permit the local preview origin. The preview gateway and response copies are outside this repository; they are not deployed and cannot write to the production API. Authenticated forms were not submitted against production during this review.

## Before public cutover

- Review existing CMS content: a published news item still contains test text, and several legal text/contact fields are placeholders. These existing records were not edited. Use the existing admin to approve real content.
- Verify image/poster choices, official documents and full authenticated flows on the accepted deployment origin.
- Check the lightning and physical vibration on real Android/iPhone devices; unsupported browsers retain the visual experience.
- Main branch, database, Railway services, DNS and the existing Tilda root site have not been changed by this design branch. Merge/deployment is a separate cutover decision after preview acceptance.
