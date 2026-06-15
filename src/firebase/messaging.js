import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { doc, updateDoc } from 'firebase/firestore'
import app from './config'
import { db } from './config'

// Generate this in Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
export const VAPID_KEY = 'BIDyplb7c_-dDpoD06GoVhKvRJwArD1TTh_on-6KqMozdZIaypMCuVv1NUaNsGouBZgAGyjhF0hD4IFd1W9ey6E'

let _messaging = null

function getMessagingInstance() {
  if (!_messaging) _messaging = getMessaging(app)
  return _messaging
}

/**
 * Request the FCM token using the already-active service worker,
 * then persist it to the user's Firestore document.
 * Safe to call if permission is already granted.
 */
export async function registerFcmToken(userId) {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    if (Notification.permission !== 'granted') return

    const swReg = await navigator.serviceWorker.ready
    const token = await getToken(getMessagingInstance(), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    })

    if (token) {
      await updateDoc(doc(db, 'users', userId), { fcmToken: token })
    }
  } catch (err) {
    console.error('[FCM] Token registration failed:', err)
  }
}

/**
 * Subscribe to foreground messages (app is open).
 * Returns an unsubscribe function.
 */
export function onForegroundMessage(callback) {
  return onMessage(getMessagingInstance(), callback)
}
