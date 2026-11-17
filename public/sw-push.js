/* NyAnime Service Worker Push & Notification Handlers */

self.addEventListener('push', function (event) {
  let payload = {
    title: 'NyAnime TV',
    body: 'Tienes un nuevo episodio disponible.',
    tag: 'nyanime-push',
    url: '/',
    icon: '/pwa-192x192.png'
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = {
        title: parsed.title || payload.title,
        body: parsed.body || payload.body,
        tag: parsed.tag || payload.tag,
        url: parsed.url || payload.url,
        icon: parsed.icon || payload.icon
      };
    }
  } catch (_err) {
    try {
      const txt = event.data ? event.data.text() : '';
      if (txt) payload.body = txt;
    } catch (_e2) {}
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: '/pwa-192x192.png',
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url }
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i += 1) {
        const client = clientList[i];
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
