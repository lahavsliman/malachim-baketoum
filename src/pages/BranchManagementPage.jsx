import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../context/AuthContext'
import { getBranchUsersAll, createUser, updateUser, deleteUserDoc, callUpdateUserEmail, callUpdateUserPassword, getUserByVolunteerId } from '../firebase/users'
import { getBranchSettings, updateBranchSettings } from '../firebase/branches'
import { importCodes } from '../firebase/buildingCodes'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth, secondaryAuth } from '../firebase/config'
import { idToEmail } from '../firebase/auth'
import LoadingSpinner from '../shared/LoadingSpinner'
import {
  Moon, Star, Sliders, MapPin, UsersThree, UsersFour, Briefcase, Buildings,
  PencilSimple, Trash, DownloadSimple, FloppyDisk,
  Lock, Info, Plus,
} from '@phosphor-icons/react'
import CitySelector from '../shared/CitySelector'
import Toast from '../shared/Toast'


const ROLE_TYPES = [
  { value: 'night_coordinator',  label: 'רכז לילה' },
  { value: 'shabbat_coordinator', label: 'רכז שבת' },
  { value: 'dispatcher',         label: 'מוקדן' },
  { value: 'events_coordinator', label: 'רכז אירועים' },
  { value: 'transport_coordinator', label: 'רכז תחבורה' },
  { value: 'car_coordinator',    label: 'רכז רכב' },
  { value: 'ambulance_coordinator', label: 'רכז אמבולנס' },
  { value: 'cohesion_coordinator', label: 'רכז גיבוש' },
]

// Derive the user's role field from their assigned roleTypes.
// Privileged roles (branch-level and above) are never overwritten here.
const computeRole = (roleTypes, existingRole) => {
  if (['system_admin', 'branch_head', 'branch_deputy'].includes(existingRole)) return existingRole
  return roleTypes.length > 0 ? 'role_holder' : 'volunteer'
}

const DEFAULT_SETTINGS = {
  nightShifts: {
    startTime: '00:00',
    endTime: '06:00',
    maxPerNight: 1,
    blockFriday: false,
    maxPerMonth: 3,
    openOnDay: 20,
    enableLottery: true,
  },
  shabbat: {
    areas: [],
    maxPerMonth: 2,
    closingDay: 'thursday',
    closingTime: '12:00',
  },
  allowedCities: [],
  teams: [],
}

const EMPTY_FORM = {
  firstName: '', lastName: '', idNumber: '', volunteerId: '',
  phone: '', email: '', city: '', gender: '', team: '',
  permissions: { nightShifts: false, shabbatVolunteer: false, vehicleDriver: false, ambulanceDriver: false },
  shabbatArea: '',
  isActive: true,
}

// ── CSV import helpers ───────────────────────────────────────────────────────
// Maps Hebrew column headers (and English aliases) to canonical field names.
const CSV_HEADER_MAP = {
  // English passthrough
  firstName: 'firstName', lastName: 'lastName', idNumber: 'idNumber',
  volunteerId: 'volunteerId', phone: 'phone', email: 'email', city: 'city',
  gender: 'gender', team: 'team',
  shabbatVolunteer: 'shabbatVolunteer', vehicleDriver: 'vehicleDriver', ambulanceDriver: 'ambulanceDriver',
  // Hebrew aliases
  'שם פרטי':      'firstName',
  'שם משפחה':     'lastName',
  'ת"ז':          'idNumber',
  'ת.ז.':         'idNumber',
  'תעודת זהות':   'idNumber',
  'קוד כונן':     'volunteerId',
  'פרייבט':       'volunteerId',
  'טלפון':        'phone',
  'מס טלפון':     'phone',
  'מס׳ טלפון':    'phone',
  'עיר':          'city',
  'מגדר':         'gender',
  'צוות':         'team',
  'תורן שבת':     'shabbatVolunteer',
  'נהג רכב':      'vehicleDriver',
  'נהג אמבולנס':  'ambulanceDriver',
  'אזור שבת':     'shabbatArea',
  'אימייל':       'email',
  'מייל':         'email',
}

const csvTruthy = v => {
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'כן' || s === 'true' || s === '1' || s === 'yes' || s === 'v' || s === '✓'
}

const csvGender = v => {
  const s = String(v ?? '').trim()
  if (s === 'זכר'  || s === 'ז' || s.toLowerCase() === 'male')   return 'male'
  if (s === 'נקבה' || s === 'נ' || s.toLowerCase() === 'female') return 'female'
  return ''
}

// Hebrew labels for canonical field names — shown in CSV preview headers.
const CSV_FIELD_LABELS = {
  firstName: 'שם פרטי', lastName: 'שם משפחה',
  idNumber: 'ת.ז.', volunteerId: 'קוד כונן',
  phone: 'טלפון', email: 'אימייל', city: 'עיר',
  gender: 'מגדר', team: 'צוות',
  shabbatVolunteer: 'תורן שבת', vehicleDriver: 'נהג רכב', ambulanceDriver: 'נהג אמבולנס',
  shabbatArea: 'אזור שבת',
}

// Render a canonical cell value as friendly Hebrew in the CSV preview.
const csvCellDisplay = (field, value) => {
  if (field === 'gender')          return value === 'male' ? 'זכר' : value === 'female' ? 'נקבה' : ''
  if (typeof value === 'boolean')  return value ? 'כן' : 'לא'
  return value ?? ''
}

// Role slots shown in the תפקידים tab.
// multi: true → any number of volunteers may hold the role simultaneously.
const ROLE_SLOTS = [
  { roleType: 'branch_deputy',       label: 'סגן ראש סניף', isDeputy: true },
  { roleType: 'night_coordinator',   label: 'רכז לילה' },
  { roleType: 'shabbat_coordinator', label: 'רכז שבת' },
  { roleType: 'dispatcher',          label: 'מוקדן', multi: true },
  { roleType: 'transport_coordinator', label: 'רכז תחבורה' },
  { roleType: 'car_coordinator',     label: 'רכז רכב' },
  { roleType: 'ambulance_coordinator', label: 'רכז אמבולנס' },
  { roleType: 'events_coordinator',  label: 'רכז גיבוש' },
]

const CODES_COLS = ['city', 'street', 'buildingNumber', 'entrance', 'code', 'notes']

const TABS = [
  { Icon: UsersThree, label: 'מתנדבים' },
  { Icon: Briefcase,  label: 'תפקידים' },
  { Icon: Moon,       label: 'תורנות לילה' },
  { Icon: Star,       label: 'אזורי שבת' },
  { Icon: MapPin,     label: 'ערים מורשות' },
  { Icon: Buildings,  label: 'ייבוא קודים' },
  { Icon: UsersFour,  label: 'צוותים' },
]

const inp = 'bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-500 w-full'
const lbl = 'block text-xs text-gray-500 mb-1'

export default function BranchManagementPage() {
  const { branchId, isBranchHead, isSystemAdmin } = useRole()
  const { user } = useAuth()
  const userName = user ? `${user.firstName} ${user.lastName}` : ''
  const [activeTab, setActiveTab] = useState(0)
  // ── Volunteers tab ────────────────────────────────────────────────────────
  const [volunteers, setVolunteers] = useState([])
  // Full unfiltered list used by findHolders — separate so future filters on
  // the volunteers tab can't hide seed/inactive role holders from the roles tab.
  const [allBranchUsers, setAllBranchUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [permFilter, setPermFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null) // volunteer to confirm-delete
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [csvPreview, setCsvPreview] = useState(null)
  const [csvResults, setCsvResults] = useState(null)
  const [csvImporting, setCsvImporting] = useState(false)

  // ── Settings tabs ─────────────────────────────────────────────────────────
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)

  // Shabbat areas inline editing
  const [newAreaName, setNewAreaName] = useState('')
  const [newAreaRequired, setNewAreaRequired] = useState(1)
  const [editingAreaIdx, setEditingAreaIdx] = useState(null)
  const [editAreaName, setEditAreaName] = useState('')
  const [editAreaRequired, setEditAreaRequired] = useState(1)

  // Allowed cities
  const [newCity, setNewCity] = useState('')

  // Teams
  const [teamFilter, setTeamFilter] = useState('')
  const [newTeamName, setNewTeamName] = useState('')
  const [inlineTeamName, setInlineTeamName] = useState('')
  const [showInlineTeam, setShowInlineTeam] = useState(false)

  // ── Roles tab ─────────────────────────────────────────────────────────────
  const [roleSelections, setRoleSelections] = useState({}) // { roleType: selectedVolId }
  const [rolesSaving, setRolesSaving] = useState(false)

  // ── Building codes import ─────────────────────────────────────────────────
  const [codesPreview, setCodesPreview]     = useState(null)
  const [codesResults, setCodesResults]     = useState(null)
  const [codesImporting, setCodesImporting] = useState(false)

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null)
  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadVolunteers = async () => {
    if (!branchId) return
    setLoading(true)
    try {
      const data = await getBranchUsersAll(branchId)
      setVolunteers(data)
      setAllBranchUsers(data) // keep a reference for findHolders — never filtered
    } catch {
      showToast('error', 'שגיאה בטעינת מתנדבים')
    } finally {
      setLoading(false)
    }
  }

  const loadSettings = async () => {
    if (!branchId) return
    setSettingsLoading(true)
    try {
      const s = await getBranchSettings(branchId)
      if (s) {
        setSettings({
          ...DEFAULT_SETTINGS, ...s,
          nightShifts: { ...DEFAULT_SETTINGS.nightShifts, ...(s.nightShifts || {}) },
          shabbat: { ...DEFAULT_SETTINGS.shabbat, ...(s.shabbat || {}) },
          allowedCities: s.allowedCities || [],
          teams: s.teams || [],
        })
      }
    } catch {}
    setSettingsLoading(false)
  }

  useEffect(() => { loadVolunteers(); loadSettings() }, [branchId])

  // ── Volunteer helpers ─────────────────────────────────────────────────────
  const filteredVolunteers = volunteers.filter(v => {
    const name = `${v.firstName || ''} ${v.lastName || ''}`.toLowerCase()
    const vid = String(v.volunteerId || '').toLowerCase()
    if (search && !name.includes(search.toLowerCase()) && !vid.includes(search.toLowerCase())) return false
    const p = v.permissions || {}
    if (permFilter === 'nightShifts' && !p.nightShifts && !v.nightShifts) return false
    if (permFilter === 'shabbatVolunteer' && !p.shabbatVolunteer && !v.shabbatVolunteer) return false
    if (permFilter === 'drivers' && !p.vehicleDriver && !p.ambulanceDriver) return false
    if (teamFilter && (v.team || '') !== teamFilter) return false
    return true
  })

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setPerm = (k, v) => setForm(f => ({ ...f, permissions: { ...f.permissions, [k]: v } }))

  const openAdd = () => { setEditUser(null); setForm(EMPTY_FORM); setFormError(''); setShowModal(true) }
  const openEdit = user => {
    setEditUser(user)
    setForm({
      firstName: user.firstName || '', lastName: user.lastName || '',
      idNumber: user.idNumber || '', volunteerId: user.volunteerId || '',
      phone: user.phone || '', email: user.email || '',
      city: user.city || '', gender: user.gender || '', team: user.team || '',
      permissions: {
        nightShifts: user.permissions?.nightShifts || user.nightShifts || false,
        shabbatVolunteer: user.permissions?.shabbatVolunteer || user.shabbatVolunteer || false,
        vehicleDriver: user.permissions?.vehicleDriver || false,
        ambulanceDriver: user.permissions?.ambulanceDriver || false,
      },
      shabbatArea: user.shabbatArea || '',
      isActive: user.isActive !== false,
    })
    setFormError('')
    setShowModal(true)
  }

  const validateForm = () => {
    if (!form.firstName.trim()) return 'שם פרטי הוא שדה חובה'
    if (!form.lastName.trim()) return 'שם משפחה הוא שדה חובה'
    if (!form.idNumber.trim()) return 'תעודת זהות היא שדה חובה'
    if (!/^\d+$/.test(form.idNumber.trim())) return 'תעודת זהות חייבת להכיל ספרות בלבד'
    if (!form.volunteerId.trim()) return 'קוד כונן הוא שדה חובה'
    if (!/^\d{2,5}$/.test(form.volunteerId.trim())) return 'קוד כונן חייב להיות 2-5 ספרות'
    if (form.phone.trim() && !/^0\d{8,9}$/.test(form.phone.replace(/[-\s]/g, '')))
      return 'מספר טלפון לא תקין (פורמט ישראלי: 05XXXXXXXX)'
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return 'כתובת אימייל לא תקינה'
    return null
  }

  const handleSave = async e => {
    e.preventDefault()
    const err = validateForm()
    if (err) { setFormError(err); return }
    setSaving(true); setFormError('')
    try {
      const data = {
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        phone: form.phone.trim(), email: form.email.trim(),
        city: form.city.trim(), gender: form.gender || '', team: (form.team || '').trim(),
        permissions: form.permissions,
        shabbatArea: form.permissions.shabbatVolunteer ? (form.shabbatArea || '') : '',
        isActive: form.isActive,
      }
      if (editUser) {
        const newId = form.idNumber.trim()
        const newVolunteerId = form.volunteerId.trim()
        const idChanged = newId && editUser.idNumber && newId !== editUser.idNumber
        const volunteerIdChanged = newVolunteerId && editUser.volunteerId && newVolunteerId !== editUser.volunteerId

        if (volunteerIdChanged) {
          const existing = await getUserByVolunteerId(newVolunteerId)
          if (existing && existing.id !== editUser.id) {
            setFormError('קוד כונן זה כבר קיים במערכת')
            setSaving(false)
            return
          }
          await callUpdateUserPassword(editUser.id, newVolunteerId)
        }

        if (idChanged) await callUpdateUserEmail(editUser.id, newId)

        await updateUser(editUser.id, { ...data, idNumber: newId, volunteerId: newVolunteerId })
        showToast('success',
          idChanged && volunteerIdChanged ? 'תעודת הזהות וקוד הכונן עודכנו בהצלחה'
          : volunteerIdChanged             ? 'קוד הכונן עודכן בהצלחה'
          : idChanged                      ? 'תעודת הזהות עודכנה בהצלחה'
          :                                  'המתנדב עודכן בהצלחה'
        )
      } else {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, idToEmail(form.idNumber.trim()), form.volunteerId.trim().padStart(6, '0'))
        await secondaryAuth.signOut()
        await createUser(cred.user.uid, { ...data, idNumber: form.idNumber.trim(), volunteerId: form.volunteerId.trim(), branchId })
        showToast('success', 'המתנדב נוסף בהצלחה')
      }
      setShowModal(false)
      loadVolunteers()
    } catch (err) {
      console.error('[BranchMgmt] handleSave failed — code:', err?.code, '| message:', err?.message, err)
      setFormError(
        err.code === 'auth/email-already-in-use'
          ? 'ת.ז. זו כבר קיימת במערכת'
          : 'שגיאה בשמירה, נסה שנית'
      )
    } finally { setSaving(false) }
  }

  // ── CSV import ────────────────────────────────────────────────────────────
  const handleCsvFile = e => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const lines = ev.target.result.split('\n').filter(l => l.trim())
      if (!lines.length) { showToast('error', 'הקובץ ריק'); return }

      // Translate raw header cells to canonical keys (Hebrew + English).
      const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^﻿/, ''))
      const headers = rawHeaders.map(h => CSV_HEADER_MAP[h] || h)

      const required = ['firstName', 'lastName', 'idNumber', 'volunteerId', 'phone']
      const missing = required.filter(r => !headers.includes(r))
      if (missing.length) { showToast('error', `עמודות חסרות: ${missing.join(', ')}`); return }

      const rows = lines.slice(1)
        .map(line => {
          const cells = line.split(',').map(c => c.trim())
          const out = {}
          headers.forEach((h, i) => { out[h] = cells[i] ?? '' })
          // Normalize special-type cells
          if ('gender' in out)          out.gender          = csvGender(out.gender)
          if ('shabbatVolunteer' in out) out.shabbatVolunteer = csvTruthy(out.shabbatVolunteer)
          if ('vehicleDriver' in out)    out.vehicleDriver    = csvTruthy(out.vehicleDriver)
          if ('ambulanceDriver' in out)  out.ambulanceDriver  = csvTruthy(out.ambulanceDriver)
          return out
        })
        .filter(r => r.idNumber || r.volunteerId)
      setCsvPreview({ headers, rows })
      setCsvResults(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const confirmCsvImport = async () => {
    if (!csvPreview) return
    setCsvImporting(true)
    let success = 0
    const results = []
    for (const row of csvPreview.rows) {
      if (!row.idNumber || !row.volunteerId) {
        results.push({ ok: false, msg: 'חסר ת.ז. או קוד כונן' }); continue
      }
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, idToEmail(row.idNumber), String(row.volunteerId).padStart(6, '0'))
        await secondaryAuth.signOut()
        await createUser(cred.user.uid, {
          firstName: row.firstName || '', lastName: row.lastName || '',
          idNumber: row.idNumber, volunteerId: row.volunteerId,
          phone: row.phone || '', city: row.city || '',
          gender: row.gender || '', team: row.team || '',
          email: row.email || '', shabbatArea: row.shabbatArea || '',
          branchId, isActive: true,
          permissions: {
            nightShifts:      true,  // night shifts on by default for new imports
            shabbatVolunteer: !!row.shabbatVolunteer,
            vehicleDriver:    !!row.vehicleDriver,
            ambulanceDriver:  !!row.ambulanceDriver,
          },
          roleTypes: [],
        })
        results.push({ ok: true, msg: 'יובא בהצלחה' })
        success++
      } catch (err) {
        results.push({ ok: false, msg: err.code === 'auth/email-already-in-use' ? 'ת.ז. כבר קיימת' : 'שגיאה' })
      }
    }
    setCsvResults(results)
    setCsvImporting(false)
    showToast(success > 0 ? 'success' : 'error',
      `יובאו ${success} מתנדבים${results.length - success > 0 ? `, ${results.length - success} שגיאות` : ''}`)
    if (success > 0) loadVolunteers()
  }

  // ── Settings helpers ──────────────────────────────────────────────────────
  const setNS = (k, v) => setSettings(s => ({ ...s, nightShifts: { ...s.nightShifts, [k]: v } }))
  const setSh = (k, v) => setSettings(s => ({ ...s, shabbat: { ...s.shabbat, [k]: v } }))

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await updateBranchSettings(branchId, settings)
      showToast('success', 'הגדרות נשמרו בהצלחה')
    } catch {
      showToast('error', 'שגיאה בשמירת הגדרות')
    } finally { setSavingSettings(false) }
  }

  // ── Shabbat areas ─────────────────────────────────────────────────────────
  const addArea = () => {
    if (!newAreaName.trim()) return
    setSh('areas', [...(settings.shabbat.areas || []), { name: newAreaName.trim(), required: Number(newAreaRequired) }])
    setNewAreaName(''); setNewAreaRequired(1)
  }
  const deleteArea = idx => setSh('areas', settings.shabbat.areas.filter((_, i) => i !== idx))
  const startEditArea = idx => {
    setEditingAreaIdx(idx)
    setEditAreaName(settings.shabbat.areas[idx].name)
    setEditAreaRequired(settings.shabbat.areas[idx].required)
  }
  const saveArea = idx => {
    if (!editAreaName.trim()) return
    setSh('areas', settings.shabbat.areas.map((a, i) => i === idx ? { name: editAreaName.trim(), required: Number(editAreaRequired) } : a))
    setEditingAreaIdx(null)
  }

  // ── Allowed cities ────────────────────────────────────────────────────────
  const addCity = () => {
    if (!newCity.trim()) return
    setSettings(s => ({ ...s, allowedCities: [...(s.allowedCities || []), newCity.trim()] }))
    setNewCity('')
  }
  const removeCity = idx => setSettings(s => ({ ...s, allowedCities: s.allowedCities.filter((_, i) => i !== idx) }))

  // ── Teams ─────────────────────────────────────────────────────────────────
  const addTeam = () => {
    const name = newTeamName.trim()
    if (!name || (settings.teams || []).includes(name)) return
    setSettings(s => ({ ...s, teams: [...(s.teams || []), name] }))
    setNewTeamName('')
  }
  const removeTeam = idx => setSettings(s => ({ ...s, teams: (s.teams || []).filter((_, i) => i !== idx) }))

  const handleInlineAddTeam = async () => {
    const name = inlineTeamName.trim()
    if (!name) return
    const currentTeams = settings.teams || []
    if (!currentTeams.includes(name)) {
      const newTeams = [...currentTeams, name]
      setSettings(s => ({ ...s, teams: newTeams }))
      setF('team', name)
      setShowInlineTeam(false)
      setInlineTeamName('')
      try {
        await updateBranchSettings(branchId, { ...settings, teams: newTeams })
      } catch {
        showToast('error', 'שגיאה בשמירת הצוות')
      }
    } else {
      setF('team', name)
      setShowInlineTeam(false)
      setInlineTeamName('')
    }
  }

  // ── Delete volunteer ───────────────────────────────────────────────────────
  const handleDeleteVolunteer = async () => {
    if (!deleteTarget) return
    console.log('[deleteVolunteer] deleting user doc:', deleteTarget.id, deleteTarget.firstName, deleteTarget.lastName)
    try {
      await deleteUserDoc(deleteTarget.id)
      showToast('success', 'המתנדב נמחק מהסניף')
      loadVolunteers()
    } catch (err) {
      console.error('[deleteVolunteer] failed:', err?.code, err?.message, err)
      showToast('error', 'שגיאה במחיקת המתנדב')
    } finally {
      setDeleteTarget(null)
    }
  }

  // ── Role slot helpers ──────────────────────────────────────────────────────
  // Searches allBranchUsers (getBranchUsersAll — includes inactive/seed users)
  // so holders that are absent from the filtered volunteers tab can still be removed.
  const findHolders = (slot) =>
    slot.isDeputy
      ? allBranchUsers.filter(v => v.role === 'branch_deputy')
      : allBranchUsers.filter(v => v.roleTypes?.includes(slot.roleType) || v.roleType === slot.roleType)

  const handleAssignRole = async (slot) => {
    const volId = roleSelections[slot.roleType]
    if (!volId) return
    const vol = volunteers.find(v => v.id === volId)
    if (!vol) return
    setRolesSaving(true)
    try {
      if (slot.isDeputy) {
        await updateUser(vol.id, { role: 'branch_deputy' })
      } else {
        const existing = Array.isArray(vol.roleTypes) ? vol.roleTypes : []
        const newRoleTypes = existing.includes(slot.roleType) ? existing : [...existing, slot.roleType]
        await updateUser(vol.id, { roleTypes: newRoleTypes, role: 'role_holder' })
      }
      setRoleSelections(prev => ({ ...prev, [slot.roleType]: '' }))
      showToast('success', `${vol.firstName} ${vol.lastName} הוקצה כ${slot.label}`)
      loadVolunteers()
    } catch {
      showToast('error', 'שגיאה בהקצאת תפקיד')
    } finally {
      setRolesSaving(false)
    }
  }

  const handleRemoveRole = async (slot, vol) => {
    setRolesSaving(true)
    try {
      if (slot.isDeputy) {
        const hasOtherRoles = (vol.roleTypes || []).length > 0
        await updateUser(vol.id, { role: hasOtherRoles ? 'role_holder' : 'volunteer' })
      } else {
        const newRoleTypes = (vol.roleTypes || []).filter(rt => rt !== slot.roleType)
        await updateUser(vol.id, { roleTypes: newRoleTypes, role: newRoleTypes.length > 0 ? 'role_holder' : 'volunteer' })
      }
      showToast('success', `הוסר מתפקיד ${slot.label}`)
      loadVolunteers()
    } catch {
      showToast('error', 'שגיאה בהסרת תפקיד')
    } finally {
      setRolesSaving(false)
    }
  }

  const handleToggleRoleVisibility = async (slot, vol) => {
    const current = vol.roleVisibility || {}
    const currentlyVisible = current[slot.roleType] !== false
    const newVisibility = { ...current, [slot.roleType]: !currentlyVisible }
    try {
      await updateUser(vol.id, { roleVisibility: newVisibility })
      loadVolunteers()
    } catch {
      showToast('error', 'שגיאה בעדכון תצוגה')
    }
  }

  // ── Building codes import handlers ───────────────────────────────────────
  const handleCodesFile = e => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    const process = rows => {
      const missing = ['city', 'street', 'buildingNumber', 'code'].filter(c => !rows[0] || !(c in rows[0]))
      if (missing.length) { alert(`עמודות חסרות: ${missing.join(', ')}`); return }
      setCodesPreview({ rows: rows.filter(r => r.city || r.street) })
      setCodesResults(null)
    }
    if (ext === 'csv') {
      const reader = new FileReader()
      reader.onload = ev => {
        const lines = ev.target.result.split('\n').filter(l => l.trim())
        const headers = lines[0].split(',').map(h => h.trim())
        process(lines.slice(1).map(line =>
          Object.fromEntries(headers.map((h, i) => [h, line.split(',')[i]?.trim() ?? '']))
        ))
      }
      reader.readAsText(file)
    } else {
      const reader = new FileReader()
      reader.onload = ev => {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        process(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }))
      }
      reader.readAsArrayBuffer(file)
    }
    e.target.value = ''
  }

  const confirmCodesImport = async () => {
    if (!codesPreview) return
    setCodesImporting(true)
    try {
      const results = await importCodes(branchId, codesPreview.rows, user.id, userName)
      setCodesResults(results)
      const ok = results.filter(r => r.ok).length
      if (ok > 0) showToast('success', `יובאו ${ok} קודים בהצלחה`)
    } catch { showToast('error', 'שגיאה בייבוא הקודים') }
    finally { setCodesImporting(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto pb-20 lg:pb-0" dir="rtl">
      <h1 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-2"><Sliders size={24} className="text-gray-600" /> ניהול סניף</h1>

      <Toast toast={toast} />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white p-1 rounded-2xl border border-gray-200 overflow-x-auto">
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setActiveTab(i)}
            className={`inline-flex items-center justify-center gap-1.5 flex-1 whitespace-nowrap py-2 px-3 rounded-xl text-sm font-medium transition
              ${activeTab === i ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-800'}`}>
            <t.Icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════ TAB 0: VOLUNTEERS ══════════════════════════════ */}
      {activeTab === 0 && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              placeholder="🔍 חיפוש לפי שם או קוד כונן"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-48 bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-500"
            />
            <select value={permFilter} onChange={e => setPermFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-700 text-sm focus:outline-none focus:border-orange-500">
              <option value="">כל ההרשאות</option>
              <option value="nightShifts">תורני לילה</option>
              <option value="shabbatVolunteer">תורני שבת</option>
              <option value="drivers">נהגים</option>
            </select>
            {(settings.teams || []).length > 0 && (
              <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-700 text-sm focus:outline-none focus:border-orange-500">
                <option value="">כל הצוותים</option>
                {(settings.teams || []).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 mb-5">
            <label className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl text-sm border border-gray-200 transition cursor-pointer">
              <DownloadSimple size={16} /> ייבוא CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
            </label>
            <button onClick={openAdd}
              className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
              + הוסף מתנדב
            </button>
          </div>

          {/* CSV Preview */}
          {csvPreview && (
            <div className="mb-6 bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="font-bold text-gray-800 mb-3">תצוגה מקדימה — {csvPreview.rows.length} רשומות</h3>
              <div className="overflow-x-auto max-h-64 mb-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {csvPreview.headers.map(h => (
                        <th key={h} className="text-right py-1 px-2 text-gray-500 border-b border-gray-200 whitespace-nowrap">{CSV_FIELD_LABELS[h] || h}</th>
                      ))}
                      {csvResults && <th className="text-right py-1 px-2 text-gray-500 border-b border-gray-200">תוצאה</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.rows.map((row, i) => {
                      const result = csvResults?.[i]
                      return (
                        <tr key={i} className={result ? (result.ok ? 'bg-green-500/10' : 'bg-red-500/10') : 'hover:bg-gray-100'}>
                          {csvPreview.headers.map(h => (
                            <td key={h} className="py-1 px-2 text-gray-700 border-b border-gray-200">{csvCellDisplay(h, row[h])}</td>
                          ))}
                          {result && (
                            <td className={`py-1 px-2 border-b border-gray-200 ${result.ok ? 'text-green-400' : 'text-red-400'}`}>
                              {result.ok ? '✅' : '❌'} {result.msg}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setCsvPreview(null); setCsvResults(null) }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm transition">
                  סגור
                </button>
                {!csvResults && (
                  <button onClick={confirmCsvImport} disabled={csvImporting}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition">
                    {csvImporting ? 'מייבא...' : `✅ אשר ייבוא (${csvPreview.rows.length})`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Volunteer table */}
          {loading ? (
            <div className="py-16 flex justify-center"><LoadingSpinner size="lg" text="טוען מתנדבים..." /></div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-3">{filteredVolunteers.length} מתנדבים</p>
              <div className="overflow-x-auto rounded-2xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-white">
                      {['שם מלא','קוד כונן','טלפון','עיר','תפקידים','הרשאות',''].map((h, i) => (
                        <th key={i} className="text-right py-2.5 px-3 text-gray-500 font-medium text-xs whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVolunteers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-gray-500">לא נמצאו מתנדבים</td>
                      </tr>
                    ) : filteredVolunteers.map(v => {
                      const p = v.permissions || {}
                      const permBadges = [
                        (p.nightShifts || v.nightShifts) && 'לילה',
                        (p.shabbatVolunteer || v.shabbatVolunteer) && 'שבת',
                        p.vehicleDriver && 'נהג רכב',
                        p.ambulanceDriver && 'אמבולנס',
                      ].filter(Boolean)
                      const roles = (v.roleTypes || []).map(rt => ROLE_TYPES.find(r => r.value === rt)?.label || rt)
                      return (
                        <tr
                          key={v.id}
                          className="border-b border-gray-200"
                          onClick={e => e.stopPropagation()}
                        >
                          <td className="py-2.5 px-3 text-gray-800 font-medium whitespace-nowrap">{v.firstName} {v.lastName}</td>
                          <td className="py-2.5 px-3 text-gray-700 font-mono">{v.volunteerId}</td>
                          <td className="py-2.5 px-3 text-gray-500 text-xs" dir="ltr">{v.phone || '—'}</td>
                          <td className="py-2.5 px-3 text-gray-500">{v.city || '—'}</td>
                          <td className="py-2.5 px-3 text-gray-500 text-xs">{roles.join(', ') || '—'}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap gap-1">
                              {permBadges.length === 0 ? <span className="text-gray-600 text-xs">—</span> : permBadges.map(b => (
                                <span key={b} className="text-xs bg-orange-500/20 text-orange-900 px-1.5 py-0.5 rounded whitespace-nowrap">{b}</span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={e => { e.stopPropagation(); openEdit(v) }}
                                className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition"
                              >
                                <PencilSimple size={13} /> ערוך
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setDeleteTarget(v) }}
                                className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition"
                              >
                                <Trash size={13} /> מחק
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Add/Edit Modal */}
          {showModal && (
            <div
              className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
              onClick={e => e.target === e.currentTarget && setShowModal(false)}
            >
              <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
                <h3 className="font-bold text-gray-800 text-lg mb-5 flex items-center gap-2">
                  {editUser ? <PencilSimple size={18} /> : <Plus size={18} />}
                  {editUser ? 'עריכת מתנדב' : 'הוספת מתנדב'}
                </h3>
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>שם פרטי *</label>
                      <input value={form.firstName} onChange={e => setF('firstName', e.target.value)} className={inp} placeholder="שם פרטי" />
                    </div>
                    <div>
                      <label className={lbl}>שם משפחה *</label>
                      <input value={form.lastName} onChange={e => setF('lastName', e.target.value)} className={inp} placeholder="שם משפחה" />
                    </div>
                    <div>
                      <label className={lbl}>תעודת זהות {!editUser && '*'}</label>
                      <input
                        value={form.idNumber}
                        onChange={e => setF('idNumber', e.target.value.replace(/\D/g, ''))}
                        className={inp} placeholder="ספרות בלבד" inputMode="numeric"
                      />
                      {editUser && (
                        <p className="text-xs text-gray-500 mt-1">שינוי ת.ז. יעדכן גם את אימייל הכניסה</p>
                      )}
                    </div>
                    <div>
                      <label className={lbl}>קוד כונן *</label>
                      <input
                        value={form.volunteerId}
                        onChange={e => setF('volunteerId', e.target.value.replace(/\D/g, ''))}
                        className={inp} placeholder="2-5 ספרות" inputMode="numeric" maxLength={5}
                      />
                      {editUser && (
                        <p className="text-xs text-gray-500 mt-1">שינוי קוד כונן יעדכן גם את הסיסמה להתחברות</p>
                      )}
                    </div>
                    <div>
                      <label className={lbl}>טלפון</label>
                      <input value={form.phone} onChange={e => setF('phone', e.target.value)} className={inp} placeholder="05XXXXXXXX" inputMode="tel" dir="ltr" />
                    </div>
                    <div>
                      <label className={lbl}>אימייל</label>
                      <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} className={inp} placeholder="example@email.com" dir="ltr" />
                    </div>
                    <div>
                      <label className={lbl}>עיר</label>
                      <CitySelector value={form.city} onChange={v => setF('city', v)} placeholder="בחר עיר מגורים" />
                    </div>
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
                      {(settings.teams || []).length > 0 ? (
                        <>
                          <div className="flex gap-2">
                            <select value={form.team} onChange={e => setF('team', e.target.value)} className={inp}>
                              <option value="">— ללא —</option>
                              {(settings.teams || []).map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                            {!showInlineTeam && (
                              <button
                                type="button"
                                onClick={() => { setShowInlineTeam(true); setInlineTeamName('') }}
                                className="shrink-0 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1.5 rounded-xl border border-gray-200 transition whitespace-nowrap"
                              >
                                + צוות
                              </button>
                            )}
                          </div>
                          {showInlineTeam && (
                            <div className="flex gap-2 mt-2">
                              <input
                                value={inlineTeamName}
                                onChange={e => setInlineTeamName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleInlineAddTeam())}
                                placeholder="שם הצוות החדש"
                                autoFocus
                                className="flex-1 bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5 text-gray-800 text-sm focus:outline-none focus:border-orange-500"
                              />
                              <button type="button" onClick={handleInlineAddTeam}
                                className="text-xs bg-orange-500 hover:bg-orange-400 text-white px-3 py-1.5 rounded-xl transition">
                                אישור
                              </button>
                              <button type="button" onClick={() => { setShowInlineTeam(false); setInlineTeamName('') }}
                                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1.5 rounded-xl transition">
                                ביטול
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <input value={form.team} onChange={e => setF('team', e.target.value)} className={inp} placeholder="שם הצוות" />
                      )}
                    </div>
                  </div>

                  {editUser?.role !== 'branch_head' && editUser?.role !== 'branch_deputy' && (
                    <>
                      {/* Permissions */}
                      <div>
                        <p className={lbl}>הרשאות</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            ['nightShifts',     'תורנות לילה'],
                            ['shabbatVolunteer','תורן שבת'],
                            ['vehicleDriver',   'נהג רכב'],
                            ['ambulanceDriver', 'אמבולנס'],
                          ].map(([k, l]) => (
                            <label key={k} className="flex items-center gap-2 cursor-pointer bg-gray-100 px-3 py-2 rounded-xl transition">
                              <input
                                type="checkbox"
                                checked={form.permissions[k]}
                                onChange={e => {
                                  setPerm(k, e.target.checked)
                                  if (k === 'shabbatVolunteer' && !e.target.checked) setF('shabbatArea', '')
                                }}
                                className="w-4 h-4 accent-orange-500"
                              />
                              <span className="text-gray-700 text-sm">{l}</span>
                            </label>
                          ))}
                        </div>

                        {/* Shabbat area — shown only when shabbatVolunteer is checked */}
                        {form.permissions.shabbatVolunteer && (
                          <div className="mt-2">
                            <label className={lbl}>אזור שבת</label>
                            <select
                              value={form.shabbatArea || ''}
                              onChange={e => setF('shabbatArea', e.target.value)}
                              className={inp}
                            >
                              <option value="">— בחר אזור —</option>
                              {(settings.shabbat?.areas || []).map(a => (
                                <option key={a.name} value={a.name}>{a.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Active toggle */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button type="button" onClick={() => setF('isActive', !form.isActive)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${form.isActive ? 'bg-orange-500' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${form.isActive ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                    <span className="text-gray-700 text-sm">{form.isActive ? 'פעיל' : 'לא פעיל'}</span>
                  </label>

                  {formError && (
                    <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">{formError}</p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setShowModal(false)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl transition">
                      ביטול
                    </button>
                    <button type="submit" disabled={saving}
                      className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition">
                      {saving ? 'שומר...' : editUser ? 'עדכן' : 'הוסף'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

          {/* Delete confirmation modal */}
          {deleteTarget && (
            <div
              className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
              onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}
              dir="rtl"
            >
              <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <div className="text-center mb-5">
                  <Trash size={40} className="mx-auto mb-3 text-red-400" />
                  <h3 className="font-bold text-gray-900 text-lg">מחיקת מתנדב</h3>
                  <p className="text-gray-500 text-sm mt-2">
                    האם למחוק את{' '}
                    <span className="text-white font-semibold">{deleteTarget.firstName} {deleteTarget.lastName}</span>{' '}
                    מהסניף? פעולה זו אינה ניתנת לביטול.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl transition text-sm font-medium"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={handleDeleteVolunteer}
                    className="flex-1 bg-red-500 hover:bg-red-400 text-white font-bold py-2.5 rounded-xl transition text-sm"
                  >
                    כן, מחק
                  </button>
                </div>
              </div>
            </div>
          )}

      {/* ══════════════════════════════ TAB 1: ROLES ══════════════════════════════ */}
      {activeTab === 1 && (
        loading ? (
          <div className="py-16 flex justify-center"><LoadingSpinner size="lg" text="טוען מתנדבים..." /></div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            <p className="text-sm text-gray-500 mb-2">הקצה מתנדבים לתפקידים. מתנדב יכול להחזיק כמה תפקידים במקביל.</p>
            {ROLE_SLOTS.map(slot => {
              const holders = findHolders(slot)
              const holderIds = new Set(holders.map(h => h.id))
              const assignable = volunteers.filter(v =>
                v.isActive !== false &&
                v.role !== 'branch_head' &&
                !holderIds.has(v.id)
              )

              // ── Multi slot (dispatcher) ──────────────────────────────────
              if (slot.multi) {
                return (
                  <div key={slot.roleType} className="bg-white border border-gray-200 rounded-2xl p-4">
                    <p className="text-gray-800 font-semibold mb-3">{slot.label}</p>

                    {holders.length > 0 ? (
                      <div className="space-y-1.5 mb-3">
                        {holders.map(h => (
                          <div key={h.id} className="flex items-center justify-between bg-gray-100 rounded-xl px-3 py-2">
                            <span className="text-orange-400 text-sm">{h.firstName} {h.lastName}</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleToggleRoleVisibility(slot, h)}
                                className={`text-xs px-2 py-0.5 rounded-lg transition border ${
                                  (h.roleVisibility?.[slot.roleType] !== false)
                                    ? 'border-green-300 text-green-700 hover:bg-green-50'
                                    : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                                }`}
                                title="הצגה בעמוד אנשי הקשר של המתנדבים"
                              >
                                {(h.roleVisibility?.[slot.roleType] !== false) ? 'מוצג' : 'מוסתר'}
                              </button>
                              <button
                                onClick={() => handleRemoveRole(slot, h)}
                                disabled={rolesSaving}
                                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition"
                              >
                                הסר
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm mb-3">לא מאויש</p>
                    )}

                    <div className="flex gap-2 items-center">
                      <select
                        value={roleSelections[slot.roleType] || ''}
                        onChange={e => setRoleSelections(prev => ({ ...prev, [slot.roleType]: e.target.value }))}
                        className="flex-1 bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5 text-gray-800 text-sm focus:outline-none focus:border-orange-500"
                      >
                        <option value="">בחר מתנדב</option>
                        {assignable.map(v => (
                          <option key={v.id} value={v.id}>{v.firstName} {v.lastName}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssignRole(slot)}
                        disabled={rolesSaving || !roleSelections[slot.roleType]}
                        className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-3 py-1.5 rounded-xl text-sm font-medium transition whitespace-nowrap"
                      >
                        {rolesSaving ? '...' : '+ הוסף מוקדן'}
                      </button>
                    </div>
                  </div>
                )
              }

              // ── Single slot ──────────────────────────────────────────────
              const holder = holders[0] ?? null
              return (
                <div key={slot.roleType} className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-gray-800 font-semibold">{slot.label}</p>
                      {holder
                        ? <p className="text-orange-400 text-sm mt-0.5">{holder.firstName} {holder.lastName}</p>
                        : <p className="text-gray-500 text-sm mt-0.5">לא מאויש</p>
                      }
                    </div>
                    {holder ? (
                      <div className="flex items-center gap-2">
                        {!slot.isDeputy && (
                          <button
                            onClick={() => handleToggleRoleVisibility(slot, holder)}
                            className={`text-xs px-2 py-0.5 rounded-lg transition border ${
                              (holder.roleVisibility?.[slot.roleType] !== false)
                                ? 'border-green-300 text-green-700 hover:bg-green-50'
                                : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                            title="הצגה בעמוד אנשי הקשר של המתנדבים"
                          >
                            {(holder.roleVisibility?.[slot.roleType] !== false) ? 'מוצג' : 'מוסתר'}
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveRole(slot, holder)}
                          disabled={rolesSaving}
                          className="text-sm text-red-400 hover:text-red-300 disabled:opacity-40 transition border border-red-500/30 hover:border-red-400/50 px-3 py-1.5 rounded-xl"
                        >
                          הסר מתפקיד
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <select
                          value={roleSelections[slot.roleType] || ''}
                          onChange={e => setRoleSelections(prev => ({ ...prev, [slot.roleType]: e.target.value }))}
                          className="bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5 text-gray-800 text-sm focus:outline-none focus:border-orange-500 min-w-40"
                        >
                          <option value="">בחר מתנדב</option>
                          {assignable.map(v => (
                            <option key={v.id} value={v.id}>{v.firstName} {v.lastName}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssignRole(slot)}
                          disabled={rolesSaving || !roleSelections[slot.roleType]}
                          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-3 py-1.5 rounded-xl text-sm font-medium transition"
                        >
                          {rolesSaving ? '...' : 'הקצה'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ══════════════════════════════ TAB 2: SETTINGS ══════════════════════════════ */}
      {activeTab === 2 && (
        settingsLoading
          ? <div className="py-16 flex justify-center"><LoadingSpinner size="lg" text="טוען הגדרות..." /></div>
          : (
            <div className="space-y-5 max-w-lg">
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Moon size={16} color="#3B82F6" /> הגדרות תורנות לילה</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>שעת התחלה</label>
                      <input type="time" value={settings.nightShifts.startTime} onChange={e => setNS('startTime', e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>שעת סיום</label>
                      <input type="time" value={settings.nightShifts.endTime} onChange={e => setNS('endTime', e.target.value)} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>מקסימום כוננים ללילה</label>
                      <input type="number" min={1} value={settings.nightShifts.maxPerNight}
                        onChange={e => setNS('maxPerNight', Number(e.target.value))} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>מקסימום שיבוצים לחודש למתנדב</label>
                      <input type="number" min={1} value={settings.nightShifts.maxPerMonth}
                        onChange={e => setNS('maxPerMonth', Number(e.target.value))} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>פתיחת הרשמה לחודש הבא (יום)</label>
                      <input type="number" min={1} max={28} value={settings.nightShifts.openOnDay}
                        onChange={e => setNS('openOnDay', Number(e.target.value))} className={inp} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={settings.nightShifts.blockFriday}
                      onChange={e => setNS('blockFriday', e.target.checked)} className="w-4 h-4 accent-orange-500" />
                    <span className="text-gray-700 text-sm">חסום יום שישי (ללא תורנות לילה)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={settings.nightShifts.enableLottery ?? true}
                      onChange={e => setNS('enableLottery', e.target.checked)} className="w-4 h-4 accent-orange-500" />
                    <div>
                      <span className="text-gray-700 text-sm font-medium">הגרלה חודשית</span>
                      <p className="text-gray-500 text-xs mt-0.5">האם לבצע הגרלה חודשית לשיבוצי לילה?</p>
                    </div>
                  </label>
                </div>
              </div>
              <button onClick={handleSaveSettings} disabled={savingSettings}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-3 rounded-2xl transition">
                {savingSettings ? 'שומר...' : <><FloppyDisk size={16} className="inline mr-1" />שמור הגדרות</>}
              </button>
            </div>
          )
      )}

      {/* ══════════════════════════════ TAB 3: SHABBAT AREAS ══════════════════════════════ */}
      {activeTab === 3 && (
        settingsLoading
          ? <div className="py-16 flex justify-center"><LoadingSpinner size="lg" text="טוען הגדרות..." /></div>
          : (
            <div className="space-y-5 max-w-2xl">
              {/* Shabbat global settings */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Star size={16} color="#9333EA" /> הגדרות כלליות לשבת</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={lbl}>מקסימום שיבוצים לחודש</label>
                    <input type="number" min={1} value={settings.shabbat.maxPerMonth}
                      onChange={e => setSh('maxPerMonth', Number(e.target.value))} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>יום סגירת הרשמה</label>
                    <select value={settings.shabbat.closingDay} onChange={e => setSh('closingDay', e.target.value)} className={inp}>
                      <option value="thursday">חמישי</option>
                      <option value="friday">שישי</option>
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>שעת סגירת הרשמה</label>
                    <input type="time" value={settings.shabbat.closingTime}
                      onChange={e => setSh('closingTime', e.target.value)} className={inp} />
                  </div>
                </div>
              </div>

              {/* Areas list */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h3 className="font-bold text-gray-800 mb-4">אזורי שבת פעילים</h3>
                <div className="space-y-2 mb-4">
                  {(settings.shabbat.areas || []).length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-6">אין אזורים מוגדרים</p>
                  ) : (settings.shabbat.areas || []).map((area, idx) =>
                    editingAreaIdx === idx ? (
                      <div key={idx} className="flex gap-2 items-center bg-gray-100 p-2 rounded-xl">
                        <input value={editAreaName} onChange={e => setEditAreaName(e.target.value)}
                          className="flex-1 bg-gray-200 border border-gray-300 rounded-lg px-2 py-1 text-gray-800 text-sm focus:outline-none focus:border-orange-500" />
                        <input type="number" min={1} value={editAreaRequired} onChange={e => setEditAreaRequired(e.target.value)}
                          className="w-16 bg-gray-200 border border-gray-300 rounded-lg px-2 py-1 text-gray-800 text-sm focus:outline-none focus:border-orange-500"
                          title="כוננים נדרשים" />
                        <button onClick={() => saveArea(idx)} className="text-xs text-green-400 hover:text-green-300 px-2 py-1">שמור</button>
                        <button onClick={() => setEditingAreaIdx(null)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">ביטול</button>
                      </div>
                    ) : (
                      <div key={idx} className="flex items-center justify-between bg-gray-100 px-4 py-2.5 rounded-xl">
                        <div>
                          <span className="text-gray-800">{area.name}</span>
                          <span className="text-gray-500 text-xs mr-3">{area.required} כוננים נדרשים</span>
                        </div>
                        <div className="flex gap-3">
                          <button onClick={() => startEditArea(idx)} className="text-xs text-orange-400 hover:text-orange-300 transition">ערוך</button>
                          <button onClick={() => deleteArea(idx)} className="text-xs text-red-400 hover:text-red-300 transition">מחק</button>
                        </div>
                      </div>
                    )
                  )}
                </div>
                <div className="flex gap-2">
                  <input value={newAreaName} onChange={e => setNewAreaName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addArea())}
                    placeholder="שם אזור חדש"
                    className="flex-1 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-500 text-sm" />
                  <input type="number" min={1} value={newAreaRequired} onChange={e => setNewAreaRequired(e.target.value)}
                    title="כוננים נדרשים"
                    className="w-20 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 focus:outline-none focus:border-orange-500 text-sm" />
                  <button onClick={addArea}
                    className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
                    + הוסף
                  </button>
                </div>
              </div>

              <button onClick={handleSaveSettings} disabled={savingSettings}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-3 rounded-2xl transition">
                {savingSettings ? 'שומר...' : <><FloppyDisk size={16} className="inline mr-1" />שמור שינויים</>}
              </button>
            </div>
          )
      )}

      {/* ══════════════════════════════ TAB 4: ALLOWED CITIES ══════════════════════════════ */}
      {activeTab === 4 && (
        settingsLoading
          ? <div className="py-16 flex justify-center"><LoadingSpinner size="lg" text="טוען הגדרות..." /></div>
          : (
            <div className="max-w-md space-y-5">
              <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
                <Info size={16} className="shrink-0" />
                <span>מוקדני הסניף יוכלו לגשת לקודי בניין בערים אלו בלבד</span>
              </div>

              {!isSystemAdmin && (
                <div className="bg-gray-100 border border-gray-200 text-gray-700 rounded-2xl px-4 py-3 text-sm flex items-start gap-2">
                  <Lock size={16} className="shrink-0 mt-0.5" />
                  <span>ערים אלו הוגדרו על ידי מנהל המערכת. רק מנהל מערכת יכול לשנות אותן.</span>
                </div>
              )}

              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><MapPin size={16} /> ערים מורשות</h3>
                {(settings.allowedCities || []).length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">
                    {isSystemAdmin ? 'לא הוגדרו ערים מורשות — חפש והוסף ערים למטה' : 'לא הוגדרו ערים מורשות'}
                  </p>
                ) : isSystemAdmin ? null : (
                  // Read-only chip list for non-admins
                  <div className="flex flex-wrap gap-2">
                    {(settings.allowedCities || []).map(c => (
                      <span key={c} className="bg-orange-500/15 text-orange-900 text-sm px-3 py-1.5 rounded-lg border border-orange-500/20">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {isSystemAdmin && (
                  <CitySelector
                    value={settings.allowedCities || []}
                    onChange={v => setSettings(s => ({ ...s, allowedCities: v }))}
                    placeholder="חפש והוסף עיר..." multiple
                  />
                )}
              </div>

              {isSystemAdmin && (
                <button onClick={handleSaveSettings} disabled={savingSettings}
                  className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-3 rounded-2xl transition">
                  {savingSettings ? 'שומר...' : <><FloppyDisk size={16} className="inline mr-1" />שמור שינויים</>}
                </button>
              )}
            </div>
          )
      )}

      {/* ══════════════════════════════ TAB 5: BUILDING CODES IMPORT ══════════════════════════════ */}
      {activeTab === 5 && (
        <div className="space-y-5 max-w-2xl">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800">
            <p className="font-medium mb-1">עמודות נדרשות בקובץ:</p>
            <p className="font-mono text-xs text-blue-600">{CODES_COLS.join(', ')}</p>
            <p className="mt-2 text-blue-600 text-xs">תומך בקבצי .csv ו-.xlsx</p>
          </div>

          {!codesPreview && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 hover:border-orange-500/50 rounded-2xl p-10 cursor-pointer transition group">
              <span className="text-4xl mb-3 group-hover:scale-110 transition">📁</span>
              <p className="text-gray-700 font-medium">לחץ לבחירת קובץ</p>
              <p className="text-gray-500 text-sm mt-1">CSV או Excel</p>
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleCodesFile} />
            </label>
          )}

          {codesPreview && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="font-bold text-gray-800 mb-3">
                תצוגה מקדימה — {codesPreview.rows.length} רשומות
              </h3>
              <div className="overflow-x-auto max-h-72 mb-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {CODES_COLS.map(h => (
                        <th key={h} className="text-right py-1 px-2 text-gray-500 border-b border-gray-200 whitespace-nowrap">{h}</th>
                      ))}
                      {codesResults && <th className="text-right py-1 px-2 text-gray-500 border-b border-gray-200">תוצאה</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {codesPreview.rows.map((row, i) => {
                      const res = codesResults?.[i]
                      return (
                        <tr key={i} className={res ? (res.ok ? 'bg-green-500/10' : 'bg-red-500/10') : 'hover:bg-gray-100'}>
                          {CODES_COLS.map(h => (
                            <td key={h} className="py-1 px-2 text-gray-700 border-b border-gray-200 whitespace-nowrap">{row[h] ?? ''}</td>
                          ))}
                          {res && (
                            <td className={`py-1 px-2 border-b border-gray-200 ${res.ok ? 'text-green-600' : 'text-red-500'}`}>
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
                  onClick={() => { setCodesPreview(null); setCodesResults(null) }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm transition"
                >
                  סגור
                </button>
                {!codesResults && (
                  <button
                    onClick={confirmCodesImport}
                    disabled={codesImporting}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition"
                  >
                    {codesImporting ? 'מייבא...' : `ייבא ${codesPreview.rows.length} רשומות`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════ TAB 6: TEAMS ══════════════════════════════ */}
      {activeTab === 6 && (
        settingsLoading
          ? <div className="py-16 flex justify-center"><LoadingSpinner size="lg" text="טוען הגדרות..." /></div>
          : (
            <div className="max-w-md space-y-5">
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <UsersFour size={16} className="text-orange-400" /> צוותים פעילים
                </h3>
                {(settings.teams || []).length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-6">אין צוותים מוגדרים — הוסף צוות ראשון</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {(settings.teams || []).map((team, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-gray-100 px-4 py-2.5 rounded-xl">
                        <span className="text-gray-800">{team}</span>
                        <button
                          onClick={() => removeTeam(idx)}
                          className="text-xs text-red-400 hover:text-red-300 transition"
                        >
                          מחק
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <input
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTeam())}
                    placeholder="שם הצוות החדש"
                    className="flex-1 bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-500 text-sm"
                  />
                  <button onClick={addTeam}
                    className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
                    + הוסף
                  </button>
                </div>
              </div>
              <button onClick={handleSaveSettings} disabled={savingSettings}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-3 rounded-2xl transition">
                {savingSettings ? 'שומר...' : <><FloppyDisk size={16} className="inline mr-1" />שמור שינויים</>}
              </button>
            </div>
          )
      )}
    </div>
  )
}
