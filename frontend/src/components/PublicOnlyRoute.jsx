import { Navigate, Outlet } from 'react-router-dom'

import LoadingScreen from './LoadingScreen'
import { useAuth } from '../context/AuthContext'

function PublicOnlyRoute() {
  const { isAuthenticated, isBootstrapping } = useAuth()

  if (isBootstrapping) {
    return <LoadingScreen message="Checking access..." />
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

export default PublicOnlyRoute
