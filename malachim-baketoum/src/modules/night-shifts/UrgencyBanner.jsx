import { getDaysInMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'

export default function UrgencyBanner({ shifts, year, month }) {
  const { user } = useAuth()
  const now = new Date()

  // Only show for the current month
  if (month !== now.getMonth() + 1 || year !== now.getFullYear()) return null

  const hasMyShift = shifts.some(s => s.volunteerId === user?.id)
  if (hasMyShift) return null

  const daysLeft = getDaysInMonth(new Date(year, month - 1)) - now.getDate()
  const isUrgent = daysLeft <= 5

  if (isUrgent) {
    return (
      <div className="urgency-flash rounded-xl px-4 py-3 border border-red-500/40 flex items-center gap-3">
        <span className="text-2xl shrink-0">🚨</span>
        <div>
          <p className="font-bold text-red-300">נשארו {daysLeft} ימים לסוף החודש!</p>
          <p className="text-sm text-red-400">עדיין לא נרשמת לשיבוץ לילה — הרשם עכשיו כדי להיות בהגרלה</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl px-4 py-3 border border-yellow-500/30 bg-yellow-500/10 flex items-center gap-3">
      <span className="text-2xl shrink-0">💡</span>
      <div>
        <p className="font-medium text-yellow-300">עדיין לא נרשמת לשיבוץ לילה החודש</p>
        <p className="text-sm text-yellow-500">הרשמה לשיבוץ מכניסה אותך להגרלה החודשית</p>
      </div>
    </div>
  )
}
