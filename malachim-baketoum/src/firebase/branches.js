import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore'
import { db } from './config'

export const getBranch = async (branchId) => {
  const snap = await getDoc(doc(db, 'branches', branchId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export const getAllBranches = async () => {
  const snap = await getDocs(collection(db, 'branches'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const getBranchSettings = async (branchId) => {
  const snap = await getDoc(doc(db, 'branches', branchId))
  return snap.exists() ? snap.data().settings ?? null : null
}

export const updateBranchSettings = async (branchId, settings) => {
  await updateDoc(doc(db, 'branches', branchId), { settings })
}

export const updateShabbatAreas = async (branchId, areas) => {
  await updateDoc(doc(db, 'branches', branchId), {
    'settings.shabbat.areas': areas,
  })
}
