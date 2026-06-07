import { useState, useEffect } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc, writeBatch, Timestamp } from 'firebase/firestore'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { db, secondaryAuth } from '../firebase/config'
import { idToEmail } from '../firebase/auth'
import { getAllUsers, createUser, updateUser, changeUserIdNumber, deleteUserDoc } from '../firebase/users'
import { getBranchSettings, updateBranchSettings } from '../firebase/branches'
import { getAllBranchCodes, addCode, deleteCode } from '../firebase/buildingCodes'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getDaysInMonth } from 'date-fns'
import { getMonthShifts } from '../firebase/nightShifts'
import { getBranchMonthShabbatShifts } from '../firebase/shabbatShifts'
import LoadingSpinner from '../shared/LoadingSpinner'
import CitySelector from '../shared/CitySelector'
import AddDeputyModal from '../shared/AddDeputyModal'
import CodeForm from '../modules/building-codes/CodeForm'
import { useAuth } from '../context/AuthContext'

// ── Constants ──────────────────────────────────────────────────────────────────
const ROLES = [
  { value: 'volunteer',      label: 'מתנדב' },
  { value: 'role_holder',    label: 'בעל תפקיד' },
  { value: 'branch_deputy',  label: 'סגן ראש סניף' },
  { value: 'branch_head',    label: 'ראש סניף' },
  { value: 'system_admin',   label: 'מנהל מערכת' },
]

const ROLE_TYPES = [
  { value: 'night_coordinator',   label: 'רכז לילה' },
  { value: 'shabbat_coordinator', label: 'רכז שבת' },
  { value: 'dispatcher',          label: 'מוקדן' },
  { value: 'car_coordinator',     label: 'רכז רכב' },
  { value: 'cohesion_coordinator',label: 'רכז גיבוש' },
]

const EMPTY_USER_FORM = {
  firstName: '', lastName: '', idNumber: '', volunteerId: '',
  phone: '', city: '', gender: '', team: '', branchId: '',
  role: 'volunteer', roleTypes: [],
  permissions: { nightShifts: true, shabbatVolunteer: false, vehicleDriver: false, ambulanceDriver: false },
  isActive: true,
}

const DEFAULT_SETTINGS = {
  nightShifts: { startTime: '00:00', endTime: '06:00', maxPerNight: 1, blockFriday: false, maxPerMonth: 3, openOnDay: 20 },
  shabbat: { areas: [], maxPerMonth: 2, closingDay: 'thursday', closingTime: '12:00' },
  allowedCities: [],
}

// ── Shared style tokens ────────────────────────────────────────────────────────
const inp = 'bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 w-full text-sm'
const lbl = 'block text-xs text-gray-400 mb-1'

// ── Toast helper ───────────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl text-sm font-medium pointer-events-none
      ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
      {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
    </div>
  )
}

// ── User Edit Modal ────────────────────────────────────────────────────────────
function UserModal({ editUser, branches, onSave, onClose, isNew = false }) {
  const [form, setForm] = useState(
    editUser
      ? {
          firstName:   editUser.firstName   || '',
          lastName:    editUser.lastName    || '',
          idNumber:    editUser.idNumber    || '',
          volunteerId: editUser.volunteerId || '',
          phone:       editUser.phone       || '',
          city:        editUser.city        || '',
          gender:      editUser.gender      || '',
          team:        editUser.team        || '',
          branchId:    editUser.branchId    || '',
          role:        editUser.role        || 'volunteer',
          roleTypes:   editUser.roleTypes   || [],
          permissions: {
            nightShifts:      editUser.permissions?.nightShifts      ?? editUser.nightShifts      ?? false,
            shabbatVolunteer: editUser.permissions?.shabbatVolunteer ?? editUser.shabbatVolunteer ?? false,
            vehicleDriver:    editUser.permissions?.vehicleDriver    ?? false,
            ambulanceDriver:  editUser.permissions?.ambulanceDriver  ?? false,
          },
          isActive: editUser.isActive !== false,
        }
      : { ...EMPTY_USER_FORM }
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setPerm = (k, v) => setForm(f => ({ ...f, permissions: { ...f.permissions, [k]: v } }))
  const toggleRole = val => setForm(f => ({
    ...f,
    roleTypes: f.roleTypes.includes(val) ? f.roleTypes.filter(r => r !== val) : [...f.roleTypes, val],
  }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.firstName.trim() || !form.lastName.trim()) { setError('שם פרטי ושם משפחה הם שדות חובה'); return }
    if (isNew && !form.idNumber.trim()) { setError('תעודת זהות היא שדה חובה'); return }
    if (isNew && !form.volunteerId.trim()) { setError('קוד כונן הוא שדה חובה'); return }
    setSaving(true); setError('')
    try {
      await onSave(form, editUser?.id)
    } catch (err) {
      setError(err.message || 'שגיאה בשמירה')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto" dir="rtl">
        <h3 className="font-bold text-gray-200 text-lg mb-5">
          {isNew ? '➕ הוספת משתמש' : `✏️ עריכת ${editUser?.firstName} ${editUser?.lastName}`}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>שם פרטי *</label>
              <input value={form.firstName} onChange={e => setF('firstName', e.target.value)} className={inp} /></div>
            <div><label className={lbl}>שם משפחה *</label>
              <input value={form.lastName} onChange={e => setF('lastName', e.target.value)} className={inp} /></div>
          </div>

          {/* ID + volunteerId */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>תעודת זהות {isNew && '*'}</label>
              <input value={form.idNumber} onChange={e => setF('idNumber', e.target.value.replace(/\D/g, ''))}
                className={inp} placeholder="ספרות בלבד" />
              {!isNew && (
                <p className="text-xs text-gray-500 mt-1">שינוי ת.ז. יעדכן גם את אימייל הכניסה</p>
              )}
            </div>
            <div>
              <label className={lbl}>קוד כונן {isNew && '*'}</label>
              <input value={form.volunteerId} onChange={e => setF('volunteerId', e.target.value.replace(/\D/g, ''))}
                className={inp} placeholder="מספר כונן" readOnly={!isNew}
                style={!isNew ? { opacity: 0.5 } : {}} />
            </div>
          </div>

          {/* Phone + city */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>טלפון</label>
              <input value={form.phone} onChange={e => setF('phone', e.target.value)} className={inp} dir="ltr" /></div>
            <div><label className={lbl}>עיר</label>
              <CitySelector value={form.city} onChange={v => setF('city', v)} placeholder="בחר עיר" /></div>
          </div>

          {/* Gender + Team */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>מגדר</label>
              <select value={form.gender} onChange={e => setF('gender', e.target.value)} className={inp}>
                <option value="">— לא צוין —</option>
                <option value="male">זכר</option>
                <option value="female">נקבה</option>
              </select>
            </div>
            <div>
              <label className={lbl}>צוות</label>
              <input value={form.team} onChange={e => setF('team', e.target.value)} className={inp} placeholder="שם הצוות" />
            </div>
          </div>

          {/* Branch + Role */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>סניף</label>
              <select value={form.branchId} onChange={e => setF('branchId', e.target.value)} className={inp}>
                <option value="">— ללא סניף —</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>תפקיד</label>
              <select value={form.role} onChange={e => setF('role', e.target.value)} className={inp}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {/* Role types */}
          <div>
            <p className={lbl}>סוגי תפקידים</p>
            <div className="flex flex-wrap gap-2">
              {ROLE_TYPES.map(r => (
                <button key={r.value} type="button" onClick={() => toggleRole(r.value)}
                  className={`px-3 py-1 rounded-xl text-xs font-medium transition
                    ${form.roleTypes.includes(r.value) ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Permissions */}
          <div>
            <p className={lbl}>הרשאות</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['nightShifts','תורנות לילה'],
                ['shabbatVolunteer','תורן שבת'],
                ['vehicleDriver','נהג רכב'],
                ['ambulanceDriver','נהג אמבולנס'],
              ].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer bg-gray-800 px-3 py-2 rounded-xl">
                  <input type="checkbox" checked={!!form.permissions[k]} onChange={e => setPerm(k, e.target.checked)} className="w-4 h-4 accent-orange-500" />
                  <span className="text-gray-300 text-sm">{l}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Active */}
          <label className="flex items-center gap-3 cursor-pointer">
            <button type="button" onClick={() => setF('isActive', !form.isActive)}
              className={`relative w-12 h-6 rounded-full transition-colors ${form.isActive ? 'bg-orange-500' : 'bg-gray-700'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${form.isActive ? 'right-0.5' : 'left-0.5'}`} />
            </button>
            <span className="text-gray-300 text-sm">{form.isActive ? 'פעיל' : 'לא פעיל'}</span>
          </label>

          {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 py-2.5 rounded-xl transition text-sm">ביטול</button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition text-sm">
              {saving ? 'שומר...' : isNew ? 'הוסף' : 'עדכן'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Branch Detail View ─────────────────────────────────────────────────────────
function BranchDetail({ branch, allUsers, branches, onBack, showToast, onDataChange }) {
  const { user } = useAuth()
  const userName = user ? `${user.firstName} ${user.lastName}` : ''

  const branchUsers = allUsers
    .filter(u => u.branchId === branch.id)
    .sort((a, b) => (a.firstName || '').localeCompare(b.firstName || '', 'he'))

  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [editUser, setEditUser]         = useState(null)
  const [showAdd, setShowAdd]           = useState(false)
  const [showAddDeputy, setShowAddDeputy] = useState(false)

  // Branch settings state
  const [settings, setSettings]           = useState(DEFAULT_SETTINGS)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [savingSettings, setSavingSettings]   = useState(false)
  const [settingsTab, setSettingsTab]         = useState('volunteers') // volunteers | codes | settings

  // Building codes state
  const [codes, setCodes]           = useState([])
  const [codesLoading, setCodesLoading] = useState(false)
  const [showAddCode, setShowAddCode]   = useState(false)

  useEffect(() => {
    getBranchSettings(branch.id).then(s => {
      if (s) setSettings({
        ...DEFAULT_SETTINGS, ...s,
        nightShifts: { ...DEFAULT_SETTINGS.nightShifts, ...(s.nightShifts || {}) },
        shabbat:     { ...DEFAULT_SETTINGS.shabbat,     ...(s.shabbat     || {}) },
        allowedCities: s.allowedCities || [],
      })
      setSettingsLoading(false)
    })
  }, [branch.id])

  useEffect(() => {
    if (settingsTab !== 'codes') return
    setCodesLoading(true)
    getAllBranchCodes(branch.id).then(setCodes).finally(() => setCodesLoading(false))
  }, [settingsTab, branch.id])

  const handleDeleteCode = async (codeId) => {
    if (!window.confirm('למחוק קוד זה לצמיתות?')) return
    try {
      await deleteCode(codeId)
      setCodes(c => c.filter(x => x.id !== codeId))
      showToast('success', 'הקוד נמחק')
    } catch {
      showToast('error', 'שגיאה במחיקה')
    }
  }

  const filtered = branchUsers.filter(v => {
    const name = `${v.firstName || ''} ${v.lastName || ''}`.toLowerCase()
    const vid  = String(v.volunteerId || '').toLowerCase()
    if (search && !name.includes(search.toLowerCase()) && !vid.includes(search.toLowerCase())) return false
    if (statusFilter === 'active'   && v.isActive === false) return false
    if (statusFilter === 'inactive' && v.isActive !== false) return false
    return true
  })

  const handleSaveUser = async (form, uid) => {
    // If the idNumber changed, update Firebase Auth email first
    const existing = allUsers.find(u => u.id === uid)
    const oldId = existing?.idNumber
    const newId = form.idNumber.trim()
    if (existing && oldId && newId && oldId !== newId) {
      await changeUserIdNumber(uid, oldId, newId, existing.volunteerId)
    }

    const data = {
      firstName: form.firstName.trim(), lastName: form.lastName.trim(),
      phone: form.phone.trim(), city: form.city.trim(),
      gender: form.gender || '', team: (form.team || '').trim(),
      idNumber: newId,
      branchId: form.branchId || null,
      role: form.role, roleTypes: form.roleTypes,
      permissions: form.permissions, isActive: form.isActive,
    }
    await updateUser(uid, data)
    showToast('success', 'המתנדב עודכן')
    setEditUser(null)
    onDataChange()
  }

  const handleAddUser = async (form) => {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, idToEmail(form.idNumber.trim()), form.volunteerId.trim().padStart(6, '0'))
    await secondaryAuth.signOut()
    await createUser(cred.user.uid, {
      firstName: form.firstName.trim(), lastName: form.lastName.trim(),
      idNumber: form.idNumber.trim(), volunteerId: form.volunteerId.trim(),
      phone: form.phone.trim(), city: form.city.trim(),
      branchId: branch.id,
      role: form.role, roleTypes: form.roleTypes,
      permissions: form.permissions, isActive: true,
    })
    showToast('success', 'המתנדב נוסף')
    setShowAdd(false)
    onDataChange()
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await updateBranchSettings(branch.id, settings)
      showToast('success', 'הגדרות נשמרו')
    } catch { showToast('error', 'שגיאה בשמירת הגדרות') }
    finally { setSavingSettings(false) }
  }

  const setNS = (k, v) => setSettings(s => ({ ...s, nightShifts: { ...s.nightShifts, [k]: v } }))

  const head = branchUsers.find(u => u.role === 'branch_head')

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-200 transition p-1.5 rounded-lg hover:bg-gray-800">← חזרה</button>
        <div>
          <h2 className="text-xl font-black text-gray-100">{branch.name}</h2>
          <p className="text-sm text-gray-400">{branchUsers.length} מתנדבים{head ? ` · ראש סניף: ${head.firstName} ${head.lastName}` : ''}</p>
        </div>
        <span className={`mr-auto text-xs px-2.5 py-1 rounded-full ${branch.isActive !== false ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
          {branch.isActive !== false ? 'פעיל' : 'לא פעיל'}
        </span>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5 bg-gray-900 p-1 rounded-2xl border border-gray-800">
        {[['volunteers','👥 מתנדבים'], ['codes','🔑 קודי בניין'], ['settings','⚙️ הגדרות']].map(([t, l]) => (
          <button key={t} onClick={() => setSettingsTab(t)}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition
              ${settingsTab === t ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Volunteers tab */}
      {settingsTab === 'volunteers' && (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <input placeholder="🔍 חיפוש שם / קוד כונן" value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-40 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500" />
            <div className="flex gap-1 bg-gray-900 border border-gray-700 p-1 rounded-xl">
              {[['active','פעילים'],['inactive','לא פעילים'],['all','הכל']].map(([v,l]) => (
                <button key={v} onClick={() => setStatusFilter(v)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition
                    ${statusFilter === v ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}>{l}</button>
              ))}
            </div>
            <button onClick={() => setShowAddDeputy(true)}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-orange-300 px-4 py-2 rounded-xl text-sm font-medium transition">
              + הוסף סגן
            </button>
            <button onClick={() => setShowAdd(true)}
              className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
              + הוסף מתנדב
            </button>
          </div>

          <p className="text-xs text-gray-500 mb-2">{filtered.length} מתנדבים</p>
          <div className="overflow-x-auto rounded-2xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900">
                  {['שם מלא','קוד כונן','טלפון','תפקיד','הרשאות','סטטוס',''].map((h, i) => (
                    <th key={i} className="text-right py-2.5 px-3 text-gray-400 font-medium text-xs whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-500">לא נמצאו מתנדבים</td></tr>
                ) : filtered.map(v => {
                  const p = v.permissions || {}
                  const perms = [
                    (p.nightShifts || v.nightShifts) && 'לילה',
                    (p.shabbatVolunteer || v.shabbatVolunteer) && 'שבת',
                    p.vehicleDriver && 'רכב', p.ambulanceDriver && 'אמבולנס',
                  ].filter(Boolean)
                  return (
                    <tr key={v.id} className="border-b border-gray-800">
                      <td className="py-2.5 px-3 text-gray-200 font-medium whitespace-nowrap">{v.firstName} {v.lastName}</td>
                      <td className="py-2.5 px-3 text-gray-300 font-mono text-xs">{v.volunteerId}</td>
                      <td className="py-2.5 px-3 text-gray-400 text-xs" dir="ltr">{v.phone || '—'}</td>
                      <td className="py-2.5 px-3 text-gray-400 text-xs">{ROLES.find(r => r.value === v.role)?.label || v.role || '—'}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {perms.length === 0 ? <span className="text-gray-600 text-xs">—</span> : perms.map(b => (
                            <span key={b} className="text-xs bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded">{b}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${v.isActive !== false ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                          {v.isActive !== false ? 'פעיל' : 'לא פעיל'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <button onClick={() => setEditUser(v)}
                          className="text-xs text-orange-400 hover:text-orange-300 transition">✏️ ערוך</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Building codes tab */}
      {settingsTab === 'codes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-gray-400 text-sm">{codes.length} קודים</p>
            <button onClick={() => setShowAddCode(true)}
              className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
              + הוסף קוד
            </button>
          </div>

          {codesLoading ? (
            <div className="py-12 flex justify-center"><LoadingSpinner size="md" text="טוען..." /></div>
          ) : codes.length === 0 ? (
            <div className="py-10 text-center text-gray-500">אין קודי בניין לסניף זה</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-900">
                    {['עיר','רחוב','מספר','כניסה','קוד','הערות',''].map((h, i) => (
                      <th key={i} className="text-right py-2.5 px-3 text-gray-400 font-medium text-xs whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {codes.map(c => (
                    <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-900/50 transition">
                      <td className="py-2.5 px-3 text-gray-300 text-xs">{c.city || '—'}</td>
                      <td className="py-2.5 px-3 text-gray-200 text-xs">{c.street || '—'}</td>
                      <td className="py-2.5 px-3 text-gray-300 text-xs">{c.buildingNumber || '—'}</td>
                      <td className="py-2.5 px-3 text-gray-300 text-xs">{c.entrance || '—'}</td>
                      <td className="py-2.5 px-3 font-mono text-orange-300 text-xs">{c.code || '—'}</td>
                      <td className="py-2.5 px-3 text-gray-400 text-xs max-w-32 truncate">{c.notes || '—'}</td>
                      <td className="py-2.5 px-3">
                        <button onClick={() => handleDeleteCode(c.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition">🗑 מחק</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Settings tab */}
      {settingsTab === 'settings' && (
        settingsLoading
          ? <div className="py-16 flex justify-center"><LoadingSpinner size="lg" text="טוען הגדרות..." /></div>
          : (
            <div className="space-y-5 max-w-lg">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
                <h3 className="font-bold text-gray-200 mb-4">🌙 הגדרות תורנות לילה</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={lbl}>שעת התחלה</label>
                      <input type="time" value={settings.nightShifts.startTime} onChange={e => setNS('startTime', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>שעת סיום</label>
                      <input type="time" value={settings.nightShifts.endTime} onChange={e => setNS('endTime', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>מקס׳ כוננים ללילה</label>
                      <input type="number" min={1} value={settings.nightShifts.maxPerNight} onChange={e => setNS('maxPerNight', Number(e.target.value))} className={inp} /></div>
                    <div><label className={lbl}>מקס׳ שיבוצים לחודש</label>
                      <input type="number" min={1} value={settings.nightShifts.maxPerMonth} onChange={e => setNS('maxPerMonth', Number(e.target.value))} className={inp} /></div>
                    <div><label className={lbl}>פתיחת הרשמה (יום בחודש)</label>
                      <input type="number" min={1} max={28} value={settings.nightShifts.openOnDay} onChange={e => setNS('openOnDay', Number(e.target.value))} className={inp} /></div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={settings.nightShifts.blockFriday} onChange={e => setNS('blockFriday', e.target.checked)} className="w-4 h-4 accent-orange-500" />
                    <span className="text-gray-300 text-sm">חסום יום שישי</span>
                  </label>
                </div>
              </div>
              <button onClick={handleSaveSettings} disabled={savingSettings}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-3 rounded-2xl transition">
                {savingSettings ? 'שומר...' : '💾 שמור הגדרות'}
              </button>
            </div>
          )
      )}

      {/* Modals */}
      {editUser && (
        <UserModal editUser={editUser} branches={branches}
          onSave={handleSaveUser} onClose={() => setEditUser(null)} />
      )}
      {showAdd && (
        <UserModal isNew branches={branches}
          onSave={(form) => handleAddUser(form)} onClose={() => setShowAdd(false)} />
      )}
      {showAddDeputy && (
        <AddDeputyModal
          branchId={branch.id}
          onClose={() => setShowAddDeputy(false)}
          onSuccess={() => { setShowAddDeputy(false); showToast('success', 'הסגן נוסף בהצלחה'); onDataChange() }}
        />
      )}
      {showAddCode && (
        <CodeForm
          branchId={branch.id}
          userId={user?.id}
          userName={userName}
          editCode={null}
          allowedCities={settings.allowedCities || []}
          onSaved={() => {
            setShowAddCode(false)
            getAllBranchCodes(branch.id).then(setCodes)
            showToast('success', 'הקוד נוסף')
          }}
          onCancel={() => setShowAddCode(false)}
        />
      )}
    </div>
  )
}

// ── New Branch Wizard (3 steps) ────────────────────────────────────────────────
function NewBranchWizard({ onClose, onComplete, showToast }) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Step 1 — branch info
  const [branch, setBranch] = useState({ name: '', allowedCities: [] })

  // Step 2 — branch head (required)
  const [head, setHead] = useState({
    firstName: '', lastName: '', idNumber: '', volunteerId: '', phone: '', city: '',
  })

  // Step 3 — deputy (optional)
  const [deputy, setDeputy] = useState({
    firstName: '', lastName: '', idNumber: '', volunteerId: '', phone: '', city: '',
  })
  const [includeDeputy, setIncludeDeputy] = useState(false)

  // ── Validation per step ──────────────────────────────────────────────────
  const validateStep1 = () => {
    if (!branch.name.trim()) return 'שם הסניף הוא שדה חובה'
    return null
  }
  const validateUser = (u, who) => {
    if (!u.firstName.trim())                       return `שם פרטי ${who} הוא שדה חובה`
    if (!u.lastName.trim())                        return `שם משפחה ${who} הוא שדה חובה`
    if (!u.idNumber.trim() || !/^\d+$/.test(u.idNumber.trim())) return `תעודת זהות ${who} — ספרות בלבד`
    if (!u.volunteerId.trim() || !/^\d{2,5}$/.test(u.volunteerId.trim())) return `קוד כונן ${who} — 2-5 ספרות`
    if (u.phone.trim() && !/^0\d{8,9}$/.test(u.phone.replace(/[-\s]/g, ''))) return `מספר טלפון ${who} לא תקין`
    return null
  }

  const next = () => {
    setError('')
    if (step === 1) { const e = validateStep1();           if (e) return setError(e) }
    if (step === 2) { const e = validateUser(head, 'ראש הסניף'); if (e) return setError(e) }
    setStep(s => s + 1)
  }

  const back = () => { setError(''); setStep(s => s - 1) }

  // ── Finish — create branch + users ───────────────────────────────────────
  const finish = async (withDeputy) => {
    setError('')
    if (withDeputy) {
      const e = validateUser(deputy, 'סגן ראש הסניף')
      if (e) return setError(e)
    }
    setSubmitting(true)
    try {
      // 1. Create branch document
      const branchRef = await addDoc(collection(db, 'branches'), {
        name:     branch.name.trim(),
        isActive: true,
        createdAt: Timestamp.now(),
        settings: {
          nightShifts: { startTime: '00:00', endTime: '06:00', maxPerNight: 1, blockFriday: false, maxPerMonth: 3, openOnDay: 20 },
          shabbat:     { areas: [], maxPerMonth: 2, closingDay: 'thursday', closingTime: '12:00' },
          allowedCities: branch.allowedCities,
        },
      })
      const branchId = branchRef.id

      // 2. Create branch_head
      const headCred = await createUserWithEmailAndPassword(
        secondaryAuth,
        idToEmail(head.idNumber.trim()),
        head.volunteerId.trim().padStart(6, '0')
      )
      await secondaryAuth.signOut()
      await createUser(headCred.user.uid, {
        firstName:   head.firstName.trim(),
        lastName:    head.lastName.trim(),
        idNumber:    head.idNumber.trim(),
        volunteerId: head.volunteerId.trim(),
        phone:       head.phone.trim(),
        city:        head.city,
        branchId,
        role:        'branch_head',
        roleTypes:   [],
        permissions: { nightShifts: true, shabbatVolunteer: false, vehicleDriver: false, ambulanceDriver: false },
        isActive:    true,
      })

      // 3. Optional deputy
      if (withDeputy) {
        const depCred = await createUserWithEmailAndPassword(
          secondaryAuth,
          idToEmail(deputy.idNumber.trim()),
          deputy.volunteerId.trim().padStart(6, '0')
        )
        await secondaryAuth.signOut()
        await createUser(depCred.user.uid, {
          firstName:   deputy.firstName.trim(),
          lastName:    deputy.lastName.trim(),
          idNumber:    deputy.idNumber.trim(),
          volunteerId: deputy.volunteerId.trim(),
          phone:       deputy.phone.trim(),
          city:        deputy.city,
          branchId,
          role:        'branch_deputy',
          roleTypes:   [],
          permissions: { nightShifts: true, shabbatVolunteer: false, vehicleDriver: false, ambulanceDriver: false },
          isActive:    true,
        })
      }

      showToast('success', `סניף ${branch.name} נוצר בהצלחה! 🎉`)
      onComplete()
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use' ? 'ת.ז. כבר קיימת במערכת' : (err.message || 'שגיאה ביצירת הסניף')
      setError(msg)
      setSubmitting(false)
    }
  }

  // ── Step renderer ────────────────────────────────────────────────────────
  const userFields = (u, setU, who) => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>שם פרטי *</label>
          <input value={u.firstName} onChange={e => setU({ ...u, firstName: e.target.value })} className={inp} /></div>
        <div><label className={lbl}>שם משפחה *</label>
          <input value={u.lastName} onChange={e => setU({ ...u, lastName: e.target.value })} className={inp} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>תעודת זהות *</label>
          <input value={u.idNumber} onChange={e => setU({ ...u, idNumber: e.target.value.replace(/\D/g, '') })} className={inp} placeholder="ספרות בלבד" /></div>
        <div><label className={lbl}>קוד כונן *</label>
          <input value={u.volunteerId} onChange={e => setU({ ...u, volunteerId: e.target.value.replace(/\D/g, '') })} className={inp} placeholder="2-5 ספרות" maxLength={5} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>טלפון</label>
          <input value={u.phone} onChange={e => setU({ ...u, phone: e.target.value })} className={inp} placeholder="05XXXXXXXX" dir="ltr" /></div>
        <div><label className={lbl}>עיר</label>
          <CitySelector value={u.city} onChange={v => setU({ ...u, city: v })} placeholder="בחר עיר" /></div>
      </div>
    </>
  )

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && !submitting && onClose()}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-xl max-h-[92vh] overflow-y-auto" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-gray-100 text-lg">🪄 אשף יצירת סניף חדש</h3>
          {!submitting && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition text-xl leading-none">✕</button>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition
                ${step === s ? 'bg-orange-500 text-white' : step > s ? 'bg-orange-500/30 text-orange-300' : 'bg-gray-800 text-gray-500'}`}>
                {step > s ? '✓' : s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-orange-500/60' : 'bg-gray-800'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <h4 className="font-bold text-gray-200 mb-2">פרטי הסניף</h4>
            <div>
              <label className={lbl}>שם הסניף *</label>
              <input value={branch.name} onChange={e => setBranch(b => ({ ...b, name: e.target.value }))} className={inp} placeholder="לדוגמה: חריש" />
            </div>
            <div>
              <label className={lbl}>ערים מורשות לקודי בניין</label>
              <CitySelector
                value={branch.allowedCities}
                onChange={v => setBranch(b => ({ ...b, allowedCities: v }))}
                placeholder="הוסף ערים..." multiple
              />
              <p className="text-xs text-gray-600 mt-1">מוקדני הסניף יוכלו לגשת לקודי בניין בערים אלו בלבד</p>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <h4 className="font-bold text-gray-200 mb-2">ראש סניף (חובה)</h4>
            {userFields(head, setHead, 'ראש הסניף')}
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-gray-200">סגן ראש סניף (לא חובה)</h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeDeputy} onChange={e => setIncludeDeputy(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                <span className="text-sm text-gray-300">הוסף סגן</span>
              </label>
            </div>
            {includeDeputy
              ? userFields(deputy, setDeputy, 'סגן ראש הסניף')
              : <p className="text-sm text-gray-500 bg-gray-800/50 rounded-xl px-4 py-6 text-center">דלג על שלב זה — תוכל להוסיף סגן גם בהמשך מתוך עמוד ניהול המשתמשים.</p>
            }
          </div>
        )}

        {/* Error */}
        {error && <p className="mt-4 text-red-400 text-sm bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">{error}</p>}

        {/* Footer */}
        <div className="flex gap-3 mt-6 pt-4 border-t border-gray-800">
          {step > 1 && (
            <button type="button" onClick={back} disabled={submitting}
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 rounded-xl transition text-sm">
              ← חזור
            </button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button type="button" onClick={next}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl transition text-sm">
              המשך →
            </button>
          ) : (
            <>
              {!includeDeputy && (
                <button type="button" onClick={() => finish(false)} disabled={submitting}
                  className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 rounded-xl transition text-sm">
                  {submitting ? 'יוצר...' : 'דלג וסיים'}
                </button>
              )}
              {includeDeputy && (
                <button type="button" onClick={() => finish(true)} disabled={submitting}
                  className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold rounded-xl transition text-sm">
                  {submitting ? 'יוצר...' : '🎉 סיים ויצור סניף'}
                </button>
              )}
              {!includeDeputy && (
                <button type="button" onClick={() => finish(false)} disabled={submitting}
                  className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold rounded-xl transition text-sm">
                  {submitting ? 'יוצר...' : '🎉 סיים ויצור סניף'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Overview Tab ───────────────────────────────────────────────────────────────
function OverviewTab({ branches, users }) {
  const now = new Date()
  const year     = now.getFullYear()
  const month    = now.getMonth() + 1
  const monthStr = `${year}-${String(month).padStart(2, '0')}`
  const daysInMonth = getDaysInMonth(now)

  const [perBranch, setPerBranch] = useState(null)  // [{branch, nightCount, shabbatCount, coverage}]
  const [loading,   setLoading]   = useState(true)

  // Fetch night + shabbat counts for every branch in parallel
  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all(branches.map(async b => {
      const [night, shabbat] = await Promise.all([
        getMonthShifts(b.id, year, month).catch(() => []),
        getBranchMonthShabbatShifts(b.id, monthStr).catch(() => []),
      ])
      const maxPerNight = b.settings?.nightShifts?.maxPerNight || 1
      const totalSlots  = daysInMonth * maxPerNight
      const coverage    = totalSlots > 0 ? Math.min(100, Math.round((night.length / totalSlots) * 100)) : 0
      return { branch: b, nightCount: night.length, shabbatCount: shabbat.length, coverage }
    })).then(rows => { if (alive) { setPerBranch(rows); setLoading(false) } })
       .catch(() => alive && setLoading(false))
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches.map(b => b.id).join('|')])

  if (loading) {
    return <div className="py-16 flex justify-center"><LoadingSpinner size="lg" text="טוען סקירה כללית..." /></div>
  }

  const rows = perBranch || []

  // Aggregate stats
  const activeBranches = branches.filter(b => b.isActive !== false).length
  const totalUsers     = users.filter(u => u.role !== 'system_admin').length
  const totalNight     = rows.reduce((s, r) => s + r.nightCount,   0)
  const totalShabbat   = rows.reduce((s, r) => s + r.shabbatCount, 0)

  // Bar chart data: active volunteers per branch
  const chartData = branches.map(b => ({
    name:  b.name,
    count: users.filter(u => u.branchId === b.id && u.isActive !== false && u.role !== 'system_admin').length,
  }))

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon="🏢" label="סניפים פעילים"        value={activeBranches} sub={`מתוך ${branches.length}`} color="text-green-400" />
        <StatCard icon="👥" label="סה״כ מתנדבים במערכת" value={totalUsers}                                       color="text-orange-400" />
        <StatCard icon="🌙" label="שיבוצי לילה החודש"   value={totalNight}                                       color="text-blue-400"   />
        <StatCard icon="🕍" label="תורני שבת החודש"     value={totalShabbat}                                     color="text-purple-400" />
      </div>

      {/* Per-branch table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="font-bold text-gray-200">📋 פילוח לפי סניף</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/60 border-b border-gray-800">
                {['שם סניף','מתנדבים','שיבוצי לילה החודש','תורני שבת החודש','אחוז כיסוי לילה','סטטוס'].map((h, i) => (
                  <th key={i} className="text-right py-2.5 px-3 text-gray-400 font-medium text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">לא נמצאו סניפים</td></tr>
              ) : rows.map(({ branch: b, nightCount, shabbatCount, coverage }) => {
                const bUsers = users.filter(u => u.branchId === b.id && u.role !== 'system_admin')
                return (
                  <tr key={b.id} className="border-b border-gray-800 hover:bg-gray-900/40 transition">
                    <td className="py-2.5 px-3 text-gray-200 font-medium whitespace-nowrap">{b.name}</td>
                    <td className="py-2.5 px-3 text-gray-300 text-center">{bUsers.length}</td>
                    <td className="py-2.5 px-3 text-blue-300 text-center font-mono">{nightCount}</td>
                    <td className="py-2.5 px-3 text-purple-300 text-center font-mono">{shabbatCount}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2 min-w-32">
                        <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full transition-all ${coverage >= 80 ? 'bg-green-500' : coverage >= 50 ? 'bg-orange-500' : 'bg-red-500'}`}
                            style={{ width: `${coverage}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 font-mono w-10 text-left">{coverage}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap
                        ${b.isActive !== false ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                        {b.isActive !== false ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h3 className="font-bold text-gray-200 mb-4">📊 מתנדבים פעילים לפי סניף</h3>
        {chartData.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-10">אין סניפים להצגה</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
              <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#F3F4F6', fontWeight: 'bold' }}
                itemStyle={{ color: '#F97316' }}
                formatter={(v) => [v, 'מתנדבים פעילים']}
              />
              <Bar dataKey="count" fill="#F97316" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, color = 'text-orange-400' }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <div className="flex items-start justify-between mb-1">
        <span className="text-2xl">{icon}</span>
        <p className={`text-3xl font-black ${color}`}>{value}</p>
      </div>
      <p className="text-sm text-gray-300 font-medium">{label}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SystemAdminPage() {
  const [branches, setBranches]       = useState([])
  const [users, setUsers]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [activeTab, setActiveTab]     = useState('overview')
  const [selectedBranch, setSelectedBranch] = useState(null)

  // Add branch wizard
  const [showAddBranch, setShowAddBranch] = useState(false)

  // Users tab
  const [search, setSearch]             = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [roleFilter, setRoleFilter]     = useState('')
  const [editUser, setEditUser]         = useState(null)
  const [showAddUser, setShowAddUser]   = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Toast
  const [toast, setToast] = useState(null)
  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const loadData = async () => {
    setLoading(true)
    const [bSnap, usersData] = await Promise.all([
      getDocs(collection(db, 'branches')),
      getAllUsers(),
    ])
    const branchList = bSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    setBranches(branchList)
    setUsers(usersData)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // Refresh selected branch reference after data reload
  useEffect(() => {
    if (selectedBranch) {
      const updated = branches.find(b => b.id === selectedBranch.id)
      if (updated) setSelectedBranch(updated)
    }
  }, [branches])

  // ── Handlers ──
  const handleToggleBranchActive = async (branch) => {
    const nextActive = branch.isActive === false ? true : false

    // 1. Flip the branch isActive flag
    await updateDoc(doc(db, 'branches', branch.id), { isActive: nextActive })

    // 2. Cascade to every non-admin user in this branch.
    //    Firestore batches are capped at 500 writes — chunk if needed.
    const branchUsers = users.filter(u => u.branchId === branch.id && u.role !== 'system_admin')
    if (branchUsers.length > 0) {
      const BATCH = 500
      for (let i = 0; i < branchUsers.length; i += BATCH) {
        const batch = writeBatch(db)
        for (const u of branchUsers.slice(i, i + BATCH)) {
          batch.update(doc(db, 'users', u.id), { isActive: nextActive })
        }
        await batch.commit()
      }
    }

    const msg = nextActive
      ? `הסניף הופעל — ${branchUsers.length} משתמשים הופעלו מחדש`
      : `הסניף הושבת — ${branchUsers.length} משתמשים נחסמו מכניסה`
    showToast('success', msg)
    loadData()
  }

  const handleSaveUser = async (form, uid) => {
    // If the idNumber changed, update Firebase Auth email first
    const existing = users.find(u => u.id === uid)
    const oldId = existing?.idNumber
    const newId = form.idNumber.trim()
    if (existing && oldId && newId && oldId !== newId) {
      await changeUserIdNumber(uid, oldId, newId, existing.volunteerId)
    }

    const data = {
      firstName: form.firstName.trim(), lastName: form.lastName.trim(),
      phone: form.phone.trim(), city: form.city.trim(),
      gender: form.gender || '', team: (form.team || '').trim(),
      idNumber: newId,
      branchId: form.branchId || null,
      role: form.role, roleTypes: form.roleTypes,
      permissions: form.permissions, isActive: form.isActive,
    }
    await updateUser(uid, data)
    showToast('success', 'המשתמש עודכן')
    setEditUser(null)
    loadData()
  }

  const handleAddUser = async (form) => {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, idToEmail(form.idNumber.trim()), form.volunteerId.trim().padStart(6, '0'))
    await secondaryAuth.signOut()
    await createUser(cred.user.uid, {
      firstName: form.firstName.trim(), lastName: form.lastName.trim(),
      idNumber: form.idNumber.trim(), volunteerId: form.volunteerId.trim(),
      phone: form.phone.trim(), city: form.city.trim(),
      branchId: form.branchId || null,
      role: form.role, roleTypes: form.roleTypes,
      permissions: form.permissions, isActive: true,
    })
    showToast('success', 'המשתמש נוסף')
    setShowAddUser(false)
    loadData()
  }

  const handleDeleteVolunteer = async () => {
    if (!deleteTarget) return
    try {
      await deleteUserDoc(deleteTarget.id)
      setUsers(u => u.filter(x => x.id !== deleteTarget.id))
      showToast('success', 'המתנדב נמחק')
    } catch {
      showToast('error', 'שגיאה במחיקת המתנדב')
    } finally {
      setDeleteTarget(null)
    }
  }

  // ── Filtered users ──
  const filteredUsers = users.filter(u => {
    const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase()
    const id   = String(u.idNumber || '').toLowerCase()
    const vid  = String(u.volunteerId || '').toLowerCase()
    if (search && !name.includes(search.toLowerCase()) && !id.includes(search) && !vid.includes(search)) return false
    if (branchFilter && u.branchId !== branchFilter) return false
    if (roleFilter && u.role !== roleFilter) return false
    return true
  })

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" dir="rtl">
      <Toast toast={toast} />

      <h1 className="text-2xl font-black text-gray-100 mb-6">🌐 ניהול מערכת</h1>

      {/* Top tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-2xl border border-gray-800">
        {[['overview','📊 סקירה כללית'], ['branches','🏢 סניפים'], ['users','👥 משתמשים']].map(([t, l]) => (
          <button key={t} onClick={() => { setActiveTab(t); setSelectedBranch(null) }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition
              ${activeTab === t ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><LoadingSpinner size="lg" text="טוען נתונים..." /></div>
      ) : (
        <>
          {/* ══════════ TAB: OVERVIEW ══════════ */}
          {activeTab === 'overview' && (
            <OverviewTab branches={branches} users={users} />
          )}

          {/* ══════════ TAB: BRANCHES ══════════ */}
          {activeTab === 'branches' && !selectedBranch && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-sm">{branches.length} סניפים</p>
                <button onClick={() => setShowAddBranch(true)}
                  className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
                  + סניף חדש
                </button>
              </div>

              {/* Branch cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {branches.map(b => {
                  const bUsers  = users.filter(u => u.branchId === b.id)
                  const active  = bUsers.filter(u => u.isActive !== false).length
                  const head    = bUsers.find(u => u.role === 'branch_head')
                  return (
                    <div key={b.id}
                      onClick={() => setSelectedBranch(b)}
                      className="bg-gray-900 border border-gray-800 hover:border-orange-500/40 rounded-2xl p-5 cursor-pointer transition-all group">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-gray-200 text-lg group-hover:text-orange-300 transition">{b.name}</h3>
                          {b.city && <p className="text-gray-400 text-sm">{b.city}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${b.isActive !== false ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
                            {b.isActive !== false ? 'פעיל' : 'לא פעיל'}
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); handleToggleBranchActive(b) }}
                            className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-gray-800 transition"
                          >
                            {b.isActive !== false ? 'השבת' : 'הפעל'}
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-4 text-sm text-gray-400">
                        <span>👥 {active} מתנדבים פעילים ({bUsers.length} סך הכל)</span>
                      </div>
                      {head && <p className="text-xs text-orange-300 mt-2">ראש סניף: {head.firstName} {head.lastName}</p>}
                      <p className="text-xs text-gray-600 mt-3 group-hover:text-gray-500 transition">לחץ לפרטים ←</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Branch detail drill-down */}
          {activeTab === 'branches' && selectedBranch && (
            <BranchDetail
              branch={selectedBranch}
              allUsers={users}
              branches={branches}
              onBack={() => setSelectedBranch(null)}
              showToast={showToast}
              onDataChange={loadData}
            />
          )}

          {/* ══════════ TAB: USERS ══════════ */}
          {activeTab === 'users' && (
            <div>
              {/* Toolbar */}
              <div className="flex flex-wrap gap-3 mb-4">
                <input
                  placeholder="🔍 חיפוש שם / ת.ז. / קוד כונן"
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="flex-1 min-w-52 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500"
                />
                <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-orange-500">
                  <option value="">כל הסניפים</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  <option value="__none">ללא סניף</option>
                </select>
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-orange-500">
                  <option value="">כל התפקידים</option>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button onClick={() => setShowAddUser(true)}
                  className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
                  + הוסף משתמש
                </button>
              </div>

              <p className="text-xs text-gray-500 mb-2">{filteredUsers.length} משתמשים</p>

              <div className="overflow-x-auto rounded-2xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-900">
                      {['שם','ת.ז.','קוד כונן','סניף','תפקיד','הרשאות','סטטוס',''].map((h, i) => (
                        <th key={i} className="text-right py-2.5 px-3 text-gray-400 font-medium text-xs whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr><td colSpan={8} className="py-10 text-center text-gray-500">לא נמצאו משתמשים</td></tr>
                    ) : filteredUsers.map(u => {
                      const p = u.permissions || {}
                      const perms = [
                        (p.nightShifts || u.nightShifts) && 'לילה',
                        (p.shabbatVolunteer || u.shabbatVolunteer) && 'שבת',
                        p.vehicleDriver && 'רכב',
                        p.ambulanceDriver && 'אמבולנס',
                      ].filter(Boolean)
                      const branchName = branchFilter === '__none'
                        ? '—'
                        : branches.find(b => b.id === u.branchId)?.name || '—'
                      return (
                        <tr key={u.id} className="border-b border-gray-800 hover:bg-gray-900/50 transition">
                          <td className="py-2.5 px-3 text-gray-200 font-medium whitespace-nowrap">{u.firstName} {u.lastName}</td>
                          <td className="py-2.5 px-3 text-gray-400 text-xs font-mono">{u.idNumber || '—'}</td>
                          <td className="py-2.5 px-3 text-gray-400 text-xs font-mono">{u.volunteerId || '—'}</td>
                          <td className="py-2.5 px-3 text-gray-400 text-xs">{branches.find(b => b.id === u.branchId)?.name || '—'}</td>
                          <td className="py-2.5 px-3">
                            <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
                              {ROLES.find(r => r.value === u.role)?.label || u.role || '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap gap-1">
                              {perms.length === 0 ? <span className="text-gray-600 text-xs">—</span> : perms.map(b => (
                                <span key={b} className="text-xs bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded whitespace-nowrap">{b}</span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap
                              ${u.isActive !== false ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                              {u.isActive !== false ? 'פעיל' : 'לא פעיל'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-3">
                              <button onClick={() => setEditUser(u)}
                                className="text-xs text-orange-400 hover:text-orange-300 transition">✏️ ערוך</button>
                              <button onClick={() => setDeleteTarget(u)}
                                className="text-xs text-red-500 hover:text-red-400 transition">🗑️ מחק</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* New branch wizard */}
      {showAddBranch && (
        <NewBranchWizard
          onClose={() => setShowAddBranch(false)}
          onComplete={() => { setShowAddBranch(false); loadData() }}
          showToast={showToast}
        />
      )}

      {/* Modals — users tab */}
      {editUser && activeTab === 'users' && (
        <UserModal editUser={editUser} branches={branches}
          onSave={handleSaveUser} onClose={() => setEditUser(null)} />
      )}
      {showAddUser && (
        <UserModal isNew branches={branches}
          onSave={(form) => handleAddUser(form).catch(err => { showToast('error', err.code === 'auth/email-already-in-use' ? 'ת.ז. כבר קיימת' : 'שגיאה'); throw err })}
          onClose={() => setShowAddUser(false)} />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}
          dir="rtl">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="font-bold text-gray-100 text-lg">מחיקת מתנדב</h3>
              <p className="text-gray-400 text-sm mt-2">
                האם למחוק את{' '}
                <span className="text-white font-semibold">{deleteTarget.firstName} {deleteTarget.lastName}</span>{' '}
                מהמערכת? פעולה זו אינה ניתנת לביטול.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 py-2.5 rounded-xl transition text-sm font-medium">
                ביטול
              </button>
              <button onClick={handleDeleteVolunteer}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold py-2.5 rounded-xl transition text-sm">
                כן, מחק
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
