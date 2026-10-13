import { lazy, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Clipboard, ClipboardCheck, Copy, FileCode2, ShieldAlert } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { SeverityBadge } from '../components/ui/SeverityBadge'
import { VerificationStatusBadge } from '../components/ui/VerificationStatusBadge'
import { findingService } from '../services/findingService'
import { scanService } from '../services/scanService'
import { sourceService } from '../services/sourceService'
import { demoContractNodes, demoRelationEdges } from '../data/graphLayouts'
import { StageShell } from '../components/stage/StageShell'
import type { ContractNode, RelationEdge } from '../types/domain'
import { useToast } from '../state/useToast'
import { useAppReducedMotion } from '../state/useAppReducedMotion'
import { formatDateTime } from './pageUtils'
import { useWorkspaceMode } from '../state/useWorkspaceMode'
import { AccountFindingDetailsPage } from './AccountWorkspacePages'

const ContractGraphScene = lazy(() => import('../components/stage/Scenes').then((module) => ({ default: module.ContractGraphScene })))
const demoNodesForScan = (scanId: string) => demoContractNodes.filter((node) => node.scanId === scanId)
const demoEdgesForScan = (scanId: string) => demoRelationEdges.filter((edge) => edge.scanId === scanId)

function suggestedRemediation(category: string) {
  if (category === 'Reentrancy') return 'uint256 balance = balances[msg.sender];\nrequire(balance >= amount, "balance");\nbalances[msg.sender] = balance - amount;\n(bool sent, ) = msg.sender.call{value: amount}("");\nrequire(sent, "send failed");'
  if (category === 'Access Control') return 'modifier onlyOwner() {\n    require(msg.sender == owner, "not owner");\n    _;\n}\n\nfunction setOwner(address nextOwner) external onlyOwner {\n    require(nextOwner != address(0), "zero owner");\n    owner = nextOwner;\n}'
  if (category === 'Unchecked External Call') return 'uint256 credit = pendingWithdrawals[msg.sender];\npendingWithdrawals[msg.sender] = 0;\n(bool sent, ) = payable(msg.sender).call{value: credit}("");\nif (!sent) pendingWithdrawals[msg.sender] = credit;'
  return 'function applyTransition(address account, uint256 amount) internal {\n    require(account != address(0), "zero account");\n    // Validate preconditions before applying related state changes.\n    balances[account] += amount;\n}'
}

export function FindingDetailsPage() {
  const { mode } = useWorkspaceMode()
  if (mode === 'account') return <AccountFindingDetailsPage />
  return <DemoFindingDetailsPage />
}

function DemoFindingDetailsPage() {
  const { scanId = '', findingId = '' } = useParams()
  const navigate = useNavigate()
  const finding = findingService.get(findingId)
  const scan = scanService.get(scanId)
  const { notify } = useToast()
  const reducedMotion = useAppReducedMotion()
  const sourceSectionRef = useRef<HTMLElement>(null)
  const [showAfter, setShowAfter] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 80rem)').matches)
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null)
  const [focusedGraphFile, setFocusedGraphFile] = useState('')
  const [focusedGraphLine, setFocusedGraphLine] = useState<number | null>(null)
  const [relatedMode, setRelatedMode] = useState<'list' | 'graph'>('list')
  const evidence = finding?.evidence[0]
  const graphNodes = scan ? demoNodesForScan(scan.id) : []
  const graphEdges = scan ? demoEdgesForScan(scan.id) : []
  const focusLine = focusedGraphLine ?? evidence?.startLine ?? null
  const focusFile = focusedGraphFile || evidence?.file || ''
  const sourceLines = focusFile ? sourceService.get(focusFile, scan?.id)?.split(/\r?\n/) ?? [] : []
  const excerptLines = focusLine ? sourceLines.slice(Math.max(0, focusLine - 4), Math.min(sourceLines.length, focusLine + 3)) : []
  const excerptStart = focusLine ? Math.max(1, focusLine - 3) : 1
  const remediation = finding ? suggestedRemediation(finding.category) : ''
  const relatedFindings = scan && finding ? findingService.listByScan(scan.id).filter((item) => item.id !== finding.id) : []
  const relatedNodes = (() => {
    if (!scan || !finding) return [] as ContractNode[]
    const items = findingService.listByScan(scan.id)
    return items.map((item, index) => ({ id: item.id, scanId: scan.id, label: item.title, kind: 'function' as const, file: item.evidence[0]?.file ?? scan.sourceFiles[0] ?? '', line: item.evidence[0]?.startLine ?? 1, x: index * 280, y: (index % 2) * 150 }))
  })()
  const relatedEdges = (() => {
    if (!scan) return [] as RelationEdge[]
    const items = findingService.listByScan(scan.id)
    return items.flatMap((left, index) => items.slice(index + 1).flatMap((right) => {
      const sameFile = left.evidence.some((a) => right.evidence.some((b) => a.file === b.file))
      const sameCategory = left.category === right.category
      return sameFile || sameCategory ? [{ id: `finding-link-${left.id}-${right.id}`, scanId: scan.id, source: left.id, target: right.id, relation: sameFile ? 'reads' as const : 'calls' as const }] : []
    }))
  })()
  const primaryNodeId = graphEdges.find((edge) => edge.findingId === finding?.id)?.source ?? graphNodes.find((node) => node.kind === 'function')?.id ?? null
  const activeNodeId = selectedGraphNodeId ?? primaryNodeId
  const revealSelectedSource = () => {
    window.requestAnimationFrame(() => {
      const section = sourceSectionRef.current
      if (!section) return
      if (typeof section.scrollIntoView === 'function') section.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
      section.focus({ preventScroll: true })
    })
  }
  const selectContractNode = (node: ContractNode) => {
    setSelectedGraphNodeId(node.id)
    setFocusedGraphFile(node.file)
    setFocusedGraphLine(node.line)
    revealSelectedSource()
  }
  const contractGraphFallback = graphNodes.length ? <div className="dependency-list" role="list" aria-label="Contract nodes and source locations">
    {graphNodes.map((node) => <div className="dependency-list__row" key={node.id} role="listitem"><button aria-pressed={activeNodeId === node.id} className="dependency-list__item" onClick={() => selectContractNode(node)} type="button"><span className={`dependency-list__kind dependency-list__kind--${node.kind}`}>{node.kind}</span><strong>{node.label}</strong><small>{node.file}:{node.line}</small></button></div>)}
  </div> : <div className="dependency-empty"><strong>No illustrative call structure is attached.</strong><span>This scan has no precomputed graph fixture.</span></div>
  const relatedGraphFallback = <div className="dependency-list" role="list" aria-label="Findings in this scan">
    {relatedNodes.map((node) => { const item = findingService.get(node.id); return item ? <div className="dependency-list__row" key={node.id} role="listitem"><Link className="dependency-list__item related-graph-link" to={`/scans/${scan?.id}/findings/${item.id}`}><span className={`dependency-list__kind severity-text--${item.severity}`}>{item.severity}</span><strong>{item.title}</strong><small>{item.evidence[0]?.file}:{item.evidence[0]?.startLine}</small></Link></div> : null })}
  </div>

  useEffect(() => {
    const media = window.matchMedia('(min-width: 80rem)')
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  if (!finding || !scan || finding.scanId !== scan.id) return <div className="page-stack"><PageHeader title="Finding not found" eyebrow="DEMO WORKSPACE" description="This finding is not present in the current browser session." /><EmptyState title="No matching finding" description="Return to the scan record to browse its available demo findings." action={<Link className="button button--primary" to={scan ? `/scans/${scan.id}` : '/scans'}>Back to scan details</Link>} /></div>

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      notify({ title: `${label} copied`, description: 'Copied from the local demo record.', tone: 'success' })
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      notify({ title: 'Clipboard unavailable', description: 'Copying is unavailable in this browser context.', tone: 'warning' })
    }
  }

  return <div className="page-stack finding-detail-page">
    <PageHeader title={finding.title} eyebrow="FINDING DETAILS · ILLUSTRATIVE DEMO" description={`${finding.id} · ${scan.contractName} · ${evidence?.file}:${evidence?.startLine}`} actions={<><SeverityBadge severity={finding.severity} /><VerificationStatusBadge status={finding.verification.status} /></>} />
    <section className="panel contract-graph-stage" aria-label="Contract call structure">
      {isDesktop ? <StageShell title="Contract call structure" caption="Illustrative call structure — demo data." fallback={contractGraphFallback}>
        {graphNodes.length > 0 ? <ContractGraphScene nodes={graphNodes} edges={graphEdges} selectedNodeId={activeNodeId} activeFindingId={finding.id} onSelectNode={selectContractNode} /> : contractGraphFallback}
      </StageShell> : contractGraphFallback}
    </section>
    <div className="finding-meta-strip"><span><strong>Category</strong>{finding.category}</span><span><strong>Confidence</strong>{finding.confidence}</span><span><strong>Source</strong>{evidence?.file}:{evidence?.startLine}-{evidence?.endLine}</span><span><strong>Recorded</strong>{formatDateTime(finding.verification.recordedAt)}</span><Link className="text-link" to={`/scans/${scan.id}`}><ArrowLeft size={14} />Scan details</Link></div>
    <div className="finding-detail-layout">
      <div className="finding-detail-main">
        <section className="panel finding-content-section"><p className="eyebrow">01 · SUMMARY</p><h2>Summary</h2><p>{finding.description}</p><p className="illustrative-inline"><ShieldAlert size={15} />This is an illustrative finding in a deterministic demo record. No real security analysis ran.</p></section>
        <section className="panel finding-content-section"><p className="eyebrow">02 · CONTEXT</p><h2>Why it matters</h2><p>{finding.category} patterns can affect contract behavior depending on surrounding code, authorization assumptions, and deployment context. Review this demo note against the complete source and intended design.</p></section>
        <section ref={sourceSectionRef} className="panel finding-content-section" aria-labelledby="affected-code-title" tabIndex={-1}><div className="section-heading"><div><p className="eyebrow">03 · SOURCE LOCATION</p><h2 id="affected-code-title">Affected code</h2></div><button className="button button--secondary button--small" type="button" onClick={() => void copyText(excerptLines.join('\n') || evidence?.excerpt || '', 'Source excerpt')}><Clipboard size={14} />Copy excerpt</button></div><div className="source-location-label"><FileCode2 size={14} />{focusFile} · focus line {focusLine ?? '—'}{focusedGraphLine ? ' · selected from call structure' : ''}</div>{excerptLines.length ? <pre className="finding-code-excerpt" aria-label={`Source excerpt around line ${focusLine}`} tabIndex={0}>{excerptLines.map((line, index) => { const lineNumber = excerptStart + index; const highlighted = lineNumber === focusLine; return <span key={lineNumber} className={highlighted ? 'finding-code-line finding-code-line--active' : 'finding-code-line'}><span className="finding-code-line__number">{lineNumber}</span><code>{line || ' '}</code></span> })}</pre> : <EmptyState title="Source is unavailable" description="The source file is not present in this browser session." />}</section>
        <section className="panel finding-content-section"><p className="eyebrow">04 · DEMO CONTEXT</p><h2>Preconditions</h2><p>{finding.verification.preconditions}</p></section>
        <section className="panel finding-content-section"><p className="eyebrow">05 · POTENTIAL IMPACT</p><h2>Potential impact</h2><p>{finding.impact}</p><p className="subtle-copy">Impact depends on contract context and has not been validated by execution.</p></section>
        <section className="panel remediation-panel"><div className="section-heading"><div><p className="eyebrow">06 · REVIEW SUGGESTION</p><h2>Recommended remediation</h2></div><span className="unverified-label">Patch verification: unverified</span></div><p>{finding.recommendation}</p><div className="remediation-summary"><strong>Fix summary</strong><span>Address the referenced pattern, then review the full implementation and tests before any deployment decision.</span></div><div className="remediation-toggle" role="group" aria-label="Compare demo source with suggested code"><button type="button" className={!showAfter ? 'remediation-toggle__active' : ''} aria-pressed={!showAfter} onClick={() => setShowAfter(false)}>Before</button><button type="button" className={showAfter ? 'remediation-toggle__active' : ''} aria-pressed={showAfter} onClick={() => setShowAfter(true)}>Suggested pattern</button></div><div className="remediation-code-stage"><div key={showAfter ? 'after' : 'before'} className="remediation-code-content"><div className="remediation-code-label">{showAfter ? 'Illustrative suggestion · review required' : 'Referenced source excerpt'}</div><pre><code>{showAfter ? remediation : evidence?.excerpt}</code></pre></div></div><button className="button button--secondary button--small" type="button" onClick={() => void copyText(remediation, 'Suggested code')}>{copied ? <ClipboardCheck size={14} /> : <Copy size={14} />}Copy suggested code</button><p className="subtle-copy">Suggested code is illustrative and unverified. It is not an automatic patch.</p></section>
        <section className="panel finding-content-section"><p className="eyebrow">07 · VERIFICATION EVIDENCE</p><h2>Verification evidence</h2><div className="notice-banner notice-banner--warning">DEMO DATA — NO EXPLOIT EXECUTED</div><dl className="verification-details"><div><dt>Status</dt><dd><VerificationStatusBadge status={finding.verification.status} /></dd></div><div><dt>Test scenario</dt><dd>{finding.verification.testScenario}</dd></div><div><dt>Expected behavior</dt><dd>{finding.verification.expectedBehavior}</dd></div><div><dt>Observed behavior</dt><dd>{finding.verification.observedBehavior}</dd></div><div><dt>State changes</dt><dd>{finding.verification.stateChanges}</dd></div><div><dt>Execution environment</dt><dd>{finding.verification.executionEnvironment}</dd></div><div><dt>Evidence references</dt><dd>{finding.verification.evidenceRefs.join(', ')}</dd></div></dl></section>
        <section className="panel related-findings-panel"><p className="eyebrow">08 · SAME SCAN</p><div className="section-heading"><h2>Related findings</h2><div className="related-view-toggle" role="group" aria-label="Related findings view"><button type="button" aria-pressed={relatedMode === 'list'} onClick={() => setRelatedMode('list')}>List</button><button type="button" aria-pressed={relatedMode === 'graph'} onClick={() => setRelatedMode('graph')}>Graph</button></div></div>
          {relatedFindings.length ? relatedMode === 'list' ? <ul>{relatedFindings.map((item) => <li key={item.id}><Link to={`/scans/${scan.id}/findings/${item.id}`}><SeverityBadge severity={item.severity} /><span><strong>{item.title}</strong><small>{item.evidence[0]?.file}:{item.evidence[0]?.startLine}</small></span></Link></li>)}</ul> : isDesktop ? <StageShell title="Related finding graph" caption="Illustrative relationships by shared source file or category · demo data" fallback={relatedGraphFallback}>{relatedNodes.length ? <ContractGraphScene nodes={relatedNodes} edges={relatedEdges} selectedNodeId={finding.id} onSelectNode={(node) => navigate(`/scans/${scan.id}/findings/${node.id}`)} /> : relatedGraphFallback}</StageShell> : relatedGraphFallback : <p className="muted-cell">No other findings are recorded for this scan.</p>}
        </section>
      </div>
      <aside className="finding-detail-aside"><div className="panel aside-summary"><p className="eyebrow">RECORD</p><dl><div><dt>Finding ID</dt><dd><code>{finding.id}</code></dd></div><div><dt>Scan</dt><dd><Link to={`/scans/${scan.id}`}>{scan.id}</Link></dd></div><div><dt>Contract</dt><dd>{scan.contractName}</dd></div><div><dt>Verification</dt><dd><VerificationStatusBadge status={finding.verification.status} /></dd></div></dl></div><div className="panel aside-summary"><p className="eyebrow">SOURCE NOTE</p><p>{evidence?.note}</p></div></aside>
    </div>
  </div>
}
