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
  severity: string | null
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
const scanStatuses: ScanStatus[] = ['queued', 'running', 'completed', 'failed', 'cancelled']

function invalidResponse(): never {
  throw new ScanApiError('invalid_response', 'The local scan API returned data in an unexpected format.')
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidResponse()
  return value as Record<string, unknown>
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return invalidResponse()
  return value
}

function parseScan(value: unknown): ApiScan {
  const row = asRecord(value)
  if (typeof row.id !== 'string' || typeof row.contractName !== 'string' || typeof row.compilerVersion !== 'string'
      || typeof row.sourceHash !== 'string' || typeof row.createdAt !== 'string' || typeof row.updatedAt !== 'string'
      || !scanStatuses.includes(row.status as ScanStatus) || (row.inputType !== 'upload' && row.inputType !== 'paste')) return invalidResponse()
  return {
    id: row.id, contractName: row.contractName, compilerVersion: row.compilerVersion, sourceHash: row.sourceHash,
    createdAt: row.createdAt, updatedAt: row.updatedAt, status: row.status as ScanStatus,
    inputType: row.inputType, sourceFilename: nullableString(row.sourceFilename), summary: asRecord(row.summary ?? {}),
    errorCode: nullableString(row.errorCode), errorMessage: nullableString(row.errorMessage),
    analysisEngine: nullableString(row.analysisEngine), analysisVersion: nullableString(row.analysisVersion),
    startedAt: nullableString(row.startedAt), completedAt: nullableString(row.completedAt),
  }
}

function parseFinding(value: unknown): ApiFinding {
  const row = asRecord(value)
  if (typeof row.id !== 'string' || typeof row.scan_id !== 'string') return invalidResponse()
  const line = (value: unknown) => value === null || value === undefined ? null : Number.isInteger(value) && Number(value) > 0 ? Number(value) : invalidResponse()
  return {
    id: row.id, scan_id: row.scan_id, user_id: nullableString(row.user_id) ?? '',
    rule_id: nullableString(row.rule_id), title: nullableString(row.title), description: nullableString(row.description),
    impact: nullableString(row.impact), severity: nullableString(row.severity), confidence: nullableString(row.confidence),
    category: nullableString(row.category), source_path: nullableString(row.source_path),
    line_start: line(row.line_start), line_end: line(row.line_end), code_excerpt: nullableString(row.code_excerpt),
    recommendation: nullableString(row.recommendation), evidence: row.evidence ?? null, verification: row.verification ?? null,
    created_at: nullableString(row.created_at),
  }
}

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
  if (!import.meta.env.DEV && !apiBase.startsWith('https://')) {
    throw new ScanApiError('insecure_api_url', 'Production account scans require an HTTPS API URL.')
  }
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
    const result = asRecord(await request<unknown>('/api/scans', accessToken, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    }))
    if (typeof result.replayed !== 'boolean') return invalidResponse()
    return { scan: parseScan(result.scan), replayed: result.replayed }
  },
  async listScans(accessToken: string): Promise<ApiScan[]> {
    const result = asRecord(await request<unknown>('/api/scans', accessToken))
    if (!Array.isArray(result.scans)) return invalidResponse()
    return result.scans.map(parseScan)
  },
  async getScan(scanId: string, accessToken: string): Promise<ApiScan> {
    const result = asRecord(await request<unknown>(`/api/scans/${encodeURIComponent(scanId)}`, accessToken))
    return parseScan(result.scan)
  },
  async listFindings(scanId: string, accessToken: string): Promise<ApiFinding[]> {
    const result = asRecord(await request<unknown>(`/api/scans/${encodeURIComponent(scanId)}/findings`, accessToken))
    if (!Array.isArray(result.findings)) return invalidResponse()
    const findings = result.findings.map(parseFinding)
    if (findings.some((finding) => finding.scan_id !== scanId)) return invalidResponse()
    return findings
  },
  async getSource(scanId: string, accessToken: string): Promise<ApiScanSource> {
    const result = asRecord(await request<unknown>(`/api/scans/${encodeURIComponent(scanId)}/source`, accessToken))
    if (typeof result.sourceCode !== 'string') return invalidResponse()
    return { sourceCode: result.sourceCode, sourceFilename: nullableString(result.sourceFilename) }
  },
}
