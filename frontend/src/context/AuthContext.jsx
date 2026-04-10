import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import {
  clearStoredSession,
  loginRequest,
  logoutRequest,
  readStoredSession,
  refreshRequest,
  writeStoredSession,
} from '../services/authApi'
import { isTokenValid, parseJwtPayload } from '../utils/token'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function bootstrap() {
      const stored = readStoredSession()

      if (!stored) {
        if (isMounted) {
          setSession(null)
          setIsBootstrapping(false)
        }
        return
      }

      if (isTokenValid(stored.accessToken)) {
        if (isMounted) {
          setSession(stored)
          setIsBootstrapping(false)
        }
        return
      }

      try {
        const response = await refreshRequest({ refresh_token: stored.refreshToken })
        const tokenData = response.data?.data

        const nextSession = {
          user: stored.user,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresIn: tokenData.expires_in,
        }

        if (isMounted) {
          setSession(nextSession)
          writeStoredSession(nextSession)
        }
      } catch (_error) {
        clearStoredSession()
        if (isMounted) {
          setSession(null)
        }
      } finally {
        if (isMounted) {
          setIsBootstrapping(false)
        }
      }
    }

    bootstrap()

    function handleAuthSessionChange(event) {
      if (!isMounted) {
        return
      }

      if (event?.detail === null) {
        setSession(null)
        return
      }

      if (event?.detail) {
        setSession(event.detail)
        return
      }

      setSession(readStoredSession())
    }

    function handleStorageChange(event) {
      if (!isMounted || event.key !== 'fbr_auth_session') {
        return
      }

      setSession(readStoredSession())
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('fbr-auth-session-changed', handleAuthSessionChange)
      window.addEventListener('storage', handleStorageChange)
    }

    return () => {
      isMounted = false
      if (typeof window !== 'undefined') {
        window.removeEventListener('fbr-auth-session-changed', handleAuthSessionChange)
        window.removeEventListener('storage', handleStorageChange)
      }
    }
  }, [])

  async function login(credentials) {
    const response = await loginRequest(credentials)
    const data = response.data?.data

    const nextSession = {
      user: data.user,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    }

    setSession(nextSession)
    writeStoredSession(nextSession)

    return response
  }

  async function logout() {
    const current = session

    try {
      if (current?.accessToken && current?.refreshToken) {
        await logoutRequest({ refresh_token: current.refreshToken }, current.accessToken)
      }
    } catch (_error) {
      // Local session must still be cleared even if API logout fails.
    } finally {
      clearStoredSession()
      setSession(null)
    }
  }

  const roleFromToken = session?.accessToken
    ? parseJwtPayload(session.accessToken)?.role || null
    : null

  const role = session?.user?.role || roleFromToken

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      role,
      accessToken: session?.accessToken || null,
      refreshToken: session?.refreshToken || null,
      isAuthenticated: Boolean(session?.accessToken && session?.refreshToken),
      isBootstrapping,
      login,
      logout,
    }),
    [session, role, isBootstrapping]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
