const functions = require('firebase-functions')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')

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
        notification: { title, body: body.replace('{date}', dateStr) },
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

// ── Evening reminder — 20:00 Israel time, reminds about TOMORROW's shift ──────
exports.nightShiftReminderEvening = functions.pubsub
  .schedule('0 20 * * *')
  .timeZone('Asia/Jerusalem')
  .onRun(async () => {
    const tomorrow = israelDateStr(1)
    await sendNightShiftReminders(
      tomorrow,
      'תזכורת תורנות לילה 🌙',
      'תורנות הלילה שלך היא מחר — {date}'
    )
  })

// ── Morning reminder — 08:00 Israel time, reminds about TONIGHT's shift ───────
exports.nightShiftReminderMorning = functions.pubsub
  .schedule('0 8 * * *')
  .timeZone('Asia/Jerusalem')
  .onRun(async () => {
    const today = israelDateStr(0)
    await sendNightShiftReminders(
      today,
      'תורנות לילה הלילה 🌙',
      'תורנות הלילה שלך היא הלילה — {date}'
    )
  })
