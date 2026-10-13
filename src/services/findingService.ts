import { seedFindings } from '../data/mockData'
import type { Finding, Severity, VerificationStatus } from '../types/domain'
import { scanService } from './scanService'

export type FindingFilters = {
  scanId?: string
  severity?: Severity
  category?: string
  verificationStatus?: VerificationStatus
}

export const findingService = {
  list(filters: FindingFilters = {}): Finding[] {
    const existingScanIds = new Set(scanService.list().map((scan) => scan.id))
    return seedFindings.filter((finding) => existingScanIds.has(finding.scanId) &&
      (!filters.scanId || finding.scanId === filters.scanId)
      && (!filters.severity || finding.severity === filters.severity)
      && (!filters.category || finding.category === filters.category)
      && (!filters.verificationStatus || finding.verification.status === filters.verificationStatus),
    ).map((finding) => ({ ...finding, evidence: finding.evidence.map((item) => ({ ...item })), verification: { ...finding.verification } }))
  },

  get(findingId: string): Finding | undefined {
    return this.list().find((finding) => finding.id === findingId)
  },

  listByScan(scanId: string): Finding[] {
    return this.list({ scanId })
  },
}
