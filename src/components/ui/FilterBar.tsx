import type { ReactNode } from 'react'

export type FilterOption = { value: string; label: string; count?: number }

type FilterBarProps = {
  label: string
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
  trailing?: ReactNode
}

export function FilterBar({ label, options, value, onChange, trailing }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filter-bar__options" role="group" aria-label={label}>
        {options.map((option) => (
          <button key={option.value} type="button" className={`filter-chip${value === option.value ? ' filter-chip--active' : ''}`} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
            {option.label}{option.count !== undefined && <span className="filter-chip__count">{option.count}</span>}
          </button>
        ))}
      </div>
      {trailing && <div className="filter-bar__trailing">{trailing}</div>}
    </div>
  )
}
