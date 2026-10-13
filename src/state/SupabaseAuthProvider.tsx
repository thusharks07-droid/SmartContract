import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfiguration } from '../lib/supabase/client'
import { SupabaseAuthContext } from './SupabaseAuthContext'

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Supabase Auth could not complete the request. Try again.'
}

export function SupabaseAuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabaseConfiguration.configured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setError(null)
      setLoading(false)
    })

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      setSession(data.session)
      if (sessionError) setError(readableError(sessionError))
      setLoading(false)
    }).catch((sessionError: unknown) => {
      if (!active) return
      setError(readableError(sessionError))
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: supabaseConfiguration.message ?? 'Supabase is not configured.' }
    setError(null)
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        const message = readableError(authError)
        setError(message)
        return { error: message }
      }
      setSession(data.session)
      return { error: null }
    } catch (authError) {
      const message = readableError(authError)
      setError(message)
      return { error: message }
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: supabaseConfiguration.message ?? 'Supabase is not configured.', confirmationRequired: false }
    setError(null)
    try {
      const { data, error: authError } = await supabase.auth.signUp({ email, password })
      if (authError) {
        const message = readableError(authError)
        setError(message)
        return { error: message, confirmationRequired: false }
      }
      setSession(data.session)
      return { error: null, confirmationRequired: !data.session }
    } catch (authError) {
      const message = readableError(authError)
      setError(message)
      return { error: message, confirmationRequired: false }
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return { error: null }
    setError(null)
    try {
      const { error: authError } = await supabase.auth.signOut()
      if (authError) {
        const message = readableError(authError)
        setError(message)
        return { error: message }
      }
      setSession(null)
      return { error: null }
    } catch (authError) {
      const message = readableError(authError)
      setError(message)
      return { error: message }
    }
  }, [])

  const value = useMemo(() => ({
    configured: supabaseConfiguration.configured,
    configurationMessage: supabaseConfiguration.message,
    loading,
    session,
    error,
    signIn,
    signUp,
    signOut,
  }), [error, loading, session, signIn, signOut, signUp])

  return <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>
}
