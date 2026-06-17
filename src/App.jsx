import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Bell } from '@phosphor-icons/react'
import { registerFcmToken } from './firebase/messaging'
import Header from './shared/Header'
import Sidebar from './shared/Sidebar'
import ProtectedRoute from './shared/ProtectedRoute'
import LoadingSpinner from './shared/LoadingSpinner'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import BranchManagementPage from './pages/BranchManagementPage'
import SystemAdminPage from './pages/SystemAdminPage'
import NightShiftsPage from './modules/night-shifts/NightShiftsPage'
import ShabbatPage from './modules/shabbat/ShabbatPage'
import BuildingCodesPage from './modules/building-codes/BuildingCodesPage'
import MessagesPage from './modules/messages/MessagesPage'
import NotificationsPage from './modules/notifications/NotificationsPage'
import EventsPage from './modules/events/EventsPage'
import TransportPage from './pages/TransportPage'
import MyTransportPage from './pages/MyTransportPage'
import ReportsPage from './modules/reports/ReportsPage'
import InstallPrompt from './shared/InstallPrompt'

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
    if (user?.id && Notification.permission === 'granted') {
      registerFcmToken(user.id)
    }
  }, [user?.id])

  const handleApprove = async () => {
    setShowBanner(false)
    sessionStorage.setItem('notifPromptShown', '1')
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
          <Routes>

            <Route path="/" element={<Dashboard />} />
            <Route path="/night-shifts" element={<NightShiftsPage />} />
            <Route path="/shabbat" element={<ShabbatPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/transport" element={<TransportPage />} />
            <Route path="/my-transport" element={<MyTransportPage />} />
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
        </main>
      </div>
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
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/*"
        element={user ? <AppLayout /> : <Navigate to="/login" replace />}
      />
    </Routes>
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
