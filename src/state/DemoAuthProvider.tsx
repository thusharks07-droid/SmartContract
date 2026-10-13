import { useCallback, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { DemoAuthContext } from './DemoAuthContext'
import type { DemoSession } from './DemoAuthContext'

const sessionStorageKey = 'contractiq.demo-session'
const demoSession: DemoSession = { mode: 'demo', displayName: 'Demo User' }

function readDemoSession(): DemoSession | null {
  try {
    const stored = window.sessionStorage.getItem(sessionStorageKey)
    if (!stored) return null
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null) return null
    const value = parsed as Partial<DemoSession>
    return value.mode === 'demo' && value.displayName === 'Demo User' ? demoSession : null
  } catch {
    // Storage may be disabled; provider state still supports an in-memory demo session.
    return null
  }
}

export function DemoAuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<DemoSession | null>(readDemoSession)
  const [hasSignedOut, setHasSignedOut] = useState(false)

  const enterDemo = useCallback(() => {
    setHasSignedOut(false)
    setSession(demoSession)
    try {
      window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(demoSession))
    } catch {
      // The session stays active in memory until this page is closed or refreshed.
    }
  }, [])

  const signOut = useCallback(() => {
    setHasSignedOut(true)
    setSession(null)
    try {
      window.sessionStorage.removeItem(sessionStorageKey)
    } catch {
      // Clearing provider state still signs out for this page lifetime.
    }
  }, [])

  const value = useMemo(() => ({ session, isAuthenticated: session !== null, hasSignedOut, enterDemo, signOut }), [enterDemo, hasSignedOut, session, signOut])
  return <DemoAuthContext.Provider value={value}>{children}</DemoAuthContext.Provider>
}
