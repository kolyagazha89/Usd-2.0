/* Push-only worker: deliberately no fetch handler, response cache, or offline account pages. */
'use strict';
function appPath(value) {
  if (typeof value !== 'string' || value.length > 300 || /[\\\x00-\x20]/.test(value) || !/^\/(?:participant|stages|news)(?:[/?#]|$)/.test(value)) return '/participant';
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin && /^\/(?:participant|stages|news)(?:\/|$)/.test(url.pathname) ? url.pathname + url.search + url.hash : '/participant';
  } catch { return '/participant'; }
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { /* Show a safe visible fallback for malformed messages. */ }
  if (!data || typeof data !== 'object') data = {};
  event.waitUntil(self.registration.showNotification(typeof data.title === 'string' ? data.title.slice(0, 80) : 'USD', {
    body: typeof data.body === 'string' ? data.body.slice(0, 240) : 'Новое уведомление USD. Откройте личный кабинет.',
    icon: '/usd/pwa-192.png', tag: typeof data.tag === 'string' ? data.tag.slice(0, 100) : 'usd',
    data: { path: appPath(data.path) },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(appPath(event.notification.data?.path), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.navigate(target); await client.focus(); return;
    }
    await self.clients.openWindow(target);
  })());
});
