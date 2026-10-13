import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, ChevronDown, FileCode2, FileUp, RotateCcw, Sparkles, Upload, X } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../state/useToast'
import { settingsService } from '../services/settingsService'
import { scanService } from '../services/scanService'
import { sourceService } from '../services/sourceService'
import { registerSolidityLanguage } from '../components/ui/solidityLanguage'
import { useAppReducedMotion } from '../state/useAppReducedMotion'
import type { ScanConfiguration } from '../types/domain'
import { useWorkspaceMode } from '../state/useWorkspaceMode'
import { AccountNewScanPage } from './AccountNewScanPage'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))
const maxFileSize = 2 * 1024 * 1024
const compilerVersions = ['0.8.24', '0.8.23', '0.8.22', '0.8.19'] as const
const formSchema = z.object({
  contractName: z.string().max(60, 'Use 60 characters or fewer.'),
  notes: z.string().max(500, 'Use 500 characters or fewer.'),
  compilerVersion: z.enum(compilerVersions),
})
type FormValues = z.infer<typeof formSchema>
type AnalysisOptions = { reentrancy: boolean; accessControl: boolean; staticAnalysis: boolean }

const optionDetails: { key: keyof AnalysisOptions; label: string; description: string }[] = [
  { key: 'reentrancy', label: 'Reentrancy', description: 'Illustrative checks for external calls and state-update ordering.' },
  { key: 'accessControl', label: 'Access Control', description: 'Illustrative checks for privileged actions and caller restrictions.' },
  { key: 'staticAnalysis', label: 'Static', description: 'Display seeded pattern-based notes from the demo dataset.' },
]

export function NewScanPage() {
  const { mode } = useWorkspaceMode()
  if (mode === 'account') return <AccountNewScanPage />
  return <DemoNewScanPage />
}

function DemoNewScanPage() {
  const navigate = useNavigate()
  const { notify, demoQueued } = useToast()
  const reduceMotion = useAppReducedMotion()
  const fileInput = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'upload' | 'paste'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [fileText, setFileText] = useState('')
  const [pastedSource, setPastedSource] = useState('')
  const [inputError, setInputError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [options, setOptions] = useState<AnalysisOptions>(() => settingsService.get().defaultOptions)
  const [expandedAdvanced, setExpandedAdvanced] = useState(false)
  const [queuedPreview, setQueuedPreview] = useState(false)
  const [editorTheme, setEditorTheme] = useState<'vs' | 'vs-dark'>(() => document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark')
  const settings = settingsService.get()
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { contractName: '', notes: '', compilerVersion: settings.defaultCompilerVersion as (typeof compilerVersions)[number] },
  })
  const name = useWatch({ control, name: 'contractName' })
  const compilerVersion = useWatch({ control, name: 'compilerVersion' })
  useEffect(() => {
    const updateTheme = () => setEditorTheme(document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark')
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  const source = tab === 'upload' ? fileText : pastedSource
  const lineCount = source ? source.split(/\r?\n/).length : 0

  const loadFile = async (candidate: File | undefined) => {
    if (!candidate) return
    setInputError('')
    if (!candidate.name.toLowerCase().endsWith('.sol')) { setInputError('Choose a Solidity source file ending in .sol.'); return }
    if (candidate.size > maxFileSize) { setInputError('The file must be 2 MB or smaller.'); return }
    try {
      const text = await candidate.text()
      setFile(candidate)
      setFileText(text)
    } catch {
      setInputError('This file could not be read in the browser. Choose another .sol file.')
    }
  }

  const submit = handleSubmit((values) => {
    setInputError('')
    const inputSource = tab === 'upload' ? fileText : pastedSource
    if (tab === 'upload' && (!file || !inputSource.trim())) { setInputError('Choose a readable .sol file before continuing.'); return }
    if (tab === 'paste' && !pastedSource.trim()) { setInputError('Paste Solidity source or load the labeled sample.'); return }
    if (!Object.values(options).some(Boolean)) { setInputError('Enable at least one analysis option for this demo record.'); return }

    const sourceName = tab === 'upload' ? file?.name ?? 'Contract.sol' : 'pasted-contract.sol'
    const inferredName = inputSource.match(/\bcontract\s+([A-Za-z_$][\w$]*)/)?.[1]
    const contractName = values.contractName.trim() || inferredName || sourceName.replace(/\.sol$/i, '') || 'Pasted Contract'
    const configuration: Partial<ScanConfiguration> = {
      compilerVersion: values.compilerVersion,
      optimizationEnabled: true,
      optimizationRuns: 200,
      evmVersion: 'Shanghai',
      includeInformational: true,
      analysisOptions: options,
    }
    const scan = scanService.createDemoScan({ contractName, sourceLabel: sourceName, sourceFiles: [sourceName], inputType: tab, notes: values.notes.trim() || undefined, configuration })
    sourceService.registerScanSource(scan.id, sourceName, inputSource)
    scanService.updateStatus(scan.id, 'queued')
    demoQueued()
    setQueuedPreview(true)
    window.setTimeout(() => navigate(`/scans/${scan.id}`), reduceMotion ? 0 : 680)
  }, (fieldErrors) => {
    const count = Object.keys(fieldErrors).length
    if (count) notify({ title: 'Check the highlighted fields', description: `${count} form field${count === 1 ? '' : 's'} need attention.`, tone: 'warning' })
  })

  return <div className="page-stack">
    <PageHeader title="New Scan" eyebrow="LOCAL DEMO WORKFLOW" description="Prepare a local demo record. Source stays in this browser; no upload, backend, or scanner is involved." actions={<Link className="button button--secondary" to="/scans">View History</Link>} />
    <form className="new-scan-grid" onSubmit={submit} noValidate>
      <div className="new-scan-main">
        <section className="panel input-panel" aria-labelledby="input-title">
          <div className="section-heading"><div><p className="eyebrow">STEP 1 · SOURCE</p><h2 id="input-title">Add Solidity source</h2></div><span className="local-only-badge">Browser only</span></div>
          <div className="source-tabs" role="tablist" aria-label="Source input type">
            <button type="button" role="tab" aria-selected={tab === 'upload'} className={tab === 'upload' ? 'source-tab source-tab--active' : 'source-tab'} onClick={() => { setTab('upload'); setInputError('') }}><Upload size={15} />Upload Contract</button>
            <button type="button" role="tab" aria-selected={tab === 'paste'} className={tab === 'paste' ? 'source-tab source-tab--active' : 'source-tab'} onClick={() => { setTab('paste'); setInputError('') }}><FileCode2 size={15} />Paste Solidity</button>
          </div>
          {tab === 'upload' ? <div className="upload-area-wrap">
            {!file ? <button type="button" className={`upload-dropzone${dragging ? ' upload-dropzone--active' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]) }}><span className="upload-dropzone__icon"><FileUp size={20} /></span><strong>Drop a .sol file here or browse</strong><span>Solidity source only · up to 2 MB · read locally in this browser</span></button> : <div className="selected-file"><span className="selected-file__icon"><FileCode2 size={17} /></span><span className="selected-file__name"><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB · {lineCount} lines</small></span><button className="icon-button" type="button" aria-label="Remove selected file" onClick={() => { setFile(null); setFileText(''); if (fileInput.current) fileInput.current.value = '' }}><X size={16} /></button></div>}
            <input ref={fileInput} aria-label="Choose Solidity source file" className="sr-only" type="file" accept=".sol,text/plain" onChange={(event) => void loadFile(event.target.files?.[0])} />
            <p className="upload-support-note">Only a Solidity file is kept in the active browser session, never in persistent settings.</p>
          </div> : <div className="paste-editor-wrap">
            <div className="paste-toolbar"><span>Solidity source · line numbers on</span><div><button className="button button--secondary button--small" type="button" onClick={() => { setPastedSource(sourceService.getPasteSample()); setInputError('') }}><Sparkles size={13} />Load sample contract</button><button className="button button--ghost button--small" type="button" onClick={() => { setPastedSource(''); setInputError('') }}><RotateCcw size={13} />Clear</button></div></div>
            <Suspense fallback={<div className="editor-loading">Loading source editor…</div>}><MonacoEditor height={280} language="solidity" beforeMount={registerSolidityLanguage} value={pastedSource} theme={editorTheme} onChange={(value) => setPastedSource(value ?? '')} options={{ ariaLabel: 'Solidity source editor', lineNumbers: 'on', minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, wordWrap: 'off', tabSize: 4, padding: { top: 12, bottom: 12 } }} /></Suspense>
            <div className="editor-counts"><span>{lineCount} lines</span><span>{pastedSource.length.toLocaleString()} characters</span></div>
          </div>}
          {inputError && <p className="field-error" role="alert"><AlertCircle size={14} />{inputError}</p>}
          <p className="demo-disclaimer-inline">Demo mode only. This action does not send or analyze source code.</p>
        </section>

        <section className="panel" aria-labelledby="options-title">
          <div className="section-heading"><div><p className="eyebrow">STEP 2 · OPTIONS</p><h2 id="options-title">Analysis options</h2></div><span className="muted-cell">Demo configuration</span></div>
          <div className="option-list">{optionDetails.map((option) => <label className="option-row" key={option.key}><input type="checkbox" checked={options[option.key]} onChange={(event) => { setOptions((current) => ({ ...current, [option.key]: event.target.checked })); setInputError('') }} /><span className="option-row__copy"><strong>{option.label}</strong><small>{option.description}</small></span><span className="option-row__check"><Check size={13} /></span></label>)}</div>
          <button className="advanced-toggle" type="button" aria-expanded={expandedAdvanced} onClick={() => setExpandedAdvanced((value) => !value)}>Advanced settings <ChevronDown size={15} className={expandedAdvanced ? 'rotate-icon' : ''} /></button>
          {expandedAdvanced && <div className="advanced-fields">
            <label className="form-field"><span>Solidity compiler version</span><select {...register('compilerVersion')}>{compilerVersions.map((version) => <option key={version} value={version}>{version}</option>)}</select><small>Curated demo compiler versions</small>{errors.compilerVersion && <small className="field-error-text">{errors.compilerVersion.message}</small>}</label>
            <label className="form-field"><span>Contract name <small>(optional)</small></span><input type="text" maxLength={60} placeholder="Inferred from source when blank" {...register('contractName')} />{errors.contractName && <small className="field-error-text">{errors.contractName.message}</small>}</label>
            <label className="form-field form-field--wide"><span>Notes <small>(optional)</small></span><textarea rows={3} maxLength={500} placeholder="Add context to this local demo record" {...register('notes')} />{errors.notes && <small className="field-error-text">{errors.notes.message}</small>}</label>
          </div>}
        </section>
      </div>

      <aside className="panel new-scan-summary" aria-labelledby="summary-title">
        <p className="eyebrow">STEP 3 · REVIEW</p><h2 id="summary-title">Demo record summary</h2>
        <dl className="summary-list"><div><dt>Input type</dt><dd>{tab === 'upload' ? 'Solidity file' : 'Pasted Solidity'}</dd></div><div><dt>Source</dt><dd>{tab === 'upload' ? file?.name ?? 'No file selected' : `${pastedSource.trim() ? pastedSource.trim().split(/\r?\n/).length + ' lines' : 'No source pasted'}`}</dd></div><div><dt>Contract name</dt><dd>{name.trim() || 'Inferred from source'}</dd></div><div><dt>Compiler</dt><dd>{compilerVersion}</dd></div><div><dt>Enabled options</dt><dd>{Object.values(options).filter(Boolean).length} of 3</dd></div><div><dt>Validation</dt><dd className={inputError ? 'summary-state summary-state--error' : 'summary-state'}>{inputError ? 'Needs attention' : source.trim() ? 'Source present' : 'Waiting for source'}</dd></div></dl>
        <div className="summary-option-chips">{optionDetails.map((option) => <span className={options[option.key] ? 'summary-option-chip summary-option-chip--enabled' : 'summary-option-chip'} key={option.key}>{options[option.key] && <Check size={12} />}{option.label}</span>)}</div>
        <div className="summary-disclosure"><AlertCircle size={15} /><span>Creating a record will not start a scan. No real analysis or exploit execution occurs.</span></div>
        <button className="button button--primary button--full" type="submit" disabled={isSubmitting || queuedPreview}>{queuedPreview ? 'Queued (demo)' : 'Create Demo Record'}</button>
        <small className="button-note">Your local record appears in scan history and details.</small>
      </aside>
    </form>
    <AnimatePresence>{queuedPreview && <motion.div className="queue-preview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.22 }} role="status" aria-live="polite"><span className="queue-preview__chips"><i /><i /><i /></span><span><strong>Queued (demo)</strong><small>Record created locally · no analysis running</small></span></motion.div>}</AnimatePresence>
  </div>
}
