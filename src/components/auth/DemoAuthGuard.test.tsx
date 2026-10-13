// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { DemoAuthGuard } from './DemoAuthGuard'
import { safeAppDestination } from './safeAppDestination'
import { DemoAuthProvider } from '../../state/DemoAuthProvider'
import { SupabaseAuthProvider } from '../../state/SupabaseAuthProvider'
import { useDemoAuth } from '../../state/useDemoAuth'

vi.mock('../../lib/supabase/client', () => ({
  supabase: null,
  supabaseConfiguration: { configured: false, message: 'Add Supabase settings to .env.local.' },
}))

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

function CurrentLocation() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function TestLogin() {
  const { enterDemo } = useDemoAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const destination = safeAppDestination(new URLSearchParams(location.search).get('next'))
  return <button type="button" onClick={() => { enterDemo(); navigate(destination, { replace: true }) }}>Continue as Demo</button>
}

function TestSignOut() {
  const { signOut } = useDemoAuth()
  return <button type="button" onClick={signOut}>Sign out</button>
}

describe('demo auth route foundation', () => {
  it('redirects protected routes to login with a local next path', () => {
    render(<MemoryRouter initialEntries={['/app/scans/demo-1?filter=high']}><SupabaseAuthProvider><DemoAuthProvider><Routes>
      <Route path="/login" element={<><TestLogin /><CurrentLocation /></>} />
      <Route element={<DemoAuthGuard />}><Route path="/app/scans/:scanId" element={<p>Protected scan</p>} /></Route>
    </Routes></DemoAuthProvider></SupabaseAuthProvider></MemoryRouter>)

    expect(screen.getByTestId('location').textContent).toBe('/login?next=%2Fapp%2Fscans%2Fdemo-1%3Ffilter%3Dhigh')
    expect(screen.queryByText('Protected scan')).toBeNull()
  })

  it('creates a marker-only session and allows the protected route', () => {
    render(<MemoryRouter initialEntries={['/app/dashboard']}><SupabaseAuthProvider><DemoAuthProvider><Routes>
      <Route path="/login" element={<TestLogin />} />
      <Route element={<DemoAuthGuard />}><Route path="/app/dashboard" element={<p>Protected dashboard</p>} /></Route>
    </Routes></DemoAuthProvider></SupabaseAuthProvider></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Continue as Demo' }))
    expect(screen.getByText('Protected dashboard')).toBeTruthy()
    expect(window.sessionStorage.getItem('contractiq.demo-session')).toBe('{"mode":"demo","displayName":"Demo User"}')
    expect(window.sessionStorage.getItem('password')).toBeNull()
  })

  it('restores a tab-scoped session after refresh and clears it on sign out', () => {
    window.sessionStorage.setItem('contractiq.demo-session', '{"mode":"demo","displayName":"Demo User"}')
    render(<MemoryRouter initialEntries={['/app/dashboard']}><SupabaseAuthProvider><DemoAuthProvider><Routes>
      <Route path="/" element={<p>Public entry</p>} />
      <Route path="/login" element={<TestLogin />} />
      <Route element={<DemoAuthGuard />}><Route path="/app/dashboard" element={<><p>Restored workspace</p><TestSignOut /></>} /></Route>
    </Routes></DemoAuthProvider></SupabaseAuthProvider></MemoryRouter>)

    expect(screen.getByText('Restored workspace')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(window.sessionStorage.getItem('contractiq.demo-session')).toBeNull()
    expect(screen.getByText('Public entry')).toBeTruthy()
  })

  it('rejects external, protocol-relative, and non-app next destinations', () => {
    expect(safeAppDestination('https://example.com/app/dashboard')).toBe('/app/dashboard')
    expect(safeAppDestination('//example.com/app/dashboard')).toBe('/app/dashboard')
    expect(safeAppDestination('/settings')).toBe('/app/dashboard')
    expect(safeAppDestination('/app/scans/demo?filter=high')).toBe('/app/scans/demo?filter=high')
  })
})
