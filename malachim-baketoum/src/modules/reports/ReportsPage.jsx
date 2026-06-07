import { useState, useEffect, useMemo } from 'react'
import { getDaysInMonth } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useRole } from '../../hooks/useRole'
import { getBranchUsers } from '../../firebase/users'
import { getBranchSettings } from '../../firebase/branches'
import { getMonthShifts } from '../../firebase/nightShifts'
import { getBranchMonthShabbatShifts } from '../../firebase/shabbatShifts'
import { getEventResponses } from '../../firebase/events'
import LoadingSpinner from '../../shared/LoadingSpinner'
import BranchSelector from '../../shared/BranchSelector'

// ── Shared helpers ─────────────────────────────────────────────────────────

const now = new Date()
const DEFAULT_MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

const parseMonth = (m) => {
  const [y, mo] = m.split('-').map(Number)
  return { year: y, month: mo }
}

const fmtShort = (dateStr) => {
  try {
    return new Date(dateStr + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
  } catch { return dateStr }
}

const hasNightPerm  = u => u.permissions?.nightShifts    || u.nightShifts    || false
const hasShabbatPerm = u => u.permissions?.shabbatVolunteer || u.shabbatVolunteer || false

// ── Shared UI pieces ───────────────────────────────────────────────────────

const StatCard = ({ label, value, color = 'text-orange-400', sub }) => (
  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
    <p className={`text-2xl font-black ${color}`}>{value}</p>
    <p className="text-xs text-gray-400 mt-1">{label}</p>
    {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
  </div>
)

const SectionBox = ({ title, children }) => (
  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
    {title && <h3 className="font-bold text-gray-200 mb-4">{title}</h3>}
    {children}
  </div>
)

const EmptyState = ({ msg = 'אין נתונים לתקופה זו' }) => (
  <div className="py-10 text-center text-gray-500 text-sm">{msg}</div>
)

const chartTooltipStyle = {
  contentStyle: { backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' },
  labelStyle:   { color: '#F3F4F6', fontWeight: 'bold' },
  itemStyle:    { color: '#F97316' },
}

function OrangeBar({ data, dataKey, nameKey = 'name', height = 220 }) {
  if (!data?.length) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 50 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis
          dataKey={nameKey}
          tick={{ fill: '#6B7280', fontSize: 10 }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} allowDecimals={false} />
        <Tooltip {...chartTooltipStyle} />
        <Bar dataKey={dataKey} fill="#F97316" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

const MonthPicker = ({ value, onChange }) => (
  <input
    type="month"
    value={value}
    onChange={e => onChange(e.target.value)}
    className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-orange-500"
  />
)

// ── TAB 1 — Night Shifts ───────────────────────────────────────────────────

function NightShiftsTab({ branchId, month }) {
  const [shifts, setShifts] = useState([])
  const [volunteers, setVolunteers] = useState([])
  const [loading, setLoading] = useState(true)
  const { year, month: mon } = parseMonth(month)

  useEffect(() => {
    if (!branchId) return
    setLoading(true)
    Promise.all([
      getMonthShifts(branchId, year, mon),
      getBranchUsers(branchId),
    ]).then(([s, u]) => {
      setShifts(s)
      setVolunteers(u.filter(hasNightPerm))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [branchId, month])

  const daysInMonth   = getDaysInMonth(new Date(year, mon - 1))
  const coveredDates  = useMemo(() => new Set(shifts.map(s => s.date)), [shifts])
  const coveredCount  = coveredDates.size
  const emptyCount    = daysInMonth - coveredCount
  const coverage      = Math.round((coveredCount / daysInMonth) * 100)

  const barData = useMemo(() => {
    const counts = {}
    shifts.forEach(s => {
      if (!counts[s.volunteerId]) counts[s.volunteerId] = { name: s.volunteerName, count: 0 }
      counts[s.volunteerId].count++
    })
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .map(v => ({ name: v.name?.split(' ')[0] ?? '?', fullName: v.name, שיבוצים: v.count }))
  }, [shifts])

  const signedUpIds = useMemo(() => new Set(shifts.map(s => s.volunteerId)), [shifts])
  const notSignedUp = volunteers.filter(v => !signedUpIds.has(v.id))

  const today = new Date().toISOString().slice(0, 10)
  const firstDayOfWeek = new Date(year, mon - 1, 1).getDay()

  if (loading) return <div className="py-16 flex justify-center"><LoadingSpinner size="md" text="טוען..." /></div>

  return (
    <div className="space-y-5" dir="rtl">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="ימים מכוסים"   value={coveredCount} color="text-green-400" />
        <StatCard label="ימים פנויים"   value={emptyCount}   color="text-red-400" />
        <StatCard label="אחוז כיסוי"    value={`${coverage}%`}
          color={coverage >= 80 ? 'text-green-400' : coverage >= 50 ? 'text-yellow-400' : 'text-red-400'} />
        <StatCard label='סה"כ שיבוצים' value={shifts.length} />
      </div>

      {/* Bar chart */}
      <SectionBox title="שיבוצים לפי מתנדב">
        <OrangeBar data={barData} dataKey="שיבוצים" />
      </SectionBox>

      {/* Calendar heatmap */}
      <SectionBox title="לוח חודשי">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map(d => (
            <div key={d} className="text-center text-xs text-gray-500 font-medium py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array(firstDayOfWeek).fill(null).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
            const ds = `${year}-${String(mon).padStart(2,'0')}-${String(d).padStart(2,'0')}`
            const isCovered = coveredDates.has(ds)
            const isPast    = ds < today
            const cls = isCovered
              ? 'bg-green-500/40 text-green-300'
              : isPast ? 'bg-red-500/25 text-red-400' : 'bg-gray-800 text-gray-500'
            return (
              <div key={d} className={`aspect-square flex items-center justify-center rounded-lg text-xs font-medium ${cls}`}>
                {d}
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500/40 inline-block" />מכוסה</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/25 inline-block" />פנוי</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-800 inline-block" />עתידי</span>
        </div>
      </SectionBox>

      {/* Shifts table */}
      <SectionBox title="כל השיבוצים החודש">
        {shifts.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-right py-2 px-3 text-gray-400 font-medium text-xs">תאריך</th>
                  <th className="text-right py-2 px-3 text-gray-400 font-medium text-xs">מתנדב</th>
                </tr>
              </thead>
              <tbody>
                {[...shifts].sort((a, b) => a.date.localeCompare(b.date)).map(s => (
                  <tr key={s.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                    <td className="py-2 px-3 text-gray-400 text-xs">{fmtShort(s.date)}</td>
                    <td className="py-2 px-3 text-gray-200">{s.volunteerName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionBox>

      {/* Not signed up */}
      {notSignedUp.length > 0 && (
        <SectionBox title={`לא נרשמו החודש (${notSignedUp.length})`}>
          <div className="flex flex-wrap gap-2">
            {notSignedUp.map(v => (
              <span key={v.id} className="bg-red-500/10 text-red-300 border border-red-500/20 px-3 py-1 rounded-full text-sm">
                {v.firstName} {v.lastName}
              </span>
            ))}
          </div>
        </SectionBox>
      )}
    </div>
  )
}

// ── TAB 2 — Shabbat ────────────────────────────────────────────────────────

function ShabbatTab({ branchId, month }) {
  const [shabbatShifts, setShabbatShifts] = useState([])
  const [areas, setAreas]         = useState([])
  const [volunteers, setVolunteers] = useState([])
  const [loading, setLoading]     = useState(true)
  const { year, month: mon } = parseMonth(month)

  useEffect(() => {
    if (!branchId) return
    setLoading(true)
    Promise.all([
      getBranchMonthShabbatShifts(branchId, month),
      getBranchSettings(branchId),
      getBranchUsers(branchId),
    ]).then(([shifts, settings, users]) => {
      setShabbatShifts(shifts)
      setAreas(settings?.shabbat?.areas || [])
      setVolunteers(users.filter(hasShabbatPerm))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [branchId, month])

  // Unique Fridays with any activity, plus all Fridays in the month
  const fridaysInMonth = useMemo(() => {
    const fridays = []
    const d = new Date(year, mon - 1, 1)
    while (d.getMonth() === mon - 1) {
      if (d.getDay() === 5) {
        const ds = `${year}-${String(mon).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        fridays.push(ds)
      }
      d.setDate(d.getDate() + 1)
    }
    return fridays
  }, [year, mon])

  const confirmedShifts = useMemo(() => shabbatShifts.filter(s => s.status === 'confirmed'), [shabbatShifts])

  // Per-friday: is it "fully covered" (all areas have ≥ required confirmed volunteers)?
  const fridayCoverage = useMemo(() => {
    return fridaysInMonth.map(fri => {
      const dayShifts = confirmedShifts.filter(s => s.shabbatDate === fri)
      let allCovered = areas.length > 0
      areas.forEach(({ name, required }) => {
        const count = dayShifts.filter(s => s.area === name).length
        if (count < required) allCovered = false
      })
      return { date: fri, covered: dayShifts.length > 0 && allCovered, shifts: dayShifts }
    })
  }, [fridaysInMonth, confirmedShifts, areas])

  const fullyCoveredCount = fridayCoverage.filter(f => f.covered).length
  const missingCount      = fridaysInMonth.length - fullyCoveredCount

  // Bar chart: confirmed shifts per volunteer
  const barData = useMemo(() => {
    const counts = {}
    confirmedShifts.forEach(s => {
      if (!counts[s.volunteerId]) counts[s.volunteerId] = { name: s.volunteerName, count: 0 }
      counts[s.volunteerId].count++
    })
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .map(v => ({ name: v.name?.split(' ')[0] ?? '?', fullName: v.name, שיבוצים: v.count }))
  }, [confirmedShifts])

  // Area coverage %
  const areaCoverage = useMemo(() => {
    return areas.map(({ name, required }) => {
      let coveredFridays = 0
      fridaysInMonth.forEach(fri => {
        const count = confirmedShifts.filter(s => s.shabbatDate === fri && s.area === name).length
        if (count >= required) coveredFridays++
      })
      const pct = fridaysInMonth.length ? Math.round((coveredFridays / fridaysInMonth.length) * 100) : 0
      return { name, pct, coveredFridays, total: fridaysInMonth.length }
    })
  }, [areas, fridaysInMonth, confirmedShifts])

  if (loading) return <div className="py-16 flex justify-center"><LoadingSpinner size="md" text="טוען..." /></div>

  return (
    <div className="space-y-5" dir="rtl">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label='שבתות כוסו מלא'     value={fullyCoveredCount} color="text-green-400" />
        <StatCard label='שבתות חסרות'         value={missingCount}       color="text-red-400" />
        <StatCard label='תורנים פעילים שבת'  value={volunteers.length}  />
      </div>

      {/* Bar chart */}
      <SectionBox title="שיבוצי שבת מאושרים לפי מתנדב">
        <OrangeBar data={barData} dataKey="שיבוצים" />
      </SectionBox>

      {/* Per shabbat table */}
      <SectionBox title="פירוט לפי שבת">
        {fridayCoverage.length === 0 ? <EmptyState /> : fridayCoverage.map(({ date, shifts: dayShifts }) => {
          const byArea = {}
          areas.forEach(a => { byArea[a.name] = [] })
          dayShifts.forEach(s => {
            if (!byArea[s.area]) byArea[s.area] = []
            byArea[s.area].push(s.volunteerName)
          })
          const hasData = Object.values(byArea).some(v => v.length > 0) || dayShifts.length > 0
          return (
            <div key={date} className="mb-4 pb-4 border-b border-gray-800 last:border-0 last:mb-0 last:pb-0">
              <p className="font-medium text-orange-400 text-sm mb-2">שבת {fmtShort(date)}</p>
              {!hasData ? (
                <p className="text-gray-600 text-xs">אין שיבוצים מאושרים</p>
              ) : (
                <div className="space-y-1">
                  {areas.map(({ name, required }) => {
                    const vols = byArea[name] || []
                    const ok   = vols.length >= required
                    return (
                      <div key={name} className="flex items-center gap-2 text-sm">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${ok ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                          {ok ? '✓' : '✗'}
                        </span>
                        <span className="text-gray-400 w-24 shrink-0">{name}</span>
                        <span className="text-gray-200">{vols.join(', ') || '—'}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </SectionBox>

      {/* Area coverage summary */}
      {areaCoverage.length > 0 && (
        <SectionBox title="כיסוי ממוצע לפי אזור">
          <div className="space-y-3">
            {areaCoverage.map(({ name, pct, coveredFridays, total }) => (
              <div key={name}>
                <div className="flex items-center justify-between mb-1 text-sm">
                  <span className="text-gray-300">{name}</span>
                  <span className={pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'}>
                    {pct}% ({coveredFridays}/{total} שבתות)
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SectionBox>
      )}
    </div>
  )
}

// ── TAB 3 — Events ─────────────────────────────────────────────────────────

function EventsTab({ branchId, month }) {
  const [events, setEvents]       = useState([])
  const [responsesMap, setResponsesMap] = useState({}) // eventId → responses[]
  const [branchUsers, setBranchUsers]   = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    if (!branchId) return
    setLoading(true)

    const loadData = async () => {
      // Query all branch events, filter client-side by month (avoids composite index)
      const snap = await getDocs(query(collection(db, 'events'), where('branchId', '==', branchId)))
      const allEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const monthEvents = allEvents.filter(e => e.date?.startsWith(month))

      const [users, ...allResponses] = await Promise.all([
        getBranchUsers(branchId),
        ...monthEvents.map(e => getEventResponses(e.id)),
      ])

      const map = {}
      monthEvents.forEach((e, i) => { map[e.id] = allResponses[i] || [] })

      setEvents(monthEvents.sort((a, b) => a.date.localeCompare(b.date)))
      setResponsesMap(map)
      setBranchUsers(users)
    }

    loadData().catch(() => {}).finally(() => setLoading(false))
  }, [branchId, month])

  const stats = useMemo(() => {
    let totalResponded = 0, totalGoing = 0, totalInvited = 0
    events.forEach(e => {
      const rs = responsesMap[e.id] || []
      totalResponded += rs.length
      totalGoing += rs.filter(r => r.response === 'going').length
      totalInvited += branchUsers.length
    })
    const responseRate = totalInvited > 0 ? Math.round((totalResponded / totalInvited) * 100) : 0
    const avgAttendees = events.length > 0 ? Math.round(totalGoing / events.length) : 0
    return { responseRate, avgAttendees }
  }, [events, responsesMap, branchUsers])

  const tableData = useMemo(() => events.map(e => {
    const rs = responsesMap[e.id] || []
    const going    = rs.filter(r => r.response === 'going').length
    const maybe    = rs.filter(r => r.response === 'maybe').length
    const notGoing = rs.filter(r => r.response === 'not_going').length
    const notAnswered = branchUsers.length - rs.length
    const rate = branchUsers.length > 0 ? Math.round((rs.length / branchUsers.length) * 100) : 0
    return { ...e, going, maybe, notGoing, notAnswered, rate }
  }), [events, responsesMap, branchUsers])

  const barData = tableData.map(e => ({
    name: e.title?.length > 12 ? e.title.slice(0, 12) + '…' : (e.title || '?'),
    'מגיעים': e.going,
  }))

  if (loading) return <div className="py-16 flex justify-center"><LoadingSpinner size="md" text="טוען..." /></div>

  return (
    <div className="space-y-5" dir="rtl">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="אירועים החודש"    value={events.length} />
        <StatCard label="ממוצע מגיעים"     value={stats.avgAttendees} color="text-green-400" />
        <StatCard label="אחוז מענה"        value={`${stats.responseRate}%`}
          color={stats.responseRate >= 70 ? 'text-green-400' : stats.responseRate >= 40 ? 'text-yellow-400' : 'text-red-400'} />
      </div>

      {/* Bar chart */}
      <SectionBox title="מגיעים לפי אירוע">
        <OrangeBar data={barData} dataKey="מגיעים" />
      </SectionBox>

      {/* Events table */}
      <SectionBox title="פירוט אירועים">
        {events.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  {['שם','תאריך','מגיעים','אולי','לא מגיעים','לא ענו','% מענה'].map(h => (
                    <th key={h} className="text-right py-2 px-2 text-gray-400 font-medium text-xs whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.map(e => (
                  <tr key={e.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                    <td className="py-2 px-2 text-gray-200 font-medium max-w-32 truncate">{e.title}</td>
                    <td className="py-2 px-2 text-gray-400 text-xs whitespace-nowrap">{fmtShort(e.date)}</td>
                    <td className="py-2 px-2 text-green-400 font-bold text-center">{e.going}</td>
                    <td className="py-2 px-2 text-yellow-400 text-center">{e.maybe}</td>
                    <td className="py-2 px-2 text-gray-500 text-center">{e.notGoing}</td>
                    <td className="py-2 px-2 text-red-400/70 text-center">{e.notAnswered}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`text-xs font-medium ${e.rate >= 70 ? 'text-green-400' : e.rate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {e.rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionBox>
    </div>
  )
}

// ── TAB 4 — Volunteers ─────────────────────────────────────────────────────

function VolunteersTab({ branchId, month }) {
  const [users, setUsers]               = useState([])
  const [nightShifts, setNightShifts]   = useState([])
  const [shabbatShifts, setShabbatShifts] = useState([])
  const [loading, setLoading]           = useState(true)
  const [sortBy, setSortBy]             = useState('name')
  const { year, month: mon } = parseMonth(month)

  useEffect(() => {
    if (!branchId) return
    setLoading(true)
    Promise.all([
      getBranchUsers(branchId),
      getMonthShifts(branchId, year, mon),
      getBranchMonthShabbatShifts(branchId, month),
    ]).then(([u, ns, ss]) => {
      setUsers(u)
      setNightShifts(ns)
      setShabbatShifts(ss.filter(s => s.status === 'confirmed'))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [branchId, month])

  const volunteerStats = useMemo(() => {
    return users.map(v => {
      const ns = nightShifts.filter(s => s.volunteerId === v.id).length
      const ss = shabbatShifts.filter(s => s.volunteerId === v.id).length
      const active = ns > 0 || ss > 0
      return { ...v, nightCount: ns, shabbatCount: ss, active }
    })
  }, [users, nightShifts, shabbatShifts])

  const sorted = useMemo(() => {
    return [...volunteerStats].sort((a, b) => {
      if (sortBy === 'name')         return `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`, 'he')
      if (sortBy === 'night')        return b.nightCount - a.nightCount
      if (sortBy === 'shabbat')      return b.shabbatCount - a.shabbatCount
      if (sortBy === 'active')       return (b.active ? 1 : 0) - (a.active ? 1 : 0)
      return 0
    })
  }, [volunteerStats, sortBy])

  const activeCount   = volunteerStats.filter(v => v.active).length
  const inactiveCount = volunteerStats.length - activeCount

  if (loading) return <div className="py-16 flex justify-center"><LoadingSpinner size="md" text="טוען..." /></div>

  return (
    <div className="space-y-5" dir="rtl">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label='סה"כ מתנדבים פעילים'     value={users.length} />
        <StatCard label="פעילים החודש"             value={activeCount}   color="text-green-400" />
        <StatCard label="לא פעילים החודש"          value={inactiveCount} color="text-red-400" />
      </div>

      {/* Sort controls + table */}
      <SectionBox title="פעילות לפי מתנדב">
        <div className="flex gap-2 mb-4 flex-wrap">
          <span className="text-xs text-gray-500 self-center">מיין לפי:</span>
          {[['name','שם'],['night','לילה'],['shabbat','שבת'],['active','פעיל']].map(([val, lbl]) => (
            <button key={val} onClick={() => setSortBy(val)}
              className={`px-3 py-1 rounded-xl text-xs font-medium transition
                ${sortBy === val ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'}`}>
              {lbl}
            </button>
          ))}
        </div>

        {users.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  {['שם','תורניות לילה','תורני שבת','סטטוס'].map(h => (
                    <th key={h} className="text-right py-2 px-3 text-gray-400 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(v => (
                  <tr key={v.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                    <td className="py-2.5 px-3 text-gray-200 font-medium">{v.firstName} {v.lastName}</td>
                    <td className="py-2.5 px-3 text-center">
                      {v.nightCount > 0
                        ? <span className="text-orange-400 font-bold">{v.nightCount}</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {v.shabbatCount > 0
                        ? <span className="text-orange-400 font-bold">{v.shabbatCount}</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full
                        ${v.active ? 'bg-green-500/15 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                        {v.active ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionBox>
    </div>
  )
}

// ── Main ReportsPage ───────────────────────────────────────────────────────

const TABS = [
  { icon: '🌙', label: 'תורניות לילה' },
  { icon: '🕍', label: 'תורני שבת' },
  { icon: '🎉', label: 'ערבי גיבוש' },
  { icon: '👥', label: 'מתנדבים' },
]

export default function ReportsPage() {
  const { isBranchHead, isSystemAdmin, branchId: userBranchId } = useRole()
  const canAccess = isBranchHead || isSystemAdmin

  const [adminBranchId, setAdminBranchId] = useState(null)
  const branchId = isSystemAdmin ? adminBranchId : userBranchId

  const [activeTab, setActiveTab]       = useState(0)
  const [selectedMonth, setSelectedMonth] = useState(DEFAULT_MONTH)

  if (!canAccess) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64 text-center">
        <span className="text-5xl mb-4">🔒</span>
        <h2 className="text-xl font-bold text-gray-200 mb-2">אין גישה</h2>
        <p className="text-gray-400">דף זה מיועד למנהלי סניף בלבד.</p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-2xl font-black text-gray-100 flex items-center gap-2">📊 דוחות</h1>
        <MonthPicker value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      {/* Branch selector — system_admin only */}
      <BranchSelector value={adminBranchId} onChange={setAdminBranchId} />

      {isSystemAdmin && !branchId ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🌐</div>
          <p className="text-gray-300 font-medium">בחר סניף כדי לצפות בדוחות</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-900 p-1 rounded-2xl border border-gray-800 mb-6 overflow-x-auto">
            {TABS.map((t, i) => (
              <button key={i} onClick={() => setActiveTab(i)}
                className={`flex-1 whitespace-nowrap py-2 px-3 rounded-xl text-sm font-medium transition
                  ${activeTab === i ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 0 && <NightShiftsTab  branchId={branchId} month={selectedMonth} />}
          {activeTab === 1 && <ShabbatTab       branchId={branchId} month={selectedMonth} />}
          {activeTab === 2 && <EventsTab        branchId={branchId} month={selectedMonth} />}
          {activeTab === 3 && <VolunteersTab    branchId={branchId} month={selectedMonth} />}
        </>
      )}
    </div>
  )
}
