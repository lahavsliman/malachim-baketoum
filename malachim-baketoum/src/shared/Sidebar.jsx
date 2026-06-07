import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../context/AuthContext'
import { logoutUser } from '../firebase/auth'

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Check permission in both new (permissions object) and legacy (flat) field */
const hasPerm = (user, key) =>
  user?.permissions?.[key] === true || user?.[key] === true

/** Check roleType in both new (roleTypes array) and legacy (roleType string) */
const hasRoleType = (user, type) =>
  user?.roleTypes?.includes(type) || user?.roleType === type

// ── Desktop nav items ─────────────────────────────────────────────────────────

const NavItem = ({ to, icon, label, badge, onClick }) => (
  <NavLink
    to={to}
    end={to === '/'}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
       ${isActive
         ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
         : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'}`
    }
  >
    <span className="text-lg">{icon}</span>
    <span>{label}</span>
    {badge && (
      <span className="mr-auto bg-gray-700 text-gray-400 text-xs rounded-full px-2 py-0.5">
        {badge}
      </span>
    )}
  </NavLink>
)

const ComingSoon = ({ icon, label }) => (
  <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-gray-600 cursor-not-allowed select-none">
    <span className="text-lg opacity-40">{icon}</span>
    <span>{label}</span>
    <span className="mr-auto text-xs bg-gray-800 text-gray-600 px-2 py-0.5 rounded-full">בקרוב</span>
  </div>
)

// ── Mobile bottom-nav item ────────────────────────────────────────────────────

const BottomNavItem = ({ to, icon, label }) => (
  <NavLink
    to={to}
    end={to === '/'}
    className={({ isActive }) =>
      `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-xs font-medium transition-colors
       ${isActive ? 'text-orange-400' : 'text-gray-500 hover:text-gray-300'}`
    }
  >
    <span className="text-xl leading-none">{icon}</span>
    <span className="leading-none">{label}</span>
  </NavLink>
)

// ── Main component ────────────────────────────────────────────────────────────

export default function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const {
    isSystemAdmin, isBranchHead, canManageBranch,
    canManageNightShifts, canManageShabbat,
  } = useRole()

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const handleLogout = async () => {
    setShowLogoutConfirm(false)
    await logoutUser()
    navigate('/login')
  }

  // Permission checks — works with both new permissions object and legacy flat fields
  const showNightShifts  = hasPerm(user, 'nightShifts')  || canManageNightShifts
  const showShabbat      = hasPerm(user, 'shabbatVolunteer') || canManageShabbat

  // Building codes: dispatcher (any format) OR branch management roles
  const isDispatcher = hasRoleType(user, 'dispatcher')
  const showBuildingCodes =
    isDispatcher || isBranchHead || isSystemAdmin ||
    (user?.role === 'role_holder' && isDispatcher)

  // Collect desktop nav items for reuse in mobile bottom bar
  const navItems = [
    { to: '/',                  icon: '🏠', label: 'ראשי',        always: true },
    { to: '/night-shifts',      icon: '🌙', label: 'לילה',        show: showNightShifts },
    { to: '/shabbat',           icon: '🕍', label: 'שבת',         show: showShabbat },
    { to: '/building-codes',    icon: '🔑', label: 'קודים',       show: showBuildingCodes },
    { to: '/events',             icon: '🎉', label: 'גיבוש',       always: true },
    { to: '/messages',          icon: '📢', label: 'הודעות',      always: true },
    { to: '/reports',           icon: '📊', label: 'דוחות',       show: canManageBranch },
    { to: '/branch-management', icon: '⚙️', label: 'ניהול סניף',  show: isBranchHead },
    { to: '/system-admin',      icon: '🌐', label: 'כל הסניפים',  show: isSystemAdmin },
  ].filter(item => item.always || item.show)

  // Mobile bottom bar: first 4 relevant items (home always first)
  const bottomItems = navItems.slice(0, 4)

  return (
    <>
      {/* ── Mobile overlay (when sidebar is open via hamburger) ── */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={onClose}
        />
      )}

      {/* ── Desktop / hamburger-open sidebar ── */}
      <aside className={`
        fixed lg:static inset-y-0 right-0 z-50 lg:z-auto
        w-64 bg-gray-900 border-l border-gray-800
        flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-3 flex-1 overflow-y-auto">
          {/* Close button (mobile only) */}
          <div className="lg:hidden flex items-center justify-between mb-4 px-1">
            <span className="font-bold text-orange-400">מלאכים בכתום</span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 p-1"
              aria-label="סגור תפריט"
            >
              ✕
            </button>
          </div>

          <nav className="flex flex-col gap-1">
            <NavItem to="/" icon="🏠" label="ראשי" onClick={onClose} />

            {showNightShifts && (
              <NavItem to="/night-shifts" icon="🌙" label="שיבוצי לילה" onClick={onClose} />
            )}

            {showShabbat && (
              <NavItem to="/shabbat" icon="🕍" label="תורני שבת" onClick={onClose} />
            )}

            {showBuildingCodes && (
              <NavItem to="/building-codes" icon="🔑" label="קודי בניין" onClick={onClose} />
            )}

            <NavItem to="/events" icon="🎉" label="ערבי גיבוש" onClick={onClose} />

            {/* Messages — always visible */}
            <NavItem to="/messages" icon="📢" label="הודעות" onClick={onClose} />

            {canManageBranch && (
              <NavItem to="/reports" icon="📊" label="דוחות" onClick={onClose} />
            )}

            {isBranchHead && (
              <NavItem to="/branch-management" icon="⚙️" label="ניהול סניף" onClick={onClose} />
            )}

            {isSystemAdmin && (
              <NavItem to="/system-admin" icon="🌐" label="כל הסניפים" onClick={onClose} />
            )}
          </nav>
        </div>

        <div className="p-3 border-t border-gray-800 space-y-2">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-400 hover:text-white hover:bg-red-500 border border-red-500/30 hover:border-red-500 transition"
          >
            התנתק 🚪
          </button>
          <p className="text-xs text-gray-600 text-center">מלאכים בכתום v1.0</p>
        </div>
      </aside>

      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4"
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

      {/* ── Mobile bottom navigation bar ── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-gray-900 border-t border-gray-800 flex safe-area-inset-bottom">
        {bottomItems.map(item => (
          <BottomNavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
          />
        ))}
      </nav>
    </>
  )
}
