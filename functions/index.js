const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
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

// ── Branch message push notification — fires on every new branch_messages doc ─
exports.sendMessagePushNotification = onDocumentCreated('branch_messages/{messageId}', async (event) => {
  const data = event.data?.data()
  if (!data) return

  const { title, body, targetUserIds } = data
  if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) return

  const sends = targetUserIds.map(async (userId) => {
    const userSnap = await db.collection('users').doc(userId).get()
    if (!userSnap.exists) return
    const { fcmToken } = userSnap.data()
    if (!fcmToken) return

    try {
      await getMessaging().send({
        token: fcmToken,
        data: { title, body },
        webpush: { headers: { Urgency: 'high' } },
      })
    } catch (err) {
      console.error(`[FCM] Push failed for user ${userId}:`, err.message)
    }
  })

  await Promise.all(sends)
  console.log(`[sendMessagePushNotification] Sent push to ${targetUserIds.length} users for message ${event.params.messageId}`)
})

// ── Event push notification — fires on every new events doc ──────────────────
exports.sendEventPushNotification = onDocumentCreated('events/{eventId}', async (event) => {
  const data = event.data?.data()
  if (!data) return

  const { title, date, time, location, targetUserIds } = data
  if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) return

  const body = `${date}${time ? ' ' + time : ''} 📍 ${location}`

  const sends = targetUserIds.map(async (userId) => {
    const userSnap = await db.collection('users').doc(userId).get()
    if (!userSnap.exists) return
    const { fcmToken } = userSnap.data()
    if (!fcmToken) return

    try {
      await getMessaging().send({
        token: fcmToken,
        data: { title: `אירוע חדש: ${title}`, body },
        webpush: { headers: { Urgency: 'high' } },
      })
    } catch (err) {
      console.error(`[FCM] Event push failed for user ${userId}:`, err.message)
    }
  })

  await Promise.all(sends)
  console.log(`[sendEventPushNotification] Sent push to ${targetUserIds.length} users for event ${event.params.eventId}`)
})

// ── General notification push — fires on every new notifications doc ──────────
// Skips branch_messages notifications (already pushed by sendMessagePushNotification)
// and event_invite notifications (already pushed by sendEventPushNotification).
exports.sendNotificationPush = onDocumentCreated('notifications/{notificationId}', async (event) => {
  const data = event.data?.data()
  if (!data) return

  if (data.messageId || data.type === 'event_invite') return

  const { userId, title, body } = data
  if (!userId || !title) return

  const userSnap = await db.collection('users').doc(userId).get()
  if (!userSnap.exists) return
  const { fcmToken } = userSnap.data()
  if (!fcmToken) return

  try {
    await getMessaging().send({
      token: fcmToken,
      data: { title, body: body || '' },
      webpush: { headers: { Urgency: 'high' } },
    })
    console.log(`[sendNotificationPush] Sent push to user ${userId}`)
  } catch (err) {
    console.error(`[sendNotificationPush] Push failed for user ${userId}:`, err.message)
  }
})

// ── Shabbat opening reminder ── runs every hour 06:00-22:00 Israel time ──────
exports.shabbatOpeningReminder = onSchedule(
  { schedule: '0 6-22 * * *', timeZone: 'Asia/Jerusalem' },
  async () => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
    const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const currentDay = DAY_NAMES[now.getDay()]
    const currentHour = now.getHours()

    const branchesSnap = await db.collection('branches').get()

    for (const branchDoc of branchesSnap.docs) {
      const branchData = branchDoc.data()
      const settings = branchData.settings?.shabbat ?? branchData.shabbat ?? {}
      const openingDay = settings.openingDay || 'thursday'
      const openingTime = settings.openingTime || '08:00'
      const [openHour] = openingTime.split(':').map(Number)

      if (currentDay !== openingDay || currentHour !== openHour) continue

      const branchId = branchDoc.id
      const branchName = branchData.name ?? branchId

      const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7
      const nextFriday = new Date(now)
      nextFriday.setDate(now.getDate() + daysUntilFriday)
      const fridayLabel = nextFriday.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' })

      const usersSnap = await db.collection('users')
        .where('branchId', '==', branchId)
        .where('isActive', '==', true)
        .get()

      const sends = usersSnap.docs
        .filter(u => {
          const d = u.data()
          return d.permissions?.shabbatVolunteer === true || d.shabbatVolunteer === true
        })
        .map(async (userDoc) => {
          const { fcmToken } = userDoc.data()
          if (!fcmToken) return
          try {
            await getMessaging().send({
              token: fcmToken,
              data: {
                title: 'נפתחה הרשמה לתורנות שבת 🕍',
                body: `ניתן להירשם לתורנות שבת ${fridayLabel} — סניף ${branchName}`,
              },
              webpush: { headers: { Urgency: 'high' } },
            })
          } catch (err) {
            console.error(`[shabbatOpening] FCM failed for ${userDoc.id}:`, err.message)
          }
        })

      await Promise.all(sends)
      console.log(`[shabbatOpeningReminder] Sent to branch ${branchId}`)
    }
  }
)
