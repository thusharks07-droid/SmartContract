import type { FindingSummary } from '../../types/domain'
import type { KeyboardEvent } from 'react'
import { ArrowUpRight, MapPin } from 'lucide-react'
import { SeverityBadge } from './SeverityBadge'

type FindingCardProps = {
  finding: FindingSummary
  onSelect?: (finding: FindingSummary) => void
}

export function FindingCard({ finding, onSelect }: FindingCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect?.(finding)
    }
  }

  const content = <>
    <div className="finding-card__top"><SeverityBadge severity={finding.severity} /><span className="finding-card__id">{finding.id}</span></div>
    <h3>{finding.title}</h3>
    <p>{finding.summary}</p>
    <div className="finding-card__footer"><span><MapPin size={13} aria-hidden="true" />{finding.location}</span>{onSelect && <ArrowUpRight size={15} aria-hidden="true" />}</div>
  </>

  return <article className={`finding-card${onSelect ? ' finding-card--interactive' : ''}`} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} onClick={onSelect ? () => onSelect(finding) : undefined} onKeyDown={onSelect ? handleKeyDown : undefined} aria-label={onSelect ? `Open ${finding.title}, ${finding.severity} severity` : undefined}>
    {content}
  </article>
}
