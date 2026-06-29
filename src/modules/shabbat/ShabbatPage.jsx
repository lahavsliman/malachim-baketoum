import { useState, useEffect, useRef } from 'react'
import { format, nextFriday, isFriday, subWeeks, addWeeks, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../hooks/useRole'
import { getBranchSettings, getBranch } from '../../firebase/branches'
import { getBranchUsers } from '../../firebase/users'
import { createBulkNotifications } from '../../firebase/notifications'
import {
  getShabbatShifts,
  getVolunteerMonthShabbatShifts,
  getBranchMonthShabbatShifts,
  getVolunteerShabbatHistory,
  getShabbatHistory,
  publishSchedule,
  subscribeShabbatAvailability,
} from '../../firebase/shabbatShifts'
import AvailabilityForm from './AvailabilityForm'
import AreaPanel, { UnassignedPanel } from './AreaPanel'
import LoadingSpinner from '../../shared/LoadingSpinner'
import BranchSelector from '../../shared/BranchSelector'
import Toast from '../../shared/Toast'
import { Star, ClipboardText, Lock, Globe, WhatsappLogo, ArrowCounterClockwise, MegaphoneSimple } from '@phosphor-icons/react'
import { HDate, HebrewCalendar, flags } from '@hebcal/core'

// ── Helpers ────────────────────────────────────────────────────────────────

const upcomingFriday = () => {
  const now = new Date()
  return isFriday(now) ? now : nextFriday(now)
}

const hebrewDate = (dateStr) => {
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch { return dateStr }
}

const SHORT_DATE = (dateStr) => {
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('he-IL', {
      day: 'numeric', month: 'long',
    })
  } catch { return dateStr }
}

// Returns Hebrew parsha name for the Shabbat of a given Friday date string
const getParshaName = (fridayDateStr) => {
  try {
    const saturday = new Date(fridayDateStr + 'T12:00:00')
    saturday.setDate(saturday.getDate() + 1) // Friday → Saturday
    const hdate = new HDate(saturday)
    const events = HebrewCalendar.calendar({ start: hdate, end: hdate, sedrot: true, il: true })
    const ev = events.find(e => !!(e.getFlags() & flags.PARSHA_HASHAVUA))
    return ev?.render('he') ?? ''
  } catch { return '' }
}

const STATUS_HEB = {
  available:     { label: 'ממתין לאישור', color: 'text-amber-600'  },
  confirmed:     { label: 'מאושר ✅',      color: 'text-green-600'  },
  cancelled:     { label: 'לא שובצת',     color: 'text-gray-500'   },
  not_available: { label: 'דיווחת לא זמין', color: 'text-gray-500' },
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ShabbatPage() {
  const { user } = useAuth()
  const { canManageShabbat, branchId: userBranchId, hasShabbat, isSystemAdmin } = useRole()
  const [adminBranchId, setAdminBranchId] = useState(null)
  const branchId = isSystemAdmin ? adminBranchId : userBranchId

  const [currentFriday, setCurrentFriday] = useState(upcomingFriday)
  const [activeTab, setActiveTab] = useState('main')
  const [loading, setLoading] = useState(true)

  // Data
  const [shifts, setShifts] = useState([])
  const [allShabbatVols, setAllShabbatVols] = useState([])
  const [myMonthShifts, setMyMonthShifts] = useState([])
  const [branchMonthShifts, setBranchMonthShifts] = useState([])
  const [branchSettings, setBranchSettings] = useState(null)
  const [myHistory, setMyHistory] = useState([])
  const [shabbatHistory, setShabbatHistory] = useState([])
  const [historyDate, setHistoryDate] = useState(null)
  const [historyShifts, setHistoryShifts] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Branch metadata (for WhatsApp copy)
  const [branchData, setBranchData] = useState(null)
  const [shabbatCoordinator, setShabbatCoordinator] = useState(null)

  // Coordinator UI
  const [publishing, setPublishing] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [toast, setToast] = useState(null)

  const unsubRef = useRef(null)

  const shabbatDate = format(currentFriday, 'yyyy-MM-dd')
  const shabbatLabel = format(currentFriday, 'd בMMMM yyyy', { locale: he })
  const monthStr = format(currentFriday, 'yyyy-MM')
  const parshaName = getParshaName(shabbatDate)
  const hebrewDateShort = (() => {
    try {
      const saturday = new Date(shabbatDate + 'T12:00:00')
      saturday.setDate(saturday.getDate() + 1)
      const hdate = new HDate(saturday)

      const MONTHS_HE = ['ניסן','אייר','סיוון','תמוז','אב','אלול','תשרי','חשוון','כסלו','טבת','שבט','אדר','אדר א׳','אדר ב׳']
      const monthName = MONTHS_HE[(hdate.getMonth() - 1 + 14) % 14] ?? ''

      const toGematria = (n) => {
        const hundreds = ['','ק','ר','ש','ת','תק','תר','תש','תת','תתק']
        const tens     = ['','י','כ','ל','מ','נ','ס','ע','פ','צ']
        const ones     = ['','א','ב','ג','ד','ה','ו','ז','ח','ט']
        let h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10
        let s = hundreds[h]
        if (t === 1 && o === 5) { s += 'טו'; t = 0; o = 0 }
        else if (t === 1 && o === 6) { s += 'טז'; t = 0; o = 0 }
        else { s += tens[t] + ones[o] }
        if (s.length === 1) return s + "'"
        return s.slice(0, -1) + '"' + s.slice(-1)
      }

      const dayGem  = toGematria(hdate.getDate())
      const yearGem = toGematria(hdate.getFullYear() - 5000)

      const greg = new Date(shabbatDate + 'T12:00:00')
      const dd = String(greg.getDate()).padStart(2, '0')
      const mm = String(greg.getMonth() + 1).padStart(2, '0')
      const yy = String(greg.getFullYear()).slice(2)

      return `${dayGem} ${monthName} ${yearGem} | ${dd}/${mm}/${yy}`
    } catch { return '' }
  })()

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  // Load branch settings + branch metadata once
  useEffect(() => {
    if (!branchId) return
    getBranchSettings(branchId)
      .then(s => setBranchSettings(s ?? {}))
      .catch(() => setBranchSettings({}))
    getBranch(branchId).then(setBranchData).catch(() => {})
  }, [branchId])

  // Load shifts — real-time for coordinator, one-shot for volunteer
  useEffect(() => {
    if (!branchId) return

    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }

    if (canManageShabbat) {
      setLoading(true)
      unsubRef.current = subscribeShabbatAvailability(branchId, shabbatDate, (data) => {
        setShifts(data)
        setLoading(false)
      })
    } else {
      setLoading(true)
      getShabbatShifts(branchId, shabbatDate)
        .then(setShifts)
        .finally(() => setLoading(false))
    }

    return () => { if (unsubRef.current) { unsubRef.current(); unsubRef.current = null } }
  }, [branchId, shabbatDate, canManageShabbat])

  // Load per-user month shifts
  useEffect(() => {
    if (!branchId || !user?.id) return
    getVolunteerMonthShabbatShifts(branchId, user.id, monthStr).then(setMyMonthShifts).catch(() => {})
  }, [branchId, user?.id, monthStr])

  // Coordinator: load branch month shifts for fairness counts + all shabbat volunteers
  useEffect(() => {
    if (!branchId || !canManageShabbat) return
    getBranchMonthShabbatShifts(branchId, monthStr).then(setBranchMonthShifts).catch(() => {})
    getBranchUsers(branchId)
      .then(us => {
        setAllShabbatVols(us.filter(u => u.permissions?.shabbatVolunteer || u.shabbatVolunteer))
        const coord = us.find(u =>
          u.roleTypes?.includes('shabbat_coordinator') || u.roleType === 'shabbat_coordinator'
        )
        setShabbatCoordinator(coord ?? null)
      })
      .catch(() => {})
  }, [branchId, canManageShabbat, monthStr])

  // History data
  useEffect(() => {
    if (!branchId || activeTab !== 'history') return
    if (canManageShabbat) {
      getShabbatHistory(branchId).then(setShabbatHistory).catch(() => {})
    } else if (user?.id) {
      getVolunteerShabbatHistory(user.id, branchId).then(setMyHistory).catch(() => {})
    }
  }, [branchId, activeTab, canManageShabbat, user?.id])

  const loadHistoryShifts = async (date) => {
    setHistoryDate(date)
    setHistoryLoading(true)
    try {
      setHistoryShifts(await getShabbatShifts(branchId, date))
    } finally { setHistoryLoading(false) }
  }

  const refreshData = () => {
    getShabbatShifts(branchId, shabbatDate).then(setShifts)
    getVolunteerMonthShabbatShifts(branchId, user?.id, monthStr).then(setMyMonthShifts)
    if (canManageShabbat) getBranchMonthShabbatShifts(branchId, monthStr).then(setBranchMonthShifts)
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const nsSettings = branchSettings?.shabbat ?? {}
  const areas = nsSettings.areas || []
  const maxPerMonth = nsSettings.maxPerMonth ?? 2
  const isPublished = shifts.some(s => s.published)

  const monthShiftCounts = {}
  branchMonthShifts.filter(s => s.status === 'confirmed').forEach(s => {
    monthShiftCounts[s.volunteerId] = (monthShiftCounts[s.volunteerId] || 0) + 1
  })

  const confirmedCount = shifts.filter(s => s.status === 'confirmed').length
  const pendingCount   = shifts.filter(s => s.status === 'available').length
  const cancelledCount = shifts.filter(s => s.status === 'cancelled').length

  const handlePublish = async () => {
    const confirmedShifts = shifts.filter(s => s.status === 'confirmed')
    if (!confirmedShifts.length) { showToast('error', 'אין מתנדבים מאושרים לפרסום'); return }
    setPublishing(true)
    try {
      const confirmedIds = confirmedShifts.map(s => s.id)
      await publishSchedule(branchId, shabbatDate, confirmedIds)
      const volunteerIds = confirmedShifts.map(s => s.volunteerId)
      const dateShort = SHORT_DATE(shabbatDate)
      await createBulkNotifications(
        volunteerIds, branchId,
        `שיבוץ שבת אושר 🕍`,
        `שובצת לתורנות שבת ${dateShort} — ${confirmedShifts.find(s => s.volunteerId)?.area ?? ''}`,
        'shabbat_confirmed'
      )
      setPublishSuccess(true)
      showToast('success', `שיבוץ שבת ${dateShort} פורסם! ${confirmedShifts.length} מתנדבים קיבלו הודעה`)
    } catch {
      showToast('error', 'שגיאה בפרסום השיבוץ')
    } finally {
      setPublishing(false)
    }
  }

  const myThisShabbat = shifts.find(s => s.volunteerId === user?.id)
  const myStatusLabel = myThisShabbat ? STATUS_HEB[myThisShabbat.status] : null

  // ── WhatsApp copy ─────────────────────────────────────────────────────────
  const handleCopyWhatsApp = async () => {
    const bName  = branchData?.name ?? ''
    const bCity  = branchData?.city ?? ''
    const parsha = getParshaName(shabbatDate)
    const coordName = shabbatCoordinator
      ? `${shabbatCoordinator.firstName ?? ''} ${shabbatCoordinator.lastName ?? ''}`.trim()
      : ''

    // Fetch zmanim from Hebcal
    let candleLighting = ''
    let havdalah = ''
    let havdalahRT = ''
    try {
      const city = branchData?.settings?.shabbat?.cityForZmanim || branchData?.city || ''
      if (city) {
        const url = `https://www.hebcal.com/zmanim?cfg=json&city=${encodeURIComponent(city)}&date=${shabbatDate}&gy=${shabbatDate.slice(0,4)}&gm=${shabbatDate.slice(5,7)}&gd=${shabbatDate.slice(8,10)}&m=18`
        const res = await fetch(url)
        const json = await res.json()
        const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : ''
        candleLighting = fmt(json.times?.candleLighting)
        havdalah = fmt(json.times?.havdalah)
        if (json.times?.sunset) {
          const sunset = new Date(json.times.sunset)
          sunset.setMinutes(sunset.getMinutes() + 72)
          havdalahRT = sunset.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })
        }
      }
    } catch { }

    // One block per area — skip areas with no confirmed volunteers
    let areaBlocks = areas
      .map(({ name: areaName }) => {
        const confirmed = shifts.filter(s => s.area === areaName && s.status === 'confirmed')
        if (!confirmed.length) return null
        const lines = confirmed.map(s => {
          const vol  = allShabbatVols.find(v => v.id === s.volunteerId)
          const code = vol?.volunteerId ?? ''
          return `- ${s.volunteerName}${code ? ' ' + code : ''}`
        }).join('\n')
        return `*${bName} | ${areaName}*\n${lines}`
      })
      .filter(Boolean)

    // Add unassigned volunteers block
    const UNASSIGNED_WA = (a) => !a || a.trim() === '' || a.trim() === 'לא הוגדר'
    const unassignedConfirmed = shifts.filter(s => s.status === 'confirmed' && UNASSIGNED_WA(s.area))
    if (unassignedConfirmed.length > 0) {
      const lines = unassignedConfirmed.map(s => {
        const vol = allShabbatVols.find(v => v.id === s.volunteerId)
        const code = vol?.volunteerId ?? ''
        return `- ${s.volunteerName}${code ? ' ' + code : ''}`
      }).join('\n')
      areaBlocks.push(`*${bName} | ללא צוות מוגדר*\n${lines}`)
    }

    areaBlocks = areaBlocks.join('\n\n')

    const text = [
      `⚜️ תורני שבת | סניף ${bName} ⚜️`,
      '',
      parsha ? `*פרשת ${parsha}*` : '',
      '',
      areaBlocks,
      '',
      `🕰 *זמני כניסת ויציאת השבת ב${bCity}*`,
      `- *כניסת שבת* | ${candleLighting}`,
      `- *יציאת שבת* | ${havdalah}`,
      `- *יציאת שבת ר"ת* | ${havdalahRT}`,
      '',
      `תודה על מסירותכם להציל חיים בשבתות וחגי ישראל ע"פ ההלכה!`,
      ...(branchData?.settings?.shabbat?.whatsappSignature
        ? branchData.settings.shabbat.whatsappSignature.split('\n')
        : [
            coordName ? `${coordName} | רכז הלכה סניף ${bName}` : `רכז הלכה סניף ${bName}`,
            `אגף הלכה | מחוז חוף`,
            `הנהלת סניף ${bName}`,
          ]
      ),
    ].filter(l => l !== null).join('\n')

    try {
      await navigator.clipboard.writeText(text)
      showToast('success', 'ההודעה הועתקה ללוח ✓')
    } catch {
      // Fallback for iOS/Android
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      try {
        document.execCommand('copy')
        showToast('success', 'ההודעה הועתקה ללוח ✓')
      } catch {
        showToast('error', 'שגיאה בהעתקה — נסה שנית')
      }
      document.body.removeChild(el)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto pb-20 lg:pb-0" dir="rtl">

      <Toast toast={toast} />

      {/* Branch selector — system_admin only */}
      <BranchSelector value={adminBranchId} onChange={setAdminBranchId} />

      {isSystemAdmin && !branchId && (
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-14 text-center">
          <Globe size={44} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-600 font-medium">בחר סניף כדי לצפות בתורני שבת</p>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2.5">
          <Star size={24} color="#9333EA" weight="fill" />
          תורני שבת
        </h1>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
          <button
            onClick={() => setActiveTab('main')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition
              ${activeTab === 'main' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            שבת
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition
              ${activeTab === 'history' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            היסטוריה
          </button>
        </div>
      </div>

      {/* ═══ MAIN TAB ═══ */}
      {activeTab === 'main' && (
        <>
          {/* ── Week navigation card ── */}
          <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 mb-5">
            {canManageShabbat ? (
              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={() => setCurrentFriday(subWeeks(currentFriday, 1))}
                  className="p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 transition text-xl leading-none font-bold shrink-0"
                  aria-label="שבת קודמת"
                >
                  ›
                </button>

                <div className="text-center flex-1 min-w-0">
                  <h2 className="text-xl font-black text-gray-900 leading-tight">{parshaName ? parshaName : `שבת ${shabbatLabel}`}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {hebrewDateShort || shabbatLabel}
                  </p>
                  <div className="flex items-center justify-center mt-2.5">
                    {isPublished ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
                        ✓ פורסם
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                        טרם פורסם
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setCurrentFriday(addWeeks(currentFriday, 1))}
                  className="p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 transition text-xl leading-none font-bold shrink-0"
                  aria-label="שבת הבאה"
                >
                  ‹
                </button>
              </div>
            ) : (
              <div className="text-center">
                <h2 className="text-xl font-black text-gray-900">{parshaName ? parshaName : `שבת ${shabbatLabel}`}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {hebrewDateShort && <span>{hebrewDateShort} · </span>}
                  {shabbatLabel}
                </p>
                {isPublished && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full mt-2.5">
                    ✓ פורסם
                  </span>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-20 flex justify-center">
              <LoadingSpinner size="lg" text="טוען..." />
            </div>
          ) : (
            <div className="space-y-5">

              {/* ── VOLUNTEER VIEW ── */}
              {!canManageShabbat && (
                <>
                  <AvailabilityForm
                    user={user}
                    branchId={branchId}
                    shabbatDate={shabbatDate}
                    shabbatLabel={shabbatLabel}
                    myShiftsThisMonth={myMonthShifts}
                    branchSettings={{ ...nsSettings, maxPerMonth }}
                    shifts={shifts}
                    onSubmitted={refreshData}
                  />

                  {/* My status panel */}
                  <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                    <h3 className="font-bold text-gray-900 mb-4">הסטטוס שלי</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
                        <p className="text-2xl font-black text-orange-500">
                          {myMonthShifts.length}
                          <span className="text-gray-400 text-base font-normal">/{maxPerMonth}</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1.5 leading-tight">שבתות<br/>החודש</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
                        <p className="text-2xl font-black text-green-600">
                          {myMonthShifts.filter(s => s.status === 'confirmed').length}
                        </p>
                        <p className="text-xs text-gray-500 mt-1.5">מאושרות</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
                        <p className="text-sm font-bold text-gray-700 mt-1">
                          {user?.shabbatArea || user?.permissions?.shabbatArea || '—'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">אזור</p>
                      </div>
                      <div className={`rounded-xl p-4 text-center border ${
                        myThisShabbat?.status === 'confirmed'
                          ? 'bg-green-50 border-green-200'
                          : myThisShabbat?.status === 'available'
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-gray-50 border-gray-100'
                      }`}>
                        <p className={`text-sm font-bold mt-1 ${myStatusLabel?.color ?? 'text-gray-500'}`}>
                          {myStatusLabel?.label ?? 'לא דיווחתי'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">שבת זו</p>
                      </div>
                    </div>
                  </div>

                  {/* Published schedule — visible to all volunteers after publish */}
                  {isPublished && (
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                      <h3 className="font-black text-gray-900 text-base mb-4 flex items-center gap-2">
                        <Star size={18} color="#9333EA" weight="fill" /> שיבוץ תורני שבת — {shabbatLabel}
                      </h3>
                      <div className="space-y-4">
                        {areas.map(({ name: area }) => {
                          const confirmed = shifts.filter(s => s.area === area && s.status === 'confirmed')
                          if (!confirmed.length) return null
                          return (
                            <div key={area}>
                              <p className="text-sm font-bold text-gray-700 mb-2">{area}</p>
                              <div className="space-y-1.5">
                                {confirmed.map(s => {
                                  const isMe = s.volunteerId === user?.id
                                  return (
                                    <div key={s.id} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border
                                      ${isMe ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
                                      <span className={`text-sm font-medium ${isMe ? 'text-orange-700' : 'text-gray-800'}`}>
                                        {s.volunteerName}
                                        {isMe && <span className="text-xs text-orange-400 mr-1"> (אני)</span>}
                                      </span>
                                      {isMe && <span className="text-green-600 text-xs font-semibold">✓</span>}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                        {/* Unassigned */}
                        {shifts.filter(s => s.status === 'confirmed' && (!s.area || s.area.trim() === '' || s.area.trim() === 'לא הוגדר')).length > 0 && (
                          <div>
                            <p className="text-sm font-bold text-gray-700 mb-2">ללא צוות מוגדר</p>
                            <div className="space-y-1.5">
                              {shifts.filter(s => s.status === 'confirmed' && (!s.area || s.area.trim() === '' || s.area.trim() === 'לא הוגדר')).map(s => (
                                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl border bg-gray-50 border-gray-100">
                                  <span className="text-sm font-medium text-gray-800">{s.volunteerName}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── COORDINATOR VIEW ── */}
              {canManageShabbat && (
                <>
                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 text-center">
                      <p className="text-3xl font-black text-green-600">{confirmedCount}</p>
                      <p className="text-sm text-gray-500 mt-1.5">מאושרים</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 text-center">
                      <p className="text-3xl font-black text-amber-500">{pendingCount}</p>
                      <p className="text-sm text-gray-500 mt-1.5">ממתינים</p>
                    </div>
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4 text-center">
                      <p className="text-3xl font-black text-gray-400">{cancelledCount}</p>
                      <p className="text-sm text-gray-500 mt-1.5">נדחו</p>
                    </div>
                  </div>

                  {/* Area panels */}
                  {areas.length === 0 ? (
                    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-8 text-center">
                      <p className="text-gray-600 font-medium">לא הוגדרו אזורי שבת.</p>
                      <p className="text-gray-400 text-sm mt-1.5">הוסף אזורים בדף ניהול הסניף.</p>
                    </div>
                  ) : (
                    <>
                      <AreaPanel
                        areas={areas}
                        shabbatDate={shabbatDate}
                        shifts={shifts}
                        coordinatorId={user?.id}
                        monthShiftCounts={monthShiftCounts}
                        onRefresh={refreshData}
                        allVolunteers={allShabbatVols}
                      />
                      <UnassignedPanel
                        shifts={shifts}
                        allVolunteers={allShabbatVols}
                        coordinatorId={user?.id}
                        onRefresh={refreshData}
                      />
                    </>
                  )}

                  {/* Action buttons */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setShowPublishConfirm(true)}
                        disabled={publishing || confirmedCount === 0}
                        className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-4 py-3 rounded-xl text-sm font-bold transition shadow-sm"
                      >
                        {publishing ? 'מפרסם...' : isPublished
                          ? <><ArrowCounterClockwise size={15} /> עדכן שיבוץ</>
                          : <><MegaphoneSimple size={15} /> פרסם שיבוץ</>}
                      </button>

                      <button
                        onClick={handleCopyWhatsApp}
                        disabled={!isPublished}
                        className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] disabled:opacity-40 text-white px-4 py-3 rounded-xl text-sm font-bold transition shadow-sm"
                      >
                        <WhatsappLogo size={16} weight="fill" />
                        העתק לוואטסאפ
                      </button>
                    </div>
                  </div>

                  {/* Published schedule summary */}
                  {isPublished && (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
                      <h3 className="font-black text-green-800 text-base mb-4">✓ שיבוץ סופי — {shabbatLabel}</h3>
                      <div className="space-y-3">
                        {areas.map(({ name: area }) => {
                          const confirmed = shifts.filter(s => s.area === area && s.status === 'confirmed')
                          if (!confirmed.length) return null
                          return (
                            <div key={area} className="flex items-start gap-3">
                              <span className="text-sm font-semibold text-green-700 shrink-0 min-w-20">{area}:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {confirmed.map(s => (
                                  <span key={s.id} className="text-xs bg-green-100 text-green-700 border border-green-200 px-2.5 py-1 rounded-lg font-medium">
                                    {s.volunteerName}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Branch head who is also a shabbat volunteer can submit their own availability */}
                  {hasShabbat && (
                    <div className="border-t border-gray-100 pt-6">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <ClipboardText size={16} />
                        הזמינות שלי
                      </h3>
                      <AvailabilityForm
                        user={user}
                        branchId={branchId}
                        shabbatDate={shabbatDate}
                        shabbatLabel={shabbatLabel}
                        myShiftsThisMonth={myMonthShifts}
                        branchSettings={{ ...nsSettings, maxPerMonth }}
                        shifts={shifts}
                        onSubmitted={refreshData}
                      />
                    </div>
                  )}
                </>
              )}

              {/* "Not a shabbat volunteer" message */}
              {!canManageShabbat && !hasShabbat && !(user?.permissions?.shabbatVolunteer) && (
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-12 text-center">
                  <Lock size={36} className="mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-600 font-medium">אינך מוגדר כתורן שבת.</p>
                  <p className="text-gray-400 text-sm mt-1.5">פנה לרכז הסניף לעדכון הרשאות.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══ HISTORY TAB ═══ */}
      {activeTab === 'history' && (
        <div className="space-y-5">

          {/* ── Volunteer history ── */}
          {!canManageShabbat && (
            <>
              <h3 className="font-bold text-gray-900 text-lg">ההיסטוריה שלי</h3>
              {myHistory.length === 0 ? (
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-8 text-center text-gray-500">
                  אין היסטוריית שבתות
                </div>
              ) : (
                <div className="space-y-2">
                  {myHistory.map(shift => {
                    const st = STATUS_HEB[shift.status] ?? STATUS_HEB.available
                    return (
                      <div key={shift.id} className="flex items-center justify-between bg-white border border-gray-200 shadow-sm rounded-xl px-5 py-4">
                        <div>
                          <p className="text-gray-900 font-semibold">{SHORT_DATE(shift.shabbatDate)}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{shift.area || 'ללא אזור'}</p>
                        </div>
                        <span className={`text-sm font-semibold ${st.color}`}>{st.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Coordinator history ── */}
          {canManageShabbat && (
            <>
              <h3 className="font-bold text-gray-900 text-lg">שבתות אחרונות</h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {shabbatHistory.map(date => (
                  <button
                    key={date}
                    onClick={() => loadHistoryShifts(date)}
                    className={`text-center py-3.5 px-3 rounded-xl border text-sm font-semibold transition
                      ${historyDate === date
                        ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-orange-300 hover:text-orange-500 shadow-sm'}`}
                  >
                    {SHORT_DATE(date)}
                  </button>
                ))}
                {shabbatHistory.length === 0 && (
                  <p className="col-span-3 text-center text-gray-500 py-8">אין היסטוריה</p>
                )}
              </div>

              {/* Selected history date detail */}
              {historyDate && (
                <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5">
                  <h4 className="font-black text-gray-900 text-base mb-5">{hebrewDate(historyDate)}</h4>
                  {historyLoading ? (
                    <div className="py-6 flex justify-center">
                      <LoadingSpinner size="sm" text="טוען..." />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        {areas.map(({ name: area }) => {
                          const areaShifts = historyShifts.filter(s => s.area === area && s.status === 'confirmed')
                          if (!areaShifts.length) return null
                          return (
                            <div key={area}>
                              <p className="text-sm font-bold text-gray-700 mb-2">{area}</p>
                              <div className="space-y-1.5">
                                {areaShifts.map(s => (
                                  <div key={s.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 px-4 py-2.5 rounded-xl">
                                    <span className="text-gray-800 text-sm font-medium">{s.volunteerName}</span>
                                    <span className="text-green-600 text-xs font-semibold">✓ שובץ</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="mt-5 pt-4 border-t border-gray-100">
                        <p className="text-xs text-gray-400">
                          סה״כ:{' '}
                          <span className="font-semibold text-green-600">{historyShifts.filter(s => s.status === 'confirmed').length} מאושרים</span>
                          {' · '}
                          <span className="font-semibold text-amber-600">{historyShifts.filter(s => s.status === 'available').length} ממתינים</span>
                          {' · '}
                          <span className="font-semibold text-gray-500">{historyShifts.filter(s => s.status === 'not_available').length} לא זמינים</span>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {/* ── Publish confirmation modal ── */}
      {showPublishConfirm && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setShowPublishConfirm(false)}
          dir="rtl"
        >
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-gray-900 text-lg mb-1">אישור עדכון שיבוץ</h3>
            <p className="text-gray-500 text-sm mb-4">{shabbatLabel} · {confirmedCount} מתנדבים</p>

            {/* Per-area assignment summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 space-y-3">
              {areas.map(({ name: area }) => {
                const confirmed = shifts.filter(s => s.area === area && s.status === 'confirmed')
                if (!confirmed.length) return null
                return (
                  <div key={area}>
                    <p className="text-sm font-bold text-gray-700 mb-1.5">{area}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {confirmed.map(s => (
                        <span key={s.id} className="text-xs bg-orange-500/10 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-lg font-medium">
                          {s.volunteerName}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
              {confirmedCount === 0 && (
                <p className="text-gray-500 text-sm text-center py-2">אין מתנדבים מאושרים</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowPublishConfirm(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl transition text-sm font-medium"
              >
                ביטול
              </button>
              <button
                onClick={() => { setShowPublishConfirm(false); handlePublish() }}
                disabled={publishing || confirmedCount === 0}
                className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition text-sm"
              >
                אשר ועדכן
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
