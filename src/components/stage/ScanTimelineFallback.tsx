import { Link } from 'react-router-dom'
import type { Scan } from '../../types/domain'
import './scan-timeline.css'

export function ScanTimelineFallback({ scans }: { scans: Scan[] }) {
  const ordered = [...scans].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  return <ol className="scan-timeline-list" aria-label="Scans in chronological order">
    {ordered.map((scan) => <li key={scan.id}>
      <span className={`scan-timeline-list__marker scan-timeline-list__marker--${scan.status}`} aria-hidden="true" />
      <Link to={`/scans/${scan.id}`}><strong>{scan.contractName}</strong><span>{scan.status} · {new Date(scan.submittedAt).toLocaleString()}</span><code>{scan.id}</code></Link>
    </li>)}
    {!ordered.length && <li className="scan-timeline-list__empty">No scan records match the current search and filters.</li>}
  </ol>
}
