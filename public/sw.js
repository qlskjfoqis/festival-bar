self.addEventListener('push', function(e) {
  const data = e.data ? e.data.json() : {}
  self.registration.showNotification(data.title || '새 주문', {
    body: data.body || '',
    icon: '/icon.png',
    badge: '/icon.png',
    requireInteraction: true,
  })
})

self.addEventListener('notificationclick', function(e) {
  e.notification.close()
  e.waitUntil(clients.openWindow('/admin'))
})