import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../hooks/useRole'
import { subscribeBranchMessages, sendBranchMessage, getTargetUsers, deleteBranchMessage, submitMessageReceipt, getUserMessageReceipt, getMessageReceipts } from '../../firebase/messages'
import { createBulkNotifications } from '../../firebase/notifications'
import { getBranchSettings } from '../../firebase/branches'
import { getBranchUsers } from '../../firebase/users'
import LoadingSpinner from '../../shared/LoadingSpinner'
import BranchSelector from '../../shared/BranchSelector'
import {
  MegaphoneSimple, Megaphone, Moon, Star, UsersThree, Globe,
  Car, Ambulance, Truck, EnvelopeSimple, GenderMale, GenderFemale, CheckCircle,
  Trash, X, BellRinging,
} from '@phosphor-icons/react'

// ── Constants ─────────────────────────────────────────────────────────────────

// Returns 'ALL' for full access, [] for no access, or an array of allowed audience values.
const getAllowedAudiences = (user, roleFlags) => {
  const { isBranchHead, isSystemAdmin } = roleFlags
  if (isSystemAdmin || isBranchHead) return 'ALL'
  const types = user?.roleTypes?.length ? user.roleTypes : (user?.roleType ? [user.roleType] : [])
  if (types.includes('cohesion_coordinator')) return 'ALL'
  const map = {
    night_coordinator:     ['night'],
    shabbat_coordinator:   ['shabbat'],
    transport_coordinator: ['vehicle', 'ambulance'],
    car_coordinator:       ['vehicle'],
    ambulance_coordinator: ['ambulance'],
  }
  const allowed = new Set()
  types.forEach(t => (map[t] || []).forEach(a => allowed.add(a)))
  return [...allowed]
}

const TARGET_OPTIONS = [
  { value: 'all',       label: 'כל המתנדבים',        Icon: Megaphone },
  { value: 'night',     label: 'תורני לילה בלבד',    Icon: Moon },
  { value: 'shabbat',   label: 'תורני שבת בלבד',     Icon: Star },
  { value: 'vehicle',   label: 'נהגי רכב בלבד',      Icon: Car },
  { value: 'ambulance', label: 'נהגי אמבולנס בלבד',  Icon: Truck },
  { value: 'female',    label: 'נשים בלבד',           Icon: GenderFemale },
  { value: 'male',      label: 'גברים בלבד',          Icon: GenderMale },
]

// Phosphor component version for use in JSX spans/divs
function GroupIconComp({ group, size = 20 }) {
  const cls = 'text-gray-400 shrink-0'
  if (typeof group === 'string' && group.startsWith('team:')) {
    return <UsersThree size={size} className={cls} />
  }
  switch (group) {
    case 'all':       return <MegaphoneSimple size={size} className={cls} />
    case 'night':     return <Moon size={size} className={cls} />
    case 'shabbat':   return <Star size={size} className={cls} />
    case 'custom':    return <UsersThree size={size} className={cls} />
    case 'vehicle':   return <Car size={size} className={cls} />
    case 'ambulance': return <Ambulance size={size} className={cls} />
    case 'female':    return <GenderFemale size={size} className={cls} />
    case 'male':      return <GenderMale size={size} className={cls} />
    default:          return <MegaphoneSimple size={size} className={cls} />
  }
}

const ROLE_LABELS = {
  system_admin:   'מנהל מערכת',
  branch_head:    'ראש סניף',
  branch_deputy:  'סגן ראש סניף',
  role_holder:    'בעל תפקיד',
  volunteer:      'מתנדב',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const hasPerm = (user, key) =>
  user?.permissions?.[key] === true || user?.[key] === true

function formatTs(ts) {
  if (!ts) return ''
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return format(d, "dd/MM/yyyy HH:mm", { locale: he })
  } catch { return '' }
}

// ── Send form (inline) ────────────────────────────────────────────────────────

function SendMessageForm({ user, branchId, allowedAudiences, onSent, onCancel }) {
  const [title,       setTitle]       = useState('')
  const [body,        setBody]        = useState('')
  const [targetGroup, setTargetGroup] = useState(
    allowedAudiences === 'ALL' ? 'all' : (Array.isArray(allowedAudiences) && allowedAudiences[0]) || 'all'
  )
  const [sending,     setSending]     = useState(false)
  const [error,       setError]       = useState('')
  const [teams,       setTeams]       = useState([])

  const [requiresAck,    setRequiresAck]    = useState(false)
  const [messageType,    setMessageType]    = useState('normal')
  const [choiceMode,     setChoiceMode]     = useState('default')
  const [customOptions,  setCustomOptions]  = useState(['', ''])

  const DEFAULT_CHOICES = ['כן', 'לא', 'אולי']

  useEffect(() => {
    if (!branchId) return
    getBranchSettings(branchId)
      .then(s => setTeams(s?.teams?.filter(Boolean) ?? []))
      .catch(() => {})
  }, [branchId])

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

      // 2. Resolve choice options if this is a choice message
      let choiceOptions = []
      if (messageType === 'choice') {
        choiceOptions = choiceMode === 'default'
          ? DEFAULT_CHOICES
          : customOptions.map(o => o.trim()).filter(Boolean)
        if (choiceOptions.length < 2) {
          setError('יש להזין לפחות שתי אפשרויות בחירה')
          setSending(false)
          return
        }
      }

      // 3. Save message — capture the new doc ID to link notifications
      const msgRef = await sendBranchMessage(
        branchId, user.id, senderName, title.trim(), body.trim(), targetGroup, targetIds,
        { requiresAck, messageType, choiceOptions }
      )

      // 4. Fan-out notifications (carry messageId so delete can clean them up)
      await createBulkNotifications(targetIds, branchId, title.trim(), body.trim(), 'general', { messageId: msgRef.id })

      onSent(targets.length)
    } catch (err) {
      console.error(err)
      setError('שגיאה בשליחה, נסה שנית')
      setSending(false)
    }
  }

  const fullAccess = allowedAudiences === 'ALL'
  const allTargetOptions = [
    ...TARGET_OPTIONS.filter(o => fullAccess || (Array.isArray(allowedAudiences) && allowedAudiences.includes(o.value))),
    ...(fullAccess ? teams.map(t => ({ value: `team:${t}`, label: `צוות ${t}`, Icon: UsersThree })) : []),
  ]
  const selectedOption = allTargetOptions.find(o => o.value === targetGroup)

  return (
    <form
      onSubmit={handleSend}
      className="bg-white border border-orange-500/30 rounded-2xl p-5 space-y-4"
    >
      <h3 className="font-bold text-gray-800 flex items-center gap-2">
        <MegaphoneSimple size={18} className="text-orange-400" /> הודעה חדשה
      </h3>

      {/* Title */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">כותרת *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="כותרת ההודעה"
          maxLength={120}
          className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900
                     placeholder-gray-400 focus:outline-none focus:border-orange-500 transition"
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">תוכן ההודעה *</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="כתוב את ההודעה כאן..."
          rows={4}
          className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900
                     placeholder-gray-400 focus:outline-none focus:border-orange-500 transition resize-none"
        />
      </div>

      {/* Target group */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">קהל יעד</label>
        <div className="grid grid-cols-2 gap-2">
          {allTargetOptions.map(o => {
            const active = targetGroup === o.value
            const Ic = o.Icon
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setTargetGroup(o.value)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition text-right
                  ${active
                    ? 'bg-orange-50 border-orange-300 text-orange-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              >
                {Ic && <Ic size={18} className={active ? 'text-orange-500' : 'text-gray-400'} weight={active ? 'fill' : 'regular'} />}
                <span className="flex-1">{o.label}</span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          ההודעה תישלח ל{selectedOption?.label}
        </p>
      </div>

      {/* Message type */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">סוג הודעה</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMessageType('normal')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition border ${
              messageType === 'normal' ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'}`}>
            הודעה רגילה
          </button>
          <button type="button" onClick={() => setMessageType('choice')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition border ${
              messageType === 'choice' ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'}`}>
            שאלה עם בחירה
          </button>
        </div>
      </div>

      {/* Choice options (only for choice type) */}
      {messageType === 'choice' && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => setChoiceMode('default')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition border ${
                choiceMode === 'default' ? 'bg-white border-orange-300 text-orange-600' : 'bg-transparent border-gray-200 text-gray-500'}`}>
              כן / לא / אולי
            </button>
            <button type="button" onClick={() => setChoiceMode('custom')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition border ${
                choiceMode === 'custom' ? 'bg-white border-orange-300 text-orange-600' : 'bg-transparent border-gray-200 text-gray-500'}`}>
              אפשרויות מותאמות
            </button>
          </div>
          {choiceMode === 'default' ? (
            <p className="text-xs text-gray-500">הנמענים יבחרו: כן / לא / אולי</p>
          ) : (
            <div className="space-y-2">
              {customOptions.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input type="text" value={opt}
                    onChange={e => setCustomOptions(prev => prev.map((o, idx) => idx === i ? e.target.value : o))}
                    placeholder={`אפשרות ${i + 1}`}
                    className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-orange-500" />
                  {customOptions.length > 2 && (
                    <button type="button" onClick={() => setCustomOptions(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-red-400 hover:text-red-500 px-2"><X size={16} /></button>
                  )}
                </div>
              ))}
              {customOptions.length < 6 && (
                <button type="button" onClick={() => setCustomOptions(prev => [...prev, ''])}
                  className="text-xs text-orange-500 hover:text-orange-600 font-medium">+ הוסף אפשרות</button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Require acknowledgment */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={requiresAck} onChange={e => setRequiresAck(e.target.checked)}
          className="w-4 h-4 accent-orange-500" />
        <span className="text-sm text-gray-700">דרוש אישור קריאה (ההודעה תוצג לנמען בכניסה לאפליקציה עד לאישור)</span>
      </label>

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
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl transition border border-gray-200"
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
            : <><MegaphoneSimple size={16} className="inline ml-1" /> שלח הודעה</>}
        </button>
      </div>
    </form>
  )
}

// ── Message card ──────────────────────────────────────────────────────────────

function MessageCard({ msg, onOpen, canDelete, onDelete, onTrack }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const preview = msg.body?.length > 120 ? msg.body.slice(0, 120) + '…' : msg.body

  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition cursor-pointer"
      onClick={() => onOpen(msg)}
    >
      <div className="flex items-start gap-3">
        {/* Group icon */}
        <span className="shrink-0 mt-0.5 flex items-center">
          <GroupIconComp group={msg.targetGroup} />
        </span>

        <div className="flex-1 min-w-0">
          {/* Title + time + delete */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-gray-900 leading-snug">{msg.title}</h3>
            <div className="flex items-center gap-2 shrink-0 mt-0.5">
              <span className="text-xs text-gray-500">{formatTs(msg.createdAt)}</span>
              {canDelete && (msg.requiresAck || msg.messageType === 'choice') && (
                <button
                  onClick={e => { e.stopPropagation(); onTrack(msg) }}
                  className="text-orange-500 hover:text-orange-600 transition p-1"
                  title="מעקב קריאה"
                >
                  <CheckCircle size={18} />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
                  className="text-gray-300 hover:text-red-500 transition"
                  title="מחק הודעה"
                >
                  <Trash size={15} />
                </button>
              )}
            </div>
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

          {/* Body preview */}
          <p className="text-sm text-gray-700 mt-2 leading-relaxed">{preview}</p>

          {/* Target badge */}
          <div className="mt-3">
            <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">
              <GroupIconComp group={msg.targetGroup} size={12} />
              {TARGET_OPTIONS.find(o => o.value === msg.targetGroup)?.label
                ?? (msg.targetGroup?.startsWith('team:')
                    ? `צוות ${msg.targetGroup.slice(5)}`
                    : 'כל המתנדבים')}
            </span>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          className="mt-4 pt-4 border-t border-red-100 bg-red-50 rounded-xl px-4 py-3 space-y-3"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-sm text-red-700 font-medium">
            האם למחוק את ההודעה? היא תימחק גם מההתראות
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 bg-white border border-gray-200 text-gray-700 text-sm font-medium py-1.5 rounded-xl transition hover:bg-gray-50"
            >
              ביטול
            </button>
            <button
              onClick={() => { setConfirmDelete(false); onDelete(msg.id) }}
              className="flex-1 bg-red-500 hover:bg-red-400 text-white text-sm font-bold py-1.5 rounded-xl transition"
            >
              מחק
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Message modal ─────────────────────────────────────────────────────────────

function MessageModal({ msg, user, onClose }) {
  const tgLabel = TARGET_OPTIONS.find(o => o.value === msg.targetGroup)?.label
    ?? (msg.targetGroup?.startsWith('team:')
        ? `צוות ${msg.targetGroup.slice(5)}`
        : 'כל המתנדבים')

  const [receipt,    setReceipt]    = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const needsResponse = msg.requiresAck || msg.messageType === 'choice'

  useEffect(() => {
    if (!needsResponse || !user?.id) return
    getUserMessageReceipt(msg.id, user.id)
      .then(setReceipt)
      .catch(() => {})
  }, [msg.id, user?.id])

  const handleAck = async (choice = null) => {
    if (!user?.id) return
    setSubmitting(true)
    try {
      await submitMessageReceipt(msg.id, msg.branchId, user.id, `${user.firstName} ${user.lastName}`, { status: 'read', choice })
      const updated = await getUserMessageReceipt(msg.id, user.id)
      setReceipt(updated)
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-gray-900 leading-snug flex-1">{msg.title}</h2>
          <button
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600 transition p-0.5"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-5">{msg.body}</p>

        {/* Meta */}
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-500 w-16 shrink-0">שולח:</span>
            <span className="text-gray-800">
              {msg.senderName}
              {msg.senderRole && (
                <span className="text-gray-400 mr-1">
                  · {ROLE_LABELS[msg.senderRole] ?? msg.senderRole}
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-500 w-16 shrink-0">קהל יעד:</span>
            <span className="inline-flex items-center gap-1 text-gray-800">
              <GroupIconComp group={msg.targetGroup} size={14} />
              {tgLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-500 w-16 shrink-0">נשלח:</span>
            <span className="text-gray-800">{formatTs(msg.createdAt)}</span>
          </div>
        </div>

        {/* Response area (ack / choice) */}
        {needsResponse && (
          <div className="border-t border-gray-100 pt-4 mt-4">
            {receipt ? (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                <CheckCircle size={18} weight="fill" className="text-green-600" />
                {msg.messageType === 'choice'
                  ? <span>תשובתך נשמרה: <strong>{receipt.choice}</strong></span>
                  : <span>אישרת קריאת ההודעה</span>}
              </div>
            ) : msg.messageType === 'choice' ? (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">בחר תשובה:</p>
                <div className="flex flex-wrap gap-2">
                  {(msg.choiceOptions || []).map((opt, i) => (
                    <button key={i} disabled={submitting}
                      onClick={() => handleAck(opt)}
                      className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white transition">
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button disabled={submitting}
                onClick={() => handleAck()}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2">
                <CheckCircle size={18} /> {submitting ? 'שומר...' : 'אישור קריאה'}
              </button>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2.5 rounded-xl transition"
        >
          סגור
        </button>
      </div>
    </div>
  )
}

// ── Tracking modal ────────────────────────────────────────────────────────────

function TrackingModal({ msg, branchId, onClose }) {
  const [receipts,    setReceipts]    = useState([])
  const [branchUsers, setBranchUsers] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [reminding,   setReminding]   = useState(false)
  const [reminded,    setReminded]    = useState(false)

  useEffect(() => {
    let active = true
    const bid = branchId || msg.branchId
    setLoading(true)
    Promise.all([
      getMessageReceipts(msg.id).catch(e => { console.error('[tracking] receipts err', e); return [] }),
      getBranchUsers(bid).catch(e => { console.error('[tracking] users err', e); return [] }),
    ]).then(([rcpts, us]) => {
      if (!active) return
      setReceipts(rcpts)
      setBranchUsers(us)
      setLoading(false)
    })
    return () => { active = false }
  }, [msg.id, branchId])

  const respondedIds   = new Set(receipts.map(r => r.userId))
  const respondedCount = respondedIds.size
  const totalCount     = msg.targetUserIds?.length || 0
  const pendingCount   = Math.max(0, totalCount - respondedCount)

  const userById     = Object.fromEntries(branchUsers.map(u => [u.id, u]))
  const targetIds    = msg.targetUserIds || []
  const respondedNames = targetIds
    .filter(id => respondedIds.has(id))
    .map(id => userById[id] ? `${userById[id].firstName} ${userById[id].lastName}` : (receipts.find(r => r.userId === id)?.userName || 'לא ידוע'))
  const pendingNames = targetIds
    .filter(id => !respondedIds.has(id))
    .map(id => userById[id] ? `${userById[id].firstName} ${userById[id].lastName}` : 'לא ידוע')

  const choiceBreakdown = {}
  if (msg.messageType === 'choice') {
    ;(msg.choiceOptions || []).forEach(o => { choiceBreakdown[o] = [] })
    receipts.forEach(r => {
      if (r.choice && choiceBreakdown[r.choice] !== undefined) choiceBreakdown[r.choice].push(r.userName)
      else if (r.choice) choiceBreakdown[r.choice] = [r.userName]
    })
  }

  const handleReminder = async () => {
    setReminding(true)
    try {
      const pendingIds = (msg.targetUserIds || []).filter(id => !respondedIds.has(id))
      if (pendingIds.length) {
        await createBulkNotifications(pendingIds, branchId || msg.branchId, `תזכורת: ${msg.title}`, msg.body, 'general', { messageId: msg.id })
      }
      setReminded(true)
    } catch (e) { console.error(e) }
    finally { setReminding(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()} dir="rtl">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">מעקב קריאה</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-500 mb-4 truncate">{msg.title}</p>

        {loading ? (
          <div className="py-10 flex justify-center"><LoadingSpinner size="md" text="טוען..." /></div>
        ) : (
          <>
            {/* Summary */}
            <div className="flex gap-3 mb-5">
              <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-green-600">{respondedCount}</p>
                <p className="text-xs text-gray-600">{msg.messageType === 'choice' ? 'ענו' : 'אישרו'}</p>
              </div>
              <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-gray-400">{pendingCount}</p>
                <p className="text-xs text-gray-600">ממתינים</p>
              </div>
              <div className="flex-1 bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-orange-500">{totalCount}</p>
                <p className="text-xs text-gray-600">סה״כ</p>
              </div>
            </div>

            {/* Choice breakdown */}
            {msg.messageType === 'choice' && (
              <div className="mb-5 space-y-2">
                <p className="text-xs font-semibold text-gray-500">פילוח תשובות:</p>
                {Object.entries(choiceBreakdown).map(([opt, names]) => (
                  <div key={opt} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800">{opt}</span>
                      <span className="text-sm font-bold text-orange-500">{names.length}</span>
                    </div>
                    {names.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">{names.join(', ')}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Who responded */}
            {respondedNames.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-green-600 mb-2">{msg.messageType === 'choice' ? 'ענו' : 'אישרו'} ({respondedNames.length}):</p>
                <div className="flex flex-wrap gap-1.5">
                  {respondedNames.map((name, i) => (
                    <span key={i} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">{name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Who hasn't responded */}
            {pendingNames.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-500 mb-2">טרם הגיבו ({pendingNames.length}):</p>
                <div className="flex flex-wrap gap-1.5">
                  {pendingNames.map((name, i) => (
                    <span key={i} className="text-xs bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">{name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Reminder button */}
            {pendingCount > 0 && (
              reminded ? (
                <div className="text-center text-sm text-green-600 bg-green-50 border border-green-200 rounded-xl py-2.5">
                  התזכורת נשלחה ל-{pendingCount} ממתינים
                </div>
              ) : (
                <button onClick={handleReminder} disabled={reminding}
                  className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2">
                  <BellRinging size={18} /> {reminding ? 'שולח...' : `שלח תזכורת ל-${pendingCount} ממתינים`}
                </button>
              )
            )}
          </>
        )}

        <button onClick={onClose} className="w-full mt-3 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl font-medium transition">
          סגור
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user } = useAuth()
  const { isBranchHead, isSystemAdmin, isRoleHolder } = useRole()
  const allowedAudiences = getAllowedAudiences(user, { isBranchHead, isSystemAdmin })
  const canSend = allowedAudiences === 'ALL' || (Array.isArray(allowedAudiences) && allowedAudiences.length > 0)
  const canDelete = isBranchHead || isSystemAdmin || user?.role === 'branch_deputy'

  // For system_admin: branch selected from dropdown. Others: their own branch.
  const [adminBranchId, setAdminBranchId] = useState(null)
  const branchId = isSystemAdmin ? adminBranchId : user?.branchId

  const [messages,    setMessages]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [successMsg,  setSuccessMsg]  = useState('')
  const [selectedMsg, setSelectedMsg] = useState(null)
  const [trackingMsg, setTrackingMsg] = useState(null)

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

  // Permission-based message filter for regular volunteers
  // Only branch_head / branch_deputy / system_admin see ALL branch messages.
  const canSeeAllMessages = isBranchHead || isSystemAdmin || user?.role === 'branch_deputy'

  const userMatchesMessage = (msg) => {
    if (canSeeAllMessages) return true
    // Everyone else (including coordinators & volunteers) sees only messages targeted to them.
    // Prefer the saved recipient snapshot when available (most accurate).
    if (Array.isArray(msg.targetUserIds) && msg.targetUserIds.length > 0) {
      return msg.targetUserIds.includes(user?.id)
    }
    // Fallback for older messages without a recipient snapshot: match by targetGroup.
    const tg = msg.targetGroup
    if (!tg || tg === 'all')   return true
    if (tg === 'custom')       return msg.targetUserIds?.includes(user?.id) ?? false
    if (tg === 'night')        return hasPerm(user, 'nightShifts')
    if (tg === 'shabbat')      return hasPerm(user, 'shabbatVolunteer')
    if (tg === 'vehicle')      return hasPerm(user, 'vehicleDriver')
    if (tg === 'ambulance')    return hasPerm(user, 'ambulanceDriver')
    if (tg === 'female')       return user?.gender === 'female'
    if (tg === 'male')         return user?.gender === 'male'
    if (tg.startsWith('team:')) return (user?.team || '').trim() === tg.slice(5).trim()
    return true
  }

  const handleSent = (recipientCount) => {
    setShowForm(false)
    setSuccessMsg(`ההודעה נשלחה בהצלחה ל-${recipientCount} מתנדבים`)
    setTimeout(() => setSuccessMsg(''), 5000)
  }

  const handleDelete = async (msgId) => {
    try {
      await deleteBranchMessage(msgId)
      // Real-time subscription auto-removes it from the list
    } catch (err) {
      console.error('[MessagesPage] delete failed:', err)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto pb-20 lg:pb-6">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <MegaphoneSimple size={24} className="text-orange-400" /> הודעות סניף
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
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <Globe size={40} className="text-gray-300 mb-3 mx-auto" />
          <p className="text-gray-700 font-medium">בחר סניף כדי לצפות בהודעות</p>
        </div>
      )}

      {/* Success banner */}
      {successMsg && (
        <div className="mb-5 bg-green-50 border border-green-200 rounded-2xl px-5 py-3 text-gray-900 font-medium text-sm flex items-center gap-2">
          <CheckCircle size={18} className="text-green-500 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Send form */}
      {showForm && (
        <div className="mb-6">
          <SendMessageForm
            user={user}
            branchId={branchId}
            allowedAudiences={allowedAudiences}
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
          <EnvelopeSimple size={56} className="text-gray-300" />
          <div>
            <p className="text-lg font-semibold text-gray-700">אין הודעות עדיין</p>
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
              <MegaphoneSimple size={16} className="inline ml-1" /> שלח הודעה ראשונה
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {messages.filter(userMatchesMessage).map(msg => (
            <MessageCard
              key={msg.id}
              msg={msg}
              onOpen={setSelectedMsg}
              canDelete={canDelete}
              onDelete={handleDelete}
              onTrack={setTrackingMsg}
            />
          ))}
        </div>
      )}

      {/* Message detail modal */}
      {selectedMsg && (
        <MessageModal msg={selectedMsg} user={user} onClose={() => setSelectedMsg(null)} />
      )}

      {/* Tracking modal */}
      {trackingMsg && (
        <TrackingModal msg={trackingMsg} branchId={branchId} onClose={() => setTrackingMsg(null)} />
      )}

    </div>
  )
}
