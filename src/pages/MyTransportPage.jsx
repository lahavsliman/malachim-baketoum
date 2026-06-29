import { useState, useEffect } from 'react'
import { format, parseISO, startOfMonth, addMonths, subMonths } from 'date-fns'
import { he } from 'date-fns/locale'
import { useAuth } from '../context/AuthContext'
import { useRole } from '../hooks/useRole'
import { getVolunteerTransportShifts } from '../firebase/transportShifts'
import LoadingSpinner from '../shared/LoadingSpinner'
import { Car, Clock, CaretRight, CaretLeft } from '@phosphor-icons/react'

const TYPE_LABELS = { car: 'רכב', ambulance: 'אמבולנס' }

export default function MyTransportPage() {
  const { user } = useAuth()
  const { isVehicleDriver, isAmbulanceDriver } = useRole()

  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))

  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    getVolunteerTransportShifts(user.id)
      .then(setShifts)
      .catch(() => setShifts([]))
      .finally(() => setLoading(false))
  }, [user?.id])

  if (!isVehicleDriver && !isAmbulanceDriver) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto" dir="rtl">
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <p className="text-gray-500 font-medium">אין לך הרשאת נהג</p>
        </div>
      </div>
    )
  }

  const filteredShifts = shifts
    .filter(s => s.date.startsWith(format(currentMonth, 'yyyy-MM')))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const shiftsCount = filteredShifts.filter(s => s.shiftType === 'משמרת').length
  const onCallCount = filteredShifts.filter(s => s.shiftType === 'כונן').length
  const totalHours = filteredShifts.reduce((sum, s) => sum + (Number(s.hours) || 0), 0)

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto pb-20 lg:pb-0" dir="rtl">
      {/* Header */}
      <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2 mb-4">
        <Car size={24} color="#F97316" weight="fill" /> תחבורה
      </h1>

      {/* Explanation card */}
      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-5 text-sm text-orange-900 space-y-1">
        <p className="font-semibold">המסך מציג את הרישומים האישיים שלך בתחבורה.</p>
        <p>• <span className="font-medium">משמרת</span> — משמרת מלאה</p>
        <p>• <span className="font-medium">כונן</span> — כוננות על הרכב ללא אנשי צוות נוספים</p>
      </div>

      {/* Month navigation */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 flex items-center justify-between">
        <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <CaretRight size={18} />
        </button>
        <span className="text-base font-bold text-gray-800">
          {format(currentMonth, 'MMMM yyyy', { locale: he })}
        </span>
        <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <CaretLeft size={18} />
        </button>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><LoadingSpinner size="lg" text="טוען נתונים..." /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 text-center">
              <p className="text-3xl font-black text-orange-500">{shiftsCount}</p>
              <p className="text-xs text-gray-500 mt-1.5 leading-tight">משמרות</p>
            </div>
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 text-center">
              <p className="text-3xl font-black text-purple-600">{onCallCount}</p>
              <p className="text-xs text-gray-500 mt-1.5 leading-tight">כוננויות</p>
            </div>
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 text-center">
              <p className="text-3xl font-black text-green-600 flex items-center justify-center gap-1">
                <Clock size={18} className="text-green-500" /> {totalHours}
              </p>
              <p className="text-xs text-gray-500 mt-1.5 leading-tight">סך שעות</p>
            </div>
          </div>

          {/* Records list */}
          {filteredShifts.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
              <p className="text-gray-500 font-medium">אין רישומים בחודש זה</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredShifts.map(s => (
                <div key={s.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-gray-800 font-medium">
                        {format(parseISO(s.date), 'd בMMMM yyyy', { locale: he })}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {format(parseISO(s.date), 'EEEE', { locale: he })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {TYPE_LABELS[s.type] || s.type}
                      </span>
                      <span className="text-xs bg-orange-500/10 text-orange-800 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {s.shiftType}
                      </span>
                      <span className="text-xs text-gray-700 flex items-center gap-1 whitespace-nowrap">
                        <Clock size={13} className="text-gray-400" /> {s.hours} שעות
                      </span>
                    </div>
                  </div>
                  {s.notes && (
                    <p className="text-xs text-gray-500 mt-2 border-t border-gray-100 pt-2">{s.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
