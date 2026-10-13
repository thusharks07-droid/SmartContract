// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { settingsService } from '../services/settingsService'
import { useAppReducedMotion } from './useAppReducedMotion'
import { SettingsPage } from '../pages/SettingsPage'
import { ThemeProvider } from './ThemeProvider'
import { ToastProvider } from './ToastProvider'
import { MemoryRouter } from 'react-router-dom'
import { DemoAuthProvider } from './DemoAuthProvider'
import { SupabaseAuthProvider } from './SupabaseAuthProvider'

function MotionHarness() {
  const reduced = useAppReducedMotion()
  return <output>{reduced ? 'Reduced' : 'Full'}</output>
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.dataset.motion = ''
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  delete document.documentElement.dataset.motion
})

describe('live motion settings', () => {
  it('defaults to Standard visual fidelity', () => {
    expect(settingsService.get().visualFidelity).toBe('standard')
  })

  it('persists a user motion override and applies it immediately', () => {
    render(<MotionHarness />)

    act(() => {
      settingsService.set({ motion: 'reduced', motionExplicit: true })
    })

    expect(screen.getByText('Reduced')).toBeTruthy()
    expect(document.documentElement.dataset.motion).toBe('reduced')
    expect(JSON.parse(window.localStorage.getItem('contractiq.settings') ?? '{}').motion).toBe('reduced')
  })

  it('restores the system preference when a previously selected explicit preference is unset', () => {
    window.localStorage.setItem('contractiq.settings', JSON.stringify({ motion: 'reduced', motionExplicit: false }))
    render(<MotionHarness />)

    expect(screen.getByText('Full')).toBeTruthy()
    expect(document.documentElement.dataset.motion).toBe('full')
  })

  it('applies and persists the Appearance controls without waiting for Save Settings', () => {
    window.localStorage.setItem('contractiq.settings', JSON.stringify({ visualFidelity: 'standard', motion: 'full', motionExplicit: true }))
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    })
    render(<SupabaseAuthProvider><DemoAuthProvider><ThemeProvider><ToastProvider><MemoryRouter><SettingsPage /></MemoryRouter></ToastProvider></ThemeProvider></DemoAuthProvider></SupabaseAuthProvider>)

    fireEvent.click(screen.getByRole('tab', { name: 'Appearance' }))
    fireEvent.click(screen.getByRole('button', { name: 'Minimal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reduced' }))

    expect(document.documentElement.dataset.fidelity).toBe('minimal')
    expect(document.documentElement.dataset.motion).toBe('reduced')
    expect(JSON.parse(window.localStorage.getItem('contractiq.settings') ?? '{}')).toMatchObject({
      visualFidelity: 'minimal',
      motion: 'reduced',
      motionExplicit: true,
    })
  })
})
