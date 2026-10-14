// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localScanApi, ScanApiError } from './localScanApi'

const scan = {
  id: 'f4db5e37-e485-4baf-990d-360ed570aaf8', contractName: 'Vault', sourceFilename: 'Vault.sol',
  inputType: 'paste', compilerVersion: '0.8.24', sourceHash: 'abc', status: 'queued', summary: {},
  errorCode: null, errorMessage: null, analysisEngine: null, analysisVersion: null,
  createdAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z', startedAt: null, completedAt: null,
} as const
const jsonResponse = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

describe('local scanner API service', () => {
  it('reads provider readiness and validates an AI explanation without sending source or scanner data', async () => {
    const explanation = {
      summary: 'A call happens before the state update.', impact: 'A callback may re-enter.',
      evidence_explanation: 'The detector points to the external call.', remediation: 'Update state before calling external code.',
      verification_steps: ['Add a regression test.'], limitations: ['Static analysis does not prove exploitability.'],
      provider: 'gemini', model: 'gemini-2.5-flash', generatedAt: '2026-10-15T00:00:00Z',
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ providers: { groq: true, gemini: true }, primaryProvider: 'groq', fallbackProvider: 'gemini' }))
      .mockResolvedValueOnce(jsonResponse({ explanation }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(localScanApi.getAiStatus('account-token')).resolves.toMatchObject({ providers: { groq: true, gemini: true } })
    await expect(localScanApi.explainFinding(scan.id, 'finding-id', 'account-token', 'automatic')).resolves.toMatchObject({ provider: 'gemini', summary: explanation.summary })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:8765/api/ai/status',
      `http://127.0.0.1:8765/api/ai/scans/${scan.id}/findings/finding-id/explanation`,
    ])
    const [, request] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(new Headers(request.headers).get('Authorization')).toBe('Bearer account-token')
    expect(JSON.parse(String(request.body))).toEqual({ provider: 'automatic' })
    expect(JSON.parse(String(request.body))).not.toHaveProperty('sourceCode')
  })

  it('submits with bearer auth and idempotency key without a client owner ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ scan, replayed: false }, 202))
    vi.stubGlobal('fetch', fetchMock)
    const payload = { contractName: 'Vault', sourceFilename: 'Vault.sol', sourceCode: 'contract Vault {}', inputType: 'paste', compilerVersion: '0.8.24' } as const
    const result = await localScanApi.submit(payload, 'access-token-test', 'c71b0617-0abc-4a8a-90f4-07914150b8cc')
    expect(result.scan.status).toBe('queued')
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(request.method).toBe('POST')
    expect(new Headers(request.headers).get('Authorization')).toBe('Bearer access-token-test')
    expect(new Headers(request.headers).get('Idempotency-Key')).toBe('c71b0617-0abc-4a8a-90f4-07914150b8cc')
    expect(JSON.parse(String(request.body))).toEqual(payload)
    expect(JSON.parse(String(request.body))).not.toHaveProperty('user_id')
  })

  it('reads scans, details, findings, and source through the matching endpoints', async () => {
    const finding = { id: 'finding-1', scan_id: scan.id, rule_id: 'reentrancy-eth', severity: 'high' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ scans: [scan] }))
      .mockResolvedValueOnce(jsonResponse({ scan }))
      .mockResolvedValueOnce(jsonResponse({ findings: [finding] }))
      .mockResolvedValueOnce(jsonResponse({ sourceCode: 'contract Vault {}', sourceFilename: 'Vault.sol' }))
    vi.stubGlobal('fetch', fetchMock)
    expect((await localScanApi.listScans('token'))[0]?.id).toBe(scan.id)
    expect((await localScanApi.getScan(scan.id, 'token')).status).toBe('queued')
    expect((await localScanApi.listFindings(scan.id, 'token'))[0]?.rule_id).toBe('reentrancy-eth')
    expect((await localScanApi.getSource(scan.id, 'token')).sourceFilename).toBe('Vault.sol')
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:8765/api/scans',
      `http://127.0.0.1:8765/api/scans/${scan.id}`,
      `http://127.0.0.1:8765/api/scans/${scan.id}/findings`,
      `http://127.0.0.1:8765/api/scans/${scan.id}/source`,
    ])
  })

  it('uses the configured HTTPS API URL in a production build configuration', async () => {
    vi.stubEnv('VITE_CONTRACTIQ_API_URL', 'https://api.contractiq.example/')
    vi.resetModules()
    const { localScanApi: productionApi } = await import('./localScanApi')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ scans: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await productionApi.listScans('token')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.contractiq.example/api/scans')
  })

  it('refuses an HTTP API URL in production without sending a request', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_CONTRACTIQ_API_URL', 'http://api.contractiq.example')
    vi.resetModules()
    const { localScanApi: productionApi } = await import('./localScanApi')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(productionApi.listScans('token')).rejects.toMatchObject({ code: 'insecure_api_url' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed response collections and finding rows instead of treating them as empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ scans: null })))
    await expect(localScanApi.listScans('token')).rejects.toMatchObject({ code: 'invalid_response' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ findings: [{ id: 'f', scan_id: 'other-scan' }] })))
    await expect(localScanApi.listFindings(scan.id, 'token')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('rejects unknown scan states rather than presenting them as a known lifecycle state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ scans: [{ ...scan, status: 'finished' }] })))
    await expect(localScanApi.listScans('token')).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('handles expired authentication without exposing token content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'unauthorized', message: 'expired' } }, 401)))
    await expect(localScanApi.listScans('private-test-token')).rejects.toMatchObject({
      name: 'ScanApiError', code: 'unauthorized', status: 401,
      message: 'Your account session expired or is no longer valid. Sign in again.',
    })
  })

  it('preserves API validation errors and handles unavailable API without logging source', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'unsupported_source', message: 'Imports are not supported.' } }, 422)))
    await expect(localScanApi.submit({ contractName: 'Vault', sourceFilename: null, sourceCode: 'secret source', inputType: 'paste', compilerVersion: '0.8.24' }, 'token', 'c71b0617-0abc-4a8a-90f4-07914150b8cc')).rejects.toMatchObject({ code: 'unsupported_source', status: 422, message: 'Imports are not supported.' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private network detail')))
    await expect(localScanApi.listScans('token')).rejects.toMatchObject({ code: 'connection_error', message: 'Could not reach the local scanner API. Check that its server is running.' })
  })

  it('does not send a request without a current account token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(localScanApi.listScans('')).rejects.toBeInstanceOf(ScanApiError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aborts requests that exceed the local API timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const request = localScanApi.listScans('token').catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await request).toMatchObject({ code: 'request_timeout', status: undefined })
  })
})
