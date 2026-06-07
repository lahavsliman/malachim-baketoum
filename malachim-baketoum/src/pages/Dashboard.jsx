import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { format, getDaysInMonth, isBefore, parseISO, nextFriday, isFriday, isThursday } from 'date-fns'
import { he } from 'date-fns/locale'
import { useAuth } from '../context/AuthContext'
import { useRole } from '../hooks/useRole'
import { useBranch } from '../hooks/useBranch'
import { getMonthShifts } from '../firebase/nightShifts'
import { getShabbatShifts, getVolunteerMonthShabbatShifts, submitShabbatAvailability } from '../firebase/shabbatShifts'
import { getUserNotifications } from '../firebase/notifications'
import { getBranchSettings } from '../firebase/branches'
import { getBranchUsers } from '../firebase/users'
import { searchBuildingCodes } from '../firebase/buildingCodes'
import LoadingSpinner from '../shared/LoadingSpinner'

// ── Helpers ───────────────────────────────────────────────────────────────────

const hasPerm = (user, key) =>
  user?.permissions?.[key] === true || user?.[key] === true

const toIsraeliDate = (dateStr) => {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

const NOTIF_ICONS = {
  shift_reminder:    '🌙',
  shift_cancelled:   '❌',
  shabbat_confirmed: '🕍',
  event_invite:      '🎉',
  general:           '📢',
}

function timeAgo(ts) {
  if (!ts) return ''
  try {
    const date = ts?.toDate ? ts.toDate() : new Date(ts)
    return format(date, 'dd/MM HH:mm')
  } catch { return '' }
}

const MEDALS = ['🥇', '🥈', '🥉']

// ── Generic dashboard (branch_head, system_admin, role_holder) ────────────────

const DashCard = ({ to, icon, title, subtitle, color = 'orange' }) => {
  const colors = {
    orange: 'border-orange-500/30 hover:border-orange-400/60 hover:bg-orange-500/5',
    blue:   'border-blue-500/30 hover:border-blue-400/60 hover:bg-blue-500/5',
    purple: 'border-purple-500/30 hover:border-purple-400/60 hover:bg-purple-500/5',
    green:  'border-green-500/30 hover:border-green-400/60 hover:bg-green-500/5',
  }
  return (
    <Link
      to={to}
      className={`block bg-gray-900 border rounded-2xl p-5 transition-all duration-200 ${colors[color]}`}
    >
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-bold text-gray-200">{title}</h3>
      {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
    </Link>
  )
}

function GenericDashboard({ user, branch }) {
  const { isSystemAdmin, isBranchHead, canManageNightShifts, canManageShabbat,
          canAccessBuildingCodes, canManageBranch, hasNightShifts, hasShabbat } = useRole()
  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'בוקר טוב'
    if (h < 18) return 'צהריים טובים'
    return 'ערב טוב'
  }
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black text-gray-100">
          {greeting()}, {user?.firstName} 👋
        </h1>
        {branch && <p className="text-gray-400 mt-1">סניף {branch.name}</p>}
        {isSystemAdmin && <p className="text-orange-400 mt-1 font-medium">מנהל מערכת — גישה לכל הסניפים</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(hasNightShifts || canManageNightShifts) && <DashCard to="/night-shifts" icon="🌙" title="שיבוצי לילה" subtitle={canManageNightShifts ? 'ניהול שיבוצי לילה' : 'הרשמה ומעקב'} color="blue" />}
        {(hasShabbat || canManageShabbat) && <DashCard to="/shabbat" icon="🕍" title="תורני שבת" subtitle={canManageShabbat ? 'ניהול תורני שבת' : 'דווח זמינות'} color="purple" />}
        {canAccessBuildingCodes && <DashCard to="/building-codes" icon="🔑" title="קודי בניין" subtitle="חיפוש וניהול קודים" color="green" />}
        {isBranchHead && <DashCard to="/branch-management" icon="⚙️" title="ניהול סניף" subtitle="מתנדבים, הרשאות ותפקידים" color="orange" />}
        {isSystemAdmin && <DashCard to="/system-admin" icon="🌐" title="כל הסניפים" subtitle="ניהול מערכת רחב" color="orange" />}
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 opacity-50 cursor-not-allowed">
          <div className="text-3xl mb-3">🎉</div>
          <h3 className="font-bold text-gray-400">ערבי גיבוש</h3>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full mt-2 inline-block">בקרוב</span>
        </div>
      </div>
    </div>
  )
}

// ── Volunteer dashboard ───────────────────────────────────────────────────────

function VolunteerDashboard({ user, branch }) {
  const now         = new Date()
  const year        = now.getFullYear()
  const month       = now.getMonth() + 1
  const todayStr    = format(now, 'yyyy-MM-dd')
  const monthStr    = format(now, 'yyyy-MM')
  const daysInMonth = getDaysInMonth(now)
  const daysLeft    = daysInMonth - now.getDate()

  const hasNight   = hasPerm(user, 'nightShifts')
  const hasShabbat = hasPerm(user, 'shabbatVolunteer')

  // Is today Thu or Fri?
  const showShabbatBanner = hasShabbat && (isThursday(now) || isFriday(now))

  // Next Friday date string for shabbat availability
  const nextFri     = isFriday(now) ? now : nextFriday(now)
  const nextFriStr  = format(nextFri, 'yyyy-MM-dd')
  const nextFriLabel = format(nextFri, "EEEE d בMMMM", { locale: he })

  // ── Data state ──
  const [loading,         setLoading]         = useState(true)
  const [myNightShifts,   setMyNightShifts]   = useState([])  // this month, mine
  const [allNightShifts,  setAllNightShifts]  = useState([])  // this month, all branch
  const [myShabbatShifts, setMyShabbatShifts] = useState([])  // this month, mine
  const [notifications,   setNotifications]   = useState([])
  const [shabbatSubmitting, setShabbatSubmitting] = useState(false)
  const [shabbatError,      setShabbatError]      = useState('')

  useEffect(() => {
    if (!user?.id || !user?.branchId) return
    const load = async () => {
      setLoading(true)
      const results = await Promise.allSettled([
        hasNight   ? getMonthShifts(user.branchId, year, month)                              : Promise.resolve([]),
        hasNight   ? getMonthShifts(user.branchId, year, month)                              : Promise.resolve([]),
        hasShabbat ? getVolunteerMonthShabbatShifts(user.branchId, user.id, monthStr)        : Promise.resolve([]),
        getUserNotifications(user.id),
      ])

      // All branch night shifts (for leaderboard)
      if (hasNight) {
        const allSnap = await getMonthShifts(user.branchId, year, month)
        setAllNightShifts(allSnap)
        setMyNightShifts(allSnap.filter(s => s.volunteerId === user.id))
      }
      if (hasShabbat && results[2].status === 'fulfilled') {
        setMyShabbatShifts(results[2].value)
      }
      if (results[3].status === 'fulfilled') {
        setNotifications(results[3].value)
      }
      setLoading(false)
    }
    load()
  }, [user?.id, user?.branchId])

  // ── Derived values ──

  // Upcoming shifts (future dates)
  const upcomingNight = myNightShifts
    .filter(s => s.date > todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  const upcomingShabbat = myShabbatShifts
    .filter(s => s.shabbatDate > todayStr && s.status !== 'cancelled')
    .sort((a, b) => a.shabbatDate.localeCompare(b.shabbatDate))[0]

  const nextShift = (() => {
    if (!upcomingNight && !upcomingShabbat) return null
    if (!upcomingNight) return { date: upcomingShabbat.shabbatDate, type: 'shabbat' }
    if (!upcomingShabbat) return { date: upcomingNight.date, type: 'night' }
    return upcomingNight.date <= upcomingShabbat.shabbatDate
      ? { date: upcomingNight.date, type: 'night' }
      : { date: upcomingShabbat.shabbatDate, type: 'shabbat' }
  })()

  // Lottery eligibility: ≥1 night shift this month
  const isEligible = myNightShifts.length > 0

  // Has already signed up for this month's night shift
  const signedUpThisMonth = myNightShifts.length > 0

  // Already responded to shabbat availability this Friday
  const shabbatResponse = myShabbatShifts.find(s => s.shabbatDate === nextFriStr)

  // Leaderboard top 3
  const leaderboard = (() => {
    const counts = {}
    const names  = {}
    allNightShifts.forEach(s => {
      counts[s.volunteerId] = (counts[s.volunteerId] || 0) + 1
      names[s.volunteerId]  = s.volunteerName
    })
    return Object.entries(counts)
      .map(([id, count]) => ({ id, name: names[id], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
  })()

  // ── Handlers ──

  const handleShabbatResponse = async (available) => {
    if (!available) {
      // "לא זמין" — just mark locally (no Firestore write needed for unavailability)
      setShabbatError('')
      return
    }
    setShabbatSubmitting(true)
    setShabbatError('')
    try {
      await submitShabbatAvailability(
        user.branchId,
        nextFriStr,
        user.id,
        `${user.firstName} ${user.lastName}`,
        user.shabbatArea || user.permissions?.shabbatArea || 'לא הוגדר'
      )
      // Refresh shabbat shifts
      const updated = await getVolunteerMonthShabbatShifts(user.branchId, user.id, monthStr)
      setMyShabbatShifts(updated)
    } catch (e) {
      setShabbatError('שגיאה בשמירה, נסה שנית')
    } finally {
      setShabbatSubmitting(false)
    }
  }

  // ── Greeting ──
  const greeting = () => {
    const h = now.getHours()
    if (h < 12) return 'בוקר טוב'
    if (h < 18) return 'צהריים טובים'
    return 'ערב טוב'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text="טוען נתונים..." />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5 pb-20 lg:pb-6">

      {/* ── 1. Personal Status Card ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-100">
              {greeting()}, {user?.firstName}! 👋
            </h1>
            {branch && (
              <p className="text-sm text-gray-400 mt-0.5">סניף {branch.name}</p>
            )}
            {user?.volunteerId && (
              <p className="text-xs text-gray-500 mt-0.5">
                קוד כונן: <span className="font-mono text-gray-400">{user.volunteerId}</span>
              </p>
            )}
          </div>
          {/* Lottery badge */}
          {hasNight && (
            <div className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border
              ${isEligible
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
              <span>{isEligible ? '✅' : '❌'}</span>
              <span>{isEligible ? 'זכאי להגרלה' : 'לא זכאי להגרלה'}</span>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {hasNight && (
            <div className="bg-gray-800/60 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-blue-400">{myNightShifts.length}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-tight">תורנויות לילה<br/>החודש</p>
            </div>
          )}
          {hasShabbat && (
            <div className="bg-gray-800/60 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-purple-400">
                {myShabbatShifts.filter(s => s.status === 'confirmed').length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 leading-tight">שבתות מאושרות<br/>החודש</p>
            </div>
          )}
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-gray-300">{daysLeft}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">ימים לסוף<br/>החודש</p>
          </div>
        </div>

        {/* Next shift */}
        <div className="mt-4 pt-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 mb-1">משמרת קרובה</p>
          {nextShift ? (
            <div className="flex items-center gap-2">
              <span className="text-lg">{nextShift.type === 'night' ? '🌙' : '🕍'}</span>
              <span className="font-semibold text-gray-200">
                {nextShift.type === 'night' ? 'תורנות לילה' : 'תורנות שבת'}
              </span>
              <span className="text-gray-400 text-sm mr-auto">{toIsraeliDate(nextShift.date)}</span>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">אין לך משמרת קרובה</p>
          )}
        </div>
      </div>

      {/* ── 2. Night Shift Urgency Banner ── */}
      {hasNight && !signedUpThisMonth && (
        <div className={`rounded-2xl px-5 py-4 border flex items-start gap-3
          ${daysLeft <= 5
            ? 'urgency-flash border-red-500/40'
            : 'bg-orange-500/10 border-orange-500/30'}`}>
          <span className="text-2xl shrink-0">🚨</span>
          <div className="flex-1">
            <p className={`font-bold ${daysLeft <= 5 ? 'text-red-300' : 'text-orange-300'}`}>
              עוד לא נרשמת לתורנות לילה החודש!
            </p>
            <p className="text-sm text-gray-400 mt-0.5">
              נשארו <span className="font-bold text-gray-200">{daysLeft} ימים</span> לסוף החודש
              {daysLeft <= 5 && ' — מהר!'}
            </p>
          </div>
          <Link
            to="/night-shifts"
            className={`shrink-0 text-sm font-bold px-3 py-1.5 rounded-xl transition
              ${daysLeft <= 5
                ? 'bg-red-500 hover:bg-red-400 text-white'
                : 'bg-orange-500 hover:bg-orange-400 text-white'}`}
          >
            הרשם עכשיו
          </Link>
        </div>
      )}

      {/* ── 3. Shabbat Availability Banner (Thu+Fri only) ── */}
      {showShabbatBanner && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🕍</span>
            <h3 className="font-bold text-purple-200">תורנות שבת הקרובה</h3>
            <span className="text-sm text-gray-400 mr-auto">{nextFriLabel}</span>
          </div>

          {shabbatResponse ? (
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-xl border
                ${shabbatResponse.status === 'cancelled'
                  ? 'bg-gray-800 border-gray-700 text-gray-400'
                  : 'bg-purple-500/20 border-purple-500/30 text-purple-300'}`}>
                <span>{shabbatResponse.status === 'cancelled' ? '❌' : '✅'}</span>
                <span>
                  {shabbatResponse.status === 'cancelled'
                    ? 'דיווחת: לא זמין'
                    : shabbatResponse.status === 'confirmed'
                      ? 'אושרת לתורנות!'
                      : 'דיווחת: זמין — ממתין לאישור'}
                </span>
              </div>
              <button
                onClick={() => setMyShabbatShifts(s => s.filter(x => x.id !== shabbatResponse.id))}
                className="text-xs text-gray-500 hover:text-gray-300 transition"
              >
                שנה תגובה
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-300 mb-3">
                האם אתה זמין לתורנות השבת הקרובה?
              </p>
              {shabbatError && (
                <p className="text-red-400 text-xs mb-2">{shabbatError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => handleShabbatResponse(true)}
                  disabled={shabbatSubmitting}
                  className="flex-1 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
                >
                  {shabbatSubmitting ? '...' : <>✅ כן, זמין</>}
                </button>
                <button
                  onClick={() => handleShabbatResponse(false)}
                  disabled={shabbatSubmitting}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-bold py-2.5 rounded-xl transition border border-gray-700"
                >
                  ❌ לא זמין
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 4. Quick Actions ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">פעולות מהירות</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {hasNight && (
            <Link to="/night-shifts"
              className="flex flex-col items-center gap-2 bg-gray-900 border border-blue-500/20 hover:border-blue-400/40 hover:bg-blue-500/5 rounded-2xl p-4 transition text-center">
              <span className="text-2xl">🌙</span>
              <span className="text-xs font-medium text-gray-300 leading-tight">לשיבוץ<br/>לילה</span>
            </Link>
          )}
          {hasShabbat && (
            <Link to="/shabbat"
              className="flex flex-col items-center gap-2 bg-gray-900 border border-purple-500/20 hover:border-purple-400/40 hover:bg-purple-500/5 rounded-2xl p-4 transition text-center">
              <span className="text-2xl">🕍</span>
              <span className="text-xs font-medium text-gray-300 leading-tight">לתורנות<br/>שבת</span>
            </Link>
          )}
          <Link to="/messages"
            className="flex flex-col items-center gap-2 bg-gray-900 border border-gray-700 hover:border-gray-600 hover:bg-gray-800/40 rounded-2xl p-4 transition text-center">
            <span className="text-2xl">📢</span>
            <span className="text-xs font-medium text-gray-300">הודעות</span>
          </Link>
          <div className="flex flex-col items-center gap-2 bg-gray-900/50 border border-gray-800 rounded-2xl p-4 cursor-not-allowed opacity-50 text-center">
            <span className="text-2xl">🎉</span>
            <span className="text-xs font-medium text-gray-400 leading-tight">ערבי<br/>גיבוש</span>
            <span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded-full">בקרוב</span>
          </div>
        </div>
      </div>

      {/* ── 5. Recent Notifications ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h2 className="font-bold text-gray-200 text-sm">התראות אחרונות</h2>
          <Link to="/messages" className="text-xs text-orange-400 hover:text-orange-300 transition">
            לכל ההתראות →
          </Link>
        </div>
        {notifications.length === 0 ? (
          <div className="px-5 py-6 text-center text-gray-500 text-sm">אין התראות</div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {notifications.slice(0, 3).map(n => (
              <div key={n.id}
                className={`flex items-start gap-3 px-5 py-3
                  ${n.isRead ? '' : 'border-r-2 border-orange-500'}`}>
                <span className="text-lg shrink-0 mt-0.5">{NOTIF_ICONS[n.type] ?? '📢'}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${n.isRead ? 'text-gray-400' : 'text-gray-200'}`}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{n.body}</p>
                  )}
                </div>
                <span className="text-xs text-gray-600 shrink-0 mt-0.5">{timeAgo(n.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 6. Night Shift Leaderboard (top 3) ── */}
      {hasNight && leaderboard.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-200 flex items-center gap-2">
              <span>🌙</span> כבוד הלילה
            </h2>
            <Link to="/night-shifts" className="text-xs text-orange-400 hover:text-orange-300 transition">
              לוח שנה →
            </Link>
          </div>
          <div className="space-y-2">
            {leaderboard.map((v, i) => (
              <div key={v.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl
                  ${v.id === user?.id
                    ? 'bg-orange-500/10 border border-orange-500/20'
                    : 'bg-gray-800/40'}`}>
                <span className="text-xl w-8 text-center shrink-0">{MEDALS[i]}</span>
                <span className={`flex-1 font-medium text-sm
                  ${v.id === user?.id ? 'text-orange-300' : 'text-gray-200'}`}>
                  {v.name}
                  {v.id === user?.id && <span className="text-xs text-orange-400 mr-1">(את/ה)</span>}
                </span>
                <span className="text-xs bg-gray-700 text-gray-300 px-2.5 py-1 rounded-full font-bold shrink-0">
                  {v.count} תורנויות
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

// ── Branch Head dashboard ─────────────────────────────────────────────────────

function BranchHeadDashboard({ user, branch }) {
  const now          = new Date()
  const year         = now.getFullYear()
  const month        = now.getMonth() + 1
  const todayStr     = format(now, 'yyyy-MM-dd')
  const daysInMonth  = getDaysInMonth(now)

  const isThurOrFri  = isThursday(now) || isFriday(now)
  const nextFri      = isFriday(now) ? now : nextFriday(now)
  const nextFriStr   = format(nextFri, 'yyyy-MM-dd')
  const nextFriLabel = format(nextFri, 'd בMMMM', { locale: he })

  // ── Data ──
  const [loading,        setLoading]        = useState(true)
  const [nightShifts,    setNightShifts]    = useState([])
  const [shabbatShifts,  setShabbatShifts]  = useState([])
  const [branchSettings, setBranchSettings] = useState(null)
  const [branchUsers,    setBranchUsers]    = useState([])
  const [codesCount,     setCodesCount]     = useState(0)

  useEffect(() => {
    if (!user?.branchId) return
    const load = async () => {
      setLoading(true)
      const [n, s, cfg, u, codes] = await Promise.allSettled([
        getMonthShifts(user.branchId, year, month),
        getShabbatShifts(user.branchId, nextFriStr),
        getBranchSettings(user.branchId),
        getBranchUsers(user.branchId),
        searchBuildingCodes(user.branchId),
      ])
      if (n.status     === 'fulfilled') setNightShifts(n.value)
      if (s.status     === 'fulfilled') setShabbatShifts(s.value)
      if (cfg.status   === 'fulfilled') setBranchSettings(cfg.value)
      if (u.status     === 'fulfilled') setBranchUsers(u.value)
      if (codes.status === 'fulfilled') setCodesCount(codes.value.length)
      setLoading(false)
    }
    load()
  }, [user?.branchId])

  // ── Derived ──
  const coveredDays      = nightShifts.length
  const emptyDays        = daysInMonth - coveredDays
  const shabbatConfirmed = shabbatShifts.filter(s => s.status === 'confirmed').length

  // Upcoming empty days (next 14 days)
  const upcomingEmpty = []
  for (let d = now.getDate(); d <= Math.min(now.getDate() + 13, daysInMonth); d++) {
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (ds >= todayStr && !nightShifts.find(s => s.date === ds)) upcomingEmpty.push(ds)
  }

  // Volunteers with night permission who haven't signed up
  const signedUpIds = new Set(nightShifts.map(s => s.volunteerId))
  const notSignedUp = branchUsers.filter(v =>
    (v.permissions?.nightShifts === true || v.nightShifts === true) && !signedUpIds.has(v.id)
  )

  // Calendar dot data
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d  = i + 1
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return { d, ds, isPast: ds < todayStr, shift: nightShifts.find(s => s.date === ds) }
  })

  // Shabbat area statuses
  const areas        = branchSettings?.shabbat?.areas ?? []
  const areaStatuses = areas.map(area => {
    const count = shabbatShifts.filter(s => s.area === area.name && s.status !== 'cancelled').length
    return { ...area, count, sufficient: count >= (area.required ?? 1) }
  })

  // Recent activity feed (last 5)
  const recentActivity = [
    ...nightShifts
      .filter(s => s.signedUpAt)
      .map(s => ({ kind: 'night', name: s.volunteerName, date: s.date, ts: s.signedUpAt?.toDate?.() ?? null })),
    ...shabbatShifts
      .filter(s => s.submittedAt)
      .map(s => ({ kind: 'shabbat', name: s.volunteerName, date: s.shabbatDate, ts: s.submittedAt?.toDate?.() ?? null })),
  ]
    .filter(a => a.ts)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 5)

  const roleLabel = user?.role === 'branch_head' ? 'ראש סניף' : 'סגן ראש סניף'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text="טוען נתוני סניף..." />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5 pb-20 lg:pb-6" dir="rtl">

      {/* ══ 1. HEADER ══ */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <img
            src="/logo_unaited.svg"
            alt="איחוד הצלה"
            className="w-14 h-14 object-contain shrink-0 rounded-xl bg-white/5 p-1"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-gray-100 leading-tight">
              {user?.firstName} {user?.lastName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {user?.volunteerId && (
                <span className="text-xs text-gray-500">
                  קוד כונן: <span className="font-mono text-gray-300">{user.volunteerId}</span>
                </span>
              )}
              <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full border border-orange-500/20">
                {roleLabel}
              </span>
              {branch && (
                <span className="text-xs text-gray-400">סניף {branch.name}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══ 2. STATS ROW ══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1: Total volunteers */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-orange-400">{branchUsers.length}</p>
          <p className="text-xs text-gray-400 mt-1.5 leading-tight">כוננים<br/>בסניף</p>
        </div>

        {/* Card 2: Night shifts — empty / covered */}
        <Link to="/night-shifts" className="bg-gray-900 border border-gray-800 hover:border-blue-500/30 rounded-2xl p-4 text-center transition">
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-2xl font-black text-red-400">{emptyDays}</span>
            <span className="text-gray-600 text-sm font-light">/</span>
            <span className="text-2xl font-black text-green-400">{coveredDays}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1.5 leading-tight">לילה: פנוי / תפוס</p>
        </Link>

        {/* Card 3: Building codes */}
        <Link to="/building-codes" className="bg-gray-900 border border-gray-800 hover:border-green-500/30 rounded-2xl p-4 text-center transition">
          <p className="text-3xl font-black text-green-400">{codesCount}</p>
          <p className="text-xs text-gray-400 mt-1.5 leading-tight">קודי<br/>בניין</p>
        </Link>

        {/* Card 4: Shabbat confirmed */}
        <Link to="/shabbat" className="bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-2xl p-4 text-center transition">
          <p className="text-3xl font-black text-purple-400">{shabbatConfirmed}</p>
          <p className="text-xs text-gray-400 mt-1.5 leading-tight">מאושרים<br/>לשבת</p>
        </Link>
      </div>

      {/* ══ 3. NIGHT SHIFTS CALENDAR ══ */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h2 className="font-bold text-gray-200 flex items-center gap-2">
            <span>🌙</span> שיבוצי לילה — {format(now, 'MMMM yyyy', { locale: he })}
          </h2>
          <Link to="/night-shifts" className="text-xs text-orange-400 hover:text-orange-300 transition">
            לניהול ←
          </Link>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-1">
            {calendarDays.map(({ d, ds, isPast, shift }) => (
              <div
                key={d}
                title={`${toIsraeliDate(ds)}${shift ? ` — ${shift.volunteerName}` : ' — פנוי'}`}
                className={`w-7 h-7 rounded-lg text-[11px] flex items-center justify-center font-bold
                  ${isPast
                    ? 'bg-gray-800 text-gray-600'
                    : shift
                      ? 'bg-green-500/25 text-green-300 border border-green-500/30'
                      : ds === todayStr
                        ? 'bg-orange-500/30 text-orange-200 border border-orange-500/40 ring-1 ring-orange-500'
                        : 'bg-red-500/15 text-red-400 border border-red-500/20'
                  }`}
              >
                {d}
              </div>
            ))}
          </div>

          <div className="flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/30 inline-block border border-green-500/30" /> מכוסה</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/20 inline-block border border-red-500/20" /> פנוי</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-700 inline-block" /> עבר</span>
          </div>

          {notSignedUp.length > 0 ? (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-yellow-300">לא נרשמו עדיין — {notSignedUp.length} מתנדבים</p>
                <Link to="/night-shifts" className="text-xs text-orange-400 hover:text-orange-300">לצפייה ←</Link>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {notSignedUp.slice(0, 8).map(v => (
                  <span key={v.id} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
                    {v.firstName} {v.lastName}
                  </span>
                ))}
                {notSignedUp.length > 8 && (
                  <span className="text-xs text-gray-500 self-center">+{notSignedUp.length - 8} נוספים</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">
              <span>✅</span><span>כל המתנדבים נרשמו החודש!</span>
            </div>
          )}
        </div>
      </div>

      {/* ══ 4. URGENT ALERTS — days without coverage ══ */}
      {upcomingEmpty
        .filter(ds => Math.ceil((parseISO(ds) - now) / 86400000) <= 2)
        .slice(0, 3)
        .map(ds => {
          const daysUntil = Math.ceil((parseISO(ds) - now) / 86400000)
          return (
            <Link
              key={ds}
              to="/night-shifts"
              className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-3 hover:bg-red-500/15 transition"
            >
              <span className="text-xl shrink-0">⚠️</span>
              <div className="flex-1">
                <p className="font-bold text-red-300 text-sm">יום ללא כיסוי — {toIsraeliDate(ds)}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {daysUntil === 0 ? 'היום פנוי!' : daysUntil === 1 ? 'מחר פנוי!' : `עוד ${daysUntil} ימים`}
                </p>
              </div>
              <span className="text-xs text-red-400 font-medium shrink-0">לשיבוץ ←</span>
            </Link>
          )
        })
      }

      {/* ══ 5. RECENT BRANCH ACTIVITY ══ */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h2 className="font-bold text-gray-200 text-sm">פעילות אחרונה בסניף</h2>
        </div>
        {recentActivity.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 text-sm">
            <p className="text-2xl mb-2">📋</p>
            <p>אין פעילות אחרונה</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="text-lg shrink-0">{a.kind === 'night' ? '🌙' : '🕍'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-gray-400">
                      {a.kind === 'night'
                        ? ` נרשם לתורנות לילה — ${toIsraeliDate(a.date)}`
                        : ` דיווח זמינות לשבת — ${toIsraeliDate(a.date)}`}
                    </span>
                  </p>
                </div>
                <span className="text-xs text-gray-600 shrink-0">{a.ts ? format(a.ts, 'HH:mm') : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ 6. SHABBAT PANEL (prominent Thu/Fri) ══ */}
      <div className={`border rounded-2xl overflow-hidden ${
        isThurOrFri ? 'border-purple-500/40 bg-purple-500/5' : 'border-gray-800 bg-gray-900'
      }`}>
        <div className={`flex items-center justify-between px-5 py-3 border-b ${
          isThurOrFri ? 'border-purple-500/30' : 'border-gray-800'
        }`}>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-gray-200 flex items-center gap-2">
              <span>🕍</span> תורני שבת
            </h2>
            {isThurOrFri && (
              <span className="text-xs bg-red-500/20 border border-red-500/30 text-red-300 px-2 py-0.5 rounded-full animate-pulse">
                יש לאשר שיבוץ שבת!
              </span>
            )}
          </div>
          <Link to="/shabbat" className="text-xs text-orange-400 hover:text-orange-300 transition shrink-0">
            לאישור שיבוץ שבת ←
          </Link>
        </div>

        <div className="p-5">
          <p className="text-sm text-gray-400 mb-4">
            שבת {nextFriLabel} — {shabbatShifts.filter(s => s.status !== 'cancelled').length} דיווחי זמינות
          </p>

          {areaStatuses.length === 0 ? (
            <div className="text-center py-4 text-gray-500 text-sm space-y-1">
              <p>לא הוגדרו אזורי שבת לסניף</p>
              <Link to="/branch-management" className="text-orange-400 hover:text-orange-300 text-xs inline-block">
                הגדר אזורים ←
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {areaStatuses.map(area => (
                <div
                  key={area.name}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-medium
                    ${area.sufficient
                      ? 'bg-green-500/10 border-green-500/25 text-green-300'
                      : 'bg-red-500/10 border-red-500/25 text-red-300'}`}
                >
                  <span className="truncate">{area.name}</span>
                  <span className="font-bold shrink-0 mr-2">
                    {area.count}/{area.required ?? 1} {area.sufficient ? '✅' : '❌'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ 7. QUICK ACTIONS ══ */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">פעולות מהירות</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/night-shifts',      icon: '🌙', label: 'ניהול\nשיבוצי לילה', color: 'blue' },
            { to: '/shabbat',           icon: '🕍', label: 'ניהול\nתורני שבת',   color: 'purple' },
            { to: '/branch-management', icon: '👥', label: 'ניהול\nמתנדבים',     color: 'gray' },
            { to: '/messages',          icon: '📢', label: 'שלח הודעה\nלסניף',   color: 'gray' },
          ].map(({ to, icon, label, color }) => (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-2 bg-gray-900 rounded-2xl p-4 transition text-center border
                ${color === 'blue'   ? 'border-blue-500/20 hover:border-blue-400/40 hover:bg-blue-500/5' :
                  color === 'purple' ? 'border-purple-500/20 hover:border-purple-400/40 hover:bg-purple-500/5' :
                                       'border-gray-700 hover:border-gray-600 hover:bg-gray-800/40'}`}
            >
              <span className="text-2xl">{icon}</span>
              <span className="text-xs font-medium text-gray-300 leading-tight whitespace-pre-line">{label}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()
  const { branch } = useBranch()

  if (!user) return null

  if (user.role === 'volunteer')
    return <VolunteerDashboard user={user} branch={branch} />

  if (user.role === 'branch_head' || user.role === 'branch_deputy')
    return <BranchHeadDashboard user={user} branch={branch} />

  return <GenericDashboard user={user} branch={branch} />
}
