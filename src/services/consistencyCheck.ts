import { scanStatuses, severities, verificationStatuses } from '../types/domain'
import vaultSource from '../data/samples/Vault.sol?raw'
import treasurySource from '../data/samples/Treasury.sol?raw'
import tokenLedgerSource from '../data/samples/TokenLedger.sol?raw'
import { dashboardService, historyService } from './aggregateService'
import { findingService } from './findingService'
import { reportService } from './reportService'
import { scanService } from './scanService'

export type ConsistencyResult = { ok: true; totals: { scans: number; findings: number }; checks: string[] }

export function checkDataConsistency(): ConsistencyResult {
  const dashboard = dashboardService.getTotals()
  const history = historyService.list()
  const workspaceReport = reportService.buildWorkspaceReport()
  const checks: string[] = []
  const historyFindings = history.reduce((sum, row) => sum + row.totalFindings, 0)

  if (dashboard.totalScans !== history.length || dashboard.totalScans !== workspaceReport.totalScans) {
    throw new Error(`Scan totals disagree: dashboard=${dashboard.totalScans}, history=${history.length}, report=${workspaceReport.totalScans}`)
  }
  checks.push('Dashboard, history, and workspace report scan totals match')

  if (dashboard.totalFindings !== historyFindings || dashboard.totalFindings !== workspaceReport.totalFindings) {
    throw new Error(`Finding totals disagree: dashboard=${dashboard.totalFindings}, history=${historyFindings}, report=${workspaceReport.totalFindings}`)
  }
  checks.push('Dashboard, history, and workspace report finding totals match')

  for (const status of scanStatuses) {
    const historyCount = history.filter((row) => row.status === status).length
    if (dashboard.scansByStatus[status] !== historyCount || dashboard.scansByStatus[status] !== workspaceReport.scansByStatus[status]) {
      throw new Error(`Status count disagrees for ${status}`)
    }
  }
  checks.push('All scan status counts match')

  for (const severity of severities) {
    const historyCount = history.reduce((sum, row) => sum + row.findingsBySeverity[severity], 0)
    if (dashboard.findingsBySeverity[severity] !== historyCount || dashboard.findingsBySeverity[severity] !== workspaceReport.findingCounts[severity]) {
      throw new Error(`Severity count disagrees for ${severity}`)
    }
  }
  checks.push('All severity totals match')

  for (const scan of scanService.list()) {
    const row = history.find((item) => item.id === scan.id)
    const report = reportService.buildForScan(scan.id)
    if (!row || !report || row.totalFindings !== report.totalFindings) throw new Error(`Per-scan finding totals disagree for ${scan.id}`)
    for (const severity of severities) {
      if (row.findingsBySeverity[severity] !== report.findingCounts[severity]) throw new Error(`Per-scan ${severity} count disagrees for ${scan.id}`)
    }
  }
  checks.push('Every scan report matches its history row')

  const findings = findingService.list()
  const foundSeverities = new Set(findings.map((finding) => finding.severity))
  const foundVerifications = new Set(findings.map((finding) => finding.verification.status))
  for (const severity of severities) if (!foundSeverities.has(severity)) throw new Error(`Missing fixture severity: ${severity}`)
  for (const status of verificationStatuses) if (!foundVerifications.has(status)) throw new Error(`Missing fixture verification status: ${status}`)
  for (const finding of findings) {
    if (finding.verification.banner !== 'DEMO DATA — NO EXPLOIT EXECUTED') throw new Error(`Missing verification demo banner: ${finding.id}`)
    const scan = scanService.get(finding.scanId)
    if (!scan) throw new Error(`Finding references missing scan: ${finding.id}`)
    const sourceByFile: Record<string, string> = { 'Vault.sol': vaultSource, 'Treasury.sol': treasurySource, 'TokenLedger.sol': tokenLedgerSource }
    for (const evidence of finding.evidence) {
      const source = sourceByFile[evidence.file]
      if (!source || !scan.sourceFiles.includes(evidence.file)) throw new Error(`Evidence file is not attached to scan ${finding.scanId}: ${evidence.file}`)
      const excerpt = source.split(/\r?\n/).slice(evidence.startLine - 1, evidence.endLine).join('\n').trim()
      if (excerpt !== evidence.excerpt.trim()) throw new Error(`Source reference mismatch at ${evidence.file}:${evidence.startLine}-${evidence.endLine}`)
    }
  }
  checks.push('Seed findings cover every severity and verification state with the required banner')
  checks.push('Every evidence excerpt matches its line-accurate Solidity source reference')

  return { ok: true, totals: { scans: dashboard.totalScans, findings: dashboard.totalFindings }, checks }
}
