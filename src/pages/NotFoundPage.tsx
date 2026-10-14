import { ArrowLeft, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'

type NotFoundPageProps = { homePath?: string; homeLabel?: string; missingPath?: string }

export function NotFoundPage({ homePath = '/', homeLabel = 'Return to smartBOB', missingPath }: NotFoundPageProps) {
  return <div className="page-stack"><PageHeader title="Page not found" eyebrow="404 · DEMO WORKSPACE" description="That route does not match a smartBOB page." /><EmptyState title="Nothing at this address" description={missingPath ? `No page is registered at ${missingPath}.` : 'The page may have moved, or the URL may contain a typo.'} icon={<SearchX size={22} />} action={<Link className="button button--primary" to={homePath}><ArrowLeft size={14} />{homeLabel}</Link>} /></div>
}
