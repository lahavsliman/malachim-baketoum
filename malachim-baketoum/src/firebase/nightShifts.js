import {
  collection, doc, addDoc, deleteDoc, updateDoc, query,
  where, getDocs, orderBy, Timestamp, getDoc
} from 'firebase/firestore'
import { db } from './config'

export const getMonthShifts = async (branchId, year, month) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = `${year}-${String(month).padStart(2, '0')}-31`
  const q = query(
    collection(db, 'night_shifts'),
    where('branchId', '==', branchId),
    where('date', '>=', start),
    where('date', '<=', end)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const signUpForShift = async (branchId, date, volunteerId, volunteerName) => {
  const payload = {
    branchId,
    date,
    volunteerId,
    volunteerName,
    signedUpAt: Timestamp.now(),
    cancelledAt: null
  }
  console.log('[signUpForShift] writing to Firestore:', payload)
  return addDoc(collection(db, 'night_shifts'), payload)
}

export const cancelShift = async (shiftId) => {
  await deleteDoc(doc(db, 'night_shifts', shiftId))
}

export const adminAssignShift = async (branchId, date, volunteerId, volunteerName) => {
  return addDoc(collection(db, 'night_shifts'), {
    branchId,
    date,
    volunteerId,
    volunteerName,
    signedUpAt: Timestamp.now(),
    cancelledAt: null
  })
}

export const getVolunteerShiftsInWindow = async (branchId, volunteerId, startDate, endDate) => {
  const q = query(
    collection(db, 'night_shifts'),
    where('branchId', '==', branchId),
    where('volunteerId', '==', volunteerId),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
