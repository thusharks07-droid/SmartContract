import { lazy, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, CircleAlert, FileCheck2, Search, ShieldAlert, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { DataColumn } from '../components/ui/DataTable'
import { DataTable } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { ScanStatusBadge } from '../components/ui/ScanStatusBadge'
import { SeverityBadge } from '../components/ui/SeverityBadge'
import { StatCard } from '../components/ui/StatCard'
import { findingService } from '../services/findingService'
import { dashboardService, historyService } from '../services/aggregateService'
import type { HistoryRow } from '../services/aggregateService'
import { scanService } from '../services/scanService'
import { StageShell } from '../components/stage/StageShell'
import type { Severity } from '../types/domain'
import { formatDate, highestSeverity } from './pageUtils'
import '../components/stage/severity-orbit.css'
import { useWorkspaceMode } from '../state/useWorkspaceMode'
import { AccountDashboardPage } from './AccountWorkspacePages'

const SeverityOrbitScene = lazy(() => import('../components/stage/SeverityOrbitScene').then((module) => ({ default: module.SeverityOrbitScene })))

const severityOrder = ['critical', 'high', 'medium', 'low', 'informational'] as const
const severityRank = { critical: 5, high: 4, medium: 3, low: 2, informational: 1 }

export function DashboardPage() {
  const { mode } = useWorkspaceMode()
  if (mode === 'account') return <AccountDashboardPage />
  return <DemoDashboardPage />
}

function DemoDashboardPage() {
  const totals = dashboardService.getTotals()
  const contractsAnalyzed = new Set(scanService.list().filter((scan) => scan.status === 'completed').map((scan) => scan.contractName)).size
  const findings = findingService.list().sort((first, second) => second.verification.recordedAt.localeCompare(first.verification.recordedAt))
  const [isDesktopOrbit, setIsDesktopOrbit] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 80rem)').matches)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [severity, setSeverity] = useState<Severity | 'all'>('all')
  const [hoveredSeverity, setHoveredSeverity] = useState<Severity | null>(null)
  const selectedSeverity = severity === 'all' ? null : severity
  const activeSeverity = selectedSeverity ?? hoveredSeverity

  useEffect(() => {
    const media = window.matchMedia('(min-width: 80rem)')
    const update = () => setIsDesktopOrbit(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const summaries = Object.fromEntries(severityOrder.map((level) => {
    const example = findings.find((finding) => finding.severity === level)
    const location = example?.evidence[0]
    const sample = example && location ? ` — ${example.title} in ${location.file}:${location.startLine}` : ''
    return [level, `${level[0]?.toUpperCase()}${level.slice(1)}: ${totals.findingsBySeverity[level]}${sample}`]
  })) as Record<Severity, string>

  const rows = useMemo(() => historyService.list().filter((row) => {
    const needle = query.trim().toLowerCase()
    const rowFindings = findingService.listByScan(row.id)
    return (!needle || `${row.contractName} ${row.id} ${row.sourceLabel}`.toLowerCase().includes(needle))
      && (status === 'all' || row.status === status)
      && (!activeSeverity || rowFindings.some((finding) => finding.severity === activeSeverity))
  }), [activeSeverity, query, status])
  const clearFilters = () => { setQuery(''); setStatus('all'); setSeverity('all'); setHoveredSeverity(null) }
  const selectSeverity = (value: Severity | null) => {
    setHoveredSeverity(null)
    setSeverity(value ?? 'all')
  }
  const visibleFindings = activeSeverity ? findings.filter((finding) => finding.severity === activeSeverity) : findings
  const distributionFallback = <div className="distribution-2d">
    <div className="distribution-bars" role="img" aria-label={`Finding counts by severity: ${severityOrder.map((item) => `${item} ${totals.findingsBySeverity[item]}`).join(', ')}`}>
      {severityOrder.map((level) => <div className="distribution-row" key={level}><span className="distribution-label">{level}</span><div className="distribution-track"><span className={`distribution-fill distribution-fill--${level}`} style={{ width: `${totals.totalFindings ? Math.max(totals.findingsBySeverity[level] / totals.totalFindings * 100, totals.findingsBySeverity[level] ? 4 : 0) : 0}%` }} /></div><strong>{totals.findingsBySeverity[level]}</strong></div>)}
    </div>
    <ul className="sr-only">{severityOrder.map((level) => <li key={level}>{summaries[level]}</li>)}</ul>
    <div className="distribution-2d__legend" role="group" aria-label="Select a finding severity">
      {severityOrder.map((level) => <button aria-pressed={selectedSeverity === level} className={activeSeverity === level ? 'distribution-legend-active' : undefined} key={level} onBlur={() => setHoveredSeverity(null)} onClick={() => selectSeverity(severity === level ? null : level)} onFocus={() => setHoveredSeverity(level)} onMouseEnter={() => setHoveredSeverity(level)} onMouseLeave={() => setHoveredSeverity(null)} type="button">{level}<strong>{totals.findingsBySeverity[level]}</strong></button>)}
      {selectedSeverity && <button aria-label="Clear severity selection" onClick={() => selectSeverity(null)} type="button">Clear selection</button>}
    </div>
    <p className="distribution-summary">{activeSeverity ? summaries[activeSeverity] : 'Illustrative — demo data. Select a severity to filter findings and recent scans.'}</p>
  </div>
  const columns: DataColumn<HistoryRow>[] = [
    { id: 'contract', header: 'Contract / Project', cell: (row) => <Link className="table-primary-link" to={`/scans/${row.id}`}>{row.contractName}<small>{row.sourceLabel}</small></Link>, sortValue: (row) => row.contractName },
    { id: 'compiler', header: 'Compiler', cell: (row) => <code>{row.configuration.compilerVersion}</code>, sortValue: (row) => row.configuration.compilerVersion },
    { id: 'date', header: 'Date', cell: (row) => formatDate(row.submittedAt), sortValue: (row) => row.submittedAt },
    { id: 'findings', header: 'Findings', cell: (row) => row.totalFindings, sortValue: (row) => row.totalFindings },
    { id: 'severity', header: 'Highest severity', cell: (row) => { const highest = highestSeverity(findingService.listByScan(row.id)); return highest ? <SeverityBadge severity={highest} /> : <span className="muted-cell">—</span> }, sortValue: (row) => severityRank[highestSeverity(findingService.listByScan(row.id)) ?? 'informational'] },
    { id: 'status', header: 'Status', cell: (row) => <ScanStatusBadge status={row.status} />, sortValue: (row) => row.status },
    { id: 'actions', header: 'Actions', cell: (row) => <Link className="table-action-link" to={`/scans/${row.id}`} aria-label={`Open ${row.contractName} scan`}><ArrowRight size={15} /></Link> },
  ]

  return <div className="page-stack">
    <PageHeader title="Security Overview" eyebrow="CONTRACTIQ / DEMO" description="A unified view of the deterministic demo workspace. No real security analysis ran." actions={<><Link className="button button--secondary" to="/scans">View History</Link><Link className="button button--primary" to="/new-scan">New Scan</Link></>} visual={isDesktopOrbit ? <div className="dashboard-orbit-shell"><StageShell deferScene title="Severity orbit" caption="Illustrative — demo data" fallback={distributionFallback}><SeverityOrbitScene counts={totals.findingsBySeverity} summaries={summaries} selected={selectedSeverity} onSelect={selectSeverity} onHover={setHoveredSeverity} /></StageShell></div> : undefined} />
    {totals.totalScans === 0 ? <EmptyState title="Your demo workspace is ready" description="Create a local demo record to explore the ContractIQ workflow. Source files stay in this browser and no scanner runs." action={<><Link className="button button--primary" to="/new-scan">Start Your First Scan</Link><span className="supported-input-note">Supported input: Solidity .sol files or pasted Solidity</span></>} /> : <>
      <section className="stats-grid" aria-label="Demo workspace totals">
        <StatCard label="Total Scans" value={totals.totalScans} detail={`${totals.scansByStatus.completed} completed demo records`} icon={<Activity size={16} />} />
        <StatCard label="Contracts Analyzed" value={contractsAnalyzed} detail="Unique contracts with completed demo records · illustrative only" icon={<FileCheck2 size={16} />} />
        <StatCard label="Findings" value={totals.totalFindings} detail="Recorded in the seeded demo dataset" icon={<ShieldAlert size={16} />} />
        <StatCard label="Critical" value={totals.findingsBySeverity.critical} detail="Illustrative critical-severity records" icon={<CircleAlert size={16} />} />
      </section>

      {!isDesktopOrbit && <section className="panel distribution-panel dashboard-distribution-panel" aria-label="Vulnerability distribution">
        {distributionFallback}
      </section>}

      <section className="panel" aria-labelledby="recent-scans-title">
        <div className="section-heading"><div><p className="eyebrow">WORKSPACE ACTIVITY</p><h2 id="recent-scans-title">Recent scans</h2></div><Link className="text-link" to="/scans">All history <ArrowRight size={14} /></Link></div>
        <div className="table-controls"><label className="search-input"><Search size={16} /><span className="sr-only">Search recent scans</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or scan ID" /></label><label className="select-control"><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{['draft', 'queued', 'running', 'completed', 'failed', 'cancelled'].map((item) => <option key={item} value={item}>{item.replace(/^./, (letter) => letter.toUpperCase())}</option>)}</select></label><label className="select-control"><span className="sr-only">Filter by severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value as Severity | 'all')}><option value="all">All severities</option>{severityOrder.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="button button--ghost button--small" type="button" onClick={clearFilters}><X size={14} />Clear</button></div>
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} totalRows={totals.totalScans} searchQuery={query || (status !== 'all' || activeSeverity ? 'filtered' : '')} emptyTitle="No scans in this workspace" emptyDescription="Start with a local demo record to populate scan history." noResultsTitle="No scans match these filters" noResultsDescription="Adjust or clear the search and filters." />
      </section>

      <section className="panel" aria-labelledby="recent-findings-title">
        <div className="section-heading"><div><p className="eyebrow">ILLUSTRATIVE RESULTS</p><h2 id="recent-findings-title">Recent findings</h2></div></div>
        {visibleFindings.length ? <div className="recent-findings-list">{visibleFindings.slice(0, 4).map((finding) => {
          const scan = scanService.get(finding.scanId)
          const evidence = finding.evidence[0]
          return <Link className="recent-finding-row" key={finding.id} to={`/scans/${finding.scanId}/findings/${finding.id}`}><SeverityBadge severity={finding.severity} /><span className="recent-finding-copy"><strong>{finding.title}</strong><small>{scan?.contractName} · {evidence?.file}:{evidence?.startLine}</small></span><time dateTime={finding.verification.recordedAt}>{formatDate(finding.verification.recordedAt)}</time><ArrowRight size={15} /></Link>
        })}</div> : <EmptyState title={activeSeverity ? `No ${activeSeverity} findings in these records` : 'No findings recorded'} description={activeSeverity ? 'Clear the severity filter to see all illustrative demo findings.' : 'No findings exist in the current demo records. This is not a security guarantee.'} action={activeSeverity ? <button className="button button--ghost button--small" type="button" onClick={() => setSeverity('all')}>Clear severity filter</button> : undefined} />}
      </section>
    </>}
  </div>
}
