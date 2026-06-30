import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getPendingResponseEvents, submitResponse } from '../firebase/events'
import { CalendarBlank } from '@phosphor-icons/react'

const fmtDate = (date, time) => {
  try {
    const d = new Date(`${date}T${time || '00:00'}`)
    const datePart = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return time ? `${datePart} · ${time}` : datePart
  } catch { return date }
}

const RESPONSE_BTNS = [
  { value: 'going',     label: 'מגיע',     cls: 'bg-green-500 hover:bg-green-400 text-white' },
  { value: 'maybe',     label: 'אולי',     cls: 'bg-yellow-500 hover:bg-yellow-400 text-white' },
  { value: 'not_going', label: 'לא מגיע', cls: 'bg-gray-200 hover:bg-gray-300 text-gray-700' },
]

export default function EventResponseGate() {
  const { user } = useAuth()
  const [queue, setQueue] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user?.id || !user?.branchId) return
    getPendingResponseEvents(user.branchId, user.id)
      .then(setQueue)
      .catch(() => setQueue([]))
  }, [user?.id, user?.branchId])

  if (queue.length === 0) return null
  const event = queue[0]

  const handleResponse = async (response) => {
    setSubmitting(true)
    try {
      await submitResponse(event.id, event.branchId, user.id, `${user.firstName} ${user.lastName}`, response)
      setQueue(q => q.slice(1))
    } catch (e) { console.error(e) }
    finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4" dir="rtl">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
            <CalendarBlank size={20} className="text-orange-500" weight="fill" />
          </div>
          <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
            נדרש אישור השתתפות
          </span>
        </div>

        <h2 className="text-lg font-bold text-gray-900 mb-2 leading-snug">{event.title}</h2>
        <p className="text-sm text-orange-400 font-medium mb-1">📅 {fmtDate(event.date, event.time)}</p>
        <p className="text-sm text-gray-500 mb-3">📍 {event.location}</p>
        {event.description && (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-4">{event.description}</p>
        )}

        <p className="text-xs font-medium text-gray-500 mb-3">יש לסמן נוכחות כדי להמשיך:</p>
        <div className="flex gap-2">
          {RESPONSE_BTNS.map(r => (
            <button
              key={r.value}
              disabled={submitting}
              onClick={() => handleResponse(r.value)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition ${r.cls}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {queue.length > 1 && (
          <p className="text-xs text-gray-400 text-center mt-3">
            עוד {queue.length - 1} אירועים ממתינים לתגובתך
          </p>
        )}
      </div>
    </div>
  )
}
