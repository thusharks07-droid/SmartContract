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
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'FAQ', href: '#faq' },
]

const severityLabels: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Info',
}

const featureCards = [
  { icon: ShieldAlert, title: 'Understand findings', body: 'Review illustrative severity, category, evidence, and potential impact in a structured finding view.' },
  { icon: Code2, title: 'Trace source context', body: 'Connect each demo finding to the relevant contract and source excerpt for closer inspection.' },
  { icon: Network, title: 'Explore relationships', body: 'Inspect illustrative contract and function relationships through an optional, accessible graph view.' },
  { icon: FileText, title: 'Review remediation', body: 'Compare suggested patterns and print a clearly labeled demo report for discussion.' },
]

const steps = [
  { number: '01', title: 'Choose a demo contract', body: 'Start with a seeded Solidity example or add local source to create a demo record in this browser.' },
  { number: '02', title: 'Explore illustrative findings', body: 'The public demo shows sample severity, source context, and relationships. Account scans use a separately configured local static-analysis worker.' },
  { number: '03', title: 'Review and share a demo report', body: 'Read remediation suggestions and use the browser print flow to create a demo report.' },
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
            <span className="landing-brand__mark"><img src="/smartbob-logo.jpg" alt="" /></span>
            <span className="landing-brand__word"><span className="landing-brand__name">smart<span>BOB</span></span><small>Smart Contract Scanner</small></span>
          </Link>
          <nav className="landing-nav landing-nav--desktop" aria-label="Main navigation">
            {sections.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          </nav>
          <div className="landing-header__actions">
            <Link className="landing-signin" to="/login">Sign in</Link>
            <Link className="landing-button landing-button--primary landing-header__cta" to="/login?mode=demo">Explore Demo <ArrowRight size={15} aria-hidden="true" /></Link>
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
            <h1 id="landing-title">See the risks in your smart contracts <em>before deployment.</em></h1>
            <p className="landing-hero__description">Explore a developer-focused workspace for reviewing vulnerability findings, understanding affected code, and examining remediation guidance.</p>
            <div className="landing-hero__actions">
              <Link className="landing-button landing-button--primary" to="/login?mode=demo">Explore Demo <ArrowRight size={16} aria-hidden="true" /></Link>
              <a className="landing-button landing-button--quiet" href="#how-it-works">See How It Works <ArrowDown size={15} aria-hidden="true" /></a>
            </div>
            <p className="landing-disclaimer"><Shield size={15} aria-hidden="true" /><span>Interactive demo — uses illustrative mock data. No real contract analysis is performed.</span></p>
          </div>
          <div className="landing-hero__visual"><ProductPreview /></div>
        </div>
        <div className="landing-hero__grid-glow" aria-hidden="true" />
      </section>

      <section className="landing-facts" aria-label="What the demo lets you explore">
        <div className="landing-container landing-facts__grid">
          <div className="landing-facts__intro"><span className="landing-facts__icon"><Activity size={17} aria-hidden="true" /></span><p>BUILT FOR REVIEW<br /><strong>Not a scanner</strong></p></div>
          <div><Check size={15} aria-hidden="true" /><span>Findings organized by severity</span></div>
          <div><Check size={15} aria-hidden="true" /><span>Source-level context</span></div>
          <div><Check size={15} aria-hidden="true" /><span>Remediation guidance</span></div>
          <div><Check size={15} aria-hidden="true" /><span>Clearly labeled demo data</span></div>
        </div>
      </section>

      <section className="landing-section landing-section--light" id="product" aria-labelledby="product-title">
        <div className="landing-container">
          <div className="landing-section__heading">
            <p className="landing-section__eyebrow">A CLEARER REVIEW WORKSPACE</p>
            <h2 id="product-title">Explore the details that matter.</h2>
            <p>smartBOB brings illustrative findings and their supporting context into one focused interface.</p>
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
            <h2 id="how-title">A practical path through the demo.</h2>
            <p>Move from sample source to a structured review. The current workflow is simulated entirely in your browser.</p>
            <p className="landing-process__note"><Shield size={15} aria-hidden="true" />No real scanner, backend, or exploit execution is involved.</p>
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
            <p>Use the demo to understand how a review workspace can connect findings, code, and communication.</p>
          </div>
          <div className="landing-capability-grid">
            <article><span><ShieldAlert size={18} /></span><h3>Severity-based triage</h3><p>Filter illustrative records by severity and inspect their categories.</p></article>
            <article><span><Code2 size={18} /></span><h3>Finding and source detail</h3><p>Review sample evidence alongside the relevant Solidity excerpt.</p></article>
            <article><span><GitBranch size={18} /></span><h3>Contract relationships</h3><p>Explore an illustrative call graph with an equivalent 2D view.</p></article>
            <article><span><FileText size={18} /></span><h3>History and reports</h3><p>Browse seeded records and inspect a printable demo report.</p></article>
            <article><span><Network size={18} /></span><h3>Display preferences</h3><p>Adjust appearance and explore accessible 2D fallbacks.</p></article>
          </div>
          <p className="landing-capabilities__disclaimer">These are product-demo capabilities, not claims of detection accuracy, prevention, or security assurance.</p>
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
          <div><p className="landing-section__eyebrow">SMARTBOB · FRONTEND DEMO</p><h2 id="final-cta-title">Explore the smartBOB demo.</h2><p>Review illustrative findings and workflows with sample data. No real contract analysis is performed.</p></div>
          <Link className="landing-button landing-button--primary" to="/login?mode=demo">Explore Demo <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer__main">
            <Link className="landing-brand landing-brand--footer" to="/" aria-label="smartBOB home"><span className="landing-brand__mark"><img src="/smartbob-logo.jpg" alt="" /></span><span className="landing-brand__word"><span className="landing-brand__name">smart<span>BOB</span></span><small>Smart Contract Scanner</small></span></Link>
            <p>Illustrative frontend demo. No real contract analysis is performed.</p>
            <nav aria-label="Footer navigation">{sections.slice(0, 3).map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}<Link to="/login">Sign in</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></nav>
          </div>
          <div className="landing-footer__bottom"><span>© {new Date().getFullYear()} smartBOB</span><span>DEMO MODE · MOCK DATA ONLY</span></div>
        </div>
      </footer>
    </main>
  )
}
