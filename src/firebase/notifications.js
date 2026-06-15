import {
  collection, addDoc, query, where, getDocs,
  updateDoc, doc, orderBy, getCountFromServer, Timestamp,
} from 'firebase/firestore'
import { db } from './config'

/**
 * Notification types:
 * shift_reminder | shift_cancelled | shabbat_confirmed | event_invite | general
 */

export const createNotification = async (userId, branchId, title, body, type) => {
  return addDoc(collection(db, 'notifications'), {
    userId,
    branchId,
    title,
    body,
    type,
    isRead: false,
    createdAt: Timestamp.now(),
  })
}

export const getUserNotifications = async (userId) => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const markAsRead = async (notificationId) => {
  await updateDoc(doc(db, 'notifications', notificationId), { isRead: true })
}

export const markAllAsRead = async (userId) => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('isRead', '==', false)
  )
  const snap = await getDocs(q)
  await Promise.all(snap.docs.map(d => updateDoc(d.ref, { isRead: true })))
}

export const getUnreadCount = async (userId) => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('isRead', '==', false)
  )
  const snap = await getCountFromServer(q)
  return snap.data().count
}

/**
 * Create one notification per user in the userIds array.
 * Writes are fanned out in parallel (no batched-write limit concern
 * for typical branch sizes; Firestore free tier handles ~30 concurrent writes).
 */
export const createBulkNotifications = async (userIds, branchId, title, body, type, extra = {}) => {
  if (!userIds?.length) return
  const payload = { branchId, title, body, type, isRead: false, createdAt: Timestamp.now(), ...extra }
  await Promise.all(
    userIds.map(userId =>
      addDoc(collection(db, 'notifications'), { ...payload, userId })
    )
  )
}
