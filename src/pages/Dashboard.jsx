import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, getDaysInMonth, isBefore, parseISO, nextFriday, isFriday, isThursday } from 'date-fns'
import { he } from 'date-fns/locale'
import { useAuth } from '../context/AuthContext'
import { useRole } from '../hooks/useRole'
import { useNavItems } from '../hooks/useNavItems'
import { useBranch } from '../hooks/useBranch'
import { getMonthShifts } from '../firebase/nightShifts'
import { getShabbatShifts, getVolunteerMonthShabbatShifts, submitShabbatAvailability } from '../firebase/shabbatShifts'
import { getUserNotifications } from '../firebase/notifications'
import { getBranchSettings } from '../firebase/branches'
import { getBranchUsers } from '../firebase/users'
import { searchBuildingCodes } from '../firebase/buildingCodes'
import LoadingSpinner from '../shared/LoadingSpinner'
import {
  Moon, Star, Buildings, Sliders, Globe, UsersThree,
  ChatCircle, ChartBar, Warning, ClipboardText, MegaphoneSimple,
} from '@phosphor-icons/react'

// ── Helpers ───────────────────────────────────────────────────────────────────

const hasPerm = (user, key) =>
  user?.permissions?.[key] === true || user?.[key] === true

const toIsraeliDate = (dateStr) => {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

const NOTIF_ICON_MAP = {
  shift_reminder:    Moon,
  shabbat_confirmed: Star,
  event_invite:      UsersThree,
  general:           MegaphoneSimple,
}

function NotifIcon({ type }) {
  if (type === 'shift_cancelled') return <span className="text-base leading-none">❌</span>
  const Icon = NOTIF_ICON_MAP[type] ?? MegaphoneSimple
  return <Icon size={18} className="text-gray-400 shrink-0" />
}

function timeAgo(ts) {
  if (!ts) return ''
  try {
    const date = ts?.toDate ? ts.toDate() : new Date(ts)
    return format(date, 'dd/MM HH:mm')
  } catch { return '' }
}

const MEDALS = ['🥇', '🥈', '🥉']

// ── Light theme style tokens ──────────────────────────────────────────────────
// card      — white card with subtle shadow
// cardHdr   — card header row with bottom border
// inner     — inner stat / chip background
// txt1      — primary text
// txt2      — secondary text
// txt3      — tertiary / hint text

const card    = 'bg-white border border-gray-100 shadow-sm rounded-2xl'
const cardHdr = 'border-b border-gray-100'
const inner   = 'bg-gray-50 rounded-xl'
const txt1    = 'text-gray-900'
const txt2    = 'text-gray-500'
const txt3    = 'text-gray-500'

const ROLE_TYPE_LABELS = {
  night_coordinator:     'רכז לילה',
  shabbat_coordinator:   'רכז שבת',
  dispatcher:            'מוקדן',
  events_coordinator:    'רכז גיבוש',
  transport_coordinator: 'רכז תחבורה',
  car_coordinator:       'רכז רכב',
  ambulance_coordinator: 'רכז אמבולנס',
  cohesion_coordinator:  'רכז גיבוש',
}

const getUserRoleBadges = (user) => {
  const types = user?.roleTypes?.length ? user.roleTypes : (user?.roleType ? [user.roleType] : [])
  return types.map(t => ROLE_TYPE_LABELS[t]).filter(Boolean)
}

// ── Generic dashboard (branch_head, system_admin, role_holder) ────────────────

function NavGrid() {
  const navItems = useNavItems()
  const navigate = useNavigate()
  const items = navItems.filter(i => i.to !== '/')
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map(item => (
        <button
          key={item.to}
          onClick={() => navigate(item.to)}
          className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 text-right hover:shadow-md hover:border-orange-200 transition group"
        >
          <div className="flex justify-end mb-2">
            <item.Icon size={26} className="text-orange-500" weight="duotone" />
          </div>
          <p className="font-bold text-gray-900 text-sm">{item.label}</p>
          {item.desc && <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>}
        </button>
      ))}
    </div>
  )
}

function RecentNotifications({ userId }) {
  const [notifs, setNotifs] = useState([])
  useEffect(() => {
    if (!userId) return
    getUserNotifications(userId).then(setNotifs).catch(() => setNotifs([]))
  }, [userId])

  return (
    <div className={`${card} overflow-hidden mt-6`}>
      <div className={`flex items-center justify-between px-5 py-3 ${cardHdr}`}>
        <h2 className={`font-bold ${txt1} text-sm`}>התראות אחרונות</h2>
        <Link to="/notifications" className="text-xs text-orange-500 hover:text-orange-600 transition">
          לכל ההתראות →
        </Link>
      </div>
      {notifs.length === 0 ? (
        <div className={`px-5 py-6 text-center ${txt3} text-sm`}>אין התראות</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {notifs.slice(0, 3).map(n => (
            <div key={n.id} className={`flex items-start gap-3 px-5 py-3 ${n.isRead ? '' : 'border-r-2 border-orange-400'}`}>
              <span className="shrink-0 mt-0.5 flex items-center"><NotifIcon type={n.type} /></span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${n.isRead ? txt2 : txt1}`}>{n.title}</p>
                {n.body && <p className={`text-xs ${txt3} truncate mt-0.5`}>{n.body}</p>}
              </div>
              <span className={`text-xs ${txt3} shrink-0 mt-0.5`}>{timeAgo(n.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const getIsraelHour = () => {
  const now = new Date();
  const israelTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  return israelTime.getHours();
};

function GenericDashboard({ user, branch }) {
  const { isSystemAdmin, isBranchHead, canManageNightShifts, canManageShabbat,
          canAccessBuildingCodes, canManageBranch, hasNightShifts, hasShabbat } = useRole()
  const greeting = () => {
    const h = getIsraelHour();
    if (h >= 5  && h < 12) return 'בוקר טוב';
    if (h >= 12 && h < 17) return 'צהריים טובים';
    if (h >= 17 && h < 20) return 'אחר הצהריים טובים';
    if (h >= 20 && h < 22) return 'ערב טוב';
    return 'לילה טוב';
  }
  return (
    <div className="bg-[#FAFAFA] min-h-full p-4 sm:p-6 max-w-4xl mx-auto pb-20 lg:pb-0">
      <div className={`${card} p-5 mb-6`}>
        <div className="flex items-center gap-4">
          <img
            src="/logo_unaited.svg"
            alt="איחוד הצלה"
            className="w-14 h-14 object-contain shrink-0 rounded-xl bg-gray-50 p-1 border border-gray-100"
          />
          <div className="flex-1 min-w-0">
            <p className={`${txt2} text-sm mb-1`}>{greeting()} 👋</p>
            <h1 className={`text-xl sm:text-2xl font-black ${txt1} leading-tight`}>
              {user?.firstName} {user?.lastName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {user?.volunteerId && (
                <span className={`text-xs ${txt3}`}>
                  קוד כונן: <span className={`font-mono ${txt2}`}>{user.volunteerId}</span>
                </span>
              )}
              {branch && <span className={`text-xs ${txt2}`}>סניף {branch.name}</span>}
              {isSystemAdmin && (
                <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-200">מנהל מערכת</span>
              )}
              {getUserRoleBadges(user).map((label, i) => (
                <span key={i} className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-200">{label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <NavGrid />
      <RecentNotifications userId={user?.id} />
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

  const hasNight   = hasPerm(user, 'nightShifts')        || hasPerm(user, 'canManageNightShifts')  || user?.roleTypes?.includes('night_coordinator')
  const hasShabbat = hasPerm(user, 'shabbatVolunteer')   || hasPerm(user, 'canManageShabbat')      || user?.roleTypes?.includes('shabbat_coordinator')

  const showShabbatBanner = hasShabbat && (isThursday(now) || isFriday(now))

  const nextFri      = isFriday(now) ? now : nextFriday(now)
  const nextFriStr   = format(nextFri, 'yyyy-MM-dd')
  const nextFriLabel = format(nextFri, "EEEE d בMMMM", { locale: he })

  const [loading,           setLoading]           = useState(true)
  const [myNightShifts,     setMyNightShifts]     = useState([])
  const [allNightShifts,    setAllNightShifts]    = useState([])
  const [myShabbatShifts,   setMyShabbatShifts]   = useState([])
  const [notifications,     setNotifications]     = useState([])
  const [shabbatSubmitting, setShabbatSubmitting] = useState(false)
  const [shabbatError,      setShabbatError]      = useState('')
  const [enableLottery,     setEnableLottery]     = useState(true)

  useEffect(() => {
    if (!user?.id || !user?.branchId) return
    const load = async () => {
      setLoading(true)
      const results = await Promise.allSettled([
        hasNight   ? getMonthShifts(user.branchId, year, month)                       : Promise.resolve([]),
        hasShabbat ? getVolunteerMonthShabbatShifts(user.branchId, user.id, monthStr) : Promise.resolve([]),
        getUserNotifications(user.id),
        getBranchSettings(user.branchId),
      ])
      if (hasNight && results[0].status === 'fulfilled') {
        const allSnap = results[0].value
        setAllNightShifts(allSnap)
        setMyNightShifts(allSnap.filter(s => s.volunteerId === user.id))
      }
      if (hasShabbat && results[1].status === 'fulfilled') setMyShabbatShifts(results[1].value)
      if (results[2].status === 'fulfilled') setNotifications(results[2].value)
      if (results[3].status === 'fulfilled') {
        const ns = results[3].value?.nightShifts
        setEnableLottery(ns?.enableLottery !== false)
      }
      setLoading(false)
    }
    load()
  }, [user?.id, user?.branchId])

  const upcomingNight   = myNightShifts.filter(s => s.date > todayStr).sort((a, b) => a.date.localeCompare(b.date))[0]
  const upcomingShabbat = myShabbatShifts.filter(s => s.shabbatDate > todayStr && s.status !== 'cancelled').sort((a, b) => a.shabbatDate.localeCompare(b.shabbatDate))[0]

  const nextShift = (() => {
    if (!upcomingNight && !upcomingShabbat) return null
    if (!upcomingNight)   return { date: upcomingShabbat.shabbatDate, type: 'shabbat' }
    if (!upcomingShabbat) return { date: upcomingNight.date,          type: 'night'   }
    return upcomingNight.date <= upcomingShabbat.shabbatDate
      ? { date: upcomingNight.date,          type: 'night'   }
      : { date: upcomingShabbat.shabbatDate, type: 'shabbat' }
  })()

  const isEligible        = myNightShifts.length > 0
  const signedUpThisMonth = myNightShifts.length > 0
  const shabbatResponse   = myShabbatShifts.find(s => s.shabbatDate === nextFriStr)

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

  const handleShabbatResponse = async (available) => {
    if (!available) { setShabbatError(''); return }
    setShabbatSubmitting(true)
    setShabbatError('')
    try {
      await submitShabbatAvailability(
        user.branchId, nextFriStr, user.id,
        `${user.firstName} ${user.lastName}`,
        user.shabbatArea || user.permissions?.shabbatArea || 'לא הוגדר'
      )
      const updated = await getVolunteerMonthShabbatShifts(user.branchId, user.id, monthStr)
      setMyShabbatShifts(updated)
    } catch { setShabbatError('שגיאה בשמירה, נסה שנית') }
    finally   { setShabbatSubmitting(false) }
  }

  const greeting = () => {
    const h = getIsraelHour();
    if (h >= 5  && h < 12) return 'בוקר טוב';
    if (h >= 12 && h < 17) return 'צהריים טובים';
    if (h >= 17 && h < 20) return 'אחר הצהריים טובים';
    if (h >= 20 && h < 22) return 'ערב טוב';
    return 'לילה טוב';
  }

  if (loading) {
    return (
      <div className="bg-[#FAFAFA] min-h-full flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text="טוען נתונים..." />
      </div>
    )
  }

  return (
    <div className="bg-[#FAFAFA] min-h-full p-4 sm:p-6 max-w-2xl mx-auto space-y-4 pb-20 lg:pb-6">

      {/* ── 1. Personal Status Card ── */}
      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className={`text-xl sm:text-2xl font-black ${txt1}`}>
              {greeting()}, {user?.firstName}! 👋
            </h1>
            {branch && <p className={`text-sm ${txt2} mt-0.5`}>סניף {branch.name}</p>}
            {user?.volunteerId && (
              <p className={`text-xs ${txt3} mt-0.5`}>
                קוד כונן: <span className="font-mono text-gray-500">{user.volunteerId}</span>
              </p>
            )}
            {getUserRoleBadges(user).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {getUserRoleBadges(user).map((label, i) => (
                  <span key={i} className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-200">{label}</span>
                ))}
              </div>
            )}
          </div>
          {hasNight && enableLottery && (
            <div className={`shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border
              ${isEligible
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'}`}>
              <span>{isEligible ? '✅' : '❌'}</span>
              <span>{isEligible ? 'זכאי להגרלה' : 'לא זכאי להגרלה'}</span>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {hasNight && (
            <div className={`${inner} p-3 text-center`}>
              <p className="text-2xl font-black text-blue-600">{myNightShifts.length}</p>
              <p className={`text-xs ${txt2} mt-0.5 leading-tight`}>תורנויות לילה<br/>החודש</p>
            </div>
          )}
          {hasShabbat && (
            <div className={`${inner} p-3 text-center`}>
              <p className="text-2xl font-black text-purple-600">
                {myShabbatShifts.filter(s => s.status === 'confirmed').length}
              </p>
              <p className={`text-xs ${txt2} mt-0.5 leading-tight`}>שבתות מאושרות<br/>החודש</p>
            </div>
          )}
          <div className={`${inner} p-3 text-center`}>
            <p className={`text-2xl font-black ${txt1}`}>{daysLeft}</p>
            <p className={`text-xs ${txt2} mt-0.5 leading-tight`}>ימים לסוף<br/>החודש</p>
          </div>
        </div>

        {/* Next shift */}
        <div className={`mt-4 pt-4 border-t border-gray-100`}>
          <p className={`text-xs ${txt3} mb-1`}>משמרת קרובה</p>
          {nextShift ? (
            <div className="flex items-center gap-2">
              {nextShift.type === 'night' ? <Moon size={20} color="#3B82F6" /> : <Star size={20} color="#9333EA" />}
              <span className={`font-semibold ${txt1}`}>
                {nextShift.type === 'night' ? 'תורנות לילה' : 'תורנות שבת'}
              </span>
              <span className={`${txt2} text-sm mr-auto`}>{toIsraeliDate(nextShift.date)}</span>
            </div>
          ) : (
            <p className={`${txt3} text-sm`}>אין לך משמרת קרובה</p>
          )}
        </div>
      </div>

      {/* ── Nav cards ── */}
      <NavGrid />

      {/* ── 2. Night Shift Urgency Banner ── */}
      {hasNight && !signedUpThisMonth && (
        <div className={`rounded-2xl px-5 py-4 border flex items-start gap-3
          ${daysLeft <= 5
            ? 'urgency-flash border-red-300 bg-red-50'
            : 'bg-orange-50 border-orange-200'}`}>
          <Warning size={22} weight="fill" className="shrink-0 text-red-500" />
          <div className="flex-1">
            <p className={`font-bold ${daysLeft <= 5 ? 'text-red-700' : 'text-orange-700'}`}>
              עוד לא נרשמת לתורנות לילה החודש!
            </p>
            <p className={`text-sm ${txt2} mt-0.5`}>
              נשארו <span className={`font-bold ${txt1}`}>{daysLeft} ימים</span> לסוף החודש
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
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Star size={20} color="#9333EA" />
            <h3 className="font-bold text-purple-800">תורנות שבת הקרובה</h3>
            <span className={`text-sm ${txt2} mr-auto`}>{nextFriLabel}</span>
          </div>

          {shabbatResponse ? (
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-xl border
                ${shabbatResponse.status === 'cancelled'
                  ? 'bg-gray-100 border-gray-200 text-gray-600'
                  : 'bg-purple-100 border-purple-200 text-purple-700'}`}>
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
                className={`text-xs ${txt3} hover:text-gray-600 transition`}
              >
                שנה תגובה
              </button>
            </div>
          ) : (
            <div>
              <p className={`text-sm text-purple-700 mb-3`}>האם אתה זמין לתורנות השבת הקרובה?</p>
              {shabbatError && <p className="text-red-600 text-xs mb-2">{shabbatError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => handleShabbatResponse(true)}
                  disabled={shabbatSubmitting}
                  className="flex-1 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
                >
                  {shabbatSubmitting ? '...' : 'כן, זמין'}
                </button>
                <button
                  onClick={() => handleShabbatResponse(false)}
                  disabled={shabbatSubmitting}
                  className="flex-1 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-bold py-2.5 rounded-xl transition border border-gray-200"
                >
                  לא זמין
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 5. Recent Notifications ── */}
      <div className={`${card} overflow-hidden`}>
        <div className={`flex items-center justify-between px-5 py-3 ${cardHdr}`}>
          <h2 className={`font-bold ${txt1} text-sm`}>התראות אחרונות</h2>
          <Link to="/messages" className="text-xs text-orange-500 hover:text-orange-600 transition">
            לכל ההתראות →
          </Link>
        </div>
        {notifications.length === 0 ? (
          <div className={`px-5 py-6 text-center ${txt3} text-sm`}>אין התראות</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {notifications.slice(0, 3).map(n => (
              <div key={n.id}
                className={`flex items-start gap-3 px-5 py-3
                  ${n.isRead ? '' : 'border-r-2 border-orange-400'}`}>
                <span className="shrink-0 mt-0.5 flex items-center"><NotifIcon type={n.type} /></span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${n.isRead ? txt2 : txt1}`}>
                    {n.title}
                  </p>
                  {n.body && <p className={`text-xs ${txt3} truncate mt-0.5`}>{n.body}</p>}
                </div>
                <span className={`text-xs ${txt3} shrink-0 mt-0.5`}>{timeAgo(n.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 6. Night Shift Leaderboard (top 3) ── */}
      {hasNight && enableLottery && leaderboard.length > 0 && (
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`font-bold ${txt1} flex items-center gap-2`}>
              <Moon size={16} color="#3B82F6" /> כבוד הלילה
            </h2>
            <Link to="/night-shifts" className="text-xs text-orange-500 hover:text-orange-600 transition">
              לוח שנה →
            </Link>
          </div>
          <div className="space-y-2">
            {leaderboard.map((v, i) => (
              <div key={v.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border
                  ${v.id === user?.id
                    ? 'bg-orange-50 border-orange-200'
                    : 'bg-gray-50 border-transparent'}`}>
                <span className="text-xl w-8 text-center shrink-0">{MEDALS[i]}</span>
                <span className={`flex-1 font-medium text-sm
                  ${v.id === user?.id ? 'text-orange-600' : txt1}`}>
                  {v.name}
                  {v.id === user?.id && <span className="text-xs text-orange-400 mr-1">(את/ה)</span>}
                </span>
                <span className={`text-xs bg-gray-100 ${txt2} px-2.5 py-1 rounded-full font-bold shrink-0`}>
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

  const [loading,          setLoading]          = useState(true)
  const [nightShifts,      setNightShifts]      = useState([])
  const [shabbatShifts,    setShabbatShifts]    = useState([])
  const [branchSettings,   setBranchSettings]   = useState(null)
  const [branchUsers,      setBranchUsers]      = useState([])
  const [codesCount,       setCodesCount]       = useState(0)
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [view,             setView]             = useState('cards')

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

  const coveredDays      = nightShifts.length
  const emptyDays        = daysInMonth - coveredDays
  const shabbatConfirmed = shabbatShifts.filter(s => s.status === 'confirmed').length

  const upcomingEmpty = []
  for (let d = now.getDate(); d <= Math.min(now.getDate() + 13, daysInMonth); d++) {
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (ds >= todayStr && !nightShifts.find(s => s.date === ds)) upcomingEmpty.push(ds)
  }

  const signedUpIds = new Set(nightShifts.map(s => s.volunteerId))
  const notSignedUp = branchUsers.filter(v =>
    (v.permissions?.nightShifts === true || v.nightShifts === true) && !signedUpIds.has(v.id)
  )

  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d  = i + 1
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return { d, ds, isPast: ds < todayStr, shift: nightShifts.find(s => s.date === ds) }
  })

  const areas        = branchSettings?.shabbat?.areas ?? []
  const areaStatuses = areas.map(area => {
    const count = shabbatShifts.filter(s => s.area === area.name && s.status !== 'cancelled').length
    return { ...area, count, sufficient: count >= (area.required ?? 1) }
  })

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

  const greeting = () => {
    const h = getIsraelHour();
    if (h >= 5  && h < 12) return 'בוקר טוב';
    if (h >= 12 && h < 17) return 'צהריים טובים';
    if (h >= 17 && h < 20) return 'אחר הצהריים טובים';
    if (h >= 20 && h < 22) return 'ערב טוב';
    return 'לילה טוב';
  }

  const roleLabel = user?.role === 'branch_head' ? 'ראש סניף' : 'סגן ראש סניף'

  if (loading) {
    return (
      <div className="bg-[#FAFAFA] min-h-full flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text="טוען נתוני סניף..." />
      </div>
    )
  }

  return (
    <div className="bg-[#FAFAFA] min-h-full p-4 sm:p-6 max-w-3xl mx-auto space-y-4 pb-20 lg:pb-6" dir="rtl">

      {/* ══ 1. HEADER ══ */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-4">
          <img
            src="/logo_unaited.svg"
            alt="איחוד הצלה"
            className="w-14 h-14 object-contain shrink-0 rounded-xl bg-gray-50 p-1 border border-gray-100"
          />
          <div className="flex-1 min-w-0">
            <p className={`${txt2} text-sm mb-1`}>{greeting()} 👋</p>
            <h1 className={`text-xl sm:text-2xl font-black ${txt1} leading-tight`}>
              {user?.firstName} {user?.lastName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {user?.volunteerId && (
                <span className={`text-xs ${txt3}`}>
                  קוד כונן: <span className={`font-mono ${txt2}`}>{user.volunteerId}</span>
                </span>
              )}
              {branch && <span className={`text-xs ${txt2}`}>סניף {branch.name}</span>}
              <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-200">
                {roleLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ══ View toggle ══ */}
      <div className="flex gap-2">
        <button onClick={() => setView('cards')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition border ${view === 'cards' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          מסך ראשי
        </button>
        <button onClick={() => setView('manage')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition border ${view === 'manage' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
          דשבורד ניהול
        </button>
      </div>

      {view === 'cards' && (
        <>
          <NavGrid />
          <RecentNotifications userId={user?.id} />
        </>
      )}

      {view === 'manage' && <>

      {/* ══ 2. STATS ROW ══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`${card} p-4 text-center`}>
          <p className="text-3xl font-black text-orange-500">{branchUsers.length}</p>
          <p className={`text-xs ${txt2} mt-1.5 leading-tight`}>כוננים<br/>בסניף</p>
        </div>

        <Link to="/night-shifts" className="bg-white border border-gray-100 hover:border-blue-200 shadow-sm rounded-2xl p-4 text-center transition">
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-2xl font-black text-red-500">{emptyDays}</span>
            <span className={`${txt3} text-sm font-light`}>/</span>
            <span className="text-2xl font-black text-green-600">{coveredDays}</span>
          </div>
          <p className={`text-xs ${txt2} mt-1.5 leading-tight`}>לילה: פנוי / תפוס</p>
        </Link>

        <Link to="/building-codes" className="bg-white border border-gray-100 hover:border-green-200 shadow-sm rounded-2xl p-4 text-center transition">
          <p className="text-3xl font-black text-green-600">{codesCount}</p>
          <p className={`text-xs ${txt2} mt-1.5 leading-tight`}>קודי<br/>בניין</p>
        </Link>

        <Link to="/shabbat" className="bg-white border border-gray-100 hover:border-purple-200 shadow-sm rounded-2xl p-4 text-center transition">
          <p className="text-3xl font-black text-purple-600">{shabbatConfirmed}</p>
          <p className={`text-xs ${txt2} mt-1.5 leading-tight`}>מאושרים<br/>לשבת</p>
        </Link>
      </div>

      {/* ══ 3. NIGHT SHIFTS CALENDAR ══ */}
      <div className={`${card} overflow-hidden`}>
        <div className={`flex items-center justify-between px-5 py-3 ${cardHdr}`}>
          <h2 className={`font-bold ${txt1} flex items-center gap-2`}>
            <Moon size={16} color="#3B82F6" /> שיבוצי לילה — {format(now, 'MMMM yyyy', { locale: he })}
          </h2>
          <Link to="/night-shifts" className="text-xs text-orange-500 hover:text-orange-600 transition">
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
                    ? 'bg-gray-100 text-gray-500'
                    : shift
                      ? 'bg-green-100 text-green-700 border border-green-200'
                      : ds === todayStr
                        ? 'bg-orange-100 text-orange-700 border border-orange-300 ring-1 ring-orange-400'
                        : 'bg-red-50 text-red-500 border border-red-200'
                  }`}
              >
                {d}
              </div>
            ))}
          </div>

          <div className={`flex gap-4 text-xs ${txt3}`}>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 inline-block border border-green-200" /> מכוסה</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 inline-block border border-red-200" /> פנוי</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 inline-block" /> עבר</span>
          </div>

          {notSignedUp.length > 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <div className="mb-2">
                <p className="text-sm font-medium text-yellow-800">לא נרשמו עדיין — {notSignedUp.length} מתנדבים</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {notSignedUp.slice(0, 8).map(v => (
                  <span key={v.id} className={`text-xs bg-white border border-gray-200 ${txt2} px-2 py-0.5 rounded-full`}>
                    {v.firstName} {v.lastName}
                  </span>
                ))}
                {notSignedUp.length > 8 && (
                  <span className={`text-xs ${txt3} self-center`}>+{notSignedUp.length - 8} נוספים</span>
                )}
              </div>
              <Link to="/night-shifts"
                className="block w-full text-center mt-3 bg-white border border-orange-200 text-orange-600 hover:bg-orange-50 text-sm font-medium py-2 rounded-xl transition">
                לצפייה בכל המתנדבים ←
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
              <span>✅</span><span>כל המתנדבים נרשמו החודש!</span>
            </div>
          )}
        </div>
      </div>

      {/* ══ 4. URGENT ALERTS ══ */}
      {upcomingEmpty
        .filter(ds => Math.ceil((parseISO(ds) - now) / 86400000) <= 2)
        .slice(0, 3)
        .map(ds => {
          const daysUntil = Math.ceil((parseISO(ds) - now) / 86400000)
          return (
            <Link
              key={ds}
              to="/night-shifts"
              className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-3 hover:bg-red-100 transition"
            >
              <Warning size={22} className="shrink-0 text-red-500" weight="fill" />
              <div className="flex-1">
                <p className="font-bold text-red-700 text-sm">יום ללא כיסוי — {toIsraeliDate(ds)}</p>
                <p className={`text-xs ${txt2} mt-0.5`}>
                  {daysUntil === 0 ? 'היום פנוי!' : daysUntil === 1 ? 'מחר פנוי!' : `עוד ${daysUntil} ימים`}
                </p>
              </div>
              <span className="text-xs text-red-600 font-medium shrink-0">לשיבוץ ←</span>
            </Link>
          )
        })
      }

      {/* ══ 5. RECENT BRANCH ACTIVITY ══ */}
      <div className={`${card} overflow-hidden`}>
        <div className={`px-5 py-3 ${cardHdr}`}>
          <h2 className={`font-bold ${txt1} text-sm`}>פעילות אחרונה בסניף</h2>
        </div>
        {recentActivity.length === 0 ? (
          <div className={`px-5 py-8 text-center ${txt3} text-sm`}>
            <ClipboardText size={32} className="mx-auto mb-2 text-gray-300" />
            <p>אין פעילות אחרונה</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentActivity.map((a, i) => (
              <div key={i} onClick={() => setSelectedActivity(a)} className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 transition">
                {a.kind === 'night' ? <Moon size={18} color="#3B82F6" className="shrink-0" /> : <Star size={18} color="#9333EA" className="shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${txt1} truncate`}>
                    <span className="font-medium">{a.name}</span>
                    <span className={txt2}>
                      {a.kind === 'night'
                        ? ` נרשם לתורנות לילה — ${toIsraeliDate(a.date)}`
                        : ` דיווח זמינות לשבת — ${toIsraeliDate(a.date)}`}
                    </span>
                  </p>
                </div>
                <span className={`text-xs ${txt3} shrink-0`}>{a.ts ? format(a.ts, 'HH:mm') : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ 6. SHABBAT PANEL ══ */}
      <div className={`border rounded-2xl overflow-hidden ${
        isThurOrFri ? 'border-purple-200 bg-purple-50' : 'border-gray-100 bg-white shadow-sm'
      }`}>
        <div className={`flex items-center justify-between px-5 py-3 border-b ${
          isThurOrFri ? 'border-purple-200' : 'border-gray-100'
        }`}>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className={`font-bold ${txt1} flex items-center gap-2`}>
              <Star size={16} color="#9333EA" /> תורני שבת
            </h2>
            {isThurOrFri && (
              <span className="text-xs bg-red-100 border border-red-200 text-red-700 px-2 py-0.5 rounded-full animate-pulse">
                יש לאשר שיבוץ שבת!
              </span>
            )}
          </div>
          <Link to="/shabbat" className="text-xs text-orange-500 hover:text-orange-600 transition shrink-0">
            לאישור שיבוץ שבת ←
          </Link>
        </div>

        <div className="p-5">
          <p className={`text-sm ${txt2} mb-4`}>
            שבת {nextFriLabel} — {shabbatShifts.filter(s => s.status !== 'cancelled').length} דיווחי זמינות
          </p>

          {areaStatuses.length === 0 ? (
            <div className={`text-center py-4 ${txt3} text-sm space-y-1`}>
              <p>לא הוגדרו אזורי שבת לסניף</p>
              <Link to="/branch-management" className="text-orange-500 hover:text-orange-600 text-xs inline-block">
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
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-red-50 border-red-200 text-red-700'}`}
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

      </>}

      {selectedActivity && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setSelectedActivity(null)}>
          <div className={`${card} p-6 max-w-sm w-full`} dir="rtl">
            <div className="flex items-center gap-3 mb-4">
              {selectedActivity.kind === 'night'
                ? <Moon size={24} color="#3B82F6" className="shrink-0" />
                : <Star size={24} color="#9333EA" className="shrink-0" />}
              <h2 className={`text-lg font-bold ${txt1}`}>פרטי פעילות</h2>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className={txt2}>מתנדב</span>
                <span className={`font-medium ${txt1}`}>{selectedActivity.name}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={txt2}>פעולה</span>
                <span className={`font-medium ${txt1}`}>
                  {selectedActivity.kind === 'night' ? 'נרשם לתורנות לילה' : 'דיווח זמינות לשבת'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={txt2}>תאריך</span>
                <span className={`font-medium ${txt1}`}>{toIsraeliDate(selectedActivity.date)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={txt2}>זמן</span>
                <span className={`font-medium ${txt1}`}>{selectedActivity.ts ? format(selectedActivity.ts, 'dd/MM/yyyy HH:mm') : '—'}</span>
              </div>
            </div>
            <button onClick={() => setSelectedActivity(null)}
              className="w-full mt-5 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl font-medium transition">
              סגור
            </button>
          </div>
        </div>
      )}

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

  return <VolunteerDashboard user={user} branch={branch} />
}
