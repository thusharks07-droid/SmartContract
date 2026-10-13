import { createContext } from 'react'

export type DemoSession = {
  mode: 'demo'
  displayName: 'Demo User'
}

export type DemoAuthContextValue = {
  session: DemoSession | null
  isAuthenticated: boolean
  hasSignedOut: boolean
  enterDemo: () => void
  signOut: () => void
}

export const DemoAuthContext = createContext<DemoAuthContextValue | null>(null)
