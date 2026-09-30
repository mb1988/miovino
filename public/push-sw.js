// Loaded into the generated service worker (vite.config.ts → workbox.importScripts).
// Shows the monthly drinking reminder and opens the app on tap.
self.addEventListener('push', (event) => {
  let msg = { title: 'MioVino', body: 'Time to check your cellar.', url: '/' }
  try {
    msg = { ...msg, ...event.data.json() }
  } catch {
    /* no or non-JSON payload: show the default */
  }
  event.waitUntil(self.registration.showNotification(msg.title, { body: msg.body, icon: '/icon.svg', badge: '/icon.svg', tag: 'miovino-monthly', data: { url: msg.url } }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin)
      if (win) return win.focus().then((w) => w.navigate(url))
      return self.clients.openWindow(url)
    }),
  )
})
