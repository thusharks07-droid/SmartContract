import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, FileCode2, Upload } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { useWorkspaceMode } from '../state/useWorkspaceMode'
import { localScanApi, makeIdempotencyKey, ScanApiError } from '../services/localScanApi'
import type { SubmitScanInput } from '../services/localScanApi'

const supportedCompilers = ['0.8.24', '0.8.23', '0.8.22', '0.8.19'] as const
const maximumBytes = 500_000

export function AccountNewScanPage() {
  const { accessToken } = useWorkspaceMode()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const idempotencyRef = useRef<{ payload: string; key: string } | null>(null)
  const [inputType, setInputType] = useState<'upload' | 'paste'>('upload')
  const [sourceCode, setSourceCode] = useState('')
  const [sourceFilename, setSourceFilename] = useState('')
  const [contractName, setContractName] = useState('')
  const [compilerVersion, setCompilerVersion] = useState<(typeof supportedCompilers)[number]>('0.8.24')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const readFile = async (file?: File) => {
    setError('')
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.sol')) { setError('Choose a Solidity file ending in .sol.'); return }
    if (file.size > maximumBytes) { setError('The local worker accepts source up to 500,000 bytes.'); return }
    try { setSourceCode(await file.text()); setSourceFilename(file.name) }
    catch { setError('The selected source file could not be read.') }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const source = sourceCode
    if (!source.trim()) { setError('Provide Solidity source before submitting.'); return }
    if (new TextEncoder().encode(source).byteLength > maximumBytes) { setError('The local worker accepts source up to 500,000 UTF-8 bytes.'); return }
    if (/\bimport\s*(?:"|'|\{|\*)/.test(source)) { setError('Imports are not supported. Submit one self-contained Solidity file; dependencies are not fetched.'); return }
    if (!accessToken) { setError('Your Supabase account session is unavailable. Sign in again.'); return }
    const inferredName = source.match(/\bcontract\s+([A-Za-z_$][\w$]*)/)?.[1]
    const input: SubmitScanInput = {
      contractName: contractName.trim() || inferredName || sourceFilename.replace(/\.sol$/i, '') || 'Untitled Contract',
      sourceFilename: inputType === 'upload' ? sourceFilename || 'contract.sol' : 'pasted-contract.sol',
      sourceCode: source,
      inputType,
      compilerVersion,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }
    const canonicalPayload = JSON.stringify(input)
    try {
      if (idempotencyRef.current?.payload !== canonicalPayload) idempotencyRef.current = { payload: canonicalPayload, key: makeIdempotencyKey() }
    } catch {
      setError('This browser cannot create a secure scan submission key. Update the browser and retry.')
      return
    }
    setSubmitting(true)
    try {
      const result = await localScanApi.submit(input, accessToken, idempotencyRef.current.key)
      idempotencyRef.current = null
      navigate(`/app/scans/${result.scan.id}`, { replace: true })
    } catch (reason) {
      const message = reason instanceof ScanApiError ? reason.message : 'The local scan API could not accept this submission.'
      setError(message)
    } finally { setSubmitting(false) }
  }

  return <div className="page-stack"><PageHeader title="New Scan" eyebrow="ACCOUNT · LOCAL STATIC ANALYSIS" description="Submit one Solidity source file to the local Slither worker. Source is sent to your local API and stored in your account workspace." actions={<Link className="button button--secondary" to="/app/scans">View History</Link>} />
    <p className="notice-banner" role="note">Static analysis does not guarantee detection of all vulnerabilities. Imports are unsupported and dependencies are never fetched.</p>
    <form className="new-scan-grid" onSubmit={(event) => void submit(event)}>
      <div className="new-scan-main"><section className="panel input-panel"><div className="section-heading"><div><p className="eyebrow">SOURCE</p><h2>Add Solidity source</h2></div><span className="muted-cell">Max 500,000 bytes</span></div>
        <div className="source-tabs" role="tablist" aria-label="Source input type"><button type="button" role="tab" aria-selected={inputType === 'upload'} className={inputType === 'upload' ? 'source-tab source-tab--active' : 'source-tab'} onClick={() => { setInputType('upload'); setError('') }}><Upload size={15} />Upload Contract</button><button type="button" role="tab" aria-selected={inputType === 'paste'} className={inputType === 'paste' ? 'source-tab source-tab--active' : 'source-tab'} onClick={() => { setInputType('paste'); setError('') }}><FileCode2 size={15} />Paste Solidity</button></div>
        {inputType === 'upload' ? <div className="upload-area-wrap">{sourceFilename ? <div className="selected-file"><FileCode2 size={17} /><span className="selected-file__name"><strong>{sourceFilename}</strong><small>{new TextEncoder().encode(sourceCode).byteLength.toLocaleString()} bytes</small></span><button type="button" className="button button--ghost button--small" onClick={() => { setSourceFilename(''); setSourceCode(''); if (fileRef.current) fileRef.current.value = '' }}>Remove</button></div> : <button type="button" className="upload-dropzone" onClick={() => fileRef.current?.click()}><span className="upload-dropzone__icon"><Upload size={20} /></span><strong>Choose a .sol file</strong><span>Read in this browser, then submit to the local API</span></button>}<input ref={fileRef} className="sr-only" aria-label="Choose Solidity source file" type="file" accept=".sol,text/plain" onChange={(event) => void readFile(event.currentTarget.files?.[0])} /></div> : <label className="form-field"><span>Solidity source</span><textarea rows={18} value={sourceCode} onChange={(event) => { setSourceCode(event.target.value); setSourceFilename('pasted-contract.sol'); setError('') }} spellCheck={false} autoCapitalize="off" autoCorrect="off" /></label>}
        {error && <p className="field-error" role="alert"><AlertCircle size={14} />{error}</p>}
        <p className="subtle-copy">Account mode sends this source to your local scanner API. It does not use demo records.</p>
      </section>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">SCAN CONFIGURATION</p><h2>Compiler and metadata</h2></div></div><div className="advanced-fields"><label className="form-field"><span>Contract name <small>(optional)</small></span><input type="text" maxLength={60} value={contractName} onChange={(event) => setContractName(event.target.value)} placeholder="Inferred from source when blank" /></label><label className="form-field"><span>Solidity compiler version</span><select value={compilerVersion} onChange={(event) => setCompilerVersion(event.target.value as typeof compilerVersion)}>{supportedCompilers.map((version) => <option value={version} key={version}>{version}</option>)}</select></label><label className="form-field form-field--wide"><span>Notes <small>(optional)</small></span><textarea rows={3} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div><p className="subtle-copy">Pinned worker compiler versions only. No fabricated progress or findings are generated by the frontend.</p></section></div>
      <aside className="panel new-scan-summary"><p className="eyebrow">REVIEW</p><h2>Submission summary</h2><dl className="summary-list"><div><dt>Input type</dt><dd>{inputType === 'upload' ? 'Solidity file' : 'Pasted Solidity'}</dd></div><div><dt>Source</dt><dd>{inputType === 'upload' ? sourceFilename || 'No file selected' : `${sourceCode.split(/\r?\n/).length} lines`}</dd></div><div><dt>Compiler</dt><dd>{compilerVersion}</dd></div><div><dt>Size</dt><dd>{new TextEncoder().encode(sourceCode).byteLength.toLocaleString()} / 500,000 bytes</dd></div></dl><div className="summary-disclosure"><AlertCircle size={15} /><span>The server validates your Supabase token. The worker will update status and results after processing.</span></div><button className="button button--primary button--full" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit for Static Analysis'}</button><small className="button-note">A queued response means accepted, not completed.</small></aside>
    </form>
  </div>
}
