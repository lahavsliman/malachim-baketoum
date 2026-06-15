import { useState } from 'react'
import { loginUser } from '../firebase/auth'

export default function LoginPage() {
  const [idNumber, setIdNumber] = useState('')
  const [volunteerId, setVolunteerId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!idNumber || !volunteerId) {
      setError('נא למלא את כל השדות')
      return
    }
    setLoading(true)
    setError('')
    try {
      await loginUser(idNumber.trim(), volunteerId.trim().padStart(6, '0'))
      // No navigate() here — AppRouter redirects automatically once
      // AuthContext finishes fetching the Firestore user doc
    } catch (err) {
      // Specific Hebrew messages for blocked accounts/branches
      if (err.code === 'auth/branch-inactive' || err.code === 'auth/user-inactive') {
        setError(err.message)
      } else {
        setError('פרטים שגויים, נסה שנית')
      }
      setLoading(false)
    }
    // Leave loading=true while AuthContext fetches — the spinner shows naturally
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="לוגו" className="h-20 w-20 object-contain mx-auto mb-4" />
          <h1 className="text-3xl font-black text-orange-500">מלאכים בכתום</h1>
          <p className="text-gray-500 mt-2 text-sm">מערכת פנימית לסניפים</p>
          <p className="text-gray-500 text-xs mt-1">איחוד הצלה</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xl">
          <h2 className="text-lg font-bold text-gray-800 mb-5 text-center">כניסה למערכת</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                תעודת זהות
              </label>
              <input
                type="text"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="הזן מספר ת.ז."
                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3
                           text-gray-900 placeholder-gray-400
                           focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500
                           transition"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                קוד כונן
              </label>
              <input
                type="password"
                value={volunteerId}
                onChange={(e) => setVolunteerId(e.target.value)}
                placeholder="הזן קוד כונן"
                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3
                           text-gray-900 placeholder-gray-400
                           focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500
                           transition"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/50
                         text-white font-bold py-3 px-6 rounded-xl
                         transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]
                         disabled:cursor-not-allowed disabled:transform-none
                         flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>מתחבר...</span>
                </>
              ) : 'כניסה'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          בעיות בכניסה? פנה לראש הסניף
        </p>
      </div>
    </div>
  )
}
