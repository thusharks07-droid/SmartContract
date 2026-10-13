import { CircleAlert, CircleCheck, CircleDashed, CircleHelp, Clock3, XCircle } from 'lucide-react'
import type { VerificationStatus } from '../../types/domain'

const statusMeta: Record<VerificationStatus, { label: string; icon: typeof CircleAlert; tone: string }> = {
  not_run: { label: 'Not run', icon: CircleDashed, tone: 'neutral' },
  pending: { label: 'Pending', icon: Clock3, tone: 'warning' },
  verified: { label: 'Verified', icon: CircleCheck, tone: 'success' },
  not_reproduced: { label: 'Not reproduced', icon: XCircle, tone: 'info' },
  inconclusive: { label: 'Inconclusive', icon: CircleHelp, tone: 'warning' },
  error: { label: 'Error', icon: CircleAlert, tone: 'critical' },
}

export function VerificationStatusBadge({ status }: { status: VerificationStatus }) {
  const { label, icon: Icon, tone } = statusMeta[status]
  return <span className={`badge state-badge badge--${tone}`}><Icon size={12} aria-hidden="true" /><span>{label}</span></span>
}
