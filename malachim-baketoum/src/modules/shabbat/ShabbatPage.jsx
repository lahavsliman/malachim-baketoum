import { useState, useEffect, useRef } from 'react'
import { format, nextFriday, isFriday, subWeeks, addWeeks, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../hooks/useRole'
import { getBranchSettings } from '../../firebase/branches'
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
  confirmVolunteer,
} from '../../firebase/shabbatShifts'
import AvailabilityForm from './AvailabilityForm'
import AreaPanel from './AreaPanel'
import LoadingSpinner from '../../shared/LoadingSpinner'
import BranchSelector from '../../shared/BranchSelector'

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

const STATUS_HEB = {
  available: { label: 'ממתין לאישור', color: 'text-yellow-300' },
  confirmed: { label: 'מאושר ✅', color: 'text-green-300' },
  cancelled: { label: 'לא שובצת', color: 'text-gray-400' },
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
  const [shifts, setShifts] = useState([])           // shifts for selected shabbat
  const [allShabbatVols, setAllShabbatVols] = useState([])
  const [myMonthShifts, setMyMonthShifts] = useState([])
  const [branchMonthShifts, setBranchMonthShifts] = useState([])
  const [branchSettings, setBranchSettings] = useState(null)
  const [myHistory, setMyHistory] = useState([])
  const [shabbatHistory, setShabbatHistory] = useState([])
  const [historyDate, setHistoryDate] = useState(null)
  const [historyShifts, setHistoryShifts] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Coordinator UI
  const [publishing, setPublishing] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)
  const [toast, setToast] = useState(null)

  const unsubRef = useRef(null)

  const shabbatDate = format(currentFriday, 'yyyy-MM-dd')
  const shabbatLabel = format(currentFriday, 'EEEE, d בMMMM yyyy', { locale: he })
  const monthStr = format(currentFriday, 'yyyy-MM')

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  // Load branch settings once
  useEffect(() => {
    if (!branchId) return
    getBranchSettings(branchId)
      .then(s => setBranchSettings(s ?? {}))
      .catch(() => setBranchSettings({}))
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
      .then(us => setAllShabbatVols(us.filter(u => u.permissions?.shabbatVolunteer || u.shabbatVolunteer)))
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

  // Per-volunteer confirmed count this month (for fairness display)
  const monthShiftCounts = {}
  branchMonthShifts.filter(s => s.status === 'confirmed').forEach(s => {
    monthShiftCounts[s.volunteerId] = (monthShiftCounts[s.volunteerId] || 0) + 1
  })

  // Stats for coordinator
  const confirmedCount = shifts.filter(s => s.status === 'confirmed').length
  const pendingCount = shifts.filter(s => s.status === 'available').length
  const cancelledCount = shifts.filter(s => s.status === 'cancelled').length

  // ── Coordinator: auto-suggest for one area ───────────────────────────────
  const handleAutoSuggest = async (areaName) => {
    const areaConfig = areas.find(a => a.name === areaName)
    const required = areaConfig?.required ?? 1

    const available = shifts
      .filter(s => s.area === areaName && s.status === 'available')
      .sort((a, b) => (monthShiftCounts[a.volunteerId] ?? 0) - (monthShiftCounts[b.volunteerId] ?? 0))

    const toConfirm = available.slice(0, required)
    if (!toConfirm.length) { showToast('error', 'אין מתנדבים זמינים לאזור זה'); return }

    await Promise.all(toConfirm.map(s => confirmVolunteer(s.id, user?.id)))
    showToast('success', `אושרו ${toConfirm.length} מתנדבים לאזור ${areaName}`)
  }

  // ── Coordinator: auto-suggest all areas ──────────────────────────────────
  const handleAutoSuggestAll = async () => {
    for (const area of areas) {
      const available = shifts
        .filter(s => s.area === area.name && s.status === 'available')
        .sort((a, b) => (monthShiftCounts[a.volunteerId] ?? 0) - (monthShiftCounts[b.volunteerId] ?? 0))
      const toConfirm = available.slice(0, area.required)
      await Promise.all(toConfirm.map(s => confirmVolunteer(s.id, user?.id)))
    }
    showToast('success', 'הצעה אוטומטית הוחלה על כל האזורים')
  }

  // ── Coordinator: publish schedule ────────────────────────────────────────
  const handlePublish = async () => {
    const confirmedShifts = shifts.filter(s => s.status === 'confirmed')
    if (!confirmedShifts.length) { showToast('error', 'אין מתנדבים מאושרים לפרסום'); return }

    setPublishing(true)
    try {
      const confirmedIds = confirmedShifts.map(s => s.id)
      await publishSchedule(branchId, shabbatDate, confirmedIds)

      // Notify confirmed volunteers
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

  // ── My status for this shabbat (volunteer) ───────────────────────────────
  const myThisShabbat = shifts.find(s => s.volunteerId === user?.id)
  const myStatusLabel = myThisShabbat ? STATUS_HEB[myThisShabbat.status] : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto" dir="rtl">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl text-sm font-medium pointer-events-none
          ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* Branch selector — system_admin only */}
      <BranchSelector value={adminBranchId} onChange={setAdminBranchId} />

      {isSystemAdmin && !branchId && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🌐</div>
          <p className="text-gray-300 font-medium">בחר סניף כדי לצפות בתורני שבת</p>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-gray-100 flex items-center gap-2">
          🕍 תורני שבת
        </h1>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-900 p-1 rounded-xl border border-gray-800">
          <button
            onClick={() => setActiveTab('main')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
              ${activeTab === 'main' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            שבת
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
              ${activeTab === 'history' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            היסטוריה
          </button>
        </div>
      </div>

      {/* ═══ MAIN TAB ═══ */}
      {activeTab === 'main' && (
        <>
          {/* Week navigation (coordinator sees full nav; volunteer fixed to upcoming) */}
          <div className="flex items-center justify-between mb-5">
            {canManageShabbat ? (
              <>
                <button
                  onClick={() => setCurrentFriday(subWeeks(currentFriday, 1))}
                  className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 transition text-xl leading-none"
                  aria-label="שבת קודמת"
                >
                  ›
                </button>
                <div className="text-center">
                  <h2 className="font-bold text-gray-200">{shabbatLabel}</h2>
                  {isPublished && (
                    <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full mt-1 inline-block">
                      ✓ פורסם
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setCurrentFriday(addWeeks(currentFriday, 1))}
                  className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 transition text-xl leading-none"
                  aria-label="שבת הבאה"
                >
                  ‹
                </button>
              </>
            ) : (
              <h2 className="font-bold text-gray-200 text-center w-full">
                שבת {shabbatLabel}
              </h2>
            )}
          </div>

          {loading ? (
            <div className="py-16 flex justify-center">
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
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                    <h3 className="font-bold text-gray-200 mb-4">הסטטוס שלי</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700">
                        <p className="text-xl font-black text-orange-400">
                          {myMonthShifts.length}
                          <span className="text-gray-500 text-sm font-normal">/{maxPerMonth}</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-1">שבתות החודש</p>
                      </div>
                      <div className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700">
                        <p className="text-xl font-black text-green-400">
                          {myMonthShifts.filter(s => s.status === 'confirmed').length}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">מאושרות</p>
                      </div>
                      <div className="bg-gray-800/50 rounded-xl p-3 text-center border border-gray-700">
                        <p className="text-sm font-bold text-gray-300 mt-1">
                          {user?.shabbatArea || user?.permissions?.shabbatArea || '—'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">אזור</p>
                      </div>
                      <div className={`rounded-xl p-3 text-center border ${
                        myStatusLabel
                          ? myThisShabbat.status === 'confirmed'
                            ? 'bg-green-500/10 border-green-500/30'
                            : 'bg-gray-800/50 border-gray-700'
                          : 'bg-gray-800/50 border-gray-700'
                      }`}>
                        <p className={`text-sm font-bold mt-1 ${myStatusLabel?.color ?? 'text-gray-500'}`}>
                          {myStatusLabel?.label ?? 'לא דיווחתי'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">שבת זו</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── COORDINATOR VIEW ── */}
              {canManageShabbat && (
                <>
                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-green-400">{confirmedCount}</p>
                      <p className="text-xs text-gray-400 mt-1">מאושרים</p>
                    </div>
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-yellow-400">{pendingCount}</p>
                      <p className="text-xs text-gray-400 mt-1">ממתינים</p>
                    </div>
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-gray-400">{cancelledCount}</p>
                      <p className="text-xs text-gray-400 mt-1">נדחו</p>
                    </div>
                  </div>

                  {/* Area panels */}
                  {areas.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center text-gray-400">
                      <p>לא הוגדרו אזורי שבת.</p>
                      <p className="text-sm mt-1">הוסף אזורים בדף ניהול הסניף.</p>
                    </div>
                  ) : (
                    <AreaPanel
                      areas={areas}
                      shabbatDate={shabbatDate}
                      shifts={shifts}
                      coordinatorId={user?.id}
                      monthShiftCounts={monthShiftCounts}
                      onRefresh={refreshData}
                      onAutoSuggest={handleAutoSuggest}
                      allVolunteers={allShabbatVols}
                    />
                  )}

                  {/* Action buttons — always visible so coordinator can adjust even after publishing */}
                  <div className="flex flex-wrap gap-3">
                    {pendingCount > 0 && (
                      <button
                        onClick={handleAutoSuggestAll}
                        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium transition border border-gray-700"
                      >
                        🤖 הצעה אוטומטית לכל האזורים
                      </button>
                    )}

                    <button
                      onClick={handlePublish}
                      disabled={publishing || confirmedCount === 0}
                      className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition"
                    >
                      {publishing ? 'מפרסם...' : isPublished
                        ? `🔄 עדכן שיבוץ (${confirmedCount} מתנדבים)`
                        : `📢 פרסם שיבוץ סופי (${confirmedCount} מתנדבים)`}
                    </button>
                  </div>

                  {/* Published schedule summary */}
                  {isPublished && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5">
                      <h3 className="font-bold text-green-300 mb-3">✓ שיבוץ סופי — {shabbatLabel}</h3>
                      {areas.map(({ name: area }) => {
                        const confirmed = shifts.filter(s => s.area === area && s.status === 'confirmed')
                        if (!confirmed.length) return null
                        return (
                          <div key={area} className="mb-2">
                            <span className="text-gray-400 text-sm">{area}: </span>
                            <span className="text-gray-200 text-sm">{confirmed.map(s => s.volunteerName).join(', ')}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Branch head who is also a shabbat volunteer can submit their own availability */}
                  {hasShabbat && (
                    <div className="border-t border-gray-800 pt-5">
                      <h3 className="font-bold text-gray-300 mb-3">📋 הזמינות שלי</h3>
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
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
                  <span className="text-3xl">🔒</span>
                  <p className="text-gray-400 mt-3">אינך מוגדר כתורן שבת.</p>
                  <p className="text-gray-500 text-sm mt-1">פנה לרכז הסניף לעדכון הרשאות.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══ HISTORY TAB ═══ */}
      {activeTab === 'history' && (
        <div className="space-y-4">

          {/* ── Volunteer history ── */}
          {!canManageShabbat && (
            <>
              <h3 className="font-bold text-gray-200">ההיסטוריה שלי</h3>
              {myHistory.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center text-gray-500">
                  אין היסטוריית שבתות
                </div>
              ) : (
                <div className="space-y-2">
                  {myHistory.map(shift => {
                    const st = STATUS_HEB[shift.status] ?? STATUS_HEB.available
                    return (
                      <div key={shift.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                        <div>
                          <p className="text-gray-200 font-medium">{SHORT_DATE(shift.shabbatDate)}</p>
                          <p className="text-gray-500 text-xs mt-0.5">{shift.area || 'ללא אזור'}</p>
                        </div>
                        <span className={`text-sm font-medium ${st.color}`}>{st.label}</span>
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
              <h3 className="font-bold text-gray-200">שבתות אחרונות</h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {shabbatHistory.map(date => (
                  <button
                    key={date}
                    onClick={() => loadHistoryShifts(date)}
                    className={`text-center py-3 px-2 rounded-xl border text-sm font-medium transition
                      ${historyDate === date
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-gray-900 text-gray-300 border-gray-700 hover:border-orange-500/50'}`}
                  >
                    {SHORT_DATE(date)}
                  </button>
                ))}
                {shabbatHistory.length === 0 && (
                  <p className="col-span-3 text-center text-gray-500 py-6">אין היסטוריה</p>
                )}
              </div>

              {/* Selected history date detail */}
              {historyDate && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                  <h4 className="font-bold text-gray-200 mb-4">{hebrewDate(historyDate)}</h4>
                  {historyLoading ? (
                    <LoadingSpinner size="sm" text="טוען..." />
                  ) : (
                    <>
                      {areas.map(({ name: area }) => {
                        const areaShifts = historyShifts.filter(s => s.area === area && s.status === 'confirmed')
                        if (!areaShifts.length) return null
                        return (
                          <div key={area} className="mb-4">
                            <p className="text-gray-400 text-sm font-medium mb-2">{area}</p>
                            <div className="space-y-1">
                              {areaShifts.map(s => (
                                <div key={s.id} className="flex items-center justify-between bg-gray-800/50 px-3 py-2 rounded-xl text-sm">
                                  <span className="text-gray-200">{s.volunteerName}</span>
                                  <span className="text-green-400 text-xs">✓ שובץ</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}

                      {/* Volunteer stats for this past shabbat */}
                      <div className="mt-4 pt-4 border-t border-gray-800">
                        <p className="text-xs text-gray-500 mb-2">
                          סה״כ: {historyShifts.filter(s => s.status === 'confirmed').length} מאושרים,{' '}
                          {historyShifts.filter(s => s.status === 'available').length} ממתינים,{' '}
                          {historyShifts.filter(s => s.status === 'not_available').length} לא זמינים
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
    </div>
  )
}
