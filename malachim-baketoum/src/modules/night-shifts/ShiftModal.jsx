import { format, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'

export default function ShiftModal({ date, onConfirm, onCancel, isOwn, loading, errorMsg, branchSettings }) {
  const parsed = parseISO(date)
  const dateLabel = format(parsed, 'EEEE, d בMMMM yyyy', { locale: he })
  const startTime = branchSettings?.startTime || '00:00'
  const endTime = branchSettings?.endTime || '06:00'
  const timeLabel = `${startTime} – ${endTime}`

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl" dir="rtl">

        {isOwn ? (
          /* ── CANCEL MODAL ── */
          <>
            <div className="text-center mb-5">
              <span className="text-4xl">😔</span>
              <h2 className="text-xl font-bold text-gray-200 mt-3">ביטול שיבוץ</h2>
              <p className="text-gray-300 mt-2 font-medium">{dateLabel}</p>
              <p className="text-gray-400 text-sm">{timeLabel}</p>
            </div>

            {errorMsg ? (
              <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm text-center mb-5">
                ⚠️ {errorMsg}
              </div>
            ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-5 text-sm text-yellow-400 text-center">
                ביטול שיבוץ יסיר אותך מהגרלה אם אין לך שיבוץ נוסף החודש
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 py-2.5 rounded-xl font-medium transition"
              >
                חזור
              </button>
              <button
                onClick={onConfirm}
                disabled={loading || !!errorMsg}
                className="flex-1 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white py-2.5 rounded-xl font-medium transition"
              >
                {loading ? 'מבטל...' : 'בטל שיבוץ'}
              </button>
            </div>
          </>
        ) : (
          /* ── SIGN-UP MODAL ── */
          <>
            <div className="text-center mb-5">
              <span className="text-5xl">🌙</span>
              <h2 className="text-xl font-bold text-gray-200 mt-3">הרשמה לשיבוץ לילה</h2>
              <p className="text-gray-300 mt-2 font-medium">{dateLabel}</p>
              <p className="text-gray-400 text-sm mt-0.5">{timeLabel}</p>
            </div>

            {errorMsg ? (
              <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm text-center mb-5">
                ⚠️ {errorMsg}
              </div>
            ) : (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-5 text-sm text-orange-300 text-center">
                ✓ הרשמה לשיבוץ תכניס אותך להגרלה החודשית 🎉
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 py-2.5 rounded-xl font-medium transition"
              >
                ביטול
              </button>
              <button
                onClick={onConfirm}
                disabled={loading || !!errorMsg}
                className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white py-3 rounded-xl font-black text-base transition"
              >
                {loading ? 'רושם...' : 'אני לוקח את המשמרת! ✔'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
