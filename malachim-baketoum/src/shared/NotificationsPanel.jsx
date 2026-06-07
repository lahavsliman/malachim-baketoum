import { useState, useEffect, useRef } from 'react'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { markAsRead, markAllAsRead } from '../firebase/notifications'
import { formatDistanceToNow } from 'date-fns'
import { he } from 'date-fns/locale'

const TYPE_ICONS = {
  shift_reminder:    '🌙',
  shift_cancelled:   '❌',
  shabbat_confirmed: '🕍',
  event_invite:      '🎉',
  general:           '📢',
}

function timeAgo(ts) {
  if (!ts) return ''
  const date = ts?.toDate ? ts.toDate() : new Date(ts)
  return formatDistanceToNow(date, { locale: he, addSuffix: true })
}

export default function NotificationsPanel({ userId, onClose, anchorRef }) {
  const [notifications, setNotifications] = useState([])
  const panelRef = useRef(null)

  // Real-time subscription — last 10 notifications for this user
  useEffect(() => {
    if (!userId) return
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(10)
    )
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [userId])

  // Close when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        anchorRef?.current && !anchorRef.current.contains(e.target)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  const handleClick = async (n) => {
    if (!n.isRead) await markAsRead(n.id)
  }

  const handleMarkAll = async () => {
    await markAllAsRead(userId)
  }

  const unreadCount = notifications.filter(n => !n.isRead).length

  return (
    <div
      ref={panelRef}
      className="absolute left-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-50 overflow-hidden"
      style={{ minWidth: '300px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="font-bold text-gray-200 text-sm">
          התראות {unreadCount > 0 && <span className="text-orange-400">({unreadCount} חדשות)</span>}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            className="text-xs text-orange-400 hover:text-orange-300 transition"
          >
            סמן הכל כנקרא
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto divide-y divide-gray-800/60">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <span className="text-3xl mb-2">🔔</span>
            <p className="text-sm">אין התראות חדשות</p>
          </div>
        ) : (
          notifications.map(n => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-right px-4 py-3 flex items-start gap-3 transition
                ${n.isRead
                  ? 'hover:bg-gray-800/40'
                  : 'bg-orange-500/5 hover:bg-orange-500/10 border-r-2 border-orange-500'
                }`}
            >
              <span className="text-xl shrink-0 mt-0.5">
                {TYPE_ICONS[n.type] ?? '📢'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-snug truncate
                  ${n.isRead ? 'text-gray-300' : 'text-gray-100'}`}>
                  {n.title}
                </p>
                {n.body && (
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                    {n.body}
                  </p>
                )}
                <p className="text-xs text-gray-600 mt-1">{timeAgo(n.createdAt)}</p>
              </div>
              {!n.isRead && (
                <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0 mt-1.5" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
