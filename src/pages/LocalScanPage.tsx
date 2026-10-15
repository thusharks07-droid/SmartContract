import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, FileCode2, LoaderCircle, ShieldAlert, Upload } from 'lucide-react'
import { localModeApi } from '../services/localModeApi'
import type { LocalFinding, LocalGeminiReview, LocalScan } from '../services/localModeApi'
import { KnownContractReference } from '../components/KnownContractReference'
import './local-scan.css'

const compilers = ['0.8.24', '0.8.23', '0.8.22', '0.8.19']

function makeKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  throw new Error('This browser cannot create a secure scan request ID. Update the browser and retry.')
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'Unknown time' : date.toLocaleString()
}

function ErrorNotice({ message }: { message: string }) {
  return <p className="local-scan-error" role="alert"><AlertCircle size={17} aria-hidden="true" />{message}</p>
}

function FindingCard({ finding }: { finding: LocalFinding }) {
  return <article className="local-finding">
    <div className="local-finding__heading">
      <div><span className={`local-finding__severity local-finding__severity--${finding.severity.toLowerCase()}`}>{finding.severity}</span><h3>{finding.title}</h3></div>
      <code>{finding.rule_id}</code>
    </div>
    <p>{finding.description}</p>
    <dl><div><dt>Confidence</dt><dd>{finding.confidence}</dd></div><div><dt>Location</dt><dd>{finding.line_start ? `contract.sol:${finding.line_start}${finding.line_end && finding.line_end !== finding.line_start ? `–${finding.line_end}` : ''}` : 'No source line returned'}</dd></div></dl>
    {finding.code_excerpt && <pre><code>{finding.code_excerpt}</code></pre>}
    {finding.recommendation && <p className="local-finding__recommendation"><strong>Suggested review:</strong> {finding.recommendation}</p>}
  </article>
}

export function LocalScanPage() {
  const [search, setSearch] = useSearchParams()
  const scanId = search.get('scan')
  const [source, setSource] = useState('')
  const [filename, setFilename] = useState('')
  const [compiler, setCompiler] = useState(compilers[0]!)
  const [contractName, setContractName] = useState('')
  const [scan, setScan] = useState<LocalScan | null>(null)
  const [findings, setFindings] = useState<LocalFinding[]>([])
  const [history, setHistory] = useState<LocalScan[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [geminiReviewState, setGeminiReviewState] = useState<{ scanId: string; review: LocalGeminiReview } | null>(null)
  const [geminiErrorState, setGeminiErrorState] = useState<{ scanId: string; message: string } | null>(null)
  const [geminiBusyScanId, setGeminiBusyScanId] = useState<string | null>(null)
  const requestedGeminiReview = useRef(new Set<string>())
  const [refreshKey, setRefreshKey] = useState(0)
  const geminiReview = geminiReviewState?.scanId === scanId ? geminiReviewState.review : null
  const geminiError = geminiErrorState?.scanId === scanId ? geminiErrorState.message : ''
  const geminiBusy = geminiBusyScanId === scanId

  const requestGeminiReview = useCallback(async (id: string, retry = false) => {
    if (!retry && requestedGeminiReview.current.has(id)) return
    requestedGeminiReview.current.add(id)
    setGeminiBusyScanId(id)
    setGeminiErrorState({ scanId: id, message: '' })
    try { setGeminiReviewState({ scanId: id, review: await localModeApi.reviewFailedScanWithGemini(id) }) }
    catch (reason) { setGeminiErrorState({ scanId: id, message: reason instanceof Error ? reason.message : 'Gemini could not review this source.' }) }
    finally { setGeminiBusyScanId((current) => current === id ? null : current) }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const refresh = async () => {
      try {
        await localModeApi.status()
        if (!cancelled) setError('')
        const scans = await localModeApi.listScans()
        if (!cancelled) setHistory(scans)
        if (!scanId) {
          if (!cancelled) { setScan(null); setFindings([]) }
          return
        }
        const current = await localModeApi.getScan(scanId)
        if (cancelled) return
        setScan(current)
        try {
          const submittedSource = await localModeApi.getSource(scanId)
          if (cancelled) return
          setSource(submittedSource.sourceCode)
        } catch {
          if (!cancelled) setSource('')
        }
        if (current.status === 'failed') void requestGeminiReview(current.id)
        if (current.status === 'completed') setFindings(await localModeApi.listFindings(scanId))
        else setFindings([])
        if (current.status === 'queued' || current.status === 'running') {
          timer = window.setTimeout(() => void refresh(), 1_200)
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'The local scanner request failed.')
      }
    }
    void refresh()
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer) }
  }, [scanId, refreshKey, requestGeminiReview])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!source.trim()) { setError('Paste Solidity source or choose a .sol file.'); return }
    if (new TextEncoder().encode(source).byteLength > 500_000) { setError('Source must be 500,000 UTF-8 bytes or smaller.'); return }
    if (/\bimport\s*(?:"|'|\{|\*)/.test(source)) { setError('Imports are not supported. Submit one self-contained Solidity file; dependencies are never fetched.'); return }
    let idempotencyKey: string
    try { idempotencyKey = makeKey() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create a scan request ID.'); return }
    setBusy(true)
    try {
      const inferred = source.match(/\bcontract\s+([A-Za-z_$][\w$]*)/)?.[1]
      const created = await localModeApi.submit({
        contractName: contractName.trim() || inferred || filename.replace(/\.sol$/i, '') || 'Local Solidity Scan',
        sourceFilename: filename || 'pasted-contract.sol', sourceCode: source,
        inputType: filename ? 'upload' : 'paste', compilerVersion: compiler,
      }, idempotencyKey)
      setScan(created)
      setFindings([])
      setSearch({ scan: created.id })
      setRefreshKey((value) => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The local scan request failed.')
    } finally { setBusy(false) }
  }

  const loadFile = async (file?: File) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.sol')) { setError('Choose a Solidity source file ending in .sol.'); return }
    if (file.size > 500_000) { setError('Source must be 500,000 bytes or smaller.'); return }
    try { setSource(await file.text()); setFilename(file.name); setError('') }
    catch { setError('The selected file could not be read.') }
  }

  return <main className="local-scan-page">
    <header className="local-scan-header"><Link to="/" aria-label="Back to smartBOB home"><img src="/smartbob-mark-orange.png" alt="" /><span>smart<span>BOB</span></span></Link><Link className="local-scan-back" to="/"><ArrowLeft size={15} />Back to smartBOB</Link></header>
    <div className="local-scan-container">
      <div className="local-scan-title"><p className="local-scan-eyebrow">LOCAL SCANNER · NO ACCOUNT</p><h1>Run a real Solidity scan</h1><p>Slither analyzes your source inside the isolated Docker worker. Local results are stored on this computer and are not authenticated or synced to Supabase.</p></div>
      <div className="local-scan-banner" role="note"><ShieldAlert size={18} /><span><strong>Local mode</strong> · No Supabase account · SQLite history survives API restarts on this computer.</span></div>
      {error && <ErrorNotice message={error} />}
      <div className="local-scan-layout">
        <section className="local-scan-panel">
          <h2><FileCode2 size={19} />Add Solidity source</h2>
          <form onSubmit={(event) => void submit(event)}>
            <label className="local-scan-field"><span>Solidity source</span><textarea value={source} onChange={(event) => { setSource(event.target.value); setFilename(''); setError('') }} rows={15} spellCheck={false} placeholder={'// Paste a self-contained contract\npragma solidity 0.8.24;\ncontract Example { }'} /></label>
            <div className="local-scan-form-row"><label className="local-scan-field"><span>Contract name <small>(optional)</small></span><input value={contractName} maxLength={60} onChange={(event) => setContractName(event.target.value)} placeholder="Inferred from source" /></label><label className="local-scan-field"><span>Compiler</span><select value={compiler} onChange={(event) => setCompiler(event.target.value)}>{compilers.map((version) => <option key={version}>{version}</option>)}</select></label></div>
            <div className="local-scan-actions"><label className="local-scan-file"><Upload size={15} />Choose .sol file<input type="file" accept=".sol,text/plain" onChange={(event) => void loadFile(event.currentTarget.files?.[0])} /></label><span>{filename || `${new TextEncoder().encode(source).byteLength.toLocaleString()} / 500,000 bytes`}</span><button className="local-scan-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={15} className="local-spin" />Submitting…</> : 'Run Slither scan'}</button></div>
          </form>
          <p className="local-scan-footnote">One file only; imports are blocked and no dependencies are downloaded. Slither output is static analysis and should be independently reviewed.</p>
        </section>
        <aside className="local-scan-panel local-scan-history"><h2>Local scan history</h2>{history.length ? <ul>{history.map((item) => <li key={item.id}><button type="button" className={scanId === item.id ? 'local-history-item local-history-item--active' : 'local-history-item'} onClick={() => setSearch({ scan: item.id })}><span><strong>{item.contractName}</strong><small>{formatDate(item.createdAt)}</small></span><em className={`local-status local-status--${item.status}`}>{item.status}</em></button></li>)}</ul> : <p>No local scans yet. Completed results remain on this computer across API restarts.</p>}</aside>
      </div>
      {scan && <section className="local-scan-results" aria-live="polite">
        <div className="local-scan-result-heading"><div><p className="local-scan-eyebrow">{scan.analysisEngine ? `${scan.analysisEngine} ${scan.analysisVersion ?? ''}` : 'REAL ANALYZER RESULT'}</p><h2>{scan.contractName}</h2><p>Scan ID <code>{scan.id}</code></p></div><span className={`local-status local-status--${scan.status}`}>{scan.status === 'queued' || scan.status === 'running' ? <LoaderCircle size={14} className="local-spin" /> : scan.status === 'completed' ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}{scan.status}</span></div>
        {(scan.status === 'queued' || scan.status === 'running') && <p className="local-scan-progress">The isolated Slither worker is processing this source. This page checks the saved scan status until it finishes.</p>}
        {scan.status === 'failed' && <ErrorNotice message={`${scan.errorCode ? `${scan.errorCode}: ` : ''}${scan.errorMessage || 'The analyzer could not complete this source.'}`} />}
        {scan.status === 'completed' && <><div className="local-scan-summary"><strong>{String(scan.summary.finding_count ?? findings.length)}</strong><span>finding{Number(scan.summary.finding_count ?? findings.length) === 1 ? '' : 's'} returned by Slither</span></div>{findings.length ? <div className="local-findings">{findings.map((finding) => <FindingCard key={finding.id} finding={finding} />)}</div> : <p className="local-scan-empty">Slither returned no findings for this source. A zero-finding result is not proof that the contract is safe.</p>}</>}
      </section>}
      {scan && <KnownContractReference source={source} />}
      {scan?.status === 'failed' && <section className="local-scan-results local-gemini-review" aria-live="polite">
        <div className="local-scan-result-heading"><div><p className="local-scan-eyebrow">AI FALLBACK · GEMINI</p><h2>Source review</h2><p>This is Gemini output, not Slither findings. The saved source is sent to Gemini for this review.</p></div></div>
        {geminiBusy && <p className="local-scan-progress"><LoaderCircle size={15} className="local-spin" /> Gemini is reviewing the source because Slither could not complete the scan.</p>}
        {geminiError && <><ErrorNotice message={geminiError} /><button className="local-scan-submit" type="button" onClick={() => void requestGeminiReview(scan.id, true)} disabled={geminiBusy}>Retry Gemini review</button></>}
        {geminiReview && <div className="local-gemini-review__content">
          <p className="local-finding__recommendation"><strong>AI generated · {geminiReview.provider} · {geminiReview.model}</strong>{geminiReview.sourceTruncated ? ` · Reviewed first ${geminiReview.reviewedChars.toLocaleString()} characters; source was truncated.` : ''}</p>
          <pre className="local-gemini-review__output">{geminiReview.reviewText}</pre>
          <p>This AI response is not persisted as findings and does not change scan status.</p>
        </div>}
      </section>}
    </div>
  </main>
}
