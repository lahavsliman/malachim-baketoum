import {
  collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc, query,
  where, getDocs, Timestamp, onSnapshot,
} from 'firebase/firestore'
import { db } from './config'

export const createEvent = async (branchId, eventData, userId) => {
  return addDoc(collection(db, 'events'), {
    ...eventData,
    branchId,
    status: 'active',
    createdBy: userId,
    createdAt: Timestamp.now(),
    cancelledAt: null,
    cancelledBy: null,
  })
}

export const updateEvent = async (eventId, updates) => {
  await updateDoc(doc(db, 'events', eventId), updates)
}

export const cancelEvent = async (eventId, userId) => {
  await updateDoc(doc(db, 'events', eventId), {
    status: 'cancelled',
    cancelledAt: Timestamp.now(),
    cancelledBy: userId,
  })
}

export const deleteEvent = async (eventId) => {
  // Delete linked responses
  const q    = query(collection(db, 'event_responses'), where('eventId', '==', eventId))
  const snap = await getDocs(q)
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))

  // Delete linked notifications
  const nq    = query(collection(db, 'notifications'), where('eventId', '==', eventId))
  const nsnap = await getDocs(nq)
  await Promise.all(nsnap.docs.map(d => deleteDoc(d.ref)))

  await deleteDoc(doc(db, 'events', eventId))
}

export const subscribeEvents = (branchId, callback, onError) => {
  // Single where() clause — no composite index required.
  // Sorting is handled client-side in EventsPage (.sort by date).
  console.log('[subscribeEvents] subscribing for branchId:', branchId)
  const q = query(
    collection(db, 'events'),
    where('branchId', '==', branchId)
  )
  return onSnapshot(
    q,
    snap => {
      console.log('[subscribeEvents] got', snap.size, 'events for branchId:', branchId)
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    },
    err => {
      console.error('[subscribeEvents] error for branchId:', branchId, err)
      if (onError) onError(err)
      else callback([])
    }
  )
}

// Upsert — deterministic doc ID guarantees one response per volunteer per event
export const submitResponse = async (eventId, branchId, volunteerId, volunteerName, response) => {
  const docRef = doc(db, 'event_responses', `${eventId}_${volunteerId}`)
  await setDoc(docRef, {
    eventId, branchId, volunteerId, volunteerName, response,
    respondedAt: Timestamp.now(),
  })
}

export const getEventResponses = async (eventId) => {
  const q = query(
    collection(db, 'event_responses'),
    where('eventId', '==', eventId)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const subscribeEventResponses = (eventId, callback) => {
  const q = query(
    collection(db, 'event_responses'),
    where('eventId', '==', eventId)
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  )
}

export const getVolunteerResponse = async (eventId, volunteerId) => {
  const snap = await getDoc(doc(db, 'event_responses', `${eventId}_${volunteerId}`))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export const targetGroupCheck = (targetGroup) => {
  if (typeof targetGroup === 'string' && targetGroup.startsWith('team:')) {
    const name = targetGroup.slice('team:'.length).trim()
    return u => (u.team || '').trim() === name
  }
  switch (targetGroup) {
    case 'night':     return u => u.permissions?.nightShifts      || u.nightShifts      === true
    case 'shabbat':   return u => u.permissions?.shabbatVolunteer || u.shabbatVolunteer === true
    case 'vehicle':   return u => u.permissions?.vehicleDriver    || u.vehicleDriver    === true
    case 'ambulance': return u => u.permissions?.ambulanceDriver  || u.ambulanceDriver  === true
    case 'male':      return u => u.gender === 'male'
    case 'female':    return u => u.gender === 'female'
    default:          return () => false
  }
}

export const getPendingResponseEvents = async (branchId, userId) => {
  const today = new Date().toISOString().slice(0, 10)
  const q = query(collection(db, 'events'), where('branchId', '==', branchId))
  const snap = await getDocs(q)
  const candidates = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => e.requiresResponse === true && e.status === 'active' && e.date >= today)
  if (candidates.length === 0) return []
  const userSnap = await getDoc(doc(db, 'users', userId))
  const userData = userSnap.exists() ? { id: userId, ...userSnap.data() } : { id: userId }
  const targeted = candidates.filter(event => {
    const tg = event.targetGroup
    if (!tg || tg === 'all') return true
    if (tg === 'custom') return event.targetUserIds?.includes(userId) ?? false
    return targetGroupCheck(tg)(userData)
  })
  if (targeted.length === 0) return []
  const pending = []
  for (const event of targeted) {
    const rSnap = await getDoc(doc(db, 'event_responses', `${event.id}_${userId}`))
    if (!rSnap.exists()) pending.push(event)
  }
  pending.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
  return pending
}
