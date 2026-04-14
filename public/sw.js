self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'NEW_ORDER') {
    self.registration.showNotification('🔔 새 주문이 들어왔어요!', {
      body: e.data.body,
      icon: '/icon.png',
      badge: '/icon.png',
      requireInteraction: true,
      vibrate: [200, 100, 200],
    })
  }
})

self.addEventListener('notificationclick', function(e) {
  e.notification.close()
  e.waitUntil(clients.openWindow('/admin'))
})