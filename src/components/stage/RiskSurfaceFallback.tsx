import { type KeyboardEvent } from 'react'
import type { Finding, Severity } from '../../types/domain'
import type { RiskSurfaceSceneProps } from './RiskSurfaceScene'
import './risk-surface.css'

const severityRank: Record<Severity, number> = { critical: 5, high: 4, medium: 3, low: 2, informational: 1 }
const severityColor: Record<Severity, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6', informational: '#64748b',
}

export function RiskFindingList({ findings, selectedFindingId, onSelectFinding }: RiskSurfaceSceneProps) {
  const selectAt = (index: number) => {
    if (findings[index]) onSelectFinding(findings[index])
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? Math.min(findings.length - 1, index + 1)
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? Math.max(0, index - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? findings.length - 1 : null
    if (next !== null) {
      event.preventDefault()
      selectAt(next)
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="option"]')[next]?.focus()
    }
  }
  return <div className="risk-surface__list" role="listbox" aria-label="Findings by severity. Use arrow keys to select a finding.">
    {findings.map((finding, index) => <button key={finding.id} type="button" role="option" aria-selected={finding.id === selectedFindingId} tabIndex={finding.id === selectedFindingId || (!selectedFindingId && index === 0) ? 0 : -1} className="risk-surface__option" onClick={() => onSelectFinding(finding)} onKeyDown={(event) => handleKeyDown(event, index)}>
      <span className="risk-surface__swatch" style={{ backgroundColor: severityColor[finding.severity] }} />
      <span className="risk-surface__option-text"><strong>{finding.title}</strong><small>{finding.severity} · {finding.evidence[0]?.file ?? 'Source unavailable'}{finding.evidence[0] ? `:${finding.evidence[0].startLine}` : ''}</small></span>
      <span className="risk-surface__rank" aria-label={`${severityRank[finding.severity]} of 5 severity rank`}>{severityRank[finding.severity]}/5</span>
    </button>)}
  </div>
}

export function RiskSurfaceFallback({ findings, selectedFindingId, onSelectFinding }: RiskSurfaceSceneProps) {
  const maxRank = 5
  return <div className="risk-surface risk-surface--fallback">
    <div className="risk-surface__bars" role="group" aria-label={`Severity bars for ${findings.length} illustrative findings`}>
      {findings.map((finding: Finding) => <button key={finding.id} type="button" className={`risk-surface__bar${selectedFindingId === finding.id ? ' is-selected' : ''}`} aria-pressed={selectedFindingId === finding.id} onClick={() => onSelectFinding(finding)}>
        <span className="risk-surface__bar-track"><span style={{ height: `${severityRank[finding.severity] / maxRank * 100}%`, backgroundColor: severityColor[finding.severity] }} /></span>
        <span className="risk-surface__bar-label">{finding.severity}</span>
        <span className="sr-only">{finding.title}, {finding.severity}, {finding.evidence[0]?.file ?? 'source unavailable'}{finding.evidence[0] ? `:${finding.evidence[0].startLine}` : ''}</span>
      </button>)}
    </div>
    <RiskFindingList findings={findings} selectedFindingId={selectedFindingId} onSelectFinding={onSelectFinding} />
    <p className="risk-surface__note">Illustrative severity profile · demo data only</p>
  </div>
}
