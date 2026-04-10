import { Navigate, Outlet, useLocation } from 'react-router-dom'

import LoadingScreen from './LoadingScreen'
import AppNavbar from './AppNavbar'
import { useAuth } from '../context/AuthContext'

function ProtectedRoute() {
  const { isAuthenticated, isBootstrapping } = useAuth()
  const location = useLocation()

  if (isBootstrapping) {
    return <LoadingScreen message="Validating authentication..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppNavbar />
      <Outlet />
    </div>
  )
}

export default ProtectedRoute
