type LoadingStateProps = { label?: string; rows?: number }

export function LoadingState({ label = 'Loading content', rows = 3 }: LoadingStateProps) {
  return (
    <div className="loading-state" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: Math.max(1, rows) }, (_, index) => <span key={index} className="loading-state__row" />)}
    </div>
  )
}
