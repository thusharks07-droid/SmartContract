// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from '../../App'
import { resetWebGLSupportCacheForTests } from '../../state/useWebGLSupport'

beforeEach(() => {
  resetWebGLSupportCacheForTests()
  window.localStorage.clear()
  window.localStorage.setItem('contractiq.settings', JSON.stringify({ visualFidelity: 'enhanced' }))
  window.sessionStorage.clear()
  window.sessionStorage.setItem('contractiq.demo-session', JSON.stringify({ mode: 'demo', displayName: 'Demo User' }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 80rem)', media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  resetWebGLSupportCacheForTests()
})

describe('product stage WebGL fallbacks', () => {
  it('renders dashboard and scan-detail data views when WebGL is unavailable', async () => {
    const { container } = render(<MemoryRouter initialEntries={['/app/dashboard']}><App /></MemoryRouter>)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Severity orbit' })).toBeTruthy(), { timeout: 10_000 })
    await waitFor(() => expect(container.querySelectorAll('.stage-shell')).toHaveLength(1))
    expect(container.querySelectorAll('[data-testid="stage-fallback"]')).toHaveLength(1)
    expect(container.querySelectorAll('.stage-shell canvas')).toHaveLength(0)
    expect(screen.getByRole('group', { name: 'Select a finding severity' })).toBeTruthy()

    const scanLink = container.querySelector<HTMLAnchorElement>('a[href="/scans/demo-scan-2026-014"]')
    expect(scanLink).toBeTruthy()
    await act(async () => { fireEvent.click(scanLink!) })

    expect(await screen.findByRole('heading', { name: 'Risk surface' }, { timeout: 10_000 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Contract dependency map' })).toBeTruthy()
    await waitFor(() => expect(container.querySelectorAll('.stage-shell')).toHaveLength(2))
    expect(container.querySelectorAll('[data-testid="stage-fallback"]')).toHaveLength(2)
    expect(container.querySelectorAll('.stage-shell canvas')).toHaveLength(0)
    const riskList = screen.getByRole('listbox', { name: /Findings by severity/ })
    const riskOption = riskList.querySelector<HTMLButtonElement>('[role="option"]')
    expect(riskOption).toBeTruthy()
    fireEvent.click(riskOption!)
    expect(riskOption!.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('list', { name: 'Contract elements and source locations' })).toBeTruthy()

    const selectNode = screen.getByRole('button', { name: /withdraw Vault\.sol:15/ })
    await act(async () => { fireEvent.click(selectNode) })
    expect(selectNode.getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps the selectable 2D distribution for tablet and mobile viewports', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
      })),
    })

    const { container } = render(<MemoryRouter initialEntries={['/app/dashboard']}><App /></MemoryRouter>)

    expect(await screen.findByRole('group', { name: 'Select a finding severity' })).toBeTruthy()
    expect(container.querySelector('.distribution-bars')).toBeTruthy()
    expect(container.querySelector('.stage-shell')).toBeNull()
    expect(container.querySelector('canvas')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /critical/i }))

    expect((screen.getByRole('combobox', { name: 'Filter by severity' }) as HTMLSelectElement).value).toBe('critical')
    expect(screen.getByRole('button', { name: /critical/i }).getAttribute('aria-pressed')).toBe('true')
  })

  it('focuses source lines from the contract graph and reuses it for related findings', async () => {
    const { container } = render(<MemoryRouter initialEntries={['/scans/demo-scan-2026-014/findings/demo-finding-014-001']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Contract call structure' }, { timeout: 10_000 })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Contract nodes and source locations' })).toBeTruthy()
    const graphFunction = screen.getByRole('button', { name: /setOwner Vault\.sol:22/ })
    fireEvent.click(graphFunction)
    expect(screen.getByText(/Vault\.sol · focus line 22 · selected from call structure/)).toBeTruthy()
    expect(screen.getByLabelText('Source excerpt around line 22')).toBeTruthy()

    const relatedPanel = container.querySelector('.related-findings-panel')!
    fireEvent.click(relatedPanel.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!)
    expect(await screen.findByRole('heading', { name: 'Related finding graph' }, { timeout: 10_000 })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Findings in this scan' })).toBeTruthy()
  })

  it('shares filtered history rows with the timeline and opens a scan from a plate label', async () => {
    const { container } = render(<MemoryRouter initialEntries={['/scans']}><App /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Timeline view' }))
    expect(await screen.findByRole('heading', { name: 'Scan timeline' }, { timeout: 10_000 })).toBeTruthy()
    expect(container.querySelector('.stage-shell canvas')).toBeNull()
    const timeline = screen.getByRole('list', { name: 'Scans in chronological order' })
    expect(timeline.querySelectorAll('li')).toHaveLength(7)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search contract name or scan ID' }), { target: { value: 'demo-scan-2026-013' } })
    expect(timeline.querySelectorAll('li')).toHaveLength(1)
    const scanLink = timeline.querySelector<HTMLAnchorElement>('a[href="/scans/demo-scan-2026-013"]')
    expect(scanLink).toBeTruthy()
    fireEvent.click(scanLink!)
    await waitFor(() => expect(container.querySelector('.page-header__description')?.textContent).toContain('demo-scan-2026-013'))
  })

  it('shows an explicit non-spatial placeholder for scans without completed records', async () => {
    render(<MemoryRouter initialEntries={['/scans/demo-scan-2026-010']}><App /></MemoryRouter>)
    expect(await screen.findByText('No spatial data for queued scans', {}, { timeout: 10_000 })).toBeTruthy()
    expect(screen.queryByTestId('risk-surface-scene')).toBeNull()
  })

  it('keeps Scan History table-only below the desktop timeline breakpoint', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
      })),
    })
    const { container } = render(<MemoryRouter initialEntries={['/scans']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'All scan records' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Timeline view' })).toBeNull()
    expect(container.querySelector('.data-table')).toBeTruthy()
    expect(container.querySelector('.stage-shell')).toBeNull()
  })

  it('keeps all scan detail visualizations in their 2D form below the desktop breakpoint', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
      })),
    })
    const { container } = render(<MemoryRouter initialEntries={['/scans/demo-scan-2026-014']}><App /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Vault', level: 1 })).toBeTruthy()
    expect(container.querySelector('.risk-surface--fallback')).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Contract elements and source locations' })).toBeTruthy()
    expect(container.querySelector('.stage-shell')).toBeNull()
    expect(container.querySelector('canvas')).toBeNull()
  })
})
