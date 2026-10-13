import { scanStatuses, severities } from '../types/domain'
import type { DashboardTotals, Scan, ScanStatus } from '../types/domain'
import { findingService } from './findingService'
import { scanService } from './scanService'

export type HistoryRow = Scan & { totalFindings: number; findingsBySeverity: DashboardTotals['findingsBySeverity'] }

export const dashboardService = {
  getTotals(): DashboardTotals {
    const scans = scanService.list()
    const findings = findingService.list()
    const scansByStatus = Object.fromEntries(scanStatuses.map((status) => [status, scans.filter((scan) => scan.status === status).length])) as DashboardTotals['scansByStatus']
    const findingsBySeverity = Object.fromEntries(severities.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length])) as DashboardTotals['findingsBySeverity']
    return { totalScans: scans.length, scansByStatus, totalFindings: findings.length, findingsBySeverity }
  },
}

export const historyService = {
  list(): HistoryRow[] {
    return scanService.list().map((scan) => {
      const findings = findingService.listByScan(scan.id)
      const findingsBySeverity = Object.fromEntries(severities.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length])) as DashboardTotals['findingsBySeverity']
      return { ...scan, totalFindings: findings.length, findingsBySeverity }
    })
  },

  listByStatus(status: ScanStatus): HistoryRow[] {
    return this.list().filter((row) => row.status === status)
  },
}
