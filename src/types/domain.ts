export const severities = ['critical', 'high', 'medium', 'low', 'informational'] as const
export type Severity = (typeof severities)[number]

export const scanStatuses = ['draft', 'queued', 'running', 'completed', 'failed', 'cancelled'] as const
export type ScanStatus = (typeof scanStatuses)[number]

export const verificationStatuses = ['not_run', 'pending', 'verified', 'not_reproduced', 'inconclusive', 'error'] as const
export type VerificationStatus = (typeof verificationStatuses)[number]

export type ScanConfiguration = {
  compilerVersion: string
  optimizationEnabled: boolean
  optimizationRuns: number
  evmVersion: string
  includeInformational: boolean
  analysisOptions?: { reentrancy: boolean; accessControl: boolean; staticAnalysis: boolean }
}

export type Scan = {
  id: string
  contractName: string
  sourceLabel: string
  submittedAt: string
  updatedAt: string
  status: ScanStatus
  configuration: ScanConfiguration
  sourceFiles: string[]
  inputType: 'upload' | 'paste'
  notes?: string
  summary: string
}

export type EvidenceReference = {
  id: string
  file: string
  startLine: number
  endLine: number
  excerpt: string
  note: string
}

export type VerificationResult = {
  id: string
  findingId: string
  status: VerificationStatus
  banner: 'DEMO DATA — NO EXPLOIT EXECUTED'
  recordedAt: string
  note: string
  preconditions: string
  testScenario: string
  expectedBehavior: string
  observedBehavior: string
  stateChanges: string
  executionEnvironment: string
  evidenceRefs: string[]
}

export type Finding = {
  id: string
  scanId: string
  title: string
  category: 'Reentrancy' | 'Access Control' | 'Unchecked External Call' | 'Unsafe State Transition' | string
  severity: Severity
  confidence: 'high' | 'medium' | 'low'
  description: string
  impact: string
  recommendation: string
  evidence: EvidenceReference[]
  verification: VerificationResult
}

export type Report = {
  id: string
  scanId: string
  contractName: string
  generatedAt: string
  status: ScanStatus
  findings: Finding[]
  findingCounts: Record<Severity, number>
  totalFindings: number
  verificationCounts: Record<VerificationStatus, number>
  summary: string
  demoNotice: 'DEMO DATA — NO REAL SECURITY ANALYSIS RAN'
}

export type ContractNode = {
  id: string
  scanId: string
  label: string
  kind: 'contract' | 'function' | 'modifier' | 'state' | 'external'
  file: string
  line: number
  x: number
  y: number
}

export type RelationEdge = {
  id: string
  scanId: string
  source: string
  target: string
  relation: 'calls' | 'reads' | 'writes' | 'sends'
  findingId?: string
}

export type FindingSummary = {
  id: string
  title: string
  severity: Severity
  location: string
  summary: string
}

export type ScanSummaryData = {
  id: string
  targetName: string
  submittedAt: string
  status: ScanStatus
  findingCounts: Partial<Record<Severity, number>>
}

export type DashboardTotals = {
  totalScans: number
  scansByStatus: Record<ScanStatus, number>
  totalFindings: number
  findingsBySeverity: Record<Severity, number>
}

export type ToastMessage = {
  id: number
  title: string
  description?: string
  tone: 'success' | 'info' | 'warning' | 'error'
}
