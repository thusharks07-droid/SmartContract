import { useCallback, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { pageTitles } from '../../types/navigation'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useAppReducedMotion } from '../../state/useAppReducedMotion'
import { useWorkspaceMode } from '../../state/useWorkspaceMode'

export function AppShell() {
  const { pathname } = useLocation()
  const title = pageTitles[pathname] ?? (pathname.startsWith('/app/reports/') ? 'Report' : pathname.includes('/findings/') ? 'Finding Details' : pathname.startsWith('/app/scans/') ? 'Scan Details' : 'Not Found')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeMobile = useCallback(() => setMobileOpen(false), [])
  const reduceMotion = useAppReducedMotion()
  const { mode } = useWorkspaceMode()

  return (
    <div className="app-shell">
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((value) => !value)} mobileOpen={mobileOpen} onCloseMobile={closeMobile} />
      <div className="app-shell__main">
        <Topbar title={title} mobileNavOpen={mobileOpen} onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="workspace" id="main-content">
          <div key={pathname} className={`route-content${reduceMotion ? ' route-content--reduced' : ''}`}>
            <Outlet />
          </div>
        </main>
        <footer className="app-footer">ContractIQ <span>·</span> {mode === 'account' ? 'Local static-analysis workspace' : 'Frontend demo · illustrative mock data'}</footer>
      </div>
    </div>
  )
}
