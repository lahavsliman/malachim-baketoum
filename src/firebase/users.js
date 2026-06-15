import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db } from './config'
import app from './config'

// Inline copy of idToEmail to avoid circular import (auth.js depends on users.js).
const idToEmail = (idNumber) => `${idNumber}@malachim.co.il`

// ── New: permissions & roleTypes helpers ──────────────────────────────────────

export const updateUserPermissions = async (userId, permissions) => {
  await updateDoc(doc(db, 'users', userId), { permissions })
}

export const updateUserRoleTypes = async (userId, roleTypes) => {
  await updateDoc(doc(db, 'users', userId), { roleTypes })
}

/**
 * Returns active users in a branch who have a specific permission set to true.
 * permission must be a key of the permissions object, e.g. 'nightShifts'.
 */
export const getUsersByPermission = async (branchId, permission) => {
  const q = query(
    collection(db, 'users'),
    where('branchId', '==', branchId),
    where('isActive', '==', true),
    where(`permissions.${permission}`, '==', true)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const getUserById = async (uid) => {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export const getUserByIdNumber = async (idNumber) => {
  const q = query(collection(db, 'users'), where('idNumber', '==', idNumber))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}

export const getUserByVolunteerId = async (volunteerId) => {
  const q = query(collection(db, 'users'), where('volunteerId', '==', volunteerId))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}

export const getBranchUsers = async (branchId) => {
  const q = query(
    collection(db, 'users'),
    where('branchId', '==', branchId),
    where('isActive', '==', true),
    orderBy('firstName')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const getBranchUsersAll = async (branchId) => {
  // No orderBy here — combining where() + orderBy() on different fields requires
  // a composite index that isn't needed elsewhere. Sort client-side instead.
  const q = query(
    collection(db, 'users'),
    where('branchId', '==', branchId)
  )
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.firstName || '').localeCompare(b.firstName || '', 'he'))
}

export const getAllUsers = async () => {
  const q = query(collection(db, 'users'), orderBy('firstName'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const createUser = async (uid, data) => {
  await setDoc(doc(db, 'users', uid), { ...data, createdAt: new Date(), isActive: true })
}

export const updateUser = async (uid, data) => {
  await updateDoc(doc(db, 'users', uid), data)
}

// Hard-deletes the Firestore user document. The Firebase Auth account is left
// intact but the user will be immediately logged out on next session load since
// getUserById returns null → AuthContext redirects to /login.
export const deleteUserDoc = async (uid) => {
  await deleteDoc(doc(db, 'users', uid))
}

/**
 * Change a user's idNumber in Firestore only.
 * Kept for backward-compatibility — use callUpdateUserEmail + updateUser instead
 * when you also need to sync Firebase Auth.
 */
export const changeUserIdNumber = async (uid, oldIdNumber, newIdNumber) => {
  if (!oldIdNumber || !newIdNumber || oldIdNumber === newIdNumber) return
  await updateDoc(doc(db, 'users', uid), { idNumber: newIdNumber })
}

/**
 * Call the updateUserEmail Cloud Function to update the volunteer's
 * Firebase Auth email to newIdNumber@malachim.co.il.
 * Requires the caller to be branch_head, branch_deputy, or system_admin.
 */
export const callUpdateUserEmail = async (uid, newIdNumber) => {
  const fns = getFunctions(app)
  const updateUserEmail = httpsCallable(fns, 'updateUserEmail')
  await updateUserEmail({ uid, newIdNumber })
}

export const callUpdateUserPassword = async (uid, newVolunteerId) => {
  const fns = getFunctions(app)
  const updateUserPassword = httpsCallable(fns, 'updateUserPassword')
  await updateUserPassword({ uid, newVolunteerId })
}
