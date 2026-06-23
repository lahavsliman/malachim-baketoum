import {
  House, Moon, Star, Buildings, UsersThree,
  ChatCircle, ChartBar, Sliders, Globe, Car, IdentificationCard,
} from '@phosphor-icons/react'
import { useRole } from './useRole'
import { useAuth } from '../context/AuthContext'

const hasPerm = (user, key) =>
  user?.permissions?.[key] === true || user?.[key] === true
const hasRoleType = (user, type) =>
  user?.roleTypes?.includes(type) || user?.roleType === type

export function useNavItems() {
  const { user } = useAuth()
  const {
    isSystemAdmin, isBranchHead, canManageBranch,
    canManageNightShifts, canManageShabbat, canManageTransport,
    isVehicleDriver, isAmbulanceDriver,
  } = useRole()

  const showNightShifts   = hasPerm(user, 'nightShifts') || canManageNightShifts
  const showShabbat       = hasPerm(user, 'shabbatVolunteer') || canManageShabbat
  const isDriver          = isVehicleDriver || isAmbulanceDriver
  const isDispatcher      = hasRoleType(user, 'dispatcher')
  const showBuildingCodes = isDispatcher || isBranchHead || isSystemAdmin

  return [
    { to: '/',                  Icon: House,              label: 'ראשי',          desc: '',                        always: true },
    { to: '/night-shifts',      Icon: Moon,               label: 'שיבוצי לילה',   desc: 'הרשמה ומעקב',             show: showNightShifts },
    { to: '/shabbat',           Icon: Star,               label: 'תורני שבת',     desc: 'דיווח זמינות',            show: showShabbat },
    { to: '/building-codes',    Icon: Buildings,          label: 'קודי בניין',    desc: 'חיפוש קודים',             show: showBuildingCodes },
    { to: '/transport',         Icon: Car,                label: 'ניהול תחבורה',  desc: 'משמרות נהגים',            show: canManageTransport },
    { to: '/my-transport',      Icon: Car,                label: 'התחבורה שלי',   desc: 'המשמרות שלי',             show: isDriver },
    { to: '/events',            Icon: UsersThree,         label: 'גיבושים',       desc: 'אירועים וגיבושים',        always: true },
    { to: '/contacts',          Icon: IdentificationCard, label: 'אנשי קשר',      desc: 'אלפון ובעלי תפקידים',     always: true },
    { to: '/messages',          Icon: ChatCircle,         label: 'הודעות',        desc: 'הודעות סניף',             always: true },
    { to: '/reports',           Icon: ChartBar,           label: 'דוחות',         desc: 'נתונים וסיכומים',         show: canManageBranch },
    { to: '/branch-management', Icon: Sliders,            label: 'ניהול סניף',    desc: 'הגדרות הסניף',            show: isBranchHead },
    { to: '/system-admin',      Icon: Globe,              label: 'כל הסניפים',    desc: 'ניהול מערכת',             show: isSystemAdmin },
  ].filter(item => item.always || item.show)
}
