import {
  collection, doc, addDoc, deleteDoc, query,
  where, getDocs, Timestamp
} from 'firebase/firestore'
import { db } from './config'

export const addTransportShift = async (branchId, data, userId, userName) => {
  return addDoc(collection(db, 'transport_shifts'), {
    ...data,
    branchId,
    createdBy: userId,
    createdByName: userName,
    createdAt: Timestamp.now(),
  })
}

export const getBranchTransportShifts = async (branchId, { type } = {}) => {
  const clauses = [where('branchId', '==', branchId)]
  if (type) clauses.push(where('type', '==', type))
  const q = query(collection(db, 'transport_shifts'), ...clauses)
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

export const getVolunteerTransportShifts = async (volunteerId) => {
  const q = query(
    collection(db, 'transport_shifts'),
    where('volunteerId', '==', volunteerId)
  )
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

export const deleteTransportShift = async (shiftId) => {
  await deleteDoc(doc(db, 'transport_shifts', shiftId))
}
