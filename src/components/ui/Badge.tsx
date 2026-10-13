import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'info' | 'warning' | 'critical' | 'success' | 'accent'

type BadgeProps = {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}

export function Badge({ children, tone = 'neutral', className = '' }: BadgeProps) {
  return (
    <span className={`badge badge--${tone} ${className}`.trim()}>
      {children}
    </span>
  )
}
