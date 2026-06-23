import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { formatDistanceToNow } from 'date-fns'
import { he } from 'date-fns/locale'
import { db } from '../../firebase/config'
import { markAsRead, markAllAsRead } from '../../firebase/notifications'
import { getMessageById, submitMessageReceipt, getUserMessageReceipt } from '../../firebase/messages'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../shared/LoadingSpinner'
import { Moon, Star, UsersThree, MegaphoneSimple, Bell, CheckCircle, X } from '@phosphor-icons/react'

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICON_MAP = {
  shift_reminder:    Moon,
  shabbat_confirmed: Star,
  event_invite:      UsersThree,
  general:           MegaphoneSimple,
}

function NotifTypeIcon({ type }) {
  if (type === 'shift_cancelled') return <span className="text-lg leading-none">❌</span>
  const Icon = TYPE_ICON_MAP[type] ?? MegaphoneSimple
  return <Icon size={20} className="text-gray-400 shrink-0" />
}

// perm: null = always visible; string = permission key required
const ALL_FILTER_TABS = [
  { id: 'all',     label: 'הכל',     perm: null },
  { id: 'unread',  label: 'לא נקרא', perm: null },
  { id: 'night',   label: 'לילה',    perm: 'nightShifts' },
  { id: 'shabbat', label: 'שבת',     perm: 'shabbatVolunteer' },
]

// Which notification types belong to each filter tab
const TAB_TYPES = {
  night:   ['shift_reminder', 'shift_cancelled'],
  shabbat: ['shabbat_confirmed'],
}

const PAGE_SIZE = 20

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts) {
  if (!ts) return ''
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return formatDistanceToNow(d, { locale: he, addSuffix: true })
  } catch { return '' }
}

const hasPerm = (user, key) =>
  user?.permissions?.[key] === true || user?.[key] === true

function applyFilter(notifications, tab) {
  switch (tab) {
    case 'unread':  return notifications.filter(n => !n.isRead)
    case 'night':   return notifications.filter(n => TAB_TYPES.night.includes(n.type))
    case 'shabbat': return notifications.filter(n => TAB_TYPES.shabbat.includes(n.type))
    default:        return notifications
  }
}

// ── Notification row ──────────────────────────────────────────────────────────

function NotificationRow({ n, onOpen }) {
  return (
    <button
      onClick={() => onOpen(n)}
      className={`w-full text-right flex items-start gap-4 px-5 py-4 transition
        ${n.isRead
          ? 'hover:bg-gray-100'
          : 'bg-orange-500/5 hover:bg-orange-500/10 border-r-[3px] border-orange-500'
        }`}
    >
      {/* Type icon */}
      <span className="shrink-0 mt-0.5 flex items-center">
        <NotifTypeIcon type={n.type} />
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0 text-right">
        <p className={`text-sm leading-snug ${n.isRead ? 'text-gray-700 font-normal' : 'text-gray-900 font-bold'}`}>
          {n.title}
        </p>
        {n.body && (
          <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">
            {n.body}
          </p>
        )}
        <p className="text-xs text-gray-600 mt-1.5">{relativeTime(n.createdAt)}</p>
      </div>

      {/* Unread dot */}
      {!n.isRead && (
        <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0 mt-2" />
      )}
    </button>
  )
}

// ── Notification modal ────────────────────────────────────────────────────────

function NotificationModal({ n, user, onClose, onRead }) {
  const [linkedMsg,  setLinkedMsg]  = useState(null)
  const [receipt,    setReceipt]    = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!n.messageId) return
    getMessageById(n.messageId).then(setLinkedMsg).catch(() => {})
    if (user?.id) getUserMessageReceipt(n.messageId, user.id).then(setReceipt).catch(() => {})
  }, [n.messageId, user?.id])

  const needsResponse = linkedMsg && (linkedMsg.requiresAck || linkedMsg.messageType === 'choice')

  const handleAck = async (choice = null) => {
    if (!user?.id || !linkedMsg) return
    setSubmitting(true)
    try {
      await submitMessageReceipt(linkedMsg.id, linkedMsg.branchId, user.id, `${user.firstName} ${user.lastName}`, { status: 'read', choice })
      const updated = await getUserMessageReceipt(linkedMsg.id, user.id)
      setReceipt(updated)
    } catch (e) { console.error(e) }
    finally { setSubmitting(false) }
  }

  const handleClose = () => {
    if (!n.isRead) onRead(n.id)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" dir="rtl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-1">
            <span className="shrink-0 flex items-center mt-0.5">
              <NotifTypeIcon type={n.type} />
            </span>
            <h2 className="text-base font-bold text-gray-900 leading-snug">{n.title}</h2>
          </div>
          <button
            onClick={handleClose}
            className="shrink-0 text-gray-400 hover:text-gray-600 transition p-0.5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {n.body && (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-4">
            {n.body}
          </p>
        )}

        {/* Date */}
        <p className="text-xs text-gray-400 mb-5">{relativeTime(n.createdAt)}</p>

        {/* Response area (ack / choice) */}
        {needsResponse && (
          <div className="border-t border-gray-100 pt-4 mb-4">
            {receipt ? (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                <CheckCircle size={18} weight="fill" className="text-green-600" />
                {linkedMsg.messageType === 'choice'
                  ? <span>תשובתך נשמרה: <strong>{receipt.choice}</strong></span>
                  : <span>אישרת קריאת ההודעה</span>}
              </div>
            ) : linkedMsg.messageType === 'choice' ? (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">בחר תשובה:</p>
                <div className="flex flex-wrap gap-2">
                  {(linkedMsg.choiceOptions || []).map((opt, i) => (
                    <button key={i} disabled={submitting} onClick={() => handleAck(opt)}
                      className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white transition">
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button disabled={submitting} onClick={() => handleAck()}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2">
                <CheckCircle size={18} /> {submitting ? 'שומר...' : 'אישור קריאה'}
              </button>
            )}
          </div>
        )}

        {/* Close + mark read */}
        <button
          onClick={handleClose}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2.5 rounded-xl transition flex items-center justify-center gap-2"
        >
          <CheckCircle size={16} className="text-green-500" />
          סגור
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { user } = useAuth()

  const [all,          setAll]          = useState([])
  const [loading,      setLoading]      = useState(true)
  const [activeTab,    setActiveTab]    = useState('all')
  const [pageLimit,    setPageLimit]    = useState(PAGE_SIZE)
  const [marking,      setMarking]      = useState(false)
  const [selectedNotif,setSelectedNotif]= useState(null)

  // Tabs visible to this user based on their permissions
  const visibleTabs = ALL_FILTER_TABS.filter(t => !t.perm || hasPerm(user, t.perm))

  // Real-time subscription — all notifications for this user
  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.id),
      orderBy('createdAt', 'desc')
    )
    const unsub = onSnapshot(q, snap => {
      setAll(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [user?.id])

  // Reset page limit when tab changes
  useEffect(() => { setPageLimit(PAGE_SIZE) }, [activeTab])

  const filtered  = applyFilter(all, activeTab)
  const visible   = filtered.slice(0, pageLimit)
  const hasMore   = filtered.length > pageLimit
  const unreadAll = all.filter(n => !n.isRead).length

  const handleRead = async (id) => {
    await markAsRead(id)
    // onSnapshot will update `all` automatically
  }

  const handleMarkAll = async () => {
    setMarking(true)
    await markAllAsRead(user.id)
    setMarking(false)
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto pb-20 lg:pb-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            ההתראות שלי <Bell size={22} className="text-gray-500" />
          </h1>
          {unreadAll > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[22px] text-center">
              {unreadAll > 99 ? '99+' : unreadAll}
            </span>
          )}
        </div>
        {unreadAll > 0 && (
          <button
            onClick={handleMarkAll}
            disabled={marking}
            className="text-sm text-orange-400 hover:text-orange-300 disabled:opacity-50 transition font-medium"
          >
            {marking ? 'מסמן...' : 'סמן הכל כנקרא'}
          </button>
        )}
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
        {visibleTabs.map(tab => {
          const count = tab.id === 'unread'
            ? unreadAll
            : tab.id === 'all'
              ? all.length
              : applyFilter(all, tab.id).length

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition shrink-0
                ${activeTab === tab.id
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200'
                }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 leading-none font-bold
                  ${activeTab === tab.id
                    ? 'bg-white/20 text-white'
                    : tab.id === 'unread'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner size="lg" text="טוען התראות..." />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          {activeTab === 'unread'
            ? <CheckCircle size={48} weight="fill" className="text-green-500" />
            : <Bell size={48} className="text-gray-300" />
          }
          <p className="text-lg font-semibold text-gray-700">
            {activeTab === 'unread' ? 'אין התראות שלא נקראו' : 'אין התראות בקטגוריה זו'}
          </p>
          {activeTab !== 'all' && (
            <button
              onClick={() => setActiveTab('all')}
              className="text-sm text-orange-400 hover:text-orange-300 transition"
            >
              לכל ההתראות ←
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="divide-y divide-gray-100">
            {visible.map(n => (
              <NotificationRow key={n.id} n={n} onOpen={setSelectedNotif} />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="px-5 py-4 border-t border-gray-200 text-center">
              <button
                onClick={() => setPageLimit(l => l + PAGE_SIZE)}
                className="text-sm text-orange-400 hover:text-orange-300 transition font-medium"
              >
                טען עוד ({filtered.length - pageLimit} נותרו)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Notification modal ── */}
      {selectedNotif && (
        <NotificationModal
          n={selectedNotif}
          user={user}
          onClose={() => setSelectedNotif(null)}
          onRead={handleRead}
        />
      )}

    </div>
  )
}
