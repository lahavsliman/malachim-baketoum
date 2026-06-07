import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute({ children, allowedRoles, allowedRoleTypes }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" text="טוען..." />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  if (allowedRoleTypes && user.role === 'role_holder') {
    const userRoleTypes = user.roleTypes?.length ? user.roleTypes : user.roleType ? [user.roleType] : []
    if (!userRoleTypes.some(rt => allowedRoleTypes.includes(rt))) {
      return <Navigate to="/" replace />
    }
  }

  return children
}
