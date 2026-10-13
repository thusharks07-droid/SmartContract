import { Search, X } from 'lucide-react'

type SearchInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  className?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search', className = '' }: SearchInputProps) {
  return (
    <label className={`search-input ${className}`.trim()}>
      <Search size={16} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value && <button className="search-input__clear" type="button" onClick={() => onChange('')} aria-label="Clear search"><X size={14} /></button>}
    </label>
  )
}
