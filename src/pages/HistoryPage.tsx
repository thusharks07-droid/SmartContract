import { lazy, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Search, Trash2, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { DataColumn } from '../components/ui/DataTable'
import { DataTable } from '../components/ui/DataTable'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { ScanStatusBadge } from '../components/ui/ScanStatusBadge'
import { useScans } from '../state/useScans'
import { useToast } from '../state/useToast'
import { historyService } from '../services/aggregateService'
import { findingService } from '../services/findingService'
import { scanService } from '../services/scanService'
import type { ScanStatus } from '../types/domain'
import { formatDate, highestSeverity } from './pageUtils'
import type { HistoryRow } from '../services/aggregateService'
import { StageShell } from '../components/stage/StageShell'
import { ScanTimelineFallback } from '../components/stage/ScanTimelineFallback'
import { useAppReducedMotion } from '../state/useAppReducedMotion'
import { useWorkspaceMode } from '../state/useWorkspaceMode'
import { AccountHistoryPage } from './AccountWorkspacePages'

const ScanTimelineScene = lazy(() => import('../components/stage/ScanTimelineScene').then((module) => ({ default: module.ScanTimelineScene })))

const statusOptions: (ScanStatus | 'all')[] = ['all', 'draft', 'queued', 'running', 'completed', 'failed', 'cancelled']

export function HistoryPage() {
  const { mode } = useWorkspaceMode()
  if (mode === 'account') return <AccountHistoryPage />
  return <DemoHistoryPage />
}

function DemoHistoryPage() {
  const scans = useScans()
  const navigate = useNavigate()
  const { notify } = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<ScanStatus | 'all'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [limit, setLimit] = useState(8)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [view, setView] = useState<'table' | 'timeline'>('table')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const deleteTimer = useRef<number | null>(null)
  const reducedMotion = useAppReducedMotion()
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 80rem)').matches)
  const scanIds = useMemo(() => new Set(scans.map((scan) => scan.id)), [scans])
  const rows = useMemo(() => historyService.list().filter((row) => {
    const date = row.submittedAt.slice(0, 10)
    return scanIds.has(row.id)
      && (!query.trim() || `${row.contractName} ${row.id} ${row.sourceLabel}`.toLowerCase().includes(query.trim().toLowerCase()))
      && (status === 'all' || row.status === status)
      && (!from || date >= from)
      && (!to || date <= to)
  }), [query, scanIds, status, from, to])
  const visibleRows = rows.slice(0, limit)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 80rem)')
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])
  useEffect(() => () => {
    if (deleteTimer.current !== null) window.clearTimeout(deleteTimer.current)
  }, [])
  const deleteScan = scanService.get(deleteId ?? '')
  const columns: DataColumn<HistoryRow>[] = [
    { id: 'contract', header: 'Contract / Project', cell: (row) => <Link className="table-primary-link" to={`/scans/${row.id}`}>{row.contractName}<small>{row.sourceLabel}</small></Link>, sortValue: (row) => row.contractName },
    { id: 'id', header: 'Scan ID', cell: (row) => <code>{row.id}</code>, sortValue: (row) => row.id },
    { id: 'date', header: 'Date', cell: (row) => formatDate(row.submittedAt), sortValue: (row) => row.submittedAt },
    { id: 'status', header: 'Status', cell: (row) => <ScanStatusBadge status={row.status} />, sortValue: (row) => row.status },
    ...(['critical', 'high', 'medium', 'low'] as const).map((level) => ({ id: level, header: level, cell: (row: HistoryRow) => row.findingsBySeverity[level], sortValue: (row: HistoryRow) => row.findingsBySeverity[level] })),
    { id: 'actions', header: 'Actions', cell: (row) => <div className="row-actions"><Link className="icon-button" to={`/scans/${row.id}`} aria-label={`Open ${row.contractName} details`}><ArrowRight size={15} /></Link><button className="icon-button icon-button--danger" type="button" aria-label={`Delete ${row.id} demo record`} onClick={() => setDeleteId(row.id)}><Trash2 size={14} /></button></div> },
  ]

  return <div className="page-stack">
    <PageHeader title="Scan History" eyebrow="DEMO RECORDS" description="Browse deterministic records from this browser session. Deleting a row removes only its local demo record." actions={<Link className="button button--primary" to="/new-scan">New Scan</Link>} />
    <section className="panel history-panel" aria-labelledby="history-table-title"><div className="section-heading"><div><p className="eyebrow">LOCAL WORKSPACE</p><h2 id="history-table-title">All scan records</h2></div><span className="muted-cell">{rows.length} of {scans.length} shown</span></div>
      {isDesktop && <div className="history-view-toggle" role="group" aria-label="Scan history view"><button className="button button--secondary button--small" type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table view</button><button className="button button--secondary button--small" type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>Timeline view</button></div>}
      <div className="table-controls history-controls"><label className="search-input"><Search size={15} /><span className="sr-only">Search contract name or scan ID</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(8) }} placeholder="Search contract or scan ID" /></label><select className="select-control" aria-label="Filter status" value={status} onChange={(event) => { setStatus(event.target.value as ScanStatus | 'all'); setLimit(8) }}>{statusOptions.map((item) => <option key={item} value={item}>{item === 'all' ? 'All statuses' : item.replace(/^./, (letter) => letter.toUpperCase())}</option>)}</select><label className="date-filter"><CalendarDays size={14} /><span className="sr-only">From date</span><input type="date" aria-label="From date" value={from} onChange={(event) => { setFrom(event.target.value); setLimit(8) }} /></label><label className="date-filter"><CalendarDays size={14} /><span className="sr-only">To date</span><input type="date" aria-label="To date" value={to} onChange={(event) => { setTo(event.target.value); setLimit(8) }} /></label><button className="button button--ghost button--small" type="button" onClick={() => { setQuery(''); setStatus('all'); setFrom(''); setTo(''); setLimit(8) }}><X size={13} />Clear</button></div>
      {isDesktop && view === 'timeline' ? <div className="timeline-panel"><StageShell title="Scan timeline" caption="Submitted time sets the order and spacing. Every plate opens its local demo record." fallback={<ScanTimelineFallback scans={visibleRows} />}><ScanTimelineScene scans={visibleRows} onOpenScan={(scan) => navigate(`/scans/${scan.id}`)} /></StageShell></div> : <DataTable columns={columns} rows={visibleRows} rowKey={(row) => row.id} rowClassName={(row) => row.id === deletingId ? 'data-table__row--deleting' : undefined} totalRows={scans.length} searchQuery={query || status !== 'all' || from || to ? 'filtered' : ''} emptyTitle="No demo records yet" emptyDescription="Create a local demo record to see it in history." noResultsTitle="No records match these filters" noResultsDescription="Try a different date range, status, or search term." />}
      {visibleRows.length < rows.length && <div className="show-more-row"><button className="button button--secondary button--small" type="button" onClick={() => setLimit((current) => current + 8)}>Show 8 more records</button></div>}
      {rows.length > 0 && rows.length < scans.length && <p className="table-footnote">Severity counts are based on findings attached to each demo record. Highest severity: {rows.map((row) => highestSeverity(findingService.listByScan(row.id))).filter(Boolean).join(', ') || 'none recorded'}.</p>}
    </section>
    <ConfirmDialog open={Boolean(deleteId)} title="Delete demo record?" description={`This removes ${deleteScan?.id ?? 'this record'} from local scan history. Findings attached to the record will no longer appear in summaries. This does not delete a contract on-chain.`} confirmLabel="Delete demo record" destructive onClose={() => setDeleteId(null)} onConfirm={() => {
      const id = deleteId
      setDeleteId(null)
      if (!id) return
      setDeletingId(id)
      deleteTimer.current = window.setTimeout(() => {
        const removed = scanService.deleteDemoRecord(id)
        setDeletingId(null)
        if (removed) notify({ title: 'Demo record deleted', description: 'The local record was removed from dashboard and history totals.', tone: 'success' })
        deleteTimer.current = null
      }, reducedMotion ? 1 : 160)
    }} />
  </div>
}
