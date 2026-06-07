import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useAuth } from '../../context/AuthContext'
import { useRole } from '../../hooks/useRole'
import { getBranchSettings } from '../../firebase/branches'
import { searchCodes, getAllBranchCodes, importCodes } from '../../firebase/buildingCodes'
import CodeSearch from './CodeSearch'
import CodeForm from './CodeForm'
import CodesTable from './CodesTable'
import LoadingSpinner from '../../shared/LoadingSpinner'
import BranchSelector from '../../shared/BranchSelector'

const EXPECTED_COLS = ['city', 'street', 'buildingNumber', 'entrance', 'code', 'notes']
const SORT_OPTIONS = [
  { value: 'street', label: 'רחוב' },
  { value: 'city', label: 'עיר' },
  { value: 'updatedAt', label: 'תאריך עדכון' },
]

export default function BuildingCodesPage() {
  const { user } = useAuth()
  const { branchId: userBranchId, canAccessBuildingCodes, isBranchHead, isSystemAdmin, isDispatcher } = useRole()
  const [adminBranchId, setAdminBranchId] = useState(null)
  const branchId = isSystemAdmin ? adminBranchId : userBranchId

  const canDelete  = isBranchHead || isSystemAdmin
  const canImport  = isBranchHead || isSystemAdmin
  const canAllTab  = isBranchHead || isSystemAdmin
  const userName   = user ? `${user.firstName} ${user.lastName}` : ''

  // ── Settings ──────────────────────────────────────────────────────────────
  const [allowedCities, setAllowedCities] = useState([])

  useEffect(() => {
    if (!branchId) return
    getBranchSettings(branchId)
      .then(s => setAllowedCities(s?.allowedCities ?? []))
      .catch(() => {})
  }, [branchId])

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('search')

  // ── Search tab ────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!branchId || query.length < 2) {
      setSearchResults([])
      setHasSearched(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      setHasSearched(true)
      try {
        setSearchResults(await searchCodes(branchId, query))
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, branchId])

  // ── Add / Edit modal ──────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [editCode, setEditCode] = useState(null)

  const openAdd  = () => { setEditCode(null); setShowForm(true) }
  const openEdit = code => { setEditCode(code); setShowForm(true) }
  const handleSaved = () => {
    setShowForm(false)
    setEditCode(null)
    // Refresh whatever tab is visible
    if (activeTab === 'search' && query.length >= 2) {
      searchCodes(branchId, query).then(setSearchResults)
    }
    if (activeTab === 'all') loadAll()
  }

  // ── All-codes tab ─────────────────────────────────────────────────────────
  const [allCodes, setAllCodes] = useState([])
  const [allLoading, setAllLoading] = useState(false)
  const [sortBy, setSortBy] = useState('street')
  const [sortDir, setSortDir] = useState('asc')
  const [allFilter, setAllFilter] = useState('')

  const loadAll = async () => {
    if (!branchId) return
    setAllLoading(true)
    try { setAllCodes(await getAllBranchCodes(branchId)) }
    finally { setAllLoading(false) }
  }

  useEffect(() => { if (activeTab === 'all') loadAll() }, [activeTab, branchId])

  const sortedCodes = [...allCodes]
    .filter(c => {
      if (!allFilter) return true
      const lc = allFilter.toLowerCase()
      return c.street?.toLowerCase().includes(lc) || c.city?.toLowerCase().includes(lc)
    })
    .sort((a, b) => {
      let va = sortBy === 'updatedAt'
        ? (a.updatedAt?.toDate?.()?.getTime() ?? 0)
        : String(a[sortBy] ?? '').toLowerCase()
      let vb = sortBy === 'updatedAt'
        ? (b.updatedAt?.toDate?.()?.getTime() ?? 0)
        : String(b[sortBy] ?? '').toLowerCase()
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  const exportExcel = () => {
    const data = sortedCodes.map(c => ({
      עיר: c.city, רחוב: c.street, 'מספר בניין': c.buildingNumber,
      כניסה: c.entrance || '', קוד: c.code, הערות: c.notes || '',
      'עדכון אחרון': c.updatedByName || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'קודי בניין')
    XLSX.writeFile(wb, `building-codes-${branchId}.xlsx`)
  }

  // ── Batch import tab ──────────────────────────────────────────────────────
  const [importPreview, setImportPreview] = useState(null)    // {headers, rows}
  const [importResults, setImportResults] = useState(null)    // [{ok,msg}]
  const [importing, setImporting] = useState(false)

  const handleImportFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()

    const process = (rows) => {
      const missing = ['city','street','buildingNumber','code'].filter(c => !rows[0] || !(c in rows[0]))
      if (missing.length) { alert(`עמודות חסרות: ${missing.join(', ')}`); return }
      const valid = rows.filter(r => r.city || r.street)
      setImportPreview({ rows: valid })
      setImportResults(null)
    }

    if (ext === 'csv') {
      const reader = new FileReader()
      reader.onload = ev => {
        const lines = ev.target.result.split('\n').filter(l => l.trim())
        const headers = lines[0].split(',').map(h => h.trim())
        const rows = lines.slice(1).map(line =>
          Object.fromEntries(headers.map((h, i) => [h, line.split(',')[i]?.trim() ?? '']))
        )
        process(rows)
      }
      reader.readAsText(file)
    } else {
      const reader = new FileReader()
      reader.onload = ev => {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        process(rows)
      }
      reader.readAsArrayBuffer(file)
    }
    e.target.value = ''
  }

  const handleConfirmImport = async () => {
    if (!importPreview) return
    setImporting(true)
    try {
      const results = await importCodes(branchId, importPreview.rows, user.id, userName)
      setImportResults(results)
      const ok = results.filter(r => r.ok).length
      if (ok > 0 && activeTab === 'all') loadAll()
    } finally { setImporting(false) }
  }

  // ── Access gate ───────────────────────────────────────────────────────────
  if (!canAccessBuildingCodes) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64 text-center">
        <span className="text-5xl mb-4">🔒</span>
        <h2 className="text-xl font-bold text-gray-200 mb-2">אין גישה</h2>
        <p className="text-gray-400">אין לך הרשאה לצפות בדף זה.</p>
        <p className="text-gray-500 text-sm mt-1">דף זה מיועד למוקדנים ומנהלי סניף בלבד.</p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-gray-100 flex items-center gap-2">🔑 קודי בניין</h1>
        <button
          onClick={openAdd}
          disabled={!branchId}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
        >
          + הוסף קוד
        </button>
      </div>

      {/* Branch selector — system_admin only */}
      <BranchSelector value={adminBranchId} onChange={setAdminBranchId} />

      {/* Empty state — admin hasn't selected a branch */}
      {isSystemAdmin && !branchId && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🌐</div>
          <p className="text-gray-300 font-medium">בחר סניף כדי לצפות בקודי הבניין</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-2xl border border-gray-800">
        <button onClick={() => setActiveTab('search')}
          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition
            ${activeTab === 'search' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
          🔍 חיפוש
        </button>
        {canImport && (
          <button onClick={() => setActiveTab('import')}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition
              ${activeTab === 'import' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
            ➕ הוספה מרובה
          </button>
        )}
        {canAllTab && (
          <button onClick={() => setActiveTab('all')}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition
              ${activeTab === 'all' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
            📊 כל הקודים
          </button>
        )}
      </div>

      {/* ══════════ TAB: SEARCH ══════════ */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <CodeSearch query={query} onChange={setQuery} loading={searchLoading} />

          {/* Hint / result count */}
          {!query && (
            <p className="text-center text-gray-500 text-sm py-4">הקלד לפחות 2 תווים לחיפוש</p>
          )}
          {query.length === 1 && (
            <p className="text-center text-gray-500 text-sm py-4">הקלד לפחות 2 תווים לחיפוש</p>
          )}
          {query.length >= 2 && !searchLoading && hasSearched && (
            <p className="text-sm text-gray-400">
              {searchResults.length > 0
                ? `נמצאו ${searchResults.length} תוצאות`
                : `לא נמצאו קודים לכתובת "${query}"`}
            </p>
          )}

          {searchLoading && (
            <div className="py-8 flex justify-center">
              <LoadingSpinner size="md" text="מחפש..." />
            </div>
          )}

          {!searchLoading && query.length >= 2 && (
            <CodesTable
              codes={searchResults}
              onEdit={openEdit}
              onRefresh={() => searchCodes(branchId, query).then(setSearchResults)}
              canEdit={canAccessBuildingCodes}
              canDelete={canDelete}
            />
          )}
        </div>
      )}

      {/* ══════════ TAB: BATCH IMPORT ══════════ */}
      {activeTab === 'import' && canImport && (
        <div className="space-y-5">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-sm text-blue-300">
            <p className="font-medium mb-1">עמודות נדרשות בקובץ:</p>
            <p className="font-mono text-xs text-blue-400">{EXPECTED_COLS.join(', ')}</p>
            <p className="mt-2 text-blue-400/70 text-xs">תומך בקבצי .csv ו-.xlsx</p>
          </div>

          {!importPreview && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-700 hover:border-orange-500/50 rounded-2xl p-10 cursor-pointer transition group">
              <span className="text-4xl mb-3 group-hover:scale-110 transition">📁</span>
              <p className="text-gray-300 font-medium">לחץ לבחירת קובץ</p>
              <p className="text-gray-500 text-sm mt-1">CSV או Excel</p>
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
            </label>
          )}

          {importPreview && (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
              <h3 className="font-bold text-gray-200 mb-3">
                תצוגה מקדימה — {importPreview.rows.length} רשומות
              </h3>
              <div className="overflow-x-auto max-h-72 mb-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {EXPECTED_COLS.map(h => (
                        <th key={h} className="text-right py-1 px-2 text-gray-400 border-b border-gray-700 whitespace-nowrap">{h}</th>
                      ))}
                      {importResults && <th className="text-right py-1 px-2 text-gray-400 border-b border-gray-700">תוצאה</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((row, i) => {
                      const res = importResults?.[i]
                      return (
                        <tr key={i} className={res ? (res.ok ? 'bg-green-500/10' : 'bg-red-500/10') : 'hover:bg-gray-800'}>
                          {EXPECTED_COLS.map(h => (
                            <td key={h} className="py-1 px-2 text-gray-300 border-b border-gray-800 whitespace-nowrap">{row[h] ?? ''}</td>
                          ))}
                          {res && (
                            <td className={`py-1 px-2 border-b border-gray-800 ${res.ok ? 'text-green-400' : 'text-red-400'}`}>
                              {res.ok ? '✅' : '❌'} {res.msg}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setImportPreview(null); setImportResults(null) }}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm transition"
                >
                  סגור
                </button>
                {!importResults && (
                  <button
                    onClick={handleConfirmImport}
                    disabled={importing}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition"
                  >
                    {importing ? 'מייבא...' : `✅ ייבא ${importPreview.rows.length} רשומות`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ TAB: ALL CODES ══════════ */}
      {activeTab === 'all' && canAllTab && (
        <div className="space-y-4">
          {/* Controls row */}
          <div className="flex flex-wrap gap-3 items-center">
            <input
              value={allFilter}
              onChange={e => setAllFilter(e.target.value)}
              placeholder="🔍 סינון לפי רחוב / עיר"
              className="flex-1 min-w-40 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 text-sm"
            />

            {/* Sort buttons */}
            <div className="flex gap-1 bg-gray-900 p-1 rounded-xl border border-gray-700">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => toggleSort(opt.value)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1
                    ${sortBy === opt.value ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  {opt.label}
                  {sortBy === opt.value && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              ))}
            </div>

            <button
              onClick={exportExcel}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-xl text-sm border border-gray-700 transition"
            >
              📊 Excel
            </button>
          </div>

          <p className="text-sm text-gray-400">{sortedCodes.length} קודים</p>

          {allLoading ? (
            <div className="py-12 flex justify-center"><LoadingSpinner size="md" text="טוען..." /></div>
          ) : (
            <CodesTable
              codes={sortedCodes}
              onEdit={openEdit}
              onRefresh={loadAll}
              canEdit={canAccessBuildingCodes}
              canDelete={canDelete}
            />
          )}
        </div>
      )}

      {/* ══════════ Add/Edit Modal ══════════ */}
      {showForm && (
        <CodeForm
          branchId={branchId}
          userId={user?.id}
          userName={userName}
          editCode={editCode}
          allowedCities={allowedCities}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditCode(null) }}
        />
      )}
    </div>
  )
}
