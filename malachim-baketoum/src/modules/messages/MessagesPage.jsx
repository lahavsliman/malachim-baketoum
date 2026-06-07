import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../hooks/useRole'
import { subscribeBranchMessages, sendBranchMessage, getTargetUsers } from '../../firebase/messages'
import { createBulkNotifications } from '../../firebase/notifications'
import LoadingSpinner from '../../shared/LoadingSpinner'
import BranchSelector from '../../shared/BranchSelector'

// ── Constants ─────────────────────────────────────────────────────────────────

const TARGET_OPTIONS = [
  { value: 'all',       label: 'כל המתנדבים',       icon: '📢' },
  { value: 'night',     label: 'תורני לילה בלבד',    icon: '🌙' },
  { value: 'shabbat',   label: 'תורני שבת בלבד',     icon: '🕍' },
  { value: 'vehicle',   label: 'נהגי רכב בלבד',      icon: '🚗' },
  { value: 'ambulance', label: 'נהגי אמבולנס בלבד',  icon: '🚑' },
]

const GROUP_ICONS = {
  all:       '📢',
  night:     '🌙',
  shabbat:   '🕍',
  vehicle:   '🚗',
  ambulance: '🚑',
  custom:    '👥',
}

const ROLE_LABELS = {
  system_admin:   'מנהל מערכת',
  branch_head:    'ראש סניף',
  branch_deputy:  'סגן ראש סניף',
  role_holder:    'בעל תפקיד',
  volunteer:      'מתנדב',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(ts) {
  if (!ts) return ''
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return format(d, "dd/MM/yyyy HH:mm", { locale: he })
  } catch { return '' }
}

// ── Send form (inline) ────────────────────────────────────────────────────────

function SendMessageForm({ user, branchId, onSent, onCancel }) {
  const [title,       setTitle]       = useState('')
  const [body,        setBody]        = useState('')
  const [targetGroup, setTargetGroup] = useState('all')
  const [sending,     setSending]     = useState(false)
  const [error,       setError]       = useState('')

  const handleSend = async (e) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      setError('נא למלא כותרת ותוכן הודעה')
      return
    }
    setSending(true)
    setError('')
    try {
      const senderName = `${user.firstName} ${user.lastName}`

      // 1. Resolve target users
      const targets    = await getTargetUsers(branchId, targetGroup)
      const targetIds  = targets.map(u => u.id)

      // 2. Save message
      await sendBranchMessage(branchId, user.id, senderName, title.trim(), body.trim(), targetGroup, targetIds)

      // 3. Fan-out notifications
      await createBulkNotifications(targetIds, branchId, title.trim(), body.trim(), 'general')

      onSent(targets.length)
    } catch (err) {
      console.error(err)
      setError('שגיאה בשליחה, נסה שנית')
      setSending(false)
    }
  }

  const selectedOption = TARGET_OPTIONS.find(o => o.value === targetGroup)

  return (
    <form
      onSubmit={handleSend}
      className="bg-gray-900 border border-orange-500/30 rounded-2xl p-5 space-y-4"
    >
      <h3 className="font-bold text-gray-200 flex items-center gap-2">
        <span>📢</span> הודעה חדשה
      </h3>

      {/* Title */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">כותרת *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="כותרת ההודעה"
          maxLength={120}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-gray-100
                     placeholder-gray-500 focus:outline-none focus:border-orange-500 transition"
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">תוכן ההודעה *</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="כתוב את ההודעה כאן..."
          rows={4}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-gray-100
                     placeholder-gray-500 focus:outline-none focus:border-orange-500 transition resize-none"
        />
      </div>

      {/* Target group */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">קהל יעד</label>
        <div className="relative">
          <select
            value={targetGroup}
            onChange={e => setTargetGroup(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-gray-100
                       focus:outline-none focus:border-orange-500 transition appearance-none"
          >
            {TARGET_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
            ))}
          </select>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▾</span>
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          {selectedOption?.icon} ההודעה תישלח ל{selectedOption?.label}
        </p>
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-xl transition border border-gray-700"
        >
          ביטול
        </button>
        <button
          type="submit"
          disabled={sending}
          className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
        >
          {sending
            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> שולח...</>
            : '📢 שלח הודעה'}
        </button>
      </div>
    </form>
  )
}

// ── Message card ──────────────────────────────────────────────────────────────

function MessageCard({ msg }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = msg.body?.length > 180
  const displayBody = (!isLong || expanded) ? msg.body : msg.body.slice(0, 180) + '…'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition">
      <div className="flex items-start gap-3">
        {/* Group icon */}
        <span className="text-2xl shrink-0 mt-0.5">
          {GROUP_ICONS[msg.targetGroup] ?? '📢'}
        </span>

        <div className="flex-1 min-w-0">
          {/* Title + time */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-gray-100 leading-snug">{msg.title}</h3>
            <span className="text-xs text-gray-500 shrink-0 mt-0.5">{formatTs(msg.createdAt)}</span>
          </div>

          {/* Sender */}
          <p className="text-xs text-gray-500 mt-0.5">
            {msg.senderName}
            {msg.senderRole && (
              <span className="mr-1 text-gray-600">
                · {ROLE_LABELS[msg.senderRole] ?? msg.senderRole}
              </span>
            )}
          </p>

          {/* Body */}
          <p className="text-sm text-gray-300 mt-2 leading-relaxed whitespace-pre-wrap">
            {displayBody}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-orange-400 hover:text-orange-300 transition mt-1"
            >
              {expanded ? 'הצג פחות ▴' : 'קרא עוד ▾'}
            </button>
          )}

          {/* Target badge */}
          <div className="mt-3">
            <span className="inline-flex items-center gap-1 text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full border border-gray-700">
              {GROUP_ICONS[msg.targetGroup]}
              {TARGET_OPTIONS.find(o => o.value === msg.targetGroup)?.label ?? 'כל המתנדבים'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user } = useAuth()
  const { isBranchHead, isSystemAdmin, isRoleHolder } = useRole()

  const canSend = isBranchHead || isSystemAdmin || isRoleHolder

  // For system_admin: branch selected from dropdown. Others: their own branch.
  const [adminBranchId, setAdminBranchId] = useState(null)
  const branchId = isSystemAdmin ? adminBranchId : user?.branchId

  const [messages,    setMessages]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [successMsg,  setSuccessMsg]  = useState('')

  // Real-time subscription
  useEffect(() => {
    if (!branchId) { setMessages([]); setLoading(false); return }
    setLoading(true)
    const unsub = subscribeBranchMessages(branchId, (msgs) => {
      setMessages(msgs)
      setLoading(false)
    })
    return unsub
  }, [branchId])

  const handleSent = (recipientCount) => {
    setShowForm(false)
    setSuccessMsg(`ההודעה נשלחה בהצלחה ל-${recipientCount} מתנדבים ✅`)
    setTimeout(() => setSuccessMsg(''), 5000)
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto pb-20 lg:pb-6">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-100 flex items-center gap-2">
          📢 הודעות סניף
        </h1>
        {canSend && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            disabled={!branchId}
            className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-medium px-4 py-2 rounded-xl text-sm transition"
          >
            <span className="text-base leading-none">+</span>
            הודעה חדשה
          </button>
        )}
      </div>

      {/* Branch selector — system_admin only */}
      <BranchSelector value={adminBranchId} onChange={setAdminBranchId} />

      {isSystemAdmin && !branchId && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🌐</div>
          <p className="text-gray-300 font-medium">בחר סניף כדי לצפות בהודעות</p>
        </div>
      )}

      {/* Success banner */}
      {successMsg && (
        <div className="mb-5 bg-green-500/15 border border-green-500/30 rounded-2xl px-5 py-3 text-green-300 font-medium text-sm">
          {successMsg}
        </div>
      )}

      {/* Send form */}
      {showForm && (
        <div className="mb-6">
          <SendMessageForm
            user={user}
            branchId={branchId}
            onSent={handleSent}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Message list */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <LoadingSpinner size="lg" text="טוען הודעות..." />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <span className="text-5xl">📭</span>
          <div>
            <p className="text-lg font-semibold text-gray-300">אין הודעות עדיין</p>
            {canSend && (
              <p className="text-sm text-gray-500 mt-1">
                שלח הודעה ראשונה לסניף ←
              </p>
            )}
          </div>
          {canSend && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-5 py-2.5 rounded-xl transition"
            >
              📢 שלח הודעה ראשונה
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map(msg => (
            <MessageCard key={msg.id} msg={msg} />
          ))}
        </div>
      )}

    </div>
  )
}
