import { useMemo } from 'react'
import { getDaysInMonth, parseISO, isAfter } from 'date-fns'
import { CheckCircle, XCircle } from '@phosphor-icons/react'

export default function StatusPanel({ shifts, volunteerId, year, month, maxPerMonth = 3, enableLottery = true }) {
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
    <div className={`grid gap-3 ${enableLottery ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
      {/* Shift count X/max */}
      <div className="bg-gray-100 rounded-xl p-4 text-center border border-gray-200">
        <p className="text-2xl font-black text-orange-400">
          {myShifts.length}
          <span className="text-gray-500 text-lg font-medium">/{maxPerMonth}</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">שיבוצים החודש</p>
      </div>

      {/* Lottery eligibility — hidden when lottery is disabled */}
      {enableLottery && (
        <div className={`rounded-xl p-4 text-center border flex flex-col items-center justify-center gap-1 ${
          eligible ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          {eligible
            ? <CheckCircle size={28} weight="fill" className="text-green-500" />
            : <XCircle    size={28} weight="fill" className="text-red-400" />
          }
          <p className={`text-xs font-semibold mt-0.5 ${eligible ? 'text-green-700' : 'text-red-500'}`}>
            {eligible ? 'זכאי להגרלה' : 'לא זכאי'}
          </p>
        </div>
      )}

      {/* Days left */}
      <div className="bg-gray-100 rounded-xl p-4 text-center border border-gray-200">
        <p className="text-2xl font-black text-blue-400">{daysLeft}</p>
        <p className="text-xs text-gray-500 mt-1">ימים לסוף חודש</p>
      </div>

      {/* Next shift */}
      <div className="bg-gray-100 rounded-xl p-4 text-center border border-gray-200">
        <p className="text-sm font-bold text-gray-800 truncate">{nextShiftLabel}</p>
        <p className="text-xs text-gray-500 mt-1">משמרת הבאה</p>
      </div>
    </div>
  )
}
