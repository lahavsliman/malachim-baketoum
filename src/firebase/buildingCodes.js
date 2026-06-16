import {
  collection, doc, addDoc, getDoc, updateDoc, deleteDoc, query,
  where, getDocs, orderBy, Timestamp
} from 'firebase/firestore'
import { db } from './config'

const TRACKED = ['city', 'street', 'buildingNumber', 'entrance', 'code', 'notes']

// ── Existing (kept for backwards compatibility) ────────────────────────────

export const searchBuildingCodes = async (branchId, { city, street, buildingNumber } = {}) => {
  const q = query(collection(db, 'building_codes'), where('branchId', '==', branchId))
  const snap = await getDocs(q)
  let results = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  if (city) results = results.filter(r => r.city?.includes(city))
  if (street) results = results.filter(r => r.street?.includes(street))
  if (buildingNumber) results = results.filter(r => r.buildingNumber === buildingNumber)
  return results
}

export const addBuildingCode = async (data, createdBy) => {
  return addDoc(collection(db, 'building_codes'), {
    ...data,
    createdBy,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  })
}

export const updateBuildingCode = async (codeId, data) => {
  await updateDoc(doc(db, 'building_codes', codeId), {
    ...data,
    updatedAt: Timestamp.now()
  })
}

export const deleteBuildingCode = async (codeId) => {
  await deleteDoc(doc(db, 'building_codes', codeId))
}

// ── New functions ──────────────────────────────────────────────────────────

// Real-time street search (client-side filter on full branch dataset)
export const searchCodes = async (branchId, streetQuery) => {
  if (!streetQuery || streetQuery.length < 2) return []
  // No orderBy — combining where() + orderBy() on different fields requires a
  // composite index. Sort client-side instead (same pattern as getBranchUsersAll).
  const q = query(
    collection(db, 'building_codes'),
    where('branchId', '==', branchId)
  )
  console.log('[searchCodes] fetching branchId:', branchId, 'query:', streetQuery)
  const snap = await getDocs(q)
  console.log('[searchCodes] got', snap.size, 'docs')
  // Split on whitespace so "תאנה 22" matches street + building number simultaneously
  const parts = streetQuery.trim().toLowerCase().split(/\s+/)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c =>
      parts.every(p =>
        c.street?.toLowerCase().includes(p) ||
        c.city?.toLowerCase().includes(p) ||
        String(c.buildingNumber || '').includes(p)
      )
    )
    .sort((a, b) => (a.street || '').localeCompare(b.street || '', 'he'))
}

// Check whether an address already exists in a branch
export const findCodeByAddress = async (branchId, { city, street, buildingNumber, entrance }) => {
  const q = query(
    collection(db, 'building_codes'),
    where('branchId', '==', branchId)
  )
  const snap = await getDocs(q)
  const norm = (v) => String(v ?? '').trim().toLowerCase()
  const match = snap.docs.find(d => {
    const c = d.data()
    return norm(c.city) === norm(city) &&
           norm(c.street) === norm(street) &&
           norm(c.buildingNumber) === norm(buildingNumber) &&
           norm(c.entrance) === norm(entrance)
  })
  return match ? { id: match.id, ...match.data() } : null
}

// Add with audit trail
export const addCode = async (branchId, codeData, userId, userName) => {
  const dup = await findCodeByAddress(branchId, codeData)
  if (dup) {
    throw new Error('כתובת זו כבר קיימת במערכת')
  }
  console.log('[addCode] writing to building_codes, branchId:', branchId, 'data:', codeData)
  return addDoc(collection(db, 'building_codes'), {
    ...codeData,
    branchId,
    createdBy: userId,
    createdByName: userName,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    updatedBy: userId,
    updatedByName: userName,
    changeLog: [],
  })
}

// Update with per-field change log
export const updateCode = async (codeId, oldData, newData, userId, userName) => {
  const logEntries = TRACKED
    .filter(f => String(newData[f] ?? '') !== String(oldData[f] ?? ''))
    .map(f => ({
      changedAt: Timestamp.now(),
      changedBy: userId,
      changedByName: userName,
      field: f,
      oldValue: String(oldData[f] ?? ''),
      newValue: String(newData[f] ?? ''),
    }))

  const docRef = doc(db, 'building_codes', codeId)
  const snap = await getDoc(docRef)
  const existing = snap.exists() ? snap.data() : {}
  const changeLog = [...(existing.changeLog || []), ...logEntries]

  await updateDoc(docRef, {
    ...newData,
    updatedAt: Timestamp.now(),
    updatedBy: userId,
    updatedByName: userName,
    changeLog,
  })
}

// Hard delete
export const deleteCode = deleteBuildingCode

// All branch codes — no orderBy to avoid requiring a composite index; sort client-side
export const getAllBranchCodes = async (branchId) => {
  const q = query(
    collection(db, 'building_codes'),
    where('branchId', '==', branchId)
  )
  console.log('[getAllBranchCodes] fetching branchId:', branchId)
  const snap = await getDocs(q)
  console.log('[getAllBranchCodes] got', snap.size, 'docs')
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.street || '').localeCompare(b.street || '', 'he'))
}

// Batch import — returns per-row results
export const importCodes = async (branchId, codesArray, userId, userName) => {
  const results = []
  for (const row of codesArray) {
    try {
      await addCode(branchId, row, userId, userName)
      results.push({ ok: true, msg: 'יובא בהצלחה' })
    } catch (err) {
      results.push({ ok: false, msg: err.message || 'שגיאה' })
    }
  }
  return results
}
