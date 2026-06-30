import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Bell } from '@phosphor-icons/react'
import { registerFcmToken } from './firebase/messaging'
import Header from './shared/Header'
import Sidebar from './shared/Sidebar'
import ProtectedRoute from './shared/ProtectedRoute'
import LoadingSpinner from './shared/LoadingSpinner'
const LoginPage            = lazy(() => import('./pages/LoginPage'))
const Dashboard            = lazy(() => import('./pages/Dashboard'))
const BranchManagementPage = lazy(() => import('./pages/BranchManagementPage'))
const SystemAdminPage      = lazy(() => import('./pages/SystemAdminPage'))
const NightShiftsPage      = lazy(() => import('./modules/night-shifts/NightShiftsPage'))
const ShabbatPage          = lazy(() => import('./modules/shabbat/ShabbatPage'))
const BuildingCodesPage    = lazy(() => import('./modules/building-codes/BuildingCodesPage'))
const MessagesPage         = lazy(() => import('./modules/messages/MessagesPage'))
const NotificationsPage    = lazy(() => import('./modules/notifications/NotificationsPage'))
const EventsPage           = lazy(() => import('./modules/events/EventsPage'))
const TransportPage        = lazy(() => import('./pages/TransportPage'))
const MyTransportPage      = lazy(() => import('./pages/MyTransportPage'))
const ContactsPage         = lazy(() => import('./pages/ContactsPage'))
const ReportsPage          = lazy(() => import('./modules/reports/ReportsPage'))
import InstallPrompt from './shared/InstallPrompt'
import CriticalMessageGate from './shared/CriticalMessageGate'
import EventResponseGate from './shared/EventResponseGate'

// ── Notification permission banner ────────────────────────────────────────────
function NotificationBanner({ onApprove, onDismiss }) {
  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-80 bg-gray-100 border border-gray-200 rounded-2xl p-4 shadow-2xl z-40 flex flex-col gap-3" dir="rtl">
      <div className="flex items-start gap-3">
        <Bell size={22} className="mt-0.5 shrink-0" />
        <p className="text-gray-800 text-sm leading-relaxed">
          כדי לקבל תזכורות לתורנויות, אנא אשר קבלת התראות
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={onDismiss}
          className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-xl text-sm transition">
          לא עכשיו
        </button>
        <button onClick={onApprove}
          className="flex-1 bg-orange-500 hover:bg-orange-400 text-white font-bold py-2 rounded-xl text-sm transition">
          אשר התראות
        </button>
      </div>
    </div>
  )
}

function AppLayout() {
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Show banner once per session if permission not yet decided
  const [showBanner, setShowBanner] = useState(() => {
    if (!('Notification' in window)) return false
    if (Notification.permission !== 'default') return false
    return !sessionStorage.getItem('notifPromptShown')
  })

  // Silently register token if permission already granted
  useEffect(() => {
    if (user?.id && 'Notification' in window && Notification.permission === 'granted') {
      registerFcmToken(user.id)
    }
  }, [user?.id])

  const handleApprove = async () => {
    setShowBanner(false)
    sessionStorage.setItem('notifPromptShown', '1')
    if (!('Notification' in window)) return
    const permission = await Notification.requestPermission()
    if (permission === 'granted' && user?.id) {
      await registerFcmToken(user.id)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    sessionStorage.setItem('notifPromptShown', '1')
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header onMenuToggle={() => setSidebarOpen(o => !o)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <Suspense fallback={<div className="flex justify-center items-center py-20"><LoadingSpinner size="lg" text="טוען..." /></div>}>
            <Routes>

              <Route path="/" element={<Dashboard />} />
              <Route path="/night-shifts" element={<NightShiftsPage />} />
              <Route path="/shabbat" element={<ShabbatPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/transport" element={<TransportPage />} />
              <Route path="/my-transport" element={<MyTransportPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route
                path="/building-codes"
                element={
                  <ProtectedRoute allowedRoles={['system_admin', 'branch_head', 'branch_deputy', 'role_holder']}>
                    <BuildingCodesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute allowedRoles={['system_admin', 'branch_head', 'branch_deputy']}>
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/branch-management"
                element={
                  <ProtectedRoute allowedRoles={['system_admin', 'branch_head', 'branch_deputy']}>
                    <BranchManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/system-admin"
                element={
                  <ProtectedRoute allowedRoles={['system_admin']}>
                    <SystemAdminPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <EventResponseGate />
      <CriticalMessageGate />
      <InstallPrompt />
      {showBanner && <NotificationBanner onApprove={handleApprove} onDismiss={handleDismiss} />}
    </div>
  )
}

function AppRouter() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white gap-4">
        <img src="/logo.svg" alt="לוגו" className="h-32 w-32 object-contain mb-6" />
        <LoadingSpinner size="lg" text="טוען..." />
      </div>
    )
  }

  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen"><LoadingSpinner size="lg" text="טוען..." /></div>}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route
          path="/*"
          element={user ? <AppLayout /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AuthProvider>
  )
}
