import { ShieldAlert } from 'lucide-react'
import type { VerificationResult, VerificationStatus } from '../../types/domain'
import { VerificationStatusBadge } from './VerificationStatusBadge'

type VerificationPanelProps = {
  status: VerificationStatus
  title?: string
  summary: string
  evidence?: string
  details?: VerificationResult
}

export function VerificationPanel({ status, title = 'Finding verification', summary, evidence, details }: VerificationPanelProps) {
  return (
    <section className="verification-panel" aria-labelledby="verification-panel-title">
      <div className="verification-panel__banner"><ShieldAlert size={15} aria-hidden="true" /><span>DEMO DATA — NO EXPLOIT EXECUTED</span></div>
      <div className="verification-panel__heading"><h2 id="verification-panel-title">{title}</h2><VerificationStatusBadge status={status} /></div>
      <p>{summary}</p>
      {details && <dl className="verification-details"><div><dt>Preconditions</dt><dd>{details.preconditions}</dd></div><div><dt>Test scenario</dt><dd>{details.testScenario}</dd></div><div><dt>Expected behavior</dt><dd>{details.expectedBehavior}</dd></div><div><dt>Observed behavior</dt><dd>{details.observedBehavior}</dd></div><div><dt>State changes</dt><dd>{details.stateChanges}</dd></div><div><dt>Execution environment</dt><dd>{details.executionEnvironment}</dd></div></dl>}
      {evidence && <div className="verification-panel__evidence"><span>Evidence</span><p>{evidence}</p></div>}
      <p className="verification-panel__note">This status describes the demo record only and does not indicate that a live exploit or verification ran.</p>
    </section>
  )
}
