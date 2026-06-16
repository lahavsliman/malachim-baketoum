import { useState } from 'react'
import { deleteCode } from '../../firebase/buildingCodes'
import { Key, House, Eye, EyeSlash, DoorOpen, Clock, ClipboardText, PencilSimple, Trash } from '@phosphor-icons/react'

const FIELD_LABELS = {
  city: 'עיר', street: 'רחוב', buildingNumber: 'מספר בניין',
  entrance: 'כניסה', code: 'קוד', notes: 'הערות',
}

const fmtDate = (ts) => {
  if (!ts) return ''
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export default function CodesTable({ codes, onEdit, onRefresh, canEdit, canDelete }) {
  const [revealed, setRevealed] = useState({})
  const [expanded, setExpanded] = useState({})
  const [deleting, setDeleting] = useState(null)

  const toggleReveal = id => setRevealed(r => ({ ...r, [id]: !r[id] }))
  const toggleLog = id => setExpanded(e => ({ ...e, [id]: !e[id] }))

  const handleDelete = async (code) => {
    if (!confirm(`האם למחוק את הקוד של ${code.street} ${code.buildingNumber}?`)) return
    setDeleting(code.id)
    try { await deleteCode(code.id); onRefresh() }
    finally { setDeleting(null) }
  }

  if (!codes?.length) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Key size={40} className="text-gray-300 mb-3 mx-auto" />
        <p>לא נמצאו קודים</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {codes.map(code => (
        <div key={code.id} className="bg-white border border-gray-200 rounded-2xl p-4 transition hover:border-gray-200">
          {/* Top row: address + actions */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-800 text-base flex items-center gap-1.5">
                <House size={15} className="text-gray-400 shrink-0" /> {code.city}, {code.street} {code.buildingNumber}
                {code.entrance && <span className="text-gray-500"> — כניסה {code.entrance}</span>}
              </p>

              {/* Code reveal */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-gray-500 flex items-center gap-1"><Key size={13} /> קוד:</span>
                <span
                  className={`font-mono font-bold text-lg tracking-widest ${revealed[code.id] ? 'text-orange-400' : 'text-gray-700 select-none'}`}
                >
                  {revealed[code.id] ? code.code : '••••••'}
                </span>
                <button
                  onClick={() => toggleReveal(code.id)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-lg transition inline-flex items-center gap-1 whitespace-nowrap border ${
                    revealed[code.id]
                      ? 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      : 'border-orange-300 text-gray-800 hover:bg-orange-50'
                  }`}
                >
                  {revealed[code.id]
                    ? <><EyeSlash size={14} /> הסתר</>
                    : <><Eye size={14} /> הצג קוד</>
                  }
                </button>
              </div>

              {/* Entrance */}
              {code.entrance && (
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1"><DoorOpen size={13} /> כניסה: {code.entrance}</p>
              )}

              {/* Notes */}
              {code.notes && (
                <p className="text-sm text-gray-500 mt-1">📝 {code.notes}</p>
              )}

              {/* Meta row */}
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-600">
                {code.updatedAt && (
                  <span className="flex items-center gap-1"><Clock size={12} /> עודכן: {fmtDate(code.updatedAt)}{code.updatedByName ? ` ע״י ${code.updatedByName}` : ''}</span>
                )}
                {(code.changeLog?.length > 0) && (
                  <button
                    onClick={() => toggleLog(code.id)}
                    className="text-orange-500/70 hover:text-orange-400 transition underline-offset-2 hover:underline"
                  >
                    <ClipboardText size={13} className="inline ml-1" /> היסטוריה ({code.changeLog.length})
                  </button>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 shrink-0">
              {canEdit && (
                <button
                  onClick={() => onEdit(code)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition border border-gray-200"
                >
                  <PencilSimple size={13} className="inline ml-1" /> ערוך
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => handleDelete(code)}
                  disabled={deleting === code.id}
                  className="text-xs bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-400 px-3 py-1.5 rounded-lg transition border border-red-500/20"
                >
                  {deleting === code.id ? '...' : <Trash size={14} />}
                </button>
              )}
            </div>
          </div>

          {/* Change log expansion */}
          {expanded[code.id] && code.changeLog?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
              <p className="text-xs text-gray-500 font-medium">היסטוריית שינויים</p>
              {[...code.changeLog].reverse().map((entry, i) => (
                <div key={i} className="text-xs bg-gray-100 rounded-xl px-3 py-2 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{entry.changedByName || entry.changedBy}</span>
                    <span className="text-gray-600">{fmtDate(entry.changedAt)}</span>
                  </div>
                  <p className="text-gray-700">
                    <span className="text-gray-500">{FIELD_LABELS[entry.field] || entry.field}: </span>
                    <span className="line-through text-red-400/70">{entry.oldValue || '—'}</span>
                    {' → '}
                    <span className="text-green-400/80">{entry.newValue || '—'}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
