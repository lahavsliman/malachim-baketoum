import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

// ── Workbox precache ──────────────────────────────────────────────────────────
// self.__WB_MANIFEST is injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST || [])
cleanupOutdatedCaches()

// ── Runtime caching (mirrors vite.config.js workbox.runtimeCaching) ───────────
registerRoute(
  ({ url }) => /^https:\/\/firestore\.googleapis\.com\//i.test(url.href),
  new NetworkFirst({
    cacheName: 'firebase-firestore',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 3600 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

registerRoute(
  ({ url }) => /^https:\/\/identitytoolkit\.googleapis\.com\//i.test(url.href),
  new NetworkFirst({
    cacheName: 'firebase-auth',
    networkTimeoutSeconds: 5,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  })
)

registerRoute(
  ({ url }) => /^https:\/\/firebasestorage\.googleapis\.com\//i.test(url.href),
  new StaleWhileRevalidate({
    cacheName: 'firebase-storage',
    plugins: [
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 86400 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// ── FCM background push ───────────────────────────────────────────────────────
const firebaseApp = initializeApp({
  apiKey: 'AIzaSyB0LusXVbOZu9HmZqb4XHYG2jGJtj7Xlvc',
  authDomain: 'malachim-baketoum.firebaseapp.com',
  projectId: 'malachim-baketoum',
  storageBucket: 'malachim-baketoum.firebasestorage.app',
  messagingSenderId: '849289149810',
  appId: '1:849289149810:web:1dd1b66b841cf62c0c71eb',
})

const messaging = getMessaging(firebaseApp)

onBackgroundMessage(messaging, (payload) => {
  const title = payload.notification?.title || 'מלאכים בכתום'
  const body  = payload.notification?.body  || ''
  self.registration.showNotification(title, {
    body,
    icon:  '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    dir:   'rtl',
    lang:  'he',
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/'))
})
