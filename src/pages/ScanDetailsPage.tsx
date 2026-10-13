import { lazy, useEffect, useRef, useState } from 'react'
import { Download, Ellipsis, Printer, RotateCw, ArrowLeft, FileText, X, Search } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { DataColumn } from '../components/ui/DataTable'
import { DataTable } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { ScanStatusBadge } from '../components/ui/ScanStatusBadge'
import { ScanSummary } from '../components/ui/ScanSummary'
import { SeverityBadge } from '../components/ui/SeverityBadge'
import { VerificationStatusBadge } from '../components/ui/VerificationStatusBadge'
import { CodeViewer } from '../components/ui/CodeViewer'
import { VerificationPanel } from '../components/ui/VerificationPanel'
import { findingService } from '../services/findingService'
import { reportService } from '../services/reportService'
import { scanService } from '../services/scanService'
import { sourceService } from '../services/sourceService'
import { demoContractNodes, demoRelationEdges } from '../data/graphLayouts'
import { StageShell } from '../components/stage/StageShell'
import { RiskSurfaceFallback } from '../components/stage/RiskSurfaceFallback'
import { useToast } from '../state/useToast'
import { useAppReducedMotion } from '../state/useAppReducedMotion'
import type { ContractNode, Finding, RelationEdge, Severity, VerificationStatus } from '../types/domain'
import { formatDateTime, getScanFileLabel } from './pageUtils'
import { useWorkspaceMode } from '../state/useWorkspaceMode'
import { AccountScanDetailsPage } from './AccountWorkspacePages'

const DependencyScene = lazy(() => import('../components/stage/Scenes').then((module) => ({ default: module.DependencyScene })))
const RiskSurfaceScene = lazy(() => import('../components/stage/RiskSurfaceScene').then((module) => ({ default: module.RiskSurfaceScene })))
const noGraphNodes: ContractNode[] = []
const noGraphEdges: RelationEdge[] = []
const graphNodesByScan = new Map<string, ContractNode[]>([...new Set(demoContractNodes.map((node) => node.scanId))].map((scanId) => [scanId, demoContractNodes.filter((node) => node.scanId === scanId)]))
const graphEdgesByScan = new Map<string, RelationEdge[]>([...new Set(demoRelationEdges.map((edge) => edge.scanId))].map((scanId) => [scanId, demoRelationEdges.filter((edge) => edge.scanId === scanId)]))

const severities: (Severity | 'all')[] = ['all', 'critical', 'high', 'medium', 'low', 'informational']
const verificationStates: (VerificationStatus | 'all')[] = ['all', 'not_run', 'pending', 'verified', 'not_reproduced', 'inconclusive', 'error']

function downloadReport(scanId: string) {
  const report = reportService.buildForScan(scanId)
  if (!report) return false
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = `${report.contractName}-${report.id}.json`
  anchor.click()
  URL.revokeObjectURL(href)
  return true
}

export function ScanDetailsPage() {
  const { mode } = useWorkspaceMode()
  if (mode === 'account') return <AccountScanDetailsPage />
  return <DemoScanDetailsPage />
}

function DemoScanDetailsPage() {
  const { scanId = '' } = useParams()
  const scan = scanService.get(scanId)
  const resolvedScanId = scan?.id
  const navigate = useNavigate()
  const { notify, demoQueued } = useToast()
  const reducedMotion = useAppReducedMotion()
  const sourcePanelRef = useRef<HTMLDivElement>(null)
  const [selectedFindingId, setSelectedFindingId] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState('')
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 80rem)').matches)
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState<Severity | 'all'>('all')
  const [category, setCategory] = useState('all')
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | 'all'>('all')
  const allFindings = resolvedScanId ? findingService.listByScan(resolvedScanId) : []
  const graphNodes = resolvedScanId ? graphNodesByScan.get(resolvedScanId) ?? noGraphNodes : noGraphNodes
  const graphEdges = resolvedScanId ? graphEdgesByScan.get(resolvedScanId) ?? noGraphEdges : noGraphEdges
  const files = scan?.sourceFiles ?? []
  const currentFile = files.includes(selectedFile) ? selectedFile : files[0] ?? ''
  const selected = selectedFindingId ? allFindings.find((finding) => finding.id === selectedFindingId) : undefined
  const evidence = selected?.evidence.find((item) => item.file === currentFile) ?? selected?.evidence[0]
  const filtered = allFindings.filter((finding) => {
    const haystack = `${finding.title} ${finding.category} ${finding.description} ${finding.evidence.map((ref) => ref.file).join(' ')}`.toLowerCase()
    return (!query.trim() || haystack.includes(query.trim().toLowerCase()))
      && (severity === 'all' || finding.severity === severity)
      && (category === 'all' || finding.category === category)
      && (verificationStatus === 'all' || finding.verification.status === verificationStatus)
  })
  useEffect(() => {
    const media = window.matchMedia('(min-width: 80rem)')
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])
  if (!scan) return <div className="page-stack"><PageHeader title="Scan record not found" eyebrow="DEMO WORKSPACE" description="This scan ID is not present in the current browser session." /><EmptyState title="No matching demo record" description="The record may have been deleted or the link may be invalid." action={<Link className="button button--primary" to="/scans">Back to Scan History</Link>} /></div>
  const columns: DataColumn<Finding>[] = [
    { id: 'severity', header: 'Severity', cell: (row) => <SeverityBadge severity={row.severity} />, sortValue: (row) => row.severity },
    { id: 'finding', header: 'Finding', cell: (row) => <button className="table-inline-button" type="button" onClick={() => selectFinding(row)}>{row.title}</button>, sortValue: (row) => row.title },
    { id: 'category', header: 'Category', cell: (row) => row.category, sortValue: (row) => row.category },
    { id: 'file', header: 'File / line', cell: (row) => row.evidence[0] ? <code>{row.evidence[0].file}:{row.evidence[0].startLine}</code> : '—', sortValue: (row) => row.evidence[0]?.file ?? '' },
    { id: 'verification', header: 'Verification', cell: (row) => <VerificationStatusBadge status={row.verification.status} />, sortValue: (row) => row.verification.status },
    { id: 'details', header: 'Details', cell: (row) => <Link className="text-link" to={`/scans/${scan.id}/findings/${row.id}`}>Open <ArrowLeft className="flip-icon" size={13} /></Link> },
  ]
  const categories = [...new Set(allFindings.map((finding) => finding.category))]
  const selectFinding = (finding: Finding) => {
    setSelectedFindingId(finding.id)
    setSelectedFile(finding.evidence[0]?.file ?? '')
    revealSelectedSource()
  }
  const revealSelectedSource = () => {
    window.requestAnimationFrame(() => {
      const panel = sourcePanelRef.current
      if (!panel) return
      if (typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
      panel.focus({ preventScroll: true })
    })
  }
  const riskFallback = scan.status === 'completed' && allFindings.length > 0
    ? <RiskSurfaceFallback findings={allFindings} selectedFindingId={selectedFindingId || null} onSelectFinding={selectFinding} />
    : <div className="risk-surface-placeholder" role="status">{scan.status === 'completed' ? 'No illustrative finding records for this completed scan.' : `No spatial data for ${scan.status} scans`}</div>
  const exportJson = () => { if (downloadReport(scan.id)) notify({ title: 'Demo report exported', description: 'A JSON report for this demo record was downloaded.', tone: 'success' }) }
  const selectGraphNode = (nodeId: string) => {
    const node = graphNodes.find((item) => item.id === nodeId)
    if (!node) return
    setSelectedNodeId(node.id)
    setSelectedFile(node.file)
    const relatedFinding = graphEdges.find((edge) => edge.findingId && (edge.source === node.id || edge.target === node.id))?.findingId
    if (relatedFinding && allFindings.some((finding) => finding.id === relatedFinding)) setSelectedFindingId(relatedFinding)
    revealSelectedSource()
  }
  const dependencyFallback = graphNodes.length ? <div className="dependency-list" role="list" aria-label="Contract elements and source locations">
    {graphNodes.map((node) => <div className="dependency-list__row" key={node.id} role="listitem"><button aria-pressed={selectedNodeId === node.id} className="dependency-list__item" onClick={() => selectGraphNode(node.id)} type="button"><span className={`dependency-list__kind dependency-list__kind--${node.kind}`}>{node.kind}</span><strong>{node.label}</strong><small>{node.file}:{node.line}</small></button></div>)}
  </div> : <div className="dependency-empty"><strong>No dependency graph records for this scan.</strong><span>The seeded graph belongs to a different demo record.</span></div>
  const runAgain = () => {
    const next = scanService.createDemoScan({ contractName: scan.contractName, sourceLabel: scan.sourceLabel, sourceFiles: scan.sourceFiles, inputType: scan.inputType, notes: scan.notes, configuration: scan.configuration })
    sourceService.copyScanSources(scan.id, next.id, scan.sourceFiles)
    scanService.updateStatus(next.id, 'queued')
    demoQueued()
    navigate(`/scans/${next.id}`)
  }

  return <div className="page-stack">
    <PageHeader title={scan.contractName} eyebrow="SCAN DETAILS · DEMO RECORD" description={`${scan.id} · ${getScanFileLabel(scan)} · Submitted ${formatDateTime(scan.submittedAt)}`} actions={<div className="details-action-group"><ScanStatusBadge status={scan.status} /><details className="action-menu"><summary className="button button--secondary button--small"><Ellipsis size={16} />Actions</summary><div className="action-menu__items"><Link to={`/reports/${scan.id}`}><FileText size={14} />View Report</Link><button type="button" onClick={exportJson}><Download size={14} />Export Report JSON</button><button type="button" onClick={() => window.print()}><Printer size={14} />Print</button><button type="button" onClick={runAgain}><RotateCw size={14} />Create Demo Record Again</button><Link to="/scans"><ArrowLeft size={14} />Back to History</Link></div></details></div>} />
    <section className="panel risk-surface-stage" aria-label="Finding severity profile">
      {isDesktop ? <StageShell title="Risk surface" caption="Illustrative severity profile — demo data only · select a column to focus its finding and source line" fallback={riskFallback}>
        {scan.status === 'completed' && allFindings.length > 0 ? <RiskSurfaceScene findings={allFindings} selectedFindingId={selectedFindingId || null} onSelectFinding={selectFinding} /> : riskFallback}
      </StageShell> : scan.status === 'completed' && allFindings.length > 0 ? <RiskSurfaceFallback findings={allFindings} selectedFindingId={selectedFindingId || null} onSelectFinding={selectFinding} /> : riskFallback}
    </section>
    <ScanSummary scan={{ id: scan.id, targetName: scan.contractName, submittedAt: formatDateTime(scan.submittedAt), status: scan.status, findingCounts: Object.fromEntries(severities.filter((value): value is Severity => value !== 'all').map((value) => [value, allFindings.filter((finding) => finding.severity === value).length])) }} />
    {scan.status === 'failed' && <div className="notice-banner notice-banner--warning">This demo record is marked failed. Its attached findings are seeded examples, not output from a scan.</div>}
    {scan.status === 'cancelled' && <div className="notice-banner">This demo record is marked cancelled. No analysis was run for it.</div>}
    <section className="panel" aria-labelledby="findings-table-title"><div className="section-heading"><div><p className="eyebrow">DEMO FINDINGS</p><h2 id="findings-table-title">Findings</h2></div><span className="muted-cell">{allFindings.length} illustrative record{allFindings.length === 1 ? '' : 's'}</span></div>
      <div className="table-controls"><label className="search-input"><Search size={15} /><span className="sr-only">Search findings</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search findings" type="search" /></label><select className="select-control" aria-label="Filter by severity" value={severity} onChange={(event) => setSeverity(event.target.value as Severity | 'all')}>{severities.map((item) => <option key={item} value={item}>{item === 'all' ? 'All severities' : item}</option>)}</select><select className="select-control" aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select className="select-control" aria-label="Filter by verification status" value={verificationStatus} onChange={(event) => setVerificationStatus(event.target.value as VerificationStatus | 'all')}>{verificationStates.map((item) => <option key={item} value={item}>{item === 'all' ? 'All verification' : item.replaceAll('_', ' ')}</option>)}</select><button className="button button--ghost button--small" type="button" onClick={() => { setQuery(''); setSeverity('all'); setCategory('all'); setVerificationStatus('all') }}><X size={13} />Clear</button></div>
      <DataTable columns={columns} rows={filtered} rowKey={(row) => row.id} totalRows={allFindings.length} searchQuery={query || (severity !== 'all' || category !== 'all' || verificationStatus !== 'all' ? 'filtered' : '')} emptyTitle="No findings are recorded" emptyDescription="This demo scan has no finding records. This is not a security guarantee." noResultsTitle="No findings match these filters" noResultsDescription="Clear a filter or adjust your search." />
    </section>

    <section className="panel dependency-stage-panel" aria-label="Contract dependency stage">
      {isDesktop ? <StageShell title="Contract dependency map" caption="Illustrative relationships from this demo record · select an element to open its source reference" fallback={dependencyFallback}>
        <DependencyScene nodes={graphNodes} edges={graphEdges} selectedNodeId={selectedNodeId} onSelectNode={(node) => selectGraphNode(node.id)} />
      </StageShell> : dependencyFallback}
    </section>

    <section className="investigation-grid" aria-label="Finding and source investigation workspace">
      <div className="panel investigation-findings"><div className="section-heading"><div><p className="eyebrow">INVESTIGATION WORKSPACE</p><h2>Source references</h2></div></div>
        {allFindings.length ? <><div className="investigation-findings-list">{allFindings.map((finding) => <button className={`investigation-finding${selected?.id === finding.id ? ' investigation-finding--active' : ''}`} key={finding.id} type="button" onClick={() => selectFinding(finding)}><SeverityBadge severity={finding.severity} /><strong>{finding.title}</strong><small>{finding.evidence[0]?.file}:{finding.evidence[0]?.startLine}</small></button>)}</div><button className="button button--ghost button--small" type="button" onClick={() => setSelectedFindingId('')}><X size={13} />Clear selection</button></> : <EmptyState title="No source references" description="This demo record has no attached finding excerpts." />}
      </div>
      <div ref={sourcePanelRef} className="investigation-source" role="region" aria-label="Source for selected finding" tabIndex={-1}>
        {files.length > 1 && <label className="source-file-picker">Source file<select value={currentFile} onChange={(event) => setSelectedFile(event.target.value)}>{files.map((file) => <option key={file}>{file}</option>)}</select></label>}
        {currentFile && sourceService.get(currentFile, scan.id) ? <CodeViewer value={sourceService.get(currentFile, scan.id) ?? ''} filename={currentFile} highlightLine={evidence?.file === currentFile ? evidence.startLine : undefined} height={440} /> : <EmptyState title="Source unavailable" description="This source file is not present in the current browser session." />}
      </div>
    </section>
    {selected && <VerificationPanel status={selected.verification.status} title="Verification record · demo data" summary={selected.verification.note} evidence={selected.evidence.map((ref) => `${ref.file}:${ref.startLine}–${ref.endLine} · ${ref.note}`).join('\n')} details={selected.verification} />}
  </div>
}
