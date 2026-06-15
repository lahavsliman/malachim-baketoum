import { useEffect } from 'react'
import confetti from 'canvas-confetti'

export default function ConfettiAnimation({ trigger }) {
  useEffect(() => {
    if (!trigger) return
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#F97316', '#FB923C', '#FDBA74', '#ffffff', '#FED7AA']
    })
  }, [trigger])
  return null
}
