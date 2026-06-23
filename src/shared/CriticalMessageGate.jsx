import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getPendingCriticalMessages, submitMessageReceipt } from '../firebase/messages'
import { Warning, CheckCircle } from '@phosphor-icons/react'

export default function CriticalMessageGate() {
  const { user } = useAuth()
  const [queue, setQueue] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user?.id || !user?.branchId) return
    getPendingCriticalMessages(user.branchId, user.id)
      .then(setQueue)
      .catch(() => setQueue([]))
  }, [user?.id, user?.branchId])

  if (queue.length === 0) return null
  const msg = queue[0]

  const handleAck = async (choice = null) => {
    setSubmitting(true)
    try {
      await submitMessageReceipt(msg.id, msg.branchId, user.id, `${user.firstName} ${user.lastName}`, { status: 'read', choice })
      setQueue(q => q.slice(1))
    } catch (e) { console.error(e) }
    finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" dir="rtl">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border-2 border-red-300">
        <div className="flex items-center gap-2 mb-4">
          <Warning size={26} weight="fill" className="text-red-500 shrink-0" />
          <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">הודעה קריטית</span>
        </div>
        <h2 className="text-lg font-black text-gray-900 mb-2 leading-snug">{msg.title}</h2>
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-2">{msg.body}</p>
        <p className="text-xs text-gray-400 mb-5">מאת: {msg.senderName}</p>

        {msg.messageType === 'choice' ? (
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
          <button disabled={submitting} onClick={() => handleAck()}
            className="w-full bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2">
            <CheckCircle size={18} /> {submitting ? 'שומר...' : 'קראתי ואני מאשר'}
          </button>
        )}

        {queue.length > 1 && (
          <p className="text-xs text-gray-400 text-center mt-3">עוד {queue.length - 1} הודעות קריטיות ממתינות</p>
        )}
      </div>
    </div>
  )
}
