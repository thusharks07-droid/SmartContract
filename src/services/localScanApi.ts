export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational'

export type ApiScan = {
  id: string
  contractName: string
  sourceFilename: string | null
  inputType: 'upload' | 'paste'
  compilerVersion: string
  sourceHash: string
  status: ScanStatus
  summary: Record<string, unknown>
  errorCode: string | null
  errorMessage: string | null
  analysisEngine: string | null
  analysisVersion: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
}

export type ApiFinding = {
  id: string
  scan_id: string
  user_id: string
  rule_id: string | null
  title: string | null
  description: string | null
  impact: string | null
  severity: Severity | null
  confidence: string | null
  category: string | null
  source_path: string | null
  line_start: number | null
  line_end: number | null
  code_excerpt: string | null
  recommendation: string | null
  evidence: unknown
  verification: unknown
  created_at: string | null
}

export type ApiScanSource = { sourceCode: string; sourceFilename: string | null }
export type SubmitScanInput = {
  contractName: string
  sourceFilename: string | null
  sourceCode: string
  inputType: 'upload' | 'paste'
  compilerVersion: string
  notes?: string
}

type ErrorBody = { error?: { code?: unknown; message?: unknown } }

export class ScanApiError extends Error {
  readonly code: string
  readonly status?: number

  constructor(code: string, message: string, status?: number) {
    super(message)
    this.name = 'ScanApiError'
    this.code = code
    this.status = status
  }
}

const localDefault = 'http://127.0.0.1:8765'
const requestTimeoutMs = 15_000
const apiBase = (import.meta.env.VITE_CONTRACTIQ_API_URL?.trim() || (import.meta.env.DEV ? localDefault : '')).replace(/\/$/, '')

export function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6]! & 0x0f) | 0x40
    bytes[8] = (bytes[8]! & 0x3f) | 0x80
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  throw new ScanApiError('unsupported_browser', 'This browser cannot create a secure scan submission key.')
}

function baseUrl(): string {
  if (!apiBase) throw new ScanApiError('not_configured', 'The local scan API URL is not configured for this build.')
  return apiBase
}

async function request<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken) throw new ScanApiError('not_authenticated', 'Your account session is missing. Sign in again to continue.')
  const url = `${baseUrl()}${path}`
  let response: Response
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch {
    if (controller.signal.aborted) throw new ScanApiError('request_timeout', 'The local scanner API did not respond in time. You can retry this request.')
    throw new ScanApiError('connection_error', 'Could not reach the local scanner API. Check that its server is running.')
  } finally {
    window.clearTimeout(timeout)
  }
  let body: unknown
  try { body = await response.json() } catch { body = null }
  if (!response.ok) {
    const errorBody = body as ErrorBody | null
    const code = typeof errorBody?.error?.code === 'string' ? errorBody.error.code : `http_${response.status}`
    const message = response.status === 401
      ? 'Your account session expired or is no longer valid. Sign in again.'
      : typeof errorBody?.error?.message === 'string' ? errorBody.error.message : 'The local scan API could not complete the request.'
    throw new ScanApiError(code, message, response.status)
  }
  if (body === null || typeof body !== 'object') throw new ScanApiError('invalid_response', 'The local scan API returned an unreadable response.', response.status)
  return body as T
}

export const localScanApi = {
  async submit(input: SubmitScanInput, accessToken: string, idempotencyKey: string): Promise<{ scan: ApiScan; replayed: boolean }> {
    return request('/api/scans', accessToken, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    })
  },
  async listScans(accessToken: string): Promise<ApiScan[]> {
    const result = await request<{ scans: ApiScan[] }>('/api/scans', accessToken)
    return result.scans
  },
  async getScan(scanId: string, accessToken: string): Promise<ApiScan> {
    const result = await request<{ scan: ApiScan }>(`/api/scans/${encodeURIComponent(scanId)}`, accessToken)
    return result.scan
  },
  async listFindings(scanId: string, accessToken: string): Promise<ApiFinding[]> {
    const result = await request<{ findings: ApiFinding[] }>(`/api/scans/${encodeURIComponent(scanId)}/findings`, accessToken)
    return result.findings
  },
  async getSource(scanId: string, accessToken: string): Promise<ApiScanSource> {
    return request<ApiScanSource>(`/api/scans/${encodeURIComponent(scanId)}/source`, accessToken)
  },
}
