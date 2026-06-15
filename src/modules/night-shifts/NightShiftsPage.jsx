import { useState, useEffect } from 'react'
import { format, addMonths, subMonths, isSameMonth, startOfMonth, differenceInHours, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../hooks/useRole'
import { getBranchSettings } from '../../firebase/branches'
import { getBranchUsers } from '../../firebase/users'
import { getMonthShifts, signUpForShift, cancelShift } from '../../firebase/nightShifts'
import { createBulkNotifications } from '../../firebase/notifications'
import Calendar from './Calendar'
import ShiftModal from './ShiftModal'
import StatusPanel from './StatusPanel'
import UrgencyBanner from './UrgencyBanner'
import Leaderboard from './Leaderboard'
import NightShiftsAdmin from './NightShiftsAdmin'
import ConfettiAnimation from '../../shared/ConfettiAnimation'
import LoadingSpinner from '../../shared/LoadingSpinner'
import BranchSelector from '../../shared/BranchSelector'
import { Moon, Globe } from '@phosphor-icons/react'

const DEFAULT_NS = {
  startTime: '00:00',
  endTime: '06:00',
  maxPerNight: 1,
  blockFriday: false,
  maxPerMonth: 3,
  openOnDay: 20,
  enableLottery: true,
}

export default function NightShiftsPage() {
  const { user } = useAuth()
  const { canManageNightShifts, branchId: userBranchId, isSystemAdmin } = useRole()
  const [adminBranchId, setAdminBranchId] = useState(null)
  const branchId = isSystemAdmin ? adminBranchId : userBranchId

  const [currentDate, setCurrentDate] = useState(() => startOfMonth(new Date()))
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [nsSettings, setNsSettings] = useState(DEFAULT_NS)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedShift, setSelectedShift] = useState(null)
  const [modalError, setModalError] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [activeTab, setActiveTab] = useState('calendar')

  // Volunteer details view (admin clicking an occupied day)
  const [viewShift, setViewShift] = useState(null)
  const [viewUser, setViewUser] = useState(null)
  const [viewUserLoading, setViewUserLoading] = useState(false)

  const now = new Date()
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const isCurrentMonth = isSameMonth(currentDate, now)
  const isNextMonth = isSameMonth(currentDate, addMonths(now, 1))
  // next month tab appears on/after openOnDay
  const showMonthTabs = now.getDate() >= (nsSettings.openOnDay || 20)

  // Load branch NS settings once
  useEffect(() => {
    if (!branchId) return
    getBranchSettings(branchId)
      .then(s => { if (s?.nightShifts) setNsSettings({ ...DEFAULT_NS, ...s.nightShifts }) })
      .catch(() => {})
  }, [branchId])

  const loadShifts = async () => {
    if (!branchId) return
    setLoading(true)
    try {
      setShifts(await getMonthShifts(branchId, year, month))
    } catch {
      setShifts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadShifts() }, [branchId, year, month])

  const myShiftsThisMonth = shifts.filter(s => s.volunteerId === user?.id)

  // ── Modal logic ────────────────────────────────────────────────────────────
  const openModal = (dateStr, shift) => {
    setModalError('')
    // Anyone clicking a day occupied by someone else → show details
    if (shift && shift.volunteerId !== user?.id) {
      setViewShift(shift)
      setViewUser(null)
      setViewUserLoading(true)
      getBranchUsers(branchId)
        .then(users => setViewUser(users.find(u => u.id === shift.volunteerId) ?? null))
        .catch(() => setViewUser(null))
        .finally(() => setViewUserLoading(false))
      return
    }
    setSelectedDate(dateStr)
    setSelectedShift(shift || null)
  }

  const closeModal = () => {
    setSelectedDate(null)
    setSelectedShift(null)
    setModalError('')
  }

  const handleConfirm = async () => {
    if (!selectedDate) return
    setModalLoading(true)
    setModalError('')
    try {
      if (selectedShift?.volunteerId === user?.id) {
        // Cancel flow
        const hoursUntil = differenceInHours(parseISO(selectedDate), new Date())
        if (hoursUntil < 24) {
          setModalError('לא ניתן לבטל פחות מ-24 שעות לפני המשמרת')
          return
        }
        await cancelShift(selectedShift.id)
        // Notify coordinators
        notifyCoordinators(
          'ביטול שיבוץ לילה',
          `${user.firstName} ${user.lastName} ביטל שיבוץ בתאריך ${selectedDate}`
        )
        closeModal()
        setSuccessMsg('השיבוץ בוטל בהצלחה')
      } else {
        // Signup flow
        if (myShiftsThisMonth.length >= (nsSettings.maxPerMonth || 3)) {
          setModalError(`הגעת למקסימום שיבוצים החודש (${nsSettings.maxPerMonth || 3})`)
          return
        }
        await signUpForShift(branchId, selectedDate, user.id, `${user.firstName} ${user.lastName}`)
        setConfetti(true)
        setTimeout(() => setConfetti(false), 3500)
        closeModal()
        setSuccessMsg(nsSettings.enableLottery !== false ? 'נרשמת בהצלחה! אתה בהגרלה 🎉' : 'נרשמת בהצלחה! 🎉')
      }
      await loadShifts()
    } catch (err) {
      console.error('[NightShifts] registration failed:', err?.code, err?.message, err)
      setModalError('שגיאה, נסה שנית')
    } finally {
      setModalLoading(false)
      setTimeout(() => setSuccessMsg(''), 5000)
    }
  }

  const notifyCoordinators = async (title, body) => {
    try {
      const users = await getBranchUsers(branchId)
      const ids = users
        .filter(u =>
          u.role === 'branch_head' || u.role === 'branch_deputy' ||
          (u.role === 'role_holder' && (u.roleTypes?.includes('night_coordinator') || u.roleType === 'night_coordinator'))
        )
        .map(u => u.id)
      if (ids.length) await createBulkNotifications(ids, branchId, title, body, 'shift_cancelled')
    } catch {}
  }

  // ── Month navigation ───────────────────────────────────────────────────────
  const goToPrevMonth = () => {
    const prev = subMonths(currentDate, 1)
    if (startOfMonth(prev) < startOfMonth(now)) return  // clamp: can't go before current month
    setCurrentDate(startOfMonth(prev))
  }
  const goToNextMonth = () => setCurrentDate(startOfMonth(addMonths(currentDate, 1)))

  const monthLabel = format(currentDate, 'MMMM yyyy', { locale: he })

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto pb-20 lg:pb-0" dir="rtl">
      <ConfettiAnimation trigger={confetti} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Moon size={24} color="#6366F1" weight="fill" /> שיבוצי לילה
        </h1>
        {canManageNightShifts && (
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
                ${activeTab === 'calendar' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              לוח שנה
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
                ${activeTab === 'admin' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              ניהול
            </button>
          </div>
        )}
      </div>

      {/* Branch selector — system_admin only */}
      <BranchSelector value={adminBranchId} onChange={setAdminBranchId} />

      {isSystemAdmin && !branchId && (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <Globe size={40} className="text-gray-300 mb-3 mx-auto" />
          <p className="text-gray-700 font-medium">בחר סניף כדי לצפות בשיבוצי לילה</p>
        </div>
      )}

      {/* Success toast */}
      {successMsg && (
        <div className="mb-4 bg-green-500/15 border border-green-500/30 rounded-xl px-4 py-3 text-green-800 text-center font-medium">
          {successMsg}
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={goToPrevMonth}
          disabled={isCurrentMonth}
          className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-800 transition text-xl leading-none"
          aria-label="חודש קודם"
        >
          ›
        </button>
        <div className="text-center">
          <h2 className="text-lg font-bold text-gray-800 capitalize">{monthLabel}</h2>
          {isNextMonth && (
            <span className="text-xs text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">חודש הבא</span>
          )}
        </div>
        <button
          onClick={goToNextMonth}
          className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 transition text-xl leading-none"
          aria-label="חודש הבא"
        >
          ‹
        </button>
      </div>

      {/* Next-month quick tabs (visible from openOnDay) */}
      {showMonthTabs && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setCurrentDate(startOfMonth(now))}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition
              ${isCurrentMonth ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-800 border border-gray-200'}`}
          >
            חודש נוכחי
          </button>
          <button
            onClick={() => setCurrentDate(startOfMonth(addMonths(now, 1)))}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition
              ${isNextMonth ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-800 border border-gray-200'}`}
          >
            📅 חודש הבא
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center">
          <LoadingSpinner size="lg" text="טוען שיבוצים..." />
        </div>
      ) : (
        <div className="space-y-5">
          <UrgencyBanner shifts={shifts} year={year} month={month} />

          {activeTab === 'calendar' && (
            <>
              <Calendar
                year={year}
                month={month}
                shifts={shifts}
                volunteerId={user?.id}
                onDayClick={openModal}
                isAdmin={canManageNightShifts}
                blockFriday={nsSettings.blockFriday}
                maxPerNight={nsSettings.maxPerNight || 1}
              />
              <StatusPanel
                shifts={shifts}
                volunteerId={user?.id}
                year={year}
                month={month}
                maxPerMonth={nsSettings.maxPerMonth || 3}
                enableLottery={nsSettings.enableLottery !== false}
              />
              {nsSettings.enableLottery !== false && (
                <Leaderboard shifts={shifts} currentUserId={user?.id} />
              )}
            </>
          )}

          {activeTab === 'admin' && canManageNightShifts && (
            <>
              <Calendar
                year={year}
                month={month}
                shifts={shifts}
                volunteerId={user?.id}
                onDayClick={openModal}
                isAdmin
                blockFriday={nsSettings.blockFriday}
                maxPerNight={nsSettings.maxPerNight || 1}
              />
              <NightShiftsAdmin
                branchId={branchId}
                shifts={shifts}
                year={year}
                month={month}
                onRefresh={loadShifts}
                blockFriday={nsSettings.blockFriday}
              />
            </>
          )}
        </div>
      )}

      {/* Shift modal */}
      {selectedDate && (
        <ShiftModal
          date={selectedDate}
          isOwn={selectedShift?.volunteerId === user?.id}
          onConfirm={handleConfirm}
          onCancel={closeModal}
          loading={modalLoading}
          errorMsg={modalError}
          branchSettings={nsSettings}
        />
      )}

      {/* Volunteer details modal — admin clicking an occupied day */}
      {viewShift && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setViewShift(null)}>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl" dir="rtl">
            <div className="text-center mb-5">
              <h2 className="text-xl font-bold text-gray-800">פרטי מתנדב</h2>
            </div>

            {viewUserLoading ? (
              <div className="py-4 flex justify-center"><LoadingSpinner size="md" /></div>
            ) : (
              <div className="space-y-2.5">
                <div className="bg-gray-100 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">שם מלא</p>
                  <p className="text-gray-800 font-medium">{viewShift.volunteerName || '—'}</p>
                </div>
                <div className="bg-gray-100 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">קוד כונן</p>
                  <p className="text-gray-800 font-mono">{viewUser?.volunteerId || '—'}</p>
                </div>
                <div className="bg-gray-100 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">טלפון</p>
                  <p className="text-gray-800" dir="ltr">{viewUser?.phone || '—'}</p>
                </div>
                {viewUser?.team && (
                  <div className="bg-gray-100 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500 mb-0.5">צוות</p>
                    <p className="text-gray-800">{viewUser.team}</p>
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setViewShift(null)}
              className="mt-5 w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl font-medium transition">
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
