import { ArrowLeft, ArrowRight, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { ReportLayout } from '../components/ui/ReportLayout'
import { ScanStatusBadge } from '../components/ui/ScanStatusBadge'
import { SeverityBadge } from '../components/ui/SeverityBadge'
import { VerificationStatusBadge } from '../components/ui/VerificationStatusBadge'
import { reportService } from '../services/reportService'
import { scanService } from '../services/scanService'
import { settingsService } from '../services/settingsService'
import { formatDate, formatDateTime } from './pageUtils'
import type { Severity } from '../types/domain'
import { useWorkspaceMode } from '../state/useWorkspaceMode'
import { AccountReportPage } from './AccountWorkspacePages'

const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'informational']

export function ReportPage() {
  const { mode } = useWorkspaceMode()
  if (mode === 'account') return <AccountReportPage />
  return <DemoReportPage />
}

function DemoReportPage() {
  const { scanId = '' } = useParams()
  const report = reportService.buildForScan(scanId)
  const scan = scanService.get(scanId)
  if (!report || !scan) return <div className="page-stack"><PageHeader title="Report not found" eyebrow="DEMO REPORTS" description="The requested scan report is unavailable in this browser session." /><EmptyState title="No report for this scan" description="The scan may have been deleted or its ID may be invalid." action={<Link className="button button--primary" to="/scans">Back to History</Link>} /></div>
  const settings = settingsService.get()
  const countSummary = severityOrder.map((severity) => `${report.findingCounts[severity]} ${severity}`).join(' · ')

  return <div className="page-stack report-page">
    <PageHeader title="Report Viewer" eyebrow="GENERATED DEMO REPORT" description="Printable report generated from the shared deterministic mock services." actions={<Link className="button button--secondary" to={`/scans/${scan.id}`}><ArrowLeft size={14} />Back to scan details</Link>} />
    <ReportLayout title={`${report.contractName} · Security Review`} reportId={report.id} generatedAt={`${formatDate(report.generatedAt)} · demo`} actions={<Link className="button button--secondary button--small no-print" to={`/scans/${scan.id}`}><ArrowRight size={14} />Scan details</Link>} cover={<div className="report-cover-band" aria-hidden="true"><svg viewBox="0 0 1200 180" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="report-wire" x1="0" x2="1"><stop offset="0" stopColor="#2563eb" stopOpacity=".16" /><stop offset=".5" stopColor="#38bdf8" stopOpacity=".65" /><stop offset="1" stopColor="#8b5cf6" stopOpacity=".22" /></linearGradient></defs><path d="M0 140 140 85 270 112 405 45 540 92 660 35 815 92 945 50 1080 92 1200 36M0 43 140 85 270 20 405 45 540 16 660 35 815 24 945 50 1080 15 1200 36M140 85v68m130-133v92m135-67v85m135-114v76m120-57v70m155-46v80m130-122v80m135-65v74" fill="none" stroke="url(#report-wire)" strokeWidth="2" />{[[0,140],[140,85],[270,112],[405,45],[540,92],[660,35],[815,92],[945,50],[1080,92],[1200,36],[270,20],[540,16],[815,24],[1080,15]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#2563eb" fillOpacity=".42" />)}</svg></div>}>
      <section className="report-section report-executive"><h2>Executive Summary</h2><div className="report-callout">{report.summary}</div><div className="report-kpi-grid"><div><strong>{report.totalFindings}</strong><span>Findings in this demo record</span></div><div><strong><ScanStatusBadge status={report.status} /></strong><span>Record status</span></div><div><strong>{scan.sourceFiles.length}</strong><span>Source file{scan.sourceFiles.length === 1 ? '' : 's'} referenced</span></div></div><p>Report figures come from the smartBOB mock service layer. No real security analysis or exploit execution ran.</p></section>
      <section className="report-section"><h2>Scope &amp; Analysis Configuration</h2><dl className="report-definition-grid"><div><dt>Contract / project</dt><dd>{scan.contractName}</dd></div><div><dt>Demo record ID</dt><dd><code>{scan.id}</code></dd></div><div><dt>Submitted</dt><dd>{formatDateTime(scan.submittedAt)}</dd></div><div><dt>Input</dt><dd>{scan.inputType === 'paste' ? 'Pasted Solidity' : 'Local Solidity file'} · {scan.sourceLabel}</dd></div><div><dt>Compiler version</dt><dd>Solidity {scan.configuration.compilerVersion}</dd></div><div><dt>Optimizer</dt><dd>{scan.configuration.optimizationEnabled ? `Enabled · ${scan.configuration.optimizationRuns} runs` : 'Disabled'}</dd></div><div><dt>EVM target</dt><dd>{scan.configuration.evmVersion}</dd></div><div><dt>Options</dt><dd>{scan.configuration.analysisOptions ? Object.entries(scan.configuration.analysisOptions).filter(([, enabled]) => enabled).map(([key]) => key.replace(/([A-Z])/g, ' $1')).join(', ') : 'Reentrancy, Access Control, Static'}</dd></div></dl>{scan.notes && <p><strong>Submitted notes:</strong> {scan.notes}</p>}</section>
      <section className="report-section"><h2>Summary of Findings</h2><p>{report.summary}</p><p className="report-severity-line">{countSummary}</p><p className="subtle-copy">A zero-finding report means the demo dataset contains no findings for this record; it is not a security guarantee.</p></section>
      <section className="report-section"><h2>Findings by Severity</h2><div className="report-severity-grid">{severityOrder.map((severity) => <div key={severity}><SeverityBadge severity={severity} /><strong>{report.findingCounts[severity]}</strong></div>)}</div></section>
      <section className="report-section"><h2>Detailed Findings</h2>{report.findings.length ? <div className="report-finding-list">{report.findings.map((finding, index) => <article className="report-finding" key={finding.id}><div className="report-finding__heading"><span className="report-finding__index">{String(index + 1).padStart(2, '0')}</span><h3>{finding.title}</h3><SeverityBadge severity={finding.severity} /></div><p>{finding.description}</p><dl className="report-definition-grid"><div><dt>Category</dt><dd>{finding.category}</dd></div><div><dt>Confidence</dt><dd>{finding.confidence}</dd></div><div><dt>Location</dt><dd><code>{finding.evidence[0]?.file}:{finding.evidence[0]?.startLine}</code></dd></div></dl><pre className="report-code"><code>{finding.evidence[0]?.excerpt}</code></pre><p><strong>Potential impact:</strong> {finding.impact}</p><p><strong>Recommendation:</strong> {finding.recommendation}</p><Link className="text-link no-print" to={`/scans/${scan.id}/findings/${finding.id}`}>Open finding details <ArrowRight size={13} /></Link></article>)}</div> : <div className="report-callout">No findings are recorded for this scan in the demo dataset. This is not a security guarantee.</div>}</section>
      {settings.reportDisplay.showVerification && <section className="report-section"><h2>Verification Results</h2><div className="table-scroll"><table className="report-table"><thead><tr><th>Finding</th><th>Status</th><th>Recorded</th><th>Evidence</th></tr></thead><tbody>{report.findings.map((finding) => <tr key={finding.id}><td>{finding.title}</td><td><VerificationStatusBadge status={finding.verification.status} /></td><td>{formatDate(finding.verification.recordedAt)}</td><td>{finding.verification.evidenceRefs.join(', ')}</td></tr>)}</tbody></table></div><p className="report-disclaimer-line">DEMO DATA — NO EXPLOIT EXECUTED. Statuses describe seeded fixture records only.</p></section>}
      {settings.reportDisplay.showRemediations && <section className="report-section"><h2>Recommended Remediations</h2>{report.findings.length ? <ol className="report-remediation-list">{report.findings.map((finding) => <li key={finding.id}><strong>{finding.title}</strong><span>{finding.recommendation}</span></li>)}</ol> : <p>No remediation items are attached to this empty demo record.</p>}</section>}
      <section className="report-section report-limitations"><h2>Limitations &amp; Disclaimer</h2><ul><li>This is a frontend-only demonstration with deterministic mock records.</li><li>No backend requests, compiler runs, static analysis, exploit attempts, or chain interactions occurred.</li><li>Finding descriptions and suggestions are illustrative and require independent expert review.</li><li>Report content is not an assurance, audit opinion, or statement that a contract is safe.</li></ul><p>Generated {formatDateTime(report.generatedAt)} · smartBOB demo workspace.</p></section>
      <div className="report-bottom-actions no-print"><button className="button button--primary" type="button" onClick={() => window.print()}><Printer size={15} />Print / Save as PDF</button><Link className="button button--secondary" to={`/scans/${scan.id}`}>Back to scan details</Link></div>
    </ReportLayout>
  </div>
}
