import { useState, useEffect, useRef, useMemo } from 'react'
import { getCities } from '../firebase/cities'

/**
 * Searchable city selector.
 *
 * Props:
 *   value       — string (single mode) or string[] (multiple mode)
 *   onChange    — (newValue) => void
 *   placeholder — input placeholder
 *   multiple    — boolean, default false
 *   className   — wrapper className override
 *   disabled    — boolean
 */
export default function CitySelector({
  value,
  onChange,
  placeholder = 'בחר עיר',
  multiple = false,
  className = '',
  disabled = false,
}) {
  const [allCities, setAllCities] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  // Load cities once
  useEffect(() => {
    let alive = true
    getCities()
      .then(list => { if (alive) { setAllCities(list); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Selected items as array for uniform handling
  const selected = useMemo(() => {
    if (multiple) return Array.isArray(value) ? value : []
    return value ? [value] : []
  }, [value, multiple])

  // Filter cities based on query — min 1 char as per spec, but allow empty
  // to show full list when input is focused
  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return allCities.slice(0, 100)  // cap initial list for perf
    return allCities.filter(c => c.includes(q)).slice(0, 100)
  }, [query, allCities])

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleSelect = (city) => {
    if (multiple) {
      if (selected.includes(city)) {
        onChange(selected.filter(c => c !== city))
      } else {
        onChange([...selected, city])
      }
      setQuery('')
    } else {
      onChange(city)
      setQuery('')
      setOpen(false)
    }
  }

  const removeChip = (city) => {
    if (multiple) onChange(selected.filter(c => c !== city))
    else onChange('')
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const inputClass = `w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-500 text-sm`

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* Multi-select: chips above input */}
      {multiple && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(c => (
            <span key={c}
              className="inline-flex items-center gap-1 bg-orange-500/20 text-orange-200 text-xs px-2 py-1 rounded-lg">
              {c}
              <button type="button" onClick={() => removeChip(c)}
                className="text-orange-300 hover:text-white transition" disabled={disabled}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Single-select with value: show selected + clear, hide input */}
      {!multiple && value && !open ? (
        <div className={`${inputClass} flex items-center justify-between cursor-pointer`}
          onClick={() => !disabled && setOpen(true)}>
          <span className="text-gray-800">{value}</span>
          <button type="button"
            onClick={e => { e.stopPropagation(); removeChip(value) }}
            className="text-gray-500 hover:text-gray-700 transition text-xs"
            disabled={disabled}>✕</button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          disabled={disabled || loading}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          placeholder={loading ? 'טוען ערים...' : placeholder}
          className={inputClass}
        />
      )}

      {/* Dropdown */}
      {open && !loading && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-500 text-center">לא נמצאה עיר</div>
          ) : (
            filtered.map(city => {
              const isSelected = selected.includes(city)
              return (
                <button key={city} type="button"
                  onClick={() => handleSelect(city)}
                  className={`w-full text-right px-3 py-2 text-sm transition flex items-center justify-between
                    ${isSelected ? 'bg-orange-500/20 text-orange-200' : 'text-gray-700 hover:bg-gray-100'}`}>
                  <span>{city}</span>
                  {isSelected && <span className="text-orange-400">✓</span>}
                </button>
              )
            })
          )}
          {allCities.length > 100 && !query && (
            <div className="px-3 py-2 text-xs text-gray-500 text-center border-t border-gray-200">
              מציג 100 מתוך {allCities.length} — הקלד לסינון
            </div>
          )}
        </div>
      )}
    </div>
  )
}
