/**
 * Firestore Restore Script — מלאכים בכתום
 * Reads a backup JSON file and imports all documents back to Firestore.
 *
 * Prerequisites (same as backup.js):
 *   1. npm install firebase-admin
 *   2. Place serviceAccount.json in project root
 *
 * Run:
 *   node scripts/restore.js backups/backup-2024-01-01-12-00.json
 *
 * Flags:
 *   --dry-run    Print what would be written without actually writing
 *   --overwrite  Overwrite existing documents (default: skip if exists)
 */

import admin from 'firebase-admin'
import { readFileSync, existsSync } from 'fs'
import { createInterface } from 'readline'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const OVERWRITE = args.includes('--overwrite')
const backupFile = args.find(a => !a.startsWith('--'))

if (!backupFile) {
  console.error('❌  יש לציין קובץ גיבוי\n')
  console.error('שימוש:  node scripts/restore.js backups/backup-YYYY-MM-DD-HH-mm.json')
  console.error('אופציות: --dry-run  --overwrite')
  process.exit(1)
}

const backupPath = resolve(process.cwd(), backupFile)
if (!existsSync(backupPath)) {
  console.error(`❌  קובץ לא נמצא: ${backupPath}`)
  process.exit(1)
}

// ── Service account ────────────────────────────────────────────────────────
const keyPath = resolve(__dirname, '..', 'serviceAccount.json')
if (!existsSync(keyPath)) {
  console.error('❌  serviceAccount.json לא נמצא בתיקיית הפרויקט!\n')
  console.error('  1. Firebase Console → Project Settings → Service Accounts')
  console.error('  2. לחץ "Generate new private key"')
  console.error('  3. שמור בשם serviceAccount.json בתיקייה הראשית')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

// ── Deserializer: restores Firestore special types from JSON ───────────────
function deserialize(value) {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(deserialize)
  if (typeof value === 'object') {
    if (value.__type === 'Timestamp') {
      return new admin.firestore.Timestamp(value.seconds, value.nanoseconds)
    }
    if (value.__type === 'DocumentReference') {
      return db.doc(value.path)
    }
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = deserialize(v)
    }
    return out
  }
  return value
}

// ── Confirmation prompt ────────────────────────────────────────────────────
function askConfirmation(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

// ── Main ───────────────────────────────────────────────────────────────────
async function restore() {
  console.log(`📂 קורא קובץ גיבוי: ${backupFile}\n`)

  const raw = JSON.parse(readFileSync(backupPath, 'utf8'))
  const { meta, data } = raw

  console.log(`📋 מטא-נתונים:`)
  console.log(`   פרויקט  : ${meta.projectId}`)
  console.log(`   תאריך   : ${new Date(meta.timestamp).toLocaleString('he-IL')}`)
  console.log(`   רשומות  : ${meta.totalRecords}`)

  if (OVERWRITE && !DRY_RUN) {
    console.log('\n⚠️  מצב OVERWRITE — מסמכים קיימים יידרסו!')
    const answer = await askConfirmation('האם אתה בטוח? זה ידרוס את הנתונים הקיימים (y/n): ')
    if (answer !== 'y' && answer !== 'yes') {
      console.log('❌ שחזור בוטל.')
      process.exit(0)
    }
  }

  if (DRY_RUN) console.log('\n⚠️  מצב DRY-RUN — לא יישמרו נתונים\n')
  console.log()

  let totalWritten = 0
  let totalSkipped = 0

  for (const [collName, docs] of Object.entries(data)) {
    if (!Array.isArray(docs) || docs.length === 0) {
      console.log(`  ○  ${collName.padEnd(20)} ריק — מדולג`)
      continue
    }

    let written = 0
    let skipped = 0

    // Write in batches of 500 (Firestore limit)
    const BATCH_SIZE = 500
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE)
      if (!DRY_RUN) {
        const batch = db.batch()
        for (const doc of chunk) {
          const { __id, ...fields } = doc
          const ref = db.collection(collName).doc(__id)

          if (!OVERWRITE) {
            const existing = await ref.get()
            if (existing.exists) { skipped++; continue }
          }

          batch.set(ref, deserialize(fields), OVERWRITE ? {} : { merge: false })
          written++
        }
        await batch.commit()
      } else {
        written += chunk.length
      }
    }

    totalWritten += written
    totalSkipped += skipped
    const status = written > 0 ? '✅' : '○ '
    console.log(`  ${status} ${collName.padEnd(20)} ${written} נכתבו${skipped > 0 ? `  (${skipped} דולגו)` : ''}`)
  }

  console.log(`\n${DRY_RUN ? '🔍 סיום DRY-RUN' : '✅ שחזור הושלם'} — ${totalWritten} רשומות${totalSkipped > 0 ? `, ${totalSkipped} דולגו` : ''}`)
  process.exit(0)
}

restore().catch(err => {
  console.error('\n❌ שגיאה בשחזור:', err.message)
  process.exit(1)
})
