import { collection, addDoc, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore'
import { db } from './config'

export const saveLotteryResult = async (branchId, month, winnerId, winnerName, totalParticipants) => {
  return addDoc(collection(db, 'lottery_results'), {
    branchId,
    month,
    winnerId,
    winnerName,
    totalParticipants,
    drawnAt: Timestamp.now()
  })
}

export const getLotteryResults = async (branchId) => {
  const q = query(
    collection(db, 'lottery_results'),
    where('branchId', '==', branchId),
    orderBy('drawnAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// Returns eligible volunteers: had ≥1 shift in the last 2 months
export const getLotteryEligible = (shifts, volunteers) => {
  const now = new Date()
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const cutoff = twoMonthsAgo.toISOString().slice(0, 10)

  const shiftsByVolunteer = {}
  shifts.forEach(s => {
    if (s.date >= cutoff) {
      shiftsByVolunteer[s.volunteerId] = (shiftsByVolunteer[s.volunteerId] || 0) + 1
    }
  })

  // Extra shifts = extra tickets
  const tickets = []
  volunteers.forEach(v => {
    const count = shiftsByVolunteer[v.id] || 0
    if (count > 0) {
      for (let i = 0; i < count; i++) tickets.push(v)
    }
  })
  return tickets
}
