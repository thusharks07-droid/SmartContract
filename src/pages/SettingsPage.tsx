import { useEffect, useState } from 'react'
import { Check, Monitor, Moon, Save, Sun } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
import { useTheme } from '../state/useTheme'
import { useToast } from '../state/useToast'
import { settingsService } from '../services/settingsService'
import type { AppSettings } from '../services/settingsService'
import { useAppReducedMotion } from '../state/useAppReducedMotion'
import { useWorkspaceMode } from '../state/useWorkspaceMode'
import { localScanApi } from '../services/localScanApi'
import type { AiProviderStatus } from '../services/localScanApi'

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'analysis', label: 'Analysis Preferences' },
  { id: 'ai', label: 'AI Explanations' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'about', label: 'About' },
] as const
type SettingsTab = (typeof tabs)[number]['id']
const compilerVersions = ['0.8.24', '0.8.23', '0.8.22', '0.8.19']

function applyMotionSettings(settings: AppSettings) {
  document.documentElement.dataset.fidelity = settings.visualFidelity
}

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('general')
  const [settings, setSettings] = useState<AppSettings>(() => settingsService.get())
  const [saved, setSaved] = useState(false)
  const [aiStatusState, setAiStatusState] = useState<{ token: string; status: AiProviderStatus } | null>(null)
  const [aiStatusFailure, setAiStatusFailure] = useState<{ token: string; message: string } | null>(null)
  const { setTheme } = useTheme()
  const reduceMotion = useAppReducedMotion()
  const { mode, accessToken } = useWorkspaceMode()
  const { settingsSaved } = useToast()
  useEffect(() => applyMotionSettings(settingsService.get()), [])
  useEffect(() => {
    if (tab !== 'ai' || mode !== 'account' || !accessToken) return
    let active = true
    void localScanApi.getAiStatus(accessToken).then((status) => {
      if (active) setAiStatusState({ token: accessToken, status })
    }).catch((error: unknown) => {
      if (active) setAiStatusFailure({ token: accessToken, message: error instanceof Error ? error.message : 'AI provider status is unavailable.' })
    })
    return () => { active = false }
  }, [accessToken, mode, tab])
  const aiStatus = aiStatusState?.token === accessToken ? aiStatusState.status : null
  const aiStatusError = aiStatusFailure?.token === accessToken ? aiStatusFailure.message : ''
  const aiStatusLoading = tab === 'ai' && mode === 'account' && Boolean(accessToken) && !aiStatus && !aiStatusError
  const update = (next: Partial<AppSettings>) => {
    const updated = (current: AppSettings) => ({
      ...current,
      ...next,
      motionExplicit: Object.prototype.hasOwnProperty.call(next, 'motion') ? true : current.motionExplicit,
      defaultOptions: { ...current.defaultOptions, ...next.defaultOptions },
      reportDisplay: { ...current.reportDisplay, ...next.reportDisplay },
    })
    setSettings(updated)
    if (next.visualFidelity || next.motion || next.motionExplicit !== undefined) {
      const value = updated(settingsService.get())
      settingsService.set({
        ...(next.visualFidelity ? { visualFidelity: next.visualFidelity } : {}),
        ...(next.motion ? { motion: next.motion, motionExplicit: true } : {}),
        ...(next.motionExplicit === false ? { motionExplicit: false } : {}),
      })
      document.documentElement.dataset.fidelity = value.visualFidelity
    }
    if (next.theme) setTheme(next.theme)
    setSaved(false)
  }
  const save = () => {
    const value = settingsService.set(settings)
    setTheme(value.theme)
    applyMotionSettings(value)
    setSaved(true)
    settingsSaved()
  }

  return <div className="page-stack">
    <PageHeader title="Settings" eyebrow="WORKSPACE PREFERENCES" description="Preferences are stored locally in browser settings. Source code and secrets are never saved here." actions={<button className="button button--primary" type="button" onClick={save}>{saved ? <Check size={15} /> : <Save size={15} />}{saved ? 'Saved' : 'Save Settings'}</button>} />
    <div className="settings-layout">
      <nav className="settings-tabs" aria-label="Settings sections" role="tablist" aria-orientation="vertical">{tabs.map((item) => <button type="button" key={item.id} role="tab" id={`settings-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`settings-panel-${item.id}`} className={tab === item.id ? 'settings-tab settings-tab--active' : 'settings-tab'} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
      <section className="panel settings-panel" role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`}>
        {tab === 'general' && <div className="settings-section"><p className="eyebrow">WORKSPACE</p><h2>General</h2><label className="form-field"><span>Workspace name</span><input type="text" maxLength={60} value={settings.workspaceName} onChange={(event) => update({ workspaceName: event.target.value })} /><small>This label is shown in the application header.</small></label><label className="form-field"><span>Default view</span><select value={settings.defaultView} onChange={(event) => update({ defaultView: event.target.value as AppSettings['defaultView'] })}><option value="dashboard">Security Overview</option><option value="history">Scan History</option></select><small>Used when opening the workspace root route.</small></label><div className="settings-info-note">Browser-local preferences only. Contract source is held in active session memory and is never persisted by this settings form.</div></div>}
        {tab === 'analysis' && <div className="settings-section"><p className="eyebrow">NEW DEMO RECORD DEFAULTS</p><h2>Analysis Preferences</h2>{mode === 'account' && <p className="subtle-copy">These local preferences apply only to demo records. Account scans use the selected pinned compiler and fixed worker analysis.</p>}<fieldset className="settings-fieldset"><legend>Default options</legend>{([['reentrancy', 'Reentrancy'], ['accessControl', 'Access Control'], ['staticAnalysis', 'Static']] as const).map(([key, label]) => <label className="settings-checkbox" key={key}><input type="checkbox" checked={settings.defaultOptions[key]} onChange={(event) => update({ defaultOptions: { ...settings.defaultOptions, [key]: event.target.checked } })} /><span>{label}</span></label>)}</fieldset><label className="form-field"><span>Default Solidity version</span><select value={settings.defaultCompilerVersion} onChange={(event) => update({ defaultCompilerVersion: event.target.value })}>{compilerVersions.map((version) => <option key={version}>{version}</option>)}</select></label><fieldset className="settings-fieldset"><legend>Report display preferences</legend><label className="settings-checkbox"><input type="checkbox" checked={settings.reportDisplay.showVerification} onChange={(event) => update({ reportDisplay: { ...settings.reportDisplay, showVerification: event.target.checked } })} /><span>Show verification results section</span></label><label className="settings-checkbox"><input type="checkbox" checked={settings.reportDisplay.showRemediations} onChange={(event) => update({ reportDisplay: { ...settings.reportDisplay, showRemediations: event.target.checked } })} /><span>Show recommended remediations section</span></label></fieldset></div>}
        {tab === 'ai' && <div className="settings-section"><p className="eyebrow">ACCOUNT FINDINGS ONLY</p><h2>AI explanations</h2>{mode !== 'account' ? <p className="settings-info-note">AI explanations are available only for saved account scans. Demo findings never send source code to an AI provider.</p> : <><label className="form-field"><span>Explanation provider</span><select value={settings.aiProvider} onChange={(event) => update({ aiProvider: event.target.value as AppSettings['aiProvider'] })}><option value="automatic">Automatic · Groq, then Gemini fallback</option><option value="groq">Groq only</option><option value="gemini">Gemini only</option><option value="disabled">Disabled</option></select><small>This preference is saved in this browser. Provider keys stay on the backend.</small></label><div className="settings-info-note" role={aiStatusError ? 'alert' : 'status'}>{aiStatusLoading ? 'Checking server-side provider configuration…' : aiStatusError || (aiStatus ? `Backend keys configured: Groq ${aiStatus.providers.groq ? 'ready' : 'not configured'} · Gemini ${aiStatus.providers.gemini ? 'ready' : 'not configured'}. Automatic mode uses ${aiStatus.primaryProvider} first and ${aiStatus.fallbackProvider} only for transient availability failures.` : 'Provider readiness is not available yet.')}</div><p className="subtle-copy">When requested, smartBOB sends the finding’s detector metadata, evidence, and a limited source excerpt to the selected provider for an AI-generated explanation. Scanner findings remain unchanged and are shown separately. AI output is not a verified fix or a security guarantee.</p></>}</div>}
        {tab === 'appearance' && <div className="settings-section"><p className="eyebrow">INTERFACE</p><h2>Appearance</h2><fieldset className="settings-fieldset"><legend>Theme</legend><div className="settings-choice-grid">{([{ value: 'dark', label: 'Dark', icon: Moon }, { value: 'light', label: 'Light', icon: Sun }, { value: 'system', label: 'System', icon: Monitor }] as const).map(({ value, label, icon: Icon }) => <button className={settings.theme === value ? 'choice-card choice-card--active' : 'choice-card'} type="button" aria-pressed={settings.theme === value} key={value} onClick={() => update({ theme: value })}><Icon size={17} /><span>{label}</span>{settings.theme === value && <Check size={14} />}</button>)}</div></fieldset><fieldset className="settings-fieldset"><legend>Visual fidelity</legend><p className="subtle-copy">Controls optional interface detail. Does not change the underlying demo records.</p><div className="settings-choice-grid">{(['enhanced', 'standard', 'minimal'] as const).map((value) => <button className={settings.visualFidelity === value ? 'choice-card choice-card--active' : 'choice-card'} type="button" aria-pressed={settings.visualFidelity === value} key={value} onClick={() => update({ visualFidelity: value })}><span>{value[0]?.toUpperCase()}{value.slice(1)}</span>{settings.visualFidelity === value && <Check size={14} />}</button>)}</div></fieldset><fieldset className="settings-fieldset"><legend>Motion</legend><p className="subtle-copy">System follows your operating-system motion preference. Full and Reduced save an explicit override.</p><div className="settings-choice-grid">{([{ value: 'system', label: 'System', selected: !settings.motionExplicit }, { value: 'full', label: 'Full', selected: settings.motionExplicit && !reduceMotion }, { value: 'reduced', label: 'Reduced', selected: settings.motionExplicit && reduceMotion }] as const).map(({ value, label, selected }) => <button className={selected ? 'choice-card choice-card--active' : 'choice-card'} type="button" aria-pressed={selected} key={value} onClick={() => value === 'system' ? update({ motionExplicit: false }) : update({ motion: value })}><span>{label}</span>{selected && <Check size={14} />}</button>)}</div></fieldset></div>}
        {tab === 'about' && <div className="settings-section"><p className="eyebrow">PRODUCT INFORMATION</p><h2>About smartBOB</h2><dl className="about-list"><div><dt>Description</dt><dd>Smart-contract security product prototype with a clearly separated illustrative demo workspace.</dd></div><div><dt>UI version</dt><dd>Phase 1 · 0.1.0</dd></div><div><dt>Workspace mode</dt><dd><span className="local-only-badge">{mode === 'account' ? 'Account · local static analysis' : 'Demo mode · illustrative data'}</span></dd></div><div><dt>Data behavior</dt><dd>{mode === 'account' ? 'Account records and scan outcomes are loaded through the authenticated local API. Demo records are not mixed with account records.' : 'Seeded records are deterministic. User-created demo records live in active browser memory and are separate from account records.'}</dd></div><div><dt>Integrations</dt><dd>{mode === 'account' ? 'Supabase Auth verifies account identity; the local Docker worker runs Slither static analysis. Analysis does not guarantee detection of all vulnerabilities.' : 'Supabase Auth is available for account mode. The demo workspace uses mock data and does not run analysis.'}</dd></div></dl></div>}
      </section>
    </div>
  </div>
}
