/**
 * Import Volunteers Script — מלאכים בכתום
 * Creates Firebase Auth users + Firestore documents for 60 Harish volunteers.
 *
 * Prerequisites (same as seed.js):
 *   1. npm install firebase-admin
 *   2. Place serviceAccount.json in project root
 *
 * Run:
 *   node scripts/importVolunteers.js
 */

import admin from 'firebase-admin'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const keyPath = resolve(__dirname, '..', 'serviceAccount.json')

if (!existsSync(keyPath)) {
  console.error('❌  serviceAccount.json לא נמצא בתיקיית הפרויקט!')
  console.error('  1. Firebase Console → Project Settings → Service Accounts')
  console.error('  2. לחץ "Generate new private key"')
  console.error('  3. שמור בשם serviceAccount.json בתיקייה הראשית')
  process.exit(1)
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) })
const db = admin.firestore()
const auth = admin.auth()

// ── Volunteer data ─────────────────────────────────────────────────────────
const VOLUNTEERS = [
  {firstName:"יהודה",       lastName:"אדלר",      volunteerId:"2554",  phone:"052-8980776",   idNumber:"334078409"},
  {firstName:"שמעון",       lastName:"אוחיון",     volunteerId:"2573",  phone:"052-625-2907",  idNumber:"313116121"},
  {firstName:"נריה חי",     lastName:"אוחנה",      volunteerId:"2522",  phone:"054-8975060",   idNumber:"209196492"},
  {firstName:"בנימין",      lastName:"אורן",       volunteerId:"2512",  phone:"053-2723331",   idNumber:"312560253"},
  {firstName:"ליפז",        lastName:"אטון",       volunteerId:"2587",  phone:"050-5435557",   idNumber:"318520269"},
  {firstName:"מירב",        lastName:"אליאס",      volunteerId:"2533",  phone:"050-6920994",   idNumber:"052855715"},
  {firstName:"בניה",        lastName:"אסיף",       volunteerId:"2519",  phone:"054-4322744",   idNumber:"201660586"},
  {firstName:"אריאל",       lastName:"אסרף",       volunteerId:"2516",  phone:"054-2588930",   idNumber:"039935713"},
  {firstName:"מישל",        lastName:"אפשטיין",    volunteerId:"2528",  phone:"050-9494518",   idNumber:"060427085"},
  {firstName:"נחמן",        lastName:"ארוש",       volunteerId:"2544",  phone:"054-8422812",   idNumber:"301345286"},
  {firstName:"שלום",        lastName:"בגייב",      volunteerId:"2550",  phone:"052-8504093",   idNumber:"036017762"},
  {firstName:"אמיר",        lastName:"בידני",      volunteerId:"2529",  phone:"052-8332333",   idNumber:"301632014"},
  {firstName:"שלומי",       lastName:"בן עמי",     volunteerId:"2513",  phone:"050-8312124",   idNumber:"214214645"},
  {firstName:"שלמה",        lastName:"בר דוד",     volunteerId:"2536",  phone:"050-5068938",   idNumber:"046262556"},
  {firstName:"שירה",        lastName:"בראון",      volunteerId:"2588",  phone:"058-4709651",   idNumber:"338760895"},
  {firstName:"דוד",         lastName:"ברגשטיין",   volunteerId:"11507", phone:"058-7157300",   idNumber:"026493650"},
  {firstName:"רועי",        lastName:"ברוך",       volunteerId:"2556",  phone:"050-8993991",   idNumber:"302490529"},
  {firstName:"פנחס",        lastName:"ברכה",       volunteerId:"2560",  phone:"054-333-0722",  idNumber:"032097644"},
  {firstName:"תאאר תיתו",   lastName:"גאנם",       volunteerId:"2521",  phone:"050-950-1105",  idNumber:"301477865"},
  {firstName:"ישי",         lastName:"דוד",        volunteerId:"2579",  phone:"052-6911141",   idNumber:"304989908"},
  {firstName:"עדן",         lastName:"יעקובוב",    volunteerId:"2582",  phone:"052-5148187",   idNumber:"322975046"},
  {firstName:"איאן",        lastName:"חמץ",        volunteerId:"2586",  phone:"052-7970808",   idNumber:"332650183"},
  {firstName:"איתי",        lastName:"חפץ",        volunteerId:"2513",  phone:"054-784-1934",  idNumber:"305345134"},
  {firstName:"אראלית",      lastName:"חריר",       volunteerId:"2584",  phone:"050-4505758",   idNumber:"302768668"},
  {firstName:"שמואל",       lastName:"חרירי",      volunteerId:"2548",  phone:"050-7505755",   idNumber:"201113230"},
  {firstName:"אלי",         lastName:"טייכהולץ",   volunteerId:"2515",  phone:"053-4321799",   idNumber:"302112784"},
  {firstName:"עומר",        lastName:"טל",         volunteerId:"2595",  phone:"054-4441966",   idNumber:"036976223"},
  {firstName:"תהילה",       lastName:"יהודה",      volunteerId:"2589",  phone:"053-8256842",   idNumber:"300749512"},
  {firstName:"יוסף חיים",   lastName:"יום טוב",    volunteerId:"2569",  phone:"054-3342259",   idNumber:"206478158"},
  {firstName:"נתנאל",       lastName:"יעקובי",     volunteerId:"2506",  phone:"058-720-3189",  idNumber:"039855044"},
  {firstName:"ישראל",       lastName:"יפרח",       volunteerId:"2530",  phone:"054-2600446",   idNumber:"039498316"},
  {firstName:"שמריהו",      lastName:"ירט",        volunteerId:"2534",  phone:"052-7006075",   idNumber:"302256425"},
  {firstName:"אסתר פסיה",   lastName:"ישראלי",     volunteerId:"2562",  phone:"058-6297706",   idNumber:"302923560"},
  {firstName:"יעקב",        lastName:"כהן",        volunteerId:"2547",  phone:"052-5376527",   idNumber:"035804582"},
  {firstName:"יוסף חיים",   lastName:"כהן",        volunteerId:"2565",  phone:"055-9921-835",  idNumber:"315247320"},
  {firstName:"איתמר",       lastName:"כהן",        volunteerId:"2510",  phone:"058-491-6489",  idNumber:"314739400"},
  {firstName:"הדס",         lastName:"לב ארי",     volunteerId:"2538",  phone:"050-6462332",   idNumber:"046247235"},
  {firstName:"חיים דוד",    lastName:"לוגסי",      volunteerId:"2577",  phone:"058-4329905",   idNumber:"209429000"},
  {firstName:"דניאל",       lastName:"לוי",        volunteerId:"2564",  phone:"055-9276676",   idNumber:"316114149"},
  {firstName:"גלעד",        lastName:"לוינסון",    volunteerId:"2527",  phone:"058-7994122",   idNumber:"024310294"},
  {firstName:"יהושע",       lastName:"לנגה",       volunteerId:"2539",  phone:"050-3199461",   idNumber:"032570871"},
  {firstName:"סיוון",       lastName:"ממן",        volunteerId:"2583",  phone:"053-4457007",   idNumber:"039819107"},
  {firstName:"אליעזר",      lastName:"ממן",        volunteerId:"2514",  phone:"053-8806543",   idNumber:"066054313"},
  {firstName:"בר",          lastName:"מנשורי",     volunteerId:"2526",  phone:"054-3388365",   idNumber:"300336401"},
  {firstName:"שרית",        lastName:"נפתלי",      volunteerId:"2558",  phone:"050-7308404",   idNumber:"035935113"},
  {firstName:"אברהם יהודה", lastName:"סאסאנפר",    volunteerId:"5299",  phone:"054-8540370",   idNumber:"205540347"},
  {firstName:"יוסי",        lastName:"סופר",       volunteerId:"2563",  phone:"050-2755557",   idNumber:"066051426"},
  {firstName:"להב",         lastName:"סלימן",      volunteerId:"150",   phone:"050-8121199",   idNumber:"203424742"},
  {firstName:"ניראל",       lastName:"עיאש",       volunteerId:"2507",  phone:"050-6731391",   idNumber:"203841176"},
  {firstName:"דויד",        lastName:"עידן",       volunteerId:"2592",  phone:"052-668-2424",  idNumber:"206023418"},
  {firstName:"יעקב",        lastName:"עסיס",       volunteerId:"2553",  phone:"052-6638996",   idNumber:"200532554"},
  {firstName:"שמולי",       lastName:"פרידמן",     volunteerId:"2555",  phone:"058-6100108",   idNumber:"036778959"},
  {firstName:"נתי",         lastName:"פרייטט",     volunteerId:"2559",  phone:"053-2407998",   idNumber:"205489602"},
  {firstName:"אריאל",       lastName:"פרץ",        volunteerId:"2549",  phone:"054-3446972",   idNumber:"200401347"},
  {firstName:"משה",         lastName:"קרעי",       volunteerId:"2566",  phone:"058-6004009",   idNumber:"201081288"},
  {firstName:"לוי יצחק",    lastName:"רוסלר",      volunteerId:"2524",  phone:"050-3303806",   idNumber:"040315798"},
  {firstName:"ארז",         lastName:"רופא",       volunteerId:"2567",  phone:"054-6649999",   idNumber:"032672404"},
  {firstName:"יוסף חיים",   lastName:"שמעון",      volunteerId:"2575",  phone:"054-2979509",   idNumber:"325103299"},
  {firstName:"חני",         lastName:"שרעבי",      volunteerId:"88944", phone:"058-5782153",   idNumber:"212013767"},
  {firstName:"כפיר",        lastName:"ששה",        volunteerId:"2542",  phone:"050-3138034",   idNumber:"034383000"},
]

// ── Helpers ────────────────────────────────────────────────────────────────
const pad = id => id.padStart(6, '0')
const email = idNumber => `${idNumber}@malachim.co.il`

async function getBranchId() {
  const snap = await db.collection('branches').where('city', '==', 'חריש').limit(1).get()
  if (!snap.empty) return snap.docs[0].id
  // Fallback: search by name field
  const snap2 = await db.collection('branches').where('name', '==', 'חריש').limit(1).get()
  if (!snap2.empty) return snap2.docs[0].id
  // Last resort: known id from seed
  console.warn('  ⚠️  לא נמצא סניף חריש ב-Firestore — משתמש ב-"harish"')
  return 'harish'
}

// ── Main ───────────────────────────────────────────────────────────────────
async function importVolunteers() {
  console.log('👥 מייבא מתנדבים — סניף חריש\n')

  const branchId = await getBranchId()
  console.log(`🏢 סניף: ${branchId}\n`)

  let created = 0
  let skipped = 0
  let errors  = 0
  const now = admin.firestore.FieldValue.serverTimestamp()

  for (let i = 0; i < VOLUNTEERS.length; i++) {
    const v = VOLUNTEERS[i]
    const userEmail   = email(v.idNumber)
    const password    = pad(v.volunteerId)
    const label       = `${String(i + 1).padStart(2, '0')}. ${v.firstName} ${v.lastName}`

    // ── 1. Firebase Auth ──────────────────────────────────────────────────
    let uid
    try {
      const existing = await auth.getUserByEmail(userEmail)
      uid = existing.uid
      process.stdout.write(`  ○  ${label.padEnd(30)} Auth קיים`)
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        try {
          const created_user = await auth.createUser({
            email:       userEmail,
            password:    password,
            displayName: `${v.firstName} ${v.lastName}`,
          })
          uid = created_user.uid
          process.stdout.write(`  ✅ ${label.padEnd(30)} Auth נוצר`)
        } catch (createErr) {
          console.log(`  ❌ ${label} — Auth נכשל: ${createErr.message}`)
          errors++
          continue
        }
      } else {
        console.log(`  ❌ ${label} — שגיאה: ${err.message}`)
        errors++
        continue
      }
    }

    // ── 2. Firestore document ─────────────────────────────────────────────
    const docRef = db.collection('users').doc(uid)
    const docSnap = await docRef.get()

    if (docSnap.exists) {
      console.log(`  (מסמך קיים)`)
      skipped++
      continue
    }

    await docRef.set({
      firstName:   v.firstName,
      lastName:    v.lastName,
      volunteerId: v.volunteerId,
      phone:       v.phone,
      idNumber:    v.idNumber,
      branchId:    branchId,
      role:        'volunteer',
      roleTypes:   [],
      permissions: {
        nightShifts:      true,
        shabbatVolunteer: false,
        vehicleDriver:    false,
        ambulanceDriver:  false,
      },
      isActive:  true,
      city:      'חריש',
      createdAt: now,
    })

    console.log(`  ✅ נשמר`)
    created++
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`✅ ייבוא הושלם`)
  console.log(`   נוצרו  : ${created}`)
  console.log(`   קיימים : ${skipped}`)
  if (errors) console.log(`   שגיאות : ${errors}`)
  console.log(`   סה"כ   : ${VOLUNTEERS.length}`)
  process.exit(0)
}

importVolunteers().catch(err => {
  console.error('\n❌ שגיאה:', err.message)
  process.exit(1)
})
