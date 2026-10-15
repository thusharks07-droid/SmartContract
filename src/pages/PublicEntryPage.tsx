import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowDown, ArrowRight, Check, ChevronDown, Code2, FileText, GitBranch, Menu, Network, Shield, ShieldAlert, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { dashboardService, historyService } from '../services/aggregateService'
import { severities } from '../types/domain'
import type { Severity } from '../types/domain'
import './public-entry.css'

const sections = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Security', href: '#capabilities' },
]

const severityLabels: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Info',
}

const featureCards = [
  { icon: ShieldAlert, title: 'Detect potential vulnerabilities', body: 'Run supported static-analysis detectors in an isolated Slither worker. Coverage depends on the analyzer and submitted source.' },
  { icon: Code2, title: 'Understand the evidence', body: 'Trace returned findings to source locations, excerpts, and analyzer evidence for a closer review.' },
  { icon: Network, title: 'Fix with confidence', body: 'Review remediation suggestions alongside the finding and validate any change independently.' },
  { icon: FileText, title: 'Track every scan', body: 'Keep account-owned scan history and review persisted findings in a clear, printable report.' },
]

const steps = [
  { number: '01', title: 'Submit Solidity source', body: 'Sign in, choose a supported compiler, and submit source to the authenticated scanner API.' },
  { number: '02', title: 'Follow the real scan status', body: 'The queue runs the isolated static analyzer. smartBOB reports only states and findings returned by the backend.' },
  { number: '03', title: 'Review evidence and guidance', body: 'Inspect affected lines, analyzer evidence, and remediation suggestions, then verify changes independently.' },
]

const faqs = [
  { question: 'Does the interactive demo run a real smart-contract scan?', answer: 'No. Continue as Demo uses deterministic illustrative records. A signed-in account can submit a single Solidity file to the configured local Slither worker. Static analysis does not guarantee detection of all vulnerabilities.' },
  { question: 'Is sign-in connected to a real account?', answer: 'The account form uses Supabase Auth when configured. Continue as Demo remains a separate tab-scoped browser session and sends no credentials. Account scans use a local authenticated API and do not mix with demo records.' },
  { question: 'Is demo data persistent?', answer: 'Seeded sample data is deterministic. Records you create and source you enter remain in browser memory and reset on refresh. The demo sign-in marker lasts for the current tab; display preferences are stored separately in browser storage.' },
  { question: 'Can I print a report?', answer: 'Yes. The app report view uses the browser print dialog and is labeled as demo output. The demo does not claim to export a file unless your browser creates one.' },
  { question: 'Does the experience work without 3D?', answer: 'Yes. 3D is optional. Essential findings and workflows have 2D alternatives, and Minimal visual fidelity uses those alternatives.' },
]

function ProductPreview() {
  const totals = dashboardService.getTotals()
  const recentScans = historyService.list().slice(0, 3)
  const maxCount = Math.max(1, ...severities.map((severity) => totals.findingsBySeverity[severity]))

  return (
    <figure className="landing-preview" aria-label="Static product preview showing deterministic demo dashboard data. This preview is illustrative and not interactive.">
      <div className="landing-preview__windowbar" aria-hidden="true">
        <span className="landing-preview__window-dots"><i /><i /><i /></span>
        <span className="landing-preview__window-label"><Shield size={12} /> smartBOB workspace</span>
        <span className="landing-preview__window-mode">DEMO</span>
      </div>
      <div className="landing-preview__body">
        <div className="landing-preview__heading"><div><span>OVERVIEW / SAMPLE DATA</span><strong>Security overview</strong></div><span className="landing-preview__avatar">DU</span></div>
        <div className="landing-preview__stats">
          <div><span>Demo records</span><strong>{totals.totalScans}</strong><small>seeded examples</small></div>
          <div><span>Illustrative findings</span><strong>{totals.totalFindings}</strong><small>sample dataset</small></div>
        </div>
        <div className="landing-preview__distribution">
          <div className="landing-preview__subhead"><strong>Vulnerability distribution</strong><span>DEMO DATA</span></div>
          <div className="landing-preview__severity-list">
            {severities.map((severity) => {
              const count = totals.findingsBySeverity[severity]
              return <div className="landing-preview__severity" key={severity}>
                <span><i className={`landing-preview__severity-dot landing-preview__severity-dot--${severity}`} />{severityLabels[severity]}</span>
                <span className="landing-preview__bar"><i className={`landing-preview__bar-fill landing-preview__bar-fill--${severity}`} style={{ width: `${count ? Math.max(8, count / maxCount * 100) : 0}%` }} /></span>
                <strong>{count}</strong>
              </div>
            })}
          </div>
        </div>
        <div className="landing-preview__recent">
          <div className="landing-preview__subhead"><strong>Recent demo records</strong><span>ILLUSTRATIVE</span></div>
          {recentScans.map((scan) => <div className="landing-preview__scan" key={scan.id}><span className="landing-preview__scan-icon"><Code2 size={13} /></span><span className="landing-preview__scan-copy"><strong>{scan.contractName}</strong><small>{scan.sourceLabel}</small></span><span className={`landing-preview__status landing-preview__status--${scan.status}`}>{scan.status}</span></div>)}
        </div>
      </div>
      <figcaption>Static interface preview · sample values from the demo services</figcaption>
    </figure>
  )
}

export function PublicEntryPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileNavRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    mobileNavRef.current?.querySelector<HTMLAnchorElement>('a')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <main className="landing">
      <a className="landing-skip-link" href="#main-content">Skip to content</a>
      <header className="landing-header">
        <div className="landing-container landing-header__inner">
          <Link className="landing-brand" to="/" aria-label="smartBOB home">
            <span className="landing-brand__mark"><img src="/smartbob-mark-orange.png" alt="" /></span>
            <span className="landing-brand__word"><span className="landing-brand__name">smart<span>BOB</span></span><small>Smart Contract Scanner</small></span>
          </Link>
          <nav className="landing-nav landing-nav--desktop" aria-label="Main navigation">
            {sections.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          </nav>
          <div className="landing-header__actions">
            <Link className="landing-signin" to="/login">Sign in</Link>
            <Link className="landing-button landing-button--primary landing-header__cta" to="/login">Start scanning <ArrowRight size={15} aria-hidden="true" /></Link>
            <button ref={menuButtonRef} className="landing-menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="landing-mobile-navigation" onClick={() => setMenuOpen((open) => !open)}>
              {menuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
            </button>
          </div>
          {menuOpen && <nav ref={mobileNavRef} className="landing-nav landing-nav--mobile" id="landing-mobile-navigation" aria-label="Mobile navigation">
            {sections.map((item) => <a key={item.href} href={item.href} onClick={closeMenu}>{item.label}</a>)}
            <Link to="/login" onClick={closeMenu}>Sign in</Link>
            <Link className="landing-nav__demo" to="/login?mode=demo" onClick={closeMenu}>Explore Demo <ArrowRight size={14} aria-hidden="true" /></Link>
          </nav>}
        </div>
      </header>

      <section className="landing-hero" id="main-content" aria-labelledby="landing-title">
        <div className="landing-container landing-hero__grid">
          <div className="landing-hero__copy">
            <p className="landing-eyebrow"><span />SMART CONTRACT SECURITY WORKSPACE</p>
            <h1 id="landing-title">Find the flaws before <em>they find you.</em></h1>
            <p className="landing-hero__description">Analyze Solidity contracts, trace potential vulnerabilities to the source, and review practical guidance before deployment.</p>
            <div className="landing-hero__actions">
              <Link className="landing-button landing-button--primary" to="/login">Start scanning <ArrowRight size={16} aria-hidden="true" /></Link>
              <Link className="landing-button landing-button--quiet" to="/login?mode=demo">Explore demo <ArrowDown size={15} aria-hidden="true" /></Link>
              {import.meta.env.DEV && <Link className="landing-button landing-button--quiet" to="/local-scan">Run a real local scan <ArrowRight size={15} aria-hidden="true" /></Link>}
            </div>
            <p className="landing-disclaimer"><Shield size={15} aria-hidden="true" /><span>Static analysis is a starting point for review, not a guarantee that every vulnerability will be found.</span></p>
          </div>
          <div className="landing-hero__visual"><ProductPreview /><div className="landing-hero__companion" aria-hidden="true"><img src="/smartbob-mark-orange.png" alt="" /><span>Review with smartBOB</span></div></div>
        </div>
        <div className="landing-hero__grid-glow" aria-hidden="true" />
      </section>

      <section className="landing-facts" aria-label="What the demo lets you explore">
        <div className="landing-container landing-facts__grid">
          <div className="landing-facts__intro"><span className="landing-facts__icon"><Activity size={17} aria-hidden="true" /></span><p>BUILT FOR REVIEW<br /><strong>Static analysis</strong></p></div>
          <div><Check size={15} aria-hidden="true" /><span>Isolated analysis worker</span></div>
          <div><Check size={15} aria-hidden="true" /><span>Evidence-linked findings</span></div>
          <div><Check size={15} aria-hidden="true" /><span>Account-owned history</span></div>
          <div><Check size={15} aria-hidden="true" /><span>Demo mode stays separate</span></div>
        </div>
      </section>

      <section className="landing-section landing-section--light" id="product" aria-labelledby="product-title">
        <div className="landing-container">
          <div className="landing-section__heading">
            <p className="landing-section__eyebrow">A CLEARER REVIEW WORKSPACE</p>
            <h2 id="product-title">Explore the details that matter.</h2>
            <p>Move from returned detector output to source evidence and remediation guidance in one focused workspace.</p>
          </div>
          <div className="landing-feature-grid">
            {featureCards.map(({ icon: Icon, title, body }, index) => <article className="landing-feature-card" key={title}>
              <span className="landing-feature-card__index">0{index + 1}</span>
              <span className="landing-feature-card__icon"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>)}
          </div>
          <div className="landing-preview-cta"><p><strong>See the workspace in context.</strong><span>The app preview uses deterministic sample records from the same demo services.</span></p><Link className="landing-text-link" to="/login?mode=demo">Explore the demo <ArrowRight size={15} aria-hidden="true" /></Link></div>
        </div>
      </section>

      <section className="landing-section landing-section--process" id="how-it-works" aria-labelledby="how-title">
        <div className="landing-container landing-process-layout">
          <div className="landing-section__heading landing-section__heading--left">
            <p className="landing-section__eyebrow">HOW IT WORKS</p>
            <h2 id="how-title">A clear path from source to review.</h2>
            <p>Account scans use the configured authenticated API and isolated analyzer. Use Demo Mode to explore the interface with clearly labeled sample records.</p>
            <p className="landing-process__note"><Shield size={15} aria-hidden="true" />Analysis is static; validate findings and suggested fixes before relying on them.</p>
          </div>
          <ol className="landing-steps">
            {steps.map((step) => <li key={step.number}><span className="landing-step__number">{step.number}</span><span className="landing-step__rule" /><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}
          </ol>
        </div>
      </section>

      <section className="landing-section landing-section--light landing-capabilities" id="capabilities" aria-labelledby="capabilities-title">
        <div className="landing-container">
          <div className="landing-section__heading">
            <p className="landing-section__eyebrow">CAPABILITIES</p>
            <h2 id="capabilities-title">Explore security review workflows.</h2>
            <p>Evidence stays visible, scan states come from the backend, and sample data remains clearly separated in Demo Mode.</p>
          </div>
          <div className="landing-capability-grid">
            <article><span><ShieldAlert size={18} /></span><h3>Severity-based triage</h3><p>Group findings by the severity returned from the analyzer.</p></article>
            <article><span><Code2 size={18} /></span><h3>Finding and source detail</h3><p>Inspect the affected lines, excerpt, and available evidence.</p></article>
            <article><span><GitBranch size={18} /></span><h3>Contract relationships</h3><p>Explore relationships in an optional graph with a 2D alternative.</p></article>
            <article><span><FileText size={18} /></span><h3>History and reports</h3><p>Review persisted account scans and print a legible report.</p></article>
            <article><span><Network size={18} /></span><h3>Secure by design</h3><p>Source is analyzed in a network-isolated, resource-limited worker.</p></article>
          </div>
          <p className="landing-capabilities__disclaimer">Static analysis can miss vulnerabilities and produce findings that need independent validation.</p>
        </div>
      </section>

      <section className="landing-section landing-section--faq" id="faq" aria-labelledby="faq-title">
        <div className="landing-container landing-faq-layout">
          <div className="landing-section__heading landing-section__heading--left"><p className="landing-section__eyebrow">FREQUENTLY ASKED QUESTIONS</p><h2 id="faq-title">Clear answers, by design.</h2><p>Know what this demo does—and what it does not do.</p></div>
          <div className="landing-faq-list">
            {faqs.map(({ question, answer }, index) => {
              const expanded = openFaq === index
              const answerId = `landing-faq-answer-${index}`
              return <article className={`landing-faq${expanded ? ' landing-faq--open' : ''}`} key={question}>
                <h3><button type="button" aria-expanded={expanded} aria-controls={answerId} onClick={() => setOpenFaq(expanded ? null : index)}>{question}<ChevronDown size={17} aria-hidden="true" /></button></h3>
                <div className="landing-faq__answer" id={answerId} hidden={!expanded}><p>{answer}</p></div>
              </article>
            })}
          </div>
        </div>
      </section>

      <section className="landing-final-cta" aria-labelledby="final-cta-title">
        <div className="landing-container landing-final-cta__inner">
          <div><p className="landing-section__eyebrow">SMART CONTRACT REVIEW</p><h2 id="final-cta-title">Make your next review clearer.</h2><p>Sign in to submit source to the configured scanner, or explore the separate demo experience.</p></div>
          <Link className="landing-button landing-button--primary" to="/login">Start scanning <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer__main">
            <Link className="landing-brand landing-brand--footer" to="/" aria-label="smartBOB home"><span className="landing-brand__mark"><img src="/smartbob-mark-orange.png" alt="" /></span><span className="landing-brand__word"><span className="landing-brand__name">smart<span>BOB</span></span><small>Smart Contract Scanner</small></span></Link>
            <p>Potential vulnerabilities, clearer evidence, and practical review workflows.</p>
            <nav aria-label="Footer navigation">{sections.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}<Link to="/login">Sign in</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href="https://github.com/thusharks07-droid/SmartContract" target="_blank" rel="noreferrer">Repository</a></nav>
          </div>
          <div className="landing-footer__bottom"><span>© {new Date().getFullYear()} smartBOB</span><span>STATIC ANALYSIS · HUMAN REVIEW REQUIRED</span></div>
        </div>
      </footer>
    </main>
  )
}
