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
  const isTransportCoordinator = isRoleHolder && roleTypes.includes('transport_coordinator')
  const isCarCoordinator       = isRoleHolder && roleTypes.includes('car_coordinator')
  const isAmbulanceCoordinator = isRoleHolder && roleTypes.includes('ambulance_coordinator')

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

  const canManageTransport = isSystemAdmin || isBranchHead || isTransportCoordinator || isCarCoordinator || isAmbulanceCoordinator
  // Which transport types this user may see:
  //  - transport_coordinator / branch_head / admin → both
  //  - car_coordinator → car only
  //  - ambulance_coordinator → ambulance only
  const canSeeCarShifts       = isSystemAdmin || isBranchHead || isTransportCoordinator || isCarCoordinator
  const canSeeAmbulanceShifts = isSystemAdmin || isBranchHead || isTransportCoordinator || isAmbulanceCoordinator

  return {
    role, roleTypes, branchId,
    isSystemAdmin, isBranchHead, isRoleHolder, isVolunteer,
    isNightCoordinator, isDispatcher, isShabbatCoordinator, isEventsCoordinator,
    isTransportCoordinator, isCarCoordinator, isAmbulanceCoordinator,
    canManageNightShifts, canManageShabbat, canAccessBuildingCodes, canManageBranch, canManageEvents,
    canManageTransport, canSeeCarShifts, canSeeAmbulanceShifts,
    hasNightShifts: user?.permissions?.nightShifts === true || user?.nightShifts === true,
    hasShabbat: user?.permissions?.shabbatVolunteer === true || user?.shabbatVolunteer === true,
    isVehicleDriver: user?.permissions?.vehicleDriver === true || user?.vehicleDriver === true,
    isAmbulanceDriver: user?.permissions?.ambulanceDriver === true || user?.ambulanceDriver === true,
    shabbatArea: user?.shabbatArea,
  }
}
