import { Ban, CircleCheck, CircleDashed, CircleX, Clock3 } from 'lucide-react'
import type { ScanStatus } from '../../types/domain'

const statusMeta: Record<ScanStatus, { label: string; icon: typeof Clock3; tone: string }> = {
  draft: { label: 'Draft', icon: CircleDashed, tone: 'neutral' },
  queued: { label: 'Queued · demo', icon: Clock3, tone: 'info' },
  running: { label: 'Running · demo', icon: Clock3, tone: 'warning' },
  completed: { label: 'Completed · demo', icon: CircleCheck, tone: 'success' },
  failed: { label: 'Failed', icon: CircleX, tone: 'critical' },
  cancelled: { label: 'Cancelled', icon: Ban, tone: 'neutral' },
}

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  const { label, icon: Icon, tone } = statusMeta[status]
  return <span className={`badge state-badge badge--${tone}`}><Icon size={12} aria-hidden="true" /><span>{label}</span></span>
}
