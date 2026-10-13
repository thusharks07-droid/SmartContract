import type { ScanSummaryData } from '../../types/domain'
import { ScanStatusBadge } from './ScanStatusBadge'
import { SeverityBadge } from './SeverityBadge'

type ScanSummaryProps = { scan: ScanSummaryData }

const severityOrder = ['critical', 'high', 'medium', 'low', 'informational'] as const

export function ScanSummary({ scan }: ScanSummaryProps) {
  const findingTotal = Object.values(scan.findingCounts).reduce((total, count) => total + (count ?? 0), 0)
  return (
    <section className="scan-summary" aria-label={`Summary for ${scan.targetName}`}>
      <div className="scan-summary__heading"><div><p className="eyebrow">ANALYSIS SUMMARY · DEMO DATA</p><h2>{scan.targetName}</h2><span className="scan-summary__id">{scan.id} · {scan.submittedAt}</span></div><ScanStatusBadge status={scan.status} /></div>
      <div className="scan-summary__findings"><span className="scan-summary__total">{findingTotal} <small>findings in demo record</small></span><div className="scan-summary__badges">{severityOrder.filter((severity) => (scan.findingCounts[severity] ?? 0) > 0).map((severity) => <span className="scan-summary__severity" key={severity}><SeverityBadge severity={severity} /><span>× {scan.findingCounts[severity]}</span></span>)}</div></div>
      <p className="scan-summary__disclaimer">This is deterministic mock data. No real security analysis ran.</p>
    </section>
  )
}
