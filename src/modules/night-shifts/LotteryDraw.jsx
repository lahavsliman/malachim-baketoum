import { useState } from 'react'
import { getLotteryEligible, saveLotteryResult } from '../../firebase/lottery'
import { format } from 'date-fns'

export default function LotteryDraw({ shifts, volunteers, branchId, year, month, onClose }) {
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState(null)
  const [saved, setSaved] = useState(false)

  const tickets = getLotteryEligible(shifts, volunteers)
  const eligible = [...new Set(tickets.map(t => t.id))].length

  const runLottery = async () => {
    if (!tickets.length) return
    setSpinning(true)
    setWinner(null)

    // Animated countdown
    await new Promise(r => setTimeout(r, 2000))

    const winner = tickets[Math.floor(Math.random() * tickets.length)]
    setWinner(winner)
    setSpinning(false)

    // Save result
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    await saveLotteryResult(branchId, monthStr, winner.id, `${winner.firstName} ${winner.lastName}`, tickets.length)
    setSaved(true)
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="text-center mb-6">
          <span className="text-5xl">🎰</span>
          <h2 className="text-2xl font-black text-gray-900 mt-3">הגרלת לילות</h2>
          <p className="text-gray-500 text-sm mt-1">
            {month}/{year} — {eligible} מתנדבים זכאים
          </p>
        </div>

        {!winner && !spinning && (
          <div className="text-center">
            {tickets.length === 0 ? (
              <p className="text-gray-500 mb-4">אין מתנדבים זכאים להגרלה החודש</p>
            ) : (
              <p className="text-gray-700 mb-4">
                {tickets.length} כרטיסים בהגרלה ({eligible} מתנדבים)
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl transition"
              >
                סגור
              </button>
              <button
                onClick={runLottery}
                disabled={!tickets.length}
                className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition"
              >
                הגרל! 🎲
              </button>
            </div>
          </div>
        )}

        {spinning && (
          <div className="text-center py-6">
            <div className="text-6xl animate-bounce mb-4">🎲</div>
            <p className="text-orange-400 font-bold text-xl animate-pulse">מגריל...</p>
            <div className="flex justify-center gap-1 mt-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {winner && (
          <div className="text-center">
            <div className="text-6xl mb-3">🎉</div>
            <h3 className="text-2xl font-black text-orange-400 mb-2">
              {winner.firstName} {winner.lastName}
            </h3>
            <p className="text-gray-700 text-sm mb-2">זוכה בהגרלת לילות!</p>
            {saved && (
              <p className="text-green-400 text-xs bg-green-500/10 rounded-xl p-2 border border-green-500/20 mb-4">
                ✓ תוצאה נשמרה במערכת
              </p>
            )}
            <button
              onClick={onClose}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2.5 rounded-xl transition mt-2"
            >
              סגור
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
