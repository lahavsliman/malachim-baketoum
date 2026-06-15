import {
  collection, addDoc, query, where, getDocs,
  orderBy, onSnapshot, Timestamp, deleteDoc, doc,
} from 'firebase/firestore'
import { db } from './config'

/**
 * targetGroup values:
 * all | night | shabbat | vehicle | ambulance | custom
 */

// ── Write ─────────────────────────────────────────────────────────────────────

export const sendBranchMessage = async (
  branchId,
  senderId,
  senderName,
  title,
  body,
  targetGroup,
  targetUserIds = []
) => {
  return addDoc(collection(db, 'branch_messages'), {
    branchId,
    senderId,
    senderName,
    title,
    body,
    targetGroup,
    targetUserIds,
    createdAt: Timestamp.now(),
  })
}

// ── Real-time listener ────────────────────────────────────────────────────────

/**
 * Subscribe to branch messages in real time.
 * Returns an unsubscribe function.
 */
export const subscribeBranchMessages = (branchId, callback) => {
  const q = query(
    collection(db, 'branch_messages'),
    where('branchId', '==', branchId),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}

// ── One-shot fetch (kept for compatibility) ───────────────────────────────────

export const getBranchMessages = async (branchId) => {
  const q = query(
    collection(db, 'branch_messages'),
    where('branchId', '==', branchId),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Delete a message document and all notifications linked to it.
 * Notifications are linked via the `messageId` field added at send time.
 */
export const deleteBranchMessage = async (msgId) => {
  // Delete the message itself
  await deleteDoc(doc(db, 'branch_messages', msgId))
  // Delete linked notifications
  const q    = query(collection(db, 'notifications'), where('messageId', '==', msgId))
  const snap = await getDocs(q)
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
}

// ── Target user resolution ────────────────────────────────────────────────────

/**
 * Return all active users in a branch who match the targetGroup.
 * Checks both new (permissions object) and legacy (flat) permission fields.
 */
export const getTargetUsers = async (branchId, targetGroup) => {
  const baseQ = query(
    collection(db, 'users'),
    where('branchId', '==', branchId),
    where('isActive', '==', true)
  )
  const snap = await getDocs(baseQ)
  const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  const hasPerm = (u, key) => u?.permissions?.[key] === true || u?.[key] === true

  // Team targeting is encoded as 'team:<teamName>'
  if (typeof targetGroup === 'string' && targetGroup.startsWith('team:')) {
    const name = targetGroup.slice('team:'.length).trim()
    return all.filter(u => (u.team || '').trim() === name)
  }

  switch (targetGroup) {
    case 'night':     return all.filter(u => hasPerm(u, 'nightShifts'))
    case 'shabbat':   return all.filter(u => hasPerm(u, 'shabbatVolunteer'))
    case 'vehicle':   return all.filter(u => hasPerm(u, 'vehicleDriver'))
    case 'ambulance': return all.filter(u => hasPerm(u, 'ambulanceDriver'))
    case 'male':      return all.filter(u => u.gender === 'male')
    case 'female':    return all.filter(u => u.gender === 'female')
    default:          return all   // 'all' and any unknown group
  }
}
