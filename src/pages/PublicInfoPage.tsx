import { Link, useLocation } from 'react-router-dom'

export function PublicInfoPage() {
  const { pathname } = useLocation()
  const isPrivacy = pathname === '/privacy'
  return (
    <main className="public-entry public-entry--info">
      <header className="public-entry__header"><Link className="public-entry__brand" to="/">Contract<span>IQ</span></Link><Link className="button button--secondary" to="/login">Enter Demo</Link></header>
      <article className="public-info">
        <p className="eyebrow">DEMO NOTICE</p>
        <h1>{isPrivacy ? 'Privacy in this demo' : 'Terms for this demo'}</h1>
        {isPrivacy ? <><p>Continue as Demo uses deterministic sample records and stores only non-sensitive display preferences and a tab-scoped demo session marker in browser storage. Source text submitted in the demo stays in this browser and is not uploaded.</p><p>The optional account form sends email and password directly to Supabase Auth when configured. ContractIQ does not store passwords. In account mode, submitted Solidity source is sent to the configured local scanner API and stored in the signed-in user's scan record; the browser does not receive a service-role credential. Account and demo records remain separate.</p></> : <p>ContractIQ's Continue as Demo workspace uses illustrative mock findings and reports. Signed-in account mode can submit one Solidity file without imports to the configured local Slither worker. Results are static-analysis output, require independent validation, and do not guarantee detection of all vulnerabilities. A zero-finding result does not establish that a contract is safe.</p>}
        <Link className="text-link" to="/">Return to ContractIQ</Link>
      </article>
    </main>
  )
}
