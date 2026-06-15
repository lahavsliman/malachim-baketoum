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

  // Mirror useRole's legacy handling: a user stored as role='volunteer' but with
  // roleTypes populated is effectively a role_holder (un-migrated Firestore data).
  const userRoleTypes = user.roleTypes?.length
    ? user.roleTypes
    : user.roleType ? [user.roleType] : []
  const effectiveRole =
    userRoleTypes.length > 0 &&
    user.role !== 'system_admin' &&
    user.role !== 'branch_head' &&
    user.role !== 'branch_deputy'
      ? 'role_holder'
      : user.role

  if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
    return <Navigate to="/" replace />
  }

  if (allowedRoleTypes && effectiveRole === 'role_holder') {
    if (!userRoleTypes.some(rt => allowedRoleTypes.includes(rt))) {
      return <Navigate to="/" replace />
    }
  }

  return children
}
