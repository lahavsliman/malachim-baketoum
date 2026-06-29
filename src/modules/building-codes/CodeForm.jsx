import { useState } from 'react'
import { addCode, updateCode } from '../../firebase/buildingCodes'
import { PencilSimple, Plus } from '@phosphor-icons/react'

const EMPTY = { city: '', street: '', buildingNumber: '', entrance: '', code: '', notes: '' }

const inp = 'bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-500 w-full'
const lbl = 'block text-xs text-gray-500 mb-1'

export default function CodeForm({ branchId, userId, userName, editCode, allowedCities = [], isSystemAdmin, onSaved, onCancel }) {
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

  // When isSystemAdmin and no branchId — city is always free text (no allowedCities context)
  const showCityDropdown = allowedCities.length > 0 && !(!branchId && isSystemAdmin)

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
        await addCode(branchId ?? null, form, userId, userName)
      }
      onSaved()
    } catch (err) {
      setError(err?.message || 'שגיאה בשמירה, נסה שנית')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onCancel()}>
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl" dir="rtl">
        <h3 className="font-bold text-gray-800 text-lg mb-5">
          {editCode
            ? <><PencilSimple size={18} className="inline ml-1" /> עריכת קוד</>
            : <><Plus size={18} className="inline ml-1" /> הוספת קוד חדש</>
          }
        </h3>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* City — dropdown if allowedCities configured, else free text */}
          <div className="col-span-2">
            <label className={lbl}>עיר *</label>
            {showCityDropdown ? (
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
                className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 transition px-1"
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
            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-500 resize-none"
            placeholder="הערות נוספות..."
          />
        </div>

        {error && (
          <p className="text-red-800 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{error}</p>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onCancel}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl transition">
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
