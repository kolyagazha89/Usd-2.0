# Mobile admin drawer gestures

Scope: admin navigation and mobile usability in the USD master plan / #114.

At widths up to 800px, a right swipe starting within 64px of the left edge
opens the existing sidebar. A left swipe closes it. The gesture needs 56px
of horizontal travel and must stay predominantly horizontal. Navigation
history and the URL are never changed by drawer gestures.

The first 20px intercept native `touchstart` with a non-passive listener:
WebKit recognizes history navigation before a later `touchmove` can cancel
it. This deliberately reserves that narrow edge; begin vertical page
scrolling outside it. Inputs, dialogs, sliders, media, and horizontally
scrolling lists retain their gestures. Opening gestures also exclude links
and buttons. Sidebar links still work by tapping; a closing swipe suppresses
the synthetic click. Normal menu, backdrop, Escape, route-change and resize
behavior remains in place. Handlers are removed when leaving the admin shell.

Regression coverage:

- `frontend/test/admin-drawer-swipe.test.mjs`: direction, thresholds, axis,
  history, form controls, horizontal lists, multitouch, cancellation,
  desktop exclusion and listener cleanup.
- `scripts/admin-drawer-swipe-browser-qa.mjs`: actual CDP touch input at
  390/768/1024px, drawer state, body scroll lock and release, native vertical
  scrolling, close buttons, Escape, unchanged URL/history and runtime errors.
  Screenshots and the JSON report are uploaded by the candidate browser job.

Browser automation does not reproduce the physical iOS Safari history
recognizer. Acceptance on an iPhone should include an existing previous
page, opening from the left edge, closing, tapping a menu item, and scrolling
the page and sidebar. No physical-device pass is claimed here.

WebKit background: https://bugs.webkit.org/show_bug.cgi?id=240892
