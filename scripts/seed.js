/**
 * Seed script: creates branch "חריש" + demo users
 * Run: node scripts/seed.js
 *
 * Prerequisites:
 * 1. npm install firebase-admin
 * 2. Download service account key from Firebase console → Project Settings → Service Accounts
 * 3. Set GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json
 */

import admin from 'firebase-admin'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const keyPath = resolve(__dirname, '..', 'serviceAccount.json')

if (!existsSync(keyPath)) {
  console.error('❌ serviceAccount.json not found in project root!')
  console.error('\nTo get it:')
  console.error('  1. Go to Firebase Console → Project Settings → Service Accounts')
  console.error('  2. Click "Generate new private key"')
  console.error('  3. Save the file as serviceAccount.json in the project root')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()
const authAdmin = admin.auth()

const BRANCH_ID = 'harish'

// Branch settings — new in this update
const BRANCH_SETTINGS = {
  nightShift: {
    startTime: '00:00',
    endTime: '06:00',
    maxVolunteersPerNight: 1,
    blockFriday: false,
    maxShiftsPerMonth: 3,
    registrationOpensOnDay: 20,
  },
  shabbat: {
    maxShiftsPerMonth: 2,
    closingDay: 'thursday',
    closingTime: '20:00',
    areas: [
      { id: '1', name: 'צוות אבני חן',       requiredVolunteers: 1 },
      { id: '2', name: 'צוות מזרח העיר',     requiredVolunteers: 1 },
      { id: '3', name: 'צוות החורש',          requiredVolunteers: 2 },
      { id: '4', name: 'צוות צפון השומרון',   requiredVolunteers: 1 },
      { id: '5', name: 'צוות מנשה',           requiredVolunteers: 1 },
    ],
  },
  allowedCities: ['חריש'],
}

// Users — now include permissions object, roleTypes array, city
const USERS = [
  {
    firstName: 'להב',
    lastName: 'מערכת',
    idNumber: '313116691',
    volunteerId: '100',
    phone: '050-0000001',
    role: 'system_admin',
    roleTypes: [],
    branchId: null,
    // legacy flat fields (keep for backward compat with existing UI)
    nightShifts: false,
    shabbatVolunteer: false,
    // new permissions object
    permissions: {
      nightShifts: false,
      shabbatVolunteer: false,
      vehicleDriver: false,
      ambulanceDriver: false,
    },
  },
  {
    firstName: 'ראש',
    lastName: 'סניף',
    idNumber: '000000002',
    volunteerId: 'head123',
    phone: '050-0000002',
    city: 'חריש',
    role: 'branch_head',
    roleTypes: [],
    branchId: BRANCH_ID,
    nightShifts: true,
    shabbatVolunteer: false,
    permissions: {
      nightShifts: true,
      shabbatVolunteer: false,
      vehicleDriver: false,
      ambulanceDriver: false,
    },
  },
  {
    firstName: 'מוקדן',
    lastName: 'ראשי',
    idNumber: '000000003',
    volunteerId: 'disp123',
    phone: '050-0000003',
    city: 'חריש',
    role: 'role_holder',
    roleType: 'dispatcher',            // legacy
    roleTypes: ['dispatcher'],
    branchId: BRANCH_ID,
    nightShifts: false,
    shabbatVolunteer: false,
    permissions: {
      nightShifts: false,
      shabbatVolunteer: false,
      vehicleDriver: false,
      ambulanceDriver: false,
    },
  },
  {
    firstName: 'ישראל',
    lastName: 'ישראלי',
    idNumber: '000000004',
    volunteerId: 'vol1123',
    phone: '050-0000004',
    city: 'חריש',
    role: 'volunteer',
    roleTypes: [],
    branchId: BRANCH_ID,
    nightShifts: true,
    shabbatVolunteer: true,
    shabbatArea: 'צוות החורש',
    permissions: {
      nightShifts: true,
      shabbatVolunteer: true,
      vehicleDriver: false,
      ambulanceDriver: false,
    },
  },
  {
    firstName: 'שרה',
    lastName: 'כהן',
    idNumber: '000000005',
    volunteerId: 'vol2123',
    phone: '050-0000005',
    city: 'חריש',
    role: 'volunteer',
    roleTypes: [],
    branchId: BRANCH_ID,
    nightShifts: true,
    shabbatVolunteer: true,
    shabbatArea: 'צוות אבני חן',
    permissions: {
      nightShifts: true,
      shabbatVolunteer: true,
      vehicleDriver: false,
      ambulanceDriver: false,
    },
  },
  {
    firstName: 'דוד',
    lastName: 'לוי',
    idNumber: '000000006',
    volunteerId: 'vol3123',
    phone: '050-0000006',
    city: 'חריש',
    role: 'volunteer',
    roleTypes: [],
    branchId: BRANCH_ID,
    nightShifts: true,
    shabbatVolunteer: false,
    permissions: {
      nightShifts: true,
      shabbatVolunteer: false,
      vehicleDriver: false,
      ambulanceDriver: false,
    },
  },
]

// Resolve Firebase Auth UID for an email — create if not exists, reuse if already exists
async function resolveUid(email, password, displayName) {
  try {
    const record = await authAdmin.createUser({ email, password, displayName })
    return { uid: record.uid, created: true }
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      const record = await authAdmin.getUserByEmail(email)
      return { uid: record.uid, created: false }
    }
    throw err
  }
}

async function seed() {
  console.log('🌱 Starting seed (upsert mode)...\n')

  // ── Branch ──────────────────────────────────────────────────────────────────
  await db.collection('branches').doc(BRANCH_ID).set(
    {
      id: BRANCH_ID,
      name: 'חריש',
      city: 'חריש',
      isActive: true,
      settings: BRANCH_SETTINGS,
      createdAt: admin.firestore.Timestamp.now(),
    },
    { merge: true }   // preserve any fields already in Firestore
  )
  console.log('✅ Branch "חריש" upserted with settings')

  // ── Users ────────────────────────────────────────────────────────────────────
  for (const user of USERS) {
    const email = `${user.idNumber}@malachim.co.il`
    try {
      const { uid, created } = await resolveUid(
        email,
        user.volunteerId.padStart(6, '0'),
        `${user.firstName} ${user.lastName}`
      )

      // set with merge so existing fields (e.g. createdAt) are preserved
      await db.collection('users').doc(uid).set(
        { ...user, isActive: true },
        { merge: true }
      )

      const action = created ? '✅ Created' : '🔄 Updated'
      console.log(`${action}: ${user.firstName} ${user.lastName} (${user.role})`)
    } catch (err) {
      console.error(`❌ Failed for ${user.idNumber}:`, err.message)
    }
  }

  console.log('\n🎉 Seed complete!')
  console.log('\nLogin credentials:')
  USERS.forEach(u => {
    console.log(`  ${u.firstName} ${u.lastName} — ת.ז.: ${u.idNumber} | קוד: ${u.volunteerId}`)
  })
  process.exit(0)
}

seed().catch(err => {
  console.error(err)
  process.exit(1)
})
