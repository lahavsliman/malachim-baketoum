/**
 * Firestore Backup Script — מלאכים בכתום
 * Exports all collections to a timestamped JSON file.
 *
 * Prerequisites (same as seed.js):
 *   1. npm install firebase-admin
 *   2. Place serviceAccount.json in project root
 *      (Firebase console → Project Settings → Service Accounts → Generate new private key)
 *
 * Run:
 *   node scripts/backup.js
 */

import admin from 'firebase-admin'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Service account ────────────────────────────────────────────────────────
const keyPath = resolve(__dirname, '..', 'serviceAccount.json')

if (!existsSync(keyPath)) {
  console.error('❌  serviceAccount.json לא נמצא בתיקיית הפרויקט!\n')
  console.error('כיצד להוריד:')
  console.error('  1. Firebase Console → Project Settings → Service Accounts')
  console.error('  2. לחץ "Generate new private key"')
  console.error('  3. שמור את הקובץ בשם serviceAccount.json בתיקייה הראשית')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

// ── Collections to back up ─────────────────────────────────────────────────
const COLLECTIONS = [
  'branches',
  'users',
  'night_shifts',
  'shabbat_shifts',
  'building_codes',
  'notifications',
  'branch_messages',
  'events',
  'event_responses',
  'lottery_results',
]

// ── Serializer: converts Firestore special types to plain JSON ─────────────
function isTimestamp(val) {
  return (
    val !== null &&
    typeof val === 'object' &&
    typeof val.seconds === 'number' &&
    typeof val.nanoseconds === 'number' &&
    typeof val.toDate === 'function'
  )
}

function isDocRef(val) {
  return val !== null && typeof val === 'object' && typeof val.path === 'string' && val.firestore
}

function serialize(value) {
  if (value === null || value === undefined) return value
  if (isTimestamp(value)) {
    return { __type: 'Timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds }
  }
  if (isDocRef(value)) {
    return { __type: 'DocumentReference', path: value.path }
  }
  if (Array.isArray(value)) {
    return value.map(serialize)
  }
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = serialize(v)
    }
    return out
  }
  return value
}

// ── Main ───────────────────────────────────────────────────────────────────
async function backup() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`
  const filename = `backup-${stamp}.json`

  const backupsDir = resolve(__dirname, '..', 'backups')
  mkdirSync(backupsDir, { recursive: true })

  console.log('📦 מתחיל גיבוי Firestore...\n')

  const collectionData = {}
  let totalRecords = 0

  for (const collName of COLLECTIONS) {
    try {
      const snap = await db.collection(collName).get()
      collectionData[collName] = snap.docs.map(doc => ({
        __id: doc.id,
        ...serialize(doc.data()),
      }))
      totalRecords += snap.docs.length
      const count = snap.docs.length
      const bar = count > 0 ? '●'.repeat(Math.min(count, 20)) : '○'
      console.log(`  ${count > 0 ? '✅' : '○ '} ${collName.padEnd(20)} ${count} רשומות  ${bar}`)
    } catch (err) {
      console.warn(`  ⚠️  ${collName}: לא ניתן לגבות — ${err.message}`)
      collectionData[collName] = []
    }
  }

  const output = {
    meta: {
      timestamp: now.toISOString(),
      version: '1.0',
      projectId: serviceAccount.project_id || 'unknown',
      collections: COLLECTIONS,
      totalRecords,
      backupFile: filename,
    },
    data: collectionData,
  }

  const outPath = resolve(backupsDir, filename)
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8')

  const sizeKB = Math.round(readFileSync(outPath).length / 1024)

  console.log(`\n✅ גיבוי הושלם — ${totalRecords} רשומות נשמרו`)
  console.log(`📁 קובץ: backups/${filename}  (${sizeKB} KB)`)
  console.log(`🕒 תאריך: ${now.toLocaleString('he-IL')}`)

  process.exit(0)
}

backup().catch(err => {
  console.error('\n❌ שגיאה בגיבוי:', err.message)
  process.exit(1)
})
