import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type SupabaseAuthContextValue = {
  configured: boolean
  configurationMessage: string | null
  loading: boolean
  session: Session | null
  error: string | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null; confirmationRequired: boolean }>
  signOut: () => Promise<{ error: string | null }>
}

export const SupabaseAuthContext = createContext<SupabaseAuthContextValue | null>(null)
