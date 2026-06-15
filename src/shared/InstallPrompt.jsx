import { useState, useEffect } from 'react'
import { DeviceMobile } from '@phosphor-icons/react'

const DISMISSED_KEY = 'pwa_install_dismissed_v1'

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isInStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

export default function InstallPrompt() {
  const [mode, setMode] = useState(null)           // 'android' | 'ios' | null
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    // Already installed as PWA — never show
    if (isInStandaloneMode()) return
    // Previously dismissed — respect the choice
    if (localStorage.getItem(DISMISSED_KEY)) return

    if (isIOS()) {
      // Small delay so the UI isn't the first thing the user sees
      const t = setTimeout(() => setMode('ios'), 3000)
      return () => clearTimeout(t)
    }

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setMode('android')
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    setInstalling(true)
    try {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        localStorage.setItem(DISMISSED_KEY, '1')
      }
    } finally {
      setDeferredPrompt(null)
      setMode(null)
      setInstalling(false)
    }
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setMode(null)
  }

  if (!mode) return null

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 p-3 sm:p-4 lg:bottom-4 lg:right-4 lg:left-auto"
      dir="rtl"
    >
      <div className="bg-white border border-orange-500/40 rounded-2xl shadow-2xl p-4 max-w-sm w-full">

        {/* Header row */}
        <div className="flex items-start gap-3">
          <DeviceMobile size={22} className="shrink-0 text-gray-600" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm">התקן את האפליקציה</p>
            <p className="text-orange-400 text-xs font-medium">מלאכים בכתום</p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-500 hover:text-gray-700 transition text-lg leading-none shrink-0 p-1"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        {/* Android install */}
        {mode === 'android' && (
          <>
            <p className="text-gray-500 text-xs mt-2 mb-3">
              התקן על הטלפון שלך לגישה מהירה — עובד גם ללא אינטרנט 🚀
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDismiss}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-xl text-sm transition"
              >
                לא עכשיו
              </button>
              <button
                onClick={handleInstall}
                disabled={installing}
                className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-sm transition"
              >
                {installing ? 'מתקין...' : 'התקן 📲'}
              </button>
            </div>
          </>
        )}

        {/* iOS manual instructions */}
        {mode === 'ios' && (
          <div className="mt-2">
            <p className="text-gray-500 text-xs mb-2">
              להוספה למסך הבית:
            </p>
            <ol className="space-y-1 text-xs text-gray-700">
              <li className="flex items-center gap-2">
                <span className="text-orange-400 font-bold shrink-0">1.</span>
                לחץ על
                <span className="inline-flex items-center gap-0.5 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-800">
                  Share
                  <span className="text-blue-400">⬆</span>
                </span>
                בתחתית Safari
              </li>
              <li className="flex items-center gap-2">
                <span className="text-orange-400 font-bold shrink-0">2.</span>
                בחר
                <span className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-800 whitespace-nowrap">
                  Add to Home Screen
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-orange-400 font-bold shrink-0">3.</span>
                לחץ <span className="text-orange-400 font-medium">Add</span> בפינה הימנית
              </li>
            </ol>
            <button
              onClick={handleDismiss}
              className="mt-3 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-xl text-sm transition"
            >
              הבנתי
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
