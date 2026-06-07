import { useState } from 'react'
import { confirmVolunteer, rejectVolunteer, adminAddConfirmedVolunteer } from '../../firebase/shabbatShifts'

const STATUS_CHIP = {
  available:     { label: '⏳ ממתין',  cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
  confirmed:     { label: '✅ מאושר',  cls: 'bg-green-500/15  text-green-300  border-green-500/30'  },
  cancelled:     { label: '❌ נדחה',   cls: 'bg-gray-800       text-gray-500   border-gray-700'      },
  not_available: { label: '😔 לא זמין', cls: 'bg-gray-800      text-gray-500   border-gray-700'      },
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

  // Collect areas: from settings + any submitted but unconfigured areas
  const configuredNames = new Set(areas.map(a => a.name))
  const extraAreas = [...new Set(shifts.map(s => s.area).filter(a => a && !configuredNames.has(a)))]
  const allAreas = [
    ...areas,
    ...extraAreas.map(name => ({ name, required: 1 })),
  ]

  return (
    <div className="space-y-4">
      {allAreas.map(({ name: area, required }) => {
        const areaShifts = shifts.filter(s => s.area === area)
        const confirmed = areaShifts.filter(s => s.status === 'confirmed').length
        const available = areaShifts.filter(s => s.status === 'available').length

        const borderColor =
          confirmed < required   ? 'border-red-500/40    bg-red-500/5'    :
          confirmed > required   ? 'border-yellow-500/40 bg-yellow-500/5' :
                                   'border-green-500/40  bg-green-500/5'

        const countColor =
          confirmed < required ? 'text-red-400' :
          confirmed > required ? 'text-yellow-400' :
                                 'text-green-400'

        return (
          <div key={area} className={`border rounded-2xl p-4 ${borderColor}`}>
            {/* Area header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-bold text-gray-200">{area}</h4>
                <p className="text-xs text-gray-500 mt-0.5">נדרש: {required} כוננים</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-bold text-sm ${countColor}`}>
                  {confirmed}/{required} מאושרים
                </span>
                {available > 0 && onAutoSuggest && confirmed < required && (
                  <button
                    onClick={() => onAutoSuggest(area)}
                    className="text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 px-2 py-1 rounded-lg transition border border-orange-500/20"
                  >
                    🤖 הצע
                  </button>
                )}
              </div>
            </div>

            {/* Volunteer rows */}
            {areaShifts.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-2">אין זמינות לאזור זה</p>
            ) : (
              <div className="space-y-2">
                {areaShifts
                  .filter(s => s.status !== 'not_available')
                  .sort((a, b) => {
                    // Show available first, then confirmed, then cancelled
                    const order = { available: 0, confirmed: 1, cancelled: 2 }
                    return (order[a.status] ?? 3) - (order[b.status] ?? 3)
                  })
                  .map(shift => {
                    const chip = STATUS_CHIP[shift.status] || STATUS_CHIP.available
                    const monthCount = monthShiftCounts?.[shift.volunteerId] ?? 0

                    return (
                      <div
                        key={shift.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-gray-900/60 border border-gray-800"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-gray-200 truncate">{shift.volunteerName}</span>
                          <span className="text-xs text-gray-500 shrink-0">
                            ({monthCount} שב׳ החודש)
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 mr-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${chip.cls}`}>
                            {chip.label}
                          </span>

                          {shift.status === 'available' && (
                            <>
                              <button
                                onClick={() => handleConfirm(shift.id)}
                                className="text-xs bg-green-500/20 hover:bg-green-500/30 text-green-300 px-2 py-1 rounded-lg transition"
                              >
                                אשר
                              </button>
                              <button
                                onClick={() => handleReject(shift.id)}
                                className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2 py-1 rounded-lg transition"
                              >
                                דחה
                              </button>
                            </>
                          )}

                          {shift.status === 'confirmed' && (
                            <button
                              onClick={() => handleReject(shift.id)}
                              className="text-xs text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-500/40 px-2 py-0.5 rounded-lg transition"
                            >
                              בטל
                            </button>
                          )}

                          {shift.status === 'cancelled' && (
                            <button
                              onClick={() => handleConfirm(shift.id)}
                              className="text-xs bg-green-500/15 hover:bg-green-500/25 text-green-400 px-2 py-1 rounded-lg transition"
                            >
                              אשר מחדש
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}

                {/* Not available volunteers (collapsed) */}
                {areaShifts.filter(s => s.status === 'not_available').length > 0 && (
                  <p className="text-xs text-gray-600 text-center pt-1">
                    {areaShifts.filter(s => s.status === 'not_available').length} דיווחו כלא זמינים
                  </p>
                )}
              </div>
            )}

            {/* Manual-add: pick any shabbat volunteer not already in this shabbat */}
            {allVolunteers.length > 0 && (() => {
              const assignedIds = new Set(areaShifts.map(s => s.volunteerId))
              const addable = allVolunteers.filter(v => !assignedIds.has(v.id))
              if (!addable.length) return null
              return (
                <div className="flex gap-2 items-center mt-3 pt-3 border-t border-gray-800/60">
                  <select
                    value={addSelections[area] || ''}
                    onChange={e => setAddSelections(prev => ({ ...prev, [area]: e.target.value }))}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-2 py-1.5 text-gray-300 text-xs focus:outline-none focus:border-orange-500"
                  >
                    <option value="">+ הוסף מתנדב ידנית</option>
                    {addable.map(v => (
                      <option key={v.id} value={v.id}>{v.firstName} {v.lastName}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleManualAdd(area)}
                    disabled={addSaving || !addSelections[area]}
                    className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white px-2.5 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap"
                  >
                    {addSaving ? '...' : 'הוסף ואשר'}
                  </button>
                </div>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}
