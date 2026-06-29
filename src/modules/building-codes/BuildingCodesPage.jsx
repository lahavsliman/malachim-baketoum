import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../hooks/useRole'
import { getBranchSettings } from '../../firebase/branches'
import { getAllBranchCodesWithCities } from '../../firebase/buildingCodes'
import CodeForm from './CodeForm'
import CodesTable from './CodesTable'
import LoadingSpinner from '../../shared/LoadingSpinner'
import BranchSelector from '../../shared/BranchSelector'
import { Lock, Key, Globe } from '@phosphor-icons/react'

const SORT_OPTIONS = [
  { value: 'street',    label: 'רחוב' },
  { value: 'city',      label: 'עיר' },
  { value: 'updatedAt', label: 'תאריך עדכון' },
]

export default function BuildingCodesPage() {
  const { user } = useAuth()
  const { branchId: userBranchId, canAccessBuildingCodes, isBranchHead, isSystemAdmin } = useRole()
  const [adminBranchId, setAdminBranchId] = useState(null)
  const branchId = isSystemAdmin ? adminBranchId : userBranchId

  const canDelete = isBranchHead || isSystemAdmin
  const userName  = user ? `${user.firstName} ${user.lastName}` : ''

  // ── Settings ──────────────────────────────────────────────────────────────
  const [allowedCities, setAllowedCities] = useState([])
  useEffect(() => {
    if (!branchId) return
    getBranchSettings(branchId)
      .then(s => setAllowedCities(s?.allowedCities ?? []))
      .catch(() => {})
  }, [branchId])

  // ── Codes ─────────────────────────────────────────────────────────────────
  const [allCodes, setAllCodes] = useState([])
  const [loading, setLoading] = useState(false)

  const loadAll = async () => {
    if (!branchId) return
    setLoading(true)
    try { setAllCodes(await getAllBranchCodesWithCities(branchId, allowedCities)) }
    catch { setAllCodes([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadAll() }, [branchId, allowedCities.join(',')])

  // ── Filter / sort ─────────────────────────────────────────────────────────
  const [query, setQuery]     = useState('')
  const [sortBy, setSortBy]   = useState('street')
  const [sortDir, setSortDir] = useState('asc')

  const filteredCodes = [...allCodes]
    .filter(c => {
      if (!query.trim()) return true
      // Split on whitespace so "תאנה 22" matches street + number simultaneously
      const parts = query.trim().toLowerCase().split(/\s+/)
      return parts.every(p =>
        c.street?.toLowerCase().includes(p) ||
        c.city?.toLowerCase().includes(p) ||
        String(c.buildingNumber || '').includes(p)
      )
    })
    .sort((a, b) => {
      const va = sortBy === 'updatedAt'
        ? (a.updatedAt?.toDate?.()?.getTime() ?? 0)
        : String(a[sortBy] ?? '').toLowerCase()
      const vb = sortBy === 'updatedAt'
        ? (b.updatedAt?.toDate?.()?.getTime() ?? 0)
        : String(b[sortBy] ?? '').toLowerCase()
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp
      if (sortBy === 'street') {
        return parseInt(a.buildingNumber || 0, 10) - parseInt(b.buildingNumber || 0, 10)
      }
      return 0
    })

  const toggleSort = field => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  // ── Add / Edit modal ──────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [editCode, setEditCode] = useState(null)

  const openAdd  = () => { setEditCode(null); setShowForm(true) }
  const openEdit = code => { setEditCode(code); setShowForm(true) }
  const handleSaved = () => { setShowForm(false); setEditCode(null); loadAll() }

  // ── Access gate ───────────────────────────────────────────────────────────
  if (!canAccessBuildingCodes) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64 text-center">
        <Lock size={48} className="mb-4 mx-auto text-gray-400" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">אין גישה</h2>
        <p className="text-gray-500">אין לך הרשאה לצפות בדף זה.</p>
        <p className="text-gray-500 text-sm mt-1">דף זה מיועד למוקדנים ומנהלי סניף בלבד.</p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto pb-20 lg:pb-0" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Key size={24} className="text-gray-600" /> קודי בניין
        </h1>
        <button
          onClick={openAdd}
          disabled={!branchId && !isSystemAdmin}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
        >
          + הוסף קוד
        </button>
      </div>

      {/* Branch selector — system_admin only */}
      <BranchSelector value={adminBranchId} onChange={setAdminBranchId} />

      {/* Empty state — admin hasn't selected a branch yet */}
      {isSystemAdmin && !branchId ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <Globe size={40} className="text-gray-300 mb-3 mx-auto" />
          <p className="text-gray-700 font-medium">בחר סניף כדי לצפות בקודי הבניין</p>
          <p className="text-gray-400 text-sm mt-1">או לחץ "הוסף קוד" לבחירת הסניף בתוך הטופס</p>
        </div>
      ) : branchId && (
        <div className="space-y-4">
          {/* Search + sort row */}
          <div className="flex flex-wrap gap-3 items-center">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="🔍 חיפוש לפי עיר, רחוב, מספר..."
              className="flex-1 min-w-48 bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-500 text-sm"
            />
            <div className="flex gap-1 bg-white p-1 rounded-xl border border-gray-200">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => toggleSort(opt.value)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1
                    ${sortBy === opt.value ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  {opt.label}
                  {sortBy === opt.value && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Result count */}
          {!loading && (
            <p className="text-sm text-gray-500">
              {query.trim()
                ? `${filteredCodes.length} תוצאות עבור "${query}"`
                : `${filteredCodes.length} קודים`}
            </p>
          )}

          {loading
            ? <div className="py-12 flex justify-center"><LoadingSpinner size="md" text="טוען..." /></div>
            : <CodesTable
                codes={filteredCodes}
                onEdit={openEdit}
                onRefresh={loadAll}
                canEdit={canAccessBuildingCodes}
                canDelete={canDelete}
              />
          }
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <CodeForm
          branchId={branchId}
          userId={user?.id}
          userName={userName}
          editCode={editCode}
          allowedCities={allowedCities}
          isSystemAdmin={isSystemAdmin}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditCode(null) }}
        />
      )}
    </div>
  )
}
