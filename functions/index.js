const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { getAuth } = require('firebase-admin/auth')

initializeApp()
const db = getFirestore()

// Returns YYYY-MM-DD for the current date in Israel timezone, with an optional day offset.
const israelDateStr = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('sv', { timeZone: 'Asia/Jerusalem' }).format(d)
}

/**
 * Query night_shifts for a given date, look up each volunteer's FCM token,
 * and send a push notification.
 */
async function sendNightShiftReminders(dateStr, title, body) {
  const snap = await db.collection('night_shifts').where('date', '==', dateStr).get()

  const sends = snap.docs.map(async (shiftDoc) => {
    const { volunteerId } = shiftDoc.data()
    if (!volunteerId) return

    const userSnap = await db.collection('users').doc(volunteerId).get()
    if (!userSnap.exists) return

    const { fcmToken } = userSnap.data()
    if (!fcmToken) return

    try {
      await getMessaging().send({
        token: fcmToken,
        data: { title, body: body.replace('{date}', dateStr) },
        webpush: { headers: { Urgency: 'high' } },
      })
    } catch (err) {
      // Token may be stale — log and continue
      console.error(`[FCM] Failed for volunteer ${volunteerId}:`, err.message)
    }
  })

  await Promise.all(sends)
  console.log(`[nightShiftReminder] Sent reminders for ${dateStr} (${snap.size} shifts)`)
}

// ── updateUserEmail — update Firebase Auth email when ID number changes ────────
// Callable by branch_head, branch_deputy, or system_admin only.
exports.updateUserEmail = onCall({ cors: true }, async (request) => {
  // 1. Must be authenticated
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required')
  }

  // 2. Caller must be a privileged role
  const callerSnap = await db.collection('users').doc(request.auth.uid).get()
  if (!callerSnap.exists) {
    throw new HttpsError('permission-denied', 'Caller not found')
  }
  const callerRole = callerSnap.data().role
  const ALLOWED = ['system_admin', 'branch_head', 'branch_deputy']
  if (!ALLOWED.includes(callerRole)) {
    throw new HttpsError('permission-denied', 'Insufficient permissions')
  }

  // 3. Validate input
  const { uid, newIdNumber } = request.data
  if (!uid || !newIdNumber) {
    throw new HttpsError('invalid-argument', 'uid and newIdNumber are required')
  }

  // 4. Update the target user's Auth email using Admin SDK (bypasses email enumeration protection)
  const newEmail = `${newIdNumber}@malachim.co.il`
  await getAuth().updateUser(uid, { email: newEmail })

  console.log(`[updateUserEmail] Updated Auth email for ${uid} → ${newEmail}`)
  return { success: true }
})

// ── updateUserPassword — update Firebase Auth password when volunteer ID changes ─
// Callable by branch_head, branch_deputy, or system_admin only.
exports.updateUserPassword = onCall({ cors: true }, async (request) => {
  // 1. Must be authenticated
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required')
  }

  // 2. Caller must be a privileged role
  const callerSnap = await db.collection('users').doc(request.auth.uid).get()
  if (!callerSnap.exists) {
    throw new HttpsError('permission-denied', 'Caller not found')
  }
  const callerRole = callerSnap.data().role
  const ALLOWED = ['system_admin', 'branch_head', 'branch_deputy']
  if (!ALLOWED.includes(callerRole)) {
    throw new HttpsError('permission-denied', 'Insufficient permissions')
  }

  // 3. Validate input
  const { uid, newVolunteerId } = request.data
  if (!uid || !newVolunteerId) {
    throw new HttpsError('invalid-argument', 'uid and newVolunteerId are required')
  }
  if (!/^\d{2,5}$/.test(newVolunteerId)) {
    throw new HttpsError('invalid-argument', 'newVolunteerId must be 2-5 digits')
  }

  // 4. Update the target user's Auth password using Admin SDK
  const newPassword = String(newVolunteerId).padStart(6, '0')
  await getAuth().updateUser(uid, { password: newPassword })

  console.log(`[updateUserPassword] Updated Auth password for ${uid}`)
  return { success: true }
})

// ── Evening reminder — 20:00 Israel time, reminds about TOMORROW's shift ──────
exports.nightShiftReminderEvening = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'Asia/Jerusalem' },
  async () => {
    const tomorrow = israelDateStr(1)
    await sendNightShiftReminders(
      tomorrow,
      'תזכורת תורנות לילה 🌙',
      'תורנות הלילה שלך היא מחר — {date}'
    )
  }
)

// ── Morning reminder — 08:00 Israel time, reminds about TONIGHT's shift ───────
exports.nightShiftReminderMorning = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Asia/Jerusalem' },
  async () => {
    const today = israelDateStr(0)
    await sendNightShiftReminders(
      today,
      'תורנות לילה הלילה 🌙',
      'תורנות הלילה שלך היא הלילה — {date}'
    )
  }
)
