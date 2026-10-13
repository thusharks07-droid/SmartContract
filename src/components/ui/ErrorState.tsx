import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

type ErrorStateProps = { title?: string; description: string; onRetry?: () => void; retryLabel?: string; action?: ReactNode }

export function ErrorState({ title = 'Something went wrong', description, onRetry, retryLabel = 'Try again', action }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <TriangleAlert size={20} aria-hidden="true" />
      <div><h3>{title}</h3><p>{description}</p>{onRetry && <button className="text-button" type="button" onClick={onRetry}>{retryLabel}</button>}{action}</div>
    </div>
  )
}
