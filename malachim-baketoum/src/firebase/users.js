import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { signInWithEmailAndPassword, updateEmail, signOut } from 'firebase/auth'
import { db, secondaryAuth } from './config'

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
 * Change a user's idNumber. Updates BOTH Firestore (idNumber field) and
 * Firebase Auth (login email derived from idNumber).
 *
 * We sign in as the user on the secondary Auth instance — that lets us call
 * updateEmail without disturbing the current admin's session, and satisfies
 * Firebase's "recent login" requirement for sensitive operations.
 *
 * Throws on:
 *   - auth/email-already-in-use   (new idNumber collides)
 *   - auth/wrong-password         (stored volunteerId no longer matches)
 *   - auth/requires-recent-login  (rare — should never happen with fresh sign-in)
 */
export const changeUserIdNumber = async (uid, oldIdNumber, newIdNumber, volunteerId) => {
  if (!oldIdNumber || !newIdNumber || oldIdNumber === newIdNumber) return
  if (!volunteerId) throw new Error('חסר קוד כונן — לא ניתן לעדכן ת.ז.')

  const oldEmail = idToEmail(oldIdNumber)
  const newEmail = idToEmail(newIdNumber)
  const password = String(volunteerId).padStart(6, '0')

  // 1. Sign in as the user on the secondary Auth instance
  await signInWithEmailAndPassword(secondaryAuth, oldEmail, password)
  try {
    // 2. Update the Auth email
    await updateEmail(secondaryAuth.currentUser, newEmail)
  } finally {
    // 3. Always sign out the secondary session, even on failure
    await signOut(secondaryAuth).catch(() => {})
  }

  // 4. Mirror the change in Firestore
  await updateDoc(doc(db, 'users', uid), { idNumber: newIdNumber })
}
