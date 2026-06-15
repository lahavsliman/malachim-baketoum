/**
 * One-shot fix: align a user's Auth email with their (already-updated)
 * Firestore idNumber.
 *
 * Run once:
 *   node scripts/fixUser.js
 */

import admin from 'firebase-admin'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const keyPath = resolve(__dirname, '..', 'serviceAccount.json')

if (!existsSync(keyPath)) {
  console.error('❌  serviceAccount.json לא נמצא בתיקיית הפרויקט')
  process.exit(1)
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) })
const db   = admin.firestore()
const auth = admin.auth()

const OLD_ID    = '203424742'
const NEW_ID    = '316428960'
const OLD_EMAIL = `${OLD_ID}@malachim.co.il`
const NEW_EMAIL = `${NEW_ID}@malachim.co.il`

async function run() {
  console.log(`🔧 מתקן משתמש: ${OLD_ID} → ${NEW_ID}\n`)

  // ── 1. Find Auth user by old email ────────────────────────────────────
  let authUser
  try {
    authUser = await auth.getUserByEmail(OLD_EMAIL)
    console.log(`📧 נמצא ב-Auth: uid=${authUser.uid}, email=${authUser.email}`)
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // Maybe the Auth email is already updated — check.
      try {
        authUser = await auth.getUserByEmail(NEW_EMAIL)
        console.log(`ℹ️  Auth כבר על האימייל החדש: uid=${authUser.uid}`)
      } catch {
        console.error(`❌  לא נמצא משתמש Auth עם ${OLD_EMAIL} או ${NEW_EMAIL}`)
        process.exit(1)
      }
    } else {
      throw err
    }
  }

  // ── 2. Update Auth email if needed ────────────────────────────────────
  if (authUser.email !== NEW_EMAIL) {
    await auth.updateUser(authUser.uid, { email: NEW_EMAIL })
    console.log(`✅ Auth email עודכן: ${OLD_EMAIL} → ${NEW_EMAIL}`)
  } else {
    console.log(`✓  Auth email כבר תקין — לא נדרש עדכון`)
  }

  // ── 3. Update Firestore user(s) where idNumber == OLD_ID ──────────────
  const snap = await db.collection('users').where('idNumber', '==', OLD_ID).get()
  if (snap.empty) {
    // Maybe already updated — verify by NEW_ID
    const verify = await db.collection('users').where('idNumber', '==', NEW_ID).get()
    if (!verify.empty) {
      console.log(`✓  Firestore כבר על ה-idNumber החדש (${verify.size} מסמכים)`)
    } else {
      console.log(`⚠️  לא נמצא מסמך Firestore עם idNumber=${OLD_ID} — מעדכן לפי UID`)
      await db.collection('users').doc(authUser.uid).update({ idNumber: NEW_ID })
      console.log(`✅ Firestore עודכן לפי UID ${authUser.uid}`)
    }
  } else {
    const batch = db.batch()
    snap.docs.forEach(doc => batch.update(doc.ref, { idNumber: NEW_ID }))
    await batch.commit()
    console.log(`✅ Firestore עודכן: ${snap.size} מסמך(ים) — idNumber → ${NEW_ID}`)
  }

  console.log(`\n🎉 הצלחה — המשתמש מסונכרן עם idNumber=${NEW_ID}`)
  console.log(`   כניסה חדשה: ${NEW_EMAIL}`)
  process.exit(0)
}

run().catch(err => {
  console.error('\n❌ שגיאה:', err.message)
  console.error(err)
  process.exit(1)
})
