import { useMemo } from 'react'
import { Trophy } from '@phosphor-icons/react'

const RANK_STYLES = [
  'bg-amber-400 text-white',          // 1st — gold
  'bg-gray-400  text-white',          // 2nd — silver
  'bg-amber-700 text-white',          // 3rd — bronze
]

function RankBadge({ rank }) {
  const cls = RANK_STYLES[rank] ?? 'bg-gray-200 text-gray-500'
  return (
    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${cls}`}>
      {rank + 1}
    </span>
  )
}

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
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Trophy size={18} className="text-amber-400" /> כבוד הלילה — מובילים החודש
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
                  : 'bg-gray-100'
                }`}
            >
              <div className="flex items-center gap-2">
                <RankBadge rank={i} />
                <span className={`font-medium ${isMe ? 'text-orange-600' : 'text-gray-800'}`}>
                  {v.name}
                  {isMe && <span className="text-xs mr-1 text-orange-400">(אתה)</span>}
                </span>
              </div>
              <span className={`text-sm font-bold px-3 py-0.5 rounded-full
                ${isMe ? 'bg-orange-100 text-orange-800' : 'bg-orange-100 text-orange-700'}`}>
                {v.count} {v.count === 1 ? 'שיבוץ' : 'שיבוצים'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
