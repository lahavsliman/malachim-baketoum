// Real-time single-input street search. Parent controls debounce via useEffect.
export default function CodeSearch({ query, onChange, loading }) {
  return (
    <div className="relative">
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg pointer-events-none">
        🔍
      </span>
      <input
        type="text"
        value={query}
        onChange={e => onChange(e.target.value)}
        placeholder="חיפוש לפי רחוב, עיר או מספר בניין..."
        className="w-full bg-gray-900 border border-gray-700 rounded-2xl py-3 px-4 pr-10 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 text-base transition"
        autoFocus
        dir="rtl"
      />
      {query && (
        <button
          onClick={() => onChange('')}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition text-xl leading-none"
          aria-label="נקה חיפוש"
        >
          ×
        </button>
      )}
      {loading && (
        <span className="absolute left-10 top-1/2 -translate-y-1/2 text-xs text-orange-400 animate-pulse">
          מחפש...
        </span>
      )}
    </div>
  )
}
