import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../firebase/config'
import { getUserById } from '../firebase/users'
import { getBranch } from '../firebase/branches'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)       // Firestore user doc
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser)
      if (fbUser) {
        setLoading(true)   // keep spinner up while fetching Firestore doc
        const userData = await getUserById(fbUser.uid)

        // ── Activation gate (safety net for restored sessions) ──────────
        // If the user was deactivated, or their branch was deactivated,
        // after they last signed in, kick them out. system_admin bypasses.
        if (userData && userData.role !== 'system_admin') {
          let blocked = userData.isActive === false
          if (!blocked && userData.branchId) {
            const branch = await getBranch(userData.branchId).catch(() => null)
            if (branch && branch.isActive === false) blocked = true
          }
          if (blocked) {
            await signOut(auth)
            // onAuthStateChanged fires again with null; that pass clears state.
            return
          }
        }

        setUser(userData)
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const refreshUser = async () => {
    if (firebaseUser) {
      const userData = await getUserById(firebaseUser.uid)
      setUser(userData)
    }
  }

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
