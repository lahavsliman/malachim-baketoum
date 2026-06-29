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
