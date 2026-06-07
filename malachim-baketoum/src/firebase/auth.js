import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from './config'
import { getUserById } from './users'
import { getBranch } from './branches'

export const idToEmail = (idNumber) => `${idNumber}@malachim.co.il`

/**
 * Thrown when login succeeded at Firebase Auth level but the user is blocked
 * (deactivated user, or deactivated branch). Carries a specific `.code`
 * the LoginPage can use to render a Hebrew message.
 */
export class LoginBlockedError extends Error {
  constructor(code, message) {
    super(message)
    this.code  = code
    this.name  = 'LoginBlockedError'
  }
}

/**
 * Login + branch/user activation gate.
 *
 * After auth succeeds we fetch the user doc and (if applicable) the branch
 * doc, and reject the login if either is inactive. system_admin bypasses
 * the gate entirely.
 *
 * On rejection we sign the user out so the local Auth session does not
 * persist — the LoginPage's catch handles the error message.
 */
export const loginUser = async (idNumber, volunteerId) => {
  const email = idToEmail(idNumber)
  const cred  = await signInWithEmailAndPassword(auth, email, volunteerId)

  // ── Activation gate ───────────────────────────────────────────────────
  let userDoc = null
  try {
    userDoc = await getUserById(cred.user.uid)
  } catch {
    // Reading the user doc failed (security rules / network). Don't block
    // for that — AuthContext will retry. Better UX than locking everyone out.
    return cred
  }

  // system_admin always passes
  if (userDoc?.role === 'system_admin') return cred

  // User explicitly deactivated
  if (userDoc?.isActive === false) {
    await signOut(auth)
    throw new LoginBlockedError(
      'auth/user-inactive',
      'החשבון שלך אינו פעיל. פנה למנהל המערכת.'
    )
  }

  // Branch deactivated
  if (userDoc?.branchId) {
    const branch = await getBranch(userDoc.branchId).catch(() => null)
    if (branch && branch.isActive === false) {
      await signOut(auth)
      throw new LoginBlockedError(
        'auth/branch-inactive',
        'הסניף שלך אינו פעיל. פנה למנהל המערכת.'
      )
    }
  }

  return cred
}

export const logoutUser = () => signOut(auth)
