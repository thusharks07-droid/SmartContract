import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  description?: string
  eyebrow?: string
  actions?: ReactNode
  visual?: ReactNode
}

export function PageHeader({ title, description, eyebrow, actions, visual }: PageHeaderProps) {
  if (visual) {
    return (
      <header className="page-header page-header--visual">
        <div className="page-header__main">
          <div className="page-header__copy">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h1>{title}</h1>
            {description && <p className="page-header__description">{description}</p>}
          </div>
          {actions && <div className="page-header__actions">{actions}</div>}
        </div>
        <div className="page-header__visual">{visual}</div>
      </header>
    )
  }

  return (
    <header className="page-header">
      <div className="page-header__copy">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-header__description">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}
