import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'

export type DataColumn<T> = {
  id: string
  header: string
  cell: (row: T) => ReactNode
  sortValue?: (row: T) => string | number | null
  align?: 'start' | 'end'
}

type DataTableProps<T> = {
  columns: DataColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  totalRows?: number
  searchQuery?: string
  emptyTitle?: string
  emptyDescription?: string
  noResultsTitle?: string
  noResultsDescription?: string
  rowClassName?: (row: T) => string | undefined
}

function compareValues(first: string | number | null, second: string | number | null) {
  if (first === second) return 0
  if (first === null) return 1
  if (second === null) return -1
  if (typeof first === 'number' && typeof second === 'number') return first - second
  return String(first).localeCompare(String(second), undefined, { numeric: true, sensitivity: 'base' })
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  totalRows,
  searchQuery = '',
  emptyTitle = 'No records yet',
  emptyDescription = 'Records will appear here when they are available.',
  noResultsTitle = 'No matching records',
  noResultsDescription = 'Try changing your search or filters.',
  rowClassName,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>(null)
  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((candidate) => candidate.id === sort.columnId)
    if (!column?.sortValue) return rows
    const factor = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((first, second) => factor * compareValues(column.sortValue?.(first) ?? null, column.sortValue?.(second) ?? null))
  }, [columns, rows, sort])

  const changeSort = (columnId: string) => {
    setSort((current) => current?.columnId === columnId
      ? { columnId, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { columnId, direction: 'asc' })
  }

  if (loading) return <LoadingState label="Loading table rows" />
  if (error) return <ErrorState description={error} onRetry={onRetry} />
  if (rows.length === 0) {
    const filtered = (totalRows ?? 0) > 0 || searchQuery.trim().length > 0
    return <EmptyState title={filtered ? noResultsTitle : emptyTitle} description={filtered ? noResultsDescription : emptyDescription} />
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead><tr>{columns.map((column) => {
          const active = sort?.columnId === column.id
          const SortIcon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown
          return (
            <th key={column.id} scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined} className={column.align === 'end' ? 'text-end' : undefined}>
              {column.sortValue ? (
                <button className="data-table__sort" type="button" onClick={() => changeSort(column.id)} aria-label={`Sort by ${column.header}${active ? `, currently ${sort.direction}ending` : ''}`}>
                  {column.header}<SortIcon size={13} aria-hidden="true" />
                </button>
              ) : column.header}
            </th>
          )
        })}</tr></thead>
        <tbody>{sortedRows.map((row) => <tr className={rowClassName?.(row)} key={rowKey(row)}>{columns.map((column) => <td key={column.id} className={column.align === 'end' ? 'text-end' : undefined}>{column.cell(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
