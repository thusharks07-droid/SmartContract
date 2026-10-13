import type { PropsWithChildren, ReactNode } from 'react'
import { Printer } from 'lucide-react'

type ReportLayoutProps = PropsWithChildren<{
  title: string
  reportId: string
  generatedAt: string
  actions?: ReactNode
  cover?: ReactNode
}>

export function ReportLayout({ title, reportId, generatedAt, actions, cover, children }: ReportLayoutProps) {
  return (
    <article className="report-layout">
      <header className="report-layout__header">
        <div className="report-layout__brand"><span className="brand-mark" aria-hidden="true">CIQ</span><span>ContractIQ <small>DEMO REPORT</small></span></div>
        <button className="button button--secondary no-print" type="button" onClick={() => window.print()}><Printer size={15} aria-hidden="true" />Print report</button>
        {actions}
      </header>
      <div className="report-layout__meta"><span>{reportId}</span><span>Generated {generatedAt}</span></div>
      {cover}
      <h1 className="report-layout__title">{title}</h1>
      <div className="report-layout__demo-note">DEMO REPORT · Deterministic data · No real analysis was performed</div>
      <div className="report-layout__body">{children}</div>
    </article>
  )
}
