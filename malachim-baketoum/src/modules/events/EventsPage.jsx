import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../hooks/useRole'
import { getBranchUsers } from '../../firebase/users'
import { createBulkNotifications } from '../../firebase/notifications'
import {
  createEvent, updateEvent, cancelEvent,
  subscribeEvents, submitResponse, getEventResponses,
} from '../../firebase/events'
import LoadingSpinner from '../../shared/LoadingSpinner'
import BranchSelector from '../../shared/BranchSelector'

// ── Constants ──────────────────────────────────────────────────────────────

const TARGET_GROUPS = [
  { value: 'all',       label: 'כל המתנדבים' },
  { value: 'night',     label: 'תורני לילה בלבד' },
  { value: 'shabbat',   label: 'תורני שבת בלבד' },
  { value: 'vehicle',   label: 'נהגי רכב בלבד' },
  { value: 'ambulance', label: 'נהגי אמבולנס בלבד' },
  { value: 'male',      label: 'לפי מגדר: זכר' },
  { value: 'female',    label: 'לפי מגדר: נקבה' },
  { value: 'team',      label: 'לפי צוות' },
  { value: 'custom',    label: 'בחירה ידנית' },
]

/**
 * Resolve a stored event.targetGroup string to a filter predicate over branchUsers.
 * Encoded forms:
 *   - 'all' / 'custom'                         — caller handles separately
 *   - 'night' | 'shabbat' | 'vehicle' | 'ambulance' — permission flags
 *   - 'male' | 'female'                        — gender field
 *   - 'team:<teamName>'                        — team field equals teamName
 */
const targetGroupCheck = (targetGroup) => {
  if (typeof targetGroup === 'string' && targetGroup.startsWith('team:')) {
    const name = targetGroup.slice('team:'.length).trim()
    return u => (u.team || '').trim() === name
  }
  switch (targetGroup) {
    case 'night':     return u => u.permissions?.nightShifts      || u.nightShifts
    case 'shabbat':   return u => u.permissions?.shabbatVolunteer || u.shabbatVolunteer
    case 'vehicle':   return u => u.permissions?.vehicleDriver
    case 'ambulance': return u => u.permissions?.ambulanceDriver
    case 'male':      return u => u.gender === 'male'
    case 'female':    return u => u.gender === 'female'
    default:          return () => true
  }
}

// Human-readable label for any targetGroup (including team:<name>) — used in
// the event card pill and elsewhere.
const targetGroupLabel = (targetGroup) => {
  if (typeof targetGroup === 'string' && targetGroup.startsWith('team:')) {
    return `צוות: ${targetGroup.slice('team:'.length).trim()}`
  }
  return TARGET_LABEL[targetGroup] || targetGroup
}

const RESPONSES = [
  { value: 'going',     label: 'אני מגיע',  icon: '✅', active: 'bg-green-500  text-white', idle: 'bg-gray-800 text-gray-400 hover:bg-green-500/20 hover:text-green-300 border border-gray-700' },
  { value: 'maybe',     label: 'אולי',       icon: '❓', active: 'bg-yellow-500 text-white', idle: 'bg-gray-800 text-gray-400 hover:bg-yellow-500/20 hover:text-yellow-300 border border-gray-700' },
  { value: 'not_going', label: 'לא מגיע',   icon: '❌', active: 'bg-gray-600  text-white', idle: 'bg-gray-800 text-gray-400 hover:bg-gray-600/40 hover:text-gray-200 border border-gray-700' },
]

const TARGET_LABEL = Object.fromEntries(TARGET_GROUPS.map(t => [t.value, t.label]))

const EMPTY_FORM = {
  title: '', date: '', time: '', location: '', description: '',
  targetGroup: 'all', targetUserIds: [],
}

const inp = 'bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 w-full'
const lbl = 'block text-xs text-gray-400 mb-1'

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtDate = (date, time) => {
  try {
    const d = new Date(`${date}T${time || '00:00'}`)
    const datePart = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return time ? `${datePart} · ${time}` : datePart
  } catch { return date }
}

const fmtShort = (date) => {
  try { return new Date(date + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }) }
  catch { return date }
}

// ── EventForm modal ────────────────────────────────────────────────────────

function EventForm({ editEvent, branchUsers, onSave, onCancel, saving }) {
  // For team targeting we decode the stored value 'team:<name>' into two
  // form fields: `targetGroup: 'team'` plus a separate `targetTeam` string.
  const initialGroup = editEvent?.targetGroup || 'all'
  const isTeam = typeof initialGroup === 'string' && initialGroup.startsWith('team:')
  const [form, setForm] = useState(editEvent ? {
    title: editEvent.title || '',
    date: editEvent.date || '',
    time: editEvent.time || '',
    location: editEvent.location || '',
    description: editEvent.description || '',
    targetGroup: isTeam ? 'team' : (initialGroup || 'all'),
    targetTeam: isTeam ? initialGroup.slice('team:'.length).trim() : '',
    targetUserIds: editEvent.targetUserIds || [],
  } : { ...EMPTY_FORM, targetTeam: '' })
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleTarget = id => setForm(f => ({
    ...f,
    targetUserIds: f.targetUserIds.includes(id)
      ? f.targetUserIds.filter(x => x !== id)
      : [...f.targetUserIds, id],
  }))

  const handleSubmit = () => {
    if (!form.title.trim()) return setError('שם האירוע הוא שדה חובה')
    if (!form.date) return setError('נא לבחור תאריך')
    if (!form.time) return setError('נא לבחור שעה')
    if (!form.location.trim()) return setError('מיקום הוא שדה חובה')
    if (form.targetGroup === 'custom' && !form.targetUserIds.length) return setError('נא לבחור לפחות מתנדב אחד')
    if (form.targetGroup === 'team' && !form.targetTeam?.trim()) return setError('נא להזין שם צוות')
    setError('')
    // Encode team target as 'team:<name>' for storage
    const out = { ...form }
    if (out.targetGroup === 'team') out.targetGroup = `team:${out.targetTeam.trim()}`
    delete out.targetTeam
    onSave(out)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onCancel}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        dir="rtl"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-gray-200 text-lg mb-5">
          {editEvent ? '✏️ עריכת אירוע' : '🎉 יצירת אירוע חדש'}
        </h3>

        <div className="space-y-3">
          <div>
            <label className={lbl}>שם האירוע *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} className={inp} placeholder="שם האירוע" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>תאריך *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>שעה *</label>
              <input type="time" value={form.time} onChange={e => set('time', e.target.value)} className={inp} />
            </div>
          </div>

          <div>
            <label className={lbl}>מיקום *</label>
            <input value={form.location} onChange={e => set('location', e.target.value)} className={inp} placeholder="כתובת / מקום" />
          </div>

          <div>
            <label className={lbl}>תיאור</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} className={inp + ' resize-none'} placeholder="פרטים נוספים..." />
          </div>

          <div>
            <label className={lbl}>קהל יעד</label>
            <select value={form.targetGroup} onChange={e => set('targetGroup', e.target.value)} className={inp}>
              {TARGET_GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>

          {form.targetGroup === 'team' && (
            <div>
              <label className={lbl}>שם הצוות</label>
              <input
                value={form.targetTeam || ''}
                onChange={e => set('targetTeam', e.target.value)}
                className={inp}
                placeholder="הקלד שם צוות מדויק (לדוגמה: צוות החורש)"
              />
              <p className="text-xs text-gray-500 mt-1">יישלחו הודעות רק למתנדבים ששדה הצוות שלהם תואם בדיוק</p>
            </div>
          )}

          {form.targetGroup === 'custom' && (
            <div>
              <label className={lbl}>בחר מתנדבים ({form.targetUserIds.length} נבחרו)</label>
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                {branchUsers.map(u => (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer py-1 hover:bg-gray-700/50 px-2 rounded-lg">
                    <input type="checkbox" checked={form.targetUserIds.includes(u.id)}
                      onChange={() => toggleTarget(u.id)} className="w-4 h-4 accent-orange-500" />
                    <span className="text-gray-300 text-sm">{u.firstName} {u.lastName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mt-3">{error}</p>
        )}

        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onCancel}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 py-2.5 rounded-xl transition">
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition"
          >
            {saving ? 'שומר...' : editEvent ? 'שמור שינויים' : 'צור אירוע'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AttendancePanel ────────────────────────────────────────────────────────

function AttendancePanel({ event, responses, branchUsers, onClose }) {
  const [tab, setTab] = useState('going')

  const targetUsers = (() => {
    if (event.targetGroup === 'all') return branchUsers
    if (event.targetGroup === 'custom') return branchUsers.filter(u => event.targetUserIds?.includes(u.id))
    return branchUsers.filter(targetGroupCheck(event.targetGroup))
  })()

  const byResponse = {
    going:      responses.filter(r => r.response === 'going'),
    maybe:      responses.filter(r => r.response === 'maybe'),
    not_going:  responses.filter(r => r.response === 'not_going'),
  }
  const respondedIds = new Set(responses.map(r => r.volunteerId))
  const notAnswered = targetUsers.filter(u => !respondedIds.has(u.id))

  const exportXlsx = () => {
    // Index branchUsers by id for O(1) lookup of phone/volunteerId
    const usersById = Object.fromEntries(branchUsers.map(u => [u.id, u]))
    const row = (volunteerId, fallbackName, responseLabel) => {
      const u = usersById[volunteerId]
      const fullName = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : (fallbackName || '')
      return {
        'שם מלא':    fullName,
        'קוד כונן':  u?.volunteerId || '',
        'טלפון':     u?.phone || '',
        'תגובה':     responseLabel,
      }
    }

    const rows = [
      ...byResponse.going.map(r     => row(r.volunteerId, r.volunteerName, 'מגיע')),
      ...byResponse.maybe.map(r     => row(r.volunteerId, r.volunteerName, 'אולי')),
      ...byResponse.not_going.map(r => row(r.volunteerId, r.volunteerName, 'לא מגיע')),
      ...notAnswered.map(u => ({
        'שם מלא':   `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        'קוד כונן': u.volunteerId || '',
        'טלפון':    u.phone || '',
        'תגובה':    'לא ענה',
      })),
    ]

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['שם מלא', 'קוד כונן', 'טלפון', 'תגובה'],
    })
    // Right-to-left sheet view
    if (!ws['!views']) ws['!views'] = [{ RTL: true }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'נוכחות')
    XLSX.writeFile(wb, `event-${event.date}.xlsx`)
  }

  const TABS = [
    { key: 'going',      label: `מגיעים`,      count: byResponse.going.length,     color: 'text-green-400'  },
    { key: 'maybe',      label: `אולי`,         count: byResponse.maybe.length,     color: 'text-yellow-400' },
    { key: 'not_going',  label: `לא מגיעים`,   count: byResponse.not_going.length, color: 'text-gray-400'   },
    { key: 'not_answered', label: `לא ענו`,     count: notAnswered.length,          color: 'text-red-400'    },
  ]

  const currentList = tab === 'not_answered'
    ? notAnswered.map(u => ({ name: `${u.firstName} ${u.lastName}` }))
    : byResponse[tab]?.map(r => ({ name: r.volunteerName })) ?? []

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl" dir="rtl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-200">👥 רשימת נוכחות</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
        </div>
        <p className="text-sm text-orange-400 font-medium mb-4">{event.title} — {fmtShort(event.date)}</p>

        {/* Tab row */}
        <div className="flex gap-1 bg-gray-800 p-1 rounded-xl mb-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition
                ${tab === t.key ? 'bg-gray-700 ' + t.color : 'text-gray-500 hover:text-gray-300'}`}>
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-1 max-h-56 overflow-y-auto mb-4">
          {currentList.length === 0 ? (
            <p className="text-center text-gray-500 py-4 text-sm">אין רשומות</p>
          ) : currentList.map((item, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-800/50 px-3 py-2 rounded-xl text-sm text-gray-200">
              <span className="text-gray-500 w-5 text-center">{i + 1}</span>
              {item.name}
            </div>
          ))}
        </div>

        <button onClick={exportXlsx}
          className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-xl text-sm border border-gray-700 transition">
          📊 ייצוא Excel
        </button>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function EventsPage() {
  const { user } = useAuth()
  const { isBranchHead, isSystemAdmin, branchId: userBranchId } = useRole()
  const [adminBranchId, setAdminBranchId] = useState(null)
  const branchId = isSystemAdmin ? adminBranchId : userBranchId

  const isEventsCoord = user?.roleTypes?.includes('events_coordinator') || user?.roleType === 'events_coordinator'
  const canManage = isBranchHead || isSystemAdmin || isEventsCoord

  const [events, setEvents] = useState([])
  const [eventResponses, setEventResponses] = useState({})   // {eventId: Response[]}
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('upcoming')
  const [showForm, setShowForm] = useState(false)
  const [editEvent, setEditEvent] = useState(null)
  const [savingForm, setSavingForm] = useState(false)
  const [attendanceEvent, setAttendanceEvent] = useState(null) // coordinator detail modal
  const [branchUsers, setBranchUsers] = useState([])
  const [submitting, setSubmitting] = useState(null)          // eventId being responded to
  const [sendingReminder, setSendingReminder] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  // Subscribe to events
  useEffect(() => {
    if (!branchId) return
    setLoading(true)
    return subscribeEvents(branchId, evts => { setEvents(evts); setLoading(false) })
  }, [branchId])

  // Load branch users for coordinator
  useEffect(() => {
    if (canManage && branchId) getBranchUsers(branchId).then(setBranchUsers).catch(() => {})
  }, [canManage, branchId])

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = [...events]
    .filter(e => e.date >= today && e.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
  const history = [...events]
    .filter(e => e.date < today || e.status === 'cancelled')
    .sort((a, b) => b.date.localeCompare(a.date))
  const visible = activeTab === 'upcoming' ? upcoming : history

  // Load responses for visible events (batch)
  useEffect(() => {
    if (!visible.length) return
    Promise.all(visible.map(e => getEventResponses(e.id))).then(results => {
      const map = {}
      visible.forEach((e, i) => { map[e.id] = results[i] })
      setEventResponses(prev => ({ ...prev, ...map }))
    }).catch(() => {})
  }, [events, activeTab])

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getTargetUsers = (event) => {
    if (!branchUsers.length) return []
    if (event.targetGroup === 'all') return branchUsers
    if (event.targetGroup === 'custom') return branchUsers.filter(u => event.targetUserIds?.includes(u.id))
    return branchUsers.filter(targetGroupCheck(event.targetGroup))
  }

  const myResponse = (eventId) =>
    eventResponses[eventId]?.find(r => r.volunteerId === user?.id)?.response ?? null

  const counts = (eventId) => {
    const rs = eventResponses[eventId] ?? []
    return {
      going:     rs.filter(r => r.response === 'going').length,
      maybe:     rs.filter(r => r.response === 'maybe').length,
      not_going: rs.filter(r => r.response === 'not_going').length,
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleResponse = async (eventId, response) => {
    if (!user) return
    setSubmitting(eventId)
    try {
      await submitResponse(eventId, branchId, user.id, `${user.firstName} ${user.lastName}`, response)
      const updated = await getEventResponses(eventId)
      setEventResponses(prev => ({ ...prev, [eventId]: updated }))
    } catch { showToast('error', 'שגיאה בשמירת התגובה') }
    finally { setSubmitting(null) }
  }

  const handleSaveEvent = async (formData) => {
    setSavingForm(true)
    try {
      if (editEvent) {
        await updateEvent(editEvent.id, formData)
        showToast('success', 'האירוע עודכן בהצלחה')
      } else {
        const ref = await createEvent(branchId, formData, user.id)
        const targets = getTargetUsers({ ...formData, id: ref.id })
        if (targets.length) {
          await createBulkNotifications(
            targets.map(u => u.id), branchId,
            `אירוע חדש: ${formData.title}`,
            `${fmtShort(formData.date)} ${formData.time} 📍 ${formData.location}`,
            'general'
          )
        }
        showToast('success', `האירוע נוצר! ${targets.length} מתנדבים קיבלו הודעה`)
      }
      setShowForm(false)
      setEditEvent(null)
    } catch { showToast('error', 'שגיאה בשמירת האירוע') }
    finally { setSavingForm(false) }
  }

  const handleCancelEvent = async (event) => {
    if (!confirm(`לבטל את האירוע "${event.title}"?`)) return
    setCancelling(event.id)
    try {
      await cancelEvent(event.id, user.id)
      const targets = getTargetUsers(event)
      if (targets.length) {
        await createBulkNotifications(
          targets.map(u => u.id), branchId,
          `האירוע ${event.title} בוטל ❌`,
          `האירוע שתוכנן ל-${fmtShort(event.date)} בוטל`,
          'general'
        )
      }
      showToast('success', 'האירוע בוטל')
    } catch { showToast('error', 'שגיאה בביטול האירוע') }
    finally { setCancelling(null) }
  }

  const handleReminder = async (event) => {
    setSendingReminder(event.id)
    try {
      const targets = getTargetUsers(event)
      const responses = eventResponses[event.id] || await getEventResponses(event.id)
      const respondedIds = new Set(responses.map(r => r.volunteerId))
      const nonResponders = targets.filter(u => !respondedIds.has(u.id))
      if (!nonResponders.length) { showToast('success', 'כל המתנדבים כבר ענו!'); return }
      await createBulkNotifications(
        nonResponders.map(u => u.id), branchId,
        `תזכורת: ${event.title}`,
        `טרם ענית לאירוע ב-${fmtShort(event.date)} — ענה עכשיו`,
        'general'
      )
      showToast('success', `נשלחה תזכורת ל-${nonResponders.length} מתנדבים`)
    } catch { showToast('error', 'שגיאה בשליחת התזכורת') }
    finally { setSendingReminder(null) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto" dir="rtl">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl text-sm font-medium pointer-events-none
          ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-gray-100 flex items-center gap-2">🎉 ערבי גיבוש</h1>
        {canManage && (
          <button onClick={() => { setEditEvent(null); setShowForm(true) }}
            disabled={!branchId}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
            + צור אירוע
          </button>
        )}
      </div>

      {/* Branch selector — system_admin only */}
      <BranchSelector value={adminBranchId} onChange={setAdminBranchId} />

      {isSystemAdmin && !branchId && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🌐</div>
          <p className="text-gray-300 font-medium">בחר סניף כדי לצפות באירועים</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 p-1 rounded-2xl border border-gray-800 mb-5">
        <button onClick={() => setActiveTab('upcoming')}
          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition
            ${activeTab === 'upcoming' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
          📅 אירועים קרובים {upcoming.length > 0 && `(${upcoming.length})`}
        </button>
        <button onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition
            ${activeTab === 'history' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
          🕐 היסטוריה
        </button>
      </div>

      {/* Events list */}
      {loading ? (
        <div className="py-16 flex justify-center"><LoadingSpinner size="lg" text="טוען אירועים..." /></div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <span className="text-4xl block mb-3">🎉</span>
          <p>{activeTab === 'upcoming' ? 'אין אירועים קרובים' : 'אין היסטוריית אירועים'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map(event => {
            const isPast = event.date < today
            const isCancelled = event.status === 'cancelled'
            const canRespond = !isPast && !isCancelled
            const myR = myResponse(event.id)
            const c = counts(event.id)
            const isSubmitting = submitting === event.id

            return (
              <div key={event.id}
                className={`bg-gray-900 border rounded-2xl p-5 transition
                  ${isCancelled ? 'border-red-500/30 opacity-70' : 'border-gray-800 hover:border-gray-700'}`}>

                {/* Title row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-gray-100 text-lg">{event.title}</h3>
                      {isCancelled && (
                        <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-medium">
                          בוטל
                        </span>
                      )}
                      {!isCancelled && event.targetGroup && event.targetGroup !== 'all' && (
                        <span className="text-xs bg-blue-500/15 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full">
                          {targetGroupLabel(event.targetGroup)}
                        </span>
                      )}
                    </div>
                    <p className="text-orange-400 text-sm font-medium mt-1">
                      📅 {fmtDate(event.date, event.time)}
                    </p>
                    <p className="text-gray-400 text-sm mt-0.5">📍 {event.location}</p>
                  </div>

                  {/* Coordinator action buttons */}
                  {canManage && !isCancelled && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => { setEditEvent(event); setShowForm(true) }}
                        className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-1.5 rounded-lg transition border border-gray-700">
                        ✏️
                      </button>
                      <button onClick={() => handleCancelEvent(event)}
                        disabled={cancelling === event.id}
                        className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2.5 py-1.5 rounded-lg transition border border-red-500/20">
                        {cancelling === event.id ? '...' : '🚫'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Description */}
                {event.description && (
                  <p className="text-gray-400 text-sm mb-3 leading-relaxed">{event.description}</p>
                )}

                {/* Response buttons */}
                {canRespond && (
                  <div className="flex gap-2 mb-3">
                    {RESPONSES.map(r => (
                      <button key={r.value}
                        onClick={() => handleResponse(event.id, r.value)}
                        disabled={isSubmitting}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition
                          ${myR === r.value ? r.active : r.idle}
                          ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}>
                        <span>{r.icon}</span>
                        <span className="hidden sm:inline">{r.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Response counts */}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    <span className="text-green-400">{c.going} מגיעים</span>
                    {' · '}
                    <span className="text-yellow-400">{c.maybe} אולי</span>
                    {' · '}
                    <span className="text-gray-500">{c.not_going} לא מגיעים</span>
                  </p>

                  {/* Coordinator extra actions */}
                  {canManage && (
                    <div className="flex gap-2">
                      {!isCancelled && !isPast && (
                        <button onClick={() => handleReminder(event)}
                          disabled={sendingReminder === event.id}
                          className="text-xs text-orange-400/70 hover:text-orange-400 transition">
                          {sendingReminder === event.id ? 'שולח...' : '🔔 תזכורת'}
                        </button>
                      )}
                      <button onClick={() => setAttendanceEvent(event)}
                        className="text-xs text-blue-400/70 hover:text-blue-400 transition">
                        👥 רשימה
                      </button>
                    </div>
                  )}
                </div>

                {/* My response badge (past events) */}
                {isPast && myR && (
                  <p className="text-xs text-gray-500 mt-2">
                    התגובה שלי: {RESPONSES.find(r => r.value === myR)?.icon} {RESPONSES.find(r => r.value === myR)?.label}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Event form modal */}
      {showForm && (
        <EventForm
          editEvent={editEvent}
          branchUsers={branchUsers}
          onSave={handleSaveEvent}
          onCancel={() => { setShowForm(false); setEditEvent(null) }}
          saving={savingForm}
        />
      )}

      {/* Attendance detail modal */}
      {attendanceEvent && (
        <AttendancePanel
          event={attendanceEvent}
          responses={eventResponses[attendanceEvent.id] ?? []}
          branchUsers={branchUsers}
          onClose={() => setAttendanceEvent(null)}
        />
      )}
    </div>
  )
}
