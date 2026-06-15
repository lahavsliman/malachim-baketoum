import { useState, useEffect, useRef } from 'react'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { markAsRead, markAllAsRead } from '../firebase/notifications'
import { formatDistanceToNow } from 'date-fns'
import { he } from 'date-fns/locale'
import { Moon, Star, UsersThree, MegaphoneSimple, Bell, CheckCircle, X } from '@phosphor-icons/react'

const TYPE_ICON_MAP = {
  shift_reminder:    Moon,
  shabbat_confirmed: Star,
  event_invite:      UsersThree,
  general:           MegaphoneSimple,
}

function NotifTypeIcon({ type }) {
  if (type === 'shift_cancelled') return <span className="text-base leading-none">❌</span>
  const Icon = TYPE_ICON_MAP[type] ?? MegaphoneSimple
  return <Icon size={18} className="text-gray-400 shrink-0" />
}

function timeAgo(ts) {
  if (!ts) return ''
  const date = ts?.toDate ? ts.toDate() : new Date(ts)
  return formatDistanceToNow(date, { locale: he, addSuffix: true })
}

function PanelNotificationModal({ n, onClose, onRead }) {
  const handleClose = () => {
    if (!n.isRead) onRead(n.id)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
      onClick={e => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" dir="rtl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-1">
            <span className="shrink-0 flex items-center mt-0.5">
              <NotifTypeIcon type={n.type} />
            </span>
            <h2 className="text-base font-bold text-gray-900 leading-snug">{n.title}</h2>
          </div>
          <button onClick={handleClose} className="shrink-0 text-gray-400 hover:text-gray-600 transition p-0.5">
            <X size={18} />
          </button>
        </div>
        {n.body && (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-4">{n.body}</p>
        )}
        <p className="text-xs text-gray-400 mb-5">{timeAgo(n.createdAt)}</p>
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

export default function NotificationsPanel({ userId, onClose, anchorRef }) {
  const [notifications,  setNotifications]  = useState([])
  const [selectedNotif,  setSelectedNotif]  = useState(null)
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

  const handleRead = async (id) => {
    await markAsRead(id)
  }

  const handleMarkAll = async () => {
    await markAllAsRead(userId)
  }

  const unreadCount = notifications.filter(n => !n.isRead).length

  return (
    <div
      ref={panelRef}
      className="absolute left-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden"
      style={{ minWidth: '300px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="font-bold text-gray-800 text-sm">
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
      <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <Bell size={32} className="text-gray-300 mb-2" />
            <p className="text-sm">אין התראות חדשות</p>
          </div>
        ) : (
          notifications.map(n => (
            <button
              key={n.id}
              onClick={() => setSelectedNotif(n)}
              className={`w-full text-right px-4 py-3 flex items-start gap-3 transition
                ${n.isRead
                  ? 'hover:bg-gray-100'
                  : 'bg-orange-500/5 hover:bg-orange-500/10 border-r-2 border-orange-500'
                }`}
            >
              <span className="shrink-0 mt-0.5 flex items-center">
                <NotifTypeIcon type={n.type} />
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-snug truncate
                  ${n.isRead ? 'text-gray-700' : 'text-gray-900'}`}>
                  {n.title}
                </p>
                {n.body && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
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

      {selectedNotif && (
        <PanelNotificationModal
          n={selectedNotif}
          onClose={() => setSelectedNotif(null)}
          onRead={handleRead}
        />
      )}
    </div>
  )
}
