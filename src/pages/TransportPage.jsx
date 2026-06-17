import { useState, useEffect } from 'react'
import { format, parseISO, startOfMonth, addMonths, subMonths } from 'date-fns'
import { he } from 'date-fns/locale'
import { useAuth } from '../context/AuthContext'
import { useRole } from '../hooks/useRole'
import { getBranchUsers } from '../firebase/users'
import { addTransportShift, getBranchTransportShifts } from '../firebase/transportShifts'
import LoadingSpinner from '../shared/LoadingSpinner'
import BranchSelector from '../shared/BranchSelector'
import Toast from '../shared/Toast'
import { Car, Truck, Plus, Clock, Globe } from '@phosphor-icons/react'

const inp = 'bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-500 w-full text-sm'
const lbl = 'block text-xs text-gray-500 mb-1'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TransportPage() {
  const { user } = useAuth()
  const { canManageTransport, canSeeCarShifts, canSeeAmbulanceShifts, branchId: userBranchId, isSystemAdmin } = useRole()
  const [adminBranchId, setAdminBranchId] = useState(null)
  const branchId = isSystemAdmin ? adminBranchId : userBranchId

  const [activeType, setActiveType] = useState(canSeeCarShifts ? 'car' : 'ambulance')

  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [shifts, setShifts] = useState([])
  const [shiftsLoading, setShiftsLoading] = useState(true)

  const [toast, setToast] = useState(null)
  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))

  const [modalDriver, setModalDriver] = useState(null)
  const [form, setForm] = useState({ date: todayStr(), hours: '', shiftType: 'משמרת', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!branchId) return
    setLoading(true)
    getBranchUsers(branchId)
      .then(setDrivers)
      .catch(() => setDrivers([]))
      .finally(() => setLoading(false))
  }, [branchId])

  const loadShifts = async () => {
    if (!branchId) return
    setShiftsLoading(true)
    try {
      setShifts(await getBranchTransportShifts(branchId))
    } catch {
      setShifts([])
    } finally {
      setShiftsLoading(false)
    }
  }

  useEffect(() => { loadShifts() }, [branchId])

  if (!canManageTransport) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto" dir="rtl">
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <p className="text-gray-700 font-medium">אין הרשאה</p>
        </div>
      </div>
    )
  }

  const typeDrivers = drivers.filter(d => {
    const p = d.permissions || {}
    return activeType === 'car'
      ? (p.vehicleDriver === true || d.vehicleDriver === true)
      : (p.ambulanceDriver === true || d.ambulanceDriver === true)
  })

  const monthStr = format(currentMonth, 'yyyy-MM')
  const filteredShifts = shifts.filter(s =>
    s.type === activeType && typeof s.date === 'string' && s.date.startsWith(monthStr)
  )

  const summary = typeDrivers.map(d => {
    const driverShifts = filteredShifts.filter(s => s.volunteerId === d.id)
    const shiftsCount = driverShifts.filter(s => s.shiftType === 'משמרת').length
    const onCallCount = driverShifts.filter(s => s.shiftType === 'כונן').length
    const totalHours = driverShifts.reduce((sum, s) => sum + (Number(s.hours) || 0), 0)
    return { driver: d, shiftsCount, onCallCount, totalHours }
  })
  summary.sort((a, b) => {
    const aTotal = a.shiftsCount + a.onCallCount
    const bTotal = b.shiftsCount + b.onCallCount
    if (bTotal !== aTotal) return bTotal - aTotal
    return b.totalHours - a.totalHours
  })

  const openModal = (driver) => {
    setModalDriver(driver)
    setForm({ date: todayStr(), hours: '', shiftType: 'משמרת', notes: '' })
  }

  const closeModal = () => setModalDriver(null)

  const handleSave = async () => {
    if (!form.date || !form.hours) {
      showToast('error', 'יש למלא תאריך ושעות')
      return
    }
    setSaving(true)
    try {
      await addTransportShift(branchId, {
        volunteerId: modalDriver.id,
        volunteerName: `${modalDriver.firstName} ${modalDriver.lastName}`,
        type: activeType,
        date: form.date,
        hours: Number(form.hours),
        shiftType: form.shiftType,
        notes: form.notes,
      }, user.id, `${user.firstName} ${user.lastName}`)
      await loadShifts()
      closeModal()
      showToast('success', 'הרישום נוסף בהצלחה')
    } catch {
      showToast('error', 'שגיאה בשמירה, נסה שנית')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto pb-20 lg:pb-0" dir="rtl">
      <Toast toast={toast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Car size={24} color="#F97316" weight="fill" /> ניהול תחבורה
        </h1>
        {canSeeCarShifts && canSeeAmbulanceShifts && (
          <div className="flex gap-2">
            <button
              onClick={() => setActiveType('car')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1
                ${activeType === 'car' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <Car size={15} /> רכב
            </button>
            <button
              onClick={() => setActiveType('ambulance')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1
                ${activeType === 'ambulance' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <Truck size={15} /> אמבולנס
            </button>
          </div>
        )}
      </div>

      {/* Branch selector — system_admin only */}
      <BranchSelector value={adminBranchId} onChange={setAdminBranchId} />

      {isSystemAdmin && !branchId && (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <Globe size={40} className="text-gray-300 mb-3 mx-auto" />
          <p className="text-gray-700 font-medium">בחר סניף כדי לצפות בנתוני תחבורה</p>
        </div>
      )}

      {branchId && (
        <>
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={() => setCurrentMonth(m => startOfMonth(subMonths(m, 1)))}
              className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 transition text-xl leading-none"
              aria-label="חודש קודם"
            >›</button>
            <h2 className="text-lg font-bold text-gray-800 capitalize">{format(currentMonth, 'MMMM yyyy', { locale: he })}</h2>
            <button
              onClick={() => setCurrentMonth(m => startOfMonth(addMonths(m, 1)))}
              className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 transition text-xl leading-none"
              aria-label="חודש הבא"
            >‹</button>
          </div>

          {loading || shiftsLoading ? (
            <div className="py-16 flex justify-center"><LoadingSpinner size="lg" text="טוען נתונים..." /></div>
          ) : (
            <>
              {/* Summary table */}
              <div className="overflow-x-auto rounded-2xl border border-gray-200 mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-white">
                      {['נהג', 'משמרות', 'כוננויות', 'סך שעות', ''].map((h, i) => (
                        <th key={i} className="text-right py-2.5 px-3 text-gray-500 font-medium text-xs whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.length === 0 ? (
                      <tr><td colSpan={5} className="py-10 text-center text-gray-500">לא נמצאו נהגים</td></tr>
                    ) : summary.map(({ driver, shiftsCount, onCallCount, totalHours }) => (
                      <tr key={driver.id} className="border-b border-gray-200">
                        <td className="py-2.5 px-3 text-gray-800 font-medium whitespace-nowrap">{driver.firstName} {driver.lastName}</td>
                        <td className="py-2.5 px-3 text-gray-700">{shiftsCount}</td>
                        <td className="py-2.5 px-3 text-gray-700">{onCallCount}</td>
                        <td className="py-2.5 px-3 text-gray-700">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={13} className="text-gray-400" /> {totalHours}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => openModal(driver)}
                            className="inline-flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400 transition font-medium"
                          >
                            <Plus size={14} /> הוסף רישום
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </>
          )}
        </>
      )}

      {/* Add record modal */}
      {modalDriver && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl" dir="rtl">
            <h2 className="text-xl font-bold text-gray-800 mb-5">
              הוספת רישום - {modalDriver.firstName} {modalDriver.lastName}
            </h2>

            <div className="space-y-3">
              <div>
                <label className={lbl}>תאריך</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inp} />
                {form.date && (
                  <span className="text-sm text-gray-500 mr-2">
                    {format(parseISO(form.date), 'EEEE', { locale: he })}
                  </span>
                )}
              </div>
              <div>
                <label className={lbl}>שעות</label>
                <input
                  type="number" min="0" step="0.5" value={form.hours}
                  onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                  className={inp} placeholder="לדוגמה: 4"
                />
              </div>
              <div>
                <label className={lbl}>סוג</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, shiftType: 'משמרת' }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition
                      ${form.shiftType === 'משמרת' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-800 border border-gray-200'}`}
                  >
                    משמרת
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, shiftType: 'כונן' }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition
                      ${form.shiftType === 'כונן' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-800 border border-gray-200'}`}
                  >
                    כונן
                  </button>
                </div>
              </div>
              <div>
                <label className={lbl}>הערות</label>
                <textarea
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className={inp} rows={2} placeholder="אופציונלי"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={closeModal}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl font-medium transition">
                ביטול
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white py-2.5 rounded-xl font-medium transition">
                {saving ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
