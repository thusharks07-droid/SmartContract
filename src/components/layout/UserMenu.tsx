import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, Settings2 } from 'lucide-react'
import { useDemoAuth } from '../../state/useDemoAuth'
import { useSupabaseAuth } from '../../state/useSupabaseAuth'
import { useToast } from '../../state/useToast'
import { useWorkspaceMode } from '../../state/useWorkspaceMode'

export function UserMenu() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const { session, signOut } = useDemoAuth()
  const { session: accountSession, signOut: signOutAccount } = useSupabaseAuth()
  const { mode, accountEmail } = useWorkspaceMode()
  const { notify } = useToast()
  const displayName = mode === 'account' ? accountEmail ?? 'Account User' : session?.displayName ?? 'Demo User'
  const initials = displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  const handleSignOut = async () => {
    if (accountSession) {
      const result = await signOutAccount()
      if (result.error) {
        notify({ title: 'Could not sign out of the account', description: result.error, tone: 'error' })
        return
      }
    }
    setOpen(false)
    signOut()
  }

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="user-menu" ref={rootRef}>
      <button className="user-menu__trigger" type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Open ${displayName} menu`} onClick={() => setOpen((value) => !value)}>
        <span className="user-avatar" aria-hidden="true">{initials}</span>
        <span className="user-menu__name">{displayName}</span>
      </button>
      {open && <div className="user-menu__popover" role="menu" aria-label={displayName}>
        <div className="user-menu__identity"><span className="user-avatar" aria-hidden="true">{initials}</span><span><strong>{displayName}</strong><small>{mode === 'account' ? 'Authenticated account session' : 'Simulated demo session'}</small></span></div>
        <div className="user-menu__divider" />
        <Link role="menuitem" to="/app/settings" onClick={() => setOpen(false)}><Settings2 size={15} aria-hidden="true" />Settings</Link>
        <button role="menuitem" type="button" onClick={() => void handleSignOut()}><LogOut size={15} aria-hidden="true" />Sign out</button>
      </div>}
    </div>
  )
}
