import { useMemo } from 'react'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Leaderboard({ shifts, currentUserId }) {
  const leaderboard = useMemo(() => {
    const counts = {}
    const names = {}
    shifts.forEach(s => {
      counts[s.volunteerId] = (counts[s.volunteerId] || 0) + 1
      names[s.volunteerId] = s.volunteerName
    })
    return Object.entries(counts)
      .map(([id, count]) => ({ id, name: names[id], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [shifts])

  if (!leaderboard.length) return null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <h3 className="font-bold text-gray-200 mb-4 flex items-center gap-2">
        <span>🏆</span> כבוד הלילה — מובילים החודש
      </h3>
      <div className="space-y-2">
        {leaderboard.map((v, i) => {
          const isMe = v.id === currentUserId
          return (
            <div
              key={v.id}
              className={`flex items-center justify-between py-2 px-3 rounded-xl transition
                ${isMe
                  ? 'bg-orange-500/20 border border-orange-500/30'
                  : 'bg-gray-800/40'
                }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg w-8 text-center">
                  {MEDALS[i] ?? <span className="text-gray-500 font-bold text-sm">{i + 1}</span>}
                </span>
                <span className={`font-medium ${isMe ? 'text-orange-300' : 'text-gray-200'}`}>
                  {v.name}
                  {isMe && <span className="text-xs mr-1 opacity-70">(אתה)</span>}
                </span>
              </div>
              <span className={`text-sm font-bold px-3 py-0.5 rounded-full
                ${isMe ? 'bg-orange-500/30 text-orange-200' : 'bg-orange-500/20 text-orange-300'}`}>
                {v.count} {v.count === 1 ? 'שיבוץ' : 'שיבוצים'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
