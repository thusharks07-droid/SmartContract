import { useContext } from 'react'
import { SupabaseAuthContext } from './SupabaseAuthContext'

export function useSupabaseAuth() {
  const context = useContext(SupabaseAuthContext)
  if (!context) throw new Error('useSupabaseAuth must be used inside SupabaseAuthProvider')
  return context
}
