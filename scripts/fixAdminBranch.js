/**
 * One-shot fix: set system_admin branchId to null in Firestore.
 * Run once: node scripts/fixAdminBranch.js
 */
import admin from 'firebase-admin'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const keyPath = resolve(__dirname, '..', 'serviceAccount.json')

if (!existsSync(keyPath)) {
  console.error('❌  serviceAccount.json לא נמצא')
  process.exit(1)
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) })
const db = admin.firestore()
const auth = admin.auth()

const ADMIN_EMAIL = '000000001@malachim.co.il'

async function run() {
  const user = await auth.getUserByEmail(ADMIN_EMAIL)
  await db.collection('users').doc(user.uid).update({ branchId: null })
  console.log(`✅ עודכן: ${user.uid} — branchId → null`)
  process.exit(0)
}

run().catch(err => { console.error('❌', err.message); process.exit(1) })
