// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SupabaseAuthProvider } from './SupabaseAuthProvider'
import { useSupabaseAuth } from './useSupabaseAuth'

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('../lib/supabase/client', () => ({
  supabase: { auth: authMocks },
  supabaseConfiguration: { configured: true, message: null },
}))

const session = {
  access_token: 'test-access-token', token_type: 'bearer', expires_in: 3600, expires_at: 1_900_000_000,
  refresh_token: 'test-refresh-token', user: { id: 'user-1', email: 'user@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00.000Z' },
} as Session

function AuthProbe() {
  const auth = useSupabaseAuth()
  return <section>
    <output data-testid="loading">{String(auth.loading)}</output>
    <output data-testid="email">{auth.session?.user.email ?? 'signed out'}</output>
    <button type="button" onClick={() => void auth.signIn('user@example.test', 'one-time-password')}>Sign in test</button>
    <button type="button" onClick={() => void auth.signOut()}>Sign out test</button>
  </section>
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  authMocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
  authMocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: authMocks.unsubscribe } } })
  authMocks.signInWithPassword.mockResolvedValue({ data: { session }, error: null })
  authMocks.signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  cleanup()
})

describe('Supabase auth provider', () => {
  it('restores the SDK session and cleans up its auth-state subscription', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session }, error: null })
    const view = render(<SupabaseAuthProvider><AuthProbe /></SupabaseAuthProvider>)

    expect(await screen.findByText('user@example.test')).toBeTruthy()
    expect(screen.getByTestId('loading').textContent).toBe('false')
    view.unmount()
    expect(authMocks.unsubscribe).toHaveBeenCalledOnce()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('passes credentials only to Supabase Auth and clears account session through the SDK', async () => {
    render(<SupabaseAuthProvider><AuthProbe /></SupabaseAuthProvider>)
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))

    fireEvent.click(screen.getByRole('button', { name: 'Sign in test' }))
    await waitFor(() => expect(screen.getByTestId('email').textContent).toBe('user@example.test'))
    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.test', password: 'one-time-password' })
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out test' }))
    await waitFor(() => expect(authMocks.signOut).toHaveBeenCalledOnce())
    expect(screen.getByTestId('email').textContent).toBe('signed out')
  })
})
