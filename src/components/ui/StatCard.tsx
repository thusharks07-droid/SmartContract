import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAppReducedMotion } from '../../state/useAppReducedMotion'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

type StatCardProps = {
  label: string
  value: ReactNode
  detail?: string
  change?: { value: string; direction: 'up' | 'down' | 'flat'; label: string }
  icon?: ReactNode
}

export function StatCard({ label, value, detail, change, icon }: StatCardProps) {
  const reduceMotion = useAppReducedMotion()
  const [count, setCount] = useState(0)
  const currentCount = useRef(0)
  const ChangeIcon = change?.direction === 'up' ? ArrowUpRight : change?.direction === 'down' ? ArrowDownRight : Minus

  useEffect(() => {
    if (typeof value !== 'number' || reduceMotion) return
    let frame = 0
    const start = performance.now()
    const from = currentCount.current
    const distance = value - from
    const duration = 520
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextCount = Math.round(from + distance * eased)
      currentCount.current = nextCount
      setCount(nextCount)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [reduceMotion, value])

  return (
    <article className="stat-card">
      <div className="stat-card__top"><span>{label}</span>{icon && <span className="stat-card__icon" aria-hidden="true">{icon}</span>}</div>
      <div className="stat-card__value" aria-label={`${label}: ${value}`}>{typeof value === 'number' && !reduceMotion ? count : value}</div>
      {(detail || change) && (
        <div className="stat-card__footer">
          {change && <span className={`stat-card__change stat-card__change--${change.direction}`}><ChangeIcon size={13} aria-hidden="true" />{change.value}<span className="sr-only">{change.label}</span></span>}
          {detail && <span>{detail}</span>}
        </div>
      )}
    </article>
  )
}
