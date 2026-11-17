/* Legacy bookmark/PWA entrypoint redirect. CloudPub can rewrite the upstream
 * Host header, so nginx's server-side host map cannot be the only safeguard.
 * Exact browser hostname check avoids redirecting the new public website,
 * LAN installations, API and unrelated hosts. Do not remove the old CloudPub
 * TLS mapping until server-side 301 is configured for search engines.
 */
(function () {
  'use strict';
  var location = window.location;
  if (location.protocol !== 'https:' || location.hostname !== 'app.usd-russia.ru') return;
  location.replace('https://usd-russia.ru' + location.pathname + location.search + location.hash);
}());
