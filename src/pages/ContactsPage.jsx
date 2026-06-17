import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useRole } from '../hooks/useRole'
import { getBranchUsers } from '../firebase/users'
import LoadingSpinner from '../shared/LoadingSpinner'
import { Phone, WhatsappLogo, MagnifyingGlass, IdentificationCard, X } from '@phosphor-icons/react'

const ROLE_LABELS = {
  night_coordinator:      'רכז לילה',
  shabbat_coordinator:    'רכז שבת',
  dispatcher:             'מוקדן',
  events_coordinator:     'רכז גיבוש',
  transport_coordinator:  'רכז תחבורה',
  car_coordinator:        'רכז רכב',
  ambulance_coordinator:  'רכז אמבולנס',
  cohesion_coordinator:   'רכז גיבוש',
}

const ROLE_ORDER = [
  'transport_coordinator',
  'shabbat_coordinator',
  'car_coordinator',
  'ambulance_coordinator',
  'dispatcher',
  'events_coordinator',
  'night_coordinator',
  'cohesion_coordinator',
]

const telHref = (phone) => `tel:${(phone || '').replace(/[-\s]/g, '')}`
const waHref = (phone) => {
  let p = (phone || '').replace(/[-\s]/g, '')
  if (p.startsWith('0')) p = '972' + p.slice(1)
  return `https://wa.me/${p}`
}

const inp = 'bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-500 w-full text-sm'

function PhoneButtons({ phone, size = 'sm' }) {
  if (!phone) return null
  const btnBase = size === 'sm'
    ? 'inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition'
    : 'flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition'
  return (
    <div className="flex gap-2">
      <a
        href={telHref(phone)}
        className={`${btnBase} bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200`}
      >
        <Phone size={size === 'sm' ? 13 : 16} /> {size === 'lg' ? phone : 'התקשר'}
      </a>
      <a
        href={waHref(phone)}
        target="_blank"
        rel="noopener noreferrer"
        className={`${btnBase} bg-green-50 hover:bg-green-100 text-green-800 border border-green-200`}
      >
        <WhatsappLogo size={size === 'sm' ? 13 : 16} /> וואטסאפ
      </a>
    </div>
  )
}

export default function ContactsPage() {
  const { user } = useAuth()
  const { branchId } = useRole()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('roles')
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)

  useEffect(() => {
    if (!branchId) return
    setLoading(true)
    getBranchUsers(branchId)
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [branchId])

  // ── Tab 1: role holders ──────────────────────────────────────────────────

  const roleEntries = []

  // Branch head (always shown)
  users
    .filter(u => u.role === 'branch_head')
    .forEach(u => roleEntries.push({ person: u, roleType: 'branch_head', roleLabel: 'ראש סניף' }))

  // Branch deputy (always shown)
  users
    .filter(u => u.role === 'branch_deputy')
    .forEach(u => roleEntries.push({ person: u, roleType: 'branch_deputy', roleLabel: 'סגן ראש סניף' }))

  // Ordered role types
  ROLE_ORDER.forEach(roleType => {
    users
      .filter(u => {
        const hasRole = (u.roleTypes || []).includes(roleType) || u.roleType === roleType
        const visible = u.roleVisibility?.[roleType] !== false
        return hasRole && visible
      })
      .forEach(u => roleEntries.push({ person: u, roleType, roleLabel: ROLE_LABELS[roleType] || roleType }))
  })

  // ── Tab 2: phonebook ─────────────────────────────────────────────────────

  const q = search.trim().toLowerCase()
  const filteredUsers = users
    .filter(u => {
      if (!q) return true
      return (
        (u.firstName || '').toLowerCase().includes(q) ||
        (u.lastName  || '').toLowerCase().includes(q) ||
        (u.volunteerId || '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => (a.firstName || '').localeCompare(b.firstName || '', 'he'))

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto pb-20 lg:pb-0" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <IdentificationCard size={24} color="#F97316" weight="fill" />
        <h1 className="text-2xl font-black text-gray-900">אנשי קשר</h1>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setActiveTab('roles')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
            ${activeTab === 'roles' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          בעלי תפקידים
        </button>
        <button
          onClick={() => setActiveTab('phonebook')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition
            ${activeTab === 'phonebook' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          אלפון סניפי
        </button>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <LoadingSpinner size="lg" text="טוען אנשי קשר..." />
        </div>
      ) : (
        <>
          {/* ── Tab 1: role holders ── */}
          {activeTab === 'roles' && (
            <div className="space-y-3">
              {roleEntries.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
                  <p className="text-gray-500 font-medium">לא הוגדרו בעלי תפקידים</p>
                </div>
              ) : roleEntries.map(({ person, roleType, roleLabel }, i) => (
                <div key={`${roleType}-${person.id}-${i}`}
                  className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">{roleLabel}</p>
                    <p className="text-gray-800 font-semibold">{person.firstName} {person.lastName}</p>
                  </div>
                  <PhoneButtons phone={person.phone} size="sm" />
                </div>
              ))}
            </div>
          )}

          {/* ── Tab 2: phonebook ── */}
          {activeTab === 'phonebook' && (
            <>
              {/* Search */}
              <div className="relative mb-4">
                <MagnifyingGlass size={16} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="חיפוש לפי שם, שם משפחה או קוד כונן"
                  className={`${inp} pr-8`}
                />
              </div>

              {filteredUsers.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
                  <p className="text-gray-500 font-medium">לא נמצאו תוצאות</p>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  {filteredUsers.map((u, i) => (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      className={`w-full text-right px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition
                        ${i < filteredUsers.length - 1 ? 'border-b border-gray-100' : ''}`}
                    >
                      <div>
                        <p className="text-gray-800 font-medium">{u.firstName} {u.lastName}</p>
                        {u.volunteerId && (
                          <p className="text-xs text-gray-400 mt-0.5">קוד כונן: {u.volunteerId}</p>
                        )}
                      </div>
                      {u.phone && (
                        <Phone size={16} className="text-gray-300 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Phonebook detail modal */}
      {selectedUser && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setSelectedUser(null)}
        >
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl" dir="rtl">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  {selectedUser.firstName} {selectedUser.lastName}
                </h2>
                {selectedUser.volunteerId && (
                  <p className="text-xs text-gray-400 mt-0.5">קוד כונן: {selectedUser.volunteerId}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-gray-400 hover:text-gray-700 transition p-1"
              >
                <X size={20} />
              </button>
            </div>

            {selectedUser.phone ? (
              <PhoneButtons phone={selectedUser.phone} size="lg" />
            ) : (
              <p className="text-sm text-gray-400 text-center py-2">אין מספר טלפון</p>
            )}

            <button
              onClick={() => setSelectedUser(null)}
              className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl font-medium transition text-sm"
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
