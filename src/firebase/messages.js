import {
  collection, addDoc, query, where, getDocs,
  orderBy, onSnapshot, Timestamp, deleteDoc, doc, setDoc, getDoc,
} from 'firebase/firestore'
import { db } from './config'

/**
 * targetGroup values:
 * all | night | shabbat | vehicle | ambulance | custom
 */

// ── Write ─────────────────────────────────────────────────────────────────────

export const sendBranchMessage = async (
  branchId, senderId, senderName, title, body, targetGroup, targetUserIds = [], options = {}
) => {
  const {
    requiresAck = false,
    messageType = 'normal',
    choiceOptions = [],
  } = options
  return addDoc(collection(db, 'branch_messages'), {
    branchId, senderId, senderName, title, body,
    targetGroup, targetUserIds,
    requiresAck, messageType, choiceOptions,
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
  // Delete linked receipts
  const rq    = query(collection(db, 'message_receipts'), where('messageId', '==', msgId))
  const rsnap = await getDocs(rq)
  await Promise.all(rsnap.docs.map(d => deleteDoc(d.ref)))
}

// ── Message receipts ──────────────────────────────────────────────────────────

export const submitMessageReceipt = async (messageId, branchId, userId, userName, { status = 'read', choice = null } = {}) => {
  const ref = doc(db, 'message_receipts', `${messageId}_${userId}`)
  await setDoc(ref, {
    messageId, branchId, userId, userName,
    status,
    choice,
    respondedAt: Timestamp.now(),
  })
}

export const getMessageReceipts = async (messageId) => {
  try {
    const q = query(collection(db, 'message_receipts'), where('messageId', '==', messageId))
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error('[receipts] query FAILED:', err)
    return []
  }
}

export const getUserMessageReceipt = async (messageId, userId) => {
  const snap = await getDoc(doc(db, 'message_receipts', `${messageId}_${userId}`))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export const getPendingAckMessages = async (branchId, userId) => {
  const q = query(
    collection(db, 'branch_messages'),
    where('branchId', '==', branchId)
  )
  const snap = await getDocs(q)
  const msgs = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => m.requiresAck === true)
    .filter(m => Array.isArray(m.targetUserIds) && m.targetUserIds.includes(userId))

  if (msgs.length === 0) return []

  const pending = []
  for (const m of msgs) {
    try {
      const r = await getUserMessageReceipt(m.id, userId)
      if (!r) pending.push(m)
    } catch (err) {
      console.error('[ack] receipt check FAILED for', m.id, err)
      pending.push(m)
    }
  }
  pending.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0))
  return pending
}

export const getMessageById = async (messageId) => {
  const snap = await getDoc(doc(db, 'branch_messages', messageId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
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
