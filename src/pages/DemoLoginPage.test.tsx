// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DemoAuthGuard } from '../components/auth/DemoAuthGuard'
import { DemoAuthProvider } from '../state/DemoAuthProvider'
import { SupabaseAuthProvider } from '../state/SupabaseAuthProvider'
import { DemoLoginPage } from './DemoLoginPage'

vi.mock('../lib/supabase/client', () => ({
  supabase: null,
  supabaseConfiguration: { configured: false, message: 'Add Supabase settings to .env.local.' },
}))

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  window.localStorage.clear()
})

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
})

function renderLogin(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SupabaseAuthProvider>
        <DemoAuthProvider>
          <Routes>
            <Route path="/login" element={<DemoLoginPage />} />
            <Route element={<DemoAuthGuard />}>
              <Route path="/app/dashboard" element={<h1>Demo dashboard</h1>} />
              <Route path="/app/scans/:scanId" element={<h1>Requested scan</h1>} />
            </Route>
          </Routes>
        </DemoAuthProvider>
      </SupabaseAuthProvider>
    </MemoryRouter>,
  )
}

describe('demo login', () => {
  it('shows accessible validation for invalid email and empty password', async () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy()
    expect(await screen.findByText('Enter a password to continue.')).toBeTruthy()
    expect(screen.getByLabelText('Email address').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByRole('heading', { name: 'Demo dashboard' })).toBeNull()
    expect(window.sessionStorage.getItem('contractiq.demo-session')).toBeNull()
  })

  it('toggles password visibility through an accessible control', () => {
    renderLogin()
    const password = screen.getByLabelText('Password')
    const showButton = screen.getByRole('button', { name: 'Show password' })

    expect(password.getAttribute('type')).toBe('password')
    fireEvent.click(showButton)
    expect(password.getAttribute('type')).toBe('text')
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password.getAttribute('type')).toBe('password')
  })

  it('does not treat valid account credentials as demo access when Supabase is unconfigured', async () => {
    renderLogin('/login?next=%2Fapp%2Fscans%2Fdemo-7%3Ffilter%3Dhigh')
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'demo@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'temporary-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Add Supabase settings to .env.local.')
    expect(screen.queryByRole('heading', { name: 'Requested scan' })).toBeNull()
    expect(window.sessionStorage.getItem('contractiq.demo-session')).toBeNull()
    expect(window.sessionStorage.getItem('password')).toBeNull()
    expect(window.sessionStorage.length).toBe(0)
    expect(window.localStorage.length).toBe(0)
  })

  it('continues as demo without credentials and explains the demo-only flow', async () => {
    renderLogin()
    expect(screen.getByText('Demo entry only — no account is created, and this option sends no credentials.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue as Demo' }))

    expect(await screen.findByRole('heading', { name: 'Demo dashboard' })).toBeTruthy()
    expect(window.sessionStorage.getItem('contractiq.demo-session')).toBe('{"mode":"demo","displayName":"Demo User"}')
    expect(window.sessionStorage.length).toBe(1)
  })
})
