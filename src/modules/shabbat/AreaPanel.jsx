import { useState } from 'react'
import { confirmVolunteer, rejectVolunteer, adminAddConfirmedVolunteer } from '../../firebase/shabbatShifts'

// ── Status chip styles — light theme ──────────────────────────────────────────
const STATUS_CHIP = {
  available:     { label: 'ממתין',   cls: 'bg-amber-50  text-amber-700  border-amber-200'  },
  confirmed:     { label: 'מאושר',   cls: 'bg-green-50  text-green-700  border-green-200'  },
  cancelled:     { label: 'נדחה',    cls: 'bg-gray-100  text-gray-500   border-gray-200'   },
  not_available: { label: 'לא זמין', cls: 'bg-gray-100  text-gray-400   border-gray-200'   },
}

export default function AreaPanel({
  areas,               // [{name, required}] from branch settings
  shabbatDate,
  shifts,              // all shifts for this shabbat
  coordinatorId,
  monthShiftCounts,    // {volunteerId: confirmedCount} for current month
  onRefresh,
  onAutoSuggest,       // callback(areaName) → auto-suggests for that area
  allVolunteers = [],  // all branch shabbat volunteers for manual-add
}) {
  const [addSelections, setAddSelections] = useState({}) // { areaName: volId }
  const [addSaving, setAddSaving] = useState(false)

  const handleConfirm = async (shiftId) => {
    await confirmVolunteer(shiftId, coordinatorId)
    onRefresh()
  }

  const handleReject = async (shiftId) => {
    await rejectVolunteer(shiftId, coordinatorId)
    onRefresh()
  }

  const handleManualAdd = async (area) => {
    const volId = addSelections[area]
    if (!volId) return
    const vol = allVolunteers.find(v => v.id === volId)
    if (!vol) return
    setAddSaving(true)
    try {
      await adminAddConfirmedVolunteer(
        shifts[0]?.branchId ?? '', shabbatDate,
        vol.id, `${vol.firstName} ${vol.lastName}`,
        area, coordinatorId
      )
      setAddSelections(prev => ({ ...prev, [area]: '' }))
      onRefresh()
    } finally {
      setAddSaving(false)
    }
  }

  // Collect areas: configured + any submitted-but-unconfigured extras
  const configuredNames = new Set(areas.map(a => a.name))
  const extraAreas = [...new Set(shifts.map(s => s.area).filter(a => a && !configuredNames.has(a)))]
  const allAreas = [
    ...areas,
    ...extraAreas.map(name => ({ name, required: 1 })),
  ]

  return (
    <div className="space-y-5">
      {allAreas.map(({ name: area, required }) => {
        const areaShifts  = shifts.filter(s => s.area === area)
        const confirmed   = areaShifts.filter(s => s.status === 'confirmed').length
        const available   = areaShifts.filter(s => s.status === 'available').length

        // Top accent strip color
        const topStrip =
          confirmed >= required ? 'bg-green-400' :
          confirmed > 0         ? 'bg-amber-400' :
                                  'bg-red-400'

        // Progress pill
        const progressPill =
          confirmed >= required ? 'bg-green-50 text-green-700 border-green-200' :
          confirmed > 0         ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  'bg-red-50   text-red-600   border-red-200'

        // Volunteers not yet in this area (for manual-add)
        const assignedIds = new Set(areaShifts.map(s => s.volunteerId))
        const addable = allVolunteers.filter(v => !assignedIds.has(v.id))

        return (
          <div key={area} className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">

            {/* Colored top accent strip */}
            <div className={`h-1.5 ${topStrip}`} />

            <div className="p-5">

              {/* ── Area header ── */}
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h4 className="text-lg font-black text-gray-900">{area}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">נדרש: {required} כוננים</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Progress pill */}
                  <span className={`text-sm font-bold px-3 py-1.5 rounded-full border ${progressPill}`}>
                    {confirmed}/{required} מאושרים
                  </span>

                  {/* Auto-suggest for this area */}
                  {available > 0 && onAutoSuggest && confirmed < required && (
                    <button
                      onClick={() => onAutoSuggest(area)}
                      className="text-xs font-medium bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 hover:border-orange-300 px-3 py-1.5 rounded-xl transition"
                    >
                      הצע אוטומטית
                    </button>
                  )}
                </div>
              </div>

              {/* ── Volunteer rows ── */}
              {areaShifts.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-5 bg-gray-50 rounded-xl border border-gray-100">
                  אין זמינות לאזור זה
                </p>
              ) : (
                <div className="space-y-2">
                  {areaShifts
                    .filter(s => s.status !== 'not_available')
                    .sort((a, b) => {
                      const order = { available: 0, confirmed: 1, cancelled: 2 }
                      return (order[a.status] ?? 3) - (order[b.status] ?? 3)
                    })
                    .map(shift => {
                      const chip       = STATUS_CHIP[shift.status] || STATUS_CHIP.available
                      const monthCount = monthShiftCounts?.[shift.volunteerId] ?? 0
                      const volCode    = allVolunteers.find(v => v.id === shift.volunteerId)?.volunteerId

                      return (
                        <div
                          key={shift.id}
                          className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-100"
                        >
                          {/* Volunteer info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm truncate">
                                {shift.volunteerName}
                              </span>
                              {volCode && (
                                <span className="text-xs font-mono text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded-md shrink-0">
                                  {volCode}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{monthCount} שב׳ החודש</p>
                          </div>

                          {/* Status badge + action buttons */}
                          <div className="flex items-center gap-2 shrink-0 mr-3">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${chip.cls}`}>
                              {chip.label}
                            </span>

                            {shift.status === 'available' && (
                              <>
                                <button
                                  onClick={() => handleConfirm(shift.id)}
                                  className="text-xs font-semibold bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 hover:border-green-300 px-3 py-1.5 rounded-xl transition"
                                >
                                  אשר
                                </button>
                                <button
                                  onClick={() => handleReject(shift.id)}
                                  className="text-xs font-semibold bg-gray-50 hover:bg-red-50 text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-xl transition"
                                >
                                  דחה
                                </button>
                              </>
                            )}

                            {shift.status === 'confirmed' && (
                              <button
                                onClick={() => handleReject(shift.id)}
                                className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-xl transition"
                              >
                                בטל
                              </button>
                            )}

                            {shift.status === 'cancelled' && (
                              <button
                                onClick={() => handleConfirm(shift.id)}
                                className="text-xs font-semibold bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-1.5 rounded-xl transition"
                              >
                                אשר מחדש
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}

                  {/* Not-available count (collapsed) */}
                  {areaShifts.filter(s => s.status === 'not_available').length > 0 && (
                    <p className="text-xs text-gray-400 text-center pt-1 pb-0.5">
                      {areaShifts.filter(s => s.status === 'not_available').length} דיווחו כלא זמינים
                    </p>
                  )}
                </div>
              )}

              {/* ── Manual-add ── */}
              {addable.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400 font-semibold mb-2.5">הוסף מתנדב ידנית</p>
                  <div className="flex gap-2">
                    <select
                      value={addSelections[area] || ''}
                      onChange={e => setAddSelections(prev => ({ ...prev, [area]: e.target.value }))}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-orange-400"
                    >
                      <option value="">בחר מתנדב...</option>
                      {addable.map(v => (
                        <option key={v.id} value={v.id}>{v.firstName} {v.lastName}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleManualAdd(area)}
                      disabled={addSaving || !addSelections[area]}
                      className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition whitespace-nowrap"
                    >
                      {addSaving ? '...' : 'הוסף ואשר'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        )
      })}
    </div>
  )
}
