import {
  collection, doc, addDoc, updateDoc, deleteDoc, query,
  where, getDocs, orderBy, Timestamp, onSnapshot, limit
} from 'firebase/firestore'
import { db } from './config'

// ── Existing functions ─────────────────────────────────────────────────────

export const getShabbatShifts = async (branchId, shabbatDate) => {
  const q = query(
    collection(db, 'shabbat_shifts'),
    where('branchId', '==', branchId),
    where('shabbatDate', '==', shabbatDate)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const getVolunteerMonthShabbatShifts = async (branchId, volunteerId, month) => {
  const q = query(
    collection(db, 'shabbat_shifts'),
    where('branchId', '==', branchId),
    where('volunteerId', '==', volunteerId),
    where('shabbatDate', '>=', `${month}-01`),
    where('shabbatDate', '<=', `${month}-31`)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const submitShabbatAvailability = async (branchId, shabbatDate, volunteerId, volunteerName, area) => {
  const q = query(
    collection(db, 'shabbat_shifts'),
    where('branchId', '==', branchId),
    where('shabbatDate', '==', shabbatDate),
    where('volunteerId', '==', volunteerId)
  )
  const snap = await getDocs(q)
  if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, {
      volunteerName, area,
      status: 'available',
      submittedAt: Timestamp.now(),
      confirmedAt: null,
      confirmedBy: null,
    })
    return
  }
  return addDoc(collection(db, 'shabbat_shifts'), {
    branchId,
    shabbatDate,
    volunteerId,
    volunteerName,
    area,
    status: 'available',
    submittedAt: Timestamp.now(),
    confirmedAt: null,
    confirmedBy: null,
    published: false,
  })
}

export const updateShabbatShiftStatus = async (shiftId, status, confirmedBy = null) => {
  const update = { status }
  if (status === 'confirmed') {
    update.confirmedAt = Timestamp.now()
    update.confirmedBy = confirmedBy
  }
  await updateDoc(doc(db, 'shabbat_shifts', shiftId), update)
}

// ── New functions ──────────────────────────────────────────────────────────

// Real-time listener for a shabbat's availability list
export const subscribeShabbatAvailability = (branchId, shabbatDate, callback) => {
  const q = query(
    collection(db, 'shabbat_shifts'),
    where('branchId', '==', branchId),
    where('shabbatDate', '==', shabbatDate)
  )
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  )
}

// Submit availability (alias with cleaner name)
export const submitAvailability = submitShabbatAvailability

// Submit "not available" — records explicit unavailability
export const submitUnavailability = async (branchId, shabbatDate, volunteerId, volunteerName, area) => {
  const q = query(
    collection(db, 'shabbat_shifts'),
    where('branchId', '==', branchId),
    where('shabbatDate', '==', shabbatDate),
    where('volunteerId', '==', volunteerId)
  )
  const snap = await getDocs(q)
  if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, {
      volunteerName, area,
      status: 'not_available',
      submittedAt: Timestamp.now(),
      confirmedAt: null,
      confirmedBy: null,
    })
    return
  }
  return addDoc(collection(db, 'shabbat_shifts'), {
    branchId,
    shabbatDate,
    volunteerId,
    volunteerName,
    area,
    status: 'not_available',
    submittedAt: Timestamp.now(),
    confirmedAt: null,
    confirmedBy: null,
    published: false,
  })
}

// Delete a shift record (used when volunteer changes their mind)
export const deleteShabbatShift = async (shiftId) => {
  await deleteDoc(doc(db, 'shabbat_shifts', shiftId))
}

// Volunteer: update own existing shift to a new status (used for "change my mind"
// without delete+recreate, so we never lose the record if the second write fails).
export const setVolunteerShiftStatus = async (shiftId, status) => {
  await updateDoc(doc(db, 'shabbat_shifts', shiftId), {
    status,
    submittedAt: Timestamp.now(),
    confirmedAt: null,
    confirmedBy: null,
  })
}

// Coordinator: confirm a volunteer
export const confirmVolunteer = async (shiftId, confirmedBy) => {
  await updateDoc(doc(db, 'shabbat_shifts', shiftId), {
    status: 'confirmed',
    confirmedAt: Timestamp.now(),
    confirmedBy,
  })
}

// Coordinator: reject a volunteer
export const rejectVolunteer = async (shiftId, rejectedBy) => {
  await updateDoc(doc(db, 'shabbat_shifts', shiftId), {
    status: 'cancelled',
    rejectedAt: Timestamp.now(),
    rejectedBy,
  })
}

// Publish final schedule: confirm selected IDs, cancel remaining 'available' shifts, lock all
export const publishSchedule = async (branchId, shabbatDate, confirmedShiftIds) => {
  const q = query(
    collection(db, 'shabbat_shifts'),
    where('branchId', '==', branchId),
    where('shabbatDate', '==', shabbatDate)
  )
  const snap = await getDocs(q)
  await Promise.all(
    snap.docs.map(d => {
      const s = d.data()
      const isConfirmed = confirmedShiftIds.includes(d.id)
      if (s.status === 'available') {
        return updateDoc(d.ref, {
          status: isConfirmed ? 'confirmed' : 'cancelled',
          published: true,
          ...(isConfirmed ? { confirmedAt: Timestamp.now() } : {}),
        })
      }
      // confirmed or not_available: just mark published
      return updateDoc(d.ref, { published: true })
    })
  )
}

// All branch shifts for a month — used for per-volunteer fairness counts
export const getBranchMonthShabbatShifts = async (branchId, monthStr) => {
  const q = query(
    collection(db, 'shabbat_shifts'),
    where('branchId', '==', branchId),
    where('shabbatDate', '>=', `${monthStr}-01`),
    where('shabbatDate', '<=', `${monthStr}-31`)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// Volunteer's personal shabbat history (most recent first)
export const getVolunteerShabbatHistory = async (volunteerId, branchId, limitCount = 10) => {
  const q = query(
    collection(db, 'shabbat_shifts'),
    where('branchId', '==', branchId),
    where('volunteerId', '==', volunteerId),
    orderBy('shabbatDate', 'desc'),
    limit(limitCount)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// Unique past shabbat dates for history tab
export const getShabbatHistory = async (branchId) => {
  const today = new Date().toISOString().slice(0, 10)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const from = sixMonthsAgo.toISOString().slice(0, 10)

  const q = query(
    collection(db, 'shabbat_shifts'),
    where('branchId', '==', branchId),
    where('shabbatDate', '>=', from),
    where('shabbatDate', '<', today),
    orderBy('shabbatDate', 'desc')
  )
  const snap = await getDocs(q)
  const seen = new Set()
  snap.docs.forEach(d => seen.add(d.data().shabbatDate))
  return [...seen].sort((a, b) => b.localeCompare(a)).slice(0, 12)
}

// Coordinator: manually add and immediately confirm any volunteer for an area.
// If the volunteer already has a shift record for this shabbat, updates it in-place
// to avoid duplicate documents. Otherwise creates a new confirmed shift.
export const adminAddConfirmedVolunteer = async (branchId, shabbatDate, volunteerId, volunteerName, area, confirmedBy) => {
  const q = query(
    collection(db, 'shabbat_shifts'),
    where('branchId', '==', branchId),
    where('shabbatDate', '==', shabbatDate),
    where('volunteerId', '==', volunteerId)
  )
  const snap = await getDocs(q)
  if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, {
      area,
      status: 'confirmed',
      confirmedAt: Timestamp.now(),
      confirmedBy,
    })
    return
  }
  await addDoc(collection(db, 'shabbat_shifts'), {
    branchId, shabbatDate, volunteerId, volunteerName, area,
    status: 'confirmed',
    submittedAt: Timestamp.now(),
    confirmedAt: Timestamp.now(),
    confirmedBy,
    published: false,
  })
}
