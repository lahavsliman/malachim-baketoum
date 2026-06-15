import { useState, useEffect } from 'react'
import { getBranchUsers } from '../../firebase/users'
import { Trophy } from '@phosphor-icons/react'
import { adminAssignShift, cancelShift } from '../../firebase/nightShifts'
import { getLotteryResults } from '../../firebase/lottery'
import DataTable from '../../shared/DataTable'
import LotteryDraw from './LotteryDraw'
import * as XLSX from 'xlsx'
import { getDaysInMonth } from 'date-fns'

const hasNightPerm = v => v.permissions?.nightShifts || v.nightShifts || false

const isFriday = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() === 5
}

export default function NightShiftsAdmin({ branchId, shifts, year, month, onRefresh, blockFriday }) {
  const [volunteers, setVolunteers] = useState([])
  const [lotteryHistory, setLotteryHistory] = useState([])
  const [showLottery, setShowLottery] = useState(false)
  const [assignDate, setAssignDate] = useState('')
  const [assignVolId, setAssignVolId] = useState('')
  const [loading, setLoading] = useState(false)
  const [assignError, setAssignError] = useState('')

  useEffect(() => {
    getBranchUsers(branchId).then(setVolunteers)
    getLotteryResults(branchId).then(r => setLotteryHistory(r.slice(0, 3))).catch(() => {})
  }, [branchId])

  const daysInMonth = getDaysInMonth(new Date(year, month - 1))
  const filled = shifts.length
  const total = daysInMonth
  const coverage = Math.round((filled / total) * 100)

  const notSignedUp = volunteers.filter(
    v => hasNightPerm(v) && !shifts.find(s => s.volunteerId === v.id)
  )

  const nightVolunteers = volunteers.filter(hasNightPerm)

  const handleAssign = async () => {
    if (!assignDate || !assignVolId) return
    if (blockFriday && isFriday(assignDate)) {
      setAssignError('יום שישי חסום בהגדרות הסניף')
      return
    }
    const vol = volunteers.find(v => v.id === assignVolId)
    if (!vol) return
    setAssignError('')
    setLoading(true)
    await adminAssignShift(branchId, assignDate, vol.id, `${vol.firstName} ${vol.lastName}`)
    setAssignDate('')
    setAssignVolId('')
    onRefresh()
    setLoading(false)
  }

  const handleRemove = async (shiftId) => {
    if (!confirm('להסיר שיבוץ זה?')) return
    await cancelShift(shiftId)
    onRefresh()
  }

  const exportExcel = () => {
    const data = shifts.map(s => ({
      תאריך: s.date,
      מתנדב: s.volunteerName,
      'נרשם בתאריך': s.signedUpAt?.toDate?.()?.toLocaleDateString('he-IL') || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'שיבוצי לילה')
    XLSX.writeFile(wb, `night-shifts-${year}-${month}.xlsx`)
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-green-400">{filled}</p>
          <p className="text-xs text-gray-500 mt-1">מאויישים</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-red-400">{total - filled}</p>
          <p className="text-xs text-gray-500 mt-1">ריקים</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-orange-400">{coverage}%</p>
          <p className="text-xs text-gray-500 mt-1">כיסוי</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowLottery(true)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl font-medium transition"
        >
          🎰 הגרלה חודשית
        </button>
        <button
          onClick={exportExcel}
          className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-xl font-medium transition border border-gray-200"
        >
          📊 ייצוא Excel
        </button>
      </div>

      {/* Lottery history */}
      {lotteryHistory.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Trophy size={18} className="text-amber-400" /> הגרלות אחרונות</h3>
          <div className="space-y-2">
            {lotteryHistory.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-gray-100 px-4 py-2 rounded-xl text-sm">
                <span className="text-gray-700">{r.winnerName}</span>
                <div className="flex items-center gap-3 text-gray-500 text-xs">
                  <span>{r.month}</span>
                  <span>{r.totalParticipants} משתתפים</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Not signed up */}
      {notSignedUp.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <h3 className="font-bold text-red-400 mb-3">
            לא נרשמו עדיין ({notSignedUp.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {notSignedUp.map(v => (
              <span key={v.id} className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-3 py-1 rounded-full">
                {v.firstName} {v.lastName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Manual assign */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <h3 className="font-bold text-gray-800 mb-3">שיבוץ ידני</h3>
        <div className="flex flex-wrap gap-3">
          <input
            type="date"
            value={assignDate}
            onChange={e => { setAssignDate(e.target.value); setAssignError('') }}
            className="bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 focus:outline-none focus:border-orange-500"
          />
          <select
            value={assignVolId}
            onChange={e => setAssignVolId(e.target.value)}
            className="bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 focus:outline-none focus:border-orange-500 flex-1 min-w-32"
          >
            <option value="">בחר מתנדב</option>
            {nightVolunteers.map(v => (
              <option key={v.id} value={v.id}>{v.firstName} {v.lastName}</option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={loading || !assignDate || !assignVolId}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-4 py-2 rounded-xl font-medium transition"
          >
            {loading ? 'משבץ...' : 'שבץ'}
          </button>
        </div>
        {assignError && (
          <p className="mt-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            ⛔ {assignError}
          </p>
        )}
      </div>

      {/* Shifts list */}
      <DataTable
        columns={[
          { key: 'date', label: 'תאריך' },
          { key: 'volunteerName', label: 'מתנדב' },
          {
            key: 'id', label: 'הסר',
            render: (id) => (
              <button onClick={() => handleRemove(id)} className="text-red-400 hover:text-red-300 text-sm transition">
                הסר
              </button>
            ),
          },
        ]}
        data={[...shifts].sort((a, b) => a.date.localeCompare(b.date))}
      />

      {showLottery && (
        <LotteryDraw
          shifts={shifts}
          volunteers={nightVolunteers}
          branchId={branchId}
          year={year}
          month={month}
          onClose={() => { setShowLottery(false); getLotteryResults(branchId).then(r => setLotteryHistory(r.slice(0, 3))).catch(() => {}) }}
        />
      )}
    </div>
  )
}
