/**
 * Load Israeli Cities — מלאכים בכתום
 * Fetches the full list of Israeli cities from data.gov.il and writes them
 * to Firestore under the `cities` collection.
 *
 * Prerequisites (same as seed.js):
 *   1. npm install firebase-admin
 *   2. Place serviceAccount.json in project root
 *
 * Run:
 *   node scripts/loadCities.js
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
const db = admin.firestore()

const URL = 'https://data.gov.il/api/3/action/datastore_search?resource_id=5c78e9fa-c2e2-4771-93ff-7f400a12f7ba&limit=2000'

async function run() {
  console.log('🌍 שולף רשימת ערים מ-data.gov.il...\n')

  const res = await fetch(URL)
  if (!res.ok) {
    console.error(`❌  שגיאה בשליפה: HTTP ${res.status}`)
    process.exit(1)
  }
  const json = await res.json()
  const records = json?.result?.records || []

  // Normalize city names — trim and dedupe
  const seen = new Set()
  const cities = []
  for (const r of records) {
    const raw = r['שם_ישוב'] ?? r['שם ישוב'] ?? ''
    const name = String(raw).trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    cities.push(name)
  }

  cities.sort((a, b) => a.localeCompare(b, 'he'))
  console.log(`📋 נמצאו ${cities.length} ערים ייחודיות`)

  // Write in batches of 500 (Firestore limit)
  const now = admin.firestore.FieldValue.serverTimestamp()
  const BATCH = 500
  let written = 0

  for (let i = 0; i < cities.length; i += BATCH) {
    const chunk = cities.slice(i, i + BATCH)
    const batch = db.batch()
    for (const name of chunk) {
      // Use sanitized name as deterministic doc id — re-running is idempotent
      const id = name.replace(/[\/\\.#\$\[\]]/g, '_')
      batch.set(db.collection('cities').doc(id), { name, createdAt: now }, { merge: true })
    }
    await batch.commit()
    written += chunk.length
    process.stdout.write(`\r  ✏️  ${written}/${cities.length}`)
  }

  console.log(`\n\n✅ נטענו ${written} ערים`)
  process.exit(0)
}

run().catch(err => {
  console.error('\n❌ שגיאה:', err.message)
  process.exit(1)
})
