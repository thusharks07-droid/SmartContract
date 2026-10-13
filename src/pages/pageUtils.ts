import type { Finding, Scan, Severity } from '../types/domain'

export const formatDate = (value: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) =>
  new Intl.DateTimeFormat(undefined, options).format(new Date(value))

export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

const severityRank: Record<Severity, number> = { critical: 5, high: 4, medium: 3, low: 2, informational: 1 }

export function highestSeverity(findings: Finding[]): Severity | null {
  return findings.reduce<Severity | null>((highest, finding) => !highest || severityRank[finding.severity] > severityRank[highest] ? finding.severity : highest, null)
}

export function getScanFileLabel(scan: Scan) {
  return scan.sourceFiles.join(', ') || scan.sourceLabel
}

export function filenameFromPath(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}
