import { useState } from 'react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { secondaryAuth } from '../firebase/config'
import { idToEmail } from '../firebase/auth'
import { createUser } from '../firebase/users'
import CitySelector from './CitySelector'

/**
 * Modal for adding a branch_deputy to an existing branch.
 *
 * Props:
 *   branchId — the branch the deputy belongs to (required)
 *   onClose  — called on cancel
 *   onSuccess(deputyData) — called after successful creation; receiver should refresh data
 */
export default function AddDeputyModal({ branchId, onClose, onSuccess }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', idNumber: '', volunteerId: '', phone: '', city: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const inp = 'bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 w-full text-sm'
  const lbl = 'block text-xs text-gray-400 mb-1'

  const validate = () => {
    if (!form.firstName.trim()) return 'שם פרטי הוא שדה חובה'
    if (!form.lastName.trim())  return 'שם משפחה הוא שדה חובה'
    if (!form.idNumber.trim() || !/^\d+$/.test(form.idNumber.trim())) return 'תעודת זהות — ספרות בלבד'
    if (!form.volunteerId.trim() || !/^\d{2,5}$/.test(form.volunteerId.trim())) return 'קוד כונן — 2-5 ספרות'
    if (form.phone.trim() && !/^0\d{8,9}$/.test(form.phone.replace(/[-\s]/g, ''))) return 'מספר טלפון לא תקין'
    return null
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setSaving(true); setError('')
    try {
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        idToEmail(form.idNumber.trim()),
        form.volunteerId.trim().padStart(6, '0')
      )
      await secondaryAuth.signOut()
      await createUser(cred.user.uid, {
        firstName:   form.firstName.trim(),
        lastName:    form.lastName.trim(),
        idNumber:    form.idNumber.trim(),
        volunteerId: form.volunteerId.trim(),
        phone:       form.phone.trim(),
        city:        form.city,
        branchId,
        role:        'branch_deputy',
        roleTypes:   [],
        permissions: { nightShifts: true, shabbatVolunteer: false, vehicleDriver: false, ambulanceDriver: false },
        isActive:    true,
      })
      onSuccess && onSuccess()
    } catch (err) {
      setError(err.code === 'auth/email-already-in-use' ? 'ת.ז. כבר קיימת במערכת' : (err.message || 'שגיאה ביצירת הסגן'))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto" dir="rtl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-100 text-lg">➕ הוספת סגן ראש סניף</h3>
          {!saving && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition text-xl leading-none">✕</button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>שם פרטי *</label>
              <input value={form.firstName} onChange={e => setF('firstName', e.target.value)} className={inp} /></div>
            <div><label className={lbl}>שם משפחה *</label>
              <input value={form.lastName} onChange={e => setF('lastName', e.target.value)} className={inp} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>תעודת זהות *</label>
              <input value={form.idNumber} onChange={e => setF('idNumber', e.target.value.replace(/\D/g, ''))}
                className={inp} placeholder="ספרות בלבד" inputMode="numeric" /></div>
            <div><label className={lbl}>קוד כונן *</label>
              <input value={form.volunteerId} onChange={e => setF('volunteerId', e.target.value.replace(/\D/g, ''))}
                className={inp} placeholder="2-5 ספרות" inputMode="numeric" maxLength={5} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>טלפון</label>
              <input value={form.phone} onChange={e => setF('phone', e.target.value)}
                className={inp} placeholder="05XXXXXXXX" inputMode="tel" dir="ltr" /></div>
            <div><label className={lbl}>עיר</label>
              <CitySelector value={form.city} onChange={v => setF('city', v)} placeholder="בחר עיר" /></div>
          </div>

          {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 py-2.5 rounded-xl transition text-sm">ביטול</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition text-sm">
              {saving ? 'יוצר...' : '✅ צור סגן'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
