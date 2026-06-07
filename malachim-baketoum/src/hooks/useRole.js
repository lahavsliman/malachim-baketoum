import { useAuth } from '../context/AuthContext'

export const useRole = () => {
  const { user } = useAuth()

  const role = user?.role
  // Support both the array (roleTypes) and legacy singular string (roleType)
  const roleTypes = user?.roleTypes?.length
    ? user.roleTypes
    : user?.roleType ? [user.roleType] : []
  const branchId = user?.branchId

  const isSystemAdmin = role === 'system_admin'
  const isBranchHead = role === 'branch_head' || role === 'branch_deputy'

  // Treat as role_holder if the role field says so, OR if roleTypes are present
  // but the role field was never migrated from 'volunteer' (legacy Firestore data).
  const isRoleHolder = role === 'role_holder' ||
    (roleTypes.length > 0 && !isSystemAdmin && !isBranchHead)

  const isVolunteer = !isSystemAdmin && !isBranchHead && !isRoleHolder

  const isNightCoordinator   = isRoleHolder && roleTypes.includes('night_coordinator')
  const isDispatcher         = isRoleHolder && roleTypes.includes('dispatcher')
  const isShabbatCoordinator = isRoleHolder && roleTypes.includes('shabbat_coordinator')
  const isEventsCoordinator  = isRoleHolder && roleTypes.includes('events_coordinator')

  if (process.env.NODE_ENV === 'development') {
    console.log('[useRole]', {
      'user.role': role,
      'user.roleTypes': roleTypes,
      isRoleHolder,
      isNightCoordinator,
      isShabbatCoordinator,
      isDispatcher,
    })
  }

  const canManageNightShifts  = isSystemAdmin || isBranchHead || isNightCoordinator
  const canManageShabbat      = isSystemAdmin || isBranchHead || isShabbatCoordinator
  const canAccessBuildingCodes = isSystemAdmin || isBranchHead || isDispatcher
  const canManageBranch       = isSystemAdmin || isBranchHead
  const canManageEvents       = isSystemAdmin || isBranchHead || isEventsCoordinator

  return {
    role, roleTypes, branchId,
    isSystemAdmin, isBranchHead, isRoleHolder, isVolunteer,
    isNightCoordinator, isDispatcher, isShabbatCoordinator, isEventsCoordinator,
    canManageNightShifts, canManageShabbat, canAccessBuildingCodes, canManageBranch, canManageEvents,
    hasNightShifts: user?.permissions?.nightShifts === true || user?.nightShifts === true,
    hasShabbat: user?.permissions?.shabbatVolunteer === true || user?.shabbatVolunteer === true,
    shabbatArea: user?.shabbatArea,
  }
}
