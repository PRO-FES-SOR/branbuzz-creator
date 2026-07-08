// Service Worker for BranBuzz Creator True Offline Web Push Notifications

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Listen for network push events from the Web Push protocol (via Edge Function)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const payload = event.data.json();
    const title = payload.title || 'New Notification';
    const options = {
      body: payload.body || 'You have a new update.',
      icon: '/favicon.png',
      badge: '/favicon.svg',
      data: payload.data || {},
      vibrate: [200, 100, 200],
      requireInteraction: false
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('Error handling push event:', err);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const section = event.notification.data?.section || 'products';
  const urlToOpen = new URL('/creator-dashboard.html', self.location.origin).href;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // 1. If we have a matching window that is already open, focus it
      const matchingClient = clients.find((client) => {
        return client.url.includes('/creator-dashboard.html');
      });
      
      if (matchingClient) {
        // Send a message to the client to switch to the correct section
        matchingClient.postMessage({
          type: 'SWITCH_SECTION',
          section: section
        });
        return matchingClient.focus();
      }
      
      // 2. Otherwise, open a new window
      return self.clients.openWindow(urlToOpen + '?section=' + section);
    })
  );
});
