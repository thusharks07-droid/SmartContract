import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useDemoAuth } from '../../state/useDemoAuth'
import { useSupabaseAuth } from '../../state/useSupabaseAuth'
import { LoadingState } from '../ui/LoadingState'

export function DemoAuthGuard() {
  const { isAuthenticated, hasSignedOut } = useDemoAuth()
  const { loading, session } = useSupabaseAuth()
  const location = useLocation()
  if (isAuthenticated) return <Outlet />
  if (loading) return <LoadingState label="Restoring account session" />
  if (session) return <Outlet />
  const requestedPath = `${location.pathname}${location.search}${location.hash}`
  if (hasSignedOut) return <Navigate to="/" replace />
  return <Navigate to={`/login?next=${encodeURIComponent(requestedPath)}`} replace />
}
