import { useState, useEffect } from 'react'
import { useRole } from '../hooks/useRole'
import { getAllBranches } from '../firebase/branches'

/**
 * Branch selector dropdown for system_admin.
 * Renders nothing for non-admin users — they have their own branchId.
 *
 * Props:
 *   value     — currently selected branchId (or '' / null)
 *   onChange  — (branchId) => void
 *   className — extra wrapper classes
 *   label     — optional override for the wrapper title
 */
export default function BranchSelector({ value, onChange, className = '', label = 'בחר סניף' }) {
  const { isSystemAdmin } = useRole()
  const [branches, setBranches] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!isSystemAdmin) { setLoading(false); return }
    let alive = true
    getAllBranches()
      .then(list => {
        if (!alive) return
        // Active branches first, then alphabetically
        const sorted = list
          .filter(b => b)
          .sort((a, b) => {
            const aActive = a.isActive !== false
            const bActive = b.isActive !== false
            if (aActive !== bActive) return aActive ? -1 : 1
            return (a.name || '').localeCompare(b.name || '', 'he')
          })
        setBranches(sorted)
        setLoading(false)
      })
      .catch(() => alive && setLoading(false))
    return () => { alive = false }
  }, [isSystemAdmin])

  // Hidden for non-admins
  if (!isSystemAdmin) return null

  return (
    <div className={`bg-orange-500/5 border border-orange-500/30 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3 ${className}`} dir="rtl">
      <span className="text-orange-300 text-sm font-medium whitespace-nowrap">🌐 צפייה בסניף:</span>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={loading}
        className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
      >
        <option value="">{loading ? 'טוען סניפים...' : label}</option>
        {branches.map(b => (
          <option key={b.id} value={b.id}>
            {b.name}{b.isActive === false ? ' (לא פעיל)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
