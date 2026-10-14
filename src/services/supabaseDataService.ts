import type { SupabaseClient } from '@supabase/supabase-js'
import { severities } from '../types/domain'
import type { Finding, Scan, ScanConfiguration, Severity } from '../types/domain'
import type { Database, Json } from '../lib/supabase/database.types'
import { supabase, supabaseConfiguration } from '../lib/supabase/client'

const PAGE_LIMIT = 250
type PersistedVerification = Omit<Finding['verification'], 'banner'>
export type PersistedFinding = Omit<Finding, 'verification'> & { verification: PersistedVerification }
type ScanRow = Pick<Database['public']['Tables']['contractiq_scans']['Row'],
  'id' | 'contract_name' | 'source_filename' | 'input_type' | 'compiler_version' | 'status' | 'options' | 'notes' | 'created_at' | 'updated_at'>

export class SupabaseDataError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'SupabaseDataError'
    this.code = code
  }
}

function requireClient(client: SupabaseClient<Database> | null = supabase): SupabaseClient<Database> {
  if (!client) throw new SupabaseDataError(supabaseConfiguration.message ?? 'Supabase is not configured.', 'not_configured')
  return client
}

async function requireUserId(client: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await client.auth.getUser()
  if (error) throw new SupabaseDataError(error.message, error.code ?? 'auth_error')
  if (!data.user) throw new SupabaseDataError('Sign in to use account-backed scan storage.', 'not_authenticated')
  return data.user.id
}

function configurationFromRow(row: Pick<ScanRow, 'options' | 'compiler_version'>): ScanConfiguration {
  const options = typeof row.options === 'object' && row.options !== null && !Array.isArray(row.options) ? row.options : {}
  const rawAnalysis = options.analysisOptions
  const analysisOptions = typeof rawAnalysis === 'object' && rawAnalysis !== null && !Array.isArray(rawAnalysis)
    ? {
        reentrancy: rawAnalysis.reentrancy === true,
        accessControl: rawAnalysis.accessControl === true,
        staticAnalysis: rawAnalysis.staticAnalysis === true,
      }
    : { reentrancy: true, accessControl: true, staticAnalysis: true }
  return {
    compilerVersion: row.compiler_version ?? 'Not selected',
    optimizationEnabled: options.optimizationEnabled === true,
    optimizationRuns: typeof options.optimizationRuns === 'number' ? options.optimizationRuns : 200,
    evmVersion: typeof options.evmVersion === 'string' ? options.evmVersion : 'Default',
    includeInformational: options.includeInformational !== false,
    analysisOptions,
  }
}

function mapScan(row: ScanRow): Scan {
  const sourceLabel = row.source_filename ?? `${row.contract_name}.sol`
  return {
    id: row.id,
    contractName: row.contract_name,
    sourceLabel,
    submittedAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    configuration: configurationFromRow(row),
    sourceFiles: [sourceLabel],
    inputType: row.input_type,
    notes: row.notes ?? undefined,
    summary: row.status === 'queued'
      ? 'Queued submission. Analysis has not completed.'
      : `Status: ${row.status}. The result reflects only data returned by the configured trusted service.`,
  }
}

function isEvidenceReference(value: unknown): value is Finding['evidence'][number] {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.file === 'string'
    && typeof item.startLine === 'number' && typeof item.endLine === 'number'
    && typeof item.excerpt === 'string' && typeof item.note === 'string'
}

function parseEvidence(value: Json): Finding['evidence'] {
  return Array.isArray(value) ? value.filter(isEvidenceReference) : []
}

function parseVerification(value: Json, findingId: string): PersistedVerification {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const item = value as Record<string, Json | undefined>
    if (typeof item.id === 'string' && typeof item.recordedAt === 'string' && typeof item.note === 'string') {
      return {
        id: item.id,
        findingId,
        status: item.status === 'verified' || item.status === 'not_reproduced' || item.status === 'inconclusive' || item.status === 'error' || item.status === 'pending' ? item.status : 'not_run',
        recordedAt: item.recordedAt,
        note: item.note,
        preconditions: typeof item.preconditions === 'string' ? item.preconditions : '',
        testScenario: typeof item.testScenario === 'string' ? item.testScenario : '',
        expectedBehavior: typeof item.expectedBehavior === 'string' ? item.expectedBehavior : '',
        observedBehavior: typeof item.observedBehavior === 'string' ? item.observedBehavior : '',
        stateChanges: typeof item.stateChanges === 'string' ? item.stateChanges : '',
        executionEnvironment: typeof item.executionEnvironment === 'string' ? item.executionEnvironment : '',
        evidenceRefs: Array.isArray(item.evidenceRefs) ? item.evidenceRefs.filter((entry): entry is string => typeof entry === 'string') : [],
      }
    }
  }
  return {
    id: `verification-${findingId}`,
    findingId,
    status: 'not_run',
    recordedAt: '',
    note: 'No verification record is available. No exploit was executed by this frontend.',
    preconditions: '', testScenario: '', expectedBehavior: '', observedBehavior: '', stateChanges: '', executionEnvironment: '', evidenceRefs: [],
  }
}

function mapFinding(row: Database['public']['Tables']['contractiq_findings']['Row']): PersistedFinding {
  return {
    id: row.id,
    scanId: row.scan_id,
    title: row.title,
    category: row.category ?? 'Uncategorized',
    severity: row.severity,
    confidence: row.confidence ?? 'low',
    description: row.description,
    impact: row.impact,
    recommendation: row.recommendation,
    evidence: parseEvidence(row.evidence),
    verification: parseVerification(row.verification, row.id),
  }
}

function throwDataError(error: { message: string; code?: string }): never {
  throw new SupabaseDataError(error.message, error.code ?? 'database_error')
}

export type PersistedWorkspaceReport = {
  generatedAt: string
  totalScans: number
  queuedScans: number
  completedScans: number
  failedScans: number
  totalFindings: number
  findingsBySeverity: Record<Severity, number>
  notice: string
}

export const supabaseDataService = {
  async listScans(): Promise<Scan[]> {
    const client = requireClient()
    const userId = await requireUserId(client)
    const { data, error } = await client.from('contractiq_scans').select('id,contract_name,source_filename,input_type,compiler_version,status,options,notes,created_at,updated_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(PAGE_LIMIT)
    if (error) throwDataError(error)
    return data.map(mapScan)
  },

  async getScan(scanId: string): Promise<Scan | null> {
    const client = requireClient()
    const userId = await requireUserId(client)
    const { data, error } = await client.from('contractiq_scans').select('id,contract_name,source_filename,input_type,compiler_version,status,options,notes,created_at,updated_at').eq('id', scanId).eq('user_id', userId).maybeSingle()
    if (error) throwDataError(error)
    return data ? mapScan(data) : null
  },

  async getSourceCode(scanId: string): Promise<string | null> {
    const client = requireClient()
    const userId = await requireUserId(client)
    const { data, error } = await client.from('contractiq_scans').select('source_code').eq('id', scanId).eq('user_id', userId).maybeSingle()
    if (error) throwDataError(error)
    return data?.source_code ?? null
  },

  async listFindings(scanId: string): Promise<PersistedFinding[]> {
    const client = requireClient()
    const userId = await requireUserId(client)
    const { data, error } = await client.from('contractiq_findings').select('*').eq('scan_id', scanId).eq('user_id', userId).order('created_at', { ascending: true }).limit(PAGE_LIMIT)
    if (error) throwDataError(error)
    return data.map(mapFinding)
  },

  async buildWorkspaceReport(): Promise<PersistedWorkspaceReport> {
    const [scans, findings] = await Promise.all([this.listScans(), this.listAllFindings()])
    const findingsBySeverity = Object.fromEntries(severities.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length])) as Record<Severity, number>
    return {
      generatedAt: new Date().toISOString(),
      totalScans: scans.length,
      queuedScans: scans.filter((scan) => scan.status === 'queued').length,
      completedScans: scans.filter((scan) => scan.status === 'completed').length,
      failedScans: scans.filter((scan) => scan.status === 'failed').length,
      totalFindings: findings.length,
      findingsBySeverity,
      notice: 'Account records are user-owned database data. Finding results can only be written by a trusted analyzer; this frontend does not perform contract analysis.',
    }
  },

  async listAllFindings(): Promise<PersistedFinding[]> {
    const client = requireClient()
    const userId = await requireUserId(client)
    const { data, error } = await client.from('contractiq_findings').select('*').eq('user_id', userId).order('created_at', { ascending: true }).limit(PAGE_LIMIT)
    if (error) throwDataError(error)
    return data.map(mapFinding)
  },
}
