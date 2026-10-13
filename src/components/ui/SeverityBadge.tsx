import { CircleAlert, CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react'
import type { Severity } from '../../types/domain'

const severityMeta: Record<Severity, { label: string; icon: typeof CircleAlert }> = {
  critical: { label: 'Critical', icon: OctagonAlert },
  high: { label: 'High', icon: TriangleAlert },
  medium: { label: 'Medium', icon: CircleAlert },
  low: { label: 'Low', icon: CircleCheck },
  informational: { label: 'Informational', icon: Info },
}

type SeverityBadgeProps = { severity: Severity; className?: string }

export function SeverityBadge({ severity, className = '' }: SeverityBadgeProps) {
  const { label, icon: Icon } = severityMeta[severity]
  return (
    <span className={`badge severity-badge severity-badge--${severity} ${className}`.trim()}>
      <Icon size={12} strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
