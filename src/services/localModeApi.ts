export type LocalScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type LocalScan = {
  id: string
  contractName: string
  inputType: 'upload' | 'paste'
  compilerVersion: string
  status: LocalScanStatus
  summary: Record<string, unknown>
  errorCode: string | null
  errorMessage: string | null
  analysisEngine: string | null
  analysisVersion: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type LocalFinding = {
  id: string
  title: string
  rule_id: string
  severity: string
  confidence: string
  category: string
  description: string
  recommendation: string
  line_start: number | null
  line_end: number | null
  code_excerpt: string | null
  evidence: unknown
}

export type LocalGeminiReview = {
  reviewText: string
  provider: 'gemini'
  model: string
  generatedAt: string
  reviewedChars: number
  sourceTruncated: boolean
}

export type LocalSubmit = {
  contractName: string
  sourceFilename: string | null
  sourceCode: string
  inputType: 'upload' | 'paste'
  compilerVersion: string
  notes?: string
}

type ErrorBody = { error?: { code?: unknown; message?: unknown } }

export class LocalModeApiError extends Error {
  readonly code: string
  readonly status?: number

  constructor(code: string, message: string, status?: number) {
    super(message)
    this.name = 'LocalModeApiError'
    this.code = code
    this.status = status
  }
}

const defaultApi = 'http://127.0.0.1:8765'
const apiBase = (import.meta.env.VITE_CONTRACTIQ_API_URL?.trim() || (import.meta.env.DEV ? defaultApi : '')).replace(/\/$/, '')

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LocalModeApiError('invalid_response', 'The local scanner returned an invalid response.')
  return value as Record<string, unknown>
}

function parseScan(value: unknown): LocalScan {
  const row = asRecord(value)
  if (typeof row.id !== 'string' || typeof row.contractName !== 'string'
      || typeof row.compilerVersion !== 'string' || typeof row.createdAt !== 'string'
      || typeof row.updatedAt !== 'string'
      || !['queued', 'running', 'completed', 'failed', 'cancelled'].includes(String(row.status))
      || (row.inputType !== 'upload' && row.inputType !== 'paste')) {
    throw new LocalModeApiError('invalid_response', 'The local scanner returned an incomplete scan record.')
  }
  const summary = row.summary && typeof row.summary === 'object' && !Array.isArray(row.summary)
    ? row.summary as Record<string, unknown> : {}
  const nullableString = (entry: unknown) => entry == null ? null : typeof entry === 'string' ? entry : null
  return {
    id: row.id, contractName: row.contractName, inputType: row.inputType,
    compilerVersion: row.compilerVersion, status: row.status as LocalScanStatus,
    summary, errorCode: nullableString(row.errorCode), errorMessage: nullableString(row.errorMessage),
    analysisEngine: nullableString(row.analysisEngine), analysisVersion: nullableString(row.analysisVersion),
    createdAt: row.createdAt, updatedAt: row.updatedAt, completedAt: nullableString(row.completedAt),
  }
}

function parseFinding(value: unknown): LocalFinding {
  const row = asRecord(value)
  if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.rule_id !== 'string'
      || typeof row.severity !== 'string' || typeof row.description !== 'string') {
    throw new LocalModeApiError('invalid_response', 'The local scanner returned an incomplete finding.')
  }
  const validLine = (line: unknown) => line == null ? null : Number.isInteger(line) && Number(line) > 0 ? Number(line) : null
  return {
    id: row.id, title: row.title, rule_id: row.rule_id, severity: row.severity,
    confidence: typeof row.confidence === 'string' ? row.confidence : 'unknown',
    category: typeof row.category === 'string' ? row.category : 'slither',
    description: row.description, recommendation: typeof row.recommendation === 'string' ? row.recommendation : '',
    line_start: validLine(row.line_start), line_end: validLine(row.line_end),
    code_excerpt: typeof row.code_excerpt === 'string' ? row.code_excerpt : null, evidence: row.evidence,
  }
}

function parseGeminiReview(value: unknown): LocalGeminiReview {
  const row = asRecord(value)
  if (typeof row.reviewText !== 'string' || !row.reviewText.trim()
      || row.provider !== 'gemini' || typeof row.model !== 'string' || typeof row.generatedAt !== 'string'
      || !Number.isInteger(row.reviewedChars) || typeof row.sourceTruncated !== 'boolean') {
    throw new LocalModeApiError('invalid_response', 'Gemini returned an invalid source review.')
  }
  return { reviewText: row.reviewText,
    provider: 'gemini', model: row.model, generatedAt: row.generatedAt,
    reviewedChars: Number(row.reviewedChars), sourceTruncated: row.sourceTruncated }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiBase) throw new LocalModeApiError('not_configured', 'Local scans are available from the local development server only.')
  if (!import.meta.env.DEV && !apiBase.startsWith('https://')) {
    throw new LocalModeApiError('insecure_api_url', 'Local scanner requests require HTTPS outside local development.')
  }
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15_000)
  let response: Response
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
    })
  } catch {
    const message = controller.signal.aborted
      ? 'The local scanner did not respond. Check Docker and retry.'
      : 'Could not reach the local scan API. Start it with `python scanner-worker/server.py`.'
    throw new LocalModeApiError(controller.signal.aborted ? 'request_timeout' : 'connection_error', message)
  } finally {
    window.clearTimeout(timeout)
  }
  let body: unknown
  try { body = await response.json() } catch { body = null }
  if (!response.ok) {
    const error = body && typeof body === 'object' ? (body as ErrorBody).error : undefined
    const code = typeof error?.code === 'string' ? error.code : `http_${response.status}`
    const message = typeof error?.message === 'string' ? error.message : `Local scan API request failed (${response.status}).`
    throw new LocalModeApiError(code, message, response.status)
  }
  if (!body || typeof body !== 'object') throw new LocalModeApiError('invalid_response', 'The local scanner returned unreadable data.', response.status)
  return body as T
}

export const localModeApi = {
  async status(): Promise<{ enabled: boolean; mode: string; authenticated: boolean; storage: string; persistsAcrossRestarts: boolean; analyzer: string }> {
    const status = asRecord(await request<unknown>('/api/local/status'))
    if (typeof status.enabled !== 'boolean') throw new LocalModeApiError('invalid_response', 'The local scanner status response is invalid.')
    if (!status.enabled) throw new LocalModeApiError('local_mode_disabled', 'The API is running in Supabase mode. Set LOCAL_MODE=true and restart it to use local scans.')
    return status as unknown as { enabled: boolean; mode: string; authenticated: boolean; storage: string; persistsAcrossRestarts: boolean; analyzer: string }
  },
  async submit(input: LocalSubmit, idempotencyKey: string): Promise<LocalScan> {
    const result = asRecord(await request<unknown>('/api/local/scans', {
      method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input),
    }))
    if (result.mode !== 'local') throw new LocalModeApiError('wrong_mode', 'The API did not accept this as a local scan.')
    return parseScan(result.scan)
  },
  async listScans(): Promise<LocalScan[]> {
    const result = asRecord(await request<unknown>('/api/local/scans'))
    if (!Array.isArray(result.scans)) throw new LocalModeApiError('invalid_response', 'The local scan history is invalid.')
    return result.scans.map(parseScan)
  },
  async getScan(scanId: string): Promise<LocalScan> {
    const result = asRecord(await request<unknown>(`/api/local/scans/${encodeURIComponent(scanId)}`))
    return parseScan(result.scan)
  },
  async getSource(scanId: string): Promise<{ sourceCode: string; sourceFilename: string | null }> {
    const result = asRecord(await request<unknown>(`/api/local/scans/${encodeURIComponent(scanId)}/source`))
    if (typeof result.sourceCode !== 'string') throw new LocalModeApiError('invalid_response', 'The local scan source is unavailable.')
    return { sourceCode: result.sourceCode, sourceFilename: typeof result.sourceFilename === 'string' ? result.sourceFilename : null }
  },
  async listFindings(scanId: string): Promise<LocalFinding[]> {
    const result = asRecord(await request<unknown>(`/api/local/scans/${encodeURIComponent(scanId)}/findings`))
    if (!Array.isArray(result.findings)) throw new LocalModeApiError('invalid_response', 'The local scan findings are invalid.')
    return result.findings.map(parseFinding)
  },
  async reviewFailedScanWithGemini(scanId: string): Promise<LocalGeminiReview> {
    const result = asRecord(await request<unknown>(`/api/local/scans/${encodeURIComponent(scanId)}/gemini-review`, { method: 'POST' }))
    if (result.mode !== 'local') throw new LocalModeApiError('wrong_mode', 'The API did not return a local Gemini review.')
    return parseGeminiReview(result.review)
  },
}
