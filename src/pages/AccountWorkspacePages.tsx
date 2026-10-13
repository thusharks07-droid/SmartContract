import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowRight, CircleAlert, FileCheck2, ShieldAlert } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { DataTable } from '../components/ui/DataTable'
import type { DataColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { SeverityBadge } from '../components/ui/SeverityBadge'
import { StatCard } from '../components/ui/StatCard'
import { CodeViewer } from '../components/ui/CodeViewer'
import { LoadingState } from '../components/ui/LoadingState'
import { useWorkspaceMode } from '../state/useWorkspaceMode'
import { localScanApi, ScanApiError } from '../services/localScanApi'
import type { ApiFinding, ApiScan, Severity } from '../services/localScanApi'

const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'informational']
const staticAnalysisNotice = 'Static analysis output only. Findings require independent validation; a scan with no findings is not a safety guarantee.'

function errorText(error: unknown): string {
  return error instanceof ScanApiError ? error.message : 'The local scan API could not complete the request.'
}

function workerFailureText(scan: ApiScan): string {
  if (scan.errorCode === 'worker_timeout') return 'The local analysis worker timed out. The scan did not complete; retrying is available by submitting again.'
  if (scan.errorCode === 'analyzer_error') return 'The local worker could not complete this source. Compiler diagnostics are not returned by the current API; check the source, compiler selection, and worker availability.'
  return scan.errorMessage ?? 'The worker marked this scan as failed. No completed report is available.'
}

function useScans() {
  const { accessToken } = useWorkspaceMode()
  const requestGeneration = useRef(0)
  const [scanState, setScanState] = useState<{ token: string | null; scans: ApiScan[]; loading: boolean; error: string }>({ token: null, scans: [], loading: true, error: '' })
  const isCurrent = scanState.token === accessToken
  const scans = useMemo(() => isCurrent ? scanState.scans : [], [isCurrent, scanState.scans])
  const loading = !isCurrent || scanState.loading
  const error = isCurrent ? scanState.error : ''
  const refresh = useCallback(async () => {
    if (!accessToken) { setScanState({ token: null, scans: [], loading: false, error: 'Your account session is unavailable. Sign in again.' }); return }
    const generation = requestGeneration.current
    try {
      const nextScans = await localScanApi.listScans(accessToken)
      if (generation !== requestGeneration.current) return
      setScanState({ token: accessToken, scans: nextScans, loading: false, error: '' })
    }
    catch (reason) { if (generation === requestGeneration.current) setScanState({ token: accessToken, scans: [], loading: false, error: errorText(reason) }) }
  }, [accessToken])
  useEffect(() => {
    requestGeneration.current += 1
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])
  useEffect(() => {
    if (!scans.some((scan) => scan.status === 'queued' || scan.status === 'running')) return
    const timer = window.setInterval(() => { void refresh() }, 4000)
    return () => window.clearInterval(timer)
  }, [refresh, scans])
  return { scans, loading, error, refresh }
}

function AccountStatus({ status }: { status: ApiScan['status'] }) {
  return <span className={`badge state-badge badge--${status === 'completed' ? 'success' : status === 'failed' ? 'critical' : status === 'running' ? 'warning' : 'info'}`} aria-label={`Scan status: ${status}`}>
    <span>{status[0]?.toUpperCase()}{status.slice(1)}</span>
  </span>
}

function FindingSeverity({ severity }: { severity: ApiFinding['severity'] }) {
  if (!severity) return <span className="muted-cell">Severity not provided</span>
  if (severityOrder.includes(severity as Severity)) return <SeverityBadge severity={severity as Severity} />
  return <span className="badge" aria-label={`Unrecognized severity returned: ${severity}`}>Severity returned: {severity}</span>
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function ScanError({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="notice-banner notice-banner--warning" role="alert"><CircleAlert size={15} />{message}{retry && <button className="button button--secondary button--small" type="button" onClick={retry}>Retry</button>}</div>
}

export function AccountDashboardPage() {
  const { accessToken } = useWorkspaceMode()
  const { scans, loading, error } = useScans()
  const scanKey = scans.filter((scan) => scan.status === 'completed').map((scan) => scan.id).join('|')
  const [findingState, setFindingState] = useState<{ token: string | null; scanKey: string; findings: ApiFinding[]; error: string }>({ token: null, scanKey: '', findings: [], error: '' })
  const findingStateIsCurrent = findingState.token === accessToken && findingState.scanKey === scanKey
  const findings = useMemo(() => findingStateIsCurrent ? findingState.findings : [], [findingStateIsCurrent, findingState.findings])
  const findingError = findingStateIsCurrent ? findingState.error : ''
  useEffect(() => {
    let active = true
    if (!scanKey || !accessToken) {
      const timer = window.setTimeout(() => setFindingState({ token: accessToken, scanKey, findings: [], error: '' }), 0)
      return () => { active = false; window.clearTimeout(timer) }
    }
    const scanIds = scanKey.split('|')
    void Promise.all(scanIds.map((scanId) => localScanApi.listFindings(scanId, accessToken))).then((groups) => {
      if (active) setFindingState({ token: accessToken, scanKey, findings: groups.flat(), error: '' })
    }).catch((reason: unknown) => { if (active) setFindingState({ token: accessToken, scanKey, findings: [], error: errorText(reason) }) })
    return () => { active = false }
  }, [accessToken, scanKey])
  const counts = useMemo(() => Object.fromEntries(severityOrder.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length])) as Record<Severity, number>, [findings])
  const completed = scans.filter((scan) => scan.status === 'completed').length
  const columns: DataColumn<ApiScan>[] = [
    { id: 'contract', header: 'Contract', cell: (scan) => <Link className="table-primary-link" to={`/app/scans/${scan.id}`}>{scan.contractName}<small>{scan.sourceFilename ?? 'Solidity source'}</small></Link>, sortValue: (scan) => scan.contractName },
    { id: 'compiler', header: 'Compiler', cell: (scan) => <code>{scan.compilerVersion}</code>, sortValue: (scan) => scan.compilerVersion },
    { id: 'status', header: 'Status', cell: (scan) => <AccountStatus status={scan.status} />, sortValue: (scan) => scan.status },
    { id: 'submitted', header: 'Submitted', cell: (scan) => formatDate(scan.createdAt), sortValue: (scan) => scan.createdAt },
    { id: 'open', header: 'Details', cell: (scan) => <Link className="table-action-link" to={`/app/scans/${scan.id}`} aria-label={`Open ${scan.contractName}`}><ArrowRight size={15} /></Link> },
  ]
  return <div className="page-stack">
    <PageHeader title="Security Overview" eyebrow="CONTRACTIQ / ACCOUNT" description="Your account-owned scan records from the local static-analysis worker." actions={<><Link className="button button--secondary" to="/app/scans">View History</Link><Link className="button button--primary" to="/app/new-scan">New Scan</Link></>} />
    <p className="notice-banner" role="note">{staticAnalysisNotice}</p>
    {error && <ScanError message={error} />}{findingError && <ScanError message={findingError} />}
    {loading ? <LoadingState label="Loading account scans" /> : scans.length === 0 ? <EmptyState title="No account scans yet" description="Submit a Solidity file to the local static-analysis worker. No scan has run yet." action={<Link className="button button--primary" to="/app/new-scan">Submit Solidity source</Link>} /> : <>
      <section className="stats-grid" aria-label="Account scan totals"><StatCard label="Total scans" value={scans.length} icon={<Activity size={16} />} /><StatCard label="Completed analyses" value={completed} detail="Worker-confirmed completed scans" icon={<FileCheck2 size={16} />} /><StatCard label="Findings" value={findings.length} detail="Returned by Slither · review required" icon={<ShieldAlert size={16} />} /><StatCard label="High severity" value={counts.high + counts.critical} detail="Only where severity was returned" icon={<CircleAlert size={16} />} /></section>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">ACCOUNT ACTIVITY</p><h2>Recent scans</h2></div><Link className="text-link" to="/app/scans">All history <ArrowRight size={14} /></Link></div><DataTable columns={columns} rows={scans.slice(0, 8)} rowKey={(scan) => scan.id} totalRows={scans.length} emptyTitle="No scans" emptyDescription="Submit source to begin." /></section>
      {findings.length > 0 && <section className="panel"><div className="section-heading"><div><p className="eyebrow">STATIC ANALYSIS OUTPUT</p><h2>Recent findings</h2></div></div><div className="recent-findings-list">{findings.slice(0, 5).map((finding) => <Link className="recent-finding-row" key={finding.id} to={`/app/scans/${finding.scan_id}/findings/${finding.id}`}><FindingSeverity severity={finding.severity} /><span className="recent-finding-copy"><strong>{finding.title ?? finding.rule_id ?? 'Detector result'}</strong><small>{finding.source_path ?? 'Source location unavailable'}{finding.line_start ? `:${finding.line_start}` : ''}</small></span><ArrowRight size={15} /></Link>)}</div></section>}
    </>}
  </div>
}

export function AccountHistoryPage() {
  const { accessToken } = useWorkspaceMode()
  const { scans, loading, error } = useScans()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const scanKey = scans.filter((scan) => scan.status === 'completed').map((scan) => scan.id).join('|')
  const [findingCountState, setFindingCountState] = useState<{ token: string | null; scanKey: string; counts: Record<string, number>; error: string }>({ token: null, scanKey: '', counts: {}, error: '' })
  const findingCountStateIsCurrent = findingCountState.token === accessToken && findingCountState.scanKey === scanKey
  const findingCounts = findingCountStateIsCurrent ? findingCountState.counts : {}
  const findingCountError = findingCountStateIsCurrent ? findingCountState.error : ''
  useEffect(() => {
    let active = true
    if (!accessToken) {
      const timer = window.setTimeout(() => setFindingCountState({ token: accessToken, scanKey, counts: {}, error: '' }), 0)
      return () => { active = false; window.clearTimeout(timer) }
    }
    const scanIds = scanKey ? scanKey.split('|') : []
    void Promise.all(scanIds.map((scanId) => localScanApi.listFindings(scanId, accessToken))).then((groups) => {
      if (active) setFindingCountState({ token: accessToken, scanKey, counts: Object.fromEntries(scanIds.map((scanId, index) => [scanId, groups[index]?.length ?? 0])), error: '' })
    }).catch((reason: unknown) => { if (active) setFindingCountState({ token: accessToken, scanKey, counts: {}, error: errorText(reason) }) })
    return () => { active = false }
  }, [accessToken, scanKey])
  const filtered = scans.filter((scan) => {
    const date = scan.createdAt.slice(0, 10)
    return (!query || `${scan.contractName} ${scan.id} ${scan.sourceFilename ?? ''}`.toLowerCase().includes(query.toLowerCase()))
      && (status === 'all' || scan.status === status) && (!from || date >= from) && (!to || date <= to)
  })
  const columns: DataColumn<ApiScan>[] = [
    { id: 'contract', header: 'Contract / Project', cell: (scan) => <Link className="table-primary-link" to={`/app/scans/${scan.id}`}>{scan.contractName}<small>{scan.sourceFilename ?? 'Solidity source'}</small></Link>, sortValue: (scan) => scan.contractName },
    { id: 'id', header: 'Scan ID', cell: (scan) => <code>{scan.id}</code>, sortValue: (scan) => scan.id },
    { id: 'date', header: 'Submitted', cell: (scan) => formatDate(scan.createdAt), sortValue: (scan) => scan.createdAt },
    { id: 'findings', header: 'Findings', cell: (scan) => scan.status === 'completed' ? findingCounts[scan.id] ?? '—' : '—', sortValue: (scan) => findingCounts[scan.id] ?? -1 },
    { id: 'status', header: 'Status', cell: (scan) => <AccountStatus status={scan.status} />, sortValue: (scan) => scan.status },
    { id: 'compiler', header: 'Compiler', cell: (scan) => scan.compilerVersion, sortValue: (scan) => scan.compilerVersion },
    { id: 'actions', header: 'Actions', cell: (scan) => <Link className="table-action-link" to={`/app/scans/${scan.id}`} aria-label={`Open ${scan.contractName} details`}><ArrowRight size={15} /></Link> },
  ]
  return <div className="page-stack"><PageHeader title="Scan History" eyebrow="ACCOUNT RECORDS" description="Scan status and results are loaded from the authenticated local scanner API." actions={<Link className="button button--primary" to="/app/new-scan">New Scan</Link>} /><p className="notice-banner" role="note">{staticAnalysisNotice}</p>{error && <ScanError message={error} />}{findingCountError && <ScanError message={`Finding counts could not be loaded: ${findingCountError}`} />}{loading ? <LoadingState label="Loading account scan history" /> : <section className="panel history-panel"><div className="section-heading"><div><p className="eyebrow">ACCOUNT WORKSPACE</p><h2>All scans</h2></div><span className="muted-cell">{filtered.length} of {scans.length} shown</span></div><div className="table-controls"><label className="search-input"><span className="sr-only">Search scans</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contract or scan ID" /></label><select className="select-control" aria-label="Filter scan status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{['queued', 'running', 'completed', 'failed'].map((item) => <option value={item} key={item}>{item}</option>)}</select><label className="date-filter"><span className="sr-only">From date</span><input type="date" aria-label="From date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="date-filter"><span className="sr-only">To date</span><input type="date" aria-label="To date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="button button--ghost button--small" type="button" onClick={() => { setQuery(''); setStatus('all'); setFrom(''); setTo('') }}>Clear</button></div>{scans.length === 0 ? <EmptyState title="No account scans yet" description="Submit Solidity source to create an account scan." /> : <DataTable columns={columns} rows={filtered} rowKey={(scan) => scan.id} totalRows={scans.length} searchQuery={query || (status !== 'all' || from || to ? 'filtered' : '')} emptyTitle="No scans match these filters" emptyDescription="Adjust the search, date range, or status filter." />}</section>}</div>
}

type ScanLoad = { scan: ApiScan | null; findings: ApiFinding[]; source: string; loading: boolean; error: string; refresh: () => Promise<void> }
function useAccountScan(scanId: string, includeSource = true): ScanLoad {
  const { accessToken } = useWorkspaceMode()
  const [scan, setScan] = useState<ApiScan | null>(null)
  const [findings, setFindings] = useState<ApiFinding[]>([])
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    if (!accessToken) { setError('Your account session is unavailable. Sign in again.'); setLoading(false); return }
    try {
      const scanResult = await localScanApi.getScan(scanId, accessToken)
      setScan(scanResult)
      setError('')
      if (scanResult.status === 'completed') {
        const findingPromise = localScanApi.listFindings(scanId, accessToken)
        const sourcePromise = includeSource ? localScanApi.getSource(scanId, accessToken) : Promise.resolve({ sourceCode: '', sourceFilename: null })
        const [findingResult, sourceResult] = await Promise.all([findingPromise, sourcePromise])
        setFindings(findingResult)
        setSource(sourceResult.sourceCode)
      } else { setFindings([]); setSource('') }
    } catch (reason) { setError(errorText(reason)) }
    finally { setLoading(false) }
  }, [accessToken, includeSource, scanId])
  useEffect(() => {
    const timer = window.setTimeout(() => { setLoading(true); void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])
  const [pollTick, setPollTick] = useState(0)
  useEffect(() => {
    if (scan?.status !== 'queued' && scan?.status !== 'running') return
    const timer = window.setTimeout(() => { void refresh().finally(() => setPollTick((current) => current + 1)) }, 2000)
    return () => window.clearTimeout(timer)
  }, [pollTick, refresh, scan?.status])
  return { scan, findings, source, loading, error, refresh }
}

export function AccountScanDetailsPage() {
  const { scanId = '' } = useParams()
  const { scan, findings, source, loading, error, refresh } = useAccountScan(scanId)
  if (loading) return <LoadingState label="Loading account scan" />
  if (error) return <div className="page-stack"><PageHeader title="Scan details unavailable" eyebrow="ACCOUNT SCAN" /><ScanError message={error} retry={() => void refresh()} /><Link className="button button--secondary" to="/app/scans">Back to history</Link></div>
  if (!scan) return <div className="page-stack"><PageHeader title="Scan not found" eyebrow="ACCOUNT SCAN" description="This scan is not available to the signed-in account." /><EmptyState title="No matching scan" description="The ID may be invalid or owned by another account." action={<Link className="button button--primary" to="/app/scans">Back to history</Link>} /></div>
  return <div className="page-stack"><PageHeader title={scan.contractName} eyebrow="ACCOUNT SCAN DETAILS" description={`${scan.id} · ${scan.sourceFilename ?? 'Solidity source'} · Submitted ${formatDate(scan.createdAt)}`} actions={<><AccountStatus status={scan.status} /><Link className={`button ${scan.status === 'completed' ? 'button--secondary' : 'button--secondary button--disabled'}`} aria-disabled={scan.status !== 'completed'} onClick={(event) => { if (scan.status !== 'completed') event.preventDefault() }} to={`/app/reports/${scan.id}`}>View report</Link></>} /><p className="notice-banner" role="note">{staticAnalysisNotice}</p>{scan.status === 'failed' && <ScanError message={workerFailureText(scan)} />} {(scan.status === 'queued' || scan.status === 'running') && <p className="notice-banner" role="status">{scan.status === 'queued' ? 'Queued for the local analysis worker.' : 'The local worker is analyzing this source. Status refreshes automatically.'}</p>}{scan.status === 'completed' && <section className="panel"><div className="section-heading"><div><p className="eyebrow">WORKER RESULT</p><h2>Findings</h2></div><span>{findings.length} returned</span></div>{findings.length ? <div className="recent-findings-list">{findings.map((finding) => <Link className="recent-finding-row" key={finding.id} to={`/app/scans/${scan.id}/findings/${finding.id}`}><FindingSeverity severity={finding.severity} /><span className="recent-finding-copy"><strong>{finding.title ?? finding.rule_id ?? 'Detector result'}</strong><small>{finding.rule_id ?? 'Detector ID unavailable'} · {finding.source_path ?? 'Location unavailable'}{finding.line_start ? `:${finding.line_start}` : ''}</small></span><ArrowRight size={15} /></Link>)}</div> : <p role="note">The analyzer returned zero findings. This does not establish that the contract is safe or free of vulnerabilities.</p>}</section>}{scan.status === 'completed' && <section className="panel"><div className="section-heading"><div><p className="eyebrow">SUBMITTED SOURCE</p><h2>{scan.sourceFilename ?? 'Solidity source'}</h2></div></div><CodeViewer value={source} filename={scan.sourceFilename ?? 'contract.sol'} height={460} /></section>}{typeof scan.summary.disclaimer === 'string' && <p className="subtle-copy">{scan.summary.disclaimer}</p>}</div>
}

export function AccountFindingDetailsPage() {
  const { scanId = '', findingId = '' } = useParams()
  const { scan, findings, source, loading, error, refresh } = useAccountScan(scanId)
  const sourceSectionRef = useRef<HTMLElement>(null)
  const finding = findings.find((item) => item.id === findingId)
  useEffect(() => { if (finding) sourceSectionRef.current?.scrollIntoView?.({ behavior: 'auto', block: 'start' }) }, [finding])
  if (loading) return <LoadingState label="Loading account finding" />
  if (error) return <div className="page-stack"><PageHeader title="Finding unavailable" eyebrow="ACCOUNT FINDING" /><ScanError message={error} retry={() => void refresh()} /></div>
  if (!scan || !finding) return <div className="page-stack"><PageHeader title="Finding not found" eyebrow="ACCOUNT FINDING" description="This finding is not part of the requested account scan." /><EmptyState title="No matching finding" description="The finding ID may be invalid or belong to a different scan." action={<Link className="button button--primary" to={`/app/scans/${scanId}`}>Back to scan details</Link>} /></div>
  const start = finding.line_start
  const lines = source.split(/\r?\n/)
  const excerpt = start ? lines.slice(Math.max(0, start - 4), Math.min(lines.length, (finding.line_end ?? start) + 3)) : []
  const excerptStart = start ? Math.max(1, start - 3) : 1
  const evidence = finding.evidence && typeof finding.evidence === 'object' ? finding.evidence as { elements?: unknown[] } : null
  return <div className="page-stack finding-detail-page"><PageHeader title={finding.title ?? finding.rule_id ?? 'Static-analysis finding'} eyebrow="FINDING DETAILS · STATIC ANALYSIS" description={`${finding.id} · ${scan.contractName}`} actions={<><FindingSeverity severity={finding.severity} /><Link className="button button--secondary" to={`/app/scans/${scan.id}`}>Scan details</Link></>} /><p className="notice-banner" role="note">Slither static-analysis output. This result is not independently verified and does not guarantee detection of all vulnerabilities.</p><div className="finding-meta-strip">{finding.rule_id && <span><strong>Detector ID</strong>{finding.rule_id}</span>}{finding.category && <span><strong>Category</strong>{finding.category}</span>}{finding.confidence && <span><strong>Confidence</strong>{finding.confidence}</span>}{finding.source_path && <span><strong>Source</strong>{finding.source_path}{start ? `:${start}${finding.line_end && finding.line_end !== start ? `–${finding.line_end}` : ''}` : ''}</span>}</div><div className="finding-detail-layout"><div className="finding-detail-main">{finding.description && <section className="panel finding-content-section"><p className="eyebrow">DESCRIPTION</p><h2>Detector description</h2><p>{finding.description}</p></section>}{excerpt.length > 0 && <section ref={sourceSectionRef} className="panel finding-content-section" aria-labelledby="account-source-heading" tabIndex={-1}><p className="eyebrow">SOURCE LOCATION</p><h2 id="account-source-heading">Affected source excerpt</h2><pre className="finding-code-excerpt" aria-label="Source excerpt">{excerpt.map((line, index) => <span key={index} className={excerptStart + index === start ? 'finding-code-line finding-code-line--active' : 'finding-code-line'}><span className="finding-code-line__number">{excerptStart + index}</span><code>{line || ' '}</code></span>)}</pre></section>}{finding.code_excerpt && <section className="panel finding-content-section"><p className="eyebrow">WORKER EXCERPT</p><h2>Code excerpt</h2><pre className="report-code"><code>{finding.code_excerpt}</code></pre></section>}{finding.recommendation && <section className="panel remediation-panel"><p className="eyebrow">RECOMMENDATION</p><h2>Suggested review</h2><p>{finding.recommendation}</p><p className="subtle-copy">This is analyzer-provided guidance, not a verified patch. Review the full contract and tests.</p></section>}{finding.impact && <section className="panel finding-content-section"><p className="eyebrow">IMPACT</p><h2>Impact field</h2><p>{finding.impact}</p></section>}{evidence?.elements && <section className="panel finding-content-section"><p className="eyebrow">EVIDENCE</p><h2>Analyzer evidence</h2><pre className="report-code"><code>{JSON.stringify(evidence, null, 2)}</code></pre></section>}</div><aside className="finding-detail-aside"><div className="panel aside-summary"><p className="eyebrow">RECORD</p><dl><div><dt>Finding ID</dt><dd><code>{finding.id}</code></dd></div><div><dt>Detector</dt><dd>{finding.rule_id ?? 'Not provided'}</dd></div><div><dt>Scan</dt><dd><Link to={`/app/scans/${scan.id}`}>{scan.id}</Link></dd></div><div><dt>Worker verification</dt><dd>Not independently verified</dd></div></dl></div></aside></div></div>
}

export function AccountReportPage() {
  const { scanId = '' } = useParams()
  const { scan, findings, loading, error, refresh } = useAccountScan(scanId, false)
  if (loading) return <LoadingState label="Loading account report" />
  if (error) return <div className="page-stack"><PageHeader title="Report unavailable" eyebrow="ACCOUNT REPORT" /><ScanError message={error} retry={() => void refresh()} /></div>
  if (!scan) return <div className="page-stack"><PageHeader title="Report not found" eyebrow="ACCOUNT REPORT" /><EmptyState title="No matching scan" description="The scan is invalid or not available to this account." action={<Link className="button button--primary" to="/app/scans">Back to history</Link>} /></div>
  if (scan.status !== 'completed') return <div className="page-stack"><PageHeader title="Report not ready" eyebrow="ACCOUNT REPORT" description={`Current scan status: ${scan.status}.`} actions={<Link className="button button--secondary" to={`/app/scans/${scan.id}`}>Back to scan details</Link>} /><p className="notice-banner" role="status">A report is available only after the backend confirms scan completion.</p>{scan.status === 'failed' && <ScanError message={scan.errorMessage ?? 'The worker marked this scan as failed.'} />}</div>
  const counts = Object.fromEntries(severityOrder.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length])) as Record<Severity, number>
  return <div className="page-stack report-page"><PageHeader title="Analysis Report" eyebrow="COMPLETED STATIC ANALYSIS" description={`${scan.contractName} · completed ${formatDate(scan.completedAt)}`} actions={<><Link className="button button--secondary" to={`/app/scans/${scan.id}`}>Scan details</Link><button className="button button--primary" type="button" onClick={() => window.print()}>Print / Save as PDF</button></>} /><article className="report-layout"><header className="report-layout__header"><strong>ContractIQ · Local static-analysis report</strong><button className="button button--secondary no-print" type="button" onClick={() => window.print()}>Print report</button></header><div className="report-layout__meta"><span>{scan.id}</span><span>Completed {formatDate(scan.completedAt)}</span></div><h1 className="report-layout__title">{scan.contractName} · Analysis Results</h1><div className="report-layout__demo-note">STATIC ANALYSIS · NOT A SECURITY GUARANTEE</div><div className="report-layout__body"><section className="report-section"><h2>Analysis summary</h2><p>{staticAnalysisNotice}</p><dl className="report-definition-grid"><div><dt>Status</dt><dd><AccountStatus status={scan.status} /></dd></div><div><dt>Analyzer</dt><dd>{scan.analysisEngine ?? 'Not provided'} {scan.analysisVersion ?? ''}</dd></div><div><dt>Compiler</dt><dd>Solidity {scan.compilerVersion}</dd></div><div><dt>Source hash</dt><dd><code>{scan.sourceHash}</code></dd></div><div><dt>Submitted</dt><dd>{formatDate(scan.createdAt)}</dd></div></dl></section><section className="report-section"><h2>Findings ({findings.length})</h2>{findings.length ? findings.map((finding) => <article className="report-finding" key={finding.id}><div className="report-finding__heading"><h3>{finding.title ?? finding.rule_id ?? 'Detector result'}</h3><FindingSeverity severity={finding.severity} /></div>{finding.rule_id && <p><strong>Detector ID:</strong> <code>{finding.rule_id}</code></p>}{finding.description && <p>{finding.description}</p>}{finding.confidence && <p><strong>Confidence returned:</strong> {finding.confidence}</p>}{finding.impact && <p><strong>Impact returned:</strong> {finding.impact}</p>}{finding.source_path && <p><strong>Location:</strong> <code>{finding.source_path}{finding.line_start ? `:${finding.line_start}` : ''}{finding.line_end && finding.line_end !== finding.line_start ? `–${finding.line_end}` : ''}</code></p>}{finding.code_excerpt && <pre className="report-code"><code>{finding.code_excerpt}</code></pre>}{finding.recommendation && <p><strong>Recommendation:</strong> {finding.recommendation}</p>}<Link className="text-link no-print" to={`/app/scans/${scan.id}/findings/${finding.id}`}>Open finding details <ArrowRight size={13} /></Link></article>) : <div className="report-callout">The completed analyzer response contains zero findings. This does not mean the contract is safe or free of vulnerabilities.</div>}</section><section className="report-section"><h2>Severity counts returned</h2><div className="report-severity-grid">{severityOrder.map((severity) => <div key={severity}><span>{severity}</span><strong>{counts[severity]}</strong></div>)}</div></section><section className="report-section report-limitations"><h2>Limitations</h2><ul><li>Static analysis only; results require independent review.</li><li>This analysis does not guarantee detection of all vulnerabilities.</li><li>The worker accepts one Solidity file without imports.</li><li>No dynamic testing or exploit execution is represented in this report.</li></ul></section></div></article></div>
}

