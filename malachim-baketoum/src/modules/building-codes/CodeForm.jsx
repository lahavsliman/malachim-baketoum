import { useState } from 'react'
import { addCode, updateCode } from '../../firebase/buildingCodes'

const EMPTY = { city: '', street: '', buildingNumber: '', entrance: '', code: '', notes: '' }

const inp = 'bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 w-full'
const lbl = 'block text-xs text-gray-400 mb-1'

export default function CodeForm({ branchId, userId, userName, editCode, allowedCities = [], onSaved, onCancel }) {
  const [form, setForm] = useState(editCode ? {
    city: editCode.city || '',
    street: editCode.street || '',
    buildingNumber: editCode.buildingNumber || '',
    entrance: editCode.entrance || '',
    code: editCode.code || '',
    notes: editCode.notes || '',
  } : EMPTY)
  const [showCode, setShowCode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.city || !form.street || !form.buildingNumber || !form.code) {
      setError('נא למלא עיר, רחוב, מספר בניין וקוד')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (editCode) {
        await updateCode(editCode.id, editCode, form, userId, userName)
      } else {
        await addCode(branchId, form, userId, userName)
      }
      onSaved()
    } catch {
      setError('שגיאה בשמירה, נסה שנית')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onCancel()}>
      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl" dir="rtl">
        <h3 className="font-bold text-gray-200 text-lg mb-5">
          {editCode ? '✏️ עריכת קוד' : '➕ הוספת קוד חדש'}
        </h3>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* City — dropdown if allowedCities configured, else free text */}
          <div className="col-span-2">
            <label className={lbl}>עיר *</label>
            {allowedCities.length > 0 ? (
              <select value={form.city} onChange={e => set('city', e.target.value)} className={inp}>
                <option value="">בחר עיר</option>
                {allowedCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input value={form.city} onChange={e => set('city', e.target.value)} className={inp} placeholder="עיר" />
            )}
          </div>

          <div className="col-span-2">
            <label className={lbl}>רחוב *</label>
            <input value={form.street} onChange={e => set('street', e.target.value)} className={inp} placeholder="שם הרחוב" />
          </div>

          <div>
            <label className={lbl}>מספר בניין *</label>
            <input value={form.buildingNumber} onChange={e => set('buildingNumber', e.target.value)} className={inp} placeholder="מספר" />
          </div>

          <div>
            <label className={lbl}>כניסה</label>
            <input value={form.entrance} onChange={e => set('entrance', e.target.value)} className={inp} placeholder="א׳, ב׳..." />
          </div>

          {/* Code field with show/hide toggle */}
          <div className="col-span-2">
            <label className={lbl}>קוד גישה *</label>
            <div className="relative">
              <input
                type={showCode ? 'text' : 'password'}
                value={form.code}
                onChange={e => set('code', e.target.value)}
                className={inp + ' pl-16'}
                placeholder="הקלד קוד (ספרות, *, #)"
              />
              <button
                type="button"
                onClick={() => setShowCode(s => !s)}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300 transition px-1"
              >
                {showCode ? '🙈 הסתר' : '👁 הצג'}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label className={lbl}>הערות</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
            placeholder="הערות נוספות..."
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-3">{error}</p>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onCancel}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 py-2.5 rounded-xl transition">
            ביטול
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition">
            {loading ? 'שומר...' : editCode ? 'עדכן קוד' : 'הוסף קוד'}
          </button>
        </div>
      </form>
    </div>
  )
}
