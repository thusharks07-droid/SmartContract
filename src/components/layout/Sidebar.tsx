import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Shield } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { routeItems, utilityItems } from '../../types/navigation'
import { UserMenu } from './UserMenu'
import { useWorkspaceMode } from '../../state/useWorkspaceMode'

type SidebarProps = {
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: SidebarProps) {
  const { mode } = useWorkspaceMode()
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const sidebarRef = useRef<HTMLElement>(null)
  const compact = collapsed && !isMobile

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setIsMobile(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const firstLink = sidebarRef.current?.querySelector<HTMLAnchorElement>('a[href]')
    firstLink?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobile()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileOpen, onCloseMobile])

  const navLink = ({ label, path, icon: Icon, badge, badgeTone }: (typeof routeItems)[number]) => (
    <NavLink
      key={path}
      to={path}
      end={path === '/'}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
      onClick={isMobile ? onCloseMobile : undefined}
    >
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
      {!compact && <span className="nav-link__label">{label}</span>}
      {!compact && badge && <Badge tone={badgeTone === 'info' ? 'info' : 'neutral'}>{badge}</Badge>}
    </NavLink>
  )

  return (
    <>
      {isMobile && mobileOpen && <button className="mobile-scrim" type="button" aria-label="Close navigation menu" onClick={onCloseMobile} />}
      <aside ref={sidebarRef} className={`sidebar${compact ? ' sidebar--collapsed' : ''}${mobileOpen ? ' sidebar--mobile-open' : ''}`} aria-label="Main navigation" aria-hidden={isMobile && !mobileOpen}>
        <div className="sidebar__brand">
          <span className="brand-mark" aria-hidden="true"><Shield size={19} strokeWidth={2.2} /></span>
          {!compact && <span className="brand-name">Contract<span>IQ</span></span>}
        </div>

        <div className="sidebar__section-label">WORKSPACE</div>
        <nav className="sidebar__nav" aria-label="Workspace">
          {routeItems.map(navLink)}
        </nav>

        <div className="sidebar__section-label sidebar__section-label--utility">PREFERENCES</div>
        <nav className="sidebar__nav" aria-label="Preferences">
          {utilityItems.map(navLink)}
        </nav>

        <div className="sidebar__bottom">
          {!compact && <div className="sidebar-note"><span className="sidebar-note__dot" aria-hidden="true" /><span>{mode === 'account' ? 'Account · local scanner' : 'Demo mode · read only'}</span></div>}
          <UserMenu />
          {!isMobile && <button className="sidebar__toggle" type="button" onClick={onToggleCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronRight size={17} /> : <><ChevronLeft size={17} /><span>Collapse</span></>}
          </button>}
        </div>
      </aside>
    </>
  )
}
