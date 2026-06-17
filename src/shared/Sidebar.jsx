import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  House, Moon, Star, Buildings, UsersThree,
  ChatCircle, ChartBar, Sliders, Globe, SignOut, HandWaving, Car,
} from '@phosphor-icons/react'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../context/AuthContext'
import { logoutUser } from '../firebase/auth'
import { getBranch } from '../firebase/branches'

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Check permission in both new (permissions object) and legacy (flat) field */
const hasPerm = (user, key) =>
  user?.permissions?.[key] === true || user?.[key] === true

/** Check roleType in both new (roleTypes array) and legacy (roleType string) */
const hasRoleType = (user, type) =>
  user?.roleTypes?.includes(type) || user?.roleType === type

// ── Desktop nav items ─────────────────────────────────────────────────────────

const NavItem = ({ to, Icon, label, badge, onClick }) => (
  <NavLink
    to={to}
    end={to === '/'}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
       ${isActive
         ? 'bg-orange-500/15 text-orange-500 border border-orange-500/25'
         : 'text-gray-400 hover:text-gray-800 hover:bg-gray-100'}`
    }
  >
    {({ isActive }) => (
      <>
        <Icon size={22} color={isActive ? '#F97316' : undefined} />
        <span>{label}</span>
        {badge && (
          <span className="mr-auto bg-gray-200 text-gray-500 text-xs rounded-full px-2 py-0.5">
            {badge}
          </span>
        )}
      </>
    )}
  </NavLink>
)

const ComingSoon = ({ Icon, label }) => (
  <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-gray-400 cursor-not-allowed select-none">
    <Icon size={22} className="opacity-40" />
    <span>{label}</span>
    <span className="mr-auto text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">בקרוב</span>
  </div>
)

// ── Mobile bottom-nav item ────────────────────────────────────────────────────

const BottomNavItem = ({ to, Icon, label }) => (
  <NavLink
    to={to}
    end={to === '/'}
    className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-xs font-medium transition-colors"
  >
    {({ isActive }) => (
      <>
        <Icon size={22} color={isActive ? '#F97316' : '#9CA3AF'} />
        <span className={`leading-none ${isActive ? 'text-orange-500' : 'text-gray-500'}`}>{label}</span>
      </>
    )}
  </NavLink>
)

// ── Main component ────────────────────────────────────────────────────────────

export default function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const {
    isSystemAdmin, isBranchHead, canManageBranch,
    canManageNightShifts, canManageShabbat, canManageTransport,
    isVehicleDriver, isAmbulanceDriver,
  } = useRole()

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [branchName, setBranchName] = useState('')

  useEffect(() => {
    if (!user?.branchId) return
    getBranch(user.branchId).then(b => setBranchName(b?.name ?? '')).catch(() => {})
  }, [user?.branchId])

  const handleLogout = async () => {
    setShowLogoutConfirm(false)
    await logoutUser()
    navigate('/login')
  }

  // Permission checks — works with both new permissions object and legacy flat fields
  const showNightShifts  = hasPerm(user, 'nightShifts')  || canManageNightShifts
  const showShabbat      = hasPerm(user, 'shabbatVolunteer') || canManageShabbat

  const isDriver = isVehicleDriver || isAmbulanceDriver

  // Building codes: dispatcher (any format) OR branch management roles
  const isDispatcher = hasRoleType(user, 'dispatcher')
  const showBuildingCodes =
    isDispatcher || isBranchHead || isSystemAdmin ||
    (user?.role === 'role_holder' && isDispatcher)

  // Collect desktop nav items for reuse in mobile bottom bar
  const navItems = [
    { to: '/',                  Icon: House,       label: 'ראשי',       always: true },
    { to: '/night-shifts',      Icon: Moon,        label: 'לילה',       show: showNightShifts },
    { to: '/shabbat',           Icon: Star,        label: 'שבת',        show: showShabbat },
    { to: '/building-codes',    Icon: Buildings,   label: 'קודים',      show: showBuildingCodes },
    { to: '/transport',         Icon: Car,         label: 'תחבורה',     show: canManageTransport },
    { to: '/my-transport',      Icon: Car,         label: 'התחבורה שלי', show: isDriver },
    { to: '/events',            Icon: UsersThree,  label: 'גיבושים',    always: true },
    { to: '/messages',          Icon: ChatCircle,  label: 'הודעות',     always: true },
    { to: '/reports',           Icon: ChartBar,    label: 'דוחות',      show: canManageBranch },
    { to: '/branch-management', Icon: Sliders,     label: 'ניהול סניף', show: isBranchHead },
    { to: '/system-admin',      Icon: Globe,       label: 'כל הסניפים', show: isSystemAdmin },
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
        w-64 bg-white border-l border-gray-200
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
              className="text-gray-500 hover:text-gray-800 p-1"
              aria-label="סגור תפריט"
            >
              ✕
            </button>
          </div>

          {/* ── Profile card ── */}
          <div className="mb-3 px-1">
            <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 border border-gray-100">
              {/* Logo */}
              <img src="/logo.svg" alt="לוגו" className="h-16 w-16 object-contain shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 truncate" dir="rtl">
                  {user?.firstName} {user?.lastName} · {user?.volunteerId}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {branchName && (
                    <span className="text-xs text-gray-500 truncate">{branchName}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            <NavItem to="/" Icon={House} label="ראשי" onClick={onClose} />

            {showNightShifts && (
              <NavItem to="/night-shifts" Icon={Moon} label="שיבוצי לילה" onClick={onClose} />
            )}

            {showShabbat && (
              <NavItem to="/shabbat" Icon={Star} label="תורני שבת" onClick={onClose} />
            )}

            {showBuildingCodes && (
              <NavItem to="/building-codes" Icon={Buildings} label="קודי בניין" onClick={onClose} />
            )}

            {canManageTransport && (
              <NavItem to="/transport" Icon={Car} label="ניהול תחבורה" onClick={onClose} />
            )}

            {isDriver && (
              <NavItem to="/my-transport" Icon={Car} label="התחבורה שלי" onClick={onClose} />
            )}

            <NavItem to="/events" Icon={UsersThree} label="גיבושים" onClick={onClose} />

            {/* Messages — always visible */}
            <NavItem to="/messages" Icon={ChatCircle} label="הודעות" onClick={onClose} />

            {canManageBranch && (
              <NavItem to="/reports" Icon={ChartBar} label="דוחות" onClick={onClose} />
            )}

            {isBranchHead && (
              <NavItem to="/branch-management" Icon={Sliders} label="ניהול סניף" onClick={onClose} />
            )}

            {isSystemAdmin && (
              <NavItem to="/system-admin" Icon={Globe} label="כל הסניפים" onClick={onClose} />
            )}
          </nav>
        </div>

        <div className="p-3 border-t border-gray-200 space-y-2">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-red-400 hover:text-white hover:bg-red-500 border border-red-500/30 hover:border-red-500 transition"
          >
            <SignOut size={18} />
            התנתק
          </button>
          <p className="text-xs text-gray-600 text-center">מלאכים בכתום v1.0</p>
        </div>
      </aside>

      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={e => e.target === e.currentTarget && setShowLogoutConfirm(false)}
          dir="rtl"
        >
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-5">
              <HandWaving size={36} className="mx-auto mb-3 text-gray-400" />
              <h3 className="font-bold text-gray-900 text-lg">האם אתה בטוח שברצונך לצאת?</h3>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl transition text-sm font-medium"
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
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex safe-area-inset-bottom">
        {bottomItems.map(item => (
          <BottomNavItem
            key={item.to}
            to={item.to}
            Icon={item.Icon}
            label={item.label}
          />
        ))}
      </nav>
    </>
  )
}
