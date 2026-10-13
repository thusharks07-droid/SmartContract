import { scanStatuses, severities, verificationStatuses } from '../types/domain'
import type { Report, ScanStatus } from '../types/domain'
import { DEMO_REPORT_NOTICE } from '../data/mockData'
import { findingService } from './findingService'
import { scanService } from './scanService'

function countsBySeverity(findings: Report['findings']): Report['findingCounts'] {
  return Object.fromEntries(severities.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length])) as Report['findingCounts']
}

export const reportService = {
  buildForScan(scanId: string): Report | undefined {
    const scan = scanService.get(scanId)
    if (!scan) return undefined
    const findings = findingService.listByScan(scanId)
    const verificationCounts = Object.fromEntries(verificationStatuses.map((status) => [status, findings.filter((finding) => finding.verification.status === status).length])) as Report['verificationCounts']
    return {
      id: `demo-report-${scan.id}`,
      scanId: scan.id,
      contractName: scan.contractName,
      generatedAt: scan.updatedAt,
      status: scan.status,
      findings,
      findingCounts: countsBySeverity(findings),
      totalFindings: findings.length,
      verificationCounts,
      summary: findings.length === 0
        ? 'No findings are recorded for this scan in the demo dataset. This is not a security guarantee.'
        : `${findings.length} illustrative finding${findings.length === 1 ? '' : 's'} are recorded in this demo dataset.`,
      demoNotice: DEMO_REPORT_NOTICE,
    }
  },

  buildWorkspaceReport(): { id: string; generatedAt: string; totalScans: number; scansByStatus: Record<ScanStatus, number>; totalFindings: number; findingCounts: Report['findingCounts']; demoNotice: typeof DEMO_REPORT_NOTICE } {
    const scans = scanService.list()
    const findings = findingService.list()
    const scansByStatus = Object.fromEntries(scanStatuses.map((status) => [status, scans.filter((scan) => scan.status === status).length])) as Record<ScanStatus, number>
    return {
      id: 'demo-workspace-report-2026-09-20',
      generatedAt: '2026-09-20T12:00:00.000Z',
      totalScans: scans.length,
      scansByStatus,
      totalFindings: findings.length,
      findingCounts: countsBySeverity(findings),
      demoNotice: DEMO_REPORT_NOTICE,
    }
  },
}
