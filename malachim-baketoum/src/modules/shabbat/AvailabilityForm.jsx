import { useState } from 'react'
import {
  submitShabbatAvailability,
  submitUnavailability,
  setVolunteerShiftStatus,
} from '../../firebase/shabbatShifts'

const STATUS_LABELS = {
  available: { icon: '⏳', text: 'ממתין לאישור', color: 'text-yellow-300' },
  confirmed: { icon: '✅', text: 'מאושר', color: 'text-green-300' },
  cancelled: { icon: '❌', text: 'לא שובצת', color: 'text-red-400' },
  not_available: { icon: '😔', text: 'דיווחת שאינך זמין', color: 'text-gray-400' },
}

export default function AvailabilityForm({
  user,
  branchId,
  shabbatDate,
  shabbatLabel,
  myShiftsThisMonth,
  branchSettings,
  shifts,          // all shifts for this specific shabbatDate
  onSubmitted,
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [changingMind, setChangingMind] = useState(false)

  const maxPerMonth = branchSettings?.maxPerMonth ?? 2
  const userArea = user?.shabbatArea || user?.permissions?.shabbatArea || ''

  // Is the availability window closed?
  const isWindowClosed = (() => {
    if (!branchSettings) return false
    try {
      const [h, m] = (branchSettings.closingTime || '12:00').split(':').map(Number)
      const friday = new Date(shabbatDate + 'T12:00:00')
      const offset = branchSettings.closingDay === 'friday' ? 0 : -1
      const closingDate = new Date(friday)
      closingDate.setDate(closingDate.getDate() + offset)
      closingDate.setHours(h, m, 0, 0)
      return new Date() > closingDate
    } catch { return false }
  })()

  const myResponse = shifts?.find(s => s.volunteerId === user?.id) ?? null
  const isAlreadySubmitted = !!myResponse && !changingMind

  const confirmedThisMonth = myShiftsThisMonth.filter(s => s.status === 'confirmed').length
  const atMaxShifts = confirmedThisMonth >= maxPerMonth

  const handleAvailable = async () => {
    setError(''); setLoading(true)
    try {
      if (changingMind && myResponse) {
        // Update existing record in place — atomic, no risk of losing the row
        await setVolunteerShiftStatus(myResponse.id, 'available')
      } else {
        await submitShabbatAvailability(branchId, shabbatDate, user.id, `${user.firstName} ${user.lastName}`, userArea)
      }
      setChangingMind(false)
      onSubmitted?.()
    } catch (err) {
      console.error('shabbat submit failed:', err)
      setError(err?.code === 'permission-denied' ? 'אין הרשאה — ודא שאתה מוגדר כתורן שבת' : 'שגיאה, נסה שנית')
    }
    finally { setLoading(false) }
  }

  const handleUnavailable = async () => {
    setError(''); setLoading(true)
    try {
      if (changingMind && myResponse) {
        await setVolunteerShiftStatus(myResponse.id, 'not_available')
      } else {
        await submitUnavailability(branchId, shabbatDate, user.id, `${user.firstName} ${user.lastName}`, userArea)
      }
      setChangingMind(false)
      onSubmitted?.()
    } catch (err) {
      console.error('shabbat submit failed:', err)
      setError(err?.code === 'permission-denied' ? 'אין הרשאה — ודא שאתה מוגדר כתורן שבת' : 'שגיאה, נסה שנית')
    }
    finally { setLoading(false) }
  }

  const handleChangeMind = async () => {
    // If confirmed by coordinator → can't change
    if (myResponse?.status === 'confirmed' && myResponse?.published) {
      setError('לא ניתן לשנות לאחר שהשיבוץ פורסם')
      return
    }
    setError('')
    setChangingMind(true)
  }

  // ── Blocked states ────────────────────────────────────────────────────────

  if (!user?.shabbatVolunteer && !user?.permissions?.shabbatVolunteer) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
        <span className="text-3xl">🔒</span>
        <p className="text-gray-400 mt-3">אינך מוגדר כתורן שבת.</p>
        <p className="text-gray-500 text-sm mt-1">פנה לרכז הסניף לעדכון הרשאות.</p>
      </div>
    )
  }

  // ── Already submitted and not changing mind ───────────────────────────────

  if (isAlreadySubmitted && myResponse) {
    const label = STATUS_LABELS[myResponse.status] || STATUS_LABELS.available
    const canChange = myResponse.status !== 'confirmed' || !myResponse.published

    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="text-center mb-4">
          <span className="text-5xl">🕍</span>
          <h3 className="font-bold text-gray-200 text-lg mt-3">שבת {shabbatLabel}</h3>
        </div>

        <div className={`flex items-center justify-center gap-2 text-lg font-bold mb-4 ${label.color}`}>
          <span>{label.icon}</span>
          <span>{label.text}</span>
        </div>

        {myResponse.status === 'available' && (
          <p className="text-center text-gray-400 text-sm mb-4">
            הרכז יאשר את שיבוצך בקרוב
          </p>
        )}
        {myResponse.status === 'confirmed' && (
          <p className="text-center text-green-400 text-sm mb-4">
            שובצת לתורנות שבת {shabbatLabel} — {userArea || 'ללא אזור'}
          </p>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-300 text-sm text-center mb-3">
            {error}
          </div>
        )}

        {canChange && (
          <button
            onClick={handleChangeMind}
            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm font-medium transition border border-gray-700"
          >
            🔄 שיניתי את דעתי
          </button>
        )}
      </div>
    )
  }

  // ── Submission form ───────────────────────────────────────────────────────

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      {/* Header */}
      <div className="text-center mb-6">
        <span className="text-5xl">🕍</span>
        <h3 className="font-bold text-gray-200 text-xl mt-3">
          האם אתה זמין לתורנות השבת הקרובה?
        </h3>
        <p className="text-orange-400 font-bold text-lg mt-2">{shabbatLabel}</p>
        {userArea && (
          <p className="text-gray-400 text-sm mt-1">אזור: {userArea}</p>
        )}
      </div>

      {/* Block banners */}
      {isWindowClosed && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-gray-400 text-sm text-center mb-4">
          🔒 חלון ההרשמה לשבת זו נסגר
        </div>
      )}

      {!isWindowClosed && atMaxShifts && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 text-yellow-300 text-sm text-center mb-4">
          הגעת למכסת {maxPerMonth} שבתות החודש
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-300 text-sm text-center mb-4">
          {error}
        </div>
      )}

      {changingMind && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2 text-blue-300 text-xs text-center mb-4">
          בחר את תגובתך החדשה
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleAvailable}
          disabled={loading || isWindowClosed || atMaxShifts}
          className="flex-1 bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition flex items-center justify-center gap-2 text-base"
        >
          {loading ? '...' : <><span className="text-xl">✅</span> כן, אני זמין</>}
        </button>
        <button
          onClick={handleUnavailable}
          disabled={loading || isWindowClosed}
          className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 font-bold py-4 rounded-xl transition flex items-center justify-center gap-2 text-base border border-gray-600"
        >
          {loading ? '...' : <><span className="text-xl">❌</span> לא זמין השבת</>}
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center mt-3">
        שבתות מאושרות החודש: {confirmedThisMonth}/{maxPerMonth}
      </p>
    </div>
  )
}
