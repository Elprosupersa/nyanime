/* NyAnime TV · Firebase Cloud Messaging Service Worker */
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
  projectId: 'summer-question-nc70r',
  appId: '1:241389458749:web:707e6b269b466f945aa154',
  apiKey: 'AIzaSyDGJKHV2yd5WiI_sxNpc-oz5-EGzXPSMek',
  authDomain: 'summer-question-nc70r.firebaseapp.com',
  storageBucket: 'summer-question-nc70r.firebasestorage.app',
  messagingSenderId: '241389458749'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const notif = (payload && payload.notification) || {};
  const data = (payload && payload.data) || {};
  const animeId = data.animeId ? String(data.animeId) : '';
  const episode = data.episode ? String(data.episode) : '';
  const title =
    notif.title ||
    data.title ||
    (animeId && episode ? 'Nuevo episodio disponible · Ep ' + episode : 'NyAnime TV');
  const body =
    notif.body ||
    data.body ||
    'Se estrenó un nuevo episodio de tu anime favorito en NyAnime TV.';
  const tag =
    data.tag || (animeId ? 'nyanime-fcm-' + animeId + '-' + (episode || '0') : 'nyanime-fcm-alert');
  const rawUrl = String(data.url || '/?tab=schedule');
  const url = rawUrl.charAt(0) === '/' ? rawUrl : '/';

  return self.registration.showNotification(title, {
    body: body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: tag,
    renotify: true,
    data: { url: url }
  });
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || '/';

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
