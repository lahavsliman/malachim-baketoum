import { useMemo } from 'react'
import { getDaysInMonth, parseISO, isAfter } from 'date-fns'

export default function StatusPanel({ shifts, volunteerId, year, month, maxPerMonth = 3 }) {
  const now = new Date()
  const isThisMonth = month === now.getMonth() + 1 && year === now.getFullYear()
  const daysInMonth = getDaysInMonth(new Date(year, month - 1))
  const daysLeft = isThisMonth ? daysInMonth - now.getDate() : 0

  const myShifts = useMemo(
    () => shifts.filter(s => s.volunteerId === volunteerId),
    [shifts, volunteerId]
  )

  // Lottery eligibility: has ≥1 shift this month
  const eligible = myShifts.length > 0

  // Next upcoming shift (date > today)
  const nextShift = useMemo(() => {
    const today = now.toISOString().slice(0, 10)
    return myShifts
      .filter(s => s.date > today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  }, [myShifts])

  const nextShiftLabel = nextShift
    ? new Date(nextShift.date + 'T12:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
    : 'אין שיבוץ קרוב'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* Shift count X/max */}
      <div className="bg-gray-800/60 rounded-xl p-4 text-center border border-gray-700">
        <p className="text-2xl font-black text-orange-400">
          {myShifts.length}
          <span className="text-gray-500 text-lg font-medium">/{maxPerMonth}</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">שיבוצים החודש</p>
      </div>

      {/* Lottery eligibility */}
      <div className={`rounded-xl p-4 text-center border ${
        eligible ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
      }`}>
        <p className="text-2xl">{eligible ? '✅' : '❌'}</p>
        <p className="text-xs text-gray-400 mt-1">{eligible ? 'זכאי להגרלה' : 'לא זכאי'}</p>
      </div>

      {/* Days left */}
      <div className="bg-gray-800/60 rounded-xl p-4 text-center border border-gray-700">
        <p className="text-2xl font-black text-blue-400">{daysLeft}</p>
        <p className="text-xs text-gray-400 mt-1">ימים לסוף חודש</p>
      </div>

      {/* Next shift */}
      <div className="bg-gray-800/60 rounded-xl p-4 text-center border border-gray-700">
        <p className="text-sm font-bold text-gray-200 truncate">{nextShiftLabel}</p>
        <p className="text-xs text-gray-400 mt-1">משמרת הבאה</p>
      </div>
    </div>
  )
}
