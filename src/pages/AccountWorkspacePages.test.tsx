// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AccountNewScanPage } from './AccountNewScanPage'
import { AccountDashboardPage, AccountFindingDetailsPage, AccountScanDetailsPage } from './AccountWorkspacePages'
import { AccountReportPage } from './AccountWorkspacePages'
import { NewScanPage } from './NewScanPage'
import { localScanApi } from '../services/localScanApi'
import { settingsService } from '../services/settingsService'
import { ThemeProvider } from '../state/ThemeProvider'
import { ToastProvider } from '../state/ToastProvider'

const workspaceMode = vi.hoisted(() => ({ current: 'account' as 'account' | 'demo', token: 'account-token' }))
vi.mock('../state/useWorkspaceMode', () => ({ useWorkspaceMode: () => ({ mode: workspaceMode.current, accessToken: workspaceMode.token }) }))
vi.mock('../services/localScanApi', () => ({
  localScanApi: { submit: vi.fn(), getScan: vi.fn(), getSource: vi.fn(), listFindings: vi.fn(), listScans: vi.fn(), explainFinding: vi.fn(), getAiStatus: vi.fn() },
  makeIdempotencyKey: () => 'd7b8ed45-1384-4c15-9177-15a17b5fc012',
  ScanApiError: class ScanApiError extends Error { code = 'test'; status = 500 },
}))
vi.mock('../components/ui/CodeViewer', () => ({ CodeViewer: ({ value }: { value: string }) => <pre>{value}</pre> }))

afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); workspaceMode.current = 'account'; workspaceMode.token = 'account-token'; vi.unstubAllGlobals() })

const id = '42d489d8-e193-4bcf-80a7-e66780d291d8'
const accountScan = (status: 'queued' | 'running' | 'completed' | 'failed') => ({
  id, contractName: 'Vault', sourceFilename: 'Vault.sol', inputType: 'paste' as const, compilerVersion: '0.8.24', sourceHash: 'hash', status,
  summary: {}, errorCode: null, errorMessage: null, analysisEngine: status === 'completed' ? 'slither' : null,
  analysisVersion: status === 'completed' ? '0.11.6' : null, createdAt: '2026-10-11T00:00:00Z', updatedAt: `2026-10-11T00:00:0${status === 'queued' ? '0' : '1'}Z`, startedAt: null, completedAt: status === 'completed' ? '2026-10-11T00:01:00Z' : null,
})
const finding = {
  id: 'finding-1', scan_id: id, user_id: 'owner', rule_id: 'reentrancy-eth', title: 'Reentrancy possibility', description: 'External call before state update.', impact: 'high', severity: 'high' as const,
  confidence: 'medium', category: 'reentrancy-eth', source_path: 'Vault.sol', line_start: 2, line_end: 3,
  code_excerpt: 'call();', recommendation: 'Review state update ordering.', evidence: { elements: [{ type: 'function', name: 'withdraw', lines: [2, 3] }] }, verification: { status: 'not_verified' }, created_at: '2026-10-11T00:01:00Z',
}

describe('account workspace integration', () => {
  it('clears prior account scan rows when the authenticated token changes', async () => {
    vi.mocked(localScanApi.listScans).mockResolvedValueOnce([accountScan('queued')]).mockImplementationOnce(() => new Promise(() => {}))
    const renderPage = () => <MemoryRouter><Routes><Route path="*" element={<AccountDashboardPage />} /></Routes></MemoryRouter>
    const { rerender } = render(renderPage())
    expect(await screen.findByText('Vault')).toBeTruthy()
    await act(async () => {
      workspaceMode.token = 'different-account-token'
      rerender(renderPage())
    })
    expect(screen.queryByText('Vault')).toBeNull()
  })

  it('submits the actual source once with the current account token and opens the accepted scan', async () => {
    vi.mocked(localScanApi.submit).mockResolvedValue({ scan: accountScan('queued'), replayed: false })
    render(<MemoryRouter initialEntries={['/app/new-scan']}><Routes><Route path="/app/new-scan" element={<AccountNewScanPage />} /><Route path="/app/scans/:scanId" element={<p>Scan accepted</p>} /></Routes></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'Paste Solidity' }))
    expect(screen.getByLabelText('Solidity source').getAttribute('wrap')).toBe('off')
    expect(screen.getByLabelText('Solidity source').classList.contains('source-code-input')).toBe(true)
    fireEvent.change(screen.getByLabelText('Solidity source'), { target: { value: 'pragma solidity 0.8.24; contract Vault {}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Static Analysis' }))
    await screen.findByText('Scan accepted')
    expect(localScanApi.submit).toHaveBeenCalledTimes(1)
    expect(localScanApi.submit).toHaveBeenCalledWith(expect.objectContaining({ sourceCode: expect.stringContaining('contract Vault'), inputType: 'paste' }), 'account-token', expect.any(String))
  })

  it('reports a local API failure accessibly without falling back to seeded demo data', async () => {
    vi.mocked(localScanApi.submit).mockRejectedValueOnce(new Error('network detail')).mockResolvedValueOnce({ scan: accountScan('queued'), replayed: true })
    render(<MemoryRouter initialEntries={['/app/new-scan']}><Routes><Route path="/app/new-scan" element={<AccountNewScanPage />} /><Route path="/app/scans/:scanId" element={<p>Existing scan replayed</p>} /></Routes></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'Paste Solidity' }))
    fireEvent.change(screen.getByLabelText('Contract name (optional)'), { target: { value: 'Vault' } })
    fireEvent.change(screen.getByLabelText('Solidity source'), { target: { value: 'contract Vault {}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Static Analysis' }))
    expect((await screen.findByRole('alert')).textContent).toContain('The local scan API could not accept this submission.')
    expect(screen.queryByText(/illustrative demo record/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Static Analysis' }))
    expect(await screen.findByText('Existing scan replayed')).toBeTruthy()
    expect(localScanApi.submit).toHaveBeenCalledTimes(2)
    expect(vi.mocked(localScanApi.submit).mock.calls[0]?.[2]).toBe(vi.mocked(localScanApi.submit).mock.calls[1]?.[2])
  })

  it('renders only API-provided finding fields and a real source excerpt', async () => {
    vi.mocked(localScanApi.getScan).mockResolvedValue(accountScan('completed'))
    vi.mocked(localScanApi.listFindings).mockResolvedValue([finding])
    vi.mocked(localScanApi.getSource).mockResolvedValue({ sourceCode: 'contract Vault {\nfunction withdraw() external {\ncall();\n}\n}', sourceFilename: 'Vault.sol' })
    render(<MemoryRouter initialEntries={[`/app/scans/${id}/findings/finding-1`]}><Routes><Route path="/app/scans/:scanId/findings/:findingId" element={<AccountFindingDetailsPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Reentrancy possibility' })).toBeTruthy()
    expect(screen.getAllByText('reentrancy-eth').length).toBeGreaterThan(0)
    expect(screen.getByText('External call before state update.')).toBeTruthy()
    expect(screen.getByText('Review state update ordering.')).toBeTruthy()
    expect(screen.getByText(/This result is not independently verified/)).toBeTruthy()
    expect(screen.queryByText(/Suggested pattern/)).toBeNull()
  })

  it('requests an AI explanation for the saved finding without resubmitting the scan', async () => {
    vi.mocked(localScanApi.getScan).mockResolvedValue(accountScan('completed'))
    vi.mocked(localScanApi.listFindings).mockResolvedValue([finding])
    vi.mocked(localScanApi.getSource).mockResolvedValue({ sourceCode: 'contract Vault {}', sourceFilename: 'Vault.sol' })
    settingsService.set({ aiProvider: 'automatic' })
    vi.mocked(localScanApi.explainFinding).mockResolvedValue({
      summary: 'An external call precedes the state update.', impact: 'A callback may re-enter.',
      evidence_explanation: 'The source excerpt shows the call before accounting changes.', remediation: 'Update state before the external call.',
      verification_steps: ['Add a reentrant callback regression test.'], limitations: ['Static analysis does not prove exploitability.'],
      provider: 'gemini', model: 'test-model', generatedAt: '2026-10-15T00:00:00Z',
    })
    render(<MemoryRouter initialEntries={[`/app/scans/${id}/findings/finding-1`]}><Routes><Route path="/app/scans/:scanId/findings/:findingId" element={<AccountFindingDetailsPage />} /></Routes></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Explain finding' }))
    expect(await screen.findByText('An external call precedes the state update.')).toBeTruthy()
    expect(screen.getByText(/AI generated · gemini · test-model/)).toBeTruthy()
    expect(localScanApi.explainFinding).toHaveBeenCalledWith(id, 'finding-1', 'account-token', 'automatic')
    expect(localScanApi.submit).not.toHaveBeenCalled()
    expect(screen.getByText(/limited source excerpt are sent/)).toBeTruthy()
  })

  it('keeps the saved finding visible when its optional AI explanation fails', async () => {
    vi.mocked(localScanApi.getScan).mockResolvedValue(accountScan('completed'))
    vi.mocked(localScanApi.listFindings).mockResolvedValue([finding])
    vi.mocked(localScanApi.getSource).mockResolvedValue({ sourceCode: 'contract Vault {}', sourceFilename: 'Vault.sol' })
    settingsService.set({ aiProvider: 'automatic' })
    vi.mocked(localScanApi.explainFinding).mockRejectedValue(new Error('provider unavailable'))
    render(<MemoryRouter initialEntries={[`/app/scans/${id}/findings/finding-1`]}><Routes><Route path="/app/scans/:scanId/findings/:findingId" element={<AccountFindingDetailsPage />} /></Routes></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Explain finding' }))
    expect((await screen.findByRole('alert')).textContent).toContain('The local scan API could not complete the request.')
    expect(screen.getByRole('heading', { name: 'Reentrancy possibility' })).toBeTruthy()
    expect(screen.getByText('External call before state update.')).toBeTruthy()
    expect(screen.getByText('Review state update ordering.')).toBeTruthy()
    expect(localScanApi.submit).not.toHaveBeenCalled()
  })

  it('polls queued/running scans and stops polling after worker completion', async () => {
    vi.useFakeTimers()
    vi.mocked(localScanApi.getScan)
      .mockResolvedValueOnce(accountScan('queued'))
      .mockResolvedValueOnce(accountScan('running'))
      .mockResolvedValueOnce(accountScan('completed'))
    vi.mocked(localScanApi.listFindings).mockResolvedValue([])
    vi.mocked(localScanApi.getSource).mockResolvedValue({ sourceCode: 'contract Vault {}', sourceFilename: 'Vault.sol' })
    render(<MemoryRouter initialEntries={[`/app/scans/${id}`]}><Routes><Route path="/app/scans/:scanId" element={<AccountScanDetailsPage />} /></Routes></MemoryRouter>)
    await act(async () => { await vi.advanceTimersByTimeAsync(0); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText('Queued for the local analysis worker.')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText('The local worker is analyzing this source. Status refreshes automatically.')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText('The analyzer returned zero findings. This does not establish that the contract is safe or free of vulnerabilities.')).toBeTruthy()
    const callsAfterCompletion = vi.mocked(localScanApi.getScan).mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(localScanApi.getScan).toHaveBeenCalledTimes(callsAfterCompletion)
  })

  it('renders failed scans as failed and never exposes a completed report', async () => {
    vi.mocked(localScanApi.getScan).mockResolvedValue({ ...accountScan('failed'), errorCode: 'analyzer_error', errorMessage: 'Analysis failed.' })
    render(<MemoryRouter initialEntries={[`/app/scans/${id}`]}><Routes><Route path="/app/scans/:scanId" element={<AccountScanDetailsPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByText('Failed')).toBeTruthy()
    expect(screen.getByText(/The local worker could not complete this source/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View report' }).getAttribute('aria-disabled')).toBe('true')
    expect(localScanApi.listFindings).not.toHaveBeenCalled()
  })

  it('keeps demo New Scan on its seeded workflow without calling the account API', () => {
    workspaceMode.current = 'demo'
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    render(<MemoryRouter initialEntries={['/app/new-scan']}><ThemeProvider><ToastProvider><Routes><Route path="/app/new-scan" element={<NewScanPage />} /></Routes></ToastProvider></ThemeProvider></MemoryRouter>)
    expect(screen.getByText('LOCAL DEMO WORKFLOW')).toBeTruthy()
    expect(screen.getByText('Create Demo Record')).toBeTruthy()
    expect(localScanApi.submit).not.toHaveBeenCalled()
  })

  it('does not render an account report before backend completion', async () => {
    vi.mocked(localScanApi.getScan).mockResolvedValue(accountScan('queued'))
    render(<MemoryRouter initialEntries={[`/app/reports/${id}`]}><Routes><Route path="/app/reports/:scanId" element={<AccountReportPage />} /></Routes></MemoryRouter>)
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(await screen.findByText('A report is available only after the backend confirms scan completion.')).toBeTruthy()
    expect(screen.queryByText('Analysis Results')).toBeNull()
  })

  it('includes API-provided impact and confidence in a completed account report', async () => {
    vi.mocked(localScanApi.getScan).mockResolvedValue(accountScan('completed'))
    vi.mocked(localScanApi.listFindings).mockResolvedValue([{ ...finding, severity: 'experimental', line_end: null }])
    render(<MemoryRouter initialEntries={[`/app/reports/${id}`]}><Routes><Route path="/app/reports/:scanId" element={<AccountReportPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByText('Confidence returned:')).toBeTruthy()
    expect(screen.getByText('Impact returned:')).toBeTruthy()
    expect(screen.getByText('External call before state update.')).toBeTruthy()
    expect(screen.getByText('Impact returned:').parentElement?.textContent).toContain('high')
    expect(screen.getByText('Severity returned: experimental')).toBeTruthy()
  })
})
