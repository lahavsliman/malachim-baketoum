import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getPendingAckMessages, submitMessageReceipt } from '../firebase/messages'
import { Envelope, CheckCircle } from '@phosphor-icons/react'

export default function MessageAckGate() {
  const { user } = useAuth()
  const [queue, setQueue] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!user?.id || !user?.branchId) return
    getPendingAckMessages(user.branchId, user.id)
      .then(setQueue)
      .catch(() => setQueue([]))
  }, [user?.id, user?.branchId])

  if (queue.length === 0) return null
  const msg = queue[0]
  const isChoice = msg.messageType === 'choice'

  const handleAck = async (choice = null) => {
    setSubmitting(true)
    try {
      await submitMessageReceipt(msg.id, msg.branchId, user.id, `${user.firstName} ${user.lastName}`, { status: 'read', choice })
      setChecked(false)            // reset for next message in queue
      setQueue(q => q.slice(1))
    } catch (e) { console.error(e) }
    finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4" dir="rtl">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
            <Envelope size={20} className="text-orange-500" weight="fill" />
          </div>
          <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">הודעה חדשה</span>
        </div>

        <h2 className="text-lg font-bold text-gray-900 mb-2 leading-snug">{msg.title}</h2>
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-3">{msg.body}</p>
        <p className="text-xs text-gray-400 mb-5">מאת: {msg.senderName}</p>

        {isChoice ? (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">יש לבחור תשובה כדי להמשיך:</p>
            <div className="flex flex-wrap gap-2">
              {(msg.choiceOptions || []).map((opt, i) => (
                <button key={i} disabled={submitting} onClick={() => handleAck(opt)}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white transition">
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Confirmation checkbox */}
            <label className="flex items-center gap-2.5 cursor-pointer bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={e => setChecked(e.target.checked)}
                className="w-4 h-4 accent-orange-500 shrink-0"
              />
              <span className="text-sm text-gray-700">קראתי את ההודעה ואני מאשר/ת</span>
            </label>
            <button
              disabled={submitting || !checked}
              onClick={() => handleAck()}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
            >
              <CheckCircle size={18} /> {submitting ? 'שומר...' : 'אישור'}
            </button>
          </>
        )}

        {queue.length > 1 && (
          <p className="text-xs text-gray-400 text-center mt-3">עוד {queue.length - 1} הודעות ממתינות לאישורך</p>
        )}
      </div>
    </div>
  )
}
