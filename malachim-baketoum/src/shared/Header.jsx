import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { logoutUser } from '../firebase/auth'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../hooks/useBranch'
import { useNavigate } from 'react-router-dom'

const ROLE_LABELS = {
  system_admin:   'מנהל מערכת',
  branch_head:    'ראש סניף',
  branch_deputy:  'סגן ראש סניף',
  role_holder:    'בעל תפקיד',
  volunteer:      'מתנדב',
}

const ROLE_TYPE_LABELS = {
  night_coordinator:   'רכז לילות',
  dispatcher:          'מוקדן',
  shabbat_coordinator: 'רכז שבת',
}

export default function Header({ onMenuToggle }) {
  const { user } = useAuth()
  const { branch } = useBranch()
  const navigate = useNavigate()

  const [unreadCount, setUnreadCount] = useState(0)

  // Real-time unread count badge
  useEffect(() => {
    if (!user?.id) return
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.id),
      where('isRead', '==', false)
    )
    const unsub = onSnapshot(q, (snap) => setUnreadCount(snap.size))
    return unsub
  }, [user?.id])

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const handleLogout = async () => {
    setShowLogoutConfirm(false)
    await logoutUser()
    navigate('/login')
  }

  // Determine role label — check both legacy roleType and new roleTypes array
  const primaryRoleType =
    user?.roleTypes?.[0] ?? user?.roleType ?? null
  const roleLabel =
    (user?.role === 'role_holder' || user?.role === 'branch_head' || user?.role === 'branch_deputy')
      ? (ROLE_TYPE_LABELS[primaryRoleType] ?? ROLE_LABELS[user?.role] ?? '')
      : (ROLE_LABELS[user?.role] ?? '')

  return (
    <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
      {/* Left side: hamburger + logo */}
      <div className="flex items-center gap-3">
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition"
            aria-label="פתח תפריט"
          >
            ☰
          </button>
        )}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🟠</span>
          <div>
            <span className="font-bold text-orange-400 text-lg leading-none block">מלאכים בכתום</span>
            {user?.role === 'system_admin'
              ? <span className="text-xs text-orange-400/80">מנהל מערכת</span>
              : branch && <span className="text-xs text-gray-400">סניף {branch.name}</span>}
          </div>
        </div>
      </div>

      {/* Right side: user info + bell + logout */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* User name + role badge (desktop) */}
        {user && (
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-gray-200 leading-none">
              {user.firstName} {user.lastName}
            </p>
            <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full mt-1 inline-block">
              {roleLabel}
            </span>
          </div>
        )}

        {/* Notification bell — navigates to full notifications page */}
        {user && (
          <button
            onClick={() => navigate('/notifications')}
            className="relative p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition"
            aria-label="התראות"
          >
            <span className="text-xl leading-none">🔔</span>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        )}

        {/* Logout */}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-400 hover:text-white hover:bg-red-500 border border-red-500/40 hover:border-red-500 transition"
        >
          <span className="hidden sm:inline">התנתק</span>
          <span>🚪</span>
        </button>
      </div>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setShowLogoutConfirm(false)}
          dir="rtl"
        >
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">👋</div>
              <h3 className="font-bold text-gray-100 text-lg">האם אתה בטוח שברצונך לצאת?</h3>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 py-2.5 rounded-xl transition text-sm font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold py-2.5 rounded-xl transition text-sm"
              >
                כן, צא
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
