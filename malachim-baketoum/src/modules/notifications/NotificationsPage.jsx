import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { formatDistanceToNow } from 'date-fns'
import { he } from 'date-fns/locale'
import { db } from '../../firebase/config'
import { markAsRead, markAllAsRead } from '../../firebase/notifications'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../shared/LoadingSpinner'

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICONS = {
  shift_reminder:    '🌙',
  shift_cancelled:   '❌',
  shabbat_confirmed: '🕍',
  event_invite:      '🎉',
  general:           '📢',
}

const FILTER_TABS = [
  { id: 'all',      label: 'הכל' },
  { id: 'unread',   label: 'לא נקרא' },
  { id: 'shifts',   label: 'משמרות' },
  { id: 'shabbat',  label: 'שבת' },
  { id: 'general',  label: 'כללי' },
]

// Which notification types belong to each filter tab
const TAB_TYPES = {
  shifts:  ['shift_reminder', 'shift_cancelled'],
  shabbat: ['shabbat_confirmed'],
  general: ['general', 'event_invite'],
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

function applyFilter(notifications, tab) {
  switch (tab) {
    case 'unread':  return notifications.filter(n => !n.isRead)
    case 'shifts':  return notifications.filter(n => TAB_TYPES.shifts.includes(n.type))
    case 'shabbat': return notifications.filter(n => TAB_TYPES.shabbat.includes(n.type))
    case 'general': return notifications.filter(n => TAB_TYPES.general.includes(n.type))
    default:        return notifications
  }
}

// ── Notification row ──────────────────────────────────────────────────────────

function NotificationRow({ n, onRead }) {
  const handleClick = () => {
    if (!n.isRead) onRead(n.id)
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full text-right flex items-start gap-4 px-5 py-4 transition
        ${n.isRead
          ? 'hover:bg-gray-800/40'
          : 'bg-orange-500/5 hover:bg-orange-500/10 border-r-[3px] border-orange-500'
        }`}
    >
      {/* Type icon */}
      <span className="text-2xl shrink-0 mt-0.5">
        {TYPE_ICONS[n.type] ?? '📢'}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0 text-right">
        <p className={`text-sm leading-snug ${n.isRead ? 'text-gray-300 font-normal' : 'text-gray-100 font-bold'}`}>
          {n.title}
        </p>
        {n.body && (
          <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { user } = useAuth()

  const [all,        setAll]        = useState([])
  const [loading,    setLoading]    = useState(true)
  const [activeTab,  setActiveTab]  = useState('all')
  const [pageLimit,  setPageLimit]  = useState(PAGE_SIZE)
  const [marking,    setMarking]    = useState(false)

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
          <h1 className="text-2xl font-black text-gray-100">ההתראות שלי 🔔</h1>
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
        {FILTER_TABS.map(tab => {
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
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 leading-none font-bold
                  ${activeTab === tab.id
                    ? 'bg-white/20 text-white'
                    : tab.id === 'unread'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-gray-700 text-gray-400'
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
          <span className="text-5xl">
            {activeTab === 'unread' ? '✅' : '🔔'}
          </span>
          <p className="text-lg font-semibold text-gray-300">
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
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="divide-y divide-gray-800/60">
            {visible.map(n => (
              <NotificationRow key={n.id} n={n} onRead={handleRead} />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="px-5 py-4 border-t border-gray-800 text-center">
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
    </div>
  )
}
