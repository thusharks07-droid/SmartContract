import { useContext } from 'react'
import { DemoAuthContext } from './DemoAuthContext'

export function useDemoAuth() {
  const context = useContext(DemoAuthContext)
  if (!context) throw new Error('useDemoAuth must be used inside DemoAuthProvider')
  return context
}
