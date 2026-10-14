import { useNavigate } from 'react-router-dom'
import { ArrowRight, LogOut, Shield } from 'lucide-react'
import { useDemoAuth } from '../../state/useDemoAuth'
import { useSupabaseAuth } from '../../state/useSupabaseAuth'

export function SupabaseWorkspaceGate() {
  const navigate = useNavigate()
  const { enterDemo } = useDemoAuth()
  const { session, signOut, error } = useSupabaseAuth()

  const enterIllustrativeDemo = () => {
    enterDemo()
    navigate('/app/dashboard', { replace: true })
  }

  const signOutAccount = async () => {
    const result = await signOut()
    if (!result.error) navigate('/', { replace: true })
  }

  return (
    <main className="public-entry public-entry--not-found">
      <section className="public-info" aria-labelledby="account-workspace-title">
        <p className="eyebrow">SUPABASE ACCOUNT</p>
        <Shield size={24} aria-hidden="true" />
        <h1 id="account-workspace-title">Account sign-in is connected.</h1>
        <p>
          Account-backed scans and findings are not wired into this workspace yet. The existing smartBOB pages use illustrative demo records, so they are not shown as data belonging to this account.
        </p>
        <p role="note">No real contract analysis is available. The scanner remains unconfigured.</p>
        {error && <p role="alert">{error}</p>}
        <p className="account-workspace-email">Signed in as {session?.user.email ?? 'your Supabase account'}.</p>
        <div className="public-info__actions">
          <button className="button button--primary" onClick={enterIllustrativeDemo} type="button">
            Open the separate demo workspace <ArrowRight size={15} aria-hidden="true" />
          </button>
          <button className="button button--secondary" onClick={() => void signOutAccount()} type="button">
            <LogOut size={15} aria-hidden="true" /> Sign out of account
          </button>
        </div>
      </section>
    </main>
  )
}
