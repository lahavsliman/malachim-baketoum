import { getDaysInMonth, isBefore, isToday, startOfDay } from 'date-fns'
import { HDate, HebrewCalendar, gematriya } from '@hebcal/core'

const HEBREW_MONTHS = {
  1: 'ניסן', 2: 'אייר', 3: 'סיוון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
  7: 'תשרי', 8: 'חשוון', 9: 'כסלו', 10: 'טבת', 11: 'שבט',
  12: 'אדר', 13: 'אדר ב׳',
}

const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

export default function Calendar({ year, month, shifts, volunteerId, onDayClick, isAdmin, blockFriday, maxPerNight = 1 }) {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1))
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay() // 0=Sun … 6=Sat

  const shiftByDate = {}
  shifts.forEach(s => { shiftByDate[s.date] = s })

  const today = startOfDay(new Date())

  // ── Hebrew calendar data ──────────────────────────────────────────────────
  // hebDateMap[d] → "כ״ג אייר"
  const hebDateMap = {}
  for (let d = 1; d <= daysInMonth; d++) {
    const hd = new HDate(new Date(year, month - 1, d))
    hebDateMap[d] = `${gematriya(hd.getDate())} ${HEBREW_MONTHS[hd.getMonth()] ?? ''}`
  }

  // holidayMap[dateStr] → holiday name (Hebrew, nikud, no trailing year)
  const holidayMap = {}
  HebrewCalendar.calendar({
    start: new HDate(new Date(year, month - 1, 1)),
    end:   new HDate(new Date(year, month - 1, daysInMonth)),
    il: true,
    noRoshChodesh: true,
  }).forEach(e => {
    const g = e.getDate().greg()
    const key = `${g.getFullYear()}-${String(g.getMonth() + 1).padStart(2, '0')}-${String(g.getDate()).padStart(2, '0')}`
    if (!holidayMap[key]) holidayMap[key] = e.render('he').replace(/\s+\d+$/, '')
  })

  // Pad leading empty cells
  const cells = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const getCell = (d) => {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const date = new Date(year, month - 1, d)
    const dayOfWeek = date.getDay() // 5 = Friday
    const isPast = isBefore(date, today) && !isToday(date)
    const isFriday = dayOfWeek === 5
    const shift = shiftByDate[dateStr]
    const isOwn = shift?.volunteerId === volunteerId
    const isTaken = !!shift && !isOwn

    // blocked = Friday with blockFriday setting
    const isBlocked = isFriday && blockFriday

    return { dateStr, isPast, isBlocked, shift, isOwn, isTaken }
  }

  const getCellClass = (d) => {
    if (!d) return ''
    const { isPast, isBlocked, isOwn, isTaken } = getCell(d)

    if (isPast) return 'bg-gray-800/30 text-gray-600 cursor-not-allowed border-gray-800'
    if (isBlocked) return 'bg-gray-800/50 text-gray-500 cursor-not-allowed border-gray-700 opacity-60'
    if (isOwn) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50 cursor-pointer hover:bg-yellow-500/30'
    if (isTaken) return 'bg-red-500/20 text-red-300 border-red-500/30 cursor-pointer hover:bg-red-500/30'
    return 'bg-green-500/15 text-green-300 border-green-500/30 cursor-pointer hover:bg-green-500/25'
  }

  const handleClick = (d) => {
    if (!d) return
    const { dateStr, isPast, isBlocked, isOwn, isTaken, shift } = getCell(d)
    if (isPast && !isAdmin) return
    if (isBlocked) return
    if (isTaken && !isOwn) { onDayClick?.(dateStr, shift); return }
    onDayClick?.(dateStr, shift)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_NAMES.map((d, i) => (
          <div key={i} className={`text-center text-xs font-medium py-1 ${i === 5 && blockFriday ? 'text-gray-600' : 'text-gray-500'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e-${i}`} />
          const { dateStr, isBlocked, isOwn, isTaken, shift } = getCell(d)
          const cellClass = getCellClass(d)
          const holiday = holidayMap[dateStr]

          return (
            <button
              key={dateStr}
              onClick={() => handleClick(d)}
              className={`relative min-h-14 flex flex-col items-center justify-start pt-1.5 pb-1 rounded-xl border text-sm transition-all ${cellClass}`}
            >
              <span className="font-bold text-sm leading-none">{d}</span>
              <span className="text-[9px] leading-none mt-0.5 opacity-50 max-w-full truncate px-0.5">{hebDateMap[d]}</span>

              {isOwn && <span className="text-xs leading-none mt-0.5">⭐</span>}

              {isTaken && !isOwn && (
                <span className="text-[9px] leading-none mt-0.5 opacity-80 max-w-full truncate px-0.5">
                  {shift.volunteerName?.split(' ')[0]}
                </span>
              )}

              {isBlocked && (
                <span className="text-xs leading-none mt-0.5 opacity-60">🔒</span>
              )}

              {holiday && (
                <span className="text-[8px] leading-tight mt-0.5 max-w-full truncate px-0.5 text-amber-300 opacity-90">
                  {holiday}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-500/30 border border-green-500/40 inline-block" />
          פנוי
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-500/30 border border-red-500/40 inline-block" />
          תפוס
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-yellow-500/30 border border-yellow-500/40 inline-block" />
          שלי
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-800 border border-gray-700 inline-block" />
          עבר
        </span>
        {blockFriday && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-gray-700 border border-gray-600 inline-block opacity-60" />
            חסום (שישי)
          </span>
        )}
      </div>
    </div>
  )
}
