import { getDaysInMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { Warning, Lightbulb } from '@phosphor-icons/react'

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
        <Warning size={22} weight="fill" className="shrink-0 text-red-600" />
        <div>
          <p className="font-bold text-gray-900">נשארו {daysLeft} ימים לסוף החודש!</p>
          <p className="text-sm text-gray-700">עדיין לא נרשמת לשיבוץ לילה — הרשם עכשיו כדי להיות בהגרלה</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl px-4 py-3 border border-orange-200 bg-orange-50 flex items-center gap-3">
      <Lightbulb size={22} weight="fill" className="shrink-0 text-orange-500" />
      <div>
        <p className="font-medium text-gray-900">עדיין לא נרשמת לשיבוץ לילה החודש</p>
        <p className="text-sm text-gray-600">הרשמה לשיבוץ מכניסה אותך להגרלה החודשית</p>
      </div>
    </div>
  )
}
