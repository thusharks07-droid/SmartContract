import { useEffect, useState } from 'react'
import { Menu, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../state/useTheme'
import { settingsService } from '../../services/settingsService'
import { Badge } from '../ui/Badge'
import { UserMenu } from './UserMenu'
import { useWorkspaceMode } from '../../state/useWorkspaceMode'

const themeLabels = { dark: 'Dark', light: 'Light', system: 'System' } as const

type TopbarProps = { title: string; mobileNavOpen: boolean; onOpenMobileNav: () => void }

export function Topbar({ title, mobileNavOpen, onOpenMobileNav }: TopbarProps) {
  const { theme, cycleTheme } = useTheme()
  const { mode } = useWorkspaceMode()
  const [workspaceName, setWorkspaceName] = useState(() => settingsService.get().workspaceName)
  useEffect(() => {
    const update = (event: Event) => setWorkspaceName((event as CustomEvent<{ workspaceName: string }>).detail.workspaceName)
    window.addEventListener('contractiq:settings-updated', update)
    return () => window.removeEventListener('contractiq:settings-updated', update)
  }, [])
  const ThemeIcon = theme === 'light' ? Sun : theme === 'system' ? Monitor : Moon
  const nextTheme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system'

  return (
    <header className="topbar">
      <button className="icon-button topbar__mobile-menu" type="button" onClick={onOpenMobileNav} aria-label="Open navigation menu" aria-expanded={mobileNavOpen} aria-controls="app-navigation"><Menu size={19} aria-hidden="true" /></button>
      <div className="topbar__context" aria-label={`Current page: ${title}`}>
        <span className="topbar__eyebrow">CONTRACTIQ</span>
        <span className="topbar__divider" aria-hidden="true">/</span>
        <span className="topbar__product">{title}</span>
      </div>
      <div className="topbar__actions">
        <Badge tone={mode === 'account' ? 'info' : 'warning'} className="environment-badge">{mode === 'account' ? 'ACCOUNT · LOCAL SCANNER' : `DEMO · ${workspaceName}`}</Badge>
        <button className="icon-button theme-button" type="button" onClick={cycleTheme} aria-label={`Current theme: ${themeLabels[theme]}. Switch to ${themeLabels[nextTheme]} theme`} title={`Theme: ${themeLabels[theme]} (click to switch)`}>
          <ThemeIcon size={17} strokeWidth={1.8} aria-hidden="true" />
          <span className="theme-button__label">{themeLabels[theme]}</span>
        </button>
        <UserMenu />
      </div>
    </header>
  )
}
